// The squint test kit (Part 9, S-288): six screens chosen at random (at least two at level 3 or 4), captured on the
// made-up demo household, blurred so they cannot be read closely, on one printable page with the instructions for the
// coach's dry run: give a friend two minutes to circle the site ID, the page name, the sections, the local options,
// "you are here" and search on each screen.
//   node tools/squint-test.mjs            writes docs/squint/*.png and docs/squint-test.html
//   node tools/squint-test.mjs --seed 7   the same six again (the seed is printed and written on the page)
// It serves the slam folder itself on a free port (fresh browser storage: the demo household loads).

import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// The pool: [url, name, level]. Levels 3 and 4 are items of Numbers on the demo household.
const POOL = [
  ['dashboard.html', 'Home', 1], ['ledger.html', 'Numbers', 1], ['plan.html', 'Plan', 1], ['calendar.html', 'Calendar', 1], ['spending.html', 'Spending', 1],
  ['profile.html', 'Profile', 1], ['dashboard.html#/end', 'End of the call', 2], ['windfall.html', 'Plan > Extra money', 2],
  ['ledger.html#/needs', 'Numbers > Needs', 2], ['ledger.html#/debt', 'Numbers > Debt', 2], ['ledger.html#/income', 'Numbers > Income', 2], ['ledger.html#/assets', 'Numbers > Assets', 2], ['ledger.html#/goals', 'Numbers > Goals', 2], ['ledger.html#/protection', 'Numbers > Protection', 2],
  ['plan.html#/debt', 'Plan > Debt', 2], ['plan.html#/retirement', 'Plan > Retirement and tax', 2], ['plan.html#/protection', 'Plan > Protection', 2],
  ['ledger.html#/needs/housing', 'Numbers > Needs > Housing', 3], ['ledger.html#/debt/credit-cards', 'Numbers > Debt > Credit cards', 3], ['ledger.html#/income/paychecks-w-2', 'Numbers > Income > Paychecks (W-2)', 3], ['ledger.html#/assets/cash', 'Numbers > Assets > Cash', 3], ['ledger.html#/assets/employer-retirement', 'Numbers > Assets > Employer retirement', 3],
  ['ledger.html#/needs/housing/rent', 'Numbers > Needs > Housing > Rent', 4], ['ledger.html#/debt/credit-cards/visa', 'Numbers > Debt > Credit cards > Visa', 4], ['ledger.html#/income/paychecks-w-2/salary', 'Numbers > Income > Paychecks > Salary', 4], ['ledger.html#/assets/employer-retirement/k401', 'Numbers > Assets > Employer retirement > Work 401(k)', 4], ['ledger.html#/debt/federal-student-loans/sl', 'Numbers > Debt > Student loans > Federal student loan', 4]
];
const WIDTHS = [['phone', 375, 740], ['computer', 1280, 800]];

// A small seeded random, so a run can be repeated.
const seed = +(arg('--seed') || Date.now() % 100000);
let x = seed || 1;
const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
// Six: at least two deep (level 3 or 4), the rest from anywhere, each at a random width.
const deep = shuffle(POOL.filter((p) => p[2] >= 3)).slice(0, 2);
const rest = shuffle(POOL.filter((p) => !deep.includes(p))).slice(0, 4);
const picks = shuffle([...deep, ...rest]).map((p) => [...p, WIDTHS[Math.floor(rand() * WIDTHS.length)]]);

function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^(\.\.[/\\])+/, '');
    try { const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const server = await serve();
const base = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch();
await mkdir(join(ROOT, 'docs/squint'), { recursive: true });
const shots = [];
for (const [i, [url, name, level, [wname, width, height]]] of picks.entries()) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(base + url); await page.waitForTimeout(1000);
  const file = 'docs/squint/screen-' + (i + 1) + '.png';
  await page.screenshot({ path: join(ROOT, file) });
  shots.push({ n: i + 1, url, name, level, width: wname, file: file.replace('docs/', '') });
  await ctx.close();
}
await browser.close(); server.close();

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Squint test</title>
<style>
  body { margin: 0; padding: 24px; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #182134; background: #fff; }
  h1 { font-size: 1.6rem; margin: 0 0 8px; }
  h2 { font-size: 1.1rem; margin: 0 0 6px; }
  .how { max-width: 72ch; margin: 0 0 20px; }
  .how ol { padding-left: 1.3em; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  figure { margin: 0; break-inside: avoid; }
  .shot { display: block; width: 100%; height: 300px; object-fit: cover; object-position: top; filter: blur(5px); border: 1px solid #d9dfeb; border-radius: 8px; background: #f5f7fb; }
  figcaption { margin-top: 6px; font-size: 0.9rem; }
  .answers { margin-top: 24px; break-before: page; }
  .answers li { margin: 4px 0; }
  .key { font-size: 0.85rem; color: #5a6478; }
  button { font: inherit; padding: 8px 14px; border: 1px solid #0f52ba; border-radius: 6px; background: #0f52ba; color: #fff; cursor: pointer; }
  @media print { button { display: none; } body { padding: 0; } .grid { gap: 12px; } .shot { height: 240px; } }
</style>
</head>
<body>
<h1>Squint test: can a friend tell where they are?</h1>
<div class="how">
  <p>Six screens of SLAM, chosen at random (at least two from the deep levels, where the real work happens), blurred so the words cannot be read closely. Made on ${new Date().toISOString().slice(0, 10)} with seed ${seed} (run <code>node tools/squint-test.mjs --seed ${seed}</code> to get the same six). The made-up demo household.</p>
  <h2>How to run it (two minutes a person)</h2>
  <ol>
    <li>Print this page (or hand over the screen) and give a friend a pen.</li>
    <li>On each screen, ask them to circle six things: <strong>the site ID</strong>, <strong>the page name</strong>, <strong>the main sections</strong>, <strong>the options at this level</strong>, <strong>where "you are here" is marked</strong>, and <strong>search</strong>.</li>
    <li>Two minutes for all six screens. No zooming in, no reading closely: a squint is the point.</li>
    <li>Count the circles that landed. The answer key on the last page says what is where. Anything missed on two screens or more is a fail for the Phase 3 gate (BOARD.md).</li>
  </ol>
  <button type="button" onclick="print()">Print this page</button>
</div>
<div class="grid">
${shots.map((s) => `  <figure><img class="shot" src="${s.file}" alt="Screen ${s.n}, blurred"><figcaption><strong>Screen ${s.n}</strong> (${s.width})</figcaption></figure>`).join('\n')}
</div>
<section class="answers">
  <h2>Answer key (for the coach, after the two minutes)</h2>
  <ol>
${shots.map((s) => `    <li><strong>Screen ${s.n}</strong>: ${s.name} (level ${s.level}, ${s.width} width). <span class="key">Site ID top left; page name as the heading under the tabs (and the last, bold step of the trail below level 2); sections as the five tabs (bottom on a phone, top on a computer); options as the second-level tabs, the siblings row or the rows; you are here as the filled, bold tab and second-level tab; search as the box in the header.</span></li>`).join('\n')}
  </ol>
</section>
</body>
</html>
`;
await writeFile(join(ROOT, 'docs/squint-test.html'), page);
console.log('seed ' + seed + ': ' + shots.map((s) => s.n + ' ' + s.url + ' (' + s.width + ')').join('; '));
