/* test/rooms/career-move.js — the Career Move room (D-099).
   Hand-derived numbers as literals; nothing copied from engine output. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Demo, Registry, Ownership, Gate, Hourly, TABLES } = t;
  const CareerMove = require(path.join(ROOT, 'engines/careermove.js'));
  const T = TABLES;

  function withOffer(h, o) {
    h.career = { offer: Object.assign({ grossAnnualCents: null, hoursPerWeek: null, commuteHoursPerWeek: null, workCostsMonthlyCents: null, signOnCents: null }, o || {}) };
    return h;
  }

  section('Career Move — the worked case, by hand');

  /* Robin (the demo persona, single): $72,000 over 40 paid hours × 48 weeks,
     plus 3 unpaid overtime + 5 commuting + 2.5 getting ready + 2.5
     decompressing = 53 h a week, and $400/mo of costs of working.
       tax     72,000 × 0.19 (single, ≤ 75,000)          = 13,680
       kept    72,000 − 13,680 − 4,800                   = 53,520
       real    53,520 / (53 × 48 = 2,544 h)              = $21.04/h   (2104)
       paper   72,000 / (40 × 48 = 1,920 h)              = $37.50/h   (3750)
     The offer: $80,000 at 40 h, 0 commute, $100/mo costs; the 3 + 2.5 + 2.5
     unpaid hours carry over, so 48 h a week.
       tax     80,000 × 0.21 (single, ≤ 100,000)         = 16,800
       kept    80,000 − 16,800 − 1,200                   = 62,000
       real    62,000 / (48 × 48 = 2,304 h)              = $26.91/h   (2691)
       paper   80,000 / 1,920                            = $41.67/h   (4167)
     difference an hour  26.91 − 21.04                   = +$5.87/h   (587)
     kept a year, more   62,000 − 53,520                 = $8,480
     take-home a year    now 72,000 − 13,680 = 58,320; offer 80,000 − 16,800 = 63,200
     FI move: FI number 3,150 × 12 / 0.04 = 945,000; investments 48,000; real
     return 5%; savings excluding the match on both sides:
       now    72,000 − 37,800 − 13,680 = 20,520 a year
       offer  80,000 − 37,800 − 16,800 = 25,400 a year
     The years to 945,000 are derived below by an explicit loop, fractional
     within the crossing year, the way the lens reads it. */
  const h = withOffer(Demo.build(), { grossAnnualCents: 8000000, hoursPerWeek: 40, commuteHoursPerWeek: 0, workCostsMonthlyCents: 10000 });
  const r = CareerMove.compare(h, T);
  checkTrue('the worked case computes', Money.isOk(r), r.reason);
  check('now, really: $21.04/h (the Real Hourly Wage figure)', r.now.realHourlyCents, 2104);
  check('now, on paper: $37.50/h', r.now.nominalHourlyCents, 3750);
  check('now, kept a year: $53,520', r.now.keptAnnualCents, 5352000);
  check('the offer, tax: $16,800', r.offer.estimatedTaxCents, 1680000);
  check('the offer, costs a year: $1,200', r.offer.annualWorkCostsCents, 120000);
  check('the offer, kept a year: $62,000', r.offer.keptAnnualCents, 6200000);
  check('the offer, hours a week: 48 (unpaid 8 carried)', r.offer.totalHoursPerWeek, 48);
  check('the offer, really: $26.91/h within $0.02', r.offer.realHourlyCents, 2691, 2);
  check('the offer, on paper: $41.67/h', r.offer.nominalHourlyCents, 4167, 1);
  check('the real difference an hour: +$5.87/h within $0.02', r.value, 587, 2);
  check('… and it is the value', r.differenceHourlyCents, r.value);
  check('kept a year, more: $8,480', r.keptDifferenceAnnualCents, 848000);
  check('take-home a year, now: $58,320', r.now.takeHomeAnnualCents, 5832000);
  check('take-home a year, offer: $63,200', r.offer.takeHomeAnnualCents, 6320000);
  check('take-home a month, now: $4,860', r.now.takeHomeMonthlyCents, 486000);
  check('take-home difference a year: $4,880', r.takeHomeDifferenceAnnualCents, 488000);
  check('the offer takes 5 hours a week fewer', r.hoursDifferencePerWeek, -5);
  check('the same function priced both: the current side equals Hourly on the household', r.now.realHourlyCents, Hourly.realHourlyWage(Demo.build(), T, {}).realHourlyCents);

  /* The FI move, by an explicit loop rather than the projection engine. */
  const FIRE = 94500000, START = 4800000, RATE = 0.05;
  function yearsTo(start, contribution) {
    let b = start;
    for (let y = 1; y <= 100; y++) { const before = b; b = b * (1 + RATE) + contribution; if (b >= FIRE) return (y - 1) + (FIRE - before) / (b - before); }
    return null;
  }
  const yNow = yearsTo(START, 2052000), yOff = yearsTo(START, 2540000);
  checkTrue('FI, now: a little over 22 years', yNow > 22 && yNow < 22.5, String(yNow));
  checkTrue('FI, offer: a little under 20 years', yOff > 19.5 && yOff < 20, String(yOff));
  checkTrue('the FI move computes', Money.isOk(r.fi), r.fi.reason);
  check('… savings on the now side, excluding the match: $20,520', r.fi.savingsNowCents, 2052000);
  check('… savings on the offer side: $25,400', r.fi.savingsOfferCents, 2540000);
  check('… years now, within a day', r.fi.yearsNow, yNow, 1 / 365);
  check('… years with the offer, within a day', r.fi.yearsOffer, yOff, 1 / 365);
  check('… FI ' + Math.round((yNow - yOff) * 12) + ' months sooner', r.fiMonthsSooner, Math.round((yNow - yOff) * 12));
  checkTrue('… which is thirty months, give or take one', Math.abs(r.fiMonthsSooner - 30) <= 1, String(r.fiMonthsSooner));

  /* A $5,000 sign-on: 5,000 × (1 − 0.21) = $3,950 into investments in
     year one on the offer side. */
  const s = CareerMove.compare(withOffer(Demo.build(), { grossAnnualCents: 8000000, hoursPerWeek: 40, commuteHoursPerWeek: 0, workCostsMonthlyCents: 10000, signOnCents: 500000 }), T);
  check('sign-on $5,000 is read', s.offer.signOnCents, 500000);
  check('… $3,950 after tax at the offer’s rate', s.offer.signOnNetCents, 395000);
  check('… years with the offer and the sign-on, within a day', s.fi.yearsOffer, yearsTo(START + 395000, 2540000), 1 / 365);
  checkTrue('… which brings FI a little sooner still', s.fiMonthsSooner > r.fiMonthsSooner, s.fiMonthsSooner + ' vs ' + r.fiMonthsSooner);
  check('… and does not touch the hourly difference', s.value, r.value);

  section('Career Move — edge cases');

  /* No offer: incomplete, with a reason that says what to add. */
  const none = CareerMove.compare(Demo.build(), T);
  check('no offer → incomplete', none.status, 'incomplete');
  checkTrue('… saying to add the offer', /Add the offer/.test(none.reason));
  check('… naming the field', none.missing[0], 'offer.grossAnnualCents');
  check('an offer of $0 is refused, not divided', CareerMove.compare(withOffer(Demo.build(), { grossAnnualCents: 0 }), T).status, 'incomplete');

  /* Fewer hours and lower pay can still win an hour: $60,000 at 30 h, no
     commute, no costs.
       tax   60,000 × 0.19 = 11,400 ; kept 48,600 ; hours (30 + 8) × 48 = 1,824
       real  48,600 / 1,824 = $26.64/h  > $21.04/h, while kept a year is
       48,600 − 53,520 = −$4,920. */
  const low = CareerMove.compare(withOffer(Demo.build(), { grossAnnualCents: 6000000, hoursPerWeek: 30, commuteHoursPerWeek: 0, workCostsMonthlyCents: 0 }), T);
  check('$60,000 at 30 h: really $26.64/h', low.offer.realHourlyCents, 2664, 1);
  check('… wins the hour by $5.60', low.value, 560, 2);
  check('… while keeping $4,920 a year less', low.keptDifferenceAnnualCents, -492000);
  checkTrue('… and FI moves later', low.fiMonthsSooner < 0, String(low.fiMonthsSooner));
  check('… costs typed as 0 are a zero, not carried', low.offer.annualWorkCostsCents, 0);
  check('… the sources say so', low.sources.costs + '/' + low.sources.commute + '/' + low.sources.hours, 'offer/offer/offer');

  /* Commute 0 is a zero; commute blank carries the current 5 h. */
  const blankCommute = CareerMove.compare(withOffer(Demo.build(), { grossAnnualCents: 8000000, hoursPerWeek: 40, workCostsMonthlyCents: 10000 }), T);
  check('commute blank → carries the current 5 h (53 h a week)', blankCommute.offer.totalHoursPerWeek, 53);
  check('… and says it is carried', blankCommute.sources.commute, 'current');
  check('… costs blank carry the current $400/mo', CareerMove.compare(withOffer(Demo.build(), { grossAnnualCents: 8000000 }), T).offer.annualWorkCostsCents, 480000);
  check('commute 0 → 48 h a week', r.offer.totalHoursPerWeek, 48);

  /* Hours blank: the current job's 40, then a standard week. */
  const blankHours = CareerMove.compare(withOffer(Demo.build(), { grossAnnualCents: 8000000 }), T);
  check('hours blank → the current job’s 40', blankHours.offer.paidHoursPerWeek + '/' + blankHours.sources.hours, '40/current');
  const nh = withOffer(Demo.build(), { grossAnnualCents: 8000000 }); nh.people[0].work.contractedHoursPerWeek = null;
  const noNow = CareerMove.compare(nh, T);
  check('current hours missing → the offer falls back to a standard week', CareerMove.offerWork(nh, CareerMove.offerOf(nh)).work.contractedHoursPerWeek + '/' + CareerMove.offerWork(nh, CareerMove.offerOf(nh)).sources.hours, '40/convention');
  check('… the comparison is incomplete', noNow.status, 'incomplete');
  checkTrue('… saying the current job’s hours are not in', /current job’s hours are not in/.test(noNow.reason));
  checkTrue('… and still carries the offer’s rate', noNow.offer && noNow.offer.realHourlyCents > 0, JSON.stringify(noNow.offer && noNow.offer.realHourlyCents));
  /* $80,000 − 16,800 − 4,800 (costs carried) = 58,400 over (40 + 5 + 8) × 48 = 2,544 h = $22.96/h */
  check('… at $22.96/h (costs and commute carried, unpaid hours carried, a standard week)', noNow.offer.realHourlyCents, 2296, 1);

  /* Sign-on only: no gross → incomplete; the sign-on is not a comparison. */
  check('sign-on only → incomplete', CareerMove.compare(withOffer(Demo.build(), { signOnCents: 500000 }), T).status, 'incomplete');

  /* Empty household: an incomplete Result with a reason, never a throw. */
  let empty;
  try { empty = CareerMove.compare(Schema.createHousehold({}), T); } catch (e) { empty = { threw: e.message }; }
  checkTrue('empty household → incomplete, no throw', empty && empty.status === 'incomplete', empty && empty.threw);
  checkTrue('… with a reason', typeof empty.reason === 'string' && empty.reason.length > 0);
  let emptyOffer;
  try { emptyOffer = CareerMove.compare(withOffer(Schema.createHousehold({}), { grossAnnualCents: 8000000 }), T); } catch (e) { emptyOffer = { threw: e.message }; }
  checkTrue('empty household with an offer → incomplete, no throw', emptyOffer && emptyOffer.status === 'incomplete', emptyOffer && emptyOffer.threw);
  checkTrue('… no missing table throws either', (function () { try { return CareerMove.compare(h, {}).status === 'ok' || CareerMove.compare(h, {}).status === 'incomplete'; } catch (e) { return false; } })());
  checkTrue('… no result carries a status key in its extras', Object.keys(r).filter(k => k === 'status').length === 1 && r.status === 'ok');

  /* The offer household is a copy: nothing on the real one moves. */
  const before = JSON.stringify(h);
  CareerMove.compare(h, T);
  check('compare() writes nothing', JSON.stringify(h), before);
  const side = CareerMove.offerHousehold(h, CareerMove.offerOf(h));
  check('… the copy pays the offer', Schema.grossAnnualIncomeCents(side).value, 8000000);
  check('… as the same job (same source id)', side.people[0].incomeSources[0].id, h.people[0].incomeSources[0].id);
  check('… and the household still pays $72,000', Schema.grossAnnualIncomeCents(h).value, 7200000);

  /* Mixed: the own work stays on both sides. */
  const mixed = withOffer(Demo.build(), { grossAnnualCents: 8000000, hoursPerWeek: 40, commuteHoursPerWeek: 0, workCostsMonthlyCents: 10000 });
  mixed.people[0].employmentStatus = 'both';
  mixed.people[0].incomeSources.push(Schema.createIncomeSource({ id: 'own', personId: mixed.people[0].id, type: '1099', grossAnnualIncomeCents: 1000000 }));
  const m = CareerMove.compare(mixed, T);
  check('mixed: the offer side keeps the own work ($90,000)', m.offer.grossAnnualCents, 9000000);
  check('… and the now side has both ($82,000)', m.now.grossAnnualCents, 8200000);

  section('Career Move — the room on the template');

  const html = fs.readFileSync(path.join(ROOT, 'rooms/career-move.html'), 'utf8');
  checkTrue('rooms/career-move.html mounts on the template', /Room\.mount\(\{/.test(html) && /id: 'career-move'/.test(html));
  ['room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list', 'room-standalone', 'load-notice']
    .forEach(id => checkTrue('… host #' + id, html.indexOf('id="' + id + '"') !== -1));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading'].forEach(id => checkTrue('… section #' + id, html.indexOf('id="' + id + '"') !== -1));
  const tag = f => html.indexOf('<script src="../' + f + '"></script>');
  checkTrue('… loads the engine after hourly and before the lens', tag('engines/hourly.js') !== -1 && tag('engines/hourly.js') < tag('engines/careermove.js') && tag('engines/careermove.js') < tag('shared/lens.js'));
  checkTrue('… is not the stub', html.indexOf('STUB') === -1 && html.indexOf('Hourly.realHourlyWage') === -1);
  checkTrue('… declares LIVE-FORM: built once', html.indexOf('LIVE-FORM: built once') !== -1);
  ['grossAnnualCents', 'hoursPerWeek', 'commuteHoursPerWeek', 'workCostsMonthlyCents', 'signOnCents']
    .forEach(k => checkTrue('… writes career.offer.' + k + ' through Spine.set', html.indexOf("Spine.set('career.offer." + k + "'") !== -1));
  checkTrue('… and nothing else', (html.match(/Spine\.set\(/g) || []).length === 5 && !/upsertPerson|upsertAsset|updateProfile/.test(html));
  checkTrue('… reads the four chips', /reads: \['grossAnnualIncome', 'filingStatus', 'monthlyExpenses', 'investments'\]/.test(html));
  checkTrue('… one bars chart', /Charts\.bars\(/.test(html) && !/Charts\.(area|donut|stacked)\(/.test(html));
  checkTrue('… proposes the current hours or a standard week', /your current hours/.test(html) && /a standard week \(convention\)/.test(html));
  checkTrue('… and the scope line says what it does not do', /scope: 'This room does not weigh benefits, equity, growth/.test(html));
  checkTrue('… why: employed, selfEmployed, mixed, student say something; betweenJobs and retired do not', /employed: '.+'/.test(html) && /selfEmployed: '.+Self-Employed room/.test(html) && /mixed: '.+'/.test(html) && /student: '.+'/.test(html) && /betweenJobs: '', retired: ''/.test(html));

  const room = Registry.byId('career-move');
  checkTrue('the registry row exists', !!room && room.href === 'rooms/career-move.html');
  function situ(status) {
    return Schema.createHousehold({ people: [Schema.createPerson({ id: 'p', role: 'adult', employmentStatus: status, incomeSources: [Schema.createIncomeSource({ id: 'i', personId: 'p', grossAnnualIncomeCents: 5000000 })] })] });
  }
  check('… appears for employed, self-employed, student and mixed', Gate.SITUATIONS.filter(s => Registry.applies(room, situ(s.status))).map(s => s.id).join(','), 'employed,selfEmployed,student,mixed');
  check('… the five writes are owned here', ['offerGross', 'offerHours', 'offerCommute', 'offerCosts', 'offerSignOn'].map(f => Ownership.field(f).owner).join(','), 'career-move,career-move,career-move,career-move,career-move');
  check('… anchored at the inputs', ['offerGross', 'offerHours', 'offerCommute', 'offerCosts', 'offerSignOn'].map(f => Ownership.field(f).anchor).join(','), 'inputs,inputs,inputs,inputs,inputs');
  check('… and the chip reads the offer once written', Ownership.field('offerGross').read(h).value, 8000000);
  checkTrue('… the schema normalises the offer', Schema.createHousehold({ career: { offer: { grossAnnualCents: 8000000 } } }).career.offer.signOnCents === null);
};
