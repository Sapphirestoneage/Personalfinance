/* The discovery call (Level 8, MR-045): one table of whatever the client
   gives, applied to the record as "What you said" (source discovery), the
   earliest gut anchors, the household and the tier; every gap filled with a
   Guess for the cost area. Also the discovery summary and the Session 1
   agenda. The engine does the deriving; the view only renders. */
import { setField, setColumn, addRow, removeRow, createRow, setHousehold, setColTier } from './record.js';
import { freshFacts } from './fields.js';
import { parseSaid, toMonthly, shareMath, crossCheck, parseBirth } from './parse.js';
import { setAnchor, AREAS } from './anchors.js';
import { tierFor, colTierOf, tierLabel } from './col.js';
import { buildGuesses, guessRows, isGuessRow } from './guesses.js';
import { federalTax, taxableIncome, fica } from './tax.js';
import { hasValue, numberOf } from './states.js';
import { roommateOutcome } from './scenarios.js';
import * as F from './format.js';

const DISC = 'discovery';
const BANK_TYPE = t => (['checking', 'savings', 'hysa', 'cd'].includes(t) ? t : 'checking'); /* MR-071: a cash account named on the call lands on a bank row */
const ACCOUNT_TYPE = name => { const n = String(name || '').toLowerCase(); if (/venmo|cash app|paypal|checking|chase|bank|credit union|debit/.test(n)) return 'checking'; if (/hysa|savings|ally|marcus|save/.test(n)) return 'hysa'; if (/401|403|tsp|457/.test(n)) return '401k'; if (/roth/.test(n)) return 'rothIra'; if (/ira/.test(n)) return 'tradIra'; if (/brokerage|robinhood|fidelity|vanguard|schwab|etf|stock/.test(n)) return 'taxable'; if (/hsa/.test(n)) return 'hsa'; return 'taxable'; };
const DEBT_TYPE = name => { const n = String(name || '').toLowerCase(); if (/student|loan.*school|sallie|navient|mohela/.test(n)) return 'student'; if (/car|auto/.test(n)) return 'auto'; if (/mortgage|heloc/.test(n)) return 'mortgage'; if (/card|visa|amex|mastercard|discover|credit/.test(n)) return 'card'; return 'personal'; };

function stateOf(parsed, markedKnown) { if (!parsed) return 'unknown'; if (parsed.unknown) return 'unknown'; if (parsed.none) return 'none'; return markedKnown ? 'known' : (parsed.state === 'rough' ? 'rough' : 'rough'); }

/* applyDiscovery(record, form, data, meta) -> { checks, anchors, guesses } */
export function applyDiscovery(record, form, data, meta) {
  const m = Object.assign({ session: 'discovery' }, meta || {}); const now = m.now; const today = m.today || (now ? now.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const fields = data.fields; const tiers = data.colTiers;
  const set = (rowId, fid, v, state, cad, src) => setField(record, rowId, fid, v, state, src || DISC, { session: m.session, now, cad, why: null });
  const snap = form.snapshot || {};
  const out = { checks: {}, anchors: [], notes: [] };
  /* ---- Sun */
  if (snap.name) set('sun', 'name', snap.name, 'known');
  if (snap.birth) { const b = parseBirth(snap.birth, today); if (b) set('sun', 'birthDate', b.iso, b.state); }
  if (snap.city) set('sun', 'city', snap.city, 'known');
  let state = snap.state || null;
  if (!state && snap.city) { const t = tierFor(snap.city, null, tiers); if (t.metro) state = t.state; }
  if (state) set('sun', 'state', state, snap.state ? 'known' : 'known', undefined, snap.state ? DISC : 'inferred');
  if (snap.workSituation) set('sun', 'workSituation', snap.workSituation, 'known');
  if (snap.filingStatus) set('sun', 'filingStatus', snap.filingStatus, 'known'); else if (!hasValue(record.sun.f.filingStatus)) set('sun', 'filingStatus', 'single', 'rough', undefined, 'inferred');
  if (snap.dependents !== undefined && snap.dependents !== null && snap.dependents !== '') set('sun', 'dependents', parseInt(snap.dependents, 10) || 0, 'known');
  /* ---- household */
  const n = Math.max(0, parseInt(snap.roommates, 10) || 0);
  const names = snap.roommateNames || [];
  /* MR-073: partners is a list; an older form with partner: true and partnerName still reads */
  const partners = Array.isArray(snap.partners) ? snap.partners.filter(Boolean) : (snap.partner ? [{ name: snap.partnerName || '', takeHome: (form.money || {}).partnerTakeHome || '' }] : []);
  setHousehold(record, { roommates: Array.from({ length: n }, (_, i) => ({ id: 'rm' + (i + 1), nickname: names[i] || '' })), lease: snap.lease || (n ? 'both' : 'none'), unitSize: snap.unitSize || null, partners: partners.map(p => ({ nickname: p.name || '' })), basis: 'together' }, { session: m.session, now, why: null });
  /* ---- tier: an override is the coach's word */
  if (form.tierOverride) setColTier(record, { tier: form.tierOverride, source: 'client', basis: 'override', allItems: tiers.tierAverages[form.tierOverride].allItems, housing: tiers.tierAverages[form.tierOverride].housing }, { session: m.session, now });
  const tier = colTierOf(record, tiers);
  /* ---- money */
  const money = form.money || {};
  /* a partner's pay (MR-050, MR-073): one W-2 row per partner marked Partner's, counted with the client's under "together" */
  partners.forEach((p, i) => {
    const varies = p.payType === 'varies';
    const pt = parseSaid(p.takeHome, { kind: 'income', defaultCadence: varies ? 'month' : 'paycheck' });
    if (!pt || pt.cents === null) return;
    const who = p.name || (partners.length > 1 ? 'Partner ' + (i + 1) : 'Partner');
    const prow = createRow('income', 'w2', { nickname: who + "'s job", institution: '', f: freshFacts(fields, 'income', 'w2') });
    addRow(record, prow, { session: m.session, now });
    set(prow.id, 'whose', 'partner', 'known', undefined, 'client');
    set(prow.id, 'takeHome', pt.cents, stateOf(pt, false), pt.cadence);
    if (pt.cadence === 'paycheck') set(prow.id, 'payFrequency', p.payFrequency || pt.payFrequency || 'biweekly', p.payFrequency ? 'known' : 'known', undefined, p.payFrequency ? DISC : 'inferred');
    if (p.payType === 'hourly') set(prow.id, 'stability', 'variable', 'rough', undefined, 'inferred');
  });
  const selfEmployed = snap.workSituation === 'self-employed';
  const jobType = selfEmployed ? 'c1099' : 'w2';
  let job = record.planets.income.rows.find(r => r.type === jobType && !(r.f.whose && r.f.whose.v === 'partner'));
  /* MR-073: the pay type decides how "before tax" was asked. Salary: a yearly figure. Hourly: rate times hours a week,
     fifty-two weeks, as a rough monthly gross. It varies: a typical month. No pay type (older forms): whatever was said. */
  const payType = money.payType || null;
  let gross = null; let hourly = null;
  if (payType === 'hourly') {
    const rate = parseSaid(money.hourlyRate); const hrs = parseFloat(String(money.hoursPerWeek || '').replace(/[^0-9.]/g, ''));
    if (rate && rate.cents !== null && hrs > 0) { hourly = { rateCents: rate.cents, hours: hrs }; gross = { cents: Math.round(rate.cents * hrs * 52 / 12), cadence: 'month', payFrequency: null, state: 'rough', raw: money.hourlyRate + ' x ' + hrs }; }
  } else if (payType === 'salary') gross = parseSaid(money.gross, { kind: 'income', defaultCadence: 'year' });
  else if (payType === 'varies') { gross = parseSaid(money.gross, { kind: 'income', defaultCadence: 'month' }); if (gross) gross.state = 'rough'; }
  else gross = parseSaid(money.gross, { kind: 'income' });
  const take = parseSaid(money.takeHome, { kind: 'income', defaultCadence: payType === 'varies' ? 'month' : (payType ? 'paycheck' : undefined) });
  if ((gross && gross.cents !== null) || (take && take.cents !== null)) {
    if (!job) { job = createRow('income', jobType, { nickname: snap.employer || 'Job', institution: snap.employer || '', f: freshFacts(fields, 'income', jobType) }); addRow(record, job, { session: m.session, now }); }
    const pf = money.payFrequency || (take && take.payFrequency) || (gross && gross.payFrequency) || 'biweekly';
    if (gross && gross.cents !== null) { set(job.id, 'grossPay', gross.cents, stateOf(gross, money.grossKnown), gross.cadence); out.anchors.push(setAnchor(record, 'gut', 'income:gross', toMonthly(gross.cents, gross.cadence, pf), { cadence: 'month', source: DISC, session: m.session, now })); }
    if (hourly && job.f.hoursPaid) set(job.id, 'hoursPaid', hourly.hours, 'rough');
    if (money.payFrequency) set(job.id, 'payFrequency', money.payFrequency, 'known');
    if (money.steadiness && job.f.stability) set(job.id, 'stability', money.steadiness, 'known');
    else if (payType === 'hourly' && job.f.stability) set(job.id, 'stability', 'variable', 'rough', undefined, 'inferred');
    if (take && take.cents !== null) { set(job.id, 'takeHome', take.cents, stateOf(take, money.takeHomeKnown), take.cadence); out.anchors.push(setAnchor(record, 'gut', 'income:takeHome', toMonthly(take.cents, take.cadence, pf), { cadence: 'month', source: DISC, session: m.session, now })); }
    if (!money.payFrequency && (take && take.cadence === 'paycheck' || gross && gross.cadence === 'paycheck')) set(job.id, 'payFrequency', pf, 'known', undefined, 'inferred');
    /* the cross-check: take-home said against take-home inferred from gross, silent under 10% */
    if (gross && gross.cents !== null && take && take.cents !== null) {
      const gm = toMonthly(gross.cents, gross.cadence, pf), tm = toMonthly(take.cents, take.cadence, pf);
      const table = data.tax2026; const st = (record.sun.f.filingStatus && record.sun.f.filingStatus.v) || 'single';
      const contribPct = money.contribPct ? (parseFloat(String(money.contribPct).replace('%', '')) || 0) / 100 : 0;
      const pretax = Math.round(gm * 12 * contribPct);
      const fed = federalTax(table, taxableIncome(table, gm * 12, pretax, st), st).tax; const fi = fica(table, gm * 12).total;
      const inferred = Math.round((gm * 12 - pretax - fed - fi) / 12);
      out.checks.takeHome = Object.assign({ said: tm, inferred, pretaxAnnual: pretax }, crossCheck(tm, inferred));
      if (contribPct) set(job.id, 'pretaxRetirement', Math.round(gross.cents * contribPct), 'rough', gross.cadence);
    }
  }
  if (money.matchKnown === true || (money.match && String(money.match).trim())) {
    let ben = record.planets.income.rows.find(r => r.type === 'benefits');
    if (!ben) { ben = createRow('income', 'benefits', { nickname: 'Employer match', institution: snap.employer || '', f: freshFacts(fields, 'income', 'benefits') }); addRow(record, ben, { session: m.session, now }); }
    const mt = money.match ? parseSaid(money.match) : null;
    if (mt && !mt.unknown && mt.cents !== null && /%/.test(String(money.match))) set(ben.id, 'matchRate', 1, 'rough'), set(ben.id, 'matchUpTo', mt.cents / 10000, 'rough');
    else { set(ben.id, 'matchRate', null, 'unknown'); set(ben.id, 'matchUpTo', null, 'unknown'); out.notes.push('Match said to exist but not confirmed: on their plate.'); }
  }
  (money.cash || []).forEach(acc => { if (!acc || !acc.name) return; const p = parseSaid(acc.said); const row = createRow('invest', 'bank', { nickname: acc.name, institution: acc.institution || '', f: freshFacts(fields, 'invest', 'bank') }); addRow(record, row, { session: m.session, now }); set(row.id, 'bankType', BANK_TYPE(acc.type || ACCOUNT_TYPE(acc.name)), 'known', undefined, 'inferred'); set(row.id, 'accountBalance', p && p.cents !== null ? p.cents : null, p ? (p.unknown ? 'unknown' : stateOf(p, acc.known)) : 'unknown'); set(row.id, 'contribAmount', 0, 'none', 'month'); });
  (money.invest || []).forEach(acc => { if (!acc || !acc.name) return; const p = parseSaid(acc.said); const willSend = /send|later|look/i.test(String(acc.said || '')); const row = createRow('invest', 'account', { nickname: acc.name, institution: acc.institution || '', f: freshFacts(fields, 'invest', 'account') }); addRow(record, row, { session: m.session, now }); set(row.id, 'accountType', acc.type || ACCOUNT_TYPE(acc.name), 'known', undefined, 'inferred'); set(row.id, 'accountBalance', p && p.cents !== null ? p.cents : null, willSend ? 'will-send' : p ? (p.unknown ? 'unknown' : stateOf(p, acc.known)) : 'will-send'); set(row.id, 'contribAmount', 0, 'none', 'month'); });
  (money.debt || []).forEach(d => { if (!d || !d.name) return; const p = parseSaid(d.said); const type = d.type || DEBT_TYPE(d.name); const row = createRow('debt', type, { nickname: d.name, institution: d.institution || '', f: freshFacts(fields, 'debt', type) }); addRow(record, row, { session: m.session, now }); const notGiven = !p || p.unknown || /not given|didn'?t say|avoid/i.test(String(d.said || '')); set(row.id, 'balance', notGiven ? null : p.cents, notGiven ? 'unknown' : stateOf(p, d.known)); if (notGiven) out.notes.push(d.name + ': balance not given.'); });
  /* ---- the balance anchors */
  const cashSum = record.planets.invest.rows.filter(r => (r.type === 'bank' || (r.type === 'account' && ['ibonds'].includes(r.f.accountType && r.f.accountType.v))) && hasValue(r.f.accountBalance)).reduce((s, r) => s + numberOf(r.f.accountBalance), 0);
  if (record.planets.invest.rows.some(r => r.type === 'bank' && ['checking', 'hysa', 'savings'].includes(r.f.bankType && r.f.bankType.v) && hasValue(r.f.accountBalance))) out.anchors.push(setAnchor(record, 'gut', 'safety:cash', cashSum, { cadence: 'oneoff', source: DISC, session: m.session, now }));
  const invSum = record.planets.invest.rows.filter(r => r.type === 'account' && !['ibonds', 'realEstate', 'other'].includes(r.f.accountType && r.f.accountType.v) && hasValue(r.f.accountBalance)).reduce((s, r) => s + numberOf(r.f.accountBalance), 0);
  if (record.planets.invest.rows.some(r => r.type === 'account' && !['ibonds'].includes(r.f.accountType && r.f.accountType.v) && hasValue(r.f.accountBalance))) out.anchors.push(setAnchor(record, 'gut', 'invest:total', invSum, { cadence: 'oneoff', source: DISC, session: m.session, now }));
  const debtRows = record.planets.debt.rows.filter(r => r.f.balance && hasValue(r.f.balance));
  if (debtRows.length) out.anchors.push(setAnchor(record, 'gut', 'debt:total', debtRows.reduce((s, r) => s + numberOf(r.f.balance), 0), { cadence: 'oneoff', source: DISC, session: m.session, now }));
  /* ---- spending: the gut total and any per-area figure the client volunteered become anchors (the client's share for shared areas) */
  const sp = form.spending || {};
  const people = n + 1;
  if (sp.gutTotal) { const p = parseSaid(sp.gutTotal); if (p && p.cents !== null) { let sum = record.planets.spending.rows.find(r => r.type === 'summary'); if (!sum) { sum = createRow('spending', 'summary', { nickname: 'Rough total', f: freshFacts(fields, 'spending', 'summary') }); addRow(record, sum, { session: m.session, now }); } set(sum.id, 'summaryTotal', p.cents, stateOf(p, sp.gutTotalKnown), p.cadence); out.anchors.push(setAnchor(record, 'gut', 'spending:total', toMonthly(p.cents, p.cadence), { cadence: 'month', source: DISC, session: m.session, now })); } }
  Object.keys(sp.areas || {}).forEach(cat => {
    const a = sp.areas[cat]; if (!a || !a.said) return;
    const p = parseSaid(a.said); if (!p || p.cents === null) return;
    const shared = !!a.shared || !!p.split || p.isShare;
    const sm = shareMath({ full: p.isShare ? p.full : (shared ? p.cents : null), share: p.isShare ? p.share : (shared && !p.isShare ? (p.share !== null ? p.share : Math.round(p.cents / people)) : null), split: p.split || (shared ? people : null) });
    const mine = shared ? sm.share : p.cents;
    out.anchors.push(setAnchor(record, 'gut', 'spending:' + cat, toMonthly(mine, p.cadence), { cadence: 'month', source: DISC, session: m.session, now, shared, note: shared ? 'Full bill ' + F.dollarsWhole(toMonthly(sm.full || mine, p.cadence)) + ', your share' : '' }));
  });
  if (sp.phoneFamilyPlan) { let ph = record.planets.spending.rows.find(r => r.type === 'line' && /phone/i.test(r.nickname) && !isGuessRow(r)); if (!ph) { ph = createRow('spending', 'line', { nickname: 'Phone', f: freshFacts(fields, 'spending', 'line') }); addRow(record, ph, { session: m.session, now }); set(ph.id, 'category', 'utilities', 'known'); } set(ph.id, 'amount', 0, 'none', 'month'); set(ph.id, 'needWant', 'need', 'known'); }
  /* ---- goals */
  (form.goals || []).forEach(g => { if (!g || !g.text) return; const row = createRow('life', 'goal', { nickname: g.text, f: freshFacts(fields, 'life', 'goal') }); addRow(record, row, { session: m.session, now }); if (g.amount) { const p = parseSaid(g.amount, { defaultCadence: 'oneoff' }); if (p && p.cents !== null) set(row.id, 'goalCost', p.cents, stateOf(p, false), undefined); } if (g.when) { const w = parseWhen(g.when, today); if (w) set(row.id, 'targetDate', w, 'rough'); } });
  /* ---- mindset, words, mode */
  const mind = form.mindset || {};
  const ctx = form.context || {};
  record.discovery = { at: now || new Date().toISOString(), form: JSON.parse(JSON.stringify(form)), whyNow: form.whyNow || '', words: (form.words || []).filter(Boolean), mindset: { stuck: mind.stuck || [], avoidsAccounts: !!mind.avoidsAccounts, struggles: mind.struggles || [] }, goals: (form.goals || []).filter(g => g && g.text), checks: out.checks, notes: out.notes, confirmed: {}, applied: true,
    /* MR-073: the fit and context answers, kept as said; nothing downstream computes with them */
    context: { tried: ctx.tried || '', ifNothing: ctx.ifNothing || '', bigComing: ctx.bigComing || '', workStyle: ctx.workStyle || null, decisionMakers: ctx.decisionMakers || '', worthIt: ctx.worthIt || '' },
    pay: { type: payType, hourly: hourly ? { rateCents: hourly.rateCents, hoursPerWeek: hourly.hours } : null, frequency: money.payFrequency || null, steadiness: money.steadiness || null } };
  const gentle = !!mind.avoidsAccounts || (mind.struggles || []).includes('avoiding');
  record.sessionMode = gentle ? 'gentle' : (record.sessionMode === 'gentle' ? 'gentle' : 'standard');
  /* ---- guesses for every gap */
  out.guesses = applyGuesses(record, data, { session: m.session, now });
  out.tier = colTierOf(record, tiers);
  return out;
}

/* Replace every untouched guess with fresh ones for the current tier and household. Journal lines carry why = null (paperwork). */
export function applyGuesses(record, data, meta) {
  const m = meta || {};
  guessRows(record).forEach(r => removeRow(record, r.id, { session: m.session, now: m.now }));
  const asm = Object.assign({}, data.assumptions.defaults, record.sun.assumptions || {});
  if (asm.fillGapsWithGuesses === false) return [];
  const tier = colTierOf(record, data.colTiers);
  const rows = buildGuesses(record, data, tier);
  rows.forEach(r => addRow(record, r, { session: m.session, now: m.now }));
  return rows;
}

/* "Jan", "April", "next September", "2027-04", "in 6 months" to YYYY-MM. */
export function parseWhen(text, today) {
  const t = String(text || '').trim().toLowerCase(); const y = parseInt(today.slice(0, 4), 10), mo = parseInt(today.slice(5, 7), 10);
  let m = /^(\d{4})-(\d{1,2})/.exec(t); if (m) return m[1] + '-' + m[2].padStart(2, '0');
  m = /in\s+(\d+)\s+months?/.exec(t); if (m) { const k = mo - 1 + parseInt(m[1], 10); return String(y + Math.floor(k / 12)) + '-' + String(k % 12 + 1).padStart(2, '0'); }
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const i = MONTHS.findIndex(x => t.indexOf(x) !== -1);
  if (i === -1) { m = /(\d{4})/.exec(t); return m ? m[1] + '-06' : null; }
  const yr = /(\d{4})/.exec(t); let year = yr ? parseInt(yr[1], 10) : (i + 1 > mo ? y : y + 1);
  if (/next/.test(t) && !yr && i + 1 <= mo) year = y + 1;
  return String(year) + '-' + String(i + 1).padStart(2, '0');
}

/* The discovery summary: everything the sheet shows, computed here. */
export function discoverySummary(record, result, data) {
  const D = record.discovery || { words: [], goals: [], mindset: {}, whyNow: '' };
  const tier = result.colTier || colTierOf(record, data.colTiers);
  const hh = record.household || { roommates: [], lease: 'none' };
  const M = result.metrics || {};
  const numbers = [];
  const push = (item, said, status, next, plate, rowId, field) => numbers.push({ item, said, status, next, plate, rowId, field });
  Object.keys(record.planets).forEach(p => record.planets[p].rows.forEach(r => Object.keys(r.f).forEach(fid => {
    const f = r.f[fid]; const def = data.fields.fields[fid]; if (!def || def.kind !== 'money' && def.kind !== 'percent') return;
    if (isGuessRow(r)) { if (fid === 'amount') push((r.nickname || def.label), 'Guess', 'guess', 'Swap for their number in Confirm', 'mine', r.id, fid); return; }
    if (f.source !== 'discovery' && !(f.state === 'unknown' && f.source === 'discovery')) { if (f.source === 'discovery' || (f.state === 'unknown' && r.f[fid].source === 'discovery')) return; }
    if (f.source !== 'discovery') return;
    const said = f.state === 'unknown' ? 'not given' : f.state === 'will-send' ? 'will send' : f.state === 'none' ? 'none' : F.dollarsWhole(numberOf(f) || 0) + (f.cad && f.cad !== 'month' ? ' per ' + f.cad : f.cad === 'month' && def.cadence ? ' a month' : '');
    push((r.nickname ? r.nickname + ': ' : '') + def.label.toLowerCase(), said, f.state, f.state === 'unknown' ? 'Ask gently, or a statement photo' : f.state === 'will-send' ? 'They send it' : 'Confirm in Session 1', f.state === 'unknown' || f.state === 'will-send' || f.state === 'rough' ? 'theirs' : null, r.id, fid);
  })));
  const gc = result.guesses ? result.guesses.count : 0;
  const first = { fiNumber: M.fiNumber && M.fiNumber.status === 'ok' ? M.fiNumber.value.cents : null, fiDate: M.fiDate && M.fiDate.status === 'ok' ? M.fiDate.value.value : null, fiAge: M.fiDate && M.fiDate.status === 'ok' && M.fiDate.ages ? M.fiDate.ages.likely : null, cushion: M.ruleOf5Target && M.ruleOf5Target.status === 'ok' ? M.ruleOf5Target.value.cents : null, roommateGap: result.sun && result.sun.outputs.safety.roommateGap ? result.sun.outputs.safety.roommateGap.cents : null, guesses: gc, spending: M.spending && M.spending.status === 'ok' ? M.spending.value.cents : null, takeHome: M.takeHome && M.takeHome.status === 'ok' ? M.takeHome.value.cents : null };
  const roommate = hh.roommates.length ? roommateOutcome(result, { answers: { monthsToReplace: result.asm.roommateMonthsToReplace || 2, oneTime: 0, keepAlone: 0, yearsAlone: 30 } }, data.scenarioBlocks.types.roommate) : null;
  const agenda = session1Agenda(record, result, data);
  const open = (D.words || []).filter(w => /\?/.test(w));
  return { context: D.context || null, pay: D.pay || null, partners: Array.isArray(hh.partners) ? hh.partners : (hh.partner ? [hh.partner] : []), snapshot: { name: record.sun.f.name && record.sun.f.name.v, age: result.age, city: record.sun.f.city && record.sun.f.city.v, state: record.sun.f.state && record.sun.f.state.v, work: record.sun.f.workSituation && record.sun.f.workSituation.v, employerType: D.form && D.form.snapshot ? D.form.snapshot.employerType : null, tier, tierWord: tierLabel(tier.tier, 'client', data.colTiers), household: hh }, whyNow: D.whyNow, words: D.words || [], numbers, goals: (D.goals || []).map(g => ({ goal: g.text, when: g.when || '', measure: g.amount ? 'Balance reaches ' + g.amount : /card|debt|owe/i.test(g.text) ? 'Balance goes down each month' : /know|spend/i.test(g.text) ? 'Every area has a real number' : /cushion|emergency/i.test(g.text) ? 'Cash reaches the cushion target' : 'A date and a dollar figure', needs: g.amount ? 'A date' : 'A dollar figure and a date' })), howToRun: { mode: record.sessionMode || 'standard', struggles: D.mindset ? D.mindset.struggles : [], stuck: D.mindset ? D.mindset.stuck : [], avoidsAccounts: !!(D.mindset && D.mindset.avoidsAccounts), openQuestions: open }, firstDraft: first, roommate, agenda, checks: D.checks || {}, notes: D.notes || [] };
}

/* The proposed Session 1 agenda from the gaps: unknown and avoided items first, gently, then the largest guesses, rent first when there is a roommate. */
export function session1Agenda(record, result, data) {
  const items = [];
  const gentle = (record.sessionMode || 'standard') === 'gentle';
  items.push({ step: 'Confirm what you told me', why: 'two minutes, builds trust' });
  Object.keys(record.planets).forEach(p => record.planets[p].rows.forEach(r => { if (isGuessRow(r)) return; Object.keys(r.f).forEach(fid => { const f = r.f[fid]; if (f.source === 'discovery' && (f.state === 'unknown' || f.state === 'will-send')) items.push({ step: (r.nickname || fid) + ': ' + data.fields.fields[fid].label.toLowerCase(), why: f.state === 'unknown' ? (gentle ? 'not given; ask gently, a photo of the statement is plenty' : 'not given') : 'they will send it' }); }); }));
  const guesses = (result.guesses ? result.guesses.rows : []).slice().sort((a, b) => { const rm = (record.household && record.household.roommates.length); if (rm && a.category === 'accommodation') return -1; if (rm && b.category === 'accommodation') return 1; return (b.cents || 0) - (a.cents || 0); });
  guesses.slice(0, 5).forEach(g => items.push({ step: 'Swap the guess for ' + g.name.toLowerCase(), why: F.dollarsWhole(g.cents || 0) + ' a month guessed for a ' + tierLabel(g.tier, 'client', data.colTiers) }));
  items.push({ step: 'What you spend, area by area', why: 'their own words before the statements' });
  items.push({ step: 'What you would want', why: 'the dream, with the gut hidden' });
  items.push({ step: gentle ? 'Homework: gather one month of statements' : 'The real numbers', why: gentle ? 'the reveal waits for the next session' : 'line by line, biggest first' });
  return items;
}

/* The lines still to confirm in Session 1: what they told me, and my guesses. */
export function confirmItems(record, result, data) {
  const done = (record.discovery && record.discovery.confirmed) || {};
  const said = []; const guesses = [];
  Object.keys(record.planets).forEach(p => record.planets[p].rows.forEach(r => {
    if (isGuessRow(r)) { const f = r.f.amount; if (!f) return; guesses.push({ rowId: r.id, field: 'amount', planet: p, label: r.nickname, category: r.f.category ? r.f.category.v : null, cents: numberOf(f), shared: !!(r.f.shared && r.f.shared.v), share: r.f.myShare && typeof r.f.myShare.v === 'number' ? r.f.myShare.v : null, tier: r.guessTier }); return; }
    Object.keys(r.f).forEach(fid => { const f = r.f[fid]; const def = data.fields.fields[fid]; if (!def || f.source !== 'discovery' || done[r.id + '|' + fid]) return; if (f.state === 'known' && !def.kind.match(/money|percent|int/)) return; said.push({ rowId: r.id, field: fid, planet: p, label: (r.nickname ? r.nickname + ': ' : '') + def.label.toLowerCase(), kind: def.kind, value: f.v, state: f.state, cad: f.cad || null }); });
  }));
  ['birthDate', 'city', 'workSituation'].forEach(id => { const f = record.sun.f[id]; if (f && f.source === 'discovery' && !done['sun|' + id]) said.push({ rowId: 'sun', field: id, planet: 'sun', label: id === 'birthDate' ? 'birth date' : id === 'workSituation' ? 'work situation' : id, kind: 'text', value: f.v, state: f.state }); });
  const rm = record.household && record.household.roommates.length;
  guesses.sort((a, b) => { if (rm && a.category === 'accommodation' && b.category !== 'accommodation') return -1; if (rm && b.category === 'accommodation' && a.category !== 'accommodation') return 1; return (b.cents || 0) - (a.cents || 0); });
  return { said, guesses, tierConfirmed: !!done['tier'], householdConfirmed: !!done['household'] };
}
