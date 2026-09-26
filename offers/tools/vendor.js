#!/usr/bin/env node
/* ==========================================================================
   offers/tools/vendor.js, the copies the Offer Builder carries of SPARKS. OD-001.
   --------------------------------------------------------------------------
   The Offer Builder reads no household number, so it carries only the money
   helper (cents, ok and incomplete Results, formatting) and the look
   (theme.css, the favicon), as byte-identical copies rather than rewrites.

     node offers/tools/vendor.js           copy them in from SPARKS
     node offers/tools/vendor.js --check   exit 1 if any copy has drifted
   offers/test/run.js runs the check.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const HERE = path.join(ROOT, 'offers');

const FILES = ['shared/money.js', 'shared/theme.css', 'favicon.svg'];

const check = process.argv.indexOf('--check') !== -1;
const drift = [];
FILES.forEach(function (f) {
  const from = path.join(ROOT, f), to = path.join(HERE, f);
  if (!fs.existsSync(from)) { drift.push(f + ' (gone from SPARKS)'); return; }
  const a = fs.readFileSync(from);
  const same = fs.existsSync(to) && Buffer.compare(a, fs.readFileSync(to)) === 0;
  if (check) { if (!same) drift.push(f); return; }
  if (!same) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, a); console.log('copied    offers/' + f); }
});
if (check) {
  if (drift.length) { console.log('drifted from SPARKS: ' + drift.join(', ') + '\nrun: node offers/tools/vendor.js'); process.exit(1); }
  console.log('every vendored copy matches SPARKS (' + FILES.length + ' files)');
}
module.exports = { FILES: FILES };
