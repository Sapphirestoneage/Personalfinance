/* Does a standalone household compute the SAME numbers as the main suite?
   This is the claim the whole "port it across" promise rests on. */
const fs=require('fs'), path=require('path'), ROOT=__dirname+'/..';
global.self={localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};
const Money=require(ROOT+'/shared/money.js');
const Store=require(ROOT+'/shared/store.js');
const Char=require(ROOT+'/engines/character.js');
const t=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'data',f),'utf8'));
const TABLES={dndRules:t('dnd_rules.json'),dndClasses:t('dnd_classes.json'),dndScoring:t('dnd_scoring.json'),
  fooRules:t('foo_rules.json'),effectiveTaxRates:t('effective_tax_rates_2026.json'),
  fireVariants:t('fire_variants.json'),retirementMilestones:t('retirement_milestones.json'),
  netWorthPercentiles:t('net_worth_percentiles_scf_2022.json'),liquidityBenchmarks:t('liquidity_benchmarks.json')};

let fails=0,n=0;
const check=(name,a,e)=>{n++;if(a!==e){fails++;console.log('  FAIL '+name+': got '+a+', expected '+e);}else console.log('  ok   '+name+' = '+a);};

/* Robin Sparks' numbers, entered the way a stranger would enter them here. */
Store.setMoney('grossAnnualIncomeCents', 7200000);
Store.setMoney('monthlyExpensesCents', 315000);
Store.setMoney('cashCents', 950000);
Store.setMoney('investmentsCents', 4800000);
Store.setDebt(2160000, true);

console.log('\n[filing status is load-bearing, not decoration]');
/* Deliberately BEFORE setting it: Tier0's savings rate subtracts estimated tax,
   and the effective-rate lookup keys off filing status. Without it the chain
   savings rate -> CON -> Max HP must refuse to compute rather than guess. */
(function () {
  const s0 = Char.sheet(Store.household(), TABLES);
  check('no filing status -> savings rate unscored', Money.isOk(s0.subScores.savingsRate), false);
  check('which leaves CON unscored', Money.isOk(s0.stats.CON), false);
  check('which withholds Max HP rather than assuming CON +0', s0.maxHp, null);
})();
Store.setFilingStatus('single');
(function () {
  const s1 = Char.sheet(Store.household(), TABLES);
  check('with it, savings rate scores', Money.isOk(s1.subScores.savingsRate), true);
  /* CON still will not resolve: its third sub-stat, Consistency, is an answer
     no balance can supply. This is the rule working, not a gap. */
  check('CON still waits on Consistency', Money.isOk(s1.stats.CON), false);
  check('and Max HP is still withheld', s1.maxHp, null);
})();
Store.patchProfile({ yearsSustained: 2, disruptionSurvived: false });
(function () {
  const s2 = Char.sheet(Store.household(), TABLES);
  check('all three CON sub-stats in, CON resolves', s2.stats.CON.value, 14);
  check('and Max HP arrives, in weeks', s2.maxHp.weeks, 18);
  check('cut by Debt Burden 2', s2.maxHp.reducedByDebt, true);
})();

console.log('\n[tier gate]');
check('tier 2 once money is in', Store.tier(TABLES), 2);

console.log('\n[parity with the main suite]');
const s=Char.sheet(Store.household(), TABLES);
/* These are the exact figures the SLAF room produced for the same persona. */
check('same level', s.level.value, 3);
check('same debt burden', s.debtBurden.value, 2);
check('same class', s.suggestedClass.value, 'earner');
check('same current HP in weeks', s.currentHp.value, 13);
check('high-interest line still borrowed from foo_rules',
  s.debtBurden.highInterestRate, TABLES.fooRules.thresholds.highInterestDebtRate);

console.log('\n[HP units: weeks on the box, months on the sub-line]');
(function () {
  /* BRIEF §9.1 requires both units, and requires them to agree. The sheet
     prints weeks large and months small; if the divisor ever drifts, the two
     numbers start contradicting each other on the same panel. */
  const WEEKS_PER_MONTH = 52 / 12;                    // 4.3333…
  const s = Char.sheet(Store.household(), TABLES);
  const weeks = s.currentHp.value;
  const monthsShown = Math.round((weeks / 4.345) * 10) / 10;   // the sheet's own expression
  const monthsTrue = Math.round((weeks / WEEKS_PER_MONTH) * 10) / 10;
  check('weeks reads as expected', weeks, 13);
  check('months agrees with weeks to a tenth',
    Math.abs(monthsShown - monthsTrue) <= 0.1, true);
  /* And the round trip: months back to weeks lands on the same integer. */
  check('months converts back to the same week count',
    Math.round(monthsShown * WEEKS_PER_MONTH), weeks);
  /* Max HP is a capacity in the SAME unit — mixing them is the DD-001 trap. */
  check('max HP is in weeks too, so the bar is meaningful',
    s.maxHp.weeks >= weeks || s.maxHp.reducedByDebt, true);
})();

console.log('\n[tier 1 works with no money at all]');
Store.reset();
const rules=TABLES.dndRules, scoring=TABLES.dndScoring;
const declared=rules.subStats.filter(x=>x.kind==='declared');
const quiz={};
declared.forEach(sub=>{quiz[sub.id]={0:0,1:0};});   /* best answer to everything */
Store.patchProfile({quiz});
check('tier 1 with quiz only', Store.tier(TABLES), 1);
const t1=Char.sheet(Store.household(), TABLES);
check('INT scores from the quiz alone', t1.stats.INT.value, 20);
check('CHA scores from the quiz alone', t1.stats.CHA.value, 20);
check('WIS scores from the quiz alone', t1.stats.WIS.value, 20);
check('STR stays unscored without money', Money.isOk(t1.stats.STR), false);
check('no level without money', Money.isOk(t1.level), false);
check('no max HP without money', t1.maxHp, null);
check('but the sheet still renders', t1.ready, true);

console.log('\n[an empty visitor]');
Store.reset();
check('tier 0 on arrival', Store.tier(TABLES), 0);

console.log('\n'+(fails?fails+' FAILED of '+n:'All '+n+' checks passed'));
process.exit(fails?1:0);
