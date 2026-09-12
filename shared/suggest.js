/* ==========================================================================
   shared/suggest.js — a value the app proposes, shown but not taken.
   --------------------------------------------------------------------------
   Three states for a box, never collapsed (DECISIONS.md D-060):

     empty      — nothing shown but a format-only placeholder.
     suggested  — a value the app derived or looked up, rendered muted with a
                  dashed underline and a "use this" chip that names where it
                  came from. THE HOUSEHOLD DOES NOT HAVE IT. Progress counts
                  it unanswered; no engine ever sees it.
     entered    — the person typed it or tapped "use this"; the room wrote it
                  through its own path.

   This file never touches the spine. It paints and it reports; the room
   that owns the field does every write. That is what keeps "no formula
   reads a suggested value" true by construction rather than by discipline:
   a suggested value exists only in a DOM node's display, and the moment
   the node is focused the display is cleared, so a blur handler that reads
   node.value gets '' — exactly what it would get for an empty box.

   Nothing is rebuilt. show() writes .value and classes on a node that is
   already in the page and adds one chip beside it, once, on first use.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Suggest = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var CLS_INPUT = 'slaf-input--suggested';
  var CLS_SHELL = 'is-suggested';
  var CLS_CHIP  = 'slaf-use-this';
  var CLS_SRC   = 'slaf-suggest-source';

  function shellOf(node) {
    return node && node.closest ? node.closest('.slaf-input-shell') : null;
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* The chip lives once per node, INSIDE the input shell as its last
     flex item — beside the affix, never below the box — so a suggestion
     adds no height and a row of side-by-side boxes stays a row. (Below the
     box it made one grid cell 80px taller than its neighbour.) Without a
     shell it sits right after the node. The source sentence goes to the
     nearest [data-suggest-note] in the card if the room provides one, and
     to the chip's title regardless. Created on first show(), then only
     toggled; it keeps its space when off (visibility, not [hidden]) so
     nothing under a finger moves. Same family of bug as D-046. */
  function chipFor(node) {
    if (node._slafChip) return node._slafChip;
    var shell = shellOf(node);
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = CLS_CHIP + ' is-off';
    var src = noteHostFor(node) || document.createElement('span');
    if (!src.hasAttribute('data-suggest-note')) {
      src.className = CLS_SRC + ' is-off';
      (shell || node).insertAdjacentElement('afterend', src);
    }
    if (shell) shell.appendChild(chip); else node.insertAdjacentElement('afterend', chip);
    chip.addEventListener('click', function () {
      var s = node._slafSuggest;
      if (!s) return;
      var value = s.value;
      clear(node);
      /* The room writes. This file does not. */
      if (typeof s.onUse === 'function') s.onUse(value);
      node.dispatchEvent(new Event('change', { bubbles: true }));
    });
    node._slafChip = chip;
    node._slafSource = src;
    node.addEventListener('focus', function () {
      /* Typing starts from a blank, so a blur handler reading node.value
         can never pick the suggestion up as an answer. */
      if (isSuggested(node)) {
        node.value = '';
        node.classList.remove(CLS_INPUT);
        /* From here on what is in the box is the person's, so it must read
           as entered — otherwise a commit on the way out would drop it. */
        node.removeAttribute('data-suggested');
        var shell = shellOf(node); if (shell) shell.classList.remove(CLS_SHELL);
      }
    });
    node.addEventListener('blur', function () {
      /* Left it blank: offer the suggestion again rather than an empty box. */
      if (node._slafSuggest && String(node.value || '').trim() === '') paint(node);
    });
    return chip;
  }

  function noteHostFor(node) {
    var card = node.closest ? (node.closest('.slaf-card') || node.closest('section') || node.closest('form')) : null;
    return card ? card.querySelector('[data-suggest-note]') : null;
  }

  function paint(node) {
    var s = node._slafSuggest;
    if (!s) return;
    /* A box the person is already in is theirs. Remember the proposal (blur
       offers it if the box is left blank) but do not mark the box: marking
       it would make whatever they type read as "only suggested". */
    if (node === document.activeElement) { chipFor(node); return; }
    node.value = s.display;
    node.classList.add(CLS_INPUT);
    var shell = shellOf(node); if (shell) shell.classList.add(CLS_SHELL);
    node.setAttribute('data-suggested', '1');
    node.setAttribute('data-suggest-source', s.source || '');
    var chip = chipFor(node);
    chip.classList.remove('is-off');
    chip.textContent = s.useLabel || 'Use';
    chip.setAttribute('title', s.source ? 'From: ' + s.source : 'Suggested');
    node._slafSource.classList.remove('is-off');
    node._slafSource.hidden = false;
    node._slafSource.innerHTML = 'Suggested' + (s.source ? ' — ' + escapeHtml(s.source) : '') + '. Tap “Use”, or type your own.';
  }

  /**
   * show(node, { value, display, source, onUse, useLabel })
   *   value    — what onUse receives (cents, a rate, a string)
   *   display  — what the box shows (already formatted); defaults to value
   *   source   — a short sentence naming where it came from
   *   onUse    — the room's write, called with `value` on "use this"
   * A node that already holds an ENTERED value is left alone: a suggestion
   * never overwrites an answer.
   */
  function show(node, spec) {
    if (!node || !spec) return false;
    if (!isSuggested(node) && String(node.value || '').trim() !== '') return false;
    node._slafSuggest = {
      value: spec.value,
      display: spec.display === undefined ? String(spec.value) : String(spec.display),
      source: spec.source || '',
      onUse: spec.onUse,
      useLabel: spec.useLabel
    };
    paint(node);
    return true;
  }

  /** Drop the suggestion and its chip; the box reads as empty. */
  function clear(node) {
    if (!node) return;
    var had = !!node._slafSuggest;
    node._slafSuggest = null;
    if (had && node !== document.activeElement) node.value = '';
    node.classList.remove(CLS_INPUT);
    node.removeAttribute('data-suggested');
    node.removeAttribute('data-suggest-source');
    var shell = shellOf(node); if (shell) shell.classList.remove(CLS_SHELL);
    if (node._slafChip) {
      node._slafChip.classList.add('is-off');
      /* A shared note host is cleared, not just faded: another box in the
         same card may be using it next. */
      if (node._slafSource.hasAttribute('data-suggest-note')) node._slafSource.textContent = '';
      else node._slafSource.classList.add('is-off');
    }
  }

  function isSuggested(node) {
    return !!(node && node.getAttribute && node.getAttribute('data-suggested') === '1');
  }

  /** node.value, or '' when what is showing is only a suggestion. */
  function entered(node) {
    if (!node) return '';
    return isSuggested(node) ? '' : String(node.value || '');
  }

  /** Everything currently suggested inside a root, for a room's summary. */
  function all(rootNode) {
    var host = rootNode || (typeof document !== 'undefined' ? document : null);
    if (!host || !host.querySelectorAll) return [];
    return Array.prototype.slice.call(host.querySelectorAll('[data-suggested="1"]'));
  }

  /* ======================================================================
     The rules (D-205): every answer fills more than one row, as SUGGESTIONS.
     ----------------------------------------------------------------------
     A suggestion is DERIVED, never stored. suggestions(h, tables) runs every
     rule named by a ledger row's suggestFrom (data/ledger-rows.json) against
     the household and the reference tables and returns what it could guess;
     a row the person has entered is never suggested, a row with no rule
     stays blank, and a rule with nothing to read returns nothing. So the
     stored household never carries a guess: the only thing ever written is
     a confirmed value, through the owner, tagged source 'suggested' at
     confidence roughly (confirm()).

     Each rule is one function: (ctx) → { value, unit, display, how, sources }
     or null. ctx.value(rowId) reads the entered value, else an EARLIER
     suggestion in this run (a suggested state can feed the benefit cap);
     ctx.real(rowId) reads only what is entered. A suggestion that leaned on
     another suggestion lists it in dependsOn, so any output built on it can
     be labelled rough. `how` is the one line "how I guessed this" and
     `sources` names the data/ file(s) behind the number.

     overlay(h, tables) → { household, used } is for a formula that may read
     suggested values: a COPY with every suggestion applied, and the list of
     what was applied, so the caller labels its output rough. Nothing here
     touches the spine except confirm().
     ====================================================================== */
  var MONTHS = 12;
  function deps() {
    if (typeof module === 'object' && module.exports) {
      return {
        Money: require('./money.js'), Schema: require('./schema.js'), Ownership: require('./ownership.js'),
        Tax: require('../engines/tax.js'), Spine: require('./spine-v2.js'),
        /* D-214: the derivation ledger reads the SE-tax half from the one
           engine that derives it, and the situation from the one gate. */
        SelfEmployed: (function () { try { return require('../engines/selfemployed.js'); } catch (e) { return null; } })(),
        Gate: (function () { try { return require('./gate.js'); } catch (e) { return null; } })(),
        LedgerRows: (function () { try { return require('./ledger-rows.js'); } catch (e) { return null; } })()
      };
    }
    var g = typeof self !== 'undefined' ? self : null;
    var S = g && g.SLAF ? g.SLAF : {};
    return { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, Tax: S.Tax, Spine: S.Spine,
      SelfEmployed: S.SelfEmployed || null, Gate: S.Gate || null, LedgerRows: S.LedgerRows };
  }
  function pct(r) { return Math.round(r * 1000) / 10 + '%'; }
  function money(D, c) { return D.Money.formatCents(c); }

  var RULES = {
    /* ---- The derivation ledger (D-214) ---------------------------------
       Rows the intake rendered blank while a table in data/ already knew a
       reasonable first figure. Each is a SUGGESTION: it carries where it
       came from and is never stored until tapped (D-205). None invents a
       fact about this household. */

    /* The three needs buckets, from the typical month. NOT scaled by
       cost of living: data/col_index.json is an index of 40 named cities
       and nothing in the app stores which city you are in, so scaling by
       it would be a guess dressed as arithmetic. National, and it says so. */
    accommodationFromTypical: function (c) {
      var t = c.tables.commonCosts;
      if (!t) return null;
      var line = (t.lines || []).filter(function (l) { return l.id === 'rent_or_mortgage'; })[0];
      if (!line || !c.D.Money.isEntered(line.monthlyCents)) return null;
      return { value: line.monthlyCents, unit: 'cents', display: money(c.D, line.monthlyCents) + ' a month',
        how: 'The typical rent or mortgage in the common-costs table, nationally. Yours is almost certainly different: this is somewhere to start, not a guess at your rent.',
        sources: ['data/common_costs.json'] };
    },
    foodFromTypical: function (c) {
      var t = c.tables.commonCosts;
      if (!t) return null;
      var line = (t.lines || []).filter(function (l) { return l.id === 'groceries'; })[0];
      if (!line || !c.D.Money.isEntered(line.monthlyCents)) return null;
      return { value: line.monthlyCents, unit: 'cents', display: money(c.D, line.monthlyCents) + ' a month',
        how: 'Groceries in the common-costs table. Eating out belongs in everything else, not here.',
        sources: ['data/common_costs.json'] };
    },
    transportFromTypical: function (c) {
      var t = c.tables.commonCosts;
      if (!t) return null;
      var lines = (t.lines || []).filter(function (l) { return l.categoryId === 'transportation'; });
      if (!lines.length) return null;
      var v = lines.reduce(function (n, l) { return n + (c.D.Money.isEntered(l.monthlyCents) ? l.monthlyCents : 0); }, 0);
      if (v <= 0) return null;
      return { value: v, unit: 'cents', display: money(c.D, v) + ' a month',
        how: 'The transportation lines in the common-costs table added up: ' + lines.map(function (l) { return l.label.toLowerCase(); }).join(' and ') + '.',
        sources: ['data/common_costs.json'] };
    },
    /* The window a variable income is averaged over. */
    windowFromConvention: function (c) {
      var t = c.tables.variableIncomeConventions && c.tables.variableIncomeConventions.buffer;
      if (!t || !c.D.Money.isEntered(t.usualMonths)) return null;
      return { value: t.usualMonths, unit: 'months', display: t.usualMonths + ' months',
        how: 'The usual window in the variable-income conventions: ' + t.usualMonths + ' months is enough history to see the swing without burying this month in it.',
        sources: ['data/variable_income_conventions.json'] };
    },
    /* How two people split what they share. The conventions file says equal
       is chosen when the incomes are close and proportional when they are
       far apart, so the two incomes already answer it. */
    splitFromIncomes: function (c) {
      var t = c.tables.partnerConventions;
      if (!t || !c.D.Schema.householdOfTwo(c.h)) return null;
      var pay = (c.h.people || []).slice(0, 2).map(function (p) {
        return (p.incomeSources || []).reduce(function (n, src) {
          return n + (c.D.Money.isEntered(src.grossAnnualIncomeCents) ? src.grossAnnualIncomeCents : 0);
        }, 0);
      });
      if (pay.length < 2 || pay[0] <= 0 || pay[1] <= 0) return null;
      var hi = Math.max(pay[0], pay[1]), lo = Math.min(pay[0], pay[1]);
      var close = lo / hi >= 0.8;
      var mode = (t.modes || []).filter(function (m) { return m.id === (close ? 'equal' : 'proportional'); })[0];
      if (!mode) return null;
      return { value: mode.id, unit: 'enum', display: mode.label,
        how: close
          ? 'The two incomes are within a fifth of each other, and that is when people choose an equal split.'
          : 'One income is more than a fifth larger than the other, and that is when people choose to split in proportion.',
        sources: ['data/partner_conventions.json'] };
    },
    /* Giving: the table's own proposed share, which is the US average. */
    givingFromAverage: function (c) {
      var t = c.tables.givingConventions;
      if (!t) return null;
      var share = (t.shares || []).filter(function (x) { return x.id === t.proposeId; })[0];
      if (!share || !c.D.Money.isEntered(share.pct)) return null;
      return { value: share.pct, unit: 'percent', display: share.label,
        how: share.label + ' is ' + share.note + '. Somewhere to start, not a target anybody set for you.',
        sources: ['data/giving_conventions.json'] };
    },
    /* A repayment plan: standard, unless an income-driven payment would be
       lower, which is the whole reason income-driven plans exist. */
    loanPlanFromIncome: function (c) {
      var t = c.tables.studentLoanConventions;
      if (!t) return null;
      var loans = (c.h.debts || []).filter(function (d) { return d.type === 'student_loan'; });
      if (!loans.length) return null;
      var bal = loans.reduce(function (n, d) { return n + (c.D.Money.isEntered(d.balanceCents) ? d.balanceCents : 0); }, 0);
      var gross = c.real('grossAnnualIncome');
      if (bal <= 0 || !c.D.Money.isEntered(gross)) return null;
      var standard = Math.round(bal / (t.standardTermYears * 12));
      var floor = t.povertyLineDollars * 100 * t.discretionaryPovertyMultiple;
      var idr = Math.round(Math.max(0, gross - floor) * t.idrShareOfDiscretionary / 12);
      var driven = idr < standard;
      return { value: driven ? 'income_driven' : 'standard', unit: 'enum',
        display: driven ? 'Income-driven' : 'Standard',
        how: driven
          ? 'An income-driven payment works out around ' + money(c.D, idr) + ' a month against ' + money(c.D, standard) + ' on the standard ' + t.standardTermYears + '-year plan, so it is the lower one.'
          : 'The standard ' + t.standardTermYears + '-year payment of about ' + money(c.D, standard) + ' a month is already at or below an income-driven one, so there is nothing to gain by switching.',
        sources: ['data/student_loan_conventions.json'] };
    },
    /* Pre-tax money beyond the workplace plan: on own work, the deductible
       half of the self-employment tax, from the one engine that derives it. */
    preTaxFromSeTax: function (c) {
      var SE = c.D.SelfEmployed, se = c.tables.seTax;
      if (!SE || !se) return null;
      var sit = c.D.Gate ? c.D.Gate.situationOf(c.h) : null;
      if (sit !== 'selfEmployed' && sit !== 'mixed') return null;
      var gross = c.real('grossAnnualIncome');
      if (!c.D.Money.isEntered(gross) || gross <= 0) return null;
      var r = SE.selfEmploymentTax(gross, c.h.filingStatus || 'single', se);
      if (!c.D.Money.isOk(r) || !c.D.Money.isEntered(r.deductibleHalfCents) || r.deductibleHalfCents <= 0) return null;
      return { value: r.deductibleHalfCents, unit: 'cents', display: money(c.D, r.deductibleHalfCents) + ' a year',
        how: 'Half the self-employment tax comes off before income tax, standing in for the half an employer would have paid. On ' + money(c.D, gross) + ' that is ' + money(c.D, r.deductibleHalfCents) + '.',
        sources: ['data/tax_brackets.json'] };
    },
    /* Which pile an asset sits in follows from what the row already says it
       is, so this reads the row rather than looking anything up. */
    tierFromCharacter: function (c) {
      var a = c.item;
      if (!a || !a.taxCharacter) return null;
      var MAP = { cash: 'cash', taxable: 'taxable', pretax: 'retirement', roth: 'retirement',
        hsa: 'retirement', '529': 'other', daf: 'other', property: 'property', business: 'other' };
      var tier = MAP[a.taxCharacter];
      if (!tier) return null;
      var LABEL = { cash: 'Cash', taxable: 'Taxable', retirement: 'Retirement', property: 'Property', other: 'Other' };
      return { value: tier, unit: 'enum', display: LABEL[tier],
        how: 'It is already marked ' + a.taxCharacter + ', and that sits in the ' + LABEL[tier].toLowerCase() + ' pile.',
        sources: ['shared/ownership.js'] };
    },
    zipToState: function (c) {
      var t = c.tables.zipPrefixes, zip = c.real('zip');
      if (!t || !zip) return null;
      var prefix = String(zip).replace(/\D/g, '').slice(0, 3);
      if (prefix.length !== 3) return null;
      var hit = (t.ranges || []).filter(function (r) { return prefix >= r[0] && prefix <= r[1]; })[0];
      if (!hit) return null;
      return { value: hit[2], unit: 'enum', display: hit[2],
        how: 'From the first three digits of your ZIP (' + prefix + '), which the postal service assigns to ' + hit[2] + '.',
        sources: ['data/zip_prefixes.json'] };
    },
    bufferFromAge: function (c) {
      var t = c.tables.savingsPresets && c.tables.savingsPresets.ruleOfFive;
      var age = c.D.Schema.primaryAge(c.h);
      if (!t || !c.D.Money.isEntered(age)) return null;
      var v = Math.round(age / t.divisor * 10) / 10;
      return { value: v, unit: 'months', display: v + ' months',
        how: 'Rule of 5: your age (' + age + ') ÷ 5, so ' + v + ' months of spending as a buffer.',
        sources: ['data/savings_presets.json'] };
    },
    unemploymentWeekly: function (c) {
      var t = c.tables.uiBenefits;
      if (!t || !c.D.Schema.isUnemployed(c.h)) return null;
      var u = c.D.Schema.unemploymentOf(c.h);
      var pay = c.D.Money.isEntered(u.lastGrossAnnualCents) ? u.lastGrossAnnualCents : c.real('grossAnnualIncome');
      var state = c.value('state');
      if (!c.D.Money.isEntered(pay) || !state || !t.states || !t.states[state]) return null;
      var div = (t.estimate && t.estimate.highQuarterDivisor) || 26;
      var hq = Math.round(pay / 4);
      var raw = Math.round(hq / div);
      var cap = t.states[state].maxWeeklyDollars * 100;
      var v = Math.min(cap, raw);
      return { value: v, unit: 'cents', display: money(c.D, v) + ' a week',
        how: 'Your highest quarter of pay (' + money(c.D, hq) + ') ÷ ' + div + ' is ' + money(c.D, raw) + ' a week' + (raw > cap ? ', capped at ' + state + '’s maximum of ' + money(c.D, cap) : ', under ' + state + '’s maximum of ' + money(c.D, cap)) + '. An estimate; the state decides.',
        sources: ['data/ui_benefits.json'], dependsOn: c.leaned('state') };
    },
    matchNotApplicable: function (c) {
      if (!c.D.Schema.isUnemployed(c.h)) return null;
      return { value: null, na: true, unit: 'formula', display: 'Not applicable',
        how: 'No employer between jobs, so no match to capture. The row comes back when a job does.',
        sources: ['data/ledger-rows.json'] };
    },
    contributionNotApplicable: function (c) {
      if (!c.D.Schema.isUnemployed(c.h)) return null;
      return { value: null, na: true, unit: 'percent', display: 'Not applicable',
        how: 'No workplace plan between jobs. The row comes back when a job does.',
        sources: ['data/ledger-rows.json'] };
    },
    termLifeBetweenJobs: function (c) {
      var t = c.tables.protectionConventions;
      if (!t || !t.employerCoverEndsWithJob || !c.D.Schema.isUnemployed(c.h)) return null;
      return { value: 0, unit: 'cents', display: money(c.D, 0),
        how: 'Employer coverage usually ends with the job, so $0 until a personal policy is entered.',
        sources: ['data/protection_conventions.json'] };
    },
    disabilityBetweenJobs: function (c) {
      var t = c.tables.protectionConventions;
      if (!t || !t.employerCoverEndsWithJob || !c.D.Schema.isUnemployed(c.h)) return null;
      return { value: 0, unit: 'cents', display: money(c.D, 0) + ' a month',
        how: 'Employer coverage usually ends with the job, so $0 until a personal policy is entered.',
        sources: ['data/protection_conventions.json'] };
    },
    filingFromHousehold: function (c) {
      var t = c.tables.federalBrackets;
      if (!t || !c.D.Schema.primaryPerson(c.h) || c.D.Schema.householdOfTwo(c.h)) return null;
      var deps = c.real('dependents');
      var v = c.D.Money.isEntered(deps) && deps > 0 ? 'head_of_household' : 'single';
      if (!t.brackets || !t.brackets[v]) return null;
      return { value: v, unit: 'enum', display: v === 'single' ? 'Single' : 'Head of household',
        how: (v === 'single' ? 'One adult listed and nobody depending on you, so single' : 'One adult with someone depending on you, so head of household') + ', one of the four statuses the federal brackets know.',
        sources: ['data/tax_brackets.json'] };
    },
    dependentsFromHousehold: function (c) {
      if (!c.D.Schema.primaryPerson(c.h) || c.D.Schema.householdOfTwo(c.h)) return null;
      return { value: 0, unit: 'count', display: 'None',
        how: 'Nobody else is listed in the household, so none until you say otherwise.',
        sources: ['data/ledger-rows.json'] };
    },
    marginalRateFromBrackets: function (c) {
      var fed = c.tables.federalBrackets, st = c.tables.stateBrackets, Tax = c.D.Tax;
      if (!fed || !Tax) return null;
      var u = c.D.Schema.unemploymentOf(c.h);
      var gross = c.real('grossAnnualIncome');
      if (!c.D.Money.isEntered(gross) && c.D.Schema.isUnemployed(c.h)) gross = u.lastGrossAnnualCents;
      var filing = c.value('filingStatus'), state = c.value('state');
      if (!c.D.Money.isEntered(gross) || !filing) return null;
      var f = Tax.ordinaryTax(fed, gross, filing);
      if (!c.D.Money.isOk(f)) return null;
      var rate = f.marginalRate, bits = ['Federal ' + pct(f.marginalRate) + ' on the top dollar of ' + money(c.D, gross) + ' filing ' + filing.replace(/_/g, ' ')];
      var sources = ['data/tax_brackets.json'];
      if (st && state) {
        var s = Tax.stateTax(st, state, f.taxableIncomeCents, filing);
        if (c.D.Money.isOk(s)) { rate += s.marginalRate; bits.push(state + ' ' + pct(s.marginalRate)); sources.push('data/state_brackets_2026.json'); }
      }
      rate = Math.round(rate * 10000) / 10000;
      return { value: rate, unit: 'rate', display: pct(rate),
        how: bits.join(', plus ') + '. Federal only is an estimate until the brackets are verified.',
        sources: sources, dependsOn: c.leaned('filingStatus').concat(c.leaned('state')) };
    },
    healthCoverUnder26: function (c) {
      var t = c.tables.protectionConventions && c.tables.protectionConventions.dependentCoverageToAge;
      var age = c.D.Schema.primaryAge(c.h);
      if (!t || !c.D.Money.isEntered(age) || age >= t.value) return null;
      return { value: 'parent', unit: 'enum', display: 'A parent’s plan', ask: 'On a parent’s plan?',
        how: 'Under ' + t.value + ' can stay on a parent’s plan, so one tap if that is you.',
        sources: ['data/protection_conventions.json'] };
    },
    minimumFromBalance: function (c) {
      var t = c.tables.debtRules && c.tables.debtRules.minimumPayment;
      var d = c.item;
      if (!t || !d || !c.D.Money.isEntered(d.balanceCents) || c.D.Money.isEntered(d.minPaymentCents)) return null;
      var rule = (t.rules || []).filter(function (r) { return (r.appliesToTypes || []).indexOf(d.type) !== -1 && r.method === 'percent_of_balance_or_floor'; })[0];
      if (!rule) return null;
      var v = Math.max(Math.round(d.balanceCents * rule.percentOfBalance), rule.floorDollars * 100);
      return { value: v, unit: 'cents', display: money(c.D, v) + ' a month',
        how: Math.round(rule.percentOfBalance * 100) + '% of the balance or $' + rule.floorDollars + ', whichever is more: a common issuer convention, until the statement minimum is entered.',
        sources: ['data/debt_rules.json'] };
    },
    spendingFromPay: function (c) {
      var t = c.tables.onepagerDefaults;
      if (!t) return null;
      var fat = c.D.Schema.fat(c.h);
      if (c.D.Money.isOk(c.D.Schema.monthlyExpensesCents(c.h)) || (fat && fat.needsTyped)) return null;
      var u = c.D.Schema.unemploymentOf(c.h);
      var gross = c.real('grossAnnualIncome');
      if (!c.D.Money.isEntered(gross) && c.D.Schema.isUnemployed(c.h)) gross = u.lastGrossAnnualCents;
      if (!c.D.Money.isEntered(gross)) return null;
      var share = c.h.meta && c.h.meta.noRent ? t.spendingShareNoRent : t.spendingShareOfGross;
      var v = Math.max(Math.round(t.spendingFloorDollars * 100), Math.round(gross / MONTHS * share));
      return { value: v, unit: 'cents', display: money(c.D, v) + ' a month',
        how: Math.round(share * 100) + '% of ' + money(c.D, gross) + ' a year, a month, floored at $' + t.spendingFloorDollars + ': a starting guess, not a reading.',
        sources: ['data/onepager_defaults.json'] };
    },
    deductibleTypical: function (c) {
      var t = c.tables.onepagerDefaults;
      if (!t || !c.D.Schema.primaryPerson(c.h)) return null;
      var v = Math.round(t.deductibleDollars * 100);
      return { value: v, unit: 'cents', display: money(c.D, v),
        how: 'A common health-plan deductible; the plan card has the real one.',
        sources: ['data/onepager_defaults.json'] };
    },
    investmentsFromAge: function (c) {
      var t = c.tables.retirementMilestones;
      var age = c.D.Schema.primaryAge(c.h);
      if (!t || !t.milestones || !c.D.Money.isEntered(age) || age < (t.minAge || 0)) return null;
      var u = c.D.Schema.unemploymentOf(c.h);
      var gross = c.real('grossAnnualIncome');
      if (!c.D.Money.isEntered(gross) && c.D.Schema.isUnemployed(c.h)) gross = u.lastGrossAnnualCents;
      if (!c.D.Money.isEntered(gross)) return null;
      var rows = t.milestones.slice().sort(function (a, b) { return a.age - b.age; });
      var mult;
      if (age <= rows[0].age) mult = rows[0].multiple * (age / rows[0].age);
      else {
        mult = rows[rows.length - 1].multiple;
        for (var i = 1; i < rows.length; i++) {
          if (age <= rows[i].age) { var a = rows[i - 1], b = rows[i]; mult = a.multiple + (b.multiple - a.multiple) * (age - a.age) / (b.age - a.age); break; }
        }
      }
      var v = Math.round(gross * mult);
      return { value: v, unit: 'cents', display: money(c.D, v),
        how: 'The age-' + age + ' milestone is ' + (Math.round(mult * 10) / 10) + '× income: a stand-in for what is invested, not a reading of any account.',
        sources: ['data/retirement_milestones.json'] };
    },
    floorFromConvention: function (c) {
      var t = c.tables.onepagerDefaults;
      if (!t || !c.D.Schema.isUnemployed(c.h)) return null;
      var v = Math.round(t.spendingFloorDollars * 100);
      return { value: v, unit: 'cents', display: money(c.D, v) + ' a month',
        how: 'A typical month’s essentials, as the floor between jobs; your own floor replaces it.',
        sources: ['data/onepager_defaults.json'] };
    },
    healthMonthlyBetweenJobs: function (c) {
      var t = c.tables.cobraAca && c.tables.cobraAca.monthly;
      if (!t || !c.D.Schema.isUnemployed(c.h)) return null;
      var v = t.acaSilver40Cents;
      if (!c.D.Money.isEntered(v)) return null;
      return { value: v, unit: 'cents', display: money(c.D, v) + ' a month',
        how: 'A marketplace silver plan for a 40-year-old before any subsidy; COBRA on a single plan runs about ' + money(c.D, t.cobraSingleCents) + '. A placeholder, never a quote.',
        sources: ['data/cobra_aca_2024.json'] };
    }
  };

  /* Rows a rule may read through ctx.value: the entered value via the owner's
     reader, else this run's suggestion for the same row. */
  function realValue(D, h, rowId) {
    var f = D.Ownership && D.Ownership.FIELDS ? D.Ownership.FIELDS[rowId] : null;
    if (!f || typeof f.read !== 'function') return null;
    var r = f.read(h);
    return D.Money.isOk(r) ? r.value : null;
  }
  function rowsWithRules(D) {
    var rows = D.LedgerRows ? D.LedgerRows.all() : [];
    return rows.filter(function (r) { return r.suggestFrom && RULES[r.suggestFrom]; });
  }
  function itemsFor(D, h, row) {
    return D.LedgerRows && row.repeat ? (D.LedgerRows.items(h, row) || []) : [null];
  }
  function itemValue(row, item) {
    if (!item) return null;
    if (row.id === 'debtMinPayment') return item.minPaymentCents;
    if (row.id === 'debtBalance') return item.balanceCents;
    if (row.id === 'debtRate') return item.rate;
    return null;
  }
  function suggestions(household, tables, opts) {
    var D = deps();
    var h = household || {};
    var T = tables || {};
    var out = [], byRow = {};
    var ctxBase = {
      h: h, tables: T, D: D,
      real: function (id) { return realValue(D, h, id); },
      value: function (id) { var r = realValue(D, h, id); if (r !== null && r !== undefined) return r; return byRow[id] && !byRow[id].na ? byRow[id].value : null; },
      leaned: function (id) { var r = realValue(D, h, id); return (r === null || r === undefined) && byRow[id] ? [id] : []; }
    };
    /* Rules run in the file's row order, so a row earlier in the ledger can
       feed one later (state before the benefit; filing before the rate). */
    rowsWithRules(D).forEach(function (row) {
      if (opts && opts.onlyApplicable !== false && D.LedgerRows && !D.LedgerRows.applies(row, h) && !/NotApplicable$/.test(row.suggestFrom)) return;
      itemsFor(D, h, row).forEach(function (item) {
        var entered = item ? D.Money.isEntered(itemValue(row, item)) : (realValue(D, h, row.id) !== null);
        if (entered) return;
        var c = Object.assign({}, ctxBase, { row: row, item: item });
        var s = null;
        try { s = RULES[row.suggestFrom](c); } catch (e) { s = null; }
        if (!s) return;
        var rec = {
          key: row.id + (item ? ':' + item.id : ''), rowId: row.id, itemId: item ? item.id : null, label: row.label + (item && item.label ? ' · ' + item.label : ''),
          rule: row.suggestFrom, value: s.value, na: s.na === true, unit: s.unit || row.unit, display: s.display, ask: s.ask || null,
          how: s.how, sources: s.sources || [], dependsOn: s.dependsOn || [], confidence: 'suggested', door: row.door, level: row.level, askIn: row.askIn || null
        };
        out.push(rec);
        if (!item) byRow[row.id] = rec;
      });
    });
    return out;
  }
  function forRow(household, tables, rowId, itemId) {
    return suggestions(household, tables).filter(function (s) { return s.rowId === rowId && (itemId ? s.itemId === itemId : true); })[0] || null;
  }

  /* overlay: a copy with every non-N/A suggestion applied at its household
     path, for a formula that is allowed to read suggested values. `used`
     lists the keys applied so the caller can say "rough". */
  var APPLY = {
    state: function (h, v) { h.state = v; },
    filingStatus: function (h, v) { h.filingStatus = v; },
    dependents: function (h, v, D) { h.dependents = D.Schema.createDependents(v === 0 ? false : new Array(v).fill(null).map(function () { return {}; })); },
    bufferMonths: function (h, v) { h.variableIncome = h.variableIncome || {}; h.variableIncome.bufferMonths = v; },
    unemployment: function (h, v, D) { var p = D.Schema.primaryPerson(h); if (p) { p.unemployment = Object.assign({}, D.Schema.unemploymentOf(h), { benefitWeeklyCents: v }); } },
    termLife: function (h, v) { h.insurance = h.insurance || {}; h.insurance.termLifeCents = v; },
    disabilityMonthly: function (h, v) { h.insurance = h.insurance || {}; h.insurance.disabilityMonthlyCents = v; },
    marginalRate: function (h, v) { h.assumptionOverrides = h.assumptionOverrides || {}; h.assumptionOverrides.marginalRate = v; },
    healthCover: function (h, v) { h.insurance = h.insurance || {}; h.insurance.health = h.insurance.health || {}; h.insurance.health.type = v; },
    healthMonthly: function (h, v) { h.insurance = h.insurance || {}; h.insurance.health = h.insurance.health || {}; h.insurance.health.monthlyCents = v; },
    highestDeductible: function (h, v) { h.insurance = h.insurance || {}; h.insurance.highestDeductibleCents = v; },
    wantsMonthly: function (h, v, D) { h.expenses = D.Schema.createExpenses(h.expenses); h.expenses.wants.totalCents = v; },
    investments: function (h, v, D) { h.assets = (h.assets || []).concat([D.Schema.createAsset({ id: 'suggest_inv', label: 'Investments (suggested)', category: 'investment', valueCents: v })]); },
    floorMonthly: function (h, v, D) { var p = D.Schema.primaryPerson(h); if (p) { p.unemployment = Object.assign({}, D.Schema.unemploymentOf(h), { floorMonthlyCents: v }); } },
    debtMinPayment: function (h, v, D, s) { (h.debts || []).forEach(function (d) { if (d.id === s.itemId) d.minPaymentCents = v; }); }
  };
  function overlay(household, tables) {
    var D = deps();
    var copy = JSON.parse(JSON.stringify(household || D.Schema.createHousehold({})));
    var used = [];
    suggestions(household, tables).forEach(function (s) {
      if (s.na || !APPLY[s.rowId]) return;
      APPLY[s.rowId](copy, s.value, D, s);
      used.push(s.key);
    });
    copy.meta = copy.meta || {};
    copy.meta.suggested = used;
    return { household: copy, used: used };
  }

  /* One tap: the suggestion becomes an entered value, through the owner,
     tagged as suggested and roughly. An N/A suggestion is not a value. */
  function confirm(s) {
    var D = deps();
    if (!s || s.na) return null;
    if (!D.Spine || !D.Ownership) throw new Error('confirm() needs the spine and the ownership map');
    if (D.Spine.tagWrite) D.Spine.tagWrite({ source: 'suggested', confidence: 'roughly' });
    return D.Ownership.write(s.rowId, s.value, s.itemId ? { itemId: s.itemId } : null);
  }

  return {
    show: show,
    clear: clear,
    isSuggested: isSuggested,
    entered: entered,
    all: all,
    CLASS_INPUT: CLS_INPUT,
    CLASS_SHELL: CLS_SHELL,
    CLASS_CHIP: CLS_CHIP,
    RULES: RULES,
    TABLES: ['ledgerRows', 'zipPrefixes', 'uiBenefits', 'savingsPresets', 'federalBrackets', 'stateBrackets', 'protectionConventions', 'debtRules', 'onepagerDefaults', 'retirementMilestones', 'cobraAca',
      /* D-214: the derivation ledger's tables. */
      'commonCosts', 'variableIncomeConventions', 'partnerConventions', 'givingConventions', 'studentLoanConventions', 'seTax'],
    suggestions: suggestions,
    forRow: forRow,
    overlay: overlay,
    confirm: confirm
  };
});
