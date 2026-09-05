/* ==========================================================================
   engines/calendar.js — the Money Calendar & Pay-Later room's month.
   DECISIONS.md D-101 (the LATER.md rooms on the template).
   --------------------------------------------------------------------------
   One month, drawn a day at a time from what the person said:

     start        today's cash (Start Here's cash & savings) is the balance
                  on day one — nothing in a bank is read
     paydays      take-home a month (engines/tier0.js's takeHomeMonthlyCents,
                  the effective-rate table, never a second lookup) ÷ the
                  paydays a month for the cadence (data/calendar_conventions
                  .json: weekly 52 ÷ 12, fortnightly 26 ÷ 12, semimonthly 2,
                  monthly 1), added on each payday. Monthly: the next-payday
                  day of each month. Semimonthly: that day and the one
                  fifteen days off it, wrapped inside 1–30 (5 and 20, 1 and
                  16, 15 and 30). Weekly / fortnightly: the next payday, then
                  every 7 / 14 days after it. A day past the month's end
                  (the 31st in a 30-day month) is the last day.
     bills        each listed bill is drawn on its day, the first time that
                  day comes round from today — this month if the day is
                  still ahead, otherwise next month, inside the window.
                  A pay-later instalment is a bill due on its day; one with
                  no instalments left is ignored.
     the rest     a month's spending less the bills listed, spread evenly
                  over each day of the month it falls in. Bills over the
                  spending → nothing left to spread, and a flag.
     the window   31 days, today included.

   The number is the low point: the lowest balance in the window and the
   day it lands. Below zero on any day → "out", naming the first such day;
   under a week of spending → "watch"; otherwise good. The tight stretch is
   the run of days around the low point that sit under a week of spending.

   Every figure that is not the person's comes from a table or a named
   convention; a missing input is a reason, not a number.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0 };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Calendar = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0) {
  'use strict';

  var MONTHS = 12;
  var DAYS_PER_MONTH = 365.25 / 12;       /* the dashboard's constant (shared/instruments.js) */
  var HORIZON_DAYS = 31;                   /* the default, the table can say otherwise */
  var WRAP_DAYS = 30;                      /* the semimonthly pair lives inside 1–30 */
  var RENT_SHARE_OF_GROSS = 0.30;          /* the 30% rule — the Housing room's proposal, a convention */
  var RENT_ID = 'rent';

  /* ---- small helpers ------------------------------------------------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
  function clampDay(day, dim) { return Math.max(1, Math.min(Math.round(day), dim)); }
  function ordinal(n) {
    var v = Math.round(n), r = v % 100;
    if (r >= 11 && r <= 13) return v + 'th';
    return v + ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th');
  }
  /* A Date at local midnight from a Date, a ms number or 'YYYY-MM-DD'. */
  function startOf(now) {
    var d;
    if (now === undefined || now === null) d = new Date();
    else if (typeof now === 'string') { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(now); d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(now); }
    else d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function validDay(v) { return Money.isEntered(v) && v >= 1 && v <= 31; }

  /* The rent this room lists when a rent day is typed: the Housing room's
     figure when it has one, else the 30% rule on gross a month, and nothing
     when Start Here says there is no rent to pay. */
  function rentCents(household) {
    var h = household || {};
    if (h.meta && h.meta.noRent === true) return { cents: null, source: 'none', reason: 'Start Here says there is no rent to pay.' };
    var housing = h.housing || {};
    if (Money.isEntered(housing.rentMonthlyCents)) return { cents: housing.rentMonthlyCents, source: 'housing', reason: null };
    var gross = Schema.grossAnnualIncomeCents(h);
    if (Money.isOk(gross) && gross.value > 0) return { cents: Math.round(gross.value / MONTHS * RENT_SHARE_OF_GROSS), source: 'guess', reason: null };
    return { cents: null, source: 'none', reason: 'No rent from Housing Decision and no income to guess it from.' };
  }

  /* The semimonthly partner of day N: fifteen days off it, inside 1–30. */
  function semimonthlyPair(day, gap) {
    var g = Money.isEntered(gap) ? gap : 15;
    var other = day + g > WRAP_DAYS ? day - g : day + g;
    return [day, other];
  }

  /* Which of the window's dates are paydays. dates: [{ dom, dim }]. */
  function paydayIndices(cadence, nextDay, dates, conv) {
    var out = [], i;
    if (cadence === 'monthly') {
      for (i = 0; i < dates.length; i++) if (dates[i].dom === clampDay(nextDay, dates[i].dim)) out.push(i);
      return out;
    }
    if (cadence === 'semimonthly') {
      var pair = semimonthlyPair(nextDay, conv && conv.semimonthlyGapDays);
      for (i = 0; i < dates.length; i++) {
        if (dates[i].dom === clampDay(pair[0], dates[i].dim) || dates[i].dom === clampDay(pair[1], dates[i].dim)) out.push(i);
      }
      return out;
    }
    var interval = conv && conv.cadences && conv.cadences[cadence] && conv.cadences[cadence].intervalDays;
    if (!Money.isEntered(interval) || interval <= 0) return out;
    var anchor = -1;
    for (i = 0; i < dates.length; i++) if (dates[i].dom === clampDay(nextDay, dates[i].dim)) { anchor = i; break; }
    if (anchor < 0) return out;
    for (i = anchor; i < dates.length; i += interval) out.push(i);
    return out;
  }

  /* ---- the month ---------------------------------------------------------------- */
  function month(household, tables, opts) {
    var h = household || {};
    var o = opts || {};
    var conv = tables && tables.calendarConventions;
    if (!conv || !conv.cadences) return Money.incomplete('The calendar conventions table is not loaded.', ['calendarConventions']);

    var cal = h.calendar || {};
    var cadence = conv.cadences[cal.cadence] ? cal.cadence : null;
    if (!cadence) return Money.incomplete('How often are you paid?', ['cadence']);
    if (!validDay(cal.nextPaydayDay)) return Money.incomplete('Which day of the month is the next payday?', ['nextPaydayDay']);
    var nextDay = Math.round(cal.nextPaydayDay);

    var cash = Schema.cashCents(h);
    if (!Money.isOk(cash)) return Money.incomplete('Add your cash & savings in Start Here — today’s cash is where the month starts.', cash.missing || ['cashSavings']);
    var spend = Schema.monthlyExpensesCents(h);
    if (!Money.isOk(spend)) return Money.incomplete(spend.reason, spend.missing);
    var takeHome = Tier0.takeHomeMonthlyCents(h, tables);
    if (!Money.isOk(takeHome)) return Money.incomplete('Add your income in Start Here to place the paydays: ' + (takeHome.reason || ''), takeHome.missing);

    var paydaysPerMonth = conv.cadences[cadence].paydaysPerMonth;
    var perPayday = Math.round(takeHome.value / paydaysPerMonth);

    var bills = (cal.bills || []).filter(function (b) { return b && Money.isEntered(b.cents) && b.cents > 0 && validDay(b.day); })
      .map(function (b) { return { id: b.id, label: b.label || 'A bill', cents: b.cents, day: Math.round(b.day), kind: 'bill' }; });
    var payLater = (cal.payLater || []).filter(function (p) { return p && Money.isEntered(p.cents) && p.cents > 0 && validDay(p.dueDay) && p.instalmentsLeft !== 0; })
      .map(function (p) { return { id: p.id, label: p.label || 'Pay-later', cents: p.cents, day: Math.round(p.dueDay), kind: 'payLater', instalmentsLeft: Money.isEntered(p.instalmentsLeft) ? p.instalmentsLeft : null }; });
    var billsCents = bills.reduce(function (t, b) { return t + b.cents; }, 0);
    var payLaterCents = payLater.reduce(function (t, p) { return t + p.cents; }, 0);
    var listed = billsCents + payLaterCents;
    var rest = spend.value - listed;
    var billsExceedSpending = rest < 0;
    if (billsExceedSpending) rest = 0;

    var horizon = Money.isEntered(conv.horizonDays) && conv.horizonDays > 0 ? conv.horizonDays : HORIZON_DAYS;
    var start = startOf(o.now);
    var dates = [], i;
    for (i = 0; i < horizon; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      dates.push({ index: i, date: iso(d), dom: d.getDate(), dim: daysInMonth(d), month: d.getMonth(), year: d.getFullYear() });
    }
    var paydayAt = {};
    paydayIndices(cadence, nextDay, dates, conv).forEach(function (idx) { paydayAt[idx] = true; });

    var balance = cash.value;
    var days = [], paydays = [], billHits = [], payLaterHits = [];
    var lowIndex = 0, lowCents = null, firstBelow = -1;
    for (i = 0; i < dates.length; i++) {
      var dt = dates[i];
      var pay = paydayAt[i] ? perPayday : 0;
      var out = 0, plOut = 0;
      bills.forEach(function (b) {
        if (clampDay(b.day, dt.dim) !== dt.dom) return;
        out += b.cents;
        billHits.push({ id: b.id, label: b.label, cents: b.cents, day: b.day, index: i, dom: dt.dom, date: dt.date });
      });
      payLater.forEach(function (p) {
        if (clampDay(p.day, dt.dim) !== dt.dom) return;
        plOut += p.cents;
        payLaterHits.push({ id: p.id, label: p.label, cents: p.cents, day: p.day, index: i, dom: dt.dom, date: dt.date });
      });
      var spread = Math.round(rest / dt.dim);
      balance += pay - out - plOut - spread;
      if (pay) paydays.push({ index: i, dom: dt.dom, date: dt.date, cents: pay, balanceCents: balance });
      days.push({ index: i, date: dt.date, dom: dt.dom, balanceCents: balance, paydayCents: pay, billsCents: out, payLaterCents: plOut, spreadCents: spread });
      if (lowCents === null || balance < lowCents) { lowCents = balance; lowIndex = i; }
      if (firstBelow < 0 && balance < 0) firstBelow = i;
    }

    var tightDays = Money.isEntered(conv.tightWeekDays) ? conv.tightWeekDays : 7;
    var weekCents = Math.round(spend.value * tightDays / DAYS_PER_MONTH);
    var zone = lowCents < 0 ? 'out' : lowCents < weekCents ? 'watch' : 'good';

    var tight = null;
    if (lowCents < weekCents) {
      var a = lowIndex, b = lowIndex;
      while (a > 0 && days[a - 1].balanceCents < weekCents) a--;
      while (b < days.length - 1 && days[b + 1].balanceCents < weekCents) b++;
      tight = { fromIndex: a, toIndex: b, fromDom: days[a].dom, toDom: days[b].dom, fromDate: days[a].date, toDate: days[b].date, days: b - a + 1 };
    }

    var biggest = null;
    bills.forEach(function (x) { if (!biggest || x.cents > biggest.cents) biggest = x; });
    var firstHitOf = function (id, hits) { return hits.filter(function (x) { return x.id === id; })[0] || null; };

    return Money.ok(lowCents, {
      lowCents: lowCents, lowIndex: lowIndex, lowDom: days[lowIndex].dom, lowDate: days[lowIndex].date,
      belowZero: firstBelow >= 0,
      firstBelowIndex: firstBelow >= 0 ? firstBelow : null, firstBelowDom: firstBelow >= 0 ? days[firstBelow].dom : null, firstBelowDate: firstBelow >= 0 ? days[firstBelow].date : null,
      slackCents: Math.max(0, lowCents), shortfallCents: Math.max(0, -lowCents),
      weekCents: weekCents, tightWeekDays: tightDays, zone: zone, tight: tight,
      days: days, paydays: paydays, perPaydayCents: perPayday, paydaysPerMonth: paydaysPerMonth,
      cadence: cadence, cadenceLabel: conv.cadences[cadence].label, nextPaydayDay: nextDay,
      bills: bills.map(function (x) { var hit = firstHitOf(x.id, billHits); return { id: x.id, label: x.label, cents: x.cents, day: x.day, firstDom: hit ? hit.dom : null, firstDate: hit ? hit.date : null, firstIndex: hit ? hit.index : null }; }),
      payLater: payLater.map(function (x) { var hit = firstHitOf(x.id, payLaterHits); return { id: x.id, label: x.label, cents: x.cents, day: x.day, instalmentsLeft: x.instalmentsLeft, firstDom: hit ? hit.dom : null, firstDate: hit ? hit.date : null, firstIndex: hit ? hit.index : null }; }),
      billHits: billHits, payLaterHits: payLaterHits,
      biggestBill: biggest ? { id: biggest.id, label: biggest.label, cents: biggest.cents, day: biggest.day } : null,
      billsCents: billsCents, payLaterCents: payLaterCents, listedCents: listed, restCents: rest, billsExceedSpending: billsExceedSpending,
      startCents: cash.value, spendCents: spend.value, takeHomeCents: takeHome.value, effectiveRate: takeHome.effectiveRate, referenceVersion: takeHome.referenceVersion,
      horizonDays: horizon, startDate: dates[0].date, endDate: dates[dates.length - 1].date
    });
  }

  /* The month as a grid: the window's days in rows of seven, each row
     starting on Sunday, the first row padded with blanks so a day sits
     under its weekday. Each cell carries what the day does — a payday,
     the bills and pay-later instalments drawn, the spread — and where the
     balance stands, so a page can draw a calendar rather than a line. */
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function weeks(result) {
    if (!Money.isOk(result)) return [];
    var first = startOf(result.startDate);
    var pad = first.getDay();
    var rows = [], row = [], i;
    for (i = 0; i < pad; i++) row.push(null);
    result.days.forEach(function (d) {
      var when = startOf(d.date);
      row.push({
        index: d.index, date: d.date, dom: d.dom, weekday: WEEKDAYS[when.getDay()],
        firstOfMonth: d.dom === 1, month: when.toLocaleDateString('en-US', { month: 'short' }),
        balanceCents: d.balanceCents, paydayCents: d.paydayCents, billsCents: d.billsCents, payLaterCents: d.payLaterCents, spreadCents: d.spreadCents,
        inCents: d.paydayCents, outCents: d.billsCents + d.payLaterCents,
        bills: result.billHits.filter(function (b) { return b.index === d.index; }).map(function (b) { return { label: b.label, cents: b.cents, kind: 'bill' }; })
          .concat(result.payLaterHits.filter(function (b) { return b.index === d.index; }).map(function (b) { return { label: b.label, cents: b.cents, kind: 'payLater' }; })),
        isLow: d.index === result.lowIndex, belowZero: d.balanceCents < 0,
        tight: !!(result.tight && d.index >= result.tight.fromIndex && d.index <= result.tight.toIndex),
        today: d.index === 0
      });
      if (row.length === 7) { rows.push(row); row = []; }
    });
    if (row.length) { while (row.length < 7) row.push(null); rows.push(row); }
    return rows;
  }

  /* The chart's points: [[day index, balance], …]. */
  function balancePoints(result) {
    if (!Money.isOk(result)) return [];
    return result.days.map(function (d) { return [d.index, d.balanceCents]; });
  }

  return {
    month: month,
    balancePoints: balancePoints,
    weeks: weeks,
    WEEKDAYS: WEEKDAYS,
    rentCents: rentCents,
    semimonthlyPair: semimonthlyPair,
    paydayIndices: paydayIndices,
    clampDay: clampDay,
    daysInMonth: daysInMonth,
    ordinal: ordinal,
    startOf: startOf,
    RENT_ID: RENT_ID,
    RENT_SHARE_OF_GROSS: RENT_SHARE_OF_GROSS,
    DAYS_PER_MONTH: DAYS_PER_MONTH,
    HORIZON_DAYS: HORIZON_DAYS
  };
});
