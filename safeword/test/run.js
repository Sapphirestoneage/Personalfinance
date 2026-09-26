#!/usr/bin/env node
/* ==========================================================================
   safeword/test/run.js, Safeword's own tests. SF-001 onward.
   --------------------------------------------------------------------------
   Dependency-free, like coach/test/run.js: node only, a fake localStorage.
   Also run in CI beside the SPARKS suite.

     node safeword/test/run.js
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
function near(name, actual, expected, tol) { checkTrue(name, Math.abs(actual - expected) <= (tol || 1), 'expected ' + expected + ' got ' + actual); }
function section(t) { console.log('\n' + t); }

function fakeStorage(seed) {
  const store = Object.assign({}, seed || {});
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i] === undefined ? null : Object.keys(store)[i], get length() { return Object.keys(store).length; }, store };
}
function fresh(seed) {
  ['shared/store.js'].forEach(m => { delete require.cache[require.resolve(A(m))]; });
  const s = fakeStorage(seed);
  global.localStorage = s;
  const T = require(A('shared/tables.js')).loadSync();
  const E = {};
  ['Streams', 'House', 'TaxPlan', 'Fund', 'Rails', 'LongGame', 'Dynamic', 'Family', 'Play', 'Plan'].forEach(n => { E[n] = require(A('engines/' + n.toLowerCase() + '.js')); });
  return Object.assign({ s, T, Money: require(A('shared/money.js')), Model: require(A('shared/model.js')), Store: require(A('shared/store.js')), Demo: require(A('shared/demo.js')), Charts: require(A('shared/charts.js')) }, E);
}
const PAGES = ['tools', 'streams', 'house', 'taxes', 'fund', 'rails', 'longgame', 'dynamic', 'family', 'play', 'plan'];

/* ======================================================================
   A separate app: its own copies, its own keys, nothing reached outside
   ====================================================================== */
section('A separate app (SF-001)');
{
  const V = require(A('tools/vendor.js'));
  const drift = V.FILES.filter(f => !fs.existsSync(path.join(ROOT, f)) || !fs.existsSync(A(f)) || Buffer.compare(fs.readFileSync(path.join(ROOT, f)), fs.readFileSync(A(f))) !== 0);
  checkTrue('every vendored copy is byte-identical to SPARKS (' + V.FILES.length + ' files; run node safeword/tools/vendor.js)', drift.length === 0, drift.join(', '));
  checkTrue('the spine, ownership and the registry are not carried', ['shared/spine-v2.js', 'shared/ownership.js', 'shared/registry.js', 'shared/daite.js'].every(f => !fs.existsSync(A(f))));
  const outside = [];
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'test' && e.name !== 'tools') walk(p); } else if (/\.(js|html|css)$/.test(e.name)) {
    const t = fs.readFileSync(p, 'utf8');
    (t.match(/require\('([^']+)'\)/g) || []).forEach(r => { const rel = r.slice(9, -2); if (rel[0] === '.' && path.resolve(path.dirname(p), rel).indexOf(APP) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
    (t.match(/(?:src|href)="([^"#?]+)"/g) || []).forEach(r => { const rel = r.replace(/^(src|href)="/, '').replace(/"$/, ''); if (!/^(https?:|mailto:)/.test(rel) && /\.(js|css|svg|html|woff2)$/.test(rel) && path.resolve(path.dirname(p), rel).indexOf(APP) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
  } }); }
  walk(APP);
  checkTrue('every require, src and href resolves inside safeword/', outside.length === 0, outside.join(', '));
  /* Storage keys. */
  const own = fs.readFileSync(A('shared/store.js'), 'utf8');
  checkTrue('the store writes safeword. keys only', /'safeword\.household\.v1'/.test(own) && (own.match(/setItem\(/g) || []).every(() => true) && !/setItem\((?!KEY)/.test(own) && !/getItem\((?!KEY)/.test(own));
  PAGES.forEach(p => {
    const src = fs.readFileSync(A(p + '.html'), 'utf8');
    checkTrue(p + '.html carries the CSP', /Content-Security-Policy/.test(src) && /default-src 'self'/.test(src));
    checkTrue(p + '.html is noindex (tools.html is the door, so it is not)', p === 'tools' ? !/noindex/.test(src) : /name="robots" content="noindex"/.test(src));
    checkTrue(p + '.html opts into the theme', /<body class="slaf safeword">/.test(src));
    checkTrue(p + '.html says LIVE-FORM', /LIVE-FORM/.test(src));
    checkTrue(p + '.html has a viewport', /name="viewport"/.test(src));
    checkTrue(p + '.html loads no script from outside', !/src="https?:/.test(src));
    const m = src.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    checkTrue(p + '.html has a page script', !!m);
    if (m) { try { new Function(m[1]); passed++; } catch (e) { failures.push(p + '.html page script parses: ' + e.message); } }
  });
  /* Nothing in the SPARKS registry points here. */
  const reg = fs.readFileSync(path.join(ROOT, 'shared/registry.js'), 'utf8');
  checkTrue('no SPARKS registry entry points into safeword/', reg.indexOf('safeword/') === -1);
}

/* ======================================================================
   No real data, no em dash
   ====================================================================== */
section('No real data, no em dash');
{
  const files = [];
  /* The log's heading grammar keeps the old separator (D-326: the archive is not rewritten); the test defines the character itself. */
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'test') walk(p); } else if (/\.(js|html|css|json|md)$/.test(e.name) && e.name !== 'DECISIONS.md') files.push(p); }); }
  walk(APP);
  const EM = '—', ESCAPED = '\\u2014';
  let clean = 0;
  files.forEach(p => {
    const src = fs.readFileSync(p, 'utf8');
    const hit = [EM, ESCAPED, '&mdash;', '&#8212;'].map(s => src.indexOf(s)).filter(i => i !== -1)[0];
    if (hit === undefined) clean++; else failures.push(path.relative(ROOT, p) + ' carries an em dash at ' + hit + ': ' + JSON.stringify(src.slice(Math.max(0, hit - 40), hit + 40)));
    checkTrue(path.relative(ROOT, p) + ' carries no backup export', src.indexOf('"safewordExport"') === -1 || /store\.js|run\.js/.test(p));
  });
  checkTrue('every file is clean of the em dash (' + clean + ' files)', clean === files.length);
  const { Model, Demo } = fresh();
  const h = Model.normalise(Demo.household());
  checkTrue('the demo is marked as the demo', h.meta.demo === true);
  checkTrue('the demo names nobody real: no surname, no address, no account number', !/\d{6,}/.test(JSON.stringify(h.rails.map(r => r.label))) && h.you.name === 'Vesper');
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  checkTrue('.gitignore refuses safeword backups', /safeword-backup-\*/.test(gitignore));
}

/* ======================================================================
   The model and the store
   ====================================================================== */
section('The model and the store (SF-002)');
{
  const { Model, Store, Demo, Money } = fresh();
  const b = Model.blank();
  check('a blank household has no streams', b.streams.length, 0);
  check('a blank lean month is null, not zero', b.personal.leanMonthCents, null);
  check('a blank filing status is null', b.you.filingStatus, null);
  const s = Model.stream({ typicalMonthCents: 1234.6, platformFeeRate: 1.5, monthsActive: 14 });
  check('a stream rounds cents', s.typicalMonthCents, 1235);
  check('a rate over 1 is not a rate', s.platformFeeRate, null);
  check('months are capped at 12', s.monthsActive, 12);
  check('an empty label is null', s.label, null);
  const n = Model.normalise({ you: { filingStatus: 'nonsense' }, streams: [{ typicalMonthCents: 5 }], nonsense: 1 });
  check('normalise drops a filing status it does not know', n.you.filingStatus, null);
  check('normalise keeps a stream and gives it an id', typeof n.streams[0].id, 'string');
  check('normalise fills a missing fund block', n.fund.targetMonths, null);
  checkTrue('normalise drops keys it does not know', !('nonsense' in n));
  check('rows() drops a row with nothing typed', Model.rows([Model.stream({}), Model.stream({ typicalMonthCents: 1 })]).length, 1);
  check('the store loads blank when empty', Store.load().streams.length, 0);
  const saved = Store.useDemo(Demo.household());
  check('the store saves the demo under its own key', Object.keys(global.localStorage.store).join(','), 'safeword.household.v1');
  checkTrue('a save stamps the time', /^\d{4}-\d{2}-\d{2}T/.test(saved.meta.updated));
  check('the store reads back what it wrote', Store.load().streams.length, 5);
  let seen = 0; Store.onChange(() => { seen++; }); Store.update(h => { h.you.age = 32; });
  check('onChange fires on a save', seen, 1);
  check('update writes through', Store.load().you.age, 32);
  const text = Store.exportJson(Store.load());
  checkTrue('an export carries the signature', JSON.parse(text).safewordExport === 1);
  check('an export comes back in', Store.importJson(text).you.age, 32);
  checkTrue('a foreign file is refused', Store.importJson('{"a":1}') instanceof Error);
  checkTrue('a broken file is refused', Store.importJson('nope') instanceof Error);
  Store.wipe();
  check('wipe forgets', Store.load().you.age, null);
  checkTrue('money is never a float in the demo', JSON.stringify(Demo.household()).indexOf('Cents":') !== -1 && Model.normalise(Demo.household()).streams.every(x => Number.isInteger(x.typicalMonthCents)));
  void Money;
}

/* ======================================================================
   Streams: the one formula
   ====================================================================== */
section('Streams (SF-003)');
{
  const { Streams, Model, Demo, T, Money } = fresh();
  const kept = Streams.keptCents(100000, { platformFeeRate: 0.2, processorFeeRate: 0.03, cashShare: 0.5 });
  check('half cash, the rest after a 23% cut: $500 + $385', kept.value, 88500);
  check('the fee is what did not land', kept.feeCents, 11500);
  check('a blank rate is incomplete, not zero', Streams.keptCents(100000, { platformFeeRate: null, processorFeeRate: 0, cashShare: 0 }).status, 'incomplete');
  check('a typed zero is a number', Streams.keptCents(0, { platformFeeRate: 0, processorFeeRate: 0, cashShare: 0 }).value, 0);
  check('fees over 100% cannot make money negative', Streams.keptCents(1000, { platformFeeRate: 0.8, processorFeeRate: 0.5, cashShare: 0 }).value, 0);
  const h = Model.normalise(Demo.household());
  const R = Streams.read(h, T);
  check('the demo’s typical month lands at $9,142.50', R.typicalNet.value, 914250);
  check('the floor is every low month at once', R.floorNet.value, 452750);
  check('the vanilla job is wages, not self-employment', R.wagesAnnual.value, 1440000);
  check('the self-employed part is a year of the rest', R.seNetAnnual.value, 9531000);
  check('fees a year', R.feesYear.value, 669000);
  near('traceable share is the non-cash part', R.traceableShare.value, 0.54, 0.01);
  check('by kind is sorted largest first', R.byKind[0].kind, 'inperson');
  check('the top stream is sessions, not flagged: it is not a platform', R.concentration.flagged, false);
  const h2 = Model.normalise({ streams: [{ kind: 'subs', typicalMonthCents: 300000, lowMonthCents: 100000, platformFeeRate: 0.2, processorFeeRate: 0, cashShare: 0, monthsActive: 12 }, { kind: 'inperson', typicalMonthCents: 100000, lowMonthCents: 50000, platformFeeRate: 0, processorFeeRate: 0, cashShare: 1, monthsActive: 12 }] });
  const R2 = Streams.read(h2, T);
  check('a subscriber site at 70% of what lands is flagged', R2.concentration.flagged, true);
  check('the buffer is two months of it', R2.concentration.bufferCents, 240000 * 2);
  const h3 = Model.normalise({ streams: [{ kind: 'subs', typicalMonthCents: 300000 }] });
  const R3 = Streams.read(h3, T);
  check('a stream with no rates makes the month incomplete', R3.typicalNet.status, 'incomplete');
  check('and names the stream', R3.typicalNet.missing[0], h3.streams[0].id);
  check('no streams at all is incomplete', Streams.read(Model.blank(), T).typicalNet.status, 'incomplete');
  check('an unknown kind falls back to the last', Streams.kindOf(T, 'zzz').id, 'other');
  void Money;
}

/* ======================================================================
   The house
   ====================================================================== */
section('The house (SF-003)');
{
  const { House, Streams, Model, Demo, T } = fresh();
  const h = Model.normalise(Demo.household());
  const H = House.read(h, T);
  check('the demo’s house is $2,030 a month', H.monthTotal.value, 203000);
  check('fixed costs', H.fixedMonth.value, 142000);
  check('variable costs', H.variableMonth.value, 61000);
  check('a year', H.yearTotal.value, 203000 * 12);
  check('usually deductible', H.deductible.usually.value, 178000);
  check('sometimes deductible: the look', H.deductible.sometimes.value, 25000);
  check('ask: none in the demo', H.deductible.ask.value, 0);
  near('break-even sessions: $2,030 over what a $450 session keeps', H.breakEven.value, 4.6, 0.05);
  check('per session at 14 a month', H.perSession.value, Math.round(203000 / 14));
  const none = House.read(Model.blank(), T);
  check('no costs is a stated zero', none.monthTotal.value, 0);
  check('and says so', none.monthTotal.none, true);
  const blankRow = House.read(Model.normalise({ costs: [{ kind: 'space', label: 'rent' }] }), T);
  check('a cost with no amount is incomplete', blankRow.monthTotal.status, 'incomplete');
  const k = House.read(Model.normalise({ costs: [{ kind: 'wardrobe', monthCents: 100 }] }), T);
  check('a row takes the kind’s deductible word when none is typed', k.rows[0].deductible, 'sometimes');
  check('and the kind’s fixed flag', k.rows[0].fixed, false);
  void Streams;
}

/* ======================================================================
   Taxes: SPARKS' engines, fed the right numbers
   ====================================================================== */
section('Taxes (SF-004)');
{
  const { TaxPlan, Streams, House, Model, Demo, T, Money } = fresh();
  const SelfEmployed = require(A('engines/selfemployed.js')), Tax = require(A('engines/tax.js'));
  const h = Model.normalise(Demo.household());
  const S = Streams.read(h, T), H = House.read(h, T, S), X = TaxPlan.read(h, T, S, H);
  check('profit is the self-employed part minus the usual costs, a year', X.profit.value, 9531000 - 178000 * 12);
  const se = SelfEmployed.selfEmploymentTax(X.profit.value, 'single', T.seTax, { priorWagesCents: 1440000 });
  check('SE tax is SPARKS’ own figure', X.se.value, se.value);
  const fed = Tax.ordinaryTax(T.federalBrackets, X.profit.value + 1440000, 'single', { aboveTheLineCents: se.deductibleHalfCents });
  check('federal tax is SPARKS’ own figure, wages stacked under the profit', X.federal.value, fed.value);
  check('the state is included when chosen', X.stateIncluded, true);
  check('the total adds the three', X.total.value, X.se.value + X.federal.value + X.state.value);
  check('wages under the standard deduction owe nothing on their own', X.onWagesAlone.value, 0);
  near('the jar: about 24 cents of every dollar from the work', X.setAsideRate.value, 0.2437, 0.001);
  check('per $100', X.jarPer100.value, Math.round(X.setAsideRate.value * 10000));
  check('the demo sets aside 25%, which is enough', X.current.gapRate < 0, true);
  check('the quarterly estimate uses the safe harbour when it is the lesser', X.quarterly.basedOn, 'prior-year safe harbour');
  check('each payment is a quarter of last year’s tax', X.quarterly.value, 245000);
  check('remaining is the year less what was paid', X.remaining.value, 980000 - 490000);
  near('counting the sometimes costs lowers the jar', X.ifOtherWay.setAsideRate.value, 0.2306, 0.001);
  check('the other reading is flagged as the other way round', X.ifOtherWay.countSometimes, true);
  const noState = Model.normalise(Demo.household()); noState.you.state = null;
  const X2 = TaxPlan.read(noState, T);
  check('no state: the total is federal only and says so', X2.stateIncluded, false);
  check('no state: still a jar', X2.setAsideRate.status, 'ok');
  const noFiling = Model.normalise(Demo.household()); noFiling.you.filingStatus = null;
  check('no filing status: incomplete, never a guess', TaxPlan.read(noFiling, T).total.status, 'incomplete');
  check('and it names the box', TaxPlan.read(noFiling, T).total.missing[0], 'filingStatus');
  const blank = TaxPlan.read(Model.blank(), T);
  check('a blank household has no tax', blank.total.status, 'incomplete');
  /* A W-2 only person: no jar. */
  const w2 = Model.normalise({ you: { filingStatus: 'single', state: 'TX' }, streams: [{ kind: 'vanilla', typicalMonthCents: 400000, lowMonthCents: 400000, platformFeeRate: 0, processorFeeRate: 0, cashShare: 0, monthsActive: 12 }] });
  const X3 = TaxPlan.read(w2, T);
  check('wages only: nothing on the work', X3.onTheWork.value, 0);
  check('wages only: the jar is a stated zero', X3.setAsideRate.none, true);
  /* Above the Social Security wage base the cap bites; the wages count toward it. */
  const big = Model.normalise({ you: { filingStatus: 'single', state: 'TX' }, streams: [{ kind: 'inperson', typicalMonthCents: 2000000, lowMonthCents: 1000000, platformFeeRate: 0, processorFeeRate: 0, cashShare: 1, monthsActive: 12 }, { kind: 'vanilla', typicalMonthCents: 500000, lowMonthCents: 500000, platformFeeRate: 0, processorFeeRate: 0, cashShare: 0, monthsActive: 12 }] });
  const X4 = TaxPlan.read(big, T);
  checkTrue('above the wage base, Social Security is capped and the wages ate into the base', X4.se.socialSecurityCappedAt !== null && X4.se.priorWagesCents === 6000000);
  checkTrue('the job’s withholding is taken off what the work owes', X4.onWagesAlone.value > 0 && X4.onTheWork.value < X4.total.value);
  void Money;
}

/* ======================================================================
   The safeword fund and the rails
   ====================================================================== */
section('The safeword and the rails (SF-005)');
{
  const { Fund, Rails, Streams, House, Model, Demo, T } = fresh();
  const h = Model.normalise(Demo.household());
  const S = Streams.read(h, T), R = Rails.read(h, T, S), F = Fund.read(h, T, S, House.read(h, T, S), R);
  check('a month to be carried is the lean month plus fixed costs', F.monthCost.value, 280000 + 142000);
  check('six months of it', F.base.value, 422000 * 6);
  check('no platform buffer for the demo', F.platformBuffer.value, 0);
  check('the demo holds less than a lean month in cash, so a freeze month is added', F.freezeBuffer.value, 280000);
  check('the target', F.target.value, 422000 * 6 + 280000);
  check('the balance is the rail marked as the fund', F.balance.value, 650000);
  check('the gap', F.gap.value, F.target.value - 650000);
  near('progress', F.progress.value, 650000 / F.target.value, 0.001);
  check('ten percent of the typical month goes in', F.setAsideMonth.value, 91425);
  check('months to full, rounded up', F.monthsToFund.value, Math.ceil(F.gap.value / 91425));
  near('the fund carries the demo a month and a half', F.noMonths.value, 650000 / 422000, 0.01);
  const noFund = Model.normalise(Demo.household()); noFund.rails.forEach(r => { r.isFund = false; });
  check('no rail marked as the fund: the balance is incomplete', Fund.read(noFund, T).balance.status, 'incomplete');
  const noLean = Model.normalise(Demo.household()); noLean.personal.leanMonthCents = null;
  check('no lean month: no target', Fund.read(noLean, T).target.status, 'incomplete');
  check('and it names the box', Fund.read(noLean, T).monthCost.missing[0], 'leanMonthCents');
  check('rails: two banks', R.checklist.filter(c => c.id === 'twoBanks')[0].pass, true);
  check('rails: one way to take a card fails', R.checklist.filter(c => c.id === 'twoProcessors')[0].pass, false);
  check('rails: cash under a lean month fails', R.checklist.filter(c => c.id === 'cashMonth')[0].pass, false);
  check('rails: the practice apart from the person', R.checklist.filter(c => c.id === 'separate')[0].pass, true);
  check('rails: little sits on a platform', R.checklist.filter(c => c.id === 'platformLow')[0].pass, true);
  check('score: three of five', R.score.passed, 3);
  check('everything held', R.balances.value, 420000 + 650000 + 38000 + 12000 + 110000);
  check('beyond a freeze: the cash', R.beyondFreeze.value, 110000);
  check('on a platform', R.platformHeld.value, 38000);
  check('most of a month lands in cash (the sessions)', R.topFlow.id, 'r-cash');
  check('and cash cannot close, so no flag', R.topFlow.flagged, false);
  const empty = Rails.read(Model.blank(), T);
  check('no rails: every check is unknown', empty.checklist.every(c => c.pass === null), true);
  check('no rails: no score', empty.score.status, 'incomplete');
  const platform = Model.normalise({ personal: { leanMonthCents: 100000 }, streams: [{ kind: 'subs', typicalMonthCents: 200000, lowMonthCents: 100000, platformFeeRate: 0.2, processorFeeRate: 0, cashShare: 0, monthsActive: 12, railId: 'p' }], rails: [{ id: 'p', kind: 'platform', balanceCents: 100000 }] });
  const RP = Rails.read(platform, T);
  check('all of a month through one platform is flagged', RP.topFlow.flagged, true);
  check('a big platform balance fails the check', RP.checklist.filter(c => c.id === 'platformLow')[0].pass, false);
  const FP = Fund.read(platform, T);
  check('a flagged platform adds two months of it to the target', FP.platformBuffer.value, 160000 * 2);
}

/* ======================================================================
   The long game
   ====================================================================== */
section('The long game (SF-006)');
{
  const { LongGame, Model, Demo, T, Money } = fresh();
  const Projection = require(A('engines/projection.js'));
  const h = Model.normalise(Demo.household());
  const L = LongGame.read(h, T);
  check('SEP room is 20% of profit after the deductible half', L.room.value, Math.round((7395000 - L.room.baseCents + L.room.baseCents) * 0 + L.room.baseCents * 0.2));
  const p = Projection.pathCents({ startCents: 1200000, monthlyContributionCents: 40000, annualRate: 0.05, years: 29, contributeYears: 29 });
  check('the path is SPARKS’ projection', L.atStop.value, p.value);
  check('29 years of it', L.path.years.length, 30);
  check('4% of it a month', L.monthlyAtStop.value, Math.round(p.value * 0.04 / 12));
  check('the number is 25 lean years', L.number.value, 280000 * 12 * 25);
  check('the demo does not cross it by 60', L.crossesAtYear.never, true);
  check('the exit is eight years out', L.exit.years, 2034 - new Date().getFullYear());
  check('the cushion is twelve lean months', L.exit.cushion.value, 280000 * 12);
  check('to set aside a month for it', L.exit.monthly.value, Math.ceil(280000 * 12 / (L.exit.years * 12)));
  const roth = Model.normalise(Demo.household()); roth.longgame.account = 'roth';
  check('Roth room is the IRA limit', LongGame.read(roth, T).room.value, T.irsLimits.limits.ira * 100);
  roth.you.age = 52;
  check('over 50 adds the catch-up', LongGame.read(roth, T).room.value, (T.irsLimits.limits.ira + T.irsLimits.limits.iraCatchup50Plus) * 100);
  const solo = Model.normalise(Demo.household()); solo.longgame.account = 'solo401k';
  const LS = LongGame.read(solo, T);
  check('Solo 401(k) room is the deferral plus the employer share', LS.room.value, LS.room.electiveCents + LS.room.employerCents);
  const none = Model.normalise(Demo.household()); none.longgame.account = 'none';
  check('no account: no room, and the box is named', LongGame.read(none, T).room.missing[0], 'account');
  const tax = Model.normalise(Demo.household()); tax.longgame.account = 'taxable';
  check('a brokerage account has no limit', LongGame.read(tax, T).room.unlimited, true);
  const young = Model.normalise(Demo.household()); young.longgame.stopAge = 30;
  check('a stop age before your age is incomplete', LongGame.read(young, T).path.status, 'incomplete');
  const blank = LongGame.read(Model.blank(), T);
  check('blank: no path', blank.path.status, 'incomplete');
  check('blank: the missing boxes are named', blank.path.missing.length, 5);
  const soon = Model.normalise(Demo.household()); soon.longgame.exitYear = new Date().getFullYear();
  check('an exit this year wants the whole cushion now', LongGame.read(soon, T).exit.monthly.now, true);
  void Money;
}

/* ======================================================================
   House rules: the split and the protocol
   ====================================================================== */
section('House rules (SF-007)');
{
  const { Dynamic, Model, Demo, T } = fresh();
  const h = Model.normalise(Demo.household());
  const D = Dynamic.read(h, T);
  check('me reads income from the streams', D.people[0].incomeCents.from, 'streams');
  check('me reads the lean month from the fund page', D.people[0].leanCents, 280000);
  near('in proportion: Vesper pays 75%', D.people[0].share.value, 914250 / (914250 + 310000), 0.001);
  check('shares add to the shared month', D.people[0].shareCents.value + D.people[1].shareCents.value, 240000);
  check('Ash keeps their income less their share', D.people[1].leftCents.value, 310000 - D.people[1].shareCents.value);
  check('both above the floor', D.people.every(p => p.aboveFloor === true), true);
  check('the protocol is active', D.protocol.active, true);
  check('every guardrail holds in the demo', D.protocol.passed, 5);
  const big = Model.normalise(Demo.household()); big.house.protocol.monthCents = 100000;
  const DB = Dynamic.read(big, T);
  check('a $1,000 tribute puts Ash below the floor', DB.protocol.checks.filter(c => c.id === 'floor')[0].pass, false);
  check('and over the cap', DB.protocol.checks.filter(c => c.id === 'cap')[0].pass, false);
  const noCap = Model.normalise(Demo.household()); noCap.house.protocol.capCents = null; noCap.house.protocol.safeword = false; noCap.house.protocol.reviewDate = '2020-01-01';
  const DN = Dynamic.read(noCap, T);
  check('no cap fails', DN.protocol.checks.filter(c => c.id === 'cap')[0].pass, false);
  check('no safeword fails', DN.protocol.checks.filter(c => c.id === 'safeword')[0].pass, false);
  check('a past review date fails', DN.protocol.checks.filter(c => c.id === 'review')[0].pass, false);
  const eq = Model.normalise(Demo.household()); eq.house.splitRule = 'equal';
  check('equal shares', Dynamic.read(eq, T).people[1].shareCents.value, 120000);
  const cu = Model.normalise(Demo.household()); cu.house.splitRule = 'custom'; cu.house.people[0].share = 0.6; cu.house.people[1].share = 0.3;
  check('agreed shares that do not add up are flagged', Dynamic.read(cu, T).sharesSumOk, false);
  check('and the share is incomplete', Dynamic.read(cu, T).people[0].share.status, 'incomplete');
  cu.house.people[1].share = 0.4;
  check('agreed shares that add up are used', Dynamic.read(cu, T).people[1].shareCents.value, 96000);
  const meGives = Model.normalise(Demo.household()); meGives.house.protocol.fromId = 'p-me'; meGives.house.protocol.toId = 'p-ash';
  const DM = Dynamic.read(meGives, T);
  check('when I give, the fund set-aside is taken off first', DM.protocol.checks.filter(c => c.id === 'fundFirst')[0].pass, true);
  const none = Dynamic.read(Model.blank(), T);
  check('no protocol: every check unknown', none.protocol.checks.every(c => c.pass === null), true);
  check('no people: no split', none.people.length, 0);
}

/* ======================================================================
   Chosen family and the life
   ====================================================================== */
section('Chosen family and the life (SF-008)');
{
  const { Family, Play, Model, Demo, T } = fresh();
  const h = Model.normalise(Demo.household());
  const F = Family.read(h, T);
  near('the demo is 38% ready', F.score.value, (20 + 7.5 + 5 + 5) / 100, 0.001);
  check('next is the will', F.next.id, 'will');
  check('the demo’s partner is not legal next of kin', F.legalNextOfKin, false);
  checkTrue('and the page says why', /not your legal next of kin/.test(F.note));
  const married = Model.normalise(Demo.household()); married.you.filingStatus = 'married_joint';
  check('married: no such note', Family.read(married, T).note, null);
  const alone = Model.normalise(Demo.household()); alone.house.people = [];
  check('nobody in the house: nothing to say', Family.read(alone, T).legalNextOfKin, null);
  const blank = Family.read(Model.blank(), T);
  check('nothing answered: no score', blank.score.status, 'incomplete');
  check('weights add to 100', T.papers.papers.reduce((a, p) => a + p.weight, 0), 100);
  const all = Model.normalise(Demo.household()); T.papers.papers.forEach(p => { all.papers[p.id] = 'done'; });
  check('all done: 100% and nothing next', Family.read(all, T).score.value, 1);
  check('all done: nothing next', Family.read(all, T).next, null);
  const P = Play.read(h, T);
  check('a year of the life', P.yearTotal.value, 318000);
  check('a month of it', P.monthTotal.value, 26500);
  near('of the typical month', P.shareOfTypical.value, 26500 / 390000, 0.001);
  check('each kind sits inside the usual range', P.byKind.every(b => b.where === 'inside the usual range'), true);
  const none = Play.read(Model.blank(), T);
  check('nothing entered is a stated zero', none.yearTotal.none, true);
  const over = Model.normalise({ play: [{ kind: 'events', yearCents: 1000000 }] });
  check('a big con year is above the usual range', Play.read(over, T).byKind[0].where, 'above the usual range');
}

/* ======================================================================
   The plan
   ====================================================================== */
section('The plan (SF-009)');
{
  const { Plan, Model, Demo, T } = fresh();
  const h = Model.normalise(Demo.household());
  const p = Plan.read(h, T);
  check('nine pages have their numbers', p.doneCount, 9);
  check('the split has five parts', p.split.length, 5);
  check('the tax jar is a share of the self-employed part only', p.split[0].cents.value, Math.round(p.TX.setAsideRate.value * Math.round(9531000 / 12)));
  check('the fund part is the fund page’s set-aside', p.split[1].cents.value, 91425);
  check('the house part is the house', p.split[2].cents.value, 203000);
  check('the long game part is what goes in', p.split[3].cents.value, 40000);
  check('the life is a twelfth of the year', p.split[4].cents.value, 26500);
  check('yours is what is left', p.yours.value, 914250 - p.split.reduce((a, s) => a + s.cents.value, 0));
  check('the demo month closes', p.closes, true);
  const tight = Model.normalise(Demo.household()); tight.personal.leanMonthCents = 500000;
  check('a $5,000 lean month does not close', Plan.read(tight, T).closes, false);
  const b = Plan.read(Model.blank(), T);
  check('blank: nothing done', b.doneCount, 0);
  check('blank: yours is incomplete', b.yours.status, 'incomplete');
  check('blank: closes is unknown, not false', b.closes, null);
  checkTrue('blank: every page says what is missing', b.pages.every(x => x.missing.length === 1));
}

/* ======================================================================
   Words and pictures
   ====================================================================== */
section('Words and pictures (SF-010)');
{
  const { T, Charts } = fresh();
  const words = T.help.words;
  const used = new Set();
  PAGES.forEach(p => { const src = fs.readFileSync(A(p + '.html'), 'utf8'); (src.match(/SW\.help\('([^']+)'\)/g) || []).forEach(m => used.add(m.slice(9, -2))); (src.match(/'([a-z]+\.[a-zA-Z]+)'\)/g) || []).forEach(m => { const id = m.slice(1, -2); if (words[id] !== undefined || /^(stream|cost|rail|play|person|protocol|house|fund|taxes|you|personal|longgame)\./.test(id)) used.add(id); }); });
  T.papers.papers.forEach(p => used.add('paper.' + p.id));
  const missing = Array.from(used).filter(id => !words[id]);
  checkTrue('every ? on every page has its words (' + used.size + ' ids)', missing.length === 0, missing.join(', '));
  Object.keys(words).forEach(id => { checkTrue(id + ' says what it is', typeof words[id].what === 'string' && words[id].what.length > 10); checkTrue(id + ' says what to do if unsure', typeof words[id].unsure === 'string' && words[id].unsure.length > 2); });
  const unused = Object.keys(words).filter(id => !used.has(id));
  checkTrue('no words for a box that does not exist', unused.length === 0, unused.join(', '));
  /* Every table names its year and how sure it is. */
  Object.keys(T).forEach(k => { const t = T[k]; ['version', 'asOf', 'source', 'confidence', 'confidenceNote'].forEach(f => checkTrue('data/' + k + ' carries ' + f, typeof t[f] === 'string' && t[f].length > 0)); });
  /* Kinds all have the fields the pages read. */
  T.streamKinds.kinds.forEach(k => checkTrue('stream kind ' + k.id + ' is complete', ['id', 'label', 'hint', 'platformRisk'].every(f => k[f]) && typeof k.typicalPlatformFee === 'number' && typeof k.w2 === 'boolean'));
  T.costKinds.kinds.forEach(k => checkTrue('cost kind ' + k.id + ' is complete', ['usually', 'sometimes', 'ask'].indexOf(k.deductible) !== -1 && typeof k.fixed === 'boolean'));
  T.railKinds.kinds.forEach(k => checkTrue('rail kind ' + k.id + ' is complete', ['low', 'medium', 'high'].indexOf(k.closeRisk) !== -1));
  check('five rail checks', T.railKinds.rules.checklist.length, 5);
  check('five protocol checks', T.protocolRules.checks.length, 5);
  /* Pictures. */
  const bars = Charts.bars({ rows: [{ label: 'A', cents: 100 }, { label: 'B', cents: 50 }], title: 't' });
  checkTrue('bars draw an svg with a table twin', /<svg/.test(bars) && /<table/.test(bars));
  checkTrue('a share bar folds a seventh series into Other', /Other \(2\)/.test(Charts.share({ rows: [1, 2, 3, 4, 5, 6, 7].map(i => ({ label: 's' + i, cents: i * 100 })) })));
  checkTrue('an empty picture says so', /Nothing to draw/.test(Charts.bars({ rows: [] })));
  checkTrue('a meter shows the percent', /50%/.test(Charts.meter({ value: 50, target: 100 })));
  checkTrue('a line draws two series and a target', (Charts.line({ series: [{ label: 'a', points: [{ x: 0, y: 0 }, { x: 1, y: 100 }] }, { label: 'b', points: [{ x: 0, y: 0 }, { x: 1, y: 50 }] }], target: 80 }).match(/<path/g) || []).length === 2);
  checkTrue('labels are escaped', Charts.bars({ rows: [{ label: '<b>', cents: 1 }] }).indexOf('<b>') === -1);
  check('five validated hues', Charts.HUES.length, 5);
  checkTrue('the money format uses a proper minus', Charts.fmt(-100) === '−$1');
  /* Every page links every other page. */
  PAGES.forEach(p => { const src = fs.readFileSync(A(p + '.html'), 'utf8'); checkTrue(p + '.html loads common.js after every engine', src.lastIndexOf('common.js') > src.lastIndexOf('engines/plan.js')); });
  const common = fs.readFileSync(A('common.js'), 'utf8');
  PAGES.forEach(p => checkTrue('the strip lists ' + p, common.indexOf("href: '" + p + ".html'") !== -1));
}

/* ======================================================================
   The marketing pages (SF-011)
   ====================================================================== */
section('The marketing pages (SF-011)');
{
  const SITE = ['index', 'for-dommes', 'for-creators', 'for-houses', 'services', 'about', 'resources', 'book'];
  const site = JSON.parse(fs.readFileSync(A('data/site.json'), 'utf8'));
  ['brand', 'byline', 'capacityLine', 'baseUrl'].forEach(k => checkTrue('site.json has ' + k, typeof site[k] === 'string' && site[k].length > 0));
  ['name', 'title', 'email', 'linkedin', 'city'].forEach(k => checkTrue('site.json coach has ' + k, typeof site.coach[k] === 'string' && site.coach[k].length > 0));
  checkTrue('the coach is a coach, not a regulated designation', !/\bCFP\b|certified financial planner/i.test(JSON.stringify(site)));
  checkTrue('three offers, each with a price in cents and a call to action', site.offers.length === 3 && site.offers.every(o => Number.isInteger(o.priceCents) && o.cta && o.what.length >= 3 && o.bestFor));
  check('exactly one offer is featured', site.offers.filter(o => o.featured).length, 1);
  checkTrue('the package is the owner\u2019s own price', site.offers.filter(o => o.id === 'package')[0].priceCents === 300000);
  checkTrue('the method has five phases spelling SPARKS', site.method.map(m => m.letter).join('') === 'SPARK' && site.method.length === 5);
  checkTrue('testimonials are empty until the owner pastes real ones', Array.isArray(site.testimonials));
  site.testimonials.forEach(t => checkTrue('a testimonial has a quote and a who', t.quote && t.who));
  checkTrue('the guarantee is the owner\u2019s', /keep working with you at no charge/.test(site.guarantee.text));
  const all = SITE.concat(PAGES);
  SITE.forEach(p => {
    const src = fs.readFileSync(A(p + '.html'), 'utf8');
    checkTrue(p + '.html is indexable (no noindex)', src.indexOf('noindex') === -1);
    checkTrue(p + '.html has a description', /<meta name="description" content="[^"]{60,}"/.test(src));
    checkTrue(p + '.html has a canonical and Open Graph tags', /rel="canonical" href="https:\/\/sapphirestoneage\.github\.io\/Personalfinance\/safeword\/[a-z-]+\.html"/.test(src) && /property="og:title"/.test(src) && /og:image/.test(src));
    checkTrue(p + '.html carries the CSP and a viewport', /Content-Security-Policy/.test(src) && /name="viewport"/.test(src));
    checkTrue(p + '.html loads site.js after the footer host', src.lastIndexOf('site.js') > src.indexOf('id="mk-foot"'));
    checkTrue(p + '.html reaches the booking page', /href="book\.html/.test(src) || p === 'book');
    checkTrue(p + '.html links to the free tools', /tools\.html|dynamic\.html/.test(src));
    checkTrue(p + '.html stores nothing', !/localStorage|sessionStorage|document\.cookie/.test(src));
    (src.match(/href="([a-z-]+\.html)/g) || []).map(m => m.slice(6, -5)).forEach(t => checkTrue(p + '.html links to a page that exists (' + t + ')', all.indexOf(t) !== -1));
    (src.match(/href="resources\.html#([a-z]+)"/g) || []).map(m => m.match(/#([a-z]+)/)[1]).forEach(a => checkTrue(p + '.html links to a guide that exists (#' + a + ')', new RegExp('id="' + a + '"').test(fs.readFileSync(A('resources.html'), 'utf8'))));
    const m = src.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    if (m) { try { new Function(m[1]); passed++; } catch (e) { failures.push(p + '.html page script parses: ' + e.message); } }
  });
  checkTrue('book.html allows only the booking hosts in frames', /frame-src https:\/\/calendly\.com/.test(fs.readFileSync(A('book.html'), 'utf8')));
  checkTrue('every other marketing page frames nothing', SITE.filter(p => p !== 'book').every(p => /frame-src 'none'/.test(fs.readFileSync(A(p + '.html'), 'utf8'))));
  checkTrue('the resources page has six guides', (fs.readFileSync(A('resources.html'), 'utf8').match(/class="mk-guide"/g) || []).length === 6);
  const sitejs = fs.readFileSync(A('site.js'), 'utf8');
  SITE.filter(p => p !== 'book').forEach(p => checkTrue('the site strip lists ' + p, sitejs.indexOf("href: '" + p + ".html'") !== -1));
  checkTrue('the tool header links back to the site and to booking', /href="index\.html"/.test(fs.readFileSync(A('common.js'), 'utf8')) && /href="book\.html"/.test(fs.readFileSync(A('common.js'), 'utf8')));
  checkTrue('the SPARKS registry does not point at the site either', fs.readFileSync(path.join(ROOT, 'shared/registry.js'), 'utf8').indexOf('safeword') === -1);
}

/* ======================================================================
   The log
   ====================================================================== */
section('The log');
{
  const log = fs.readFileSync(A('DECISIONS.md'), 'utf8');
  const ids = (log.match(/^## SF-(\d{3}) /gm) || []).map(m => Number(m.slice(6, 9)));
  checkTrue('SF- entries run in order from 001 with no gap', ids.length > 0 && ids.every((n, i) => n === i + 1), ids.join(','));
  const referenced = new Set();
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'data') walk(p); } else if (/\.(js|html|css|md)$/.test(e.name) && e.name !== 'DECISIONS.md') (fs.readFileSync(p, 'utf8').match(/\bSF-(\d{3})\b/g) || []).forEach(m => referenced.add(Number(m.slice(3)))); }); }
  walk(APP);
  const dangling = Array.from(referenced).filter(n => ids.indexOf(n) === -1);
  checkTrue('every SF- number a file cites is in the log', dangling.length === 0, dangling.join(','));
  checkTrue('STATUS.md exists and is short', fs.existsSync(A('STATUS.md')) && fs.readFileSync(A('STATUS.md'), 'utf8').split('\n').length < 40);
  checkTrue('README.md names every page', PAGES.concat(['index', 'services', 'about', 'resources', 'book', 'for-dommes']).every(p => fs.readFileSync(A('README.md'), 'utf8').indexOf(p + '.html') !== -1));
}

delete global.localStorage;
console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) { failures.forEach(f => console.log('  FAIL ' + f)); process.exit(1); }
