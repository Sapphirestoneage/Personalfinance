#!/usr/bin/env node
/* ==========================================================================
   test/responsive.js — every room, at every width, measured.
   --------------------------------------------------------------------------
   D-136 fixed the sideways scroll, the small tap targets and the wasted
   monitor by writing an audit script, running it, and then throwing it away.
   It has been rebuilt by hand every time the question came up since, which
   means the answer has been re-derived rather than kept. This is that script,
   promoted, so a room built tomorrow is checked without anyone remembering to.

   What it measures, per room per width:
     · the page scrolling sideways          (nothing should, ever)
     · any element wider than its container (the thing that causes it)
     · interactive targets under the floor  (32px on a coarse pointer, D-136)
     · text clipped by its own box          (scrollHeight past clientHeight)
     · the share of the window actually used (a monitor should not be margin)

   Needs a server:  python3 -m http.server 8765
   Run:             node test/responsive.js
                    SLAF_ONLY=debt-payoff,fire node test/responsive.js
   ========================================================================== */

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) { /* handled below */ }

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const EXECUTABLE = process.env.SLAF_CHROMIUM || '/opt/pw-browsers/chromium';

/* A phone, a big phone, a tablet, the width the menu pins at, and a laptop.
   1080 is in the list because that is where `body` gains padding-left for the
   pinned sidebar (D-135) and it is the width most likely to break. */
const WIDTHS = [320, 390, 768, 1080, 1440];
const TAP_FLOOR = 32;          /* D-136 chose 32, not 44. Keep them in step. */

/* Rooms that legitimately scroll sideways inside a container of their own.
   The PAGE still must not: these own an overflow-x box and say so. */
const SIDEWAYS_OK = {
  'skill-tree': 'the tech-tree board is 6,000px wide and scrolls in its own rail (D-140)'
};

(async () => {
  if (!chromium) {
    console.log('SKIPPED — playwright is not installed.\n'
      + '  npm install playwright   (Chromium already lives at /opt/pw-browsers/chromium\n'
      + '  in the dev container; elsewhere: npx playwright install chromium)');
    return;
  }
  let b;
  try {
    b = await chromium.launch(fs.existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {});
  } catch (e) {
    console.log('SKIPPED — could not launch Chromium: ' + e.message);
    process.exit(0);
  }
  try {
    await (await b.newPage()).goto(BASE, { timeout: 4000 });
  } catch (e) {
    console.log('SKIPPED — nothing serving at ' + BASE + '.\n  Start one with: python3 -m http.server 8765');
    await b.close();
    process.exit(0);
  }

  const only = (process.env.SLAF_ONLY || '').split(',').filter(Boolean);
  let pages = ['index.html'].concat(
    fs.readdirSync(path.join(ROOT, 'rooms')).filter(f => f.endsWith('.html')).map(f => 'rooms/' + f));
  if (only.length) pages = pages.filter(p => only.some(o => p.indexOf(o) >= 0));

  let bad = 0, checked = 0;
  const worst = [];

  for (const width of WIDTHS) {
    /* isMobile only below the tablet break: a coarse pointer is what makes
       the touch-target rules apply, and they should not apply to a laptop. */
    const touch = width <= 768;
    const ctx = await b.newContext({
      viewport: { width, height: 900 },
      isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1
    });
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());

    /* Seed once per context so every room has something to draw. */
    await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await p.waitForTimeout(250);
    await p.evaluate(() => {
      const d = SLAF.DemoPersona.build();
      SLAF.Spine.updateProfile(d);
      SLAF.Spine.updateProfile({ expenses: { entries: SLAF.DemoPersona.buildSpending() } });
    });

    for (const page of pages) {
      await p.goto(BASE + '/' + page, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(320);
      checked++;
      const id = path.basename(page, '.html');
      const r = await p.evaluate((floor) => {
        const doc = document.documentElement;
        const out = { sideways: doc.scrollWidth - doc.clientWidth, culprits: [], small: [], clipped: [], used: 0 };
        /* What is actually wider than the window. */
        if (out.sideways > 0) {
          document.querySelectorAll('body *').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width && r.right > doc.clientWidth + 1) {
              const cs = getComputedStyle(el);
              /* An element inside its own scroller is not the page's problem. */
              let n = el.parentElement, contained = false;
              while (n && n !== document.body) {
                const o = getComputedStyle(n).overflowX;
                if (o === 'auto' || o === 'scroll') { contained = true; break; }
                n = n.parentElement;
              }
              if (!contained && out.culprits.length < 4) {
                out.culprits.push((el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
                  + (el.className ? '.' + String(el.className).split(' ')[0] : ''))
                  + ' → ' + Math.round(r.right - doc.clientWidth) + 'px past');
              }
            }
          });
        }
        /* Targets a finger has to hit. Inline links inside a sentence are
           deliberately exempt (D-136) — they are not the primary control. */
        if (matchMedia('(pointer: coarse)').matches) {
          document.querySelectorAll('button, summary, select, input[type="checkbox"], input[type="radio"], .slaf-btn, .pill').forEach(el => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            if (getComputedStyle(el).display === 'none') return;
            /* The ⓘ is 30px on a coarse pointer by decision, not by neglect:
               D-136 grew it from 20 and stopped at 30 because it appears 45
               times on the ratios page and a 44px circle there is a wall of
               buttons. A suite that flags a settled decision every run gets
               ignored, so it is named here rather than argued with. */
            if (el.classList.contains('slaf-info')) return;
            /* A checkbox is 20px on purpose (D-136) because the LABEL around
               it is the thing a finger hits, and the theme gives that 32px.
               Measure the label where one exists; only complain when the
               checkbox is genuinely on its own. */
            if (el.type === 'checkbox' || el.type === 'radio') {
              const lab = el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]'));
              if (lab && lab.getBoundingClientRect().height >= floor - 0.5) return;
            }
            if (r.height < floor - 0.5 && out.small.length < 5) {
              out.small.push(Math.round(r.height) + 'px ' + (el.textContent || el.type || el.tagName).trim().slice(0, 24));
            }
          });
        }
        /* Words outside their box. */
        document.querySelectorAll('h1,h2,h3,p,span,li,label,button,a').forEach(el => {
          if (el.children.length) return;
          if (!el.textContent.trim()) return;
          const cs = getComputedStyle(el);
          if (cs.overflow === 'visible' || cs.display === 'none') return;
          if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') return;   /* a clamp is deliberate */
          if (el.scrollHeight > el.clientHeight + 2 && out.clipped.length < 4) {
            out.clipped.push(el.textContent.trim().slice(0, 30));
          }
        });
        const main = document.querySelector('main, .wrap, #root');
        out.used = main ? Math.round(main.getBoundingClientRect().width / doc.clientWidth * 100) : 0;
        return out;
      }, TAP_FLOOR);

      const sidewaysOk = SIDEWAYS_OK[id] && r.culprits.length === 0;
      const problems = [];
      if (r.sideways > 0 && !sidewaysOk) problems.push('scrolls sideways ' + r.sideways + 'px' + (r.culprits.length ? ' — ' + r.culprits.join('; ') : ''));
      if (r.small.length) problems.push('targets under ' + TAP_FLOOR + 'px: ' + r.small.join(', '));
      if (r.clipped.length) problems.push('text clipped: ' + r.clipped.map(s => JSON.stringify(s)).join(', '));
      if (problems.length) {
        bad += problems.length;
        console.log('  ✗ ' + width + 'px ' + id + ' — ' + problems.join(' | '));
      }
      /* Not a failure — a note, for the "a monitor should not be margin"
         question D-136 asked and answered by widening the measure. */
      if (width >= 1080 && r.used < 45) worst.push(width + 'px ' + id + ' uses ' + r.used + '% of the window');
    }
    await ctx.close();
  }
  await b.close();

  if (worst.length) {
    console.log('\n  Width used (not a failure, a note):');
    worst.slice(0, 8).forEach(w => console.log('    · ' + w));
    if (worst.length > 8) console.log('    · …and ' + (worst.length - 8) + ' more');
  }
  console.log(bad
    ? '\n✗ ' + bad + ' problem(s) across ' + checked + ' room-widths'
    : '\n✓ ' + checked + ' room-widths: nothing scrolls sideways, no target under '
      + TAP_FLOOR + 'px, no text outside its box');
  process.exit(bad ? 1 : 0);
})();
