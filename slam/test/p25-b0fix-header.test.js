// Phase 2.5, Batch 0 fixes: the header and Open file, and what a file that cannot be read says. Adapted from the
// second build's p25-header-whose and p25-safety-loader tests. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SLAM, readJson, loadRules } from './spine-helpers.js';
import { whose, loadMyFile, loadAll, SOURCE_WORDS } from '../ui/household.js';
import { loadFailWords } from '../ui/profile-file.js';
import { loadHousehold, readHousehold, fileProblems } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';

const R = loadRules();
const demo = () => loadHousehold(readJson('fixtures/demo.json'));
const client = () => { const s = demo(); s.meta = { ...s.meta, name: 'The Avery household', demo: false, from: 'test' }; s.household.people[0].name = 'Jordan Avery'; return s; };
const fileOf = (name, text) => ({ name, text: async () => text });
// Words a client screen never shows (THE COPY RULE), and app-internal names.
const JARGON = /\b(schema|spine|field|fields|path|registry|engine|stored|simulation|kind)\b|slam-spine|_meta|the Ledger lists|fixtures\//i;

test('whose: the person\'s name first, then the household\'s name, then "Your household"', () => {
  assert.deepEqual(whose(demo()), { example: true, name: 'Example household' });
  assert.deepEqual(whose(client()), { example: false, name: 'Jordan Avery' });
  const noPerson = client(); noPerson.household.people[0].name = '  ';
  assert.deepEqual(whose(noPerson), { example: false, name: 'The Avery household' });
  const neither = client(); neither.household.people[0].name = ''; neither.meta.name = 'Household';
  assert.equal(whose(neither).name, 'Your household');
});

test('the header never shows a file path', () => {
  for (const w of Object.values(SOURCE_WORDS)) assert.doesNotMatch(w, /\/|\.json/, w);
  assert.equal(SOURCE_WORDS.local, 'Your file on this computer');
});

test('Open file: a file that is not a household says so in plain words, and that nothing changed', async () => {
  const files = [fileOf('notes.txt', 'just some notes'), fileOf('budget.json', JSON.stringify({ schemaVersion: 16, profile: { name: 'Someone' } })), fileOf('empty.json', ''), fileOf('list.json', '[]'), fileOf('blank.json', '{}')];
  const warn = console.warn; console.warn = () => {};
  try {
    for (const f of files) {
      await assert.rejects(loadMyFile(f, R), (err) => {
        const shown = loadFailWords(err, f.name);
        assert.equal(shown, f.name + ' is not a household file from this app. Nothing changed.');
        assert.doesNotMatch(shown.replace(f.name, ''), JARGON);
        return true;
      });
    }
  } finally { console.warn = warn; }
  // Anything else that goes wrong still says the file's name and that nothing changed.
  assert.equal(loadFailWords(new Error('x is undefined'), 'avery.json'), 'Could not read avery.json. Nothing changed.');
});

test('a file with things that cannot be read: the page line and My numbers use client words', async () => {
  const v5 = { _meta: { name: 'Sam Example', asOf: '2026-10-22', version: 5 }, household: { people: [{ name: 'Sam Example' }], filingStatus: 'single', state: 'NY' },
    income: [{ type: 'w2', label: 'Job', amount: 5000, cadence: 'fortnightly' }], expenses: [{ id: 'rent', label: 'Rent', amount: '1,200', cadence: 'monthly' }],
    accounts: [{ id: 'chk', type: 'checking', family: 'cash', balance: 900, cashback: 2 }, { id: 'robo', type: 'robo_advisor', family: 'taxable', name: 'Robo', balance: 10 }], debts: [null], goals: 'see notes' };
  const loaded = await loadMyFile(fileOf('sam.json', JSON.stringify(v5)), R);
  assert.match(loaded.problem, /\d+ things in your file could not be read, so they show as missing\. Fill them in at the top of My numbers\./);
  assert.doesNotMatch(loaded.problem.replace('sam.json', ''), JARGON);
  const p = fileProblems(loaded.spine);
  for (const x of [...p.open, ...p.other]) {
    assert.doesNotMatch(x.label, /[a-z]+\.[a-z0-9-]+/i, 'a label is words, never a place in the file: ' + x.label);
    assert.doesNotMatch(x.words, JARGON, x.words);
  }
  // What the profile reader passed over is named too: goals that are not a list, a debt that is not a record.
  const paths = loaded.spine.meta.problems.map((x) => x.path);
  assert.ok(paths.includes('goals'), JSON.stringify(paths));
  assert.ok(paths.includes('debts[0]'), JSON.stringify(paths));
  assert.equal(loaded.spine.meta.unread.goals, 'see notes', 'kept, not dropped');
  // The Ledger's list prints what the file had only when it is a word or a number, never a record.
  const ledger = readFileSync(SLAM + 'ui/ledger.js', 'utf8');
  assert.doesNotMatch(ledger, /JSON\.stringify\(x\.held\)/);
  assert.match(ledger, /'From your file: ' \+ p\.open\.length \+ ' to enter again'/);
});

test('a profile file read twice keeps one copy of what it passed over', () => {
  const raw = { _meta: { name: 'Pat', asOf: '2026-10-22', version: 4 }, household: { people: [{ id: 'pat', name: 'Pat', birthDate: '1990-01-01' }] }, income: [], expenses: [], accounts: [], debts: 'none', goals: [] };
  const once = readHousehold(raw, { today: '2026-10-25' });
  assert.deepEqual(once.problems.filter((x) => x.path === 'debts').length, 1);
  const twice = readHousehold(JSON.parse(JSON.stringify(once.spine)), { today: '2026-10-25' });
  assert.equal(twice.spine.meta.problems.filter((x) => x.path === 'debts').length, 1, 'still listed once, until it is entered');
});

// A browser with made-up storage and the app's own files: what loadAll does on each page open.
function browser(saved) {
  const store = new Map(saved === undefined ? [] : [['slam-spine:v1', saved]]);
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.fetch = async (url) => { const f = fileURLToPath(url); return existsSync(f) ? { ok: true, json: async () => JSON.parse(readFileSync(f, 'utf8')) } : { ok: false, json: async () => null }; };
  return store;
}

test('a saved household that cannot be read is copied once, however often the page opens, and the line is plain', async () => {
  const warn = console.warn; console.warn = () => {};
  const keep = { fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  try {
    for (const bad of [JSON.stringify({ hello: 'world' }), 'not json at all']) {
      const store = browser(bad);
      let last;
      for (let i = 0; i < 4; i++) last = await loadAll();
      const copies = [...store.keys()].filter((k) => k.startsWith('slam-spine:v1:unreadable:'));
      assert.equal(copies.length, 1, 'one copy after four page opens');
      assert.equal(store.get(copies[0]), bad, 'the copy is what was saved');
      assert.equal(store.get('slam-spine:v1'), bad, 'the saved text is left where it was');
      assert.equal(last.problem, 'What this browser saved could not be read. A copy is kept in this browser, so nothing is lost.');
    }
  } finally { globalThis.fetch = keep.fetch; globalThis.localStorage = keep.localStorage; console.warn = warn; }
});

test('the Calendar adds its drag listeners once, so Open file never makes one drag two undo steps', () => {
  const src = readFileSync(SLAM + 'ui/calendar.js', 'utf8');
  const boot = src.slice(src.indexOf('function boot('), src.indexOf('loadAll().then(boot)'));
  assert.doesNotMatch(boot, /dragSetup\(/);
  assert.equal((src.match(/^dragSetup\(app\);$/gm) || []).length, 1);
});

test('the header keeps a Open file message across redraws, and the example screen has one filled button', () => {
  const page = readFileSync(SLAM + 'ui/page.js', 'utf8');
  assert.match(page, /let said = ''/);
  assert.match(page, /h\('p', \{ class: 'edit-msg', role: 'alert' \}, said\)/);
  assert.match(readFileSync(SLAM + 'ui/onepager.js', 'utf8'), /class: whose\(base\)\.example \? 'btn' : 'btn primary', onclick: \(\) => window\.print\(\)/);
  assert.match(readFileSync(SLAM + 'ui/ledger.js', 'utf8'), /class: matchesFile\(spine\) \|\| whose\(spine\)\.example \? 'btn' : 'btn primary', onclick: saveFile/);
});
