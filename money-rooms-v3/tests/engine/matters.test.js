/* What matters (MR-098 to MR-107): three synthetic households against hand-computed numbers.
   A: single, 20s, lots of untagged spending, top priorities cheap.
   B: a couple with diverging lists and a location conflict.
   C: an entrepreneurship block with a scenario list. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { createRecord, createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import * as Mt from '../../engine/matters.js';
import { stateOf, unlocksBetween, targetFor } from '../../engine/unlocks.js';
import { adjustments, newBlock, compare } from '../../engine/scenarios.js';
import { prioritySankey, priorityBars, priorityQuadrant, priorityMap } from '../../engine/chartdata-matters.js';
import { loadData } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-12';
const run = rec => compute(rec, data, { today: TODAY });
function job(rec, gross, take, hours) { const r = createRow('income', 'w2', { nickname: 'Job', f: freshFacts(data.fields, 'income', 'w2') }); addRow(rec, r, { session: null }); setField(rec, r.id, 'grossPay', gross, 'known', 'client', { cad: 'month' }); setField(rec, r.id, 'takeHome', take, 'known', 'client', { cad: 'month' }); setField(rec, r.id, 'hoursPaid', hours, 'known', 'client'); setField(rec, r.id, 'pretaxRetirement', 50000, 'known', 'client', { cad: 'month' }); return r; }
function line(rec, name, cat, cents, extra) { const r = createRow('spending', 'line', { nickname: name, f: freshFacts(data.fields, 'spending', 'line') }); addRow(rec, r, { session: null }); setField(rec, r.id, 'category', cat, 'known', 'client'); setField(rec, r.id, 'amount', cents, 'known', 'client', { cad: 'month' }); if (extra && extra.shared) { setField(rec, r.id, 'shared', true, 'known', 'client'); setField(rec, r.id, 'myShare', extra.myShare, 'known', 'client'); } return r; }
function balances(rec) { const b = createRow('invest', 'bank', { nickname: 'Checking', f: freshFacts(data.fields, 'invest', 'bank') }); addRow(rec, b, { session: null }); setField(rec, b.id, 'bankType', 'checking', 'known', 'client'); setField(rec, b.id, 'accountBalance', 500000, 'known', 'client'); const a = createRow('invest', 'account', { nickname: '401k', f: freshFacts(data.fields, 'invest', 'account') }); addRow(rec, a, { session: null }); setField(rec, a.id, 'accountType', '401k', 'known', 'client'); setField(rec, a.id, 'accountBalance', 2000000, 'known', 'client'); }
function debtNone(rec) { const d = createRow('debt', 'summary', { nickname: 'Debts', f: freshFacts(data.fields, 'debt', 'summary') }); addRow(rec, d, { session: null }); setField(rec, d.id, 'debtSummaryTotal', 0, 'known', 'client'); }
function sun(rec, facts) { Object.keys(facts).forEach(k => setField(rec, 'sun', k, facts[k], 'known', 'client')); }
const M = rec => Mt.mattersOf(rec); const change = (rec, fn) => Mt.changeMatters(rec, fn, { session: null });

/* ---- household A ---- */
function householdA() {
  const rec = createRecord(); sun(rec, { birthDate: '1999-07-01', state: 'TX', filingStatus: 'single', workSituation: 'employed' });
  job(rec, 500000, 380000, 40); balances(rec); debtNone(rec);
  const L = {};
  L.rent = line(rec, 'Rent', 'accommodation', 150000); L.groceries = line(rec, 'Groceries', 'food', 50000); L.restaurants = line(rec, 'Restaurants', 'food', 40000);
  L.subs = line(rec, 'Subscriptions', 'utilities', 15000); L.gym = line(rec, 'Gym', 'therapy', 5000); L.travel = line(rec, 'Travel fund', 'irregular', 20000); L.shopping = line(rec, 'Shopping', 'wants', 30000);
  let ids = {};
  change(rec, Mx => { const made = Mt.addPriorities(Mx, 'mine', ['Time with friends', 'Travel', 'Fitness', 'Learning guitar', 'A dog'], 'positive'); made.forEach(p => { ids[p.title] = p.id; }); const neg = Mt.addPriorities(Mx, 'mine', ['Subscriptions I never use'], 'negative'); ids.subs = neg[0].id; });
  change(rec, Mx => {
    Mt.updatePriority(Mx, 'mine', ids['Time with friends'], { cost: { monthly: Mt.amount(10000) }, hoursPerWeek: Mt.amount(6) });
    Mt.updatePriority(Mx, 'mine', ids.Travel, { cost: { monthly: Mt.amount(25000, 'rough') } });
    Mt.updatePriority(Mx, 'mine', ids.Fitness, { cost: { monthly: Mt.amount(5000) } });
    Mt.updatePriority(Mx, 'mine', ids['Learning guitar'], { cost: { monthly: Mt.amount(3000) } });
    Mt.updatePriority(Mx, 'mine', ids['A dog'], { cost: { monthly: Mt.amount(8000) }, valueSource: 'social media' });
    Mt.updatePriority(Mx, 'mine', ids.subs, { problemCost: { monthly: Mt.amount(6000) }, fixCost: { oneTime: Mt.amount(2000) } });
  });
  return { rec, L, ids };
}

test('A: the section is journaled whole, the tags split and clamp, and a priority with no price still counts', () => {
  const { rec, L, ids } = householdA(); const n0 = rec.journal.length;
  const l = change(rec, Mx => { Mt.setTag(Mx, 'category', 'irregular', ids.Travel, 100); Mt.setTag(Mx, 'line', L.restaurants.id, ids['Time with friends'], 50); Mt.setTag(Mx, 'category', 'therapy', ids.Fitness, 100); });
  assert.equal(l.kind, 'section'); assert.equal(rec.journal.length, n0 + 1); assert.equal(rec.matters.tags.length, 3);
  /* a second tag on the same source clamps to what is left */
  change(rec, Mx => { Mt.setTag(Mx, 'line', L.restaurants.id, ids.Travel, 60); });
  const onLine = Mt.tagsOn(M(rec), 'line', L.restaurants.id); assert.deepEqual(onLine.map(t => t.pct), [50, 50]); assert.equal(onLine.reduce((s, t) => s + t.pct, 0), 100);
  change(rec, Mx => { Mt.setTag(Mx, 'line', L.restaurants.id, ids.Travel, null); }); assert.equal(Mt.tagsOn(M(rec), 'line', L.restaurants.id).length, 1);
  assert.equal(change(rec, Mx => { Mt.setTag(Mx, 'category', 'irregular', ids.Travel, 100); }), null, 'the same tags again are no change');
  assert.equal(Mt.declaredMonthly(Mt.priorityOf(M(rec), 'mine', ids.subs)), null, 'a negative has no cost to fund');
});

test('A: the numbers by hand: tied, untied, alignment, spend ranks, hours of work, FI months, cheap wins, the payback on the problem', () => {
  const { rec, L, ids } = householdA();
  change(rec, Mx => { Mt.setTag(Mx, 'category', 'irregular', ids.Travel, 100); Mt.setTag(Mx, 'line', L.restaurants.id, ids['Time with friends'], 50); Mt.setTag(Mx, 'category', 'therapy', ids.Fitness, 100); });
  const R = run(rec); const W = R.matters; const by = id => W.priorities.find(p => p.id === id);
  assert.equal(W.spendTotal, 310000, 'seven lines a month');
  assert.equal(by(ids.Travel).tied.cents, 20000, 'all of irregular'); assert.equal(by(ids['Time with friends']).tied.cents, 20000, 'half of the restaurants line'); assert.equal(by(ids.Fitness).tied.cents, 5000);
  assert.equal(W.tied.sum, 45000); assert.equal(W.untied.cents, 265000); assert.ok(Math.abs(W.untied.share - 265000 / 310000) < 1e-9);
  assert.ok(Math.abs(W.alignment.top5 - 45000 / 310000) < 1e-9); assert.equal(W.alignment.top10, W.alignment.top5);
  assert.ok(Math.abs(by(ids.Travel).tied.shareTake - 20000 / 380000) < 1e-9); assert.ok(Math.abs(by(ids.Travel).tied.shareSpend - 20000 / 310000) < 1e-9);
  /* spend ranks: friends and travel tie at 20,000, the higher priority rank wins the tie; fitness third; the rest unranked */
  assert.equal(by(ids['Time with friends']).spendRank, 1); assert.equal(by(ids.Travel).spendRank, 2); assert.equal(by(ids.Fitness).spendRank, 3); assert.equal(by(ids['A dog']).spendRank, null);
  assert.equal(by(ids.Travel).rankGap, 0); assert.equal(by(ids['A dog']).rankGap, null);
  /* hours of work: the real hourly wage is take-home over paid hours a month (40 a week, no commute, no work costs) */
  const wage = R.metrics.realHourlyWage.value.cents; assert.ok(Math.abs(wage - Math.round(380000 / (40 * 52 / 12))) <= 2, 'wage ' + wage);
  assert.equal(by(ids.Travel).hours.perMonth, Math.round(20000 / wage * 10) / 10);
  /* the FI date: with the projection in place, removing a tied priority's spending for good pulls the date in */
  assert.ok(R.projectionInputs, 'the projection runs'); assert.ok(by(ids.Travel).fi.deltaMonths > 0, 'months gained: ' + by(ids.Travel).fi.deltaMonths);
  assert.deepEqual(by(ids['A dog']).fi, { deltaMonths: null, needs: ['spending tagged to this priority'] });
  /* cheap wins: top five, priced at 5% of take-home or less (19,000), getting less than the price; the dog's gap is larger than the guitar's */
  assert.deepEqual(W.cheapWins.map(w => [w.title, w.gap]), [['A dog', 8000], ['Learning guitar', 3000]]);
  assert.deepEqual(W.expensiveLowRanks, []);
  /* the cost of the top ten: 10,000 + 25,000 + 5,000 + 3,000 + 8,000 */
  assert.equal(W.top10Cost.declared, 51000); assert.equal(W.top10Cost.missing, 0); assert.ok(Math.abs(W.top10Cost.share - 51000 / 310000) < 1e-9);
  /* the problem: costs 6,000 a month, 2,000 to fix once, pays back in a third of a month */
  const neg = by(ids.subs); assert.equal(neg.negative.problemMonthly, 6000); assert.equal(neg.negative.paybackMonths, 0.3); assert.deepEqual(neg.negative.needs, []);
  /* time: six hours claimed; a week less 56 of sleep and the room's 40 of work leaves 72 */
  assert.equal(W.time.claimed, 6); assert.equal(W.time.available, 72); assert.equal(W.time.left, 66); assert.equal(W.time.unknownHours, 5); assert.equal(W.time.parts.source.work, 'income room');
  /* the registry mirrors */
  assert.equal(R.metrics.alignmentTop5.status, 'ok'); assert.equal(R.metrics.alignmentTop5.value.value, W.alignment.top5); assert.ok(R.metrics.alignmentTop5.rough, 'a rough price marks it rough');
  assert.equal(R.metrics.untiedSpending.value.cents, 265000); assert.equal(R.metrics.untiedShare.value.value, W.untied.share);
  /* the money conflict does not fire: 51,000 of costs against a 70,000 surplus */
  assert.equal(R.metrics.surplus.value.cents, 70000); assert.ok(!W.conflicts.flagged.some(c => c.kind === 'money'));
});

test('A: the metrics open only when their inputs exist, and the unlock loop names the input and where it lives', () => {
  const { rec, L, ids } = householdA();
  const rec0 = createRecord(); sun(rec0, { birthDate: '1999-07-01', state: 'TX', filingStatus: 'single' }); job(rec0, 500000, 380000, 40); balances(rec0); debtNone(rec0); line(rec0, 'Rent', 'accommodation', 150000);
  const R0 = run(rec0); const W0 = R0.matters;
  assert.deepEqual(W0.alignment.needs, ['ranked priorities', 'spending tagged to a priority']); assert.equal(R0.metrics.alignmentTop5.status, 'needs'); assert.equal(R0.metrics.untiedSpending.status, 'needs');
  assert.deepEqual(W0.unlocks.find(u => u.id === 'time').needs, ['a priority']);
  const t = targetFor('ranked priorities', rec0, data); assert.equal(t.href, '#/matters/list'); assert.equal(t.where, 'What matters');
  const before = stateOf(R0, data); assert.equal(before.metrics.alignmentTop5, 'locked'); assert.equal(before.charts.prioritySankey, 'locked');
  /* priorities ranked but nothing tagged: still locked, now needs the tags only */
  const R1 = run(rec); assert.deepEqual(R1.matters.alignment.needs, ['spending tagged to a priority']); assert.deepEqual(R1.matters.unlocks.find(u => u.id === 'top10').needs, []);
  assert.equal(targetFor('spending tagged to a priority', rec, data).label, 'Spending tied to a priority');
  change(rec, Mx => { Mt.setTag(Mx, 'category', 'irregular', ids.Travel, 100); });
  const R2 = run(rec); const after = stateOf(R2, data);
  assert.equal(after.metrics.alignmentTop5, 'rough'); assert.equal(after.charts.prioritySankey, 'rough'); assert.equal(after.charts.priorityBars, 'rough');
  const moved = unlocksBetween(before, after, R2, data); assert.ok(moved.metrics.some(m => m.id === 'untiedSpending') && moved.charts.some(c => c.id === 'prioritySankey'), 'the loop says what opened');
  /* every field "doesn't know": nothing breaks, the figures say what they need */
  change(rec, Mx => { Mt.prioritiesOf(Mx, 'mine').forEach(p => Mt.updatePriority(Mx, 'mine', p.id, { cost: { monthly: Mt.amount(null), annual: Mt.amount(null), oneTime: Mt.amount(null) }, hoursPerWeek: Mt.amount(null), problemCost: { monthly: Mt.amount(null) }, fixCost: { oneTime: Mt.amount(null) } })); });
  const R3 = run(rec); const W3 = R3.matters;
  assert.deepEqual(W3.top10Cost.needs, ['a cost on a priority']); assert.deepEqual(W3.time.needs, ['hours a week on a priority']); assert.deepEqual(W3.cheapWins, []);
  assert.deepEqual(W3.negatives[0].negative.needs, ['what the problem costs a month', 'what fixing it costs']); assert.equal(W3.negatives[0].negative.paybackMonths, null);
  assert.equal(W3.alignment.top5, 20000 / 310000, 'alignment comes from the tags, not the prices'); assert.deepEqual(W3.conflicts.needs.money, ['a cost on a priority']);
  const L2 = L; assert.ok(L2.rent);
});

test('A: the four pictures build from the report and say what they need before it', () => {
  const { rec, L, ids } = householdA();
  const R1 = run(rec); assert.deepEqual(prioritySankey(R1, {}).needs, ['spending tagged to a priority']); assert.ok(priorityMap(R1, {}).nodes.length === 6);
  change(rec, Mx => { Mt.setTag(Mx, 'category', 'irregular', ids.Travel, 100); Mt.setTag(Mx, 'line', L.restaurants.id, ids['Time with friends'], 50); Mt.addConnection(Mx, ids.Travel, ids['A dog'], 'conflicts', { conflictKind: 'energy' }); Mt.addConnection(Mx, ids.Fitness, ids['Time with friends'], 'supports'); });
  const R = run(rec);
  const s = prioritySankey(R, {}); const untied = s.links.filter(l => s.nodes[l.target].name === Mt.UNTIED).reduce((a, l) => a + l.value, 0); assert.equal(untied, 270000, 'the untied stream is visible and whole: 310,000 less the 40,000 tied'); assert.equal(s.links.reduce((a, l) => a + l.value, 0), 310000, 'every dollar is in the picture');
  const b = priorityBars(R, {}); assert.equal(b.rows.length, 5); assert.equal(b.rows.find(r => r.id === ids.Travel).spendRank, 2);
  const q = priorityQuadrant(R, {}); assert.ok(q.points.find(p => p.id === ids['A dog']).cheapWin); assert.equal(q.scaleLabel, 'of take-home');
  const m = priorityMap(R, {}); assert.equal(m.links.length, 2); assert.ok(m.links.some(l => l.conflict && l.kind === 'energy'));
});

/* ---- household B ---- */
function householdB() {
  const rec = createRecord(); sun(rec, { birthDate: '1990-07-01', state: 'CO', filingStatus: 'mfj', workSituation: 'employed' });
  job(rec, 700000, 520000, 40); balances(rec); debtNone(rec);
  const L = {};
  L.rent = line(rec, 'Rent', 'accommodation', 200000, { shared: true, myShare: 0.5 }); L.ski = line(rec, 'Ski trips', 'irregular', 30000); L.beach = line(rec, 'Beach weeks', 'irregular', 40000); L.groceries = line(rec, 'Groceries', 'food', 60000); L.dog = line(rec, 'Dog food and vet', 'wants', 10000);
  const ids = {}; const pids = {};
  change(rec, Mx => {
    Mt.addPriorities(Mx, 'mine', ['Beach house someday', 'Ski trips every winter', 'Big garden', 'Travel a lot', 'A dog'], 'positive').forEach(p => { ids[p.title] = p.id; });
    const partner = Mt.addList(Mx, 'partner', 'Sam'); ids.partnerList = partner.id;
    Mt.addPriorities(Mx, partner.id, ['Ski trips every winter', 'A dog', 'Beach house someday', 'Big garden', 'Travel a lot'], 'positive').forEach(p => { pids[p.title] = p.id; });
    Mt.updatePriority(Mx, 'mine', ids['Beach house someday'], { cost: { monthly: Mt.amount(300000) } }); Mt.updatePriority(Mx, 'mine', ids['Ski trips every winter'], { cost: { monthly: Mt.amount(30000) }, hoursPerWeek: Mt.amount(4) });
    Mt.setTag(Mx, 'line', L.rent.id, ids['Beach house someday'], 100); Mt.setTag(Mx, 'line', L.ski.id, ids['Ski trips every winter'], 100); Mt.setTag(Mx, 'line', L.beach.id, ids['Beach house someday'], 100); Mt.setTag(Mx, 'category', 'wants', ids['A dog'], 100);
  });
  return { rec, L, ids, pids };
}

test('B: the library suggests the location and energy conflicts, the numbers flag the money, the client confirms one and sequences it into a life block', () => {
  const { rec, ids } = householdB(); const R = run(rec); const W = R.matters; const C = W.conflicts;
  const keys = C.suggested.map(s => [s.aTitle, s.bTitle].sort().join('|') + '|' + s.kind);
  assert.ok(keys.includes('Beach house someday|Ski trips every winter|location'), keys.join('; ')); assert.ok(keys.includes('A dog|Travel a lot|energy')); assert.ok(keys.includes('Big garden|Travel a lot|energy'));
  assert.equal(C.declared.length, 0);
  /* money: a shared rent counts at half; spending is 100,000 + 30,000 + 40,000 + 60,000 + 10,000 = 240,000; the surplus 280,000; the beach house alone at 300,000 is over, and ski after it */
  assert.equal(W.spendTotal, 240000); assert.equal(R.metrics.surplus.value.cents, 280000);
  const money = C.flagged.find(c => c.kind === 'money'); assert.ok(money); assert.deepEqual(money.titles, ['Beach house someday', 'Ski trips every winter']); assert.equal(money.over, 50000); assert.equal(money.total, 330000);
  assert.ok(!C.flagged.some(c => c.kind === 'time'), 'four hours a week fit');
  /* confirm the suggestion: it becomes a declared conflict with the app's origin and leaves the suggestions */
  const s = C.suggested.find(x => x.kind === 'location'); const nSuggested = C.suggested.length;
  change(rec, Mx => { Mt.confirmSuggestion(Mx, s); });
  const R2 = run(rec); const C2 = R2.matters.conflicts;
  assert.equal(C2.declared.length, 1); assert.equal(C2.declared[0].origin, 'app suggested, client confirmed'); assert.equal(C2.declared[0].kind, 'location'); assert.equal(C2.suggested.length, nSuggested - 1);
  /* dismiss another: it stays out */
  change(rec, Mx => { Mt.dismissSuggestion(Mx, C2.suggested[0]); }); assert.equal(run(rec).matters.conflicts.suggested.length, nSuggested - 2);
  /* sequence: ski now, the beach house from 2034; the resolution is stored on the conflict's key */
  const key = Mt.conflictKey(ids['Beach house someday'], ids['Ski trips every winter']);
  change(rec, Mx => { Mt.resolveConflict(Mx, key, { choice: 'sequence', firstId: ids['Ski trips every winter'], laterYear: 2034 }); });
  const d = run(rec).matters.conflicts.declared[0]; assert.equal(d.resolution.choice, 'sequence'); assert.equal(d.resolution.laterYear, 2034);
  /* the life block a sequence becomes: the later priority's cost from its year, folded into the simulator like any block */
  const defs = data.scenarioBlocks; const b = newBlock('priority', defs, 2034); b.answers.oneOff = 0; b.answers.monthly = 300000; b.answers.years = 10;
  const adj = adjustments([b], defs, {}); assert.equal(adj[2034].monthly, 300000); assert.equal(adj[2043].monthly, 300000); assert.equal(adj[2044], undefined);
  change(rec, Mx => { Mt.resolveConflict(Mx, key, Object.assign({}, d.resolution, { blockId: b.id })); }); assert.equal(run(rec).matters.conflicts.declared[0].resolution.blockId, b.id);
});

test('B: two lists side by side: agree, close, only on one side, and the shared priorities funded by joint money', () => {
  const { rec, ids, pids } = householdB(); const R = run(rec);
  const C = Mt.compareLists(M(rec), 'mine', ids.partnerList, R.matters);
  const row = t => C.rows.find(r => r.title === t);
  assert.deepEqual([row('Ski trips every winter').rankA, row('Ski trips every winter').rankB, row('Ski trips every winter').verdict], [2, 1, 'agree']);
  assert.deepEqual([row('Beach house someday').rankA, row('Beach house someday').rankB, row('Beach house someday').verdict], [1, 3, 'close']);
  assert.deepEqual([row('A dog').rankA, row('A dog').rankB, row('A dog').verdict], [5, 2, 'close']);
  assert.equal(C.agree, 3); assert.equal(C.disagree, 0); assert.equal(C.onlyA, 0); assert.equal(C.onlyB, 0);
  assert.deepEqual(C.sharedFunded.map(r => [r.title, r.fromShared]), [['Beach house someday', 100000]], 'half the rent is joint money on a priority both hold');
  change(rec, Mx => { Mt.addPriorities(Mx, ids.partnerList, ['Season tickets'], 'positive'); Mt.updatePriority(Mx, 'mine', ids['A dog'], { rank: 9 }); });
  const C2 = Mt.compareLists(M(rec), 'mine', ids.partnerList, run(rec).matters); assert.equal(C2.onlyB, 1); assert.equal(C2.rows.find(r => r.title === 'Season tickets').verdict, 'only B');
  assert.ok(pids['A dog']);
});

test('B: the move money preview: shares and hours on both sides, alignment, and the FI date only when money is saved; the spending rows never change', () => {
  const { rec, ids } = householdB(); const R = run(rec); const rows = JSON.stringify(rec.planets.spending.rows);
  const P = Mt.previewMove(rec, R, data, { fromId: ids['Beach house someday'], toId: ids['A dog'], cents: 50000 });
  assert.equal(P.amount, 50000); assert.equal(P.from.before.tied, 140000); assert.equal(P.from.after.tied, 90000); assert.equal(P.to.before.tied, 10000); assert.equal(P.to.after.tied, 60000);
  assert.ok(Math.abs(P.to.after.shareTake - 60000 / 520000) < 1e-9); assert.equal(P.fi.deltaMonths, 0); assert.ok(/leaves the FI date/.test(P.fi.note));
  assert.ok(Math.abs(P.alignment.before - 180000 / 240000) < 1e-9, 'beach 140,000 + ski 30,000 + dog 10,000 of 240,000'); assert.ok(Math.abs(P.alignment.after - 180000 / 240000) < 1e-9, 'moving within the top five keeps the score');
  const S = Mt.previewMove(rec, R, data, { fromId: ids['Beach house someday'], toId: 'saved', cents: 40000 });
  assert.ok(S.fi.deltaMonths > 0, 'saving 40,000 a month pulls the FI date in: ' + S.fi.deltaMonths); assert.ok(S.alignment.after < S.alignment.before);
  const U = Mt.previewMove(rec, R, data, { fromId: 'untied', toId: ids['Big garden'], cents: 999999 }); assert.equal(U.amount, 60000, 'capped at what is untied (the groceries)'); assert.ok(U.capped); assert.equal(U.untied.after, 0);
  change(rec, Mx => { Mt.saveMove(Mx, { fromId: ids['Beach house someday'], toId: 'saved', cents: 40000, fromTitle: 'Beach house someday', toTitle: 'Saved, not spent', at: TODAY }, 'planned'); Mt.saveMove(Mx, { fromId: 'untied', toId: ids['Big garden'], cents: 20000, fromTitle: Mt.UNTIED, toTitle: 'Big garden', at: TODAY, name: 'Garden money' }, 'scenario'); });
  const Mx = M(rec); assert.equal(Mx.moves.length, 2); assert.ok(Mx.lists.some(l => l.kind === 'scenario' && l.name === 'Garden money'));
  assert.equal(JSON.stringify(rec.planets.spending.rows), rows, 'no spending row changed'); assert.equal(run(rec).matters.untied.cents, 60000, 'the report ignores planned moves');
});

/* ---- household C ---- */
test('C: a business block carries a priority template; the re-rank becomes its scenario list, stored as overrides; the simulator uses the list\'s spending change', () => {
  const rec = createRecord(); sun(rec, { birthDate: '1994-07-01', state: 'WA', filingStatus: 'single', workSituation: 'employed' }); job(rec, 600000, 450000, 40); balances(rec); debtNone(rec);
  line(rec, 'Rent', 'accommodation', 140000); const dinners = line(rec, 'Dinners out', 'food', 40000);
  let dinnersId = null;
  change(rec, Mx => { const made = Mt.addPriorities(Mx, 'mine', ['Dinners out with friends', 'Travel'], 'positive'); dinnersId = made[0].id; Mt.updatePriority(Mx, 'mine', dinnersId, { cost: { monthly: Mt.amount(20000) } }); Mt.setTag(Mx, 'line', dinners.id, dinnersId, 100); });
  const defs = data.scenarioBlocks; const def = defs.types.business; assert.ok(def && def.priorityTemplate.length === 2 && def.income);
  const b = newBlock('business', defs, 2028); rec.scenarios.push(b);
  let listId = null; change(rec, Mx => { listId = Mt.listForBlock(Mx, b, def).id; });
  const Mx = M(rec); const list = Mx.lists.find(l => l.id === listId); assert.equal(list.kind, 'scenario'); assert.equal(list.linkedBlockId, b.id); assert.equal(list.baseListId, 'mine');
  const ps = Mt.prioritiesOf(Mx, listId); assert.deepEqual(ps.map(p => p.title), ['Dinners out with friends', 'Travel', 'Business runway', 'Skills investment']); assert.ok(ps[0].inherited && !ps[2].inherited);
  assert.equal(Mt.listForBlock(M(rec), b, def).id, listId, 'made once');
  /* the re-rank: runway first, fewer dinners out; the base list stays as it was */
  change(rec, Mx2 => { const ids = Mt.prioritiesOf(Mx2, listId).map(p => p.id); Mt.reorder(Mx2, listId, [ids[2], ids[3], ids[0], ids[1]]); Mt.updatePriority(Mx2, listId, dinnersId, { cost: { monthly: Mt.amount(5000) } }); });
  const M2 = M(rec); assert.deepEqual(Mt.prioritiesOf(M2, listId).map(p => p.title), ['Business runway', 'Skills investment', 'Dinners out with friends', 'Travel']);
  assert.equal(Mt.prioritiesOf(M2, 'mine')[0].title, 'Dinners out with friends'); assert.equal(Mt.declaredMonthly(Mt.prioritiesOf(M2, 'mine')[0]), 20000, 'the base list keeps its price');
  assert.equal(Mt.declaredMonthly(Mt.priorityOf(M2, listId, dinnersId)), 5000); assert.deepEqual(Object.keys(M2.lists.find(l => l.id === listId).overrides).sort(), [dinnersId, Mt.prioritiesOf(M2, listId)[3].id].sort());
  /* the spending change: 50,000 + 15,000 + 5,000 against 20,000 = 50,000 more a month */
  assert.equal(Mt.scenarioSpendDelta(M2, listId), 50000);
  const R = run(rec); assert.equal(R.matters.blockDeltas[b.id], 50000);
  const live = { takeHomeMonthly: 450000, spendingMonthly: 180000, grossMonthly: 600000, priorityDeltas: R.matters.blockDeltas };
  const adj = adjustments([b], defs, live); assert.equal(adj[2028].monthly, 50000, 'the list\'s change rides on the block\'s years'); assert.equal(adj[2028].pay, 300000, 'the block\'s own pay drop stays a pay change'); assert.equal(adj[2029].monthly, 50000); assert.equal(adj[2030], undefined);
  const without = compare(R.projectionInputs, [b], defs, Object.assign({}, live, { priorityDeltas: {} })); const withList = compare(R.projectionInputs, [b], defs, live);
  assert.ok(withList.together.fiAge > without.together.fiAge && withList.together.at95 !== without.together.at95, 'the simulator spends the list\'s change, so the FI age moves: ' + withList.together.fiAge + ' against ' + without.together.fiAge);
  /* removing a base priority from the scenario list only hides it there */
  change(rec, Mx3 => { Mt.removePriority(Mx3, listId, dinnersId); }); assert.equal(Mt.prioritiesOf(M(rec), listId).length, 3); assert.equal(Mt.prioritiesOf(M(rec), 'mine').length, 2);
});

test('a future-self list stores overrides on the base, and removing a list takes its own priorities with it', () => {
  const rec = createRecord(); let fid = null; let ids = [];
  change(rec, Mx => { ids = Mt.addPriorities(Mx, 'mine', ['Career', 'Travel', 'Family time'], 'positive').map(p => p.id); fid = Mt.addList(Mx, 'future', null, { futureAge: 50 }).id; Mt.reorder(Mx, fid, [ids[2], ids[1], ids[0]]); Mt.addPriorities(Mx, fid, ['Health'], 'positive'); });
  const Mx = M(rec); const f = Mx.lists.find(l => l.id === fid); assert.equal(f.name, 'Future self'); assert.equal(f.futureAge, 50); assert.equal(f.baseListId, 'mine');
  assert.deepEqual(Mt.prioritiesOf(Mx, fid).map(p => p.title), ['Family time', 'Travel', 'Career', 'Health']); assert.deepEqual(Mt.prioritiesOf(Mx, 'mine').map(p => p.title), ['Career', 'Travel', 'Family time']);
  assert.equal(Mx.priorities.length, 4, 'overrides are not copies'); assert.deepEqual(Object.keys(f.overrides).length, 3);
  change(rec, Mx2 => { Mt.removeList(Mx2, fid); }); assert.equal(M(rec).priorities.length, 3); assert.equal(M(rec).lists.length, 1);
  assert.equal(M(rec).lists[0].id, 'mine'); assert.equal(change(rec, Mx3 => { Mt.removeList(Mx3, 'mine'); return null; }), null);
});
