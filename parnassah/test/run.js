#!/usr/bin/env node
/* ==========================================================================
   parnassah/test/run.js, Parnassah's own tests. PN-001 onward.
   --------------------------------------------------------------------------
   Dependency-free, like coach/test/run.js: node only, a fake localStorage.
   Also run in CI beside the SPARKS suite.

     node parnassah/test/run.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const APP = path.join(__dirname, '..');
const ROOT = path.join(APP, '..');
const A = (f) => path.join(APP, f);

let passed = 0;
const failures = [];
function check(name, actual, expected) { if (actual === expected) { passed++; return; } failures.push(name + '\n      expected: ' + JSON.stringify(expected) + '\n      actual:   ' + JSON.stringify(actual)); }
function checkTrue(name, ok, detail) { if (ok) { passed++; return; } failures.push(name + (detail ? '\n      ' + detail : '')); }
function near(name, actual, expected, tol) { checkTrue(name, typeof actual === 'number' && Math.abs(actual - expected) <= (tol || 1), 'expected about ' + expected + ', got ' + actual); }
function section(t) { console.log('\n' + t); }
const pending = [];

function fakeStorage(seed) {
  const store = Object.assign({}, seed || {});
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i] === undefined ? null : Object.keys(store)[i], get length() { return Object.keys(store).length; }, store };
}
function fresh(seed) {
  ['shared/store.js'].forEach(m => { delete require.cache[require.resolve(A(m))]; });
  const s = fakeStorage(seed);
  global.localStorage = s;
  return { s, Store: require(A('shared/store.js')) };
}
const T = require(A('shared/tables.js')).loadSync();
const Money = require(A('shared/money.js'));
const Tuition = require(A('engines/tuition.js'));
const JewishYear = require(A('engines/jewishyear.js'));
const Tzedakah = require(A('engines/tzedakah.js'));
const Milestones = require(A('engines/milestones.js'));
const Home = require(A('engines/home.js'));
const Plan = require(A('engines/plan.js'));
const Charts = require(A('shared/charts.js'));
const Store = require(A('shared/store.js'));
const TODAY = { today: '2026-09-26' };
const c = (d) => Math.round(d * 100);

/* ======================================================================
   A separate app (PN-001)
   ====================================================================== */
section('A separate app (PN-001)');
{
  const V = require(A('tools/vendor.js'));
  const drift = V.FILES.filter(f => !fs.existsSync(path.join(ROOT, f)) || !fs.existsSync(A(f)) || Buffer.compare(fs.readFileSync(path.join(ROOT, f)), fs.readFileSync(A(f))) !== 0);
  checkTrue('every vendored copy is byte-identical to SPARKS (' + V.FILES.length + ' files; run node parnassah/tools/vendor.js)', drift.length === 0, drift.join(', '));
  checkTrue('the spine, ownership, schema and the SPARKS engines are not carried', ['shared/spine-v2.js', 'shared/ownership.js', 'shared/schema.js', 'shared/registry.js'].every(f => !fs.existsSync(A(f))));
  const outside = [], slafKeys = [];
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'test' && e.name !== 'tools' && e.name !== 'vendor') walk(p); } else if (/\.(js|html|css)$/.test(e.name)) {
    const t = fs.readFileSync(p, 'utf8');
    (t.match(/require\('([^']+)'\)/g) || []).forEach(r => { const rel = r.slice(9, -2); if (rel[0] === '.' && path.resolve(path.dirname(p), rel).indexOf(APP) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
    (t.match(/(?:src|href)="([^"#?]+)"/g) || []).forEach(r => { const rel = r.replace(/^(src|href)="/, '').replace(/"$/, ''); if (!/^(https?:|mailto:)/.test(rel) && /\.(js|css|svg|html|woff2)$/.test(rel) && path.resolve(path.dirname(p), rel).indexOf(APP) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
    if (/['"](slaf|coach)\.[a-z]+\.v\d/.test(t)) slafKeys.push(path.relative(ROOT, p));
    if (/https?:\/\//.test(t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))) outside.push(path.relative(ROOT, p) + ' -> a network address');
  } }); }
  walk(APP);
  checkTrue('every require, script, link and font stays inside parnassah/, and nothing reaches the network', outside.length === 0, outside.join(', '));
  checkTrue('no SPARKS or coach storage key is named in code', slafKeys.length === 0, slafKeys.join(', '));
  check('the store\'s key is its own', Store.KEY, 'parnassah.household.v1');
}

/* ======================================================================
   The data (PN-002)
   ====================================================================== */
section('The reference data carries its provenance (PN-002)');
{
  const Tables = require(A('shared/tables.js'));
  Object.keys(Tables.FILES).forEach(k => {
    ['version', 'asOf', 'confidence', 'source', 'confidenceNote'].forEach(f => checkTrue(`data/${Tables.FILES[k]} carries ${f}`, typeof T[k][f] === 'string' && T[k][f].length > 0));
    checkTrue(`data/${Tables.FILES[k]} is year-versioned or a rules file`, /_20\d\d\.json$|rules\.json$|help\.json$/.test(Tables.FILES[k]));
  });
  const onDisk = fs.readdirSync(A('data')).filter(f => f.endsWith('.json'));
  checkTrue('every data file on disk is registered', onDisk.every(f => Object.values(Tables.FILES).indexOf(f) !== -1), onDisk.join(','));
  function band(name, d) { checkTrue(name + ' band is low <= typical <= high', typeof d.low === 'number' && d.low <= d.typical && d.typical <= d.high); }
  T.tuition.regions.forEach(r => T.tuition.stages.forEach(s => band('tuition ' + r.id + '/' + s.id, T.tuition.annualDollars[r.id][s.id])));
  T.year.events.forEach(e => { band('year ' + e.id, e.dollars); checkTrue('year ' + e.id + ' lands in a month', e.month >= 1 && e.month <= 12); checkTrue('year ' + e.id + ' has a kind the engine knows', JewishYear.KINDS.some(k => k.id === e.kind)); });
  band('shabbat', T.year.weekly.dollars); band('sleepaway', T.year.camp.sleepaway.dollars); band('day camp', T.year.camp.day.dollars);
  T.milestones.events.forEach(e => band('milestone ' + e.id, e.dollars));
  T.milestones.aliyah.items.forEach(e => band('aliyah ' + e.id, e.dollars));
  checkTrue('every community names a region the tuition table has', T.communities.communities.every(x => T.tuition.regions.some(r => r.id === x.region)));
  checkTrue('every community with a price has a tax rate', T.communities.communities.every(x => (x.homeDollars === null) === (x.taxRate === null)));
  checkTrue('the share rules are fractions', T.tzedakah.rates.filter(r => r.rate !== null).every(r => r.rate > 0 && r.rate < 1) && T.milestones.weddingShares.filter(s => s.share !== null).every(s => s.share > 0 && s.share <= 1));
  /* Every help id a page names exists, and nothing in help.json is orphaned. */
  const used = new Set();
  fs.readdirSync(APP).filter(f => f.endsWith('.html')).forEach(f => {
    const s = fs.readFileSync(A(f), 'utf8');
    for (const m of s.matchAll(/help: '([a-zA-Z_]+)'/g)) {
      const id = m[1];
      if (id === 'event_') T.year.events.forEach(e => used.add('event_' + e.id));
      else if (id === 'stage_') T.tuition.stages.forEach(s2 => used.add('stage_' + s2.id));
      else if (id === 'aliyah_') T.milestones.aliyah.items.forEach(i => used.add('aliyah_' + i.id));
      else used.add(id);
    }
  });
  const missing = [...used].filter(u => !T.help.fields[u]), orphan = Object.keys(T.help.fields).filter(k => !used.has(k));
  checkTrue('every box on every page has plain words in help.json (' + used.size + ')', missing.length === 0, missing.join(','));
  checkTrue('nothing in help.json is orphaned', orphan.length === 0, orphan.join(','));
  Object.keys(T.help.fields).forEach(k => { const e = T.help.fields[k]; checkTrue('help ' + k + ' asks a question and says what to do if unsure', /\?$/.test(e.q) && typeof e.unsure === 'string' && e.unsure.length > 0); });
}

/* ======================================================================
   The store (PN-002, PN-003)
   ====================================================================== */
section('The store: one key, empty is not zero, a backup round-trips (PN-002, PN-003)');
{
  const { s, Store: S } = fresh({ 'slaf.household.v2': '{"schemaVersion":2}' });
  const b = S.blank();
  check('a blank household has no money in it', b.household.grossAnnualCents, null);
  check('a blank household has no children', b.kids.length, 0);
  check('nothing stored reads as blank', S.load().household.region, null);
  const h = S.demo();
  S.save(h);
  check('a save writes the one key', Object.keys(s.store).sort().join(','), 'parnassah.household.v1,slaf.household.v2');
  check('and the SPARKS household beside it is untouched', s.getItem('slaf.household.v2'), '{"schemaVersion":2}');
  checkTrue('savedAt is stamped', typeof h.savedAt === 'string');
  const back = S.importJson(S.exportJson(h));
  check('a backup round-trips', JSON.stringify(back), JSON.stringify(h));
  let threw = null; try { S.importJson('{"household":{}}'); } catch (e) { threw = e.message; }
  checkTrue('a file without the signature is refused', /not a Parnassah backup/.test(threw));
  const m = S.migrate({ kids: [{ name: 'x' }], tzedakah: { gifts: [{ cents: 5 }] } });
  check('an older file gains every key', m.tuition.siblingFrom, 3);
  check('a child gains its keys', JSON.stringify(m.kids[0]), '{"id":"k1","name":"x","birthYear":null,"sex":null,"gapYear":null,"camp":null}');
  check('a gift gains its keys', m.tzedakah.gifts[0].kind, 'other');
  S.clear();
  check('clear forgets the one key only', Object.keys(s.store).join(','), 'slaf.household.v2');
  const d = S.demo();
  checkTrue('the demo family is labelled an example', /example/i.test(d.household.name));
  checkTrue('every demo money figure is integer cents', JSON.stringify(d, (k, v) => (typeof v === 'number' && /Cents$/.test(k) && !Number.isInteger(v)) ? 'FLOAT' : v).indexOf('FLOAT') === -1);
  delete global.localStorage;
}

/* ======================================================================
   Tuition (PN-004)
   ====================================================================== */
section('Tuition: the mountain (PN-004)');
{
  check('born 2021 is in kindergarten in the 2026 school year', Tuition.grade(2021, 2026, T), 0);
  check('born 2014 is in seventh grade in 2026', Tuition.grade(2014, 2026, T), 7);
  check('the 2026 school year began in September 2026', Tuition.schoolYear('2026-09-26', T), 2026);
  check('in June 2027 it is still the 2026 school year', Tuition.schoolYear('2027-06-01', T), 2026);
  check('grade 13 is the year in Israel', Tuition.stage(13, T).id, 'gap');
  check('age two is not in school', Tuition.stage(-3, T), null);
  const h = Store.demo();
  const t = Tuition.plan(h, T, TODAY);
  check('the demo plans', t.status, 'ok');
  check('this year: three at elementary and one at pre-K, at the typed prices less 25%', t.value.thisYearCents, 3 * Math.round(c(25500) * 0.75) + Math.round(c(17000) * 0.75));
  check('this year counts four children in school', t.value.kidsInSchool, 4);
  check('the last year is the youngest\'s twelfth grade (born 2022, K in 2027, grade 12 in 2039)', t.value.lastYear, 2039);
  check('the years run from 2026 to 2039', t.value.years.length, 14);
  check('the lifetime is the sum of the years', t.value.lifetimeCents, t.value.years.reduce((a, y) => a + y.totalCents, 0));
  checkTrue('the peak is a year in the list at its maximum', t.value.years.every(y => y.totalCents <= t.value.peak.cents) && t.value.years.some(y => y.year === t.value.peak.year && y.totalCents === t.value.peak.cents));
  check('pre-K uses the region\'s typical figure and says so', t.value.years[0].perKid.filter(k => k.stageId === 'early')[0].assumed, true);
  check('the year in Israel appears for a child with it on', t.value.years.filter(y => y.perKid.some(k => k.stageId === 'gap')).length, 2);
  const noGap = Store.demo(); noGap.kids.forEach(k => { k.gapYear = null; });
  check('and not for one with it unknown', Tuition.plan(noGap, T, TODAY).value.years.filter(y => y.perKid.some(k => k.stageId === 'gap')).length, 0);
  check('the gap year does not take the assistance share', t.value.years.filter(y => y.perKid.some(k => k.stageId === 'gap'))[0].perKid.filter(k => k.stageId === 'gap')[0].cents, c(30000));
  const sib = Store.demo(); sib.tuition.siblingShare = 0.1; sib.tuition.siblingFrom = 3;
  const ts = Tuition.plan(sib, T, TODAY).value.years[0].perKid;
  check('a sibling discount takes from the third child in school, oldest first', ts[2].cents, Math.round(Math.round(c(25500) * 0.75) * 0.9));
  check('and not from the first', ts[0].cents, Math.round(c(25500) * 0.75));
  const none = Store.blank();
  check('no children is incomplete', Tuition.plan(none, T, TODAY).status, 'incomplete');
  none.kids.push({ id: 'k1', name: null, birthYear: null, sex: null, gapYear: null, camp: null });
  check('a child without a year of birth is incomplete and named', Tuition.plan(none, T, TODAY).missing[0], 'birthYear:k1');
  none.kids[0].birthYear = 2018;
  check('no region and no typed price is incomplete, never a guess', Tuition.plan(none, T, TODAY).status, 'incomplete');
  none.tuition.overrides.elementary = 0;
  const z = Tuition.plan(none, T, TODAY);
  check('a typed zero is a price of zero, not a missing one', z.status, 'ok');
  check('and it is not marked assumed', z.value.years[0].perKid[0].assumed, false);
  check('and costs zero', z.value.thisYearCents, 0);
}

/* ======================================================================
   The year (PN-005)
   ====================================================================== */
section('The year: twelve months from Elul (PN-005)');
{
  const h = Store.demo();
  const y = JewishYear.calendar(h, T, TODAY);
  check('the demo year draws', y.status, 'ok');
  check('the months start in September', y.value.months[0].label, 'Sep 2026');
  check('and end in August of the next year', y.value.months[11].label, 'Aug 2027');
  check('the months sum to the year', y.value.months.reduce((a, m) => a + m.cents, 0), y.value.annualCents);
  check('one line is unanswered in the demo', y.value.unanswered.map(u => u.id).join(','), 'israel');
  check('so the year is not complete', y.value.complete, false);
  check('a typed zero (the seats) counts as answered', y.value.answered, T.year.events.length - 1 + 1 + 1);
  check('the set-aside is a twelfth', y.value.monthlyCents, Math.round(y.value.annualCents / 12));
  check('camp lands in June, once per child who goes', y.value.months[9].items.filter(i => i.kind === 'camp').length, 3);
  check('camp is priced per child', y.value.campCents, c(9500) + 2 * c(4500));
  near('the fund ends the year near zero', y.value.balance[11], 0, 12);
  checkTrue('the cushion is the deepest dip', y.value.cushionCents === -Math.min(0, ...y.value.balance));
  const b = Store.blank();
  check('nothing answered is incomplete', JewishYear.calendar(b, T, TODAY).status, 'incomplete');
  b.year.events.shul = c(2000);
  const one = JewishYear.calendar(b, T, TODAY);
  check('one answer draws a year so far', one.status, 'ok');
  check('and names every other line as unanswered', one.value.unanswered.length, T.year.events.length);
  const k = Store.blank(); k.kids.push({ id: 'k1', name: 'A', birthYear: 2015, sex: null, gapYear: null, camp: 'sleepaway' });
  const kc = JewishYear.calendar(k, T, TODAY);
  check('a child at camp with no camp price is an unanswered line, not a zero', kc.status, 'incomplete');
}

/* ======================================================================
   Tzedakah (PN-006)
   ====================================================================== */
section('Tzedakah: a tenth of what (PN-006)');
{
  const h = Store.demo();
  const z = Tzedakah.owed(h, T, TODAY);
  check('the demo works from income after tax', z.value.baseCents, c(360000) - c(95000));
  check('a tenth of it', z.value.owedCents, Math.round((c(360000) - c(95000)) * 0.1));
  check('given is the sum of the gifts', z.value.givenCents, c(1800 + 3600 + 2400 + 1800 + 1200));
  check('remaining is owed less given', z.value.remainingCents, z.value.owedCents - z.value.givenCents);
  check('in September there are twelve months to Elul', z.value.monthsLeft, 12);
  check('in October, eleven', Tzedakah.monthsLeft('2026-10-05', T), 11);
  check('in August, one', Tzedakah.monthsLeft('2027-08-05', T), 1);
  check('the pace spreads the remainder over them', z.value.paceMonthlyCents, Math.round(z.value.remainingCents / 12));
  check('the kinds sum to what was given', z.value.byKind.reduce((a, k) => a + k.cents, 0), z.value.givenCents);
  h.tzedakah.baseId = 'gross';
  check('the gross base is the gross', Tzedakah.owed(h, T, TODAY).value.baseCents, c(360000));
  h.tzedakah.rateId = 'chomesh';
  check('a fifth', Tzedakah.owed(h, T, TODAY).value.owedCents, c(72000));
  h.tzedakah.rateId = 'custom';
  check('a custom share with none typed is incomplete', Tzedakah.owed(h, T, TODAY).status, 'incomplete');
  h.tzedakah.customRate = 0.12;
  check('a custom share typed', Tzedakah.owed(h, T, TODAY).value.owedCents, c(43200));
  h.tzedakah.baseId = 'net'; h.tzedakah.taxAnnualCents = null;
  check('the after-tax base without the tax is incomplete', Tzedakah.owed(h, T, TODAY).status, 'incomplete');
  const b = Store.blank();
  check('no income is incomplete', Tzedakah.owed(b, T, TODAY).status, 'incomplete');
  b.household.grossAnnualCents = c(100000); b.tzedakah.baseId = 'gross';
  const bz = Tzedakah.owed(b, T, TODAY);
  check('no gifts is zero given, because none were listed', bz.value.givenCents, 0);
  check('and everything remains', bz.value.remainingCents, c(10000));
}

/* ======================================================================
   Milestones (PN-007)
   ====================================================================== */
section('Simchas: the line of years (PN-007)');
{
  const h = Store.demo();
  const m = Milestones.timeline(h, T, TODAY);
  check('the demo draws', m.status, 'ok');
  check('the next simcha is Noam\'s bar mitzvah in 2027', m.value.next.year + ' ' + m.value.next.id + ' ' + m.value.next.name, '2027 barmitzvah Noam');
  check('two bar mitzvahs, two bat mitzvahs, four weddings, eight years of support, two years in Israel', m.value.events.length, 2 + 2 + 4 + 8 + 2);
  check('the years in Israel are counted on the tuition page', m.value.events.filter(e => e.countedIn === 'tuition').length, 2);
  check('and not in the total', m.value.totalCents, 2 * c(25000) + 2 * c(18000) + 4 * Math.round(c(80000) * 0.35) + 8 * c(18000));
  check('the years are in order', m.value.events.every((e, i) => i === 0 || e.year >= m.value.events[i - 1].year), true);
  check('the byYear buckets sum to the total', m.value.byYear.reduce((a, y) => a + y.cents, 0), m.value.totalCents);
  check('a bat mitzvah at twelve', m.value.events.filter(e => e.id === 'batmitzvah' && e.name === 'Talia')[0].year, 2028);
  check('a wedding at the typed age', m.value.events.filter(e => e.id === 'wedding' && e.name === 'Maya')[0].year, 2046);
  /* The set-aside: months to mid-year, never fewer than the months left in this one. */
  const bm = m.value.events.filter(e => e.id === 'barmitzvah' && e.name === 'Noam')[0];
  const expected = m.value.events.filter(e => e.countedIn === 'here').reduce((a, e) => a + e.cents / Math.max((e.year - 2026) * 12 + 6 - 9, 4), 0);
  near('the monthly set-aside meets each on time', m.value.setAsideMonthlyCents, Math.round(expected), 1);
  check('a simcha next year has nine months to its middle', Math.round(bm.cents / 9), Math.round(c(25000) / 9));
  const past = Store.demo(); past.kids[0].birthYear = 2000;
  const pm = Milestones.timeline(past, T, TODAY);
  check('a simcha already past is not on the line', pm.value.events.filter(e => e.name === 'Noam' && e.id === 'barmitzvah').length, 0);
  check('nor a wedding already past', pm.value.events.filter(e => e.name === 'Noam' && e.id === 'wedding').length, 0);
  const ns = Store.demo(); ns.kids[2].sex = null;
  check('a child with no boy or girl is named as needing it', Milestones.timeline(ns, T, TODAY).value.needSex.join(','), 'k3');
  const cs = Store.demo(); cs.milestones.weddingShareId = 'custom';
  check('a custom share with none typed places no weddings and says so', Milestones.timeline(cs, T, TODAY).value.shareMissing, true);
  cs.milestones.customShare = 0.5;
  check('a custom share typed', Milestones.timeline(cs, T, TODAY).value.events.filter(e => e.id === 'wedding')[0].cents, c(40000));
  const as = Store.blank(); as.milestones.barmitzvahCents = null; as.kids.push({ id: 'k1', name: 'B', birthYear: 2020, sex: 'boy', gapYear: null, camp: null });
  const am = Milestones.timeline(as, T, TODAY);
  check('an untyped simcha uses the typical band and is marked assumed', am.value.events[0].assumed, true);
  check('at the typical figure', am.value.events[0].cents, c(25000));
  const al = Store.blank(); al.milestones.aliyah.on = true; al.milestones.aliyah.year = 2028; al.milestones.aliyah.liftCents = c(10000);
  const alm = Milestones.timeline(al, T, TODAY);
  check('aliyah alone draws a line', alm.status, 'ok');
  check('the typed lift plus the typical pilot and landing', alm.value.events[0].cents, c(10000) + c(6000) + c(20000));
  check('for the family', alm.value.events[0].name, 'The family');
  check('nothing at all is incomplete', Milestones.timeline(Store.blank(), T, TODAY).status, 'incomplete');
}

/* ======================================================================
   The home (PN-008)
   ====================================================================== */
section('The home: a house within a walk of the shul (PN-008)');
{
  check('a hundred thousand at 6% over thirty years is $599.55 a month', Home.payment(c(100000), 0.06, 30), 59955);
  check('at 0% it is the loan over the months', Home.payment(c(120000), 0, 30), Math.round(c(120000) / 360));
  const h = Store.demo();
  const t = Tuition.plan(h, T, TODAY);
  const r = Home.carry(h, T, { tuitionAnnualCents: t.value.thisYearCents });
  check('the demo prices', r.status, 'ok');
  check('the price is the typed one', r.value.source, 'typed');
  check('twenty percent down', r.value.downCents, c(190000));
  check('principal and interest on the rest', r.value.piMonthlyCents, Home.payment(c(760000), 0.0625, 30));
  check('tax a month', r.value.taxMonthlyCents, Math.round(c(950000) * 0.026 / 12));
  check('the month is the three parts', r.value.totalMonthlyCents, r.value.piMonthlyCents + r.value.taxMonthlyCents + r.value.insuranceMonthlyCents);
  near('the share of take-home', r.value.share, r.value.totalMonthlyCents / c(19800), 1e-9);
  check('the verdict on this income with this tuition', r.value.verdict, 'over');
  checkTrue('the price that fits is below the typed price', r.value.maxPriceCents < r.value.priceCents);
  const at = Store.demo(); at.home.priceCents = r.value.maxPriceCents;
  near('and at that price house and tuition sit on the guide', Home.carry(at, T, { tuitionAnnualCents: t.value.thisYearCents }).value.withTuitionShare, T.communities.guide.housingAndTuitionShareOfTakeHome, 0.002);
  check('the difference against what the home costs now', r.value.deltaMonthlyCents, r.value.totalMonthlyCents - c(4200));
  const cm = Store.blank(); cm.household.community = 'baltimore';
  const cr = Home.carry(cm, T, {});
  check('a community alone prices from its typical home', cr.value.source, 'community');
  check('with its tax rate', cr.value.taxRate, 0.014);
  check('and no take-home gives no share and no verdict', cr.value.verdict, null);
  const nt = Store.blank(); nt.household.community = 'other';
  check('a community without a price is incomplete', Home.carry(nt, T, {}).status, 'incomplete');
  nt.home.priceCents = c(400000);
  check('a price without a tax rate is incomplete', Home.carry(nt, T, {}).status, 'incomplete');
  nt.home.taxRate = 0.01; nt.household.takeHomeMonthlyCents = c(12000);
  check('a modest house on a fair income fits', Home.carry(nt, T, {}).value.verdict, 'fits');
}

/* ======================================================================
   The picture (PN-009)
   ====================================================================== */
section('The picture: everything out, what is left (PN-009)');
{
  const h = Store.demo();
  const p = Plan.picture(h, T, TODAY);
  check('the demo draws', p.status, 'ok');
  check('six lines', p.value.steps.length, 6);
  check('every line known in the demo', p.value.complete, true);
  check('left is take-home less the lines', p.value.leftCents, c(19800) * 12 - p.value.steps.reduce((a, s) => a + s.cents, 0));
  check('the housing line is what the home costs now, a year', p.value.steps.filter(s => s.id === 'housing')[0].cents, c(4200) * 12);
  check('the simcha line is what goes aside now', p.value.steps.filter(s => s.id === 'milestones')[0].cents, c(1000) * 12);
  checkTrue('and the gap to the needed pace is reported', p.value.simchaGapMonthlyCents > 0);
  check('the checklist has five items', p.value.checklist.length, 5);
  check('the emergency fund is short (2.4 months against 4)', p.value.checklist.filter(x => x.id === 'emergency')[0].state, 'short');
  check('disability is in place', p.value.checklist.filter(x => x.id === 'disability')[0].state, 'done');
  check('the will is not', p.value.checklist.filter(x => x.id === 'will')[0].state, 'short');
  check('the decade has every tuition year', p.value.decade.length, 14);
  check('the freed tuition starts the year after the last bill', p.value.freed.year, 2040);
  check('and runs to the older parent\'s 65th year', p.value.freed.age65Year, 2050);
  check('over 120 months', p.value.freed.months, 120);
  check('grown at the assumed rate', p.value.freed.at65Cents, Plan.futureValue(p.value.freed.monthlyCents, 0.05, 120));
  check('a future value at 0% is the deposits', Plan.futureValue(1000, 0, 12), 12000);
  near('a future value at 12% a year, 1% a month, over 12 months', Plan.futureValue(10000, 0.12, 12), 126825, 1);
  const b = Store.blank();
  check('no take-home is incomplete', Plan.picture(b, T, TODAY).status, 'incomplete');
  b.household.takeHomeMonthlyCents = c(10000);
  const bp = Plan.picture(b, T, TODAY);
  check('with take-home alone every line is unknown, none is zero', bp.value.steps.filter(s => s.status === 'ok').length, 0);
  check('so left is the whole take-home, so far', bp.value.leftCents, c(120000));
  check('and the picture says it is not complete', bp.value.complete, false);
  check('unknown checklist items are unknown, not failed', bp.value.checklist.filter(x => x.state === 'unknown').length, 5);
}

/* ======================================================================
   The pictures (PN-010)
   ====================================================================== */
section('The pictures (PN-010)');
{
  check('six hues, validated on the dark surface', Charts.HUES.join(','), '#3987e5,#199e70,#d95926,#9085e9,#c98500,#d55181');
  const col = Charts.columns({ categories: ['2026', '2027'], series: [{ label: 'A', values: [c(100), c(200)] }, { label: 'B', values: [c(50), null] }], title: 't' });
  checkTrue('a stacked column chart draws both series', col.svg.indexOf('2027, A: $200') !== -1 && col.svg.indexOf('2026, B: $50') !== -1);
  checkTrue('a missing value draws no mark', col.svg.indexOf('2027, B') === -1);
  check('two series get a legend', col.legend.length, 2);
  checkTrue('the table twin shows the dash for a missing value', col.table.indexOf(Money.NOT_YET) !== -1);
  check('one series gets no legend box', Charts.columns({ categories: ['a'], series: [{ label: 'A', values: [1] }] }).legend.length, 0);
  checkTrue('a tooltip rides every mark', (col.svg.match(/data-tip=/g) || []).length === 3);
  checkTrue('every mark is focusable', (col.svg.match(/tabindex="0"/g) || []).length === 3);
  const sb = Charts.stackbar({ items: [{ label: 'a', value: 25 }, { label: 'b', value: 75 }] });
  checkTrue('a stackbar labels the shares', sb.svg.indexOf('75%') !== -1 && sb.svg.indexOf('25%') !== -1);
  const hb = Charts.hbars({ items: [{ label: 'a', value: c(10), status: 'good' }] });
  checkTrue('a status bar takes the theme token, not a series hue', hb.svg.indexOf('var(--color-positive)') !== -1);
  const ln = Charts.line({ categories: ['a', 'b'], series: [{ label: 'x', values: [c(1), c(-1)] }], area: true });
  checkTrue('a line below zero draws', ln.svg.indexOf('data-tip="b, x: -$1"') !== -1);
  check('nice maxima', [1, 15, 26, 80, 1200].map(Charts.niceMax).join(','), '1,20,50,100,2000');
  check('short money', [c(950), c(12500), c(1250000)].map(Charts.short).join(','), '$950,$13k,$1.3M');
}

/* ======================================================================
   The pages (PN-011, PN-012)
   ====================================================================== */
section('The thirteen pages (PN-011, PN-012, PN-013)');
{
  const pages = fs.readdirSync(APP).filter(f => f.endsWith('.html')).sort();
  check('thirteen pages', pages.join(','), 'about.html,book.html,coaching.html,guide.html,home.html,index.html,milestones.html,plan.html,resources.html,tools.html,tuition.html,tzedakah.html,year.html');
  const selling = ['index.html', 'coaching.html', 'about.html', 'resources.html', 'book.html'];
  const common = fs.readFileSync(A('common.js'), 'utf8');
  pages.forEach(f => {
    const s = fs.readFileSync(A(f), 'utf8');
    const sells = selling.indexOf(f) !== -1;
    checkTrue(f + ' carries a Content Security Policy that keeps it to itself', /http-equiv="Content-Security-Policy"[^>]*default-src 'self'/.test(s) && /connect-src 'self'/.test(s));
    checkTrue(f + ' opts into the theme with <body class="slaf">', /<body class="slaf">/.test(s));
    const desc = (/<meta name="description" content="([^"]*)"/.exec(s) || [])[1] || '';
    checkTrue(f + ' has a description for search, under 170 characters', desc.length > 40 && desc.length <= 170, desc.length + ' characters');
    checkTrue(f + ' is not hidden from search', !/name="robots"[^>]*noindex/.test(s));
    checkTrue(f + ' has a header host and a lede', s.indexOf('id="pn-head"') !== -1 && s.indexOf('class="lede"') !== -1);
    if (!sells) checkTrue(f + ' has the actions', s.indexOf('id="pn-actions"') !== -1);
    checkTrue(f + ' loads every engine and common.js', ['engines/tuition.js', 'engines/jewishyear.js', 'engines/tzedakah.js', 'engines/milestones.js', 'engines/home.js', 'engines/plan.js', 'common.js'].every(x => s.indexOf('src="' + x + '"') !== -1));
    checkTrue(f + ' says what it reads, writes and shows', /READS/.test(s) && /WRITES/.test(s) && /SHOWS/.test(s));
    checkTrue(f + ' boots with its own page id', new RegExp("PN\\.boot" + (sells ? 'Site' : '') + "\\('" + f.replace('.html', '') + "'").test(s));
    checkTrue(f + ' has a footer that says nothing leaves the device and that this is not advice', /Nothing leaves this device/.test(s) && /halachic, tax or legal advice/.test(s));
    if (f !== 'book.html') checkTrue(f + ' carries the band that books a call', s.indexOf('id="pn-cta"') !== -1);
  });
  checkTrue('the nav names every page', pages.every(f => common.indexOf("href: '" + f + "'") !== -1));
  checkTrue('the tool sub-nav names only tools, and the site nav ends in the call', /id: 'book', href: 'book.html', label: 'Book a call', primary: true/.test(common) && !/PAGES = \[[\s\S]*?book\.html/.test(common.slice(common.indexOf('var PAGES'), common.indexOf('function el'))));
  /* Nothing that ships carries an em dash (D-321); the vendored money.js is SPARKS' own. */
  const dashed = [];
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); } else if (/\.(js|html|css|json|md)$/.test(e.name) && ['money.js', 'theme.css', 'fonts.css', 'DECISIONS.md', 'run.js'].indexOf(e.name) === -1) { if (fs.readFileSync(p, 'utf8').indexOf('\u2014') !== -1) dashed.push(path.relative(APP, p)); } }); }
  walk(APP);
  checkTrue('no em dash in anything Parnassah ships or documents (the log\'s headings follow the SPARKS form)', dashed.length === 0, dashed.join(', '));
  /* Every var(--token) a Parnassah file uses is defined in the theme or the file itself (the SPARKS rule). */
  const themeCss = fs.readFileSync(A('shared/theme.css'), 'utf8');
  const defs = new Set((themeCss.match(/(--[a-z0-9-]+)\s*:/gi) || []).map(m => m.replace(/\s*:$/, '')));
  const orphans = [];
  pages.concat(['parnassah.css', 'common.js', 'shared/charts.js']).forEach(f => {
    const src = fs.readFileSync(A(f), 'utf8');
    const local = new Set((src.match(/(--[a-z0-9-]+)\s*:/gi) || []).map(m => m.replace(/\s*:$/, '')));
    (src.match(/var\(\s*(--[a-z0-9-]+)\s*\)/gi) || []).map(m => m.replace(/var\(\s*/i, '').replace(/\s*\)$/, '')).forEach(t => { if (!defs.has(t) && !local.has(t)) orphans.push(f + ' uses ' + t); });
  });
  checkTrue('every CSS token resolves', orphans.length === 0, orphans.join(', '));
}

/* ======================================================================
   The selling layer: one file of copy (PN-013, PN-014)
   ====================================================================== */
section('The selling layer: every word in data/site.json (PN-013, PN-014)');
{
  const S = T.site;
  checkTrue('the coach has a name, a title and a short line', typeof S.coach.name === 'string' && S.coach.name.length > 3 && S.coach.title.length > 10 && S.coach.short.length > 40);
  checkTrue('the bio is paragraphs', Array.isArray(S.coach.bio) && S.coach.bio.length >= 3 && S.coach.bio.every(p => typeof p === 'string' && p.length > 20));
  ['eyebrow', 'headline', 'sub', 'primary', 'secondary'].forEach(k => checkTrue('the hero has ' + k, typeof S.hero[k] === 'string' && S.hero[k].length > 3));
  checkTrue('the headline is short enough to read at a glance', S.hero.headline.split(/\s+/).length <= 16, S.hero.headline);
  check('three offers', S.offers.length, 3);
  S.offers.forEach(o => {
    checkTrue('offer ' + o.id + ' says who it is for and what it includes', typeof o.for === 'string' && o.for.length > 20 && Array.isArray(o.includes) && o.includes.length >= 3);
    checkTrue('offer ' + o.id + ' prices in whole dollars or asks on the call', o.priceDollars === null || Number.isInteger(o.priceDollars));
  });
  check('exactly one offer is featured', S.offers.filter(o => o.featured).length, 1);
  checkTrue('every question in the FAQ is a question', S.faq.length >= 4 && S.faq.every(f => /\?$/.test(f.q) && f.a.length > 30));
  checkTrue('proof is a list, empty until a real family says something', Array.isArray(S.proof) && S.proof.every(p => p.text && p.who));
  const pages = fs.readdirSync(APP).filter(f => f.endsWith('.html'));
  S.resources.tools.forEach(t => checkTrue('resource ' + t.href + ' is a page', pages.indexOf(t.href) !== -1));
  const guide = fs.readFileSync(A('guide.html'), 'utf8');
  S.resources.checklists.forEach(c => { const id = c.href.split('#')[1]; checkTrue('checklist anchor #' + id + ' exists in the guide', new RegExp('id="' + id + '"').test(guide)); });
  checkTrue('the process has four steps, each with a title and words', S.process.steps.length === 4 && S.process.steps.every(st => st.title && st.text.length > 40));
  checkTrue('the contact block has the three keys', ['email', 'bookingUrl', 'bookingLabel'].every(k => k in S.contact));
  checkTrue('a booking link, when set, is https', !S.contact.bookingUrl || /^https:\/\//.test(S.contact.bookingUrl));
  checkTrue('the only network addresses live in site.json', pages.concat(['common.js']).every(f => !/https?:\/\//.test(fs.readFileSync(A(f), 'utf8').replace(/<!--[\s\S]*?-->/g, ''))));
  const raw = fs.readFileSync(A('data/site.json'), 'utf8');
  const edits = raw.match(/\[edit:[^\]]*\]/g) || [];
  if (edits.length || !S.contact.bookingUrl) pending.push('site.json still has ' + edits.length + ' [edit:] placeholders' + (!S.contact.bookingUrl && !S.contact.email ? ' and no booking link or email' : '') + ': the coach fills them before the site goes live');
  checkTrue('no placeholder leaks into the hero, the offers\' names or the FAQ', !/\[edit/.test(JSON.stringify(S.hero) + S.offers.map(o => o.name + o.for + o.includes.join()).join() + JSON.stringify(S.faq)));
}

/* ======================================================================
   No real data in the repository (PN-003)
   ====================================================================== */
section('No real data in the repository (PN-003)');
{
  let tracked = [];
  try { tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); } catch (e) { tracked = []; }
  const carrying = tracked.filter(f => { const p = path.join(ROOT, f); if (!fs.existsSync(p) || /\.(png|woff2|jpg|gif)$/.test(f)) return false; if (f.endsWith('parnassah/shared/store.js') || f.endsWith('parnassah/test/run.js')) return false; return fs.readFileSync(p, 'utf8').indexOf('"format": "parnassahExport"') !== -1; });
  checkTrue('no tracked file carries a Parnassah backup (' + tracked.length + ' files read)', tracked.length > 0 && carrying.length === 0, carrying.join(', '));
  checkTrue('no tracked file is named like a backup', tracked.every(f => !/parnassah-backup-/.test(f)));
  checkTrue('the folder\'s .gitignore refuses backups', /parnassah-backup-/.test(fs.readFileSync(A('.gitignore'), 'utf8')));
  const store = fs.readFileSync(A('shared/store.js'), 'utf8');
  checkTrue('the demo family is declared fictional in the source', /fictional/.test(store));
}

/* ======================================================================
   The decisions log (PN-001)
   ====================================================================== */
section('The decisions log');
{
  const log = fs.readFileSync(A('DECISIONS.md'), 'utf8');
  const nums = (log.match(/^## PN-(\d{3}) /gm) || []).map(m => Number(m.slice(6, 9)));
  checkTrue('PN numbers run 1..n without a gap', nums.length > 0 && nums.every((n, i) => n === i + 1), nums.join(','));
  const refs = new Set();
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); } else if (/\.(js|html|css|json|md)$/.test(e.name)) (fs.readFileSync(p, 'utf8').match(/\bPN-\d{3}\b/g) || []).forEach(r => refs.add(r)); }); }
  walk(APP);
  const dangling = [...refs].filter(r => nums.indexOf(Number(r.slice(3))) === -1);
  checkTrue('every PN- reference points at an entry', dangling.length === 0, dangling.join(','));
  checkTrue('no entry runs past twenty lines', log.split(/^## /m).slice(1).every(e => e.trim().split('\n').length <= 22), 'an entry is long; move the reasoning to the commit message');
}

/* ====================================================================== */
pending.forEach(p => console.log('\n  PENDING ' + p));
console.log('\n' + passed + ' checks passed' + (failures.length ? ', ' + failures.length + ' failed' : '') + (pending.length ? ', ' + pending.length + ' pending' : ''));
if (failures.length) { failures.forEach(f => console.log('\n  FAIL ' + f)); process.exit(1); }
