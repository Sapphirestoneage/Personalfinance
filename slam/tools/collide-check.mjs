// Fields never collide (owner, 2026-10-28; DESIGN.md rules 23 to 27): on the Session steps and a My numbers item, at a
// laptop width and a phone width, on a made-up household with many long-named cards, it fails when
//   - a name, a label, a question or a button's words are cut off (its text is wider than its box);
//   - a picker is narrower than the choice it shows;
//   - a box has no visible label (a row with one box may use the row's name);
//   - two pieces of one row overlap.
// Run from the repo root with the slam folder served:
//   (cd slam && python3 -m http.server 8765 &) ; node slam/tools/collide-check.mjs

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.env.SLAM_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const SIZES = [['laptop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]];
const SCREENS = ['session.html#/debt', 'session.html#/assets', 'session.html#/taxes', 'session.html#/income', 'session.html#/needs', 'session.html#/goals', 'ledger.html#/debt', 'ledger.html#/protection', 'plan.html'];

// The demo with nine long-named cards added (made up), as in the owner's screenshot.
function household() {
  const demo = JSON.parse(readFileSync(new URL('../fixtures/demo.json', import.meta.url), 'utf8'));
  const F = (value) => ({ value, kind: 'known', asOf: demo.meta.asOf, source: 'made up' });
  const names = ['Amex Blue Preferred', 'Business Cash Rewards', 'Business Ink Unlimited 2', 'Amazon Prime Rewards Visa', 'Sapphire Preferred', 'Freedom Unlimited', 'Quicksilver One', 'Venture X Rewards', 'Citi Double Cash'];
  const cards = names.map((n, i) => ({ id: 'cc' + i, family: 'debt', type: 'credit_card', name: F(n), balance: F(800 + i * 300), apr: F(0.19 + i / 100), minimum: F(40), dueDay: F(3 + i), business: F(i < 2), reportsToPersonalCredit: F(true) }));
  return { ...demo, meta: { ...demo.meta, demo: false, name: 'Collide check (made up)' }, debts: [...demo.debts, ...cards] };
}

const browser = await playwright.chromium.launch();
const problems = [];
for (const [size, viewport] of SIZES) {
  const page = await browser.newPage({ viewport });
  await page.goto(BASE + 'session.html');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('slam-spine:v1', JSON.stringify(s)); }, household());
  for (const url of SCREENS) {
    await page.goto('about:blank'); await page.goto(BASE + url); await page.waitForTimeout(1400);
    // Open every row's fold of questions, so what they hold is checked too.
    await page.evaluate(() => { for (const d of document.querySelectorAll('#app details.tick-list')) d.open = true; });
    await page.waitForTimeout(150);
    const found = await page.evaluate(() => {
      const out = [], seen = new Set();
      const visible = (el) => !!el.offsetParent && el.getBoundingClientRect().width > 0;
      const say = (kind, el, words) => { const k = kind + words; if (!seen.has(k)) { seen.add(k); out.push(kind + ': ' + words); } };
      const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 60);
      // Words cut off: a short text element wider inside than its box.
      for (const el of document.querySelectorAll('#app .srow-name, #app .field-cap, #app label, #app .tick-q, #app summary, #app .btn, #app .go-name, #app .mini-label, #app h2, #app h3')) {
        if (!visible(el) || !el.textContent.trim()) continue;
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible') say('cut off', el, name(el));
        const r = el.getBoundingClientRect();
        if (el.classList.contains('srow-name') && r.width < 64) say('squeezed name', el, name(el) + ' (' + Math.round(r.width) + 'px)');
      }
      // A picker narrower than the choice it shows.
      const ctx = document.createElement('canvas').getContext('2d');
      for (const s of document.querySelectorAll('#app select')) {
        if (!visible(s) || s.selectedIndex < 0) continue;
        const cs = getComputedStyle(s);
        ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        const need = ctx.measureText(s.options[s.selectedIndex].text).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 16;
        if (need > s.clientWidth + 2) say('picker too narrow', s, name(s) + ' shows "' + s.options[s.selectedIndex].text + '"');
      }
      // A box with no visible label.
      for (const b of document.querySelectorAll('#app input:not([type=checkbox]):not([type=radio]):not([type=file]), #app select, #app textarea')) {
        if (!visible(b) || b.closest('.headline-strip') || b.closest('header')) continue;
        const lab = b.id && document.querySelector('label[for="' + CSS.escape(b.id) + '"]');
        if ((lab && visible(lab)) || (b.closest('label') && b.closest('label').textContent.trim())) continue;
        const by = b.getAttribute('aria-labelledby'); if (by && document.getElementById(by.split(' ')[0])) continue;
        const row = b.closest('.srow, .list-row, .tier-row, .tick-box');
        if (row && row.matches('.list-row, .tier-row')) continue; // a table of boxes under its own column heads
        if (row && row.matches('.srow') && row.querySelectorAll('input, select').length === 1 && row.querySelector('.srow-name')) continue;
        say('no label', b, name(b));
      }
      // Two pieces of one row overlapping.
      for (const row of document.querySelectorAll('#app .srow')) {
        const kids = [...row.children].filter(visible).map((k) => [k, k.getBoundingClientRect()]);
        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
          const [a, ra] = kids[i], [b, rb] = kids[j];
          const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), hgt = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (w > 2 && hgt > 2) say('overlap', a, name(a) + ' and ' + name(b));
        }
      }
      return out;
    });
    for (const f of found) problems.push(size + ', ' + url + ': ' + f);
  }
  await page.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'No field collides: every word fits, every box is labeled, nothing overlaps.');
console.log('\n' + problems.length + ' problems on ' + SCREENS.length + ' screens at ' + SIZES.length + ' sizes.');
if (problems.length) process.exitCode = 1;
