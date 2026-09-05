/* test/rooms/dreamline.js — the Dreamline room (D-093 / D-101).
   Hand-derived numbers as literals; nothing copied from engine output. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Demo, Registry, Ownership, Gate, Spine, Hourly, Tier0, TABLES } = t;
  const D = require(path.join(ROOT, 'engines/dreamline.js'));

  section('Dreamline — the table');

  const table = TABLES.dreamline;
  checkTrue('data/dreamline.json is registered and filled', !!table && table.id === 'dreamline' && /Ferriss/.test(table.source));
  ['id', 'version', 'asOf', 'source', 'confidence', 'confidenceNote', 'note'].forEach(function (k) {
    checkTrue('… header field ' + k, typeof table[k] === 'string' && table[k].length > 0);
  });
  check('… the pad is Ferriss’s 1.3', table.bufferMultiplier, 1.3);
  check('… the horizon is six months', table.horizonMonths, 6);
  check('… marked a convention', table.confidence, 'convention');
  check('the engine reads the pad from the table', D.buffer(TABLES), 1.3);
  check('… and the horizon', D.horizonMonths(TABLES), 6);
  check('… and falls back to 1.3 without a table', D.buffer(null), 1.3);
  check('a month is 52 ÷ 12 weeks', D.WEEKS_PER_MONTH, 52 / 12, 1e-12);

  section('Dreamline — the hand-derived case');

  /* Robin, the demo persona, with two dreams: $800 and $600 a month.
       spending          $3,150.00
       dreams            $800 + $600 = $1,400.00
       target            (3,150 + 1,400) × 1.3 = 4,550 × 1.3 = $5,915.00
       the pad           5,915 − 4,550 = $1,365.00
     take-home, from the effective-rate table (19% at $72,000 single):
       tax               72,000 × 0.19 = $13,680
       take-home a month (72,000 − 13,680) ÷ 12 = $4,860.00
       gap               5,915 − 4,860 = $1,055.00 short
       zone              4,860 ≥ 0.8 × 5,915 = 4,732 → watch
     the real hourly wage, by Real Hourly Wage's own arithmetic:
       kept              72,000 − 13,680 − 12 × 400 = $53,520
       hours a year      (40 + 3 + 5 + 2.5 + 2.5 = 53) × 48 = 2,544
       real rate         53,520 ÷ 2,544 = $21.037… → $21.04/h (2104¢)
     hours a week, monthly ÷ rate ÷ (52 ÷ 12) = monthly × 12 ÷ 52 ÷ rate:
       the target        5,915 × 12 ÷ 52 ÷ 21.04 = 1,365 ÷ 21.04 = 64.87 → 64.9
       dream 1           800 × 12 ÷ 52 ÷ 21.04 = 184.615 ÷ 21.04 = 8.77 → 8.8
       dream 2           600 × 12 ÷ 52 ÷ 21.04 = 138.46 ÷ 21.04 = 6.58 → 6.6
       spending          3,150 × 12 ÷ 52 ÷ 21.04 = 726.92 ÷ 21.04 = 34.55 → 34.5
       the pad           1,365 × 12 ÷ 52 ÷ 21.04 = 315 ÷ 21.04 = 14.97 → 15.0
     over six months:    dream 1 $4,800, dream 2 $3,600, the dreams $8,400,
                         the target $35,490                                    */
  function robin(dreams) {
    const h = Demo.build();
    h.dreams = dreams === undefined ? [] : dreams;
    return h;
  }
  const two = D.withSlot(D.withSlot([], 1, { monthlyCents: 80000, label: 'travel' }), 2, { monthlyCents: 60000 });
  const h = robin(two);
  check('the demo’s spending is the $3,150 the case assumes', Schema.monthlyExpensesCents(h).value, 315000);
  check('the demo’s real hourly wage is $21.04/h', Hourly.realHourlyWage(h, TABLES).value, 2104);
  check('the demo’s take-home is $4,860 a month', Tier0.takeHomeMonthlyCents(h, TABLES).value, 486000);

  const dm = D.dreamsMonthlyCents(h);
  check('dreams a month: $1,400', dm.cents, 140000);
  check('two priced, none unpriced', dm.pricedCount + '/' + dm.unpricedCount, '2/0');

  const tmi = D.targetMonthlyIncome(h, TABLES);
  checkTrue('the target computes', Money.isOk(tmi), tmi.reason);
  check('target monthly income = (3,150 + 1,400) × 1.3 = $5,915', tmi.value, 591500);
  check('the pad is $1,365', tmi.bufferCents, 136500);
  check('… spending carried', tmi.expensesCents, 315000);
  check('… dreams carried', tmi.dreamsCents, 140000);
  check('… the multiplier carried', tmi.bufferMultiplier, 1.3);
  checkTrue('… a dream is priced', tmi.noDreamPriced === false);

  const g = D.gap(h, TABLES);
  checkTrue('the gap computes', Money.isOk(g), g.reason);
  check('gap = 5,915 − 4,860 = $1,055 short', g.value, 105500);
  checkTrue('… and it is short', g.short === true);
  check('… take-home carried', g.takeHomeMonthlyCents, 486000);
  check('zone: within 20% → watch', g.zone, 'watch');

  const hrs = D.hoursPerWeek(h, TABLES);
  checkTrue('the hours compute', Money.isOk(hrs), hrs.reason);
  check('64.9 hours a week for the target at $21.04/h', hrs.value, 64.9);
  check('… at the real rate', hrs.wageCents, 2104);
  check('… 53 hours a week now', hrs.hoursNow, 53);
  check('… 40 of them paid', hrs.paidHoursNow, 40);
  check('dream 1: 8.8 hours a week', hrs.perDream[0].hoursPerWeek, 8.8);
  check('dream 2: 6.6 hours a week', hrs.perDream[1].hoursPerWeek, 6.6);
  check('spending: 34.5 hours a week', hrs.expensesHours, 34.5);
  check('the pad: 15 hours a week', hrs.bufferHours, 15);
  check('the dreams: 1,400 × 12 ÷ 52 ÷ 21.04 = 15.4 hours a week', hrs.dreamsHours, 15.4);
  check('the same figure the draft constant gives, un-rounded', 591500 / 2104 / D.WEEKS_PER_MONTH, 64.87, 0.01);

  const hz = D.horizon(h, TABLES);
  check('six months', hz.months, 6);
  check('dream 1 over six months: $4,800', hz.dreams[0].overHorizonCents, 480000);
  check('dream 2 over six months: $3,600', hz.dreams[1].overHorizonCents, 360000);
  check('the dreams over six months: $8,400', hz.dreamsOverHorizonCents, 840000);
  check('the target over six months: $35,490', hz.targetOverHorizonCents, 3549000);

  const p = D.picture(h, TABLES);
  checkTrue('the picture is the target', Money.isOk(p) && p.value === 591500);
  check('… with the zone', p.zone, 'watch');
  check('… and the slots named: a kind’s label, else "Dream N"', p.dreams.map(d => d.name).join('|'), 'Travel|Dream 2');
  checkTrue('… no key named status leaks into the extras', Object.keys(p).filter(k => k === 'status').length === 1);

  section('Dreamline — the zones');

  /* Target $5,915: good at ≥ $5,915, watch down to 0.8 × 5,915 = $4,732, out below. */
  check('take-home at the target → good', D.zone(591500, 591500), 'good');
  check('take-home above the target → good', D.zone(591500, 700000), 'good');
  check('take-home at 80% of the target → watch', D.zone(591500, 473200), 'watch');
  check('take-home a dollar under 80% → out', D.zone(591500, 473100), 'out');
  check('no take-home → no zone', D.zone(591500, null), null);
  const rich = robin(two);
  rich.people[0].incomeSources[0].grossAnnualIncomeCents = 12000000;
  /* $120,000 at the table's rate for that band; whatever it is, take-home
     a month is well over $5,915, so the gap is negative and the zone good. */
  const rg = D.gap(rich, TABLES);
  checkTrue('a big income → to spare, good', Money.isOk(rg) && rg.value < 0 && rg.short === false && rg.zone === 'good', JSON.stringify(rg));

  section('Dreamline — edge cases');

  /* No dreams: target = spending × 1.3 = 3,150 × 1.3 = $4,095, and the note. */
  const none = D.targetMonthlyIncome(robin([]), TABLES);
  check('no dreams → target = spending × 1.3 = $4,095', none.value, 409500);
  checkTrue('… flagged "no dream priced"', none.noDreamPriced === true && none.pricedCount === 0);
  check('… the pad is $945', none.bufferCents, 94500);
  check('… the chart-able dreams total is zero, not missing', none.dreamsCents, 0);

  /* A named but unpriced dream counts, it does not sum. */
  const named = D.targetMonthlyIncome(robin(D.withSlot([], 3, { label: 'sabbatical' })), TABLES);
  check('a named, unpriced dream leaves the target at spending × 1.3', named.value, 409500);
  check('… and is counted as unpriced', named.unpricedCount + '/' + named.pricedCount, '1/0');
  checkTrue('… still "no dream priced"', named.noDreamPriced === true);

  /* No wage: the hours are absent and say why; the target still shows. */
  const noHours = robin(two);
  noHours.people[0].work.contractedHoursPerWeek = null;
  const nh = D.picture(noHours, TABLES);
  checkTrue('no paid hours → the target still shows', Money.isOk(nh) && nh.value === 591500);
  checkTrue('… the hours are incomplete and name the paid hours', !Money.isOk(nh.hours) && /paid for/.test(nh.hours.reason));
  checkTrue('… the gap is still there', Money.isOk(nh.gap) && nh.gap.value === 105500);
  checkTrue('… the zone still reads from the gap', nh.zone === 'watch');

  /* Take-home missing: spending but no income → the gap is incomplete, the
     target is not. */
  const noIncome = Schema.createHousehold({
    people: [Schema.createPerson({ id: 'p', role: 'adult', employmentStatus: 'employed' })],
    expenses: { monthlyEssential: { estimatedValueCents: 315000 } },
    dreams: two
  });
  const ni = D.picture(noIncome, TABLES);
  checkTrue('no income → the target still shows', Money.isOk(ni) && ni.value === 591500);
  checkTrue('… the gap is incomplete and says so', !Money.isOk(ni.gap) && /income/i.test(ni.gap.reason));
  checkTrue('… the hours are incomplete too', !Money.isOk(ni.hours));
  check('… and there is no zone', ni.zone, null);

  /* No spending: nothing to price. */
  const noSpend = Schema.createHousehold({ people: [Schema.createPerson({ id: 'p', role: 'adult', employmentStatus: 'employed' })], dreams: two });
  const ns = D.picture(noSpend, TABLES);
  checkTrue('no spending → incomplete, naming monthlyExpenses', !Money.isOk(ns) && ns.missing.indexOf('monthlyExpenses') >= 0);

  /* Empty and null households: a reason, never a throw. */
  let threw = false, empty;
  try { empty = D.picture(Schema.createHousehold({}), TABLES); } catch (e) { threw = true; }
  checkTrue('an empty household says why instead of throwing', !threw && !Money.isOk(empty) && /spending/.test(empty.reason));
  threw = false;
  try { D.picture(null, TABLES); D.hoursPerWeek(null, TABLES); D.gap(null, TABLES); D.horizon(null, TABLES); D.dreamsMonthlyCents(null); } catch (e) { threw = true; }
  checkTrue('a null household does not throw either', !threw);
  threw = false;
  try { empty = D.picture(Schema.createHousehold({}), null); } catch (e) { threw = true; }
  checkTrue('no tables → still no throw', !threw);

  /* The guesses on an empty spine: spending and income are filled, hours
     are not, so the target shows and the hours wait for Real Hourly Wage. */
  const guessed = D.picture(Gate.fillGuesses(Schema.createHousehold({}), TABLES, null), TABLES);
  checkTrue('with the intake’s guesses the target renders', Money.isOk(guessed) && guessed.value > 0);
  checkTrue('… and the hours wait for paid hours', !Money.isOk(guessed.hours));

  section('Dreamline — the slots');

  const s1 = D.withSlot([], 1, { monthlyCents: 80000 });
  check('slot 1 gets the stable id dream_1', s1[0].id, 'dream_1');
  check('… priced $800', s1[0].monthlyCents, 80000);
  check('… unnamed', s1[0].label, null);
  const s2 = D.withSlot(s1, 4, { monthlyCents: 15000 });
  check('slot 4 lands after slot 1', s2.map(d => d.id).join(','), 'dream_1,dream_4');
  const s3 = D.withSlot(s2, 2, { monthlyCents: 60000 });
  check('slot 2 lands between them, in slot order', s3.map(d => d.id).join(','), 'dream_1,dream_2,dream_4');
  const s4 = D.withSlot(s3, 1, { label: 'travel' });
  check('naming a slot keeps its price', s4[0].monthlyCents + ':' + s4[0].label, '80000:travel');
  const s5 = D.withSlot(s4, 1, { monthlyCents: 90000 });
  check('repricing a slot keeps its kind', s5[0].monthlyCents + ':' + s5[0].label, '90000:travel');
  check('… and does not duplicate it', s5.length, 3);
  const s6 = D.withSlot(s5, 1, { monthlyCents: null });
  check('a dream typed blank removes the slot, kind and all', s6.map(d => d.id).join(','), 'dream_2,dream_4');
  const s7 = D.withSlot(s6, 5, { label: 'gift' });
  check('a kind alone makes an unpriced slot', s7[2].id + ':' + s7[2].monthlyCents + ':' + s7[2].label, 'dream_5:null:gift');
  const s8 = D.withSlot(s7, 5, { label: null });
  check('clearing the kind of an unpriced slot removes it', s8.map(d => d.id).join(','), 'dream_2,dream_4');
  check('clearing the kind of a priced slot keeps it', D.withSlot(s5, 1, { label: null })[0].monthlyCents, 90000);
  checkTrue('withSlot never mutates its input', s5.length === 3 && s5[0].monthlyCents === 90000);
  check('slot() finds a slot by number', D.slot({ dreams: s5 }, 4).monthlyCents, 15000);
  check('… and null for an empty one', D.slot({ dreams: s5 }, 3), null);
  check('slotName: the kind’s label', D.slotName(s5[0], 1), 'Travel');
  check('slotName: "Dream N" when unnamed', D.slotName(s5[1], 2), 'Dream 2');
  check('five slots', D.SLOTS, 5);
  check('six kinds, each an [id, label]', D.KINDS.length + '/' + D.KINDS.every(k => k.length === 2 && typeof k[0] === 'string'), '6/true');

  /* Through the schema: a dream round-trips as createDream's shape. */
  const viaSchema = Schema.createHousehold({ dreams: s5 }).dreams;
  check('the schema keeps the ids', viaSchema.map(d => d.id).join(','), 'dream_1,dream_2,dream_4');
  check('… and the prices', viaSchema[0].monthlyCents, 90000);
  checkTrue('… as createDream shapes', Object.keys(viaSchema[0]).sort().join(',') === 'id,label,monthlyCents');

  /* Through the spine: Spine.set('dreams', …) is what the room writes. */
  Spine.reset();
  Spine.registerRoom('dreamline');
  Spine.batch('Dream 1, a month → $800', function () { Spine.set('dreams', D.withSlot(D.dreams(Spine.getProfile()), 1, { monthlyCents: 80000 })); });
  check('the spine holds the slot', Spine.getProfile().dreams[0].id + ':' + Spine.getProfile().dreams[0].monthlyCents, 'dream_1:80000');
  check('the undo entry names the slot', Spine.peekUndo().label, 'Dream 1, a month → $800');
  const own = Ownership.describe('dreamsMonthly', Spine.getProfile(), 'dreamline');
  checkTrue('the ownership row reads it, owned here', own && own.isSet && own.result.value === 80000 && own.isOwnHere);
  Spine.batch('Dream 1, a month → —', function () { Spine.set('dreams', D.withSlot(D.dreams(Spine.getProfile()), 1, { monthlyCents: null })); });
  check('blank through the spine removes it', Spine.getProfile().dreams.length, 0);
  checkTrue('… and the ownership row goes incomplete', !Ownership.describe('dreamsMonthly', Spine.getProfile(), 'dreamline').isSet);
  Spine.reset();

  section('Dreamline — the room and the registry');

  const room = Registry.byId('dreamline');
  checkTrue('registered', !!room && room.href === 'rooms/dreamline.html');
  check('requires the hours branch', Registry.requires('dreamline').join(','), 'hours');
  ['employed', 'selfEmployed', 'mixed', 'student'].forEach(function (s) {
    const hh = Schema.createHousehold({ people: [Schema.createPerson({ id: 'p', role: 'adult', employmentStatus: Gate.byId(s).status })] });
    checkTrue('the hours branch exists for ' + s, Gate.exists(hh, 'hours'));
  });
  ['retired', 'betweenJobs'].forEach(function (s) {
    const hh = Schema.createHousehold({ people: [Schema.createPerson({ id: 'p', role: 'adult', employmentStatus: Gate.byId(s).status })] });
    checkTrue('… and not for ' + s, !Gate.exists(hh, 'hours'));
  });
  check('the ownership row is owned by this room at its inputs', Ownership.field('dreamsMonthly').owner + '#' + Ownership.field('dreamsMonthly').anchor, 'dreamline#inputs');

  const html = fs.readFileSync(path.join(ROOT, 'rooms/dreamline.html'), 'utf8');
  checkTrue('the page mounts the template', /Room\.mount\(\{/.test(html) && /id: 'dreamline'/.test(html));
  ['room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list', 'room-standalone', 'load-notice'].forEach(function (id) {
    checkTrue('… host #' + id, html.indexOf('id="' + id + '"') >= 0);
  });
  (room.subsections || []).forEach(function (s) {
    checkTrue('… deep link #' + s.id, html.indexOf('id="' + s.id + '"') >= 0);
  });
  checkTrue('… declares its live-form discipline and a place for a theme', /LIVE-FORM: built once/.test(html) && /THEMING:/.test(html));
  checkTrue('… loads the engine after hourly and before the template', html.indexOf('engines/hourly.js') < html.indexOf('engines/dreamline.js') && html.indexOf('engines/dreamline.js') < html.indexOf('shared/room.js'));
  checkTrue('… writes only through Spine.set(\'dreams\', …)', (html.match(/Spine\.set\(/g) || []).length === 1 && /Spine\.set\('dreams'/.test(html) && !/upsertPerson|updateProfile/.test(html));
  checkTrue('… reads spending and income as chips', /reads: \['monthlyExpenses', 'grossAnnualIncome'\]/.test(html));
  checkTrue('… one stacked chart', (html.match(/Charts\.(stacked|bars|donut|area)\(/g) || []).length === 2 && !/Charts\.(bars|donut|area)\(/.test(html));
  checkTrue('… the scope line', /does not plan the dreams or find the hours/.test(html));
  checkTrue('… no real financial data: the placeholders are round example figures', /e\.g\. /.test(html) && !/\$\d{2,3},\d{3}/.test(html));
};
