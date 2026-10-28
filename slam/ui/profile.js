// The Profile (Phase 2.5 B3), a main tab since 2026-10-27: seven groups in one fixed order (Your life, Still guessing,
// Homework, Quarterly review, FI assumptions, Your assumptions, Preferences), each opening its own screen. What is set
// once or rarely changed lives here, off the daily screens, which keep a one-line link. Level 1
// by area (each ends with one line saying what it set up), Level 2 for what Level 1 opened (each question known now,
// looked up later or not sure), the life changes, and the client's to-dos. "Import answers" reads the file the
// client sent from "Before our first call". Every change goes through the shell's change(), so Undo takes it back.
// Formatting only: engine/profile.js.

import { startPage, change, refresh, say } from './shell.js';
import { clientOverrides } from '../engine/assumptions.js';
import { scenarioBar, pickedScenario, pick } from './scenario.js';
import { SCENARIO_WORDS } from '../engine/scenarios.js';
import { prefsScreen, prefsSummary } from './prefs-screen.js';
import { pref } from './prefs.js';
import { h, money, shortDate, todayIso, ledgerHref } from './view.js';
import { questionEl } from './profile-q.js';
import { firstName } from './whose.js';
import { AREAS, LEVEL1, NOT_SURE, asked, choicesFor, disagreements, questionById, answersOf, applyAnswer, fieldsFor, level2, L2_AREAS, setHomework, homeworkList, readAnswersFile, loadAnswers, changeWords, answerWords } from '../engine/profile.js';
import { valueOf as v } from '../engine/spine.js';
import { summarize } from '../engine/summary.js';
import { putFact } from '../engine/edits.js';
import { guessesFor } from './urgency.js';
import { openQuestions } from '../engine/questions.js';
import { ssEstimates, SS_NOT_COUNTED } from '../engine/ss.js';
import { SS_FIELDS } from '../engine/schema.js';

const AREA_NAMES = Object.fromEntries(AREAS);
const answer = (q) => (x) => change((s) => applyAnswer(s, q.id, x, { today: todayIso(), by: 'coach' }), q.label + (x === null ? ' cleared' : ' answered') + '. Logged as a life change');

// ---------------------------------------------------------------- the top: seven groups, one fixed order
// No letter badges (Krug pass): those are only for the six DATING groups in Numbers. A count or a word is a go-count,
// not a go-total: Hide numbers blurs money, never how many answers are in.
const goRow = (href, mark, name, total, sub) => h('li', {}, h('a', { class: 'go-row plain', href }, h('span', { class: 'go-name' }, name), h('span', { class: 'go-sub' }, total !== null ? h('span', { class: 'go-count' }, total) : null, total !== null ? ' ' : null, sub)));
// Answered: a real answer. An old "Not sure" from the client's file is not one (the question shows it as open to ask).
const answered = (a, q) => a[q.id] !== undefined && a[q.id] !== NOT_SURE;
function top({ spine, rules }) {
  const a = answersOf(spine), hw = homeworkList(spine, todayIso()), own = Object.keys(clientOverrides(spine)).length;
  const l1 = LEVEL1.filter((q) => asked(a, q)), done = l1.filter((q) => answered(a, q)).length;
  const todo = hw.reduce((n, g) => n + g.items.length, 0);
  // The one list of open questions (morning answer 10): the same total as Numbers and Still guessing, under that name.
  const open = openQuestions(spine, guessesFor(spine, rules, () => refresh()));
  // The quarterly review (owner's ask, 2026-10-27): each subscription, still wanted or not, every few months.
  const subs = summarize(spine, rules, { flags: false }).subs, due = subs.items.filter((i) => i.due).length;
  const groups = [
    goRow('#/life', 'L', 'Your life', done + ' of ' + l1.length, 'answered'),
    h('li', {}, h('a', { class: 'go-row plain', href: 'ledger.html#/still-guessing' }, h('span', { class: 'go-name' }, 'Still guessing'), h('span', { class: 'go-sub' }, open === null ? 'Working out which guesses matter...' : open.length ? [h('span', { class: 'go-count', 'data-metric': 'list:open' }, String(open.length)), ' missing or worth checking now'] : 'None open'))),
    goRow('#/homework', 'H', 'Homework', String(todo), 'to look up'),
    goRow('#/review', 'R', 'Quarterly review', subs.items.length ? String(due) : null, subs.items.length ? (due === 1 ? 'subscription to look at' : 'subscriptions to look at') : 'no subscriptions yet'),
    goRow('#/goals', 'G', 'FI assumptions', SCENARIO_WORDS[pickedScenario()], 'assumption set'),
    goRow('assumptions.html', 'A', 'Your assumptions', own ? own + ' changed' : 'none changed', own ? 'for this client' : 'all your defaults'),
    goRow('#/prefs', 'P', 'Preferences', null, prefsSummary())
  ];
  // Answers that cannot both be true come first, each with a way to the question that fixes it.
  const odd = disagreements(spine, todayIso());
  return [
    odd.length ? h('section', { class: 'card odd-card', 'aria-labelledby': 'odd-h' }, h('h2', { id: 'odd-h' }, odd.length === 1 ? 'Two answers disagree' : 'Some answers disagree (' + odd.length + ')'),
      h('ul', { class: 'odd-list' }, odd.map((x) => h('li', {}, h('p', {}, x.words), h('a', { class: 'btn small', href: x.path ? ledgerHref(x.path) : '#/' + questionById(x.ids[x.ids.length - 1]).area }, 'Fix it'))))) : null,
    // Import answers is the coach's tool: client view hides it (Preferences).
    pref('view') === 'client' ? null : loadCard(),
    h('ul', { class: 'go-list', 'aria-label': 'Profile' }, groups)
  ];
}
function goalsScreen({ spine, rules }) {
  // A set is picked outside the household (ui/scenario.js), so the bar says it and offers Undo the way a change does.
  const was = pickedScenario();
  return [
    h('section', { class: 'card', 'aria-labelledby': 'gs-set' }, h('h2', { id: 'gs-set' }, 'Assumption set'),
      h('p', { class: 'muted' }, 'Every FI number on Home, Numbers, Plan and the One-pager reads this set.'),
      scenarioBar(spine, rules, was, (id) => { refresh(); say('Assumption set: ' + SCENARIO_WORDS[id], () => { pick(was); refresh(); }, () => { pick(id); refresh(); }); })),
    // The household's own FI assumptions (return, inflation, withdrawal rate, life expectancy) are one row away.
    h('ul', { class: 'go-list' },
      h('li', {}, h('a', { class: 'go-row plain', href: 'ledger.html#/profile/fi-assumptions' }, h('span', { class: 'go-name' }, 'Return, inflation and withdrawal rate'), h('span', { class: 'go-sub' }, 'This household\'s own'))),
      h('li', {}, h('a', { class: 'go-row plain', href: 'ledger.html#/goals' }, h('span', { class: 'go-name' }, 'Goals'), h('span', { class: 'go-sub' }, 'In Numbers')))),
    ssCard(spine)
  ];
}
// A Social Security estimate (S-267), from the SSA statement (ssa.gov/myaccount). Recorded only; not counted yet.
function ssCard(spine) {
  const est = ssEstimates(spine), people = (spine.household && spine.household.people) || [];
  const add = () => change((s) => { let x = s; for (const p of people) for (const k of Object.keys(SS_FIELDS)) if (!p[k]) x = putFact(x, 'household.people.' + p.id + '.' + k, null, 'missing', todayIso()); return x; }, 'Social Security estimate added. Type it from the statement');
  return h('section', { class: 'card', 'aria-labelledby': 'gs-ss' }, h('h2', { id: 'gs-ss' }, 'Social Security estimate'),
    est.length ? h('ul', {}, est.map((e) => h('li', {}, e.person + ': ' + [[e.at62, 'at 62'], [e.atFra, 'at full retirement age'], [e.at70, 'at 70']].filter(([n]) => typeof n === 'number').map(([n, w]) => money(n) + ' a month ' + w).join(', ') + (e.asOf ? ' (statement of ' + shortDate(e.asOf) + ')' : ''))))
      : h('p', { class: 'muted' }, 'From your statement at ssa.gov: what you would get a month at 62, at full retirement age and at 70.'),
    h('p', { class: 'edit-hint' }, SS_NOT_COUNTED),
    h('div', { class: 'edit-actions' }, people.some((p) => p.ssAt62 || p.ssAtFra || p.ssAt70)
      ? h('a', { class: 'btn', href: 'ledger.html#/profile/social-security-estimate' }, 'Change the estimate')
      : h('button', { type: 'button', class: 'btn', onclick: () => { add(); location.href = 'ledger.html#/profile/social-security-estimate'; } }, 'Add the estimate')));
}
function homeworkScreen(ctx) {
  const changes = (ctx.spine.lifeChanges || []).length;
  return [...todoScreen(ctx).flat(), h('ul', { class: 'go-list' }, goRow('#/changes', 'C', 'Life changes', String(changes), changes === 1 ? 'answer changed, with its date' : 'answers changed, with their dates'))];
}
function lifeScreen({ spine }) {
  const a = answersOf(spine), f = fieldsFor(a), l2 = level2(a);
  const gut = spine.household.gutSpending ? v(spine.household.gutSpending) : null;
  return [
    gut !== null ? h('p', { class: 'muted' }, 'Their guess before we started: ' + money(gut) + ' a month.') : null,
    h('h2', {}, 'Before the call'),
    // Each area: how many are answered, then what those answers set up on its own line (an area that sets nothing
    // up, like Why now, says only the count).
    h('ul', { class: 'go-list' }, AREAS.map(([area, label]) => {
      const qs = LEVEL1.filter((q) => q.area === area && asked(a, q)), done = qs.filter((q) => answered(a, q)).length;
      return goRow('#/' + area, 'L', label, done + ' of ' + qs.length, ['answered', f.setup[area] ? h('span', { class: 'line' }, f.setup[area] + '.') : null]);
    })),
    h('h2', {}, 'On the call'),
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
  // The client's page has no header or tabs (it is theirs), so it opens in its own tab and the line under says what it is.
  return h('div', {}, h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => input.click() }, 'Import answers'), input, h('a', { class: 'btn ghost', href: 'before.html', target: '_blank', rel: 'noopener' }, 'Open Before our first call')),
    h('p', { class: 'edit-hint' }, 'The client answers these before the call; Import answers reads the file they send.'), msg);
}

// ---------------------------------------------------------------- one area of Level 1
function areaScreen({ spine }, area) {
  const a = answersOf(spine);
  const qs = LEVEL1.filter((q) => q.area === area && asked(a, q));
  const line = fieldsFor(a).setup[area];
  // A client named from the client menu has no first-name answer yet: the box shows the household's name until one is typed.
  const shown = (q) => (q.id === 'firstName' && a.firstName === undefined ? householdFirst(spine) : a[q.id] ?? null);
  return [
    h('section', { class: 'card qs' }, ...qs.map((q) => [questionEl(choicesFor(q, a), shown(q), answer(q)), h('p', { class: 'edit-hint' }, q.does)])),
    line ? h('p', { class: 'setup-line' }, h('strong', {}, 'Set up: '), line + '.') : null
  ];
}
const householdFirst = (spine) => { const p = spine.household && spine.household.people && spine.household.people[0]; return p && p.name && p.name !== 'You' ? firstName(p) : null; };

// ---------------------------------------------------------------- Level 2, with Level 3 on every question
// Two marks on the Profile (owner's ask, 2026-10-27: no "Not sure" there); an old "Not sure" mark shows as neither.
// The marks are buttons, not a second answer strip: a choice question gets only "I'll look it up" (only a look-up
// reaches the homework); a number gets both, under "Do you have this number?". A pressed mark stays until Undo.
const STATUS_WORDS = { known: 'I know it', lookup: 'I\'ll look it up', notSure: 'Not sure' };
function askScreen({ spine }, area) {
  const a = answersOf(spine), x = level2(a).find((y) => y.area === area);
  if (!x) return h('p', { class: 'card' }, 'Nothing to ask here from the answers so far.');
  const hw = new Map(((spine.coaching && spine.coaching.homework) || []).map((y) => [y.id, y]));
  const mark = (q, status) => change((s) => setHomework(s, q.id, status, { today: todayIso() }), q.label + ': ' + STATUS_WORDS[status]);
  const markBtn = (q, st, k) => { const on = !!st && st.status === k; return h('button', { type: 'button', class: 'btn small toggle', 'aria-pressed': String(on), onclick: () => { if (!on) mark(q, k); } }, STATUS_WORDS[k]); };
  return x.questions.map((q) => {
    const st = hw.get(q.id);
    return h('section', { class: 'card qs' },
      q.kind === 'one'
        ? [questionEl(choicesFor(q, a), a[q.id] ?? null, answer(q)), h('div', { class: 'edit-actions' }, markBtn(q, st, 'lookup'))]
        : [h('p', { class: 'q-label' }, q.label), h('p', { class: 'mini-label' }, 'Do you have this number?'), h('div', { class: 'edit-actions' }, markBtn(q, st, 'known'), markBtn(q, st, 'lookup'))],
      q.kind === 'field' && st && st.status === 'known' ? h('p', { class: 'edit-hint' }, h('a', { href: 'ledger.html?guide=1' }, 'Type it in Guide me'), ' or ', h('a', { href: 'ledger.html' }, 'in Numbers'), '.') : null,
      q.where ? h('p', { class: 'edit-hint' }, 'Where to find it: ' + whereWords(q) + '.') : null,
      q.does ? h('p', { class: 'edit-hint' }, q.does) : null);
  });
}
const whereWords = (q) => ({ paystub: 'your paystub', benefits: 'your benefits site or HR', plan: 'the plan or brokerage site', card: 'the card app or a statement', studentaid: 'studentaid.gov or your loan servicer', lender: 'the lender app', taxReturn: 'last year\'s tax return', bank: 'bank statements' }[q.where] || q.where);

// ---------------------------------------------------------------- to-dos and life changes
// The open questions are not listed here: the Still guessing row one level up is the one list (S-252), with its links.
function todoScreen({ spine }) {
  const groups = homeworkList(spine, todayIso());
  return [
    groups.length ? groups.map((g) => h('section', { class: 'card' }, h('h2', {}, g.where), h('ul', {}, g.items.map((x) => h('li', {}, x))))) : h('p', { class: 'card' }, 'Nothing to look up yet. On the call, "I\'ll look it up" adds a to-do here.'),
    h('p', { class: 'muted' }, 'These print on the One-pager as the client\'s to-dos.')
  ];
}
function changesScreen({ spine }) {
  const list = [...(spine.lifeChanges || [])].reverse();
  if (!list.length) return h('p', { class: 'card' }, 'No life changes yet. Every Profile answer changed is listed here with its date; Undo takes the last one back.');
  // Plain lines (nothing here opens anything): the question, then "Was X. Now Y." in the option words, and the date.
  const row = (c) => {
    const q = c.kind === 'target' ? null : questionById(c.question);
    return h('li', {}, h('div', {}, h('strong', {}, q ? q.label : changeWords(c))), h('div', { class: 'muted' }, q ? 'Was ' + answerWords(q, c.from) + '. Now ' + answerWords(q, c.to) + '. ' : '', shortDate(c.date)));
  };
  return h('section', { class: 'card' }, h('ul', { class: 'change-list' }, list.map(row)));
}

// The quarterly review: each subscription with what it costs a year and when it was last looked at; Keep it marks it
// reviewed today, Open the bill goes to it in Numbers to end or change it. Nothing here is a box to fill in.
function reviewScreen({ spine, rules }) {
  const subs = summarize(spine, rules, { flags: false }).subs;
  if (!subs.items.length) return h('p', { class: 'card' }, 'No subscriptions yet. A bill with a next charge, or moved to Subscriptions, shows here.');
  const today = todayIso();
  const keep = (ids, words) => change((s) => ids.reduce((x, id) => putFact(x, 'expenses.' + id + '.reviewed', today, 'known', today), s), words);
  return [
    h('ul', { class: 'review-list' }, subs.items.map((i) => h('li', { class: 'review-row' + (i.due ? ' is-due' : '') },
      h('p', { class: 'review-what' }, h('strong', {}, i.label), h('span', { class: 'muted' }, i.yearly === null ? 'cost not given' : [h('span', { class: 'num' }, money(i.yearly)), ' a year'], ' · ' + (i.reviewed ? 'looked at ' + shortDate(i.reviewed) : 'never looked at'))),
      h('div', { class: 'confirm-acts' },
        h('button', { type: 'button', class: 'btn small', onclick: () => keep([i.id], i.label + ': kept, reviewed today') }, 'Keep it'),
        h('a', { class: 'btn small', href: 'ledger.html#expenses.' + i.id + '.amount' }, 'Open the bill'))))),
    (() => { const due = subs.items.filter((i) => i.due); return due.length > 1 ? h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => keep(due.map((i) => i.id), due.length + ' subscriptions kept, reviewed today') }, 'Keep all ' + due.length)) : null; })()
  ];
}

startPage({
  // Opened from the client menu, so no main tab is lit (as the Builder pages do): the trail reads client > Profile.
  tab: null, title: 'Profile',
  // #/todo is the old address of the homework (Home's "All N to-dos" and the One-pager link to it): one list, one name.
  name: (levels) => (levels[0] === 'ask' ? (levels.length === 1 ? 'On the call' : L2_AREAS[levels[1]] || null) : ({ todo: 'Homework', changes: 'Life changes', life: 'Your life', homework: 'Homework', goals: 'FI assumptions', prefs: 'Preferences', review: 'Quarterly review' })[levels[0]] || AREA_NAMES[levels[0]] || null),
  render: (ctx) => {
    const [l0, l1] = ctx.levels;
    if (!l0) return top(ctx);
    if (l0 === 'life') return lifeScreen(ctx);
    if (l0 === 'homework' || l0 === 'todo') return homeworkScreen(ctx);
    if (l0 === 'goals') return goalsScreen(ctx);
    if (l0 === 'prefs') return prefsScreen(ctx);
    if (l0 === 'review') return reviewScreen(ctx);
    if (l0 === 'ask' && !l1) { const l2 = level2(answersOf(ctx.spine)); return l2.length ? h('ul', { class: 'go-list' }, l2.map((x) => h('li', {}, h('a', { class: 'go-row plain', href: '#/ask/' + x.area }, h('span', { class: 'go-name' }, x.label))))) : h('p', { class: 'card' }, 'Nothing to ask yet.'); }
    if (l0 === 'ask') return askScreen(ctx, l1);
    if (l0 === 'changes') return changesScreen(ctx);
    if (AREA_NAMES[l0]) return areaScreen(ctx, l0);
    return h('p', { class: 'card' }, 'Nothing here.');
  }
});
