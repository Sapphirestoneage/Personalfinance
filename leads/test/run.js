#!/usr/bin/env node
/* ==========================================================================
   leads/test/run.js, the Leads Ladder's own tests. LD-001 onward.
   --------------------------------------------------------------------------
   Dependency-free, node only, a fake localStorage. Run in CI beside the
   SPARKS, D&D and coach suites.

     node leads/test/run.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
const ROOT = path.join(HERE, '..');
const L = (f) => path.join(HERE, f);

let passed = 0;
const failures = [];
function check(name, actual, expected) { if (actual === expected) { passed++; return; } failures.push(name + '\n      expected: ' + JSON.stringify(expected) + '\n      actual:   ' + JSON.stringify(actual)); }
function checkTrue(name, ok, detail) { if (ok) { passed++; return; } failures.push(name + (detail ? '\n      ' + detail : '')); }
function near(name, a, b, eps) { checkTrue(name + ' (' + a + ' vs ' + b + ')', Math.abs(a - b) <= (eps || 1e-6)); }
function section(t) { console.log('\n' + t); }

function fakeStorage(seed) {
  const store = Object.assign({}, seed || {});
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] === undefined ? null : Object.keys(store)[i], get length() { return Object.keys(store).length; }, store };
}
function fresh(seed) {
  ['shared/store.js'].forEach(m => { delete require.cache[require.resolve(L(m))]; });
  const s = fakeStorage(seed);
  global.localStorage = s;
  const T = require(L('shared/tables.js')).loadSync();
  const Ladder = require(L('engines/ladder.js'));
  Ladder.use(T.book);
  return { s, T, Ladder, Store: require(L('shared/store.js')), Machine: require(L('engines/machine.js')), Money: require(L('shared/money.js')), Charts: require(L('shared/charts.js')) };
}

/* ======================================================================
   A separate app: its own copies, its own keys, nothing reached outside
   ====================================================================== */
section('A separate app (LD-001)');
{
  const V = require(L('tools/vendor.js'));
  const drift = V.FILES.filter(p => !fs.existsSync(path.join(ROOT, p[0])) || !fs.existsSync(L(p[1])) || Buffer.compare(fs.readFileSync(path.join(ROOT, p[0])), fs.readFileSync(L(p[1]))) !== 0);
  checkTrue('every vendored copy is byte-identical to its source (' + V.FILES.length + ' files; run node leads/tools/vendor.js)', drift.length === 0, drift.map(p => p[1]).join(', '));
  checkTrue('no SPARKS engine, spine, schema or ownership is carried', ['engines/tier0.js', 'shared/spine-v2.js', 'shared/schema.js', 'shared/ownership.js'].every(f => !fs.existsSync(L(f))));
  const outside = [];
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'test' && e.name !== 'tools') walk(p); } else if (/\.(js|html|css)$/.test(e.name)) {
    const t = fs.readFileSync(p, 'utf8');
    (t.match(/require\('([^']+)'\)/g) || []).forEach(r => { const rel = r.slice(9, -2); if (rel[0] === '.' && path.resolve(path.dirname(p), rel).indexOf(HERE) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
    (t.match(/(?:src|href)="([^"#?]+)"/g) || []).forEach(r => { const rel = r.replace(/^(src|href)="/, '').replace(/"$/, ''); if (!/^(https?:|mailto:)/.test(rel) && /\.(js|css|svg|html|woff2)$/.test(rel) && path.resolve(path.dirname(p), rel).indexOf(HERE) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
  } }); }
  walk(HERE);
  checkTrue('every require, src and href of every ladder file resolves inside leads/', outside.length === 0, outside.join(', '));
  ['index.html', 'machine.html'].forEach(f => {
    const html = fs.readFileSync(L(f), 'utf8');
    checkTrue(f + ' opts into the theme with <body class="slaf">', /<body class="slaf">/.test(html));
    checkTrue(f + ' carries the content security policy', /Content-Security-Policy/.test(html) && /default-src 'self'/.test(html));
    checkTrue(f + ' says LIVE-FORM: built once', /LIVE-FORM: built once/.test(html));
    checkTrue(f + ' offers the example numbers', /Try with example numbers/.test(html));
  });
  const src = fs.readFileSync(L('shared/store.js'), 'utf8') + fs.readFileSync(L('sky.js'), 'utf8') + fs.readFileSync(L('machine.js'), 'utf8') + fs.readFileSync(L('common.js'), 'utf8');
  checkTrue('no ladder file names a slaf., coach. or dnd. storage key', !/['"](slaf|coach|dnd)\.[a-zA-Z]/.test(src));
  const Registry = require(path.join(ROOT, 'shared/registry.js'));
  checkTrue('no SPARKS registry entry points into leads/', Registry.all().every(r => r.href.indexOf('leads/') !== 0));
}

/* ======================================================================
   The book as data
   ====================================================================== */
section('The book as data: every level has a payoff and a way to finish (LD-002)');
{
  const { T, Ladder } = fresh();
  const B = T.book;
  ['id', 'version', 'asOf', 'source', 'confidence', 'confidenceNote'].forEach(k => checkTrue('book.json carries ' + k, typeof B[k] === 'string' && B[k].length > 0));
  check('five bands', B.bands.length, 5);
  check('nine bodies', B.planets.length, 9);
  check('one sun', B.planets.filter(p => p.sun).length, 1);
  check('four core four planets', B.planets.filter(p => !p.sun && !p.getter).length, 4);
  check('four lead getters', B.planets.filter(p => p.getter).length, 4);
  check('the order names every body once', B.order.slice().sort().join(','), B.planets.map(p => p.id).sort().join(','));
  const ids = new Set();
  const KINDS = ['text', 'long', 'number', 'choice', 'multi'];
  B.levels.forEach(lv => {
    checkTrue(lv.id + ' is unique', !ids.has(lv.id)); ids.add(lv.id);
    checkTrue(lv.id + ' names a planet', !!Ladder.planetById(lv.planet));
    checkTrue(lv.id + ' sits in a band 1 to 5', lv.band >= 1 && lv.band <= 5);
    checkTrue(lv.id + ' has a title, what the book says, a checkpoint, a chapter and minutes', !!lv.title && !!lv.says && !!lv.checkpoint && !!lv.chapter && lv.minutes > 0);
    const ways = (lv.fields ? lv.fields.filter(f => !f.optional).length : 0) + (lv.checklist ? lv.checklist.length : 0) + (lv.confirm ? 1 : 0) + (lv.needs ? lv.needs.length : 0);
    checkTrue(lv.id + ' can be finished: it collects at least one thing', ways > 0);
    (lv.fields || []).forEach(f => {
      checkTrue(lv.id + '.' + f.key + ' has a known kind', KINDS.indexOf(f.type) !== -1);
      if (f.type === 'choice' || f.type === 'multi') checkTrue(lv.id + '.' + f.key + ' has options', Array.isArray(f.options) && f.options.length >= 2);
      if (f.type === 'number') checkTrue(lv.id + '.' + f.key + ' names a unit', ['count', 'dollars', 'rate', 'minutes'].indexOf(f.unit) !== -1);
    });
    (lv.needs || []).forEach(k => checkTrue(lv.id + ' needs a real Machine input: ' + k, fresh().Machine.INPUTS.some(i => i.key === k)));
    if (lv.reading) {
      const keys = lv.reading.keys || [lv.reading.of, lv.reading.over].filter(Boolean);
      if (lv.reading.over) keys.push(lv.reading.over);
      keys.forEach(k => checkTrue(lv.id + ' reading key ' + k + ' is one of its fields', lv.fields.some(f => f.key === k)));
      if (lv.reading.kind === 'sentence') (lv.reading.template.match(/\{(\w+)\}/g) || []).forEach(m => checkTrue(lv.id + ' template blank ' + m + ' is a field', lv.fields.some(f => f.key === m.slice(1, -1))));
    }
    if (lv.log) checkTrue(lv.id + ' logs to a core four planet', ['warm', 'content', 'cold', 'paid'].indexOf(lv.log) !== -1);
  });
  B.planets.forEach(p => {
    B.bands.forEach(b => checkTrue(p.id + ' has a level in band ' + b.n + ' (' + b.name + ')', B.levels.some(l => l.planet === p.id && l.band === b.n)));
    checkTrue(p.id + ' names its chapter, hue and blurb', /Chapter/.test(p.chapter) && !!p.hue && !!p.blurb);
    if (p.appliesWhen !== 'always') checkTrue(p.id + ' says what would light it', typeof p.dimMessage === 'string' && p.dimMessage.length > 20);
  });
  /* Every chapter of the book is covered somewhere. */
  const chapters = new Set(); B.levels.forEach(l => { const m = /Chapter (\d+)/.exec(l.chapter); if (m) chapters.add(+m[1]); }); [B.start.chapter].forEach(c => (c.match(/\d+/g) || []).forEach(n => chapters.add(+n)));
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(n => checkTrue('chapter ' + n + ' is covered', chapters.has(n)));
  checkTrue('the lead magnet has its seven steps', ['step 2', 'step 3', 'step 4', 'step 5', 'step 6', 'step 7'].every(s => B.levels.some(l => l.planet === 'magnet' && l.chapter.indexOf(s) !== -1)));
  checkTrue('warm outreach carries the book\'s numbered steps', ['step 1', 'step 2', 'step 3', 'step 6', 'step 9'].every(s => B.levels.some(l => l.planet === 'warm' && l.chapter.indexOf(s) !== -1)));
  checkTrue('every core four planet has a daily-hundred level that logs', ['warm', 'content', 'cold', 'paid'].every(p => B.levels.some(l => l.planet === p && l.log === p)));
  checkTrue('every planet ends with more, better, new', B.planets.every(p => B.levels.some(l => l.planet === p.id && l.band === 5)));
  checkTrue('the words explain the core four, the rule of 100, and both money checks', ['Core four', 'Rule of 100', 'Three to one', 'Thirty-day check', 'Engaged lead'].every(w => B.words.some(x => x[0] === w)));
  const copy = JSON.stringify(B);
  ['N/A', 'incomplete', 'TODO', 'lorem'].forEach(w => checkTrue('no "' + w + '" in the copy', copy.indexOf(w) === -1));
  checkTrue('Start Here has the seven answers', B.start.fields.length === 7 && ['sells', 'serves', 'customers', 'budget', 'team', 'goal', 'first'].every(k => B.start.fields.some(f => f.key === k)));
}

/* ======================================================================
   The ladder
   ====================================================================== */
section('The ladder: states, gates, rings, the next three (LD-002)');
{
  const { Ladder } = fresh();
  const empty = { start: {}, levels: {}, kpis: {} };
  let o = Ladder.overall(empty);
  check('nothing answered: nothing done', o.done, 0);
  check('nothing answered: no ring', o.rings, 0);
  check('nothing answered: only the always-on bodies apply (sun, core four minus ads)', o.applying, 4);
  check('the sun is dark', o.lit, 0);
  const lit = { start: { budget: 'some', customers: 'some', team: 'team' }, levels: {}, kpis: {} };
  check('budget, customers and a team light every planet', Ladder.overall(lit).applying, 9);
  check('a dim planet says why', Ladder.applies('paid', empty).why.length > 20, true);
  checkTrue('a dim planet is never hidden from the grid', Ladder.grid(empty).some(p => p.id === 'paid'));

  /* A level's state: empty is not zero; a typed zero counts. */
  const lv = Ladder.byId('warm-3');
  check('a fresh level is notYet', Ladder.levelState(lv, empty).state, 'notYet');
  check('one of three counts is part', Ladder.levelState(lv, { levels: { 'warm-3': { values: { phone: 420 } } } }).state, 'part');
  check('a typed zero is an answer', Ladder.levelState(lv, { levels: { 'warm-3': { values: { phone: 0, email: 0, social: 0 } } } }).state, 'done');
  check('an empty string is not an answer', Ladder.levelState(lv, { levels: { 'warm-3': { values: { phone: 1, email: '', social: 2 } } } }).state, 'part');
  check('a checklist level is done when every box is ticked', Ladder.levelState('magnet-5', { levels: { 'magnet-5': { ticks: [true, true, true, true, true] } } }).state, 'done');
  check('one box short is part', Ladder.levelState('magnet-5', { levels: { 'magnet-5': { ticks: [true, true, true, true, false] } } }).state, 'part');
  check('a got-it level is done when pressed', Ladder.levelState('warm-1', { levels: { 'warm-1': { confirmed: true } } }).state, 'done');
  check('a level that reads the Machine is done when the Machine holds every number', Ladder.levelState('paid-8', { kpis: { firstPurchaseCents: 30000, monthlyCents: 0, monthsKept: 6, marginRate: 0.7 } }).state, 'done');
  check('a Machine zero counts', Ladder.levelState('paid-8', { kpis: { firstPurchaseCents: 30000, monthlyCents: 0, monthsKept: 6, marginRate: 0.7 } }).missing.length, 0);
  check('a Machine blank does not', Ladder.levelState('paid-8', { kpis: { firstPurchaseCents: 30000, monthsKept: 6, marginRate: 0.7 } }).state, 'part');
  check('later never counts as done', Ladder.levelState('warm-1', { levels: { 'warm-1': { later: true } } }).state, 'notYet');
  check('later is listed', Ladder.later({ levels: { 'warm-1': { later: true } } }).length, 1);
  check('a multi with one pick is answered', Ladder.entered(['email']), true);
  check('a multi with none is not', Ladder.entered([]), false);

  /* The planet rides the band it is working on. */
  const st = { start: { first: 'warm' }, levels: {}, kpis: {} };
  Ladder.forPlanet('warm').filter(l => l.band <= 2).forEach(l => { st.levels[l.id] = { confirmed: true, values: {}, ticks: [] }; (l.fields || []).forEach(f => { st.levels[l.id].values[f.key] = f.type === 'number' ? 1 : f.type === 'multi' ? ['x'] : 'x'; }); (l.checklist || []).forEach((c, i) => { st.levels[l.id].ticks[i] = true; }); });
  const warm = Ladder.planet('warm', st);
  check('warm with Learn and Sketch done sits on band 3', warm.band, 3);
  check('its first two bands are clear', warm.bands[0].clear && warm.bands[1].clear, true);
  check('its done count is five', warm.done, 5);
  check('no ring is cleared while the other planets sit on Learn', Ladder.overall(st).rings, 0);
  /* Clearing band 1 everywhere clears the first ring, dim planets excepted. */
  const ring = { start: {}, levels: {}, kpis: {} };
  Ladder.levels().filter(l => l.band === 1).forEach(l => { ring.levels[l.id] = { confirmed: true, values: {}, ticks: [] }; (l.fields || []).forEach(f => { ring.levels[l.id].values[f.key] = f.type === 'number' ? 1 : f.type === 'multi' ? ['x'] : 'x'; }); });
  check('every Learn level done clears ring 1', Ladder.overall(ring).rings, 1);
  ring.levels['paid-1'] = { confirmed: false };
  check('a dim planet does not hold a ring up (rule 6)', Ladder.overall(ring).rings, 1);
  ring.start.budget = 'some';
  check('but it does once it applies', Ladder.overall(ring).rings, 0);

  /* The next three. */
  let nx = Ladder.next(empty);
  check('the first thing to do is the sun', nx.items[0].level.id, 'magnet-1');
  check('three are offered', nx.items.length, 3);
  check('nothing past Sketch is suggested at the start', nx.cap, 2);
  checkTrue('every suggestion is on a planet that applies', nx.items.every(i => i.planet.applies));
  const chosen = { start: { first: 'cold' }, levels: {}, kpis: {} };
  Ladder.forPlanet('magnet').forEach(l => { chosen.levels[l.id] = { values: {}, ticks: [] }; (l.fields || []).forEach(f => { chosen.levels[l.id].values[f.key] = f.type === 'number' ? 1 : f.type === 'multi' ? ['x'] : 'x'; }); (l.checklist || []).forEach((c, i) => { chosen.levels[l.id].ticks[i] = true; }); });
  nx = Ladder.next(chosen);
  check('with the sun built, the chosen first planet comes next', nx.items[0].planet.id, 'cold');
  Ladder.forPlanet('cold').filter(l => l.band <= 2).forEach(l => { chosen.levels[l.id] = { confirmed: true, values: {}, ticks: [] }; (l.fields || []).forEach(f => { chosen.levels[l.id].values[f.key] = f.type === 'number' ? 1 : f.type === 'multi' ? ['x'] : 'x'; }); });
  check('once the magnet and the first planet are drafted, every band opens', Ladder.next(chosen).cap, 5);
  const laterSt = { start: {}, levels: { 'magnet-1': { later: true } }, kpis: {} };
  check('a level marked later is not suggested', Ladder.next(laterSt).items[0].level.id, 'magnet-2');
}

/* ======================================================================
   The machine
   ====================================================================== */
section('The machine: the funnel, the costs, the checks, the levers (LD-003)');
{
  const { Machine, Money } = fresh();
  const k = { reachPerDay: 100, daysPerMonth: 22, replyRate: 0.05, bookRate: 0.4, showRate: 0.7, closeRate: 0.3, firstPurchaseCents: 30000, monthlyCents: 20000, monthsKept: 8, marginRate: 0.7, adSpendCents: 300000, laborCents: 0, customersNow: 12, churnRate: 0.08, referralRate: 0.1 };
  const f = Machine.funnel(k);
  check('the funnel is ok with every input', f.status, 'ok');
  near('reach a month', f.reach, 2200);
  near('engaged leads', f.engaged, 110);
  near('booked', f.booked, 44);
  near('shows', f.shows, 30.8);
  near('customers', f.customers, 9.24);
  check('five stages for the picture', f.stages.length, 5);
  const c = Machine.costs(k);
  check('cost per engaged lead is spend over engaged, in cents', c.perEngaged, Math.round(300000 / 110));
  check('cost per customer is spend over customers', c.perCustomer, Math.round(300000 / 9.24));
  const v = Machine.value(k);
  check('lifetime gross profit', v.lifetime, Math.round((30000 + 20000 * 8) * 0.7));
  check('first thirty days', v.first30, Math.round((30000 + 20000) * 0.7));
  const ch = Machine.checks(k);
  near('the ratio', ch.ratio, 133000 / Math.round(300000 / 9.24), 1e-9);
  check('three to one passes at four', ch.ratioOk, true);
  check('thirty days fails at 350 against 649', ch.paybackOk, false);
  checkTrue('the words say which one failed', /first month does not pay back/.test(ch.words));
  const both = Machine.checks(Object.assign({}, k, { firstPurchaseCents: 100000 }));
  check('a bigger up-front price passes both', both.ratioOk && both.paybackOk, true);
  const bad = Machine.checks(Object.assign({}, k, { closeRate: 0.05 }));
  check('a weak close rate fails the ratio', bad.ratioOk, false);

  /* Empty is not zero. */
  check('a blank input makes the funnel incomplete', Machine.funnel(Object.assign({}, k, { replyRate: null })).status, 'incomplete');
  check('and names what is missing', Machine.funnel(Object.assign({}, k, { replyRate: null })).missing.join(','), 'replyRate');
  check('a missing key too', Machine.funnel({}).missing.length, 6);
  check('a blank spend makes the costs incomplete', Machine.costs(Object.assign({}, k, { adSpendCents: undefined })).status, 'incomplete');
  check('a typed zero spend is free, not incomplete', Machine.costs(Object.assign({}, k, { adSpendCents: 0 })).free, true);
  checkTrue('free leads pass both checks with a word about it', Machine.checks(Object.assign({}, k, { adSpendCents: 0 })).free && /cost nothing/.test(Machine.checks(Object.assign({}, k, { adSpendCents: 0 })).words));
  check('zero monthly pay is a value', Machine.value(Object.assign({}, k, { monthlyCents: 0 })).lifetime, 21000);
  check('a rate of zero makes no customers and no cost, not a crash', Machine.costs(Object.assign({}, k, { closeRate: 0 })).perCustomer, null);
  checkTrue('and the checks say so', /no customers/.test(Machine.checks(Object.assign({}, k, { closeRate: 0 })).words));
  checkTrue('no formula reads a blank as zero', !/\|\|\s*0\b/.test(fs.readFileSync(L('engines/machine.js'), 'utf8')));

  /* Levers. */
  const lv = Machine.levers(k);
  check('the lowest rate is the weakest', lv.weakest, 'replyRate');
  check('and one point on it is the biggest lever', lv.levers[0].id, 'replyRate');
  near('one point of reply is a fifth more customers', lv.levers[0].relative, 0.2, 1e-9);
  const show = lv.levers.filter(l => l.id === 'showRate')[0];
  near('one point of show rate is a seventieth', show.relative, 1 / 70, 1e-9);
  checkTrue('every lever gains', lv.levers.every(l => l.gain > 0));
  checkTrue('levers are sorted by gain', lv.levers.every((l, i) => i === 0 || lv.levers[i - 1].gain >= l.gain));
  check('a rate at one hundred percent does not go over', Machine.levers(Object.assign({}, k, { showRate: 1 })).levers.filter(l => l.id === 'showRate')[0].gain, 0);
  check('levers need the funnel', Machine.levers({}).status, 'incomplete');

  /* Growth. */
  const g = Machine.growth(k, 12);
  check('thirteen points, now and twelve months', g.withReferrals.length, 13);
  near('month zero is today\'s count', g.withReferrals[0], 12);
  near('month one keeps 1 - churn + referral and adds the funnel', g.withReferrals[1], 12 * (1 - 0.08 + 0.1) + 9.24, 1e-9);
  check('referrals above churn compound', g.compounding, true);
  checkTrue('the line with referrals ends higher', g.withReferrals[12] > g.withoutReferrals[12]);
  check('referrals below churn do not', Machine.growth(Object.assign({}, k, { referralRate: 0.02 })).compounding, false);
  check('growth needs its three inputs', Machine.growth(Object.assign({}, k, { churnRate: null })).status, 'incomplete');
  const noFunnel = Machine.growth({ customersNow: 10, churnRate: 0.1, referralRate: 0.1 });
  check('growth without a funnel still draws, with no new customers added', noFunnel.status, 'ok');
  near('at equal rates and no funnel the count holds', noFunnel.withReferrals[12], 10, 1e-9);

  /* The log. */
  const log = [{ date: '2026-09-24', planet: 'warm', count: 100 }, { date: '2026-09-25', planet: 'warm', count: 60 }, { date: '2026-09-25', planet: 'cold', count: 50 }, { date: '2026-09-26', planet: 'warm', count: 120 }];
  const d = Machine.actionsByDay(log, 5, '2026-09-26');
  check('five days ending today', d.x.join(','), '2026-09-22,2026-09-23,2026-09-24,2026-09-25,2026-09-26');
  check('a day with nothing logged is null, not zero', d.total[0], null);
  check('two planets on one day add up', d.total[3], 110);
  check('days at a hundred or more', d.hundredDays, 3);
  check('the streak counts back from today', d.streak, 3);
  check('one series a planet', d.series.length, 2);
  check('a series has a blank where that planet was not logged', d.series.filter(s => s.id === 'cold')[0].values[4], null);
  check('a bad row is ignored', Machine.actionsByDay([{ date: '2026-09-26' }], 3, '2026-09-26').loggedDays, 0);
  checkTrue('Money formats what the page shows', Money.formatCents(133000) === '$1,330' || Money.formatCents(133000) === '$1,330.00');
}

/* ======================================================================
   The store
   ====================================================================== */
section('The store: leads. keys only, empty is not zero, a copy round-trips (LD-004)');
{
  const { Store, s, Ladder } = fresh();
  check('the key', Store.KEY, 'leads.state.v1');
  check('a fresh state has nothing done', Ladder.overall(Store.load()).done, 0);
  Store.answer('warm-3', 'phone', 420);
  Store.answer('warm-3', 'email', 0);
  check('a typed zero is stored', Store.load().levels['warm-3'].values.email, 0);
  Store.answer('warm-3', 'social', '');
  check('an empty string is not stored', 'social' in Store.load().levels['warm-3'].values, false);
  Store.tick('magnet-5', 2, true);
  check('a tick lands', Store.load().levels['magnet-5'].ticks[2], true);
  Store.confirm('warm-1');
  check('a got-it lands', Store.load().levels['warm-1'].confirmed, true);
  Store.later('warm-2', true);
  check('later lands', Store.load().levels['warm-2'].later, true);
  Store.setStart('goal', 20); Store.setStart('first', 'warm');
  check('start answers land', Store.load().start.goal + Store.load().start.first, '20warm');
  Store.setKpi('replyRate', 0.05); Store.setKpi('laborCents', 0); Store.setKpi('adSpendCents', null);
  const kp = Store.load().kpis;
  check('a kpi lands, a zero lands, a null is removed', [kp.replyRate, kp.laborCents, 'adSpendCents' in kp].join(','), '0.05,0,false');
  Store.setKpi('reachPerDay', NaN);
  check('NaN is not stored', 'reachPerDay' in Store.load().kpis, false);
  Store.addLog('2026-09-26', 'warm', 100); Store.addLog('2026-09-25', 'warm', 90);
  check('the log is kept in date order', Store.load().log.map(e => e.date).join(','), '2026-09-25,2026-09-26');
  Store.dropLog(0);
  check('a row can be removed', Store.load().log.length, 1);
  Store.setChartPref('funnel', { type: 'bar' });
  check('a chart preference lands', Store.prefs().charts.funnel.type, 'bar');
  checkTrue('only leads. keys were written', Object.keys(s.store).every(k => k.indexOf('leads.') === 0), Object.keys(s.store).join(','));
  const json = Store.exportJson();
  checkTrue('an export carries the signature', json.indexOf(Store.SIG) !== -1);
  Store.reset();
  check('reset forgets everything', Object.keys(Store.load().levels).length, 0);
  Store.importJson(json);
  check('an import brings it back', Store.load().levels['warm-3'].values.phone, 420);
  let threw = false; try { Store.importJson('{"x":1}'); } catch (e) { threw = true; }
  check('a file that is not an export is refused', threw, true);
  check('a broken state on disk is a fresh one', (() => { s.store[Store.KEY] = '{not json'; return Object.keys(Store.load().levels).length; })(), 0);
  Store.demo();
  const st = Store.load();
  check('the example numbers are marked as such', st.demo, true);
  checkTrue('the example fills every Machine input', fresh().Machine.INPUTS.every(i => typeof st.kpis[i.key] === 'number'));
  checkTrue('the example answers Start Here', ['sells', 'serves', 'customers', 'budget', 'team', 'goal', 'first'].every(k => st.start[k] !== undefined));
  checkTrue('every example level id is real', Object.keys(st.levels).every(id => !!Ladder.byId(id)));
  checkTrue('the example has some levels done and some not', Ladder.overall(st).done > 5 && Ladder.overall(st).done < Ladder.overall(st).of);
  checkTrue('the example log has days at a hundred', fresh().Machine.actionsByDay(st.log, 30).hundredDays > 3);
}

/* ======================================================================
   Pictures
   ====================================================================== */
section('Pictures: every chart the pages draw renders and has a table twin (LD-005)');
{
  const { Charts, Machine, Store } = fresh();
  Store.demo();
  const k = Store.load().kpis, R = Machine.read(k);
  const specs = [
    { kind: 'compare', title: 'funnel', unit: 'count', oneColor: true, slices: R.funnel.stages.map(s => ({ id: s.id, label: s.label, value: s.value })) },
    { kind: 'meter', title: 'ratio', unit: 'score', value: R.checks.ratio, max: 6, bands: [{ to: 1, zone: 'out' }, { to: 3, zone: 'watch' }, { to: 6, zone: 'good' }], zoneWords: { good: 'ok' } },
    { kind: 'compare', title: 'payback', unit: 'cents', slices: [{ id: 'a', label: 'a', value: R.checks.first30 }, { id: 'b', label: 'b', value: R.checks.cac * 2 }] },
    { kind: 'compare', title: 'levers', unit: 'count', slices: R.levers.levers.map(l => ({ id: l.id, label: l.label, value: l.gain })) },
    { kind: 'series', title: 'growth', unit: 'count', x: ['now', '1', '2'], series: [{ id: 'w', label: 'w', values: R.growth.withReferrals.slice(0, 3) }, { id: 'o', label: 'o', values: R.growth.withoutReferrals.slice(0, 3) }] },
    { kind: 'series', title: 'log', unit: 'count', x: ['a', 'b', 'c'], series: [{ id: 'warm', label: 'Warm', values: [100, null, 120] }] },
    { kind: 'progress', title: 'bands', unit: 'count', items: [{ id: 'l', label: 'Learn', value: 2, total: 2 }, { id: 's', label: 'Sketch', value: 0, total: 3 }] },
    { kind: 'progress', title: 'goal', unit: 'count', items: [{ id: 'g', label: 'goal', value: null, total: 0 }] }
  ];
  specs.forEach(spec => {
    Charts.types(spec.kind).forEach(t => {
      const r = Charts.render(spec, { width: 600, type: t.id });
      checkTrue(spec.title + ' as ' + t.id + ' renders an svg', /^<svg/.test(r.svg) && /<\/svg>$/.test(r.svg));
      checkTrue(spec.title + ' as ' + t.id + ' never prints NaN', r.svg.indexOf('NaN') === -1);
    });
    checkTrue(spec.title + ' has a table twin', /^<table/.test(Charts.table(spec)));
  });
  const empty = Charts.render({ kind: 'series', title: 'x', unit: 'count', x: [], series: [] }, { width: 600 });
  checkTrue('an empty series says nothing to draw yet, never a zero line', /nothing to draw yet/.test(empty.svg));
}

/* ======================================================================
   No real data, no em dash, plain words
   ====================================================================== */
section('No real data in the repository, no em dash in leads/');
{
  let tracked = [];
  try { tracked = require('child_process').execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean); } catch (e) { tracked = []; }
  const SIG = new RegExp('"' + 'leadsLadder' + 'Export"\\s*:');
  const carrying = tracked.filter(f => !/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|pdf|zip|xlsx)$/i.test(f) && (() => { try { return SIG.test(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return false; } })());
  checkTrue('no tracked file carries a ladder export (' + tracked.length + ' files read)', tracked.length > 0 && carrying.length === 0, carrying.join(', '));
  const EM = [String.fromCharCode(0x2014), '\\u2014', '&mdash;', '&#8212;'];
  const dirty = [];
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(html|js|css|json)$/.test(e.name) && p !== __filename) { const t = fs.readFileSync(p, 'utf8'); if (EM.some(x => t.indexOf(x) !== -1)) dirty.push(path.relative(HERE, p)); } }); }
  walk(HERE);
  checkTrue('no em dash anywhere in leads/', dirty.length === 0, dirty.join(', '));
  const book = fs.readFileSync(L('data/book.json'), 'utf8');
  checkTrue('the book data credits the author and says it is a restatement, not a quote', /Hormozi/.test(book) && /own words/.test(book));
}

/* ---- Report --------------------------------------------------------------- */
delete global.localStorage;
console.log('\n' + '-'.repeat(66));
if (!failures.length) { console.log('ok ' + passed + ' ladder checks passed'); process.exit(0); }
console.log('FAIL ' + failures.length + ' failed, ' + passed + ' passed\n');
failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
process.exit(1);
