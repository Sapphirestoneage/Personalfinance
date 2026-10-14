/* The shared bits of the What matters tabs (MR-098). */
import { h } from '../dom.js';
import * as F from '../../engine/format.js';
export const money = c => F.dollarsWhole(c); export const pct = r => F.percent(r, { places: 0 });
export function field(label, control) { return h('div', { class: 'fieldrow' }, h('label', null, label), h('div', { class: 'control' }, control)); }
export function cellOf(label, cls, child) { return h('td', { class: cls, dataset: { label } }, child); }
