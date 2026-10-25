// Phase 2.5, Batch 1: rules changed in this browser (S-230). The Builder's Rules page keeps a changed rule as an
// override that the one rules loader lays over the file on every page; importing a rules file shows what it adds,
// changes and leaves out before anything is applied. A bad override never stops a page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJson } from './spine-helpers.js';
import { makeRules, withOverrides, diffRules, importOverrides, notRulesWords, fetchRules } from '../engine/rules.js';
import { loadAll, loadRules, ruleOverrides, keepRuleOverrides } from '../ui/household.js';

const file = () => readJson('data/rules-2026.json');

async function inBrowser(fn) {
  const keep = { fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.fetch = async (url) => { const f = fileURLToPath(url); return existsSync(f) ? { ok: true, json: async () => JSON.parse(readFileSync(f, 'utf8')) } : { ok: false, json: async () => null }; };
  try { return await fn(store); } finally { globalThis.fetch = keep.fetch; globalThis.localStorage = keep.localStorage; }
}

test('an override changes the rule for every reader; the file is untouched; a rule the file lacks is added', () => {
  const f = file();
  const before = JSON.stringify(f);
  const reg = withOverrides(f, { K401_DEF: { value: 25000, source: 'my note' }, MY_RULE: { rule: 'A new rule', value: 3, unit: 'count' } });
  const R = makeRules(reg);
  assert.equal(R.get('K401_DEF', 2026), 25000);
  assert.equal(R.meta('K401_DEF', 2026).source, 'my note');
  assert.equal(R.meta('K401_DEF', 2026).rule, f.rules.find((r) => r.id === 'K401_DEF').rule, 'what is not overridden stays the file\'s');
  assert.equal(R.get('MY_RULE', 2026), 3);
  assert.equal(JSON.stringify(f), before, 'the file is never changed');
  assert.equal(withOverrides(f, {}), f);
  assert.equal(withOverrides(f, null), f);
});

test('an override of the wrong sort is left out, so a page never stops', () => {
  const R = makeRules(withOverrides(file(), { K401_DEF: { value: 'lots' }, FED_BRK_S: { value: 12 }, EST_Q1: { value: null }, BAD: { value: null } }));
  assert.equal(R.get('K401_DEF', 2026), 24500);
  assert.ok(Array.isArray(R.get('FED_BRK_S', 2026)));
  assert.equal(R.get('EST_Q1', 2026), '04-15');
  assert.equal(R.has('BAD', 2026), false);
});

test('importing a rules file: added, changed (old and new), left out, and what cannot be used; nothing applied yet', () => {
  const now = file();
  const incoming = { year: 2026, rules: now.rules.slice(0, 5).map((r) => ({ ...r })) };
  incoming.rules[0].value = 25000;
  incoming.rules[1] = { ...incoming.rules[1], source: 'IRS, again' };
  delete incoming.rules[2].notes; // a key the file leaves out keeps today's
  incoming.rules.push({ id: 'NEW_ONE', rule: 'Something new', value: 7, unit: 'count' });
  incoming.rules.push({ id: incoming.rules[3].id, value: 1 }); // twice
  incoming.rules.push({ id: 'FED_BRK_S', value: 12 }); // the wrong sort
  incoming.rules.push({ rule: 'no id', value: 1 });
  const d = diffRules(now, incoming);
  assert.deepEqual(d.added.map((x) => x.id), ['NEW_ONE']);
  assert.deepEqual(d.changed.map((x) => [x.id, x.keys]), [[now.rules[0].id, ['value']], [now.rules[1].id, ['source']]]);
  assert.equal(d.changed[0].before.value, now.rules[0].value);
  assert.equal(d.changed[0].after.value, 25000);
  assert.equal(d.removed.length, now.rules.length - 6, 'every rule not in the file; FED_BRK_S is in it, refused, so not listed as left out');
  assert.ok(!d.removed.some((x) => x.id === 'FED_BRK_S'));
  assert.deepEqual(d.refused.map((x) => x.id), [now.rules[3].id, 'FED_BRK_S', null]);
  assert.match(d.refused[1].why, /a number, and the app needs a list/);
  assert.equal(d.count, 3);
  // Apply: added whole, changed by their changed keys; what the file left out is kept.
  const o = importOverrides({ HCE: { value: 170000 } }, d);
  assert.deepEqual(o[now.rules[0].id], { value: 25000 });
  assert.deepEqual(o[now.rules[1].id], { source: 'IRS, again' });
  assert.equal(o.NEW_ONE.value, 7);
  assert.equal(o.HCE.value, 170000, 'an earlier change stays');
  const R = makeRules(withOverrides(now, o));
  assert.equal(R.get(now.rules[0].id, 2026), 25000);
  assert.ok(R.has('FED_BRK_J', 2026), 'a rule the file left out is still there');
});

test('a file that is not a rules file says so in words', () => {
  assert.equal(notRulesWords(null), 'It is not a rules file.');
  assert.equal(notRulesWords([]), 'It is not a rules file.');
  assert.equal(notRulesWords({ rules: [] }), 'It does not say which year its rules are for.');
  assert.equal(notRulesWords({ year: 2026 }), 'It has no list of rules.');
  assert.equal(notRulesWords(file()), null);
});

test('the one rules loader every page calls lays this browser\'s overrides over the file', () => inBrowser(async (store) => {
  assert.deepEqual(ruleOverrides(), {});
  assert.equal((await loadRules()).get('K401_DEF', 2026), 24500);
  assert.ok(keepRuleOverrides({ 2026: { K401_DEF: { value: 25000 } } }));
  assert.equal((await loadRules()).get('K401_DEF', 2026), 25000);
  assert.equal((await loadAll()).rules.get('K401_DEF', 2026), 25000, 'every page, through loadAll');
  assert.equal((await fetchRules(new URL('../data/', import.meta.url), [2026], ruleOverrides())).get('K401_DEF', 2026), 25000);
  // "Use the file's rules": nothing kept, the key gone.
  assert.ok(keepRuleOverrides({}));
  assert.equal(store.has('slam-rules:v1'), false);
  assert.equal((await loadRules()).get('K401_DEF', 2026), 24500);
  // Something unreadable in storage reads as no overrides.
  store.set('slam-rules:v1', 'not json');
  assert.deepEqual(ruleOverrides(), {});
  assert.equal((await loadRules()).get('K401_DEF', 2026), 24500);
}));
