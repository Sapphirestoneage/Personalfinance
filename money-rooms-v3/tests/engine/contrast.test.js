/* Accessibility basics that can be checked without a browser: the token
   pairs used for text meet WCAG AA (4.5:1), low-contrast tokens are never
   used as text colour, and a visible focus style exists. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(here, '..', '..', 'ui');
const tokens = fs.readFileSync(path.join(UI, 'tokens.css'), 'utf8');
const app = fs.readFileSync(path.join(UI, 'app.css'), 'utf8');

const hex = {};
/* the light theme is the first :root block only; the dark blocks that follow are read by darkHex() */
const lightBlock = tokens.slice(0, tokens.indexOf('}', tokens.indexOf(':root {')));
lightBlock.replace(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g, (m, k, v) => { hex[k] = v; return m; });

function luminance(h) {
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const la = luminance(hex[a]), lb = luminance(hex[b]);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const TEXT_PAIRS = [
  ['ink', 'paper'], ['ink', 'paper-2'], ['ink', 'sapphire-100'],
  ['slate', 'paper'], ['slate', 'paper-2'], ['slate', 'sapphire-100'],
  ['sapphire-700', 'paper'], ['sapphire-700', 'sapphire-100'], ['sapphire-900', 'paper'],
  ['paper', 'sapphire-700'], ['paper', 'sapphire-900'], ['on-bar', 'bar'], ['on-bar-muted', 'bar'], ['on-sun', 'sun'], ['bar', 'on-bar-muted'],
];

function darkHex() {
  const block = tokens.slice(tokens.indexOf(':root[data-theme="dark"]'));
  const out = Object.assign({}, hex);
  block.slice(0, block.indexOf('}')).replace(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g, (m, k, v) => { out[k] = v; return m; });
  return out;
}
test('every text and background token pair meets 4.5:1 in the dark theme too', () => {
  const dark = darkHex();
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const la = lum(dark[a]), lb = lum(dark[b]); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  [['ink', 'paper'], ['ink', 'paper-2'], ['ink', 'sapphire-100'], ['slate', 'paper'], ['slate', 'paper-2'], ['slate', 'sapphire-100'], ['sapphire-700', 'paper'], ['sapphire-700', 'sapphire-100'], ['sapphire-900', 'paper'], ['paper', 'sapphire-700'], ['on-bar', 'bar'], ['on-bar-muted', 'bar'], ['on-sun', 'sun']].forEach(([fg, bg]) => {
    const r = cr(fg, bg); assert.ok(r >= 4.5, 'dark ' + fg + ' on ' + bg + ' is ' + r.toFixed(2) + ':1');
  });
});

test('every text and background token pair meets 4.5:1', () => {
  TEXT_PAIRS.forEach(([fg, bg]) => {
    const r = contrast(fg, bg);
    assert.ok(r >= 4.5, fg + ' on ' + bg + ' is ' + r.toFixed(2) + ':1');
  });
});

test('gold and amber are borders and marks, never text colour', () => {
  const bad = app.split('\n').filter(l => /color:\s*var\(--(gold|amber)\)/.test(l) && !/border-color:\s*var\(--(gold|amber)\)[^;]*;\s*$/.test(l.replace(/border-color:[^;]*;/g, '')));
  const textOnly = bad.filter(l => /(^|[^-])color:\s*var\(--(gold|amber)\)/.test(l));
  assert.deepEqual(textOnly, [], 'low-contrast text colour in app.css');
});

test('a visible focus style exists', () => {
  assert.ok(/:focus-visible\s*\{[^}]*outline:\s*2px/.test(app), 'focus-visible outline');
});
