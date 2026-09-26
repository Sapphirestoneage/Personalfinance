#!/usr/bin/env node
/* ==========================================================================
   test/onefact.js — one fact, one question, every door (G2.9, D-209).
   --------------------------------------------------------------------------
   Guided, Express and the in-room asks are three ways to reach the same
   row. Once a row has any value, no door may ask for it again; every door
   only offers to confirm or sharpen it. This answers every askable row in
   Express, then opens every room that asks rows in context (askIn in
   data/ledger-rows.json) and fails if any of them shows an empty-field
   question for a row that already has a value: an inline ask card for it,
   or an empty input bound to its field.

   Needs a server on :8765 —  python3 -m http.server 8765
   Run:  node test/onefact.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ledger-rows.json'), 'utf8')).rows;
const Registry = require(path.join(ROOT, 'shared/registry.js'));

let passed = 0; const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail ? ' — ' + detail : '')); }

(async () => {
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());

  /* Answer every askable, non-repeat row in Express, through the owner. */
  await page.goto(BASE + '/rooms/ledger.html#all-at-once', { waitUntil: 'networkidle' });
  /* An empty household arrives in the walk, one family at a time (D-303).
     The writes below go through the owner, not the screen, so the full view
     is switched on first: every row on the page at once, none behind a step. */
  await page.waitForSelector('.xmode-btn[data-mode="all"]', { state: 'attached' });
  await page.click('.xmode-btn[data-mode="all"]');
  await page.waitForSelector('[data-x-row="dob"]');
  const written = await page.evaluate((rows) => {
    const Own = SLAF.Ownership, Spine = SLAF.Spine;
    Own.write('employmentStatus', 'employed');
    Own.write('zip', '12203'); Own.write('filingStatus', 'single');
    const sample = { cents: 12345, percent: 0.06, rate: 0.05, months: 6, years: 20, count: 2, bool: true };
    const out = [];
    rows.forEach(r => {
      if (!r.askIn || r.kind === 'computed' || r.repeat) return;
      const f = Own.FIELDS[r.id];
      if (!f || typeof f.write !== 'function') return;
      let v = sample[r.unit];
      if (r.unit === 'percent' && r.id === 'contributionPercent') v = 6;
      if (r.unit === 'enum') v = (r.values || [])[0] || null;
      if (v === undefined || v === null) return;
      try { Own.write(r.id, v); if (SLAF.Money.isOk(f.read(Spine.getProfile()))) out.push(r.id); } catch (e) { /* not applicable in this household */ }
    });
    return out;
  }, rows);
  check('Express wrote a broad set of askable rows', written.length >= 20, String(written.length));

  const roomsToVisit = Array.from(new Set(rows.filter(r => r.askIn).map(r => r.askIn)));
  for (const roomId of roomsToVisit) {
    const room = Registry.byId(roomId);
    if (!room) { failures.push('askIn names a room the registry lacks: ' + roomId); continue; }
    const errs = []; const onErr = e => errs.push(e.message); page.on('pageerror', onErr);
    await page.goto(BASE + '/' + room.href, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(900);
    const seen = await page.evaluate((written) => {
      const ask = document.getElementById('slaf-ask');
      const askRow = ask && !ask.hidden ? ask.getAttribute('data-ask-row') : null;
      const empties = [];
      written.forEach(id => {
        document.querySelectorAll('[data-field="' + id + '"], [data-x-row="' + id + '"] [data-x-input]').forEach(n => {
          if ((n.tagName === 'INPUT' || n.tagName === 'SELECT') && !n.hidden && String(n.value || '').trim() === '') empties.push(id);
        });
      });
      return { askRow, empties };
    }, written);
    page.off('pageerror', onErr);
    check(roomId + ': no inline ask for a row that has a value', !seen.askRow || written.indexOf(seen.askRow) === -1, 'asked ' + seen.askRow);
    check(roomId + ': no empty box bound to a row that has a value', seen.empties.length === 0, seen.empties.join(','));
    check(roomId + ': no page error', errs.length === 0, errs.join(' | '));
  }
  /* ---- The one fact a room is blocked on (D-354) ---------------------------
     The other half of the rule: with an empty household, a room whose
     registry `needs` names a writable, askable row asks for THAT row, and no
     room ever asks for a fact it neither owns nor is blocked on. */
  {
    const Own = require(path.join(ROOT, 'shared/ownership.js'));
    const byId = id => rows.filter(r => r.id === id || (r.aliases || []).indexOf(id) >= 0)[0] || null;
    const ASKABLE = ['cents', 'percent', 'rate', 'months', 'years', 'count', 'enum', 'bool', 'text'];
    const blocked = [];
    Registry.all().forEach(room => {
      /* The Ledger and Start Here never carry the card: they ARE the asking
         (shared/progress.js). Everywhere else, the row is picked in the
         Ledger's own pass order, which is the order shared/ask.js walks. */
      if (['ledger', 'start'].indexOf(room.id) >= 0) return;
      const needs = room.needs || [];
      const first = rows.filter(r => needs.indexOf(r.id) >= 0).filter(r => {
        const f = Own.FIELDS[r.id];
        return f && typeof f.write === 'function' && ASKABLE.indexOf(r.unit) >= 0 && r.kind !== 'computed' && !r.repeat;
      })[0];
      if (first) blocked.push({ room, row: first });
    });
    check('some rooms are blocked on a fact they can ask for', blocked.length >= 5, String(blocked.length));
    for (const b of blocked.slice(0, 8)) {
      await page.goto(BASE + '/rooms/index.html', { waitUntil: 'domcontentloaded' }).catch(() => null);
      await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* fine */ } });
      await page.goto(BASE + '/' + b.room.href, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
      await page.waitForTimeout(900);
      const asked = await page.evaluate(() => {
        const a = document.getElementById('slaf-ask');
        return a && !a.hidden ? { row: a.getAttribute('data-ask-row'), q: (a.querySelector('.ask-q') || {}).textContent || '', help: !!a.querySelector('.slaf-help') } : null;
      });
      check(b.room.id + ': asks for the fact it is blocked on', !!asked && asked.row === b.row.id, asked ? asked.row : 'asked nothing');
      if (asked) check(b.room.id + ': asks it in plain words, with the fold under it', asked.help && asked.q.indexOf(b.row.plain.slice(0, 20)) === 0, asked.q.slice(0, 60));
    }
  }

  await browser.close();
  console.log('\n' + '─'.repeat(66));
  if (failures.length) { console.log('✗ ' + failures.length + ' failed, ' + passed + ' passed\n'); failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f)); process.exit(1); }
  console.log('✓ ' + passed + ' checks passed — a row with a value is never asked again');
})().catch(e => { console.error(e); process.exit(1); });
