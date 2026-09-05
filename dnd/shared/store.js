/* ==========================================================================
   shared/store.js — persistence for Dungeons & Dividends.
   --------------------------------------------------------------------------
   This is the ONE file that is deliberately different from the SLAF spine it
   replaces, and the difference is the whole point of this product.

   What it keeps is a REAL SLAF household — the same shape shared/schema.js
   defines, people and assets and debts and expenses — even though almost
   nobody using this tool will ever have heard of SLAF. That is not
   over-engineering. It is what makes "port it into the main suite" a copy
   rather than a translation: the export is the household object itself, so
   nothing has to be mapped, guessed at, or rounded on the way across, and
   the two tools cannot compute a number differently because they run the
   same vendored engines over the same shape.

   What it does NOT do is share storage with SLAF. Different key, different
   origin, different product. Someone who finds this through a friend and
   never touches the main suite is a first-class user here, not a lead.

   Two tiers, and the tier is derived, never stored as a flag:
     TIER 1  the quiz alone. No money at all. Class, six stats, subclass.
     TIER 2  five numbers on top. HP, AC, Level, Debt Burden, the full sheet.
   `tier()` reads what is actually present, so there is no way for a stored
   flag to disagree with the data.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.DND = root.DND || {}; root.DND.Store = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  var KEY = 'dnd.character.v1';
  var listeners = [];
  var state = null;

  /* Fixed ids, so writing the same answer twice updates one record rather
     than growing a second. */
  var ID = {
    person: 'dnd_person',
    cash: 'dnd_asset_cash',
    investments: 'dnd_asset_investments',
    income: 'dnd_income',
    debt: 'dnd_debt_total'
  };

  /* dndProfile is a KEY ON THE HOUSEHOLD, not a sibling of it. That is how
     the main suite stores it and how engines/character.js reads it
     (profileOf() looks at household.dndProfile), so keeping them together
     means the engine works unchanged AND the export is just the household
     object — nothing to reassemble on the far side. */
  function blank() {
    var h = Schema.createHousehold();
    h.dndProfile = {};
    return h;
  }

  function load() {
    if (state) return state;
    var raw = null;
    try { raw = self.localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) { state = blank(); return state; }
    try {
      var parsed = JSON.parse(raw);
      /* A corrupt or half-written blob is kept on disk, not thrown away — the
         same rule the source spine follows. We fall back to a blank sheet in
         memory but never overwrite what is stored until a real save. */
      if (!parsed || typeof parsed !== 'object' || !parsed.people) {
        state = blank();
      } else {
        state = parsed;
        if (!state.dndProfile) state.dndProfile = {};
      }
    } catch (e) { state = blank(); }
    return state;
  }

  function save() {
    try { self.localStorage.setItem(KEY, JSON.stringify(load())); } catch (e) { /* private mode */ }
    listeners.forEach(function (fn) { try { fn(); } catch (e) { /* one bad listener */ } });
  }

  function household() { return load(); }
  function profile() { return load().dndProfile; }
  function onChange(fn) { listeners.push(fn); }

  /** Merge a partial dndProfile. Never replaces the whole object. */
  function patchProfile(patch) {
    var p = load().dndProfile;
    Object.keys(patch || {}).forEach(function (k) { p[k] = patch[k]; });
    save();
    return p;
  }

  /* ---- The five numbers -------------------------------------------------
     Written INTO the household in its real shape, not into a flat bag, so
     the vendored Schema and Tier0 read them without knowing this product
     exists. A null clears the record rather than storing a zero — empty is
     not zero here either.                                                */

  function upsert(list, record) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === record.id) { list[i] = record; return; }
    }
    list.push(record);
  }
  function removeId(list, id) {
    for (var i = list.length - 1; i >= 0; i--) if (list[i].id === id) list.splice(i, 1);
  }

  function setMoney(field, cents) {
    var h = household();
    if (field === 'grossAnnualIncomeCents') {
      /* Income hangs off a PERSON as an income source, not off the household
         and not off the work profile — Schema.allIncomeSources() walks
         people[].incomeSources[], and only people whose role is 'adult'. Get
         either of those wrong and the income silently reads as "not entered". */
      var person = h.people[0];
      if (!person) {
        person = Schema.createPerson({ id: ID.person, role: 'adult' });
        h.people.push(person);
      }
      person.incomeSources = person.incomeSources || [];
      if (!Money.isEntered(cents)) {
        removeId(person.incomeSources, ID.income);
        save(); return;
      }
      upsert(person.incomeSources, Schema.createIncomeSource({
        id: ID.income, personId: person.id, source: 'Day job',
        grossAnnualIncomeCents: cents, type: 'w2'
      }));
      save(); return;
    }
    if (field === 'monthlyExpensesCents') {
      h.expenses = h.expenses || { monthlyEssential: {}, entries: [] };
      h.expenses.monthlyEssential = Money.isEntered(cents)
        ? { estimatedValueCents: cents, trackedValueCents: null, source: 'estimated' }
        : { estimatedValueCents: null, trackedValueCents: null, source: 'estimated' };
      save(); return;
    }
    var map = {
      cashCents: { id: ID.cash, label: 'Cash & savings', category: 'cash', liquid: true },
      investmentsCents: { id: ID.investments, label: 'Investments + retirement', category: 'investment', liquid: false }
    };
    if (map[field]) {
      var spec = map[field];
      if (!Money.isEntered(cents)) { removeId(h.assets, spec.id); save(); return; }
      upsert(h.assets, Schema.createAsset({
        id: spec.id, label: spec.label, category: spec.category,
        valueCents: cents, liquid: spec.liquid, ownerIds: []
      }));
      save(); return;
    }
    throw new Error('Unknown money field: ' + field);
  }

  /**
   * Debt is one summary record, because asking a quiz-taker to itemise every
   * balance is how you lose them. The APR question is not cosmetic: Debt
   * Burden 2 keys off whether ANY balance is above the high-interest line, so
   * the rate is stored on the record and the engine reads it exactly as it
   * would read an itemised list from the main suite.
   */
  function setDebt(balanceCents, hasHighInterest) {
    var h = household();
    if (!Money.isEntered(balanceCents) || balanceCents <= 0) { removeId(h.debts, ID.debt); save(); return; }
    var foo = 0.075;   /* mirrored in data/foo_rules.json; see setDebtRate */
    upsert(h.debts, Schema.createDebt({
      id: ID.debt, label: 'Total debt', balanceCents: balanceCents,
      rate: hasHighInterest === true ? foo : (hasHighInterest === false ? 0.04 : null),
      type: 'other', ownerIds: []
    }));
    save();
  }

  /**
   * Filing status is not decoration. Tier0's savings rate subtracts estimated
   * tax, and the effective-rate lookup keys off filing status — so without it
   * savings rate is incomplete, which makes CON incomplete, which withholds
   * Max HP. One dropdown stands between a sheet with Hit Points and one
   * without.
   */
  function setFilingStatus(status) {
    var h = household();
    h.filingStatus = status || null;
    save();
  }

  /** Let the caller pass the real threshold once tables are loaded. */
  function setDebtRate(rate) {
    var h = household();
    for (var i = 0; i < h.debts.length; i++) {
      if (h.debts[i].id === ID.debt && h.debts[i].rate !== null) h.debts[i].rate = rate;
    }
    save();
  }

  /* ---- Which tier is this sheet actually at? --------------------------- */

  function moneyEntered() {
    var h = household();
    return Money.isOk(Schema.grossAnnualIncomeCents(h))
        && Money.isOk(Schema.monthlyExpensesCents(h));
  }

  function quizComplete(tables) {
    if (!tables || !tables.dndRules || !tables.dndScoring) return false;
    var p = profile();
    if (p.declaredMethod && p.declaredMethod !== 'featsOfStrength') {
      var scores = p.declaredScores || {};
      return tables.dndRules.subStats.filter(function (s) { return s.kind === 'declared'; })
        .every(function (s) { return Money.isEntered(scores[s.id]); });
    }
    var quiz = p.quiz || {};
    return tables.dndRules.subStats.filter(function (s) { return s.kind === 'declared'; })
      .every(function (s) {
        var answers = quiz[s.id] || {};
        return (tables.dndScoring.quiz[s.id] || []).every(function (_, i) {
          return Money.isEntered(answers[i]);
        });
      });
  }

  function tier(tables) {
    if (moneyEntered()) return 2;
    return quizComplete(tables) ? 1 : 0;
  }

  /**
   * Append an encounter to the log. The record shape is general on purpose
   * (BRIEF §9.3): `source` distinguishes an encounter a DM set from one you
   * logged yourself, which is what T10's "what just happened?" flow will
   * append to. Nothing reads `source` yet; it is here so the log does not
   * need migrating later.
   */
  function logEncounter(rec) {
    var p = profile();
    if (!Array.isArray(p.encounters)) p.encounters = [];
    p.encounters.unshift({
      on: new Date().toISOString(),
      monsterId: rec.monsterId || null,
      outcome: rec.outcome || null,
      reason: rec.reason || null,
      damageWeeks: Money.isEntered(rec.damageWeeks) ? rec.damageWeeks : null,
      source: rec.source || 'self'
    });
    /* Keep the log bounded — this lives in localStorage alongside everything
       else, and an unbounded list is how that quietly fills up. */
    if (p.encounters.length > 50) p.encounters.length = 50;
    save();
    return p.encounters;
  }

  function encounters() { return profile().encounters || []; }

  function reset() {
    state = blank();
    try { self.localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
    listeners.forEach(function (fn) { try { fn(); } catch (e) { /* one bad listener */ } });
  }

  return {
    KEY: KEY, ID: ID,
    household: household, profile: profile, onChange: onChange,
    patchProfile: patchProfile, setMoney: setMoney, setDebt: setDebt, setDebtRate: setDebtRate,
  setFilingStatus: setFilingStatus,
    moneyEntered: moneyEntered, quizComplete: quizComplete, tier: tier,
    logEncounter: logEncounter, encounters: encounters,
    reset: reset, save: save
  };
});
