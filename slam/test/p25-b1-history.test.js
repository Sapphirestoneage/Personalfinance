// Phase 2.5, Batch 1: one household history shared by every page (S-230). Every kind of change in engine/edits.js,
// made the way the shell makes it (house defaults, then commit, then saved with its history), undoes to exactly the
// household before it, after a page change too (a fake localStorage read again). The history keeps the last 25,
// survives a reload, and is cleared when a different household loads. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJson, loadRules } from './spine-helpers.js';
import * as E from '../engine/edits.js';
import { applyDefaults } from '../engine/defaults.js';
import { loadAll, openHistory, keepHistory, loadMyFile, forgetSaved, HISTORY_STEPS } from '../ui/household.js';
import { said, money } from '../ui/view.js';

const R = loadRules();
const T = '2026-10-25';

// A browser with made-up storage and the app's own files, put back after the test.
async function inBrowser(fn) {
  const keep = { fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.fetch = async (url) => { const f = fileURLToPath(url); return existsSync(f) ? { ok: true, json: async () => JSON.parse(readFileSync(f, 'utf8')) } : { ok: false, json: async () => null }; };
  try { return await fn(store); } finally { globalThis.fetch = keep.fetch; globalThis.localStorage = keep.localStorage; }
}
// What the shell's change() does, without the page: house defaults, one step (25 kept), saved with the history.
const step = (hist, next, words) => { const h = E.commit(hist, applyDefaults(next, R), words, HISTORY_STEPS); assert.ok(keepHistory(h)); return h; };
// Another page opening: the household and its history read again from this browser.
const reopen = async () => { const loaded = await loadAll(); return openHistory(loaded.spine); };

// Every edit function in engine/edits.js that changes a household, each with the household it starts from.
const card = () => E.parseCardRate({ apr: '19.99', hasIntro: true, introRate: '0', introEnds: '2027-03-31' }).value;
const withMaybe = (s) => E.addMaybe(s, { label: 'Tax refund', amount: 800 }).spine;
const withLog = (s) => E.logSpend(s, { amount: 42.5, date: T, tag: 'food', merchant: 'Corner market' }).spine;
const withHappened = (s) => E.confirmOccurrence(s, 'rent|2026-11-01', { amount: 1500 });
const CHANGES = {
  editFact: [null, (s) => E.editFact(s, 'expenses.rent.amount', 'set', { value: 1000, today: T })],
  'editFact (confirm, not for me, clear)': [null, (s) => E.editFact(E.editFact(E.editFact(s, 'accounts.chk.balance', 'confirm', { today: T }), 'expenses.gym.amount', 'notForMe', { today: T }), 'expenses.phone.amount', 'clear', { today: T })],
  putFact: [null, (s) => E.putFact(s, 'debts.visa.dueDay', 12, 'known', T)],
  setThroughPayroll: [(s) => E.addItem(s, { collection: 'accounts', type: 'hsa', label: 'HSA' }, T).spine, (s) => E.setThroughPayroll(s, 'hsa', true, T)],
  addContribution: [null, (s) => E.addContribution(s, 'roth', { year: 2026, amount: 500 }, T)],
  recordContribution: [null, (s) => E.recordContribution(s, 'roth', { year: 2026, amount: 3000 }, T)],
  editCardRate: [null, (s) => E.editCardRate(s, 'visa', 'set', { value: card(), today: T })],
  editExpense: [null, (s) => E.editExpense(s, 'rent', { amount: 1100, cadence: 'monthly', sharing: { shared: true, sharedWith: 2, yourShare: 0.5, whoPays: 'part' } }, T)],
  editIncome: [null, (s) => E.editIncome(s, 'salary', { amount: 2600, cadence: 'semimonthly', payDay: 1, payDay2: 15 }, T)],
  setPay: [null, (s) => E.setPay(s, 'salary', { basis: 'hourly', hourlyRate: 30, hoursPerWeek: 40, cadence: 'biweekly' }, T)],
  setSectionSharing: [null, (s) => E.setSectionSharing(s, 'food', { shared: true, sharedWith: 2, yourShare: 0.5 }, T)],
  addItem: [null, (s) => E.addItem(E.addItem(s, { collection: 'expenses', label: 'Gym bag', fat: null }, T).spine, { collection: 'debts', type: 'credit_card', label: 'Amex Blue' }, T).spine],
  editPayment: [null, (s) => E.editPayment(s, 'rent', { from: 'chk', day: 1 }, T)],
  duplicateItem: [null, (s) => E.duplicateItem(s, 'expenses', 'gym', T, 'Gym two').spine],
  removeItem: [null, (s) => E.removeItem(E.removeItem(s, 'debts', 'visa'), 'income', 'tutoring')],
  bulkEdit: [null, (s) => E.bulkEdit(s, [{ path: 'expenses.rent.amount', type: 'money' }, { path: 'debts.visa.apr', type: 'cardRate' }], 'rough', T)],
  moveOccurrence: [null, (s) => E.moveOccurrence(s, 'rent|2026-11-01', '2026-11-03')],
  skipOccurrence: [withHappened, (s) => E.skipOccurrence(s, 'rent|2026-11-01', true)],
  repriceOccurrence: [null, (s) => E.repriceOccurrence(s, 'utilities|2026-11-10', 140)],
  lockOccurrence: [null, (s) => E.lockOccurrence(s, 'rent|2026-11-01', true)],
  addMaybe: [null, withMaybe],
  setMaybeDate: [withMaybe, (s) => E.setMaybeDate(s, 'tax-refund', '2026-12-01')],
  removeMaybe: [withMaybe, (s) => E.removeMaybe(s, 'tax-refund')],
  logSpend: [null, withLog],
  removeLog: [withLog, (s) => E.removeLog(s, 'l1')],
  checkIn: [null, (s) => E.checkIn(s, { date: T, balances: { chk: 2500, hysa: 9000 }, forecast: { chk: 2400 } })],
  setSweep: [null, (s) => E.setSweep(s, { on: true, to: 'hysa', keep: 500 })],
  confirmOccurrence: [null, withHappened],
  unconfirmOccurrence: [withHappened, (s) => E.unconfirmOccurrence(s, 'rent|2026-11-01')]
};
// What is not a change: reading and parsing, and the history itself.
const NOT_CHANGES = ['parseInput', 'inputText', 'parseCardRate', 'createHistory', 'commit', 'undo', 'redo', 'canUndo', 'canRedo', 'undoLabel', 'redoLabel', 'MAX_STEPS', 'TOTAL_KINDS', 'occurrenceLogKey'];

test('every edit function in engine/edits.js has an undo test here', () => {
  const covered = new Set(Object.keys(CHANGES).map((k) => k.split(' ')[0]));
  for (const name of Object.keys(E)) if (!NOT_CHANGES.includes(name)) assert.ok(covered.has(name), name + ' changes a household: add it to CHANGES');
});

for (const [name, [setup, change]] of Object.entries(CHANGES)) {
  test('undo after ' + name + ' gives back exactly the household before it, on this page and after a page change', () => inBrowser(async () => {
    let hist = E.createHistory((await loadAll()).spine);
    if (setup) hist = step(hist, setup(hist.present), 'Set up');
    const before = structuredClone(hist.present);
    hist = step(hist, change(hist.present), name);
    const after = structuredClone(hist.present);
    assert.notDeepEqual(after, before, name + ' changed something');
    // On this page.
    assert.deepEqual(E.undo(hist).present, before);
    // On another page: the household and its history read again from this browser.
    let again = await reopen();
    assert.deepEqual(again.present, after, 'the next page opens on the change');
    assert.equal(E.undoLabel(again), name);
    again = E.undo(again);
    assert.deepEqual(again.present, before, 'Undo on the next page');
    assert.ok(keepHistory(again));
    // And Redo, after one more page change.
    const third = await reopen();
    assert.deepEqual(third.present, before);
    assert.deepEqual(E.redo(third).present, after, 'Redo comes back to the change');
  }));
}

test('the history keeps the last 25 changes, and they survive a reload', () => inBrowser(async () => {
  let hist = E.createHistory((await loadAll()).spine);
  const states = [structuredClone(hist.present)];
  for (let i = 1; i <= 30; i++) { hist = step(hist, E.editFact(hist.present, 'expenses.rent.amount', 'set', { value: 1000 + i, today: T }), said.changed('Rent', money(1000 + i))); states.push(structuredClone(hist.present)); }
  assert.equal(HISTORY_STEPS, 25);
  assert.equal(hist.past.length, 25, 'the 26th change back is dropped');
  let again = await reopen();
  assert.equal(again.past.length, 25);
  assert.equal(E.undoLabel(again), 'Rent changed to $1,030');
  for (let i = 0; i < 25; i++) again = E.undo(again);
  assert.deepEqual(again.present, states[5], 'back 25 changes, to after the fifth');
  assert.equal(E.canUndo(again), false);
  // The future is kept too, so Redo works after the next reload.
  assert.ok(keepHistory(again));
  const later = await reopen();
  assert.equal(later.future.length, 25);
  assert.equal(E.redoLabel(later), 'Rent changed to $1,006');
}));

test('the history is cleared when a different household loads: Load my file, or going back to the file or the example', () => inBrowser(async () => {
  let hist = E.createHistory((await loadAll()).spine);
  hist = step(hist, E.editFact(hist.present, 'expenses.rent.amount', 'set', { value: 1000, today: T }), 'Rent changed to $1,000');
  assert.equal((await reopen()).past.length, 1);
  // Load my file: someone else's household.
  const other = readJson('fixtures/demo.json');
  other.meta = { ...other.meta, name: 'The Avery household', demo: false };
  const loaded = await loadMyFile({ name: 'avery.json', text: async () => JSON.stringify(other) }, R);
  assert.equal(loaded.source, 'saved');
  const fresh = await reopen();
  assert.equal(fresh.past.length, 0, 'nothing from the last household can be undone onto this one');
  assert.equal(fresh.present.meta.name, 'The Avery household');
  // A change on it, then going back to the example.
  let h2 = step(fresh, E.editFact(fresh.present, 'expenses.rent.amount', 'set', { value: 900, today: T }), 'Rent changed to $900');
  assert.equal(h2.past.length, 1);
  forgetSaved();
  const back = await reopen();
  assert.equal(back.past.length, 0);
  assert.equal(back.present.meta.demo, true);
}));

test('a household saved some other way starts a fresh history rather than undoing onto it', () => inBrowser(async (store) => {
  let hist = E.createHistory((await loadAll()).spine);
  hist = step(hist, E.editFact(hist.present, 'expenses.rent.amount', 'set', { value: 1000, today: T }), 'Rent changed to $1,000');
  // Something else writes the household (a page not on the shell yet).
  const saved = JSON.parse(store.get('slam-spine:v1'));
  saved.expenses.find((x) => x.id === 'gym').amount.value = 15;
  store.set('slam-spine:v1', JSON.stringify(saved));
  const again = await reopen();
  assert.equal(again.past.length, 0);
  assert.equal(again.present.expenses.find((x) => x.id === 'gym').amount.value, 15, 'what was saved is kept');
}));

test('commit keeps as many steps as it is asked to', () => {
  let h = E.createHistory({ n: 0 });
  for (let i = 1; i <= 5; i++) h = E.commit(h, { n: i }, 'n ' + i, 3);
  assert.deepEqual(h.past.map((x) => x.label), ['n 3', 'n 4', 'n 5']);
  let k = E.createHistory({ n: 0 });
  for (let i = 1; i <= 205; i++) k = E.commit(k, { n: i }, '');
  assert.equal(k.past.length, E.MAX_STEPS, 'the default is unchanged');
});

test('the words for a change', () => {
  assert.equal(said.changed('Rent', '$1,000'), 'Rent changed to $1,000');
  assert.equal(said.added('Amex Blue'), 'Amex Blue added');
  assert.equal(said.deleted('Gym'), 'Gym deleted');
  assert.equal(said.moved('Rent', '2026-11-03'), 'Rent moved to Nov 3, 2026');
  assert.equal(said.moved('Rent', 'next week'), 'Rent moved to next week');
  assert.equal(said.happened('Rent'), 'Rent marked as happened');
});
