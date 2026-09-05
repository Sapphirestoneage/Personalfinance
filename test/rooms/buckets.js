/* ==========================================================================
   test/rooms/buckets.js — Time Buckets, re-derived by hand. D-101 schema.
   ========================================================================== */
'use strict';

module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Demo, Registry, Ownership, Gate, Room, Tier0, Projection, TABLES } = t;
  const Buckets = require(path.join(ROOT, 'engines/buckets.js'));
  const T = TABLES;

  section('Time Buckets — the table, the engine, the room (D-101)');

  /* ---- The table --------------------------------------------------------- */
  const table = T.bucketIdeas;
  checkTrue('the ideas table is loaded', !!table && !!table.decades);
  check('it is a convention, not a finding', table.confidence, 'convention');
  checkTrue('every header field is present', ['id', 'version', 'asOf', 'source', 'confidence', 'confidenceNote', 'note'].every(k => typeof table[k] === 'string' && table[k].length > 0));
  checkTrue('decades are keyed by their first age, 20 to 80', ['20', '30', '40', '50', '60', '70', '80'].every(k => Array.isArray(table.decades[k]) && table.decades[k].length > 0));
  checkTrue('every idea has a label and a cost in cents', Object.keys(table.decades).every(k => table.decades[k].every(i => typeof i.label === 'string' && Number.isInteger(i.cents) && i.cents > 0)));
  /* By hand: the thirties' three ideas — 5,000 + 4,000 + 3,500 = $12,500. */
  check('the thirties propose $12,500', Buckets.ideasFor(30, T).totalCents, 1250000);
  check('… three ideas', Buckets.ideasFor(30, T).items.length, 3);
  check('a decade the table does not price proposes nothing', Buckets.ideasFor(90, T).totalCents, 0);
  check('… and does not throw without tables', Buckets.ideasFor(30, {}).totalCents, 0);

  /* ---- A 32-year-old, by construction (age fixed regardless of today) ----- */
  const today = new Date();
  const dobAt = (age) => {
    const d = new Date(Date.UTC(today.getUTCFullYear() - age, today.getUTCMonth(), 1));
    d.setUTCDate(d.getUTCDate() - 40); /* forty days before the month starts a year back: safely past the birthday */
    return d.toISOString().slice(0, 10);
  };
  function person(age, extra) {
    return Schema.createHousehold(Object.assign({
      state: 'NC', filingStatus: 'single',
      people: [Schema.createPerson({ id: 'p1', role: 'adult', employmentStatus: 'employed', dob: age === null ? null : dobAt(age),
        incomeSources: [Schema.createIncomeSource({ id: 'i1', personId: 'p1', type: 'w2', grossAnnualIncomeCents: 7200000 })] })],
      assets: [Schema.createAsset({ id: 'a1', category: 'investment', label: 'Index funds', valueCents: 4800000, liquid: false, ownerIds: ['p1'] })],
      expenses: { monthlyEssential: { estimatedValueCents: 315000 } }
    }, extra || {}));
  }
  const h32 = person(32);
  check('the fixture is 32', Schema.primaryAge(h32), 32);

  /* ---- The decades ---------------------------------------------------------- */
  const dd = Buckets.decades(h32);
  check('a 32-year-old has seven decades to 95: 30s through 90s', dd.decades.map(d => d.decade).join(','), '30,40,50,60,70,80,90');
  check('… labelled 30s, 40s, …', dd.decades.map(d => d.label).slice(0, 2).join(','), '30s,40s');
  check('… the box label names the decade', Buckets.inYour(30), 'In your 30s');
  check('… the current one is the thirties', dd.decades.filter(d => d.current).map(d => d.decade).join(','), '30');
  check('… the forties start in 8 years, the fifties in 18', dd.decades[1].yearsUntil + ',' + dd.decades[2].yearsUntil, '8,18');
  check('… the current decade is 0 years away, not negative', dd.decades[0].yearsUntil, 0);
  check('… the age is known', dd.ageAssumed, false);
  check('the plan age is 95', Buckets.PLAN_AGE, 95);
  const noAge = Buckets.decades(person(null));
  check('no age → the decades run from 30', noAge.decades[0].decade, 30);
  check('… and the engine says the age is assumed', noAge.ageAssumed, true);
  check('… with no years until each', noAge.decades[1].yearsUntil, null);
  const at55 = Buckets.decades(person(55));
  check('at 55 the past decades are not listed: 50s through 90s', at55.decades.map(d => d.decade).join(','), '50,60,70,80,90');

  /* ---- The write: one 'Planned' row, or a remainder on an itemised list --- */
  let list = Buckets.setDecadeCents([], 30, 1200000);
  check('a price on an empty decade is one Planned experience', list.length + '/' + list[0].experiences.length + '/' + list[0].experiences[0].label, '1/1/Planned');
  check('… at that price', list[0].experiences[0].costCents, 1200000);
  list = Buckets.setDecadeCents(list, 40, 3000000);
  check('a second decade is added, sorted', list.map(b => b.decade).join(','), '30,40');
  const firstId = list[0].experiences[0].id;
  list = Buckets.setDecadeCents(list, 30, 1500000);
  check('re-pricing a Planned-only decade replaces its one row', list[0].experiences.length + '/' + list[0].experiences[0].costCents, '1/1500000');
  check('… keeping its id', list[0].experiences[0].id, firstId);
  check('typing 0 clears the decade', Buckets.setDecadeCents(list, 30, 0).map(b => b.decade).join(','), '40');
  check('… so does blank', Buckets.setDecadeCents(list, 30, null).map(b => b.decade).join(','), '40');
  const itemised = [Schema.createTimeBucket({ decade: 40, experiences: [{ id: 'boat', label: 'The boat', costCents: 500000 }, { id: 'trip', label: 'A family trip', costCents: 800000 }] })];
  let over = Buckets.setDecadeCents(itemised, 40, 2000000);
  /* By hand: 5,000 + 8,000 itemised = 13,000; typed 20,000 → Planned remainder 7,000. */
  check('typing over an itemised list keeps it and adds a Planned remainder', over[0].experiences.map(x => x.label).join(','), 'The boat,A family trip,Planned');
  check('… of the difference: $20,000 − $13,000 = $7,000', over[0].experiences[2].costCents, 700000);
  check('… so the decade adds up to what was typed', over[0].experiences.reduce((s, x) => s + x.costCents, 0), 2000000);
  over = Buckets.setDecadeCents(over, 40, 1300000);
  check('typing exactly the list’s total drops the remainder', over[0].experiences.map(x => x.label).join(','), 'The boat,A family trip');
  over = Buckets.setDecadeCents(itemised, 40, 1000000);
  check('typing less than the list can hold replaces it with the price', over[0].experiences.map(x => x.label + ':' + x.costCents).join(','), 'Planned:1000000');
  check('the input handed in is not mutated', itemised[0].experiences.length, 2);
  check('the list is the schema’s shape', JSON.stringify(Schema.createHousehold({ timeBuckets: over }).timeBuckets), JSON.stringify(over));

  /* ---- Nothing planned → incomplete, never a zero ----------------------------- */
  const empty = Buckets.plan(h32, T);
  check('nothing planned is incomplete', empty.status, 'incomplete');
  checkTrue('… and says so', /Nothing planned/.test(empty.reason));
  check('… naming the field', empty.missing.join(','), 'timeBuckets');
  check('the total across nothing is 0 for the ownership row', Buckets.totalPlannedCents(h32), 0);
  check('… whose read is incomplete, not $0', Ownership.field('bucketsPlanned').read(h32).status, 'incomplete');

  /* ---- Hand-derived: age 32, $12,000 in the 30s, $30,000 in the 40s ---------- */
  const planned = person(32);
  planned.timeBuckets = Buckets.setDecadeCents(Buckets.setDecadeCents([], 30, 1200000), 40, 3000000);
  const p = Buckets.plan(planned, T);
  check('the plan is $42,000', p.value, 4200000);
  check('… two decades priced', p.plannedCount, 2);
  check('… the first is the thirties, now', p.first.decade + '/' + p.first.yearsUntil, '30/0');
  check('… the next is the forties, in 8 years', p.next.decade + '/' + p.next.yearsUntil, '40/8');
  check('the cumulative plan by the forties is $42,000', p.rows[1].cumulativeCents, 4200000);
  check('… and stays $42,000 through the nineties', p.rows[6].cumulativeCents, 4200000);
  check('the ownership row reads the same $42,000', Ownership.field('bucketsPlanned').read(planned).value, 4200000);

  /* The projection. The engine runs Projection.pathCents ONCE: monthly
     compounding at the real return (5% ÷ 12 a month) with a twelfth of the
     year's savings added at the end of each month. The savings basis is
     Tier 0's: gross 72,000 − 12 × 3,150 spending − 19% tax (13,680) =
     20,520 excluding a match; no match is entered here so that is the basis
     (the demo persona below carries one). By hand, the closed form of that
     loop for the forties, 96 months on:
       48,000 × (1 + 0.05/12)^96 + (20,520/12) × ((1 + 0.05/12)^96 − 1) / (0.05/12)
     (1 + 0.05/12)^96 = 1.490587…; 48,000 × that = 71,548.19;
     1,710 × 117.7409 = 201,336.90; together 272,885.09. */
  const aff = p.affordability;
  check('the money can be projected', aff.status, 'ok');
  check('… from $48,000 invested', aff.investmentsCents, 4800000);
  check('… saving $20,520 a year: Tier 0’s excluding-match figure', aff.annualSavingsCents, 2052000);
  check('… which is Tier 0’s own', aff.annualSavingsCents, Tier0.savingsRate(planned, T).excludingMatch.annualSavingsCents);
  check('… at the 5% real return', aff.annualRate, 0.05);
  const r = 0.05 / 12, g96 = Math.pow(1 + r, 96);
  const byHand40 = 4800000 * g96 + 171000 * ((g96 - 1) / r);
  check('… $272,885 at the start of the forties, within $50 of the closed form', p.rows[1].projectedCents, byHand40, 5000);
  check('… ≈ $272,885 as a literal', p.rows[1].projectedCents, 27288509, 100);
  check('… the thirties’ money is what is invested now', p.rows[0].projectedCents, 4800000);
  check('… and it is projection.js’s own path, not a second loop', p.rows[1].projectedCents,
    Projection.pathCents({ startCents: 4800000, monthlyContributionCents: 171000, annualRate: 0.05, years: 63 }).years[8].balanceCents);
  check('$42,000 by 40 against $272,885: the money outruns the plan', p.anyStrained, false);
  check('… no decade strained', p.rows.filter(x => x.strained).length, 0);
  /* FI number: 12 × 3,150 ÷ 0.04 = 945,000; 42,000 ÷ 945,000 = 4.44%. */
  check('the FI number is $945,000', p.fireNumberCents, 94500000);
  check('… and the plan is 4.4% of it', p.shareOfFi, 4200000 / 94500000, 1e-12);
  check('… 4% when formatted', Money.formatRate(p.shareOfFi, { decimals: 0 }), '4%');

  /* The brief's annual-compounding figure is the other helper's, not this
     one's — recorded so the choice is visible: 48,000 × 1.05^8 + 22,680 ×
     ((1.05^8 − 1) ÷ 0.05) = 70,918 + 216,574 = 287,492 with the demo's
     including-match basis. The monthly loop gives more. */
  const demoAnnual = Projection.futureValueCents({ startCents: 4800000, annualContributionCents: 2268000, annualRate: 0.05, years: 8 });
  check('for the record, annual compounding of the demo’s basis would give $287,492', demoAnnual.value, 28749165, 100);

  /* ---- The demo persona: same age and pot, a match in the basis --------------- */
  const demo = Demo.build();
  demo.timeBuckets = Buckets.setDecadeCents(Buckets.setDecadeCents([], 30, 1200000), 40, 3000000);
  const dp = Buckets.plan(demo, T);
  check('the demo is 32 too', dp.age, 32);
  check('… its basis includes the match: $22,680', dp.affordability.annualSavingsCents + '/' + dp.affordability.savingsVariant, '2268000/includingMatch');
  const byHandDemo40 = 4800000 * g96 + 189000 * ((g96 - 1) / r);
  check('… $294,078 at the start of the forties, by the same closed form', dp.rows[1].projectedCents, byHandDemo40, 5000);
  check('… ≈ $294,078 as a literal', dp.rows[1].projectedCents, 29407767, 100);

  /* ---- A plan the money cannot keep up with ---------------------------------- */
  const big = person(32);
  big.timeBuckets = Buckets.setDecadeCents(Buckets.setDecadeCents([], 30, 1200000), 40, 30000000);
  const bp = Buckets.plan(big, T);
  check('$312,000 by 40 against $272,885: strained', bp.anyStrained, true);
  check('… first in the forties', bp.firstStrained, 40);
  check('… the thirties are fine ($12,000 against $48,000)', bp.rows[0].strained, false);
  check('… the forties are marked', bp.rows[1].strained, true);
  const later = person(32);
  later.timeBuckets = Buckets.setDecadeCents([], 30, 6000000);
  check('$60,000 now against $48,000 now: strained from the first decade', Buckets.plan(later, T).firstStrained, 30);

  /* ---- A stop age ends the contributions ------------------------------------- */
  const stops = person(32, { targets: { retireAge: 36 } });
  stops.timeBuckets = Buckets.setDecadeCents([], 40, 100000);
  /* By hand: 48 months of saving, then 48 of growth only:
     (48,000 × g48 + 1,710 × (g48 − 1)/r) × g48. */
  const g48 = Math.pow(1 + r, 48);
  const stopped = (4800000 * g48 + 171000 * ((g48 - 1) / r)) * g48;
  check('with a stop age of 36 the forties see four years of saving then growth alone', Buckets.plan(stops, T).rows[1].projectedCents, stopped, 5000);
  check('… the stop age is reported', Buckets.plan(stops, T).affordability.stopAge, 36);

  /* ---- A past decade is kept but not shown or counted -------------------------- */
  const older = person(55);
  older.timeBuckets = Buckets.setDecadeCents(Buckets.setDecadeCents([], 40, 500000), 50, 700000);
  const op = Buckets.plan(older, T);
  check('at 55 the forties are not among the decades', op.rows.map(x => x.decade).join(','), '50,60,70,80,90');
  check('… the number counts the fifties only', op.value, 700000);
  check('… and reports the $5,000 in a decade past', op.pastCents, 500000);
  check('… while the ownership row still counts everything stored', Ownership.field('bucketsPlanned').read(older).value, 1200000);
  const onlyPast = person(55);
  onlyPast.timeBuckets = Buckets.setDecadeCents([], 40, 500000);
  checkTrue('only a past decade priced → incomplete, and says the decades ahead are empty', Buckets.plan(onlyPast, T).status === 'incomplete' && /decades ahead/.test(Buckets.plan(onlyPast, T).reason));

  /* ---- No age: the total shows, the projection says why -------------------------- */
  const na = person(null);
  na.timeBuckets = Buckets.setDecadeCents([], 30, 1200000);
  const np = Buckets.plan(na, T);
  check('with no date of birth the plan still totals', np.value, 1200000);
  check('… decades from 30, said so', np.rows[0].decade + '/' + np.ageAssumed, '30/true');
  check('… and the money is not projected', np.affordability.status, 'incomplete');
  check('… missing the date of birth', np.affordability.missing.join(','), 'dob');
  check('… nothing marked strained', np.anyStrained, false);

  /* ---- No investments / no income: says why ------------------------------------ */
  const noInv = Schema.createHousehold({ people: [Schema.createPerson({ id: 'p1', role: 'adult', employmentStatus: 'employed', dob: dobAt(32) })], timeBuckets: Buckets.setDecadeCents([], 30, 100000) });
  const ni = Buckets.plan(noInv, T);
  check('no investments → the plan totals but the projection is incomplete', ni.value + '/' + ni.affordability.status, '100000/incomplete');
  check('… missing investments first', ni.affordability.missing.join(','), 'investments');

  /* ---- Empty household: says why, never throws ----------------------------------- */
  let threw = false, e = null;
  try { e = Buckets.plan(Schema.createHousehold({}), T); } catch (err) { threw = true; }
  checkTrue('an empty household does not throw', !threw);
  check('… it is incomplete', e.status, 'incomplete');
  let threw2 = false;
  try { Buckets.decades(undefined); Buckets.affordability(Schema.createHousehold({}), {}); Buckets.plan(null, {}); Buckets.plan({}, {}); Buckets.totalPlannedCents(null); Buckets.setDecadeCents(undefined, 30, 5); } catch (err) { threw2 = true; }
  checkTrue('nor do the helpers, even without tables', !threw2);
  check('an empty household with guesses filled still says nothing planned', Buckets.plan(Gate.fillGuesses(Schema.createHousehold({}), T), T).status, 'incomplete');
  checkTrue('no extra is named status', !Object.keys(p).some((k, i, arr) => arr.indexOf(k) !== i));

  /* ---- Ownership, registry, schema ----------------------------------------------- */
  check('the planned total is owned by Time Buckets', Ownership.field('bucketsPlanned').owner, 'buckets');
  check('… anchored at the inputs', Ownership.field('bucketsPlanned').anchor, 'inputs');
  check('the registry row needs investments and spending', Registry.byId('buckets').needs.join(','), 'investments,monthlyExpenses');
  check('time buckets start empty', JSON.stringify(Schema.createHousehold({}).timeBuckets), '[]');
  check('an experience has a label, a cost and a year', Object.keys(Schema.createExperience({})).join(','), 'id,label,costCents,year');

  /* ---- The page -------------------------------------------------------------------- */
  const html = fs.readFileSync(path.join(ROOT, 'rooms/buckets.html'), 'utf8');
  Room.IDS.forEach(id => checkTrue(`Time Buckets has #${id}`, new RegExp('id="' + id + '"').test(html)));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading', 'room-standalone', 'load-notice'].forEach(id => checkTrue(`… and #${id}`, new RegExp('id="' + id + '"').test(html)));
  checkTrue('it mounts the template as buckets', /Room\.mount\(\{\s*id: 'buckets'/.test(html));
  checkTrue('no stub marker remains', html.indexOf('STUB') === -1 && html.indexOf('Hourly.realHourlyWage') === -1);
  checkTrue('one box a decade, the first five as inputs and the rest folded', /inputs: DECADES\.slice\(0, 5\)\.map\(decadeInput\)/.test(html) && /more: DECADES\.slice\(5\)\.map\(decadeInput\)/.test(html));
  checkTrue('it writes only through Spine.set on timeBuckets, via the engine', /Spine\.set\('timeBuckets', Buckets\.setDecadeCents\(/.test(html) && !/upsertPerson|updateProfile/.test(html));
  checkTrue('the proposals come from the ideas table through propose', /propose: function \(h, T\)/.test(html) && /Buckets\.ideasFor\(decade, T\)/.test(html) && /typical experiences for this decade \(convention\)/.test(html));
  checkTrue('the hint says what typing over an itemised list does', /keeps it and sets a ‘Planned’ remainder/.test(html) && /zero clears it/.test(html));
  checkTrue('one chart, bars, with a marker for the money', (html.match(/Charts\.bars\(/g) || []).length === 2 && !/Charts\.(area|donut|stacked)\(/.test(html) && /marker: projected \? \{ at: r\.projectedCents/.test(html));
  checkTrue('it reads investments, spending and the date of birth as chips', /reads: \['investments', 'monthlyExpenses', 'dob'/.test(html));
  checkTrue('it declares its live-form discipline and a place for a theme', /LIVE-FORM: built once/.test(html) && /THEMING:/.test(html));
  checkTrue('the scope line says what it does not do', /scope: 'This room does not book anything or know what you would enjoy; it puts prices on decades so they can be argued with\.'/.test(html));
  checkTrue('why is written for all six situations', ['employed', 'selfEmployed', 'mixed', 'student', 'retired', 'betweenJobs'].every(s => new RegExp(s + ": '").test(html)));
  checkTrue('the scripts it needs, in order', (function () {
    const order = ['shared/gate.js', 'engines/projection.js', 'engines/tier0.js', 'engines/cashflow.js', 'engines/ratios.js', 'engines/hourly.js', 'engines/buckets.js', 'shared/lens.js', 'shared/charts.js', 'shared/room.js'];
    const idx = order.map(s => html.indexOf('<script src="../' + s + '"'));
    return idx.every((v, i) => v !== -1 && (i === 0 || v > idx[i - 1]));
  })());
  const engine = fs.readFileSync(path.join(ROOT, 'engines/buckets.js'), 'utf8');
  checkTrue('the engine projects with pathCents, once', (engine.match(/Projection\.pathCents\(/g) || []).length === 1 && !/futureValue|yearsToTarget/.test(engine));
  checkTrue('… at the real return, with Tier 0’s savings and FI number', /a\.returnReal/.test(engine) && /Tier0\.savingsRate\(/.test(engine) && /Tier0\.fireNumber\(/.test(engine));
  checkTrue('… and never a silent || 0', !/\|\| 0\b/.test(engine));
};
