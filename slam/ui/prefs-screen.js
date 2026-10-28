// The Preferences screen in Profile: one control per line of data/preferences.json, each with its one-line hint.
// A choice is a row of buttons (the pressed one is filled); "What Today shows" ticks tiles and moves them up or down.
// Saved in this browser. The tone is the client's own Profile answer (You: "How should I talk to you?"), so it is not a
// second control here. Every pick says so in the bar and offers Undo. Formatting only.

import { refresh, say } from './shell.js';
import { PREFS, prefs, keepPref } from './prefs.js';
import { realHourlyWage } from '../engine/plan.js';
import { summarize } from '../engine/summary.js';
import { h, ledgerHref } from './view.js';

// Keep a preference, redraw, and say so with Undo (back to what it was) and Redo.
const put = (p, next, was, words) => { keepPref(p.id, next); refresh(); say(words, () => { keepPref(p.id, was); refresh(); }, () => { keepPref(p.id, next); refresh(); }); };
const optWords = (p, v) => ((p.options || []).find(([k]) => String(k) === String(v)) || [v, String(v)])[1];

// The one line on Profile's top: the choices that differ from the defaults, else that they are the defaults.
export function prefsSummary() {
  const now = prefs(), changed = PREFS.filter((p) => p.saved !== 'client' && JSON.stringify(now[p.id]) !== JSON.stringify(p.default));
  return changed.length ? changed.slice(0, 3).map((p) => p.label.toLowerCase() + ': ' + (p.kind === 'order' ? 'your order' : optWords(p, now[p.id]).toLowerCase())).join('; ') : 'theme, text size, dates, money as hours, hidden numbers';
}

function choice(p, value, onPick, note = () => null) {
  return h('div', { class: 'segmented pref-seg', role: 'group', 'aria-labelledby': 'pref-' + p.id },
    p.options.map(([k, w]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(String(value) === String(k)), onclick: () => { if (String(value) !== String(k)) onPick(k); } }, h('span', { class: 'seg-label', 'data-sample': p.id === 'dateStyle' ? '' : null }, w), note(k))));
}
function tilesControl(p, value) {
  const order = Array.isArray(value) ? value : p.default;
  const all = [...order, ...p.default.filter((k) => !order.includes(k))];
  const move = (next, words) => put(p, next, order, words);
  return h('ul', { class: 'pref-tiles', 'aria-labelledby': 'pref-' + p.id }, all.map((k) => {
    const on = order.includes(k), i = order.indexOf(k), w = optWords(p, k);
    return h('li', { class: 'pref-tile' },
      h('label', { class: 'check-row', for: 'tile-' + k }, h('input', { type: 'checkbox', id: 'tile-' + k, checked: on, onchange: (e) => move(e.target.checked ? [...order, k] : order.filter((x) => x !== k), w + (e.target.checked ? ' shows on Today' : ' is off Today')) }), h('span', {}, w)),
      h('button', { type: 'button', class: 'btn small', disabled: !on || i === 0, 'aria-label': 'Move ' + w + ' up', title: !on ? 'Tick it to place it' : i === 0 ? 'Already first' : null, onclick: () => { const n = [...order]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; move(n, w + ' moved up'); } }, 'Up'),
      h('button', { type: 'button', class: 'btn small', disabled: !on || i === order.length - 1, 'aria-label': 'Move ' + w + ' down', title: !on ? 'Tick it to place it' : i === order.length - 1 ? 'Already last' : null, onclick: () => { const n = [...order]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; move(n, w + ' moved down'); } }, 'Down'));
  }));
}

export function prefsScreen({ spine, rules }) {
  const now = prefs();
  let wage = null;
  try { wage = realHourlyWage(spine, rules, summarize(spine, rules, { flags: false })).wage; } catch { wage = null; }
  const control = (p) => {
    if (p.kind === 'order') return tilesControl(p, now[p.id]);
    return choice(p, now[p.id], (k) => put(p, k, now[p.id], p.label + ': ' + optWords(p, k).toLowerCase()),
      // Hours of work needs the real hourly wage: the option says what to add when it is missing.
      (k) => (p.id === 'moneyAs' && k === 'hours' && !wage ? h('span', { class: 'choice-sub' }, 'needs your hours a week') : null));
  };
  return [
    h('section', { class: 'card' }, h('ul', { class: 'as-list' }, PREFS.filter((p) => p.saved !== 'client').map((p) => h('li', { class: 'as-row pref-row' },
      h('p', { class: 'edit-label', id: 'pref-' + p.id }, p.label),
      h('p', { class: 'as-means' }, p.hint),
      control(p),
      p.id === 'moneyAs' && now.moneyAs === 'hours' && !wage ? h('p', { class: 'edit-hint' }, h('a', { href: ledgerHref('household.workHoursPerWeek') }, 'Add your hours a week'), ' to see amounts as hours of work.') : null)))),
    PREFS.length ? null : h('p', { class: 'card', role: 'alert' }, 'The list of preferences could not be read. Reload the page.')
  ];
}
