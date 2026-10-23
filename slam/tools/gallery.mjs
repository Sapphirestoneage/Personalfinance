// Screenshot gallery (S-109): every screen and Insights tab, on a phone and a
// desktop, light and dark, for Riley and Maya (the clock on October 17, 2026),
// in one page that scrolls like a slide deck, each with a caption.
//
// Depends on Playwright and on node's fs and child_process; nothing from src/. It reads
// tools/gallery-approved/*.jpg and writes tools/gallery/ (the changed shots and gallery.html).
//
// The last approved set lives in tools/gallery-approved/. A screenshot that
// matches it is shown from there; one that differs (or is new) is saved in
// tools/gallery/ and marked "Changed since approved". To approve the current set:
//   node slam/tools/gallery.mjs --approve
//
// Run from the repo root, with the slam folder served:
//   (cd slam && python3 -m http.server 8765 &) ; node slam/tools/gallery.mjs
// Then open slam/tools/gallery/gallery.html in a browser.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
// Playwright is not in package.json: take it from this folder's node_modules, or from the global install.
try { playwright = require('playwright'); } catch (e) { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }

// URL here is the site's address, so the URL class is reached through globalThis.
const URL = process.env.SLAM_URL || 'http://localhost:8765/';
const OUT = new globalThis.URL('./gallery/', import.meta.url).pathname;
const APPROVED = new globalThis.URL('./gallery-approved/', import.meta.url).pathname;
const approve = process.argv.includes('--approve');
const PEOPLE = [['riley', 'Riley, 31'], ['maya', 'Maya, 26']];
const VIEWS = [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]];
const THEMES = ['light', 'dark'];
// [file part, caption, hash, data-key to click]
const SHOTS = [
  ['today', 'Today: the loop, Next, cash for 30 days, four numbers', 'today'],
  ['plan', 'Plan: next month\'s plan', 'plan', 'plan-view-plan'],
  ['estimates', 'Plan: your estimates (the Rough pass)', 'plan', 'plan-view-estimates'],
  ['track', 'Track: scheduled items, quick entry, the log, the calendar, import', 'track'],
  ['review', 'Review: fill gaps, close the month, mistakes, past months', 'review'],
  ['insights-where', 'Insights: Where it goes', 'insights', 'tab-where'],
  ['insights-compared', 'Insights: Compared', 'insights', 'tab-compared'],
  ['insights-time', 'Insights: Over time', 'insights', 'tab-time'],
  ['insights-cash', 'Insights: Cash', 'insights', 'tab-cash'],
  ['insights-networth', 'Insights: Net worth: both net worths, the bridge, owning next to the alternative', 'insights', 'tab-networth'],
  ['insights-you', 'Insights: You', 'insights', 'tab-you'],
  ['setup', 'Setup: Basics (one section open at a time)', 'setup', 'setup-basics']
];

mkdirSync(OUT, { recursive: true });
mkdirSync(APPROVED, { recursive: true });
// Start tools/gallery/ clean, so after the run it holds only what differs from the approved set.
for (const f of readdirSync(OUT)) if (f.endsWith('.jpg')) rmSync(OUT + f);

const browser = await playwright.chromium.launch();
const slides = [];
for (const [who, button] of PEOPLE) {
  for (const [view, size] of VIEWS) {
    for (const theme of THEMES) {
      const page = await browser.newPage({ viewport: size, colorScheme: theme });
      // The demo clock: with the date fixed, a shot differs only when the screen does.
      await page.clock.setFixedTime(new Date('2026-10-17T12:00:00'));
      await page.goto(URL + '#clients');
      await page.getByText(button).first().click();
      await page.waitForSelector('#headline');
      for (const [part, caption, hash, click] of SHOTS) {
        await page.evaluate((x) => { location.hash = x; }, hash);
        await page.waitForSelector('#main[data-screen="' + hash + '"]');
        if (click) await page.click('[data-key="' + click + '"]');
        // The shot is the viewport, not the whole page.
        await page.waitForTimeout(200);
        await page.evaluate(() => window.scrollTo(0, 0));
        const name = [who, view, theme, part].join('-') + '.jpg';
        const shot = await page.screenshot({ type: 'jpeg', quality: 80 });
        // Changed or not is decided byte for byte: no approved file of this name, or JPEG bytes that
        // differ (no tolerance, so a one-pixel shift counts). With --approve the shot becomes the
        // approved file and nothing is marked changed.
        const before = existsSync(APPROVED + name) ? readFileSync(APPROVED + name) : null;
        const changed = !before || !before.equals(shot);
        if (approve) writeFileSync(APPROVED + name, shot);
        else if (changed) writeFileSync(OUT + name, shot);
        slides.push({ name, who, view, theme, caption, changed: !approve && changed, isNew: !before });
      }
      await page.close();
    }
  }
}
await browser.close();

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const changedCount = slides.filter((s) => s.changed).length;
// The page shows an unchanged shot from the approved folder (not copied) and a changed one from
// tools/gallery/, marked in red; the arrow keys move one slide at a time.
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SLAM gallery</title>
<style>
  :root { color-scheme: light dark; --bg: #f5f7fb; --text: #1a2233; --muted: #5b6577; --bad: #b42318; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0c1220; --text: #e6eaf2; --muted: #9aa4b8; --bad: #ff8a80; } }
  html { scroll-snap-type: y mandatory; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; }
  header, section { scroll-snap-align: start; min-height: 100vh; box-sizing: border-box; padding: 24px 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
  img { max-width: 100%; max-height: 78vh; border: 1px solid #8884; border-radius: 8px; box-shadow: 0 4px 24px #0002; }
  .cap { font-size: 18px; font-weight: 600; text-align: center; }
  .meta { color: var(--muted); font-size: 14px; }
  .changed { color: var(--bad); font-weight: 700; }
</style></head><body>
<header><h1>SLAM, every screen</h1>
<p class="meta">${slides.length} screenshots: Riley and Maya, phone and desktop, light and dark, October 17, 2026.</p>
<p class="meta">${approve ? 'This set was just approved.' : changedCount ? '<span class="changed">' + changedCount + ' changed since the approved set</span> (marked in red).' : 'Nothing changed since the approved set.'}</p>
<p class="meta">Scroll, or use the arrow keys, one screen at a time.</p></header>
${slides.map((s, i) => `<section id="s${i + 1}">
  <img loading="lazy" src="${s.changed ? s.name : '../gallery-approved/' + s.name}" alt="${esc(s.caption)}">
  <div class="cap">${esc(s.caption)}</div>
  <div class="meta">${s.who === 'riley' ? 'Riley' : 'Maya'}, ${s.view}, ${s.theme} &middot; ${i + 1} of ${slides.length}${s.changed ? ' &middot; <span class="changed">' + (s.isNew ? 'New, not approved yet' : 'Changed since approved') + '</span>' : ''}</div>
</section>`).join('\n')}
<script>
  document.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(e.key)) return;
    e.preventDefault();
    const all = [...document.querySelectorAll('header, section')];
    const at = all.findIndex((x) => x.getBoundingClientRect().top >= -5);
    const next = all[Math.max(0, Math.min(all.length - 1, at + (e.key === 'ArrowDown' || e.key === 'PageDown' ? 1 : -1)))];
    next.scrollIntoView({ behavior: 'smooth' });
  });
</script>
</body></html>
`;
writeFileSync(OUT + 'gallery.html', html);
console.log((approve ? 'Approved ' : 'Took ') + slides.length + ' screenshots; ' + changedCount + ' changed since approved. Open slam/tools/gallery/gallery.html');
