// The Profile (Phase 2.5 B3), a main tab since 2026-10-27, laid out like My numbers: five groups, biggest first, each
// opening its own screen (Your life, Homework, Your assumptions, FI assumptions, Preferences). What is set once or
// rarely changed lives here, off the daily screens, which keep a one-line link. Level 1
// by area (each ends with one line saying what it set up), Level 2 for what Level 1 opened (each question known now,
// looked up later or not sure), the life changes, and the client's to-dos. "Import answers" reads the file the
// client sent from "Before our first call". Every change goes through the shell's change(), so Undo takes it back.
// Formatting only: engine/profile.js.

import { startPage, change, refresh } from './shell.js';
import { clientOverrides } from '../engine/assumptions.js';
import { scenarioBar, pickedScenario } from './scenario.js';
import { SCENARIO_WORDS } from '../engine/scenarios.js';
import { prefsScreen, prefsSummary } from './prefs-screen.js';
import { pref } from './prefs.js';
import { h, money, shortDate, todayIso, ledgerHref } from './view.js';
import { questionEl } from './profile-q.js';
import { AREAS, LEVEL1, asked, choicesFor, disagreements, questionById, answersOf, applyAnswer, fieldsFor, level2, L2_AREAS, setHomework, homeworkList, readAnswersFile, loadAnswers, changeWords } from '../engine/profile.js';
import { valueOf as v } from '../engine/spine.js';
import { summarize } from '../engine/summary.js';
import { putFact } from '../engine/edits.js';
import { guessesFor } from './urgency.js';
import { openQuestions } from '../engine/questions.js';

const AREA_NAMES = Object.fromEntries(AREAS);
const answer = (q) => (x) => change((s) => applyAnswer(s, q.id, x, { today: todayIso(), by: 'coach' }), q.label + (x === null ? ' cleared' : ' answered') + '. Logged as a life change');

// ---------------------------------------------------------------- the top: five groups, biggest first
// No letter badges (Krug pass): those are only for the six DATING groups in My numbers.
const goRow = (href, mark, name, total, sub) => h('li', {}, h('a', { class: 'go-row plain', href }, h('span', { class: 'go-name' }, name), h('span', { class: 'go-sub' }, total !== null ? h('span', { class: 'go-total' }, total) : null, total !== null ? ' ' : null, sub)));
function top({ spine, rules }) {
  const a = answersOf(spine), hw = homeworkList(spine, todayIso()), own = Object.keys(clientOverrides(spine)).length;
  const l1 = LEVEL1.filter((q) => asked(a, q)), done = l1.filter((q) => a[q.id] !== undefined).length;
  const todo = hw.reduce((n, g) => n + g.items.length, 0);
  // The one list of open questions (morning answer 10): the same total as My numbers and Still guessing.
  const open = openQuestions(spine, guessesFor(spine, rules, () => refresh()));
  const groups = [
    { n: open ? open.length : 0, row: h('li', {}, h('a', { class: 'go-row plain', href: 'ledger.html#/still-guessing' }, h('span', { class: 'go-name' }, 'Open questions'), h('span', { class: 'go-sub' }, open === null ? 'Working out which guesses matter...' : open.length ? [h('span', { class: 'go-total', 'data-metric': 'list:open' }, String(open.length)), ' missing or worth checking now'] : 'None open'))) },
    { n: l1.length, row: goRow('#/life', 'L', 'Your life', done + ' of ' + l1.length, 'answered') },
    { n: todo, row: goRow('#/homework', 'H', 'Homework', String(todo), todo === 1 ? 'thing to look up' : 'things to look up') },
    { n: own, row: goRow('assumptions.html', 'A', 'Your assumptions', own ? own + ' changed' : 'none changed', own ? 'for this client' : 'all your defaults') },
    { n: 1, row: goRow('#/goals', 'G', 'FI assumptions', SCENARIO_WORDS[pickedScenario()], 'assumption set') },
    { n: 0, row: goRow('#/prefs', 'P', 'Preferences', null, prefsSummary()) },
    // The quarterly review (owner's ask, 2026-10-27): each subscription, still wanted or not, every few months.
    (() => { const subs = summarize(spine, rules, { flags: false }).subs, due = subs.items.filter((i) => i.due).length; return { n: due, row: goRow('#/review', 'R', 'Quarterly review', subs.items.length ? String(due) : null, subs.items.length ? (due === 1 ? 'subscription to look at' : 'subscriptions to look at') : 'no subscriptions yet') }; })()
  ];
  // Answers that cannot both be true come first, each with a way to the question that fixes it.
  const odd = disagreements(spine, todayIso());
  return [
    odd.length ? h('section', { class: 'card odd-card', 'aria-labelledby': 'odd-h' }, h('h2', { id: 'odd-h' }, odd.length === 1 ? 'Two answers disagree' : 'Some answers disagree (' + odd.length + ')'),
      h('ul', { class: 'odd-list' }, odd.map((x) => h('li', {}, h('p', {}, x.words), h('a', { class: 'btn small', href: x.path ? ledgerHref(x.path) : '#/' + questionById(x.ids[x.ids.length - 1]).area }, 'Fix it'))))) : null,
    // Import answers is the coach's tool: client view hides it (Preferences).
    pref('view') === 'client' ? null : loadCard(),
    h('ul', { class: 'go-list', 'aria-label': 'Profile' }, [...groups].sort((x, y) => y.n - x.n).map((g) => g.row))
  ];
}
function goalsScreen({ spine, rules }) {
  return [
    h('section', { class: 'card', 'aria-labelledby': 'gs-set' }, h('h2', { id: 'gs-set' }, 'Assumption set'),
      h('p', { class: 'muted' }, 'Every FI number on Today, My numbers, Plan and the One-pager reads this set.'),
      scenarioBar(spine, rules, pickedScenario(), () => refresh())),
    // The household's own FI assumptions (return, inflation, withdrawal rate, life expectancy) are one row away.
    h('ul', { class: 'go-list' },
      h('li', {}, h('a', { class: 'go-row plain', href: 'ledger.html#/profile/fi-assumptions' }, h('span', { class: 'go-name' }, 'Return, inflation and withdrawal rate'), h('span', { class: 'go-sub' }, 'This household\'s own'))),
      h('li', {}, h('a', { class: 'go-row plain', href: 'ledger.html#/goals' }, h('span', { class: 'go-name' }, 'Goals'), h('span', { class: 'go-sub' }, 'In My numbers'))))
  ];
}
function homeworkScreen(ctx) {
  const changes = ctx.spine.lifeChanges || [];
  return [...todoScreen(ctx).flat(), h('ul', { class: 'go-list' }, h('li', {}, h('a', { class: 'go-row plain', href: '#/changes' }, h('span', { class: 'go-name' }, 'Life changes'), h('span', { class: 'go-total' }, String(changes.length)), h('span', { class: 'go-sub' }, 'Every answer changed, with its date.'))))];
}
function lifeScreen({ spine }) {
  const a = answersOf(spine), f = fieldsFor(a), l2 = level2(a);
  const gut = spine.household.gutSpending ? v(spine.household.gutSpending) : null;
  return [
    gut !== null ? h('p', { class: 'muted' }, 'Their guess before we started: ' + money(gut) + ' a month.') : null,
    h('h2', {}, 'Before the call'),
    h('ul', { class: 'go-list' }, AREAS.map(([area, label]) => {
      const qs = LEVEL1.filter((q) => q.area === area && asked(a, q)), done = qs.filter((q) => a[q.id] !== undefined).length;
      return h('li', {}, h('a', { class: 'go-row plain', href: '#/' + area }, h('span', { class: 'go-name' }, label), h('span', { class: 'go-total' }, done + ' of ' + qs.length), h('span', { class: 'go-sub' }, f.setup[area] ? f.setup[area] + '.' : 'Not answered yet.')));
    })),
    h('h2', {}, 'In the session'),
    l2.length ? h('ul', { class: 'go-list' }, l2.map((x) => h('li', {}, h('a', { class: 'go-row plain', href: '#/ask/' + x.area }, h('span', { class: 'go-name' }, x.label), h('span', { class: 'go-sub' }, x.questions.length + (x.questions.length === 1 ? ' question' : ' questions')))))) : h('p', { class: 'muted' }, 'Answer the questions above first; these open from them.'),
    f.does.length ? h('section', { class: 'card' }, h('h2', {}, 'What the answers do'), h('ul', {}, f.does.map((d) => h('li', {}, d.words)))) : null
  ];
}

// Import answers: the file from "Before our first call", read in this browser; nothing is uploaded.
let loadMsg = '';
function loadCard() {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'The client\'s answers file' });
  const msg = h('p', { class: 'edit-msg', role: 'status' }, loadMsg);
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    let read;
    try { read = readAnswersFile(JSON.parse(await file.text())); } catch (err) { loadMsg = file.name + ': ' + (err instanceof SyntaxError ? 'this is not an answers file.' : err.message); msg.textContent = loadMsg; return; }
    const n = Object.keys(read.answers).length;
    loadMsg = n + (n === 1 ? ' answer' : ' answers') + ' loaded from ' + file.name + (read.gut !== null ? ', and the spending guess' : '') + '.' + (read.problems.length ? ' Not used: ' + read.problems.join('; ') + '.' : '');
    change((s) => loadAnswers(s, read, { today: todayIso() }), 'Answers from ' + file.name + ' loaded');
  });
  return h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => input.click() }, 'Import answers'), input, h('a', { class: 'btn ghost', href: 'before.html' }, 'The client\'s page'), msg);
}

// ---------------------------------------------------------------- one area of Level 1
function areaScreen({ spine }, area) {
  const a = answersOf(spine);
  const qs = LEVEL1.filter((q) => q.area === area && asked(a, q));
  const line = fieldsFor(a).setup[area];
  return [
    h('section', { class: 'card qs' }, ...qs.map((q) => [questionEl(choicesFor(q, a), a[q.id] ?? null, answer(q)), h('p', { class: 'edit-hint' }, q.does)])),
    h('p', { class: 'setup-line' }, h('strong', {}, 'Set up: '), line ? line + '.' : 'nothing yet.')
  ];
}

// ---------------------------------------------------------------- Level 2, with Level 3 on every question
// Two marks on the Profile (owner's ask, 2026-10-27: no "Not sure" there); an old "Not sure" mark shows as neither.
const STATUS_WORDS = { known: 'I know it', lookup: 'I\'ll look it up', notSure: 'Not sure' };
function askScreen({ spine }, area) {
  const a = answersOf(spine), x = level2(a).find((y) => y.area === area);
  if (!x) return h('p', { class: 'card' }, 'Nothing to ask here from the answers so far.');
  const hw = new Map(((spine.coaching && spine.coaching.homework) || []).map((y) => [y.id, y]));
  const mark = (q, status) => change((s) => setHomework(s, q.id, status, { today: todayIso() }), q.label + ': ' + STATUS_WORDS[status].toLowerCase());
  return x.questions.map((q) => {
    const st = hw.get(q.id);
    const trio = h('div', { class: 'segmented q-seg' }, ...['known', 'lookup'].map((k) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(!!st && st.status === k), onclick: () => mark(q, k) }, h('span', { class: 'seg-label' }, STATUS_WORDS[k]))));
    return h('section', { class: 'card qs' },
      q.kind === 'one' ? questionEl(choicesFor(q, a), a[q.id] ?? null, answer(q)) : h('p', { class: 'q-label' }, q.label),
      trio,
      q.kind === 'field' && st && st.status === 'known' ? h('p', { class: 'edit-hint' }, h('a', { href: 'session.html' }, 'Type it in the Session'), ' or ', h('a', { href: 'ledger.html' }, 'in My numbers'), '.') : null,
      q.where ? h('p', { class: 'edit-hint' }, 'Where to find it: ' + whereWords(q) + '.') : null,
      q.does ? h('p', { class: 'edit-hint' }, q.does) : null);
  });
}
const whereWords = (q) => ({ paystub: 'your paystub', benefits: 'your benefits site or HR', plan: 'the plan or brokerage site', card: 'the card app or a statement', studentaid: 'studentaid.gov or your loan servicer', lender: 'the lender app', taxReturn: 'last year\'s tax return', bank: 'bank statements' }[q.where] || q.where);

// ---------------------------------------------------------------- to-dos and life changes
function todoScreen({ spine, rules }) {
  // Still guessing here is the one list of open questions (morning answer 10), not a list of its own.
  const groups = homeworkList(spine, todayIso()), guessing = openQuestions(spine, guessesFor(spine, rules, () => refresh())) || [];
  return [
    groups.length ? groups.map((g) => h('section', { class: 'card' }, h('h2', {}, g.where), h('ul', {}, g.items.map((x) => h('li', {}, x))))) : h('p', { class: 'card' }, 'Nothing to look up yet. In the session, "I\'ll look it up" adds a to-do here.'),
    guessing.length ? h('section', { class: 'card' }, h('h2', {}, 'Still guessing'), h('ul', {}, guessing.map((x) => h('li', {}, x.label)))) : null,
    h('p', { class: 'muted' }, 'These print on the One-pager as the client\'s to-dos.')
  ];
}
function changesScreen({ spine }) {
  const list = [...(spine.lifeChanges || [])].reverse();
  if (!list.length) return h('p', { class: 'card' }, 'No life changes yet. Every Profile answer changed is listed here with its date; Undo takes the last one back.');
  return h('ul', { class: 'go-list' }, list.map((c) => h('li', { class: 'go-row plain' }, h('span', { class: 'go-name' }, changeWords(c)), h('span', { class: 'go-sub' }, shortDate(c.date)))));
}

// The quarterly review: each subscription with what it costs a year and when it was last looked at; Keep it marks it
// reviewed today, Stop it opens the bill to end it. Nothing here is a field to fill in.
function reviewScreen({ spine, rules }) {
  const subs = summarize(spine, rules, { flags: false }).subs;
  if (!subs.items.length) return h('p', { class: 'card' }, 'No subscriptions yet. A bill with a next charge, or moved to Subscriptions, shows here.');
  const today = todayIso();
  const keep = (ids, words) => change((s) => ids.reduce((x, id) => putFact(x, 'expenses.' + id + '.reviewed', today, 'known', today), s), words);
  return [
    h('ul', { class: 'review-list' }, subs.items.map((i) => h('li', { class: 'review-row' + (i.due ? ' is-due' : '') },
      h('p', { class: 'review-what' }, h('strong', {}, i.label), h('span', { class: 'muted' }, (i.yearly === null ? 'cost not given' : money(i.yearly) + ' a year') + ' · ' + (i.reviewed ? 'looked at ' + shortDate(i.reviewed) : 'never looked at'))),
      h('div', { class: 'confirm-acts' },
        h('button', { type: 'button', class: 'btn small', onclick: () => keep([i.id], i.label + ': kept, reviewed today') }, 'Keep it'),
        h('a', { class: 'btn small', href: 'ledger.html#expenses.' + i.id + '.amount' }, 'Stop it'))))),
    (() => { const due = subs.items.filter((i) => i.due); return due.length > 1 ? h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => keep(due.map((i) => i.id), due.length + ' subscriptions kept, reviewed today') }, 'Keep all ' + due.length)) : null; })()
  ];
}

startPage({
  tab: 'profile', title: 'Profile',
  name: (levels) => (levels[0] === 'ask' ? (levels.length === 1 ? 'In the session' : L2_AREAS[levels[1]] || null) : ({ todo: 'To-dos', changes: 'Life changes', life: 'Your life', homework: 'Homework', goals: 'FI assumptions', prefs: 'Preferences', review: 'Quarterly review' })[levels[0]] || AREA_NAMES[levels[0]] || null),
  render: (ctx) => {
    const [l0, l1] = ctx.levels;
    if (!l0) return top(ctx);
    if (l0 === 'life') return lifeScreen(ctx);
    if (l0 === 'homework') return homeworkScreen(ctx);
    if (l0 === 'goals') return goalsScreen(ctx);
    if (l0 === 'prefs') return prefsScreen(ctx);
    if (l0 === 'review') return reviewScreen(ctx);
    if (l0 === 'ask' && !l1) { const l2 = level2(answersOf(ctx.spine)); return l2.length ? h('ul', { class: 'go-list' }, l2.map((x) => h('li', {}, h('a', { class: 'go-row plain', href: '#/ask/' + x.area }, h('span', { class: 'go-name' }, x.label))))) : h('p', { class: 'card' }, 'Nothing to ask yet.'); }
    if (l0 === 'ask') return askScreen(ctx, l1);
    if (l0 === 'todo') return todoScreen(ctx);
    if (l0 === 'changes') return changesScreen(ctx);
    if (AREA_NAMES[l0]) return areaScreen(ctx, l0);
    return h('p', { class: 'card' }, 'Nothing here.');
  }
});
