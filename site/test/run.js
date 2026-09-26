#!/usr/bin/env node
/* ==========================================================================
   site/test/run.js, the community front's checks. SD-001. Node only.
   --------------------------------------------------------------------------
     node site/test/run.js
   What it holds the site to: every page carries the same policy line as the
   rooms and no em dash (D-321); every link and script lands on a file that
   exists, every anchor on an id that exists; the site writes no key and
   silently zeroes nothing; the rooms it names are in the registry; and the
   number it shows is the number the room shows, from the one formula.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');

let pass = 0; const fails = [];
function check(name, ok, detail) { if (ok) pass++; else fails.push(name + (detail ? ': ' + detail : '')); }
function read(rel) { return fs.readFileSync(path.join(SITE, rel), 'utf8'); }

const pages = fs.readdirSync(SITE).filter(f => f.endsWith('.html')).sort();
/* Everything that ships, plus the browser walk. This file is the one that
   spells the forbidden strings out, so it is not in its own sweep. */
const files = fs.readdirSync(SITE).filter(f => /\.(html|js|css|md)$/.test(f)).concat(['test/browser.js'].filter(f => fs.existsSync(path.join(SITE, f))));
check('six pages', pages.length === 6, pages.join(','));

const CSP = /<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; worker-src 'self' blob:"\/>/;

/* ---- Every page: the head a room has, the chrome the site has --------- */
pages.forEach(p => {
  const src = read(p);
  check(p + ' has the rooms\' security policy', CSP.test(src));
  check(p + ' has a viewport meta', /<meta name="viewport"/.test(src));
  check(p + ' has a title and a description', /<title>[^<]+<\/title>/.test(src) && /<meta name="description" content="[^"]{40,}"/.test(src));
  check(p + ' is a site page on the theme', /<body class="slaf site">/.test(src) && /shared\/theme\.css/.test(src) && /site\.css/.test(src));
  check(p + ' mounts the header and footer', /id="site-head"/.test(src) && /id="site-foot"/.test(src) && /Site\.head\('/.test(src) && /Site\.foot\(\)/.test(src));
  check(p + ' says what it reads, writes and calls', /READS|Reads nothing/.test(src) && /WRITES|writes nothing/.test(src));
  check(p + ' states its LIVE-FORM rule', /LIVE-FORM: built once/.test(src));
  check(p + ' has one h1', (src.match(/<h1/g) || []).length === 1);
  check(p + ' uses the rooms with a relative path, never root-absolute', !/(href|src)="\/(?!\/)/.test(src));
  /* Inputs ship empty (SPEC 5.1): no value attribute on an input. */
  check(p + ' ships every input empty', !/<input[^>]*\svalue=/.test(src));
});

/* ---- No em dash anywhere on the site (D-321, D-326) -------------------- */
files.forEach(f => {
  const src = read(f);
  const bad = ['—', '\\u2014', '&mdash;', '&#8212;', '&#x2014;'].find(s => src.indexOf(s) !== -1);
  check('site/' + f + ' carries no em dash', !bad, bad && JSON.stringify(src.slice(Math.max(0, src.indexOf(bad) - 40), src.indexOf(bad) + 40)));
});

/* ---- Nothing stored, nothing zeroed ------------------------------------ */
files.filter(f => /\.(html|js)$/.test(f)).forEach(f => {
  const src = read(f);
  check('site/' + f + ' writes no storage key', !/localStorage\.setItem|sessionStorage|document\.cookie|indexedDB/.test(src));
  check('site/' + f + ' has no silent || 0', !/\|\|\s*0\b/.test(src));
  check('site/' + f + ' never hardcodes a demo figure', !/\b(72000|48000|9500|3150)\b/.test(src.replace(/<!--[\s\S]*?-->/g, '')) || f === 'index.html');
});
/* The home page names Robin's salary in prose once; it must be the persona's. */
{
  const Demo = require(path.join(ROOT, 'shared/demo-persona.js'));
  const home = read('index.html');
  const said = (home.match(/\$([\d,]+) salary/) || [])[1];
  check('the home page salary is the persona\'s', said && Number(said.replace(/,/g, '')) === Demo.VALUES.grossAnnualIncome, said);
}

/* ---- Every link and script lands somewhere ----------------------------- */
const REPO = 'https://github.com/sapphirestoneage/Personalfinance';
pages.forEach(p => {
  const src = read(p);
  const refs = [];
  src.replace(/\b(?:href|src)="([^"]+)"/g, (m, u) => { refs.push(u); return m; });
  refs.forEach(u => {
    if (u.indexOf("' +") !== -1) return;              /* a template, filled from the registry at run time */
    if (/^https?:/.test(u)) { check(p + ' external link is the repository only: ' + u, u === REPO); return; }
    if (/^(mailto:|#|javascript:)/.test(u)) { check(p + ' has no such link: ' + u, false); return; }
    const clean = u.split('#')[0].split('?')[0];
    const target = path.join(SITE, clean);
    check(p + ' link exists: ' + u, fs.existsSync(target));
    const hash = u.split('#')[1];
    if (hash && fs.existsSync(target)) {
      const t = fs.readFileSync(target, 'utf8');
      check(p + ' anchor exists: ' + u, new RegExp('id="' + hash + '"').test(t));
    }
  });
});
/* The links site.js writes into the header and footer. */
{
  const js = read('site.js');
  const refs = []; js.replace(/href="' \+ APP \+ '([^"']+)"|href="([^"']+)"/g, (m, a, b) => { refs.push(a !== undefined ? '../' + a : b); return m; });
  js.replace(/'([^']*\.html)'/g, (m, u) => { refs.push(u); return m; });
  const uniq = Array.from(new Set(refs.filter(u => u && !/^https?:/.test(u))));
  check('site.js names at least the six pages and the app', uniq.length >= 8);
  uniq.forEach(u => check('site.js link exists: ' + u, fs.existsSync(path.join(SITE, u.split('#')[0].split('?')[0]))));
}

/* ---- The rooms the site names are in the registry ---------------------- */
{
  const R = require(path.join(ROOT, 'shared/registry.js'));
  const ids = new Set(R.ROOMS.map(r => r.id));
  const tools = read('tools.html');
  const named = []; tools.replace(/id: '([a-z0-9-]+)' \}/g, (m, id) => { named.push(id); return m; });
  check('the questions list has at least twelve entries', named.length >= 12, String(named.length));
  named.forEach(id => check('question room is registered: ' + id, ids.has(id)));
  check('no question names a room twice', new Set(named).size === named.length);
  /* Every group the registry has draws at least one live room, so the
     page's parent lookup covers each group id a room can carry. */
  const parent = {}; R.GROUPS.forEach(g => { (g.subgroups || []).forEach(s => { parent[s.id] = g.id; }); }); R.GROUPS.forEach(g => { parent[g.id] = g.id; });
  R.ROOMS.forEach(r => check('room group is drawable on the site: ' + r.id, !!parent[r.group], r.group));
}

/* ---- The glossary file the page reads has the shape it expects -------- */
{
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/glossary.json'), 'utf8'));
  check('glossary.json has terms', Array.isArray(g.terms) && g.terms.length > 150);
  check('every term has a term, a domain and a plain sentence', g.terms.every(t => t.term && t.domain && t.plain));
  const domains = new Set(g.terms.map(t => t.domain));
  const page = read('glossary.html');
  domains.forEach(d => check('glossary page names the domain: ' + d, new RegExp("'" + d + "'|\\b" + d.replace(/\s/g, '\\s') + ':').test(page)));
}

/* ---- One formula: the number here is the number in the room ----------- */
{
  const Money = require(path.join(ROOT, 'shared/money.js'));
  const Schema = require(path.join(ROOT, 'shared/schema.js'));
  const Fire = require(path.join(ROOT, 'engines/fire.js'));
  const Projection = require(path.join(ROOT, 'engines/projection.js'));
  const Demo = require(path.join(ROOT, 'shared/demo-persona.js'));
  const T = { fireVariants: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/fire_variants.json'), 'utf8')) };
  /* The page's household, built the way number.html builds it. */
  function household(spendCents, investedCents, age) {
    const person = Schema.createPerson({ role: 'adult', dob: age === null ? null : String(new Date().getFullYear() - age) + '-01-01' });
    const assets = investedCents === null ? [] : [Schema.createAsset({ category: 'investment', valueCents: investedCents })];
    return Schema.createHousehold({ people: [person], assets: assets, expenses: { wants: { totalCents: spendCents } } });
  }
  const V = Demo.VALUES;
  const spend = Money.toCents(V.fat.food + V.fat.accommodation + V.fat.transportation + V.fat.wants);
  const demo = Demo.build();
  const site = Fire.calculateFIRE(household(spend, Money.toCents(V.investmentsAndRetirement), Schema.primaryAge(demo)), T);
  const room = Fire.calculateFIRE(demo, T);
  check('the example numbers give the room\'s FIRE number', Money.isOk(site) && Money.isOk(room) && site.value === room.value, (site.value / 100) + ' vs ' + (room.value / 100));
  check('and it is spending times twelve over the withdrawal rate', site.value === Math.round(spend * 12 / Schema.resolveAssumptions(null).swrRate));
  const tiers = Fire.tiers(household(spend, Money.toCents(V.investmentsAndRetirement), 32), T, { coastTargetAge: 65, baristaAnnualIncomeCents: Money.toCents(15000) });
  check('all six sizes come out for the example', Money.isOk(tiers) && tiers.rungs.length === 6, tiers.reason);
  check('the rungs are sorted smallest first', tiers.rungs.every((r, i, a) => i === 0 || a[i - 1].targetCents <= r.targetCents));
  const noSpend = Fire.tiers(household(null, null, null), T, {});
  check('no spending means no number, and a reason', !Money.isOk(noSpend) && /spend|expenses/i.test(noSpend.reason));
  /* The savings-rate table on Learn: more kept, fewer years, always. */
  const RATE = Schema.resolveAssumptions(null).expectedReturnRate, SWR = Schema.resolveAssumptions(null).swrRate, PAY = Money.toCents(100000);
  let last = Infinity, rows = 0;
  [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].forEach(rate => {
    const h = Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult' })], expenses: { wants: { totalCents: Math.round(PAY * (1 - rate) / 12) } } });
    const target = Fire.calculateFIRE(h, T, { localOverrides: { expectedReturnRate: RATE, swrRate: SWR } });
    const yrs = Projection.yearsToTargetCents({ startCents: 0, targetCents: target.value, annualRate: RATE, annualContributionCents: Math.round(PAY * rate), fractional: true });
    check('savings rate ' + rate + ' has a year count', Money.isOk(yrs));
    if (Money.isOk(yrs)) { check('more kept is fewer years at ' + rate, yrs.value < last); last = yrs.value; rows++; }
  });
  check('eight rows of the table', rows === 8);
  const half = Projection.yearsToTargetCents({ startCents: 0, targetCents: Fire.calculateFIRE(household(Math.round(PAY / 24), null, null), T).value, annualRate: RATE, annualContributionCents: PAY / 2, fractional: true });
  check('keeping half of pay is under twenty years at the default return', Money.isOk(half) && half.value < 20, half.value);
}

/* ---- The site's own log ----------------------------------------------- */
{
  const log = read('DECISIONS.md');
  const nums = []; log.replace(/^## SD-(\d{3}) /gm, (m, n) => { nums.push(Number(n)); return m; });
  check('the site log has entries', nums.length >= 1);
  check('SD numbers run 1, 2, 3 with no gap', nums.every((n, i) => n === i + 1), nums.join(','));
  pages.forEach(p => check(p + ' cites an SD entry', /SD-\d{3}/.test(read(p))));
  const readme = read('README.md');
  pages.forEach(p => check('README lists ' + p, readme.indexOf(p) !== -1));
}

console.log('site: ' + pass + ' checks passed' + (fails.length ? ', ' + fails.length + ' failed' : ''));
fails.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
process.exit(fails.length ? 1 : 0);
