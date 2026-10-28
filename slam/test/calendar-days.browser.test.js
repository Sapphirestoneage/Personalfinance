// Bug sweep, step 1: tapping a day crashed the Calendar ("msOn is not defined"). This opens every day route of this
// month and the next in a real browser (Playwright, already in this environment) on the demo household, and fails on
// any page error. Skipped when Playwright is not installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { SLAM } from './spine-helpers.js';

const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require('playwright')); } catch { chromium = null; }

test('every Calendar day route opens without an error', { skip: !chromium && 'Playwright is not installed' }, async () => {
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
  const server = createServer(async (req, res) => {
    try { const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'text/plain' }); res.end(await readFile(join(SLAM, p))); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = 'http://127.0.0.1:' + server.address().port + '/calendar.html';
    await page.goto(base); await page.waitForTimeout(800);
    const now = new Date(), days = [];
    for (let m = 0; m < 2; m++) {
      const y = now.getFullYear() + Math.floor((now.getMonth() + m) / 12), mm = (now.getMonth() + m) % 12 + 1;
      const last = new Date(y, mm, 0).getDate();
      for (let d = 1; d <= last; d++) days.push(y + '-' + String(mm).padStart(2, '0') + '-' + String(d).padStart(2, '0'));
    }
    for (const day of days) {
      await page.evaluate((h) => { location.hash = h; }, '#/' + day);
      await page.waitForTimeout(60);
      assert.ok(await page.locator('#day-card').count(), day + ' shows its day screen');
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
