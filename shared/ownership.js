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

  /* An owned value is what the person typed: shown exactly, never rounded
     by the room's confidence rounding (15.10). */
  function money(v) { return Money.formatCents(v, { exact: true }); }

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
    zip: {
      label: 'ZIP', owner: 'start', anchor: 'q-about',
      read: function (h) { return h.zip ? Money.ok(h.zip) : Money.incomplete('Not set: optional.', ['zip']); },
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
        if (u.benefitStatus) return Money.ok(u.benefitStatus, { unemployment: u });
        /* A weekly amount with no status yet (a confirmed suggestion, D-205) is an answer too. */
        if (Money.isEntered(u.benefitWeeklyCents)) return Money.ok(u.benefitWeeklyCents, { unemployment: u, kind: 'weekly' });
        return Money.incomplete('Say whether unemployment is coming.', ['unemployment']);
      },
      format: function (v) {
        if (typeof v === 'number') return money(v) + '/wk';
        return { receiving: 'getting unemployment', applied: 'applied, waiting', notApplied: 'not applied', ineligible: 'not eligible' }[v] || v;
      },
      applies: function (h) { return Schema.isUnemployed(h); },
      notApplicableBecause: 'You are working.'
    },
    /* Between jobs, "Your last pay" is the first round's pay question (D-206):
       it feeds the benefit estimate, the marginal rate and the milestones,
       and lives on the person beside the benefit. Start Here owns it. */
    lastPay: {
      label: 'Your last pay, a year', owner: 'start', anchor: 'q-unemployed',
      read: function (h) { var v = Schema.unemploymentOf(h).lastGrossAnnualCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['lastPay']); },
      format: function (v) { return money(v) + '/yr'; },
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

    /* The Coverage Checkup (D-071): four facts about your cover, asked on
       the Cushion's at-3am reading since D-232, read by the Statement's
       worst plausible year. Sleep At Night became that reading; the owner
       moved with the boxes, which is the only way ownership ever moves. */
    oopMax: {
      label: 'Out-of-pocket maximum', owner: 'runway', anchor: 'coverage',
      read: function (h) {
        var v = (h.insurance || {}).oopMaxCents;
        return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['oopMaxCents']);
      },
      format: money
    },
    termLife: {
      label: 'Term life in force', owner: 'runway', anchor: 'coverage',
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
      label: 'Disability benefit', owner: 'runway', anchor: 'coverage',
      read: function (h) {
        var v = (h.insurance || {}).disabilityMonthlyCents;
        return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['disabilityMonthlyCents']);
      },
      format: function (v) { return money(v) + '/mo'; }
    },
    umbrella: {
      label: 'Umbrella policy', owner: 'runway', anchor: 'coverage',
      read: function (h) {
        var v = (h.insurance || {}).umbrella;
        return typeof v === 'boolean' ? Money.ok(v) : Money.incomplete('Not answered yet.', ['umbrella']);
      },
      format: function (v) { return v ? 'Yes' : 'No'; }
    },

    /* ---- The tranche rooms (D-098): each owns the facts it asks. ----
       Between Jobs became the Cushion's while-job-hunting reading (D-232),
       so these two moved with the two boxes that ask them. They no longer
       stop applying when you are employed: the reading runs as if the pay
       stopped today, and the two numbers it needs are much easier to think
       about before the job ends than on the day it does. */
    expectedSearchMonths: {
      label: 'Expected search, months', owner: 'runway', anchor: 'inputs',
      read: function (h) { var v = Schema.unemploymentOf(h).expectedSearchMonths; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['expectedSearchMonths']); },
      format: function (v) { return v + ' mo'; }
    },
    floorMonthly: {
      label: 'The floor, a month', owner: 'runway', anchor: 'inputs',
      read: function (h) { var v = Schema.unemploymentOf(h).floorMonthlyCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['floorMonthlyCents']); },
      format: function (v) { return money(v) + '/mo'; }
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
      label: 'Beneficiaries named', owner: 'protection', anchor: 'es-inputs',
      read: function (h) { var v = (h.estate || {}).beneficiariesSet; return typeof v === 'boolean' ? Money.ok(v) : Money.incomplete('Not answered yet.', ['beneficiariesSet']); },
      format: function (v) { return v ? 'Yes' : 'No'; }
    },
    willExists: {
      label: 'A will', owner: 'protection', anchor: 'es-inputs',
      read: function (h) { var v = (h.estate || {}).willExists; return typeof v === 'boolean' ? Money.ok(v) : Money.incomplete('Not answered yet.', ['willExists']); },
      format: function (v) { return v ? 'Yes' : 'No'; }
    },
    poaExists: {
      label: 'A power of attorney', owner: 'protection', anchor: 'es-inputs',
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
    /* 15.7: the second adult is edited in Partner, never a data island. */
    partnerName: {
      label: 'The other of you', owner: 'partner', anchor: 'inputs',
      read: function (h) { var p = Schema.adults(h)[1]; return p ? Money.ok(Schema.personName(p, 'The other of you')) : Money.incomplete('Just you so far.', ['partner']); },
      format: function (v) { return v; },
      applies: function (h) { return Schema.householdOfTwo(h); },
      notApplicableBecause: 'Just you.'
    },
    partnerDob: {
      label: 'Their birth year', owner: 'partner', anchor: 'inputs',
      read: function (h) { var p = Schema.adults(h)[1]; var y = p ? Schema.birthYearOf(p) : null; return y !== null ? Money.ok(y) : Money.incomplete('Not set yet.', ['partnerDob']); },
      format: function (v) { return String(v); },
      applies: function (h) { return Schema.householdOfTwo(h); },
      notApplicableBecause: 'Just you.'
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
      label: 'Tuition target, per child', owner: 'partner', anchor: 'kid-inputs',
      read: function (h) { var v = (h.kids || {}).tuitionTargetCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['tuitionTargetCents']); },
      format: money
    },
    tuitionSaved: {
      label: 'Saved for tuition so far', owner: 'partner', anchor: 'kid-inputs',
      read: function (h) { var v = (h.kids || {}).tuitionSavedCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['tuitionSavedCents']); },
      format: money
    },
    tuitionMonthly: {
      label: 'Going to tuition, a month', owner: 'partner', anchor: 'kid-inputs',
      read: function (h) { var v = (h.kids || {}).tuitionMonthlyCents; return Money.isEntered(v) ? Money.ok(v) : Money.incomplete('Not entered yet.', ['tuitionMonthlyCents']); },
      format: function (v) { return money(v) + '/mo'; }
    },
    /* One rent (D-130): what you pay is Expenses' housing line; Housing
       Decision's own field is a place you would rent instead. */
    rentMonthly: {
      label: 'Rent or mortgage, a month', owner: 'expenses', anchor: 'spending',
      read: function (h) { var r = Schema.rentMonthlyCents(h); return r.source === 'expenses' ? Money.ok(r.cents) : Money.incomplete('No housing line in Expenses yet.', ['housing']); },
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
      label: 'Time buckets, planned', owner: 'week', anchor: 'bk-inputs',
      read: function (h) { var xs = []; (h.timeBuckets || []).forEach(function (b) { (b.experiences || []).forEach(function (x) { if (Money.isEntered(x.costCents)) xs.push(x.costCents); }); }); return xs.length ? Money.ok(xs.reduce(function (t, c) { return t + c; }, 0), { count: xs.length }) : Money.incomplete('Nothing planned yet.', ['timeBuckets']); },
      format: money
    },
    dreamsMonthly: {
      label: 'Dreams, a month', owner: 'big-purchase', anchor: 'dl-inputs',
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

    /* Expenses owns spending (D-192; Cash Flow before it). The estimate can be seeded during intake, but
       once a month is categorised the tracked figure is what everything uses
       — and that is only editable where the categories live. */
    /* The SWAN Number lives in exactly one room, like every other shared
       figure. It is a self-report, so nothing else may write it — and the
       Snapshot, which shows computed Emergency Fund Coverage beside it,
       links here rather than offering a second place to type it. */
    swanTarget: {
      label: 'Your sleep-at-night number', owner: 'runway', anchor: 'am-number',
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
      label: 'Monthly expenses', owner: 'expenses', anchor: 'spending',
      read: function (h) { return Schema.monthlyExpensesCents(h); },
      format: function (v) { return money(v) + '/mo'; }
    },
    /* The four numbers, and the optional fifth (D-172). Each reads its own
       bucket; a blank bucket is incomplete, never a zero. */
    foodMonthly: {
      label: 'Food, a month', owner: 'expenses', anchor: 'spending',
      read: function (h) { return Schema.fat(h).food; }, format: function (v) { return money(v) + '/mo'; }
    },
    accommodationMonthly: {
      label: 'Rent or mortgage, a month', owner: 'expenses', anchor: 'spending',
      read: function (h) { return Schema.fat(h).accommodation; }, format: function (v) { return money(v) + '/mo'; }
    },
    transportationMonthly: {
      label: 'Getting around, a month', owner: 'expenses', anchor: 'spending',
      read: function (h) { return Schema.fat(h).transportation; }, format: function (v) { return money(v) + '/mo'; }
    },
    wantsMonthly: {
      label: 'Everything else, a month', owner: 'expenses', anchor: 'lines',
      read: function (h) { return Schema.fat(h).wants; }, format: function (v) { return money(v) + '/mo'; }
    },
    therapyMonthly: {
      label: 'Therapy, a month', owner: 'expenses', anchor: 'spending',
      read: function (h) { var f = Schema.fat(h); return f.therapy || Money.incomplete('Not tracked separately.', ['therapyMonthly']); },
      format: function (v) { return money(v) + '/mo'; },
      applies: function (h) { return Schema.fat(h).therapyTracked; },
      notApplicableBecause: 'Mental health spending is not tracked separately; turn that on in Expenses.'
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

  /* ---- The shared write paths (D-205) -------------------------------------
     A suggestion confirmed on a door, an inline ask in a room, or a field
     on the Express page all write THROUGH the owner: the same spine call
     the owner room itself makes, so there is still one owner per number
     and no second copy. write(value, ctx): ctx.itemId names the item for a
     repeat row (a debt, an account, a source, a yearly line). A row with
     no path here is written only in its owner room, as before.           */
  function primary() { return Spine.ensurePrimaryPerson('You'); }
  function setAt(path, label) { return function (v) { return Spine.set(path, v === undefined ? null : v, label); }; }
  function centsAt(path, label) { return function (v) { return Spine.set(path, Money.isEntered(v) ? Math.round(v) : null, label); }; }
  function boolAt(path, label) { return function (v) { return Spine.set(path, v === null || v === undefined ? null : !!v, label); }; }
  function personPatch(patch) { var p = primary(); return Spine.upsertPerson(Object.assign({ id: p.id }, patch)); }
  function unemploymentPatch(patch) {
    var u = Schema.unemploymentOf(Spine.getProfile());
    return personPatch({ unemployment: Object.assign({}, u, patch) });
  }
  function primarySource(ctx) {
    var p = primary();
    var list = p.incomeSources || [];
    if (ctx && ctx.itemId) return list.filter(function (s) { return s.id === ctx.itemId; })[0] || { id: ctx.itemId };
    return list[0] || null;
  }
  function sourcePatch(ctx, patch, fallbackFields) {
    var p = primary();
    var s = primarySource(ctx);
    var record = s ? Object.assign({ id: s.id }, patch) : Schema.createIncomeSource(Object.assign({ personId: p.id, source: 'Primary job', type: 'w2' }, fallbackFields || {}, patch));
    return Spine.upsertIncomeSource(p.id, record);
  }
  function itemPatch(upsert, ctx, patch) {
    if (!ctx || !ctx.itemId) throw new Error('This row is one line per item: say which item (ctx.itemId).');
    return upsert(Object.assign({ id: ctx.itemId }, patch));
  }
  function secondAdult() {
    var h = Spine.getProfile();
    var a = Schema.adults(h);
    if (a[1]) return a[1];
    return Spine.upsertPerson(Schema.createPerson({ label: 'The other of you', role: 'adult' }));
  }
  /* The one-line-per-item rows (D-205): the field is the list; the value
     read here is a count, and the line lives on the item. The Ledger and the
     doors read the items themselves (LedgerRows.items); a write names the
     item (ctx.itemId) and goes through the list's owner. */
  function countOf(list, label) { return list.length ? Money.ok(list.length, { items: list }) : Money.incomplete('Nothing listed yet.', [label]); }
  var ITEM_FIELDS = {
    debtBalance: { label: 'Balance', owner: 'debt-payoff', anchor: 'debts', read: function (h) { return countOf(h.debts || [], 'debts'); }, format: function (v) { return v + ' listed'; } },
    debtRate: { label: 'Interest rate', owner: 'debt-payoff', anchor: 'debts', read: function (h) { return countOf(h.debts || [], 'debts'); }, format: function (v) { return v + ' listed'; } },
    debtMinPayment: { label: 'Minimum payment, a month', owner: 'debt-payoff', anchor: 'debts', read: function (h) { return countOf(h.debts || [], 'debts'); }, format: function (v) { return v + ' listed'; } },
    assetValue: { label: 'What each account or thing is worth', owner: 'statement', anchor: 'assets', read: function (h) { return countOf(h.assets || [], 'assets'); }, format: function (v) { return v + ' listed'; } },
    assetCharacter: { label: 'How it is taxed on the way out', owner: 'statement', anchor: 'assets', read: function (h) { return countOf(h.assets || [], 'assets'); }, format: function (v) { return v + ' listed'; } },
    assetTier: { label: 'Which pile it sits in', owner: 'statement', anchor: 'assets', read: function (h) { return countOf(h.assets || [], 'assets'); }, format: function (v) { return v + ' listed'; } },
    assetCostBasis: { label: 'Cost basis', owner: 'statement', anchor: 'assets', read: function (h) { return countOf(h.assets || [], 'assets'); }, format: function (v) { return v + ' listed'; } },
    incomeType: { label: 'What kind of pay', owner: 'income', anchor: 'sources', read: function (h) { var p = Schema.primaryPerson(h); return countOf(p ? (p.incomeSources || []) : [], 'incomeSources'); }, format: function (v) { return v + ' listed'; } },
    paySurvives: { label: 'Keeps paying if the job goes', owner: 'income', anchor: 'sources', read: function (h) { var p = Schema.primaryPerson(h); return countOf(p ? (p.incomeSources || []) : [], 'incomeSources'); }, format: function (v) { return v + ' listed'; } },
    annualLine: { label: 'Once-a-year costs', owner: 'expenses', anchor: 'more', read: function (h) { return countOf(((h.expenses || {}).annual || []), 'annualLines'); }, format: function (v) { return v + ' listed'; } }
  };
  Object.keys(ITEM_FIELDS).forEach(function (id) { if (!FIELDS[id]) FIELDS[id] = ITEM_FIELDS[id]; });
  var WRITES = {
    dob: function (v) { return personPatch({ dob: v || null }); },
    state: setAt('state', 'State'),
    zip: function (v) { var z = String(v || '').replace(/\D/g, '').slice(0, 5); return Spine.set('zip', z.length === 5 ? z : null, 'ZIP'); },
    filingStatus: setAt('filingStatus', 'Filing status'),
    dependents: function (v) {
      var list = Array.isArray(v) ? Schema.createDependents(v)
        : Money.isEntered(v) ? Schema.createDependents(v === 0 ? false : new Array(Math.round(v)).fill(null).map(function () { return {}; }))
        : null;
      return Spine.set('dependents', list, list && list.length ? list.length + ' depend on you' : 'Nobody depends on you');
    },
    employmentStatus: function (v) { return personPatch({ employmentStatus: v || null }); },
    partnerName: function (v) { var p = secondAdult(); return Spine.upsertPerson({ id: p.id, label: v || 'The other of you' }); },
    partnerDob: function (v) { var p = secondAdult(); var s = String(v || ''); return Spine.upsertPerson({ id: p.id, dob: /^\d{4}$/.test(s) ? s + '-01-01' : (s || null) }); },
    grossAnnualIncome: function (v, ctx) { return sourcePatch(ctx, { grossAnnualIncomeCents: Money.isEntered(v) ? Math.round(v) : null }); },
    incomeType: function (v, ctx) { return sourcePatch(ctx, { type: v || null }); },
    paySurvives: function (v, ctx) { return sourcePatch(ctx, { survivesJobLoss: v === null || v === undefined ? null : !!v }); },
    employerMatch: function (v, ctx) { return sourcePatch(ctx, { employerMatch: v && typeof v === 'object' ? v : null }); },
    unemployment: function (v) {
      if (typeof v === 'string') return unemploymentPatch({ benefitStatus: v || null });
      return unemploymentPatch({ benefitWeeklyCents: Money.isEntered(v) ? Math.round(v) : null });
    },
    expectedSearchMonths: function (v) { return unemploymentPatch({ expectedSearchMonths: Money.isEntered(v) ? v : null }); },
    lastPay: function (v) { return unemploymentPatch({ lastGrossAnnualCents: Money.isEntered(v) ? Math.round(v) : null }); },
    floorMonthly: function (v) { return unemploymentPatch({ floorMonthlyCents: Money.isEntered(v) ? Math.round(v) : null }); },
    payCadence: setAt('calendar.cadence', 'Paid'),
    nextPayday: setAt('calendar.nextPaydayDay', 'Next payday'),
    incomeLow: function (v, ctx) { var s = variableSource(Spine.getProfile()); return sourcePatch(ctx && ctx.itemId ? ctx : { itemId: s ? s.id : null }, { variableLowCents: Money.isEntered(v) ? Math.round(v) : null }, { frequency: 'variable' }); },
    incomeHigh: function (v, ctx) { var s = variableSource(Spine.getProfile()); return sourcePatch(ctx && ctx.itemId ? ctx : { itemId: s ? s.id : null }, { variableHighCents: Money.isEntered(v) ? Math.round(v) : null }, { frequency: 'variable' }); },
    bufferMonths: setAt('variableIncome.bufferMonths', 'Buffer, months'),
    variableWindow: setAt('variableIncome.windowMonths', 'Rolling window'),
    assetValue: function (v, ctx) { return itemPatch(Spine.upsertAsset, ctx, { valueCents: Money.isEntered(v) ? Math.round(v) : null }); },
    assetCharacter: function (v, ctx) { return itemPatch(Spine.upsertAsset, ctx, { taxCharacter: v || null }); },
    assetTier: function (v, ctx) { return itemPatch(Spine.upsertAsset, ctx, { tier: v || null }); },
    assetCostBasis: function (v, ctx) { return itemPatch(Spine.upsertAsset, ctx, { costBasisCents: Money.isEntered(v) ? Math.round(v) : null }); },
    contributionPercent: setAt('retirement.contributionPercent', 'Contribution'),
    rothContributed: centsAt('retirement.rothContributedCents', 'Roth so far'),
    hsaContributed: centsAt('retirement.hsaContributedCents', 'HSA so far'),
    tuitionSaved: centsAt('kids.tuitionSavedCents', 'Saved for tuition'),
    allocationStocks: setAt('allocation.stocks', 'Target: stocks'),
    allocationBonds: setAt('allocation.bonds', 'Target: bonds'),
    allocationCash: setAt('allocation.cash', 'Target: cash'),
    rebalanceBand: setAt('allocation.rebalanceBand', 'Rebalance band'),
    stockShare: setAt('decumulation.stockShare', 'Share in stocks'),
    hasDebt: function (v) { return Spine.set('meta.hasDebt', v === null || v === undefined ? null : !!v, v ? 'Has debt' : 'No debt'); },
    debtBalance: function (v, ctx) { return itemPatch(Spine.upsertDebt, ctx, { balanceCents: Money.isEntered(v) ? Math.round(v) : null }); },
    debtRate: function (v, ctx) { return itemPatch(Spine.upsertDebt, ctx, { rate: Money.isEntered(v) ? v : null }); },
    debtMinPayment: function (v, ctx) { return itemPatch(Spine.upsertDebt, ctx, { minPaymentCents: Money.isEntered(v) ? Math.round(v) : null }); },
    loanPlan: setAt('studentLoans.plan', 'Student loan plan'),
    loanExtra: centsAt('studentLoans.extraMonthlyCents', 'Extra to the loans'),
    idrShare: setAt('studentLoans.idrShare', 'Income-driven share'),
    forgivenessYears: setAt('studentLoans.forgivenessYears', 'Forgiveness after'),
    marginalRate: function (v) { return Spine.setAssumptionOverride('marginalRate', Money.isEntered(v) ? v : null); },
    otherPreTax: centsAt('tax.otherPreTaxAnnualCents', 'Other pre-tax'),
    withheld: centsAt('tax.withheldAnnualCents', 'Withheld so far'),
    foodMonthly: function (v) { return Spine.setFat({ food: Money.isEntered(v) ? Math.round(v) : null }); },
    accommodationMonthly: function (v) { return Spine.setFat({ accommodation: Money.isEntered(v) ? Math.round(v) : null }); },
    transportationMonthly: function (v) { return Spine.setFat({ transportation: Money.isEntered(v) ? Math.round(v) : null }); },
    wantsMonthly: function (v) { return Spine.setFat({ wants: Money.isEntered(v) ? Math.round(v) : null }); },
    therapyMonthly: function (v) { return Spine.setFat({ therapy: Money.isEntered(v) ? Math.round(v) : null }); },
    annualLine: function (v, ctx) { return itemPatch(Spine.upsertAnnualLine, ctx, { amountCents: Money.isEntered(v) ? Math.round(v) : null }); },
    healthCover: setAt('insurance.health.type', 'Health cover'),
    healthMonthly: centsAt('insurance.health.monthlyCents', 'Health cover, a month'),
    highestDeductible: centsAt('insurance.highestDeductibleCents', 'Highest deductible'),
    oopMax: centsAt('insurance.oopMaxCents', 'Out-of-pocket maximum'),
    termLife: centsAt('insurance.termLifeCents', 'Term life'),
    disabilityMonthly: centsAt('insurance.disabilityMonthlyCents', 'Disability benefit'),
    umbrella: boolAt('insurance.umbrella', 'Umbrella policy'),
    givingPct: setAt('giving.pctOfIncome', 'Giving, share of income'),
    givingTarget: centsAt('giving.annualTargetCents', 'Giving, a year'),
    splitMode: setAt('partner.splitMode', 'How shared costs are split'),
    sharedMonthly: centsAt('partner.sharedMonthlyCents', 'Shared costs'),
    beneficiariesSet: boolAt('estate.beneficiariesSet', 'Beneficiaries named'),
    willExists: boolAt('estate.willExists', 'A will'),
    poaExists: boolAt('estate.poaExists', 'A power of attorney'),
    retireAge: setAt('targets.retireAge', 'Stop working at'),
    coastAge: setAt('targets.coastAge', 'Coast: arrive by')
  };
  Object.keys(WRITES).forEach(function (id) { if (FIELDS[id] && !FIELDS[id].write) FIELDS[id].write = WRITES[id]; });

  function field(fieldId) { return FIELDS[fieldId] || null; }

  /* ---- Links -------------------------------------------------------------
     Registry hrefs are written relative to map.html, which sits at the repo
     root. A page inside rooms/ therefore needs one level up. Working this
     out here — rather than in each room — is what stopped the last round of
     path bugs when the Map moved.                                        */

  function isInRoomsDir() {
    return typeof location !== 'undefined' && location.pathname.indexOf('/rooms/') !== -1;
  }

  /* One owner per number (D-017) means this app is forever sending people to
     another room to fill something in. Until now nothing brought them back:
     you tapped through and were stranded wherever you landed. Every
     cross-room link now carries where it came from, and the header on the
     far side offers the way back. The query string sits before the anchor,
     which is the only order a browser honours. D-161. */
  function linkTo(roomId, anchor, fromRoomId) {
    var room = Registry.byId(roomId);
    if (!room) return '#';
    var href = (isInRoomsDir() ? '../' : '') + room.href;
    if (fromRoomId && fromRoomId !== roomId && Registry.byId(fromRoomId)) {
      href += (href.indexOf('?') === -1 ? '?' : '&') + 'from=' + encodeURIComponent(fromRoomId);
    }
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
      href: linkTo(f.owner, f.anchor, currentRoomId),
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
      age: isSet ? ageOf(household, fieldId) : null,
      /* The three facts (15.1, 15.10; D-181): as of when, how it arrived,
         how sure. `level` is the confidence word; `glyph` its one character
         for the field-status ledger. */
      meta: isSet ? Schema.meta(household || {}, fieldId) : null,
      level: isSet ? Schema.confidenceOf(household || {}, fieldId) : null,
      glyph: isSet ? CONFIDENCE_GLYPH[Schema.confidenceOf(household || {}, fieldId)] : (userSaysNa(household, fieldId) ? '\u2014' : '\u25CB')
    };
  }

  /* sure · roughly · unsure · unknown, as one character each (15.10). */
  var CONFIDENCE_GLYPH = { sure: '\u25CF', roughly: '\u25D0', unsure: '\u25D4', unknown: '\u25CC' };
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
  /* ---- DAITE (D-171): ownership is checked against the registry ----------
     A field's owner must be a room whose registry entry declares it writes
     the field's DAITE path; the test suite holds every field to it, and a
     shared write refuses when the map and the registry disagree. */
  function daiteModule() {
    if (typeof module === 'object' && module.exports) { try { return require('./daite.js'); } catch (e) { return null; } }
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    return g && g.SLAF && g.SLAF.Daite ? g.SLAF.Daite : null;
  }
  function pathOf(fieldId) {
    var D = daiteModule();
    return D ? D.pathOf(fieldId) : null;
  }
  /** The rooms the registry says may write this field's path. */
  function declaredWriters(fieldId) {
    var p = pathOf(fieldId);
    return p && Registry.writersOf ? Registry.writersOf(p) : [];
  }
  /** The owner, and whether the registry agrees. */
  function ownerOf(fieldId) {
    var f = field(fieldId);
    if (!f) return null;
    var writers = declaredWriters(fieldId);
    return { owner: f.owner, path: pathOf(fieldId), declared: writers, agrees: writers.length === 0 ? null : writers.indexOf(f.owner) !== -1 };
  }

  /* A new line in a list (a debt, an account, a source, a yearly line):
     the list's owner room's own constructor and spine call, so Express
     and the doors add through the owner exactly as they write. D-208. */
  var LISTS = {
    debt: { owner: 'debt-payoff', path: 'debt.items', add: function (f) { Spine.set('meta.hasDebt', true); return Spine.upsertDebt(Schema.createDebt(Object.assign({ label: 'A debt', type: 'other' }, f || {}))); } },
    asset: { owner: 'statement', path: 'assets', add: function (f) { var p = primary(); return Spine.upsertAsset(Schema.createAsset(Object.assign({ label: 'An account', category: 'investment', ownerIds: [p.id] }, f || {}))); } },
    incomeSource: { owner: 'start', path: 'income.grossAnnualCents', add: function (f) { var p = primary(); return Spine.upsertIncomeSource(p.id, Schema.createIncomeSource(Object.assign({ personId: p.id, source: 'A source', type: 'w2' }, f || {}))); } },
    annualLine: { owner: 'expenses', path: 'expenses.annual[]', add: function (f) { return Spine.upsertAnnualLine(Object.assign({ label: 'A yearly cost' }, f || {})); } }
  };
  function addItem(kind, fields) {
    var L = LISTS[kind];
    if (!L) throw new Error('No such list: ' + kind);
    var writers = Registry.writersOf ? Registry.writersOf(L.path) : [];
    if (writers.length && writers.indexOf(L.owner) === -1) throw new Error('The registry does not list ' + L.owner + ' as a writer of ' + L.path);
    return L.add(fields);
  }
  function removeItem(kind, id) {
    if (!LISTS[kind]) throw new Error('No such list: ' + kind);
    if (kind === 'annualLine') return Spine.removeAnnualLine(id);
    if (kind === 'incomeSource') { var p = primary(); return Spine.upsertPerson({ id: p.id, incomeSources: (p.incomeSources || []).filter(function (s) { return s.id !== id; }) }); }
    return Spine.removeById(kind === 'debt' ? 'debts' : 'assets', id);
  }

  function write(fieldId, value, ctx) {
    var f = field(fieldId);
    if (!f || typeof f.write !== 'function') {
      throw new Error('No shared write path for ' + fieldId + ' — write it in its owner room');
    }
    var o = ownerOf(fieldId);
    if (o && o.agrees === false) {
      throw new Error('The registry does not list ' + f.owner + ' as a writer of ' + o.path + ' — fix shared/registry.js before writing ' + fieldId);
    }
    var out = f.write(value, ctx || null);
    /* One line of a repeat row got a value: its "not sure yet" is over (D-209).
       The spine clears the field-level mark itself on save. */
    if (ctx && ctx.itemId && value !== null && value !== undefined && Spine.notSureOf && Spine.notSureOf(fieldId + ':' + ctx.itemId)) Spine.setNotSure(fieldId + ':' + ctx.itemId, null);
    return out;
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
      var level = d.level && d.level !== 'sure' ? ' <span class="slaf-owned-conf slaf-owned-conf--' + d.level + '" title="' + escapeHtml(d.level) + '">' + d.glyph + ' ' + escapeHtml(d.level) + '</span>' : '';
      return '<a class="slaf-owned' + (d.age && d.age.stale === true ? ' slaf-owned--stale' : '') + (d.guessed ? ' slaf-owned--guess' : '') + (d.level && d.level !== 'sure' ? ' slaf-owned--' + d.level : '')
        + '" href="' + d.href + '" data-confidence="' + escapeHtml(d.level || '') + '">'
        + '<span class="slaf-owned-label">' + escapeHtml(d.label) + '</span>'
        + '<span class="slaf-owned-value">' + escapeHtml(d.display) + '</span>'
        + '<span class="slaf-owned-from">' + (d.guessed ? 'a guess \u2014 fix it in ' : 'from ') + escapeHtml(d.ownerTitle) + ' →' + age + level + '</span>'
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
  /* The field map Schema.get / Schema.meta resolve through (15.1, D-181). */
  if (Schema && typeof Schema.useFieldMap === 'function') {
    Schema.useFieldMap({
      ids: function () { return Object.keys(FIELDS); },
      read: function (h, id) { return FIELDS[id] ? FIELDS[id].read(h || {}) : null; },
      pathOf: function (id) { var D = daiteModule(); return D ? D.pathOf(id) : null; }
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
    addItem: addItem,
    removeItem: removeItem,
    LISTS: LISTS,
    ownerOf: ownerOf,
    declaredWriters: declaredWriters,
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
