/* ==========================================================================
   parnassah/engines/plan.js, the whole picture. PN-009.
   --------------------------------------------------------------------------
   Take-home in, then tuition, the year's calendar, tzedakah, the house, the
   simchas' set-aside and retirement out, and what is left for everything
   else. The checklist says what is in place. The decade view lays every
   tuition year beside the retirement saving, and says what the freed
   tuition could grow to by the older parent's 65th birthday.

     Plan.picture(h, T, opts) -> Result
       value: { takeHomeAnnualCents, steps: [{ id, label, cents, status }], leftCents, leftShare,
                checklist: [{ id, label, state: 'done' | 'short' | 'unknown', detail }],
                decade: [{ year, tuitionCents, retirementCents }], freed: {...} | null,
                parts: { tuition, calendar, tzedakah, home, milestones } (each engine's Result) }
   ========================================================================== */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { Money: require('../shared/money.js'), Tuition: require('./tuition.js'), JewishYear: require('./jewishyear.js'), Tzedakah: require('./tzedakah.js'), Milestones: require('./milestones.js'), Home: require('./home.js') }
    : { Money: root.SLAF.Money, Tuition: root.SLAF.Tuition, JewishYear: root.SLAF.JewishYear, Tzedakah: root.SLAF.Tzedakah, Milestones: root.SLAF.Milestones, Home: root.SLAF.Home };
  var api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Plan = api; }
})(typeof self !== 'undefined' ? self : null, function (D) {
  'use strict';
  var Money = D.Money, ok = Money.ok, incomplete = Money.incomplete, entered = Money.isEntered;

  function futureValue(monthlyCents, annualRate, months) {
    var r = annualRate / 12;
    if (months <= 0) return 0;
    if (r === 0) return Math.round(monthlyCents * months);
    return Math.round(monthlyCents * ((Math.pow(1 + r, months) - 1) / r));
  }

  function picture(h, T, opts) {
    var o = opts || {};
    var take = h.household.takeHomeMonthlyCents;
    if (!entered(take)) return incomplete('Type the household\'s monthly take-home on the home page to draw the picture.', ['household.takeHomeMonthlyCents']);
    var takeAnnual = take * 12;
    var tuition = D.Tuition.plan(h, T, o);
    var calendar = D.JewishYear.calendar(h, T, o);
    var tzedakah = D.Tzedakah.owed(h, T, o);
    var milestones = D.Milestones.timeline(h, T, o);
    var home = D.Home.carry(h, T, { today: o.today, tuitionAnnualCents: Money.isOk(tuition) ? tuition.value.thisYearCents : null });
    var retirement = h.household.retirementMonthlyCents;

    function step(id, label, cents, status, note) { return { id: id, label: label, cents: cents, status: status, note: note || null }; }
    var housingCents = entered(h.home.currentHousingMonthlyCents) ? h.home.currentHousingMonthlyCents * 12 : (Money.isOk(home) ? home.value.totalMonthlyCents * 12 : null);
    var steps = [
      step('tuition', 'Tuition this school year', Money.isOk(tuition) ? tuition.value.thisYearCents : null, tuition.status, tuition.reason),
      step('calendar', 'The year: dues, holidays, Shabbat, camp', Money.isOk(calendar) ? calendar.value.annualCents : null, calendar.status, calendar.reason),
      step('tzedakah', 'Tzedakah owed', Money.isOk(tzedakah) ? tzedakah.value.owedCents : null, tzedakah.status, tzedakah.reason),
      step('housing', entered(h.home.currentHousingMonthlyCents) ? 'The home, as paid now' : 'The home, as it would cost', housingCents, housingCents === null ? 'incomplete' : 'ok', housingCents === null ? home.reason : null),
      step('milestones', 'Put aside for the simchas', entered(h.plan.simchaMonthlyCents) ? h.plan.simchaMonthlyCents * 12 : null, entered(h.plan.simchaMonthlyCents) ? 'ok' : 'incomplete', entered(h.plan.simchaMonthlyCents) ? null : 'Type what goes aside for simchas each month on the milestones page.'),
      step('retirement', 'Retirement saving', entered(retirement) ? retirement * 12 : null, entered(retirement) ? 'ok' : 'incomplete', entered(retirement) ? null : 'Type what goes to retirement each month on the home page.')
    ];
    var known = steps.filter(function (s) { return s.status === 'ok'; });
    var out = known.reduce(function (a, s) { return a + s.cents; }, 0);
    var left = takeAnnual - out;
    var complete = known.length === steps.length;

    /* The checklist */
    var R = T.rules, gross = h.household.grossAnnualCents;
    var lean = h.plan.leanMonthCents, em = h.plan.emergencyCents;
    var checklist = [];
    if (entered(em) && entered(lean) && lean > 0) {
      var months = em / lean;
      checklist.push({ id: 'emergency', label: 'An emergency fund', state: months >= R.emergencyMonths.months ? 'done' : 'short', detail: (Math.round(months * 10) / 10) + ' months of the lean month; the guide says ' + R.emergencyMonths.months + '.' });
    } else checklist.push({ id: 'emergency', label: 'An emergency fund', state: 'unknown', detail: 'Type the fund and the lean month to check it.' });
    if (entered(h.plan.lifeCoverCents) && entered(gross) && gross > 0) {
      var mult = h.plan.lifeCoverCents / gross;
      checklist.push({ id: 'life', label: 'Term life cover on both parents', state: mult >= R.lifeCoverMultiple.multiple ? 'done' : 'short', detail: Money.formatMultiple(mult) + ' income; the guide for a family with tuition ahead is ' + R.lifeCoverMultiple.multiple + 'x.' });
    } else checklist.push({ id: 'life', label: 'Term life cover on both parents', state: 'unknown', detail: 'Type the cover in force to check it.' });
    checklist.push({ id: 'will', label: 'A will with a halachic clause', state: h.plan.hasWill === true ? 'done' : h.plan.hasWill === false ? 'short' : 'unknown', detail: R.halachicWill.note });
    checklist.push({ id: 'disability', label: 'Disability cover on the earners', state: h.plan.hasDisability === true ? 'done' : h.plan.hasDisability === false ? 'short' : 'unknown', detail: 'Tuition is due whether or not you can work. Group cover through work is the cheap start.' });
    checklist.push({ id: 'tzedakah', label: 'Tzedakah on pace', state: Money.isOk(tzedakah) ? (tzedakah.value.remainingCents <= 0 ? 'done' : 'short') : 'unknown', detail: Money.isOk(tzedakah) ? (tzedakah.value.remainingCents <= 0 ? 'Given in full this year.' : Money.formatCents(tzedakah.value.remainingCents) + ' still to give this year.') : 'Set the share on the tzedakah page.' });

    /* The decade view and the freed tuition */
    var decade = [], freed = null;
    if (Money.isOk(tuition)) {
      tuition.value.years.forEach(function (y) { decade.push({ year: y.year, tuitionCents: y.totalCents, retirementCents: entered(retirement) ? retirement * 12 : null }); });
      var ends = tuition.value.lastYear + 1;
      var by = h.household.olderParentBirthYear;
      if (entered(by) && entered(h.plan.returnRate)) {
        var months = (by + 65 - ends) * 12;
        var lastFew = tuition.value.years.slice(-3);
        var avg = Math.round(lastFew.reduce(function (a, y) { return a + y.totalCents; }, 0) / lastFew.length);
        freed = { year: ends, monthlyCents: Math.round(avg / 12), months: months, at65Cents: months > 0 ? futureValue(Math.round(avg / 12), h.plan.returnRate, months) : 0, age65Year: by + 65 };
      }
    }
    var simchaGap = Money.isOk(milestones) && entered(h.plan.simchaMonthlyCents) ? milestones.value.setAsideMonthlyCents - h.plan.simchaMonthlyCents : null;
    return ok({ takeHomeAnnualCents: takeAnnual, simchaGapMonthlyCents: simchaGap, steps: steps, leftCents: left, leftShare: takeAnnual > 0 ? left / takeAnnual : null, complete: complete, checklist: checklist, decade: decade, freed: freed,
      parts: { tuition: tuition, calendar: calendar, tzedakah: tzedakah, home: home, milestones: milestones } }, { missing: steps.filter(function (s) { return s.status !== 'ok'; }).map(function (s) { return s.id; }) });
  }
  return { picture: picture, futureValue: futureValue };
});
