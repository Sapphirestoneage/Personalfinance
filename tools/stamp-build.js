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
