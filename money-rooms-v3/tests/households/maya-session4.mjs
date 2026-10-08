/* Maya through session 4 (Level 12, MR-063), built from the maya fixture through the engine API:
   snapshots at the close of sessions 1 and 2 (rewound to those moments), then session 3 (a correction:
   restaurants confirmed; a move: the card paid down) and session 4 (a move: the HYSA up; the market:
   the Roth IRA down more than its contributions explain; satisfaction 4, 5, 6, 7 and worth-it scores in sessions 3 and 4; a stress score). The engine is never read for
   the inputs, only to take the snapshots. */
import { compute } from '../../engine/compute.js';
import { setField } from '../../engine/record.js';
import { takeSnapshot, rewind, celebrate, seedCelebrations } from '../../engine/momentum.js';
import { recordStress, recordSatisfaction, recordWorthIt } from '../../engine/program.js';

/* a close is timestamped after the session's edits, as in the app */
export const S3 = '2026-10-15T16:30:00.000Z'; export const S4 = '2026-11-12T16:30:00.000Z'; export const TODAY4 = '2026-11-12';

export function mayaThroughSession4(maya, data) {
  const rec = JSON.parse(JSON.stringify(maya));
  const sessions = rec.sessions || [];
  /* the two closes already in the fixture: snapshot what the engine said at each moment */
  rec.snapshots = [];
  sessions.forEach(s => { const then = rewind(rec, s.at); const R = compute(then, data, { today: s.at.slice(0, 10) }); const snap = takeSnapshot(rec, R, 'session', { now: s.at, session: s.id }); /* placed in time order below */ rec.journal = rec.journal.filter(l => !(l.kind === 'snapshot' && l.ts === s.at)); rec.snapshots[rec.snapshots.length - 1] = snap; });
  rec.snapshots.sort((a, b) => a.ts.localeCompare(b.ts));
  recordStress(rec, 'discovery', 7, { now: '2026-08-20T16:30:00.000Z' });
  /* satisfaction at every close: 4, 5, then 6 and 7 below; worth-it in sessions 3 and 4: food delivery is high spend and low value, travel is low spend and high value */
  recordSatisfaction(rec, 's1', 4, { now: '2026-09-10T15:07:00.000Z' }); recordSatisfaction(rec, 's2', 5, { now: '2026-09-17T16:24:00.000Z' });
  const R2 = compute(rec, data, { today: '2026-10-03' }); seedCelebrations(rec, R2, data, { now: '2026-10-03T16:10:00.000Z', session: 's2' });
  /* session 3: restaurants confirmed as a real number (a correction), the Sapphire paid down (a move) */
  const rest = rec.planets.spending.rows.find(r => r.nickname === 'Restaurants and takeout');
  setField(rec, rest.id, 'amount', 26000, 'verified', 'client', { now: '2026-10-15T16:20:00.000Z', session: 's3', cad: 'month' });
  const csp = rec.planets.debt.rows.find(r => r.id === 'm-csp');
  setField(rec, csp.id, 'balance', 24000, 'known', 'client', { now: '2026-10-15T16:25:00.000Z', session: 's3', why: 'move' });
  recordWorthIt(rec, 's3', { accommodation: 7, utilities: 5, food: 3, transportation: 6, therapy: 8, wants: 6, irregular: 9 }, { now: '2026-10-15T16:26:00.000Z', session: 's3' });
  recordSatisfaction(rec, 's3', 6, { now: '2026-10-15T16:28:00.000Z' });
  let R = compute(rec, data, { today: S3.slice(0, 10) }); const beforeClose3 = { rec: JSON.parse(JSON.stringify(rec)), result: R }; celebrate(rec, R, data, { now: S3, session: 's3' }); takeSnapshot(rec, R, 'session', { now: S3, session: 's3' });
  rec.sessions.push({ id: 's3', label: 'Session 3', at: S3, note: 'Restaurants confirmed; Sapphire paid down.' });
  /* session 4: the HYSA up by what she moved (did), the 401k down although contributions went in (market), stress asked again */
  const hysa = rec.planets.invest.rows.find(r => r.id === 'm-hysa');
  setField(rec, hysa.id, 'accountBalance', hysa.f.accountBalance.v + 60000, 'verified', 'client', { now: '2026-11-12T16:10:00.000Z', session: 's4', why: 'move' });
  /* the Roth IRA carries its own contribution figure; a fall of $1,200 is more than a month of contributions explains, so the market owns the rest */
  const roth = rec.planets.invest.rows.find(r => r.id === 'm-roth');
  setField(rec, roth.id, 'accountBalance', roth.f.accountBalance.v - 120000, 'verified', 'client', { now: '2026-11-12T16:12:00.000Z', session: 's4', why: 'move' });
  recordStress(rec, 's4', 5, { now: '2026-11-12T16:15:00.000Z' });
  recordWorthIt(rec, 's4', { food: 4, wants: 7, irregular: 9 }, { now: '2026-11-12T16:16:00.000Z', session: 's4' });
  recordSatisfaction(rec, 's4', 7, { now: '2026-11-12T16:18:00.000Z' });
  R = compute(rec, data, { today: TODAY4 });
  const beforeClose = { rec: JSON.parse(JSON.stringify(rec)), result: R }; /* session 4 before its close: what moved since session 3 */
  const cheers = celebrate(rec, R, data, { now: S4, session: 's4' });
  takeSnapshot(rec, R, 'session', { now: S4, session: 's4' });
  rec.sessions.push({ id: 's4', label: 'Session 4', at: S4, note: 'HYSA up, 401k down with the market, stress 5.' });
  return { rec, result: compute(rec, data, { today: TODAY4 }), cheers, beforeClose, beforeClose3 };
}
