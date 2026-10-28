// The tester (bug sweep, step 0): opens every screen of SLAM on the demo household, in three looks (375px light,
// 375px dark, 1280px light), checks what a person would trip on, then taps every button on every page.
//   node tools/qa-crawl.mjs            all of it
//   node tools/qa-crawl.mjs --quick    the screens only, no tapping
//   node tools/qa-crawl.mjs --page calendar.html   one page and what it reaches
// Writes test/qa-report.md. Exits 1 on any error, crash, overflow, null/undefined/NaN text or a tab bar on two rows.
// It serves the slam folder itself on a free port, so nothing else needs to run. Fresh browser storage every time:
// the demo household (made up) is what loads.

import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const ONLY = args.includes('--page') ? args[args.indexOf('--page') + 1] : null;
const DEPTH = 3;
// Pages for the coach, not the client: cents and code fonts are allowed there.
const BUILDER = new Set(['builder.html', 'math.html', 'rules.html', 'house.html', 'affordances.html', 'clients.html']);
// Never tapped: they leave the page, open the file picker or the print dialog, or delete.
const SKIP = /^(delete|open file|print|download|import|send)\b/i;
const LOOKS = [
  { id: '375 light', width: 375, height: 800, scheme: 'light' },
  { id: '375 dark', width: 375, height: 800, scheme: 'dark' },
  { id: '1280 light', width: 1280, height: 900, scheme: 'light' }
];
const FATAL = new Set(['page error', 'console error', 'click error', 'crash', 'overflow', 'bad text', 'tab bar wraps', 'open form', 'placeholder 0']);

// ---------------------------------------------------------------- a small static server
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain' };
function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try {
      const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// ---------------------------------------------------------------- what one screen is checked for (runs in the page)
function inspect({ builder }) {
  const top = !location.hash || location.hash === '#' || location.hash === '#/';
  const out = [];
  const add = (kind, what) => out.push({ kind, what });
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const where = (el) => { const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 50); return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (t ? ' "' + t + '"' : ''); };
  const W = document.documentElement.clientWidth;
  // Overflow: anything past the right edge, unless a scrolling box (a table wrap, a chart marked to scroll) holds it.
  const scrolls = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true; } return false; };
  const over = [...document.body.querySelectorAll('*')].filter((el) => visible(el) && el.getBoundingClientRect().right > W + 1 && !scrolls(el) && !el.closest('[data-scroll]'));
  for (const el of over) if (!over.includes(el.parentElement)) add('overflow', where(el) + ' ends at ' + Math.round(el.getBoundingClientRect().right) + 'px of ' + W);
  if (document.documentElement.scrollWidth > W + 1 && !over.length) add('overflow', 'the page scrolls sideways (' + document.documentElement.scrollWidth + 'px)');
  // Words that should never show.
  // Closed menus (the editor's ⋯) hide their words from innerText, so their text is read too.
  const text = document.body.innerText + '\n' + [...document.querySelectorAll('details:not([open]) > :not(summary)')].map((el) => el.textContent).join('\n');
  for (const [re, w] of [[/\bundefined\b/, 'undefined'], [/\bNaN\b/, 'NaN'], [/\bnull\b/, 'null'], [/\[object/, '[object'], [/\bInfinity\b/, 'Infinity'], [/—/, 'an em dash'], [/\b(127\.0\.0\.1|localhost):\d+/, 'the app\'s own address']]) {
    const m = text.match(re);
    if (m) { const i = text.indexOf(m[0]); add('bad text', w + ': "' + text.slice(Math.max(0, i - 40), i + 30).replace(/\s+/g, ' ') + '"'); }
  }
  // Cents outside Show the math, the Builder and the log.
  if (!builder) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const m = n.nodeValue.match(/\$\s?[\d,]+\.\d{2}\b/);
      if (!m || !n.parentElement || !visible(n.parentElement) || n.parentElement.closest('.math-panel, .math-page, .log-list, .log, [data-cents]')) continue;
      if (seen.has(m[0])) continue; seen.add(m[0]);
      add('cents', m[0] + ' in ' + where(n.parentElement));
    }
    // A date in its stored form (2027-02-28) in words a client reads (overnight round 1): reported, not blocking.
    const dw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = dw.nextNode(); n; n = dw.nextNode()) {
      const m = n.nodeValue.match(/\b20\d\d-\d\d-\d\d\b/);
      if (!m || !n.parentElement || !visible(n.parentElement) || n.parentElement.closest('.math-panel, .math-page, .log-list, .log, .ch-table, input, textarea, [data-cents], [data-sample]')) continue;
      add('raw date', m[0] + ' in ' + where(n.parentElement));
    }
  }
  const fields = [...document.querySelectorAll('input, select, textarea')].filter((el) => visible(el) && !['hidden', 'submit', 'button'].includes(el.type));
  for (const el of fields) {
    if (el.getAttribute('placeholder') !== null && /^\$?\s*0([.,]0+)?$/.test(el.getAttribute('placeholder').trim())) add('placeholder 0', where(el));
    // A placeholder that reads like a typed number ("500", "$") is mistaken for a value; use "e.g. 500".
    else if (!builder && el.getAttribute('placeholder') !== null && /^[$\d][\d,.$]*$/.test(el.getAttribute('placeholder').trim())) add('placeholder looks typed', where(el));
    const named = (el.labels && el.labels.length) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');
    if (!named) add('no label', where(el));
  }
  // A control hidden from everyone but the page (a list box a picker stands in for) is not a tap target.
  const taps = [...document.querySelectorAll('button, [role=button], a.btn, summary, select, input:not([type=hidden]), .go-row, .tabbar a')].filter(visible).filter((el) => !el.closest('[aria-hidden="true"]'));
  for (const el of taps) {
    if (el.matches('button, [role=button]') && !(el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby'))) add('no name', where(el));
    // A checkbox or radio is tapped by its label.
    // A control whose ::after covers its box (a calendar day) is tapped anywhere in that box.
    const after = getComputedStyle(el, '::after');
    const target = el.matches('input[type=checkbox], input[type=radio], input.sr-only') ? el.closest('label') || (el.labels && el.labels[0]) || el
      : after.content !== 'none' && after.position === 'absolute' && after.top === '0px' && after.bottom === '0px' && el.offsetParent ? el.offsetParent : el;
    // Layout height, so a pressed sample drawn a little smaller (a transform) is measured as laid out.
    // A ::after that reaches past the control (inset: -11px) widens its tap area by that much.
    const grow = target === el && after.content !== 'none' && after.position === 'absolute' && parseFloat(after.top) < 0 ? -parseFloat(after.top) - parseFloat(after.bottom) : 0;
    if ((target.offsetHeight || target.getBoundingClientRect().height) + grow < 43.5) add('small tap', where(el) + ' is ' + Math.round(target.offsetHeight || target.getBoundingClientRect().height) + 'px tall');
  }
  if (!builder) {
    const mono = new Set();
    for (const el of document.body.querySelectorAll('*')) {
      if (!el.childNodes.length || ![...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim()) || !visible(el) || el.closest('pre, code, .math-panel')) continue;
      const f = getComputedStyle(el).fontFamily.toLowerCase();
      if (/mono|courier|menlo|consolas/.test(f.split(',')[0])) mono.add(where(el));
    }
    for (const w of [...mono].slice(0, 5)) add('monospace', w);
  }
  // Forms never sit open (slim by default): on a page's top screen, an add form or an editor nobody opened is a finding.
  if (top && !builder) for (const f of [...document.querySelectorAll('form.add-form, form.editor, .editor form')].filter((f) => visible(f) && !f.closest('[data-main-form]'))) add('open form', where(f));
  const bar = document.querySelector('.tabbar');
  if (bar) { const tops = new Set([...bar.querySelectorAll('a, button')].filter(visible).map((x) => Math.round(x.getBoundingClientRect().top))); if (tops.size > 1) add('tab bar wraps', tops.size + ' rows'); }
  const links = [...document.querySelectorAll('a[href]')].filter(visible).map((a) => a.href);
  return { findings: out, links };
}

// ---------------------------------------------------------------- the crawl
const findings = [];
const note = (screen, look, kind, what) => findings.push({ screen, look, kind, what });

const OPEN_FOLDS = ['debt-payoff', 'pay-charts', 'tax-brackets', 'fi-charts', 'cal-chart', 'scenario-chart', 'session-notes'];
async function open(browser, look, url) {
  const ctx = await browser.newContext({ viewport: { width: look.width, height: look.height }, colorScheme: look.scheme });
  // The folds that hold charts start open (overnight round 1: a wide chart inside a closed fold went unseen).
  await ctx.addInitScript((ids) => { try { if (!localStorage.getItem('slam-open:v1')) localStorage.setItem('slam-open:v1', JSON.stringify(ids)); } catch {} }, OPEN_FOLDS);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(['page error', e.message]));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(['console error', m.text()]); });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  try { await page.goto(url, { waitUntil: 'load', timeout: 15000 }); await settle(page); }
  catch (e) { errors.push(['crash', e.message.split('\n')[0]]); }
  return { ctx, page, errors };
}
async function settle(page) { await page.waitForLoadState('load').catch(() => {}); await page.waitForTimeout(450); }

const screenName = (base, url) => { const u = new URL(url); return u.pathname.replace(/^\//, '') + (u.hash || ''); };

// Routes that differ only by a date or an id are one kind of screen: two of each are enough (all 60 calendar days
// would say the same thing 60 times).
const PER_PATTERN = 2;
// A pattern is the page, the route's first part and how deep it goes: ledger.html#/debt/credit-cards/visa and
// .../store are one pattern; so are two field links in the same section.
const patternOf = (u) => {
  const parts = decodeURIComponent(u.hash.replace(/^#\/?/, '')).replace(/\d{4}-\d{2}(-\d{2})?/g, 'DATE').split(/[./]/).filter(Boolean);
  // Pages that are lists of like rows (a formula, a rule, an assumption each): one pattern per depth.
  if (ROW_PAGES.test(u.pathname)) return u.pathname + '#:' + parts.length;
  return u.pathname + '#' + (parts[0] || '') + ':' + parts.length;
};
const ROW_PAGES = /\/(math|rules|house|assumptions)\.html$/;

async function crawl(browser, base) {
  const files = (await readdir(ROOT)).filter((f) => f.endsWith('.html') && (!ONLY || f === ONLY));
  // Two field screens, so a row's editor and its ⋯ menu get tapped too (a guessed row's menu printed "[object").
  if (!ONLY || ONLY === 'ledger.html') files.push('ledger.html#/income/paychecks-w-2/salary', 'ledger.html#/debt/credit-cards/visa');
  const queue = files.map((f) => ({ url: base + f, depth: 0 })), seen = new Set(queue.map((q) => q.url));
  const patterns = new Map();
  const screens = [];
  // One tab per look, reused: viewing a screen does not change the household, and a fresh tab costs a second.
  const tabs = await Promise.all(LOOKS.map(async (look) => {
    const ctx = await browser.newContext({ viewport: { width: look.width, height: look.height }, colorScheme: look.scheme });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(['page error', e.message]));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(['console error', m.text()]); });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    return { look, ctx, page, errors };
  }));
  while (queue.length) {
    const { url, depth } = queue.shift();
    screens.push(url);
    if (screens.length % 20 === 0) process.stdout.write('  ' + screens.length + ' screens, ' + queue.length + ' queued\n');
    for (const tab of tabs) {
      const { look, page, errors } = tab;
      errors.length = 0;
      try { await page.goto('about:blank'); await page.goto(url, { waitUntil: 'load', timeout: 15000 }); await settle(page); } catch (e) { errors.push(['crash', e.message.split('\n')[0]]); }
      const file = new URL(url).pathname.split('/').pop() || 'index.html';
      let res = { findings: [], links: [] };
      try { res = await page.evaluate(inspect, { builder: BUILDER.has(file) }); } catch (e) { errors.push(['crash', e.message.split('\n')[0]]); }
      const name = screenName(base, url);
      for (const [k, w] of errors) note(name, look.id, k, w);
      for (const f of res.findings) note(name, look.id, f.kind, f.what);
      if (look === LOOKS[0] && depth < DEPTH) for (const l of res.links) {
        const u = new URL(l);
        if (u.origin !== new URL(base).origin || !u.pathname.endsWith('.html')) continue;
        const key = u.origin + u.pathname + u.hash, pat = patternOf(u);
        if (seen.has(key) || (patterns.get(pat) || 0) >= PER_PATTERN) continue;
        seen.add(key); patterns.set(pat, (patterns.get(pat) || 0) + 1);
        queue.push({ url: key, depth: depth + 1 });
      }
    }
  }
  for (const t of tabs) await t.ctx.close();
  return screens;
}

// Every enabled button, summary and role=button on each page, from fresh storage; a tap that changes nothing is dead.
async function tapAll(browser, base) {
  const files = (await readdir(ROOT)).filter((f) => f.endsWith('.html') && (!ONLY || f === ONLY));
  let taps = 0;
  const look = LOOKS[0];
  for (const f of files) {
    const url = base + f;
    let { ctx, page, errors } = await open(browser, look, url);
    const list = () => page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      return [...document.querySelectorAll('button:not([disabled]), summary, [role=button]:not([aria-disabled=true])')].filter(vis).map((el, i) => ({ i, text: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60), on: el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-current') !== null }));
    }).catch(() => []);
    const count = (await list()).length;
    for (let i = 0; i < count; i++) {
      const items = await list();
      const it = items[i];
      if (!it || SKIP.test(it.text)) continue;
      const before = await page.evaluate(() => location.href + '\n' + document.body.innerHTML).catch(() => '');
      errors.length = 0;
      taps++;
      try {
        await page.evaluate((n) => {
          const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
          const el = [...document.querySelectorAll('button:not([disabled]), summary, [role=button]:not([aria-disabled=true])')].filter(vis)[n];
          el.click();
        }, i);
        await page.waitForTimeout(350);
      } catch (e) { errors.push(['click error', e.message.split('\n')[0]]); }
      const after = await page.evaluate(() => location.href + '\n' + document.body.innerHTML).catch(() => null);
      for (const [k, w] of errors) note(f, look.id, k === 'page error' || k === 'console error' ? 'click error' : k, '"' + it.text + '": ' + w);
      if (after === before && !it.on) note(f, look.id, 'dead click', '"' + it.text + '"');
      // What a tap opens (an editor and its closed ⋯ menu) is read for words that should never show.
      const shown = await page.evaluate(() => document.body.innerText + '\n' + [...document.querySelectorAll('details:not([open]) > :not(summary)')].map((el) => el.textContent).join('\n')).catch(() => '');
      const junk = shown.match(/\[object \w+\]|\bundefined\b|\bNaN\b/);
      if (junk) note(f, look.id, 'bad text', 'after "' + it.text + '": ' + junk[0]);
      // Anything changed: start again from fresh storage, so the next tap meets the page as a person would.
      if (after !== before || errors.length) {
        await ctx.close();
        ({ ctx, page, errors } = await open(browser, look, url));
      }
    }
    await ctx.close();
  }
  return taps;
}

const server = await serve();
const base = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch();
const t0 = Date.now();
const screens = await crawl(browser, base);
const taps = QUICK ? 0 : await tapAll(browser, base);
await browser.close();
server.close();

// ---------------------------------------------------------------- the report
const byKind = {};
for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
const fatal = findings.filter((f) => FATAL.has(f.kind));
const summary = [
  'SLAM tester: ' + screens.length + ' screens x ' + LOOKS.length + ' looks, ' + taps + ' taps, ' + Math.round((Date.now() - t0) / 1000) + 's.',
  fatal.length ? 'FAIL: ' + fatal.length + ' blocking findings.' : 'PASS: no errors, crashes, overflow, null/undefined/NaN text or tab bar wrap.',
  ...Object.entries(byKind).sort().map(([k, n]) => '  ' + k + ': ' + n + (FATAL.has(k) ? ' (blocking)' : ''))
];
const group = {};
for (const f of findings) (group[f.kind] = group[f.kind] || []).push(f);
const md = ['# SLAM tester report', '', 'Written by `node tools/qa-crawl.mjs` on the demo household (made up).', '', '```', ...summary, '```', '',
  ...Object.entries(group).flatMap(([k, list]) => {
    // The same finding in several looks is one line with its looks.
    const one = new Map();
    for (const f of list) { const key = f.screen + ' | ' + f.what; one.set(key, [...(one.get(key) || []), f.look]); }
    return ['## ' + k + ' (' + one.size + ')', '', ...[...one].slice(0, 200).map(([key, looks]) => '- ' + key.replace(' | ', ': ') + ' [' + looks.join(', ') + ']'), one.size > 200 ? '- and ' + (one.size - 200) + ' more' : '', ''];
  })];
await writeFile(join(ROOT, 'test', 'qa-report.md'), md.join('\n') + '\n');
console.log(summary.join('\n'));
process.exit(fatal.length ? 1 : 0);
