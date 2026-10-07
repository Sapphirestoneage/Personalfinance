/* Outcomes (Level 10, MR-056): the program measures itself. Stress scores
   at discovery and sessions 4, 9 and 12; the scorecard (discovery against
   now on every line, in client words); the session 9 blind guess test; the
   before-and-after for graduation; the testimonial prompt with her own
   numbers. Pure; stress and baselines are written through engine/program.js. */
import { programOf } from './program.js';
import { AREAS } from './anchors.js';
import { compareToGut } from './transactions.js';

const ok = x => x && x.status === 'ok';
const num = v => typeof v === 'number' ? v : null;

/* The values the scorecard tracks, read from one result. */
export function snapshotValues(record, result) {
  const M = result.metrics || {}; const S = result.sun && result.sun.outputs; const P = programOf(record); const GP = result.goalPlan;
  const cards = (result.debts || []).filter(d => d.type === 'card').reduce((s, d) => s + (d.balance || 0), 0);
  const cushionMonths = ok(M.runway) ? M.runway.value.value.full : null;
  const bucketPct = GP && GP.base && GP.base.targets && GP.base.targets.step3 ? Math.min(1, GP.base.pot / GP.base.targets.step3) : null;
  const goalsHit = GP ? GP.input.items.filter(i => i.type !== 'long-term' && typeof i.step !== 'number' && GP.assessment[i.id] && GP.assessment[i.id].status === 'done').length : 0;
  const goalsTotal = GP ? GP.input.items.filter(i => i.type !== 'long-term' && typeof i.step !== 'number').length : 0;
  return {
    stress: (P.stress.slice(-1)[0] || {}).score || null,
    blindSpot: P.blindSpot.s9 && num(P.blindSpot.s9.pct) !== null ? P.blindSpot.s9.pct : (P.blindSpot.s4 ? P.blindSpot.s4.pct : null),
    completeness: result.completeness ? result.completeness.share : null,
    cardBalance: cards,
    cushionMonths,
    bucketPct,
    savingsRate: ok(M.savingsRateTakeHome) ? M.savingsRateTakeHome.value.value : null,
    fiDate: ok(M.fiDate) ? M.fiDate.value.value : null,
    goalsHit, goalsTotal,
  };
}

const LINES = [
  ['stress', 'How stressed about money, 1 to 10', 'score', 'lower'],
  ['blindSpot', 'How much of your spending your gut missed', 'pct', 'lower'],
  ['completeness', 'How much of the picture is real numbers', 'pct', 'higher'],
  ['cardBalance', 'Credit card balances', 'money', 'lower'],
  ['cushionMonths', 'Months your cash covers', 'months', 'higher'],
  ['bucketPct', 'Cushion saved, share of the full cushion', 'pct', 'higher'],
  ['savingsRate', 'Share of take-home saved', 'pct', 'higher'],
  ['fiDate', 'When the portfolio could carry you', 'date', 'earlier'],
  ['goalsHit', 'Goals reached, of the ones you named', 'count', 'higher'],
];
/* The scorecard: before (the discovery baseline) against now, with a direction word per line. */
export function scorecard(record, result) {
  const P = programOf(record); const before = P.baseline || {}; const now = snapshotValues(record, result);
  return LINES.map(([id, label, unit, better]) => {
    const b = before[id] === undefined ? null : before[id]; const n = now[id];
    let direction = 'same';
    if (b !== null && n !== null && b !== n) { if (unit === 'date') direction = n < b ? 'better' : 'worse'; else direction = ((better === 'lower') === (n < b)) ? 'better' : 'worse'; }
    if (b === null || n === null) direction = 'unknown';
    return { id, label, unit, before: b, now: n, direction, goalsTotal: id === 'goalsHit' ? now.goalsTotal : undefined };
  });
}

/* Session 9: she guesses again without looking (anchors.blind) and the ratio is compared with session 4. */
export function blindGuessTest(record, actualMonthly) {
  const blind = (record.anchors && record.anchors.blind) || {};
  if (!Object.keys(blind).length) return null;
  const now = compareToGut(actualMonthly, blind); const P = programOf(record); const s4 = P.blindSpot.s4 || null;
  const areas = AREAS.map(c => ({ area: c, label: c, guess: blind['spending:' + c] ? blind['spending:' + c].cents : null, actual: actualMonthly[c] || 0, ratio: now.perArea[c] ? now.perArea[c].ratio : null, ratioS4: s4 && s4.perArea && s4.perArea[c] ? s4.perArea[c].ratio : null }));
  const closer = areas.filter(a => a.ratio !== null && a.ratioS4 !== null && Math.abs(a.ratio - 1) < Math.abs(a.ratioS4 - 1)).length;
  return { blindSpotPct: now.blindSpotPct, blindSpotS4: s4 ? s4.pct : null, improved: s4 && now.blindSpotPct !== null ? now.blindSpotPct < s4.pct : null, areas, closer, of: areas.filter(a => a.ratio !== null && a.ratioS4 !== null).length };
}

/* The before-and-after rows for the one-pager, in client words with formatted values. */
export function beforeAfter(record, result, fmt) {
  const F = fmt || {};
  const pct = v => v === null ? 'not measured' : Math.round(v * 100) + '%';
  const money = v => v === null ? 'not measured' : (F.money ? F.money(v) : '$' + Math.round(v / 100).toLocaleString('en-US'));
  const show = (unit, v, row) => v === null || v === undefined ? 'not measured' : unit === 'pct' ? pct(v) : unit === 'money' ? money(v) : unit === 'months' ? (Math.round(v * 10) / 10) + (v === 1 ? ' month' : ' months') : unit === 'date' ? (F.date ? F.date(v) : String(v)) : unit === 'count' ? v + (row && row.goalsTotal ? ' of ' + row.goalsTotal : '') : String(v);
  return scorecard(record, result).map(r => Object.assign({}, r, { beforeText: show(r.unit, r.before, r), nowText: show(r.unit, r.now, r), word: r.direction === 'better' ? 'better' : r.direction === 'worse' ? (unit => unit)(r.unit) === 'date' ? 'later' : 'not yet' : r.direction === 'same' ? 'the same' : '' }));
}

/* The testimonial and referral prompt with her numbers, for the coach to read out. */
export function testimonialPrompt(record, result, name) {
  const rows = beforeAfter(record, result);
  const better = rows.filter(r => r.direction === 'better');
  const bits = better.slice(0, 3).map(r => r.label.charAt(0).toLowerCase() + r.label.slice(1) + ' went from ' + r.beforeText + ' to ' + r.nowText);
  const who = name || 'you';
  return { lines: bits, ask: bits.length ? 'Since we started, ' + bits.join('; ') + '. If a friend asked ' + who + ' what changed, what would ' + who + ' say? And is there one person who should hear about this?' : 'If a friend asked what changed, what would you say? And is there one person who should hear about this?', better: better.length };
}
