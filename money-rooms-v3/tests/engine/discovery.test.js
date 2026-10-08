/* Level 8 (MR-045 to MR-049): the discovery call, guesses, anchors, shared
   costs, the roommate worst case, variance and targets. Expected numbers come
   from tests/households/discovery-expected.json, typed by hand. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compute } from '../../engine/compute.js';
import { parseSaid, toMonthly, shareMath, crossCheck, parseBirth } from '../../engine/parse.js';
import { tierFor, colTierOf } from '../../engine/col.js';
import { applyDiscovery, applyGuesses, confirmItems, discoverySummary, session1Agenda, parseWhen } from '../../engine/discovery.js';
import { setAnchor, reanchor, getAnchor, dreamTotal } from '../../engine/anchors.js';
import { guessRows, isGuessRow } from '../../engine/guesses.js';
import { variance, fiEffect } from '../../engine/variance.js';
import { proposals, setTarget, defaultChoice, middleValue } from '../../engine/targets.js';
import { progress } from '../../engine/progress.js';
import { roommateOutcome } from '../../engine/scenarios.js';
import { createRecord, createRow, addRow, setField, setHousehold, setColTier, whyOf } from '../../engine/record.js';
import { shareOf, peopleOf } from '../../engine/household.js';
import { freshFacts } from '../../engine/fields.js';
import { loadData } from './load-data.js';
import { MAYA_DISCOVERY, VARIANCE_HOUSEHOLD } from '../households/discovery-specs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = loadData(); const TODAY = '2026-10-07'; const NOW = '2026-10-07T15:00:00.000Z';
const E = JSON.parse(fs.readFileSync(path.join(here, '..', 'households', 'discovery-expected.json'), 'utf8'));
const num = f => f && typeof f.v === 'number' ? f.v : null;

export function buildMaya() { const rec = createRecord({ id: 'maya-discovery', now: '2026-10-01T00:00:00.000Z' }); const out = applyDiscovery(rec, JSON.parse(JSON.stringify(MAYA_DISCOVERY)), data, { now: NOW, today: TODAY, session: 'discovery' }); return { rec, out }; }
export function buildVariance() {
  const V = VARIANCE_HOUSEHOLD; const rec = createRecord({ id: 'variance', now: '2026-10-01T00:00:00.000Z' });
  const set = (rowId, fid, v, st, cad) => setField(rec, rowId, fid, v, st || 'known', 'client', { cad, now: NOW });
  set('sun', 'birthDate', V.birthDate); set('sun', 'filingStatus', 'single'); set('sun', 'workSituation', 'employed'); set('sun', 'state', 'NY');
  const add = (planet, type, nick, f) => { const row = createRow(planet, type, { nickname: nick, f: freshFacts(data.fields, planet, type) }); addRow(rec, row, { now: NOW }); Object.keys(f).forEach(fid => { const [v, st, cad] = f[fid]; set(row.id, fid, v, st, cad); }); return row; };
  add('income', 'w2', 'Job', { grossPay: [720000, 'known', 'month'], takeHome: [V.takeHome, 'known', 'month'] });
  Object.keys(V.gut).forEach(k => setAnchor(rec, 'gut', k, V.gut[k], { source: 'call', now: '2026-10-02T00:00:00.000Z' }));
  Object.keys(V.dream).forEach(k => setAnchor(rec, 'dream', k, k === 'life:fiAge' ? { value: V.dream[k] } : V.dream[k], { source: 'call', now: '2026-10-02T00:00:00.000Z' }));
  V.lines.forEach(([nick, cat, cents]) => add('spending', 'line', nick, { category: [cat], amount: [cents, 'known', 'month'], needWant: [cat === 'wants' ? 'want' : 'need'], mistake: ['unavoidable'], fatFloor: [['accommodation', 'food', 'transportation'].includes(cat)] }));
  add('debt', 'summary', 'No debt', { debtSummaryTotal: [0, 'none'] });
  add('invest', 'account', 'Brokerage', { accountType: ['taxable'], accountBalance: [V.invested, 'known'], contribAmount: [100000, 'known', 'month'] });
  add('invest', 'bank', 'Savings', { bankType: ['hysa'], accountBalance: [V.cash, 'known'], contribAmount: [0, 'none', 'month'] });
  return rec;
}

test('hearing numbers the way people say them', () => {
  const a = parseSaid('1900 every two weeks'); assert.equal(a.cents, 190000); assert.equal(a.cadence, 'paycheck'); assert.equal(a.payFrequency, 'biweekly'); assert.equal(a.state, 'known'); assert.equal(toMonthly(a.cents, a.cadence, a.payFrequency), 411667);
  const b = parseSaid('like 100 a week'); assert.equal(b.cents, 10000); assert.equal(b.cadence, 'week'); assert.equal(b.state, 'rough');
  const c = parseSaid('68k', { kind: 'income' }); assert.equal(c.cents, 6800000); assert.equal(c.cadence, 'year');
  const d = parseSaid('2,500ish'); assert.equal(d.cents, 250000); assert.equal(d.state, 'rough');
  const e = parseSaid('my half is 1,650'); assert.equal(e.share, 165000); assert.equal(e.full, 330000); assert.equal(e.split, 2); assert.ok(e.isShare);
  const f = parseSaid("rent's 3,300 split two ways"); assert.equal(f.full, 330000); assert.equal(f.share, 165000); assert.equal(f.split, 2);
  assert.ok(parseSaid('none').none && parseSaid("don't know").unknown);
  assert.deepEqual(shareMath({ full: 330000, split: 2 }).share, 165000); assert.deepEqual(shareMath({ share: 110000, split: 3 }).full, 330000); assert.equal(shareMath({ full: 400000, share: 100000 }).split, 4);
  assert.equal(parseBirth('27', TODAY).iso, '1999-07-01'); assert.equal(parseBirth('1999-03-14', TODAY).state, 'known');
  assert.equal(parseWhen('April', TODAY), '2027-04'); assert.equal(parseWhen('next September', TODAY), '2027-09');
});
test('gross and take-home cross-check speaks up only past 10%', () => {
  assert.ok(crossCheck(411667, 400000).agree); assert.ok(!crossCheck(300000, 400000).agree);
});
test('tier inference: Jersey City is New York metro and HCOL; a small town takes its state non-metro value; an unknown place is MCOL', () => {
  const jc = tierFor('Jersey City', null, data.colTiers); assert.equal(jc.tier, 'HCOL'); assert.equal(jc.metro, 'new-york'); assert.equal(jc.allItems, E.maya.allItems); assert.equal(jc.housing, E.maya.housing);
  const small = tierFor('Ithaca', 'NY', data.colTiers); assert.equal(small.basis, 'state-nonmetro'); assert.ok(small.outsideMetro); assert.equal(small.allItems, data.colTiers.states.NY.nonMetroAllItems); assert.equal(small.tier, 'LCOL');
  const none = tierFor('', null, data.colTiers); assert.equal(none.tier, 'MCOL'); assert.equal(none.basis, 'default');
  assert.equal(tierFor('Oakland', 'CA', data.colTiers).metro, 'san-francisco');
});
test('a tier override is the coach\'s word and stops auto-updates', () => {
  const rec = createRecord({ id: 't' }); setField(rec, 'sun', 'city', 'Jersey City', 'known', 'client');
  assert.equal(colTierOf(rec, data.colTiers).tier, 'HCOL');
  setColTier(rec, { tier: 'LCOL', source: 'client' }); assert.equal(colTierOf(rec, data.colTiers).tier, 'LCOL');
  setField(rec, 'sun', 'city', 'San Jose', 'known', 'client'); assert.equal(colTierOf(rec, data.colTiers).tier, 'LCOL', 'the override holds');
  assert.equal(colTierOf(rec, data.colTiers).basis, 'override');
});

const { rec: maya, out: mayaOut } = buildMaya();
const R = compute(maya, data, { today: TODAY }); const S = R.sun.outputs; const M = R.metrics; const X = E.maya;
test('Maya: the discovery call fills the Sun, the household, the job and the accounts as What you said', () => {
  assert.equal(maya.sun.f.name.v, 'Maya Lindqvist'); assert.equal(R.age, 26); assert.equal(maya.sun.f.state.v, X.state); assert.equal(maya.sun.f.state.source, 'inferred');
  assert.deepEqual(maya.household.roommates.map(r => r.nickname), ['Dani']); assert.equal(maya.household.lease, 'both');
  assert.equal(S.income.takeHomeMonthly.cents, X.takeHomeMonthly); assert.equal(S.income.grossMonthly.cents, X.grossMonthly);
  const job = maya.planets.income.rows.find(r => r.type === 'w2'); assert.equal(job.f.takeHome.source, 'discovery'); assert.equal(job.f.takeHome.cad, 'paycheck'); assert.equal(job.f.payFrequency.v, 'biweekly'); assert.equal(job.f.grossPay.cad, 'year');
  assert.ok(mayaOut.checks.takeHome && mayaOut.checks.takeHome.agree, 'take-home and gross agree within 10%: ' + JSON.stringify(mayaOut.checks.takeHome));
  const ben = maya.planets.income.rows.find(r => r.type === 'benefits'); assert.equal(ben.f.matchRate.state, 'unknown', 'match unconfirmed goes to their plate');
  assert.equal(S.invest.cashBalances.cents, X.cash);
  const k = maya.planets.invest.rows.find(r => r.nickname === '401k'); assert.equal(k.f.accountBalance.state, 'will-send');
  const card = maya.planets.debt.rows.find(r => r.type === 'card'); assert.equal(card.f.balance.state, 'unknown'); assert.equal(card.f.balance.source, 'discovery');
  const phone = maya.planets.spending.rows.find(r => r.nickname === 'Phone' && !isGuessRow(r)); assert.equal(phone.f.amount.state, 'none');
  assert.equal(maya.sessionMode, 'gentle');
  assert.equal(maya.planets.life.rows.filter(r => r.type === 'goal').length, 6);
  assert.equal(maya.planets.life.rows.find(r => r.nickname === 'Wedding next September').f.targetDate.v, '2027-09');
});
test('Maya: discovery values become gut anchors; guesses never do', () => {
  X.anchorsGut.forEach(k => assert.ok(getAnchor(maya, 'gut', k), k)); X.noAnchorFor.forEach(k => assert.ok(!getAnchor(maya, 'gut', k), 'no anchor ' + k));
  assert.equal(getAnchor(maya, 'gut', 'income:takeHome').cents, X.takeHomeMonthly); assert.equal(getAnchor(maya, 'gut', 'income:takeHome').source, 'discovery');
  assert.equal(setAnchor(maya, 'gut', 'spending:food', 50000, { source: 'estimated' }), null);
  assert.deepEqual(maya.anchors.dream, {});
});
test('Maya: the tier is HCOL from Jersey City, and every spending area starts on a guess scaled by the tier and the household', () => {
  assert.equal(R.colTier.tier, 'HCOL'); assert.equal(R.colTier.metro, 'new-york'); assert.equal(R.colTier.source, 'inferred');
  const g = guessRows(maya); assert.equal(g.length, X.guessRows); assert.equal(R.guesses.count, X.guessRows);
  const byCat = {}; g.forEach(r => { const c = r.f.category.v; const share = r.f.shared && r.f.shared.v ? r.f.myShare.v : 1; byCat[c] = (byCat[c] || 0) + Math.round(r.f.amount.v * share); });
  Object.keys(X.guesses).forEach(cat => assert.equal(byCat[cat], X.guesses[cat], cat));
  const rent = g.find(r => r.f.category.v === 'accommodation'); assert.ok(rent.f.shared.v && rent.f.myShare.v === 0.5 && rent.guessUnit === '2bed');
  assert.ok(g.every(r => r.f.amount.source === 'estimated' && r.f.amount.state === 'rough'));
  assert.equal(S.spending.baselineMonthly.cents, X.spendingMonthly, 'the client share of the guesses and the zero phone line');
  assert.equal(S.spending.sharedFullMonthly.cents, X.sharedFull); assert.equal(S.spending.sharedShareMonthly.cents, X.sharedShare);
  assert.equal(M.fiNumber.value.cents, X.fiNumber);
});
test('tier scaling: an HCOL housing guess exceeds the MCOL one, which exceeds the LCOL one; one roommate means a 2-bed divided by two', () => {
  const shares = {};
  ['HCOL', 'MCOL', 'LCOL'].forEach(t => { const rec = createRecord({ id: 'g' + t }); setHousehold(rec, { roommates: [{ nickname: 'A' }], lease: 'both' }); setColTier(rec, { tier: t, source: 'client' }); applyGuesses(rec, data); const rent = guessRows(rec).find(r => r.f.category.v === 'accommodation'); shares[t] = Math.round(rent.f.amount.v * rent.f.myShare.v); assert.equal(rent.guessUnit, '2bed'); });
  assert.ok(shares.HCOL > shares.MCOL && shares.MCOL > shares.LCOL); Object.keys(shares).forEach(t => assert.equal(shares[t], E.tiers[t], t));
  const solo = createRecord({ id: 'solo' }); applyGuesses(solo, data); assert.equal(guessRows(solo).find(r => r.f.category.v === 'accommodation').guessUnit, '1bed');
});
test('Maya: the roommate gap sits in the Rule of 5 target, runway shows both numbers, the worst case carries the roommate leaving, and the lens fires', () => {
  assert.equal(S.safety.roommateGap.cents, X.bridge2); assert.equal(S.safety.ruleOf5Target.cents, X.ruleOf5Target);
  assert.equal(Math.round(S.safety.runway.full * 10) / 10, X.cushionNow); assert.equal(Math.round(S.safety.runway.fullAlone * 10) / 10, X.cushionAlone);
  assert.ok(R.lenses.some(l => l.id === 'roommate-risk'), 'roommate-risk: shared bills are above a quarter of take-home');
  const lens = R.lenses.find(l => l.id === 'roommate-risk'); assert.ok(lens.text.indexOf('Dani') !== -1 && lens.text.indexOf('2 months') !== -1);
  assert.equal(R.projectionInputs.worstExtraAnnualSpend, X.gapMonthly * 12);
  const out = roommateOutcome(R, { answers: { monthsToReplace: 2, oneTime: 0, keepAlone: 0, yearsAlone: 30 } }, data.scenarioBlocks.types.roommate);
  assert.equal(out.jumpMonthly, X.gapMonthly); assert.equal(out.bridge, X.bridge2); assert.equal(out.newSharedMonthly, X.sharedFull); assert.equal(out.cushionMonthsAtNewCost, X.cushionAlone); assert.ok(/both names/.test(out.leaseNote));
  const perm = roommateOutcome(R, { answers: { monthsToReplace: 2, oneTime: 50000, keepAlone: 1, yearsAlone: 30 } }, data.scenarioBlocks.types.roommate);
  assert.ok(perm.permanent && perm.newFiNumber > perm.oldFiNumber && perm.newSavingsRate < perm.oldSavingsRate && perm.bridge === X.bridge2 + 50000);
  const mine = JSON.parse(JSON.stringify(maya)); mine.household.lease = 'mine'; assert.ok(/fully on you/.test(roommateOutcome(compute(mine, data, { today: TODAY }), { answers: { monthsToReplace: 2, oneTime: 0, keepAlone: 0, yearsAlone: 30 } }, data.scenarioBlocks.types.roommate).leaseNote));
});
test('guesses never count toward completeness or the planet fills; the switch removes them from the math without deleting them', () => {
  assert.ok(R.completeness.share !== null && R.completeness.parts.filter(p => p.guess).every(p => !p.sure));
  const off = JSON.parse(JSON.stringify(maya)); off.sun.assumptions = { fillGapsWithGuesses: false };
  const R2 = compute(off, data, { today: TODAY });
  assert.equal(guessRows(off).length, X.guessRows, 'still there'); assert.equal(R2.guesses.count, 0);
  assert.equal(R2.sun.outputs.spending.baselineMonthly.cents, 0, 'only the zero phone line counts');
});
test('a tier or household change recomputes every remaining guess as paperwork; replacing a guess is a correction', () => {
  const rec = buildMaya().rec; const before = guessRows(rec).find(r => r.f.category.v === 'accommodation').f.amount.v;
  setColTier(rec, { tier: 'LCOL', source: 'client' }, { now: NOW }); const n0 = rec.journal.length; applyGuesses(rec, data, { now: NOW });
  const after = guessRows(rec).find(r => r.f.category.v === 'accommodation').f.amount.v; assert.ok(after < before);
  rec.journal.slice(n0).forEach(l => assert.ok(!l.why, 'paperwork')); assert.ok(rec.journal.slice(n0).some(l => l.kind === 'add-row') && rec.journal.slice(n0).some(l => l.kind === 'remove-row'));
  const rent = guessRows(rec).find(r => r.f.category.v === 'accommodation');
  const line = setField(rec, rent.id, 'amount', 165000, 'known', 'client', { now: NOW }); assert.equal(line.why, 'correction');
  /* a household change: two roommates means a 3-bed divided by three */
  const rec2 = buildMaya().rec; setHousehold(rec2, { roommates: [{ nickname: 'Dani' }, { nickname: 'Sam' }], lease: 'both' }, { now: NOW }); applyGuesses(rec2, data, { now: NOW });
  const r3 = guessRows(rec2).find(r => r.f.category.v === 'accommodation'); assert.equal(r3.guessUnit, '3bed'); assert.ok(Math.abs(r3.f.myShare.v - 1 / 3) < 1e-3);
});
test('why: the default rule', () => {
  const f = (v, state, source) => ({ v, state, source });
  assert.equal(whyOf(f(100, 'rough', 'client'), f(120, 'known', 'client')), 'correction');
  assert.equal(whyOf(f(100, 'known', 'client'), f(120, 'known', 'client')), 'move');
  assert.equal(whyOf(f(100, 'known', 'client'), f(100, 'verified', 'client')), null, 'a state change alone is paperwork');
  assert.equal(whyOf(f(100, 'rough', 'estimated'), f(90, 'known', 'client')), 'correction', 'replacing a guess');
  assert.equal(whyOf(f(100, 'rough', 'discovery'), f(90, 'known', 'client')), 'correction');
  assert.equal(whyOf(null, f(90, 'known', 'client')), null);
});
test('Maya: Confirm lists what she told me and my guesses, rent first; outcomes carry their why', () => {
  const c = confirmItems(maya, R, data);
  assert.ok(c.said.length >= 5 && c.said.some(i => i.label.indexOf('take-home') !== -1));
  assert.equal(c.guesses[0].category, 'accommodation', 'rent first with a roommate'); assert.equal(c.guesses.length, X.guessRows);
  const rec = buildMaya().rec; const job = rec.planets.income.rows.find(r => r.type === 'w2');
  const still = setField(rec, job.id, 'takeHome', job.f.takeHome.v, 'known', 'client', { now: NOW, cad: 'paycheck' }); assert.equal(still.why, null, 'Still right is paperwork');
  const change = setField(rec, job.id, 'grossPay', 7000000, 'known', 'client', { now: NOW, cad: 'year' }); assert.equal(change.why, 'correction');
  const dunno = setField(rec, job.id, 'pretaxRetirement', null, 'unknown', 'client', { now: NOW }); assert.equal(dunno.why, 'correction');
});
test('anchors write once; re-anchor keeps the old value in history and writes a journal line', () => {
  const rec = createRecord({ id: 'a' });
  assert.ok(setAnchor(rec, 'gut', 'spending:food', 50000, { now: NOW })); assert.equal(setAnchor(rec, 'gut', 'spending:food', 60000, { now: NOW }), null); assert.equal(getAnchor(rec, 'gut', 'spending:food').cents, 50000);
  assert.ok(reanchor(rec, 'gut', 'spending:food', 60000, { now: NOW })); assert.equal(getAnchor(rec, 'gut', 'spending:food').cents, 60000); assert.equal(rec.anchors.history[0].cents, 50000);
  assert.equal(rec.journal.filter(l => l.kind === 'anchor').length, 2); assert.ok(rec.journal[rec.journal.length - 1].reanchor);
});
test('the stand-in rule: a gut anchor stands in for an area with no lines, else the guess; lines override and publish the gap', () => {
  const rec = buildMaya().rec; const R0 = compute(rec, data, { today: TODAY }); assert.equal(R0.sun.outputs.spending.standIns.food, 'guess');
  setAnchor(rec, 'gut', 'spending:food', 60000, { source: 'call', now: NOW });
  const R1 = compute(rec, data, { today: TODAY }); assert.equal(R1.sun.outputs.spending.standIns.food, 'anchor'); assert.equal(R1.sun.outputs.spending.byCategory.food.cents, 60000); assert.ok(R1.sun.outputs.spending.byCategory.food.rough);
  const row = createRow('spending', 'line', { nickname: 'Groceries', f: freshFacts(data.fields, 'spending', 'line') }); addRow(rec, row, { now: NOW }); setField(rec, row.id, 'category', 'food', 'known', 'client', { now: NOW }); setField(rec, row.id, 'amount', 70000, 'known', 'client', { now: NOW, cad: 'month' });
  const R2 = compute(rec, data, { today: TODAY }); assert.equal(R2.sun.outputs.spending.standIns.food, undefined); assert.equal(R2.sun.outputs.spending.byCategory.food.cents, 70000); assert.equal(R2.sun.outputs.spending.anchorGapByCategory.food.cents, 10000);
});
test('the dream FI basis switch and the on-my-own housing dream', () => {
  const rec = buildVariance(); const R0 = compute(rec, data, { today: TODAY });
  const d = dreamTotal(rec); assert.equal(d.cents, 45000 + 40000 + 150000);
  const rec2 = JSON.parse(JSON.stringify(rec)); rec2.sun.assumptions = { fiSpendingBasis: 'dream' }; rec2.planets.life.rows.push(createRow('life', 'retirement', { nickname: 'Retirement', f: Object.assign(freshFacts(data.fields, 'life', 'retirement'), { dreamSpending: { v: d.cents, state: 'rough', source: 'client', cad: 'month' } }) }));
  const R1 = compute(rec2, data, { today: TODAY });
  assert.equal(R1.metrics.regularFi.value.cents, Math.round(d.cents * 12 / 0.04)); assert.notEqual(R0.metrics.regularFi.value.cents, R1.metrics.regularFi.value.cents);
  assert.equal(R0.ladder.baseSpending.source, 'actual'); assert.equal(R1.ladder.baseSpending.source, 'dream');
  setAnchor(rec, 'dream', 'housing:alone', { value: true }, { now: NOW }); assert.ok(getAnchor(rec, 'dream', 'housing:alone').value === true);
});
const V = buildVariance(); const RV = compute(V, data, { today: TODAY }); const XV = E.variance;
const actualsOf = (rec, R0) => { const S0 = R0.sun.outputs; const areas = {}; Object.keys(S0.spending.byCategory).forEach(c => { areas[c] = S0.spending.byCategory[c].cents; }); return { areas, total: S0.spending.baselineMonthly.cents, standIns: S0.spending.standIns, other: { 'income:takeHome': S0.income.takeHomeMonthly.cents } }; };
test('variance: all three gaps, directions, ranking and groups tie out', () => {
  const v = variance(V, actualsOf(V, RV));
  Object.keys(XV.rows).forEach(cat => { const row = v.rows.find(r => r.key === cat); const x = XV.rows[cat]; assert.ok(row, cat); assert.equal(row.actual, x.actual); if (x.awareness !== undefined) assert.equal(row.awareness.monthly, x.awareness, cat + ' awareness'); if (x.dreamGap !== undefined) assert.equal(row.dreamGap.monthly, x.dreamGap, cat + ' dream gap'); if (x.wish !== undefined) assert.equal(row.wish.monthly, x.wish, cat + ' wish'); });
  assert.equal(v.total.actual, XV.totalActual); assert.equal(v.total.awareness.monthly, XV.totalAwareness); assert.equal(v.total.awareness.pct, XV.totalAwarenessPct); assert.equal(v.total.awareness.annual, XV.totalAwareness * 12);
  assert.deepEqual(v.groups.bigger.map(r => r.key).sort(), XV.bigger.sort()); assert.deepEqual(v.groups.smaller.map(r => r.key), XV.smaller); assert.deepEqual(v.groups.roomToSpend.map(r => r.key), XV.roomToSpend); assert.deepEqual(v.groups.aboveDream.map(r => r.key), XV.aboveDream);
  assert.equal(v.ranked[0].key, XV.rankedFirst); assert.deepEqual(v.headline.top2.sort(), XV.top2.sort()); assert.equal(v.headline.top2Share, XV.top2Share);
  assert.equal(v.rows.find(r => r.key === 'food').awareness.direction, 'more'); assert.equal(v.rows.find(r => r.key === 'wants').dreamGap.direction, 'below');
  const eff = fiEffect(RV, -15000); assert.ok(eff.fiNumberDelta === -4500000 && eff.months <= 0);
});
test('variance: guesses never count as gut or actual', () => {
  const v = variance(maya, actualsOf(maya, R)); assert.ok(v.rows.every(r => r.actual === null), 'every Maya area is a guess today'); assert.equal(v.total.actual, null);
});
test('targets: defaults and math', () => {
  const v = variance(V, actualsOf(V, RV)); const p = proposals(v.rows, V, RV);
  Object.keys(XV.targetDefault).forEach(cat => assert.equal(p.rows.find(r => r.key === cat).choice, XV.targetDefault[cat], cat));
  Object.keys(XV.middle).forEach(cat => assert.equal(p.rows.find(r => r.key === cat).value, XV.middle[cat], cat + ' middle'));
  const food = p.rows.find(r => r.key === 'food'); assert.equal(food.value, 45000); assert.equal(food.deltaMonthly, -20000); assert.equal(food.fiNumberDelta, -6000000);
  assert.equal(p.total.deltaMonthly, p.rows.reduce((s, r) => s + r.deltaMonthly, 0));
  setTarget(V, 'food', 'middle', 55000, { actualAt: 65000, now: NOW }); const p2 = proposals(v.rows, V, RV); assert.equal(p2.rows.find(r => r.key === 'food').value, 55000); assert.ok(p2.rows.find(r => r.key === 'food').saved);
  const pr = progress(V, RV, data.fields); assert.equal(pr.plannedMonthly, -10000); assert.ok(pr.counts.correction + pr.counts.move + pr.counts.paperwork > 0);
});
test('progress versus paperwork counts corrections, moves and guesses replaced since the last session', () => {
  const rec = buildMaya().rec; rec.sessions.push({ id: 's1', label: 'Session 1', at: '2026-10-08T00:00:00.000Z' });
  const rent = guessRows(rec).find(r => r.f.category.v === 'accommodation'); setField(rec, rent.id, 'amount', 300000, 'known', 'client', { now: '2026-10-09T00:00:00.000Z' });
  const job = rec.planets.income.rows.find(r => r.type === 'w2'); setField(rec, job.id, 'grossPay', job.f.grossPay.v, 'known', 'client', { now: '2026-10-09T00:00:00.000Z', cad: 'year' }); setField(rec, job.id, 'grossPay', 7200000, 'known', 'client', { now: '2026-10-09T00:00:01.000Z', cad: 'year' });
  const pr = progress(rec, compute(rec, data, { today: TODAY }), data.fields);
  assert.equal(pr.counts.guessReplaced, 1); assert.equal(pr.counts.paperwork, 1); assert.equal(pr.counts.move, 1);
});
test('the discovery summary and the Session 1 agenda', () => {
  const s = discoverySummary(maya, R, data);
  assert.equal(s.snapshot.tier.tier, 'HCOL'); assert.equal(s.snapshot.tierWord, 'high cost area'); assert.equal(s.snapshot.household.roommates.length, 1);
  assert.ok(s.numbers.some(n => n.said === 'not given') && s.numbers.some(n => n.said === 'Guess') && s.numbers.some(n => n.said === 'will send'));
  assert.equal(s.goals.length, 6); assert.equal(s.howToRun.mode, 'gentle'); assert.ok(s.howToRun.openQuestions.length === 1);
  assert.equal(s.firstDraft.guesses, X.guessRows); assert.ok(s.firstDraft.fiNumber > 0 && s.firstDraft.cushion === X.ruleOf5Target); assert.equal(s.roommate.bridge, X.bridge2);
  const a = session1Agenda(maya, R, data); assert.ok(a[0].step.indexOf('Confirm') === 0 && a.some(x => /Credit card/.test(x.step)) && a.some(x => /rent/i.test(x.step)) && a[a.length - 1].step.indexOf('Homework') === 0);
});
test('gentle mode switches both ways and follows the mindset', () => {
  const rec = createRecord({ id: 'g' }); applyDiscovery(rec, { snapshot: { name: 'Al', city: 'Austin' }, mindset: { avoidsAccounts: false, struggles: ['overspending'] } }, data, { now: NOW, today: TODAY }); assert.equal(rec.sessionMode, 'standard');
  const rec2 = createRecord({ id: 'g2' }); applyDiscovery(rec2, { snapshot: { name: 'Bo', city: 'Austin' }, mindset: { avoidsAccounts: false, struggles: ['avoiding'] } }, data, { now: NOW, today: TODAY }); assert.equal(rec2.sessionMode, 'gentle');
  rec2.sessionMode = 'standard'; assert.equal(compute(rec2, data, { today: TODAY }).sessionMode, 'standard');
});

/* ---- partners (MR-050) ---- */
function couple(basis) {
  const rec = createRecord({ id: 'couple', now: NOW });
  const set = (rowId, fid, v, state, cad) => setField(rec, rowId, fid, v, state || 'known', 'client', { now: NOW, cad });
  set('sun', 'birthDate', '1995-05-05'); set('sun', 'workSituation', 'employed'); set('sun', 'filingStatus', 'mfj');
  const me = createRow('income', 'w2', { nickname: 'My job', f: freshFacts(data.fields, 'income', 'w2') }); addRow(rec, me, { now: NOW }); set(me.id, 'takeHome', 400000, 'known', 'month');
  const them = createRow('income', 'w2', { nickname: "Sam's job", f: freshFacts(data.fields, 'income', 'w2') }); addRow(rec, them, { now: NOW }); set(them.id, 'whose', 'partner'); set(them.id, 'takeHome', 300000, 'known', 'month');
  const rent = createRow('spending', 'line', { nickname: 'Rent', f: freshFacts(data.fields, 'spending', 'line') }); addRow(rec, rent, { now: NOW }); set(rent.id, 'category', 'accommodation'); set(rent.id, 'amount', 300000, 'known', 'month'); set(rent.id, 'shared', true);
  setHousehold(rec, { roommates: [], lease: 'both', partner: { nickname: 'Sam' }, basis }, { now: NOW });
  return rec;
}
test('a partner counts together by default: both incomes, the full shared bill; just mine counts one income and half', () => {
  const R = compute(couple('together'), data, { today: TODAY }); const S = R.sun.outputs;
  assert.equal(S.income.takeHomeMonthly.cents, 700000); assert.equal(S.income.partnerTakeHomeMonthly.cents, 300000);
  assert.equal(S.spending.baselineMonthly.cents, 300000); assert.equal(S.spending.sharedShareMonthly.cents, 300000);
  assert.ok(!S.safety.roommateGap || S.safety.roommateGap.cents === 0, 'a partner is not a roommate gap');
  const R2 = compute(couple('mine'), data, { today: TODAY }); const S2 = R2.sun.outputs;
  assert.equal(S2.income.takeHomeMonthly.cents, 400000); assert.equal(S2.income.partnerTakeHomeMonthly.cents, 300000, 'their pay is still published');
  assert.equal(S2.spending.baselineMonthly.cents, 150000);
});
test('a partner and a roommate: together counts two thirds of a shared bill; people counts everyone', () => {
  const hh = { roommates: [{ id: 'rm1', nickname: 'Dani' }], partner: { nickname: 'Sam' }, basis: 'together' };
  assert.equal(peopleOf(hh), 3); assert.equal(shareOf(hh, null), 0.6667);
  assert.equal(shareOf(Object.assign({}, hh, { basis: 'mine' }), null), 0.3333); assert.equal(shareOf(Object.assign({}, hh, { basis: 'mine' }), 0.4), 0.4);
});
test('the discovery form with a partner builds the partner income row and the household', () => {
  const rec = createRecord({ id: 'disc-couple', now: NOW });
  const form = JSON.parse(JSON.stringify(MAYA_DISCOVERY)); form.snapshot.partner = true; form.snapshot.partnerName = 'Sam'; form.snapshot.roommates = 0; form.money.partnerTakeHome = '2000 every two weeks';
  applyDiscovery(rec, form, data, { now: NOW, today: TODAY, session: 'discovery' });
  assert.deepEqual(rec.household.partner, { nickname: 'Sam' }); assert.equal(rec.household.basis, 'together');
  const prow = rec.planets.income.rows.find(r => r.f.whose && r.f.whose.v === 'partner'); assert.ok(prow); assert.equal(prow.nickname, "Sam's job");
  const R = compute(rec, data, { today: TODAY });
  assert.equal(R.sun.outputs.income.partnerTakeHomeMonthly.cents, Math.round(200000 * 26 / 12));
  assert.equal(R.sun.outputs.income.takeHomeMonthly.cents, 411667 + Math.round(200000 * 26 / 12));
  const food = guessRows(rec).filter(r => r.f.category.v === 'food'); assert.ok(food.length, 'guesses still fill the gaps');
  const solo = buildMaya().rec; const soloFood = guessRows(solo).filter(r => r.f.category.v === 'food').reduce((s, r) => s + r.f.amount.v, 0);
  assert.ok(food.reduce((s, r) => s + r.f.amount.v, 0) > soloFood, 'a partner counted together is one more mouth');
});
test('a saved target is a to-do for next session; keep it as is takes it off', () => {
  const rec = buildMaya().rec;
  setTarget(rec, 'food', 'middle', 60000, { now: NOW, actualAt: 79100, label: 'Food', owner: 'Maya' });
  let todos = rec.sun.onepager.todos.filter(t => t.target); assert.equal(todos.length, 1); assert.equal(todos[0].task, 'Aim for $600 a month on food (now $791)'); assert.equal(todos[0].owner, 'Maya');
  setTarget(rec, 'food', 'gut', 50000, { now: NOW, actualAt: 79100, label: 'Food', owner: 'Maya' });
  todos = rec.sun.onepager.todos.filter(t => t.target); assert.equal(todos.length, 1, 'one to-do per area'); assert.equal(todos[0].task, 'Aim for $500 a month on food (now $791)');
  setTarget(rec, 'food', 'keep', 79100, { now: NOW, actualAt: 79100, label: 'Food' });
  assert.equal(rec.sun.onepager.todos.filter(t => t.target).length, 0);
});
