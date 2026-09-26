#!/usr/bin/env node
/* ==========================================================================
   binders/test/run.js, the Binders' own tests. PB-001.
   --------------------------------------------------------------------------
   Dependency-free, like coach/test/run.js: node only, a fake localStorage.
   Also run in CI beside the SPARKS suite.

     node binders/test/run.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
const ROOT = path.join(HERE, '..');
const B = (f) => path.join(HERE, f);

let passed = 0;
const failures = [];
function check(name, actual, expected) { if (actual === expected) { passed++; return; } failures.push(name + '\n      expected: ' + JSON.stringify(expected) + '\n      actual:   ' + JSON.stringify(actual)); }
function checkTrue(name, ok, detail) { if (ok) { passed++; return; } failures.push(name + (detail ? '\n      ' + detail : '')); }
function section(t) { console.log('\n' + t); }

function fakeStorage(seed) {
  const store = Object.assign({}, seed || {});
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, store };
}
const T = JSON.parse(fs.readFileSync(B('data/playbooks.json'), 'utf8'));
const EX = JSON.parse(fs.readFileSync(B('data/example.json'), 'utf8'));
const Store = require(B('shared/store.js'));
const Model = require(B('shared/model.js'));
const Reads = require(B('engines/reads.js'));
const Charts = require(B('shared/charts.js'));
Model.use(T); Reads.use(T);

/* ---------------------------------------------------------------- the table */
section('data/playbooks.json: twelve planets, six bands, every level whole');
['id', 'version', 'asOf', 'source', 'confidence', 'confidenceNote', 'note'].forEach(k => checkTrue(`the table carries ${k}`, typeof T[k] === 'string' && T[k].length > 0));
check('four systems', T.systems.length, 4);
check('six bands', T.bands.length, 6);
check('twelve playbooks', T.playbooks.length, 12);
T.systems.forEach(s => check(`${s.label} has three playbooks`, T.playbooks.filter(p => p.system === s.id).length, 3));
checkTrue('every system has a validated hue', T.systems.every(s => Charts.HUES[s.hue]));
const keys = {}, ids = {};
T.playbooks.forEach(p => {
  checkTrue(`${p.id} is unique`, !ids[p.id]); ids[p.id] = true;
  checkTrue(`${p.id} names its system`, T.systems.some(s => s.id === p.system));
  checkTrue(`${p.id} has a one-line and an idea`, p.oneLine.length > 20 && p.idea.length > 100);
  check(`${p.id} has six levels`, p.levels.length, 6);
  p.levels.forEach((l, i) => {
    check(`${p.id} level ${i + 1} is band ${i + 1}`, l.band, i + 1);
    checkTrue(`${p.id} band ${l.band} has a title, a why, a checkpoint and minutes`, l.title && l.why.length > 30 && l.checkpoint && l.minutes > 0);
    checkTrue(`${p.id} band ${l.band} has at least one exercise`, l.exercises.length >= 1);
    checkTrue(`${p.id} band ${l.band} has at least one checklist item`, l.checklist.length >= 1);
    checkTrue(`${p.id} band 4 (Build) carries a checklist of at least four`, l.band !== 4 || l.checklist.length >= 4);
    l.exercises.forEach(e => {
      if (e.ref) return;
      checkTrue(`${p.id} exercise ${e.key} has a kind and a label`, ['rating', 'number', 'money', 'pct', 'text', 'long', 'list', 'choice', 'log'].indexOf(e.kind) >= 0 && e.label);
      checkTrue(`exercise key ${e.key} is unique across the binder`, !keys[e.key]); keys[e.key] = { p, l, e };
      if (e.kind === 'choice') checkTrue(`${e.key} has at least two options`, e.options.length >= 2);
      if (e.kind === 'log') checkTrue(`${e.key} has columns`, e.columns.length >= 2);
    });
  });
  checkTrue(`${p.id} names at least two reads`, p.reads.length >= 2);
});
T.playbooks.forEach(p => p.levels.forEach(l => l.exercises.forEach(e => {
  if (!e.ref) return;
  const o = keys[e.ref];
  checkTrue(`${p.id} band ${l.band} ref ${e.ref} resolves to a shared exercise`, !!o && o.e.shared === true);
  checkTrue(`${e.ref} is read from a band no higher than where it is owned`, !!o && o.l.band <= l.band, o && `owned in band ${o.l.band}, read in band ${l.band}`);
})));
check('203 exercises in all', Object.keys(keys).length + T.playbooks.reduce((a, p) => a + p.levels.reduce((b, l) => b + l.exercises.filter(e => e.ref).length, 0), 0), 203);

section('The words: plain, short, no dash');
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
    if (d.name === 'vendor') return;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return walk(full);
    if (!/\.(js|html|json|md|css)$/.test(d.name)) return;
    const src = fs.readFileSync(full, 'utf8');
    checkTrue(`binders/${path.relative(HERE, full)} carries no em dash`, src.indexOf(String.fromCharCode(8212)) === -1);
    checkTrue(`binders/${path.relative(HERE, full)} touches no SPARKS storage key`, !/['"]slaf\.[a-z]/.test(src));
  });
})(HERE);
T.playbooks.forEach(p => p.levels.forEach(l => l.exercises.forEach(e => {
  if (e.ref) return;
  checkTrue(`${e.key}: the label is under twenty words`, e.label.split(/\s+/).length <= 20, e.label);
})));
checkTrue('the example answers are marked as an example and carry no real business', EX.example === true && /made-up/i.test(EX.note));

/* ---------------------------------------------------------------- the store */
section('shared/store.js: empty is not zero, money is cents, one key');
(function () {
  const s = fakeStorage(); Store.use(s);
  check('nothing stored reads as blank', Store.load().exercisesAnswered, undefined);
  check('blank has no answers', Object.keys(Store.load().answers).length, 0);
  Store.answer('price', 150000);
  check('an answer is stored', Store.load().answers.price, 150000);
  check('under one key', Object.keys(s.store).join(','), 'binders.v1');
  Store.answer('warm_week', 0);
  check('a typed zero is kept as zero', Store.load().answers.warm_week, 0);
  Store.answer('warm_week', '');
  check('an emptied box is absent, not zero', 'warm_week' in Store.load().answers, false);
  Store.answer('claims', []);
  check('an empty list is absent', 'claims' in Store.load().answers, false);
  Store.rough('price', true);
  check('rough marks', Store.load().rough.price, true);
  Store.answer('price', null);
  check('clearing an answer clears its rough mark', 'price' in Store.load().rough, false);
  Store.tick('machine-1', 0, true); Store.tick('machine-1', 1, true); Store.tick('machine-1', 1, false);
  check('ticks come and go', JSON.stringify(Store.load().checks['machine-1']), '{"0":true}');
  const text = Store.exportJson();
  Store.clear();
  check('clear forgets', Object.keys(Store.load().answers).length, 0);
  Store.importJson(text);
  check('import restores', JSON.stringify(Store.load().checks['machine-1']), '{"0":true}');
  Store.use(fakeStorage({ 'binders.v1': 'not json' }));
  check('a broken store reads as blank rather than throwing', Object.keys(Store.load().answers).length, 0);
  Store.use(fakeStorage({ 'binders.v1': JSON.stringify({ answers: { price: 1 }, junk: 5 }) }));
  check('an older shape migrates', Store.load().answers.price, 1);
  check('and drops what it does not know', Store.load().junk, undefined);
})();

/* ---------------------------------------------------------------- the model */
section('shared/model.js: levels, planets, bands, the next three');
(function () {
  const blank = Store.blank();
  const o = Model.overall(blank);
  check('72 levels', o.of, 72);
  check('none done at the start', o.done, 0);
  check('no ring lit', o.rings, 0);
  checkTrue('every level starts notYet', o.planets.every(p => p.levels.every(l => l.state === 'notYet')));
  checkTrue('every planet is working on band 1', o.planets.every(p => p.band === 1));
  const nx = Model.next(blank);
  check('three next', nx.length, 3);
  checkTrue('all in band 1 while band 1 is open anywhere', nx.every(n => n.level.band === 1));
  check('the first is the first playbook of the first system', nx[0].playbook.id, 'machine');
  const s = Store.blank();
  const m1 = Model.byId('machine').levels[0];
  s.answers.machine_rate = 3;
  let st = Model.levelState(m1, s);
  check('one answer makes it part', st.state, 'part');
  check('and names what is missing', st.missing.length, 2);
  s.answers.machine_now = 'x'; s.answers.machine_channel_now = 0;
  st = Model.levelState(m1, s);
  check('all answers but no ticks is still part', st.state, 'part');
  s.checks['machine-1'] = { 0: true, 1: true };
  st = Model.levelState(m1, s);
  check('all answers and all ticks is done', st.state, 'done');
  check('the planet moves to band 2', Model.planet('machine', s).band, 2);
  check('a choice of 0 counts as answered', Model.levelState(m1, s).filled, 3);
  const pr2 = Model.byId('price').levels[1];
  const s2 = Store.blank();
  s2.answers.customers_month = 5; s2.answers.raise_pct = 20;
  st = Model.levelState(pr2, s2);
  check('a ref counts as missing until its owner is answered', st.missing.indexOf('Price of the main thing you sell, per purchase') >= 0, true);
  s2.answers.price = 100; s2.answers.gross_margin = 70;
  st = Model.levelState(pr2, s2);
  check('and as filled once the owner has it', st.filled, 4);
  const full = Store.blank();
  T.playbooks.forEach(p => p.levels.forEach(l => { l.exercises.forEach(e => { if (!e.ref) full.answers[e.key] = e.kind === 'list' || e.kind === 'log' ? ['a'] : e.kind === 'choice' || e.kind === 'rating' ? 1 : e.kind === 'text' || e.kind === 'long' ? 'a' : 1; }); full.checks[l.id] = {}; l.checklist.forEach((_, i) => { full.checks[l.id][i] = true; }); }));
  const fo = Model.overall(full);
  check('everything answered and ticked is 72 done', fo.done, 72);
  check('and six rings', fo.rings, 6);
  check('and nothing next', Model.next(full).length, 0);
  checkTrue('every planet reads complete', fo.planets.every(p => p.band === null));
  const ex = Model.overall(EX.state);
  checkTrue('the example answers reach at least three done levels and no ring', ex.done >= 3 && ex.rings === 0);
})();

/* ---------------------------------------------------------------- the reads */
section('engines/reads.js: every read exists, empty is incomplete, the example computes');
(function () {
  const ids = [].concat(...T.playbooks.map(p => p.reads));
  const empty = Reads.evaluate({});
  ids.forEach(id => {
    checkTrue(`read ${id} exists`, !!empty[id]);
    check(`read ${id} is incomplete with nothing typed`, empty[id] && empty[id].status, 'incomplete');
    checkTrue(`read ${id} says what it is missing`, empty[id] && empty[id].missing.length > 0);
    check(`read ${id} carries no number when incomplete`, empty[id] && empty[id].value, null);
  });
  const all = Reads.evaluate(EX.state.answers);
  ids.forEach(id => check(`read ${id} computes on the example`, all[id].status, 'ok'));
  check('close rate: 5 of 14 shown, then 7 of 16 in the run', Math.round(all.closeRate.chart.items[0].value * 10) / 10, 35.7);
  check('show rate', Math.round(all.showRate.value), 70);
  check('leads needed = 8 / 0.4375 / 0.40', Math.round(all.leadsNeeded.value), 46);
  check('LTGP = 1500 * 0.8 * 1.5 in cents', all.ltgp.chart.items[0].value, 180000);
  check('LTGP to CAC = 1800 / 400', all.ltgpToCac.chart.value, 4.5);
  check('churn 3 of 30', all.churn.chart.items[0].value, 10);
  check('expected stay at the run churn (2 of 32)', Math.round(all.lifetime.value), 16);
  check('breakeven loss at 80% margin and a 20% raise', all.breakevenLoss.value, 20);
  check('thirty-day cash: 1500 + 30% of 500 against 400 + 200', all.thirtyDayCash.value, 165000 - 60000);
  check('thirty-day ratio', all.thirtyDayRatio.chart.value, 2.75);
  check('handoff 1 of 4', all.handoff.value, 25);
  check('proof coverage: two of three claims mapped, one cut', Math.round(all.proofCoverage.value), 67);
  check('cost per customer from ads', all.adCosts.chart.items.filter(i => /customer, before/.test(i.label))[0].value, 40000 / 3);
  check('the scorecard draws four small multiples', all.scorecard.chart.charts.length, 4);
  check('the four levers compound: 1.1 to the fourth', Math.round(all.fourLevers.chart.items[4].value / all.fourLevers.chart.items[0].value * 1000) / 1000, 1.464);
  const a = Object.assign({}, EX.state.answers, { customers_left: 0, run_left: undefined, run_start: undefined });
  const z = Reads.evaluate(a);
  check('zero churn is a number, not missing', z.churn.status, 'ok');
  check('but the stay cannot be measured from it', z.lifetime.value, null);
  const half = Reads.evaluate({ calls_booked_month: 10, calls_shown_month: 8 });
  check('a funnel with one count missing is incomplete', half.salesFunnel.status, 'incomplete');
  check('and names the count', half.salesFunnel.missing[0], 'Of those, how many bought');
  check('the show rate computes from the two it has', Math.round(half.showRate.value), 80);
  check('money formats as whole dollars', Reads.fmt(123456, 'money'), '$1,235');
  check('short money', Reads.fmt(12345600, 'money', true), '$123k');
  check('a ratio', Reads.fmt(4.5, 'ratio'), '4.5x');
  check('not yet', Reads.fmt(null, 'pct'), 'not yet');
})();

/* ---------------------------------------------------------------- the charts */
section('shared/charts.js: every kind renders, with a table twin');
(function () {
  const all = Reads.evaluate(EX.state.answers);
  const kinds = {};
  Object.keys(all).forEach(id => { const r = all[id]; if (!r.chart) return; kinds[r.chart.type] = true; const o = Charts.render(r.chart, { hue: 'aqua' }); checkTrue(`${id} renders a picture`, o.svg.length > 100); checkTrue(`${id} renders a table`, o.table.indexOf('<table') >= 0 || r.chart.type === 'multiples'); checkTrue(`${id} escapes its labels`, o.svg.indexOf('<script') === -1); });
  ['bars', 'funnel', 'meter', 'line', 'stackbars', 'grid4', 'progress', 'multiples'].forEach(k => checkTrue(`the example exercises the ${k} chart`, !!kinds[k]));
  const m = Charts.render({ type: 'meter', unit: 'pct', value: 82, min: 0, max: 100, bands: [{ to: 50, status: 'out' }, { to: 70, status: 'watch' }, { to: 100, status: 'good' }], title: 't' }, {});
  checkTrue('a meter says its zone in a word, not only a colour', m.svg.indexOf('82%, good') >= 0);
  const l = Charts.render({ type: 'line', unit: 'n', x: ['1', '2'], series: [{ label: 'a', values: [1, 2] }, { label: 'b', values: [2, 1] }], title: 't' }, {});
  checkTrue('two series get a legend', l.svg.indexOf('chart-legend') >= 0);
  const one = Charts.render({ type: 'line', unit: 'n', x: ['1', '2'], series: [{ label: 'a', values: [1, 2] }], title: 't' }, {});
  checkTrue('one series gets none', one.svg.indexOf('chart-legend') === -1);
  const esc = Charts.render({ type: 'bars', unit: 'n', items: [{ label: '<b>&"', value: 1 }], title: '<t>' }, {});
  checkTrue('labels are escaped', esc.svg.indexOf('<b>') === -1 && esc.svg.indexOf('&lt;b&gt;') >= 0);
  check('nice max', Charts.niceMax(37), 50);
  check('nice max of a decimal', Charts.niceMax(0.7), 1);
})();

/* ---------------------------------------------------------------- the pages */
section('The two pages and the vendored look');
['index.html', 'playbook.html'].forEach(f => {
  const src = fs.readFileSync(B(f), 'utf8');
  (src.match(/(?:src|href)="([^"#?]+)"/g) || []).map(m => m.replace(/^[a-z]+="/, '').replace(/"$/, '')).filter(p => !/^https?:/.test(p) && !/\.html$/.test(p) && !/\.md$/.test(p)).forEach(p => checkTrue(`${f} points at binders/${p}, which exists`, fs.existsSync(B(p))));
  checkTrue(`${f} has a content security policy`, src.indexOf('Content-Security-Policy') >= 0);
  checkTrue(`${f} allows no inline script`, !/script-src [^;]*unsafe-inline/.test(src) && !/<script>[^<]/.test(src));
  checkTrue(`${f} says it is built once`, src.indexOf('LIVE-FORM: built once') >= 0);
});
const vendor = require(B('tools/vendor.js'));
vendor.FILES.forEach(f => checkTrue(`binders/${f} is identical to ${f}`, fs.existsSync(B(f)) && Buffer.compare(fs.readFileSync(B(f)), fs.readFileSync(path.join(ROOT, f))) === 0, 'run: node binders/tools/vendor.js'));
checkTrue('the SPARKS suite still walks this folder for DD- references, so none are here', !/\bDD-\d{3}\b/.test(fs.readFileSync(B('README.md'), 'utf8') + fs.readFileSync(B('DECISIONS.md'), 'utf8')));
checkTrue('the log starts at PB-001', /^## PB-001\b/m.test(fs.readFileSync(B('DECISIONS.md'), 'utf8')));
checkTrue('CI runs these tests', fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8').indexOf('node binders/test/run.js') >= 0);

/* ---------------------------------------------------------------- report */
console.log('\n' + passed + ' passed' + (failures.length ? ', ' + failures.length + ' failed' : ''));
failures.forEach(f => console.log('  FAIL ' + f));
process.exit(failures.length ? 1 : 0);
