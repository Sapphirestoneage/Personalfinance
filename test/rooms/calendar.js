/* test/rooms/calendar.js — Money Calendar & Pay-Later: one month, a day at a time. D-121. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Registry, Ownership, Tier0, TABLES } = t;
  const Cal = require(path.join(ROOT, 'engines/calendar.js'));
  section('Money Calendar & Pay-Later (D-121): the low point');

  const T = TABLES;
  /* Start on the 1st of a 30-day month, so the hand walk is short. */
  const NOW = Date.parse('2026-09-01T12:00:00');
  function hh(extra) {
    const h = Schema.createHousehold(Object.assign({ state: 'NC', filingStatus: 'single', meta: { hasDebt: false },
      people: [Schema.createPerson({ id: 'p1', role: 'adult', employmentStatus: 'employed', incomeSources: [Schema.createIncomeSource({ id: 'i1', personId: 'p1', grossAnnualIncomeCents: 3000000 })] })],
      assets: [Schema.createAsset({ id: 'a1', category: 'cash', valueCents: 50000, liquid: true })],
      calendar: { cadence: 'semimonthly', nextPaydayDay: 5, bills: [{ id: 'rent', label: 'Rent', cents: 90000, day: 1 }] } }, extra || {}));
    h.expenses.monthlyEssential.estimatedValueCents = 180000;
    return h;
  }
  const h = hh();
  const take = Tier0.takeHomeMonthlyCents(h, T);
  checkTrue('the fixture has a take-home', Money.isOk(take));
  const r = Cal.month(h, T, { now: NOW });
  checkTrue('the month draws', Money.isOk(r), r.reason);
  const per = Math.round(take.value / 2);
  check('a payday is half the month’s take-home', r.perPaydayCents, per);
  check('the paydays are the 5th and the 20th', r.paydays.map(p => p.dom).join(','), '5,20');
  /* By hand: rent $900 on day 1, the other $900 spread over 30 days = $30 a day. */
  check('day 1: 500 − 900 − 30 = −430', r.days[0].balanceCents, 50000 - 90000 - 3000);
  check('day 2: −460', r.days[1].balanceCents, -46000);
  check('day 4: −520', r.days[3].balanceCents, -52000);
  check('day 5: −520 − 30 + a payday', r.days[4].balanceCents, -52000 - 3000 + per);
  check('day 6: a day of spending less', r.days[5].balanceCents, -52000 - 3000 + per - 3000);
  check('below zero from day 1', r.firstBelowDom, 1);
  check('the low point is day 4, −$520', r.lowCents + '/' + r.lowDom, '-52000/4');
  check('zone out', r.zone, 'out');
  check('a week of spending, from the month', r.weekCents, Math.round(180000 * 7 / (365.25 / 12)));
  check('the rest to spread is spending less the bills', r.restCents, 90000);
  check('31 days drawn', r.days.length, 31);

  /* Flush: enough cash that the month never dips under a week. */
  const rich = hh({ assets: [Schema.createAsset({ id: 'a1', category: 'cash', valueCents: 1000000, liquid: true })] });
  const rr = Cal.month(rich, T, { now: NOW });
  check('with $10,000 of cash the zone is good', rr.zone, 'good');
  checkTrue('… and there is no tight stretch', rr.tight === null);

  /* Cadences and days. */
  check('semimonthly pair of the 1st is the 1st and the 16th', Cal.semimonthlyPair(1, 15).join(','), '1,16');
  check('… of the 20th, the 20th and the 5th', Cal.semimonthlyPair(20, 15).join(','), '20,5');
  const monthly = Cal.month(hh({ calendar: { cadence: 'monthly', nextPaydayDay: 31, bills: [] } }), T, { now: NOW });
  check('a payday on the 31st in a 30-day month lands on the 30th', monthly.paydays[0].dom, 30);
  check('… once in the window', monthly.paydays.length, 1);
  const weekly = Cal.month(hh({ calendar: { cadence: 'weekly', nextPaydayDay: 3, bills: [] } }), T, { now: NOW });
  check('weekly from the 3rd: the 3rd, 10th, 17th, 24th, and the 1st of next month', weekly.paydays.map(p => p.dom).join(','), '3,10,17,24,1');
  check('… each a 52 ÷ 12 share of the month', weekly.perPaydayCents, Math.round(take.value / (52 / 12)));

  /* Bills ahead land this month; behind, next month within the window. */
  const late = Cal.month(hh({ calendar: { cadence: 'monthly', nextPaydayDay: 5, bills: [{ id: 'b', label: 'Car', cents: 30000, day: 25 }] } }), T, { now: Date.parse('2026-09-10T12:00:00') });
  check('a bill on the 25th, from the 10th, lands on the 25th', late.bills[0].firstDom, 25);
  const behind = Cal.month(hh({ calendar: { cadence: 'monthly', nextPaydayDay: 5, bills: [{ id: 'b', label: 'Car', cents: 30000, day: 3 }] } }), T, { now: Date.parse('2026-09-10T12:00:00') });
  check('a bill on the 3rd, from the 10th, lands next month', behind.bills[0].firstDate, '2026-10-03');
  const bnpl = Cal.month(hh({ calendar: { cadence: 'monthly', nextPaydayDay: 5, bills: [], payLater: [{ id: 'x', label: 'Shoes', cents: 12000, dueDay: 14, instalmentsLeft: 2 }, { id: 'y', label: 'Done', cents: 5000, dueDay: 15, instalmentsLeft: 0 }] } }), T, { now: NOW });
  check('a pay-later instalment counts on its day', bnpl.payLater.length + '/' + bnpl.payLater[0].firstDom, '1/14');
  check('… one with no instalments left is ignored', bnpl.payLaterCents, 12000);
  const over = Cal.month(hh({ calendar: { cadence: 'monthly', nextPaydayDay: 5, bills: [{ id: 'b', label: 'Big', cents: 200000, day: 1 }] } }), T, { now: NOW });
  checkTrue('bills over the spending: nothing left to spread, flagged', over.billsExceedSpending === true && over.restCents === 0);

  /* Edge cases and reasons. */
  checkTrue('no cadence → how often are you paid', /How often/.test(Cal.month(hh({ calendar: { cadence: null } }), T).reason));
  checkTrue('no payday → which day', /Which day/.test(Cal.month(hh({ calendar: { cadence: 'monthly', nextPaydayDay: null } }), T).reason));
  checkTrue('no cash → says so', !Money.isOk(Cal.month(hh({ assets: [] }), T)));
  checkTrue('an empty household does not throw', (function () { try { Cal.month(Schema.createHousehold({}), T); Cal.month(null, T); return true; } catch (e) { return false; } })());
  check('rent from Housing Decision wins', Cal.rentCents(hh({ housing: { rentMonthlyCents: 150000 } })).cents, 150000);
  check('… else 30% of a month of gross', Cal.rentCents(hh()).cents, Math.round(3000000 / 12 * 0.3));
  checkTrue('… and none when Start Here says no rent', Cal.rentCents(hh({ meta: { noRent: true } })).cents === null);
  check('the chart points are one a day', Cal.balancePoints(r).length, 31);

  /* The month as a grid (D-127): rows of seven from Sunday, padded so a
     day sits under its weekday; each cell says what lands and where the
     cash stands. 2026-09-01 is a Tuesday: two blanks first. */
  const w = Cal.weeks(r);
  check('the grid has five rows for 31 days from a Tuesday', w.length, 5);
  check('the first row is padded to the weekday', w[0].slice(0, 2).join(','), ',');
  check('the first day is the 1st, a Tuesday', w[0][2].dom + '/' + w[0][2].weekday, '1/Tue');
  check('every row is seven wide', w.every(row => row.length === 7), true);
  check('the last row is padded at the end', w[4].filter(c => c === null).length, 7 - ((31 + 2) % 7 || 7));
  const day1 = w[0][2], day5 = w[0][6];
  check('day 1 carries the rent as a bill', day1.bills.length + '/' + day1.bills[0].label + '/' + day1.outCents, '1/Rent/90000');
  check('day 1 is the first of its month and today', day1.firstOfMonth + '/' + day1.today, 'true/true');
  check('day 5 is a payday', day5.inCents, per);
  check('the low point is marked once', w.flat().filter(c => c && c.isLow).map(c => c.dom).join(','), '4');
  checkTrue('days under zero are marked', w.flat().filter(c => c && c.belowZero).length > 0);
  check('the cells carry the balance the day ends on', day1.balanceCents, r.days[0].balanceCents);
  check('an incomplete month has no grid', Cal.weeks(Money.incomplete('x', [])).length, 0);


  /* The table, the page, the map. */
  const conv = T.calendarConventions;
  check('four cadences', Object.keys(conv.cadences).length, 4);
  check('fortnightly is 26 ÷ 12 paydays a month', Math.round(conv.cadences.fortnightly.paydaysPerMonth * 1000) / 1000, Math.round(26 / 12 * 1000) / 1000);
  const page = fs.readFileSync(path.join(ROOT, 'rooms/calendar.html'), 'utf8');
  checkTrue('the page draws the grid under the line', /cal-grid/.test(page) && /Cal\.weeks\(/.test(page));
  checkTrue('the page mounts the template as calendar', /Room\.mount\(\{/.test(page) && /id: 'calendar'/.test(page));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading', 'room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list'].forEach(id => checkTrue(`… has #${id}`, new RegExp('id="' + id + '"').test(page)));
  checkTrue('… five inputs and two folded', ['cadence', 'nextPaydayDay', 'rentDay', 'bigCents', 'bigDay', 'plCents', 'plDay'].every(c => new RegExp("ctl: '" + c + "'").test(page)));
  checkTrue('… writes only calendar.*', (page.match(/Spine\.set\('([a-zA-Z.]+)'/g) || []).every(m => /calendar\./.test(m)));
  check('the cadence is owned here', Ownership.field('payCadence').owner, 'calendar');
  checkTrue('the room is for everyone', Registry.requires('calendar').length === 0);
};
