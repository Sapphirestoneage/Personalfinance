// Screenshots for an overnight round (Part 3): every client screen at 390px light and 1024px dark, on the demo
// household (made up), in fresh storage, saved as JPEG (small enough to keep) in docs/overnight/round-N/.
//   node tools/round-shots.mjs 1
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
// [file name, address, folds to open]
export const SHOTS = [
  ['today', 'dashboard.html'], ['networth', 'dashboard.html#/networth'], ['flow', 'dashboard.html#/flow'],
  ['session', 'session.html'], ['session-needs', 'session.html#/needs'],
  ['numbers', 'ledger.html'], ['debt', 'ledger.html#/debt', ['debt-payoff']], ['income', 'ledger.html#/income', ['pay-charts']], ['taxes', 'ledger.html#/taxes', ['tax-brackets']], ['goals-fi', 'ledger.html#/goals', ['fi-charts']], ['subscriptions', 'ledger.html#/needs/subscriptions'],
  ['calendar', 'calendar.html', ['cal-chart']], ['spending', 'spending.html'],
  ['plan', 'plan.html'], ['paychecks', 'plan.html#/paychecks'], ['whatif', 'plan.html#/whatif'], ['calls', 'plan.html#/calls'], ['solve', 'plan.html#/solve'], ['plan-goals', 'plan.html#/goals'], ['scenarios', 'plan.html#/scenarios', ['scenario-chart']],
  ['profile', 'profile.html'], ['onepager', 'onepager.html'], ['windfall', 'windfall.html']
];
function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try { const body = await readFile(join(ROOT, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}
const n = process.argv[2] || '1';
const dir = join(ROOT, 'docs/overnight/round-' + n);
await mkdir(dir, { recursive: true });
const server = await serve();
const base = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch();
const errors = [];
for (const [name, url, folds = []] of SHOTS) {
  for (const [w, dark] of [[390, false], [1024, true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: dark ? 'dark' : 'light' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    if (folds.length) await page.addInitScript((ids) => { try { localStorage.setItem('slam-open:v1', JSON.stringify(ids)); } catch {} }, folds);
    await page.goto(base + url, { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: join(dir, name + '-' + w + (dark ? '-dark' : '') + '.jpg'), fullPage: true, type: 'jpeg', quality: 55 });
    await ctx.close();
  }
}
await browser.close(); server.close();
console.log('Round ' + n + ': ' + SHOTS.length * 2 + ' screenshots in docs/overnight/round-' + n + '/' + (errors.length ? '; errors: ' + errors.join('; ') : '; no page errors.'));
