// Siblings (S-281): on an item's screen, the other items of its group (the other credit cards), the one you are on
// marked; on a group's screen, the other groups of its section. Hop sideways without going back up. A slim row of
// links on a computer; a short "Jump to" list on a phone. Shown only when there is somewhere to hop to.

import { h } from './view.js';

// list: [{ words, href, here }]; label: what they are ("Credit cards").
let made = 0;
export function siblingStrip(label, list, { onPick = null } = {}) {
  if (!list || list.length < 2) return null;
  const id = 'sib-' + String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + (++made);
  const pick = h('select', { id, class: 'pick-box', onchange: (e) => { const to = list[+e.target.value]; if (to && !to.here) { if (onPick) onPick(to); else location.href = to.href; } } },
    list.map((x, i) => h('option', { value: String(i), selected: x.here || null }, x.words + (x.here ? ' (you are here)' : ''))));
  return h('nav', { class: 'siblings', 'aria-label': label },
    h('span', { class: 'sib-label' }, label + ':'),
    h('ul', { class: 'sib-row' }, list.map((x) => h('li', {}, x.here ? h('span', { class: 'sib is-here', 'aria-current': 'page' }, x.words) : h('a', { class: 'sib', href: x.href }, x.words)))),
    h('div', { class: 'sib-pick' }, h('label', { for: id, class: 'mini-label' }, 'Jump to'), pick));
}
