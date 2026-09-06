#!/usr/bin/env node
/* ==========================================================================
   test/alignment.js — side-by-side controls must line up.
   --------------------------------------------------------------------------
   A layout check the unit run cannot do, because it needs a real browser to
   know how tall a wrapped label is.

   The failure it guards against: in a two-column grid the row is as tall as
   its tallest cell, so a label that wraps to two lines pushes its own input
   down while its neighbour's stays put. Spotted on a phone, not in any unit
   test. Fixed by bottom-aligning .slaf-field and building every control to
   one --control-height token; this stops it coming back.

   Needs a server on :8765 —  python3 -m http.server 8765
   Run:  node test/alignment.js
   ========================================================================== */

/* Playwright is NOT a dependency of this repo — the site has no build step
   and no package.json, and it stays that way. When the driver isn't around,
   say how to get it and exit cleanly rather than failing a run that was
   never going to work. */
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) { /* handled below */ }

const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const EXECUTABLE = process.env.SLAF_CHROMIUM || '/opt/pw-browsers/chromium';

const TARGETS = [
  ['/rooms/start.html#q-match', '.q-pair'],
  ['/rooms/debt-payoff.html', '.debt-grid'],
  ['/rooms/debt-payoff.html', '.fold-body .debt-meta'],
  ['/rooms/fire.html', '.params'],
  ['/rooms/real-hourly-wage.html', '.grid-2'],
  ['/rooms/quick-math.html', '.grid-2'],
  ['/rooms/quick-math.html', '.grid-3'],
  ['/rooms/self-employed.html', '.grid-2'],
  ['/rooms/accounts.html', '.grid-2'],
  ['/rooms/hassle.html', '.grid-2'],
  ['/rooms/side-hustle.html', '.grid-2'],
  ['/rooms/credential.html', '.grid-2'],
  ['/rooms/statement.html', '.asset-grid'],
  ['/rooms/statement.html', '.pair'],
  ['/rooms/foo-ladder.html', '.grid2'],
  ['/rooms/cash-flow.html', '.cat-row'],
  ['/rooms/start.html', '.q-three'],
  ['/rooms/start.html', '.q-about']
];

/* Cells that sit side by side as CARDS rather than as labelled controls.
   Nothing in the list above can catch these: they hold no .slaf-input-shell,
   so the control-alignment pass skips them entirely, and a short card beside
   a tall one is exactly the unevenness this file exists to prevent. */
const EQUAL_HEIGHT = [
  ['/rooms/savings-rate.html', '.pair'],
  ['/', '.instruments'],
  ['/rooms/hassle.html', '.rates'],
  ['/rooms/sleep-at-night.html', '.pair'],
  ['/rooms/sleep-at-night.html', '.cover-grid'],
  ['/rooms/financial-snapshot.html', '.three'],
  ['/rooms/rerank.html', '.rate-row'],
  ['/rooms/rerank.html', '.pair'],
  ['/rooms/what-if-life.html', '.qgrid'],
  ['/rooms/what-if-life.html', '.cols'],
  ['/rooms/stacker.html', '.figures'],
  ['/rooms/stacker.html', '.three'],
  ['/rooms/values.html', '.two'],
  ['/rooms/fulfillment.html', '.quads'],
  ['/rooms/sleep-at-night.html', '.basis']
];
(async () => {
  if (!chromium) {
    console.log('SKIPPED — playwright is not installed.\n'
      + '  npm install playwright   (Chromium already lives at /opt/pw-browsers/chromium\n'
      + '  in the dev container; elsewhere: npx playwright install chromium)');
    return;
  }
  let b;
  try {
    b = await chromium.launch(require('fs').existsSync(EXECUTABLE)
      ? { executablePath: EXECUTABLE } : {});
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
  let bad = 0;
  for (const width of [320, 360, 390, 414]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    /* The demo persona is loaded by the dashboard, not the one-pager (D-095). */
    await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    await p.evaluate(() => { const d = SLAF.DemoPersona.build();
      SLAF.Spine.updateProfile({ people: d.people, filingStatus: d.filingStatus, state: d.state,
        assets: d.assets, debts: d.debts, expenses: d.expenses, capturingFullMatch: d.capturingFullMatch });
      SLAF.Spine.updateProfile({ expenses: { entries: SLAF.DemoPersona.buildSpending() } });
      /* The What Matters comparison only renders once values are named. */
      SLAF.Spine.updateProfile({ valuesProfile:
        { stated: ['freedom', 'health', 'connection', 'security', 'experience'], assignments: {} } });
      /* The Fulfillment quadrants only render once four categories are rated. */
      SLAF.Spine.updateProfile({ ratings: { joy: { housing: 6, groceries: 7,
        dining_out: 9, entertainment: 8, subscriptions: 3, transportation: 4 } } }); });

    for (const [page, sel] of TARGETS) {
      await p.goto(BASE + page, { waitUntil: 'networkidle' });
      await p.waitForTimeout(page === '/' ? 900 : 600);
      const rows = await p.evaluate((sel) => {
        const out = [];
        document.querySelectorAll(sel).forEach(grid => {
          /* Group the grid's cells into visual rows by their own top edge,
             then check that the interactive box in each cell of a row starts
             at the same y. Cells alone on a row are trivially aligned. */
          const cells = Array.from(grid.children);
          const byRow = {};
          cells.forEach(c => {
            const t = Math.round(c.getBoundingClientRect().top);
            (byRow[t] = byRow[t] || []).push(c);
          });
          Object.keys(byRow).forEach(t => {
            const group = byRow[t];
            if (group.length < 2) return;
            const boxes = group.map(c => c.querySelector('.slaf-input-shell, .slaf-owned, .slaf-owned-inline'))
                               .filter(Boolean);
            if (boxes.length < 2) return;
            const tops = boxes.map(n => Math.round(n.getBoundingClientRect().top));
            const bottoms = boxes.map(n => Math.round(n.getBoundingClientRect().bottom));
            out.push({
              tops, spread: Math.max(...tops) - Math.min(...tops),
              bottomSpread: Math.max(...bottoms) - Math.min(...bottoms),
              labels: group.map(c => { const l = c.querySelector('.slaf-label'); return l ? Math.round(l.getBoundingClientRect().height) : 0; })
            });
          });
        });
        return out;
      }, sel);
      rows.forEach((r, i) => {
        const ok = r.spread === 0 && r.bottomSpread === 0;
        if (!ok) bad++;
        console.log((ok ? '  ✓' : '  ✗') + ` ${width}px ${page} ${sel}[row ${i}]  top-spread=${r.spread}px bottom-spread=${r.bottomSpread}px labelHeights=${JSON.stringify(r.labels)}`);
      });
    }
    for (const [page, sel] of EQUAL_HEIGHT) {
      await p.goto(BASE + page, { waitUntil: 'networkidle' });
      await p.waitForTimeout(600);
      const rows = await p.evaluate((sel) => {
        const out = [];
        document.querySelectorAll(sel).forEach(grid => {
          const byRow = {};
          Array.from(grid.children).forEach(c => {
            const t = Math.round(c.getBoundingClientRect().top);
            (byRow[t] = byRow[t] || []).push(c);
          });
          Object.keys(byRow).forEach(t => {
            const group = byRow[t];
            if (group.length < 2) return;
            const heights = group.map(c => Math.round(c.getBoundingClientRect().height));
            out.push({ heights, spread: Math.max(...heights) - Math.min(...heights) });
          });
        });
        return out;
      }, sel);
      rows.forEach((r, i) => {
        /* A row of zero-height cells means the section never rendered — a
           pass here would be vacuous, so say so instead of claiming one. */
        if (r.heights.every(h => h === 0)) {
          bad++;
          console.log(`  ✗ ${width}px ${page} ${sel}[row ${i}]  nothing rendered — check the seeding in this file`);
          return;
        }
        const ok = r.spread === 0;
        if (!ok) bad++;
        console.log((ok ? '  ✓' : '  ✗') + ` ${width}px ${page} ${sel}[row ${i}]  height-spread=${r.spread}px heights=${JSON.stringify(r.heights)}`);
      });
    }
    await ctx.close();
  }

  /* ---- Words inside their boxes ------------------------------------------
     The Skill Tree draws 665 fixed-size cards on one board, so a name longer
     than the box does not push the layout — it silently spills or clips, and
     no unit test can see it. Measure the text against the box in a desktop
     context, because the board is hidden below 700px in favour of the phone
     serpentine. */
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    await p.goto(BASE + '/rooms/skill-tree.html', { waitUntil: 'networkidle' });
    await p.waitForTimeout(1200);
    const fit = await p.evaluate(() => {
      const out = { total: 0, clipped: [], spilled: [], overlapped: [] };
      document.querySelectorAll('.board .node').forEach(n => {
        const name = n.querySelector('.n-name');
        if (!name) return;
        out.total++;
        const box = n.getBoundingClientRect(), t = name.getBoundingClientRect();
        /* Clipped: the line clamp cut the name off. */
        if (name.scrollHeight > name.clientHeight + 1) out.clipped.push(name.textContent);
        /* Spilled: the text box is drawn outside its card. */
        if (t.bottom > box.bottom + 0.5 || t.right > box.right + 0.5 || t.top < box.top - 0.5) out.spilled.push(name.textContent);
        /* Overlapped: the name runs under the chips or the state badge. */
        n.querySelectorAll('.n-chips, .n-lock, .n-date, .n-tag').forEach(o => {
          const r = o.getBoundingClientRect();
          if (t.bottom > r.top + 0.5 && t.top < r.bottom - 0.5 && t.right > r.left + 0.5 && t.left < r.right - 0.5) out.overlapped.push(name.textContent);
        });
      });
      return out;
    });
    if (!fit.total) { bad++; console.log('  ✗ skill-tree board drew no nodes — check the seeding in this file'); }
    /* The board only draws a name on a node that is out of the fog, so the
       pass above sees a few hundred of the 665. Put every name in the
       catalogue through a real node box as well, so the longest one in the
       endgame bands is measured today rather than the day someone reaches
       it. */
    const all = await p.evaluate(async () => {
      const probe = document.querySelector('.board .node .n-name');
      if (!probe) return null;
      const data = await fetch('/data/skill_tree.json').then(r => r.json());
      const names = data.skills.map(s => s.name);
      const was = probe.textContent, tooTall = [];
      for (const n of names) {
        probe.textContent = n;
        if (probe.scrollHeight > probe.clientHeight + 1) tooTall.push(n);
      }
      probe.textContent = was;
      return { count: names.length, tooTall };
    });
    if (!all) { bad++; console.log('  ✗ skill-tree: no node box to measure names against'); }
    else {
      const ok = all.tooTall.length === 0;
      if (!ok) bad++;
      console.log((ok ? '  ✓' : '  ✗') + ` every name in data/skill_tree.json fits a node box: ${all.count - all.tooTall.length}/${all.count}${all.tooTall.length ? ' — e.g. ' + JSON.stringify(all.tooTall.slice(0, 3)) : ''}`);
    }
    [['clipped by the line clamp', fit.clipped], ['drawn outside its card', fit.spilled], ['overlapping the chips or badge', fit.overlapped]].forEach(([what, list]) => {
      const ok = list.length === 0;
      if (!ok) bad++;
      console.log((ok ? '  ✓' : '  ✗') + ` skill-tree node names ${what}: ${list.length}${list.length ? ' — e.g. ' + JSON.stringify(list.slice(0, 3)) : ''} (of ${fit.total})`);
    });
    await ctx.close();
  }

  await b.close();
  console.log(bad ? `\n✗ ${bad} layout problem(s)` : '\n✓ every multi-cell row is aligned at every width, and every skill name fits its box');
  process.exit(bad ? 1 : 0);
})();
