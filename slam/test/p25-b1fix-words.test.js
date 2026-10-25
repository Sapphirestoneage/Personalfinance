// Phase 2.5, Batch 1 fixes: the words on client screens. Show the math names no rule by its id and opens no Builder
// page (the ids live on All formulas and Rules); the Plan's and the Windfall's math reads "this step", not "FOO rung"
// or "Windfall:"; the calendar's and Spending's own notes say "a guess" and "checked in", never "house" or "the run";
// a moved item's note reads its day in words; a sentence ends once. Every household here is the made-up demo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { safeToSpend, staleness } from '../engine/spending.js';
import { estimatedVsActual, monthOutlook } from '../engine/compare.js';
import { waiting } from '../engine/calendar-views.js';
import { calendar } from '../engine/calendar.js';
import { DASHBOARD_MATH, explainMetric } from '../engine/math.js';
import { fooLadder, surplusWaterfall, fooGhosts } from '../engine/plan.js';
import { STEP_LABELS } from '../engine/windfall.js';
import { maxIt, maxItSim, maxItCash } from '../engine/maxit.js';
import { plainLabel, sentence, itemNote, KIND_WORDS } from '../ui/view.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
// What Show the math may never show on a client screen: a rule id, "(rule", or a build word.
const BUILD = /\b[A-Z]{2,}_[A-Z0-9_]+\b|\(rule |\bengine\b|registry|FOO rung|Windfall:/;
// Every line a panel draws, worded as the panel words it (ui/math-panel.js runs each through plainLabel).
const lines = (e) => [e.label, e.formula, e.plugged, e.note, ...e.roughBecause, ...e.missingBecause, ...e.groups.flatMap((g) => [g.label, ...g.terms.map((t) => t.label)])].filter(Boolean).map(plainLabel);

test('plainLabel drops a rule id and keeps the words', () => {
  assert.equal(plainLabel('Catch-up at age 50 (rule K401_CU50)'), 'Catch-up at age 50');
  assert.equal(plainLabel('The 401(k) deferral limit it shares (rule K401_DEF, with the catch-up)'), 'The 401(k) deferral limit it shares (with the catch-up)');
  assert.equal(plainLabel('Stage 1 floor (rule STAGE_RUNWAY_RED_MONTHS, not in the registry)'), 'Stage 1 floor (not set yet)');
  assert.equal(plainLabel('IRA limit (rule IRA_LIMIT) $7,500.00 + in for 2026 $3,000.00'), 'IRA limit $7,500.00 + in for 2026 $3,000.00');
  assert.equal(plainLabel('Rent'), 'Rent');
});

test('a kind worked out from other numbers reads "Worked out", as the filter on My numbers says it', () => {
  assert.equal(KIND_WORDS.computed, 'Worked out');
});

test('Show the math on Today, every card and flag, holds no rule id and no build word', () => {
  const spine = demo();
  const s = summarize(spine, R);
  const sim = cashsim(spine, R, { months: 1 });
  const ctx = { spine, rules: R, s, compare: estimatedVsActual(spine, R, { months: 1 }), spend: { safe: safeToSpend(sim) }, monthOut: monthOutlook(spine, R, sim, { today: spine.meta.asOf, waiting: waiting(spine, R, { today: spine.meta.asOf }) }) };
  let n = 0;
  for (const ids of Object.values(DASHBOARD_MATH)) for (const id of ids) {
    const e = explainMetric(id, ctx);
    if (!e) continue;
    n++;
    for (const l of lines(e)) assert.doesNotMatch(l, BUILD, id + ': ' + l);
  }
  assert.ok(n > 10, 'the Today panels were read (' + n + ')');
});

test('Show the math on the Plan steps and the surplus steps reads "this step" and the steps in words', () => {
  const spine = demo();
  const s = summarize(spine, R, { flags: false });
  const foo = fooLadder(spine, R, s, {});
  const w = surplusWaterfall(spine, R, s);
  const ctx = { spine, rules: R, s, plan: { foo }, windfall: w };
  for (const r of foo.rungs) {
    const e = explainMetric('plan:foo:' + r.id, ctx);
    assert.equal(e.label, 'This step: what it still needs');
    for (const l of lines(e)) assert.doesNotMatch(l, BUILD, r.id + ': ' + l);
  }
  for (const st of w.steps) {
    const e = explainMetric('windfall:' + st.id, ctx);
    assert.match(e.label, /^Extra money: /);
    for (const l of lines(e)) assert.doesNotMatch(l, BUILD, st.id + ': ' + l);
  }
  assert.equal(STEP_LABELS.taxOnIt, 'Tax on this money', 'the first step names this money, not a windfall');
});

test('Show the math for How much to max it names no rule by its id once worded for the screen', () => {
  const spine = demo();
  const sim = maxItSim(spine, R);
  const mx = maxIt(spine, R, { sim });
  const ctx = { spine, rules: R, maxit: mx, maxitCash: (key) => maxItCash(spine, R, mx, { sim, rows: key === 'all' ? null : mx.rows.filter((r) => r.id === key) }) };
  let n = 0;
  for (const r of mx.rows.filter((x) => x.applies)) for (const k of ['room', 'lump', 'month']) {
    const e = explainMetric('maxit:' + r.accountId + ':' + r.year + ':' + k, ctx);
    if (!e) continue;
    n++;
    for (const l of lines(e)) assert.doesNotMatch(l, BUILD, r.accountId + ' ' + k + ': ' + l);
  }
  assert.ok(n >= 3, 'the max-it panels were read (' + n + ')');
});

test('the calendar\'s own notes say "a guess", never "house" or "the run"; a plan suggestion names no rung', () => {
  const spine = demo();
  const s = summarize(spine, R, { flags: false });
  const c = calendar(spine, R, { months: 3 });
  let n = 0;
  for (const m of c.months) for (const e of m.events) { n++; for (const t of [e.label, e.note].filter(Boolean)) assert.doesNotMatch(t, /\bhouse\b|the run\b|FOO/, m.ym + ' ' + e.id + ': ' + t); }
  assert.ok(n > 20, 'three months of items were read (' + n + ')');
  const ghosts = fooGhosts(spine, R, s, ['2026-10']);
  for (const g of ghosts) assert.doesNotMatch(g.note, /FOO|rung/, g.note);
});

test('Spending\'s check-in line says "checked in", not "anchored"', () => {
  const spine = demo();
  for (const day of ['2026-10-22', '2026-10-23', '2026-11-05']) assert.doesNotMatch(staleness(spine, R, day).words, /anchored/);
});

test('a moved item\'s note reads its day in words, and its own screen leaves that part out', () => {
  const e = { moved: true, note: 'moved from 2026-11-01; counted as its monthly share' };
  assert.equal(itemNote(e), 'moved from Nov 1, 2026; counted as its monthly share');
  assert.equal(itemNote(e, { moved: false }), 'counted as its monthly share');
  assert.equal(itemNote({ moved: true, note: 'moved from 2026-11-01' }, { moved: false }), null);
  assert.equal(itemNote({ note: 'due day is a guess' }), 'due day is a guess');
});

test('a sentence ends once', () => {
  assert.equal(sentence('Deferrals by Dec 31 (payroll).'), 'Deferrals by Dec 31 (payroll).');
  assert.equal(sentence('Deferrals by Dec 31 (payroll)'), 'Deferrals by Dec 31 (payroll).');
  assert.equal(sentence('Got extra money?'), 'Got extra money?');
});
