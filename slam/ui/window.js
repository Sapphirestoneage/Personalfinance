// The one time selector (S-204): how far ahead the calendar and the budget
// look. 1, 3, 6 or 12 months; 12 is the annual view. Kept in this browser so
// both pages open on the same window.

import { h } from './view.js';

export const WINDOWS = [[1, '1 month'], [2, '2 months'], [3, '3 months'], [6, '6 months'], [12, '12 months']];
const KEY = 'slam-window:v1';

export function pickedWindow() {
  try { const v = localStorage.getItem(KEY); return WINDOWS.some(([n]) => String(n) === v) ? +v : 1; } catch { return 1; }
}
export function keepWindow(n) { try { localStorage.setItem(KEY, String(n)); } catch { /* storage blocked: lasts until the page closes */ } }

// A segmented control; the pressed segment is filled. onPick(n) runs after the choice is kept.
export function windowBar(current, onPick) {
  return h('div', { class: 'window-bar', role: 'group', 'aria-label': 'How far ahead' },
    h('span', { class: 'filter-label' }, 'Show'),
    h('div', { class: 'segmented' }, WINDOWS.map(([n, w]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(n === current), onclick: () => { if (n === current) return; keepWindow(n); onPick(n); } }, h('span', { class: 'seg-label' }, w)))));
}
