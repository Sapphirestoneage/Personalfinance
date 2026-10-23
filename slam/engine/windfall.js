// The Windfall room (S-201): where a lump sum goes, step by step, read from the
// spine and the engines. The order is the WINDFALL_ORDER rule (a house
// assumption, changed in data, not here): tax on the money itself when it is
// still owed, the year's tax bill, cash up to the stage 1 floor, promo
// balances the monthly surplus cannot clear before their deadline, cards
// charging interest now (highest rate first), cash up to the Rule of 5 target,
// this year's Roth IRA room, then what is left. Each step says what it needs,
// what it takes from the windfall, why, and which Ledger fields it read. A
// step whose inputs are missing takes nothing and says what it needs.
//
// windfall(spine, rules, s, { amount, taxed }) ->
//   { amount, taxed, steps: [{ id, label, need, amount, before, short, why, path, items, kind, from, rough, missing, rules }],
//     assigned, left, order, kind, from, rough, missing, rules }
// s is the summary from summary.js. amount is dollars; taxed says whether tax
// on the lump sum is already taken out (or none is owed).

import { valueOf as v, tracker, round2, monthKey } from './spine.js';
import { rateOn } from './debt.js';
import { money } from '../src/ui/format.js';
import { longDate } from './flags.js';
import { maxItRow, openYears } from './maxit.js';

const pct = (x) => Math.round(x * 10000) / 100 + '%';
const cap1 = (x) => x.charAt(0).toUpperCase() + x.slice(1);

// Months of the as-of year up to and including the as-of month (for contributions so far).
const monthsSoFar = (asOf) => +asOf.slice(5, 7);

export const STEP_LABELS = {
  taxOnIt: 'Tax on the windfall itself', taxBill: 'The year\'s tax bill', cashFloor: 'Cash up to the stage 1 floor', promos: 'Promo balances before their deadline',
  employerMatch: 'The employer match left on the table', cards: 'Cards charging interest now', cushion: 'Cash up to the Rule of 5 target', roth: 'Roth IRA room this year', left: 'Not assigned yet'
};

// source: where the money came from ('w2', '1099', 'other'); a 1099 lump sum owes self-employment tax too (answer 24).
// monthly: the same order run on the monthly surplus (E008): flow steps (the match, the Roth room) read as amounts a month.
export function windfall(spine, rules, s, { amount, taxed = true, source = 'other', monthly = false } = {}) {
  const asOf = s.asOf, year = +asOf.slice(0, 4);
  const R = (id) => rules.get(id, year);
  const order = R('WINDFALL_ORDER');
  const all = tracker();
  all.rule(rules, 'WINDFALL_ORDER', year);
  const cash = s.sheet.cash.value;
  const steps = [];
  let remaining = amount, floorAdded = 0;
  const run = (id, build) => {
    const t = tracker();
    const st = { id, label: STEP_LABELS[id], need: null, why: '', path: null, items: [], ...build(t) };
    const need = st.need === null ? null : Math.max(0, round2(st.need));
    const take = need === null ? 0 : Math.min(need, Math.max(0, remaining));
    st.before = round2(remaining);
    st.amount = need === null ? null : round2(take);
    st.need = need;
    st.short = need === null ? null : round2(need - take);
    remaining = round2(remaining - take);
    const snap = t.snapshot();
    Object.assign(st, { from: snap.from, rough: snap.rough, missing: snap.missing, rules: snap.rules, kind: need === null ? 'missing' : snap.missing.length ? 'incomplete' : snap.rough.length ? 'rough' : 'computed' });
    all.absorb({ value: 0, ...snap });
    steps.push(st);
    return st;
  };

  for (const id of order) {
    if (id === 'taxOnIt') run(id, (t) => {
      if (taxed) return { need: 0, why: 'Tax is already taken out of it, or none is owed, so nothing is held back here.' };
      const L = s.tax.lines, P = s.tax.partial;
      const fed = L.marginalFederal && L.marginalFederal.value !== null ? L.marginalFederal : P ? P.marginalFederal : null;
      const st = L.marginalState && L.marginalState.value !== null ? L.marginalState : P ? P.marginalState : null;
      if (!fed) { for (const p of s.tax.balanceDue.missing) t.addMissing(p); return { need: null, why: 'The marginal rate needs ' + (s.tax.missingText || 'the filing details').replace(/^missing: /, '') + '.', path: s.tax.balanceDue.missing[0] || 'household.filingStatus' }; }
      for (const r of [...(fed.rules || []), ...((st && st.rules) || [])]) t.rule(rules, r, year);
      t.absorb({ ...s.tax.marginal, value: undefined });
      // A 1099 lump sum owes self-employment tax on top (answer 24): the year's marginal SE rate, else the statutory rate on the SE base.
      let se = 0, seWords = '';
      if (source === '1099') { const seLine = L.marginalSe && L.marginalSe.value !== null ? L.marginalSe : null; if (seLine) { se = seLine.value; t.absorb({ ...seLine, value: undefined }); } else { se = t.rule(rules, 'SE_FACTOR', year) * (t.rule(rules, 'SE_SS_RATE', year) + t.rule(rules, 'SE_MED_RATE', year)); for (const p of s.tax.balanceDue.missing.length ? s.tax.balanceDue.missing : ['household.filingStatus']) t.addRough(p); } seWords = ' + ' + pct(se) + ' self-employment tax'; }
      const rate = (fed.value || 0) + ((st && st.value) || 0) + se;
      const floor = L.marginalFederal && L.marginalFederal.value !== null ? '' : ' (a floor: the year\'s tax cannot be figured yet)';
      return { need: amount * rate, why: 'Nothing withholds tax from it, so ' + pct(rate) + ' (' + pct(fed.value || 0) + ' federal' + (st && st.value ? ' + ' + pct(st.value) + ' state' : '') + seWords + ', your marginal rate' + floor + ') is held back for the ' + year + ' return.', path: 'household.filingStatus', rate };
    });
    else if (id === 'taxBill') run(id, (t) => {
      const due = s.tax.balanceDue.value;
      t.absorb({ ...s.tax.balanceDue, value: undefined });
      const ty = (spine.taxYears || []).find((x) => x.year === year);
      const held = ty && ty.setAside ? t.useFact('taxYears.' + ty.id + '.setAside', ty.setAside) ?? 0 : 0;
      const path = ty && ty.setAside ? 'taxYears.' + ty.id + '.setAside' : s.tax.balanceDue.from[0] || null;
      if (due === null) return { need: null, why: 'The ' + year + ' balance due cannot be figured yet: it needs ' + (s.tax.missingText || 'more inputs').replace(/^missing: /, '') + '.', path: s.tax.balanceDue.missing[0] || path };
      if (due <= 0) return { need: 0, why: 'The ' + year + ' return shows a refund of ' + money(-due) + ', so nothing is owed.', path };
      const need = Math.max(0, due - held);
      return { need, why: 'Estimated ' + year + ' balance due ' + money(due) + (held ? ', less ' + money(held) + ' already set aside' : '') + (need ? ': ' + money(need) + ' still to cover before ' + longDate((year + 1) + '-' + R('TAX_RETURN_DUE')) + '.' : ': already covered.'), path, due, held };
    });
    else if (id === 'cashFloor') run(id, (t) => {
      const months = t.rule(rules, 'STAGE_RUNWAY_RED_MONTHS', year);
      const burn = s.emergency.monthlyNeed;
      t.absorb({ ...s.emergency.tiers.full.burn, value: undefined }); t.absorb({ ...s.sheet.cash, value: undefined });
      if (burn === null || cash === null) return { need: null, why: 'Needs monthly spending and cash on hand.', path: s.emergency.tiers.full.burn.missing[0] || s.sheet.cash.missing[0] || null };
      const target = Math.ceil(months * burn);
      const need = Math.max(0, target - cash);
      const st = { need, why: money(cash) + ' in cash against ' + money(burn) + ' a month; stage 1 ends at ' + months + ' month' + (months === 1 ? '' : 's') + ' (' + money(target) + ')' + (need ? ', so ' + money(need) + ' goes to cash first.' : '), which cash already covers.'), path: s.sheet.cash.from[0] || null, target };
      return st;
    });
    else if (id === 'promos') run(id, (t) => {
      const pr = s.debt.promo;
      t.absorb({ ...pr.total, value: undefined }); t.absorb({ ...pr.monthly, value: undefined });
      if (!pr.items.length) return { need: 0, why: 'No balance is on a 0% intro rate.' };
      const surplus = s.cashflow.surplus.value;
      t.absorb({ ...s.cashflow.surplus, value: undefined });
      const sure = Math.max(0, surplus ?? 0);
      let reduce = Math.max(0, pr.monthly.value - sure);
      if (reduce <= 0.005) return { need: 0, why: 'Clearing them takes ' + money(pr.monthly.value, true) + ' a month and the monthly surplus is ' + money(surplus) + ', so the surplus clears them in time on its own.', path: 'debts.' + pr.items[0].id + '.balance' };
      // Deferred-interest promos first (the costliest to miss), then the earliest deadline.
      const items = [...pr.items].sort((a, b) => (b.deferredInterest === true) - (a.deferredInterest === true) || (a.promoEnds < b.promoEnds ? -1 : a.promoEnds > b.promoEnds ? 1 : 0));
      const out = [];
      for (const x of items) {
        if (reduce <= 0.005) break;
        const n = Math.max(1, x.paymentsLeft);
        const pay = round2(Math.min(x.balance, reduce * n));
        out.push({ id: x.id, name: x.name, pay, balance: x.balance, paymentsLeft: x.paymentsLeft, promoEnds: x.promoEnds, deferredInterest: x.deferredInterest, path: 'debts.' + x.id + '.balance' });
        reduce = Math.max(0, reduce - pay / n);
      }
      const need = out.reduce((a, x) => a + x.pay, 0);
      const after = round2(pr.monthly.value - out.reduce((a, x) => a + x.pay / Math.max(1, x.paymentsLeft), 0));
      return { need, items: out, why: 'Clearing them takes ' + money(pr.monthly.value, true) + ' a month and the monthly surplus is ' + (surplus === null ? 'not known yet' : money(surplus)) + '. Paying ' + out.map((x) => money(x.pay) + ' off ' + x.name + (x.deferredInterest === true ? ' (deferred interest)' : '')).join(' and ') + ' now brings that to ' + money(Math.max(0, after), true) + ' a month, which the surplus covers.', path: out[0].path };
    });
    else if (id === 'employerMatch') run(id, (t) => {
      const accts = (spine.accounts || []).filter((a) => a.family === 'employerRetirement' && a.matchRate && a.matchRate.kind !== 'notForMe');
      if (!accts.length) return { need: 0, why: 'No workplace account has an employer match entered, so this step is skipped.' };
      const w2 = s.cashflow.income.streams.filter((x) => x.type === 'w2' && x.included !== false);
      t.absorb({ ...s.cashflow.income.gross, value: undefined });
      if (!w2.length || w2.some((x) => x.gross === null)) { for (const x of w2) if (x.gross === null) t.addMissing('income.' + x.id + '.amount'); return { need: null, why: 'Needs the W-2 gross pay the match is figured on' + (w2.length ? '.' : ': no W-2 pay is coming in this month.'), path: w2.length ? 'income.' + w2[0].id + '.amount' : null }; }
      const grossYear = w2.reduce((a, x) => a + x.gross, 0) * 12;
      const monthsLeft = 12 - monthsSoFar(asOf) + 1;
      let gap = 0, left = 0, miss = null; const parts = [];
      for (const a of accts) {
        const base = 'accounts.' + a.id;
        const rateM = t.useFact(base + '.matchRate', a.matchRate), cap = t.useFact(base + '.matchCap', a.matchCap), c = t.useFact(base + '.monthlyContribution', a.monthlyContribution);
        if (rateM === null || cap === null || c === null) { miss = miss || base + (cap === null ? '.matchCap' : c === null ? '.monthlyContribution' : '.matchRate'); continue; }
        const short = Math.max(0, cap * grossYear / 12 - c);
        gap += short; left += short * rateM;
        parts.push((v(a.name) || a.id) + ': ' + money(c) + ' a month in against ' + money(cap * grossYear / 12) + ' to capture the full match' + (short > 0 ? ' (' + money(short) + ' a month short, ' + money(short * rateM) + ' of match lost)' : ''));
      }
      if (miss) return { need: null, why: 'Needs the match rate, the cap and the monthly contribution on the account.', path: miss };
      const need = monthly ? gap : gap * monthsLeft;
      return { need, why: (gap > 0 ? money(need) + (monthly ? ' a month' : ' for the rest of the year') + ' raised in pre-tax deferral captures ' + money(left * (monthly ? 1 : monthsLeft)) + ' of match that is otherwise lost. ' : 'The full match is captured. ') + parts.join('; ') + '.', path: 'accounts.' + accts[0].id + '.monthlyContribution', items: parts.map((x) => ({ label: x })) };
    });
    else if (id === 'cards') run(id, (t) => {
      const list = s.debt.avalancheCardsDetail.filter((x) => !x.promo && x.rate !== null && x.rate > 0);
      const out = [];
      for (const x of list) { const d = spine.debts.find((y) => y.id === x.id); const b = t.useFact('debts.' + x.id + '.balance', d.balance); t.useFact(rateOn(d, asOf).path, d.apr); if (b) out.push({ id: x.id, name: x.name, pay: b, rate: x.rate, path: 'debts.' + x.id + '.balance' }); }
      if (!out.length) return { need: 0, why: 'No card is charging interest right now.' };
      return { need: out.reduce((a, x) => a + x.pay, 0), items: out, why: 'Highest rate first (avalanche): ' + out.map((x) => x.name + ' at ' + pct(x.rate) + ', ' + money(x.pay)).join('; ') + '. Interest at these rates costs more than any account earns.', path: out[0].path };
    });
    else if (id === 'cushion') run(id, (t) => {
      const target = s.emergency.targetDollars.value;
      t.absorb({ ...s.emergency.targetDollars, value: undefined }); t.absorb({ ...s.sheet.cash, value: undefined });
      if (target === null || cash === null) return { need: null, why: 'The Rule of 5 target needs a birth date and monthly spending.', path: s.emergency.targetDollars.missing[0] || null };
      const have = cash + floorAdded;
      const need = Math.max(0, target - have);
      return { need, why: 'The Rule of 5 target is ' + money(target) + ' (' + s.emergency.targetMonths.value.toFixed(1) + ' months); cash is ' + money(cash) + (floorAdded ? ' plus ' + money(floorAdded) + ' from the floor step' : '') + (need ? ', so ' + money(need) + ' to go.' : ', which already reaches it.'), path: s.sheet.cash.from[0] || null, target };
    });
    else if (id === 'roth') run(id, (t) => {
      const roth = (spine.accounts || []).find((a) => a.type === 'roth_ira');
      if (!roth) return { need: 0, why: 'There is no Roth IRA in the Ledger. Add one under Assets, IRA, to see this year\'s room.' };
      // The room is the max-it engine's (S-211): the limit and the catch-up for the age on December 31, what is in
      // for the year across every IRA, the income phase-out, and the cap at the owner's earned income (answer 25),
      // so the Windfall room, the FOO ladder and the account's panel read one number. From January 1 to the IRA
      // deadline last year's room is open too, and it closes first, so it comes first.
      const rows = openYears(rules, roth.type, asOf).map((ty) => maxItRow(spine, rules, roth, ty, { asOf }));
      for (const r of rows) t.absorb({ ...r, value: undefined });
      const gap = rows.find((r) => r.room === null);
      const r = rows[rows.length - 1];
      if (gap) return { need: null, why: cap1(gap.missingLabel) + '. ' + gap.why, path: (gap.ei && gap.ei.missing[0]) || null, earned: gap.ei || null, row: gap, rows };
      const need = round2(rows.reduce((x, y) => x + ((monthly ? y.perMonth : y.room) || 0), 0));
      const each = rows.map((y) => (rows.length > 1 ? y.year + ': ' : '') + y.why + (monthly ? ' That is ' + money(y.perMonth, true) + ' a month for ' + y.months.count + ' month' + (y.months.count === 1 ? '' : 's') + ', to ' + longDate(y.deadline.date) + '.' : ' A contribution for ' + y.year + ' can be made until ' + longDate(y.deadline.date) + '.'));
      return { need, why: each.join(' '), path: 'accounts.' + roth.id + '.contributions', limit: r.limit.value, soFar: r.contributed.value, earned: r.ei, row: r, rows };
    });
    else if (id === 'left') run(id, () => ({ need: Math.max(0, remaining), why: remaining > 0.005 ? money(remaining) + ' has no job yet. It stays as cash until it is given one: invest it, start a sinking fund, or add it to a goal.' : 'Every dollar is assigned.', path: null }));
    const last = steps[steps.length - 1];
    if (last && last.id === 'cashFloor') floorAdded = last.amount || 0;
  }
  const assigned = round2(steps.filter((x) => x.id !== 'left').reduce((a, x) => a + (x.amount || 0), 0));
  const snap = all.snapshot();
  const leftStep = steps.find((x) => x.id === 'left');
  return { amount, taxed, source, monthly, asOf, steps, assigned, left: round2(leftStep ? leftStep.amount : Math.max(0, remaining)), order, ...snap, kind: snap.missing.length ? 'incomplete' : snap.rough.length ? 'rough' : 'computed' };
}

export { monthKey };
