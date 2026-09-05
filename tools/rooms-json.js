#!/usr/bin/env node
/* ==========================================================================
   tools/rooms-json.js — the registry as JSON, for anything outside the
   browser. DECISIONS.md D-100.
   --------------------------------------------------------------------------
   The registry stays a JS module so the map draws synchronously (D-094);
   this writes rooms.json from it in the brief's shape:
     { id, title, file, reads[], writes[], requires[], dashboardNumber, order }
   reads   = the registry row's `needs`
   writes  = the fields shared/ownership.js says the room owns
   requires = Registry.REQUIRES (gate branches)
   dashboardNumber = the instrument this room opens from, if any
   Run:  node tools/rooms-json.js        (writes rooms.json at the repo root)
   test/run.js checks the committed file is what this would write.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Registry = require(path.join(ROOT, 'shared/registry.js'));
const Ownership = require(path.join(ROOT, 'shared/ownership.js'));
const Instruments = require(path.join(ROOT, 'shared/instruments.js'));

/* The instrument → room map the dashboard uses (index.html OPENS). */
const OPENS = {
  netWorth: 'statement', savingsRate: 'savings-rate', emergencyFundMonths: 'runway', debtToIncome: 'debt-payoff', fiEtaYear: 'fire',
  fooStep: 'foo-ladder', ownersPay: 'self-employed', runwayDays: 'runway', loanTrajectory: 'debt-payoff', withdrawalRate: 'fire'
};

function build() {
  return Registry.all().map(function (r) {
    const numbers = Instruments.INSTRUMENTS.filter(i => OPENS[i.id] === r.id).map(i => i.id);
    return {
      id: r.id,
      title: r.title,
      file: r.href,
      reads: r.needs || [],
      writes: Ownership.ownedBy(r.id),
      requires: Registry.requires(r.id),
      dashboardNumber: numbers.length ? numbers[0] : null,
      order: r.order
    };
  });
}
function render() { return JSON.stringify({ generatedBy: 'tools/rooms-json.js', note: 'Generated from shared/registry.js and shared/ownership.js; do not edit by hand.', rooms: build() }, null, 2) + '\n'; }

if (require.main === module) {
  fs.writeFileSync(path.join(ROOT, 'rooms.json'), render());
  console.log('wrote rooms.json: ' + build().length + ' rooms');
}
module.exports = { build, render, OPENS };
