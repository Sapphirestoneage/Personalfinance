// The Plan page (S-208, Batch F): the FOO ladder, the surplus waterfall (the
// Windfall order on the monthly surplus), the paycheck allocator, the solvers,
// the real hourly wage, DRAFTT, the fixed floor and an income shock, goals and
// sinking funds, the outlook, life events, saved scenarios with a diff, the
// undo history, export and import. Every number comes from engine/plan.js and
// the engines under it; every number has Show the math. Formatting only.

import { mountPage } from './page.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { fooLadder, surplusWaterfall, allocator, solvers, realHourlyWage, draftt, fixedFloor, outlook, goalsView, applyLifeEvent, removeLifeEvent, diffSpines, exportJson, importJson, exportCsv } from '../engine/plan.js';
import { STEP_LABELS } from '../engine/windfall.js';
import { putFact, parseInput, createHistory, commit, undo, canUndo, undoLabel } from '../engine/edits.js';
import { applyDefaults } from '../engine/defaults.js';
import { mathButton } from './math-panel.js';
import { loadAll, save, SOURCE_WORDS } from './household.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { labelFor } from '../engine/labels.js';
import { h, chip, money, pct, shortDate, monthWords, ledgerHref } from './view.js';

const app = document.getElementById('app');
mountPage({ app });
const kindChip = (k) => chip(k === 'computed' ? 'known' : k);
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const SCEN_KEY = 'slam-scenarios:v1';
const pc = (f) => Math.round(f * 1000) / 10 + '%';

let hist, rules, source, lastSaved = null, templates = [];
const form = { byAge: '', shockMonths: '', outlookRuns: '', event: '', eventDate: todayIso(), scenarioName: '', compareWith: '', importText: null, importFile: null };

function apply(next, label) {
  hist = commit(hist, applyDefaults(next, rules), label);
  source = 'saved';
  lastSaved = (save(hist.present) ? 'Saved in this browser: ' : 'Could not save in this browser (storage is blocked), so this lasts until the page closes: ') + label + '.';
  render();
}
function tryApply(fn, label) { try { apply(fn(hist.present), label); return true; } catch (err) { lastSaved = err.message; render(); return false; } }
const readScenarios = () => { try { return JSON.parse(localStorage.getItem(SCEN_KEY) || '[]'); } catch { return []; } };
const keepScenarios = (list) => { try { localStorage.setItem(SCEN_KEY, JSON.stringify(list)); return true; } catch { return false; } };

// ---------------------------------------------------------------- cards
function ladderCard(spine, s, ctx) {
  const f = fooLadder(spine, rules, s);
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const ded = h('input', { id: 'foo-ded', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'the biggest one' });
  ded.value = f.setup.deductible === null ? '' : String(f.setup.deductible);
  return h('section', { class: 'card', 'aria-labelledby': 'foo-h' },
    h('h2', { id: 'foo-h' }, 'The Financial Order of Operations'),
    h('p', { class: 'muted' }, 'Nine rungs, funded by the monthly surplus (' + money(f.surplus) + ') one after another. Each rung says what it still needs and the month it completes.'),
    h('details', { class: 'later-list', open: f.setup.deductible === null || !f.setup.match }, h('summary', {}, 'Three questions to set it up'),
      h('form', { class: 'editor', novalidate: true, onsubmit: (e) => { e.preventDefault(); const p = parseInput('money', ded.value); if (!p.ok) { msg.textContent = p.message; return; } tryApply((x) => putFact(x, 'household.deductible', p.value, 'known', todayIso()), 'Biggest deductible ' + money(p.value)); } },
        h('label', { for: 'foo-ded', class: 'edit-label' }, '1. The biggest insurance deductible (health, car or home)'), ded, msg,
        h('p', { class: 'edit-hint' }, '2. The employer match: ' + (f.setup.match ? 'entered on the workplace account.' : 'enter the match rate and cap on the workplace account in the Ledger (Assets, 401(k)).') + ' 3. Reserve months: the Rule of 5 target, ' + (f.setup.reserveMonths === null ? 'which needs a birth date' : f.setup.reserveMonths.toFixed(1) + ' months') + '.'),
        h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save the deductible'), h('a', { class: 'btn ghost', href: ledgerHref('accounts') }, 'Open the accounts in the Ledger')))),
    h('ol', { class: 'ladder' }, f.rungs.map((r) => h('li', { class: (r.done ? 'done' : '') + (r.id === f.current ? ' current' : '') }, h('span', {}, h('strong', {}, r.label), r.flow ? h('span', { class: 'pill' }, 'a month') : null, h('span', { class: 'rung-why' }, r.why)), h('span', { class: 'rung-when' }, r.need === null ? h('span', { class: 'missing-row' }, 'missing') : r.done ? 'done' : (r.flow ? money(r.need) + ' a month' : money(r.need)) + (r.completes ? ', about ' + monthWords(r.completes.slice(0, 7)) : r.months === null ? ', no surplus to fund it' : ''))))),
    h('p', { class: 'tile-note' }, kindChip(f.kind), ' A rung marked a month is a flow (the match, the Roth room, the retirement limit) and takes from the surplus for good; the others are filled once. Dates assume the surplus goes to one rung at a time.'),
    mathButton(f.rungs.filter((r) => r.need !== null).map((r) => 'plan:foo:' + r.id), ctx));
}

function waterfallCard(spine, s, ctx) {
  const w = surplusWaterfall(spine, rules, s);
  return h('section', { class: 'card', 'aria-labelledby': 'wf-h' },
    h('h2', { id: 'wf-h' }, 'The monthly surplus, in the Windfall order'),
    h('p', { class: 'muted' }, 'The same order and the same function as the Windfall room, run on the surplus every month: ' + (w.note || money(w.surplus) + ' a month.')),
    h('ol', { class: 'tiers' }, w.steps.map((st) => h('li', {}, h('span', {}, STEP_LABELS[st.id] || st.id, h('span', { class: 'rung-why' }, st.why)), h('span', { class: 'tier-amt' }, st.need === null ? 'missing' : money(st.amount) + (st.need > (st.amount || 0) ? ' of ' + money(st.need) : '')), h('span', { class: 'tier-cum' }, st.amount && st.need > st.amount ? Math.ceil(st.need / Math.max(0.01, st.amount)) + ' months' : '')))),
    mathButton(w.steps.map((st) => 'windfall:' + st.id), () => ({ ...ctx(), windfall: w })));
}

function allocatorCard(spine, s, sim, ctx) {
  const a = allocator(spine, rules, sim, s);
  if (!a.paychecks.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'alloc-h' },
    h('h2', { id: 'alloc-h' }, 'Paycheck allocator ', h('span', { class: 'count' }, String(a.paychecks.length))),
    h('p', { class: 'muted' }, 'Each paycheck in the window: the envelopes it fills by due date until the next one, the tax set aside on a 1099 deposit, and what is free.' + (a.bonusMonths.length ? ' Three-paycheck months: ' + a.bonusMonths.map(monthWords).join(', ') + '; the extra paycheck is the one the Windfall order takes first.' : '')),
    a.paychecks.map((p) => h('details', { class: 'later-list' }, h('summary', {}, shortDate(p.date) + ': ' + p.label + ', ' + money(p.amount) + (p.bonus ? ' (bonus paycheck)' : '') + ', ' + (p.short ? 'short by ' + money(-p.free) : money(p.free) + ' free')),
      h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Envelope'), h('th', {}, 'Due'), h('th', { class: 'num' }, 'Amount'))),
        h('tbody', {}, p.is1099 ? h('tr', {}, h('td', {}, 'Tax set aside (' + pct(p.setAsideRate, 1) + ' of a 1099 deposit)' + (p.setAsideMissing ? '; the rate is partly missing' : '')), h('td', {}, 'on arrival'), h('td', { class: 'num' }, money(p.setAside))) : null, ...p.envelopes.map((e) => h('tr', {}, h('td', {}, e.label), h('td', {}, shortDate(e.date)), h('td', { class: 'num' }, money(e.amount)))), h('tr', {}, h('td', {}, 'Everyday spending until the next paycheck'), h('td', {}, ''), h('td', { class: 'num' }, money(p.everyday)))),
        h('tfoot', {}, h('tr', {}, h('td', {}, h('strong', {}, p.short ? 'Short by' : 'Free')), h('td', {}), h('td', { class: 'num' }, money(Math.abs(p.free))))))))),
    mathButton(a.paychecks.slice(0, 6).map((p) => 'plan:pay:' + p.date + ':' + p.streamId), ctx, 0, 'Show the math for the first six'));
}

function solversCard(spine, s, ctx) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const age = h('input', { id: 'solve-age', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '60' });
  age.value = form.byAge;
  const parsed = form.byAge.trim() === '' ? { ok: true, value: null } : parseInput('int', form.byAge);
  const x = solvers(spine, rules, s, { byAge: parsed.ok ? parsed.value : null });
  return h('section', { class: 'card', 'aria-labelledby': 'solve-h' },
    h('h2', { id: 'solve-h' }, 'What it takes to get there'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const p = age.value.trim() === '' ? { ok: true } : parseInput('int', age.value); if (!p.ok) { msg.textContent = p.message; return; } form.byAge = age.value; render(); } },
      h('label', { for: 'solve-age', class: 'edit-label' }, 'Financially independent by age'), age, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Solve'))),
    x.rows.length ? [h('p', { class: 'tile-sub' }, 'To reach ' + money(x.fiNumber) + ' by ' + x.targetAge + ' (' + Math.round(x.years) + ' years from ' + x.age + ') from ' + money(x.invested) + ' invested at ' + pct(x.realReturn, 1) + ' real' + (x.yearsNow !== null ? '; on the saving as it is, about ' + x.yearsNow.toFixed(1) + ' years' : '; on the saving as it is, never') + '.'),
      h('ul', {}, x.rows.map((r) => h('li', {}, h('strong', {}, r.label + ': '), r.value === null ? r.words : (r.unit === 'ratio' ? pct(r.value, 1) : money(r.value) + ' a month') + ' (' + r.words + ')'))),
      h('p', { class: 'tile-note' }, kindChip(x.kind), ' Each one is found by halving on the FI engine\'s own years-to-target, holding everything else.'),
      mathButton(x.rows.filter((r) => r.value !== null).map((r) => 'plan:solve:' + r.id), () => ctx({ solvers: x }))] : h('p', { class: 'muted missing-row' }, x.note));
}

function wageCard(spine, s, ctx) {
  const w = realHourlyWage(spine, rules, s);
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const hours = h('input', { id: 'wage-hours', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '40' }); hours.value = w.hoursWeek === null ? '' : String(w.hoursWeek);
  const commute = h('input', { id: 'wage-commute', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '0' }); commute.value = spine.household.commuteHoursPerWeek && spine.household.commuteHoursPerWeek.value !== null ? String(spine.household.commuteHoursPerWeek.value) : '';
  return h('section', { class: 'card', 'aria-labelledby': 'wage-h' },
    h('h2', { id: 'wage-h' }, 'Real hourly wage'),
    h('p', { class: 'muted' }, 'Take-home less the costs of working, over the hours worked plus the commute. Mark a line as a cost of working in the Ledger (a bus pass, work clothes, lunches out).'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const a = parseInput('int', hours.value); if (!a.ok) { msg.textContent = 'Hours: ' + a.message; return; } const c = commute.value.trim() === '' ? { ok: true, value: 0 } : parseInput('int', commute.value); if (!c.ok) { msg.textContent = 'Commute: ' + c.message; return; } tryApply((x) => putFact(putFact(x, 'household.workHoursPerWeek', a.value, 'known', todayIso()), 'household.commuteHoursPerWeek', c.value, 'known', todayIso()), 'Hours a week ' + a.value + ', commute ' + c.value); } },
      h('label', { for: 'wage-hours', class: 'edit-label' }, 'Hours worked a week'), hours,
      h('label', { for: 'wage-commute', class: 'edit-label' }, 'Commute hours a week'), commute, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save'))),
    h('p', { class: 'tile-sub' }, kindChip(w.kind), ' ', w.wage === null ? h('span', { class: 'missing-row' }, 'Missing: hours worked a week' + (w.takeHome === null ? ' and take-home pay' : '')) : h('strong', {}, money(w.wage, true) + ' an hour of life'), w.wage !== null ? ' (' + money(w.takeHome) + ' take-home less ' + money(w.costMonthly) + ' of work costs, over ' + w.hoursMonthly + ' hours a month' + (w.naive !== w.wage ? '; ' + money(w.naive, true) + ' before the commute and the costs' : '') + '). The Spending page can show every amount as hours.' : ''),
    w.costs.length ? h('p', { class: 'tile-note' }, 'Costs of working: ' + w.costs.map((c) => c.label + ' ' + money(c.amount)).join(', ') + '.') : null,
    w.wage !== null ? mathButton(['plan:wage'], ctx) : null);
}

function drafttCard(spine, s, ctx) {
  const d = draftt(spine, rules, s);
  if (d.base.amount === null) return h('section', { class: 'card' }, h('h2', {}, 'DRAFTT'), h('p', { class: 'muted missing-row' }, 'Missing: take-home pay.'));
  const max = Math.max(0.01, ...d.rows.map((r) => r.share));
  return h('section', { class: 'card', 'aria-labelledby': 'draftt-h' },
    h('h2', { id: 'draftt-h' }, 'DRAFTT: the letters as shares of ' + d.base.label),
    h('p', { class: 'muted' }, 'Debt, Retirement, Accommodation, Food, Transportation' + (d.rows.some((r) => r.key === 'therapy') ? ', Therapy' : '') + '. Shares only, no verdict: the mark on housing is a reference at ' + pct(d.housingReference) + ' of take-home, not a target.'),
    h('ul', { class: 'letters' }, d.rows.map((r) => h('li', {}, h('span', { class: 'letter' }, r.letter), h('span', { class: 'lbar', role: 'img', 'aria-label': r.label + ' ' + pct(r.share, 1) }, h('span', { class: 'lfill', style: 'width:' + pc(Math.min(1, r.share / max)) }), r.reference ? h('span', { class: 'lref', style: 'left:' + pc(Math.min(1, (r.referenceAmount / d.base.amount) / max)), title: 'reference ' + pct(r.reference) }) : null), h('span', { class: 'lamt' }, money(r.amount) + ' (' + pct(r.share, 1) + ')')))),
    h('p', { class: 'tile-sub' }, kindChip(d.kind), ' DRAFTT is ' + pct(d.totalShare, 1) + ' of ' + money(d.base.amount) + '; everything else ' + money(d.everythingElse) + '; left over ' + (d.leftOver === null ? 'unknown' : money(d.leftOver)) + '.'),
    mathButton(d.rows.map((r) => 'plan:draftt:' + r.key), ctx));
}

function floorCard(spine, s, sim, ctx) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const months = h('input', { id: 'shock-months', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '3' }); months.value = form.shockMonths;
  const p = form.shockMonths.trim() === '' ? { ok: true, value: null } : parseInput('int', form.shockMonths);
  const f = fixedFloor(spine, rules, s, sim, { months: p.ok ? p.value : null });
  return h('section', { class: 'card', 'aria-labelledby': 'floor-h' },
    h('h2', { id: 'floor-h' }, 'The fixed floor, and if income stopped'),
    h('p', { class: 'tile-sub' }, kindChip(f.kind), ' ', f.floor === null ? h('span', { class: 'missing-row' }, 'Missing: a fixed line\'s amount') : 'Fixed commitments ' + money(f.floor) + ' a month (' + f.items.map((i) => i.label).join(', ') + (f.items.length ? ', plus' : '') + ' minimums ' + money(f.minimums) + '). ' + (f.runwayMonths === null ? '' : 'Cash (' + money(f.cash) + ') covers it for ' + f.runwayMonths + ' months.')),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const q = months.value.trim() === '' ? { ok: true } : parseInput('int', months.value); if (!q.ok) { msg.textContent = q.message; return; } form.shockMonths = months.value; render(); } },
      h('label', { for: 'shock-months', class: 'edit-label' }, 'If every paycheck stopped for this many months'), months, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Run it'))),
    f.shock ? h('div', { class: 'tool-result' + (f.shock.firstBad ? ' bad' : '') }, f.shock.firstBad ? 'With no income for ' + f.shock.months + ' months from ' + shortDate(f.shock.from) + ', checking goes under the floor on ' + shortDate(f.shock.firstBad) + ' (' + f.shock.runwayDays + ' days). At risk: ' + f.shock.atRisk.map((x) => x.label + ' ' + money(x.amount) + ' on ' + shortDate(x.date)).join('; ') + '.' : 'With no income for ' + f.shock.months + ' months from ' + shortDate(f.shock.from) + ', checking stays above the floor (lowest ' + money(f.shock.low.amount) + ' on ' + shortDate(f.shock.low.date) + ').') : null,
    h('p', { class: 'tile-note' }, 'A fixed line is one marked fixed in the Ledger. The shock runs the same day-by-day simulation with every paycheck removed.'),
    mathButton(['plan:floor'], ctx));
}

function goalsCard(spine, s, ctx) {
  const g = goalsView(spine, rules, s);
  return h('section', { class: 'card', 'aria-labelledby': 'goals-h' },
    h('h2', { id: 'goals-h' }, 'Goals and sinking funds ', h('span', { class: 'count' }, String(g.rows.length))),
    h('p', { class: 'muted' }, 'Each goal with its target, the set-aside a month, the account it lives in and by when. Edit them in the Ledger under Goals. ' + (g.setAsideTotal ? money(g.setAsideTotal) + ' a month goes to goals.' : '')),
    g.rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Goal'), h('th', { class: 'num' }, 'Target'), h('th', { class: 'num' }, 'There'), h('th', { class: 'num' }, 'To go'), h('th', {}, 'Reached'), h('th', {}, 'Costs the FI date'))),
      h('tbody', {}, g.rows.map((r) => h('tr', { class: r.onTime === false ? 'tight' : '' }, h('td', {}, h('a', { href: ledgerHref(r.path) }, r.label), r.sinking ? [' ', h('span', { class: 'pill' }, 'sinking fund')] : null, r.priority !== null ? [' ', h('span', { class: 'pill' }, 'priority ' + r.priority)] : null, r.repeat ? [' ', h('span', { class: 'pill' }, 'yearly')] : null), h('td', { class: 'num' }, r.target === null ? 'missing' : money(r.target)), h('td', { class: 'num' }, r.held === null ? '' : money(r.held)), h('td', { class: 'num' }, r.toGo === null ? 'missing' : money(r.toGo)), h('td', {}, r.toGo === 0 ? 'done' : r.reached ? monthWords(r.reached.slice(0, 7)) + (r.by ? (r.onTime ? ', in time for ' : ', after ') + shortDate(r.by) : '') + (r.neededMonthly && r.onTime === false ? '; ' + money(r.neededMonthly) + ' a month would make it' : '') : r.by ? 'no set-aside yet; ' + (r.neededMonthly === null ? '' : money(r.neededMonthly) + ' a month by ' + shortDate(r.by)) : 'no set-aside yet'), h('td', {}, r.fiCostMonths === null ? '' : r.fiCostMonths + ' month' + (r.fiCostMonths === 1 ? '' : 's') + ' later')))))) : h('p', { class: 'muted' }, 'No goals beyond financial independence yet.'),
    g.rows.length ? mathButton(g.rows.filter((r) => r.toGo !== null).map((r) => 'plan:goal:' + r.id), ctx) : null);
}

function outlookCard(spine, sim, ctx) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const runs = h('input', { id: 'outlook-runs', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '200' }); runs.value = form.outlookRuns;
  const p = form.outlookRuns.trim() === '' ? { ok: true, value: null } : parseInput('int', form.outlookRuns);
  const o = outlook(spine, rules, sim, { runs: p.ok && p.value ? Math.min(1000, Math.max(10, p.value)) : null });
  return h('section', { class: 'card', 'aria-labelledby': 'outlook-h' },
    h('h2', { id: 'outlook-h' }, 'Outlook: ' + o.runs + ' runs'),
    h('p', { class: 'muted' }, 'The same window run many times with every amount wobbled ' + pct(o.wobble) + ' either way and days shifted by up to two. Bad is the tenth percentile, good the ninetieth.'),
    h('div', { class: 'clear-grid' }, h('div', { class: 'clear-tile' }, h('span', { class: 'clear-date' }, money(o.low.bad)), h('span', { class: 'clear-label' }, 'Lowest day, bad run')), h('div', { class: 'clear-tile' }, h('span', { class: 'clear-date' }, money(o.low.typical)), h('span', { class: 'clear-label' }, 'Lowest day, typical')), h('div', { class: 'clear-tile' }, h('span', { class: 'clear-date' }, money(o.low.good)), h('span', { class: 'clear-label' }, 'Lowest day, good run')), h('div', { class: 'clear-tile' + (o.shareBelowFloor > 0.2 ? ' beyond' : '') }, h('span', { class: 'clear-date' }, pct(o.shareBelowFloor)), h('span', { class: 'clear-label' }, 'of runs go under the floor'))),
    h('p', { class: 'tile-sub' }, kindChip(o.kind), ' Checking at the end: ' + money(o.end.bad) + ' bad, ' + money(o.end.typical) + ' typical, ' + money(o.end.good) + ' good. Card interest ' + money(o.interest.low) + ' to ' + money(o.interest.high) + '.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const q = runs.value.trim() === '' ? { ok: true } : parseInput('int', runs.value); if (!q.ok) { msg.textContent = q.message; return; } form.outlookRuns = runs.value; render(); } }, h('label', { for: 'outlook-runs', class: 'edit-label' }, 'Runs (10 to 1,000)'), runs, msg, h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn' }, 'Run again'))),
    mathButton(['plan:outlook'], () => ctx({ outlook: o })));
}

function eventsCard(spine) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const pick = h('select', { id: 'event-pick' }, h('option', { value: '' }, 'Pick a life event'), ...templates.map((t) => h('option', { value: t.id }, t.label)));
  pick.value = form.event;
  const date = h('input', { id: 'event-date', type: 'date' }); date.value = form.eventDate;
  const applied = [...new Set([...(spine.income || []), ...(spine.expenses || [])].map((x) => x.lifeEvent).filter(Boolean))];
  const chosen = templates.find((t) => t.id === pick.value);
  pick.addEventListener('change', () => { form.event = pick.value; render(); });
  return h('section', { class: 'card', 'aria-labelledby': 'events-h' },
    h('h2', { id: 'events-h' }, 'Life events'),
    h('p', { class: 'muted' }, 'A template lands its lines on the household from a date as rough numbers you then edit in the Ledger: income in, costs out, with an end after their count. Remove it and the lines go.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const t = templates.find((x) => x.id === pick.value); if (!t) { msg.textContent = 'Pick an event'; return; } if (!date.value) { msg.textContent = 'Pick a date'; return; } form.event = pick.value; form.eventDate = date.value; tryApply((s) => applyLifeEvent(s, t, date.value).spine, t.label + ' from ' + shortDate(date.value)); } },
      h('label', { for: 'event-pick', class: 'edit-label' }, 'Event'), pick,
      chosen ? h('p', { class: 'edit-hint' }, chosen.summary + ' Lines: ' + chosen.items.map((i) => i.label + ' ' + (i.direction === 'in' ? '+' : '-') + money(i.cents / 100) + (i.cadence === 'once' ? '' : ' ' + i.cadence)).join('; ') + '.') : null,
      h('label', { for: 'event-date', class: 'edit-label' }, 'From'), date, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add it to the household'))),
    applied.length ? h('p', { class: 'tile-sub' }, 'On the household now: ', ...applied.flatMap((id, i) => [i ? ', ' : '', (templates.find((t) => t.id === id) || { label: id }).label, ' ', h('button', { type: 'button', class: 'btn ghost small', onclick: () => tryApply((s) => removeLifeEvent(s, id), 'Removed ' + id) }, 'Remove')])) : null);
}

function scenariosCard(spine) {
  const list = readScenarios();
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const name = h('input', { id: 'scen-name', type: 'text', autocomplete: 'off', placeholder: 'Before the move' }); name.value = form.scenarioName;
  const pick = h('select', { id: 'scen-pick' }, h('option', { value: '' }, 'Compare today with a saved one'), ...list.map((x) => h('option', { value: x.id }, x.name + ' (' + shortDate(x.savedAt.slice(0, 10)) + ')')));
  pick.value = form.compareWith;
  pick.addEventListener('change', () => { form.compareWith = pick.value; render(); });
  const other = list.find((x) => x.id === pick.value);
  const diff = other ? diffSpines(other.spine, spine) : null;
  return h('section', { class: 'card', 'aria-labelledby': 'scen-h' },
    h('h2', { id: 'scen-h' }, 'Saved scenarios ', h('span', { class: 'count' }, String(list.length))),
    h('p', { class: 'muted' }, 'Save the household as it stands under a name (in this browser). Compare any saved one with today to see every number that changed; load one to go back to it (undoable).'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); if (!name.value.trim()) { msg.textContent = 'Give it a name'; return; } const entry = { id: 's' + Date.now(), name: name.value.trim(), savedAt: new Date().toISOString(), spine: hist.present }; if (!keepScenarios([...list, entry])) { msg.textContent = 'Could not save in this browser (storage is blocked)'; return; } form.scenarioName = ''; lastSaved = 'Scenario saved: ' + entry.name + '.'; render(); } },
      h('label', { for: 'scen-name', class: 'edit-label' }, 'Save today as'), name, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save the scenario'))),
    list.length ? [h('label', { for: 'scen-pick', class: 'edit-label' }, 'Compare'), pick,
      h('ul', { class: 'restore-list' }, list.map((x) => h('li', {}, h('strong', {}, x.name), h('span', { class: 'when' }, shortDate(x.savedAt.slice(0, 10))), h('button', { type: 'button', class: 'btn small', onclick: () => tryApply(() => x.spine, 'Loaded the scenario ' + x.name) }, 'Load it'), h('button', { type: 'button', class: 'btn ghost small', onclick: () => { keepScenarios(list.filter((y) => y.id !== x.id)); if (form.compareWith === x.id) form.compareWith = ''; render(); } }, 'Forget it'))))] : null,
    diff ? [h('h3', { class: 'month-h' }, other.name + ' against today: ' + diff.length + ' change' + (diff.length === 1 ? '' : 's')), diff.length ? h('ul', { class: 'diff-list' }, diff.slice(0, 60).map((d) => h('li', {}, h('span', { class: 'd-path' }, labelPath(spine, other.spine, d.path)), h('span', {}, d.change === 'added' ? 'added: ' + show(d.after) : d.change === 'removed' ? 'removed (was ' + show(d.before) + ')' : show(d.before) + ' to ' + show(d.after))))) : h('p', { class: 'muted' }, 'Nothing differs.')] : null);
}
const show = (x) => (x === null || x === undefined ? 'missing' : typeof x === 'number' ? (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100)) : typeof x === 'object' ? JSON.stringify(x) : String(x));
const labelPath = (a, b, p) => { try { return labelFor(a, p) || labelFor(b, p) || p; } catch { return p; } };

function historyCard() {
  const limit = rules.get('APP_HISTORY_POINTS', +todayIso().slice(0, 4));
  const points = hist.past.slice(-limit).reverse();
  return h('section', { class: 'card', 'aria-labelledby': 'hist-h' },
    h('h2', { id: 'hist-h' }, 'History ', h('span', { class: 'count' }, points.length + ' of ' + hist.past.length)),
    h('p', { class: 'muted' }, 'The last ' + limit + ' restore points from this page\'s session. Restoring one undoes everything after it (and is itself undoable).'),
    points.length ? h('ul', { class: 'restore-list' }, points.map((pt, i) => h('li', {}, h('span', {}, pt.label || 'an edit'), h('button', { type: 'button', class: 'btn small', onclick: () => { let hh = hist; for (let k = 0; k <= i; k++) hh = undo(hh); hist = hh; save(hist.present); lastSaved = 'Restored to before: ' + (pt.label || 'an edit') + '.'; render(); } }, 'Restore to before this')))) : h('p', { class: 'muted' }, 'No edits on this page yet.'));
}

function exportCard(spine) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const file = h('input', { id: 'import-file', type: 'file', accept: '.json,application/json', 'aria-label': 'A SLAM household file' });
  const download = (text, name, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const stamp = todayIso();
  const preview = form.importText ? (() => { try { const r = importJson(form.importText); const diff = diffSpines(spine, r.spine); return { ok: true, r, diff }; } catch (err) { return { ok: false, message: err.message }; } })() : null;
  return h('section', { class: 'card', 'aria-labelledby': 'exp-h' },
    h('h2', { id: 'exp-h' }, 'Export and import'),
    h('p', { class: 'muted' }, 'The household as a versioned file (slam-export/1), or the log and the lines as CSV. Importing shows what would change first; applying it is one restore point, so it undoes in one step.'),
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: () => download(exportJson(spine, { exportedAt: stamp }), 'slam-household-' + stamp + '.json', 'application/json') }, 'Download the household'), h('button', { type: 'button', class: 'btn', onclick: () => download(exportCsv(spine, 'log'), 'slam-log-' + stamp + '.csv', 'text/csv') }, 'Log as CSV'), h('button', { type: 'button', class: 'btn', onclick: () => download(exportCsv(spine, 'lines'), 'slam-lines-' + stamp + '.csv', 'text/csv') }, 'Lines as CSV'), h('a', { class: 'btn ghost', href: 'onepager.html' }, 'Printable one-pager')),
    h('div', { class: 'file-row' }, h('label', { for: 'import-file', class: 'edit-label' }, 'Import a household file'), file, h('button', { type: 'button', class: 'btn', onclick: () => { const f = file.files && file.files[0]; if (!f) { msg.textContent = 'Pick a file first'; return; } f.text().then((t) => { form.importText = t; form.importFile = f.name; render(); }); } }, 'Read it')), msg,
    preview ? (preview.ok ? [h('p', { class: 'tile-sub' }, form.importFile + ': a valid household' + (preview.r.migrated ? ', upgraded to the current shape' : '') + (preview.r.exportedAt ? ', exported ' + shortDate(preview.r.exportedAt.slice(0, 10)) : '') + '. ' + preview.diff.length + ' change' + (preview.diff.length === 1 ? '' : 's') + ' against today.'),
      preview.diff.length ? h('ul', { class: 'diff-list' }, preview.diff.slice(0, 40).map((d) => h('li', {}, h('span', { class: 'd-path' }, labelPath(spine, preview.r.spine, d.path)), h('span', {}, d.change === 'added' ? 'added: ' + show(d.after) : d.change === 'removed' ? 'removed (was ' + show(d.before) + ')' : show(d.before) + ' to ' + show(d.after))))) : null,
      h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: () => { const r = preview.r; form.importText = null; tryApply(() => r.spine, 'Imported ' + form.importFile); } }, 'Apply the import'), h('button', { type: 'button', class: 'btn ghost', onclick: () => { form.importText = null; render(); } }, 'Discard'))] : h('p', { class: 'edit-msg', role: 'alert' }, form.importFile + ': ' + preview.message)) : null);
}

// ---------------------------------------------------------------- render
function render() {
  const spine = withScenario(hist.present, rules, pickedScenario());
  const s = summarize(spine, rules, { flags: false });
  const sim = cashsim(spine, rules, { months: 3 });
  const ctx = (extra = {}) => ({ spine, rules, s, sim, plan: { foo: fooLadder(spine, rules, s), wage: realHourlyWage(spine, rules, s), draftt: draftt(spine, rules, s), floor: fixedFloor(spine, rules, s, null), goals: goalsView(spine, rules, s), alloc: allocator(spine, rules, sim, s) }, ...extra });
  app.replaceChildren(...[
    h('nav', { class: 'page-links', 'aria-label': 'Pages' }, h('a', { href: 'dashboard.html' }, 'Dashboard'), h('a', { href: 'ledger.html' }, 'Ledger'), h('a', { href: 'calendar.html' }, 'Calendar'), h('a', { href: 'spending.html' }, 'Spending'), h('a', { href: 'windfall.html' }, 'Windfall'), h('a', { href: 'math.html' }, 'All formulas')),
    h('header', { class: 'top' },
      h('div', {}, h('h1', {}, 'Plan'), h('p', { class: 'muted', 'aria-live': 'polite' }, spine.meta.name, ' · numbers as of ', shortDate(spine.meta.asOf), ' · ', SOURCE_WORDS[source])),
      h('nav', { class: 'top-actions' }, h('button', { type: 'button', class: 'btn', disabled: !canUndo(hist), title: canUndo(hist) ? 'Undo ' + undoLabel(hist) : null, onclick: () => { const before = hist; hist = undo(hist); if (hist !== before) { save(hist.present); lastSaved = 'Undone: ' + undoLabel(before) + '.'; render(); } } }, canUndo(hist) ? 'Undo' : 'Nothing to undo'))),
    h('p', { class: 'saved-line', role: 'status', 'aria-live': 'polite' }, lastSaved || ''),
    ladderCard(spine, s, ctx),
    waterfallCard(spine, s, ctx),
    allocatorCard(spine, s, sim, ctx),
    goalsCard(spine, s, ctx),
    solversCard(spine, s, ctx),
    wageCard(spine, s, ctx),
    drafttCard(spine, s, ctx),
    floorCard(spine, s, sim, ctx),
    outlookCard(spine, sim, ctx),
    eventsCard(spine),
    scenariosCard(spine),
    historyCard(),
    exportCard(spine)
  ].filter(Boolean));
}

loadAll().then(async (loaded) => {
  hist = createHistory(loaded.spine); rules = loaded.rules; source = loaded.source;
  try { const r = await fetch(new URL('../data/life-events.json', import.meta.url), { cache: 'no-store' }); if (r.ok) templates = (await r.json()).templates || []; } catch { templates = []; }
  render();
  if (loaded.problem) app.prepend(h('p', { class: 'card', role: 'alert' }, loaded.problem));
}).catch((err) => { app.replaceChildren(h('p', { class: 'card' }, 'The Plan page could not load: ' + err.message)); });
