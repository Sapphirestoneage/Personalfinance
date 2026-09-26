#!/usr/bin/env node
/* ==========================================================================
   offers/test/run.js, the Offer Builder's own tests. OD-001 onward.
   --------------------------------------------------------------------------
   Dependency-free, like coach/test/run.js: node only, a fake localStorage.
   Also run in CI beside the SPARKS suite.

     node offers/test/run.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
const ROOT = path.join(HERE, '..');
const F = (f) => path.join(HERE, f);

let passed = 0;
const failures = [];
function check(name, actual, expected) { if (actual === expected) { passed++; return; } failures.push(name + '\n      expected: ' + JSON.stringify(expected) + '\n      actual:   ' + JSON.stringify(actual)); }
function checkTrue(name, ok, detail) { if (ok) { passed++; return; } failures.push(name + (detail ? '\n      ' + detail : '')); }
function section(t) { console.log('\n' + t); }

function fakeStorage(seed) {
  const store = Object.assign({}, seed || {});
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] === undefined ? null : Object.keys(store)[i], get length() { return Object.keys(store).length; }, store };
}
function fresh(seed) {
  delete require.cache[require.resolve(F('shared/store.js'))];
  const s = fakeStorage(seed);
  global.localStorage = s;
  return { s, Store: require(F('shared/store.js')) };
}

const T = JSON.parse(fs.readFileSync(F('data/levels.json'), 'utf8'));
const DEMO = JSON.parse(fs.readFileSync(F('data/demo.json'), 'utf8'));
const Money = require(F('shared/money.js'));
const Offer = require(F('engines/offer.js'));
const Charts = require(F('shared/charts.js'));
Offer.use(T);
const EMPTY = {};
const A = DEMO.answers, C = DEMO.confirmed;

/* ======================================================================
   A separate app: its own copies, its own keys, nothing reached outside
   ====================================================================== */
section('A separate app (OD-001)');
{
  const V = require(F('tools/vendor.js'));
  const drift = V.FILES.filter(f => !fs.existsSync(path.join(ROOT, f)) || !fs.existsSync(F(f)) || Buffer.compare(fs.readFileSync(path.join(ROOT, f)), fs.readFileSync(F(f))) !== 0);
  checkTrue('every vendored copy is byte-identical to SPARKS (' + V.FILES.length + ' files; run node offers/tools/vendor.js)', drift.length === 0, drift.join(', '));
  checkTrue('nothing of the household is carried', ['shared/spine-v2.js', 'shared/ownership.js', 'shared/schema.js', 'shared/solar.js'].every(f => !fs.existsSync(F(f))));
  const outside = [], slafKeys = [], dashes = [], na = [];
  const files = [];
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'test' && e.name !== 'tools') walk(p); } else if (/\.(js|html|css|json|md)$/.test(e.name)) files.push(p); }); }
  walk(HERE);
  files.forEach(p => {
    const t = fs.readFileSync(p, 'utf8'), rel = path.relative(ROOT, p);
    if (/\.(js|html|css)$/.test(p)) {
      (t.match(/require\('([^']+)'\)/g) || []).forEach(r => { const m = r.slice(9, -2); if (m[0] === '.' && path.resolve(path.dirname(p), m).indexOf(HERE) !== 0) outside.push(rel + ' -> ' + m); });
      (t.match(/(?:src|href)="([^"#?]+)"/g) || []).forEach(r => { const m = r.replace(/^(src|href)="/, '').replace(/"$/, ''); if (!/^(https?:|mailto:)/.test(m) && /\.(js|css|svg|html|woff2)$/.test(m) && path.resolve(path.dirname(p), m).indexOf(HERE) !== 0) outside.push(rel + ' -> ' + m); });
      if (/slaf\.[a-z]+\.v\d/.test(t)) slafKeys.push(rel);
    }
    /* The decision heading keeps the SPARKS log's own form (## OD-001 — title); every other line is copy. */
    if (!/theme\.css$|money\.js$/.test(p) && t.replace(/^## OD-\d{3} — .*$/gm, '').indexOf('—') >= 0) dashes.push(rel);
    if (/\bN\/A\b/.test(t)) na.push(rel);
  });
  checkTrue('every require and src stays inside offers/', outside.length === 0, outside.join(', '));
  checkTrue('no offers file names a slaf.* storage key', slafKeys.length === 0, slafKeys.join(', '));
  checkTrue('no em dash in any offers file (the vendored copies aside)', dashes.length === 0, dashes.join(', '));
  checkTrue('no N/A anywhere', na.length === 0, na.join(', '));
  ['index.html', 'planet.html', 'offer.html'].forEach(page => {
    const html = fs.readFileSync(F(page), 'utf8');
    checkTrue(`offers/${page} opts into the theme with <body class="slaf">`, /<body class="slaf">/.test(html));
    checkTrue(`offers/${page} carries the content security policy`, /Content-Security-Policy/.test(html));
    checkTrue(`offers/${page} loads app.js after the engine and the charts`, html.indexOf('engines/offer.js') < html.indexOf('app.js') && html.indexOf('shared/charts.js') < html.indexOf('app.js'));
    checkTrue(`offers/${page} declares its live-form policy or has no typed boxes`, /LIVE-FORM|WRITES  nothing/.test(html));
  });
  checkTrue('the storage keys are offers.*', /^offers\./.test(require(F('shared/store.js')).KEY) && /^offers\./.test(require(F('shared/store.js')).PREFS));
  const Registry = require(path.join(ROOT, 'shared/registry.js'));
  checkTrue('no SPARKS registry entry points into offers/', Registry.all().every(r => r.href.indexOf('offers/') !== 0));
}

/* ======================================================================
   The levels table
   ====================================================================== */
section('The levels table');
{
  const KINDS = ['text', 'long', 'money', 'number', 'pct', 'score', 'choice', 'multi', 'check', 'list', 'date', 'confirm'];
  check('six planets', T.planets.length, 6);
  check('four bands', T.bands.length, 4);
  check('four rings', T.rings.length, 4);
  check('fifty levels', T.levels.length, 50);
  const ids = T.levels.map(l => l.id);
  check('level ids are unique', new Set(ids).size, ids.length);
  T.planets.forEach(p => {
    T.bands.forEach(b => checkTrue(`${p.id} has a level in band ${b.n}`, T.levels.some(l => l.planet === p.id && l.band === b.n)));
    checkTrue(`${p.id} says what the book says, without a dash, under 110 words`, p.what.length > 100 && p.what.split(/\s+/).length <= 110);
    const mine = T.levels.filter(l => l.planet === p.id).map(l => l.level);
    check(`${p.id} numbers its levels 1..n`, mine.join(','), mine.map((_, i) => i + 1).join(','));
  });
  const keyOwner = {};
  T.levels.forEach(l => {
    checkTrue(`${l.id}: a known planet`, T.planets.some(p => p.id === l.planet));
    checkTrue(`${l.id}: band 1 to 4`, l.band >= 1 && l.band <= 4);
    checkTrue(`${l.id}: tag E, C or S`, ['E', 'C', 'S'].indexOf(l.tag) >= 0);
    checkTrue(`${l.id}: minutes above zero`, l.minutes > 0);
    checkTrue(`${l.id}: has a title, prompt, help, chapter and checkpoint`, ['title', 'prompt', 'help', 'chapter', 'checkpoint'].every(k => typeof l[k] === 'string' && l[k].length > 3));
    checkTrue(`${l.id}: the prompt is a question or an instruction under 40 words`, l.prompt.split(/\s+/).length <= 40);
    checkTrue(`${l.id}: no sentence of help over 45 words`, l.help.split(/[.!?]\s+/).every(s => s.split(/\s+/).length <= 45), l.help.slice(0, 60));
    checkTrue(`${l.id}: at least one field`, Array.isArray(l.fields) && l.fields.length >= 1);
    checkTrue(`${l.id}: the payoff names a reading that exists`, l.payoff && Offer.READINGS.indexOf(l.payoff.reading) >= 0, l.payoff && l.payoff.reading);
    checkTrue(`${l.id}: the payoff currency is reveal, certainty or power`, ['reveal', 'certainty', 'power'].indexOf(l.payoff.currency) >= 0);
    if (l.tag === 'C') check(`${l.id}: a confirm level has exactly one confirm field`, l.fields.filter(f => f.kind === 'confirm').length, 1);
    (l.reads || []).forEach(k => checkTrue(`${l.id} reads ${k}, which some level asks`, !!Offer.fieldByKey(k)));
    l.fields.forEach(f => {
      checkTrue(`${l.id}.${f.key}: a known kind`, KINDS.indexOf(f.kind) >= 0, f.kind);
      checkTrue(`${l.id}.${f.key}: a label`, typeof f.label === 'string' && f.label.length > 1);
      if (keyOwner[f.key] && keyOwner[f.key] !== l.id) checkTrue(`${f.key} is asked twice only where declared (problems, O3 and O4)`, f.key === 'problems');
      keyOwner[f.key] = keyOwner[f.key] || l.id;
      if (f.kind === 'choice' || f.kind === 'multi') checkTrue(`${l.id}.${f.key}: options with ids and labels`, Array.isArray(f.options) && f.options.length >= 2 && f.options.every(o => o.id && o.label));
      if (f.kind === 'check') checkTrue(`${l.id}.${f.key}: a checklist of three or more`, Array.isArray(f.items) && f.items.length >= 3 && f.items.every(o => o.id && o.label));
      if (f.kind === 'score') checkTrue(`${l.id}.${f.key}: a score has min and max`, f.min >= 1 && f.max > f.min);
      if (f.kind === 'list') checkTrue(`${l.id}.${f.key}: a list has columns and a minimum`, Array.isArray(f.cols) && f.cols.length >= 1 && f.minRows >= 1 && f.cols.every(c => c.key && c.kind && c.label));
      if (f.appliesWhen) checkTrue(`${l.id}.${f.key}: appliesWhen names a field in the same level`, l.fields.some(x => x.key === f.appliesWhen.key));
      if (f.suggest) checkTrue(`${l.id}.${f.key}: the suggestion runs`, typeof Offer.suggest(f.suggest, A) === 'string');
      if (f.kind === 'confirm') checkTrue(`${l.id}.${f.key}: the confirm names a reading`, Offer.READINGS.indexOf(f.reading) >= 0);
    });
  });
  checkTrue('the terms are defined, each in one or two sentences', T.terms.length >= 12 && T.terms.every(t => t.term && t.says && t.says.split(/[.!?]\s+/).length <= 3));
  checkTrue('the source is named', T.source.title === '$100M Offers' && T.source.author === 'Alex Hormozi');
  /* The book's exercises are all here, by their signature fields. */
  ['painScore', 'nicheLadder', 'nicheChosen', 'cycleSigns', 'outcomeWorth', 'priceNew', 'dreamNow', 'dreamOutcome', 'brickUses', 'problems', 'vehicles', 'stack', 'scarcityKind', 'urgencyKind', 'bonuses', 'guaranteeKind', 'magicContainer', 'wrapperRotations']
    .forEach(k => checkTrue(`the exercise behind ${k} is a level`, !!Offer.fieldByKey(k)));
  const checklists = T.levels.filter(l => l.fields.some(f => f.kind === 'check'));
  checkTrue('every planet carries at least one checklist', T.planets.every(p => checklists.some(l => l.planet === p.id)));
}

/* ======================================================================
   Progress: states, planets, rings, next
   ====================================================================== */
section('Progress');
{
  const g0 = Offer.grid(EMPTY, {});
  checkTrue('an empty offer: every level is not yet', g0.every(p => p.levels.every(x => x.state === 'notYet')));
  check('an empty offer: no ring', Offer.ringsCleared(EMPTY, {}), 0);
  const n0 = Offer.next(EMPTY, {});
  check('an empty offer: the next level is Crowd 1', n0.level.id, 'C1');
  checkTrue('and the reason says band 1 first', /Band 1/.test(n0.why));
  const o0 = Offer.overall(EMPTY, {});
  check('fifty applicable levels when nothing is gated off', o0.of, 50);
  check('the next ring named is ring 1', o0.nextRing.n, 1);

  const half = { painScore: 4, payScore: 3 };
  check('two of four scores is part', Offer.levelState(Offer.byId('C3'), half, {}).state, 'part');
  check('a ticked box on a checklist is part', Offer.levelState(Offer.byId('C8'), { crowdProof: { talked: true } }, {}).state, 'part');
  check('a checklist with every box is done', Offer.levelState(Offer.byId('C8'), { crowdProof: { talked: true, spend: true, growing: true, words: true } }, {}).state, 'done');
  check('a list short of its minimum is part', Offer.levelState(Offer.byId('C4'), { painQuotes: [{ quote: 'a' }, { quote: 'b' }] }, {}).state, 'part');
  check('a list at its minimum is done', Offer.levelState(Offer.byId('C4'), { painQuotes: [{ quote: 'a' }, { quote: 'b' }, { quote: 'c' }] }, {}).state, 'done');
  check('a confirm level is not done by answers alone', Offer.levelState(Offer.byId('O6'), A, {}).state, 'notYet');
  check('a confirm level is done once confirmed', Offer.levelState(Offer.byId('O6'), A, { O6: 'x' }).state, 'done');
  check('E3 with no scarcity asks two fields, not three (the count is gated off)', Offer.levelState(Offer.byId('E3'), { scarcityKind: 'none' }, {}).of, 2);
  check('E3 with seats asks all three', Offer.levelState(Offer.byId('E3'), { scarcityKind: 'seats' }, {}).of, 3);
  check('N1 with no name is done with the one answer', Offer.levelState(Offer.byId('N1'), { hasName: 'no' }, {}).state, 'done');
  check('E7 asks the condition only for a conditional or stacked guarantee', Offer.levelState(Offer.byId('E7'), { guaranteeKind: 'unconditional' }, {}).of, 2);
  check('the problems list counts as O3 done with problem and driver only', Offer.levelState(Offer.byId('O3'), { problems: A.problems.map(r => ({ problem: r.problem, driver: r.driver })) }, {}).state, 'done');
  check('but O4 needs the solution column', Offer.levelState(Offer.byId('O4'), { problems: A.problems.map(r => ({ problem: r.problem, driver: r.driver })) }, {}).state, 'part');

  const gd = Offer.grid(A, C);
  check('the example clears three rings', Offer.ringsCleared(A, C), 3);
  checkTrue('every planet is working on band 4 in the example', gd.every(p => p.band === 4), gd.map(p => p.id + ':' + p.band).join(','));
  const nd = Offer.next(A, C);
  check('the next level in the example is in band 4', nd.level.band, 4);
  checkTrue('a planet moves outward as it levels (pct rises with done)', gd.every(p => p.pct === p.done / p.of && p.pct > 0.6));
  const all = Object.assign({}, A, { crowdProof: { talked: true, spend: true, growing: true, words: true }, priceTests: A.priceTests, offerFeedback: A.offerFeedback.concat([{ who: 'x', said: 'y', changed: 'z' }]),
    guaranteeTests: [{ who: 'a', reaction: 'closed' }, { who: 'b', reaction: 'helped' }], launchChecks: { sheet: true, price: true, words: true, ten: true, tracked: true }, pitched: 12, closed: 5, cashCollected: 148500 });
  check('with the last levels answered and confirmed, four rings', Offer.ringsCleared(all, { O6: 'x', P8: 'x', V8: 'x' }), 4);
  check('and nothing is next', Offer.next(all, { O6: 'x', P8: 'x', V8: 'x' }), null);
}

/* ======================================================================
   The formulas
   ====================================================================== */
section('The formulas');
{
  check('value score 8, 8 over 2, 2 is 16', Offer.valueScore(8, 8, 2, 2).value, 16);
  check('value score with a missing part is incomplete', Offer.valueScore(8, null, 2, 2).status, 'incomplete');
  check('and names what is missing', Offer.valueScore(8, null, 2, 2).missing.join(','), 'likelihood');
  check('margin $297 on $99 cost is about 67%', Math.round(Offer.margin(29700, 9900).value * 100), 67);
  check('margin with no cost is incomplete, never zero', Offer.margin(29700, null).status, 'incomplete');
  check('margin at a zero price is incomplete', Offer.margin(0, 100).status, 'incomplete');
  check('$120,000 a year at $297 a month needs 34 clients', Offer.clientsNeeded(12000000, 29700, 'month').value, 34);
  check('the same goal at $2,000 one time needs 60', Offer.clientsNeeded(12000000, 200000, 'once').value, 60);
  check('clients needed with no period is incomplete', Offer.clientsNeeded(12000000, 29700, null).status, 'incomplete');
  check('a multiple', Offer.multiple(480000, 29700).value.toFixed(2), '16.16');
  check('a rate of 2 in 3', Offer.rate(2, 3).value.toFixed(3), '0.667');
  check('rate over zero is incomplete', Offer.rate(0, 0).status, 'incomplete');
  check('high value low cost is keep', Offer.trimClass({ value: 'high', cost: 'low' }), 'keep');
  check('high value high cost is keep some', Offer.trimClass({ value: 'high', cost: 'high' }), 'keepSome');
  check('low value is cut whatever it costs', Offer.trimClass({ value: 'low', cost: 'low' }) + Offer.trimClass({ value: 'low', cost: 'high' }), 'cutcut');
  check('days between', Offer.daysBetween('2026-09-26', '2026-11-02'), 37);
  const p = Offer.magicParts('The 6 Week New Dad Carry Anything Challenge', A);
  check('MAGIC parts spotted in the example name', p.count, 4);
  check('a bare name carries none', Offer.magicParts('Strength Coaching', A).count, 0);
  const names = Offer.magicNames({ reason: 'First Year', avatar: 'New Dad', goal: 'Carry Anything', interval: '6 Week', container: 'Challenge' });
  check('three names', names.length, 3);
  check('the first name', names[0], 'The 6 Week Carry Anything Challenge');
  checkTrue('every name carries the container word', names.every(x => /Challenge/.test(x)));
}

/* ======================================================================
   The readings
   ====================================================================== */
section('The readings');
{
  Offer.READINGS.forEach(id => {
    let r0, rd;
    try { r0 = Offer.reading(id, EMPTY, { today: '2026-09-26' }); } catch (e) { r0 = { status: 'threw', reason: e.message }; }
    try { rd = Offer.reading(id, A, { today: '2026-09-26' }); } catch (e) { rd = { status: 'threw', reason: e.message }; }
    checkTrue(`${id} on an empty offer is incomplete with a reason, never a number`, r0.status === 'incomplete' && typeof r0.reason === 'string' && r0.reason.length > 2, r0.status + ' ' + r0.reason);
    checkTrue(`${id} on the example returns ok or incomplete, never throws`, rd.status === 'ok' || rd.status === 'incomplete', rd.reason);
    if (rd.status === 'ok') {
      checkTrue(`${id} says something, without a dash`, typeof rd.say === 'string' && rd.say.length > 5 && rd.say.indexOf('—') === -1, rd.say);
      if (rd.chart) {
        checkTrue(`${id}'s chart has a table twin`, rd.chart.table && rd.chart.table.cols.length > 0 && rd.chart.table.rows.length > 0);
        const svg = Charts.render(rd.chart);
        checkTrue(`${id}'s chart renders as SVG`, /^<svg/.test(svg) && /<\/svg>$/.test(svg) && svg.length > 200, rd.chart.kind);
        checkTrue(`${id}'s chart is labelled for a screen reader`, /aria-label="[^"]+"/.test(svg));
        checkTrue(`${id}'s chart table renders`, /^<table/.test(Charts.table(rd.chart)));
      }
    }
  });
  const used = {};
  Offer.READINGS.forEach(id => { const r = Offer.reading(id, A, { today: '2026-09-26' }); if (r.chart) used[r.chart.kind] = true; });
  Charts.KINDS.filter(k => k !== 'sky').forEach(k => checkTrue(`chart kind ${k} is used by some reading in the example`, !!used[k]));
  const sky = Charts.render({ kind: 'sky', planets: Offer.grid(A, C), rings: 4, ringsCleared: 3, sunOn: true });
  checkTrue('the sky draws six planets with links', (sky.match(/planet\.html\?p=/g) || []).length === 6);
  checkTrue('every level in the example pays with its reading or says why not', T.levels.every(l => { const r = Offer.reading(l.payoff.reading, A, { today: '2026-09-26' }); return r.status === 'ok' || typeof r.reason === 'string'; }));

  const v = Offer.reading('valueNow', A);
  check('the example value score before', (Math.round(v.value * 100) / 100), 0.57);
  const vc = Offer.reading('valueChange', A);
  check('and after', (Math.round(vc.value * 100) / 100), 7.11);
  checkTrue('the change says it went up', /went from 0.6 to 7.1/.test(vc.say), vc.say);
  const ms = Offer.reading('marketScore', A);
  check('the market score adds the four signs', ms.value, 15);
  checkTrue('and names the weakest', /easy to target/.test(ms.say));
  const cn = Offer.reading('clientsNeeded', A);
  check('clients needed at the new price in the example', cn.value, 34);
  checkTrue('and the old price is on the same card', /instead of 102/.test(cn.say), cn.say);
  const ts = Offer.reading('trimStack', A);
  check('the example trim keeps four outright', ts.groups.keep.length, 4);
  check('keeps two if affordable', ts.groups.keepSome.length, 2);
  check('cuts two', ts.groups.cut.length, 2);
  const sv = Offer.reading('stackVsPrice', A);
  check('the stack total is the sum of the pieces', sv.value, 29700 + 15000 + 19700 + 4900 + 3900);
  checkTrue('and is read against the new price', /2\.5x the price of \$297/.test(sv.say), sv.say);
  const mn = Offer.reading('marginNew', A);
  checkTrue('the new margin uses the stack costs when they exist', /using the costs you put on the stack/.test(mn.say));
  check('the new margin', Math.round(mn.value * 100), Math.round((29700 - 10500) / 29700 * 100));
  const ec = Offer.reading('enhancerCoverage', A);
  check('the enhancers count what is written on the planet, not just the tick', ec.value, 4);
  const ur = Offer.reading('urgencyLine', A, { today: '2026-09-26' });
  check('urgency counts the days', ur.value, 37);
  const nn = Offer.reading('nameNowRead', A);
  check('the old name carries no MAGIC', nn.value, 0);
  const one = Offer.suggest('oneLineSuggestion', A);
  checkTrue('the one line suggestion is built from the planets', /New fathers/.test(one) && /6 weeks/.test(one) && /without finding an hour/i.test(one), one);
  check('the suggestion on an empty offer is empty, not a template', Offer.suggest('oneLineSuggestion', EMPTY), '');
  check('the interval suggestion says weeks', Offer.suggest('intervalShort', A), '6 Week');
  const gapN = Offer.reading('valueGapNew', A);
  checkTrue('the gap at the new price is a Grand Slam one', gapN.value > 10 && /Grand Slam/.test(gapN.say));
  const cy = Offer.reading('cycle', A);
  check('the example rides the downward loop', cy.value, 'down');
  const res = Offer.reading('results', Object.assign({}, A, { pitched: 12, closed: 5, cashCollected: 148500 }));
  checkTrue('results read close rate and cash per pitch', /5 of 12/.test(res.say) && /\$124 for every pitch/.test(res.say), res.say);
  check('the commodity read on a full commodity', Offer.reading('commodity', { commodityNow: 'price' }).value, 0);
}

/* ======================================================================
   The store: empty is not zero, keys of its own
   ====================================================================== */
section('The store');
{
  const { s, Store } = fresh();
  check('a missing answer reads null', Store.get('priceNow'), null);
  Store.set('priceNow', 9900);
  check('a number is kept', Store.get('priceNow'), 9900);
  Store.set('priceNow', '');
  check('an empty string clears it', Store.get('priceNow'), null);
  Store.set('priceNow', 0);
  check('a typed zero is kept as zero', Store.get('priceNow'), 0);
  Store.set('painQuotes', []);
  check('an empty list is nothing', Store.get('painQuotes'), null);
  Store.set('crowdProof', {});
  check('an empty checklist is nothing', Store.get('crowdProof'), null);
  checkTrue('only offers.* keys are written', Object.keys(s.store).every(k => /^offers\./.test(k)), Object.keys(s.store).join(','));
  Store.confirm('O6');
  checkTrue('a confirmation is dated', /^\d{4}-/.test(Store.confirmed().O6));
  Store.unconfirm('O6');
  check('and can be taken back', Store.confirmed().O6, undefined);
  Store.loadDemo(DEMO);
  check('the example loads', Store.get('nicheChosen'), A.nicheChosen);
  checkTrue('and is marked as example numbers', Store.isDemo());
  const json = Store.exportJson();
  Store.reset();
  check('reset clears', Store.get('nicheChosen'), null);
  checkTrue('and clears the example mark', !Store.isDemo());
  Store.importJson(json);
  check('import brings it back', Store.get('nicheChosen'), A.nicheChosen);
  let threw = null; try { Store.importJson('{"app":"other"}'); } catch (e) { threw = e.message; }
  checkTrue('a foreign file is refused with words', typeof threw === 'string');
  let calls = 0; Store.onChange(() => { calls++; });
  Store.set('offerNow', 'x'); Store.setMany({ marketWho: 'y', marketCore: '' });
  check('listeners hear every write', calls, 2);
  check('setMany clears a blank', Store.get('marketCore'), null);
  Store.pref('tab', 'grid');
  check('a preference round-trips', Store.pref('tab'), 'grid');
  delete global.localStorage;
}

/* ======================================================================
   The example carries no real data
   ====================================================================== */
section('The example');
{
  checkTrue('the example says it is made up', /made-up|invented/i.test(DEMO.note));
  const MONEY = ['price', 'priceNow', 'priceNew', 'costNow', 'outcomeWorth', 'revenueGoal', 'cashCollected', 'valueCents', 'costCents'];
  const badMoney = [];
  (function walk(o, at) { if (Array.isArray(o)) o.forEach((x, i) => walk(x, at + '[' + i + ']')); else if (o && typeof o === 'object') Object.keys(o).forEach(k => { const v = o[k]; if (MONEY.indexOf(k) >= 0 && typeof v !== 'boolean' && !Number.isInteger(v)) badMoney.push(at + '.' + k); walk(v, at + '.' + k); }); })(A, 'answers');
  checkTrue('every money figure in the example is integer cents', badMoney.length === 0, badMoney.join(','));
  checkTrue('every example key is a field some level asks', Object.keys(A).every(k => !!Offer.fieldByKey(k)), Object.keys(A).filter(k => !Offer.fieldByKey(k)).join(','));
}

console.log('\n' + passed + ' passed' + (failures.length ? ', ' + failures.length + ' failed' : ''));
if (failures.length) { failures.forEach(f => console.log('  FAIL ' + f)); process.exit(1); }
