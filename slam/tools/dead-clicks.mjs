// Dead clicks at 375px (Phase 2.5, Batch 2): on each page, every visible thing a person would tap (a link, a button, a
// fold, a tappable row or card, a label) is tapped where a finger would land, on a fresh load. It is dead when the
// tap changes nothing (no new address, nothing on the page changes, no box takes the focus), and hidden when
// something else (the tab bar, Back and the trail) sits over it, even with the page scrolled as far as it goes.
// The tab already chosen, tapped at the top of its page, does nothing by design and is not counted.
// Run from the repo root with slam served:
//   (cd slam && python3 -m http.server 8765 &) ; node slam/tools/dead-clicks.mjs [today,calendar,spending]

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }

const URL = process.env.SLAM_URL || 'http://localhost:8765/';
const FILES = { today: 'dashboard.html', session: 'session.html', numbers: 'ledger.html', calendar: 'calendar.html', spending: 'spending.html', plan: 'plan.html' };
const pages = (process.argv[2] || 'today,calendar,spending').split(',');

// Everything that looks tappable, in page order, with a short name.
const LIST = () => {
  const sel = 'a[href], button, summary, label, select, input, [role="button"], [onclick], .row-main, .go-row, .card-link';
  const seen = new Set(), out = [];
  for (const el of document.querySelectorAll(sel)) {
    if (seen.has(el)) continue; seen.add(el);
    if (el.closest('details:not([open]) > :not(summary)')) continue;
    if (el.matches('input[type="hidden"], [disabled], [aria-current="page"].tab, .skip')) continue;
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    if (!r.width || !r.height || st.visibility === 'hidden' || st.display === 'none' || st.pointerEvents === 'none') continue;
    out.push(el);
  }
  return out;
};

const b = await playwright.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: false });
const page = await ctx.newPage();
let total = 0;
for (const name of pages) {
  const href = URL + FILES[name];
  await page.goto(href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const n = await page.evaluate(`(${LIST})().length`);
  const dead = [], hidden = [];
  for (let i = 0; i < n; i++) {
    await page.goto(href, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    const at = await page.evaluate(([i, list]) => {
      const el = eval('(' + list + ')')()[i];
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      // The first line of a link that wraps, so the tap lands on it.
      const r = el.getClientRects()[0] || el.getBoundingClientRect();
      const x = r.left + Math.min(r.width / 2, 20), y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      const name = (el.getAttribute('aria-label') || el.textContent || el.value || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 60);
      const covered = !top || !(el.contains(top) || (el.tagName === 'LABEL' && el.control === top));
      window.__changes = 0;
      new MutationObserver((m) => { window.__changes += m.length; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      window.__focus = document.activeElement;
      return { x, y, name, covered, by: top ? top.className || top.tagName : '' };
    }, [i, LIST.toString()]);
    if (!at) continue;
    if (at.covered) { hidden.push(at.name + ' (under ' + at.by + ')'); continue; }
    const before = page.url();
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(150);
    let alive = page.url() !== before;
    if (!alive) alive = await page.evaluate(() => window.__changes > 0 || document.activeElement !== window.__focus).catch(() => true);
    if (!alive) dead.push(at.name);
  }
  total += dead.length + hidden.length;
  console.log(name + ': ' + n + ' tapped, ' + dead.length + ' dead, ' + hidden.length + ' hidden');
  for (const d of dead) console.log('  dead: ' + d);
  for (const d of hidden) console.log('  hidden: ' + d);
}
await b.close();
process.exit(total ? 1 : 0);
