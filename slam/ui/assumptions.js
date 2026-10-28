// Assumptions: every number the app assumes, on one page (engine/assumptions.js). Two levels on the same page:
// "For this client" (an override saved on the household, with a "changed for this client" chip and Reset) and
// "For everyone" (Eli's house default, kept in this browser like the Builder's House defaults page). A row's screen
// (assumptions.html#/<id>) changes it: the value, before and after on the numbers it moves here, then Save; Undo works
// at both levels. Nothing a client typed is ever changed. Formatting only: the engines figure every number.

import { startPage, change, say, refresh, useRules } from './shell.js';
import { GROUPS, rowById, clientOverrides, houseOf, setClientAssumption, resetClientAssumption, formulasByRule, previewChange } from '../engine/assumptions.js';
import { parseInput } from '../engine/edits.js';
import { loadRules, ruleOverrides, keepRuleOverrides, rulesFile, fetchJson } from './household.js';
import { HOUSE } from '../engine/rules.js';
import { valueOf as v } from '../engine/spine.js';
import { h, money, ledgerHref } from './view.js';
import { prefs } from './prefs.js';
import { pickedScenario } from './scenario.js';

const today = () => new Date().toISOString().slice(0, 10);
const year = (spine) => +((spine && spine.meta && spine.meta.asOf) || today()).slice(0, 4);
const [law, presets, bench] = await Promise.all([rulesFile(2026), fetchJson('data/session-presets.json'), fetchJson('data/benchmarks.json')]);

// ---------------------------------------------------------------- words for a value
const PCT_UNITS = ['rate', 'ratio', 'likelihood'];
const MONEY_UNITS = ['usd', '$', 'usd/month'];
const camel = (k) => String(k).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase());
const pctWords = (x) => { const p = Math.round(x * 10000) / 100; return p + '%'; };
export function valueWords(value, unit) {
  if (value === null || value === undefined) return 'not set';
  if (Array.isArray(value)) return value.length + ' steps: ' + value.map(camel).join(', ');
  if (typeof value !== 'number') return String(value);
  if (PCT_UNITS.includes(unit)) return pctWords(value);
  if (MONEY_UNITS.includes(unit)) return money(value) + (unit === 'usd/month' ? ' a month' : '');
  if (unit === 'day of month') return 'the ' + value + (value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th');
  if (unit === 'divisor') return String(value);
  if (unit === 'months') return value + (value === 1 ? ' month' : ' months');
  if (unit === 'days') return value + (value === 1 ? ' day' : ' days');
  return value + (unit && unit !== 'count' && unit !== 'age' ? ' ' + unit : '');
}
const hintFor = (unit) => (PCT_UNITS.includes(unit) ? 'A percent: 25 for 25%.' : MONEY_UNITS.includes(unit) ? 'Dollars.' : 'A number.');
// A value in its own range: a day of the month 1 to 31, a share between -100% and 100%, a divisor above 0, the rest
// zero or more (a car's yearly loss is the one negative rate, so rates may go below zero).
function parseFor(text, unit) {
  const t = String(text).trim();
  if (t === '') return { ok: false, message: 'Type a value' };
  let p;
  if (PCT_UNITS.includes(unit)) p = parseInput('rate', t.replace(/^-/, '')), p = p.ok && t.startsWith('-') ? { ok: true, value: -p.value } : p;
  else if (MONEY_UNITS.includes(unit)) p = parseInput('money', t);
  else { const n = Number(t.replace(/[,\s]/g, '')); p = Number.isFinite(n) ? { ok: true, value: n } : { ok: false, message: 'Type a number' }; }
  if (!p.ok) return p;
  const x = p.value;
  if (unit === 'day of month' && !(Number.isInteger(x) && x >= 1 && x <= 31)) return { ok: false, message: 'A day of the month: 1 to 31' };
  if (unit === 'divisor' && !(x > 0)) return { ok: false, message: 'A number above 0' };
  if (PCT_UNITS.includes(unit) && !(x >= -1 && x <= 1)) return { ok: false, message: 'A percent from -100 to 100' };
  if (!PCT_UNITS.includes(unit) && unit !== 'divisor' && x < 0) return { ok: false, message: 'Zero or more' };
  return p;
}

// ---------------------------------------------------------------- the level and what each row reads
const LEVELS = [['client', 'For this client'], ['everyone', 'For everyone']];
// The level picked is kept for this browser tab, so a row's own screen opens at the same level.
const LEVEL_KEY = 'slam-assume-level';
const levelOf = () => { if (prefs().view === 'client') return 'client'; try { return sessionStorage.getItem(LEVEL_KEY) === 'everyone' ? 'everyone' : 'client'; } catch { return 'client'; } };
const keepLevel = (k) => { try { sessionStorage.setItem(LEVEL_KEY, k); } catch { /* lasts until redraw */ } };
const houseRules = (ctx) => houseOf(ctx.rules);
const houseOwn = () => ruleOverrides()[HOUSE] || {};
let formulasMemo = null;
function formulas(ctx) {
  if (formulasMemo && formulasMemo.spine === ctx.spine && formulasMemo.rules === ctx.rules) return formulasMemo.map;
  let map = new Map();
  try { map = formulasByRule({ spine: ctx.spine, rules: ctx.rules }, { scenario: pickedScenario() }); } catch { map = new Map(); }
  formulasMemo = { spine: ctx.spine, rules: ctx.rules, map };
  return map;
}
const metaOf = (ctx, id) => { try { return houseRules(ctx).meta(id, year(ctx.spine)); } catch { return null; } };

// ---------------------------------------------------------------- a row
function usedBy(ctx, r) {
  const f = (formulas(ctx).get(r.id) || []).slice(0, 4);
  const links = [...r.screens.map((x) => h('a', { href: x.href }, x.label)), ...f.map((x) => h('a', { href: 'math.html#/' + encodeURIComponent(x.id) }, x.label))];
  return links.length ? h('p', { class: 'as-used' }, 'Used by: ', links.flatMap((a, i) => (i ? [', ', a] : [a]))) : null;
}
function ruleRow(ctx, r, level) {
  const m = metaOf(ctx, r.id);
  if (!m) return null;
  const own = clientOverrides(ctx.spine)[r.id];
  const house = m.value, shown = level === 'client' && own ? own.value : house;
  const changedHere = level === 'client' ? !!own : r.id in houseOwn();
  const list = Array.isArray(house);
  const reset = level === 'client'
    ? () => change((s) => resetClientAssumption(s, r.id), r.name + ' is back to your default (' + valueWords(house, m.unit) + ')')
    : () => keepHouse((o) => { const n = { ...o }; delete n[r.id]; return n; }, r.name + ' is back to the file\'s value');
  // One line (Krug pass): the name, the value and Change; what it means, where it is used and Reset open inside.
  return oneLine(r.name, valueWords(shown, m.unit), changedHere ? h('span', { class: 'chip chip-rough' }, level === 'client' ? 'changed for this client' : 'changed in this browser') : null,
    list ? h('a', { class: 'btn small', href: 'house.html#/' + encodeURIComponent(r.id), 'aria-label': 'Change the order of ' + r.name }, 'Change')
      : h('a', { class: 'btn small', href: '#/' + encodeURIComponent(r.id), 'aria-label': 'Change ' + r.name }, 'Change'),
    [h('p', { class: 'as-means' }, r.means, level === 'client' && own ? ' Your default: ' + valueWords(house, m.unit) + '.' : ''),
      usedBy(ctx, r),
      changedHere ? h('div', { class: 'as-btns' }, h('button', { type: 'button', class: 'btn small danger', onclick: reset }, level === 'client' ? 'Reset to your default' : 'Use the file\'s value')) : null]);
}
// A row that is one line: a fold with the name and value (tap to read more), and its action beside it.
function oneLine(name, value, chipEl, action, body) {
  return h('li', { class: 'as-row as-line' },
    h('details', { class: 'as-more' }, h('summary', {}, h('span', { class: 'as-name' }, name, chipEl ? [' ', chipEl] : null), h('span', { class: 'as-value' }, value)), h('div', { class: 'as-body' }, body)),
    action || null);
}
const refRow = (r) => {
  const t = bench && bench.fiftyThirtyTwenty;
  return oneLine(r.name, t ? Math.round(t.needs * 100) + ' / ' + Math.round(t.wants * 100) + ' / ' + Math.round(t.savings * 100) : 'not set', null, null,
    [h('p', { class: 'as-means' }, r.means + (t ? ' Source: ' + t.source + '.' : '')), h('p', { class: 'as-used' }, 'Used by: ', r.screens.map((x) => h('a', { href: x.href }, x.label))),
      h('p', { class: 'edit-hint' }, 'Reference data: changed in data/benchmarks.json, not per client.')]);
};

// ---------------------------------------------------------------- the groups
function typicalCard(g) {
  const t = (presets && presets.typical) || {};
  const sets = Object.entries(t).filter(([, x]) => x && x.amounts);
  const keys = sets.length ? Object.keys(sets[0][1].amounts) : [];
  const src = t.sources || {};
  return h('ul', { class: 'as-list' }, keys.map((k) => {
    const s = src[k] || {};
    return oneLine(camel(k), sets.map(([, x]) => x.label + ' ' + money(x.amounts[k])).join(' \u00b7 '), s.status === 'verify' ? h('span', { class: 'chip chip-rough' }, 'verify') : null, null,
      [h('p', { class: 'as-means' }, 'A month. ' + (s.source || 'No source given') + (s.year ? ', ' + s.year : '') + '. ', s.url ? h('a', { href: s.url, rel: 'noopener', target: '_blank' }, 'The table') : null),
        h('p', { class: 'as-used' }, 'Used by: ', g.screens.map((x) => h('a', { href: x.href }, x.label)))]);
  }));
}
function lawCard() {
  const list = (law && law.rules) || [];
  return [h('ul', { class: 'as-list' }, list.map((r) => h('li', { class: 'as-row as-line as-plain' }, h('span', { class: 'as-name' }, r.rule || r.id), h('span', { class: 'as-value' }, valueWords(r.value, r.unit))))),
    prefs().view === 'client' ? null : h('p', {}, h('a', { href: 'rules.html' }, 'Change a rule on the Builder\'s Rules page'))];
}
function ownCard(ctx, g) {
  const A = (ctx.spine && ctx.spine.assumptions) || {};
  return [h('h2', { class: 'fv-h' }, 'The client\'s own guesses'),
    h('p', { class: 'muted' }, 'Typed with the client, so they are their numbers: changed on My numbers, never here.'),
    h('ul', { class: 'as-list' }, g.own.map(([k, w]) => h('li', { class: 'as-row as-line as-plain' }, h('a', { class: 'as-link', href: ledgerHref('assumptions.' + k) }, h('span', { class: 'as-name' }, w), h('span', { class: 'as-value' }, A[k] && v(A[k]) !== null ? valueWords(v(A[k]), k === 'lifeExpectancy' || k === 'coastAge' ? 'age' : 'rate') : 'not given yet')))))];
}

function listScreen(ctx) {
  const level = levelOf();
  const sw = prefs().view === 'client' ? null : h('div', { class: 'segmented as-level', role: 'group', 'aria-label': 'Whose assumptions' },
    LEVELS.map(([k, w]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(level === k), onclick: () => { keepLevel(k); refresh(); } }, h('span', { class: 'seg-label' }, w))));
  const nOwn = Object.keys(clientOverrides(ctx.spine)).length;
  return [
    sw,
    level === 'client' && nOwn ? h('p', { class: 'muted' }, nOwn + ' changed for this client') : null,
    // Groups start closed (Krug pass); open or closed is kept in this browser. The closed line says how many rows and
    // how many are changed.
    GROUPS.map((g) => {
      const n = g.typical ? null : g.law ? ((law && law.rules) || []).length : g.rows.length;
      const changed = g.rows ? g.rows.filter((r) => (level === 'client' ? clientOverrides(ctx.spine)[r.id] : r.id in houseOwn())).length : 0;
      return h('details', { class: 'card as-group done-group', open: openGroups().has(g.id) || null, ontoggle: (e) => keepGroup(g.id, e.target.open) },
        h('summary', {}, h('span', {}, g.label), h('span', { class: 'count' }, n === null ? '' : String(n)), changed ? h('span', { class: 'chip chip-rough' }, changed + ' changed') : null),
        h('p', { class: 'muted' }, g.note),
        g.typical ? typicalCard(g) : g.law ? lawCard() : h('ul', { class: 'as-list' }, g.rows.map((r) => (r.reference ? refRow(r) : ruleRow(ctx, r, level)))),
        g.own ? ownCard(ctx, g) : null);
    })
  ];
}
const GROUPS_KEY = 'slam-assume-open:v1';
const openGroups = () => { try { return new Set(JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]')); } catch { return new Set(); } };
const keepGroup = (id, open) => { const s = openGroups(); if (open) s.add(id); else s.delete(id); try { localStorage.setItem(GROUPS_KEY, JSON.stringify([...s])); } catch { /* storage blocked */ } };

// ---------------------------------------------------------------- one row's screen: change, preview, save
// For everyone: kept as a house override in this browser, then every page reads the new rules.
async function keepHouse(fn, words) {
  const all = ruleOverrides(), before = all[HOUSE] || {}, after = fn(before);
  const put = async (o) => { const next = { ...ruleOverrides() }; if (Object.keys(o).length) next[HOUSE] = o; else delete next[HOUSE]; if (!keepRuleOverrides(next)) return false; useRules(await loadRules()); return true; };
  if (!(await put(after))) { say('This browser will not keep it, so nothing changed'); return; }
  say(words, () => put(before), () => put(after));
}
function rowScreen(ctx, r) {
  const level = levelOf();
  const m = metaOf(ctx, r.id);
  const own = clientOverrides(ctx.spine)[r.id];
  const now = level === 'client' && own ? own.value : m.value;
  const box = h('input', { id: 'as-value', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': 'as-hint' });
  box.value = PCT_UNITS.includes(m.unit) ? String(Math.round(now * 10000) / 100) : String(now);
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const preview = h('div', { class: 'as-preview', 'aria-live': 'polite' });
  const show = () => {
    const p = parseFor(box.value, m.unit);
    if (!p.ok) { preview.replaceChildren(); return; }
    let moved = [];
    try { moved = previewChange(ctx.spine, ctx.rules, r.id, p.value, { scenario: pickedScenario() }); } catch { moved = []; }
    preview.replaceChildren(moved.length
      ? h('ul', { class: 'flow-list' }, moved.map((x) => h('li', {}, x.label + ': now ' + fmtMetric(x.before, x.unit) + '; with ' + valueWords(p.value, m.unit) + ', ' + fmtMetric(x.after, x.unit) + '.')))
      : h('p', { class: 'muted' }, p.value === now ? 'This is the value in use.' : /^DEFAULT_/.test(r.id) ? 'It fills a blank only; no summary number on this household moves with it.' : 'No number on this household moves; it is read on ' + r.screens.map((x) => x.label).join(', ') + '.'));
  };
  box.addEventListener('input', show);
  const save = (e) => {
    e.preventDefault();
    const p = parseFor(box.value, m.unit);
    if (!p.ok) { msg.textContent = p.message; box.focus(); return; }
    if (level === 'client') {
      if (p.value === m.value && own) { change((s) => resetClientAssumption(s, r.id), r.name + ' is back to your default'); return; }
      if (p.value === now) { msg.textContent = 'Nothing changed'; return; }
      change((s) => setClientAssumption(s, r.id, p.value, today()), r.name + ' for this client changed to ' + valueWords(p.value, m.unit));
    } else keepHouse((o) => ({ ...o, [r.id]: { ...(o[r.id] || {}), value: p.value } }), r.name + ' for everyone changed to ' + valueWords(p.value, m.unit));
  };
  setTimeout(show, 0);
  return [
    h('p', { class: 'lede' }, r.means),
    h('p', { class: 'muted' }, level === 'client' ? 'For this client' + (own ? ', changed from your default of ' + valueWords(m.value, m.unit) : ', now your default') + '.' : 'For everyone: your default, kept in this browser.'),
    usedBy(ctx, r),
    h('form', { class: 'editor', novalidate: true, onsubmit: save },
      h('label', { class: 'edit-label', for: 'as-value' }, r.name), box,
      h('p', { class: 'edit-hint', id: 'as-hint' }, hintFor(m.unit) + ' Now ' + valueWords(now, m.unit) + '.'),
      h('p', { class: 'edit-label' }, 'Before and after, on these numbers'), preview, msg,
      h('div', { class: 'edit-actions' },
        h('button', { type: 'submit', class: 'btn primary' }, 'Save'),
        level === 'client' && own ? h('button', { type: 'button', class: 'btn danger', onclick: () => change((s) => resetClientAssumption(s, r.id), r.name + ' is back to your default') }, 'Reset to your default') : null,
        h('a', { class: 'btn ghost', href: '#' }, 'Cancel')))
  ];
}
function fmtMetric(x, unit) {
  if (x === null || x === undefined) return 'missing';
  if (unit === 'ratio') return pctWords(x);
  if (unit && unit.startsWith('usd')) return money(x);
  return String(Math.round(x * 10) / 10) + (unit === 'months' || unit === 'years' ? ' ' + unit : '');
}

startPage({
  tab: null, title: 'Assumptions',
  name: (levels) => { const r = levels.length === 1 ? rowById(levels[0]) : null; return r ? r.name : null; },
  render: (ctx) => (ctx.levels.length ? rowScreen(ctx, rowById(ctx.levels[0])) : listScreen(ctx))
});
