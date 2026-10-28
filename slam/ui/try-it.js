// The top of Home (S-286): their money in one sentence, and three sliders (rent, saved a month, pay) that move the
// sentence and the FI date as they slide. Nothing is saved until Keep this; Put it back, or leaving Home, springs the
// sliders back. The household itself only changes through change(), so one Undo takes a kept move back.

import { h, money } from './view.js';
import { change, kept, keep } from './shell.js';
import { summarize } from '../engine/summary.js';
import { moneySentence, homeLevers, pullLevers } from '../engine/story.js';

const fiYear = (spine, s) => { const y = s.fi.yearsToFi.value; return y === null ? null : +spine.meta.asOf.slice(0, 4) + Math.round(y); };

export function sentenceCard(spine, rules) {
  const s = summarize(spine, rules, { flags: false });
  const said = moneySentence(spine, s);
  return said ? h('p', { class: 'money-sentence', id: 'money-sentence' }, said) : null;
}

export function tryItCard(spine, rules, today) {
  const levers = homeLevers(spine);
  if (!levers.length) return null;
  const base = summarize(spine, rules, { flags: false });
  const values = Object.fromEntries(levers.map((l) => [l.id, l.now]));
  const fiNow = fiYear(spine, base);
  const big = h('strong', { class: 'try-fi', 'aria-live': 'polite' }, fiNow === null ? 'Not at this pace' : String(fiNow));
  const sub = h('span', { class: 'try-fi-sub' }, '');
  const keepBtn = h('button', { type: 'button', class: 'btn primary', disabled: true, onclick: () => {
    const moved = levers.filter((l) => values[l.id] !== l.now);
    if (!moved.length) return;
    change((x) => pullLevers(x, levers, values, today, 'known'), moved.map((l) => l.label + ' ' + money(values[l.id])).join(', '));
  } }, 'Keep this');
  const backBtn = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => springBack() }, 'Put it back');
  let frame = 0;
  const update = () => {
    frame = 0;
    const any = levers.some((l) => values[l.id] !== l.now);
    keepBtn.disabled = !any; backBtn.disabled = !any;
    const sp = any ? pullLevers(spine, levers, values, today) : spine;
    const s = any ? summarize(sp, rules, { flags: false }) : base;
    const y = fiYear(sp, s);
    big.textContent = y === null ? 'Not at this pace' : String(y);
    sub.textContent = !any || y === null || fiNow === null || y === fiNow ? '' : y < fiNow ? (fiNow - y) + (fiNow - y === 1 ? ' year sooner' : ' years sooner') : (y - fiNow) + (y - fiNow === 1 ? ' year later' : ' years later');
    const line = document.getElementById('money-sentence');
    if (line) { line.textContent = moneySentence(sp, s) || line.textContent; line.classList.toggle('is-preview', any); }
  };
  const rows = levers.map((l) => {
    const out = h('output', { class: 'try-val', for: 'try-' + l.id }, money(l.now));
    const r = h('input', { type: 'range', id: 'try-' + l.id, min: l.min, max: l.max, step: l.step, value: l.now, 'aria-valuetext': money(l.now) });
    r.addEventListener('input', () => { values[l.id] = +r.value; out.textContent = money(+r.value); r.setAttribute('aria-valuetext', money(+r.value)); if (!frame) frame = requestAnimationFrame(update); });
    return { l, r, out, el: h('div', { class: 'try-row' }, h('label', { for: 'try-' + l.id, class: 'try-label' }, l.label), out, r) };
  });
  const springBack = () => {
    for (const { l, r, out } of rows) { values[l.id] = l.now; r.value = l.now; out.textContent = money(l.now); r.setAttribute('aria-valuetext', money(l.now)); r.classList.add('is-spring'); setTimeout(() => r.classList.remove('is-spring'), 400); }
    update();
  };
  return h('details', { class: 'card try-it', open: kept().tryIt || null, ontoggle: (e) => { if (!!kept().tryIt !== e.target.open) keep({ tryIt: e.target.open }); if (!e.target.open) springBack(); } },
    h('summary', {}, h('span', {}, 'What if?'), h('span', { class: 'count' }, 'rent, saving, pay')),
    h('div', { class: 'try-fi-box' }, h('span', { class: 'try-fi-label' }, 'Free to stop working'), big, sub),
    rows.map((x) => x.el),
    h('div', { class: 'edit-actions' }, keepBtn, backBtn));
}
