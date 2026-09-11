#!/usr/bin/env node
/* ==========================================================================
   tools/stamp-build.js — set the build stamp to today. DECISIONS.md D-202.
   --------------------------------------------------------------------------
   There is no build step, so the stamp is a string in two files that this
   keeps in step: Schema.BUILD in shared/schema.js (and its byte-identical
   copy under dnd/shared/) and `build` in version.json. Run it before the
   commit that goes to main; test/run.js holds the three together.

     node tools/stamp-build.js                     now, to the minute, UTC
     node tools/stamp-build.js '2026-09-10 21:05Z'  a given stamp
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const arg = process.argv[2];
/* Date and minute, UTC: two pushes on one day must read apart. */
const stamp = arg || new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';
if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}Z)?$/.test(stamp)) { console.error('Not a stamp: ' + stamp + ' (want YYYY-MM-DD HH:MMZ)'); process.exit(1); }

function replace(file, re, next) {
  const p = path.join(ROOT, file);
  const before = fs.readFileSync(p, 'utf8');
  if (!re.test(before)) { console.error(file + ': no stamp found to replace'); process.exit(1); }
  const after = before.replace(re, next);
  fs.writeFileSync(p, after);
  console.log((after === before ? 'unchanged ' : 'stamped   ') + file);
}

replace('shared/schema.js', /var BUILD = '\d{4}-\d{2}-\d{2}[^']*';/, "var BUILD = '" + stamp + "';");
fs.copyFileSync(path.join(ROOT, 'shared/schema.js'), path.join(ROOT, 'dnd/shared/schema.js'));
console.log('copied    dnd/shared/schema.js');
replace('version.json', /"build": "\d{4}-\d{2}-\d{2}[^"]*"/, '"build": "' + stamp + '"');

/* Every HTML file carries the same stamp as a meta tag, right after the
   viewport meta, so the spine can tell a cached old page from the core it
   loaded (D-204). Inserted where missing, replaced where present. */
const META = '<meta name="slaf-build" content="' + stamp + '"/>';
const pages = [];
['index.html', 'map.html'].forEach(f => { if (fs.existsSync(path.join(ROOT, f))) pages.push(f); });
['rooms', 'dnd'].forEach(d => {
  const dir = path.join(ROOT, d);
  if (fs.existsSync(dir)) fs.readdirSync(dir).filter(f => f.endsWith('.html')).forEach(f => pages.push(d + '/' + f));
});
let stampedPages = 0;
pages.forEach(f => {
  const p = path.join(ROOT, f);
  const before = fs.readFileSync(p, 'utf8');
  let after;
  if (/<meta name="slaf-build" content="[^"]*"\/>/.test(before)) after = before.replace(/<meta name="slaf-build" content="[^"]*"\/>/, META);
  else if (/<meta name="viewport"[^>]*>/.test(before)) after = before.replace(/(<meta name="viewport"[^>]*>)/, '$1\n' + META);
  else { console.error(f + ': no viewport meta to stamp after'); process.exit(1); }
  if (after !== before) { fs.writeFileSync(p, after); stampedPages++; }
});
console.log('stamped   ' + stampedPages + ' of ' + pages.length + ' pages');
