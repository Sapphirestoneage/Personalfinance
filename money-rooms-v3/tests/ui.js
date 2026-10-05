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
              document.querySelectorAll('body *').forEach(el => {
                if (el.closest('.tablewrap, svg, .sidenav, select, option') || el.tagName === 'svg' || el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
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
            if (shotDir) { const vp = page.viewportSize(); await page.mouse.move(vp.width - 2, vp.height - 2); }
            if (shotDir) await page.screenshot({ path: path.join(shotDir, label + '.jpg'), fullPage: true, type: 'jpeg', quality: 70 });
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
