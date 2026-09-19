/* ==========================================================================
   engines/next100.js — your next $100, ranked. DECISIONS.md D-211 (H3).
   --------------------------------------------------------------------------
   One list, one scale: the return each place earns or saves on the next
   hundred dollars. Every line is labelled GUARANTEED (paying down a debt
   at its rate; capturing an employer match) or EXPECTED (investing, from
   the return bands in data/return_bands.json, with its range). The two
   are never blended into one number. The order of operations
   (data/foo_rules.json, engines/foo.js) is respected as a note on each
   line: which step it is, and where the ladder places the person now.
   Wording is what the numbers say, never an instruction.

     Next100.rank(h, tables, opts) → { status, rows, placement, say, missing }
       rows[i]: { id, kind: 'guaranteed'|'expected', rate, low, high,
                  label, why, fooStep, fooKey, href, amountCents }

   opts.frameworkNames: name the FOO step on each line (a preference the
   room reads from Prefs 'showFrameworkNames'); default true.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Foo: require('./foo.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Foo: root.SLAF && root.SLAF.Foo };
  }
  var api = factory(deps.Money, deps.Schema, deps.Foo);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Next100 = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Foo) {
  'use strict';
  var HUNDRED = 10000;
  function pct(r) { return (Math.round(r * 1000) / 10) + '%'; }
  function stepOf(rules, key) {
    var lad = (rules && rules.ladder) || [];
    for (var i = 0; i < lad.length; i++) if (lad[i].key === key) return lad[i];
    return null;
  }
  function rank(household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    var names = o.frameworkNames !== false;
    var rules = T.fooRules || null;
    var rows = [], missing = [];
    var thr = (rules && rules.thresholds) || {};

    /* The match: cents on the dollar, at once. Only while it is not yet
       fully captured; the amount is what is still on the table. */
    var match = Schema.employerMatchCents(h);
    var capturing = Schema.capturingFullMatchDerived ? Schema.capturingFullMatchDerived(h) : Money.incomplete('', []);
    if (Money.isOk(match) && match.value > 0) {
      var sources = Schema.allIncomeSources ? Schema.allIncomeSources(h) : [];
      var best = null;
      sources.forEach(function (s) { var m = s.employerMatch || {}; if (Money.isEntered(m.matchPercent) && (!best || m.matchPercent > best)) best = m.matchPercent; });
      if (Money.isOk(capturing) && capturing.value === true) {
        rows.push({ id: 'match', kind: 'guaranteed', rate: best, low: best, high: best, label: 'Employer match', amountCents: 0, done: true,
          why: 'Already captured in full: every dollar up to the cap already brings its ' + Math.round(best * 100) + ' cents. Nothing left on the table.', fooKey: 'employer_match', href: 'accounts.html' });
      } else {
        rows.push({ id: 'match', kind: 'guaranteed', rate: best, low: best, high: best, label: 'Capture the employer match', amountCents: match.value,
          why: 'Each dollar you put in up to the cap brings ' + Math.round(best * 100) + ' cents from the employer, at once. ' + Money.formatCents(match.value) + ' a year is on the table.', fooKey: 'employer_match', href: 'accounts.html' });
      }
    } else if (!Money.isOk(match) && Schema.capturingQuestionApplies && Schema.capturingQuestionApplies(h)) missing.push('employerMatch');

    /* Every debt with a rate: paying it down saves exactly that rate. */
    (Schema.aggregatableDebts ? Schema.aggregatableDebts(h) : (h.debts || [])).forEach(function (d) {
      if (!Money.isEntered(d.balanceCents) || d.balanceCents <= 0) return;
      if (!Money.isEntered(d.rate)) { missing.push('debtRate:' + (d.label || d.id)); return; }
      var high = Money.isEntered(thr.highInterestDebtRate) && d.rate > thr.highInterestDebtRate;
      rows.push({ id: 'debt:' + d.id, kind: 'guaranteed', rate: d.rate, low: d.rate, high: d.rate, label: 'Pay down ' + (d.label || d.type || 'a debt'), amountCents: d.balanceCents,
        why: 'Every dollar paid saves ' + pct(d.rate) + ' a year in interest, guaranteed, on ' + Money.formatCents(d.balanceCents) + ' owed.' + (high ? ' Above the high-interest line the order of operations draws.' : ''), fooKey: high ? 'high_interest_debt' : 'prepay_low_interest', href: 'debt-payoff.html' });
    });

    /* Investing: expected, from the bands, never a promise. */
    var bands = T.returnBands && T.returnBands.percentiles;
    if (bands && Money.isEntered(bands.p50)) {
      rows.push({ id: 'invest', kind: 'expected', rate: bands.p50, low: bands.p25, high: bands.p75, label: 'Invest it, broad and boring', amountCents: null,
        why: 'About ' + pct(bands.p50) + ' a year after inflation over a decade is the middle of the range; a poor decade is nearer ' + pct(bands.p25) + ', a good one ' + pct(bands.p75) + '. From data/return_bands.json, not a promise.', fooKey: 'max_tax_advantaged', href: 'fire.html' });
    } else missing.push('returnBands');

    /* One scale: by return; a guaranteed line first on a tie. */
    rows.sort(function (a, b) { return (b.rate - a.rate) || (a.kind === 'guaranteed' ? -1 : 1); });

    /* The order of operations, as a note: which step each line is, and
       where the ladder places the person now. */
    var foo = Foo && rules ? Foo.evaluate(h, T) : null;
    var placement = foo && foo.placement ? foo.placement : null;
    rows.forEach(function (r) {
      var st = stepOf(rules, r.fooKey);
      r.fooStep = st ? st.step : null;
      r.fooLabel = st ? st.label : null;
      r.note = names && st ? 'Step ' + st.step + ' of the order of operations' + (placement && placement.step < st.step ? '; the ladder places you at step ' + placement.step + ', ' + placement.label.toLowerCase() + ', first.' : '.') : null;
    });
    var top = rows.filter(function (r) { return !r.done; })[0] || null;
    var say = !rows.length ? 'Nothing to rank yet: a debt with its rate, a match, or the return bands.'
      : top ? 'The numbers say the next ' + Money.formatCents(HUNDRED) + ' earns or saves most ' + (top.kind === 'guaranteed' ? 'for sure' : 'on average') + ' at: ' + top.label.toLowerCase() + ', ' + pct(top.rate) + (top.kind === 'expected' ? ' expected, ' + pct(top.low) + ' to ' + pct(top.high) : ' guaranteed') + '.'
      : 'Every guaranteed place is already taken; what is left is expected, not promised.';
    return { status: rows.length ? 'ok' : 'incomplete', rows: rows, placement: placement, foo: foo, say: say, missing: missing, hundredCents: HUNDRED };
  }
  return { rank: rank, HUNDRED: HUNDRED };
});
