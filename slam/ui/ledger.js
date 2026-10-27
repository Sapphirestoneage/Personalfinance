// My numbers (S-169, S-231): every answer the household has given, screen by screen in DATING order (D Debt, A Assets,
// T Taxes, I Income, N Needs, G Goals). The top lists the six sections, each with one total; a section opens its
// groups (Credit cards), a group its items (Amex Blue), an item its rows, and a row its editor in place. Each level is
// its own screen and history entry (the shell, ui/shell.js): Back, the trail and the browser's back go up one level,
// and coming back restores the scroll, the open row, the search and the filter. Every change goes through the
// shell's change(), in words, so it can be undone; a delete never asks. Formatting only: the tree and its screens
// come from engine/ledger-tree.js, the totals from engine/summary.js.

import { HOUSEHOLD_ANSWERS, addLookups } from '../engine/profile.js';
import { startPage, change, said, go, keep, kept, refresh, say, current, reopen, restoreScroll } from './shell.js';
import { rowPathFor, previewCost, linkOptions, linkName, coveredByOthers, basisFromYears } from '../engine/ledger.js';
import { payersOf, shareOf } from '../engine/sharing.js';
import { mathButton } from './math-panel.js';
import { addForm as newAddForm, focusAdd } from './add-form.js';
import { maxItPanel } from './maxit-panel.js';
import { chargesCard } from './card-charges.js';
import { foldRow } from './rows.js';
import { debtTab } from './debt-tab.js';
import { debtView } from '../engine/debtview.js';
import { planDebtExtra } from '../engine/plan.js';
import { forecast } from './forecast.js';
import { withScenario, SCENARIO_WORDS } from '../engine/scenarios.js';
import { pickedScenario, scenarioText } from './scenario.js';
import { canMaxIt } from '../engine/maxit.js';
import { summarize, sessionSteps } from '../engine/summary.js';
import { unemploymentView, tenPercentOf } from '../engine/unemployment.js';
import { STARTER, haveCounts, addPicked } from '../engine/starter.js';
import { downloadProfile, matchesFile, setBaseline, loadFailWords, FILE_NAME } from './profile-file.js';
import { fileProblems } from '../engine/normalize.js';
import { isSubscription } from '../engine/subscriptions.js';
import { ledgerTree, numbersScreens, screenAt, levelsFor, statementOrder } from '../engine/ledger-tree.js';
import { PRESETS, CADENCES, FAT, PER_YEAR } from '../engine/schema.js';
import { editPayment, duplicateItem, editIncome, recordContribution, setThroughPayroll, TOTAL_KINDS, setFixed, chargeTo, setChargeDay, markSubscription, addFee, setCheck } from '../engine/edits.js';
import { parseInput, inputText, editFact, putFact, parseCardRate, editCardRate, editExpense, setSectionSharing, addItem, removeItem, bulkEdit } from '../engine/edits.js';
import { isPhone } from '../engine/defaults.js';
import { getAt, setAt, valueOf, whoSupplies } from '../engine/spine.js';
import { loadAll, forgetSaved, loadMyFile, whose } from './household.js';
import { guessesFor, mapOf, worthNow, checkInWords } from './urgency.js';
import { shareEditor, threeNumbers } from './share-editor.js';
import { setSharers, owedToYou } from '../engine/owed.js';
import { owedScreen, personScreen, owedFigure, personSlug, resetOwedForms } from './owed.js';
import { whereTable } from './where-data.js';
import { withWhere, sortGuesses, groupGuesses, SORTS } from '../engine/where.js';
import { h, chip, showValue, money, words, shortDate, ledgerHref, summaryMoney, todayIso } from './view.js';

const MOVE_WORDS = { surplus: 'money left each month', netWorth: 'net worth', outlook: 'cash in 24 months', fiImplied: 'FI number', taxDue: 'tax due' };
const BLOCK_WORDS = { surplus: 'surplus', runway: 'runway', yearsToFi: 'years to FI', taxDue: 'tax', outlook: '24-month outlook', utilization: 'utilization', netWorth: 'net worth', fiPercent: 'FI percent', fiNumber: 'FI number', fiImplied: 'FI from spending', promoMonthly: 'promo plan' };
// What each section's one total means, in a client's words (the totals come from engine/summary.js sessionSteps).
const TOTAL_WORDS = { needs: ' a month', debt: ' owed', income: ' a month before tax', assets: ' in what you own', goals: ' in goals' };

// What the page holds between draws. rules, inst and source follow the shell (current()); the rest is this page's.
let rules = null, inst = null, source = null, screenKey = null, based = false;
// The open editor is built once while it is open (LIVE-FORM: built once), so a redraw never drops what is typed in it.
// dirty: something was typed there and not saved yet (S-164).
let dirty = false, edCache = null;
// What is open on this screen and is not worth a history entry: an add form, the section's sharing form.
let adding = null, sharingOpen = null;
// Select several: the picked rows, kept while moving between screens so one action can cover them all.
let selecting = false, selected = new Set();
// Quick add: the ticked starters.
let picking = null;
// A link waiting to land: { key, patch, scroll, block } (the screen, what to keep there, what to scroll to).
let pending = null;
const cur = () => current().spine;
// Today in the person's own time zone, not UTC (an evening edit is today's).
const today = () => todayIso();

// The screens, built once per version of the household.
let scMemo = { spine: null, inst: null, sc: null };
function screensOf(spine) {
  if (scMemo.spine !== spine || scMemo.inst !== inst) scMemo = { spine, inst, sc: statementOrder(numbersScreens(ledgerTree(spine, inst || { names: [], aliases: {} })), spine, summaryOf(spine)) };
  return scMemo.sc;
}
// Every row by its path, once per version of the screens (Still guessing and Subscriptions open a row in place).
let byPathMemo = { sc: null, map: null };
function rowByPath(path) {
  const sc = screensOf(cur());
  if (byPathMemo.sc !== sc) byPathMemo = { sc, map: new Map(sc.sections.flatMap((g) => g.allRows).map((r) => [r.path, r])) };
  return byPathMemo.map.get(path) || null;
}
// The household's numbers, figured once per version (the section totals and the subscriptions read them).
let sumMemo = { spine: null, s: null };
function summaryOf(spine) {
  if (sumMemo.spine !== spine) sumMemo = { spine, s: summarize(spine, rules, { flags: false }) };
  return sumMemo.s;
}
// The FI numbers read the assumption set picked on Today, like Today and the One-pager (question 122).
let fiMemo = { spine: null, set: null, rules: null, ctx: null };
function fiCtx(spine) {
  const set = pickedScenario();
  if (fiMemo.spine !== spine || fiMemo.set !== set || fiMemo.rules !== rules) { const sp = withScenario(spine, rules, set); fiMemo = { spine, set, rules, ctx: { spine: sp, rules, s: summarize(sp, rules, { flags: false }) } }; }
  return fiMemo.ctx;
}

const hashFor = (levels) => '#/' + levels.map(encodeURIComponent).join('/');
// Open a field (or an item, or a whole list) on its own screen, with the field's editor open.
// A suggested value for one field, left by a card on Today; read once.
function takePrefill(path) {
  try {
    const p = JSON.parse(sessionStorage.getItem('slam-prefill:v1') || 'null');
    if (!p || p.path !== path) return null;
    sessionStorage.removeItem('slam-prefill:v1');
    return p.value;
  } catch { return null; }
}
function openField(path) {
  if (!canLeave()) return;
  const { levels, row } = levelsFor(screensOf(cur()), cur(), path);
  selecting = false;
  land(levels, { open: row }, row ? { id: 'f-' + row, block: 'center', focus: true } : null);
}
// A link to ledger.html#max:<account> opens that account with its "How much to max it?" panel.
function openMax(id) {
  const levels = screensOf(cur()).itemLevels.get('accounts.' + id);
  if (!levels || !canLeave()) return;
  selecting = false;
  land(levels, { max: true }, { id: 'max-' + id, block: 'start' });
}
function land(levels, patch, scroll) {
  const key = levels.join('/');
  pending = { key, patch, scroll };
  if (key === screenKey) refresh(); else go(levels);
}
// A link that opens a field: a real address for the screen, and the field's editor open when it lands.
const fieldLink = (path, kids, attrs = {}) => {
  const { levels } = levelsFor(screensOf(cur()), cur(), path);
  return h('a', { ...attrs, href: hashFor(levels), onclick: (e) => { e.preventDefault(); openField(path); } }, kids);
};

// ---------------------------------------------------------------- the open editor
// Leaving an editor with unsaved typing on this screen is refused with a message, never silent.
function canLeave() {
  // A copy or a contribution typed into its small form and not saved yet holds the page too.
  const form = [...document.querySelectorAll('.dup-form, .rec-form')].find((f) => { const i = f.querySelector('input'); return i.value.trim() !== (i.dataset.start || ''); });
  if (form) {
    const msg = form.querySelector('.edit-msg');
    if (msg) msg.textContent = 'Not saved yet. Save it or choose Cancel.';
    form.querySelector('input').focus();
    return false;
  }
  if (!dirty || !edCache || !document.contains(edCache.el)) return true;
  const msg = edCache.el.querySelector('.edit-msg');
  if (msg) msg.textContent = 'Not saved yet. Choose Save, Save as a guess, or Cancel.';
  const i = document.getElementById('edit-input');
  if (i) { i.scrollIntoView({ block: 'center' }); i.focus({ preventScroll: true }); }
  return false;
}
function setOpen(path) { keep({ open: path }); dirty = false; edCache = null; refresh(); }
function closeEditor() { keep({ open: null }); dirty = false; edCache = null; }
const cancel = () => { closeEditor(); refresh(); };
// Save from an editor: it closes, and the change goes through the shell in words.
function done(next, text) { closeEditor(); change(next, text); }
const confirmed = (label) => label + ' confirmed';
const notMine = (label) => label + ' marked not for me';

// An editor is a form: Enter saves (as known), typing marks it unsaved.
function editorForm(onSubmit, ...kids) {
  return h('form', { class: 'editor', novalidate: true, onsubmit: (e) => { e.preventDefault(); onSubmit(); }, oninput: () => { dirty = true; }, onchange: () => { dirty = true; } }, ...kids);
}

// Need or want (S-231): two plain tags on every line in Needs. The stored answer stays a yes or no (expenses.<id>.need).
const isNeedRow = (path) => /^expenses\.[^.]+\.need$/.test(path);
const needWords = (v) => (v === true ? 'Need' : v === false ? 'Want' : null);
const shownAs = (row, value) => (isNeedRow(row.path) ? needWords(value) : showValue(value, row.type));

// Check later and check now (rough now and rough later, replacing Not now): stored on the number's Fact with its date
// (engine/edits.js setCheck), so it lasts across browsers and reloads and Undo takes it back. A later date that passes
// makes the number "check now" and puts it in the homework.
const addMonthsIso = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const checkOf = (path) => { const f = getAt(cur(), path); return f && f.check ? f.check : null; };
function laterBtn(row) {
  if (row.fact.kind !== 'missing' && row.fact.kind !== 'rough') return null;
  const c = checkOf(row.path);
  const put = (mode, until, words) => { closeEditor(); change((s) => setCheck(s, row.path, mode, until, today()), words); };
  const when = h('input', { type: 'date', 'aria-label': 'Check again on', min: today() });
  return [
    c && c.mode === 'later' ? h('button', { type: 'button', class: 'btn', onclick: () => put(null, null, row.label + ': check again now') }, 'Check now') : null,
    !c || c.mode !== 'now' ? h('button', { type: 'button', class: 'btn', onclick: () => put('now', null, row.label + ': worth checking now') }, 'Mark check now') : h('button', { type: 'button', class: 'btn', onclick: () => put(null, null, row.label + ': mark taken off') }, 'Clear the mark'),
    h('button', { type: 'button', class: 'btn', onclick: () => put('later', addMonthsIso(today(), 1), row.label + ': check again next month') }, 'Check next month'),
    h('button', { type: 'button', class: 'btn', onclick: () => put('later', addMonthsIso(today(), 3), row.label + ': check again in 3 months') }, 'Check in 3 months'),
    h('div', { class: 'later-pick' }, when, h('button', { type: 'button', class: 'btn', onclick: () => { if (!when.value) { say('Pick a day first'); when.focus(); return; } put('later', when.value, row.label + ': check again ' + shortDate(when.value)); } }, 'Check on that day'))
  ];
}

// One panel for a card's interest rate (S-161): the APR, a switch for an intro
// rate, and when it is on, the intro rate and its end date; the APR then reads
// "Rate after intro". The switch shows and hides fields in place, so nothing
// typed is lost.
function cardRateEditor(row) {
  const cardId = row.path.split('.')[1];
  const cur0 = row.fact.value || { apr: null, intro: null };
  const startOn = !!cur0.intro;
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const fallback = showValue(rules.get('DEFAULT_CARD_APR', +cur().meta.asOf.slice(0, 4)), 'rate');
  const apr = h('input', { id: 'edit-input', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  apr.value = inputText('rate', cur0.apr);
  const aprLabel = h('label', { for: 'edit-input', class: 'edit-label' }, startOn ? 'Rate after intro' : 'Interest rate (APR)');
  const afterNote = h('span', {}, startOn ? 'Starts the day after the intro ends. ' : '');
  const aprHint = h('p', { class: 'edit-hint' }, afterNote, '25 means 25%. Blank uses a typical ' + fallback + ', marked as a guess.');
  const introRate = h('input', { id: 'intro-rate', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  introRate.value = cur0.intro ? inputText('rate', cur0.intro.rate) : '0';
  const introEnds = h('input', { id: 'intro-ends', type: 'date' });
  introEnds.value = (cur0.intro && cur0.intro.ends) || '';
  // Deferred interest (owner's ask, 2026-10-27): its own question in the intro, with "Not sure" as an answer. Not sure
  // is kept as not known (a thing to check on the statement), never as a no.
  let deferredPick = cur0.intro && cur0.intro.deferred === true ? 'yes' : cur0.intro && cur0.intro.deferred === false ? 'no' : cur0.intro ? 'notSure' : 'no';
  const defBtns = [['yes', 'Yes'], ['no', 'No'], ['notSure', 'Not sure']].map(([k, w]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(deferredPick === k), onclick: () => { deferredPick = k; for (const b of defBtns) b.setAttribute('aria-pressed', String(b.dataset.k === k)); dirty = true; } }, w));
  defBtns.forEach((b, i) => { b.dataset.k = ['yes', 'no', 'notSure'][i]; });
  const deferred = h('div', { class: 'deferred-q', role: 'group', 'aria-labelledby': 'deferred-h' },
    h('p', { class: 'edit-label', id: 'deferred-h' }, 'Deferred interest?'),
    h('p', { class: 'edit-hint' }, 'If any balance is left when the intro ends, interest is charged back to the start. The card\'s terms say; store cards often have it.'),
    h('div', { class: 'segmented' }, defBtns));
  const introBox = h('div', { class: 'intro-fields', hidden: !startOn },
    h('label', { for: 'intro-rate', class: 'edit-label' }, 'Intro rate'), introRate,
    h('label', { for: 'intro-ends', class: 'edit-label' }, 'Intro ends'), introEnds,
    deferred);
  const state = h('span', { class: 'switch-state' }, startOn ? 'Yes' : 'No');
  const sw = h('button', {
    type: 'button', class: 'switch', role: 'switch', id: 'intro-switch', 'aria-checked': String(startOn), 'aria-labelledby': 'intro-switch-label',
    onclick: () => {
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(on));
      state.textContent = on ? 'Yes' : 'No';
      introBox.hidden = !on;
      aprLabel.textContent = on ? 'Rate after intro' : 'Interest rate (APR)';
      afterNote.textContent = on ? 'Starts the day after the intro ends. ' : '';
      dirty = true;
      if (on) introRate.focus();
    }
  }, h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-knob' })), state);
  const doSet = (kind) => {
    const p = parseCardRate({ apr: apr.value, hasIntro: sw.getAttribute('aria-checked') === 'true', introRate: introRate.value, introEnds: introEnds.value, deferred: deferredPick === 'yes' ? true : deferredPick === 'no' ? false : 'notSure' });
    if (!p.ok) { msg.textContent = p.message; return; }
    done(editCardRate(cur(), cardId, 'set', { value: p.value, kind, today: today() }), said.changed(row.label, showValue({ apr: p.value.apr ?? rules.get('DEFAULT_CARD_APR', +cur().meta.asOf.slice(0, 4)), intro: p.value.intro }, 'cardRate') + (kind === 'rough' ? ' (a guess)' : '')));
  };
  const act = (action) => done(editCardRate(cur(), cardId, action, { today: today() }), action === 'notForMe' ? notMine(row.label) : confirmed(row.label));
  return editorForm(() => doSet('known'),
    aprLabel, apr, aprHint,
    h('div', { class: 'switch-row' }, h('span', { id: 'intro-switch-label', class: 'edit-label' }, 'Has an intro rate?'), sw),
    introBox,
    msg,
    editActions(cancel, [
        h('button', { type: 'button', class: 'btn', onclick: () => doSet('rough') }, 'Save as a guess'),
        row.fact.value !== null && row.fact.kind === 'rough' && h('button', { type: 'button', class: 'btn', onclick: () => act('confirm') }, 'Confirm'),
        row.fact.kind !== 'notForMe' && h('button', { type: 'button', class: 'btn', onclick: () => act('notForMe') }, 'Not for me'),
        laterBtn(row)]));
}

// The expense panel (S-175, S-176): one question at a time. How much, and how
// often. Who pays: I pay all of it; I share it (how many people, my share, who
// pays the bill); or someone else covers it (pick who, or add a name). A live
// line says what it costs you a month. The switch between answers shows and
// hides fields in place, so nothing typed is lost.
const HOW_OFTEN = [['monthly', 'a month'], ['weekly', 'a week'], ['biweekly', 'every two weeks'], ['semimonthly', 'twice a month'], ['quarterly', 'a quarter'], ['yearly', 'a year']];
function expenseEditor(row) {
  const id = row.path.split('.')[1];
  const e = getAt(cur(), 'expenses.' + id);
  const now = row.fact.value || {};
  const sh = shareOf(cur(), e);
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const amount = h('input', { id: 'edit-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 45' });
  amount.value = inputText('money', valueOf(e.amount));
  const often = h('select', { id: 'exp-often', 'aria-label': 'How often' }, HOW_OFTEN.map(([k, w]) => h('option', { value: k, selected: e.cadence === k }, w)));
  const startMode = now.covered ? 'covered' : sh.shared ? 'shared' : 'me';
  // Who pays (S-186), as two ticks on the folded row: shared, or someone else covers it (never both); neither is me.
  const sharedTick = h('input', { type: 'checkbox', id: 'exp-shared', checked: startMode === 'shared' });
  const coveredTick = h('input', { type: 'checkbox', id: 'exp-covered', checked: startMode === 'covered' });
  sharedTick.addEventListener('change', () => { if (sharedTick.checked) coveredTick.checked = false; });
  coveredTick.addEventListener('change', () => { if (coveredTick.checked) sharedTick.checked = false; });
  const mode = { get value() { return coveredTick.checked ? 'covered' : sharedTick.checked ? 'shared' : 'me'; } };
  const name = h('input', { id: 'exp-name', type: 'text', autocomplete: 'off' });
  name.value = e.label;
  // A subscription (S-191): marked here; its next charge and last review are its own rows.
  const subBox = h('input', { type: 'checkbox', id: 'exp-sub', checked: isSubscription(e) });
  // A phone: one tap fills a standard plan for one line, saved as a guess.
  const std = isPhone(e) ? rules.get('DEFAULT_PHONE_PLAN_1', +cur().meta.asOf.slice(0, 4)) : null;
  let usedStd = false;
  // Shared (shared bills brief): the people on the bill, their parts and how each pays you back (ui/share-editor.js).
  const shareEd = shareEditor(cur(), e, { onChange: () => preview() });
  const partNote = h('p', { class: 'edit-hint part-note', 'aria-live': 'polite' });
  const sharedBox = h('fieldset', { class: 'sub-fields', hidden: startMode !== 'shared' },
    h('legend', {}, 'Sharing it'), shareEd.el, partNote,
    sh.fromDefault ? h('p', { class: 'edit-hint' }, 'Bills in this section are shared by default.') : null);
  // Covered by
  const payers = payersOf(cur());
  const by = h('select', { id: 'exp-by' }, payers.map((p) => h('option', { value: p, selected: now.coveredBy === p }, p)), h('option', { value: '__other' }, 'Other / add a name...'));
  const other = h('input', { id: 'exp-other', type: 'text', autocomplete: 'off', placeholder: 'Who covers it?', hidden: true, 'aria-label': 'Who covers it' });
  by.addEventListener('change', () => { other.hidden = by.value !== '__other'; if (!other.hidden) other.focus(); });
  const coveredBox = h('fieldset', { class: 'sub-fields', hidden: startMode !== 'covered' },
    h('legend', {}, 'Covered'),
    h('label', { for: 'exp-by', class: 'edit-label' }, 'Covered by'), by, other,
    h('p', { class: 'edit-hint' }, 'A covered expense counts $0 toward your spending.'));
  // When it starts and ends (S-199): blank is open-ended; a past start is fine.
  const dates = dateFields(e.start, e.end, 'exp', { plain: true });
  const datesTick = h('input', { type: 'checkbox', id: 'exp-dated', checked: !!(e.start || e.end) });
  dates.box.hidden = !datesTick.checked;
  datesTick.addEventListener('change', () => { dates.box.hidden = !datesTick.checked; if (datesTick.checked) dates.from.focus(); });
  const AMOUNT_Q = { me: 'Amount', shared: 'Whole bill', covered: 'Full cost' };
  const amountLabel = h('label', { for: 'edit-input', class: 'edit-label' }, AMOUNT_Q[startMode]);
  const amountHint = h('p', { class: 'edit-hint', hidden: startMode !== 'covered' }, 'Counts as $0 now. The real cost shows what you would pay if that stops.');
  const stdBtn = std === null ? null : h('button', { type: 'button', class: 'btn', onclick: () => { amount.value = String(std); often.value = 'monthly'; usedStd = true; preview(); amount.focus(); } }, 'Use a standard plan for 1 line (' + money(std) + ' a month)');
  const yours = h('p', { class: 'edit-preview', 'aria-live': 'polite' });
  const preview = () => {
    const a = parseInput('money', amount.value);
    if (!a.ok) { yours.textContent = ''; return; }
    if (mode.value === 'covered') { const m = previewCost(a.value, often.value, false, null, null); yours.textContent = 'Costs you $0 a month' + (m ? ' (' + money(m) + ' a month if you paid it).' : '.'); return; }
    // Shared: the three numbers for one charge (what leaves, your share, what comes back), then your cost a month.
    const x = mode.value === 'shared' ? shareEd.numbers(a.value) : null;
    const m = mode.value === 'shared' ? (x ? previewCost(a.value, often.value, true, null, x.share) : null) : previewCost(a.value, often.value, false, null, null);
    yours.textContent = m === null ? '' : 'Costs you ' + showValue(m, 'money') + ' a month.';
    partNote.textContent = mode.value === 'shared' ? threeNumbers(x, (HOW_OFTEN.find(([k]) => k === often.value) || [null, ''])[1]) : '';
  };
  // Fixed or varies (owner's ask, 2026-10-27): never both; neither is not sorted yet.
  const fixedTick = h('input', { type: 'checkbox', id: 'exp-fixed', checked: e.fixed === true });
  const variesTick = h('input', { type: 'checkbox', id: 'exp-varies', checked: e.fixed === false });
  fixedTick.addEventListener('change', () => { if (fixedTick.checked) variesTick.checked = false; });
  variesTick.addEventListener('change', () => { if (variesTick.checked) fixedTick.checked = false; });
  const fixedNow = () => (fixedTick.checked ? true : variesTick.checked ? false : null);
  const tick = (box, words) => h('label', { class: 'tick-chip', for: box.id }, box, h('span', {}, words));
  const tickRow = h('div', { class: 'tick-row' }, tick(sharedTick, 'Shared'), tick(coveredTick, 'Someone else pays'), tick(subBox, 'Subscription'), tick(datesTick, 'Start or end date'), tick(fixedTick, 'Fixed'), tick(variesTick, 'Varies'));
  // The folded row (owner's ask, 2026-10-26): closed by default; its line names what is ticked, so nothing hides silently.
  const onNow = h('span', { class: 'when-now' });
  const showOn = () => { const on = [[sharedTick, 'Shared'], [coveredTick, 'Someone else pays'], [subBox, 'Subscription'], [datesTick, 'Has dates'], [fixedTick, 'Fixed'], [variesTick, 'Varies']].filter(([b]) => b.checked).map(([, w]) => w); onNow.textContent = on.join(', '); };
  const more = h('details', { class: 'when more-opts' }, h('summary', {}, 'More options ', onNow), tickRow, sharedBox, coveredBox, dates.box);
  tickRow.addEventListener('change', () => {
    sharedBox.hidden = mode.value !== 'shared'; coveredBox.hidden = mode.value !== 'covered'; amountHint.hidden = mode.value !== 'covered';
    amountLabel.textContent = AMOUNT_Q[mode.value];
    showOn(); preview();
  });
  showOn();
  amount.addEventListener('input', () => { usedStd = false; });
  for (const el of [amount, often]) el.addEventListener('input', preview);
  often.addEventListener('change', preview);
  preview();
  // What it read when it opened, so the bar names what changed: the cost, or only the box, the name or the dates.
  const was = { yours: yours.textContent, mode: startMode, coveredBy: now.coveredBy || null, sub: isSubscription(e), dates: dates.read() };
  const doSet = (kind) => {
    const a = amount.value.trim() === '' && mode.value === 'covered' ? { ok: true, value: valueOf(e.amount) } : parseInput('money', amount.value);
    if (!a.ok) { msg.textContent = 'How much: ' + a.message; amount.focus(); return; }
    let sharing = null, coveredBy = null;
    let listed = null;
    if (mode.value === 'shared') {
      listed = shareEd.read();
      if (listed.problem) { msg.textContent = listed.problem; more.open = true; return; }
    } else if (mode.value === 'me') sharing = { shared: false };
    if (mode.value === 'covered') {
      coveredBy = by.value === '__other' ? other.value.trim() : by.value;
      if (!coveredBy) { msg.textContent = 'Who covers it?'; more.open = true; other.focus(); return; }
      sharing = null;
    }
    const d = datesTick.checked ? dates.read() : { start: null, end: null, problem: null };
    if (d.problem) { msg.textContent = d.problem; more.open = true; return; }
    // The standard phone plan is a guess even when Save is tapped.
    const k = usedStd ? 'rough' : kind;
    const label = name.value.trim() || e.label;
    const fx = fixedNow();
    const edited = editExpense(cur(), id, { amount: a.value, cadence: often.value, sharing, coveredBy: mode.value === 'covered' ? coveredBy : null, kind: k, label, subscription: subBox.checked, start: d.start, end: d.end }, today());
    const saved = listed ? setSharers(edited, id, listed.people, listed.whoPays, today()) : edited;
    done(fx === (e.fixed ?? null) ? saved : setFixed(saved, id, fx), expenseWords());
    // The bar's words: the cost when the amount, how often or who pays changed (or nothing else did); else the change.
    function expenseWords() {
      const cost = said.changed(label, yours.textContent.replace(/^Costs you /, '').replace(/\.$/, '') + (k === 'rough' ? ' (a guess)' : ''));
      const costMoved = a.value !== valueOf(e.amount) || often.value !== e.cadence || mode.value !== was.mode || yours.textContent !== was.yours || (mode.value === 'covered' && coveredBy !== was.coveredBy) || (k === 'rough') !== (row.fact.kind === 'rough');
      const other = [
        label !== e.label ? e.label + ' renamed to ' + label : null,
        subBox.checked !== was.sub ? label + (subBox.checked ? ' is now a subscription' : ' is no longer a subscription') : null,
        fx !== (e.fixed ?? null) ? label + (fx === true ? ' is now fixed' : fx === false ? ' now varies' : ' is not sorted as fixed or variable') : null,
        d.start !== was.dates.start || d.end !== was.dates.end ? label + '\'s dates changed' : null
      ].filter(Boolean);
      return costMoved || !other.length ? [cost, ...other].join('. ') : other.join('. ');
    }
  };
  // One slim row: name, amount, how often. Everything else is on the folded row under it.
  const slim = h('div', { class: 'slim-row' },
    h('div', { class: 'slim-name' }, h('label', { for: 'exp-name', class: 'edit-label' }, 'Name'), name),
    h('div', { class: 'slim-amt' }, amountLabel, amount),
    h('div', { class: 'slim-often' }, h('label', { for: 'exp-often', class: 'edit-label' }, 'How often'), often));
  return editorForm(() => doSet('known'),
    slim, amountHint, stdBtn, more, yours, msg,
    editActions(cancel, [
        h('button', { type: 'button', class: 'btn', onclick: () => doSet('rough') }, 'Save as a guess'),
        row.fact.value !== null && row.fact.kind === 'rough' && h('button', { type: 'button', class: 'btn', onclick: () => done(editFact(cur(), row.path, 'confirm', { today: today() }), confirmed(e.label)) }, 'Confirm'),
        row.fact.kind !== 'notForMe' && h('button', { type: 'button', class: 'btn', onclick: () => done(editFact(cur(), row.path, 'notForMe', { today: today() }), notMine(e.label)) }, 'Not for me'),
        laterBtn(row),
        // Move to Subscriptions (bug sweep): it shows there, wherever it is filed.
        !isSubscription(e) && h('button', { type: 'button', class: 'btn', onclick: () => done(markSubscription(cur(), id, true, today()), e.label + ' moved to Subscriptions') }, 'Move to Subscriptions')]));
}

// Start and end dates for an income stream or an expense (S-199), folded
// under "When does it run?" so an open-ended item asks nothing. Blank means
// open-ended. read() gives { start, end, problem }.
function dateFields(start, end, prefix, { label = 'When does it run?', startWords = 'Starts (optional)', endWords = 'Ends (optional)', plain = false } = {}) {
  const from = h('input', { id: prefix + '-start', type: 'date' });
  from.value = start || '';
  const to = h('input', { id: prefix + '-end', type: 'date' });
  to.value = end || '';
  const fields = h('div', { class: 'sub-fields' },
    h('label', { for: prefix + '-start', class: 'edit-label' }, startWords), from,
    h('label', { for: prefix + '-end', class: 'edit-label' }, endWords), to,
    h('p', { class: 'edit-hint' }, 'Leave blank if it has no end.'));
  // plain: the fields alone, for a panel that shows them behind its own tick.
  const box = plain ? fields : h('details', { class: 'when', open: !!(start || end) || null },
    h('summary', {}, label, ' ', h('span', { class: 'when-now' }, start || end ? (start ? 'from ' + shortDate(start) : 'from the start') + (end ? ' to ' + shortDate(end) : '') : 'no dates: it is ongoing')),
    fields);
  return {
    box, from, to,
    read: () => {
      const a = from.value || null, b = to.value || null;
      if (a && b && b < a) return { start: a, end: b, problem: 'It ends before it starts' };
      return { start: a, end: b, problem: null };
    }
  };
}

// The income panel (S-199): the name, how much and how often, when it starts
// and ends, and for pay that comes monthly or less often, the day of the month
// it lands. Weekly and biweekly pay dates follow the start date, so they ask
// for the first pay date instead.
const INCOME_OFTEN = [['monthly', 'a month'], ['semimonthly', 'twice a month'], ['biweekly', 'every two weeks'], ['weekly', 'a week'], ['quarterly', 'a quarter'], ['yearly', 'a year'], ['once', 'once'], ['total', 'in total, over a period']];
const BY_START = ['weekly', 'biweekly'];
function incomeEditor(row) {
  const id = row.path.split('.')[1];
  const x = getAt(cur(), 'income.' + id);
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const name = h('input', { id: 'inc-name', type: 'text', autocomplete: 'off' });
  name.value = x.label;
  // Whose pay it is, when two people share the household (S-211): it decides whose 401(k), IRA and HSA it counts for.
  const ps = cur().household.people || [];
  const whoseSel = ps.length > 1 ? h('select', { id: 'inc-whose' }, ps.map((p) => h('option', { value: p.id, selected: (x.personId || ps[0].id) === p.id }, p.name || p.id))) : null;
  const amount = h('input', { id: 'edit-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 45' });
  amount.value = inputText('money', valueOf(x.amount));
  const often = h('select', { id: 'inc-often', 'aria-label': 'How often' }, INCOME_OFTEN.map(([k, w]) => h('option', { value: k, selected: x.cadence === k }, w)));
  const day = h('input', { id: 'inc-day', type: 'text', inputmode: 'numeric', autocomplete: 'off' });
  day.value = x.payDay && valueOf(x.payDay) ? String(valueOf(x.payDay)) : '';
  const dayBox = h('div', { hidden: true }, h('label', { for: 'inc-day', class: 'edit-label' }, 'Day of the month it lands (optional)'), day, h('p', { class: 'edit-hint' }, 'For example 15. Leave blank if it varies.'));
  // Twice a month, the second day (S-226): the 1st and the 15th. Blank keeps the usual rule (15 days after the first).
  const day2 = h('input', { id: 'inc-day2', type: 'text', inputmode: 'numeric', autocomplete: 'off' });
  day2.value = x.payDay2 && valueOf(x.payDay2) ? String(valueOf(x.payDay2)) : '';
  const day2Box = h('div', { hidden: true }, h('label', { for: 'inc-day2', class: 'edit-label' }, 'Second day of the month it lands (optional)'), day2, h('p', { class: 'edit-hint' }, 'For example 15, for pay on the 1st and the 15th.'));
  const startWords = { monthly: 'Starts (optional)', once: 'The date it is paid', total: 'From' };
  const dates = dateFields(x.start, x.end, 'inc', { label: 'When does it run?' });
  const startLabel = dates.box.querySelector('label[for="inc-start"]'), endLabel = dates.box.querySelector('label[for="inc-end"]');
  const sync = () => {
    const c = often.value;
    dayBox.hidden = BY_START.includes(c) || c === 'once' || c === 'total';
    day2Box.hidden = c !== 'semimonthly';
    startLabel.textContent = BY_START.includes(c) ? 'First pay date (pay dates count from it)' : startWords[c] || 'Starts (optional)';
    endLabel.textContent = c === 'total' ? 'To' : c === 'once' ? 'Ends (leave blank)' : 'Ends (optional)';
    if (c === 'once' || c === 'total' || BY_START.includes(c)) dates.box.open = true;
  };
  often.addEventListener('change', sync);
  sync();
  const doSet = (kind) => {
    const a = parseInput('money', amount.value);
    if (!a.ok) { msg.textContent = 'How much: ' + a.message; amount.focus(); return; }
    const d = dates.read();
    if (d.problem) { msg.textContent = d.problem; return; }
    let payDay = null;
    if (!dayBox.hidden && day.value.trim() !== '') {
      const p = parseInput('int', day.value);
      if (!p.ok || p.value < 1 || p.value > 31) { msg.textContent = 'Day paid: a number from 1 to 31, or leave it blank'; day.focus(); return; }
      payDay = p.value;
    }
    let payDay2 = null;
    if (!day2Box.hidden && day2.value.trim() !== '') {
      const p = parseInput('int', day2.value);
      if (!p.ok || p.value < 1 || p.value > 31) { msg.textContent = 'Second day paid: a number from 1 to 31, or leave it blank'; day2.focus(); return; }
      if (payDay === null) { msg.textContent = 'Second day paid: enter the first day too, or leave both blank'; day.focus(); return; }
      payDay2 = p.value;
    }
    const label = name.value.trim() || x.label;
    let next;
    try { next = editIncome(cur(), id, { amount: a.value, cadence: often.value, start: d.start, end: d.end, payDay, payDay2, personId: whoseSel ? whoseSel.value : undefined, kind, label }, today()); } catch (err) { msg.textContent = err.message; return; }
    done(next, said.changed(label, showValue({ amount: a.value, cadence: often.value, start: d.start, end: d.end, payDay, payDay2 }, 'income') + (kind === 'rough' ? ' (a guess)' : '')));
  };
  return editorForm(() => doSet('known'),
    h('label', { for: 'inc-name', class: 'edit-label' }, 'Name'), name,
    whoseSel ? [h('label', { for: 'inc-whose', class: 'edit-label' }, 'Whose pay'), whoseSel, h('p', { class: 'edit-hint' }, 'It decides whose 401(k), IRA and HSA this pay counts for.')] : null,
    h('label', { for: 'edit-input', class: 'edit-label' }, 'How much, before tax?'), h('div', { class: 'amount-row' }, amount, often),
    h('p', { class: 'edit-hint' }, 'Before anything is taken out.'),
    dayBox, day2Box, dates.box, msg,
    editActions(cancel, [
        h('button', { type: 'button', class: 'btn', onclick: () => doSet('rough') }, 'Save as a guess'),
        row.fact.value !== null && row.fact.kind === 'rough' && h('button', { type: 'button', class: 'btn', onclick: () => done(editFact(cur(), row.path, 'confirm', { today: today() }), confirmed(x.label)) }, 'Confirm'),
        row.fact.kind !== 'notForMe' && h('button', { type: 'button', class: 'btn', onclick: () => done(editFact(cur(), row.path, 'notForMe', { today: today() }), notMine(x.label)) }, 'Not for me'),
        laterBtn(row)]));
}

// A section's sharing default (S-175): "Bills here are just mine" or "shared",
// with the details new and untouched expenses here follow.
function sectionSharing(n) {
  const tag = n.key.startsWith('N:') ? n.key.slice(2) : null;
  if (!tag || tag === 'health' || selecting) return null;
  const d = (cur().household.expenseDefaults || {})[tag];
  const on = !!d && d.shared && d.shared.value === true;
  const text = on ? 'Shared by default with ' + ((d.sharedWith && d.sharedWith.value) || '?') + ' people' : 'Not shared by default';
  if (sharingOpen !== tag) return h('p', { class: 'section-default' }, text, ' ', h('button', { type: 'button', class: 'btn ghost small', onclick: () => { if (!canLeave()) return; sharingOpen = tag; refresh(); } }, 'Change'));
  const people = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': 'People sharing, you included' });
  people.value = on && d.sharedWith && d.sharedWith.value ? String(d.sharedWith.value) : '2';
  const sw = h('select', { 'aria-label': 'Default for this section' }, h('option', { value: 'no', selected: !on }, 'Just mine'), h('option', { value: 'yes', selected: on }, 'Shared'));
  const whole = h('select', { 'aria-label': 'Who pays the bill' }, h('option', { value: 'part' }, 'Each pays their own part'), h('option', { value: 'whole', selected: on && d.whoPays && d.whoPays.value === 'whole' }, 'I pay it all and get paid back'));
  const details = h('div', { class: 'sub-fields', hidden: !on }, h('label', { class: 'edit-label' }, 'People sharing, you included'), people, h('label', { class: 'edit-label' }, 'Who pays the bills'), whole);
  sw.addEventListener('change', () => { details.hidden = sw.value !== 'yes'; });
  return h('form', { class: 'editor section-default-form', onsubmit: (ev) => {
    ev.preventDefault();
    const p = parseInput('int', people.value);
    if (sw.value === 'yes' && (!p.ok || p.value < 2)) return;
    sharingOpen = null;
    change(setSectionSharing(cur(), tag, { shared: sw.value === 'yes', sharedWith: sw.value === 'yes' ? p.value : null, whoPays: whole.value }, today()), said.changed(n.label + ' bills', sw.value === 'yes' ? 'shared by default' : 'not shared by default'));
  } }, h('label', { class: 'edit-label' }, n.label + ' bills are'), sw, details,
  h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save'), h('button', { type: 'button', class: 'btn ghost', onclick: () => { sharingOpen = null; refresh(); } }, 'Cancel')));
}

// Pick from a list, or type another (S-181): a loan's repayment plan. "Not
// sure" is saved as a guess. "I only know my monthly payment" asks for just the
// amount: the plan is saved as not sure and the amount as the loan's payment,
// in one step that one Undo takes back.
function suggestEditor(row) {
  const f = getAt(cur(), row.path);
  const opts = row.type.slice(8).split('|');
  const typedOwn = f.value !== null && !opts.includes(f.value);
  const payPath = row.path.replace(/\.plan$/, '.minimum');
  const pay = getAt(cur(), payPath);
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const pickEl = h('select', { id: 'edit-input' }, h('option', { value: '' }, 'Choose a plan'),
    ...opts.map((v) => h('option', { value: v, selected: f.value === v }, showValue(v, row.type))),
    h('option', { value: '__other', selected: typedOwn }, 'Other (type it)'),
    pay ? h('option', { value: '__amount' }, 'I only know my monthly payment') : null);
  const own = h('input', { id: 'edit-own', type: 'text', autocomplete: 'off' });
  own.value = typedOwn ? f.value : '';
  const amount = h('input', { id: 'edit-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  amount.value = pay ? inputText('money', pay.value) : '';
  const ownBox = h('div', { class: 'sub-fields', hidden: !typedOwn }, h('label', { for: 'edit-own', class: 'edit-label' }, 'Plan name'), own);
  const amountBox = h('div', { class: 'sub-fields', hidden: true }, h('label', { for: 'edit-amount', class: 'edit-label' }, 'Monthly payment'), amount, h('p', { class: 'edit-hint' }, 'Dollars a month, for example 210. Saved as a guess.'));
  pickEl.addEventListener('change', () => {
    ownBox.hidden = pickEl.value !== '__other';
    amountBox.hidden = pickEl.value !== '__amount';
    if (!ownBox.hidden) own.focus();
    if (!amountBox.hidden) amount.focus();
  });
  const doSet = (kind) => {
    const v = pickEl.value;
    if (v === '') { msg.textContent = 'Choose a plan, or use Not for me'; pickEl.focus(); return; }
    if (v === '__amount') {
      const a = parseInput('money', amount.value);
      if (!a.ok) { msg.textContent = a.message; amount.focus(); return; }
      const s1 = editFact(cur(), row.path, 'set', { value: 'not_sure', kind: 'rough', today: today() });
      done(editFact(s1, payPath, 'set', { value: a.value, kind, today: today() }), said.changed(row.label, 'not sure; payment ' + showValue(a.value, 'money') + ' a month' + (kind === 'rough' ? ' (a guess)' : '')));
      return;
    }
    const value = v === '__other' ? own.value.trim() : v;
    if (!value) { msg.textContent = 'Type the plan name'; own.focus(); return; }
    // Not sure is never known.
    const k = value === 'not_sure' ? 'rough' : kind;
    done(editFact(cur(), row.path, 'set', { value, kind: k, today: today() }), said.changed(row.label, showValue(value, row.type) + (k === 'rough' && value !== 'not_sure' ? ' (a guess)' : '')));
  };
  return editorForm(() => doSet('known'),
    h('label', { for: 'edit-input', class: 'edit-label' }, row.label),
    pickEl, ownBox, amountBox, msg,
    editActions(cancel, [
        h('button', { type: 'button', class: 'btn', onclick: () => doSet('rough') }, 'Save as a guess'),
        f.kind !== 'notForMe' && h('button', { type: 'button', class: 'btn', onclick: () => done(editFact(cur(), row.path, 'notForMe', { today: today() }), notMine(row.label)) }, 'Not for me'),
        laterBtn(row)]));
}

// A pick list of the household's accounts (and cards, or the paycheck) for a link (S-189).
function linkSelect(type, value, id) {
  const opts = linkOptions(cur(), type);
  const groups = [...new Set(opts.map((o) => o.group))];
  return h('select', { id }, h('option', { value: '' }, 'Choose'),
    ...groups.map((g) => h('optgroup', { label: g }, opts.filter((o) => o.group === g).map((o) => h('option', { value: o.value, selected: value === o.value }, o.label)))));
}

// An expense's payment (S-189): the account or card it comes out of, and the
// day of the month when there is one. One Save writes both.
function paymentEditor(row) {
  const id = row.path.split('.')[1];
  const e = getAt(cur(), 'expenses.' + id);
  const now = row.fact.value || {};
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const from = linkSelect('link:cash|card', now.from ?? null, 'edit-input');
  const day = h('input', { id: 'pay-day', type: 'text', inputmode: 'numeric', autocomplete: 'off' });
  day.value = now.day ? String(now.day) : '';
  // The debt this line pays (S-226): a car payment that pays the car loan is counted once, under debt payments.
  // Only a line that repeats can pay a debt (answer 35); a one-time or total line is offered no debt.
  const debts = PER_YEAR[e.cadence] ? cur().debts || [] : [];
  const pays = debts.length ? h('select', { id: 'pay-debt' }, h('option', { value: '' }, 'None: an ordinary bill'), ...debts.map((x) => h('option', { value: x.id, selected: now.paysDebt === x.id }, valueOf(x.name) || x.id))) : null;
  // Paid with a card (owner's ask, 2026-10-27): no day is asked. The money leaves checking when the card is paid, on the
  // card's own due day, which the card already holds; the line's own day is cleared.
  const cardOf = () => (cur().debts || []).find((x) => x.id === from.value && x.type === 'credit_card') || null;
  const dayBox = h('div', { class: 'pay-day-box' }, h('label', { for: 'pay-day', class: 'edit-label' }, 'Day of the month it is paid (optional)'), day, h('p', { class: 'edit-hint' }, 'For example 5. Leave blank if it varies.'));
  const cardNote = h('p', { class: 'edit-hint' });
  const showDay = () => {
    const c = cardOf();
    dayBox.hidden = !!c;
    const due = c && c.dueDay ? valueOf(c.dueDay) : null;
    cardNote.textContent = c ? 'On the card. Checking pays it with the card' + (due ? ', on its due day, the ' + ordinal(due) : '') + '.' : 'A card here means it goes on the card; the card is then paid from its own account.';
  };
  from.addEventListener('change', showDay);
  showDay();
  const doSet = (kind) => {
    if (!from.value) { msg.textContent = 'Pick where it is paid from'; from.focus(); return; }
    const d = cardOf() || day.value.trim() === '' ? { ok: true, value: null } : parseInput('int', day.value);
    if (!d.ok || (d.value !== null && (d.value < 1 || d.value > 31))) { msg.textContent = 'Day: a number from 1 to 31, or leave it blank'; day.focus(); return; }
    const label = from.selectedOptions[0].textContent;
    let next;
    try { next = editPayment(cur(), id, { from: from.value, day: d.value, paysDebt: pays ? pays.value || null : undefined, kind }, today()); } catch (err) { msg.textContent = err.message; return; }
    done(next, said.changed(e.label + ': paid from', label + (d.value ? ', day ' + d.value : '') + (pays && pays.value ? '; pays ' + pays.selectedOptions[0].textContent : '') + (kind === 'rough' ? ' (a guess)' : '')));
  };
  return editorForm(() => doSet('known'),
    h('label', { for: 'edit-input', class: 'edit-label' }, 'Paid from'), from, cardNote, dayBox,
    pays ? [h('label', { for: 'pay-debt', class: 'edit-label' }, 'The debt it pays (optional)'), pays, h('p', { class: 'edit-hint' }, 'For example a car payment that pays the car loan, so it counts once.')] : null,
    msg,
    editActions(cancel, [
        h('button', { type: 'button', class: 'btn', onclick: () => doSet('rough') }, 'Save as a guess'),
        row.fact.value !== null && row.fact.kind === 'rough' && h('button', { type: 'button', class: 'btn', onclick: () => done(editFact(cur(), row.path, 'confirm', { today: today() }), confirmed(e.label + ': paid from')) }, 'Confirm'),
        laterBtn(row)]));
}

// The field editor's buttons (bug sweep): Save and Cancel, and a "⋯" menu with the rest (Save as a guess, Confirm,
// Not for me, Not now). The form's submit is Save.
const editActions = (cancel, more) => h('div', { class: 'edit-actions' },
  h('button', { type: 'submit', class: 'btn primary' }, 'Save'),
  h('button', { type: 'button', class: 'btn', onclick: cancel }, 'Cancel'),
  h('details', { class: 'more-menu' }, h('summary', { class: 'btn', 'aria-label': 'More choices' }, '\u22EF'), h('div', { class: 'more-items' }, more.filter(Boolean))));
// Birth date, state and county are the Profile's answers (one stored answer, bug sweep): shown here, edited there.
const fromProfile = (path) => Object.values(HOUSEHOLD_ANSWERS).some((at) => at(cur()) === path);
function editor(row) {
  if (fromProfile(row.path)) return h('div', { class: 'editor' }, h('p', { class: 'edit-hint' }, 'This comes from your Profile, so it is changed there.'),
    h('div', { class: 'edit-actions' }, h('a', { class: 'btn primary', href: 'profile.html#/you' }, 'Change in Profile'), h('button', { type: 'button', class: 'btn', onclick: () => { closeEditor(); refresh(); } }, 'Cancel')));
  // A basis that comes from the contributions by year is changed there.
  if (basisAccount(row.path)) return h('div', { class: 'editor' }, h('p', { class: 'edit-hint' }, 'The total of the contributions by year.'),
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: () => setOpen(row.path.replace(/\.(basis|costBasis)$/, '.contributions')) }, 'Change the years'), h('button', { type: 'button', class: 'btn', onclick: () => { closeEditor(); refresh(); } }, 'Cancel')));
  if (row.type === 'cardRate') return cardRateEditor(row);
  if (row.type === 'expense') return expenseEditor(row);
  if (row.type === 'income') return incomeEditor(row);
  if (row.type === 'payment') return paymentEditor(row);
  const f = getAt(cur(), row.path);
  if (row.type.startsWith('suggest:')) return suggestEditor(row);
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  let input;
  if (row.type.startsWith('link:')) {
    input = linkSelect(row.type, f.value, 'edit-input');
  } else if (row.type.startsWith('choice:') || row.type === 'bool') {
    const opts = isNeedRow(row.path) ? [['true', 'Need'], ['false', 'Want']] : row.type === 'bool' ? [['true', 'Yes'], ['false', 'No']] : row.type.slice(7).split('|').map((x) => [x, showValue(x, row.type)]);
    input = h('select', { id: 'edit-input' }, h('option', { value: '' }, 'Choose'), ...opts.map(([v, t]) => h('option', { value: v, selected: f.value !== null && String(f.value) === v }, t)));
  } else if (row.type === 'list') {
    // A list is a small table (owner's ask, 2026-10-27): a row per entry, boxes with their own labels, never raw code.
    input = listBoxes(row, f.value);
  } else {
    input = h('input', { id: 'edit-input', type: row.type === 'date' ? 'date' : 'text', inputmode: ['money', 'rate', 'int'].includes(row.type) ? 'decimal' : null, autocomplete: 'off' });
    input.value = inputText(row.type, f.value);
  }
  // A value a card on Today suggested (Update goal): in the box, ready to accept with Save.
  const suggested = takePrefill(row.path);
  if (suggested !== null) input.value = inputText(row.type, suggested);
  const hint = row.type === 'rate' ? 'As a percent: 25 means 25%' : row.type === 'list' && row.path.endsWith('.contributions') ? 'A rollover, a conversion or the employer part: record it with How much to max it? on this account.' : null;
  const doSet = (kind) => {
    const typed = row.type === 'bool' ? (input.value === '' ? '' : input.value === 'true' ? 'yes' : 'no') : input.value;
    if (row.type.startsWith('link:') && !typed) { msg.textContent = 'Pick one, or use Not for me'; input.focus(); return; }
    const p = row.type === 'list' ? input.read() : parseInput(row.type, typed);
    if (!p.ok) { msg.textContent = p.message; input.focus(); return; }
    done(editFact(cur(), row.path, 'set', { value: p.value, kind, today: today() }), said.changed(row.label, shownAs(row, p.value) + (kind === 'rough' ? ' (a guess)' : '')));
  };
  return editorForm(() => doSet('known'),
    h('label', { for: 'edit-input', class: 'edit-label' }, row.field || row.label),
    row.type === 'list' ? input.el : input,
    hint && h('p', { class: 'edit-hint' }, hint),
    msg,
    editActions(cancel, [
        h('button', { type: 'button', class: 'btn', onclick: () => doSet('rough') }, 'Save as a guess'),
        f.value !== null && f.kind !== 'known' && h('button', { type: 'button', class: 'btn', onclick: () => done(editFact(cur(), row.path, 'confirm', { today: today() }), confirmed(row.label)) }, 'Confirm'),
        f.kind !== 'notForMe' && h('button', { type: 'button', class: 'btn', onclick: () => done(editFact(cur(), row.path, 'notForMe', { today: today() }), notMine(row.label)) }, 'Not for me'),
        laterBtn(row)]));
}
// The columns of a list, by what it holds; anything else is a list of words, one per line.
const LIST_COLS = {
  contributions: [['year', 'Year', 'int', 'e.g. 2026'], ['amount', 'Amount', 'money', 'e.g. 4,000']],
  conversions: [['year', 'Year', 'int', 'e.g. 2026'], ['amount', 'Amount', 'money', 'e.g. 4,000']],
  holdings: [['ticker', 'Fund or ticker', 'text', 'e.g. VTI'], ['share', 'Share of the account (%)', 'rate', 'e.g. 60']]
};
// listBoxes(row, value) -> { el, read() -> { ok, value | message }, focus() }: a row of boxes per entry, + Add and Remove.
// Fields a list keeps that are not shown here (an entry's kind, a fund's fees) ride along unchanged.
function listBoxes(row, value) {
  const key = row.path.split('.').pop(), cols = LIST_COLS[key] || null;
  const list = Array.isArray(value) ? value.map((x) => (x && typeof x === 'object' ? { ...x } : x)) : [];
  const body = h('div', { class: 'list-rows' });
  const boxOf = (type, v, label, hint, id) => {
    const b = h('input', { type: 'text', id, autocomplete: 'off', inputmode: type === 'text' ? null : 'decimal', placeholder: hint, 'aria-label': label });
    b.value = v === null || v === undefined ? '' : type === 'rate' ? String(Math.round(v * 1e6) / 1e4) : String(v);
    return b;
  };
  const rowEls = [];
  const addRow = (item) => {
    const boxes = cols ? cols.map(([k, label, type, hint], i) => boxOf(type, item ? item[k] : null, label, hint, rowEls.length === 0 && i === 0 ? 'edit-input' : null))
      : [boxOf('text', item, 'Entry', 'Type one', rowEls.length === 0 ? 'edit-input' : null)];
    const line = h('div', { class: 'list-row' }, ...boxes.map((b) => (b.getAttribute('inputmode') === 'decimal' && cols && cols[boxes.indexOf(b)][2] === 'money' ? h('div', { class: 'affix' }, h('span', { class: 'affix-sym', 'aria-hidden': 'true' }, '$'), b) : b)),
      h('button', { type: 'button', class: 'btn small icon-btn', 'aria-label': 'Remove this line', title: 'Remove this line', onclick: () => { line.remove(); rowEls.splice(rowEls.findIndex((r) => r.line === line), 1); dirty = true; } }, '\u00D7'));
    rowEls.push({ line, boxes, item: item && typeof item === 'object' ? item : null });
    body.append(line);
  };
  for (const x of list) addRow(x);
  if (!list.length) addRow(null);
  body.style.setProperty('--list-cols', cols ? cols.length : 1);
  const head = cols ? h('div', { class: 'list-row list-head', 'aria-hidden': 'true', style: '--list-cols:' + cols.length }, ...cols.map(([, label]) => h('span', {}, label)), h('span', {})) : null;
  const el = h('div', { class: 'list-edit' }, head, body, h('button', { type: 'button', class: 'btn add', onclick: () => { addRow(null); dirty = true; } }, cols && cols[0][0] === 'year' ? '+ Add a year' : '+ Add a line'));
  const read = () => {
    const out = [];
    for (const r of rowEls) {
      if (r.boxes.every((b) => !b.value.trim())) continue;
      if (!cols) { out.push(r.boxes[0].value.trim()); continue; }
      const it = { ...(r.item || {}) };
      for (const [i, [k, label, type]] of cols.entries()) {
        const raw = r.boxes[i].value.trim();
        if (!raw) { it[k] = null; continue; }
        const p = type === 'text' ? { ok: true, value: raw } : parseInput(type, raw);
        if (!p.ok) return { ok: false, message: label + ': ' + p.message };
        if (k === 'year' && (p.value < 1900 || p.value > 2100)) return { ok: false, message: 'Year: a year like 2026' };
        it[k] = p.value;
      }
      out.push(it);
    }
    return { ok: true, value: out };
  };
  return { el, read, focus: () => document.getElementById('edit-input')?.focus(), get value() { return ''; } };
}
// The open row's editor: the one already built while it is open and typed in, else a fresh one.
function openEditor(row) {
  if (edCache && edCache.path === row.path && (dirty || edCache.spine === cur())) return edCache.el;
  const el = editor(row);
  edCache = { path: row.path, el, spine: cur(), label: row.label };
  return el;
}

// ---------------------------------------------------------------- rows
// What a row reads: its value in words, "Not given yet" or "Does not apply".
// A basis with contributions by year (owner's ask): the total of the years, one formula (engine/networth.js basisOf).
const basisAccount = (path) => basisFromYears(cur(), path) !== null;
function rowValue(row) {
  const f = row.fact;
  const ba = basisAccount(row.path);
  if (ba) return money(basisFromYears(cur(), row.path)) + ' (by year)';
  if (f.kind === 'notForMe') return 'Does not apply';
  if (row.linked) return row.display;
  if (f.value === null) return 'Not given yet';
  return row.display || shownAs(row, f.value);
}
// The answers your file could not give (S-228): they stay flagged on their row until entered.
let flagMemo = { spine: null, set: null };
function flaggedRows(spine) {
  if (flagMemo.spine !== spine) flagMemo = { spine, set: new Set(fileProblems(spine).open.filter((x) => x.link).map((x) => rowPathFor(spine, x.link))) };
  return flagMemo.set;
}
const tags = (row) => [
  null,
  flaggedRows(cur()).has(row.path) ? h('span', { class: 'later-tag' }, 'From your file: enter it again') : null
];

// A row ticked in Select several (full: its item's name too, where rows from many items are listed).
function pickRow(row, full = false) {
  const on = selected.has(row.path), f = row.fact;
  return h('li', { class: 'row kind-' + f.kind + (on ? ' picked' : ''), id: 'f-' + row.path },
    h('label', { class: 'row-main row-pick' },
      h('input', { type: 'checkbox', checked: on, onchange: () => { if (on) selected.delete(row.path); else selected.add(row.path); refresh(); } }),
      h('span', { class: 'row-label' }, full ? row.label : row.field || row.label),
      h('span', { class: 'row-value' + (f.value === null ? ' empty' : '') }, rowValue(row)),
      kindMark(row.path, f.kind)));
}

// The budget line that pays a linked debt, by its own name ("Gym").
const lineName = (row) => (rowByPath('expenses.' + String(row.linePath).split('.')[1] + '.amount') || rowByPath(row.linePath)).label;
// One row: tap it to open its editor in place (one at a time). On an item's screen it reads the field's own name; on
// Still guessing and Subscriptions (full) the item's too, and why it is listed (note).
function rowEl(row, openPath, { full = false, note = null, sub = null } = {}) {
  if (selecting) return pickRow(row, full);
  const f = row.fact;
  const isOpen = openPath === row.path;
  const label = full ? row.label : row.field || row.label;
  // A debt a budget line pays (answer 35): its minimum is the line's to set, so the row opens the line's editor here,
  // in place, and the screen stays where Back expects it.
  const line = row.linked ? rowByPath(row.linePath) : null;
  if (row.linked && !line) return h('li', { class: 'row kind-' + f.kind, id: 'f-' + row.path }, h('div', { class: 'row-main row-still' }, h('span', { class: 'row-label' }, label), h('span', { class: 'row-value' }, rowValue(row)), kindMark(row.path, f.kind)));
  // A value worked out from others (an expense's cost to you) shows its math (S-177).
  const worked = row.type === 'expense' && f.value && (f.value.shared || f.value.covered);
  return h('li', { class: 'row kind-' + f.kind + (isOpen ? ' open' : ''), id: 'f-' + row.path },
    h('button', { type: 'button', class: 'row-main', 'aria-expanded': isOpen ? 'true' : 'false', onclick: () => { if (!canLeave()) return; setOpen(isOpen ? null : row.path); } },
      h('span', { class: 'row-label' }, label, row.linked ? null : tags(row), sub && !isOpen ? h('span', { class: 'row-sub' }, sub) : null),
      h('span', { class: 'row-value' + (!row.linked && f.value === null ? ' empty' : '') }, rowValue(row)),
      kindMark(row.path, f.kind)),
    // Krug pass: no sentence under a closed row; open, a default says so with a small chip, and its note.
    isOpen && (note || whoSupplies(f) === 'default' || laterWords(row.path)) ? h('p', { class: 'row-why' }, whoSupplies(f) === 'default' ? [h('span', { class: 'chip chip-default' }, 'default'), ' '] : null, note && !/^using Eli.s default$/i.test(note) ? note : null, laterWords(row.path) ? [note ? '. ' : null, capitalize(laterWords(row.path))] : null) : null,
    worked && !isOpen ? mathButton(['expenseCost:' + row.path.split('.')[1]], () => ({ spine: cur(), rules, s: summaryOf(cur()) })) : null,
    isOpen ? (line ? [h('p', { class: 'row-why' }, 'Set by ' + lineName(row) + ' in Needs. You can change it here.'), openEditor(line)] : openEditor(row)) : null);
}

// "3 missing", "2 rough": small labels on a row that opens (the filters at the top show only those).
// Only what is worth checking now counts (Rough now and later): a guess that is fine for now is never in a count.
const dots = (x) => {
  const rows = x.allRows || x.rows || (x.node && (x.node.allRows || x.node.rows)), m = umap();
  const c = rows ? { missing: rows.filter((r) => r.fact.kind === 'missing' && worthNow(m, r.path, 'missing', guessFor === cur())).length, rough: rows.filter((r) => r.fact.kind === 'rough' && worthNow(m, r.path, 'rough', guessFor === cur())).length } : x.counts || x;
  return c.missing || c.rough ? h('span', { class: 'group-counts' },
    c.missing ? h('span', { class: 'dot dot-missing' }, c.missing + ' missing') : null,
    c.rough ? h('span', { class: 'dot dot-rough' }, c.rough + (c.rough === 1 ? ' guess' : ' guesses') + ' to check') : null) : null;
};
// To fill in (owner's ask, 2026-10-27): one switch at the top of every screen here shows only what is missing or a
// guess, so filling in goes fast. It is the page's kind filter (Missing and Rough on, the rest off), kept in this browser.
const fillOn = () => kinds.length && kinds.every((k) => k === 'missing' || k === 'rough');
const toFill = (c) => (c.missing || 0) + (c.rough || 0);
function fillBar(n) {
  const on = fillOn();
  return h('div', { class: 'segmented fill-bar', role: 'group', 'aria-label': 'Show' },
    h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(!on), onclick: () => { if (on) setKinds([...KIND_ORDER]); } }, h('span', { class: 'seg-label' }, 'Everything')),
    h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(on), onclick: () => { if (!on) setKinds(['missing', 'rough']); } }, h('span', { class: 'seg-label' }, 'To fill in (' + n + ')')));
}
const filledWords = (c) => c.filled + ' of ' + c.asked + ' filled in';
// A row that opens a deeper screen: the whole row is the target, with a chevron.
const goRow = (href, { mark = null, name, sub, id = null }) => h('li', {}, h('a', { class: mark ? 'go-row' : 'go-row plain', href, id },
  mark ? h('span', { class: 'go-mark', 'aria-hidden': 'true' }, mark) : null,
  h('span', { class: 'go-name' }, name),
  h('span', { class: 'go-sub' }, ...[].concat(sub).filter(Boolean))));

// An item's headline: its balance, amount or target in words.
const OFTEN = { weekly: ' a week', biweekly: ' every two weeks', semimonthly: ' twice a month', monthly: ' a month', quarterly: ' a quarter', yearly: ' a year', total: ' in total', once: ' once' };
function headline(it) {
  const main = it.summary ? it.rows.find((r) => r.path === it.summary) : it.rows.length === 1 ? it.rows[0] : null;
  if (!main) return h('span', {}, filledWords(it.counts));
  if (!it.summary) return h('span', { class: main.fact.value === null ? 'empty' : null }, rowValue(main));
  const stream = it.collection === 'income' ? (cur().income || []).find((x) => x.id === it.id) : null;
  if (main.fact.value === null) return h('span', { class: 'empty' }, main.fact.kind === 'notForMe' ? 'Does not apply' : 'Not given yet');
  return h('span', { class: 'go-total' }, showValue(main.fact.value, main.type) + (main.type === 'income' || !stream ? '' : OFTEN[stream.cadence] || ''));
}

// ---------------------------------------------------------------- the top: six sections, search and filters
// Which kinds show (S-168), a per-browser convenience kept in localStorage when it can be; the page works without it.
const VIEW_KEY = 'slam-ledger-view:v1';
const KIND_ORDER = ['missing', 'rough', 'known', 'computed', 'notForMe'];
const KIND_LABEL = { missing: 'Missing', rough: 'Rough', known: 'Known', computed: 'Worked out', notForMe: 'Not for me' };
let kinds = (() => { try { const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null'); if (v && Array.isArray(v.kinds)) return v.kinds; } catch { /* storage blocked */ } return [...KIND_ORDER]; })();
// The filter is one for the whole page (only the top screen changes it), so coming back finds it as it was left; the
// search is kept with the top screen's own history entry.
function setKinds(k, q = null) {
  kinds = k;
  try { localStorage.setItem(VIEW_KEY, JSON.stringify({ kinds })); } catch { /* storage blocked */ }
  if (q !== null) keep({ q });
  refresh();
}
const shows = (row, q) => kinds.includes(row.fact.kind) && (!q || (row.label + ' ' + row.path).toLowerCase().includes(q.toLowerCase()));
const filtering = (q) => !!q || kinds.length !== KIND_ORDER.length;

function filterBar(sc, q) {
  const all = sc.sections.flatMap((g) => g.allRows);
  const n = (k) => all.filter((r) => r.fact.kind === k).length;
  // A chip shows only its kind; tapped again, it shows everything (S-182).
  const solo = (k) => kinds.length === 1 && kinds[0] === k;
  const pick = (k) => setKinds(solo(k) ? [...KIND_ORDER] : [k]);
  // Search is in the header (Krug pass); this card only filters by kind.
  return h('section', { class: 'card filters', 'aria-label': 'Show' },
    h('div', { class: 'filter-row' },
      h('span', { class: 'filter-label' }, 'Show:'),
      ...KIND_ORDER.filter((k) => n(k)).map((k) => h('button', { type: 'button', class: 'filter-chip chip-' + k + (kinds.includes(k) ? '' : ' off'), 'aria-pressed': String(solo(k)), onclick: () => pick(k) }, (solo(k) ? 'Only ' + KIND_LABEL[k].toLowerCase() : KIND_LABEL[k]) + ' ' + n(k)))),
    null,
    h('div', { class: 'filter-row' },
      h('button', { type: 'button', class: 'btn', onclick: () => setKinds(KIND_ORDER.filter((k) => k !== 'known' && k !== 'computed')) }, 'Hide known'),
      h('button', { type: 'button', class: 'btn', onclick: () => setKinds(['missing']) }, 'Only missing'),
      h('button', { type: 'button', class: 'btn', disabled: !filtering(q), title: filtering(q) ? null : 'Everything is showing', onclick: () => setKinds([...KIND_ORDER], '') }, filtering(q) ? 'Show everything' : 'Showing everything'),
      selectToggle()));
}

// What the search and the filters find, one row each, every one opening its own screen with its editor open.
function results(sc, q) {
  const all = sc.sections.flatMap((g) => g.allRows);
  const found = all.filter((r) => shows(r, q));
  const resultRow = (row) => (selecting ? pickRow(row, true) : h('li', { class: 'row kind-' + row.fact.kind },
    fieldLink(row.path, [h('span', { class: 'row-label' }, row.label, tags(row)), h('span', { class: 'row-value' + (row.fact.value === null ? ' empty' : '') }, rowValue(row)), kindMark(row.path, row.fact.kind)], { class: 'row-main row-link' })));
  return [
    h('p', { class: 'muted', role: 'status' }, 'Showing ' + found.length + ' of ' + all.length + '.'),
    ...sc.sections.map((sec) => {
      const rows = sec.allRows.filter((r) => shows(r, q));
      return rows.length ? h('section', { class: 'card', 'aria-label': sec.label }, h('h2', {}, sec.letter ? [h('span', { class: 'daite' }, sec.letter), ' '] : null, sec.label), h('ul', { class: 'rows' }, rows.map(resultRow))) : null;
    }),
    found.length ? null : h('p', { class: 'muted' }, 'Nothing matches. ', h('button', { type: 'button', class: 'btn small', onclick: () => setKinds([...KIND_ORDER], '') }, 'Show everything'))
  ];
}

// The six sections in DATING order, each with one total where your numbers give one, else how much is filled in.
function sectionList(sc) {
  const steps = Object.fromEntries(sessionSteps(cur(), summaryOf(cur())).map((x) => [x.id, x.result]));
  return h('ul', { class: 'go-list', 'aria-label': 'Your numbers, by section' }, sc.sections.map((sec) => {
    const r = steps[sec.slug];
    const total = r && r.value !== null ? h('span', {}, h('span', { class: 'go-total', 'data-metric': SECTION_METRIC[sec.slug] || null }, money(r.value)), TOTAL_WORDS[sec.slug]) : h('span', {}, filledWords(sec.counts));
    // A total built on a missing line says so; how many lines are rough or missing shows beside it.
    return goRow(hashFor([sec.slug]), { mark: sec.letter, name: sec.label, sub: [total, r && r.value !== null && r.kind === 'incomplete' ? chip(r.kind) : null, dots(sec)] });
  }));
}

// ---------------------------------------------------------------- still guessing (its own screen)
// The ranking and which guesses matter now come from ui/urgency.js (one run per household version, shared by every
// page). Until a new answer is in, the last one shows with "Updating"; when it lands the page redraws once (an open
// editor and its typing stay) and the scroll comes back.
let guess = null, guessFor = null;
function refreshGuess(spine) {
  const r = guessesFor(spine, rules, (res) => { if (cur() !== spine) return; guess = res; guessFor = spine; refresh(); restoreScroll(); });
  if (r) { guess = r; guessFor = spine; }
}
// "check in Jan" for a number set to check later, inside its row's detail.
const laterWords = (path) => { const c = checkOf(path); return c && c.mode === 'later' && c.until > today() ? checkInWords(c.until, today()) : null; };
const capitalize = (x) => x.charAt(0).toUpperCase() + x.slice(1);
// Which rows are worth checking now. The last answer stands while a new one is worked out, so marks never flicker.
const umap = () => (guess ? mapOf(guess, cur()) : null);
// A row's mark: the red Missing or amber Rough chip when it is worth checking now; a small gray dot when it is fine
// for now or set for later; nothing for a known number.
function kindMark(path, kind) {
  if ((kind === 'rough' || kind === 'missing') && !worthNow(umap(), path, kind, guessFor === cur())) return h('span', { class: 'dot-fine', role: 'img', 'aria-label': kind === 'missing' ? 'Missing, fine for now' : 'A guess, fine for now', title: 'Fine for now' });
  return chip(kind);
}
const nowCount = () => (guess ? guess.items.filter((it) => it.urgency === 'now').length : null);
function guessRow() {
  const n = nowCount();
  return goRow(hashFor(['still-guessing']), { id: 'guess-row', name: 'Still guessing', sub: n === null ? 'Working out which guesses matter...' : n ? n + ' worth checking now' : 'Nothing worth checking now' });
}
// Why a guess is listed, in plain words: what a 20% miss could move ("could move your FI number by $30,000").
function whyOf(it) {
  if (it.kind === 'missing') return it.blocks.length ? 'Needed for ' + it.blocks.map((b) => BLOCK_WORDS[b] || b).join(', ') : 'Not needed by a result yet';
  // The rule's own reason first, so a guess worth checking now always says what it moves.
  if (it.top) {
    const [k, d] = it.top;
    if (k === 'yearsToFi') return 'Could move your FI year' + (Math.abs(d) >= 1.5 ? ' by about ' + Math.round(Math.abs(d)) + ' years' : '');
    return 'Could move your ' + (k === 'runway' ? 'cash cushion' : MOVE_WORDS[k] || BLOCK_WORDS[k] || k) + ' by ' + money(Math.abs(d));
  }
  const top = Object.entries(it.moves).filter(([k, d]) => MOVE_WORDS[k] && Math.abs(d) >= 1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  return top ? 'Could move your ' + MOVE_WORDS[top[0]] + ' by ' + money(Math.abs(top[1])) : 'Changes little';
}
// Sort and group (step 5), remembered per browser: Quick wins by default, no groups.
const GUESS_VIEW_KEY = 'slam-guess-view:v1';
const guessView = () => { try { const v = JSON.parse(localStorage.getItem(GUESS_VIEW_KEY) || 'null'); if (v && SORTS[v.sort] && ['none', 'where', 'group'].includes(v.group)) return v; } catch { /* storage blocked */ } return { sort: 'quick', group: 'none' }; };
const setGuessView = (patch) => { try { localStorage.setItem(GUESS_VIEW_KEY, JSON.stringify({ ...guessView(), ...patch })); } catch { /* storage blocked */ } refresh(); };
function guessControls() {
  const v = guessView();
  const pick = (id, label, options, value, key) => h('label', { class: 'pick-label' }, h('span', {}, label),
    h('select', { id, class: 'pick-box', onchange: (e) => setGuessView({ [key]: e.target.value }) }, options.map(([k, w]) => h('option', { value: k, selected: k === value }, w))));
  return h('div', { class: 'guess-controls' },
    pick('gs-sort', 'Sort', Object.entries(SORTS).map(([k, x]) => [k, x.label]), v.sort, 'sort'),
    pick('gs-group', 'Group', [['none', 'None'], ['where', 'Where to find it'], ['group', 'Section']], v.group, 'group'));
}
function guessList() {
  if (!guess) return h('section', { class: 'card guessing', 'aria-label': 'Still guessing' }, h('p', { class: 'muted', role: 'status' }, 'Working out which guesses matter...'));
  const stale = guessFor !== cur(), table = whereTable(), v = guessView();
  const all = table ? withWhere(cur(), guess.items, table) : guess.items.map((it) => ({ ...it, where: null, short: null, minutes: 1, whereId: 'other' }));
  const sorted = (list) => sortGuesses(cur(), list, v.sort);
  const now = sorted(all.filter((it) => it.urgency === 'now'));
  const fine = sorted(all.filter((it) => it.urgency === 'fine'));
  const later = all.filter((it) => it.urgency === 'later').sort((a, b) => (a.until < b.until ? -1 : 1));
  // Each guess opens its editor right here, so the list stays the screen Back comes back to. Closed, it says where to
  // find it and what a miss could move ("Paystub, 5 min. Could move your FI number by $30,000").
  const open = kept().open || null;
  const subOf = (it) => [it.short ? it.short + ' \u00b7 ' + it.minutes + ' min' : null, whyOf(it).replace(/^Could move your /, 'moves your ')].filter(Boolean).join(' \u00b7 ');
  const row = (it) => { const r = rowByPath(rowPathFor(cur(), it.path)); return r ? rowEl(r, open, { full: true, note: whyOf(it), sub: subOf(it) }) : h('li', { class: 'row kind-' + it.kind }, h('div', { class: 'row-main row-still' }, h('span', { class: 'row-label' }, it.label, h('span', { class: 'row-sub' }, subOf(it))), kindMark(it.path, it.kind))); };
  // Grouped by where: one visit finds the group, so each group can go to the homework at once.
  const toHomework = (g) => change((sp) => addLookups(sp, g.items.map((it) => ({ path: it.path, label: it.label, where: it.where })), { today: today() }), g.items.length + (g.items.length === 1 ? ' number' : ' numbers') + ' added to homework: ' + g.where);
  const listOf = (list) => groupGuesses(list, v.group).map((g) => [
    g.title ? h('div', { class: 'guess-group-head' }, h('h3', {}, g.title), v.group === 'where' ? h('button', { type: 'button', class: 'btn small', onclick: () => toHomework(g) }, 'Add to homework') : null) : null,
    h('ul', { class: 'rows guess-rows' }, g.items.map(row))]).flat();
  // Fine for now and Later are folded; open or closed is kept per browser.
  const fold = (key, title, list, body) => (list.length ? h('details', { class: 'card fold-card done-group', open: kept()[key] || null, ontoggle: (e) => { if (!!kept()[key] !== e.target.open) keep({ [key]: e.target.open }); } },
    h('summary', {}, h('span', {}, title), h('span', { class: 'count' }, String(list.length))), body) : null);
  return [
    h('section', { class: 'card guessing', 'aria-labelledby': 'gs-now' },
      h('div', { class: 'guess-head' }, h('h2', { id: 'gs-now' }, 'Check now', h('span', { class: 'count' }, String(now.length))), guessControls()),
      stale ? h('p', { class: 'muted', role: 'status' }, 'Updating for your last change...') : null,
      now.length ? listOf(now) : h('p', { class: 'muted' }, 'Nothing worth checking now. The guesses below are fine as they are.')),
    fold('fineOpen', 'Fine for now', fine, listOf(fine)),
    fold('laterOpen', 'Later', later, h('ul', { class: 'rows guess-rows' }, later.map((it) => row({ ...it, short: null, why: null })))) 
  ];
}

// ---------------------------------------------------------------- pick what you have (its own screen)
// Tick the accounts, cards, loans, income and bills you have; Add puts them all in with their details blank, then the
// top of My numbers shows only what is missing, and the first one opens. One Undo takes it back (S-193).
function pickerCard() {
  picking = picking || new Map();
  const have = haveCounts(cur());
  const addBtn = h('button', { type: 'button', class: 'btn primary', onclick: () => {
    const picks = [...picking].map(([key, n]) => ({ key, count: n }));
    if (!picks.length) return;
    const r = addPicked(cur(), picks, today());
    picking = null;
    if (!change(r.spine, said.added(r.count + ' item' + (r.count === 1 ? '' : 's')))) return;
    // Coming back to the top shows only what is missing, so the new ones are easy to fill in.
    kinds = ['missing'];
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ kinds })); } catch { /* storage blocked */ }
    openField(r.added[0]);
  } });
  const sync = () => { const n = [...picking.values()].reduce((x, k) => x + k, 0); addBtn.disabled = !n; addBtn.textContent = n ? 'Add ' + n + ' and fill in details' : 'Tick what you have first'; };
  const pick = (x) => {
    const box = h('input', { type: 'checkbox', checked: picking.has(x.key) });
    const many = x.many ? h('input', { type: 'number', class: 'pick-count', min: 1, max: 9, inputmode: 'numeric', 'aria-label': 'How many: ' + x.label, hidden: !picking.has(x.key) }) : null;
    if (many) { many.value = String(picking.get(x.key) || 1); many.addEventListener('input', () => { const p = parseInput('int', many.value); if (p.ok && p.value >= 1 && p.value <= 9) { picking.set(x.key, p.value); sync(); } }); }
    box.addEventListener('change', () => { if (box.checked) picking.set(x.key, many ? Math.max(1, +many.value || 1) : 1); else picking.delete(x.key); if (many) many.hidden = !box.checked; sync(); });
    const n = have.get(x.key) || 0;
    return h('label', { class: 'choice-card pick' }, box, h('span', { class: 'choice-text' }, h('strong', {}, x.label), n ? h('span', { class: 'choice-sub' }, 'You have ' + n) : null), many);
  };
  const card = h('section', { class: 'card picker', id: 'picker', 'aria-label': 'Quick add' },
    h('p', { class: 'muted' }, 'Tick what you have. Fill in the details after.'),
    ...STARTER.map((g) => h('fieldset', { class: 'pick-group' }, h('legend', {}, g.group), h('div', { class: 'pick-grid' }, g.items.map(pick)))),
    h('div', { class: 'edit-actions pick-actions' }, addBtn, h('button', { type: 'button', class: 'btn ghost', onclick: () => { picking = null; go([]); } }, 'Cancel')));
  sync();
  return card;
}

// ---------------------------------------------------------------- subscriptions (under Needs)
// Subscriptions to look at (S-191): soonest charge first, each with Reviewed today.
// Covered by others (bug sweep): one line on Needs, opening the list with who covers each.
function coveredRow() {
  const c = coveredByOthers(cur());
  if (!c.items.length) return null;
  return goRow(hashFor(['needs', 'covered']), { name: 'Covered by others', sub: [h('span', { class: 'go-total' }, money(c.monthly)), ' a month, ' + c.items.length + (c.items.length === 1 ? ' line' : ' lines')] });
}
function coveredScreen() {
  const c = coveredByOthers(cur());
  if (!c.items.length) return h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Nothing is covered by someone else.'));
  return h('section', { class: 'card', 'aria-label': 'Covered by others' },
    h('p', { class: 'muted' }, money(c.monthly) + ' a month that someone else pays, $0 to you.'),
    h('ul', { class: 'go-list' }, c.items.map((i) => goRow(ledgerHref(i.path), { name: i.label, sub: [i.monthly === null ? 'cost not given' : h('span', {}, h('span', { class: 'go-total' }, money(i.monthly)), ' a month'), ', covered by ' + (i.by || 'someone else')] }))));
}
function subsRow() {
  if (!(cur().expenses || []).length) return null;
  const sub = summaryOf(cur()).subs;
  return goRow(hashFor(['needs', 'subscriptions']), { name: 'Subscriptions', sub: sub.items.length ? [h('span', {}, h('span', { class: 'go-total' }, money(sub.monthly.value)), ' a month, ' + sub.items.length + ' marked'), sub.toLook.length ? h('span', { class: 'dot dot-rough' }, sub.toLook.length + ' to look at') : null] : 'None marked yet' });
}
// Subscriptions (bug sweep): one row each with its amount, its day and what it is paid with; the row opens its editor
// in place. Tick several to set the card or the day for all of them at once.
let subsPicked = new Set();
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const roughFact = (f) => !!f && f.kind === 'rough';
function subsScreen() {
  const sub = summaryOf(cur()).subs;
  if (!sub.items.length) return h('section', { class: 'card subs' }, h('p', { class: 'muted' }, 'None yet. Open a bill and pick Move to Subscriptions.'));
  const open = kept().open || null;
  subsPicked = new Set([...subsPicked].filter((id) => sub.items.some((i) => i.id === id)));
  const exp = (id) => getAt(cur(), 'expenses.' + id);
  const dayOf = (i) => (i.renews ? 'on the ' + ordinal(+i.renews.slice(8, 10)) + (roughFact(exp(i.id).renews) ? ' (a guess)' : '') : 'no day yet');
  const withWhat = (i) => { const e = exp(i.id); return e.paidFrom && valueOf(e.paidFrom) ? linkName(cur(), valueOf(e.paidFrom)) : 'paid with not given'; };
  // Tapped, a line opens its editor in place under it (the list stays the screen Back comes back to).
  const openOf = (i) => open === rowPathFor(cur(), 'expenses.' + i.id + '.amount');
  const line = (i) => { const r = rowByPath(rowPathFor(cur(), 'expenses.' + i.id + '.amount')); return r ? h('ul', { class: 'rows' }, rowEl(r, open, { full: true })) : null; };
  const tick = (i) => h('input', { type: 'checkbox', class: 'sub-check', id: 'sub-pick-' + i.id, 'aria-label': 'Tick ' + i.label, checked: subsPicked.has(i.id) || null, onchange: (ev) => { if (ev.target.checked) subsPicked.add(i.id); else subsPicked.delete(i.id); refresh(); } });
  const many = [...subsPicked];
  const card = linkSelect('link:cash|card', null, 'subs-card');
  const day = h('input', { id: 'subs-day', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '1 to 31' });
  const apply = () => {
    const d = day.value.trim() ? parseInput('int', day.value) : null;
    if (d && (!d.ok || d.value < 1 || d.value > 31)) { say('Day: a number from 1 to 31'); return; }
    if (!card.value && !d) { say('Pick a card or type a day first'); return; }
    let s = cur();
    for (const id of many) { if (card.value) s = chargeTo(s, id, card.value, today()); if (d) s = setChargeDay(s, id, d.value, today()); }
    subsPicked = new Set();
    change(s, many.length + ' subscriptions set' + (card.value ? ' to ' + linkName(cur(), card.value) : '') + (d ? ', on the ' + ordinal(d.value) : ''));
  };
  // One clean line per subscription (owner's ask, 2026-10-27): a small tick box, the name and its details, the chip,
  // and a chevron to the bill. Ticked ones get a set-for-all panel above the list.
  return h('section', { class: 'card subs', 'aria-label': 'Subscriptions' },
    h('p', { class: 'subs-total' }, h('strong', {}, money(sub.monthly.value)), ' a month · ', money(sub.yearly), ' a year'),
    many.length ? h('div', { class: 'subs-bulk', role: 'group', 'aria-label': 'Set for the ticked ones' },
      h('p', { class: 'subs-bulk-h' }, many.length + ' ticked'),
      h('div', { class: 'add-form' }, h('div', { class: 'add-grid' },
        h('div', { class: 'add-field short' }, h('label', { for: 'subs-card', class: 'edit-label' }, 'Paid with'), card),
        h('div', { class: 'add-field short' }, h('label', { for: 'subs-day', class: 'edit-label' }, 'Day of the month'), day))),
      h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: apply }, 'Set for ' + many.length),
        h('button', { type: 'button', class: 'btn', onclick: () => { subsPicked = new Set(); refresh(); } }, 'Clear'))) : null,
    h('ul', { class: 'subs-list' }, sub.items.map((i) => h('li', { class: 'sub-line' + (subsPicked.has(i.id) ? ' is-ticked' : '') },
      h('label', { class: 'sub-tick', for: 'sub-pick-' + i.id }, tick(i)),
      h('button', { type: 'button', class: 'sub-go', 'aria-expanded': String(openOf(i)), onclick: () => { if (!canLeave()) return; setOpen(openOf(i) ? null : rowPathFor(cur(), 'expenses.' + i.id + '.amount')); } },
        h('span', { class: 'sub-name' }, i.label),
        h('span', { class: 'sub-meta' }, [i.monthly === null ? 'amount not given' : money(i.monthly) + ' a month', dayOf(i), withWhat(i)].join(' · ')),
        i.soon ? h('span', { class: 'chip chip-soon' }, 'Charging soon') : null,
        h('span', { class: 'chev', 'aria-hidden': 'true' }, openOf(i) ? '\u2304' : '\u203A')),
      openOf(i) ? h('div', { class: 'sub-open' }, line(i)) : null))),
    h('ul', { class: 'go-list' }, h('li', {}, h('a', { class: 'go-row plain', href: 'profile.html#/review' }, h('span', { class: 'go-name' }, 'Quarterly review'), h('span', { class: 'go-sub' }, sub.toLook.length ? sub.toLook.length + ' to look at' : 'All looked at')))));
}

// ---------------------------------------------------------------- adding, copying, deleting
const ADD_WORDS = { debts: 'a debt', accounts: 'an account', income: 'income', expenses: 'an expense', goals: 'a goal' };

// The add form (S-237): the same one the Session uses (ui/add-form.js), asking first, then the name and the amount.
function addForm(n) {
  const { collection, types = [], fat } = n.add;
  return newAddForm({ spine: cur, collection, types, fat: fat ?? null, today: today(),
    // Add saves and closes; the new row is marked on the list, and the group's button offers "Add another" (slim).
    onDone: (made, label) => { adding = null; added = n.key; if (change(made.spine, said.added(label))) markAdded(label); },
    onCancel: () => { adding = null; refresh(); } });
}

let added = null;
function markAdded(label) {
  requestAnimationFrame(() => {
    const row = [...document.querySelectorAll('.go-row .go-name')].find((x) => x.textContent.trim().startsWith(label));
    if (row) row.closest('.go-row').classList.add('just-added');
  });
}
function addButton(n) {
  if (!n || !n.add || selecting) return null;
  if (adding === n.key) return addForm(n);
  // "an auto loan", "a Roth IRA": the article by sound, names keep their capitals.
  const name = n.add.types && n.add.types.length === 1 && PRESETS[n.add.types[0]] ? PRESETS[n.add.types[0]].label : null;
  const lower = name && !/^[A-Z0-9]{2}|^[A-Z][a-z]*\b [A-Z]/.test(name) && !/\b(IRA|HSA|FSA|ABLE|ESPP|RSU|CD|TSP|SEP|SIMPLE|HELOC|BNPL|IOU|401|403|457|529)\b/.test(name) ? name.toLowerCase() : name;
  const noun = lower && ['cash', 'taxable'].includes(PRESETS[n.add.types[0]].family) && !/account/i.test(lower) ? lower + ' account' : lower;
  // Spelled-out letters that start with a vowel sound take "an" (an HSA, an IRA).
  const acronym = noun && /^[A-Z]{2}/.test(noun);
  const an = noun && (acronym ? 'AEFHILMNORSX'.includes(noun[0]) : /^[aeiou]/i.test(noun) && !/^(Roth|Uni)/.test(noun));
  const what = noun ? (an ? 'an ' : 'a ') + noun : ADD_WORDS[n.add.collection];
  return h('button', { type: 'button', class: 'btn add', onclick: () => { if (!canLeave()) return; adding = n.key; refresh(); focusAdd(); } }, added === n.key ? '+ Add another' : '+ Add ' + what);
}

// Duplicate (S-190): the copy keeps everything but its name and amount, and opens on its own screen.
function dupButton(it) {
  return h('button', { type: 'button', class: 'btn small', onclick: (e) => {
    if (!canLeave()) return;
    const name = h('input', { id: 'dup-name', type: 'text', autocomplete: 'off' });
    const msg = h('p', { class: 'edit-msg', role: 'alert' });
    const form = h('form', { class: 'confirm dup-form', onsubmit: (ev) => {
      ev.preventDefault();
      const nm = name.value.trim();
      if (!nm) { msg.textContent = 'Give the copy a name'; name.focus(); return; }
      const r = duplicateItem(cur(), it.collection, it.id, today(), nm);
      name.value = '';
      if (change(r.spine, said.added(nm + ' (a copy of ' + it.label + ')'))) openField(r.firstPath);
    } },
      h('label', { for: 'dup-name', class: 'edit-label' }, 'Name for the copy'), name,
      h('button', { type: 'submit', class: 'btn primary' }, 'Make the copy'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => refresh() }, 'Cancel'),
      msg,
      h('p', { class: 'edit-hint' }, 'It keeps how often, who pays, sharing and where it is paid from. The amount starts blank.'));
    e.currentTarget.replaceWith(form);
    name.focus();
  } }, 'Duplicate');
}

// Delete never asks: it goes at once and the bar offers Undo. Its screen is gone, so the page goes up a level.
const deleteButton = (it) => h('button', { type: 'button', class: 'btn danger small', onclick: () => { if (!canLeave()) return; closeEditor(); change((s) => removeItem(s, it.collection, it.id), said.deleted(it.label)); } }, 'Delete');

// "Record what went in for <year>" (S-211): one entry added to the account's contributions by year, one undoable edit.
function saveContribution(accountId, year, amount, kind) {
  const acc = (cur().accounts || []).find((a) => a.id === accountId);
  const what = TOTAL_KINDS.includes(kind) ? (kind === 'employer' ? 'the employer part for ' : 'the total for ') + year + ', ' : 'a ' + ({ rollover: 'rollover', conversion: 'conversion', from529: '529 rollover' }[kind] || 'deposit') + ' for ' + year + ' of ';
  change(recordContribution(cur(), accountId, { year, amount, kind }, today()), 'Recorded ' + what + money(amount, !Number.isInteger(amount)) + ', in ' + (valueOf(acc.name) || accountId));
}
// An HSA through payroll or from take-home (S-227, answer 47), and the job a plan from pay is paid through (answer 60):
// one undoable edit each.
function savePayroll(accountId, on) {
  const acc = (cur().accounts || []).find((a) => a.id === accountId);
  change(setThroughPayroll(cur(), accountId, on, today()), said.changed(valueOf(acc.name) || accountId, on ? 'through payroll' : 'from take-home'));
}
function savePaidThrough(accountId, incomeId) {
  const acc = (cur().accounts || []).find((a) => a.id === accountId), job = (cur().income || []).find((s) => s.id === incomeId);
  if (!job) return;
  change(putFact(cur(), 'accounts.' + accountId + '.paidThrough', incomeId, 'known', today()), said.changed(valueOf(acc.name) || accountId, 'paid through ' + job.label));
}

// ---------------------------------------------------------------- select several
function selectToggle() {
  return h('button', { type: 'button', class: 'btn' + (selecting ? ' primary' : ''), 'aria-pressed': String(selecting), onclick: () => { if (!canLeave()) return; selecting = !selecting; selected = new Set(); closeEditor(); refresh(); } }, selecting ? 'Done selecting' : 'Select several');
}
// Pick every row on this screen (or tap again to drop them).
function selectAll(rows, words0) {
  if (!selecting || !rows.length) return null;
  return h('button', { type: 'button', class: 'btn ghost small', onclick: () => { const all = rows.every((r) => selected.has(r.path)); for (const r of rows) all ? selected.delete(r.path) : selected.add(r.path); refresh(); } }, words0);
}
// Select mode's bar: what to do with every picked row at once, on any screen.
function bulkBar(sc) {
  if (!selecting) return null;
  const rows = sc.sections.flatMap((g) => g.allRows).filter((r) => selected.has(r.path));
  const n = rows.length, lines = n + (n === 1 ? ' line' : ' lines');
  // A line with no number yet cannot be confirmed or marked rough: the bar says so rather than doing nothing.
  // The picks are cleared before the change redraws the bar, so it reads 0 selected; when nothing changed they stay.
  const run = (action, text) => {
    if (!n) return;
    const was = selected;
    selected = new Set();
    if (change(bulkEdit(cur(), rows, action, today()), text)) return;
    selected = was;
    refresh();
    say('Nothing changed: a line with no number yet cannot be ' + (action === 'confirm' ? 'confirmed' : 'marked rough') + '. Fill it in first');
  };
  return h('div', { class: 'bulk-bar', role: 'region', 'aria-label': 'Selected' },
    h('span', { class: 'bulk-count' }, n + ' selected'),
    n ? null : h('span', { class: 'disabled-why' }, 'Tick the lines to change first.'),
    h('button', { type: 'button', class: 'btn primary', disabled: !n, onclick: () => run('confirm', lines + ' confirmed') }, 'Confirm'),
    h('button', { type: 'button', class: 'btn', disabled: !n, onclick: () => run('rough', lines + ' marked rough') }, 'Mark rough'),
    h('button', { type: 'button', class: 'btn', disabled: !n, onclick: () => run('notForMe', lines + ' marked not for me') }, 'Not for me'),
    h('button', { type: 'button', class: 'btn ghost', disabled: !n, onclick: () => { selected = new Set(); refresh(); } }, 'Clear'),
    h('button', { type: 'button', class: 'btn ghost', onclick: () => { selecting = false; selected = new Set(); refresh(); } }, 'Done selecting'));
}

// ---------------------------------------------------------------- the screens
function topScreen(sc, st) {
  const spine = cur();
  const q = st.q || '';
  return [
    // The filter first (owner's ask, 2026-10-27): To fill in, then the kinds folded under Filter, what they find right under.
    fillBar(sc.sections.reduce((n, x) => n + toFill(x.counts), 0)),
    h('details', { class: 'flow-list card find-fold', open: (filtering(q) && !fillOn()) || null }, h('summary', {}, 'Filter'), filterBar(sc, q)),
    filtering(q) ? results(sc, q) : null,
    problemsCard(spine),
    matchesFile(spine) ? null : h('div', { class: 'file-banner', role: 'status' }, h('span', {}, 'You have unsaved changes.'), h('button', { type: 'button', class: 'btn small', onclick: saveFile }, 'Save')),
    filtering(q) ? null : worthPair(spine),
    filtering(q) ? null : sectionList(sc),
    h('ul', { class: 'go-list' }, guessRow()),
    source === 'saved' ? h('footer', { class: 'foot' }, h('button', { type: 'button', class: 'btn danger', onclick: backToFile }, 'Discard changes')) : null
  ];
}

// The top of the statement (Batch 4): liquid and total net worth side by side, each with Show the math that lists the
// accounts and debts it counts.
function worthPair(spine) {
  const s = summaryOf(spine), ctx = () => ({ spine: cur(), rules, s: summaryOf(cur()) });
  const one = (id, label, r, sub, ids) => h('div', { class: 'nw-one' },
    h('p', { class: 'tile-label' }, label),
    r.value === null ? h('p', { class: 'tile-value missing-text' }, 'Missing') : h('p', { class: 'tile-value' }, money(r.value)),
    r.kind === 'rough' || r.kind === 'incomplete' ? h('p', { class: 'tile-sub' }, chip(r.kind)) : null,
    mathButton(ids, ctx));
  // Said once (Krug pass): the names alone; what each counts is in Show the math. Total first, as on Today.
  return h('section', { class: 'card nw-pair', 'aria-label': 'Net worth' },
    one('total', 'Net worth', s.sheet.netWorth, null, ['netWorth']),
    one('liquid', 'Cash after card debt', s.sheet.liquidNetWorth, null, ['liquidNetWorth']));
}
// An item's figure on a group screen: a bill or a pay line shows what it counts a month (the figure it sorts and adds
// by) when that differs from its own ("$200 a month, of $2,400 a year"); the FI goal says it is figured, not added.
function rowFigure(sec, it) {
  if (sec.slug === 'goals' && it.collection === 'goals' && it.amount === undefined) return h('span', { class: 'empty' }, 'Figured from your spending, not added in');
  const own = headline(it);
  if (!['expenses', 'income'].includes(it.collection) || typeof it.amount !== 'number') return own;
  const words = money(it.amount) + ' a month';
  return own.textContent.trim() === words ? own : h('span', {}, h('span', { class: 'go-total' }, words), ' (' + own.textContent.trim() + ')');
}
// A group's total on its row: incomplete when a line in it has no amount yet.
function groupTotal(sec, g) {
  if (sec.slug === 'assets' && g.slug === 'owed-to-you') return owedFigure(cur());
  if (g.total === undefined || (g.total === null && !g.totalIncomplete)) return g.item ? headline(g.item) : h('span', {}, g.items.length + (g.items.length === 1 ? ' item' : ' items'));
  if (g.total === null) return h('span', {}, chip('missing'), h('span', { class: 'empty' }, ' No amounts yet'));
  return h('span', {}, h('span', { class: 'go-total' }, summaryMoney(g.total)), TOTAL_WORDS[sec.slug] || '', g.totalIncomplete ? [' ', chip('incomplete')] : null);
}

// What moved here from Today (Phase 2.5 Batch 5): the FI numbers on Goals, the year's tax on Taxes, the cards on Debt.
// Each number side by side with its Show the math; a blank input reads missing, never $0.
// The registry id each section's total is (tools/agree-check.mjs compares it with every other place it shows).
const SECTION_METRIC = { debt: 'debts', assets: 'assets', income: 'gross', needs: 'expenses' };
function figure(label, r, sub, ids, fi = false) {
  const ctx = () => (fi ? fiCtx(cur()) : { spine: cur(), rules, s: summaryOf(cur()) });
  return h('div', { class: 'nw-one' },
    h('p', { class: 'tile-label' }, label),
    r.value === null || r.value === undefined ? h('p', { class: 'tile-value missing-text' }, 'Missing') : h('p', { class: 'tile-value', 'data-metric': ids && ids.length === 1 ? ids[0] : null }, typeof sub === 'function' ? sub(r.value) : money(r.value)),
    r.kind === 'rough' || r.kind === 'incomplete' ? h('p', { class: 'tile-sub' }, chip(r.kind)) : null,
    ids ? mathButton(ids, ctx) : null);
}
const pctOf = (x) => Math.round(x * 1000) / 10 + '%';
function sectionTop(sec) {
  const s = summaryOf(cur());
  if (sec.slug === 'goals') {
    const fi = fiCtx(cur()).s.fi, set = pickedScenario();
    return [
      h('p', { class: 'muted' }, 'FI numbers use the ' + SCENARIO_WORDS[set].toLowerCase() + ' assumption set (' + scenarioText(cur(), rules, set) + '), the same as Today. ', h('a', { href: 'profile.html#/goals' }, 'Change it in Profile'), '.'),
      h('section', { class: 'card nw-pair fi-three', 'aria-label': 'Financial independence, three ways' },
        figure('FI number: today\'s spending', fi.today, null, ['fiToday'], true),
        figure('FI number: your goal', fi.goal, null, ['fiNumber'], true),
        figure('FI number: without debt payments', fi.implied, null, ['impliedFi'], true)),
      h('section', { class: 'card nw-pair', 'aria-label': 'How far along, and other FI numbers' },
        figure('There so far', fi.fiPercent, (x) => pctOf(x) + ' of today\'s', ['fiPercent'], true),
        figure('Lean FI', fi.leanFi, null, ['leanFi'], true), figure('Fat FI', fi.fatFi, null, ['fatFi'], true),
        figure('Barista FI', fi.baristaFi, null, ['baristaFi'], true), figure('Coast FI', fi.coastFi, null, ['coastFi'], true))
    ];
  }
  if (sec.slug === 'taxes') {
    const tx = s.tax;
    return h('section', { class: 'card nw-pair', 'aria-label': 'This year\'s tax' },
      figure(tx.year + ' tax still owed (estimate)', tx.balanceDue, null, ['taxBalanceDue']),
      h('div', { class: 'nw-one' }, h('p', { class: 'tile-label' }, 'Next payment due'), h('p', { class: 'tile-value' }, shortDate(tx.nextEstimated.date))));
  }
  if (sec.slug === 'debt') {
    const ut = s.debt.utilization;
    return [(cur().debts || []).some((d) => d.type === 'credit_card') ? h('section', { class: 'card nw-pair', 'aria-label': 'Cards' },
      figure('On every card', s.sheet.cards, null, ['cards']),
      figure('Card use, personal cards', ut.personal, pctOf, ['personalUtil']),
      figure('Card use, all cards', ut.overall, pctOf, ['overallUtil'])) : null,
    debtPayoffRow()];
  }
  if (sec.slug === 'income') return unemploymentCard();
  return null;
}

// Debt payoff dates (moved here from the Calendar): one line with the debt-free month, opening the clear dates, the
// order, the interest and the tools. The extra at the debt is the Plan's one number.
let payoffMemo = { spine: null, rules: null, row: null };
function debtPayoffRow() {
  const spine = cur();
  if (!(spine.debts || []).some((d) => (valueOf(d.balance) ?? 0) > 0)) return null;
  if (payoffMemo.spine !== spine || payoffMemo.rules !== rules) {
    const s = summaryOf(spine), sim = forecast(spine, rules, 12).sim;
    const x = planDebtExtra(spine, rules, s, { sim }), d = debtView(spine, rules, sim, s, { extra: x.amount });
    const free = [...d.clearDates.rows, ...d.clearDates.past].find((r) => r.id === 'allFree');
    payoffMemo = { spine, rules, sim, s, fact: free && !free.past ? 'Debt free ' + monthWordsOf(free.ym) : 'Debt free past ' + monthWordsOf(d.clearDates.horizon) };
  }
  const m = payoffMemo;
  return foldRow('debt-payoff', 'Payoff dates', m.fact, () => debtTab({ c: { sim: m.sim }, spine, rules, mathCtx: () => ({ spine, rules, s: m.s }), rerender: refresh }));
}

// Unemployment (owner's ask): when between jobs, what the benefit pays and for how long, the tax on it, and what the
// cash does once it stops. The weekly amount, the last week paid and the federal withholding are typed right here.
// A box saves when it is left (after the focus moves on), so the redraw keeps the next box.
const monthWordsOf = (ym) => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
function unemploymentCard() {
  const spine = cur(), s = summaryOf(spine), u = unemploymentView(spine, s, { rules }), day = today();
  if (!u.between && !u.streams.length) return null;
  const later = (fn) => setTimeout(fn, 0);
  const add = () => change((x) => { const r = addItem(x, { collection: 'income', type: 'unemployment', label: 'Unemployment benefit' }, day); return setAt(r.spine, 'income.' + r.id + '.cadence', 'weekly'); }, said.added('Unemployment benefit'));
  // A bordered box, its label above and a hint under it (affordance 3).
  const box = (id, label, hint, value, type, onSet) => {
    const b = h('input', { id, class: 'unemp-box', type: type === 'date' ? 'date' : 'text', inputmode: type === 'money' ? 'decimal' : null, autocomplete: 'off', placeholder: type === 'money' ? '$' : null, 'aria-describedby': id + '-hint' });
    b.value = type === 'date' ? value || '' : inputText('money', value);
    b.addEventListener('change', () => { const t = b.value.trim(); if (!t) return later(() => onSet(null)); if (type === 'date') return later(() => onSet(t)); const p = parseInput('money', t); if (!p.ok) { say(label + ': ' + p.message); return; } later(() => onSet(p.value)); });
    return h('div', { class: 'unemp-field' }, h('label', { for: id, class: 'edit-label' }, label), b, h('p', { class: 'edit-hint', id: id + '-hint' }, hint));
  };
  const fig = (label, value, sub) => h('div', { class: 'nw-one' }, h('p', { class: 'tile-label' }, label), value === null || value === undefined ? h('p', { class: 'tile-value missing-text' }, 'Missing') : h('p', { class: 'tile-value' }, value), sub ? h('p', { class: 'tile-sub muted' }, sub) : null);
  // The benefit in one sentence: how much, until when, how many payments are left, or that it has ended.
  const status = (x) => x.weekly === null ? 'Type the benefit a week to see how much is left.'
    : !x.end ? money(x.weekly) + ' a week. Type the last payment\'s date to see how many are left.'
      : x.ended ? 'Ended: the last payment was ' + shortDate(x.end) + '. Nothing more is coming from it.'
        : money(x.weekly) + ' a week until ' + shortDate(x.end) + ': ' + x.weeksLeft + (x.weeksLeft === 1 ? ' more payment, ' : ' more payments, ') + money(x.stillToCome) + ' still to come.';
  const stream = (x) => {
    const tax = h('div', { class: 'segmented', role: 'group', 'aria-label': x.label + ': federal tax taken out' },
      [['none', 'None taken out'], ['ten', '10% taken out']].map(([k, w]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(x.withholds === (k === 'ten')), disabled: k === 'ten' && x.weekly === null ? true : null,
        onclick: () => change((sp) => putFact(sp, x.paths.federal, k === 'ten' ? tenPercentOf(x.weekly) : 0, 'known', day), said.changed(x.label + ': federal tax', k === 'ten' ? '10% taken out' : 'none taken out')) }, h('span', { class: 'seg-label' }, w))));
    return h('section', { class: 'card', 'aria-label': x.label },
      h('h3', {}, x.label, x.ended ? [' ', h('span', { class: 'pill' }, 'ended')] : null),
      h('p', { class: 'unemp-status' }, status(x)),
      h('div', { class: 'unemp-fields' },
        box('ui-amt-' + x.id, 'Benefit a week', 'Before any tax, as the state pays it.', x.weekly, 'money', (a) => change((sp) => { let n = putFact(sp, x.paths.amount, a, a === null ? 'missing' : 'known', day); if (x.withholds && a !== null) n = putFact(n, x.paths.federal, tenPercentOf(a), 'known', day); return n; }, said.changed(x.label + ' a week', a === null ? 'blank' : money(a)))),
        box('ui-end-' + x.id, 'Last payment', 'When it ends, or ended. A past date is fine.', x.end, 'date', (d) => change((sp) => setAt(sp, 'income.' + x.id + '.end', d), said.changed(x.label + ': last payment', d ? shortDate(d) : 'not known')))),
      h('p', { class: 'edit-label' }, 'Federal tax on it'), tax,
      h('p', { class: 'edit-hint' }, 'Unemployment is taxed. Have 10% taken out each week, or set it aside yourself.'),
      // Delete (red outline, undoable): an old or duplicate benefit goes, and its numbers with it.
      h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn danger small', id: 'ui-del-' + x.id, onclick: () => change((sp) => removeItem(sp, 'income', x.id), said.deleted(x.label + (x.ended ? ' (ended ' + shortDate(x.end) + ')' : ''))) }, 'Delete this benefit')),
      x.ended ? null : h('div', { class: 'nw-pair fi-three' },
        fig('A month', x.monthly === null ? null : money(x.monthly), 'about 4.3 weeks'),
        fig('Payments left', x.weeksLeft === null ? null : String(x.weeksLeft), x.end ? 'through ' + shortDate(x.end) : 'needs the last payment'),
        fig('Still to come', x.stillToCome === null ? null : money(x.stillToCome), null),
        fig('A month after tax', x.afterTaxMonthly === null ? null : money(x.afterTaxMonthly), x.withholds === false && x.setAsideMonthly ? money(x.setAsideMonthly) + ' a month to set aside for tax' : x.withholds ? '10% taken out each week' : null)));
  };
  return h('section', { class: 'card unemp', 'aria-labelledby': 'unemp-h' },
    h('h2', { id: 'unemp-h' }, 'Unemployment'),
    u.jobsStillPaying.length ? h('p', { class: 'tile-note unemp-note' }, 'Still counted as paying: ', ...u.jobsStillPaying.flatMap((j, i) => [i ? ', ' : '', h('a', { href: ledgerHref(j.path) }, j.label)]), '. If the job ended, give it an end date so the numbers stop counting it.') : null,
    u.streams.length ? u.streams.map(stream) : [h('p', {}, 'No unemployment benefit in your numbers yet.'), h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: add }, 'Add the weekly benefit'))],
    h('div', { class: 'nw-pair' },
      fig('Cash runway now', u.runway === null ? null : u.runway.toFixed(1) + ' months', u.streams.length && u.streams.every((x) => x.ended) ? 'with no benefit coming' : u.streams.length ? 'with the benefit still coming' : null),
      fig('On needs only', u.runwayNeeds === null ? null : u.runwayNeeds.toFixed(1) + ' months', null)),
    u.after ? h('section', { class: 'card', 'aria-labelledby': 'unemp-after-h' }, h('h3', { id: 'unemp-after-h' }, u.after.now ? 'Now that it has ended' : 'When it ends'),
      h('p', {}, (u.after.now ? 'This month (' + monthWordsOf(u.after.ym) + '), with no benefit: ' : 'In ' + monthWordsOf(u.after.ym) + ', the first full month without it: ') + (u.after.left === null ? 'it cannot be figured yet, a number is missing.' : u.after.left >= 0 ? money(u.after.left) + ' is left over from the pay that continues.' : 'it runs ' + money(-u.after.left) + ' short a month' + (u.after.months === null ? '.' : '. Your cash of ' + money(u.cash) + ' covers about ' + u.after.months.toFixed(1) + ' months of that.')))) : u.streams.length ? h('p', { class: 'tile-sub muted' }, 'Type the last payment\'s date to see what happens when it ends.') : null,
    mathButton(['runway', 'runwayNeeds', 'taxSetAside'], () => ({ spine: cur(), rules, s: summaryOf(cur()) })));
}

function sectionScreen(sec) {
  const groups = fillOn() ? sec.groups.filter((g) => toFill(g.counts)) : sec.groups;
  return [
    fillBar(toFill(sec.counts)),
    sectionTop(sec),
    selectAll(sec.allRows, 'Select all here'),
    fillOn() && !groups.length ? h('p', { class: 'muted' }, 'Nothing to fill in here.') : null,
    groups.length ? h('ul', { class: 'go-list' }, groups.map((g) => goRow(hashFor([sec.slug, g.slug]), {
      name: g.label,
      sub: [groupTotal(sec, g), dots(g)]
    }))) : fillOn() ? null : h('p', { class: 'muted' }, 'Nothing here yet.'),
    sec.slug === 'needs' && !fillOn() ? h('ul', { class: 'go-list' }, subsRow(), coveredRow()) : null,
    addButton(sec)
  ];
}

function groupScreen(sec, g, st = {}) {
  // Business only (owner's ask, 2026-10-27): on a screen with business sub-groups, a filter shows just those.
  const hasBiz = g.parts.some((p) => p.node && p.node.business);
  const bizOnly = hasBiz && !!st.bizOnly;
  const filter = hasBiz ? h('div', { class: 'segmented biz-filter', role: 'group', 'aria-label': 'Which cards' },
    [[false, 'All cards'], [true, 'Business only']].map(([on, w]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(bizOnly === on), onclick: () => { if (bizOnly !== on) { keep({ bizOnly: on }); refresh(); } } }, h('span', { class: 'seg-label' }, w)))) : null;
  // A bank's heading stays when only its business cards show; its business part reads "Business" under it.
  const parts0 = bizOnly ? g.parts.filter((p) => p.node && p.node.business) : g.parts;
  const parts = fillOn() ? parts0.map((p) => ({ ...p, items: p.items.filter((it) => toFill(it.counts)) })).filter((p) => p.items.length) : parts0;
  const head = (p, i) => (bizOnly ? h('h2', { class: 'part-h' }, p.node.bank) : p.node && p.node.sub ? h('h3', { class: 'part-h part-sub' }, p.heading) : p.heading ? h('h2', { class: 'part-h' }, p.heading) : null);
  const itemRow = (it, k) => goRow(hashFor([sec.slug, g.slug, g.slugs[g.items.indexOf(it)]]), {
    name: it.label,
    sub: [rowFigure(sec, it), needWords(it.need) ? h('span', { class: 'pill' }, needWords(it.need)) : null, dots(it)]
  });
  return [
    fillBar(toFill(g.node.counts)),
    sectionSharing(g.node),
    selectAll(g.node.allRows, 'Select all here'),
    filter,
    fillOn() && !parts.length ? h('p', { class: 'muted' }, 'Nothing to fill in here.') : null,
    ...parts.map((p, i) => [
      head(p, i),
      p.items.length ? h('ul', { class: 'go-list' }, p.items.map(itemRow)) : null,
      addButton(p.node)
    ]),
    bizOnly && !parts.length ? h('p', { class: 'muted' }, 'No business cards yet.') : null,
    addButton(g.node)
  ];
}

function itemScreen(sec, g, it, st) {
  // How much to max it? (S-211): every tax-advantaged account opens a panel of its room, deadline and amounts.
  const acct = it.collection === 'accounts' ? (cur().accounts || []).find((x) => x.id === it.id) : null;
  const maxable = acct && canMaxIt(rules, acct, +cur().meta.asOf.slice(0, 4));
  const maxShown = maxable && !!st.max;
  const maxBtn = maxable ? h('button', { type: 'button', class: 'btn small', 'aria-expanded': String(maxShown), 'aria-controls': 'max-' + it.id, onclick: () => { if (!canLeave()) return; keep({ max: !maxShown }); refresh(); } }, maxShown ? 'Hide how much to max it' : 'How much to max it?') : null;
  return [
    it.key === 'household.situation' ? unemploymentCard() : null,
    g.item && it.label !== g.label ? h('p', { class: 'muted' }, it.label) : null,
    it.note ? h('p', { class: 'muted item-note' }, it.note) : null,
    selectAll(it.rows, 'Select these'),
    fillBar(toFill(it.counts)),
    (() => { const all = fillOn() ? it.rows.filter((r) => kinds.includes(r.fact.kind)) : it.rows;
      // How you feel about a debt (stress, reasons to keep it) folds under one line (Krug pass), so the card's own
      // numbers come first; it opens by itself when one of its rows is open.
      const feel = (r) => /\.(stress|reasonsToKeep)$/.test(r.path), rows = all.filter((r) => !feel(r)), feels = all.filter(feel);
      return [h('section', { class: 'card', 'aria-label': it.label }, h('ul', { class: 'rows' }, rows.length ? rows.map((r) => rowEl(r, st.open || null)) : h('li', { class: 'muted' }, 'Nothing to fill in here.'))),
        feels.length ? h('details', { class: 'card done-group feel-fold', open: feels.some((r) => r.path === st.open) || kept().feel || null, ontoggle: (e) => { if (!!kept().feel !== e.target.open) keep({ feel: e.target.open }); } },
          h('summary', {}, h('span', {}, 'How you feel about it'), h('span', { class: 'count' }, feels.filter((r) => /stress$/.test(r.path) && r.fact.value !== null).map((r) => 'stress ' + r.fact.value + ' of 10').join(''))),
          h('ul', { class: 'rows' }, feels.map((r) => rowEl(r, st.open || null)))) : null]; })(),
    // What is charged to a card (owner's ask, 2026-10-27).
    it.collection === 'debts' && !selecting && (cur().debts || []).some((d) => d.id === it.id && d.type === 'credit_card') ? chargesCard(cur(), it.id) : null,
    // Contributions by year (owner's ask, 2026-10-27): an account that can hold them and has none offers to add them.
    it.collection === 'accounts' && !selecting && (() => { const a = (cur().accounts || []).find((x) => x.id === it.id); return a && !a.contributions && ['ira', 'taxable', 'employerRetirement', 'hsaFsa', 'education'].includes(a.family); })()
      ? h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn add', onclick: () => { if (!canLeave()) return; if (change(putFact(cur(), 'accounts.' + it.id + '.contributions', [], 'missing', today()), 'Contributions by year added to ' + it.label)) openField('accounts.' + it.id + '.contributions'); } }, '+ Add contributions by year')) : null,
    // A card's annual fee (owner's ask, 2026-10-27): one tap adds the row and opens it to type the fee.
    it.collection === 'debts' && !selecting && (cur().debts || []).some((d) => d.id === it.id && d.type === 'credit_card' && !d.annualFee) ? h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn add', onclick: () => { if (!canLeave()) return; if (change(addFee(cur(), it.id, today()), 'Annual fee added to ' + it.label)) openField('debts.' + it.id + '.annualFee'); } }, '+ Add an annual fee')) : null,
    it.collection && !selecting ? h('div', { class: 'item-actions' }, maxBtn, dupButton(it), deleteButton(it)) : null,
    maxShown && !selecting ? maxItPanel(cur(), rules, it.id, { onRecord: saveContribution, onPayroll: savePayroll, onPaidThrough: savePaidThrough }) : null
  ];
}

// A level's words for the trail and the title; null when that level is not there any more.
function nameOf(levels, ctx) {
  inst = ctx.institutions || inst; rules = ctx.rules || rules;
  if (levels[0] === 'still-guessing') return levels.length === 1 ? 'Still guessing' : null;
  if (levels[0] === 'pick') return levels.length === 1 ? 'Quick add' : null;
  if (levels[0] === 'needs' && levels[1] === 'subscriptions') return levels.length === 2 ? 'Subscriptions' : null;
  if (levels[0] === 'needs' && levels[1] === 'covered') return levels.length === 2 ? 'Covered by others' : null;
  if (levels[0] === 'assets' && levels[1] === 'owed-to-you' && /^p-/.test(levels[2] || '')) { const p = owedToYou(ctx.spine).find((x) => personSlug(x.key) === levels[2]); return levels.length === 3 && p ? p.name : null; }
  const at = screenAt(screensOf(ctx.spine), levels);
  if (!at) return null;
  return levels.length === 1 ? at.section.label : levels.length === 2 ? at.group.label : at.item.label;
}

function render(ctx) {
  rules = ctx.rules; inst = ctx.institutions || inst; source = ctx.source;
  const spine = ctx.spine, levels = ctx.levels, key = levels.join('/');
  // Shown straight from the file (no browser edits): the file and the page match.
  if (!based) { based = true; if (source !== 'saved') setBaseline(spine); }
  // A new screen: what was open on the last one closes; typing left there unsaved is said, never dropped silently.
  if (key !== screenKey) {
    if (screenKey !== null && dirty && edCache) say('Not saved: ' + edCache.label);
    dirty = false; edCache = null; adding = null; sharingOpen = null; resetOwedForms();
    screenKey = key;
  }
  let st = ctx.state || {};
  // A link that has landed: what it opens is kept with the screen, and it scrolls to it.
  if (pending && pending.key === key) {
    const p = pending; pending = null;
    keep(p.patch); st = { ...st, ...p.patch };
    if (p.patch.open !== (edCache && edCache.path)) { dirty = false; edCache = null; }
    if (p.scroll) requestAnimationFrame(() => { const el = document.getElementById(p.scroll.id); if (!el) return; el.scrollIntoView({ block: p.scroll.block }); if (p.scroll.focus) document.getElementById('edit-input')?.focus({ preventScroll: true }); });
  } else if (pending) pending = null; // it landed somewhere else (its screen was gone): it never opens later by surprise
  refreshGuess(spine);
  const sc = screensOf(spine);
  let body;
  if (levels[0] === 'still-guessing') body = guessList();
  else if (levels[0] === 'pick') body = pickerCard();
  else if (levels[0] === 'needs' && levels[1] === 'subscriptions') body = subsScreen();
  else if (levels[0] === 'needs' && levels[1] === 'covered') body = coveredScreen();
  // Owed to you (shared bills brief): person by person; a loan's own fields still open as an item.
  else if (levels[0] === 'assets' && levels[1] === 'owed-to-you' && levels.length === 2) body = owedScreen(cur(), { href: (slug) => hashFor(['assets', 'owed-to-you', slug]) });
  else if (levels[0] === 'assets' && levels[1] === 'owed-to-you' && /^p-/.test(levels[2] || '')) body = personScreen(cur(), levels[2]);
  else {
    const at = screenAt(sc, levels) || {};
    body = !levels.length ? topScreen(sc, st) : levels.length === 1 ? sectionScreen(at.section) : at.item ? itemScreen(at.section, at.group, at.item, st) : groupScreen(at.section, at.group, st);
  }
  return [body, bulkBar(sc)];
}

// ---------------------------------------------------------------- the profile file
// The profile file (S-195): save downloads it; load reads one back. Loading a different household starts its own
// history, as Open file does.
function saveFile() {
  downloadProfile(cur());
  refresh();
  say('Saved ' + FILE_NAME + ' to your downloads.');
}
// Both buttons read the file through the one loader (household.js loadMyFile, S-228): a line it cannot use is listed
// at the top of My numbers, never a reason to refuse the file.
async function loadFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  try { reopen(await loadMyFile(file, rules), 'Loaded ' + file.name); } catch (err) { console.warn(err); say(loadFailWords(err, file.name)); }
  ev.target.value = '';
}
// Back to the file: the edits saved in this browser go, and the bar offers them back.
async function backToFile() {
  const before = cur();
  forgetSaved();
  let loaded;
  try { loaded = await loadAll(); } catch (err) { change(before, 'Your edits are back'); say('The file could not be read: ' + err.message); return; }
  if (loaded.source !== 'saved') setBaseline(loaded.spine);
  reopen(loaded);
  say('Back to the file. The edits saved in this browser were dropped', () => change(before, 'The edits saved in this browser are back'));
}

// What the file held that could not be used (S-228): each one named in plain words, with what the file had.
// A field set to missing leaves the list once it is entered; the rest is said once, folded.
function problemsCard(spine) {
  const p = fileProblems(spine);
  if (!p.open.length && !p.other.length) return null;
  // What the file had, only when it is a plain word or number (never a whole record).
  const held = (x) => (typeof x.held === 'string' && x.held.trim() ? ' Your file had "' + (x.held.length > 40 ? x.held.slice(0, 37) + '...' : x.held) + '".' : typeof x.held === 'number' && Number.isFinite(x.held) ? ' Your file had ' + x.held + '.' : '');
  const item = (x) => h('li', {}, x.link ? fieldLink(x.link, x.label) : h('strong', {}, x.label), ': ' + x.words + '.' + held(x));
  return h('section', { class: 'card', 'aria-labelledby': 'problems-h', role: p.open.length ? 'alert' : null },
    h('h2', { id: 'problems-h' }, p.open.length ? 'From your file: ' + p.open.length + ' to enter again' : 'From your file'),
    p.open.length ? [h('p', { class: 'muted' }, 'Each shows as missing until you enter it. Nothing else in your file was changed.'), h('ul', { class: 'flow-list' }, p.open.map(item))] : null,
    p.other.length ? h('details', { class: 'flow-list' }, h('summary', {}, 'Read another way or set aside (' + p.other.length + ')'), h('ul', {}, p.other.map(item))) : null);
}

// The page's own buttons, on the top screen: save the file, load another (the example loads from its header), pick.
function actions(ctx) {
  if (ctx.levels.length) return [];
  const spine = ctx.spine, mine = !whose(spine).example;
  return [
    // One filled button a screen: on the example, Open file is it.
    h('button', { type: 'button', class: matchesFile(spine) || whose(spine).example ? 'btn' : 'btn primary', onclick: saveFile }, 'Save'),
    mine ? h('button', { type: 'button', class: 'btn', onclick: () => { if (canLeave()) document.getElementById('load-file').click(); } }, 'Load profile file') : null,
    mine ? h('input', { type: 'file', id: 'load-file', accept: '.json,application/json', hidden: true, 'aria-label': 'Your profile file', onchange: loadFile }) : null,
    h('button', { type: 'button', class: 'btn', onclick: () => { if (!canLeave()) return; picking = picking || new Map(); go(['pick']); } }, 'Quick add')
  ];
}

// An old link to a field or an account (ledger.html#expenses.rent.amount, #max:roth, from Today, the Calendar, Show
// the math) opens its screen with that field open. The address is tidied first, so a reload does not open it again.
function oldLink() {
  const raw = location.hash.slice(1);
  if (!raw || raw.startsWith('/') || !cur()) return;
  let p = raw;
  try { p = decodeURIComponent(raw); } catch { /* not encoded */ }
  history.replaceState(history.state, '', location.pathname + location.search);
  if (p.startsWith('max:')) openMax(p.slice(4)); else openField(p);
}

// Closing or leaving the page with unsaved typing asks first.
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', oldLink);

startPage({ tab: 'numbers', title: 'My numbers', name: nameOf, actions, render }).then(oldLink);
