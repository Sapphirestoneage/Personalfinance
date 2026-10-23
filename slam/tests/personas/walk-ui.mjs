// Walks the real Ledger and Dashboard pages for persona households with
// Playwright (not part of node --test). Serve the slam folder first:
//   python3 -m http.server 8765 &
//   node tests/personas/walk-ui.mjs 01-sugar-baby 11-widow ...
// Each household is preloaded as "edits saved in this browser"; what the pages
// show, console errors and a phone-width screenshot go to tests/personas/walk-out/
// (gitignored by the repository rules for local output; copy what you need).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
const URL = process.env.SLAM_URL || 'http://127.0.0.1:8765/';
const SLAM = fileURLToPath(new URL('../../', import.meta.url));
const OUT = process.env.WALK_OUT || fileURLToPath(new URL('./walk-out/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const ids = process.argv.slice(2);
const FILES = { '06-single-early-20s': 'tests/golden/households/card-carlos.json', '15-side-hustler': 'fixtures/demo.json', '17-regular-fi': 'tests/golden/households/w2-wes.json' };
const txt = async (loc) => (await loc.allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());

const browser = await chromium.launch();
for (const id of ids) {
  const file = FILES[id] || 'tests/personas/households/' + id + '.json';
  const json = readFileSync(SLAM + file, 'utf8');
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((j) => { localStorage.setItem('slam-spine:v1', j); localStorage.setItem('slam-scenario:v1', JSON.stringify('likely')); }, json);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const r = { id, file, errors, ledger: {}, dashboard: {} };
  try {
    await page.goto(URL + 'ledger.html');
    await page.waitForSelector('#app h1', { timeout: 20000 });
    await page.waitForFunction(() => { const s = document.querySelector('section.guessing'); return s && !/Updating/.test(s.textContent); }, null, { timeout: 60000 }).catch(() => errors.push('ledger: still guessing never finished'));
    r.ledger.header = (await txt(page.locator('header.top')))[0];
    r.ledger.guessingTitle = (await txt(page.locator('section.guessing h2')))[0];
    r.ledger.guessing = (await txt(page.locator('section.guessing li'))).slice(0, 14);
    r.ledger.groups = await txt(page.locator('section.group > h2'));
    r.ledger.sections = await txt(page.locator('section.group h3'));
    r.ledger.showing = (await txt(page.locator('section.filters p[role=status]')))[0];
    r.ledger.subs = (await txt(page.locator('section.subs, section#subs, [aria-labelledby=subs-h]'))).slice(0, 1);
    await page.screenshot({ path: OUT + id + '-ledger.jpg', type: 'jpeg', quality: 35, fullPage: false });
    await page.goto(URL + 'dashboard.html');
    await page.waitForSelector('#app h1, #app p.card', { timeout: 20000 });
    await page.waitForTimeout(800);
    r.dashboard.crash = (await txt(page.locator('#app > p.card'))).join(' | ');
    r.dashboard.tiles = await txt(page.locator('section.tile'));
    r.dashboard.flagsHeader = (await txt(page.locator('section[aria-labelledby=flags-h] h2')))[0];
    r.dashboard.flags = await txt(page.locator('li.flag'));
    r.dashboard.scenario = (await txt(page.locator('#scenario'))).slice(0, 1);
    r.dashboard.flow = (await txt(page.locator('section.flow, [aria-labelledby=flow-h]'))).slice(0, 1).map((s) => s.slice(0, 600));
    await page.screenshot({ path: OUT + id + '-dashboard.jpg', type: 'jpeg', quality: 35, fullPage: true });
  } catch (e) { errors.push('run: ' + e.message); }
  writeFileSync(OUT + id + '.json', JSON.stringify(r, null, 1));
  console.log(id, 'errors', errors.length, 'tiles', (r.dashboard.tiles || []).length, 'flags', (r.dashboard.flags || []).length);
  await ctx.close();
}
await browser.close();
