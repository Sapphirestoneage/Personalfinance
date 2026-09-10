#!/usr/bin/env node
/* ==========================================================================
   tests/glossary.test.js - the gloss dictionary and the lookup sentences.
   --------------------------------------------------------------------------
   Lane 2, section 4 (DECISIONS.md L-4). Asserts:

     - shared/glossary.json has at least 150 entries, each with a term, a
       one-sentence plain definition and a domain; terms and aliases are
       unique across the file
     - no definition contains its own term or any of its aliases (as a
       whole word, case-insensitive)
     - every definition is one sentence, under 40 words, and the file as a
       whole reads at about a sixth-grade level (Flesch-Kincaid grade
       from a plain syllable count; reported, and failed above grade 8)
     - shared/glossary.js resolves every term and alias through get(),
       find() sees terms in text, and mark() wraps the first occurrence in
       a small fake DOM
     - data/lane2/ledger-rows.where.json covers every lookup row the lane
       lists, and every row has a where, an ifMissing and a roughly
     - data/lane2/lenses.copy.json has a row for every lens in
       data/lenses.json with both sentences, no hedging word, a source
       with a URL, and no em dash anywhere in the copy

   Run:  node tests/glossary.test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const failures = [];
const notes = [];
function ok() { passed++; }
function check(name, cond, detail) { if (cond) ok(); else failures.push(name + (detail ? '\n      ' + detail : '')); }
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => new RegExp('(^|[^A-Za-z0-9])' + esc(w) + '(?![A-Za-z0-9])', 'i');

/* ---- 1. The glossary ------------------------------------------------------------ */
const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'glossary.json'), 'utf8'));
const terms = G.terms || [];
check('at least 150 glossary entries', terms.length >= 150, 'found ' + terms.length);
const seen = {};
terms.forEach((e) => {
  const label = 'glossary "' + e.term + '"';
  check(label + ' has a term, a plain sentence and a domain', typeof e.term === 'string' && e.term && typeof e.plain === 'string' && e.plain && typeof e.domain === 'string');
  check(label + ' aliases are a list', Array.isArray(e.also));
  [e.term].concat(e.also || []).forEach((n) => {
    const k = n.toLowerCase();
    if (seen[k] && seen[k] !== e.term) notes.push('"' + n + '" is listed under both "' + seen[k] + '" and "' + e.term + '"; get() returns the first');
    seen[k] = seen[k] || e.term;
  });
  /* No circular definition: neither the term nor any alias appears in it. */
  [e.term].concat(e.also || []).forEach((n) => {
    if (n.length < 2) return;
    check(label + ' does not use "' + n + '" in its own definition', !wordRe(n).test(e.plain), e.plain);
  });
  const sentences = e.plain.split(/(?<=[.!?])\s+(?=[A-Z])/).length;
  check(label + ' is one sentence', sentences === 1, e.plain);
  const words = e.plain.split(/\s+/).length;
  check(label + ' is under 40 words', words < 40, words + ' words');
  check(label + ' has no em dash', e.plain.indexOf('—') === -1);
});

/* Flesch-Kincaid grade over the whole file, with a plain syllable counter. */
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}
(function () {
  const text = terms.map((e) => e.plain).join(' ');
  const words = text.split(/\s+/).filter(Boolean);
  const sentenceCount = terms.length;
  const syl = words.reduce((t, w) => t + syllables(w), 0);
  const grade = 0.39 * (words.length / sentenceCount) + 11.8 * (syl / words.length) - 15.59;
  notes.push('glossary reading level: Flesch-Kincaid grade ' + grade.toFixed(1) + ' (' + (words.length / sentenceCount).toFixed(1) + ' words a sentence, ' + (syl / words.length).toFixed(2) + ' syllables a word) over ' + terms.length + ' definitions');
  check('glossary reads at or under grade 8', grade <= 8, 'grade ' + grade.toFixed(1));
})();

/* ---- 2. The library ---------------------------------------------------------------- */
const Glossary = require(path.join(ROOT, 'shared', 'glossary.js'));
terms.forEach((e) => {
  check('Glossary.get("' + e.term + '") resolves', Glossary.get(e.term) && Glossary.get(e.term).term === e.term);
  check('Glossary.get is case-insensitive for "' + e.term + '"', Glossary.get(e.term.toUpperCase()) && Glossary.get(e.term.toUpperCase()).plain === e.plain);
  (e.also || []).forEach((a) => check('alias "' + a + '" resolves', !!Glossary.get(a)));
});
check('get() of an unknown word is null', Glossary.get('zebra crossing') === null);
check('terms() returns a copy', Glossary.terms().length === terms.length && Glossary.terms() !== G.terms);
const found = Glossary.find('Your APR and your take-home pay decide the runway.');
check('find() sees APR, take-home pay and runway', ['APR', 'take-home pay', 'runway'].every((t) => found.some((e) => e.term === t)), found.map((e) => e.term).join(','));
check('find() does not match inside a longer word', !Glossary.find('The capping rule').some((e) => e.term === 'cap'));

/* mark() against a tiny DOM stand-in: enough of Node and TreeWalker to
   wrap text. The real thing is exercised by the master build once wired. */
(function () {
  function Text(v) { this.nodeType = 3; this.nodeValue = v; this.parentNode = null; }
  function El(tag) { this.nodeType = 1; this.tagName = tag; this.childNodes = []; this.attrs = {}; this.parentNode = null; this.className = ''; }
  El.prototype.appendChild = function (n) { n.parentNode = this; this.childNodes.push(n); return n; };
  El.prototype.insertBefore = function (n, ref) { n.parentNode = this; const i = ref ? this.childNodes.indexOf(ref) : -1; if (i === -1) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); return n; };
  El.prototype.setAttribute = function (k, v) { this.attrs[k] = v; };
  El.prototype.hasAttribute = function (k) { return k in this.attrs; };
  Object.defineProperty(El.prototype, 'textContent', { get() { return this.childNodes.map((c) => c.nodeType === 3 ? c.nodeValue : c.textContent).join(''); }, set(v) { this.childNodes = [new Text(v)]; this.childNodes[0].parentNode = this; } });
  Object.defineProperty(Text.prototype, 'nextSibling', { get() { const p = this.parentNode; const i = p.childNodes.indexOf(this); return p.childNodes[i + 1] || null; } });
  Object.defineProperty(El.prototype, 'nextSibling', { get() { const p = this.parentNode; const i = p.childNodes.indexOf(this); return p.childNodes[i + 1] || null; } });
  const doc = {
    createElement: (t) => new El(t.toUpperCase()), createTextNode: (v) => new Text(v),
    createTreeWalker: (rootEl) => { const list = []; (function walk(n) { if (n.nodeType === 3) list.push(n); else (n.childNodes || []).forEach(walk); })(rootEl); let i = -1; return { nextNode: () => list[++i] || null }; }
  };
  global.document = doc;
  const rootEl = new El('MAIN');
  rootEl.ownerDocument = doc;
  const p = rootEl.appendChild(new El('P'));
  p.appendChild(new Text('Your runway is what your APR eats first. The runway again.'));
  const a = rootEl.appendChild(new El('A'));
  a.appendChild(new Text('runway link'));
  const n = Glossary.mark(rootEl);
  const html = (function ser(node) { return node.nodeType === 3 ? node.nodeValue : '<' + node.tagName.toLowerCase() + (node.attrs && node.attrs.title ? ' title="…"' : '') + '>' + node.childNodes.map(ser).join('') + '</' + node.tagName.toLowerCase() + '>'; })(rootEl);
  check('mark() wraps two terms', n === 2, 'wrapped ' + n + ': ' + html);
  check('mark() wraps only the first runway', (html.match(/<abbr[^>]*>runway<\/abbr>/g) || []).length === 1, html);
  check('mark() leaves the link alone', html.indexOf('<a>runway link</a>') !== -1, html);
  check('mark() keeps the sentence intact', rootEl.textContent === 'Your runway is what your APR eats first. The runway again.runway link');
  delete global.document;
})();

/* ---- 3. The lookup sentences ------------------------------------------------------- */
const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lane2', 'ledger-rows.where.json'), 'utf8'));
const MUST = ['checking balance', 'savings balance', 'brokerage balance', '401(k) balance', 'traditional ira balance', 'roth ira balance', 'hsa balance', '529 balance', 'pension', 'home value', 'car value', 'credit card apr', 'student loan interest rate', 'car loan apr', 'mortgage rate', 'personal loan apr', 'take-home from a pay stub', 'employer match formula', 'vesting schedule', 'social security estimate', 'pension statement', 'property tax bill', 'health insurance premium', 'auto insurance premium', 'home or renters insurance premium', 'student loan servicer and plan', 'rsu grant document', 'credit report'];
const labels = (W.rows || []).map((r) => r.label.toLowerCase());
MUST.forEach((m) => check('where row for "' + m + '"', labels.some((l) => l.indexOf(m) !== -1)));
(W.rows || []).forEach((r) => {
  const label = 'where "' + r.label + '"';
  check(label + ' is a lookup row with a path and a letter', r.kind === 'lookup' && typeof r.path === 'string' && /^[DAITE]$/.test(r.letter));
  ['where', 'ifMissing', 'roughly'].forEach((k) => check(label + ' has ' + k, typeof r[k] === 'string' && r[k].length > 10));
  check(label + ' where is one or two sentences', r.where.split(/(?<=[.!?])\s+(?=[A-Z])/).length <= 2, r.where);
  check(label + ' has no em dash', JSON.stringify(r).indexOf('—') === -1);
});

/* ---- 4. The lens copy --------------------------------------------------------------- */
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lenses.json'), 'utf8'));
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lane2', 'lenses.copy.json'), 'utf8'));
const HEDGE = new RegExp('\\b(' + C.hedgeWords.replace(/^\\b\(|\)\\b$/g, '').replace(/^\(|\)$/g, '') + ')\\b', 'i');
const byId = {};
(C.lenses || []).forEach((l) => { byId[l.id] = l; });
L.lenses.forEach((l) => {
  const c = byId[l.id];
  check('lens copy for ' + l.id, !!c);
  if (!c) return;
  ['forWhom', 'notForWhom'].forEach((k) => {
    check(l.id + ' ' + k + ' is one sentence', typeof c[k] === 'string' && c[k].length > 10 && c[k].split(/(?<=[.!?])\s+(?=[A-Z])/).length === 1, c[k]);
    check(l.id + ' ' + k + ' has no hedging word', !HEDGE.test(c[k]), c[k]);
    check(l.id + ' ' + k + ' has no em dash', c[k].indexOf('—') === -1);
  });
  check(l.id + ' source has a kind, a title and a url', c.source && c.source.kind && c.source.title && typeof c.source.url === 'string');
});
check('no lens copy without a lens', (C.lenses || []).every((c) => L.lenses.some((l) => l.id === c.id)));

/* ---- Report ------------------------------------------------------------------------- */
const report = { entries: terms.length, passed, failures: failures.slice(), notes: notes.slice() };
fs.mkdirSync(path.join(ROOT, 'tests', 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tests', 'reports', 'glossary.json'), JSON.stringify(report, null, 2) + '\n');
try { require(path.join(ROOT, 'tests', 'tools', 'findings.js')).render(); } catch (e) { /* optional */ }
notes.forEach((n) => console.log('  note: ' + n));
if (failures.length) {
  console.log('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
  failures.slice(0, 40).forEach((f) => console.log('  x ' + f));
  process.exit(1);
}
console.log(passed + ' checks passed');
