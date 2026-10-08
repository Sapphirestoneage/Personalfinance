/* Momentum (Level 12, MR-063): snapshots, trends, why a number moved (learned, did, market, time), milestones
   crossed once, personal bests and the next action. The lever households tie out to
   tests/households/expected-momentum.py; Maya runs through session 4 via the engine API. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compute } from '../../engine/compute.js';
import { setField } from '../../engine/record.js';
import * as Mo from '../../engine/momentum.js';
import { sensitivity } from '../../engine/sensitivity.js';
import { loadData, loadHousehold } from './load-data.js';
import { LEVER_SPECS } from '../households/levers-specs.mjs';
import { buildLevers } from '../households/build-levers.mjs';
import { mayaThroughSession4, TODAY4 } from '../households/maya-session4.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = loadData(); const E = JSON.parse(fs.readFileSync(path.join(here, '..', 'households', 'momentum-expected.json'), 'utf8'));
const run = (r, today) => compute(r, data, { today, light: true });
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, what + ': engine ' + a + ' vs workpaper ' + b);

for (const name of Object.keys(LEVER_SPECS)) {
  const X = E[name];
  test(name + ': a down market month splits into what was done and what the market did; the savings rate holds', () => {
    const rec = buildLevers(LEVER_SPECS[name], 'mo-' + name, data, { now: X.snapAt });
    const R0 = run(rec, X.snapAt.slice(0, 10));
    close(Mo.numOf(R0.metrics.savingsRateTakeHome), X.savingsRate, 1e-6, 'savings rate'); assert.equal(Mo.numOf(R0.metrics.netWorth), X.netWorthBefore);
    const snap = Mo.takeSnapshot(rec, R0, 'session', { now: X.snapAt, session: 's1' });
    assert.equal(snap.values.netWorth, X.netWorthBefore); assert.equal(rec.journal[rec.journal.length - 1].kind, 'snapshot');
    setField(rec, rec.brokerageId, 'accountBalance', LEVER_SPECS[name].invested - (X.netWorthBefore - X.netWorthAfter), 'known', 'client', { now: X.moveAt, why: 'move' });
    const R1 = run(rec, X.moveAt.slice(0, 10));
    const w = Mo.whyMoved(rec, R1, data, 'netWorth', { compute: run });
    assert.equal(w.total, X.netWorthDelta); assert.equal(w.verdict, 'worse');
    close(w.parts.did, X.did, 1, 'did'); close(w.parts.market, X.market, 1, 'market'); assert.equal(w.parts.learned, 0); assert.equal(w.parts.time, 0); close(w.parts.other, 0, 1, 'other');
    assert.ok(w.sentences.some(s => /What you did: up/.test(s)) && w.sentences.some(s => /The market: down/.test(s)), w.sentences.join(' | '));
    assert.ok(w.marketNote, 'the market note reassures');
    /* the FI date slipped, but what she did pulled it the right way */
    const f = Mo.whyMoved(rec, R1, data, 'fiDate', { compute: run });
    /* the date is read to the month; a month of contributions dwarfs the drop, so the slip is small and can round to none; the market never pulls it sooner, what she did never pulls it later */
    assert.ok(f.total >= 0, 'FI date not sooner: ' + f.total); assert.ok(f.parts.did <= 0 && f.parts.market >= 0 && f.parts.market >= f.parts.did, JSON.stringify(f.parts));
    assert.equal(Mo.betterness(data.metrics.metrics.find(m => m.id === 'fiDate'), f.parts.did), f.parts.did ? 'better' : 'same');
    /* the savings rate did not move; the trend says so */
    const t = Mo.trend(rec, R1, data, 'savingsRateTakeHome'); assert.equal(t.sinceLast.delta, 0); assert.equal(t.sinceLast.arrow, 'flat');
    const ms = Mo.milestone(rec, R1, data, 'savingsRateTakeHome'); assert.equal(ms.current, X.ladderSavingsRateRung); assert.equal(ms.next, X.nextSavingsRateRung);
  });
}

test('a correction is learned, a move is did, and time passing is its own part', () => {
  const rec = buildLevers(LEVER_SPECS.starter, 'mo-time', data, { now: '2026-10-01T00:00:00.000Z' });
  const R0 = run(rec, '2026-10-01'); Mo.takeSnapshot(rec, R0, 'session', { now: '2026-10-01T00:00:00.000Z', session: 's1' });
  const groc = rec.planets.spending.rows.find(r => r.nickname === 'Groceries');
  setField(rec, groc.id, 'amount', 60000, 'rough', 'client', { now: '2026-10-01T00:00:01.000Z', cad: 'month' }); /* the snapshot saw a rough figure */
  const R0b = run(rec, '2026-10-01'); rec.snapshots = []; Mo.takeSnapshot(rec, R0b, 'session', { now: '2026-10-01T00:00:02.000Z', session: 's1' });
  setField(rec, groc.id, 'amount', 70000, 'verified', 'client', { now: '2026-10-20T00:00:00.000Z', cad: 'month' }); /* rough to verified with a new figure: a correction */
  assert.equal(rec.journal[rec.journal.length - 1].why, 'correction');
  const R1 = run(rec, '2026-10-20');
  const w = Mo.whyMoved(rec, R1, data, 'spending', { compute: run });
  assert.equal(w.total, 10000); assert.equal(w.parts.learned, 10000); assert.equal(w.parts.did, 0); assert.equal(w.parts.market, 0); assert.equal(w.parts.time, 0);
  /* time alone: nothing typed, the calendar moves a year, the FI date (a calendar date) holds while years-to-FI shrinks */
  const rec2 = buildLevers(LEVER_SPECS.starter, 'mo-time2', data, { now: '2026-10-01T00:00:00.000Z' });
  const Ra = run(rec2, '2026-10-01'); Mo.takeSnapshot(rec2, Ra, 'session', { now: '2026-10-01T00:00:00.000Z', session: 's1' });
  const Rb = run(rec2, '2027-10-01');
  const wt = Mo.whyMoved(rec2, Rb, data, 'fiDate', { compute: run });
  assert.equal(wt.parts.learned, 0); assert.equal(wt.parts.did, 0); assert.equal(wt.parts.market, 0); assert.equal(wt.total, wt.parts.time + wt.parts.other);
  assert.ok(wt.sentences.length >= 1);
});

test('a milestone is celebrated once; the first run seeds what is already passed', () => {
  const rec = buildLevers(LEVER_SPECS.mid, 'mo-cel', data, { now: '2026-10-01T00:00:00.000Z' });
  const R0 = run(rec, '2026-10-01');
  const seeded = Mo.seedCelebrations(rec, R0, data, { now: '2026-10-01T00:00:00.000Z' });
  assert.ok(seeded.length > 3 && seeded.every(c => c.seeded), 'already-passed rungs are seeded, not cheered');
  assert.deepEqual(Mo.celebrate(rec, R0, data, { now: '2026-10-01T00:00:01.000Z' }), [], 'nothing new to cheer');
  /* cash rises past six months of spending: one rung on runway, cheered once */
  const chk = rec.planets.invest.rows.find(r => r.nickname === 'Checking');
  setField(rec, chk.id, 'accountBalance', 550000 * 6 + 10000, 'known', 'client', { now: '2026-11-01T00:00:00.000Z', why: 'move' });
  const R1 = run(rec, '2026-11-01');
  const fresh = Mo.celebrate(rec, R1, data, { now: '2026-11-01T00:00:00.000Z' });
  assert.ok(fresh.some(c => c.metric === 'runway' && c.rung === 6), JSON.stringify(fresh.map(c => c.metric + ':' + c.rung)));
  assert.deepEqual(Mo.celebrate(rec, R1, data, { now: '2026-11-01T00:00:01.000Z' }), [], 'cheered once');
  assert.equal(rec.journal.filter(l => l.kind === 'celebration').length, 2);
  const ms = Mo.milestone(rec, R1, data, 'runway'); assert.equal(ms.current, 6); assert.equal(ms.next, 12); assert.ok(ms.dollars && ms.dollars.cents > 0 && ms.dollarsText);
});

test('personal bests, the headline six, bands with their sources, and the next action per metric', () => {
  const rec = buildLevers(LEVER_SPECS.starter, 'mo-best', data, { now: '2026-10-01T00:00:00.000Z' });
  const R0 = run(rec, '2026-10-01'); Mo.takeSnapshot(rec, R0, 'session', { now: '2026-10-01T00:00:00.000Z', session: 's1' });
  const ids = Mo.headlineIds(rec, R0, data); assert.equal(ids.length, 6); assert.ok(ids.includes('netWorth') && !ids.includes('debtFree'), 'no debt: net worth takes the debt-free tile');
  rec.scoreboard = { headline: ['takeHome', 'spending', 'surplus', 'savingsRateTakeHome', 'runway', 'netWorth'] }; assert.deepEqual(Mo.headlineIds(rec, R0, data)[0], 'takeHome'); rec.scoreboard = null;
  const bests = Mo.personalBests(rec, R0, data); assert.ok(bests.find(b => b.key === 'savingsRate') && bests.find(b => b.key === 'lowestSpending'));
  const def = data.metrics.metrics.find(m => m.id === 'savingsRateTakeHome');
  const band = Mo.bandOf(def, Mo.numOf(R0.metrics.savingsRateTakeHome)); assert.equal(band.zone, 'healthy'); assert.ok(band.source && band.verify && band.alternatives.length >= 1);
  assert.equal(Mo.bandOf(def, Mo.numOf(R0.metrics.savingsRateTakeHome), 'scottTrench').zone, 'ok', 'a stricter rule reads the same number as ok');
  const sens = sensitivity({ record: rec, data, today: '2026-10-01', maxRoots: 12 });
  const a = Mo.nextActionFor(def, sens, R0); assert.ok(a && a.text && a.sentence, JSON.stringify(a));
  const top = Mo.overallNextAction(sens); assert.ok(top && top.sentence && typeof top.months === 'number');
  assert.ok(a.months === null || a.months <= top.months + 1e-9, 'the overall action moves the date at least as much as any one metric\'s lever');
});

test('Maya through session 4: six tiles, milestones crossed, why her FI date moved, and what the market did is not hers', () => {
  const { rec, result: R, cheers, beforeClose } = mayaThroughSession4(loadHousehold('maya'), data);
  assert.equal(rec.snapshots.length, 4); assert.deepEqual(rec.snapshots.map(s => s.session), ['s1', 's2', 's3', 's4']);
  const ids = Mo.headlineIds(rec, R, data); assert.equal(ids.length, 6); assert.ok(ids.includes('debtFree'));
  ids.forEach(id => { const t = Mo.trend(rec, R, data, id); assert.ok(t && t.sinceLast, id + ' has a trend since last time'); });
  assert.ok(Mo.trend(rec, R, data, 'spending').sinceStart, 'spending was in from session 1');
  /* between the session 3 close and the session 4 close: the HYSA move is hers, the Roth fall is the market's */
  const w = Mo.whyMoved(beforeClose.rec, beforeClose.result, data, 'netWorth', { compute: run });
  assert.equal(w.total, 60000 - 120000); assert.ok(w.parts.did > 0 && w.parts.did >= 60000, 'the HYSA move counts for her: ' + JSON.stringify(w.parts)); assert.ok(w.parts.market < 0, 'the Roth drop is the market: ' + JSON.stringify(w.parts)); assert.ok(w.marketNote);
  assert.ok(Math.abs(w.parts.did + w.parts.market + w.parts.learned + w.parts.time + w.parts.other - w.total) < 1, 'parts add up');
  const f = Mo.whyMoved(beforeClose.rec, beforeClose.result, data, 'fiDate', { compute: run }); assert.ok(f && f.sentences.length, 'FI date explained');
  const learned = Mo.whyMoved(beforeClose.rec, beforeClose.result, data, 'spending', { compute: run }); assert.equal(learned.parts.learned, 0, 'session 3\'s correction is before the last snapshot');
  const after = Mo.whyMoved(rec, R, data, 'netWorth', { compute: run }); assert.equal(after.total, 0, 'nothing since the session 4 close');
  const bests = Mo.personalBests(rec, R, data); assert.ok(bests.find(b => b.key === 'payoff') && bests.find(b => b.key === 'payoff').value === '$400');
  assert.ok(Array.isArray(cheers));
  const sm = Mo.milestones(rec, R, data); assert.ok(sm.length > 10 && sm.every(m => m.ladder.length));
});
