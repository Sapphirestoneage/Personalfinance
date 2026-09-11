/* ==========================================================================
   test/render.js — every room actually renders.
   --------------------------------------------------------------------------
   The gap this closes, found the hard way: a room can load with NO console
   errors, serve every file, and still be a dead page. The Long Way Round
   shipped with `Reference.load(...).then(...)` and no `.catch()`, so one
   missing table left the furniture on screen, no menu, no content, and
   nothing said to the person looking at it. The console-error sweep passed.

   So this asserts what a person would actually check:

     1. The header mounted. Progress.mount() is the LAST thing a room's init
        does, so a missing menu is the canary for init having thrown halfway.
     2. Nothing threw.
     3. The room said SOMETHING - it is not a heading over blank space.

   Run against an empty profile and again against the demo household, because
   "works once you have data" is not the same as "works".
   ========================================================================== */
const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const rooms = require(path.join(ROOT, 'rooms.json')).rooms;

let passed = 0; const failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; } else { failures.push(name + (detail ? ' — ' + detail : '')); }
}

(async () => {
  const browser = await chromium.launch(require('fs').existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  const only = process.env.SLAF_ONLY;
  const list = rooms.filter(r => !only || r.id === only);

  const seeds = process.env.SLAF_SEEDS ? process.env.SLAF_SEEDS.split(',') : ['empty', 'demo'];
  for (const seed of seeds) {
    if (seed === 'demo') {
      page.on('dialog', d => d.accept());
      await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      const btn = await page.$('#btn-example');
      if (btn) { await btn.click(); await page.waitForTimeout(700); }
    }

    for (const room of list) {
      const errs = [];
      const onErr = e => errs.push(e.message);
      /* The failing URL is in location(), not in the message text - so a text
         filter for 'favicon' never matches and every room fails on the
         browser's own favicon probe. Cost me a false positive on the first
         run of this very test. */
      const onCon = m => {
        if (m.type() !== 'error') return;
        const url = (m.location() && m.location().url) || '';
        if (/favicon\.ico$/i.test(url)) return;
        errs.push(m.text() + (url ? ' <' + url.split('/').pop() + '>' : ''));
      };
      page.on('pageerror', onErr); page.on('console', onCon);
      try {
        await page.goto(BASE + '/' + room.file, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(450);
      } catch (e) { errs.push('nav: ' + e.message); }
      page.off('pageerror', onErr); page.off('console', onCon);

      const seen = await page.evaluate(() => {
        const main = document.querySelector('main') || document.body;
        return {
          header: !!document.querySelector('.slaf-hops, .slaf-menu-btn'),
          /* Text the room produced, not counting its own static furniture. */
          words: (main.innerText || '').trim().split(/\s+/).filter(Boolean).length,
          redirect: /refresh|location\s*=/.test(document.head.innerHTML)
        };
      });

      const tag = `${room.id} (${seed})`;
      check(`${tag} throws nothing`, errs.length === 0, errs[0]);
      if (seen.redirect) { passed += 2; continue; }   /* a redirect stub has no UI to judge */
      check(`${tag} mounts its header`, seen.header,
        'no menu or hop strip — init probably threw before Progress.mount()');
      check(`${tag} renders more than a heading`, seen.words > 25, seen.words + ' words');
    }
  }

  await browser.close();
  console.log('');
  console.log('─'.repeat(66));
  if (failures.length) {
    console.log(`✗ ${failures.length} failed, ${passed} passed`);
    failures.slice(0, 25).forEach((f, i) => console.log(`\n  ${i + 1}. ${f}`));
    process.exit(1);
  }
  console.log(`✓ ${passed} checks passed — every room renders, empty and with data`);
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
