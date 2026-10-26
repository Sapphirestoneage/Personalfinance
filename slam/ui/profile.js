// The Profile (Phase 2.5 B3), opened by tapping the client's name in the header; the six tabs do not change. Level 1
// by area (each ends with one line saying what it set up), Level 2 for what Level 1 opened (each question known now,
// looked up later or not sure), the life changes, and the client's to-dos. "Load client answers" reads the file the
// client sent from "Before our first call". Every change goes through the shell's change(), so Undo takes it back.
// Formatting only: engine/profile.js.

import { startPage, change } from './shell.js';
import { h, money, shortDate } from './view.js';
import { questionEl } from './profile-q.js';
import { AREAS, LEVEL1, asked, answersOf, applyAnswer, fieldsFor, level2, L2_AREAS, setHomework, homeworkList, stillGuessing, readAnswersFile, loadAnswers, changeWords } from '../engine/profile.js';
import { valueOf as v } from '../engine/spine.js';

const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const AREA_NAMES = Object.fromEntries(AREAS);
const answer = (q) => (x) => change((s) => applyAnswer(s, q.id, x, { today: todayIso(), by: 'coach' }), q.label + (x === null ? ' cleared' : ' answered') + '. Logged as a life change');

// ---------------------------------------------------------------- the top
function top({ spine }) {
  const a = answersOf(spine), f = fieldsFor(a), l2 = level2(a), hw = homeworkList(spine), changes = spine.lifeChanges || [];
  const gut = spine.household.gutSpending ? v(spine.household.gutSpending) : null;
  return [
    h('p', { class: 'lede' }, 'How life works right now. An answer changes which fields show and what the numbers mean; nothing typed is deleted.'),
    loadCard(),
    gut !== null ? h('p', { class: 'muted' }, 'Their guess before we started: ' + money(gut) + ' a month.') : null,
    h('h2', {}, 'Before the call'),
    h('ul', { class: 'go-list' }, AREAS.map(([area, label]) => {
      const qs = LEVEL1.filter((q) => q.area === area && asked(a, q)), done = qs.filter((q) => a[q.id] !== undefined).length;
      return h('li', {}, h('a', { class: 'go-row plain', href: '#/' + area }, h('span', { class: 'go-name' }, label), h('span', { class: 'go-total' }, done + ' of ' + qs.length), h('span', { class: 'go-sub' }, f.setup[area] ? f.setup[area] + '.' : 'Not answered yet.')));
    })),
    h('h2', {}, 'In the session'),
    l2.length ? h('ul', { class: 'go-list' }, l2.map((x) => h('li', {}, h('a', { class: 'go-row plain', href: '#/ask/' + x.area }, h('span', { class: 'go-name' }, x.label), h('span', { class: 'go-sub' }, x.questions.length + (x.questions.length === 1 ? ' question' : ' questions')))))) : h('p', { class: 'muted' }, 'Answer the questions above first; these open from them.'),
    f.does.length ? h('section', { class: 'card' }, h('h2', {}, 'What the answers do'), h('ul', {}, f.does.map((d) => h('li', {}, d.words)))) : null,
    h('ul', { class: 'go-list' },
      h('li', {}, h('a', { class: 'go-row plain', href: '#/todo' }, h('span', { class: 'go-name' }, 'To-dos'), h('span', { class: 'go-total' }, String(hw.reduce((n, g) => n + g.items.length, 0))), h('span', { class: 'go-sub' }, 'What to look up, and where.'))),
      h('li', {}, h('a', { class: 'go-row plain', href: '#/changes' }, h('span', { class: 'go-name' }, 'Life changes'), h('span', { class: 'go-total' }, String(changes.length)), h('span', { class: 'go-sub' }, 'Every answer changed, with its date.'))))
  ];
}

// Load client answers: the file from "Before our first call", read in this browser; nothing is uploaded.
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
  return h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => input.click() }, 'Load client answers'), input, h('a', { class: 'btn ghost', href: 'before.html' }, 'The client\'s page'), msg);
}

// ---------------------------------------------------------------- one area of Level 1
function areaScreen({ spine }, area) {
  const a = answersOf(spine);
  const qs = LEVEL1.filter((q) => q.area === area && asked(a, q));
  const line = fieldsFor(a).setup[area];
  return [
    h('section', { class: 'card qs' }, ...qs.map((q) => [questionEl(q, a[q.id] ?? null, answer(q)), h('p', { class: 'edit-hint' }, q.does)])),
    h('p', { class: 'setup-line' }, h('strong', {}, 'Set up: '), line ? line + '.' : 'nothing yet.')
  ];
}

// ---------------------------------------------------------------- Level 2, with Level 3 on every question
const STATUS_WORDS = { known: 'I know it', lookup: 'I\'ll look it up', notSure: 'Not sure' };
function askScreen({ spine }, area) {
  const a = answersOf(spine), x = level2(a).find((y) => y.area === area);
  if (!x) return h('p', { class: 'card' }, 'Nothing to ask here from the answers so far.');
  const hw = new Map(((spine.coaching && spine.coaching.homework) || []).map((y) => [y.id, y]));
  const mark = (q, status) => change((s) => setHomework(s, q.id, status, { today: todayIso() }), q.label + ': ' + STATUS_WORDS[status].toLowerCase());
  return x.questions.map((q) => {
    const st = hw.get(q.id);
    const trio = h('div', { class: 'segmented q-seg' }, ...['known', 'lookup', 'notSure'].map((k) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(!!st && st.status === k), onclick: () => mark(q, k) }, h('span', { class: 'seg-label' }, STATUS_WORDS[k]))));
    return h('section', { class: 'card qs' },
      q.kind === 'one' ? questionEl(q, a[q.id] ?? null, answer(q)) : h('p', { class: 'q-label' }, q.label),
      trio,
      q.kind === 'field' && st && st.status === 'known' ? h('p', { class: 'edit-hint' }, h('a', { href: 'session.html' }, 'Type it in the Session'), ' or ', h('a', { href: 'ledger.html' }, 'in My numbers'), '.') : null,
      q.where ? h('p', { class: 'edit-hint' }, 'Where to find it: ' + whereWords(q) + '.') : null,
      q.does ? h('p', { class: 'edit-hint' }, q.does) : null);
  });
}
const whereWords = (q) => ({ paystub: 'your paystub', benefits: 'your benefits site or HR', plan: 'the plan or brokerage site', card: 'the card app or a statement', studentaid: 'studentaid.gov or your loan servicer', lender: 'the lender app', taxReturn: 'last year\'s tax return', bank: 'bank statements' }[q.where] || q.where);

// ---------------------------------------------------------------- to-dos and life changes
function todoScreen({ spine }) {
  const groups = homeworkList(spine), guessing = stillGuessing(spine);
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

startPage({
  tab: null, title: 'Profile', parent: ['Today', 'dashboard.html'],
  name: (levels) => (levels[0] === 'ask' ? L2_AREAS[levels[1]] || null : levels[0] === 'todo' ? 'To-dos' : levels[0] === 'changes' ? 'Life changes' : AREA_NAMES[levels[0]] || null),
  render: (ctx) => {
    const [l0, l1] = ctx.levels;
    if (!l0) return top(ctx);
    if (l0 === 'ask') return askScreen(ctx, l1);
    if (l0 === 'todo') return todoScreen(ctx);
    if (l0 === 'changes') return changesScreen(ctx);
    if (AREA_NAMES[l0]) return areaScreen(ctx, l0);
    return h('p', { class: 'card' }, 'Nothing here.');
  }
});
