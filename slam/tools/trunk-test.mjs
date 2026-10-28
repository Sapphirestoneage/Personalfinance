// The trunk test (Part 9, S-288; Krug's "trunk test"): dropped onto any screen, can a person tell where they are?
// Opens every page, every second-level tab, and one level-3 and one level-4 screen in each section of Numbers, at a
// phone width and a computer width, on the made-up demo household, and passes or fails each on:
//   site ID       "Stress Less About Money" top left, a link to Home
//   page name     one h1 that is the page's name, matching the lit tab or the last step of the trail
//   sections      the five main tabs
//   local options what this level offers: the second-level tabs, the siblings or the rows that open the next level
//   you are here  the main tab marked, and the second-level tab where there is one, each with two cues (fill, weight)
//   search        the header search box
//   first thing   the first thing to do (a row, a box, a button, a slider) in view without scrolling
// and the accessibility basics (Part 8): one h1, headings in order (no level skipped), every field tied to a label,
// a "Skip to main content" link first, no zoom lock, every tap target at least 44px tall.
//   node tools/trunk-test.mjs            writes docs/TRUNK_TEST.md and prints the fails; exits 1 on any fail
//   node tools/trunk-test.mjs --json FILE   also writes the raw results
// It serves the slam folder itself on a free port (fresh browser storage: the demo household loads).

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const WIDTHS = [['phone', 375, 740], ['computer', 1280, 800]];
// Pages for the coach (the gear and the Builder) have no main tab lit: "you are here" there is the gear's mark and the trail.
const COACH = new Set(['rules.html', 'house.html', 'assumptions.html', 'math.html', 'builder.html', 'affordances.html', 'where.html']);
// The client's own page (opened alone, before the call): the site ID, the page name and the basics, no coach header.
const CLIENT = new Set(['before.html']);
// Every page and second-level tab (level 1 and 2), then a level-3 and level-4 screen per Numbers section, found by
// following the first row that opens the next level.
const SCREENS = [
  ['dashboard.html', 'Home', 1], ['ledger.html', 'Numbers', 1], ['plan.html', 'Plan', 1], ['calendar.html', 'Calendar', 1], ['spending.html', 'Spending', 1],
  ['profile.html', 'Profile', 1], ['before.html', 'Before our first call', 1], ['onepager.html', 'One-pager', 1], ['dashboard.html#/end', 'End of the call', 2],
  ['windfall.html', 'Extra money', 2],
  ...['needs', 'debt', 'income', 'assets', 'goals', 'protection'].map((s) => ['ledger.html#/' + s, s, 2]),
  ...['debt', 'retirement', 'protection'].map((s) => ['plan.html#/' + s, s, 2]),
  ['rules.html', 'Rules', 1], ['house.html', 'House defaults', 1], ['assumptions.html', 'Assumptions', 1], ['math.html', 'All formulas', 1], ['builder.html', 'Builder', 1], ['where.html', 'Where to find', 1]
];
const DEEP_FROM = ['needs', 'debt', 'income', 'assets', 'goals', 'protection'];

function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^(\.\.[/\\])+/, '');
    try { const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// Runs in the page: every check, with what it saw.
function inspect({ coach, client, level }) {
  // Visible, and in the accessibility tree (the picker's native list is aria-hidden and off screen for everyone).
  const vis = (el) => { if (!el || el.closest('[aria-hidden="true"]')) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const text = (el) => (el ? el.textContent.trim().replace(/\s+/g, ' ') : '');
  const out = {};
  const siteId = document.querySelector('.site-id');
  out.siteId = { ok: !!siteId && vis(siteId) && /Stress Less About Money/.test(text(siteId)) && /dashboard\.html$/.test(siteId.getAttribute('href') || '') && siteId.getBoundingClientRect().left < 40 && siteId.getBoundingClientRect().top < 80, saw: text(siteId) };
  const h1s = [...document.querySelectorAll('h1')].filter(vis);
  const h1 = h1s[0];
  const litTab = document.querySelector('.tabbar .tab-item.is-here .tab');
  const litSub = document.querySelector('.subtabs .tab-item.is-here .tab');
  const trail = [...document.querySelectorAll('.trail li')].map(text);
  const last = trail[trail.length - 1] || null;
  const name = text(h1);
  out.pageName = { ok: h1s.length === 1 && !!name && (name === last || name === text(litSub) || name === text(litTab) || (!last && !litSub)), saw: name + (last ? ' | trail ends: ' + last : '') + (litSub ? ' | tab: ' + text(litSub) : '') };
  const tabs = [...document.querySelectorAll('.tabbar .tab')].filter(vis).map(text);
  out.sections = { ok: client || tabs.join(',') === 'Home,Numbers,Plan,Calendar,Spending', saw: client ? 'client page' : tabs.join(', ') };
  // Local options: second-level tabs on their main tabs; deeper, the siblings strip or the rows and buttons of this level.
  const subs = [...document.querySelectorAll('.subtabs .tab')].filter(vis).map(text);
  const sibs = [...document.querySelectorAll('.siblings .sib, .sib-pick select option')].length;
  const rows = [...document.querySelectorAll('#app .go-row, #app .rows .row-main, #app .next-one, #app .agenda-resume, #app .coach-list a, #app .go-list a, #app .btn, #app .card a[href]')].filter(vis).length;
  out.options = { ok: subs.length > 0 || sibs > 1 || rows > 0 || coach || client, saw: subs.length ? 'tabs: ' + subs.join(', ') : sibs > 1 ? sibs + ' siblings' : rows + ' rows' };
  // You are here: the lit tab, with two cues at once (a heavier weight and a different fill than the other tabs).
  const cues = (lit, others) => {
    if (!lit) return null;
    const cs = getComputedStyle(lit), o = others.map((x) => getComputedStyle(x));
    const bold = +cs.fontWeight >= 700 && o.every((x) => +x.fontWeight < +cs.fontWeight);
    const fill = o.length ? o.every((x) => x.backgroundColor !== cs.backgroundColor) : true;
    return { bold, fill, current: lit.getAttribute('aria-current') === 'page' };
  };
  const mainCue = cues(litTab, [...document.querySelectorAll('.tabbar .tab-item:not(.is-here) .tab')]);
  const subCue = cues(litSub, [...document.querySelectorAll('.subtabs .tab-item:not(.is-here) .tab')]);
  const hasSubs = !!document.querySelector('.subtabs');
  const gear = document.querySelector('.coach-menu > summary[aria-current="page"]');
  out.youAreHere = {
    // At level 1 of a page with second-level tabs (the top of Numbers), none is current yet: the main tab alone says where.
    ok: client ? true : coach ? !!(gear || trail.length) : !!(mainCue && mainCue.bold && mainCue.fill && mainCue.current) && (!hasSubs || level < 2 || !!(subCue && subCue.bold && subCue.fill && subCue.current)),
    saw: coach ? (gear ? 'the gear is marked' : 'trail: ' + trail.join(' > ')) : (litTab ? text(litTab) + (mainCue.bold ? ' bold' : ' NOT bold') + (mainCue.fill ? ', filled' : ', NOT filled') : 'no tab lit') + (hasSubs ? ' / ' + (litSub ? text(litSub) + (subCue.bold ? ' bold' : ' NOT bold') + (subCue.fill ? ', filled' : ', NOT filled') : 'no second-level tab lit') : '')
  };
  const search = document.getElementById('top-search');
  out.search = { ok: client || (!!search && vis(search)), saw: client ? 'client page' : search ? 'box' : 'none' };
  // The first thing to do: the first control a person acts on, inside the viewport without scrolling.
  // Not the strip's switch, Back, the Guide me switch or the siblings: the screen's own first control.
  const firsts = [...document.querySelectorAll('#app .go-row, #app .rows .row-main, #app .next-one, #app .agenda-resume, #app input:not([type=hidden]), #app select, #app textarea, #app .btn.primary, #app .seg-btn, #app .go-list a, #app .card-link, #app summary, #app button, #app a.btn, #app .phrase, #app input[type=range]')].filter((el) => vis(el) && !el.closest('.headline-strip, .trail-row, .siblings, .subtabs, .fill-bar') && !el.matches('.guide-switch'));
  const first = firsts[0] || null;
  const fr = first ? first.getBoundingClientRect() : null;
  out.firstThing = { ok: !!fr && fr.top >= 0 && fr.bottom <= innerHeight, saw: first ? '"' + text(first).slice(0, 40) + '" at ' + Math.round(fr.top) + 'px of ' + innerHeight : 'nothing to do' };
  // Accessibility basics.
  const hs = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(vis).map((x) => +x.tagName[1]);
  let skips = [];
  for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) skips.push('h' + hs[i - 1] + ' to h' + hs[i]);
  out.headings = { ok: h1s.length === 1 && hs[0] === 1 && !skips.length, saw: h1s.length + ' h1; ' + (skips.length ? 'skips: ' + [...new Set(skips)].join(', ') : 'in order') };
  const fields = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')].filter(vis);
  const unlabeled = fields.filter((el) => !((el.labels && el.labels.length) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')));
  out.labels = { ok: !unlabeled.length, saw: fields.length + ' fields' + (unlabeled.length ? ', unlabeled: ' + unlabeled.map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')).slice(0, 5).join(', ') : '') };
  const skip = document.querySelector('a.skip');
  const firstFocusable = document.querySelector('a[href], button, input, select, textarea, summary, [tabindex]');
  out.skipLink = { ok: !!skip && /^Skip to main content$/.test(text(skip)) && skip === firstFocusable && /^#app$/.test(skip.getAttribute('href') || '') && !!document.getElementById('app'), saw: skip ? text(skip) + (skip === firstFocusable ? ', first' : ', not first') : 'none' };
  const vp = (document.querySelector('meta[name=viewport]') || {}).content || '';
  out.zoom = { ok: !/maximum-scale|user-scalable=no/i.test(vp), saw: vp };
  const taps = [...document.querySelectorAll('button, [role=button], a.btn, summary, select, input:not([type=hidden]), .go-row, .tabbar a, .subtabs a, .trail a, a.sib')].filter(vis);
  const small = taps.filter((el) => { const t = el.matches('input[type=checkbox], input[type=radio]') ? el.closest('label') || (el.labels && el.labels[0]) || el : el; return t.getBoundingClientRect().height < 43.5; });
  out.tapSize = { ok: !small.length, saw: taps.length + ' targets' + (small.length ? ', small: ' + small.slice(0, 4).map((el) => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + text(el).slice(0, 24) + '" ' + Math.round(el.getBoundingClientRect().height) + 'px')).join('; ') + (small.length > 4 ? ' and ' + (small.length - 4) + ' more' : '') : '') };
  // Where the first row of this level leads (to walk down a level).
  const next = [...document.querySelectorAll('#app .go-list .go-row[href*="#/"]')].filter(vis)[0];
  out.nextHref = next ? next.getAttribute('href') : null;
  out.level = level;
  return out;
}

const CHECKS = [['siteId', 'Site ID'], ['pageName', 'Page name'], ['sections', 'Sections'], ['options', 'Options here'], ['youAreHere', 'You are here'], ['search', 'Search'], ['firstThing', 'First thing in view'], ['headings', 'Headings in order'], ['labels', 'Fields labeled'], ['skipLink', 'Skip link first'], ['zoom', 'Zoom allowed'], ['tapSize', 'Taps 44px']];

const server = await serve();
const base = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch();
const results = [];
for (const [wname, width, height] of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const look = async (url, name, level) => {
    errors.length = 0;
    await page.goto(base + url); await page.waitForTimeout(900);
    const r = await page.evaluate(inspect, { coach: COACH.has(url.split('#')[0]), client: CLIENT.has(url.split('#')[0]), level });
    results.push({ width: wname, url, name, level, ...r, errors: [...errors] });
    return r;
  };
  for (const [url, name, level] of SCREENS) await look(url, name, level);
  // Down two levels from each Numbers section, by its first row.
  for (const s of DEEP_FROM) {
    const l2 = results.find((r) => r.width === wname && r.url === 'ledger.html#/' + s);
    if (!l2 || !l2.nextHref) continue;
    const l3 = await look('ledger.html' + l2.nextHref, s + ' level 3', 3);
    if (l3.nextHref) await look('ledger.html' + l3.nextHref, s + ' level 4', 4);
  }
  await ctx.close();
}
await browser.close(); server.close();

// The report.
const fails = results.flatMap((r) => CHECKS.filter(([k]) => !r[k].ok).map(([k, label]) => ({ r, k, label })));
const L = ['# Trunk test', '', 'Krug\'s trunk test, run by `node tools/trunk-test.mjs` on ' + new Date().toISOString().slice(0, 10) + ' on the made-up demo household: every page, every second-level tab, and one level-3 and one level-4 screen in each section of Numbers, at phone width (375px) and computer width (1280px). Each screen passes or fails on the site ID, the page name, the main sections, the options at this level, you are here (both levels marked, two cues), search, and whether the first thing to do is in view without scrolling; then the accessibility basics of Part 8 (one h1 and headings in order, every field labeled, the skip link first, zoom allowed, taps at least 44px).', '', 'Result: ' + (fails.length ? fails.length + ' fails' : 'every check passes') + ' across ' + results.length + ' screens.', ''];
for (const [wname] of WIDTHS) {
  L.push('## ' + wname[0].toUpperCase() + wname.slice(1) + ' width', '', '| Screen | Level | ' + CHECKS.map(([, l]) => l).join(' | ') + ' |', '|---|---|' + CHECKS.map(() => '---').join('|') + '|');
  for (const r of results.filter((x) => x.width === wname)) L.push('| ' + r.url + ' | ' + r.level + ' | ' + CHECKS.map(([k]) => (r[k].ok ? 'pass' : 'FAIL')).join(' | ') + ' |');
  L.push('');
}
L.push('## What each screen showed', '');
for (const r of results) L.push('- ' + r.width + ', ' + r.url + ': ' + CHECKS.map(([k, l]) => l + ': ' + r[k].saw).join('; ') + (r.errors.length ? '; ERRORS: ' + r.errors.join(' / ') : ''));
L.push('', '## Fails', '', ...(fails.length ? fails.map(({ r, label, k }) => '- ' + r.width + ', ' + r.url + ', ' + label + ': ' + r[k].saw) : ['None.']), '');
await writeFile(join(ROOT, 'docs/TRUNK_TEST.md'), L.join('\n'));
if (arg('--json')) await writeFile(arg('--json'), JSON.stringify(results, null, 1));
console.log(results.length + ' screens, ' + fails.length + ' fails');
for (const { r, label, k } of fails) console.log('FAIL ' + r.width + ' ' + r.url + ' | ' + label + ': ' + r[k].saw);
for (const r of results) if (r.errors.length) console.log('ERROR ' + r.width + ' ' + r.url + ': ' + r.errors.join(' / '));
process.exitCode = fails.length ? 1 : 0;
