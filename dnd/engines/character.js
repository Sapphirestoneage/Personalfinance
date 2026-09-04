/* ==========================================================================
   engines/character.js — Dungeons & Dividends, the scoring engine.
   --------------------------------------------------------------------------
   The rulebook (data/dnd_rules.json, data/dnd_classes.json) says what the
   system IS. This file is the only place that turns a household into numbers,
   and it holds no thresholds of its own — every dollar-to-score rung lives in
   data/dnd_scoring.json so a recalibration is a data edit, not a code change.

   Three rules from CLAUDE.md shape everything here:

   1. EMPTY IS NOT ZERO. A sub-stat with no input is an incomplete Result, not
      an 8. A main stat is incomplete until all three of its sub-stats score —
      averaging two real numbers with a silent zero would invent a character.
   2. NO PRIVATE COPIES. Income, expenses, cash, investments, assets and debts
      are read through Schema/Tier0 from the household every other room writes.
      This engine owns nothing that already has an owner in shared/ownership.js.
   3. ONE FORMULA, ONE FUNCTION. Savings rate, emergency-fund months, the FIRE
      number and FIRE progress are Tier0's. They are CALLED, never re-derived —
      Level is a reading of Tier0.fireProgress, not a second FIRE calculation.

   HP is in WEEKS. Rulebook §3A defines HP twice and incompatibly: once as the
   D&D die formula, once as "how many months of expenses your liquid assets can
   cover". At 1 HP = 1 week the two finally agree in scale — a Level 1 d6 class
   is ~6 weeks of runway, a Level 20 d12 with good CON is ~4 years — so Max HP
   is the die formula (capacity) and Current HP is measured runway, in the same
   unit. DECISIONS.md D-046.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Tier0: require('./tier0.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Tier0: root.SLAF && root.SLAF.Tier0
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Character = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0) {
  'use strict';

  var WEEKS_PER_YEAR = 52;
  var MONTHS_PER_YEAR = 12;
  var STAT_IDS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

  function profileOf(household) { return (household && household.dndProfile) || {}; }
  function clampScore(n) { return Math.max(8, Math.min(20, n)); }

  /* ---- The 8-20 scale ---------------------------------------------------
     A ladder is a list of {v, s} rungs. Between two rungs the score moves
     linearly; outside the ends it flattens rather than extrapolating, because
     an income of $10m should read 20, not 47.                              */

  function fromLadder(ladder, value, descending) {
    var rungs = ladder.slice();
    if (descending) rungs.reverse();          /* ascending in v, always */
    if (value <= rungs[0].v) return rungs[0].s;
    var last = rungs[rungs.length - 1];
    if (value >= last.v) return last.s;
    for (var i = 0; i < rungs.length - 1; i++) {
      var a = rungs[i], b = rungs[i + 1];
      if (value >= a.v && value <= b.v) {
        if (b.v === a.v) return b.s;
        return a.s + (b.s - a.s) * ((value - a.v) / (b.v - a.v));
      }
    }
    return last.s;
  }

  /** A ladder score as a Result, rounded and clamped. */
  function scoreFromAnchor(anchors, id, value) {
    var a = anchors[id];
    if (!a || !a.ladder) return Money.incomplete('No ladder for ' + id + '.', [id]);
    if (!Money.isEntered(value)) return Money.incomplete('Not entered yet.', [id]);
    var raw = fromLadder(a.ladder, value, !!a.descending);
    return Money.ok(clampScore(Math.round(raw)), { raw: raw, input: value });
  }

  function modifier(score) { return Math.floor((score - 10) / 2); }

  function formatModifier(mod) { return (mod >= 0 ? '+' : '') + mod; }

  /* ---- Household readings ------------------------------------------------
     Each returns a Result. Nothing here coerces a missing figure to zero. */

  function annualExpensesCents(household) {
    var m = Schema.monthlyExpensesCents(household);
    return Money.isOk(m) ? Money.ok(m.value * MONTHS_PER_YEAR) : m;
  }

  function weeklyExpensesCents(household) {
    var a = annualExpensesCents(household);
    return Money.isOk(a) ? Money.ok(a.value / WEEKS_PER_YEAR) : a;
  }

  /** Assets flagged liquid — the ones HP is actually made of. */
  function liquidAssetsCents(household) {
    var cash = Schema.cashCents(household);
    var assets = Schema.aggregatableAssets ? Schema.aggregatableAssets(household) : [];
    var extra = 0, sawAny = Money.isOk(cash);
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      if (a.liquid && a.category !== 'cash' && Money.isEntered(a.valueCents)) {
        extra += a.valueCents; sawAny = true;
      }
    }
    if (!sawAny) return Money.incomplete('Add your cash and savings to see this.', ['cashSavings']);
    return Money.ok((Money.isOk(cash) ? cash.value : 0) + extra);
  }

  function assetsByCategory(household, categories) {
    var assets = Schema.aggregatableAssets ? Schema.aggregatableAssets(household) : [];
    var total = 0, counted = 0;
    for (var i = 0; i < assets.length; i++) {
      if (categories.indexOf(assets[i].category) !== -1 && Money.isEntered(assets[i].valueCents)) {
        total += assets[i].valueCents; counted++;
      }
    }
    return { totalCents: total, counted: counted };
  }

  function debtsOfType(household, types) {
    var debts = Schema.aggregatableDebts ? Schema.aggregatableDebts(household) : [];
    var out = [];
    for (var i = 0; i < debts.length; i++) {
      if (types.indexOf(debts[i].type) !== -1) out.push(debts[i]);
    }
    return out;
  }

  function sumBalances(list) {
    var t = 0;
    for (var i = 0; i < list.length; i++) if (Money.isEntered(list[i].balanceCents)) t += list[i].balanceCents;
    return t;
  }

  /* ---- The nine computed sub-stats -------------------------------------- */

  function computedSubStats(household, tables) {
    var scoring = tables && tables.dndScoring;
    var out = {};
    if (!scoring) return out;
    var anchors = scoring.anchors;
    var p = profileOf(household);

    /* STR — Income Power: gross annual income against the population ladder. */
    var gross = Schema.grossAnnualIncomeCents(household);
    out.incomePower = Money.isOk(gross)
      ? scoreFromAnchor(anchors, 'incomePower', gross.value / 100)
      : Money.incomplete('Add your gross annual income.', ['grossAnnualIncome']);

    /* STR — Income Trajectory: 3-year compound growth of that income. */
    if (Money.isOk(gross) && Money.isEntered(p.incomeThreeYearsAgoCents) && p.incomeThreeYearsAgoCents > 0) {
      var cagr = Math.pow(gross.value / p.incomeThreeYearsAgoCents, 1 / 3) - 1;
      out.incomeTrajectory = scoreFromAnchor(anchors, 'incomeTrajectory', cagr);
    } else {
      out.incomeTrajectory = Money.incomplete(
        'Add what you earned three years ago to see your trajectory.', ['incomeThreeYearsAgo']);
    }

    /* STR — Hustle Capacity: side income as a share of the main income,
       plus a readiness bonus for a named, deployable skill. */
    if (Money.isOk(gross) && gross.value > 0 && Money.isEntered(p.sideIncomeAnnualCents)) {
      var ratio = p.sideIncomeAnnualCents / gross.value;
      var base = scoreFromAnchor(anchors, 'hustleCapacity', ratio);
      var bonusTable = anchors.hustleCapacity.readinessBonus || {};
      var bonus = Money.isEntered(bonusTable[p.hustleReadiness]) ? bonusTable[p.hustleReadiness] : 0;
      out.hustleCapacity = Money.isOk(base)
        ? Money.ok(clampScore(base.value + bonus), { raw: base.raw, input: ratio, bonus: bonus })
        : base;
    } else {
      out.hustleCapacity = Money.incomplete(
        'Add your side income (enter 0 if none) to score this.', ['sideIncome']);
    }

    /* DEX — Liquidity Agility: the share of everything you own that you could
       actually reach in a week without a penalty. */
    var liquid = liquidAssetsCents(household);
    var totalAssets = Schema.totalAssetsCents(household);
    if (Money.isOk(liquid) && Money.isOk(totalAssets) && totalAssets.value > 0) {
      out.liquidityAgility = scoreFromAnchor(anchors, 'liquidityAgility', liquid.value / totalAssets.value);
    } else if (Money.isOk(liquid) && Money.isOk(totalAssets) && totalAssets.value === 0) {
      out.liquidityAgility = Money.incomplete(
        'With nothing owned yet there is no share to take.', ['assets']);
    } else {
      out.liquidityAgility = Money.incomplete('Add your cash and assets.', ['cashSavings', 'assets']);
    }

    /* DEX — Structural Mobility: a checklist, not a dollar figure. */
    out.structuralMobility = checklistScore(anchors.structuralMobility, p.mobility);

    /* DEX — Obligation Flexibility: how much of the monthly outflow is locked. */
    out.obligationFlex = Money.isEntered(p.fixedCostShare)
      ? scoreFromAnchor(anchors, 'obligationFlex', p.fixedCostShare)
      : Money.incomplete('Say roughly what share of your spending is fixed.', ['fixedCostShare']);

    /* CON — Savings Rate: Tier0 owns this formula. */
    var rates = Tier0.savingsRate(household, tables);
    var rate = Money.isOk(rates.includingMatch) ? rates.includingMatch : rates.excludingMatch;
    out.savingsRate = Money.isOk(rate)
      ? scoreFromAnchor(anchors, 'savingsRate', rate.value)
      : Money.incomplete(rate.reason || 'Add income and expenses.', rate.missing || ['savingsRate']);

    /* CON — Consistency: years at that rate, capped until disruption-tested. */
    if (Money.isEntered(p.yearsSustained)) {
      var c = scoreFromAnchor(anchors, 'consistency', p.yearsSustained);
      var cap = anchors.consistency.untestedCap;
      out.consistency = (Money.isOk(c) && !p.disruptionSurvived && Money.isEntered(cap))
        ? Money.ok(Math.min(c.value, cap), { raw: c.raw, input: p.yearsSustained, capped: true })
        : c;
    } else {
      out.consistency = Money.incomplete('Say how long you have held this savings rate.', ['yearsSustained']);
    }

    /* CON — Reserve Depth: Tier0 owns emergency-fund months. */
    var months = Tier0.emergencyFundMonths(household);
    out.reserveDepth = Money.isOk(months)
      ? scoreFromAnchor(anchors, 'reserveDepth', months.value)
      : Money.incomplete(months.reason || 'Add cash and monthly expenses.', months.missing || ['reserve']);

    return out;
  }

  /** Base 8 plus checklist points, for the one sub-stat with no dollar input. */
  function checklistScore(anchor, answers) {
    if (!anchor || !anchor.checklist) return Money.incomplete('No checklist defined.', []);
    var a = answers || {};
    var total = 0, missing = [];
    for (var i = 0; i < anchor.checklist.length; i++) {
      var item = anchor.checklist[i];
      var picked = a[item.id];
      if (!Money.isEntered(picked)) { missing.push(item.id); continue; }
      var opt = item.options[picked];
      if (!opt) { missing.push(item.id); continue; }
      total += opt.points;
    }
    if (missing.length) {
      return Money.incomplete('Answer all ' + anchor.checklist.length + ' mobility questions.', missing);
    }
    return Money.ok(clampScore(8 + total), { input: total });
  }

  /* ---- The nine declared sub-stats --------------------------------------
     Generated, not measured. Five methods, exactly as D&D Beyond offers for
     ability scores — the quiz is the "earn it" path, the rest are the same
     shortcuts a table allows. Whichever produced the number, it lands on the
     same 8-20 scale, so nothing downstream needs to know which was used.   */

  function declaredSubStats(household, tables) {
    var scoring = tables && tables.dndScoring;
    var rules = tables && tables.dndRules;
    if (!scoring || !rules) return {};
    var p = profileOf(household);
    var method = p.declaredMethod || 'featsOfStrength';
    var ids = declaredIds(rules);
    var out = {};

    if (method === 'featsOfStrength') {
      for (var i = 0; i < ids.length; i++) out[ids[i]] = quizScore(scoring, p, ids[i]);
      return out;
    }
    /* Every other method stores nine numbers directly. */
    var given = p.declaredScores || {};
    for (var j = 0; j < ids.length; j++) {
      var id = ids[j];
      out[id] = Money.isEntered(given[id])
        ? Money.ok(clampScore(Math.round(given[id])), { method: method })
        : Money.incomplete('Not assigned yet.', [id]);
    }
    return out;
  }

  function declaredIds(rules) {
    return rules.subStats.filter(function (s) { return s.kind === 'declared'; })
      .map(function (s) { return s.id; });
  }

  function computedIds(rules) {
    return rules.subStats.filter(function (s) { return s.kind === 'computed'; })
      .map(function (s) { return s.id; });
  }

  /** 8 + two answers worth 0-6 each. Lands on 8-20 with no rescaling. */
  function quizScore(scoring, profile, subStatId) {
    var questions = scoring.quiz[subStatId];
    if (!questions) return Money.incomplete('No questions for ' + subStatId + '.', [subStatId]);
    var answers = (profile.quiz || {})[subStatId] || {};
    var total = 0;
    for (var i = 0; i < questions.length; i++) {
      var picked = answers[i];
      if (!Money.isEntered(picked)) {
        return Money.incomplete('Answer both questions to score this.', [subStatId]);
      }
      var opt = questions[i].options[picked];
      if (!opt) return Money.incomplete('Answer both questions to score this.', [subStatId]);
      total += opt.points;
    }
    return Money.ok(clampScore(8 + total), { input: total });
  }

  /* ---- All 18, then the 6 ----------------------------------------------- */

  function allSubStats(household, tables) {
    var computed = computedSubStats(household, tables);
    var declared = declaredSubStats(household, tables);
    var out = {};
    for (var k in computed) if (Object.prototype.hasOwnProperty.call(computed, k)) out[k] = computed[k];
    for (var d in declared) if (Object.prototype.hasOwnProperty.call(declared, d)) out[d] = declared[d];
    return out;
  }

  /**
   * A main stat is the average of its three sub-stats, rounded — and it is
   * INCOMPLETE until all three score. Averaging what is present would quietly
   * treat "not answered" as a value, which is the exact bug CLAUDE.md's
   * "Empty is not zero" rule exists to prevent.
   */
  function mainStats(subScores, tables) {
    var rules = tables && tables.dndRules;
    var out = {};
    if (!rules) return out;
    for (var i = 0; i < STAT_IDS.length; i++) {
      var statId = STAT_IDS[i];
      var members = rules.subStats.filter(function (s) { return s.stat === statId; });
      var sum = 0, missing = [], have = [];
      for (var j = 0; j < members.length; j++) {
        var r = subScores[members[j].id];
        if (r && Money.isOk(r)) { sum += r.value; have.push(members[j].id); }
        else missing.push(members[j].id);
      }
      if (missing.length) {
        out[statId] = Money.incomplete(
          have.length + ' of ' + members.length + ' sub-stats scored.', missing);
      } else {
        var score = Math.round(sum / members.length);
        out[statId] = Money.ok(score, { modifier: modifier(score), average: sum / members.length });
      }
    }
    return out;
  }

  /* ---- Level -------------------------------------------------------------
     A reading of Tier0.fireProgress, never a second FIRE calculation. Within
     a band the levels divide the percentage range evenly, and a value sitting
     exactly on a boundary belongs to the higher band.                      */

  function levelFromProgress(pct, tables) {
    var rules = tables && tables.dndRules;
    if (!rules) return Money.incomplete('Rules not loaded.', ['dndRules']);
    if (!Money.isEntered(pct)) return Money.incomplete('Not enough entered to place a level.', ['fireProgress']);
    var bands = rules.levelBands;
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      var isLast = b.maxPct === null;
      if (isLast) {
        if (pct >= b.minPct) return Money.ok(b.minLevel, { band: b, pct: pct });
        continue;
      }
      if (pct >= b.minPct && pct < b.maxPct) {
        var span = b.maxLevel - b.minLevel + 1;
        var within = (pct - b.minPct) / (b.maxPct - b.minPct);
        var lvl = b.minLevel + Math.min(span - 1, Math.floor(within * span));
        return Money.ok(lvl, { band: b, pct: pct });
      }
    }
    return Money.ok(1, { band: bands[0], pct: pct });
  }

  function level(household, tables) {
    var progress = Tier0.fireProgress(household, tables);
    if (!Money.isOk(progress)) {
      return Money.incomplete(
        progress.reason || 'Add expenses and investments to place your level.',
        progress.missing || ['monthlyExpenses', 'investments']);
    }
    return levelFromProgress(progress.value, tables);
  }

  function proficiencyBonus(lvl, tables) {
    var rows = tables.dndRules.proficiencyBonus;
    for (var i = 0; i < rows.length; i++) {
      if (lvl >= rows[i].minLevel && lvl <= rows[i].maxLevel) return rows[i].bonus;
    }
    return rows[rows.length - 1].bonus;
  }

  /* ---- Debt Burden ------------------------------------------------------
     "High interest" is data/foo_rules.json's highInterestDebtRate, reused
     rather than redefined, so the two rooms cannot drift apart.           */

  function debtBurden(household, tables) {
    var p = profileOf(household);
    var debts = Schema.aggregatableDebts ? Schema.aggregatableDebts(household) : [];
    var withBalance = debts.filter(function (d) {
      return Money.isEntered(d.balanceCents) && d.balanceCents > 0;
    });
    if (!withBalance.length) return Money.ok(0, { reason: 'No debt entered.' });

    var foo = tables && tables.fooRules;
    var hiRate = foo && foo.thresholds && Money.isEntered(foo.thresholds.highInterestDebtRate)
      ? foo.thresholds.highInterestDebtRate : null;
    if (hiRate === null) {
      return Money.incomplete('The high-interest threshold is not loaded.', ['fooRules']);
    }
    var highInterest = withBalance.filter(function (d) {
      return Money.isEntered(d.rate) && d.rate >= hiRate;
    });

    var lvl = 1;                                   /* debt exists at all */
    if (highInterest.length >= 1) lvl = 2;
    if (highInterest.length >= 2) lvl = 3;
    if (p.missedPayments === true) lvl = 4;
    if (p.inInsolvency === true) lvl = 5;

    var row = tables.dndRules.debtBurden[lvl];
    return Money.ok(lvl, {
      row: row,
      highInterestCount: highInterest.length,
      highInterestRate: hiRate,
      totalDebtCents: sumBalances(withBalance)
    });
  }

  /* ---- HP, in weeks ----------------------------------------------------- */

  function maxHp(hitDie, lvl, conMod, burdenLevel, tables) {
    var perLevel = Math.ceil((hitDie + 1) / 2);
    var minGain = tables.dndScoring.hp.minGainPerLevel;
    var total = hitDie + conMod;
    for (var l = 2; l <= lvl; l++) total += Math.max(minGain, perLevel + conMod);
    total = Math.max(1, total);
    var pen = tables.dndScoring.hp.debtBurdenMaxHpPenalty;
    var reduced = Money.isEntered(burdenLevel) && burdenLevel >= pen.level;
    if (reduced) total = Math.floor(total * pen.factor);
    return { weeks: Math.max(1, total), reducedByDebt: reduced };
  }

  function currentHp(household) {
    var liquid = liquidAssetsCents(household);
    var weekly = weeklyExpensesCents(household);
    if (!Money.isOk(liquid)) return liquid;
    if (!Money.isOk(weekly)) return weekly;
    if (weekly.value <= 0) {
      return Money.incomplete('Monthly expenses need to be above zero to measure runway.', ['monthlyExpenses']);
    }
    return Money.ok(Math.floor(liquid.value / weekly.value), {
      liquidCents: liquid.value, weeklyCents: weekly.value
    });
  }

  /* ---- Armour Class ------------------------------------------------------
     10 + DEX, then layered coverage. Only the emergency-fund shield's +2 is
     stated in the rulebook; the rest are agreed values living in data/.    */

  function armorClass(household, tables, dexMod, lvl, activeClassCount, burdenLevel) {
    var p = profileOf(household);
    var rules = tables.dndRules;
    var layers = [];
    var ac = 10 + dexMod;
    layers.push({ id: 'base', label: 'Unarmoured (10 + DEX)', ac: 10 + dexMod });

    var months = Tier0.emergencyFundMonths(household);
    var shield = rules.armor.filter(function (a) { return a.id === 'emergencyFund'; })[0];
    if (Money.isOk(months) && months.value >= 3) {
      ac += shield.ac; layers.push({ id: 'emergencyFund', label: shield.label, ac: shield.ac });
    }
    var health = rules.armor.filter(function (a) { return a.id === 'healthIns'; })[0];
    if (Money.isEntered(p.healthCoverage) && health.scales[p.healthCoverage]) {
      var hv = health.scales[p.healthCoverage];
      ac += hv; layers.push({ id: 'healthIns', label: health.label, ac: hv });
    }
    var dis = rules.armor.filter(function (a) { return a.id === 'disabilityIns'; })[0];
    if (p.disabilityInsurance === true) {
      ac += dis.ac; layers.push({ id: 'disabilityIns', label: dis.label, ac: dis.ac });
    }
    var umb = rules.armor.filter(function (a) { return a.id === 'umbrella'; })[0];
    if (p.umbrellaPolicy === true) {
      ac += umb.ac; layers.push({ id: 'umbrella', label: umb.label, ac: umb.ac });
    }
    if (activeClassCount >= 2) {
      var pb = proficiencyBonus(lvl, tables);
      ac += pb; layers.push({ id: 'diversified', label: 'Diversification across Classes', ac: pb });
    }
    /* §3C: Debt Burden 3 reduces AC, 4 reduces it further. */
    var debtPenalty = 0;
    if (Money.isEntered(burdenLevel)) {
      if (burdenLevel >= 4) debtPenalty = 3;
      else if (burdenLevel >= 3) debtPenalty = 2;
    }
    if (debtPenalty) { ac -= debtPenalty; layers.push({ id: 'debt', label: 'Debt Burden (credit damage)', ac: -debtPenalty }); }

    return Money.ok(Math.max(1, ac), { layers: layers });
  }

  /* ---- Class assignment --------------------------------------------------
     Diagnostic first: rank the seven levers by the dollars actually moving
     through each one, because a class here is a lever you pull, not a
     temperament. Ties break on the class's two primary stats.             */

  function leverActivity(household, tables) {
    var p = profileOf(household);
    var scoring = tables.dndScoring;
    var gross = Schema.grossAnnualIncomeCents(household);
    var out = {};

    var side = Money.isEntered(p.sideIncomeAnnualCents) ? p.sideIncomeAnnualCents : 0;
    var business = Money.isEntered(p.businessIncomeAnnualCents) ? p.businessIncomeAnnualCents : 0;
    /* A paycheque is The Earner's; anything self-generated is The Builder's.
       Side income counts as Builder activity only when no separate business
       income was given, so the same dollars are never credited twice. */
    var builderCents = Money.isEntered(p.businessIncomeAnnualCents) ? business : side;
    out.earner = Money.isOk(gross) ? Math.max(0, gross.value - side - business) : null;
    out.builder = builderCents;

    var invest = Schema.investmentsCents(household);
    var speculative = Money.isEntered(p.speculativeCents) ? p.speculativeCents : 0;
    out.compounder = Money.isOk(invest) ? Math.max(0, invest.value - speculative) : null;
    out.speculator = speculative;

    var property = assetsByCategory(household, ['real_estate']);
    var mortgages = sumBalances(debtsOfType(household, ['mortgage']));
    out.landholder = property.counted ? Math.max(0, property.totalCents - mortgages) : 0;

    var cash = liquidAssetsCents(household);
    out.anchor = Money.isOk(cash) ? cash.value : null;

    /* The Keeper owns no pool. Its activity is the annual dollars NOT spent
       against a same-income benchmark — which is what lets a genuinely frugal
       household out-rank a mid-sized portfolio, as §4 intends. */
    var annualSpend = annualExpensesCents(household);
    if (Money.isOk(gross) && Money.isOk(annualSpend)) {
      var benchmark = gross.value * scoring.classAssignment.keeperBenchmarkShare;
      out.keeper = Math.max(0, benchmark - annualSpend.value);
    } else {
      out.keeper = null;
    }
    return out;
  }

  function suggestClass(household, tables, statScores) {
    var activity = leverActivity(household, tables);
    var classes = tables.dndClasses.classes;
    var ranked = [];
    for (var i = 0; i < classes.length; i++) {
      var c = classes[i];
      var cents = activity[c.id];
      if (!Money.isEntered(cents)) continue;
      var tie = 0, n = 0;
      for (var s = 0; s < c.primary.length; s++) {
        var st = statScores[c.primary[s]];
        if (st && Money.isOk(st)) { tie += st.value; n++; }
      }
      ranked.push({ classId: c.id, name: c.name, cents: cents, tie: n ? tie / n : 0 });
    }
    if (!ranked.length) {
      return Money.incomplete('Add your income and balances to be sorted into a class.',
        ['grossAnnualIncome', 'investments', 'cashSavings']);
    }
    ranked.sort(function (a, b) { return b.cents - a.cents || b.tie - a.tie; });
    if (ranked[0].cents <= 0) {
      return Money.incomplete('Nothing is moving through any lever yet.', ['grossAnnualIncome']);
    }
    return Money.ok(ranked[0].classId, { ranked: ranked });
  }

  /**
   * A class leaning from the quiz alone, for a sheet with no money in it yet.
   *
   * This is deliberately NOT how a class is assigned once dollars exist. A
   * class in this system is a LEVER YOU PULL, so the real answer comes from
   * where money actually moves (suggestClass, above), and a leaning derived
   * from temperament can and often will disagree with it. Both are honest
   * answers to different questions, and the sheet says which one it is
   * showing rather than letting a temperament read pass for a diagnosis.
   */
  function suggestClassFromStats(subScores, tables) {
    var affinity = tables.dndScoring.tier1Affinity;
    var classes = tables.dndClasses.classes;
    var ranked = [];
    for (var i = 0; i < classes.length; i++) {
      var c = classes[i];
      var ids = (affinity && affinity.subStats[c.id]) || [];
      var sum = 0, n = 0;
      for (var j = 0; j < ids.length; j++) {
        var r = subScores[ids[j]];
        if (r && Money.isOk(r)) { sum += r.value; n++; }
      }
      if (!n) continue;
      ranked.push({
        classId: c.id, name: c.name, lever: c.lever,
        average: sum / n, scored: n, subStats: ids
      });
    }
    if (!ranked.length) {
      return Money.incomplete('Answer the questions to find your leaning.', ['declared']);
    }
    ranked.sort(function (a, b) { return b.average - a.average || b.scored - a.scored; });
    return Money.ok(ranked[0].classId, { ranked: ranked, fromStatsOnly: true });
  }

  function activeClassCount(ranked) {
    if (!ranked || !ranked.length) return 0;
    var top = ranked[0].cents;
    if (top <= 0) return 0;
    /* A lever counts as actively played once it carries a tenth of the largest. */
    return ranked.filter(function (r) { return r.cents >= top * 0.1 && r.cents > 0; }).length;
  }

  /* ---- Feats available at this level ------------------------------------ */

  function availableFeats(classId, subclassId, lvl, subScores, burdenLevel, tables) {
    var rules = tables.dndRules;
    var cls = classById(tables, classId);
    var open = [], locked = [];

    function consider(feat, source) {
      var entry = { name: feat.name, detail: feat.detail || feat.requires || '', source: source };
      var ok = true, why = null;
      if (feat.subStat) {
        var r = subScores[feat.subStat];
        if (!r || !Money.isOk(r)) { ok = false; why = 'Needs ' + feat.subStat + ' scored.'; }
        else if (r.value < feat.min) { ok = false; why = 'Needs ' + feat.subStat + ' ' + feat.min + '+ (you have ' + r.value + ').'; }
      }
      if (ok && Money.isEntered(feat.minLevel) && lvl < feat.minLevel) {
        ok = false; why = 'Unlocks at level ' + feat.minLevel + '.';
      }
      if (ok && feat.subclass && feat.subclass !== subclassId) {
        ok = false; why = 'Requires the ' + feat.subclass + ' subclass.';
      }
      entry.why = why;
      (ok ? open : locked).push(entry);
    }

    rules.generalFeats.forEach(function (f) { consider(f, 'General'); });
    if (cls) cls.feats.forEach(function (f) { consider(f, cls.name); });
    if (Money.isEntered(burdenLevel) && burdenLevel >= 1) {
      rules.universalDebtFeats.forEach(function (f) {
        var mapped = { name: f.name, detail: f.detail };
        if (/Hustle Capacity/.test(f.requires || '')) { mapped.subStat = 'hustleCapacity'; mapped.min = 13; }
        consider(mapped, 'Debt Burden');
      });
    }
    return { open: open, locked: locked };
  }

  function classById(tables, id) {
    var list = tables.dndClasses.classes;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** Which class-table rows this character has actually reached. */
  function featuresEarned(cls, lvl) {
    if (!cls) return [];
    return cls.levels.filter(function (r) { return r.level <= lvl; });
  }

  function subclassFeatures(cls, subclassId, lvl) {
    if (!cls || !subclassId) return [];
    var sub = cls.subclasses.filter(function (s) { return s.id === subclassId; })[0];
    if (!sub) return [];
    return sub.features.filter(function (f) { return f.level <= lvl; });
  }

  /* ---- Sheet furniture --------------------------------------------------
     The pieces a classic character sheet shows that are presentation over
     data we already hold. They live here rather than in the page so the
     numbers stay in one place and can be tested.                         */

  /**
   * Six saving throws, two of them proficient.
   * §3 gives every stat a save and each class proficiency in two of them;
   * proficiency adds the proficiency bonus, exactly as at a table.
   */
  function savingThrows(stats, cls, profBonus, tables) {
    var defs = tables.dndRules.stats;
    return defs.map(function (d) {
      var r = stats[d.id];
      var proficient = !!(cls && cls.saves.indexOf(d.id) !== -1);
      if (!r || !Money.isOk(r)) {
        return { stat: d.id, name: d.name, save: d.save, proficient: proficient, ok: false };
      }
      var mod = modifier(r.value) + (proficient ? profBonus : 0);
      return { stat: d.id, name: d.name, save: d.save, proficient: proficient, ok: true, modifier: mod };
    });
  }

  /** The 18 sub-stats as a skill list: modifier, parent stat, and whether the
   *  class's primary stats cover it (this system's nearest thing to training). */
  function skillList(subScores, cls, tables) {
    return tables.dndRules.subStats.map(function (m) {
      var r = subScores[m.id];
      var primary = !!(cls && cls.primary.indexOf(m.stat) !== -1);
      if (!r || !Money.isOk(r)) {
        return { id: m.id, name: m.name, stat: m.stat, primary: primary, ok: false };
      }
      return {
        id: m.id, name: m.name, stat: m.stat, primary: primary, ok: true,
        score: r.value, modifier: modifier(r.value)
      };
    });
  }

  /** Hit dice, written the way a sheet writes them: 3d8. */
  function hitDiceLabel(cls, lvl) {
    if (!cls || !Money.isEntered(lvl)) return null;
    return lvl + 'd' + cls.hitDie;
  }

  /**
   * A passive score — 10 + the modifier — for the three sub-stats that work
   * the way passive Perception does: they apply whether or not you thought
   * to look.
   */
  function passives(subScores, tables) {
    var wanted = [
      { id: 'threatDetection', label: 'Passive Threat Detection' },
      { id: 'scenarioForesight', label: 'Passive Foresight' },
      { id: 'instrumentLiteracy', label: 'Passive Instrument Sense' }
    ];
    return wanted.map(function (w) {
      var r = subScores[w.id];
      if (!r || !Money.isOk(r)) return { id: w.id, label: w.label, ok: false };
      return { id: w.id, label: w.label, ok: true, value: 10 + modifier(r.value) };
    });
  }

  /**
   * Resistances and immunities the character has actually earned, read off the
   * class and subclass features already unlocked. Nothing is invented: a
   * feature counts only if it says so in its own text.
   */
  function defenses(featuresEarned, subFeatures) {
    var out = [];
    function scan(text, source) {
      if (!text) return;
      if (/\bimmun/i.test(text)) out.push({ kind: 'Immunity', text: source });
      else if (/\bresistan/i.test(text)) out.push({ kind: 'Resistance', text: source });
    }
    (featuresEarned || []).forEach(function (f) { scan(f.feature + ' ' + f.detail, f.feature); });
    (subFeatures || []).forEach(function (f) { scan(f.feature, f.feature.split(' — ')[0]); });
    return out;
  }

  /* ---- Result format 5: The Spectrum (§12A) ----------------------------- */

  function spectrum(subScores, tables) {
    var rules = tables && tables.dndRules;
    if (!rules) return [];
    return rules.subStats.map(function (s) {
      var r = subScores[s.id];
      return {
        id: s.id, name: s.name, stat: s.stat,
        ok: !!(r && Money.isOk(r)),
        score: r && Money.isOk(r) ? r.value : null,
        percent: r && Money.isOk(r) ? ((r.value - 8) / 12) * 100 : null,
        reason: r && !Money.isOk(r) ? r.reason : null
      };
    }).sort(function (a, b) {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      return (b.percent || 0) - (a.percent || 0);
    });
  }

  /* ---- Projection --------------------------------------------------------
     The diagnostic half says where you are. This says what moves you, in the
     units the thing is actually measured in — dollars for Level, weeks for
     HP, a named rung for each sub-stat.                                    */

  function nextLevelTarget(household, tables, lvl) {
    var fireNumber = Tier0.fireNumber(household);
    if (!Money.isOk(fireNumber)) return fireNumber;
    if (lvl >= 20) return Money.ok(0, { atCap: true, fireNumberCents: fireNumber.value });
    var bands = tables.dndRules.levelBands;
    var band = null;
    for (var i = 0; i < bands.length; i++) {
      if (lvl >= bands[i].minLevel && lvl <= bands[i].maxLevel) { band = bands[i]; break; }
    }
    if (!band) return Money.incomplete('No band for level ' + lvl + '.', ['level']);
    var span = band.maxLevel - band.minLevel + 1;
    var stepPct = (band.maxPct - band.minPct) / span;
    var nextPct = band.minPct + stepPct * (lvl - band.minLevel + 1);
    var investments = Schema.investmentsCents(household);
    if (!Money.isOk(investments)) return investments;
    var needCents = Math.max(0, Math.round(fireNumber.value * nextPct) - investments.value);
    return Money.ok(needCents, {
      nextLevel: lvl + 1, nextPct: nextPct, fireNumberCents: fireNumber.value
    });
  }

  /** For each sub-stat that scored, the next rung and what reaches it. */
  function subStatNextRung(subStatId, currentScore, tables) {
    var a = tables.dndScoring.anchors[subStatId];
    if (!a || !a.ladder || !Money.isEntered(currentScore)) return null;
    var rungs = a.ladder;
    for (var i = 0; i < rungs.length; i++) {
      if (rungs[i].s > currentScore) {
        return { targetScore: rungs[i].s, targetValue: rungs[i].v, unit: a.unit };
      }
    }
    return null;
  }

  /* ---- The whole sheet -------------------------------------------------- */

  function sheet(household, tables) {
    if (!tables || !tables.dndRules || !tables.dndClasses || !tables.dndScoring) {
      return { ready: false, reason: 'The Dungeons & Dividends tables are not loaded.' };
    }
    var p = profileOf(household);
    var subScores = allSubStats(household, tables);
    var stats = mainStats(subScores, tables);

    var lvlResult = level(household, tables);
    var lvl = Money.isOk(lvlResult) ? lvlResult.value : 1;

    var burden = debtBurden(household, tables);
    var burdenLevel = Money.isOk(burden) ? burden.value : null;

    var suggested = suggestClass(household, tables, stats);
    var chosenId = p.classOverride || (Money.isOk(suggested) ? suggested.value : null);
    var cls = chosenId ? classById(tables, chosenId) : null;

    var conMod = Money.isOk(stats.CON) ? modifier(stats.CON.value) : null;
    var dexMod = Money.isOk(stats.DEX) ? modifier(stats.DEX.value) : null;

    var hp = null;
    if (cls && Money.isEntered(conMod)) {
      hp = maxHp(cls.hitDie, lvl, conMod, burdenLevel, tables);
    }
    var cur = currentHp(household);

    var classCount = Money.isOk(suggested) ? activeClassCount(suggested.ranked) : 0;
    var ac = Money.isEntered(dexMod)
      ? armorClass(household, tables, dexMod, lvl, classCount, burdenLevel)
      : Money.incomplete('DEX needs all three of its sub-stats before AC can be read.',
          ['liquidityAgility', 'structuralMobility', 'obligationFlex']);

    return {
      ready: true,
      subScores: subScores,
      stats: stats,
      spectrum: spectrum(subScores, tables),
      level: lvlResult,
      levelValue: lvl,
      proficiencyBonus: proficiencyBonus(lvl, tables),
      debtBurden: burden,
      suggestedClass: suggested,
      chosenClassId: chosenId,
      classOverridden: !!p.classOverride && Money.isOk(suggested) && p.classOverride !== suggested.value,
      klass: cls,
      subclassId: p.subclassId || null,
      subclassAvailable: lvl >= tables.dndClasses.cadence.subclassChosenAt,
      featuresEarned: featuresEarned(cls, lvl),
      subclassFeatures: subclassFeatures(cls, p.subclassId, lvl),
      feats: cls ? availableFeats(chosenId, p.subclassId, lvl, subScores, burdenLevel, tables)
                 : { open: [], locked: [] },
      maxHp: hp,
      currentHp: cur,
      armorClass: ac,
      nextLevel: nextLevelTarget(household, tables, lvl),
      alignment: p.alignment || null
    };
  }

  return {
    WEEKS_PER_YEAR: WEEKS_PER_YEAR,
    STAT_IDS: STAT_IDS,
    fromLadder: fromLadder,
    scoreFromAnchor: scoreFromAnchor,
    modifier: modifier,
    formatModifier: formatModifier,
    declaredIds: declaredIds,
    computedIds: computedIds,
    quizScore: quizScore,
    checklistScore: checklistScore,
    computedSubStats: computedSubStats,
    declaredSubStats: declaredSubStats,
    allSubStats: allSubStats,
    mainStats: mainStats,
    levelFromProgress: levelFromProgress,
    level: level,
    proficiencyBonus: proficiencyBonus,
    debtBurden: debtBurden,
    maxHp: maxHp,
    currentHp: currentHp,
    armorClass: armorClass,
    leverActivity: leverActivity,
    suggestClass: suggestClass,
    suggestClassFromStats: suggestClassFromStats,
    availableFeats: availableFeats,
    classById: classById,
    featuresEarned: featuresEarned,
    subclassFeatures: subclassFeatures,
    savingThrows: savingThrows,
    skillList: skillList,
    hitDiceLabel: hitDiceLabel,
    passives: passives,
    defenses: defenses,
    spectrum: spectrum,
    nextLevelTarget: nextLevelTarget,
    subStatNextRung: subStatNextRung,
    liquidAssetsCents: liquidAssetsCents,
    weeklyExpensesCents: weeklyExpensesCents,
    sheet: sheet
  };
});
