/* ==========================================================================
   shared/upnext.js — the readings a person wants, the least each needs,
   which are open, and the cheapest one to open next.
   --------------------------------------------------------------------------
   Every room already says what it is missing (shared/progress.js reads a
   room's `needs`). What nobody said was the thing a person actually wants
   to know on the front page: "what can the app tell me now, what is one
   answer away, and which answer opens the most?"

   So this is a short list of READINGS, each naming the smallest set of
   shared fields it needs (ownership ids, so every one is a link to the
   exact field in its owner room) and the engine that produces it. Nothing
   is computed here: `read` is a call into Tier0, Fire or Foo, and the
   Result comes back as they made it. A reading the situation rules out
   (a retiree's savings rate) is absent, not locked — D-055's "not
   applicable is not missing" — through the same gate branch the
   instruments use.

     UpNext.READINGS             the list, in the order they are worth having
     UpNext.plan(h, tables)      { open, locked, next, total, byField }
                                 open:   readings that compute, with display
                                 locked: the rest, cheapest first, each with
                                         its missing fields as links
                                 next:   locked[0], or null when all are open
                                 byField: fieldId → the locked readings that
                                         field would help open (a reason,
                                         not a chore)

   `needs` is the promise "fill exactly these and the reading opens", and
   test/run.js holds each reading to it by filling only its needs on an
   empty household.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), Ownership: require('./ownership.js'), Registry: require('./registry.js'),
      Gate: require('./gate.js'), Tier0: require('../engines/tier0.js'), Fire: require('../engines/fire.js'), Foo: require('../engines/foo.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, Registry: S.Registry, Gate: S.Gate, Tier0: S.Tier0, Fire: S.Fire, Foo: S.Foo };
  }
  var api = factory(deps.Money, deps.Schema, deps.Ownership, deps.Registry, deps.Gate, deps.Tier0, deps.Fire, deps.Foo);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.UpNext = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Ownership, Registry, Gate, Tier0, Fire, Foo) {
  'use strict';

  function rate(v) { return Money.formatRate(v, { decimals: 0 }); }
  function months(v) { return (Math.round(v * 10) / 10) + ' months'; }
  function savingsBasis(h, tables) {
    var r = Tier0.savingsRate(h, tables);
    return Money.isOk(r.includingMatch) ? r.includingMatch : r.excludingMatch;
  }

  /* `requires` is a gate branch (shared/gate.js), like the instruments'.
     `needs` are ownership field ids: the least that has to be entered.
     Labels are written for the middle of a sentence, FIRE kept upper. */
  var READINGS = [
    { id: 'netWorth', label: 'net worth', say: 'what you own less what you owe',
      needs: ['cashSavings', 'investments', 'totalDebt'], room: 'statement', anchor: 'assets',
      read: function (h) { return Tier0.netWorth(h); }, format: Money.formatCents },
    { id: 'takeHome', label: 'take-home pay, a month', say: 'what actually lands after tax',
      needs: ['grossAnnualIncome', 'filingStatus'], room: 'tax', anchor: 'number',
      read: function (h, t) { return Tier0.takeHomeMonthlyCents(h, t); }, format: Money.formatCents },
    { id: 'runway', label: 'runway', say: 'how many months the cash would last',
      needs: ['cashSavings', 'monthlyExpenses'], room: 'runway', anchor: 'view-how-long',
      read: function (h) { return Tier0.emergencyFundMonths(h); }, format: months },
    { id: 'savingsRate', label: 'savings rate', say: 'the share of your pay that stays yours', requires: 'savingsRate',
      needs: ['grossAnnualIncome', 'filingStatus', 'monthlyExpenses'], room: 'financial-snapshot', anchor: 'out-rate',
      read: function (h, t) { return Tier0.savingsRate(h, t).excludingMatch; }, format: rate },
    { id: 'fireNumber', label: 'your FIRE number', say: 'what the pot has to reach before work is optional',
      needs: ['monthlyExpenses'], room: 'fire', anchor: 'out-target',
      read: function (h, t) { return Fire.calculateFIRE(h, t); }, format: Money.formatCents },
    { id: 'fooStep', label: 'your step on the money ladder', say: 'which of the nine steps the next dollar belongs to',
      /* The ladder's first rungs read spending, cash and debt; the match
         rung needs the pay, the match itself ("none" included) and what
         you contribute before it can say whether the next dollar belongs
         there. The longest list here, and every one of them is a rung. */
      needs: ['monthlyExpenses', 'cashSavings', 'totalDebt', 'grossAnnualIncome', 'filingStatus', 'employerMatch', 'contributionPercent'], room: 'foo-ladder', anchor: 'view-ladder',
      read: function (h, t) {
        var f = Foo.evaluate(h, t);
        if (f.status === 'ok' && f.placement && Money.isEntered(f.placement.step)) return Money.ok(f.placement.step, { title: f.placement.title });
        return Money.incomplete((f.placement && f.placement.reason) || f.reason || 'Not enough entered to place you on the ladder yet.', ['monthlyExpenses']);
      }, format: function (v) { return 'step ' + v; } },
    { id: 'debtToIncome', label: 'debt-to-income', say: 'the share of your pay already promised to debt', requires: 'debt',
      needs: ['totalDebt', 'grossAnnualIncome'], room: 'debt-payoff', anchor: 'out-plan',
      read: function (h) { return Tier0.debtToIncome(h); }, format: rate },
    { id: 'coastNumber', label: 'your Coast FIRE number', say: 'what would be enough today to stop contributing',
      needs: ['monthlyExpenses', 'dob'], room: 'fire', anchor: 'variants',
      read: function (h, t) { return Fire.calculateFIRE(h, t, { variantId: 'coast' }); }, format: Money.formatCents },
    { id: 'fiDate', label: 'the FI date', say: 'the year work could become optional at this pace', requires: 'savingsRate',
      needs: ['monthlyExpenses', 'investments', 'grossAnnualIncome', 'filingStatus'], room: 'fire', anchor: 'targets',
      read: function (h, t) {
        var y = Tier0.yearsToFire(h, t);
        if (!Money.isOk(y)) return y;
        return Money.ok(y.alreadyThere ? 0 : y.value, { alreadyThere: y.alreadyThere === true });
      }, format: function (v, r) { return r && r.alreadyThere ? 'now' : String(new Date().getFullYear() + Math.ceil(v)); } },
    { id: 'fireTier', label: 'your FIRE tier', say: 'which of the tiers the pot has reached, and the next one',
      needs: ['monthlyExpenses', 'investments'], room: 'fire', anchor: 'variants',
      read: function (h, t) { return Fire.tiers(h, t); },
      format: function (v, r) { return r && r.current ? r.current.label + ' reached' : (r && r.next ? 'below ' + r.next.label : 'no tier yet'); } }
  ];

  function applies(spec, h) {
    return !spec.requires || !Gate || Gate.exists(h, spec.requires);
  }

  function plan(household, tables, fromRoomId) {
    var h = household || {};
    var from = fromRoomId || 'dashboard';
    var open = [], locked = [], byField = {};
    READINGS.forEach(function (spec) {
      if (!applies(spec, h)) return;
      var missing = [];
      spec.needs.forEach(function (fieldId) {
        var d = Ownership.describe(fieldId, h, from);
        if (!d || !d.applies || d.isSet) return;
        missing.push({ fieldId: fieldId, label: d.label, href: d.href, ownerId: d.ownerId, ownerTitle: d.ownerTitle });
      });
      var room = Registry.byId(spec.room);
      var entry = { id: spec.id, label: spec.label, say: spec.say, room: spec.room, anchor: spec.anchor,
        roomTitle: room ? room.title : spec.room, href: Ownership.linkTo(spec.room, spec.anchor, from), cost: missing.length, missing: missing };
      var r = missing.length ? null : spec.read(h, tables);
      if (r && Money.isOk(r)) {
        entry.result = r;
        entry.display = spec.format(r.value, r);
        open.push(entry);
        return;
      }
      /* Every need is in and the engine still says no (a zero income, a
         table not loaded): locked, with the engine's own reason. */
      entry.reason = r ? r.reason : null;
      locked.push(entry);
      missing.forEach(function (m) {
        (byField[m.fieldId] = byField[m.fieldId] || { fieldId: m.fieldId, label: m.label, href: m.href, ownerTitle: m.ownerTitle, opens: [] }).opens.push(entry);
      });
    });
    /* Cheapest first; the declared order breaks ties, so a sort never
       sends someone to the least interesting reading. */
    locked = locked.map(function (e, i) { return [e, i]; })
      .sort(function (a, b) { return a[0].cost - b[0].cost || a[1] - b[1]; })
      .map(function (p) { return p[0]; });
    return { open: open, locked: locked, next: locked[0] || null, total: open.length + locked.length, byField: byField };
  }

  return { READINGS: READINGS, plan: plan };
});
