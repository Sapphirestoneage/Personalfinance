// Slim by default (DESIGN.md): a section that is not the screen's main number or main action is one line, a title,
// its most useful fact and a chevron. Tapping the line opens it; tapping again closes it (no Hide buttons). Open or
// closed is remembered per section in this browser. "+ Add" sits on the line when the section has a form, and opens
// the section with its form showing. Formatting only.

import { h } from './view.js';

const KEY = 'slam-open:v1';
const openSet = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } };
const remember = (id, on) => { try { const s = openSet(); if (on) s.add(id); else s.delete(id); localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* lasts until the page closes */ } };
export const isOpen = (id) => openSet().has(id);

// foldRow(id, title, fact, body, { add }) -> a details row. body is a function, drawn only when open.
// add: { label, onOpen } puts "+ Add" on the line; it opens the row and asks the body to show its form.
export function foldRow(id, title, fact, body, { add = null, cls = '' } = {}) {
  const d = h('details', { class: 'fold-row card ' + cls, id: 'row-' + id, open: isOpen(id) || null });
  const fill = () => { if (d.open && !d.dataset.drawn) { d.dataset.drawn = '1'; d.append(h('div', { class: 'fold-body' }, ...[].concat(body()).flat(Infinity).filter(Boolean))); } };
  d.append(h('summary', { class: 'fold-line' },
    h('span', { class: 'fold-title' }, title),
    fact ? h('span', { class: 'fold-fact' }, fact) : null,
    add ? h('button', { type: 'button', class: 'btn small fold-add', onclick: (e) => { e.preventDefault(); e.stopPropagation(); if (add.onOpen) add.onOpen(); if (!d.open) d.open = true; else { delete d.dataset.drawn; d.querySelector('.fold-body')?.remove(); fill(); } } }, '+ ' + (add.label || 'Add')) : null,
    h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));
  d.addEventListener('toggle', () => { remember(id, d.open); fill(); });
  fill();
  return d;
}
// A section with nothing in it and nothing worth doing now: one muted line, or nothing.
export const emptyLine = (words) => (words ? h('p', { class: 'muted empty-line' }, words) : null);
