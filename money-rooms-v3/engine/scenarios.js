/* Scenario sandbox: what-if blocks sit on top of real facts, read reality
   live and never write to it. Each block becomes a one-off cost in its start
   year and a monthly change for its duration, applied to a copy of the
   projection inputs. Replays the whole life for the baseline, each block
   alone, and all together. Promote is the only bridge into the Ledger. */
import { project } from './projection.js';
import * as F from './format.js';

/* Evaluate a block's cost formula from its answers and the household's live figures. */
export function evalFormula(expr, answers, live) {
  if (typeof expr === 'number') return expr;
  const scope = Object.assign({}, live, answers);
  let missing = false;
  const safe = expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, name => {
    if (!(name in scope)) return '0';
    if (scope[name] === null || scope[name] === undefined) { missing = true; return '0'; }
    return '(' + Number(scope[name]) + ')';
  });
  if (missing) return null;
  if (!/^[\d\s()+\-*/.]+$/.test(safe)) throw new Error('bad formula ' + expr);
  return Math.round(Function('"use strict"; return (' + safe + ');')());
}

export function blockCosts(def, block, live) {
  const answers = {};
  def.questions.forEach(qd => {
    const a = block.answers ? block.answers[qd.id] : undefined;
    const usable = qd.kind === 'text' ? typeof a === 'string' : typeof a === 'number' && Number.isFinite(a);
    answers[qd.id] = usable ? a : qd.default;
  });
  const oneOff = evalFormula(def.oneOff, answers, live);
  const monthly = evalFormula(def.monthly, answers, live);
  const duration = typeof def.duration === 'number' ? def.duration : (answers[def.duration] || 0);
  if (oneOff === null || monthly === null) {
    const LIVE_WORDS = { takeHomeMonthly: 'take-home pay', spendingMonthly: 'monthly spending', grossMonthly: 'gross pay', sharedGapMonthly: 'a shared bill with a roommate' };
    const names = Object.keys(LIVE_WORDS).filter(k => (live[k] === null || live[k] === undefined) && (String(def.oneOff) + ' ' + String(def.monthly)).indexOf(k) !== -1).map(k => LIVE_WORDS[k]);
    return { oneOff: null, monthly: null, duration, answers, needs: names.length ? names : ['take-home pay'] };
  }
  return { oneOff, monthly, duration, answers };
}

/* Build year-indexed adjustments: { [year]: { oneOff, monthly, pay } }. `monthly` is a
   spending change; `pay` is an income change (a pay cut is positive), kept apart because
   pay stops with work (MR-057): it never runs on into retirement and never raises the FI target. */
export function adjustments(blocks, defs, live) {
  const by = {};
  const at = y => (by[y] = by[y] || { oneOff: 0, monthly: 0, pay: 0 });
  blocks.forEach(b => {
    const def = defs.types[b.type]; if (!def) return;
    const c = blockCosts(def, b, live);
    if (c.needs) return; /* a block that cannot be costed changes nothing */
    const y0 = b.startYear;
    at(y0).oneOff += c.oneOff;
    /* a start month pro-rates the first and last year (MR-026): a change from October touches 3 of 12 months */
    const m0 = b.startMonth && b.startMonth >= 1 && b.startMonth <= 12 ? b.startMonth : 1;
    let left = Math.max(0, c.duration) * 12;
    const key = def.income ? 'pay' : 'monthly';
    for (let y = y0; left > 0; y++) {
      const months = Math.min(left, y === y0 ? 13 - m0 : 12);
      at(y)[key] += Math.round(c.monthly * months / 12);
      left -= months;
    }
  });
  return by;
}

/* Run the projection with adjustments folded in year by year. */
export function projectWith(inp, rate, adj) {
  const years = inp.asm.projectionEndAge - inp.age;
  const base = project(inp, rate);
  /* re-run with a per-year hook: fold the adjustments into contributions and spending */
  let inv = inp.invested, csh = inp.cash, year = inp.year, a = inp.age, fiAge = null;
  const path = [];
  const debtByYear = {}; base.path.forEach(p => { debtByYear[p.year] = p.debt; });
  for (let y = 1; y <= years; y++) {
    year++; a++;
    const ad = adj[year] || { oneOff: 0, monthly: 0, pay: 0 };
    const working = a <= inp.retirementAge && (fiAge === null || a <= fiAge);
    const debtNow = debtByYear[year] || 0;
    const extraAnnual = -(ad.monthly + (ad.pay || 0)) * 12; /* a positive monthly cost, or a pay cut, reduces what is saved */
    if (working) {
      inv = Math.round(inv * (1 + rate)) + inp.employeeAnnual + inp.employerAnnual;
      const freed = debtNow === 0 && inp.debts.length ? inp.debtServiceAnnual : 0;
      csh = Math.round(csh * (1 + inp.asm.cashRealReturn)) + Math.max(0, inp.leakAnnual) + freed + extraAnnual - ad.oneOff;
      if (csh < 0) { inv += csh; csh = 0; }
    } else {
      const mult = a < inp.asm.slowgoAge ? inp.mult.gogo : a < inp.asm.nogoAge ? inp.mult.slowgo : inp.mult.nogo;
      const need = Math.round(inp.annualSpend * mult) + ad.monthly * 12 + ad.oneOff - (a >= inp.asm.socialSecurityAge ? inp.ssMonthly * 12 : 0);
      inv = Math.round(inv * (1 + rate)) - Math.max(0, need);
      csh = Math.round(csh * (1 + inp.asm.cashRealReturn));
    }
    const nw = inv + csh - debtNow;
    if (fiAge === null && nw * inp.asm.withdrawalRate >= inp.annualSpend + (ad.monthly > 0 ? ad.monthly * 12 : 0)) fiAge = a;
    path.push({ year, age: a, invested: inv, cash: csh, debt: debtNow, netWorth: nw, working });
  }
  return { fiAge, fiYear: fiAge !== null ? year - (a - fiAge) : null, path, rate };
}

/* The comparison: baseline, each block alone, all together. `notes` are the plain
   sentences the Simulate table shows under itself (MR-057); the view only prints them. */
export function compare(inp, allBlocks, defs, live) {
  const blocks = allBlocks.filter(b => defs.types[b.type]);
  const rate = inp.asm.returnLikely;
  const baseline = projectWith(inp, rate, {});
  const alone = blocks.map(b => ({ block: b, result: projectWith(inp, rate, adjustments([b], defs, live)), costs: blockCosts(defs.types[b.type], b, live) }));
  const together = projectWith(inp, rate, adjustments(blocks, defs, live));
  const at95 = r => r.path.length ? r.path[r.path.length - 1].netWorth : null;
  const aloneOut = alone.map(x => ({ id: x.block.id, name: x.block.name, type: x.block.type, startYear: x.block.startYear, startMonth: x.block.startMonth || null, costs: x.costs, fiAge: x.result.fiAge, at95: at95(x.result), fiDelta: x.result.fiAge !== null && baseline.fiAge !== null ? x.result.fiAge - baseline.fiAge : null, at95Delta: at95(x.result) - at95(baseline), path: x.result.path }));
  const togetherOut = { fiAge: together.fiAge, at95: at95(together), fiDelta: together.fiAge !== null && baseline.fiAge !== null ? together.fiAge - baseline.fiAge : null, at95Delta: at95(together) - at95(baseline), path: together.path };
  return { asm: { returnLikely: rate }, baseline: { fiAge: baseline.fiAge, at95: at95(baseline), path: baseline.path }, alone: aloneOut, together: togetherOut, notes: compareNotes(inp, baseline, aloneOut, togetherOut, adjustments(blocks, defs, live)) };
}

/* Why the table reads the way it does, in plain words. Each sentence fires only when its pattern holds. */
export function compareNotes(inp, baseline, alone, together, adj) {
  const notes = [];
  const costed = alone.filter(a => !a.costs.needs);
  if (costed.some(a => a.fiDelta > 0 && a.at95Delta > 0)) notes.push('A later FI age means more working years of contributions, and those extra years compound to 95. That is why a block that costs money can still raise net worth at 95. The sandbox does not count a home as an asset; it counts what the purchase takes out of savings.');
  const worstAlone = costed.reduce((m, a) => (a.fiDelta === null ? m : Math.max(m, a.fiDelta)), 0);
  const sumAlone = costed.reduce((s, a) => s + (a.fiDelta || 0), 0);
  if (costed.length > 1 && together.fiDelta !== null && together.fiDelta > sumAlone) {
    /* the surplus turns negative in some overlapping year: savings are drawn down, not just slowed */
    const leak = Math.max(0, inp.leakAnnual || 0);
    const drawn = Object.keys(adj).some(y => (adj[y].monthly + (adj[y].pay || 0)) * 12 > leak);
    notes.push('Together is worse than the blocks added up' + (drawn ? ': in the years they overlap, the ongoing costs are bigger than what gets saved each year, so savings are drawn down instead of growing, and the lost compounding never comes back.' : ': the blocks overlap, so their costs land on the same years of saving.') + (together.fiAge !== null && together.fiAge > inp.retirementAge ? ' FI lands after the retirement age of ' + inp.retirementAge + ', so the path spends from savings before they can carry the household.' : ''));
  } else if (costed.length > 1 && together.fiDelta !== null && together.fiDelta < worstAlone) notes.push('Together comes out better than the hardest block alone because one block pays for part of another.');
  return notes;
}

export function newBlock(type, defs, startYear, startMonth) {
  const def = defs.types[type];
  const answers = {}; def.questions.forEach(q => { answers[q.id] = q.default; });
  return { id: 'sc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, name: def.label, startYear, startMonth: startMonth || null, answers, promoted: false, createdAt: new Date().toISOString() };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* "Mar 2027" when a month is set, else the year. */
export function startLabel(b) {
  return b.startMonth ? MONTHS[b.startMonth - 1] + ' ' + b.startYear : String(b.startYear);
}
/* Accepts "2027", "2027-03", "3/2027", "Mar 2027" or "March 2027"; null when it is none of those. */
export function parseStart(text) {
  const t = String(text || '').trim();
  let m = /^(\d{4})$/.exec(t); if (m) return { startYear: +m[1], startMonth: null };
  m = /^(\d{4})-(\d{1,2})$/.exec(t); if (m && +m[2] >= 1 && +m[2] <= 12) return { startYear: +m[1], startMonth: +m[2] };
  m = /^(\d{1,2})\/(\d{4})$/.exec(t); if (m && +m[1] >= 1 && +m[1] <= 12) return { startYear: +m[2], startMonth: +m[1] };
  m = /^([A-Za-z]{3,})\.?,?\s+(\d{4})$/.exec(t);
  if (m) { const i = MONTHS.findIndex(x => x.toLowerCase() === m[1].slice(0, 3).toLowerCase()); if (i !== -1) return { startYear: +m[2], startMonth: i + 1 }; }
  return null;
}
/* One sentence for a block's cost, shared by Simulate and the Starting soon panels. */
export function costSentence(c) {
  if (c.needs) return 'Needs ' + c.needs.join(' and ') + ' to cost this block.';
  const one = c.oneOff < 0 ? F.dollarsWhole(-c.oneOff) + ' in' : F.dollarsWhole(c.oneOff);
  if (!c.monthly) return c.oneOff ? 'One-off ' + one + ', nothing ongoing.' : 'Nothing one-off, nothing ongoing.';
  const ongoing = F.dollarsWhole(Math.abs(c.monthly)) + ' a month ' + (c.monthly > 0 ? 'more' : 'in') + ' for ' + c.duration + (c.duration === 1 ? ' year' : ' years');
  return c.oneOff ? 'One-off ' + one + ', then ' + ongoing + '.' : ongoing.charAt(0).toUpperCase() + ongoing.slice(1) + '.';
}

/* The roommate block's own outputs (Level 8, MR-047): what the shared bills become, the jump, the cushion at the new cost, the bridge, and the permanent case. Never writes to the record. */
export function roommateOutcome(result, block, def) {
  const S = result.sun && result.sun.outputs; if (!S) return null;
  const full = S.spending.sharedFullMonthly, share = S.spending.sharedShareMonthly;
  if (!full || full.status !== 'ok' || !share || share.status !== 'ok') return { needs: ['a spending line marked shared'] };
  const live = { takeHomeMonthly: S.income.takeHomeMonthly && S.income.takeHomeMonthly.cents, spendingMonthly: S.safety.spendingWithPremiums && S.safety.spendingWithPremiums.cents, grossMonthly: S.income.grossMonthly && S.income.grossMonthly.cents, sharedGapMonthly: full.cents - share.cents };
  const c = blockCosts(def, block, live);
  const jump = full.cents - share.cents; const months = c.answers.monthsToReplace; const oneTime = c.answers.oneTime || 0;
  const cash = S.invest.cashBalances && S.invest.cashBalances.status === 'ok' ? S.invest.cashBalances.cents : null;
  const spend = live.spendingMonthly || null; const take = live.takeHomeMonthly || null;
  const permanent = c.answers.keepAlone === 1;
  const wr = result.asm.withdrawalRate;
  const lease = (result.household || {}).lease || 'none';
  const leaseNote = lease === 'mine' ? 'Lease in your name only: this is fully on you.' : lease === 'both' ? 'Lease in both names: shared responsibility.' : lease === 'theirs' ? 'Lease in their name: they decide what happens to the place.' : 'No lease: they can leave any time.';
  const out = { newSharedMonthly: full.cents, jumpMonthly: jump, months, bridge: jump * months + oneTime, oneTime, cushionMonthsNow: cash !== null && spend ? Math.round(cash / spend * 10) / 10 : null, cushionMonthsAtNewCost: cash !== null && spend ? Math.round(cash / (spend + jump) * 10) / 10 : null, permanent, leaseNote, lease };
  if (permanent && spend && take) { out.newSavingsRate = Math.round((take - (spend + jump)) / take * 1000) / 1000; out.oldSavingsRate = Math.round((take - spend) / take * 1000) / 1000; out.newFiNumber = Math.round((spend + jump) * 12 / wr); out.oldFiNumber = Math.round(spend * 12 / wr); }
  return out;
}
