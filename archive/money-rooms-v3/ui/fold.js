/* A fold (MR-090): a caret that hides the long part of a panel until it is
   wanted. The open state is remembered per key, so a coach who likes the
   history open keeps it open. One element, native details, no script to
   toggle. */
import { h } from './dom.js';

function recall(key) { try { return localStorage.getItem('mr3.fold.' + key); } catch (e) { return null; } }
function remember(key, open) { try { localStorage.setItem('mr3.fold.' + key, open ? '1' : '0'); } catch (e) { /* no storage */ } }

/* fold(key, label, body, { count, open }) -> <details class="fold"> with the label and a count tag on the summary */
export function fold(key, label, body, opts) {
  const o = opts || {}; const saved = recall(key);
  const open = saved === null ? !!o.open : saved === '1';
  const el = h('details', { class: 'disclose' + (o.cls ? ' ' + o.cls : ''), open: open ? '' : null, dataset: { fold: key } },
    h('summary', null, h('span', { class: 'fold-caret' }), h('span', { class: 'fold-label' }, label), o.count !== undefined && o.count !== null ? h('span', { class: 'tag' }, String(o.count)) : null),
    h('div', { class: 'fold-body' }, body));
  el.addEventListener('toggle', () => remember(key, el.open));
  return el;
}
