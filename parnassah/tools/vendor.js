#!/usr/bin/env node
/* ==========================================================================
   parnassah/tools/vendor.js, the copies Parnassah carries of SPARKS. PN-001.
   --------------------------------------------------------------------------
   Parnassah is a separate app (D-340), the way coach/ and dnd/ are. It reads
   nothing from the rooms, the spine or ownership. The few SPARKS files it
   needs (the money primitives, the theme, the fonts) travel as byte-identical
   copies so one formula stays one function.

     node parnassah/tools/vendor.js           copy them in from SPARKS
     node parnassah/tools/vendor.js --check   exit 1 if any copy has drifted
   parnassah/test/run.js runs the check.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'parnassah');

const FILES = [
  'shared/money.js',
  'shared/theme.css', 'shared/fonts.css',
  'vendor/fonts/fraunces-latin-wght-normal.woff2', 'vendor/fonts/space-grotesk-latin-wght-normal.woff2', 'vendor/fonts/OFL.txt',
  'favicon.svg'
];

const check = process.argv.indexOf('--check') !== -1;
const drift = [];
FILES.forEach(function (f) {
  const from = path.join(ROOT, f), to = path.join(APP, f);
  if (!fs.existsSync(from)) { drift.push(f + ' (gone from SPARKS)'); return; }
  const a = fs.readFileSync(from);
  const same = fs.existsSync(to) && Buffer.compare(a, fs.readFileSync(to)) === 0;
  if (check) { if (!same) drift.push(f); return; }
  if (!same) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, a); console.log('copied    parnassah/' + f); }
});
if (check) {
  if (drift.length) { console.log('drifted from SPARKS: ' + drift.join(', ') + '\nrun: node parnassah/tools/vendor.js'); process.exit(1); }
  console.log('every vendored copy matches SPARKS (' + FILES.length + ' files)');
}
module.exports = { FILES: FILES };
