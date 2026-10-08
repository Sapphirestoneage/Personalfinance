/* Debt and credit: cards, student loans, auto, mortgage, personal, score.
   Publishes totals, the weighted APR, next-year interest, utilization,
   promo cliffs, payoff orders, the debt-free date, freed cash and the wallet. */
import { q, U, needs, sum } from '../units.js';
import { fieldQ, monthlyCents, num, val } from './common.js';
import { simulate, monthsBetween } from '../debtsim.js';
import { confidenceOf, hasValue } from '../states.js';

const EARN_CATS = ['dining', 'groceries', 'travel', 'gas', 'streaming', 'other'];

export function run(ctx) {
  const { rows, reader, data, asm, today } = ctx;
  const thisMonth = today.slice(0, 7);
  const debts = [];
  const byType = {};
  rows.forEach(r => {
    if (r.type === 'summary' || r.type === 'score') return;
    const balQ = fieldQ(r, 'balance', U.oneoff, asm);
    const balance = balQ ? balQ.cents : null;
    if (balance === null) return;
    const rate = r.type === 'card' ? num(r, 'apr') : num(r, 'rate');
    const minimum = r.type === 'card' || r.type === 'student' ? monthlyCents(r, 'minimum') : (r.type === 'mortgage' ? monthlyCents(r, 'principalInterest') : monthlyCents(r, 'payment'));
    debts.push({
      id: r.id, name: r.nickname || r.type, type: r.type, balance, balanceQ: balQ, rate: rate === null ? 0 : rate, rateKnown: rate !== null,
      promoApr: r.type === 'card' ? num(r, 'promoApr') : null, promoEnd: r.type === 'card' ? val(r, 'promoEnd') : null,
      minimum: minimum === null ? 0 : minimum, minimumKnown: minimum !== null,
      full: r.type === 'card' && ['full', 'statement'].includes(val(r, 'autopay')), /* MR-071: statement and full autopay both clear the balance before interest; the calendar keeps them apart */
      autopay: r.type === 'card' ? val(r, 'autopay') || 'none' : null,
      limit: r.type === 'card' ? num(r, 'creditLimit') : null, stress: r.stress, lib: r.lib,
      fee: r.type === 'card' ? (num(r, 'annualFee') || 0) : 0, credits: r.type === 'card' ? val(r, 'creditsUsed') : null,
      escrow: r.type === 'mortgage' ? ['escrowTaxes', 'escrowInsurance', 'hoa', 'pmi'].reduce((s, k) => s + (monthlyCents(r, k) || 0), 0) : 0,
    });
    byType[r.type] = (byType[r.type] || 0) + balance;
  });
  const summaryRow = rows.find(r => r.type === 'summary');
  const summaryQ = summaryRow ? fieldQ(summaryRow, 'debtSummaryTotal', U.oneoff, asm) : null;
  /* Empty is not zero: with no debt rows at all (not even a None total) the planet says what it needs. */
  const nothingTyped = !debts.length && !summaryQ;
  const totalDebt = debts.length ? sum(debts.map(d => d.balanceQ), U.oneoff) : (summaryQ || needs(['debts, or a rough total (0 if none)']));
  const serviceCents = debts.reduce((s, d) => s + d.minimum, 0);
  const service = nothingTyped ? needs(['debts, or a rough total (0 if none)']) : q(serviceCents, U.monthlyAfter, { confidence: debts.length ? Math.min(...debts.map(d => d.minimumKnown ? 1 : 0.3)) : 1 });
  const total = debts.reduce((s, d) => s + d.balance, 0);
  const effRate = d => (d.promoApr !== null && d.promoApr !== undefined && d.promoEnd && thisMonth < d.promoEnd) ? d.promoApr : d.rate;
  const weightedApr = total ? debts.reduce((s, d) => s + d.balance * effRate(d), 0) / total : 0;
  let interest = 0;
  const interestParts = [];
  debts.forEach(d => {
    if (d.full) { interestParts.push({ rowId: d.id, name: d.name, cents: 0, note: 'paid in full each month' }); return; }
    let pm = (d.promoApr !== null && d.promoApr !== undefined && d.promoEnd) ? monthsBetween(thisMonth, d.promoEnd) : 0;
    pm = Math.max(0, Math.min(12, pm));
    const i = Math.round(d.balance * (pm ? d.promoApr : 0) * pm / 12 + d.balance * d.rate * (12 - pm) / 12);
    interest += i;
    interestParts.push({ rowId: d.id, name: d.name, cents: i, promoMonths: pm, rate: d.rate, promoApr: pm ? d.promoApr : null });
  });
  const cards = debts.filter(d => d.type === 'card' && d.limit);
  const utilTotal = cards.length ? cards.reduce((s, d) => s + d.balance, 0) / cards.reduce((s, d) => s + d.limit, 0) : null;
  const perCard = {}; cards.forEach(d => { perCard[d.id] = d.balance / d.limit; });
  const cliffs = debts.filter(d => d.promoApr !== null && d.promoApr !== undefined && d.promoEnd && d.promoEnd > thisMonth).map(d => ({
    rowId: d.id, name: d.name, promoEnd: d.promoEnd, monthsLeft: monthsBetween(thisMonth, d.promoEnd), balance: d.balance, promoApr: d.promoApr, standardApr: d.rate, costAfterAnnual: Math.round(d.balance * d.rate),
  }));
  const orders = {
    avalanche: debts.slice().sort((a, b) => b.rate - a.rate).map(d => d.id),
    snowball: debts.slice().sort((a, b) => a.balance - b.balance).map(d => d.id),
    stress: debts.slice().sort((a, b) => (b.stress || 0) - (a.stress || 0)).map(d => d.id),
  };
  const sims = {};
  Object.keys(orders).forEach(k => { sims[k] = debts.length ? simulate(debts, orders[k], thisMonth, 600, k === 'avalanche') : null; });
  const aval = sims.avalanche;

  /* Wallet: rewards on actual spending, credits used, fee, net, and rewards left. */
  const cardSpend = reader.slot('spending.cardSpendByCategory') || {};
  const library = data.cards ? data.cards.cards : [];
  const best = {};
  library.forEach(c => EARN_CATS.forEach(cat => { const v = Math.min(c.earn[cat], asm.portalOnlyEarnCap) * c.pointValueCents / 100; best[cat] = Math.max(best[cat] || 0, v); }));
  let rewardsLeft = 0;
  const wallet = cards.concat(debts.filter(d => d.type === 'card' && !d.limit)).map(d => {
    const card = d.lib ? library.find(c => c.id === d.lib) : null;
    const spend = cardSpend[d.name] || {};
    let rewards = 0; const parts = [];
    EARN_CATS.forEach(cat => {
      const amt = spend[cat] || 0; if (!amt) return;
      const rate = card ? card.earn[cat] : 0;
      const rw = card ? Math.round(amt * 12 * rate * card.pointValueCents / 100) : 0;
      rewards += rw; parts.push({ category: cat, monthlyCents: amt, rate, cents: rw });
      const actual = card ? rate * card.pointValueCents / 100 : 0;
      rewardsLeft += Math.round(amt * 12 * Math.max(0, (best[cat] || 0) - actual));
    });
    let creditsUsed = 0, creditsTotal = 0;
    if (card) card.credits.forEach(c => { creditsTotal += c.annualValueCents; const u = d.credits && typeof d.credits === 'object' ? d.credits[c.name] : 'no'; creditsUsed += u === 'yes' ? c.annualValueCents : u === 'partly' ? Math.round(c.annualValueCents / 2) : 0; });
    const spendAnnual = EARN_CATS.reduce((s, cat) => s + (spend[cat] || 0), 0) * 12;
    const baseline = Math.round(spendAnnual * asm.noFeeBaselineRate);
    return { rowId: d.id, name: d.name, cardId: card ? card.id : null, rewardsAnnual: rewards, parts, creditsUsedAnnual: creditsUsed, creditsTotalAnnual: creditsTotal, unusedCreditsAnnual: creditsTotal - creditsUsed, feeAnnual: d.fee, netAnnual: creditsUsed + rewards - d.fee, baselineAnnual: baseline, spendAnnual, earn: card ? card.earn : null };
  });

  const scoreRow = rows.find(r => r.type === 'score');
  const creditScore = scoreRow && hasValue(scoreRow.f.score) ? { score: scoreRow.f.score.v, bureau: val(scoreRow, 'bureau'), asOf: scoreRow.asOf, confidence: confidenceOf(scoreRow.f.score) } : null;
  return {
    outputs: {
      totalDebt, debtServiceMonthly: service,
      weightedApr: debts.length ? weightedApr : null,
      annualInterest: nothingTyped ? needs(['debt rows']) : q(interest, U.annualAfter, { confidence: debts.length ? Math.min(...debts.map(d => d.rateKnown ? d.balanceQ.confidence : 0.3)) : 1 }),
      utilization: { total: utilTotal, perCard },
      promoCliffs: cliffs,
      payoffOrders: { orders, interest: { avalanche: aval ? aval.interest : null, snowball: sims.snowball ? sims.snowball.interest : null, stress: sims.stress ? sims.stress.interest : null }, debtFree: { avalanche: aval ? aval.debtFree : null, snowball: sims.snowball ? sims.snowball.debtFree : null, stress: sims.stress ? sims.stress.debtFree : null }, stalled: { avalanche: aval ? aval.stalled : false, snowball: sims.snowball ? sims.snowball.stalled : false, stress: sims.stress ? sims.stress.stalled : false }, stalledOn: aval && aval.stalled ? debts.filter(d => !aval.paid[d.id]).map(d => d.name) : [] },
      debtFreeDate: aval ? aval.debtFree : null,
      freedCashByMonth: aval ? aval.milestones.map(m => ({ month: m.month, cents: m.freedCents, rowId: m.rowId })) : [],
      wallet: { cards: wallet, rewardsLeftAnnual: rewardsLeft, bestRates: best },
      creditScore,
      byType,
    },
    enriched: [],
    debts, interestParts, payoffSeries: aval ? aval.series : [],
  };
}
