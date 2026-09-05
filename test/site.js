#!/usr/bin/env node
/* ==========================================================================
   test/site.js — the marketing site's own checks. No browser needed.
   --------------------------------------------------------------------------
   The rooms are graded by test/run.js. This grades the pages of
   stresslessaboutmoney.com (DECISIONS.md D-092): every page has the head a
   crawler needs, the landmarks a screen reader needs, links that resolve to
   real files, and every {{PLACEHOLDER}} on it listed in TODO-ELI.md so
   nothing waits on Eli without him knowing.

     node test/site.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let failures = 0, passes = 0;
function ok(label, cond, detail) {
  if (cond) { passes++; return; }
  failures++;
  console.log('  ✗ ' + label + (detail ? '\n      ' + detail : ''));
}

/* Every page of the site: index.html at the root, every folder's
   index.html that is not a room, the D&D tool or the vendored tree, and
   404.html. */
function sitePages() {
  const skip = new Set(['rooms', 'dnd', 'shared', 'engines', 'data', 'vendor', 'test', 'node_modules', 'site', '.git']);
  const out = ['index.html', '404.html'];
  (function walk(dir) {
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(function (d) {
      if (!d.isDirectory() || skip.has(d.name) || d.name.startsWith('.')) return;
      const rel = dir ? dir + '/' + d.name : d.name;
      if (fs.existsSync(path.join(ROOT, rel, 'index.html'))) out.push(rel + '/index.html');
      walk(rel);
    });
  })('');
  return out;
}

const pages = sitePages();
ok('the site has pages', pages.length >= 20, String(pages.length));

const todo = fs.existsSync(path.join(ROOT, 'TODO-ELI.md')) ? fs.readFileSync(path.join(ROOT, 'TODO-ELI.md'), 'utf8') : '';
ok('TODO-ELI.md exists', todo.length > 0);

const sitemap = fs.existsSync(path.join(ROOT, 'sitemap.xml')) ? fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8') : '';
ok('sitemap.xml exists', sitemap.length > 0);

const allPlaceholders = new Set();

pages.forEach(function (file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const dir = path.dirname(file);
  const depth = file === '404.html' || dir === '.' ? 0 : dir.split('/').length;
  const expectRoot = file === '404.html' ? '/' : (depth === 0 ? './' : '../'.repeat(depth));
  const url = file === 'index.html' ? '/' : file === '404.html' ? '/404.html' : '/' + dir + '/';

  /* Head */
  ok(file + ': <title> carries the name', /<title>[^<]*Eli Saperstein<\/title>/.test(html));
  ok(file + ': one meta description', (html.match(/<meta name="description"/g) || []).length === 1);
  ok(file + ': canonical is its own URL', html.includes('<link rel="canonical" href="https://stresslessaboutmoney.com' + url + '"/>'), url);
  ok(file + ': Open Graph title, description, url', /property="og:title"/.test(html) && /property="og:description"/.test(html) && /property="og:url"/.test(html));
  ok(file + ': Twitter card', /name="twitter:card"/.test(html));
  ok(file + ': data-root matches its depth', html.includes('<html lang="en" data-root="' + expectRoot + '">'), expectRoot);
  ok(file + ': loads the shared tokens, type and site.css', html.includes(expectRoot + 'shared/theme.css') && html.includes(expectRoot + 'shared/fonts.css') && html.includes(expectRoot + 'site.css'));
  ok(file + ': loads site.js last', /<script src="[^"]*site\.js"><\/script>\s*<\/body>/.test(html));
  ok(file + ': theme is set before paint', html.indexOf("localStorage.getItem('slam.theme')") < html.indexOf('<link rel="stylesheet"'));
  ok(file + ': no analytics script is live', !/<script[^>]+plausible\.io/.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  ok(file + ': no third-party script', !/<script src="https?:/.test(html.replace(/<!--[\s\S]*?-->/g, '')));

  /* Landmarks and accessibility */
  ok(file + ': skip link', /<a class="skip" href="#main">/.test(html));
  ok(file + ': header, main, footer landmarks', /<header class="site-header">/.test(html) && /<main id="main">/.test(html) && /<footer class="site-footer">/.test(html));
  ok(file + ': exactly one h1', (html.match(/<h1[\s>]/g) || []).length === 1);
  ok(file + ': the nav', /<nav class="nav" aria-label="Site">/.test(html));
  ok(file + ': the primary button and the secondary line', /Talk to Eli<\/a>/.test(html) && /Not ready to talk\?/.test(html));
  ok(file + ': the two toggles', /data-toggle="theme"/.test(html) && /data-toggle="calm"/.test(html));
  ok(file + ': the footer line', /Not a registered investment advisor; coaching is education, not advice\./.test(html));
  (html.match(/<img [^>]*>/g) || []).forEach(function (img) {
    ok(file + ': image has alt', /\balt=/.test(img), img);
  });

  /* Links resolve. Absolute, mailto, hash and placeholder links are not
     files; everything else must exist relative to the page (404.html is
     root-absolute by design). */
  const links = [];
  html.replace(/(?:href|src)="([^"]+)"/g, function (_, h) { links.push(h); });
  links.forEach(function (h) {
    if (/^(https?:|mailto:|#|\{\{|data:)/.test(h) || h.includes('{{')) return;
    const clean = h.split('#')[0].split('?')[0];
    if (!clean) return;
    let target = file === '404.html' ? path.join(ROOT, clean) : path.resolve(ROOT, dir === '.' ? '' : dir, clean);
    if (clean.endsWith('/')) target = path.join(target, 'index.html');
    ok(file + ': link resolves — ' + h, fs.existsSync(target), target);
  });

  /* Placeholders are listed in TODO-ELI.md. */
  (html.match(/\{\{[A-Z0-9_]+\}\}/g) || []).forEach(function (p) {
    allPlaceholders.add(p);
    ok(file + ': ' + p + ' is in TODO-ELI.md', todo.includes(p));
  });

  /* Sitemap lists every real page. */
  if (file !== '404.html') ok(file + ': in sitemap.xml', sitemap.includes('<loc>https://stresslessaboutmoney.com' + url + '</loc>'));
});

/* And TODO-ELI.md lists nothing that is gone. */
(todo.match(/\{\{[A-Z0-9_]+\}\}/g) || []).forEach(function (p) {
  const inSite = allPlaceholders.has(p)
    || fs.readFileSync(path.join(ROOT, 'site.js'), 'utf8').includes(p)
    || fs.readFileSync(path.join(ROOT, 'site.css'), 'utf8').includes(p);
  ok('TODO-ELI.md: ' + p + ' still appears on the site', inSite);
});

/* The sitemap only lists pages that exist. */
(sitemap.match(/<loc>https:\/\/stresslessaboutmoney\.com([^<]*)<\/loc>/g) || []).forEach(function (m) {
  const u = m.replace(/<\/?loc>/g, '').replace('https://stresslessaboutmoney.com', '');
  const f = u === '/' ? 'index.html' : u.replace(/^\//, '') + 'index.html';
  ok('sitemap: ' + u + ' exists', fs.existsSync(path.join(ROOT, f)));
});

/* Structured data parses. */
pages.forEach(function (file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || []).forEach(function (block) {
    let parsed = null;
    try { parsed = JSON.parse(block.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')); } catch (e) { parsed = null; }
    ok(file + ': JSON-LD parses', parsed && parsed['@type'], block.slice(0, 80));
  });
});
const coaching = fs.readFileSync(path.join(ROOT, 'coaching/index.html'), 'utf8');
ok('/coaching carries FAQPage and ProfessionalService', /"@type": "FAQPage"/.test(coaching) && /"@type": "ProfessionalService"/.test(coaching));
ok('/about carries Person', /"@type": "Person"/.test(fs.readFileSync(path.join(ROOT, 'about/index.html'), 'utf8')));

/* The site's storage is two keys, and the rooms' key is only read. */
const sitejs = fs.readFileSync(path.join(ROOT, 'site.js'), 'utf8');
ok('site.js writes only slam.theme and slam.calm', /STORE = \{ theme: 'slam\.theme', calm: 'slam\.calm' \}/.test(sitejs) && !/setItem\((?!key)/.test(sitejs));
ok('site.js never writes the household', !/updateProfile|setMonthlyExpenses|upsert/.test(sitejs));

/* The testimonials file is well-formed and renders nothing by default. */
const testimonials = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/testimonials.json'), 'utf8'));
ok('testimonials.json has an entries array', Array.isArray(testimonials.entries));
ok('and documents consent in its schema', testimonials._schema && /consent/.test(JSON.stringify(testimonials._schema)));

/* CNAME and robots. */
ok('CNAME is the domain', fs.readFileSync(path.join(ROOT, 'CNAME'), 'utf8').trim() === 'stresslessaboutmoney.com');
ok('robots.txt points at the sitemap', /Sitemap: https:\/\/stresslessaboutmoney\.com\/sitemap\.xml/.test(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8')));

console.log('──────────────────────────────────────────────────────────────────');
console.log((failures ? '✗ ' + failures + ' failed, ' : '✓ ') + passes + ' checks passed');
process.exit(failures ? 1 : 0);
