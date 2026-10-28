// Rules (Builder, S-230): every rule the app uses, from data/rules-2026.json, with its value, source and note. Tap a
// rule to change it on its own screen. A change is kept in this browser as an override that the one rules loader
// (ui/household.js loadRules, through loadAll) lays over the file on every page; "Use the file's rules" drops them
// all, and Undo brings them back. "Import a rules file" reads a file in this browser and shows what it adds, changes
// (old and new) and leaves out; nothing is applied until Apply, which keeps them as overrides too.

import { startPage, refresh, say, said } from './shell.js';
import { rulesFile, houseFile, ruleOverrides, keepRuleOverrides } from './household.js';
import { withOverrides, diffRules, importOverrides, notRulesWords, RULE_SORT_WORDS, HOUSE } from '../engine/rules.js';
import { h, money, ruleValueWords } from './view.js';

// The same page edits Eli's house defaults (house.html, data/house-defaults.json, Phase 2.5 B1): kept under overrides.house
// instead of a year, with no import.
const ON_HOUSE = /\/house\.html$/.test(location.pathname);
const YEAR = 2026, KEY = ON_HOUSE ? HOUSE : YEAR;
const file = ON_HOUSE ? await houseFile() : await rulesFile(YEAR);
const fileById = new Map(((file && file.rules) || []).map((r) => [r.id, r]));
let incoming = null; // a rules file read and waiting: { name, diff }

const mine = () => ruleOverrides()[KEY] || {};
const inUse = () => withOverrides(file, mine());
const byId = () => new Map(inUse().rules.map((r) => [r.id, r]));
const unitWords = (r) => (r.unit ? ' (' + r.unit + ')' : '');
const shown = (r) => ruleValueWords(r) + unitWords(r);
// A value in words by its unit (the bar, Undo, the hint): a share as a percent, dollars as dollars, the rest as the
// file has it.
const PCT_UNITS = ['rate', 'ratio', 'likelihood'];
const isPct = (r) => PCT_UNITS.includes(r.unit);
const isMoney = (r) => /^(\$|usd)/.test(String(r.unit || ''));
const pctWords = (x) => Math.round(x * 10000) / 100 + '%';
const valueWords = (r) => (typeof r.value !== 'number' ? ruleValueWords(r) : isPct(r) ? pctWords(r.value) : isMoney(r) ? money(r.value) : ruleValueWords(r));
const THING = ON_HOUSE ? 'house default' : 'rule', THINGS = ON_HOUSE ? 'house defaults' : 'rules';
const VERIFIED_WORDS = { yes: 'Verified.', law: 'Verified against the law.', verify: 'Still to verify.', app: 'The app\'s own number.', assumption: 'Eli\'s own.' };

// Overrides for this year, kept; Undo (the bar, the header or Ctrl/Cmd+Z) puts the ones before back, and Redo these.
function keepMine(next, words) {
  const all = ruleOverrides(), before = all[KEY] || {};
  const after = next && Object.keys(next).length ? next : {};
  if (!putYear(after)) { say('This browser will not keep rule changes, so nothing changed'); return; }
  refresh();
  say(words, () => { putYear(before); refresh(); }, () => { putYear(after); refresh(); });
}
// This year's overrides, the other years' left as they are.
function putYear(o) { const again = { ...ruleOverrides() }; if (Object.keys(o).length) again[KEY] = o; else delete again[KEY]; return keepRuleOverrides(again); }

// ---------------------------------------------------------------- the list
function row(r, changed) {
  return h('li', {}, h('a', { class: 'go-row plain rule-row', href: '#/' + encodeURIComponent(r.id) },
    h('span', { class: 'go-name' }, r.rule || r.id, changed ? [' ', h('span', { class: 'pill' }, 'Changed here')] : null),
    h('span', { class: 'go-sub' }, h('code', {}, r.id), h('span', { class: 'go-total' }, shown(r)))));
}

function importCard() {
  if (!incoming) return null;
  const { name, diff } = incoming;
  const item = (id, ...rest) => h('li', {}, h('code', {}, id), ' ', ...rest);
  const was = (c) => c.keys.map((k) => (k === 'value' ? 'value from ' + ruleValueWords(c.before) + ' to ' + ruleValueWords(c.after) : k + ' changed')).join('; ');
  return h('section', { class: 'card', 'aria-labelledby': 'imp-h' },
    h('h2', { id: 'imp-h' }, name + ': ' + diff.count + (diff.count === 1 ? ' change' : ' changes')),
    h('p', { class: 'muted' }, 'Nothing is applied until you choose Apply. Applied changes are kept in this browser, like a change made here.'),
    diff.added.length ? [h('h3', {}, 'Added (' + diff.added.length + ')'), h('ul', { class: 'rule-diff' }, diff.added.map((a) => item(a.id, (a.after.rule || '') + ': ' + shown(a.after))))] : null,
    diff.changed.length ? [h('h3', {}, 'Changed (' + diff.changed.length + ')'), h('ul', { class: 'rule-diff' }, diff.changed.map((c) => item(c.id, (c.before.rule || '') + ': ' + was(c))))] : null,
    diff.refused.length ? [h('h3', {}, 'Not used (' + diff.refused.length + ')'), h('ul', { class: 'rule-diff' }, diff.refused.map((x) => item(x.id || '(no id)', 'is left out: ' + x.why + '.')))] : null,
    diff.removed.length ? h('details', { class: 'flow-list' }, h('summary', {}, 'Not in the file (' + diff.removed.length + '): kept as they are'), h('ul', { class: 'rule-diff' }, diff.removed.map((x) => item(x.id, x.before.rule || '')))) : null,
    h('div', { class: 'edit-actions' },
      h('button', { type: 'button', class: 'btn primary', disabled: !diff.count, onclick: () => { incoming = null; keepMine(importOverrides(mine(), diff), 'Applied ' + diff.count + (diff.count === 1 ? ' change' : ' changes') + ' from ' + name); } }, diff.count ? 'Apply' : 'Nothing to apply'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { incoming = null; refresh(); } }, 'Discard')));
}

async function readFile(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f) return;
  let x;
  try { x = JSON.parse(await f.text()); } catch { say(f.name + ' is not a rules file. Nothing changed'); return; }
  const bad = notRulesWords(x);
  if (bad) { say(f.name + ': ' + bad + ' Nothing changed'); return; }
  if (x.year !== YEAR) { say(f.name + ' holds ' + x.year + ' rules, and the app reads ' + YEAR + ' rules. Nothing changed'); return; }
  incoming = { name: f.name, diff: diffRules(inUse(), x) };
  refresh();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- one rule, on its own screen
function parseValue(text, like, r) {
  const t = String(text).trim();
  if (typeof like === 'number') {
    const n = Number(t.replace(/[$,\s]/g, ''));
    if (t === '' || !Number.isFinite(n)) return { ok: false, message: 'Type a number, as the file has it (0.062 for 6.2%)' };
    // A share stays a share: 25 is not 2500%.
    if (isPct(r) && !(n >= -1 && n <= 1)) return { ok: false, message: 'A share between -1 and 1 (0.25 for 25%)' };
    return { ok: true, value: n };
  }
  if (typeof like === 'string') return t ? { ok: true, value: t } : { ok: false, message: 'Type the value' };
  try { const v = JSON.parse(t); return Array.isArray(v) === Array.isArray(like) ? { ok: true, value: v } : { ok: false, message: 'Type ' + RULE_SORT_WORDS[Array.isArray(like) ? 'list' : typeof like] + ', as the file has it' }; } catch { return { ok: false, message: Array.isArray(like) ? 'Type a list in [ ], as the file has it' : 'Type it as the file has it' }; }
}
const asText = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v));

function ruleScreen(r) {
  const orig = fileById.get(r.id) || null, own = mine()[r.id];
  const long = typeof r.value === 'object';
  const steps = Array.isArray(r.value) && r.value.length > 0 && r.value.every((x) => typeof x === 'string');
  const value = h(long ? 'textarea' : 'input', { id: 'rule-value', type: long ? null : 'text', 'aria-describedby': 'rule-value-hint' });
  value.value = asText(r.value);
  const source = h('input', { id: 'rule-source', type: 'text' }); source.value = r.source || '';
  const notes = h('textarea', { id: 'rule-notes' }); notes.value = r.notes || '';
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const save = (e) => {
    e.preventDefault();
    const p = parseValue(value.value, (orig || r).value, r);
    if (!p.ok) { msg.textContent = p.message; return; }
    // Only what differs from the file is kept, so a rule set back to the file's value is the file's again.
    const want = { value: p.value, source: source.value.trim(), notes: notes.value.trim() };
    const next = orig ? Object.fromEntries(Object.entries({ ...own, ...want }).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(orig[k] ?? (k === 'value' ? null : '')))) : { ...own, ...want };
    if (JSON.stringify(next) === JSON.stringify(own || {})) { msg.textContent = 'Nothing changed'; return; }
    const all = { ...mine() };
    if (Object.keys(next).length) all[r.id] = next; else delete all[r.id];
    keepMine(all, said.changed(r.rule || r.id, valueWords({ ...r, value: p.value })));
  };
  return [
    h('p', { class: 'muted' }, VERIFIED_WORDS[r.verified] || 'Not yet verified.'),
    own ? h('p', { class: 'muted' }, 'Changed in this browser. The file has ' + (orig ? shown(orig) : 'no such rule') + '.') : null,
    h('form', { class: 'editor rule-edit', novalidate: true, onsubmit: save },
      h('label', { class: 'edit-label', for: 'rule-value' }, 'Value' + unitWords(r)), value,
      h('p', { class: 'edit-hint', id: 'rule-value-hint' }, typeof r.value === 'number' ? (isPct(r) ? 'A share between -1 and 1, as the file has it (0.25 for 25%).' : 'A number as the file has it.') + ' Now ' + valueWords(r) + '.' : long ? (steps ? 'A list of step names in [ ], in order, as the file has it.' : 'A list in [ ] as the file has it; brackets are [top, rate] pairs.') : 'Words or a date as the file has it (04-15 is April 15).'),
      h('label', { class: 'edit-label', for: 'rule-source' }, 'Source'), source,
      h('label', { class: 'edit-label', for: 'rule-notes' }, 'Note'), notes,
      msg,
      h('div', { class: 'edit-actions' },
        h('button', { type: 'submit', class: 'btn primary' }, 'Save the rule'),
        own && orig ? h('button', { type: 'button', class: 'btn danger', onclick: () => { const all = { ...mine() }; delete all[r.id]; keepMine(all, (r.rule || r.id) + ' is back to the file\'s value'); } }, 'Use the file\'s value') : null))
  ];
}

// ---------------------------------------------------------------- the page
const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'A rules file', onchange: (e) => readFile(e.target) });
startPage({
  tab: null, title: ON_HOUSE ? 'House defaults' : 'Rules', parent: ['Builder', 'builder.html'],
  name: (levels) => { const r = levels.length === 1 ? byId().get(levels[0]) : null; return r ? r.rule || r.id : null; },
  actions: ({ levels }) => (levels.length || !file ? null : [
    ON_HOUSE ? null : [h('button', { type: 'button', class: 'btn', onclick: () => input.click() }, 'Import a rules file'), input],
    Object.keys(mine()).length ? h('button', { type: 'button', class: 'btn danger', onclick: () => keepMine({}, 'Every ' + THING + ' is back to the file\'s value') }, 'Use the file\'s ' + THINGS) : null
  ]),
  render: ({ levels }) => {
    if (!file) return h('p', { class: 'card', role: 'alert' }, 'The rules file could not be read, so there is nothing to show.');
    if (levels.length) return ruleScreen(byId().get(levels[0]));
    const own = mine(), rules = inUse().rules;
    return [
      h('p', { class: 'lede' }, ON_HOUSE ? 'Eli\'s method, used for every client until their own number is in. Change one here and every guess that used it changes on every page; nothing a client typed changes. Client screens mark it default.' : 'Every rule the law sets for ' + YEAR + ', with its value. Tap one for its source and note. Eli\'s own defaults are on House defaults. A change here is kept in this browser and used on every page.'),
      importCard(),
      h('ul', { class: 'go-list', 'aria-label': rules.length + ' ' + THINGS }, rules.map((r) => row(r, !!own[r.id])))
    ];
  }
});
