/* One segmented control for every either-or choice on a screen (Level 14,
   MR-072): the chosen segment is filled, the others are plain, every segment
   is a real button with aria-pressed. options: [[id, label, title?], ...]. */
import { h } from './dom.js';

export function segmented(options, current, onPick, opts) {
  const o = opts || {};
  const el = h('div', { class: 'seg' + (o.small ? ' small' : '') + (o.cls ? ' ' + o.cls : ''), role: 'group', 'aria-label': o.label || 'Choice' });
  options.forEach(([id, label, title]) => {
    const on = id === current;
    el.appendChild(h('button', { type: 'button', class: 'seg-btn' + (on ? ' on' : ''), 'aria-pressed': String(on), title: title || null, onClick: () => { if (!on || o.repick) onPick(id); } }, label));
  });
  return el;
}
