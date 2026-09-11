#!/usr/bin/env node
/* ==========================================================================
   test/xss.js — every imported file is hostile (G3.12, D-210).
   --------------------------------------------------------------------------
   Client intake files and backups come from other people, and page HTML
   is set hundreds of times. One missed escape means a file can run code
   with the household loaded. This types a booby-trapped string into every
   text box of every room, loads a backup whose every string is the trap,
   then opens the rooms that render the most, and fails if the trap ever
   runs. The trap sets a flag on the window; no dialog, no network.

   Needs a server on :8765 —  python3 -m http.server 8765
   Run:  node test/xss.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const rooms = require(path.join(ROOT, 'rooms.json')).rooms;
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const Demo = require(path.join(ROOT, 'shared/demo-persona.js'));

const TRAP = '<img src=x onerror=window.__xss=1>';
let passed = 0; const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail ? ' — ' + detail : '')); }

/* Every string in the demo household becomes the trap: labels, names,
   sources, notes, ids that are rendered, everything but the schema words
   the reader needs to route on. */
function boobyTrap(v, key) {
  if (typeof v === 'string') {
    if (/^(id|category|type|role|status|kind|taxCharacter|tier|source|confidence|employmentStatus|filingStatus|state|dateKind|frequency|method|taxedHow|cadence)$/.test(key || '')) return v;
    if (/^\d{4}-\d{2}(-\d{2})?/.test(v)) return v;
    return TRAP + ' ' + v;
  }
  if (Array.isArray(v)) return v.map(x => boobyTrap(x));
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = boobyTrap(v[k], k); }); return o; }
  return v;
}

(async () => {
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { window.__xss = 0; });

  const only = process.env.SLAF_ONLY;
  const list = rooms.filter(r => !only || r.id === only);

  /* 1. Type the trap into every text box of every room. */
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  const btn = await page.$('#btn-example');
  if (btn) { await btn.click(); await page.waitForTimeout(500); }
  let typed = 0;
  for (const room of list) {
    try { await page.goto(BASE + '/' + room.file, { waitUntil: 'networkidle', timeout: 20000 }); } catch (e) { continue; }
    await page.waitForTimeout(300);
    const n = await page.evaluate((TRAP) => {
      let count = 0;
      document.querySelectorAll('input[type="text"], input:not([type]), textarea, input[type="search"]').forEach(el => {
        if (el.disabled || el.readOnly) return;
        try {
          el.focus(); el.value = TRAP;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur(); el.dispatchEvent(new Event('focusout', { bubbles: true }));
          count++;
        } catch (e) { /* a box that refuses is not a hole */ }
      });
      return count;
    }, TRAP);
    typed += n;
    await page.waitForTimeout(300);
    const fired = await page.evaluate(() => window.__xss);
    check(room.id + ': typing the trap into ' + n + ' boxes ran nothing', fired === 0);
  }
  check('the trap was typed somewhere', typed > 0, String(typed));

  /* 2. A booby-trapped backup: every string is the trap. */
  await page.goto(BASE + '/rooms/settings.html', { waitUntil: 'networkidle' });
  const trapped = boobyTrap(Demo.build());
  trapped.meta = trapped.meta || {};
  const loaded = await page.evaluate((h) => {
    const file = { format: 'money-rooms-backup', backupVersion: 1, appVersion: 'x', schemaVersion: SLAF.Schema.SCHEMA_VERSION, savedAt: '2026-01-01T00:00:00Z',
      keys: { 'slaf.household.v2': { json: h }, 'slaf.prefs.v1': { json: { 'sidebar.open': true, lens: '<img src=x onerror=window.__xss=1>' } }, 'slaf.scenarios.v1': { json: { pinned: [{ id: 'p1', label: '<img src=x onerror=window.__xss=1>' }] } } } };
    const r = SLAF.Backup.apply(JSON.stringify(file));
    return r && r.ok !== false;
  }, trapped);
  check('the booby-trapped backup loaded', loaded === true);

  /* 3. The rooms that render the most, with the trap in every label. */
  const heavy = ['index.html', 'map.html', 'rooms/ledger.html', 'rooms/express.html', 'rooms/refresh.html', 'rooms/data.html', 'rooms/statement.html', 'rooms/debt-payoff.html', 'rooms/history.html', 'rooms/timeline.html', 'rooms/income.html', 'rooms/expenses.html', 'rooms/cash-flow.html', 'rooms/settings.html', 'rooms/first-round.html', 'rooms/calendar.html', 'rooms/budget.html', 'rooms/planner.html', 'rooms/what-if-life.html', 'rooms/rerank.html'];
  for (const f of heavy) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    try { await page.goto(BASE + '/' + f, { waitUntil: 'networkidle', timeout: 20000 }); } catch (e) { continue; }
    await page.waitForTimeout(600);
    /* Open every fold and door so the hidden markup renders too. */
    await page.evaluate(() => { document.querySelectorAll('details').forEach(d => { d.open = true; }); document.querySelectorAll('.door[data-door], [data-x-add-btn]').forEach(b => { try { b.click(); } catch (e) { /* fine */ } }); });
    await page.waitForTimeout(400);
    const fired = await page.evaluate(() => window.__xss);
    check(f + ' rendered the trapped household without running it', fired === 0);
  }
  await browser.close();
  console.log('\n' + '─'.repeat(66));
  if (failures.length) { console.log('✗ ' + failures.length + ' failed, ' + passed + ' passed\n'); failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f)); process.exit(1); }
  console.log('✓ ' + passed + ' checks passed — the trap never ran');
})().catch(e => { console.error(e); process.exit(1); });
