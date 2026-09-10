#!/usr/bin/env node
/* ==========================================================================
   tests/tools/build-lenses-copy.js - writes data/lane2/lenses.copy.json.
   --------------------------------------------------------------------------
   Lane 2, section 4 (DECISIONS.md L-4). For every lens in data/lenses.json:
   `forWhom` and `notForWhom`, one sentence each with no hedging word, and
   a structured `source` (kind, title, author, url). The sentences start
   from the pair the master build already wrote in lenses.json (D-175);
   the four that hedge are rewritten below, the rest are copied. The
   structured source is new. Nothing in lenses.json is changed: DECIDE
   whether shared/lenses.js should read the copy from here (P-7).

   Run:  node tests/tools/build-lenses-copy.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const LENSES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lenses.json'), 'utf8'));
const HEDGE = /\b(maybe|might|could|roughly|probably|perhaps|may|usually|often|sometimes|about|around|likely|tend|tends|generally|mostly|somewhat|fairly|quite|seems?|arguably|typically)\b/i;

/* Rewrites for the sentences that hedge. Same meaning, no hedge word. */
const REWRITE = {
  'fiftythirty.notForWhom': 'High earners in expensive cities: rent alone breaks the 50 for needs, and the 20 is too little.',
  'twentythreeeight.forWhom': 'Anyone financing a car this year.',
  'twentythreeeight.notForWhom': 'Someone paying cash for a car they will keep ten years: the rule is for loans.',
  'rentbuy.notForWhom': 'Someone who will move in under five years: see the 5-year rule.'
};

/* The rule's source as show, book or author, with a URL. */
const SOURCES = {
  "Eli's default (D-172)": { kind: 'app', title: "Eli's default", author: 'Eli', url: 'DECISIONS.md#D-172' },
  "Eli's default (D-173)": { kind: 'app', title: "Eli's default", author: 'Eli', url: 'DECISIONS.md#D-173' },
  "Eli's framework (Return on Hassle)": { kind: 'app', title: 'Return on Hassle', author: 'Eli', url: 'DECISIONS.md#D-066' },
  'Elizabeth Warren, All Your Worth': { kind: 'book', title: 'All Your Worth: The Ultimate Lifetime Money Plan', author: 'Elizabeth Warren and Amelia Warren Tyagi', url: 'https://www.simonandschuster.com/books/All-Your-Worth/Elizabeth-Warren/9780743269889', where: 'Chapter 2, the balanced money formula' },
  'The Money Guy Show': { kind: 'show', title: 'The Money Guy Show', author: 'Brian Preston and Bo Hanson', url: 'https://moneyguy.com/financial-order-of-operations/', where: 'The Financial Order of Operations; the 25% rule; the 20/3/8 car rule; the rate-by-age debt rule' },
  'Ramit Sethi, I Will Teach You to Be Rich': { kind: 'book', title: 'I Will Teach You to Be Rich', author: 'Ramit Sethi', url: 'https://www.iwillteachyoutoberich.com/book/', where: 'Chapter 4, the conscious spending plan' },
  'Vicki Robin and Joe Dominguez': { kind: 'book', title: 'Your Money or Your Life', author: 'Vicki Robin and Joe Dominguez', url: 'https://yourmoneyoryourlife.com/book-summary/', where: 'Step 2, your real hourly wage; step 3, life energy per purchase' },
  'Bill Perkins, Die With Zero': { kind: 'book', title: 'Die With Zero', author: 'Bill Perkins', url: 'https://www.diewithzerobook.com/', where: 'Rule 8, the peak net worth date; rule 3, spend on experiences by age' },
  'convention': { kind: 'convention', title: 'Common practice with no single author', author: null, url: 'https://www.bogleheads.org/wiki/Main_Page', where: 'The Bogleheads wiki is the fullest write-up of the convention' },
  'Dave Ramsey': { kind: 'show', title: 'The Ramsey Show and The Total Money Makeover', author: 'Dave Ramsey', url: 'https://www.ramseysolutions.com/debt/how-the-debt-snowball-method-works', where: 'Baby step 2, the debt snowball' },
  'Bogleheads': { kind: 'community', title: 'Bogleheads wiki, three-fund portfolio', author: 'The Bogleheads', url: 'https://www.bogleheads.org/wiki/Three-fund_portfolio', where: 'The three-fund portfolio page' },
  'convention (Harold Evensky)': { kind: 'convention', title: 'The bucket strategy', author: 'Harold Evensky', url: 'https://www.bogleheads.org/wiki/Bucket_strategy', where: 'Evensky and Katz, Retirement Income Redesigned' },
  'Mr. Money Mustache': { kind: 'blog', title: 'The Shockingly Simple Math Behind Early Retirement', author: 'Mr. Money Mustache (Pete Adeney)', url: 'https://www.mrmoneymustache.com/2012/01/13/the-shockingly-simple-math-behind-early-retirement/', where: 'The 2012 post and its savings rate table' },
  'data/levers.json (D-174)': { kind: 'app', title: 'The lever library', author: 'Eli', url: 'DECISIONS.md#D-174' },
  'data/effective_tax_rates_2026.json': { kind: 'data', title: 'Effective tax rate table', author: 'This repo', url: 'data/effective_tax_rates_2026.json' },
  'data/federal_brackets_2026.json': { kind: 'data', title: 'Federal brackets 2026', author: 'This repo', url: 'data/federal_brackets_2026.json' }
};

const out = {
  id: 'lenses_copy', version: '1.0', asOf: '2026-09-10',
  source: 'For every lens in data/lenses.json: who it is for and who it is not for, one sentence each with no hedging word, and the rule\'s source as show, book or author with a URL. Lane 2, section 4 (L-4).',
  confidence: 'convention',
  confidenceNote: 'Copy, not figures. The pair is the advice translator from the master prompt section 5; a lens without both does not ship.',
  note: 'Generated by tests/tools/build-lenses-copy.js from data/lenses.json; the sentences there are the master build\'s (D-175), four rewritten here to drop a hedging word. Under data/lane2/ until shared/reference.js registers it (docs/lane2-proposals.md P-5). DECIDE: whether shared/lenses.js reads forWhom, notForWhom and source from here (P-7).',
  refresh: { month: 'September', against: 'data/lenses.json: any lens added there needs a row here (tests/glossary.test.js fails otherwise).' },
  hedgeWords: HEDGE.source,
  lenses: LENSES.lenses.map((l) => {
    /* The master build's sentences use an em dash as a colon; this lane's
       copy rule has no em dashes, so it becomes a colon here. */
    const dash = (s) => String(s).replace(/\s*\u2014\s*/g, ': ');
    const forWhom = dash(REWRITE[l.id + '.forWhom'] || l.forWhom);
    const notForWhom = dash(REWRITE[l.id + '.notForWhom'] || l.notForWhom);
    const src = SOURCES[l.source];
    if (!src) throw new Error('No structured source for lens ' + l.id + ': ' + l.source);
    return { id: l.id, domain: l.domain, name: l.name, plain: l.plain, forWhom, notForWhom, source: Object.assign({ asStated: l.source }, src) };
  })
};
fs.mkdirSync(path.join(ROOT, 'data', 'lane2'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'lane2', 'lenses.copy.json'), JSON.stringify(out, null, 2) + '\n');
console.log('wrote data/lane2/lenses.copy.json: ' + out.lenses.length + ' lenses');
