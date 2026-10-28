// Drag to see the future (Part 7, S-286): three sliders on Home (the housing line, save more a month, a raise) move a
// copy of the numbers in memory (engine/whatif.js movedSpine). The FI date here and the sentence at the top of Home move
// live while dragging. Nothing saves until "Keep this"; "Put it back", Escape, or leaving Home springs it back (the
// moves are not kept with the screen). LIVE-FORM: built once. A slide redraws only the result line and the sentence,
// never the sliders.

import { h, money, monthWords } from './view.js';
import { change } from './shell.js';
import { movedSpine, housingLine } from '../engine/whatif.js';
import { summarize } from '../engine/summary.js';
import { fiPoint, fiMove, moveWords } from '../engine/reveal.js';
import { valueOf as v } from '../engine/spine.js';

const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + money(Math.abs(x));

// The FI date in words: "about Aug 2048 (age 54)", "now", or "not in reach at today's pace".
export const fiWords = (pt) => (pt.kind === 'there' ? 'now' : pt.kind === 'notYet' ? 'not in reach at today\'s pace' : (pt.rough ? 'about ' : '') + monthWords(pt.ym) + (pt.age !== null ? ' (age ' + pt.age + ')' : ''));

// onPreview(movedSpine | null, summary | null): Home rewrites the sentence from the moved numbers; null puts it back.
export function futureCard(spine, rules, s, { onPreview }) {
  const line = housingLine(spine);
  const rentNow = line ? v(line.amount) : null;
  const MOVES = [
    line ? ['rent', (line.label || 'Rent') + ' a month', -Math.min(500, Math.floor(rentNow / 25) * 25), 500, 25] : null,
    ['saveMore', 'Save more a month', 0, 1000, 25],
    ['earnMore', 'A raise, a month before tax', 0, 2000, 50]
  ].filter(Boolean);
  const moves = { rent: 0, saveMore: 0, earnMore: 0 };
  const base = fiPoint(spine, rules, s);
  const out = h('p', { class: 'fut-fi', 'aria-live': 'polite' });
  const keepBtn = h('button', { type: 'button', class: 'btn primary', disabled: true }, 'Keep this');
  const backBtn = h('button', { type: 'button', class: 'btn', disabled: true }, 'Put it back');
  let timer = null, moved = null;
  const any = () => Object.values(moves).some((x) => x !== 0);
  const readouts = {};
  const draw = () => {
    if (!any()) { moved = null; out.replaceChildren('Stop working: ', h('strong', {}, fiWords(base)), '. Drag a slider to see it move.'); onPreview(null, null); return; }
    moved = movedSpine(spine, rules, moves, todayIso());
    const s2 = summarize(moved, rules, { flags: false });
    const pt = fiPoint(moved, rules, s2), mv = fiMove(base, pt);
    out.replaceChildren('Stop working: ', h('span', { class: 'fut-now' }, fiWords(base)), ' → ', h('strong', { class: 'fut-then' }, fiWords(pt)), mv ? h('span', { class: 'fut-move' }, ' (' + moveWords(mv) + ')') : h('span', { class: 'fut-move' }, ' (no change to the date)'));
    onPreview(moved, s2);
  };
  const soon = () => { keepBtn.disabled = backBtn.disabled = !any(); clearTimeout(timer); timer = setTimeout(draw, 120); };
  const reset = () => { for (const k of Object.keys(moves)) moves[k] = 0; for (const [key, el, read] of Object.values(readouts)) { el.value = '0'; read.textContent = readoutWords(key, 0); } soon(); draw(); };
  const readoutWords = (key, val) => (key === 'rent' ? money(rentNow + val) + (val ? ' (now ' + money(rentNow) + ')' : '') : signed(val));
  const sliders = MOVES.map(([key, label, min, max, step]) => {
    const read = h('output', { class: 'fut-value', for: 'fut-' + key }, readoutWords(key, 0));
    const r = h('input', { type: 'range', id: 'fut-' + key, min, max, step, value: 0, 'aria-describedby': 'fut-help' });
    r.addEventListener('input', () => { moves[key] = +r.value; read.textContent = readoutWords(key, moves[key]); soon(); });
    r.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); reset(); } });
    readouts[key] = [key, r, read];
    return h('div', { class: 'fut-row' }, h('div', { class: 'fut-head' }, h('label', { for: 'fut-' + key }, label), read), r);
  });
  // Keep this: the moves become the household's numbers through one change, in words, so one Undo takes them all back.
  const words = () => MOVES.filter(([k]) => moves[k] !== 0).map(([k, label]) => (k === 'rent' ? (line.label || 'Rent') + ' ' + money(rentNow) + ' → ' + money(rentNow + moves.rent) : label.replace(/,.*$/, '') + ' ' + signed(moves[k]))).join(', ');
  keepBtn.addEventListener('click', () => { if (!any()) return; const w = words(); const mv = { ...moves }; change((x) => movedSpine(x, rules, mv, todayIso()), w + ' kept'); });
  backBtn.addEventListener('click', reset);
  draw();
  return h('section', { class: 'card future', 'aria-labelledby': 'fut-h' },
    h('h2', { id: 'fut-h' }, 'Drag to see the future'),
    h('p', { class: 'muted', id: 'fut-help' }, 'Slide, and the date and the sentence move with it. Nothing changes until you press Keep this.'),
    ...sliders,
    out,
    h('div', { class: 'edit-actions' }, keepBtn, backBtn));
}
