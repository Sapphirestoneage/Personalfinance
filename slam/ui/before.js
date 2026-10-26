// Before our first call (Phase 2.5 B3, Profile Level 1): the client's page. About five minutes, facts only, taps only,
// "Not sure" always allowed, the areas as cards in any order. The one number is the gut number. Nothing leaves the
// phone until "Send my answers" saves a file to email or text to Eli. Never asks for account numbers or logins.
// Formatting only: the questions and the file are engine/profile.js.

import { h } from './view.js';
import { questionEl } from './profile-q.js';
import { AREAS, LEVEL1, asked, answersFile, answersFileName, fieldsFor } from '../engine/profile.js';
import { parseInput, inputText } from '../engine/edits.js';

const KEY = 'slam-before:v1';
const app = document.getElementById('app');
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function load() { try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); return x && typeof x === 'object' && x.answers && typeof x.answers === 'object' ? { answers: x.answers, gut: typeof x.gut === 'number' ? x.gut : null } : null; } catch { return null; } }
let state = load() || { answers: {}, gut: null };
let note = '';
function keep() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* lasts until the page closes */ } }
const set = (id, value) => { const a = { ...state.answers }; if (value === null) delete a[id]; else a[id] = value; state = { ...state, answers: a }; keep(); draw(); };

function areaCard([area, label]) {
  const qs = LEVEL1.filter((q) => q.area === area && asked(state.answers, q));
  const done = qs.filter((q) => state.answers[q.id] !== undefined).length;
  const line = fieldsFor(state.answers).setup[area];
  return h('section', { class: 'card before-area', 'aria-labelledby': 'a-' + area },
    h('h2', { id: 'a-' + area }, label, h('span', { class: 'count' }, done + ' of ' + qs.length)),
    ...qs.map((q) => questionEl(q, state.answers[q.id] ?? null, (x) => set(q.id, x), { idPrefix: 'b' })),
    line ? h('p', { class: 'muted setup-line' }, line + '.') : null);
}

function gutCard() {
  const box = h('input', { id: 'gut', class: 'amt', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '$', 'aria-labelledby': 'gut-l' });
  box.value = inputText('money', state.gut);
  box.addEventListener('change', () => {
    const t = box.value.trim();
    if (!t) { state = { ...state, gut: null }; keep(); draw(); return; }
    const p = parseInput('money', t);
    if (!p.ok) { note = 'Type an amount, like 2,500.'; draw(); return; }
    state = { ...state, gut: p.value }; note = ''; keep(); draw();
  });
  return h('section', { class: 'card' }, h('h2', { id: 'gut-l' }, 'About how much do you spend a month?'), h('p', { class: 'muted' }, 'Your best guess. Don\'t look anything up.'), box);
}

function send() {
  const file = answersFile(state.answers, state.gut, todayIso());
  const name = answersFileName(state.answers.firstName, todayIso());
  const blob = new Blob([JSON.stringify(file, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  note = 'Saved ' + name + '. Email or text this file to Eli.';
  draw();
}

function draw() {
  const n = Object.keys(state.answers).length;
  app.replaceChildren(
    h('header', { class: 'top' }, h('h1', {}, 'Before our first call')),
    h('p', { class: 'lede' }, 'About 5 minutes. Tap what fits, in any order. "Not sure" is always fine.'),
    h('p', { class: 'muted' }, 'Your answers stay on your phone until you send them. This never asks for account numbers or logins.'),
    gutCard(),
    ...AREAS.map(areaCard),
    h('section', { class: 'card' },
      h('p', {}, n + (n === 1 ? ' answer' : ' answers') + (state.gut === null ? '.' : ' and your spending guess.')),
      h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: send }, 'Send my answers')),
      h('p', { class: 'edit-msg', role: 'status' }, note || 'This saves a file. Email or text it to Eli.')));
}
draw();
