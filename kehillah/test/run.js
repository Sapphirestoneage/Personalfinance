#!/usr/bin/env node
/* ==========================================================================
   kehillah/test/run.js, Kehillah's own tests. KD-001 onward.
   --------------------------------------------------------------------------
   Dependency-free, like coach/test/run.js: node only, a fake localStorage.
   Also run in CI beside the SPARKS suite.

     node kehillah/test/run.js
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

function fakeStorage(seed) {
  const store = Object.assign({}, seed || {});
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, store };
}
function fresh(seed) {
  delete require.cache[require.resolve(A('shared/store.js'))];
  global.localStorage = fakeStorage(seed);
  return { Store: require(A('shared/store.js')), s: global.localStorage };
}
function done() { delete global.localStorage; }
const Money = require(A('shared/money.js'));
const Tables = require(A('shared/tables.js'));
const T = Tables.loadSync();
const Demo = require(A('shared/demo.js'));
const Timeline = require(A('engines/timeline.js'));
const Year = require(A('engines/year.js'));
const Tzedakah = require(A('engines/tzedakah.js'));
const Protections = require(A('engines/protections.js'));
const Family = require(A('engines/family.js'));
const Care = require(A('engines/care.js'));
const Loan = require(A('engines/loan.js'));
const TODAY = '2026-09-26';
const PAGES = ['about', 'book', 'care', 'chosen-family', 'elul', 'family', 'gemach', 'index', 'resources', 'tzedakah', 'work-with-me', 'year'];
const TOOLS = ['year', 'tzedakah', 'chosen-family', 'family', 'care', 'gemach', 'elul', 'resources'];
const SCRIPT = { index: 'page-home.js', 'work-with-me': 'page-work.js' };

/* ======================================================================
   A separate app (KD-001)
   ====================================================================== */
section('A separate app (KD-001, D-340)');
{
  const V = require(A('tools/vendor.js'));
  const drift = V.FILES.filter(f => !fs.existsSync(path.join(ROOT, f)) || !fs.existsSync(A(f)) || Buffer.compare(fs.readFileSync(path.join(ROOT, f)), fs.readFileSync(A(f))) !== 0);
  checkTrue('every vendored copy is byte-identical to SPARKS (' + V.FILES.length + ' files; run node kehillah/tools/vendor.js)', drift.length === 0, drift.join(', '));
  checkTrue('the spine, ownership, schema and every SPARKS engine are not carried', ['shared/spine-v2.js', 'shared/ownership.js', 'shared/schema.js', 'shared/registry.js', 'engines/tier0.js'].every(f => !fs.existsSync(A(f))));
  const outside = [];
  const files = [];
  (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); } else if (/\.(js|html|css|json|md)$/.test(e.name)) files.push(p); }); })(APP);
  files.filter(p => /\.(js|html|css)$/.test(p) && p.indexOf(path.join(APP, 'test')) !== 0 && p.indexOf(path.join(APP, 'tools')) !== 0).forEach(p => {
    const t = fs.readFileSync(p, 'utf8');
    (t.match(/require\('([^']+)'\)/g) || []).forEach(r => { const rel = r.slice(9, -2); if (rel[0] === '.' && path.resolve(path.dirname(p), rel).indexOf(APP) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
    (t.match(/(?:src|href)="([^"#?]+)"/g) || []).forEach(r => { const rel = r.replace(/^(src|href)="/, '').replace(/"$/, ''); if (!/^(https?:|mailto:)/.test(rel) && /\.(js|css|svg|woff2)$/.test(rel) && path.resolve(path.dirname(p), rel).indexOf(APP) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
  });
  checkTrue('nothing in kehillah/ loads a script, style or font from outside kehillah/', outside.length === 0, outside.join('; '));
  const pages = fs.readdirSync(APP).filter(f => f.endsWith('.html')).map(f => f.replace(/\.html$/, '')).sort();
  check('twelve pages and nothing more', pages.join(), PAGES.join());
  pages.forEach(p => {
    const t = fs.readFileSync(A(p + '.html'), 'utf8');
    checkTrue(p + '.html refuses every frame and every other origin, and runs no inline script', /frame-src 'none'/.test(t) && /default-src 'self'/.test(t) && /script-src 'self';/.test(t) && !/<script>/.test(t));
    checkTrue(p + '.html marks its inputs built once (D-034)', /LIVE-FORM: built once/.test(t));
    checkTrue(p + '.html opts into the theme with <body class="slaf">', /<body class="slaf">/.test(t));
    checkTrue(p + '.html wears the header and the site foot', /id="head"/.test(t) && /id="sitefoot"/.test(t));
    if (TOOLS.indexOf(p) !== -1) checkTrue(p + '.html, a tool, has the words fold and the call to action', /id="words"/.test(t) && /id="cta"/.test(t));
    checkTrue(p + '.html carries link-preview tags with absolute addresses', /og:title/.test(t) && /og:image" content="https:\/\//.test(t) && new RegExp('og:url" content="https://[^"]+/' + p + '\\.html"').test(t));
    checkTrue(p + '.html has a description for the link preview', /<meta name="description" content="[^"]{40,}"/.test(t));
    /* Every script tag resolves, and the page script is the last one. */
    const scripts = (t.match(/<script src="([^"]+)"><\/script>/g) || []).map(s => s.replace(/<script src="|"><\/script>/g, ''));
    checkTrue(p + '.html: every script exists', scripts.every(s => fs.existsSync(A(s))), scripts.filter(s => !fs.existsSync(A(s))).join(', '));
    const pageJs = SCRIPT[p] || 'page-' + p + '.js';
    check(p + '.html loads its own page script last', scripts[scripts.length - 1], pageJs);
    /* Every engine the page script names is loaded by a script tag before it. */
    const js = fs.readFileSync(A(pageJs), 'utf8');
    const ENGINES = { Timeline: 'engines/timeline.js', Year: 'engines/year.js', Tzedakah: 'engines/tzedakah.js', Protections: 'engines/protections.js', Family: 'engines/family.js', Care: 'engines/care.js', Loan: 'engines/loan.js' };
    Object.keys(ENGINES).forEach(k => { if (new RegExp('SLAF\\.' + k + '\\.').test(js)) checkTrue(p + '.html loads ' + ENGINES[k] + ' for its script', scripts.indexOf(ENGINES[k]) !== -1); });
    /* Every static id the page script asks for is in the page (the ids it builds itself are prefixed). */
    const ids = new Set((t.match(/ id="([^"]+)"/g) || []).map(m => m.slice(5, -1)));
    const asked = (js.match(/K\.el\('([a-z0-9-]+)'\)/g) || []).map(m => m.slice(6, -2)).filter(id => !/^(s[1-4]|c[1-3]|line-|it-|cov-|nm-|after-|row-|urg-|g-)/.test(id) || /^g-(cause|label|cents|date|level|note|add|say)$/.test(id) || /^row-(try|tries)$/.test(id)).filter(id => !(p === 'work-with-me' && /^(hero-|for-whom|about-|values|where-body|doors)/.test(id)));
    const missing = asked.filter(id => !ids.has(id));
    checkTrue(p + '.html has every id its script asks for', missing.length === 0, missing.join(', '));
  });
  /* No source names a SPARKS key, an em dash, or the |0 guard. */
  const EM = '—';
  files.forEach(p => {
    const t = fs.readFileSync(p, 'utf8'); const rel = path.relative(ROOT, p);
    if (/\.(js|html|css)$/.test(p) && rel.indexOf('kehillah/shared/money.js') !== 0 && rel.indexOf('kehillah/shared/theme.css') !== 0) checkTrue(rel + ' names no SPARKS storage key', !/['"]slaf\.[a-z]/.test(t));
    /* The log's headings follow the SPARKS template, which sets the title off with a dash; the test file names the character. */
    const prose = /DECISIONS\.md$/.test(p) ? t.replace(/^## KD-\d{3} .*$/gm, '') : t;
    if (!/test\/run\.js$/.test(p)) checkTrue(rel + ' carries no em dash (D-321)', prose.indexOf(EM) === -1 && !/&mdash;|\\u2014/.test(prose));
    if (/\.js$/.test(p) && rel.indexOf('kehillah/shared/money.js') !== 0 && !/test\/run\.js$/.test(p)) checkTrue(rel + ' never turns a blank into a number with || 0', !/\|\|\s*0\b/.test(t));
    checkTrue(rel + ' carries no DD- reference', !/\bDD-\d{3}\b/.test(t));
  });
  /* Every innerHTML that concatenates a variable goes through esc(). */
  files.filter(p => /page-.*\.js$|kehillah\.js$/.test(p)).forEach(p => {
    /* page-home.js is also loaded by work-with-me.html for its renderers; the asked-ids check above already skips the home-only ids there. */
    const t = fs.readFileSync(p, 'utf8');
    /* Only what reaches innerHTML: a statement is a chunk ending in ';' at a line end. */
    const chunks = t.split(/;\s*\n/).filter(c => /innerHTML/.test(c));
    const bad = [];
    chunks.forEach(c => (c.match(/\+ *[a-zA-Z_.]+(\.[a-zA-Z_]+)* *\+/g) || []).forEach(m => { if (/\b(label|plain|name|note|url|q|hint|where|area|reason)\b/.test(m)) bad.push(m); }));
    checkTrue(path.relative(ROOT, p) + ' escapes every text it concatenates into markup', bad.length === 0, bad.slice(0, 5).join(' | '));
  });
}

/* ======================================================================
   The tables (KD-001): year-versioned, sourced, integer cents
   ====================================================================== */
section('The tables');
{
  Object.keys(Tables.FILES).forEach(k => {
    const t = T[k];
    ['id', 'version', 'asOf', 'source', 'confidence', 'confidenceNote'].forEach(f => checkTrue('data/' + Tables.FILES[k] + ' carries ' + f, typeof t[f] === 'string' && t[f].length > 0));
    /* Every *Cents value is an integer or null. */
    const bad = [];
    (function walk(x, at) { if (Array.isArray(x)) x.forEach((v, i) => walk(v, at + '[' + i + ']')); else if (x && typeof x === 'object') Object.keys(x).forEach(j => { if (/Cents$/.test(j) && x[j] !== null && !Number.isInteger(x[j])) bad.push(at + '.' + j); walk(x[j], at + '.' + j); }); })(t, k);
    checkTrue('data/' + Tables.FILES[k] + ': every cents figure is an integer or null', bad.length === 0, bad.join(', '));
  });
  checkTrue('the year file names a year and a leap year flag', T.year.year === 5787 && T.year.leapYear === true);
  const hs = T.year.holidays;
  checkTrue('the holidays are in date order and inside the year', hs.every((h, i) => i === 0 || h.starts > hs[i - 1].starts) && hs[0].eve === T.year.starts && hs[hs.length - 1].eve === T.year.ends);
  const by = {}; hs.forEach(h => { by[h.id] = h; });
  check('Rosh Hashanah 5787 begins the evening of 11 September 2026', by['rosh-hashanah'].eve, '2026-09-11');
  check('Yom Kippur is nine days after the first day', by['yom-kippur'].starts, '2026-09-21');
  check('Pesach runs eight days', Math.round((new Date(by.pesach.ends) - new Date(by.pesach.starts)) / 86400000) + 1, 8);
  check('Hanukkah runs eight days', Math.round((new Date(by.hanukkah.ends) - new Date(by.hanukkah.starts)) / 86400000) + 1, 8);
  checkTrue('Purim is in the second Adar, a month later than a common year', by.purim.starts === '2027-03-23' && /second Adar/.test(by.purim.plain));
  T.year.lines.forEach(l => { checkTrue('year line ' + l.id + ' names a holiday that exists or none', l.holiday === null || !!by[l.holiday]); checkTrue('year line ' + l.id + ' has a kind', ['year', 'month', 'week'].indexOf(l.kind) !== -1); checkTrue('year line ' + l.id + ': low <= start <= high, or no start', l.startCents === null || (l.startCents >= l.lowCents && l.startCents <= l.highCents)); });
  check('the ladder has eight rungs', T.tzedakah.ladder.length, 8);
  check('the rungs are 1 to 8, each once', T.tzedakah.ladder.map(l => l.level).sort().join(), '1,2,3,4,5,6,7,8');
  checkTrue('the three rates are a twentieth-ish, a tenth and a fifth', T.tzedakah.rates.map(r => r.rate).join() === '0.05,0.1,0.2');
  T.protections.papers.forEach(p => checkTrue('paper ' + p.id + ' is urgent for shapes that exist', p.urgentFor.every(s => T.protections.shapes.some(x => x.id === s))));
  checkTrue('every path in the family table has ranges in order', T.family.paths.every(p => p.perTryLowCents <= p.perTryHighCents && p.onceLowCents <= p.onceHighCents && p.triesLow <= p.triesHigh));
  checkTrue('the adoption credit is a plausible federal figure', T.family.adoptionCreditCents > 1500000 && T.family.adoptionCreditCents < 2000000);
  checkTrue('the HSA family limit is above the individual one', T.care.hsa.familyCents > T.care.hsa.individualCents);
  checkTrue('every resource has an https address or a relative one', T.resources.groups.every(g => g.items.every(i => /^https:\/\/|^\.\.\//.test(i.url))));
  checkTrue('every word has a term and one sentence', T.words.words.every(w => w.length === 2 && w[0].length > 0 && w[1].length > 10));
  const PR = T.practice;
  checkTrue('the practice names the person, the pronouns, the practice and the toolkit', PR.person.name === 'Eli Saperstein' && PR.person.pronouns === 'he/him' && PR.practice.name === 'Stress Less About Money' && PR.practice.toolkit === 'Kehillah');
  checkTrue('no price is invented: the free call is 0, every other service is null until the owner sets it', PR.services.every(s => s.id === 'call' ? s.priceCents === 0 : s.priceCents === null || Number.isInteger(s.priceCents)));
  checkTrue('the booking address is blank or https', PR.booking.url === '' || /^https:\/\//.test(PR.booking.url));
  checkTrue('the booking email is blank or an address', PR.booking.email === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(PR.booking.email));
  checkTrue('every tool has its own call-to-action line', TOOLS.every(t => typeof PR.toolCtas[t] === 'string' && PR.toolCtas[t].length > 20));
  checkTrue('there are no testimonials until real ones exist', !PR.testimonials || PR.testimonials.length === 0);
  checkTrue('the nav names every tool and every selling page', (() => { const src = fs.readFileSync(A('kehillah.js'), 'utf8'); return TOOLS.filter(t => t !== 'resources').every(t => src.indexOf("href: '" + t + ".html'") !== -1) && ['work-with-me', 'about', 'resources', 'book'].every(t => src.indexOf("href: '" + t + ".html'") !== -1); })());
  checkTrue('the link-preview picture exists and is a PNG', fs.existsSync(A('og.png')) && fs.readFileSync(A('og.png')).slice(1, 4).toString() === 'PNG');
}

/* ======================================================================
   The store (KD-002)
   ====================================================================== */
section('The store (KD-002)');
{
  const { Store, s } = fresh();
  const e = Store.empty();
  const nulls = [];
  (function walk(x, at) { if (Array.isArray(x)) return; if (x && typeof x === 'object') Object.keys(x).forEach(j => { if (/Cents$/.test(j) && x[j] !== null) nulls.push(at + '.' + j); walk(x[j], at + '.' + j); }); })(e, 'plan');
  checkTrue('a fresh plan has every money field null, never 0', nulls.length === 0, nulls.join(', '));
  check('the key is a kehillah key', Store.KEY, 'kehillah.plan.v1');
  check('nothing is stored until something is set', s.getItem(Store.KEY), null);
  Store.set('care.items.top.cents', 1100000);
  check('set writes a nested path', Store.get('care.items.top.cents'), 1100000);
  check('get of a path never set is null', Store.get('care.items.bottom.cents'), null);
  Store.set('care.items.top.cents', null);
  check('a cleared box is null again, not 0', Store.get('care.items.top.cents'), null);
  Store.set('year.lines.dues', 0);
  check('a typed zero stays zero', Store.get('year.lines.dues'), 0);
  checkTrue('every write stamps updated', typeof Store.load().updated === 'string');
  const old = Store.withDefaults({ v: 1, year: { lines: { dues: 5 } } });
  checkTrue('an older shape opens with its missing branches filled', old.year.lines.dues === 5 && old.year.savedCents === null && old.care.items && old.elul.yearly);
  check('a fresh plan is not the demo', Store.isDemo(), false);
  Store.save(Store.withDefaults(Demo.build()));
  check('the demo is marked while it is in', Store.isDemo(), true);
  Store.clear();
  check('clear forgets everything', s.getItem(Store.KEY), null);
  check('and the plan after clear is empty', Store.get('care.items.top.cents'), null);
  done();
}

/* ======================================================================
   The timeline (KD-003): one function for every "there by"
   ====================================================================== */
section('The timeline (KD-003)');
{
  check('nothing entered is incomplete, not a date', Timeline.monthsTo({}).status, 'incomplete');
  check('a target with no saved amount is incomplete', Timeline.monthsTo({ targetCents: 100 }).status, 'incomplete');
  const r = Timeline.monthsTo({ targetCents: 1000000, savedCents: 100000, monthlyCents: 100000, from: TODAY });
  check('nine months to close a $9,000 gap at $1,000 a month', r.value.months, 9);
  check('the date is nine months from today', r.value.date, '2027-06-26');
  check('the share is saved over target', r.value.share, 0.1);
  const p = Timeline.monthsTo({ targetCents: 1000000, savedCents: 100000, from: TODAY });
  checkTrue('without a monthly amount: the gap, no date, and it says so', p.status === 'ok' && p.partial === true && p.value.months === null && p.value.gapCents === 900000);
  const z = Timeline.monthsTo({ targetCents: 1000000, savedCents: 100000, monthlyCents: 0, from: TODAY });
  checkTrue('a typed zero a month is zero: no date, and it says so', z.partial === true && z.value.months === null && /nothing set aside/.test(z.reason));
  const d = Timeline.monthsTo({ targetCents: 500, savedCents: 500, from: TODAY });
  checkTrue('saved covers it: zero months, today', d.value.months === 0 && d.value.date === TODAY && d.value.share === 1);
  check('a zero target is fully covered', Timeline.monthsTo({ targetCents: 0, savedCents: 0, from: TODAY }).value.share, 1);
  check('monthlyFor rounds up', Timeline.monthlyFor({ targetCents: 1000000, savedCents: 100000, months: 7 }).value, 128572);
  check('monthlyFor with no months is incomplete', Timeline.monthlyFor({ targetCents: 1, savedCents: 0, months: 0 }).status, 'incomplete');
}

/* ======================================================================
   The year (KD-003)
   ====================================================================== */
section('The year (KD-003)');
{
  const e = Year.read(T.year, {}, TODAY);
  check('nothing entered: the total is incomplete, not 0', e.totalCents.status, 'incomplete');
  check('and the monthly figure is null', e.monthlyCents, null);
  check('every line is blank', e.blank, T.year.lines.length);
  checkTrue('the next holiday is still found with nothing entered', e.next && e.next.holiday.id === 'sukkot');
  check('Sukkot begins today, the 26th: zero days', e.next.days, 0);
  check('Rosh Hashanah and Yom Kippur have passed', e.passed.join(), 'rosh-hashanah,yom-kippur');
  const one = Year.read(T.year, { shabbat: 4000 }, TODAY);
  check('a weekly line counts fifty-two times', one.totalCents.value, 208000);
  check('and is spread a twelfth a month over the window', one.byMonth.reduce((s, m) => s + m.cents, 0), one.byMonth.length * Math.round(208000 / 12));
  const z = Year.read(T.year, { dues: 0 }, TODAY);
  checkTrue('a typed zero is entered, and totals zero', z.entered === 1 && z.totalCents.status === 'ok' && z.totalCents.value === 0);
  const dated = Year.read(T.year, { pesach: 45000 }, TODAY);
  const april = dated.byMonth.filter(m => m.ym === '2027-04')[0];
  checkTrue('a dated line lands in its holiday\'s month', april && april.cents === 45000 && april.names[0] === 'Pesach: the seder and eight days of food');
  const past = Year.read(T.year, { 'hh-food': 18000 }, TODAY);
  checkTrue('a line whose holiday has passed is next paid next year, in its real next month (the window runs to the year\'s end)', past.byMonth[0].cents === 0 && past.byMonth.filter(m => m.ym === '2027-09')[0].cents === 18000);
  check('the window from late September 2026 runs fourteen months, to October 2027', past.byMonth.length, 14);
  check('but never fewer than twelve', Year.read(T.year, {}, '2027-09-15').byMonth.length, 12);
  check('no weekly or monthly line: that figure is null, not 0', Year.read(T.year, { dues: 100 }, TODAY).weeklyMonthlyCents, null);
  check('a weekly line entered: fifty-two of it', Year.read(T.year, { shabbat: 100 }, TODAY).weeklyMonthlyCents, 5200);
  const soon = Year.read(T.year, { 'hh-food': 18000 }, '2026-08-01');
  checkTrue('and from before the holiday it lands in the holiday\'s own month', soon.byMonth.filter(m => m.ym === '2026-09')[0].cents === 18000);
  const D = Year.read(T.year, Demo.build().year.lines, TODAY);
  check('the demo year totals what its lines say', D.totalCents.value, 120000 + 0 + 18000 + 6000 + 15000 + 8000 + 45000 + 3000 + 4000 * 52 + 0 * 12 + 250000 + 60000);
  checkTrue('Year.perYear is the one multiplier', Year.perYear(100, 'week') === 5200 && Year.perYear(100, 'month') === 1200 && Year.perYear(100, 'year') === 100);
}

/* ======================================================================
   Tzedakah (KD-003)
   ====================================================================== */
section('Tzedakah (KD-003)');
{
  const e = Tzedakah.read(T.tzedakah, {}, TODAY, T.year.ends);
  checkTrue('no income: no target, no gap, no pace, and nothing given is 0 gifts', e.targetCents.status === 'incomplete' && e.gapCents === null && e.monthlyCents === null && e.givenCents === 0 && e.count === 0);
  check('a tenth of $78,000 is $7,800', Tzedakah.target(7800000, 0.1).value, 780000);
  check('a rate of 0 is a target of 0, not incomplete', Tzedakah.target(7800000, 0).value, 0);
  check('months left to the end of 5787 from late September 2026', Tzedakah.monthsLeft(T.year.ends, TODAY), 13);
  const r = Tzedakah.read(T.tzedakah, { incomeCents: 7800000, rate: 0.1, gifts: [{ cents: 18000, level: 2, cause: 'queer-jewish' }, { cents: 0, level: null, cause: 'other' }, { cents: null, cause: 'other' }] }, TODAY, T.year.ends);
  checkTrue('a gift of 0 counts as a gift; a gift with no amount does not', r.count === 2 && r.givenCents === 18000);
  check('the gap is target minus given', r.gapCents, 762000);
  check('the pace is the gap over the months left, rounded up', r.monthlyCents, Math.ceil(762000 / 13));
  check('the share is given over target', Math.round(r.share * 10000), Math.round(18000 / 780000 * 10000));
  checkTrue('the ladder counts only gifts with a rung', r.ladder[2] === 1 && Object.keys(r.ladder).length === 1 && r.highestLevel === 2);
  check('a cause with no gifts is not listed; the zero gift\'s cause is', r.byCause.length, 2);
  const over = Tzedakah.read(T.tzedakah, { incomeCents: 100000, rate: 0.1, gifts: [{ cents: 20000 }] }, TODAY, T.year.ends);
  checkTrue('giving past the target: gap 0, share capped at 1', over.gapCents === 0 && over.share === 1 && over.monthlyCents === 0);
}

/* ======================================================================
   The papers (KD-003)
   ====================================================================== */
section('The papers (KD-003)');
{
  const e = Protections.read(T.protections, {});
  checkTrue('nothing marked: every paper is unanswered, none assumed', e.unanswered === T.protections.papers.length && e.done === 0 && e.todo === 0 && e.share === null);
  check('and the cost of what is left is incomplete, not $0', e.costLowCents.status, 'incomplete');
  checkTrue('without a shape nothing is urgent', e.rows.every(r => !r.urgent) && e.urgentTodo.length === 0);
  const r = Protections.read(T.protections, { shape: 'partnered', status: { will: 'todo', poa: 'done', guardianship: 'na', beneficiaries: 'todo', junk: 'done', hipaa: 'maybe' } });
  checkTrue('counts: one done, two to do, one n/a, the rest unanswered; an unknown status is unanswered', r.done === 1 && r.todo === 2 && r.na === 1 && r.unanswered === T.protections.papers.length - 4);
  check('urgent and not done, for a partnered household', r.urgentTodo.join(), 'will,beneficiaries');
  checkTrue('the cost of what is left sums the to-do rows only', r.costLowCents.value === 10000 + 0 && r.costHighCents.value === 150000 + 0);
  check('the share is done over done plus to do', r.share, 1 / 3);
  const m = Protections.read(T.protections, { shape: 'married', status: {} });
  checkTrue('a married couple is not urged to a cohabitation agreement, and is urged to a second-parent adoption', !m.rows.filter(x => x.id === 'cohabitation')[0].urgent && m.rows.filter(x => x.id === 'second-parent')[0].urgent);
}

/* ======================================================================
   Making a family (KD-003)
   ====================================================================== */
section('Making a family (KD-003)');
{
  const e = Family.read(T.family, {}, TODAY);
  checkTrue('no path: cost, target and timeline are incomplete', e.path === null && e.costCents.status === 'incomplete' && e.targetCents.status === 'incomplete' && e.timeline.status === 'incomplete');
  const half = Family.read(T.family, { path: 'ivf', perTryCents: 2000000 }, TODAY);
  checkTrue('a per-try path needs tries and the one-time costs too', half.costCents.status === 'incomplete' && half.costCents.missing.indexOf('tries') !== -1 && half.costCents.missing.indexOf('onceCents') !== -1 && half.costCents.missing.indexOf('perTryCents') === -1);
  const r = Family.read(T.family, { path: 'ivf', perTryCents: 2000000, tries: 2, onceCents: 100000, coveredCents: 500000, savedCents: 1000000, monthlyCents: 100000 }, TODAY);
  checkTrue('cost is tries times per try plus once', r.costCents.value === 4100000 && r.creditCents === 0);
  check('the target takes off what is covered', r.targetCents.value, 3600000);
  checkTrue('and the timeline runs on the target', r.timeline.value.months === 26 && r.timeline.value.gapCents === 2600000);
  const a = Family.read(T.family, { path: 'adoption-domestic', onceCents: 4000000, savedCents: 0 }, TODAY);
  checkTrue('an adoption path needs no tries and takes the credit off', a.costCents.value === 4000000 && a.creditCents === T.family.adoptionCreditCents && a.targetCents.value === 4000000 - T.family.adoptionCreditCents);
  const f = Family.read(T.family, { path: 'adoption-foster', onceCents: 0, savedCents: 0 }, TODAY);
  check('the credit cannot push the target below zero', f.targetCents.value, 0);
  const af = Family.read(T.family, { path: 'ivf', afterward: { leave: 800000, 'first-year': null } }, TODAY);
  checkTrue('afterward sums the entered lines only', af.afterwardCents === 800000 && af.afterwardRows.filter(x => x.id === 'first-year')[0].cents === null);
}

/* ======================================================================
   Care (KD-003)
   ====================================================================== */
section('Care (KD-003)');
{
  const e = Care.read(T.care, {}, TODAY);
  checkTrue('nothing entered: out of pocket is incomplete, entered is 0, HSA room is null', e.outOfPocketCents.status === 'incomplete' && e.entered === 0 && e.hsaRoomCents === null);
  const nocov = Care.read(T.care, { items: { top: { cents: 1000000 } } }, TODAY);
  check('a line without covered/not is incomplete: the page must ask', nocov.outOfPocketCents.reason, 'say whether each line is covered');
  const noins = Care.read(T.care, { items: { top: { cents: 1000000, covered: true } } }, TODAY);
  check('a covered line without knowing if you are insured is incomplete', noins.outOfPocketCents.missing.join(), 'insured');
  const nomax = Care.read(T.care, { insured: true, items: { top: { cents: 1000000, covered: true } } }, TODAY);
  check('insured but no maximum entered: incomplete', nomax.outOfPocketCents.missing.join(), 'oopMaxCents');
  const r = Care.read(T.care, { insured: true, oopMaxCents: 700000, items: { top: { cents: 1100000, covered: true }, hrt: { cents: 4000, covered: true }, hair: { cents: 300000, covered: false } } }, TODAY);
  checkTrue('covered lines cap at the maximum, uncovered add in full', r.outOfPocketCents.value === 700000 + 300000 && r.outOfPocketCents.capped === true && r.coveredYearCents === 1100000 + 48000);
  const u = Care.read(T.care, { insured: false, items: { top: { cents: 1100000, covered: true } } }, TODAY);
  check('no insurance: a "covered" line is still paid in full', u.outOfPocketCents.value, 1100000);
  const low = Care.read(T.care, { insured: true, oopMaxCents: 700000, items: { hrt: { cents: 4000, covered: true } } }, TODAY);
  checkTrue('under the maximum, covered lines are paid as they are', low.outOfPocketCents.value === 48000 && low.outOfPocketCents.capped === false);
  const h = Care.read(T.care, { hsa: { type: 'family', soFarCents: 100000 } }, TODAY);
  check('HSA room is the family limit minus what is in', h.hsaRoomCents, T.care.hsa.familyCents - 100000);
  check('HSA with no type has no room figure', Care.read(T.care, { hsa: { type: null, soFarCents: 100000 } }, TODAY).hsaRoomCents, null);
  const n = Care.read(T.care, { insured: false, items: { hrt: { cents: 4000, covered: false } }, names: { court: 21000, passport: null }, savedCents: 0, monthlyCents: 10000 }, TODAY);
  checkTrue('the name change adds to the target and the timeline runs on it', n.namesCents === 21000 && n.namesEntered === 1 && n.targetCents.value === 48000 + 21000 && n.timeline.value.months === 7);
}

/* ======================================================================
   The loan (KD-003)
   ====================================================================== */
section('The loan (KD-003)');
{
  check('nothing: incomplete', Loan.payment(null, 0.1, 12).status, 'incomplete');
  check('$10,000 at 12% over 12 months is $888.49 a month', Loan.payment(1000000, 0.12, 12).value, 88849);
  check('at 0% the payment is the principal over the months, rounded up', Loan.payment(1000000, 0, 36).value, 27778);
  check('no months is incomplete', Loan.payment(1000000, 0, 0).status, 'incomplete');
  const c = Loan.compare({ amountCents: 800000, termMonths: 36, cardApr: 0.249, loanApr: 0.129 });
  checkTrue('a gemach costs exactly what was borrowed', c.gemach.totalCents === 800000 && c.gemach.interestCents === 0);
  checkTrue('the card and the loan cost more, the card most', c.card.interestCents > c.loan.interestCents && c.loan.interestCents > 0);
  check('what the gemach saves against the card is the card\'s interest', c.savedVsCardCents, c.card.interestCents);
  const half = Loan.compare({ amountCents: 800000, termMonths: 36 });
  checkTrue('a blank rate leaves that column out, not at 0%', half.status === 'ok' && half.card === null && half.loan === null && half.gemach.monthlyCents === 22223);
  check('no amount: incomplete', Loan.compare({ termMonths: 36 }).status, 'incomplete');
  check('saving it first: months, rounded up', Loan.waitOrBorrow({ amountCents: 800000, monthlyCents: 30000 }).value, 27);
  check('saving nothing a month: incomplete, not infinity', Loan.waitOrBorrow({ amountCents: 800000, monthlyCents: 0 }).status, 'incomplete');
}

/* ======================================================================
   The demo (KD-002): invented, round, and every engine reads it
   ====================================================================== */
section('The demo');
{
  const D = Demo.build();
  check('the demo is marked as the demo', D.demo, true);
  const cents = [];
  (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') Object.keys(x).forEach(j => { if (/Cents$|^cents$/.test(j) && x[j] !== null) cents.push(x[j]); walk(x[j]); }); })(D);
  checkTrue('every demo figure is whole dollars, none over $500,000', cents.every(c => Number.isInteger(c) && c % 100 === 0 && c < 50000000));
  checkTrue('the demo year, tzedakah, papers, family, care and loan all read as ok', Money.isOk(Year.read(T.year, D.year.lines, TODAY).totalCents) && Money.isOk(Tzedakah.read(T.tzedakah, D.tzedakah, TODAY, T.year.ends).targetCents) && Protections.read(T.protections, D.protections).done > 0 && Money.isOk(Family.read(T.family, D.family, TODAY).timeline) && Money.isOk(Care.read(T.care, D.care, TODAY).timeline) && Loan.compare(D.gemach).status === 'ok');
  checkTrue('the demo has a name and it is not a real person\'s', Demo.names === 'Noa and Sam');
  /* No tracked file in kehillah/ is a plan export: the store key never appears in a data or doc file. */
  const files = []; (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); } else if (/\.(json|md)$/.test(e.name)) files.push(p); }); })(APP);
  checkTrue('no tracked data or doc file is a saved plan', files.every(p => !/"kehillah\.plan\.v1"|"updated":\s*"20/.test(fs.readFileSync(p, 'utf8'))));
}

/* ======================================================================
   The log
   ====================================================================== */
section('The log');
{
  const log = fs.readFileSync(A('DECISIONS.md'), 'utf8');
  const nums = (log.match(/^## KD-(\d{3}) /gm) || []).map(m => Number(m.slice(6, 9)));
  checkTrue('there are KD entries', nums.length >= 5);
  checkTrue('KD numbers are 1..n, in order, none twice', nums.every((n, i) => n === i + 1));
  const long = log.split(/^## /m).slice(1).filter(s => s.split('\n').length > 24).map(s => s.split('\n')[0]);
  checkTrue('every entry is short (the reasoning goes in the commit)', long.length === 0, long.join(', '));
  checkTrue('SPARKS records the lane in D-340', /^## D-340 /m.test(fs.readFileSync(path.join(ROOT, 'DECISIONS.md'), 'utf8')));
  checkTrue('CI runs this suite', /kehillah\/test\/run\.js/.test(fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8')));
  ['README.md', 'STATUS.md', 'DECISIONS.md'].forEach(f => checkTrue('kehillah/' + f + ' exists', fs.existsSync(A(f))));
}

console.log('\n' + passed + ' passed' + (failures.length ? ', ' + failures.length + ' FAILED' : ''));
if (failures.length) { failures.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
