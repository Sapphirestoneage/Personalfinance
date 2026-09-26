#!/usr/bin/env node
/* ==========================================================================
   kehillah/tools/og.js, the link-preview picture. KD-005.
   --------------------------------------------------------------------------
   Renders one card (the practice name, the line, the rainbow band) at
   1200 by 630 with the site's own stylesheet and writes kehillah/og.png.
   Nothing from a plan is drawn; the card is words from data/practice.json.

     NODE_PATH=<where playwright lives> node kehillah/tools/og.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..');
const P = JSON.parse(fs.readFileSync(path.join(APP, 'data/practice.json'), 'utf8'));
const theme = fs.readFileSync(path.join(APP, 'shared/theme.css'), 'utf8');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${theme}
body.slaf { width: 1200px; height: 630px; overflow: hidden; }
.card { position: relative; width: 1200px; height: 630px; padding: 72px 84px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; }
.eyebrow { font-size: 22px; letter-spacing: .12em; text-transform: uppercase; color: var(--color-text-faint); }
h1 { font-size: 68px; line-height: 1.08; margin: 18px 0 0; letter-spacing: -0.015em; max-width: 980px; }
.sub { font-size: 30px; color: var(--color-text-muted); margin-top: 26px; max-width: 900px; line-height: 1.35; }
.foot { display: flex; justify-content: space-between; align-items: flex-end; font-size: 26px; color: var(--color-text-muted); }
.foot b { color: var(--color-text); font-size: 30px; }
.band { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: linear-gradient(90deg, #E2565B 0 20%, #D8A63F 20% 40%, #3FB27F 40% 60%, #4A85F0 60% 80%, #B07CF0 80% 100%); }
</style></head><body class="slaf"><div class="card">
<div><div class="eyebrow">${esc(P.practice.tagline)}</div><h1>Money coaching that knows what year it is, and who your family is.</h1>
<div class="sub">Live sessions on video. The Jewish year in the plan. Free tools that keep nothing on a server. The first call is free.</div></div>
<div class="foot"><div><b>${esc(P.practice.name)}</b><br>${esc(P.person.name)}, ${esc(P.person.role.toLowerCase())}</div><div>${esc(P.practice.siteUrl.replace(/^https:\/\//, ''))}</div></div>
<div class="band"></div></div></body></html>`;
(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(APP, 'og.png'), type: 'png' });
  await browser.close();
  console.log('wrote kehillah/og.png');
})().catch((e) => { console.error(e.message); process.exit(1); });
