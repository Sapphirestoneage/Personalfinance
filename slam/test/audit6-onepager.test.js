// Audit 6: the One-pager is a handout. Who it is for, the date and who prepared it on top; the footer at the end; the
// next step is the shared ranking in the client's words; debt shows the Plan's clear months or "not yet planned".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLAM } from './spine-helpers.js';

const src = readFileSync(SLAM + 'ui/onepager.js', 'utf8');

test('the handout names the client, the date and who prepared it, and ends with the footer', () => {
  assert.match(src, /clientName\(base\)/);
  assert.match(src, /'\. Prepared by Eli Saperstein, financial coach\.'/);
  assert.match(src, /'For education and planning\. Not investment, tax or legal advice\.'/);
});

test('the next step is the shared ranking, in words with no screen names', () => {
  assert.match(src, /rankSteps\(spine, rules, s,/);
  assert.match(src, /const step = rank\.first/);
  const words = [...src.replace(/^\s*\/\/.*$/gm, '').matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]).join(' ');
  assert.doesNotMatch(words, /Plan page|My numbers|on Today/);
});

test('debt shows the Plan\'s clear months or "not yet on your plan", under the Debt screen\'s three lead lines', () => {
  assert.match(src, /r\.planYm \? 'clear by ' \+ monthWords\(r\.planYm\) : 'not yet on your plan'/);
  assert.match(src, /leadLines\(d\.clearDates\)/);
  assert.match(src, /planPayoff\(spine, rules, s,/);
});
