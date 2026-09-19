'use strict';
/* Property tests for engines/firstlook.js (lane 2, section 2, L-2). The four
   generic properties, plus the three the front door lives or dies by:

     · the walk is a walk, not a formula that can disagree with itself —
       the pot rises exactly while the surplus goes in and the FI year, when
       there is one, is the first year the pot clears the number;
     · the ladder gives exactly ONE next step, always, for any household it
       can answer at all. Never a list, never nothing;
     · a negative month is an ANSWER, not an error: the surplus comes back
       negative, with a runway beside it, and no finish date at all.
*/
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, build, arbSpec } = H;
const FL = H.engine('firstlook');

const NEXT_IDS = ['close-the-gap', 'clear-the-card', 'one-month', 'claim-the-match',
  'find-the-match', 'protect-the-runway', 'three-months', 'where-the-surplus-goes'];
const HEAD_IDS = ['runway', 'more-coming-in', 'gap', 'rate'];

/* A First Look household is the shallow one the front door writes: a
   take-home, a housing line, an everything-else line, one savings figure,
   and a situation. Nothing else is asked, so nothing else is here. */
const arbFirstLook = fc.record({
  situation: fc.constantFrom('employed', 'unemployed', 'selfEmployed', 'student'),
  takeHome: fc.integer({ min: 0, max: 2000000 }),
  housing: fc.integer({ min: 0, max: 800000 }),
  living: fc.integer({ min: 0, max: 800000 }),
  saved: fc.integer({ min: 0, max: 100000000 }),
  card: fc.boolean(),
  swr: fc.constantFrom(null, 0.03, 0.045),
  ret: fc.integer({ min: 0, max: 120 }).map((n) => n / 1000)
});
function household(o) {
  const Schema = H.Schema;
  const h = Schema.createHousehold({
    people: [Schema.createPerson({ id: 'p', label: 'You', role: 'adult', employmentStatus: o.situation })],
    assets: [Schema.createAsset({ id: 'a', label: 'Savings', category: 'cash', valueCents: o.saved, liquid: true })],
    debts: o.card ? [Schema.createDebt({ id: 'd', label: 'Credit card', type: 'credit_card' })] : [],
    expenses: { needs: { food: {}, accommodation: { monthlyCents: o.housing }, transportation: {} },
      wants: { totalCents: o.living, therapy: null }, entries: [] }
  });
  h.income = { takeHomeMonthlyCents: o.takeHome };
  if (o.swr !== null) h.assumptionOverrides = { swrRate: o.swr };
  return h;
}

const props = H.generic('firstlook').concat([
  prop('four to seven questions, whichever situation you are in, and the gate is always first', fc.constantFrom('employed', 'unemployed', 'selfEmployed', 'student'), (s) => {
    const ids = FL.steps(s).map((x) => x.id);
    if (ids.length < 4 || ids.length > 7) return s + ' gets ' + ids.length + ' questions: ' + ids.join(',');
    if (ids[0] !== 'situation') return s + ' does not open on the situation gate';
    return true;
  }),
  prop('exactly one next step, and one headline, for any household it can answer', arbFirstLook.chain((o) => fc.constant(o)), (o) => {
    const r = FL.result(household(o), TABLES, { returnReal: o.ret });
    if (!Money.isOk(r)) return typeof r.reason === 'string' || 'incomplete without a reason';
    if (!r.next || NEXT_IDS.indexOf(r.next.id) === -1) return 'next step is ' + (r.next && r.next.id);
    if (!r.next.title || !r.next.reason) return 'a next step without its reason';
    if (HEAD_IDS.indexOf(r.headline.id) === -1) return 'headline is ' + r.headline.id;
    return true;
  }),
  prop('a short month is an answer, not an error: a runway and no finish date', arbFirstLook, (o) => {
    const r = FL.result(household(o), TABLES, { returnReal: o.ret });
    if (!Money.isOk(r)) return true;
    if (r.surplusAnnualCents >= 0) return true;
    if (r.yearsToFI !== null) return 'a finish date at ' + r.yearsToFI + ' years on a month that does not cover itself';
    if (!(r.runwayMonths >= 0)) return 'runway is ' + r.runwayMonths;
    return true;
  }),
  prop('a surplus has a date, not a runway', arbFirstLook, (o) => {
    const r = FL.result(household(o), TABLES, { returnReal: o.ret });
    if (!Money.isOk(r) || r.surplusAnnualCents < 0) return true;
    return r.runwayMonths === null || 'a runway of ' + r.runwayMonths + ' on a month that covers itself';
  }),
  prop('the walk and the FI year never disagree', arbFirstLook, (o) => {
    const r = FL.result(household(o), TABLES, { returnReal: o.ret });
    if (!Money.isOk(r)) return true;
    if (r.rows.length !== FL.WALK_YEARS + 1) return 'the walk is ' + r.rows.length + ' rows';
    if (r.rows[0].potCents !== r.savedCents) return 'year zero is not what is saved';
    if (r.yearsToFI === null) return r.rows.every((row) => !row.postFi) || 'a post-FI year with no FI year';
    if (r.rows[r.yearsToFI].potCents < r.fiNumberCents) return 'the FI year has not reached the number';
    if (r.yearsToFI > 0 && r.rows[r.yearsToFI - 1].potCents >= r.fiNumberCents)
      return 'the year before it had already cleared the number';
    return true;
  }),
  prop('past the finish line the money comes from the portfolio, and health cover appears', arbFirstLook, (o) => {
    const r = FL.result(household(o), TABLES, { returnReal: o.ret });
    if (!Money.isOk(r) || r.yearsToFI === null) return true;
    const after = FL.flow(r, Math.min(FL.WALK_YEARS, r.yearsToFI + 1));
    if (!after.postFi) return 'the year after FI is not post-FI';
    if (after.sources.map((s) => s.id).join(',') !== 'portfolio') return 'the source is ' + after.sources.map((s) => s.id).join(',');
    if (!after.outflows.some((x) => x.id === 'health' && x.rough === true)) return 'no health cover line, or it is not marked rough';
    return true;
  }),
  prop('every ribbon in the picture is a positive amount, whatever the year', fc.record({ o: arbFirstLook, year: fc.integer({ min: 0, max: FL.WALK_YEARS }) }), (x) => {
    const r = FL.result(household(x.o), TABLES, { returnReal: x.o.ret });
    if (!Money.isOk(r)) return true;
    const f = FL.flow(r, x.year);
    const bad = f.sources.concat(f.outflows).filter((n) => !(n.monthlyCents >= 0) || !Number.isInteger(n.monthlyCents));
    return bad.length === 0 || bad.map((n) => n.id + ' = ' + n.monthlyCents).join(', ');
  }),
  prop('nothing is invented: an unanswered question comes back incomplete, never a zero', arbSpec, (spec) => {
    const h = build(spec);
    h.income = { takeHomeMonthlyCents: null };
    h.expenses = { needs: { food: {}, accommodation: {}, transportation: {} }, wants: { totalCents: null, therapy: null }, entries: [], annual: [] };
    const r = FL.result(h, TABLES);
    if (Money.isOk(r)) return true;                       /* a salary can stand in for a take-home */
    return (r.missing || []).length > 0 || 'incomplete without naming what is missing';
  })
]);
module.exports = H.suite('firstlook', props);
if (require.main === module) H.main(module.exports);
