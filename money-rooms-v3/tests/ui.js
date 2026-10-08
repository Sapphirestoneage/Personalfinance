#!/usr/bin/env node
/* Money Rooms v3: the browser side of the gate. Serves the repository root
   the way GitHub Pages does, then for every household, screen, view and
   width: loads the screen, fails on any console error or warning, on NaN,
   undefined, null, Infinity, [object Object] or $-0 in the page text, and on
   any element that overflows its container. With --shots N it also writes
   screenshots/level-N/<household>-<screen>-<view>-<width>.jpg.
   Usage: node money-rooms-v3/tests/ui.js [--shots N] [--only screen] */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { flows } from './ui-flows.js';
import { SCREENS, HOUSEHOLDS, WIDTHS } from './ui-screens.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, '..');
const REPO = path.resolve(APP, '..');
const args = process.argv.slice(2);
const shotsLevel = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

function loadPlaywright() {
  const candidates = [REPO, '/opt/node22/lib/node_modules/x', process.cwd()];
  for (const c of candidates) {
    try { return createRequire(path.join(c, 'package.json'))('playwright'); } catch (e) { /* next */ }
  }
  try { return createRequire(import.meta.url)('playwright'); } catch (e) { /* fallthrough */ }
  throw new Error('playwright is not installed; npm install --no-save playwright');
}

function freePort() {
  return new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
async function waitFor(url, tries) {
  for (let i = 0; i < (tries || 50); i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start: ' + url);
}

const FORBIDDEN = [/\bNaN\b/, /\bundefined\b/, /\bnull\b/, /\bInfinity\b/, /\[object Object\]/, /\$-0\b/, /~\$0\b/];
/* Level 14 (MR-072): what a client never sees, in any view labelled client */
const CLIENT_FORBIDDEN = [/~\$|~\d/, /\b\d+ rows?\b/, /\bfacts in\b/, /\bconfiden(ce|t)\b/i, /\bafter session \d/i, /\bplates?\b/i, /\bleverage\b/i, /\bguess(es)?\b/i, /\bre-runs?\b/i, /\bregistry\b/i, /\bnodes?\b/i, /\bsnapshot\b/i, /\bweight x\b/i, /\d+ ms\b/, /\bdecomposition\b/i, /\blever famil/i];
/* day-first dates ("8 Oct 2026") and raw ISO dates never reach the screen; US order everywhere */
const DATE_FORBIDDEN = [/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/, /\b\d{4}-\d{2}-\d{2}\b/];
const RENDER_BUDGET_MS = 300;

const failures = [];
let passed = 0;
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail ? ': ' + detail : '')); }

async function main() {
  const { chromium } = loadPlaywright();
  const port = await freePort();
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: REPO, stdio: 'ignore' });
  const base = 'http://127.0.0.1:' + port + '/money-rooms-v3/';
  try {
    await waitFor(base + 'index.html');
    const browser = await chromium.launch();
    const shotDir = shotsLevel ? path.join(APP, 'screenshots', 'level-' + shotsLevel) : null;
    if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

    /* 1. Flows: scripted journeys that assert behaviour. */
    for (const flow of flows) {
      if (only && only !== 'flows' && only !== flow.name) continue;
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
      const page = await context.newPage();
      const consoleIssues = [];
      page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleIssues.push(m.text()); });
      page.on('pageerror', e => consoleIssues.push('pageerror: ' + e.message));
      try {
        await flow.run(page, { base, check, APP });
        check('flow ' + flow.name + ': console clean', consoleIssues.length === 0, consoleIssues.slice(0, 3).join(' | '));
      } catch (e) {
        check('flow ' + flow.name, false, e.message.split('\n').filter(l => l.trim()).slice(0, 3).join(' | '));
      }
      await context.close();
    }

    /* 2. Sweep: every household x screen x view x width. */
    for (const hh of HOUSEHOLDS) {
      if (only && only !== 'sweep' && !SCREENS.find(s => s.id === only)) continue;
      for (const width of WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 } });
        const page = await context.newPage();
        const consoleIssues = [];
        page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleIssues.push(m.text()); });
        page.on('pageerror', e => consoleIssues.push('pageerror: ' + e.message));
        await page.goto(base + 'index.html#/home');
        await page.waitForSelector('#main h1, #main .empty');
        await hh.load(page, { base, APP });
        for (const view of ['coach', 'client']) {
          for (const screen of SCREENS) {
            if (only && only !== 'sweep' && only !== screen.id) continue;
            const label = hh.id + '-' + screen.id + '-' + view + '-' + width;
            consoleIssues.length = 0;
            await page.evaluate(v => { document.body.dataset.view = v; }, view);
            await page.goto(base + 'index.html#/' + screen.route);
            await page.evaluate(v => { const b = document.querySelector('#view-' + v); if (b) b.click(); }, view);
            await page.waitForSelector('#main h1, #main .empty', { timeout: 5000 });
            await page.waitForTimeout(150);
            const text = await page.evaluate(() => document.body.innerText);
            FORBIDDEN.forEach(re => check(label + ' text has no ' + re.source, !re.test(text), (text.match(new RegExp('.{0,30}' + re.source + '.{0,30}')) || [])[0]));
            const overflow = await page.evaluate(() => {
              const out = [];
              const docW = document.documentElement.clientWidth;
              if (document.documentElement.scrollWidth > docW + 1) out.push('page scrollWidth ' + document.documentElement.scrollWidth + ' > ' + docW);
              const inScroller = el => { let e = el.parentElement; while (e && e !== document.body) { const s = getComputedStyle(e); if (s.overflowX === 'auto' || s.overflowX === 'scroll') return true; e = e.parentElement; } return false; };
              document.querySelectorAll('body *').forEach(el => {
                if (el.closest('.tablewrap, svg, .sidenav, select, option') || el.tagName === 'svg' || el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
                if (inScroller(el)) return; /* a tab row that scrolls sideways is meant to run past the edge (MR-072) */
                const cs = getComputedStyle(el);
                if (cs.display === 'none' || cs.position === 'fixed') return;
                if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflow === 'hidden' || cs.overflowX === 'hidden') return;
                if (cs.textOverflow === 'ellipsis') return;
                if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
                  out.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + ' ' + el.scrollWidth + '>' + el.clientWidth);
                }
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.right > docW + 1) out.push(el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '') + ' right ' + Math.round(r.right) + ' > ' + docW);
              });
              return out.slice(0, 4);
            });
            check(label + ' nothing overflows', overflow.length === 0, overflow.join(' | '));
            const a11y = await page.evaluate(() => {
              const out = [];
              const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
              const named = el => (el.getAttribute('aria-label') || '').trim() || el.getAttribute('aria-labelledby') || (el.labels && el.labels.length) || (el.getAttribute('title') || '').trim();
              document.querySelectorAll('input, select, textarea').forEach(el => { if (el.type !== 'hidden' && visible(el) && !named(el)) out.push('unlabelled ' + el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '')); });
              document.querySelectorAll('button, a[href]').forEach(el => { if (visible(el) && !(el.textContent || '').trim() && !named(el)) out.push('nameless ' + el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '')); });
              document.querySelectorAll('svg[role="img"]').forEach(el => { if (visible(el) && !named(el) && !el.querySelector('title')) out.push('svg without a name'); });
              document.querySelectorAll('img').forEach(el => { if (!el.hasAttribute('alt')) out.push('img without alt'); });
              if (document.querySelectorAll('h1').length !== 1) out.push(document.querySelectorAll('h1').length + ' h1 elements');
              return out.slice(0, 4);
            });
            check(label + ' accessible names', a11y.length === 0, a11y.join(' | '));
            check(label + ' console clean', consoleIssues.length === 0, consoleIssues.slice(0, 2).join(' | '));
            /* ---- Level 14 (MR-072) ---- */
            /* the trunk test: a page name, the section it belongs to, and the current place lit in the navigation */
            const trunk = await page.evaluate(() => ({ h1: (document.querySelector('#main h1') || {}).textContent || '', lit: document.querySelectorAll('#sidenav a[aria-current="page"]').length, section: document.body.dataset.section || '', title: document.title }));
            check(label + ' trunk test: page name, section and a lit nav item', trunk.h1.trim().length > 0 && trunk.lit >= 1 && trunk.section.length > 0 && trunk.title.indexOf('Money Rooms') !== -1, JSON.stringify(trunk));
            /* the client never sees coach words */
            if (view === 'client') CLIENT_FORBIDDEN.forEach(re => check(label + ' client words: no ' + re.source, !re.test(text), (text.match(new RegExp('.{0,30}' + re.source + '.{0,30}', re.flags)) || [])[0]));
            /* US dates only */
            DATE_FORBIDDEN.forEach(re => check(label + ' dates read US style, not ' + re.source, !re.test(text), (text.match(new RegExp('.{0,30}' + re.source + '.{0,30}')) || [])[0]));
            /* first meaningful paint: the view's mount under the budget */
            const renderMs = await page.evaluate(() => (globalThis.mr3 && globalThis.mr3.lastRenderMs) || 0);
            check(label + ' renders under ' + RENDER_BUDGET_MS + ' ms', renderMs < RENDER_BUDGET_MS, Math.round(renderMs) + ' ms');
            /* contrast and size: every visible text element meets AA against its background and is at least 13px (14px on a phone) */
            const typo = await page.evaluate((minPx) => {
              const out = []; let seen = 0;
              const lum = c => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(',').map(Number); if (p.length > 3 && p[3] === 0) return null; const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return { l: 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]), a: p.length > 3 ? p[3] : 1 }; };
              const bgOf = el => { let e = el; while (e && e !== document.documentElement) { const b = getComputedStyle(e).backgroundColor; const L = lum(b); if (L && L.a >= 0.9) return L.l; e = e.parentElement; } return lum(getComputedStyle(document.body).backgroundColor) ? lum(getComputedStyle(document.body).backgroundColor).l : 1; };
              document.querySelectorAll('#main *, #sidenav *, .topbar *').forEach(el => {
                if (seen > 1500 || out.length > 5) return;
                if (el.closest('svg, select, option, .sr-only, [hidden], .skeleton-host')) return;
                const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1); if (!hasText) return;
                const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return;
                const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return;
                seen++;
                const px = parseFloat(cs.fontSize); if (px < minPx) out.push('small text ' + px + 'px: ' + el.textContent.trim().slice(0, 30));
                const fg = lum(cs.color); if (!fg) return; const bg = bgOf(el);
                const ratio = (Math.max(fg.l, bg) + 0.05) / (Math.min(fg.l, bg) + 0.05);
                const big = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 600);
                if (ratio < (big ? 3 : 4.5)) out.push('contrast ' + ratio.toFixed(2) + ': ' + el.textContent.trim().slice(0, 30));
              });
              return out.slice(0, 5);
            }, width < 500 ? 14 : 13);
            check(label + ' text size and contrast', typo.length === 0, typo.join(' | '));
            /* every clickable thing looks clickable: a pointer cursor belongs to a button, a link or a control */
            const roles = await page.evaluate(() => {
              const out = []; const ok = el => ['A', 'BUTTON', 'INPUT', 'SELECT', 'SUMMARY', 'LABEL', 'TEXTAREA', 'OPTION'].includes(el.tagName) || (el.tagName === 'TH' && el.hasAttribute('aria-sort')) || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link' || el.getAttribute('role') === 'tab' || el.closest('a, button, label, summary, [role="button"], [role="link"], svg, .orbit');
              document.querySelectorAll('#main *').forEach(el => { if (out.length > 4) return; const cs = getComputedStyle(el); if (cs.cursor === 'pointer' && !ok(el)) out.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]); });
              return out;
            });
            check(label + ' clickable things have a role', roles.length === 0, roles.join(' | '));
            /* a ledger table at rest is text: few inputs until a cell is tapped */
            if (view === 'coach' && /^ledger\/[a-z]+\/[a-z]+$/.test(screen.route)) { const n = await page.evaluate(() => document.querySelectorAll('#main input, #main select, #main textarea').length); check(label + ' ledger at rest has few inputs', n <= 14, n + ' inputs'); }
            /* chart text never collides: no two labels in one chart overlap */
            const collide = await page.evaluate(() => {
              const out = [];
              document.querySelectorAll('#main svg').forEach(svg => {
                const texts = Array.from(svg.querySelectorAll('text')).filter(t => (t.textContent || '').trim().length && !t.closest('.axis, .tick')).map(t => ({ t: t.textContent.trim().slice(0, 18), r: t.getBoundingClientRect() })).filter(x => x.r.width > 0);
                for (let i = 0; i < texts.length && out.length < 3; i++) for (let j = i + 1; j < texts.length; j++) { const a = texts[i].r, b = texts[j].r; const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ox > 2 && oy > 2) { out.push(texts[i].t + ' over ' + texts[j].t); break; } }
              });
              return out;
            });
            check(label + ' chart labels never collide', collide.length === 0, collide.join(' | '));
            if (shotDir) { const vp = page.viewportSize(); await page.mouse.move(vp.width - 2, vp.height - 2); }
            if (shotDir) await page.screenshot({ path: path.join(shotDir, label + '.jpg'), fullPage: true, type: 'jpeg', quality: 70 });
            /* the dark theme (MR-028): one household at desktop width, both views, checked for console errors and shot */
            if (hh.id === 'leah' && width === 1440) {
              consoleIssues.length = 0;
              await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
              await page.waitForTimeout(100);
              check(label + '-dark console clean', consoleIssues.length === 0, consoleIssues.slice(0, 2).join(' | '));
              if (shotDir) await page.screenshot({ path: path.join(shotDir, label + '-dark.jpg'), fullPage: true, type: 'jpeg', quality: 70 });
              await page.evaluate(() => { delete document.documentElement.dataset.theme; });
            }
          }
        }
        await context.close();
      }
    }
    await browser.close();
  } finally {
    server.kill();
  }
  console.log('-'.repeat(60));
  if (!failures.length) { console.log('ok: ' + passed + ' browser checks passed'); process.exit(0); }
  console.log('FAILED: ' + failures.length + ' (' + passed + ' passed)');
  failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
  process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
