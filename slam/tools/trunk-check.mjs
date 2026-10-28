// Krug's trunk test (S-288), run by a browser on every page, every second-level tab, and one level-3 and one level-4
// screen in each section, at phone and computer width. Each screen passes or fails on: the site ID, the page name,
// the main sections, the options at this level, you are here (both tab levels marked with two cues: the fill and
// bold), search, and the first thing to do visible without scrolling. Writes docs/TRUNK_TEST.md.
//   cd slam && python3 -m http.server 8766 &   then   SLAM_URL=http://localhost:8766/ node tools/trunk-check.mjs
// Named like the other checkers, not *-test.mjs: `node --test` would run a *-test.mjs file as a unit test, with no
// browser and no server (S-292).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.SLAM_URL || 'http://localhost:8766/';

import { SCREENS } from './trunk-test-screens.mjs';
const WIDTHS = [[390, 800, 'phone'], [1280, 900, 'computer']];
const CHECKS = ['Site ID', 'Page name', 'Sections', 'Local options', 'You are here', 'Search', 'First action'];

async function look(page, level) {
  return page.evaluate((level) => {
    const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(), c = getComputedStyle(el); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none'; };
    const twoCues = (li) => {
      if (!li) return false;
      const a = li.querySelector('a, span') || li, sib = li.parentElement && [...li.parentElement.children].find((x) => x !== li);
      const me = getComputedStyle(a), them = sib ? getComputedStyle(sib.querySelector('a, span') || sib) : null;
      const bold = +me.fontWeight >= 600 && (!them || +them.fontWeight < +me.fontWeight);
      const fill = !them || me.backgroundColor !== them.backgroundColor || getComputedStyle(li).backgroundColor !== getComputedStyle(sib).backgroundColor;
      return bold && fill;
    };
    const main = document.querySelector('nav.tabbar');
    const sub = document.querySelector('nav.subtabs');
    const h1 = document.querySelector('h1');
    const localish = sub || [...document.querySelectorAll('.siblings, .go-list, .edit-actions, .segmented, .agenda, .try-it, .seg-row, .tool-form, main details')].find(shown);
    const first = [...document.querySelectorAll('main .btn.primary, main #looks-right, main .go-row, main .agenda-resume, main a.btn, main button.btn')].find(shown);
    return {
      'Site ID': shown(document.querySelector('.site-id')),
      'Page name': shown(h1) && h1.textContent.trim().length > 0,
      'Sections': shown(main) && main.querySelectorAll('.tab-item').length === 5,
      'Local options': shown(localish),
      'You are here': twoCues(main && main.querySelector('.tab-item.is-here')) && (!sub || level < 2 || twoCues(sub.querySelector('.tab-item.is-here'))),
      'Search': shown(document.getElementById('top-search')),
      'First action': !!first && first.getBoundingClientRect().top < innerHeight && first.getBoundingClientRect().bottom > 0,
      name: h1 ? h1.textContent.trim() : ''
    };
  }, level);
}

const browser = await chromium.launch();
const rows = [];
for (const [w, hgt, wname] of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: hgt } });
  for (const [level, url] of SCREENS) {
    await page.goto(BASE + url); await page.waitForTimeout(1200);
    const r = await look(page, level);
    rows.push({ level, url, width: wname, ...r });
  }
  await page.close();
}
await browser.close();
const fails = rows.filter((r) => CHECKS.some((c) => !r[c]));
const md = ['# Trunk test', '', 'Krug\'s trunk test, run by `tools/trunk-check.mjs` on the made-up example household: every main tab, every second-level tab, and a level-3 (group) and level-4 (item) screen in each section, at phone (390px) and computer (1280px) width. Pass is a check mark.', '',
  '- Site ID: "Stress Less About Money" shows top left.', '- Page name: the page title shows.', '- Sections: the five main tabs show.', '- Local options: the second-level tabs, the siblings strip or the screen\'s own choices show.',
  '- You are here: the current main tab (and second-level tab, where there is one) is marked with two cues at once, a fill and bold.', '- Search: the search box shows.', '- First action: the first thing to do is on screen without scrolling.', '',
  `Result: ${rows.length - fails.length} of ${rows.length} screens pass every check.`, '',
  '| Level | Screen | Width | Title | ' + CHECKS.join(' | ') + ' |', '|' + ' --- |'.repeat(4 + CHECKS.length),
  ...rows.map((r) => `| ${r.level} | ${r.url} | ${r.width} | ${r.name} | ` + CHECKS.map((c) => (r[c] ? '✓' : 'FAIL')).join(' | ') + ' |'), ''];
writeFileSync(new URL('../docs/TRUNK_TEST.md', import.meta.url), md.join('\n'));
console.log(`trunk test: ${rows.length - fails.length} of ${rows.length} pass`);
for (const f of fails) console.log('FAIL', f.width, f.url, CHECKS.filter((c) => !f[c]).join(', '));
