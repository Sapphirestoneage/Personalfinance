/* ==========================================================================
   tests/engine/invariants.js, every corpus household through project(),
   and what must hold in every row:
     - the engine is pure: the same inputs give the same JSON twice
     - no balance goes negative; money that runs out is a warning and an
       unmet figure, never a negative account
     - contributions never exceed the year's limits
     - money is conserved: income in plus draws from accounts equals
       spending plus taxes plus invested contributions plus the change in
       cash before growth (plus whatever went unmet)
     - the iteration loop converges in every year
     - every number is finite
   ========================================================================== */
var P = require('../../engine/project.js');
var corpus = require('./households.js');

function finite(v) { return typeof v === 'number' && isFinite(v); }
function walk(obj, path, bad) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'number') { if (!isFinite(obj)) bad.push(path); return; }
  if (Array.isArray(obj)) { obj.forEach(function (v, i) { walk(v, path + '[' + i + ']', bad); }); return; }
  if (typeof obj === 'object') Object.keys(obj).forEach(function (k) { walk(obj[k], path + '.' + k, bad); });
}

module.exports = function (t) {
  Object.keys(corpus.households).forEach(function (id) {
    var h = corpus.households[id];
    t.section('Invariants: ' + h.label);
    var run = P.project(h.household, h.assumptions, [], { now: corpus.NOW });
    var again = P.project(h.household, h.assumptions, [], { now: corpus.NOW });
    t.check(id + ': pure (same output twice)', JSON.stringify(run) === JSON.stringify(again), true);
    t.checkTrue(id + ': has rows to the horizon', run.years.length > 40, run.years.length + ' rows');
    var bad = []; walk(run, 'run', bad);
    t.check(id + ': every number finite', bad.length, 0);
    t.checkTrue(id + ': milestones present', run.milestones && 'fi' in run.milestones);
    t.checkTrue(id + ': assumptions echoed', run.assumptionsUsed && run.assumptionsUsed.dollars === 'nominal' && run.assumptionsUsed.displayDefault === 'today');

    var negative = [], overLimit = [], unbalanced = [], unconverged = [], unmetSilent = [];
    run.years.forEach(function (r) {
      var b = r.balances;
      ['cashCents', 'taxableCents', 'pretax401kCents', 'pretaxIraCents', 'roth401kCents', 'rothIraCents', 'hsaCents', 'homeValueCents'].forEach(function (k) {
        if (b[k] < 0) negative.push(r.year + ' ' + k + ' ' + b[k]);
      });
      Object.keys(b.debts).forEach(function (k) { if (b.debts[k] < 0) negative.push(r.year + ' debt ' + k); });
      r.contributions.limits.forEach(function (lim, i) {
        var k401 = r.contributions.byPerson.pretax401k[i] + r.contributions.byPerson.roth401k[i];
        if (k401 > lim.k401 + 1) overLimit.push(r.year + ' 401k ' + k401 + ' > ' + lim.k401);
        if (r.contributions.byPerson.rothIra[i] > lim.ira + 1) overLimit.push(r.year + ' roth ira');
        if (r.contributions.byPerson.hsa[i] > lim.hsa + 1) overLimit.push(r.year + ' hsa');
        if (k401 + r.contributions.byPerson.match[i] > lim.annualAdditions + 1) overLimit.push(r.year + ' 415c');
      });
      /* Conservation, before growth: cashBefore + in - out + unmet (the spending
         that could not happen) = cash at year end less this year's cash growth. */
      var cf = r.cashFlow;
      var endBeforeGrowth = r.balances.cashCents - r.growth.cashCents;
      var lhs = cf.cashBeforeCents + cf.inCents - cf.outCents + cf.unmetCents;
      if (Math.abs(lhs - endBeforeGrowth) > 200) unbalanced.push(r.year + ': ' + lhs + ' vs ' + endBeforeGrowth);
      if (!r.converged) unconverged.push(r.year);
      if (r.withdrawals.unmetCents > 0 && !r.warnings.some(function (w) { return /runs out/.test(w); })) unmetSilent.push(r.year);
    });
    t.check(id + ': no negative balance', negative.length, 0);
    if (negative.length) console.log('   ', negative.slice(0, 5));
    t.check(id + ': contributions within limits', overLimit.length, 0);
    if (overLimit.length) console.log('   ', overLimit.slice(0, 5));
    t.check(id + ': money conserved every year', unbalanced.length, 0);
    if (unbalanced.length) console.log('   ', unbalanced.slice(0, 5));
    t.check(id + ': every year converges', unconverged.length, 0);
    if (unconverged.length) console.log('   ', unconverged.slice(0, 5));
    t.check(id + ': running out is never silent', unmetSilent.length, 0);
    var early = run.years.filter(function (r) { return r.flags.penalty; });
    early.forEach(function (r) { t.checkTrue(id + ': penalty years warn (' + r.year + ')', r.warnings.some(function (w) { return /penal/.test(w); })); });
  });

  /* Shape checks on one household: the row fields the rooms will read. */
  t.section('Row shape');
  var run = P.project(corpus.households.coupleKids.household, corpus.households.coupleKids.assumptions, [], { now: corpus.NOW });
  var r0 = run.years[0];
  ['year', 'ages', 'activeBlocks', 'income', 'spending', 'contributions', 'withdrawals', 'conversions', 'taxes', 'magiCents', 'balances', 'netWorthCents', 'fiRatio', 'flags', 'deflator', 'explain'].forEach(function (k) {
    t.checkTrue('row has ' + k, k in r0);
  });
  t.check('household of two: two ages', r0.ages.length, 2);
  t.check('first year is the run year', r0.year, 2026);
  t.check('first year deflator is one', r0.deflator, 1);
  t.check('today() on the first year is the identity', P.today(r0.netWorthCents, r0), r0.netWorthCents);
  ['federalOrdinaryCents', 'federalCapitalGainsCents', 'ficaCents', 'seTaxCents', 'stateCents', 'acaCreditCents', 'penaltiesCents', 'niitCents', 'totalCents'].forEach(function (k) { t.checkTrue('taxes has ' + k, k in r0.taxes); });
  ['cashCents', 'taxableCents', 'taxableBasisCents', 'pretax401kCents', 'pretaxIraCents', 'roth401kCents', 'rothIraCents', 'rothIraBasisCents', 'rothConversionLayers', 'hsaCents', 'homeEquityCents', 'debts', 'netWorthCents'].forEach(function (k) { t.checkTrue('balances has ' + k, k in r0.balances); });
  t.checkTrue('mortgage shows as a debt', Object.keys(r0.balances.debts).length === 1);
  t.checkTrue('employer match lands in the plan', r0.contributions.employerMatchCents > 0);
  t.checkTrue('HSA family limit used', r0.contributions.hsaCents === 875000);
  t.checkTrue('explain is plain English', r0.explain.federal.length > 2 && /Adjusted gross income/.test(r0.explain.federal.join(' ')));
  t.checkTrue('warning when no Social Security entered', P.project(corpus.households.single25.household, {}, [], { now: corpus.NOW }).warnings.some(function (w) { return /Social Security/.test(w); }));

  /* Milestone definitions. */
  t.section('Milestones');
  var m = run.milestones;
  t.checkTrue('couple: FI year is a year', typeof m.fi === 'number');
  t.checkTrue('couple: coast FI is not after FI', m.coastFI === null || m.fi === null || m.coastFI <= m.fi);
  t.checkTrue('couple: access year is at 60', m.accessYear === 1988 + 60);
  t.checkTrue('couple: medicare at 65', m.medicareStart === 1988 + 65);
  t.check('couple: RMD starts at 75 for the older spouse, born 1986', m.rmdStart, 1986 + 75);
  var ladder = P.project(corpus.households.rothLadder.household, corpus.households.rothLadder.assumptions, [], { now: corpus.NOW });
  t.checkTrue('ladder: converts in year one', ladder.years[0].conversions.cents > 0);
  t.check('ladder: first conversion year', ladder.milestones.firstConversionYear, 2026);
  t.checkTrue('ladder: a layer seasons five years on', ladder.years[0].balances.rothConversionLayers[0].seasonedFrom === 2031);
  t.checkTrue('ladder: 12% bracket not crossed in year one', ladder.years[0].taxes.marginalRate <= 0.12);
  var retiree = P.project(corpus.households.earlyRetireeAca.household, corpus.households.earlyRetireeAca.assumptions, [], { now: corpus.NOW });
  t.checkTrue('retiree: ACA priced before 65', retiree.years[0].flags.acaYear && retiree.years[0].aca !== null);
  var at65 = retiree.years.filter(function (r) { return r.ages[0] === 65; })[0];
  t.checkTrue('retiree: Medicare at 65, no ACA', at65 && !at65.flags.acaYear && at65.flags.medicare);
  var at70 = retiree.years.filter(function (r) { return r.ages[0] === 70; })[0];
  t.checkTrue('retiree: Social Security from the claim age', at70 && at70.income.socialSecurityCents > 0 && !retiree.years.filter(function (r) { return r.ages[0] === 69; })[0].income.socialSecurityCents);
  t.check('retiree: RMD at 75 for someone born 1974 (SECURE 2.0)', retiree.milestones.rmdStart, 1974 + 75);
  var between = P.project(corpus.households.betweenJobs.household, corpus.households.betweenJobs.assumptions, [], { now: corpus.NOW });
  t.checkTrue('between jobs: lives on cash first', between.years[0].withdrawals.cashCents > 0 && between.years[0].withdrawals.pretax401kCents === 0);
  var se = P.project(corpus.households.selfEmployed.household, corpus.households.selfEmployed.assumptions, [], { now: corpus.NOW });
  t.checkTrue('self-employed: SE tax, no FICA', se.years[0].taxes.seTaxCents > 0 && se.years[0].taxes.ficaCents === 0);
  t.checkTrue('self-employed: marketplace while working', se.years[0].flags.acaYear);
};
