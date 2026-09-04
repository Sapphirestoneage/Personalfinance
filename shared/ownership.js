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
      Registry: require('./registry.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Registry: root.SLAF && root.SLAF.Registry
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Registry);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Ownership = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Registry) {
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

  /* ---- The ownership map -------------------------------------------------
     owner   — the room id that may EDIT this field
     anchor  — the section in that room to land on
     read    — pull the current value out of the household, as a Result
     format  — how to show it once read                                    */

  var FIELDS = {
    dob: {
      label: 'Date of birth', owner: 'start', anchor: 'q-dob',
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
      label: 'Age', owner: 'start', anchor: 'q-dob',
      read: function (h) {
        var a = Schema.primaryAge(h);
        return Money.isEntered(a) ? Money.ok(a) : Money.incomplete('Not set yet.', ['dob']);
      },
      format: function (v) { return v + ''; }
    },
    state: {
      label: 'State', owner: 'start', anchor: 'q-state',
      read: function (h) { return h.state ? Money.ok(h.state) : Money.incomplete('Not set yet.', ['state']); },
      format: function (v) { return v; }
    },
    filingStatus: {
      label: 'Filing status', owner: 'start', anchor: 'q-filing',
      read: function (h) {
        return h.filingStatus ? Money.ok(h.filingStatus) : Money.incomplete('Not set yet.', ['filingStatus']);
      },
      format: function (v) { return FILING_LABELS[v] || v; }
    },
    grossAnnualIncome: {
      label: 'Gross annual income', owner: 'start', anchor: 'q-income',
      read: function (h) { return Schema.grossAnnualIncomeCents(h); },
      format: money
    },
    cashSavings: {
      label: 'Cash & savings', owner: 'start', anchor: 'q-cash',
      read: function (h) { return Schema.cashCents(h); },
      format: money
    },
    investments: {
      label: 'Investments + retirement', owner: 'start', anchor: 'q-investments',
      read: function (h) { return Schema.investmentsCents(h); },
      format: money
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
      label: 'Employer match', owner: 'start', anchor: 'q-match',
      read: function (h) { return Schema.employerMatchCents(h); },
      format: function (v) { return money(v) + '/yr'; },
      /* No employer, no match to ask about. See applies() below. */
      applies: function (h) { return Schema.couldHaveEmployerMatch(h); },
      notApplicableBecause: 'You said there is no employer.'
    },
    capturingFullMatch: {
      label: 'Capturing the full match', owner: 'start', anchor: 'q-capturing',
      read: function (h) {
        if (h.capturingFullMatch === true) return Money.ok(true);
        if (h.capturingFullMatch === false) return Money.ok(false);
        return Money.incomplete('Not answered yet.', ['capturingFullMatch']);
      },
      format: function (v) { return v ? 'Yes' : 'No'; },
      applies: function (h) { return Schema.couldHaveEmployerMatch(h); },
      notApplicableBecause: 'You said there is no employer.'
    },

    /* Where It Goes owns your retirement setup. These were asked by the FOO
       ladder AND by Where It Goes, and kept by neither — the same question
       twice, forgotten twice. DECISIONS.md D-052. */
    contributionPercent: {
      label: 'Workplace contribution', owner: 'accounts', anchor: 'setup',
      read: function (h) {
        var v = (h.retirement || {}).contributionPercent;
        return Money.isEntered(v) ? Money.ok(v)
          : Money.incomplete('Not answered yet.', ['contributionPercent']);
      },
      format: function (v) { return v + '% of salary'; }
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
      format: money
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
      label: 'Highest deductible', owner: 'sleep-at-night', anchor: 'deductible',
      read: function (h) {
        var v = (h.insurance || {}).highestDeductibleCents;
        return Money.isEntered(v) ? Money.ok(v)
          : Money.incomplete('Not answered yet.', ['highestDeductibleCents']);
      },
      format: money
    },

    /* Debt Payoff owns every debt figure. The Financial Snapshot used to take
       a lump sum for both of these; it now shows them and links here. */
    totalDebt: {
      label: 'Total debt', owner: 'debt-payoff', anchor: 'debts',
      read: function (h) { return Schema.totalDebtCents(h); },
      format: money
    },
    monthlyDebtPayments: {
      label: 'Monthly debt payments', owner: 'debt-payoff', anchor: 'debts',
      read: function (h) { return Schema.monthlyDebtPaymentsCents(h); },
      format: function (v) { return money(v) + '/mo'; }
    },

    /* The Net Worth room owns everything you own that Start Here doesn't
       ask about — a house, a car, anything else. */
    otherAssets: {
      label: 'Property & other assets', owner: 'net-worth', anchor: 'assets',
      read: function (h) { return Schema.otherAssetsCents(h); },
      format: money
    },
    netWorth: {
      label: 'Net worth', owner: 'net-worth', anchor: 'out-net-worth',
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

    monthlyExpenses: {
      label: 'Monthly expenses', owner: 'cash-flow', anchor: 'spending',
      read: function (h) { return Schema.monthlyExpensesCents(h); },
      format: function (v) { return money(v) + '/mo'; }
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
      /* Some fields stop being questions once you have answered another one.
         An employer match is not missing when there is no employer — it is
         not applicable, which is a different thing and must never be counted
         as an outstanding task. Fields with no applies() always apply.
         DECISIONS.md D-055. */
      applies: f.applies ? !!f.applies(household || {}) : true,
      notApplicableBecause: f.notApplicableBecause || null
    };
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
  function chip(fieldId, household, currentRoomId) {
    var d = describe(fieldId, household, currentRoomId);
    if (!d) return '';
    if (d.isSet) {
      return '<a class="slaf-owned" href="' + d.href + '">'
        + '<span class="slaf-owned-label">' + escapeHtml(d.label) + '</span>'
        + '<span class="slaf-owned-value">' + escapeHtml(d.display) + '</span>'
        + '<span class="slaf-owned-from">from ' + escapeHtml(d.ownerTitle) + ' →</span>'
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
  function ownedBy(roomId) {
    return Object.keys(FIELDS).filter(function (k) { return FIELDS[k].owner === roomId; });
  }

  return {
    FIELDS: FIELDS,
    FILING_LABELS: FILING_LABELS,
    field: field,
    linkTo: linkTo,
    describe: describe,
    chip: chip,
    inlineChip: inlineChip,
    ownedBy: ownedBy
  };
});
