#!/usr/bin/env node
/* ==========================================================================
   moneymodels/test/run.js, Money Models' own tests. MM-001 onward.
   --------------------------------------------------------------------------
   Dependency-free, node only, a fake localStorage. Run in CI beside the
   SPARKS, D&D and coach suites.

     node moneymodels/test/run.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..');
const ROOT = path.join(APP, '..');
const A = (f) => path.join(APP, f);

let passed = 0;
const failures = [];
function check(name, actual, expected) { if (actual === expected) { passed++; return; } failures.push(name + '\n      expected: ' + JSON.stringify(expected) + '\n      actual:   ' + JSON.stringify(actual)); }
function checkTrue(name, ok, detail) { if (ok) { passed++; return; } failures.push(name + (detail ? '\n      ' + detail : '')); }
function section(t) { console.log('\n' + t); }
function near(a, b, tol) { return Math.abs(a - b) <= (tol || 0.5); }

function fakeStorage(seed) {
  const store = Object.assign({}, seed || {});
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i] === undefined ? null : Object.keys(store)[i], get length() { return Object.keys(store).length; }, store };
}
function fresh(seed) {
  ['shared/store.js', 'engines/model.js'].forEach(m => { delete require.cache[require.resolve(A(m))]; });
  const s = fakeStorage(seed);
  global.localStorage = s;
  const T = require(A('shared/tables.js')).loadSync();
  const Model = require(A('engines/model.js')).use(T);
  const Store = require(A('shared/store.js'));
  const Charts = require(A('shared/charts.js'));
  return { s, T, Model, Store, Charts };
}

/* ======================================================================
   A separate app (MM-001): its own folder, its own key, nothing outside
   ====================================================================== */
section('A separate app (MM-001)');
{
  const outside = [];
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'test') walk(p); } else if (/\.(js|html|css)$/.test(e.name)) {
    const t = fs.readFileSync(p, 'utf8');
    (t.match(/require\('([^']+)'\)/g) || []).forEach(r => { const rel = r.slice(9, -2); if (rel[0] === '.' && path.resolve(path.dirname(p), rel).indexOf(APP) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
    (t.match(/(?:src|href)="([^"#?]+)"/g) || []).forEach(r => { const rel = r.replace(/^(src|href)="/, '').replace(/"$/, ''); if (!/^(https?:|mailto:)/.test(rel) && /\.(js|css|svg|html|json)$/.test(rel) && path.resolve(path.dirname(p), rel).indexOf(APP) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
  } }); }
  walk(APP);
  checkTrue('every require and every src/href stays inside moneymodels/', outside.length === 0, outside.join(', '));
  const theme = fs.readFileSync(path.join(ROOT, 'shared/theme.css')), copy = fs.readFileSync(A('shared/theme.css'));
  checkTrue('shared/theme.css is a byte copy of SPARKS\' (cp shared/theme.css moneymodels/shared/theme.css)', theme.equals(copy));
  const src = ['app.js', 'shared/store.js', 'engines/model.js', 'shared/charts.js', 'shared/tables.js'].map(f => fs.readFileSync(A(f), 'utf8')).join('\n');
  checkTrue('no slaf. or coach. storage key is read or written', !/['"]slaf\./.test(src) && !/['"]coach\./.test(src));
  checkTrue('the store key is moneymodels.v1', /moneymodels\.v1/.test(fs.readFileSync(A('shared/store.js'), 'utf8')));
  checkTrue('no `|| 0` silently turns an empty value into a number', !/\|\|\s*0\b/.test(src), 'found one; empty is not zero');
}

/* ======================================================================
   The tables (MM-003): shape, alignment, copy
   ====================================================================== */
section('The tables');
{
  const { T, Model } = fresh();
  ['levels', 'recipes', 'plays', 'demo'].forEach(k => ['id', 'version', 'asOf', 'source', 'confidence', 'confidenceNote'].forEach(f => checkTrue(`data/${k}.json carries ${f}`, typeof T[k][f] === 'string' && T[k][f].length > 0)));
  const L = T.levels.levels, R = T.recipes.recipes, P = T.plays.plays;
  check('six planets', T.levels.planets.length, 6);
  check('five bands', T.levels.bands.length, 5);
  check('ninety levels', L.length, 90);
  T.levels.planets.forEach(p => {
    const mine = L.filter(l => l.planet === p.id);
    check(`${p.id} has fifteen levels`, mine.length, 15);
    check(`${p.id} levels are numbered 1 to 15`, mine.map(l => l.level).join(','), Array.from({ length: 15 }, (_, i) => i + 1).join(','));
    mine.forEach(l => check(`${l.id} band matches its level`, l.band, Math.ceil(l.level / 3)));
    [1, 2, 3, 4, 5].forEach(b => check(`${p.id} band ${b} has three levels`, mine.filter(l => l.band === b).length, 3));
    checkTrue(`${p.id} band 1 is all reading`, mine.filter(l => l.band === 1).every(l => l.kind === 'quiz'));
    checkTrue(`${p.id} band 2 is all numbers`, mine.filter(l => l.band === 2).every(l => l.kind === 'facts' && l.fields.every(f => ['cents', 'percent', 'count', 'days'].indexOf(f.kind) >= 0)));
    checkTrue(`${p.id} has a checklist on bands 4 and 5`, [4, 5].every(b => mine.some(l => l.band === b && l.kind === 'checklist')));
  });
  const ids = new Set(), keys = {};
  L.forEach(l => {
    checkTrue(`${l.id} is unique`, !ids.has(l.id)); ids.add(l.id);
    checkTrue(`${l.id} has a title, a lesson, a kind, minutes and a payoff`, typeof l.title === 'string' && Array.isArray(l.lesson) && l.lesson.length > 0 && ['quiz', 'facts', 'choice', 'checklist'].indexOf(l.kind) >= 0 && typeof l.minutes === 'number' && l.payoff && ['reveal', 'power', 'certainty'].indexOf(l.payoff.currency) >= 0 && l.payoff.metrics.length > 0);
    checkTrue(`${l.id} tag is R, E, B or C`, !!T.levels.tags[l.tag]);
    if (l.kind === 'quiz') checkTrue(`${l.id} quiz has options, a right answer and a why`, l.quiz && l.quiz.options.length >= 2 && l.quiz.answer >= 0 && l.quiz.answer < l.quiz.options.length && typeof l.quiz.why === 'string');
    if (l.kind === 'checklist') checkTrue(`${l.id} checklist has three or more items with unique ids`, l.items.length >= 3 && new Set(l.items.map(i => i.id)).size === l.items.length);
    if (l.kind === 'facts' || l.kind === 'choice') l.fields.forEach(f => {
      checkTrue(`${l.id}.${f.key} is asked once in the whole app (no fact typed twice)`, !keys[f.key], keys[f.key]); keys[f.key] = l.id;
      checkTrue(`${l.id}.${f.key} has a kind and a label`, ['cents', 'percent', 'count', 'days', 'text', 'choice'].indexOf(f.kind) >= 0 && typeof f.label === 'string');
      if (f.kind === 'choice') checkTrue(`${l.id}.${f.key} has options`, f.options && f.options.length >= 2);
    });
    l.payoff.metrics.forEach(m => checkTrue(`${l.id} payoff ${m} is a recipe`, R.some(r => r.id === m)));
  });
  /* Band alignment: a recipe of tier N needs only facts from bands 1 to N. */
  const bandOf = {}; L.forEach(l => { bandOf[l.id] = l.band; (l.fields || []).forEach(f => { bandOf[f.key] = l.band; }); });
  R.forEach(r => {
    checkTrue(`${r.id} names a tier 1 to 5, a kind and what it says`, r.tier >= 1 && r.tier <= 5 && ['number', 'badge', 'chart', 'read'].indexOf(r.kind) >= 0 && typeof r.says === 'string');
    r.needs.forEach(n => { checkTrue(`${r.id} needs ${n}, which exists`, n in bandOf); checkTrue(`${r.id} (tier ${r.tier}) needs ${n} from band ${bandOf[n]}, not above`, bandOf[n] <= r.tier); });
    checkTrue(`${r.id} has a formula, or is a badge`, r.kind === 'badge' || typeof Model.formulaFor(r.id) === 'function');
    if (r.kind === 'number') checkTrue(`${r.id} has a unit`, ['cents', 'percent', 'ratio', 'count', 'days', 'months'].indexOf(r.unit) >= 0);
    checkTrue(`${r.id} is lit by some level`, r.kind === 'chart' || r.id === 'collected30' || r.id === 'modelWritten' || L.some(l => l.payoff.metrics.indexOf(r.id) >= 0));
  });
  const recipeIds = new Set(R.map(r => r.id));
  P.forEach(p => {
    checkTrue(`play ${p.id} sits on a planet`, T.levels.planets.some(x => x.id === p.planet));
    checkTrue(`play ${p.id} has five steps`, p.steps.length === 5);
    p.when.forEach(w => checkTrue(`play ${p.id} waits on ${w.of}, a recipe or a fact`, recipeIds.has(w.of) || w.of in keys));
    checkTrue(`play ${p.id} is an option on its planet's pick level`, L.some(l => l.planet === p.planet && (l.fields || []).some(f => f.kind === 'choice' && f.options.some(o => o.id === p.id))));
  });
  /* Copy rules: no em dash, no N/A, no red words. */
  const text = JSON.stringify(T);
  checkTrue('no em dash anywhere in the tables', text.indexOf('\u2014') < 0);
  checkTrue('no "N/A" anywhere in the tables', !/\bN\/A\b/.test(text));
  ['index.html', 'app.js', 'app.css', 'README.md', 'STATUS.md'].forEach(f => checkTrue(`no em dash in ${f}`, fs.readFileSync(A(f), 'utf8').indexOf('\u2014') < 0));
  /* The demo fills everything. */
  Object.keys(keys).forEach(k => checkTrue(`demo has ${k}`, k in T.demo.facts));
  Object.keys(T.demo.facts).forEach(k => checkTrue(`demo fact ${k} is asked somewhere`, k in keys));
  L.filter(l => l.kind === 'quiz').forEach(l => check(`demo answers ${l.id} right`, T.demo.quizzes[l.id], l.quiz.answer));
  L.filter(l => l.kind === 'facts').forEach(l => l.fields.forEach(f => { const v = T.demo.facts[f.key]; if (f.kind === 'cents') checkTrue(`demo ${f.key} is integer cents`, Number.isInteger(v)); if (f.kind === 'text') checkTrue(`demo ${f.key} is text`, typeof v === 'string' && v.length > 0); }));
}

/* ======================================================================
   The store (MM-002): empty is not zero
   ====================================================================== */
section('The store');
{
  const { Store } = fresh();
  check('a fresh browser has no facts', Object.keys(Store.load().facts).length, 0);
  Store.setFact('price', 0);
  check('a typed zero is stored as 0', Store.load().facts.price, 0);
  Store.setFact('price', null);
  checkTrue('clearing removes the fact rather than storing null', !('price' in Store.load().facts));
  Store.setFact('promise', '');
  checkTrue('an empty string is not stored', !('promise' in Store.load().facts));
  Store.setQuiz('F1', 1); check('a quiz answer is kept', Store.load().quizzes.F1, 1);
  Store.setCheck('F12', 'a', true); Store.setCheck('F12', 'a', false);
  checkTrue('an unticked box leaves nothing behind', !('F12' in Store.load().checks));
  Store.setFact('price', 19900);
  const file = Store.exportJson();
  Store.reset(); check('reset clears everything', Object.keys(Store.load().facts).length, 0);
  Store.importJson(file); check('a saved file comes back', Store.load().facts.price, 19900);
  let threw = false; try { Store.importJson('{"x":1}'); } catch (e) { threw = true; }
  checkTrue('a foreign file is refused', threw);
  checkTrue('only the one key is written', Object.keys(global.localStorage.store).join(',') === 'moneymodels.v1');
}

/* ======================================================================
   The engine (MM-003): nothing computes from nothing; the demo lights all
   ====================================================================== */
section('The engine, empty');
{
  const { Model, Store } = fresh();
  const st = Store.load();
  check('no recipe is ready on a blank state', Model.recipes(st).filter(r => r.ready).length, 0);
  check('every recipe names what it is missing', Model.recipes(st).filter(r => r.missing.length > 0).length, Model.recipes(st).length);
  const P = Model.planets(st);
  check('nothing done', P.done, 0); check('no ring', P.rings, 0);
  checkTrue('every planet sits on orbit 0', P.planets.every(p => p.orbit === 0));
  const n = Model.next(st, 3);
  check('three next levels', n.length, 3);
  checkTrue('next up never goes above band 2 before band 1 is done everywhere', n.every(x => x.level.band <= 2));
  check('the first thing to do is Foundations 1', n[0].level.id, 'F1');
  check('no play is open', Model.plays(st).filter(p => p.open).length, 0);
  check('a lone typed zero makes a recipe part-ready but not ready', (Store.setFact('deliveryCost', 0), Model.recipe('gpPerSale', Store.load()).ready), false);
  check('...and its missing list is exactly the price', Model.recipe('gpPerSale', Store.load()).missing.map(m => m.key).join(','), 'price');
}
section('The engine, demo');
{
  const { T, Model, Store } = fresh();
  const st = Store.loadDemo(T.demo, T.levels.levels);
  const P = Model.planets(st);
  check('every level done', P.done, 90); check('five rings', P.rings, 5);
  checkTrue('every planet on orbit 5', P.planets.every(p => p.orbit === 5));
  check('nothing next', Model.next(st, 3).length, 0);
  const R = {}; Model.recipes(st).forEach(r => { R[r.id] = r; });
  checkTrue('every recipe is ready with the example numbers', Object.keys(R).every(k => R[k].ready), Object.keys(R).filter(k => !R[k].ready).join(','));
  /* The arithmetic, by hand, in cents. */
  check('gross profit per sale = 199 - 60', R.gpPerSale.value, 13900);
  checkTrue('margin = 139/199', near(R.grossMargin.value, 69.85, 0.01));
  check('CAC = 6000/40', R.cac.value, 15000);
  check('attraction GP = 500 - 120', R.attrGp.value, 38000);
  check('upsell expected = 900 x 25%', R.upExpected.value, 22500);
  check('downsell expected = 150 x 75% x 40%', R.downExpected.value, 4500);
  checkTrue('continuity month 1 = 109 x 60%', near(R.gp30.value - 38000 - 22500 - 4500, 6540, 0.01));
  checkTrue('30-day cash = the four added', near(R.gp30.value, 71540, 0.01));
  checkTrue('30-day ratio = 715.4 / 150', near(R.ratio30.value, 4.769, 0.001));
  check('the ratio is good', Model.status('ratio30', R.ratio30.value), 'good');
  check('expected months = 100 / 8', R.expectedMonths.value, 12.5);
  checkTrue('continuity lifetime = 109 x 60% x 12.5', near(R.contLtgp.value, 81750, 0.01));
  checkTrue('LTGP = 380 + 225 + 45 + 817.5', near(R.ltgp.value, 146750, 0.01));
  checkTrue('LTGP:CAC ~ 9.8', near(R.ltgpCac.value, 9.78, 0.01));
  check('payback on day 0 (the attraction offer alone beats CAC)', R.paybackDays.value, 0);
  checkTrue('continuity charged on day 42 is left out of the verified 30-day figure', near(R.cash30Verified.value, 38000 + 22500 + (45000 * 0.34 - 30000) * 0.75 * 0.4, 0.01));
  checkTrue('baseline ratio = 199 / 150', near(R.baselineRatio.value, 1.327, 0.001));
  checkTrue('effective upsell take = 85% x 80% x 25%', near(R.effectiveUpTake.value, 17, 0.01));
  checkTrue('break-even take on a 10% raise = 25 x 900 / 1020', near(R.breakEvenTake.value, 22.06, 0.01));
  checkTrue('customer growth = 55/40 - 1', near(R.customerGrowth.value, 37.5, 0.01));
  checkTrue('the growth curve is capped at capacity', R.growthCurve.value.series[0].points.every(p => p <= 80) && R.growthCurve.value.series[0].points[11] === 80);
  checkTrue('the retention curve starts at 100 and falls', R.retentionCurve.value.points[0] === 100 && R.retentionCurve.value.points[12] < 40);
  checkTrue('the funnel starts from 100 leads and narrows', R.funnel.value.rows[0].value === 100 && R.funnel.value.rows[1].value === 10);
  const plays = Model.plays(st);
  checkTrue('win your money back is open (margin 70%)', plays.find(p => p.id === 'winBack').open);
  checkTrue('the giveaway waits (cost per lead $15)', !plays.find(p => p.id === 'giveaway').open);
  checkTrue('pay less now waits (main offer $199)', !plays.find(p => p.id === 'payLessNow').open);
  checkTrue('the chosen plays are marked', plays.filter(p => p.chosen).map(p => p.id).sort().join(',') === 'default,giveaway,paymentPlan,rollover,winBack');
}
section('The engine, edges');
{
  const { T, Model, Store } = fresh();
  Store.loadDemo(T.demo, T.levels.levels);
  Store.setFact('newCustomers', 0);
  let r = Model.recipe('cac', Store.load());
  checkTrue('zero customers: CAC says why rather than dividing', !r.ready && /nothing to divide/.test(r.note));
  Store.setFact('newCustomers', 40); Store.setFact('churn', 0);
  r = Model.recipe('expectedMonths', Store.load());
  checkTrue('zero churn: months say why rather than Infinity', !r.ready && /ever leaves/.test(r.note));
  Store.setFact('churn', 8); Store.setFact('attrPrice', 0);
  r = Model.recipe('attrGp', Store.load());
  check('a free attraction offer computes (typed zero is real)', r.value, -12000);
  Store.setFact('contFirstDays', 0);
  r = Model.recipe('cash30Verified', Store.load());
  checkTrue('continuity charged at signup counts inside 30 days', near(r.value, -12000 + 22500 + (45000 * 0.34 - 30000) * 0.75 * 0.4 + 6540, 0.01));
  check('fmt cents', Model.fmt(123456, 'cents'), '$1,235');
  check('fmt negative cents', Model.fmt(-1100, 'cents'), '-$11');
  check('fmt percent', Model.fmt(69.85, 'percent'), '69.9%');
  check('fmt ratio', Model.fmt(4.769, 'ratio'), '4.8x');
  check('fmt null', Model.fmt(null, 'cents'), 'not yet');
}

/* ======================================================================
   The pictures (MM-004): every chart draws from the demo, with a table twin
   ====================================================================== */
section('The pictures');
{
  const { T, Model, Store, Charts } = fresh();
  const st = Store.loadDemo(T.demo, T.levels.levels);
  const R = {}; Model.recipes(st).forEach(r => { R[r.id] = r; });
  Object.keys(R).filter(k => R[k].kind === 'chart').forEach(k => {
    const svg = Charts.draw(R[k].value, Model.fmt), tbl = Charts.table(R[k].value, Model.fmt);
    checkTrue(`${k} draws an svg with a title`, /^<svg /.test(svg) && /<title>/.test(svg));
    checkTrue(`${k} has a table twin with rows`, /<tr>/.test(tbl));
    checkTrue(`${k} uses no hex colour outside the validated hues`, (svg.match(/#[0-9a-f]{6}/gi) || []).every(h => Object.keys(Charts.HUES).some(n => Charts.HUES[n].toLowerCase() === h.toLowerCase()) || ['#ffd27a', '#12151b', '#0a0c10'].indexOf(h.toLowerCase()) >= 0), 'the sun and ink aside');
  });
  const sky = Charts.sky(Model.planets(st).planets, 2);
  checkTrue('the sky draws six planets as links', (sky.match(/<a href="#planet\//g) || []).length === 6);
  checkTrue('the empty sky draws too', /<svg /.test(Charts.sky(Model.planets(Store.blank()).planets, 0)));
  checkTrue('a ring draws', /<svg /.test(Charts.ring(3, 15, 'blue')));
  checkTrue('a meter draws', /<svg /.test(Charts.meter(1.5, [{ to: 1, label: 'a', status: 'out' }, { to: 2, label: 'b', status: 'watch' }, { to: 4, label: 'c', status: 'good' }], 'ratio', Model.fmt)));
}

/* ======================================================================
   The page: CSP, scripts, markup
   ====================================================================== */
section('The page');
{
  const html = fs.readFileSync(A('index.html'), 'utf8');
  checkTrue('index.html has a CSP with no inline scripts', /Content-Security-Policy/.test(html) && /script-src 'self';/.test(html) && !/<script>[^<]/.test(html));
  checkTrue('index.html loads the five modules in order', /tables\.js[\s\S]*store\.js[\s\S]*model\.js[\s\S]*charts\.js[\s\S]*app\.js/.test(html));
  checkTrue('index.html has the five views', ['view-sky', 'view-planet', 'view-kpis', 'view-plays', 'view-model'].every(id => html.indexOf('id="' + id + '"') >= 0));
  checkTrue('the level panel is marked LIVE-FORM', /LIVE-FORM/.test(html) && /LIVE-FORM/.test(fs.readFileSync(A('app.js'), 'utf8')));
  checkTrue('the page says nothing leaves the browser', /stays in this browser/.test(html));
  checkTrue('the tests are in CI', /node moneymodels\/test\/run\.js/.test(fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8')));
  const dec = fs.readFileSync(A('DECISIONS.md'), 'utf8'), nums = (dec.match(/^## MM-(\d{3})/gm) || []).map(m => Number(m.slice(6)));
  checkTrue('the decision log counts MM-001 upward without a gap', nums.length > 0 && nums.every((n, i) => n === i + 1), nums.join(','));
}

delete global.localStorage;
console.log('\n' + passed + ' checks passed' + (failures.length ? ', ' + failures.length + ' failed' : ''));
if (failures.length) { failures.forEach(f => console.log('  FAIL ' + f)); process.exit(1); }
