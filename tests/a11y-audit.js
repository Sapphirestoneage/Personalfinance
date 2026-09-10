#!/usr/bin/env node
/* ==========================================================================
   tests/a11y-audit.js - axe-core and a keyboard pass over every room.
   --------------------------------------------------------------------------
   Lane 2, section 6 (DECISIONS.md L-6). Report only: nothing under rooms/
   is touched. For every room in rooms.json, with a section 1 household
   loaded into localStorage (dink-highearn by default), on a phone-shaped
   viewport:

     1. axe-core 4 runs with the WCAG 2.0/2.1 A and AA tags and best
        practices; every violation is recorded with its impact, the rule's
        help text, how many nodes, the first target and the first HTML
        snippet.
     2. A keyboard pass: Tab through the page up to 45 times, recording
        which elements take focus, whether each shows a visible focus
        ring (outline or box-shadow, or the app's own focus style), any
        positive tabindex, whether the menu button and the first input are
        reachable, and whether Escape closes an open menu.
     3. Structure: one main landmark, one h1, a lang attribute, heading
        levels that never skip, a viewport meta that allows zoom, every
        input with a label, every image with alt text, every button and
        link with a name.

   Writes tests/reports/a11y.json and docs/a11y-audit.md (per room: the
   failures, the severity and the one-line fix). Needs the repo served at
   SLAF_BASE (default http://127.0.0.1:8765) and Playwright on NODE_PATH.

   Run:  NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node tests/a11y-audit.js
         SLAF_ONLY=<room id>   one room
         SLAF_SEED=<fixture>   another section 1 household
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const AXE = path.join(__dirname, 'node_modules', 'axe-core', 'axe.min.js');
const rooms = require(path.join(ROOT, 'rooms.json')).rooms;
const SEED = process.env.SLAF_SEED || 'dink-highearn';
const household = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', 'households', SEED + '.json'), 'utf8'));

/* The one-line fix for the rules axe finds most; anything else falls back
   to the rule's own help sentence. */
const FIX = {
  'color-contrast': 'Darken the text or lighten the background until the ratio reaches 4.5:1 (3:1 for large text); the token is in shared/theme.css.',
  'label': 'Give the input a <label for=…>, or aria-label, that says what the number is.',
  'button-name': 'Put text inside the button, or aria-label on an icon-only one.',
  'link-name': 'Give the link visible text, or aria-label when it is an icon.',
  'heading-order': 'Do not skip a heading level; an h3 under an h1 needs an h2 between them.',
  'page-has-heading-one': 'Give the page exactly one h1: the room title.',
  'landmark-one-main': 'Wrap the room content in one <main>.',
  'region': 'Put every piece of content inside a landmark (main, nav, header, footer, aside).',
  'html-has-lang': 'Add lang="en" to the <html> tag.',
  'image-alt': 'Give the image alt text, or alt="" if it is decorative.',
  'list': 'Only <li> may sit directly inside <ul> or <ol>.',
  'listitem': 'Put the <li> inside a <ul> or <ol>.',
  'scrollable-region-focusable': 'Give the scrolling box tabindex="0" so a keyboard can reach its content.',
  'meta-viewport': 'Remove user-scalable=no and any maximum-scale from the viewport meta.',
  'duplicate-id': 'Make the id unique; two elements share it.',
  'duplicate-id-aria': 'Make the id unique; an aria attribute points at it.',
  'empty-heading': 'Put text in the heading or remove it.',
  'aria-allowed-attr': 'Remove the aria attribute; it is not valid on this element role.',
  'aria-required-attr': 'Add the aria attribute the role requires.',
  'aria-valid-attr-value': 'Fix the aria attribute value; it does not match the allowed values.',
  'aria-hidden-focus': 'Do not hide a focusable element with aria-hidden; remove one or the other.',
  'nested-interactive': 'Do not nest a button or link inside another; split them.',
  'select-name': 'Give the select a <label for=…>.',
  'tabindex': 'Remove the positive tabindex; let the DOM order carry focus.',
  'frame-title': 'Give the iframe a title.',
  'landmark-unique': 'Give the repeated landmark an aria-label so screen readers can tell them apart.',
  'landmark-no-duplicate-banner': 'Keep one <header> at page level; mark inner ones role="group".',
  'landmark-no-duplicate-contentinfo': 'Keep one <footer> at page level.',
  'bypass': 'Add a skip link to <main> at the top of the page.',
  'focus-order-semantics': 'Use a button or link for the thing that takes focus, not a div.',
  'target-size': 'Make the tap target at least 24 by 24 CSS pixels, or space it from its neighbours.',
  'label-title-only': 'Use a visible <label>, not only a title attribute.',
  'form-field-multiple-labels': 'Leave one label per field.',
  'autocomplete-valid': 'Fix the autocomplete value to a valid token.',
  'svg-img-alt': 'Give the SVG role="img" and a <title>, or aria-hidden="true" if decorative.',
  'presentation-role-conflict': 'Remove role="presentation" from the focusable element.',
  'aria-progressbar-name': 'Give the progressbar an aria-label.',
  'aria-tooltip-name': 'Give the tooltip an accessible name.',
  'link-in-text-block': 'Underline the link, or give it a 3:1 contrast against the surrounding text.'
};
const FOCUS_FALLBACK = '(the app focus style: keep outline or box-shadow on :focus-visible; do not set outline: none without a replacement)';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(({ key, value }) => { try { localStorage.setItem(key, value); } catch (e) { /* private mode */ } }, { key: 'slaf.household.v2', value: JSON.stringify(household) });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  const only = process.env.SLAF_ONLY;
  const list = rooms.filter((r) => !only || r.id === only);
  const results = [];
  const axeSource = fs.readFileSync(AXE, 'utf8');

  for (const room of list) {
    const rec = { id: room.id, file: room.file, title: room.title || room.label || room.id, errors: [], axe: [], keyboard: null, structure: null };
    const onErr = (e) => rec.errors.push(e.message);
    page.on('pageerror', onErr);
    try {
      await page.goto(BASE + '/' + room.file, { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(500);
      const redirect = await page.evaluate(() => /refresh|location\s*=/.test(document.head.innerHTML) && (document.body.innerText || '').trim().split(/\s+/).length < 25);
      if (redirect) { rec.redirect = true; results.push(rec); page.off('pageerror', onErr); continue; }
      await page.addScriptTag({ content: axeSource });
      const axeResult = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, resultTypes: ['violations'] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, tags: v.tags.filter((t) => /^wcag|best/.test(t)), nodes: v.nodes.length, target: (v.nodes[0] && v.nodes[0].target || []).join(' '), html: (v.nodes[0] && v.nodes[0].html || '').slice(0, 160), summary: (v.nodes[0] && v.nodes[0].failureSummary || '').split('\n').slice(0, 2).join(' ') }));
      });
      rec.axe = axeResult;
      rec.structure = await page.evaluate(() => {
        const q = (s) => Array.from(document.querySelectorAll(s));
        const hs = q('h1,h2,h3,h4,h5,h6').filter((h) => h.offsetParent !== null || h.closest('main'));
        let skips = 0;
        for (let i = 1; i < hs.length; i++) { const a = +hs[i - 1].tagName[1], b = +hs[i].tagName[1]; if (b > a + 1) skips++; }
        const vp = document.querySelector('meta[name=viewport]');
        const inputs = q('input:not([type=hidden]),select,textarea');
        const unlabeled = inputs.filter((el) => !(el.id && document.querySelector('label[for="' + el.id + '"]')) && !el.closest('label') && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).length;
        const buttons = q('button,[role=button]');
        const unnamedButtons = buttons.filter((b) => !(b.innerText || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby') && !b.getAttribute('title')).length;
        const links = q('a[href]');
        const unnamedLinks = links.filter((a) => !(a.innerText || '').trim() && !a.getAttribute('aria-label') && !a.querySelector('img[alt]')).length;
        const imgs = q('img');
        const noAlt = imgs.filter((i) => !i.hasAttribute('alt')).length;
        return {
          lang: document.documentElement.getAttribute('lang') || null,
          mains: q('main').length, h1s: q('h1').length, headings: hs.length, headingSkips: skips,
          viewportZoomable: !vp || !/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\D|$)/i.test(vp.content || ''),
          inputs: inputs.length, unlabeled, buttons: buttons.length, unnamedButtons, links: links.length, unnamedLinks, images: imgs.length, noAlt,
          skipLink: !!q('a[href^="#"]').filter((a) => /skip|main/i.test(a.innerText || '')).length,
          positiveTabindex: q('[tabindex]').filter((el) => +el.getAttribute('tabindex') > 0).length
        };
      });
      /* Keyboard pass. The unfocused look of every focusable element is
         recorded first (element, parent, grandparent: outline, shadow,
         border, background); after each Tab the page waits out the
         theme's 150ms transitions and compares. */
      const kb = { stops: [], noRing: [], menuReachable: false, firstInputReachable: false, escapeClosesMenu: null, trapped: false };
      await page.evaluate(() => {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        window.scrollTo(0, 0);
        const read = (n) => { const c = getComputedStyle(n); return [c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 ? c.outlineColor + c.outlineWidth : '', c.boxShadow, c.borderColor, c.backgroundColor].join('|'); };
        window.__a11yRead = read;
        window.__a11yBase = new Map();
        let seq = 0;
        document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]').forEach((el) => {
          el.__a11yIndex = ++seq;
          window.__a11yBase.set(el, [el, el.parentElement, el.parentElement && el.parentElement.parentElement].filter(Boolean).map(read));
        });
      });
      let lastKey = null, repeats = 0;
      for (let i = 0; i < 45; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const read = window.__a11yRead;
          const now = [el, el.parentElement, el.parentElement && el.parentElement.parentElement].filter(Boolean).map(read);
          const base = window.__a11yBase.get(el);
          const cs = getComputedStyle(el);
          const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none') || (base ? now.some((v, i) => v !== base[i]) : false);
          if (el.__a11yIndex === undefined) { window.__a11ySeq = (window.__a11ySeq || 100000) + 1; el.__a11yIndex = window.__a11ySeq; }
          const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.id || el.getAttribute('placeholder') || '').trim().slice(0, 40);
          return { tag: el.tagName, id: el.id || null, cls: (el.className && el.className.toString ? el.className.toString() : '').split(' ')[0] || null, label, ring, key: el.__a11yIndex, isMenu: /menu/i.test(el.className + ' ' + (el.getAttribute('aria-label') || '')) || el.getAttribute('aria-haspopup') === 'true' || el.getAttribute('aria-expanded') !== null, isInput: /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) };
        });
        if (!info) { if (i > 3) break; continue; }
        if (info.key === lastKey) { repeats++; if (repeats > 3) { kb.trapped = true; break; } } else repeats = 0;
        lastKey = info.key;
        kb.stops.push({ tag: info.tag, id: info.id, cls: info.cls, label: info.label, ring: info.ring });
        if (!info.ring) kb.noRing.push(info.tag + (info.id ? '#' + info.id : info.cls ? '.' + info.cls : '') + (info.label ? ' "' + info.label + '"' : ''));
        if (info.isMenu) kb.menuReachable = true;
        if (info.isInput) kb.firstInputReachable = true;
      }
      /* Escape on an open menu. */
      const menuBtn = await page.$('.slaf-menu-btn, [aria-haspopup="true"], [aria-controls]');
      if (menuBtn) {
        try {
          await menuBtn.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
          const openBefore = await page.evaluate(() => { const b = document.querySelector('.slaf-menu-btn, [aria-haspopup="true"], [aria-controls]'); return b && (b.getAttribute('aria-expanded') === 'true' || !!document.querySelector('.slaf-menu[open], .slaf-menu.is-open, nav[aria-expanded="true"], .slaf-sidebar.open, [data-open="true"]')); });
          await page.keyboard.press('Escape'); await page.waitForTimeout(150);
          const openAfter = await page.evaluate(() => { const b = document.querySelector('.slaf-menu-btn, [aria-haspopup="true"], [aria-controls]'); return b && (b.getAttribute('aria-expanded') === 'true' || !!document.querySelector('.slaf-menu[open], .slaf-menu.is-open, nav[aria-expanded="true"], .slaf-sidebar.open, [data-open="true"]')); });
          kb.escapeClosesMenu = openBefore ? !openAfter : null;
        } catch (e) { kb.escapeClosesMenu = null; }
      }
      rec.keyboard = kb;
    } catch (e) { rec.errors.push('nav: ' + e.message); }
    page.off('pageerror', onErr);
    results.push(rec);
    const v = rec.axe.length, s = rec.axe.filter((x) => x.impact === 'serious' || x.impact === 'critical').length;
    console.log((rec.redirect ? 'redirect ' : (v ? 'FAIL     ' : 'ok       ')) + room.id.padEnd(22) + (rec.redirect ? '' : v + ' rules (' + s + ' serious or worse), ' + (rec.keyboard ? rec.keyboard.stops.length + ' tab stops, ' + rec.keyboard.noRing.length + ' without a ring' : 'no keyboard pass')));
  }
  await browser.close();

  /* ---- Report ------------------------------------------------------------- */
  const audited = results.filter((r) => !r.redirect);
  const byRule = {};
  audited.forEach((r) => r.axe.forEach((v) => { byRule[v.id] = byRule[v.id] || { id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, rooms: 0, nodes: 0 }; byRule[v.id].rooms++; byRule[v.id].nodes += v.nodes; }));
  const report = { seed: SEED, base: BASE, rooms: results.length, audited: audited.length, redirects: results.length - audited.length, byRule: Object.values(byRule).sort((a, b) => b.rooms - a.rooms), results };
  fs.mkdirSync(path.join(ROOT, 'tests', 'reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'tests', 'reports', 'a11y.json'), JSON.stringify(report, null, 2) + '\n');

  const IMPACT = { critical: 'critical', serious: 'serious', moderate: 'moderate', minor: 'minor' };
  const L = [];
  L.push('# Accessibility audit');
  L.push('');
  L.push('Report only, nothing fixed (lane 2, section 6, DECISIONS.md L-6). axe-core 4 with the WCAG 2.0 and 2.1 A and AA rules plus best practices, and a keyboard pass, on every room in `rooms.json` with the `' + SEED + '` household from section 1 loaded, on a 412 by 915 phone viewport. Generated by `node tests/a11y-audit.js`; the raw results are in `tests/reports/a11y.json`. Severity is axe\'s impact: critical, serious, moderate, minor. The fix column is one line per rule; the same rule in many rooms is one change in `shared/` where the markup is shared.');
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push('| Rooms audited | ' + audited.length + ' (' + report.redirects + ' redirect stubs skipped) |');
  L.push('| Rooms with no axe violation | ' + audited.filter((r) => !r.axe.length).length + ' |');
  L.push('| Rooms with a serious or critical violation | ' + audited.filter((r) => r.axe.some((v) => v.impact === 'serious' || v.impact === 'critical')).length + ' |');
  L.push('| Distinct rules failed | ' + report.byRule.length + ' |');
  L.push('| Rooms where every tab stop shows a focus ring | ' + audited.filter((r) => r.keyboard && !r.keyboard.noRing.length).length + ' |');
  L.push('| Rooms where the menu is reachable by keyboard | ' + audited.filter((r) => r.keyboard && r.keyboard.menuReachable).length + ' |');
  L.push('| Rooms with a keyboard trap | ' + audited.filter((r) => r.keyboard && r.keyboard.trapped).length + ' |');
  L.push('| Rooms with a page error while auditing | ' + audited.filter((r) => r.errors.length).length + ' |');
  L.push('');
  L.push('## Rules failed, most rooms first');
  L.push('');
  L.push('| rule | severity | rooms | nodes | one-line fix |');
  L.push('|---|---|---|---|---|');
  report.byRule.forEach((v) => L.push('| `' + v.id + '` | ' + IMPACT[v.impact] + ' | ' + v.rooms + ' | ' + v.nodes + ' | ' + (FIX[v.id] || v.help) + ' |'));
  L.push('');
  L.push('## Structure, every room');
  L.push('');
  L.push('| room | lang | main | h1 | heading skips | zoomable | inputs without a label | buttons without a name | links without a name | images without alt | positive tabindex |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  audited.forEach((r) => { const s = r.structure || {}; L.push('| ' + r.id + ' | ' + (s.lang || 'none') + ' | ' + s.mains + ' | ' + s.h1s + ' | ' + s.headingSkips + ' | ' + (s.viewportZoomable ? 'yes' : 'no') + ' | ' + s.unlabeled + '/' + s.inputs + ' | ' + s.unnamedButtons + '/' + s.buttons + ' | ' + s.unnamedLinks + '/' + s.links + ' | ' + s.noAlt + '/' + s.images + ' | ' + s.positiveTabindex + ' |'); });
  L.push('');
  L.push('## Keyboard pass, every room');
  L.push('');
  L.push('Tab up to 45 times from the top of the page, waiting 200ms after each for the transitions in the theme. A stop "without a ring" shows no outline or shadow on the element and no change of border, outline, shadow or background on the element or its shell between focused and blurred ' + FOCUS_FALLBACK + '.');
  L.push('');
  L.push('| room | tab stops | without a ring | menu reachable | first input reachable | Escape closes the menu | trap |');
  L.push('|---|---|---|---|---|---|---|');
  audited.forEach((r) => { const k = r.keyboard || {}; L.push('| ' + r.id + ' | ' + (k.stops ? k.stops.length : '?') + ' | ' + (k.noRing ? k.noRing.length : '?') + ' | ' + (k.menuReachable ? 'yes' : 'no') + ' | ' + (k.firstInputReachable ? 'yes' : (r.structure && r.structure.inputs ? 'no' : 'n/a')) + ' | ' + (k.escapeClosesMenu === null || k.escapeClosesMenu === undefined ? 'no menu opened' : k.escapeClosesMenu ? 'yes' : 'no') + ' | ' + (k.trapped ? 'yes' : 'no') + ' |'); });
  L.push('');
  L.push('## Per room');
  L.push('');
  audited.forEach((r) => {
    L.push('### ' + r.id + ' (`' + r.file + '`)');
    L.push('');
    if (r.errors.length) L.push('Page error while auditing: ' + r.errors[0]);
    if (!r.axe.length) L.push('No axe violation.');
    else {
      L.push('| rule | severity | nodes | first target | one-line fix |');
      L.push('|---|---|---|---|---|');
      r.axe.forEach((v) => L.push('| `' + v.id + '` | ' + IMPACT[v.impact] + ' | ' + v.nodes + ' | `' + v.target.replace(/\|/g, '\\|').slice(0, 60) + '` | ' + (FIX[v.id] || v.help) + ' |'));
    }
    if (r.keyboard && r.keyboard.noRing.length) { L.push(''); L.push('Focus without a visible ring: ' + r.keyboard.noRing.slice(0, 8).join('; ') + (r.keyboard.noRing.length > 8 ? ' and ' + (r.keyboard.noRing.length - 8) + ' more' : '') + '. Fix: keep a :focus-visible outline on the shared control classes in shared/theme.css.'); }
    if (r.keyboard && r.keyboard.trapped) { L.push(''); L.push('Keyboard trap: focus stopped moving after ' + r.keyboard.stops.length + ' stops. Fix: the element holding focus must let Tab leave it.'); }
    L.push('');
  });
  fs.writeFileSync(path.join(ROOT, 'docs', 'a11y-audit.md'), L.join('\n') + '\n');
  console.log('\n' + audited.length + ' rooms audited, ' + report.byRule.length + ' distinct rules failed; docs/a11y-audit.md written');
})().catch((e) => { console.error('FAILED: ' + e.stack); process.exit(1); });
