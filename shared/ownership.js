/* ==========================================================================
   shared/ownership.js — every shared number has exactly ONE owning room.
   --------------------------------------------------------------------------
   The problem this fixes: the same figure was editable in several places.
   Monthly debt payments could be typed into the Financial Snapshot as a lump
   sum, itemised again per-debt in Debt Payoff, AND typed a third time as a
   "Debt minimums" category in Cash Flow. Three editable copies of one number
   is exactly what CLAUDE.md's guardrail forbids, and it is how the three
   quietly drift apart.

   The rule from here on:

       A shared field is EDITABLE in exactly one room — its owner.
       Everywhere else it renders READ-ONLY, showing the current value and
       linking to the room that owns it.

   So a number you see somewhere it isn't owned is always a link, and the
   link always lands on the question that produces it. Nothing is entered
   twice, and there is never a stale second copy to reconcile.

   Adding a shared field means adding it to FIELDS here — that is the single
   place the ownership map lives.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('./money.js'),
      Schema: require('./schema.js'),
      Registry: require('./registry.js'),
      Spine: require('./spine-v2.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Registry: root.SLAF && root.SLAF.Registry,
      Spine: root.SLAF && root.SLAF.Spine
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Registry, deps.Spine);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Ownership = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Registry, Spine) {
  'use strict';

  var FILING_LABELS = {
    single: 'Single',
    married_joint: 'Married, filing jointly',
    married_separate: 'Married, filing separately',
    head_of_household: 'Head of household'
  };

  var EMPLOYMENT_LABELS = (function () {
    var out = {};
    (Schema.EMPLOYMENT_STATUSES || []).forEach(function (row) { out[row.id] = row.short; });
    return out;
  })();

  function money(v) { return Money.formatCents(v); }

  /* Resolved at call time rather than at load, so a page that never loads
     staleness.js still gets a chip (without an age), and script order does
     not matter. */
  function stalenessModule() {
    if (typeof module === 'object' && module.exports) {
      try { return require('./staleness.js'); } catch (e) { return null; }
    }
    var g = (typeof self !== 'undefined') ? self : null;
    return g && g.SLAF && g.SLAF.Staleness ? g.SLAF.Staleness : null;
  }

  /* ---- The one write path for a Tier 0 asset ------------------------------
     Start Here and the Refresh page both set cash and investments. They are
     the SAME record either way — this is the single function that writes
     it, so there is no second copy to drift. DECISIONS.md D-057. */
  var CASH_ID = 'tier0_cash';
  var INVEST_ID = 'tier0_investments';

  function assetByCategory(h, categories) {
    var list = (h && h.assets) || [];
    for (var i = 0; i < list.length; i++) {
      if (categories.indexOf(list[i].category) !== -1) return list[i];
    }
    return null;
  }

  function writeAsset(categories, canonicalCategory, liquid, label, cents) {
    if (!Spine) throw new Error('Ownership.write needs the spine');
    var person = Spine.ensurePrimaryPerson('You');
    var h = Spine.getProfile();
    var existing = assetByCategory(h, categories);
    return Spine.upsertAsset({
      id: existing ? existing.id : (canonicalCategory === 'cash' ? CASH_ID : INVEST_ID),
      label: existing && existing.label ? existing.label : label,
      category: existing ? existing.category : canonicalCategory,
      valueCents: cents,
      liquid: liquid,
      ownerIds: existing && existing.ownerIds && existing.ownerIds.length ? existing.ownerIds : [person.id]
    });
  }

  /* ---- The ownership map -------------------------------------------------
     owner   — the room id that may EDIT this field
     anchor  — the section in that room to land on
     read    — pull the current value out of the household, as a Result
     format  — how to show it once read                                    */

  function allocationRow(slice, label) {
    return {
      label: label, owner: 'accounts', anchor: 'allocation',
      read: function (h) {
        var v = (h.allocation || {})[slice];
        return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not set.', ['allocation.' + slice]);
      },
      format: function (v) { return Money.formatRate(v, { decimals: 0 }); }
    };
  }

  var FIELDS = {
    dob: {
      label: 'Date of birth', owner: 'start', anchor: 'q-about',
      read: function (h) {
        var p = Schema.primaryPerson(h);
        return p && p.dob ? Money.ok(p.dob) : Money.incomplete('Not set yet.', ['dob']);
      },
      format: function (v) {
        var d = new Date(v + 'T00:00:00Z');
        return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-US',
          { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      }
    },
    age: {
      label: 'Age', owner: 'start', anchor: 'q-about',
      read: function (h) {
        var a = Schema.primaryAge(h);
        return Money.isEntered(a) ? Money.ok(a) : Money.incomplete('Not set yet.', ['dob']);
      },
      format: function (v) { return v + ''; }
    },
    state: {
      label: 'State', owner: 'start', anchor: 'q-about',
      read: function (h) { return h.state ? Money.ok(h.state) : Money.incomplete('Not set yet.', ['state']); },
      format: function (v) { return v; }
    },
    filingStatus: {
      label: 'Filing status', owner: 'start', anchor: 'q-about',
      read: function (h) {
        return h.filingStatus ? Money.ok(h.filingStatus) : Money.incomplete('Not set yet.', ['filingStatus']);
      },
      format: function (v) { return FILING_LABELS[v] || v; }
    },
    grossAnnualIncome: {
      label: 'Gross annual income', owner: 'start', anchor: 'q-income',
      read: function (h) { return Schema.grossAnnualIncomeCents(h); },
      format: money,
      /* Between jobs with nothing coming in, income is not a question the
         app should keep asking; the runway is the number now. Anything
         entered — a partner's pay, a benefit typed as income — still
         counts, and then the row applies as before. D-092. */
      applies: function (h) { return !(Schema.isUnemployed(h) && !Money.isOk(Schema.grossAnnualIncomeCents(h))); },
      notApplicableBecause: 'Between jobs — the runway is the number that matters now.'
    },
    unemployment: {
      label: 'Between jobs', owner: 'start', anchor: 'q-unemployed',
      read: function (h) {
        var u = Schema.unemploymentOf(h);
        return u.benefitStatus ? Money.ok(u.benefitStatus, { unemployment: u })
          : Money.incomplete('Say whether unemployment is coming.', ['unemployment']);
      },
      format: function (v) {
        return { receiving: 'getting unemployment', applied: 'applied, waiting', notApplied: 'not applied', ineligible: 'not eligible' }[v] || v;
      },
      applies: function (h) { return Schema.isUnemployed(h); },
      notApplicableBecause: 'You are working.'
    },
    cashSavings: {
      label: 'Cash & savings', owner: 'start', anchor: 'q-cash',
      read: function (h) { return Schema.cashCents(h); },
      format: money,
      write: function (cents) { return writeAsset(['cash'], 'cash', true, 'Cash & savings', cents); }
    },
    investments: {
      label: 'Investments + retirement', owner: 'start', anchor: 'q-investments',
      read: function (h) { return Schema.investmentsCents(h); },
      format: money,
      write: function (cents) {
        return writeAsset(['investment', 'retirement'], 'investment', false, 'Investments + retirement', cents);
      }
    },
    employmentStatus: {
      label: 'Working situation', owner: 'start', anchor: 'q-employment',
      read: function (h) {
        var p = Schema.primaryPerson(h);
        var v = p && p.employmentStatus;
        return v ? Money.ok(v) : Money.incomplete('Not answered yet.', ['employmentStatus']);
      },
      format: function (v) { return EMPLOYMENT_LABELS[v] || v; }
    },
    employerMatch: {
      label: 'Employer match', owner: 'start', anchor: 'q-plan',
      read: function (h) { return Schema.employerMatchCents(h); },
      format: function (v) { return money(v) + '/yr'; },
      /* No employer, no match to ask about. See applies() below. */
      applies: function (h) { return Schema.couldHaveEmployerMatch(h); },
      notApplicableBecause: 'You said there is no employer.'
    },
    capturingFullMatch: {
      label: 'Capturing the full match', owner: 'start', anchor: 'q-plan',
      /* Derived from what you contribute against the cap once both are
         known; the stored yes/no is only the fallback. D-061. */
      read: function (h) { return Schema.capturingFullMatchDerived(h); },
      format: function (v) { return v ? 'Yes' : 'No'; },
      applies: function (h) { return Schema.capturingQuestionApplies(h); },
      notApplicableBecause: 'There is no match to capture.'
    },
    hasDebt: {
      label: 'Any debt', owner: 'start', anchor: 'q-debt',
      read: function (h) {
        var m = (h.meta || {});
        if (m.hasDebt === true) return Money.ok(true);
        if (m.hasDebt === false) return Money.ok(false);
        return Money.incomplete('Not answered yet.', ['hasDebt']);
      },
      format: function (v) { return v ? 'Yes' : 'None'; }
    },

    /* Where It Goes owns your retirement setup. These were asked by the FOO
       ladder AND by Where It Goes, and kept by neither — the same question
       twice, forgotten twice. DECISIONS.md D-052. */
    contributionPercent: {
      label: 'Workplace contribution', owner: 'start', anchor: 'q-plan',
      read: function (h) {
        var v = (h.retirement || {}).contributionPercent;
        return Money.isEntered(v) ? Money.ok(v)
          : Money.incomplete('Not answered yet.', ['contributionPercent']);
      },
      format: function (v) { return v + '% of salary'; },
      /* A workplace plan needs a workplace. The self-employed have a solo
         401(k) with no match, which is a different question (T3). */
      applies: function (h) { return Schema.couldHaveEmployerMatch(h); },
      notApplicableBecause: 'You said there is no employer.'
    },
    rothContributed: {
      label: 'Roth so far this year', owner: 'accounts', anchor: 'setup',
      read: function (h) {
        var v = (h.retirement || {}).rothContributedCents;
        return Money.isEntered(v) ? Money.ok(v)
          : Money.incomplete('Not answered yet.', ['rothContributedCents']);
      },
      format: money
    },
    hsaContributed: {
      label: 'HSA so far this year', owner: 'accounts', anchor: 'setup',
      read: function (h) {
        var v = (h.retirement || {}).hsaContributedCents;
        return Money.isEntered(v) ? Money.ok(v)
          : Money.incomplete('Not answered yet.', ['hsaContributedCents']);
      },
      format: money,
      /* Only a question on a high-deductible plan — there is no HSA to
         contribute to otherwise, so it must not count as unfinished. */
      applies: function (h) { return !!((h.retirement || {}).onHdhp); },
      notApplicableBecause: 'No HSA without a high-deductible plan.'
    },
    marginalRate: {
      label: 'Marginal tax rate', owner: 'accounts', anchor: 'setup',
      read: function (h) {
        var a = Schema.resolveAssumptions(h);
        return Money.isEntered(a.marginalRate) ? Money.ok(a.marginalRate)
          : Money.incomplete('Not answered yet.', ['marginalRate']);
      },
      format: function (v) { return Money.formatRate(v, { decimals: 0 }); }
    },

    /* Sleep At Night owns the deductible: it is the first thing a cash
       cushion has to cover, which is that room's whole subject. */
    highestDeductible: {
      label: 'Highest deductible', owner: 'start', anchor: 'q-deductible',
      read: function (h) {
        var v = (h.insurance || {}).highestDeductibleCents;
        return Money.isEntered(v) ? Money.ok(v)
          : Money.incomplete('Not answered yet.', ['highestDeductibleCents']);
      },
      format: money
    },

    /* The Coverage Checkup (D-071): four facts about your cover, asked in
       Sleep At Night, read by the Statement's worst plausible year. */
    oopMax: {
      label: 'Out-of-pocket maximum', owner: 'sleep-at-night', anchor: 'coverage',
      read: function (h) {
        var v = (h.insurance || {}).oopMaxCents;
        return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['oopMaxCents']);
      },
      format: money
    },
    termLife: {
      label: 'Term life in force', owner: 'sleep-at-night', anchor: 'coverage',
      read: function (h) {
        var v = (h.insurance || {}).termLifeCents;
        return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['termLifeCents']);
      },
      format: money,
      /* Life cover replaces an income someone else lives on. Nobody
         depending on it: not a gap, not a question. D-092. */
      applies: function (h) { var d = Schema.createDependents(h.dependents); return !(d && d.length === 0); },
      notApplicableBecause: 'Nobody depends on your income.'
    },
    dependents: {
      label: 'Anyone depending on your income', owner: 'start', anchor: 'q-fine-tune',
      read: function (h) {
        /* Stored as a list; a bare yes/no from before D-094 still reads. */
        var d = Schema.createDependents(h.dependents);
        return d ? Money.ok(d.length, { ages: d.map(function (x) { return x.age; }) }) : Money.incomplete('Not answered yet.', ['dependents']);
      },
      format: function (v) { return v === 0 ? 'No' : v + (v === 1 ? ' person' : ' people'); }
    },
    disabilityMonthly: {
      label: 'Disability benefit', owner: 'sleep-at-night', anchor: 'coverage',
      read: function (h) {
        var v = (h.insurance || {}).disabilityMonthlyCents;
        return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['disabilityMonthlyCents']);
      },
      format: function (v) { return money(v) + '/mo'; }
    },
    umbrella: {
      label: 'Umbrella policy', owner: 'sleep-at-night', anchor: 'coverage',
      read: function (h) {
        var v = (h.insurance || {}).umbrella;
        return typeof v === 'boolean' ? Money.ok(v) : Money.incomplete('Not answered yet.', ['umbrella']);
      },
      format: function (v) { return v ? 'Yes' : 'No'; }
    },

    /* ---- The tranche rooms (D-098): each owns the facts it asks. ---- */
    expectedSearchMonths: {
      label: 'Expected search, months', owner: 'between-jobs', anchor: 'inputs',
      read: function (h) { var v = Schema.unemploymentOf(h).expectedSearchMonths; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['expectedSearchMonths']); },
      format: function (v) { return v + ' mo'; },
      applies: function (h) { return Schema.isUnemployed(h); }, notApplicableBecause: 'Not between jobs.'
    },
    floorMonthly: {
      label: 'The floor, a month', owner: 'between-jobs', anchor: 'inputs',
      read: function (h) { var v = Schema.unemploymentOf(h).floorMonthlyCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['floorMonthlyCents']); },
      format: function (v) { return money(v) + '/mo'; },
      applies: function (h) { return Schema.isUnemployed(h); }, notApplicableBecause: 'Not between jobs.'
    },
    healthCover: {
      label: 'Health cover', owner: 'protection', anchor: 'inputs',
      read: function (h) { var v = ((h.insurance || {}).health || {}).type; return v ? Money.ok(v) : Money.incomplete('Not answered yet.', ['health.type']); },
      format: function (v) { return { employer: 'Through work', marketplace: 'Marketplace', cobra: 'COBRA', medicaid: 'Medicaid', parent: 'A parent’s plan', none: 'None' }[v] || v; }
    },
    healthMonthly: {
      label: 'Health cover, a month', owner: 'protection', anchor: 'inputs',
      read: function (h) { var v = ((h.insurance || {}).health || {}).monthlyCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['health.monthlyCents']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    stockShare: {
      label: 'Share in stocks', owner: 'decumulation', anchor: 'inputs',
      read: function (h) { var v = (h.decumulation || {}).stockShare; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['stockShare']); },
      format: function (v) { return Math.round(v * 100) + '%'; }
    },
    plannedAnnualDraw: {
      label: 'Planned draw, a year', owner: 'decumulation', anchor: 'inputs',
      read: function (h) { var v = (h.decumulation || {}).plannedAnnualDrawCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['plannedAnnualDrawCents']); },
      format: function (v) { return money(v) + '/yr'; }
    },
    socialSecurityAt: {
      label: 'Social Security from', owner: 'decumulation', anchor: 'inputs',
      read: function (h) { var v = (h.decumulation || {}).socialSecurityAt; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not decided yet.', ['socialSecurityAt']); },
      format: function (v) { return 'age ' + v; }
    },
    otherPreTax: {
      label: 'Other pre-tax, a year', owner: 'tax', anchor: 'inputs',
      read: function (h) { var v = (h.tax || {}).otherPreTaxAnnualCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['otherPreTaxAnnualCents']); },
      format: function (v) { return money(v) + '/yr'; }
    },
    withheld: {
      label: 'Withheld so far', owner: 'tax', anchor: 'inputs',
      read: function (h) { var v = (h.tax || {}).withheldAnnualCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['withheldAnnualCents']); },
      format: money
    },
    beneficiariesSet: {
      label: 'Beneficiaries named', owner: 'estate', anchor: 'inputs',
      read: function (h) { var v = (h.estate || {}).beneficiariesSet; return typeof v === 'boolean' ? Money.ok(v) : Money.incomplete('Not answered yet.', ['beneficiariesSet']); },
      format: function (v) { return v ? 'Yes' : 'No'; }
    },
    willExists: {
      label: 'A will', owner: 'estate', anchor: 'inputs',
      read: function (h) { var v = (h.estate || {}).willExists; return typeof v === 'boolean' ? Money.ok(v) : Money.incomplete('Not answered yet.', ['willExists']); },
      format: function (v) { return v ? 'Yes' : 'No'; }
    },
    poaExists: {
      label: 'A power of attorney', owner: 'estate', anchor: 'inputs',
      read: function (h) { var v = (h.estate || {}).poaExists; return typeof v === 'boolean' ? Money.ok(v) : Money.incomplete('Not answered yet.', ['poaExists']); },
      format: function (v) { return v ? 'Yes' : 'No'; }
    },
    givingPct: {
      label: 'Giving, share of income', owner: 'giving', anchor: 'inputs',
      read: function (h) { var v = (h.giving || {}).pctOfIncome; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['pctOfIncome']); },
      format: function (v) { return Money.formatRate(v, { decimals: 1 }); }
    },
    givingTarget: {
      label: 'Giving, a year', owner: 'giving', anchor: 'inputs',
      read: function (h) { var v = (h.giving || {}).annualTargetCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['annualTargetCents']); },
      format: function (v) { return money(v) + '/yr'; }
    },

    /* ---- The second wave of tranche rooms (D-099). ---- */
    offerGross: {
      label: 'The offer, a year', owner: 'career-move', anchor: 'inputs',
      read: function (h) { var v = (h.career && h.career.offer || {}).grossAnnualCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('No offer entered yet.', ['offer.grossAnnualCents']); },
      format: money
    },
    offerHours: {
      label: 'The offer’s hours a week', owner: 'career-move', anchor: 'inputs',
      read: function (h) { var v = (h.career && h.career.offer || {}).hoursPerWeek; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['offer.hoursPerWeek']); },
      format: function (v) { return v + ' h'; }
    },
    offerCommute: {
      label: 'The offer’s commute a week', owner: 'career-move', anchor: 'inputs',
      read: function (h) { var v = (h.career && h.career.offer || {}).commuteHoursPerWeek; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['offer.commuteHoursPerWeek']); },
      format: function (v) { return v + ' h'; }
    },
    offerCosts: {
      label: 'The offer’s costs of working, a month', owner: 'career-move', anchor: 'inputs',
      read: function (h) { var v = (h.career && h.career.offer || {}).workCostsMonthlyCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['offer.workCostsMonthlyCents']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    offerSignOn: {
      label: 'Sign-on', owner: 'career-move', anchor: 'inputs',
      read: function (h) { var v = (h.career && h.career.offer || {}).signOnCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['offer.signOnCents']); },
      format: money
    },
    splitMode: {
      label: 'How shared costs are split', owner: 'partner', anchor: 'inputs',
      read: function (h) { var v = (h.partner || {}).splitMode; return v ? Money.ok(v) : Money.incomplete('Not chosen yet.', ['splitMode']); },
      format: function (v) { return { equal: 'Equal halves', proportional: 'In proportion to income', pooled: 'One pool' }[v] || v; },
      applies: function (h) { return Schema.adults(h).length >= 2; }, notApplicableBecause: 'Just you.'
    },
    sharedMonthly: {
      label: 'Shared costs, a month', owner: 'partner', anchor: 'inputs',
      read: function (h) { var v = (h.partner || {}).sharedMonthlyCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['sharedMonthlyCents']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    tuitionTarget: {
      label: 'Tuition target, per child', owner: 'kids', anchor: 'inputs',
      read: function (h) { var v = (h.kids || {}).tuitionTargetCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['tuitionTargetCents']); },
      format: money
    },
    tuitionSaved: {
      label: 'Saved for tuition so far', owner: 'kids', anchor: 'inputs',
      read: function (h) { var v = (h.kids || {}).tuitionSavedCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['tuitionSavedCents']); },
      format: money
    },
    tuitionMonthly: {
      label: 'Going to tuition, a month', owner: 'kids', anchor: 'inputs',
      read: function (h) { var v = (h.kids || {}).tuitionMonthlyCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['tuitionMonthlyCents']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    /* One rent (D-130): what you pay is Cash Flow's housing line; Housing
       Decision's own field is a place you would rent instead. */
    rentMonthly: {
      label: 'Rent or mortgage, a month', owner: 'cash-flow', anchor: 'spending',
      read: function (h) { var r = Schema.rentMonthlyCents(h); return r.source === 'cash-flow' ? Money.ok(r.cents) : Money.incomplete('No housing line in Cash Flow yet.', ['housing']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    rentAlternative: {
      label: 'A place you would rent instead, a month', owner: 'housing', anchor: 'inputs',
      read: function (h) { var v = (h.housing || {}).rentMonthlyCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['rentMonthlyCents']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    homePrice: {
      label: 'The place, its price', owner: 'housing', anchor: 'inputs',
      read: function (h) { var v = (h.housing || {}).priceCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['priceCents']); },
      format: money
    },
    downPct: {
      label: 'Down payment, share of price', owner: 'housing', anchor: 'inputs',
      read: function (h) { var v = (h.housing || {}).downPct; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['downPct']); },
      format: function (v) { return Math.round(v * 100) + '%'; }
    },
    mortgageRate: {
      label: 'Mortgage rate', owner: 'housing', anchor: 'inputs',
      read: function (h) { var v = (h.housing || {}).rate; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['rate']); },
      format: function (v) { return Money.formatRate(v, { decimals: 2 }); }
    },
    purchasePrice: {
      label: 'The purchase', owner: 'big-purchase', anchor: 'inputs',
      read: function (h) { var v = (h.purchase || {}).priceCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['priceCents']); },
      format: money
    },
    purchaseMonths: {
      label: 'Months until the purchase', owner: 'big-purchase', anchor: 'inputs',
      read: function (h) { var v = (h.purchase || {}).monthsAway; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['monthsAway']); },
      format: function (v) { return v + ' mo'; }
    },
    purchaseRate: {
      label: 'Financing rate', owner: 'big-purchase', anchor: 'inputs',
      read: function (h) { var v = (h.purchase || {}).financeRate; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Paid in cash, or not entered.', ['financeRate']); },
      format: function (v) { return Money.formatRate(v, { decimals: 1 }); }
    },
    incomeLow: {
      label: 'A low month', owner: 'variable-income', anchor: 'inputs',
      read: function (h) { var s = variableSource(h); return s && Money.isEntered(s.variableLowCents) ? Money.ok(s.variableLowCents) : Money.incomplete('Not entered yet.', ['variableLowCents']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    incomeHigh: {
      label: 'A high month', owner: 'variable-income', anchor: 'inputs',
      read: function (h) { var s = variableSource(h); return s && Money.isEntered(s.variableHighCents) ? Money.ok(s.variableHighCents) : Money.incomplete('Not entered yet.', ['variableHighCents']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    bufferMonths: {
      label: 'Buffer, months', owner: 'variable-income', anchor: 'inputs',
      read: function (h) { var v = (h.variableIncome || {}).bufferMonths; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['bufferMonths']); },
      format: function (v) { return v + ' mo'; }
    },
    variableWindow: {
      label: 'Rolling window', owner: 'variable-income', anchor: 'inputs',
      read: function (h) { var v = (h.variableIncome || {}).windowMonths; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Three months until chosen.', ['windowMonths']); },
      format: function (v) { return v + ' months'; }
    },

    /* ---- The third wave: the LATER.md rooms (D-101). ---- */
    enoughMonthly: {
      label: 'Enough, a month', owner: 'enough', anchor: 'inputs',
      read: function (h) { var v = (h.enough || {}).monthlyCents; return Money.isEntered(v) ? Money.ok(v, { source: h.enough.source }) : Money.incomplete('Not decided yet.', ['enough']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    designedHours: {
      label: 'The designed week, hours placed', owner: 'week', anchor: 'inputs',
      read: function (h) { var b = ((h.designedWeek || {}).blocks || []).filter(function (x) { return Money.isEntered(x.hours); }); return b.length ? Money.ok(b.reduce(function (t, x) { return t + x.hours; }, 0), { blocks: b.length }) : Money.incomplete('No blocks placed yet.', ['designedWeek']); },
      format: function (v) { return v + ' h'; }
    },
    bucketsPlanned: {
      label: 'Time buckets, planned', owner: 'buckets', anchor: 'inputs',
      read: function (h) { var xs = []; (h.timeBuckets || []).forEach(function (b) { (b.experiences || []).forEach(function (x) { if (Money.isEntered(x.costCents)) xs.push(x.costCents); }); }); return xs.length ? Money.ok(xs.reduce(function (t, c) { return t + c; }, 0), { count: xs.length }) : Money.incomplete('Nothing planned yet.', ['timeBuckets']); },
      format: money
    },
    dreamsMonthly: {
      label: 'Dreams, a month', owner: 'dreamline', anchor: 'inputs',
      read: function (h) { var ds = (h.dreams || []).filter(function (d) { return Money.isEntered(d.monthlyCents); }); return ds.length ? Money.ok(ds.reduce(function (t, d) { return t + d.monthlyCents; }, 0), { count: ds.length }) : Money.incomplete('No dream priced yet.', ['dreams']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    reversibilityDecision: {
      label: 'The decision being weighed', owner: 'reversibility', anchor: 'inputs',
      read: function (h) { var v = (h.reversibility || {}).decisionId; return v ? Money.ok(v) : Money.incomplete('None picked yet.', ['reversibility']); },
      format: function (v) { return String(v).replace(/[-_]/g, ' '); }
    },
    unlearningDropped: {
      label: 'Rules let go of', owner: 'unlearning', anchor: 'inputs',
      read: function (h) { var d = ((h.unlearning || {}).dropped || []); return d.length ? Money.ok(d.length, { ids: d }) : Money.incomplete('None let go of yet.', ['unlearning']); },
      format: function (v) { return v === 0 ? 'none yet' : v + (v === 1 ? ' rule' : ' rules'); }
    },
    loanPlan: {
      label: 'Student loan plan', owner: 'student-loans', anchor: 'inputs',
      read: function (h) { var v = (h.studentLoans || {}).plan; return v ? Money.ok(v) : Money.incomplete('Not chosen yet.', ['plan']); },
      format: function (v) { return { standard: 'Standard', income_driven: 'Income-driven', aggressive: 'Aggressive' }[v] || v; }
    },
    loanExtra: {
      label: 'Extra to the loans, a month', owner: 'student-loans', anchor: 'inputs',
      read: function (h) { var v = (h.studentLoans || {}).extraMonthlyCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['extraMonthlyCents']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    idrShare: {
      label: 'Income-driven share', owner: 'student-loans', anchor: 'inputs',
      read: function (h) { var v = (h.studentLoans || {}).idrShare; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['idrShare']); },
      format: function (v) { return Math.round(v * 100) + '% of discretionary income'; }
    },
    forgivenessYears: {
      label: 'Forgiveness after', owner: 'student-loans', anchor: 'inputs',
      read: function (h) { var v = (h.studentLoans || {}).forgivenessYears; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['forgivenessYears']); },
      format: function (v) { return v + ' years'; }
    },
    payCadence: {
      label: 'Paid', owner: 'calendar', anchor: 'inputs',
      read: function (h) { var v = (h.calendar || {}).cadence; return v ? Money.ok(v) : Money.incomplete('Not entered yet.', ['cadence']); },
      format: function (v) { return { weekly: 'every week', fortnightly: 'every two weeks', semimonthly: 'twice a month', monthly: 'monthly' }[v] || v; }
    },
    nextPayday: {
      label: 'Next payday, day of month', owner: 'calendar', anchor: 'inputs',
      read: function (h) { var v = (h.calendar || {}).nextPaydayDay; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['nextPaydayDay']); },
      format: function (v) { return 'the ' + v + (v === 1 || v === 21 || v === 31 ? 'st' : v === 2 || v === 22 ? 'nd' : v === 3 || v === 23 ? 'rd' : 'th'); }
    },
    billsMonthly: {
      label: 'Bills on a date, a month', owner: 'calendar', anchor: 'inputs',
      read: function (h) { var bs = ((h.calendar || {}).bills || []).filter(function (b) { return Money.isEntered(b.cents); }); return bs.length ? Money.ok(bs.reduce(function (t, b) { return t + b.cents; }, 0), { count: bs.length }) : Money.incomplete('No bills listed yet.', ['bills']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    payLaterDue: {
      label: 'Pay-later due this month', owner: 'calendar', anchor: 'inputs',
      read: function (h) { var ps = ((h.calendar || {}).payLater || []).filter(function (b) { return Money.isEntered(b.cents); }); return ps.length ? Money.ok(ps.reduce(function (t, b) { return t + b.cents; }, 0), { count: ps.length }) : Money.incomplete('None listed.', ['payLater']); },
      format: money
    },
    /* The ledger (D-128): what Income logs as landing each month, and
       what the Budget has closed. */
    ledgerIncome: {
      label: 'Income logged, a month', owner: 'income', anchor: 'log',
      read: function (h) {
        var list = ((h.ledger || {}).income || []).filter(function (e) { return e && e.active !== false && e.frequency !== 'once' && Money.isEntered(e.amountCents); });
        if (!list.length) return Money.incomplete('Nothing recurring logged yet.', ['ledgerIncome']);
        var Income = (typeof self !== 'undefined' && self.SLAF && self.SLAF.Income) || (typeof require === 'function' ? require('../engines/income.js') : null);
        var total = 0;
        list.forEach(function (e) { var b = Income && Income.basisById(e.frequency); total += b && Money.isEntered(b.periods) ? Math.round(e.amountCents * b.periods / 12) : 0; });
        return Money.ok(total, { count: list.length });
      },
      format: function (v) { return money(v) + '/mo'; }
    },
    monthsClosed: {
      label: 'Months closed', owner: 'budget', anchor: 'close',
      read: function (h) { var n = ((h.ledger || {}).months || []).length; return n ? Money.ok(n) : Money.incomplete('No month closed yet.', ['monthsClosed']); },
      format: function (v) { return v + (v === 1 ? ' month' : ' months'); },
      /* Until a month is closed there is nothing to read back, and no path
         should wait on it: the reading room says so itself. */
      applies: function (h) { return ((h.ledger || {}).months || []).length > 0; },
      notApplicableBecause: 'No month closed yet — close one on the Budget.'
    },
    historyCompareTo: {
      label: 'Comparing against', owner: 'history', anchor: 'inputs',
      read: function (h) { var v = (h.history || {}).compareTo; return v ? Money.ok(v) : Money.incomplete('The first snapshot, until you pick one.', ['compareTo']); },
      format: function (v) { return 'snapshot ' + String(v).slice(-4); }
    },

    /* What The Rerank would cut (D-085): the flagged lines, a year's worth.
       Derived, owned by the room that asks the questions. */
    rerankCut: {
      label: 'What The Rerank would cut', owner: 'rerank', anchor: 'gap',
      read: function (h) {
        var R = (typeof module === 'object' && module.exports)
          ? require('../engines/rerank.js')
          : (typeof self !== 'undefined' && self.SLAF && self.SLAF.Rerank);
        var tables = (typeof module === 'object' && module.exports)
          ? { expenseCategories: require('../data/expense_categories.json'), commonCosts: require('../data/common_costs.json') }
          : (typeof self !== 'undefined' && self.SLAF && self.SLAF.Reference && self.SLAF.Reference.cached
              ? { expenseCategories: self.SLAF.Reference.cached('expenseCategories'), commonCosts: self.SLAF.Reference.cached('commonCosts') } : null);
        if (!R || !tables || !tables.expenseCategories) return Money.incomplete('Not ranked yet.', ['ratings']);
        var a = R.analyse(h, tables);
        if (!Money.isOk(a)) return a;
        if (!a.ratedCount) return Money.incomplete('Nothing rated on The Rerank yet.', ['ratings']);
        return Money.ok(a.flaggedAnnualCents, { cut: a.cut.length, keep: a.keep.length });
      },
      format: function (v) { return money(v) + '/yr'; }
    },

    /* The target mix (D-071): stated in Where It Goes, a target rather than
       a reading of the accounts. Shares of one; formatted as percentages. */
    allocationStocks: allocationRow('stocks', 'Target: stocks'),
    allocationBonds: allocationRow('bonds', 'Target: bonds'),
    allocationCash: allocationRow('cash', 'Target: cash'),
    rebalanceBand: {
      label: 'Rebalance band', owner: 'accounts', anchor: 'allocation',
      read: function (h) {
        var v = (h.allocation || {}).rebalanceBand;
        return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not set.', ['rebalanceBand']);
      },
      format: function (v) { return '\u00b1' + Money.formatRate(v, { decimals: 0 }); }
    },

    /* Debt Payoff owns every debt figure. The Financial Snapshot used to take
       a lump sum for both of these; it now shows them and links here. */
    totalDebt: {
      label: 'Total debt', owner: 'debt-payoff', anchor: 'debts',
      read: function (h) { return Schema.totalDebtCents(h); },
      format: money,
      /* "No debt" is an answer (D-061): the figure is not missing, there is
         nothing to list, and no room should wait on it. */
      applies: function (h) { return (h.meta || {}).hasDebt !== false; },
      notApplicableBecause: 'You said there is no debt.'
    },
    monthlyDebtPayments: {
      label: 'Monthly debt payments', owner: 'debt-payoff', anchor: 'debts',
      read: function (h) { return Schema.monthlyDebtPaymentsCents(h); },
      format: function (v) { return money(v) + '/mo'; },
      applies: function (h) { return (h.meta || {}).hasDebt !== false; },
      notApplicableBecause: 'You said there is no debt.'
    },

    /* The Net Worth room owns everything you own that Start Here doesn't
       ask about — a house, a car, anything else. */
    otherAssets: {
      label: 'Property & other assets', owner: 'statement', anchor: 'assets',
      read: function (h) { return Schema.otherAssetsCents(h); },
      format: money
    },
    /* The Statement's own facts (D-069). Confidence-weighted net worth is
       derived — it lives here so the dashboard and the map can read it as
       one figure with one owner. */
    confidenceWeightedNetWorth: {
      label: 'Confidence-weighted net worth', owner: 'statement', anchor: 'portfolios',
      read: function (h) {
        var St = (typeof module === 'object' && module.exports)
          ? require('../engines/statement.js')
          : (typeof self !== 'undefined' && self.SLAF && self.SLAF.Statement);
        var weights = (typeof module === 'object' && module.exports)
          ? require('../data/confidence_weights.json')
          : (typeof self !== 'undefined' && self.SLAF && self.SLAF.Reference && self.SLAF.Reference.cached && self.SLAF.Reference.cached('confidenceWeights'));
        if (!St || !weights) return Money.incomplete('Not rated yet.', ['confidence']);
        return St.confidenceWeightedNetWorth(h, weights);
      },
      format: money
    },
    /* Owner moved from The Statement to the Timeline in D-152. The Statement
       still SHOWS the roll-up — it is part of the picture — but a dated
       period is edited in the room that draws it on a grid, and nowhere
       else. One owner per shared number (D-017). */
    futureIncome: {
      label: 'Money that is coming', owner: 'timeline', anchor: 'out-periods',
      read: function (h) {
        var rows = (h.futureIncome || []).filter(function (f) { return Money.isEntered(f.monthlyCents); });
        if (!rows.length) return Money.incomplete('Nothing listed.', ['futureIncome']);
        return Money.ok(rows.reduce(function (s, f) { return s + f.monthlyCents; }, 0), { count: rows.length });
      },
      format: function (v) { return money(v) + '/mo'; }
    },
    netWorth: {
      label: 'Net worth', owner: 'statement', anchor: 'portfolios',
      read: function (h) {
        var a = Schema.totalAssetsCents(h), d = Schema.totalDebtCents(h);
        if (!Money.isOk(a) || !Money.isOk(d)) {
          return Money.incomplete('Not enough entered yet.', ['assets', 'debts']);
        }
        return Money.ok(a.value - d.value);
      },
      format: money
    },

    /* Cash Flow owns spending. The estimate can be seeded during intake, but
       once a month is categorised the tracked figure is what everything uses
       — and that is only editable where the categories live. */
    /* The SWAN Number lives in exactly one room, like every other shared
       figure. It is a self-report, so nothing else may write it — and the
       Snapshot, which shows computed Emergency Fund Coverage beside it,
       links here rather than offering a second place to type it. */
    swanTarget: {
      label: 'Your sleep-at-night number', owner: 'sleep-at-night', anchor: 'number',
      read: function (h) {
        var Swan = (typeof module === 'object' && module.exports)
          ? require('../engines/swan.js')
          : (typeof self !== 'undefined' && self.SLAF && self.SLAF.Swan);
        if (!Swan) return Money.incomplete('Not set yet.', ['swanTarget']);
        return Swan.targetCents(h);
      },
      format: money
    },

    /* D-070: the ages you plan around, stored in household.targets and
       written only by FIRE Number. */
    retireAge: {
      label: 'Stop working at', owner: 'fire', anchor: 'targets',
      read: function (h) {
        var v = h.targets && h.targets.retireAge;
        return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not decided yet.', ['retireAge']);
      },
      format: function (v) { return 'age ' + v; }
    },
    coastAge: {
      label: 'Coast: arrive by', owner: 'fire', anchor: 'targets',
      read: function (h) {
        var v = h.targets && h.targets.coastAge;
        return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not decided yet.', ['coastAge']);
      },
      format: function (v) { return 'age ' + v; }
    },

    monthlyExpenses: {
      label: 'Monthly expenses', owner: 'cash-flow', anchor: 'spending',
      read: function (h) { return Schema.monthlyExpensesCents(h); },
      format: function (v) { return money(v) + '/mo'; }
    },
    /* The Skill Tree's one write and the exercise library's log (D-131):
       only done is stored; every other state is derived. */
    skillsDone: {
      label: 'Skills done', owner: 'skill-tree', anchor: 'board',
      read: function (h) {
        var n = Object.keys((h.skillTree && h.skillTree.state) || {}).length;
        return n ? Money.ok(n) : Money.incomplete('No skill marked done yet.', ['skillTree']);
      },
      format: function (v) { return v + (v === 1 ? ' skill' : ' skills'); }
    },
    exercisesDone: {
      label: 'Exercises done', owner: 'exercises', anchor: 'list',
      read: function (h) {
        var n = Object.keys((h.exercises && h.exercises.done) || {}).length;
        return n ? Money.ok(n) : Money.incomplete('No exercise completed yet.', ['exercises']);
      },
      format: function (v) { return v + (v === 1 ? ' exercise' : ' exercises'); }
    },
    /* The practice ledger: every logged day's worth, summed. Written one
       row at a time by the Skill Stacker and by nothing else. D-090. */
    practiceLedger: {
      label: 'Practice ledger', owner: 'stacker', anchor: 'today',
      read: function (h) {
        var rows = h.practiceLedger || [];
        if (!rows.length) return Money.incomplete('No days logged yet.', ['practiceLedger']);
        return Money.ok(rows.reduce(function (t, e) { return t + (Money.isEntered(e.cents) ? e.cents : 0); }, 0), { days: rows.length });
      },
      format: money
    }
  };

  function field(fieldId) { return FIELDS[fieldId] || null; }

  /* ---- Links -------------------------------------------------------------
     Registry hrefs are written relative to map.html, which sits at the repo
     root. A page inside rooms/ therefore needs one level up. Working this
     out here — rather than in each room — is what stopped the last round of
     path bugs when the Map moved.                                        */

  function isInRoomsDir() {
    return typeof location !== 'undefined' && location.pathname.indexOf('/rooms/') !== -1;
  }

  function linkTo(roomId, anchor) {
    var room = Registry.byId(roomId);
    if (!room) return '#';
    var href = (isInRoomsDir() ? '../' : '') + room.href;
    return anchor ? href + '#' + anchor : href;
  }

  /* ---- Describing a field for display ------------------------------------ */

  /**
   * Everything a room needs to render one borrowed value:
   *   { label, ownerId, ownerTitle, href, result, display, isSet, isOwnHere }
   */
  function describe(fieldId, household, currentRoomId) {
    var f = field(fieldId);
    if (!f) return null;
    var result = f.read(household || {});
    var isSet = Money.isOk(result);
    var owner = Registry.byId(f.owner);
    return {
      fieldId: fieldId,
      label: f.label,
      ownerId: f.owner,
      ownerTitle: owner ? owner.title : f.owner,
      href: linkTo(f.owner, f.anchor),
      result: result,
      isSet: isSet,
      display: isSet ? f.format(result.value) : Money.EM_DASH,
      isOwnHere: currentRoomId === f.owner,
      /* Filled in by the one-pager as a guess and never typed over:
         shown as one everywhere, until it is. D-094. */
      guessed: !!(household && household.meta && household.meta.guessed && household.meta.guessed[fieldId]),
      /* Where the figure came from: 'guess' (the one-pager filled it in),
         'entered' (typed in its owner room), or 'room' with `sourceId`
         naming the other room that wrote it. The badge on the one-pager.
         Unknown provenance (a save from before D-095) reads as entered. */
      confidence: confidenceOf(household, fieldId, f.owner),
      sourceId: (household && household.meta && household.meta.source && household.meta.source[fieldId]) || null,
      /* Some fields stop being questions once you have answered another one.
         An employer match is not missing when there is no employer — it is
         not applicable, which is a different thing and must never be counted
         as an outstanding task. Fields with no applies() always apply.
         DECISIONS.md D-055. */
      applies: userSaysNa(household, fieldId) ? false : (f.applies ? !!f.applies(household || {}) : true),
      notApplicableBecause: userSaysNa(household, fieldId) ? 'You marked this not applicable.' : (f.notApplicableBecause || null),
      /* Marked N/A by the household itself, in the Budget room (D-129):
         a structural option that does not exist for them, as opposed
         to one the situation rules out. */
      userNotApplicable: userSaysNa(household, fieldId),
      /* How old the figure is. null-safe: without staleness.js loaded the
         age is still computed from the stamp, just never judged. D-057. */
      age: isSet ? ageOf(household, fieldId) : null
    };
  }

  function userSaysNa(household, fieldId) {
    return !!(household && household.notApplicable && household.notApplicable[fieldId] === true);
  }
  function confidenceOf(household, fieldId, ownerId) {
    var m = (household && household.meta) || {};
    if (m.guessed && m.guessed[fieldId]) return 'guess';
    var src = m.source && m.source[fieldId];
    return src && src !== ownerId ? 'room' : 'entered';
  }

  /* The income source Variable Income reads and writes: the first with a
     variable basis or own-work type, else the primary person's first. */
  function variableSource(h) {
    var p = Schema.primaryPerson(h || {});
    var list = (p && p.incomeSources) || [];
    return list.filter(function (s) { return s.frequency === 'variable' || s.type === '1099'; })[0] || list[0] || null;
  }

  function ageOf(household, fieldId) {
    var St = stalenessModule();
    if (!St) return null;
    return St.describe(household || {}, fieldId);
  }

  /**
   * write(fieldId, value) — set a field through its owner's own write path.
   * Only fields that declare one; everything else is written by its room.
   */
  function write(fieldId, value) {
    var f = field(fieldId);
    if (!f || typeof f.write !== 'function') {
      throw new Error('No shared write path for ' + fieldId + ' — write it in its owner room');
    }
    return f.write(value);
  }

  function writable() {
    return Object.keys(FIELDS).filter(function (k) { return typeof FIELDS[k].write === 'function'; });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /**
   * The read-only chip: the value, and where it comes from.
   * A value that isn't set yet says so and still links, so the way to fix it
   * is always one tap away.
   */
  /** A small N/A toggle for a structural option, for its owner room to set
   *  beside the input (D-130). The room wires the click to
   *  Spine.setNotApplicable(fieldId, on). */
  function naButton(fieldId, household, words) {
    var on = userSaysNa(household, fieldId);
    var w = words || {};
    return '<button type="button" class="slaf-na" data-na-field="' + escapeHtml(fieldId) + '" aria-pressed="' + on + '" title="' + (on ? 'Marked not applicable — tap to say it applies after all' : 'Not applicable to me — drops it from every live figure') + '">'
      + escapeHtml(on ? (w.on || 'Not applicable ✓') : (w.off || 'N/A')) + '</button>';
  }

  function chip(fieldId, household, currentRoomId) {
    var d = describe(fieldId, household, currentRoomId);
    if (!d) return '';
    /* Marked not applicable by the household (D-130): say so, not "add it". */
    if (d.userNotApplicable) {
      return '<a class="slaf-owned slaf-owned--na" href="' + d.href + '">'
        + '<span class="slaf-owned-label">' + escapeHtml(d.label) + '</span>'
        + '<span class="slaf-owned-value">n/a</span>'
        + '<span class="slaf-owned-from">' + escapeHtml(d.notApplicableBecause || 'Not applicable.') + '</span>'
        + '</a>';
    }
    if (d.isSet) {
      var age = d.age && d.age.label
        ? ' · <span class="slaf-owned-age' + (d.age.stale === true ? ' is-stale' : '') + '">'
          + escapeHtml(d.age.label) + '</span>'
        : '';
      return '<a class="slaf-owned' + (d.age && d.age.stale === true ? ' slaf-owned--stale' : '') + (d.guessed ? ' slaf-owned--guess' : '')
        + '" href="' + d.href + '">'
        + '<span class="slaf-owned-label">' + escapeHtml(d.label) + '</span>'
        + '<span class="slaf-owned-value">' + escapeHtml(d.display) + '</span>'
        + '<span class="slaf-owned-from">' + (d.guessed ? 'a guess \u2014 fix it in ' : 'from ') + escapeHtml(d.ownerTitle) + ' →' + age + '</span>'
        + '</a>';
    }
    return '<a class="slaf-owned slaf-owned--empty" href="' + d.href + '">'
      + '<span class="slaf-owned-label">' + escapeHtml(d.label) + '</span>'
      + '<span class="slaf-owned-value">' + Money.EM_DASH + '</span>'
      + '<span class="slaf-owned-from">add it in ' + escapeHtml(d.ownerTitle) + ' →</span>'
      + '</a>';
  }

  /** A compact inline form, for sitting beside a row rather than in a list. */
  function inlineChip(fieldId, household, currentRoomId) {
    var d = describe(fieldId, household, currentRoomId);
    if (!d) return '';
    return '<a class="slaf-owned-inline' + (d.isSet ? '' : ' slaf-owned--empty') + '" '
      + 'href="' + d.href + '" title="Owned by ' + escapeHtml(d.ownerTitle) + '">'
      + '<span>' + escapeHtml(d.display) + '</span>'
      + '<span class="slaf-owned-from">' + escapeHtml(d.ownerTitle) + ' →</span></a>';
  }

  /** Which fields a given room owns — used by the intake to know its scope. */
  /**
   * readings(h) — every owned field's current value, by id; null when not
   * set. This is what the spine diffs on each save to stamp confirmedAt,
   * and what a snapshot freezes as `fields`. The spine cannot depend on
   * this file (it loads first), so this file hands the reader to it.
   * DECISIONS.md D-056.
   */
  function readings(household) {
    var out = {};
    Object.keys(FIELDS).forEach(function (id) {
      var r;
      try { r = FIELDS[id].read(household || {}); } catch (e) { r = null; }
      out[id] = r && Money.isOk(r) ? r.value : null;
    });
    return out;
  }
  if (Spine && typeof Spine.registerFieldLabels === 'function') {
    Spine.registerFieldLabels(function () {
      var out = {};
      Object.keys(FIELDS).forEach(function (id) { out[id] = { label: FIELDS[id].label, format: FIELDS[id].format }; });
      return out;
    });
  }
  if (Spine && typeof Spine.registerFieldReaders === 'function') {
    Spine.registerFieldReaders(readings);
  }

  function ownedBy(roomId) {
    return Object.keys(FIELDS).filter(function (k) { return FIELDS[k].owner === roomId; });
  }

  return {
    FIELDS: FIELDS,
    variableSource: variableSource,
    FILING_LABELS: FILING_LABELS,
    readings: readings,
    write: write,
    writable: writable,
    field: field,
    linkTo: linkTo,
    describe: describe,
    chip: chip,
    inlineChip: inlineChip,
    naButton: naButton,
    ownedBy: ownedBy
  };
});
