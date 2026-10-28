// Before our first call (Phase 2.5 B3, Profile Level 1): the client's page. About five minutes, facts only, taps only,
// "Not sure" always allowed, the areas as cards in any order. The one number is the gut number. Nothing leaves the
// phone until "Send my answers" saves a file to email or text to Eli. Never asks for account numbers or logins.
// Formatting only: the questions and the file are engine/profile.js.

import { saveFile, framed } from './save-file.js';
import { h } from './view.js';
import { applyPrefs } from './prefs.js';

applyPrefs();
import { questionEl } from './profile-q.js';
import { AREAS, LEVEL1, asked, choicesFor, answersFile, answersFileName, fieldsFor } from '../engine/profile.js';
import { parseInput, inputText } from '../engine/edits.js';

const KEY = 'slam-before:v1';
const app = document.getElementById('app');
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function load() { try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); return x && typeof x === 'object' && x.answers && typeof x.answers === 'object' ? { answers: x.answers, gut: typeof x.gut === 'number' ? x.gut : null, step: Number.isInteger(x.step) ? x.step : 0 } : null; } catch { return null; } }
let state = load() || { answers: {}, gut: null, step: 0 };
let note = '';
function keep() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* lasts until the page closes */ } }
// LIVE-FORM: a tap redraws the page; a typed or picked answer (a name, a year, a date) is kept without a redraw, so the
// next tap is never lost to a page rebuilt under the finger (D-034).
const TYPED = new Set(['text', 'year', 'state', 'date']);
const set = (id, value) => { const a = { ...state.answers }; if (value === null) delete a[id]; else a[id] = value; state = { ...state, answers: a }; keep(); if (!TYPED.has((LEVEL1.find((q) => q.id === id) || {}).kind)) draw(); else count(); };
// The answer count at the bottom, updated in place.
const count = () => { const el = document.getElementById('b-count'); if (el) el.textContent = countWords(); };
const countWords = () => { const n = Object.keys(state.answers).length; return n + (n === 1 ? ' answer' : ' answers') + (state.gut === null ? '.' : ' and your spending guess.'); };

// One section at a time (Krug pass): the areas that have questions, the spending guess after Why now, then Send.
const STEPS = () => {
  const areas = AREAS.filter(([area]) => LEVEL1.some((q) => q.area === area && asked(state.answers, q)));
  return [areas[0], ['gut', 'Spending'], ...areas.slice(1), ['send', 'Send to Eli']].filter(Boolean);
};
function areaCard([area, label]) {
  const qs = LEVEL1.filter((q) => q.area === area && asked(state.answers, q));
  const line = fieldsFor(state.answers).setup[area];
  return h('section', { class: 'card before-area', 'aria-labelledby': 'a-' + area },
    h('h2', { id: 'a-' + area }, label),
    ...qs.map((q) => questionEl(choicesFor(q, state.answers), state.answers[q.id] ?? null, (x) => set(q.id, x), { idPrefix: 'b' })),
    line ? h('p', { class: 'muted setup-line' }, line + '.') : null);
}

function gutCard() {
  const box = h('input', { id: 'gut', class: 'amt', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 2,500', 'aria-labelledby': 'gut-l' });
  box.value = inputText('money', state.gut);
  box.addEventListener('change', () => {
    const t = box.value.trim();
    // Kept in place, never redrawn: what was typed stays, even when it cannot be read.
    const say = (x) => { const el = document.getElementById('gut-msg'); if (el) el.textContent = x; };
    if (!t) { state = { ...state, gut: null }; keep(); say(''); count(); return; }
    const p = parseInput('money', t);
    if (!p.ok) { say('Type an amount, like 2,500.'); return; }
    state = { ...state, gut: p.value }; keep(); say(''); count();
  });
  return h('section', { class: 'card' }, h('h2', { id: 'gut-l' }, 'About how much do you spend a month?'), h('p', { class: 'muted' }, 'Your best guess. Don\'t look anything up.'), box, h('p', { class: 'edit-msg', id: 'gut-msg', role: 'alert' }));
}

// Send my answers (coaching, 2026-10-27): the phone's share sheet with the file when it can; else the file is saved to
// email or text. "Copy my answers" puts them in words on the clipboard, to paste into a message.
async function send() {
  const file = answersFile(state.answers, state.gut, todayIso());
  const name = answersFileName(state.answers.firstName, todayIso());
  const text = JSON.stringify(file, null, 2) + '\n';
  try {
    const f = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'My answers for Eli' }); note = 'Sent ' + name + '.'; draw(); return; }
  } catch (err) { if (err && err.name === 'AbortError') return; }
  // Where downloads are blocked (this page inside another one), say so and show the answers to copy, never "Saved".
  if (saveFile(name, text) === 'blocked') { note = ''; showWords = true; draw(); return; }
  note = 'Saved ' + name + ' to your downloads. Email or text this file to Eli.';
  draw();
}
const answerWords = () => [...LEVEL1.filter((q) => state.answers[q.id] !== undefined).map((q) => { const x = state.answers[q.id]; const w = (k) => ((q.options || []).find(([o]) => o === k) || [k, k])[1]; return q.label + ' ' + (Array.isArray(x) ? x.map(w).join(', ') : x === 'notSure' ? 'Not sure' : w(x)); }), state.gut !== null ? 'About how much I spend a month: $' + state.gut.toLocaleString('en-US') : null].filter(Boolean).join('\n');
async function copyAnswers() {
  try { await navigator.clipboard.writeText(answerWords()); note = 'Copied. Paste it into a message to Eli.'; } catch { note = ''; showWords = true; }
  draw();
}
// The answers in words, selected, for when neither a file nor the clipboard works here: copy them by hand.
let showWords = false;
function wordsBox() {
  const box = h('textarea', { id: 'b-words', rows: 8, readonly: true, 'aria-describedby': 'b-words-hint' });
  box.value = answerWords();
  requestAnimationFrame(() => { box.focus(); box.select(); });
  return h('div', { class: 'words-box' },
    h('p', { id: 'b-words-hint' }, 'This window can\'t save a file. Your answers are below and already selected: copy them (Ctrl+C, or Copy on a phone) and paste them into an email or text to Eli.'), box);
}

function sendCard() {
  return h('section', { class: 'card', 'aria-labelledby': 'send-h' },
    h('h2', { id: 'send-h' }, 'Send your answers to Eli'),
    h('p', { id: 'b-count' }, countWords()),
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: send }, 'Send my answers'), h('button', { type: 'button', class: 'btn', onclick: copyAnswers }, 'Copy my answers')),
    // Good news reads as a plain line; red is only for something that went wrong (owner's ask, 2026-10-28).
    h('p', { class: 'edit-hint', role: 'status' }, note || (framed() ? 'In this window, Send shows your answers ready to copy into an email or text to Eli.' : 'On a phone this opens the share sheet; on a computer it saves a file to email or text to Eli.')),
    showWords ? wordsBox() : null);
}
function draw() {
  const steps = STEPS(), at = Math.min(Math.max(state.step || 0, 0), steps.length - 1), [id, label] = steps[at];
  const goTo = (n) => { state = { ...state, step: n }; keep(); note = ''; showWords = false; draw(); window.scrollTo(0, 0); };
  app.replaceChildren(...[
    h('header', { class: 'top' }, h('h1', {}, 'Before our first call')),
    h('div', { class: 'before-progress' },
      h('p', { class: 'muted' }, 'Step ' + (at + 1) + ' of ' + steps.length + ' \u00b7 ' + label),
      h('div', { class: 'progress-bar', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(steps.length), 'aria-valuenow': String(at + 1), 'aria-label': 'Step ' + (at + 1) + ' of ' + steps.length }, h('span', { style: 'width:' + Math.round(((at + 1) / steps.length) * 100) + '%' }))),
    at === 0 ? h('p', { class: 'lede' }, 'About 5 minutes. Skip anything you do not know; your coach asks it on the call. Your answers stay on your phone until you send them; this never asks for account numbers or logins.') : null,
    id === 'gut' ? gutCard() : id === 'send' ? sendCard() : areaCard(steps[at]),
    h('nav', { class: 'step-nav', 'aria-label': 'Steps' },
      at > 0 ? h('button', { type: 'button', class: 'btn', onclick: () => goTo(at - 1) }, 'Back') : h('span'),
      at < steps.length - 1 ? h('button', { type: 'button', class: 'btn primary', onclick: () => goTo(at + 1) }, at === steps.length - 2 ? 'Done, send it' : 'Next') : null)].filter(Boolean));
}
draw();
