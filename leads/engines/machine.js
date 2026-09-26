/* ==========================================================================
   leads/engines/machine.js, the lead machine: funnel, costs, levers. LD-003.
   --------------------------------------------------------------------------
   Pure. Takes the numbers the Machine page holds (state.kpis) and returns
   Results the way SPARKS' engines do: ok with a value, or incomplete with
   what is missing. Empty is not zero: a blank input gives an incomplete
   reading, never a number. Money is integer cents; rates are fractions.

     Machine.INPUTS                every input: key, label, unit, hint, example
     Machine.funnel(k)             reach, engaged, booked, shows, customers a month
     Machine.costs(k)              spend, cost per engaged lead, cost per customer
     Machine.value(k)              lifetime gross profit, first-30-day gross profit
     Machine.checks(k)             three-to-one, thirty-day; the book's two rules
     Machine.levers(k)             what one more point on each rate is worth
     Machine.growth(k, months)     customers over time: referrals against churn
     Machine.read(k)               all of the above, in one object
     Machine.actionsByDay(log, days, today)   the rule-of-100 log as a series

   The book's two rules, carried as numbers (book.json confidenceNote):
   lifetime gross profit at least 3 times the cost of a customer; gross
   profit in the first thirty days at least 2 times that cost.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('../shared/money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Machine = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var RATIO_FLOOR = 3;      /* lifetime gross profit over cost to get a customer */
  var PAYBACK_MULT = 2;     /* first thirty days' gross profit over that cost */

  var INPUTS = [
    { key: 'reachPerDay', group: 'reach', label: 'Primary actions a day', unit: 'count', example: 100, hint: 'Messages, reach-outs, or ad impressions bought. The rule of 100 says a hundred.' },
    { key: 'daysPerMonth', group: 'reach', label: 'Days a month you do them', unit: 'count', example: 22 },
    { key: 'replyRate', group: 'rates', label: 'Reach-outs that become engaged leads', unit: 'rate', example: 0.05, hint: 'Replied, clicked, or took the magnet and gave a way to reach them.' },
    { key: 'bookRate', group: 'rates', label: 'Engaged leads that book a call or a visit', unit: 'rate', example: 0.4 },
    { key: 'showRate', group: 'rates', label: 'Bookings that show up', unit: 'rate', example: 0.7 },
    { key: 'closeRate', group: 'rates', label: 'Shows that buy', unit: 'rate', example: 0.3 },
    { key: 'firstPurchaseCents', group: 'money', label: 'What a new customer pays up front', unit: 'cents', example: 30000 },
    { key: 'monthlyCents', group: 'money', label: 'What they pay each month after that', unit: 'cents', example: 20000, hint: 'Zero if nothing, and zero is an answer.' },
    { key: 'monthsKept', group: 'money', label: 'Months a customer stays, on average', unit: 'count', example: 8 },
    { key: 'marginRate', group: 'money', label: 'Gross margin: what is left after delivering', unit: 'rate', example: 0.7 },
    { key: 'adSpendCents', group: 'spend', label: 'Ad spend a month', unit: 'cents', example: 300000, hint: 'Zero if you run no ads.' },
    { key: 'laborCents', group: 'spend', label: 'Pay for the people doing outreach and content, a month', unit: 'cents', example: 0, hint: 'Zero if it is only you and you do not pay yourself for it. Zero is an answer.' },
    { key: 'customersNow', group: 'growth', label: 'Paying customers today', unit: 'count', example: 12 },
    { key: 'churnRate', group: 'growth', label: 'Share of customers who leave in a month', unit: 'rate', example: 0.08 },
    { key: 'referralRate', group: 'growth', label: 'Share of customers who bring one in a month', unit: 'rate', example: 0.1 }
  ];
  var RATES = ['replyRate', 'bookRate', 'showRate', 'closeRate'];
  var RATE_WORDS = { replyRate: 'Reply rate', bookRate: 'Booking rate', showRate: 'Show rate', closeRate: 'Close rate' };

  function isN(v) { return Money.isEntered(v); }
  function need(k, keys) { return keys.filter(function (x) { return !isN(k[x]); }); }
  function inc(missing) { return Money.incomplete('needs ' + missing.join(', '), missing); }

  /* ---- The funnel ---------------------------------------------------------- */
  function funnel(k) {
    k = k || {};
    var m = need(k, ['reachPerDay', 'daysPerMonth'].concat(RATES));
    if (m.length) return inc(m);
    var reach = k.reachPerDay * k.daysPerMonth;
    var engaged = reach * k.replyRate, booked = engaged * k.bookRate, shows = booked * k.showRate, customers = shows * k.closeRate;
    return Money.ok(customers, { reach: reach, engaged: engaged, booked: booked, shows: shows, customers: customers,
      stages: [{ id: 'reach', label: 'Reached', value: reach }, { id: 'engaged', label: 'Engaged leads', value: engaged }, { id: 'booked', label: 'Booked', value: booked }, { id: 'shows', label: 'Showed', value: shows }, { id: 'customers', label: 'Customers', value: customers }] });
  }

  /* ---- Costs ----------------------------------------------------------------
     Spend is ads plus the pay of the people getting leads. Zero spend gives
     a cost of zero, which is true (warm outreach by yourself costs nothing
     you counted), and the ratio check says so rather than dividing by it. */
  function costs(k) {
    k = k || {};
    var f = funnel(k);
    var m = need(k, ['adSpendCents', 'laborCents']);
    if (!Money.isOk(f)) m = m.concat(f.missing);
    if (m.length) return inc(m);
    var spend = k.adSpendCents + k.laborCents;
    var perEngaged = f.engaged > 0 ? Math.round(spend / f.engaged) : null;
    var perCustomer = f.customers > 0 ? Math.round(spend / f.customers) : null;
    return Money.ok(perCustomer, { spend: spend, perEngaged: perEngaged, perCustomer: perCustomer, free: spend === 0 });
  }

  /* ---- Value ------------------------------------------------------------- */
  function value(k) {
    k = k || {};
    var m = need(k, ['firstPurchaseCents', 'monthlyCents', 'monthsKept', 'marginRate']);
    if (m.length) return inc(m);
    var lifetime = Math.round((k.firstPurchaseCents + k.monthlyCents * k.monthsKept) * k.marginRate);
    var first30 = Math.round((k.firstPurchaseCents + k.monthlyCents) * k.marginRate);
    return Money.ok(lifetime, { lifetime: lifetime, first30: first30, revenue: k.firstPurchaseCents + k.monthlyCents * k.monthsKept });
  }

  /* ---- The two checks ----------------------------------------------------- */
  function checks(k) {
    var c = costs(k), v = value(k);
    var m = [].concat(Money.isOk(c) ? [] : c.missing, Money.isOk(v) ? [] : v.missing);
    m = m.filter(function (x, i) { return m.indexOf(x) === i; });
    if (m.length) return inc(m);
    if (c.free) return Money.ok(null, { free: true, ratio: null, ratioOk: true, paybackOk: true, cac: 0, lifetime: v.lifetime, first30: v.first30,
      words: 'Your leads cost nothing you counted, so every customer is profit. The checks matter the day you spend on ads or people.' });
    if (c.perCustomer === null) return Money.ok(null, { free: false, ratio: null, ratioOk: false, paybackOk: false, cac: null, lifetime: v.lifetime, first30: v.first30,
      words: 'The funnel makes no customers at these rates, so a customer has no cost yet. Lift a rate and look again.' });
    var ratio = v.lifetime / c.perCustomer, payback = v.first30 / c.perCustomer;
    var ratioOk = ratio >= RATIO_FLOOR, paybackOk = payback >= PAYBACK_MULT;
    var words = ratioOk && paybackOk ? 'Both checks pass: a customer is worth well over what they cost, and the first month pays for the next one. The book says this is when you can scale.'
      : ratioOk ? 'Worth the cost over their life, but the first month does not pay back twice. Growth will eat cash; raise the up-front price or lower the cost before spending more.'
      : 'A customer is worth less than three times what they cost. Fix the offer, the margin, or the funnel before spending more.';
    return Money.ok(ratio, { free: false, ratio: ratio, payback: payback, ratioOk: ratioOk, paybackOk: paybackOk, cac: c.perCustomer, lifetime: v.lifetime, first30: v.first30, words: words,
      floor: RATIO_FLOOR, paybackMult: PAYBACK_MULT });
  }

  /* ---- Levers ------------------------------------------------------------------
     Every rate multiplies the same chain, so ten percent more of any one of
     them gives the same ten percent. One more point is a different story:
     a point on a 5% reply rate is a fifth more customers, a point on a 70%
     show rate is hardly anything. So the lowest rate is the biggest lever,
     and this says by how much. Reach is shown too, as one more action a
     day, so the person can see what more against better is worth. */
  function levers(k) {
    k = k || {};
    var base = funnel(k);
    if (!Money.isOk(base)) return base;
    var out = RATES.map(function (r) {
      var alt = {}; for (var key in k) alt[key] = k[key];
      alt[r] = Math.min(1, k[r] + 0.01);
      var f = funnel(alt);
      return { id: r, label: RATE_WORDS[r] + ' up one point', now: k[r], customers: f.customers, gain: f.customers - base.customers, relative: base.customers > 0 ? (f.customers - base.customers) / base.customers : null };
    });
    var alt2 = {}; for (var key2 in k) alt2[key2] = k[key2];
    alt2.reachPerDay = k.reachPerDay + 10;
    var f2 = funnel(alt2);
    out.push({ id: 'reachPerDay', label: 'Ten more actions a day', now: k.reachPerDay, customers: f2.customers, gain: f2.customers - base.customers, relative: base.customers > 0 ? (f2.customers - base.customers) / base.customers : null });
    out.sort(function (a, b) { return b.gain - a.gain; });
    var weakest = RATES.slice().sort(function (a, b) { return k[a] - k[b]; })[0];
    return Money.ok(out[0].id, { levers: out, weakest: weakest, weakestLabel: RATE_WORDS[weakest], base: base.customers });
  }

  /* ---- Growth: referrals against churn ---------------------------------------
     Each month the count keeps (1 - churn + referral) of itself, then adds
     the customers the funnel made. Two lines: as entered, and with no
     referrals, so the gap is what asking is worth. */
  function growth(k, months) {
    k = k || {}; months = months || 12;
    var f = funnel(k);
    var m = need(k, ['customersNow', 'churnRate', 'referralRate']);
    var newPerMonth = Money.isOk(f) ? f.customers : null;
    if (m.length) return inc(m);
    function run(refRate) {
      var c = k.customersNow, out = [c];
      for (var i = 0; i < months; i++) { c = c * (1 - k.churnRate + refRate) + (newPerMonth === null ? 0 : newPerMonth); out.push(c); }
      return out;
    }
    var withRef = run(k.referralRate), without = run(0);
    var compounding = k.referralRate > k.churnRate;
    return Money.ok(withRef[months], { withReferrals: withRef, withoutReferrals: without, compounding: compounding, newPerMonth: newPerMonth,
      words: compounding ? 'Referrals outnumber the customers who leave: the business grows on its own, before any lead you buy.'
        : k.referralRate === k.churnRate ? 'Referrals exactly replace the customers who leave. Every new customer is growth, none of it free.'
        : 'More customers leave each month than referrals bring. Growth has to be bought until the referral rate passes the churn.' });
  }

  function read(k) {
    return { funnel: funnel(k), costs: costs(k), value: value(k), checks: checks(k), levers: levers(k), growth: growth(k, 12) };
  }

  /* ---- The rule-of-100 log as a series --------------------------------------
     log: [{ date: 'YYYY-MM-DD', planet, count }]. The last `days` days ending
     today, one value a day (null where nothing was logged: empty is not
     zero), per planet and in total. */
  function actionsByDay(log, days, today) {
    days = days || 30;
    var end = today ? new Date(today + 'T12:00:00') : new Date();
    var dates = [];
    for (var i = days - 1; i >= 0; i--) { var d = new Date(end.getTime() - i * 86400000); dates.push(d.toISOString().slice(0, 10)); }
    var byDay = {}, planets = {};
    (log || []).forEach(function (e) {
      if (!e || !e.date || !isN(e.count)) return;
      byDay[e.date] = byDay[e.date] || {};
      var prev = byDay[e.date][e.planet]; byDay[e.date][e.planet] = (isN(prev) ? prev : 0) + e.count;
      planets[e.planet] = true;
    });
    var series = Object.keys(planets).sort().map(function (p) {
      return { id: p, label: p, values: dates.map(function (d) { return byDay[d] && isN(byDay[d][p]) ? byDay[d][p] : null; }) };
    });
    var total = dates.map(function (d) { if (!byDay[d]) return null; var s = 0; for (var p in byDay[d]) s += byDay[d][p]; return s; });
    var loggedDays = total.filter(function (v) { return v !== null; }).length;
    var hundredDays = total.filter(function (v) { return v !== null && v >= 100; }).length;
    var streak = 0;
    for (var j = total.length - 1; j >= 0; j--) { if (total[j] !== null && total[j] >= 100) streak++; else break; }
    return { x: dates, series: series, total: total, loggedDays: loggedDays, hundredDays: hundredDays, streak: streak };
  }

  return { INPUTS: INPUTS, RATES: RATES, RATE_WORDS: RATE_WORDS, RATIO_FLOOR: RATIO_FLOOR, PAYBACK_MULT: PAYBACK_MULT,
    funnel: funnel, costs: costs, value: value, checks: checks, levers: levers, growth: growth, read: read, actionsByDay: actionsByDay };
});
