/* ==========================================================================
   foo-ladder.js — the Financial Order of Operations ladder.
   --------------------------------------------------------------------------
   Plain JavaScript. No framework, no compile step: edit this file, refresh
   the page. It used to be React compiled from a .jsx by babel, which made
   the site's front page the one thing in the repo you could not change
   without installing a toolchain. See DECISIONS.md D-038.

   HOW IT WORKS — two functions, and the split between them is the whole design:

     build()   runs ONCE, creates every node, and stashes the ones that
               change in `ui`.
     paint()   runs on every change, and only ever writes text, values,
               classes and hidden flags onto nodes build() already made.

   paint() never creates or destroys an input. That is not a style
   preference: replacing an input's DOM node mid-tap closes the soft keyboard
   on a phone and it does not come back, because a programmatic .focus()
   cannot reopen it. See shared/liveform.js and DECISIONS.md D-034.

   LIVE-FORM: built once.

   `h()` below is a 12-line helper that makes build() read almost exactly
   like the JSX it replaced — same shape, same nesting, no toolchain.
   ========================================================================== */
(function () {
  'use strict';

  var Money = SLAF.Money, Schema = SLAF.Schema, Spine = SLAF.Spine,
      Reference = SLAF.Reference, Ownership = SLAF.Ownership;

  var ROOM_ID = 'foo-ladder';

  /* Assumption-class defaults (SPEC.md §3). These are not facts about the
     visitor, so unlike every raw input they legitimately carry a default —
     each one is visible and editable below. */
  var ASSUMPTIONS = { efMonths: 3, growthRate: 7 };

  /* Fallback IRS limits, replaced by data/irs_limits_2026.json once it
     loads. Kept only so the page renders before the fetch resolves. */
  var FALLBACK_LIMITS = { k401: 24500, k401Catchup: 8000, ira: 7500,
                          iraCatchup: 1100, hsaSelf: 4400, hsaFamily: 8750 };

  var START = { m: 6, y: 2026 };
  var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmt(n) { return '$' + Math.round(Math.abs(n)).toLocaleString('en-US'); }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function entered(v) { return Money.isEntered(v); }

  function monthLabel(m) {
    if (m === null) return 'Blocked';
    if (m <= 0) return 'Now';
    var total = START.m + m;
    var y = START.y + Math.floor(total / 12);
    return MONTH_NAMES[total % 12] + " '" + String(y).slice(2) + ' · ' + m + ' mo';
  }

  /* ---- h(): the whole "framework" ---------------------------------------
     h('div', {class: 'card'}, [child, 'text'])  ->  an element.
     `style` takes an object, `on` takes {click: fn}. Anything else is set
     as an attribute. Children may be nodes, strings, or nested arrays;
     null and false are skipped so `cond && h(...)` works like it did in
     the JSX.                                                             */
  function h(tag, props, children) {
    var el = tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'text'
      ? document.createElementNS('http://www.w3.org/2000/svg', tag)
      : document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'style' && typeof v === 'object') { Object.assign(el.style, v); return; }
      if (k === 'on') { Object.keys(v).forEach(function (e) { el.addEventListener(e, v[e]); }); return; }
      if (k === 'text') { el.textContent = v; return; }
      el.setAttribute(k, v);
    });
    (function add(c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) { c.forEach(add); return; }
      el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    })(children);
    return el;
  }

  /* ---- State -------------------------------------------------------------
     One plain object. Change it, call paint(). That is the entire
     state-management story.                                              */
  var state = {
    household: Spine.getProfile(),
    /* This room's OWN inputs — nothing else in the app holds these, so they
       are editable here and start empty. SPEC.md §5.1. */
    deductibleTarget: null, contribPct: null,
    rothCur: null, hsaCur: null, prepaidTarget: null, prepaidBal: null,
    windfallAmt: null,
    /* Assumption-class. Defaults are legitimate here, and visible. */
    efMonths: ASSUMPTIONS.efMonths, growthRate: ASSUMPTIONS.growthRate,
    limits: Object.assign({}, FALLBACK_LIMITS),
    /* View */
    hdhp: false, hsaFamilyPlan: false, growthOn: false, windfallOn: false,
    showWindfall: false, showInputs: true, showAssumptions: false, openStep: null
  };

  var ui = {};          /* nodes build() makes and paint() writes to */

  /* ---- Derived reads from the household ---------------------------------
     Never copied into state: re-derived on every paint, so this room can
     never hold a stale copy of a number another room owns.              */
  function derive() {
    var h0 = state.household;
    function asDollars(r) { return Money.isOk(r) ? r.value / 100 : null; }
    var d = {
      incomeVal: asDollars(Schema.grossAnnualIncomeCents(h0)),
      expTotal: asDollars(Schema.monthlyExpensesCents(h0)),
      efBalance: asDollars(Schema.cashCents(h0)),
      age: Schema.primaryAge(h0)
    };
    var primary = Schema.allIncomeSources(h0)[0];
    d.matchCapPct = primary && entered(primary.employerMatch.matchCapPercentOfSalary)
      ? primary.employerMatch.matchCapPercentOfSalary * 100 : null;
    d.debts = Schema.aggregatableDebts(h0)
      .filter(function (x) { return entered(x.balanceCents) && x.balanceCents > 0; })
      .map(function (x, i) {
        return {
          id: x.id || ('h' + i),
          name: x.label || 'Debt',
          balance: x.balanceCents / 100,
          apr: entered(x.rate) ? Math.round(x.rate * 10000) / 100 : null,
          min: entered(x.minPaymentCents) ? x.minPaymentCents / 100 : null
        };
      });
    d.mIncome = entered(d.incomeVal) ? d.incomeVal / 12 : null;
    d.mExpenses = entered(d.expTotal) ? d.expTotal : null;
    d.gapReady = entered(d.mIncome) && entered(d.mExpenses);
    d.gap = d.gapReady ? d.mIncome - d.mExpenses : null;
    d.iraLimit = state.limits.ira + (entered(d.age) && d.age >= 50 ? state.limits.iraCatchup : 0);
    d.k401Limit = state.limits.k401 + (entered(d.age) && d.age >= 50 ? state.limits.k401Catchup : 0);
    d.hsaLimit = state.hsaFamilyPlan ? state.limits.hsaFamily : state.limits.hsaSelf;
    return d;
  }

  /* ---- The simulation ----------------------------------------------------
     Unchanged from the React version, line for line. Runs only once every
     input it reads has been entered, so nothing inside has to defend
     against a null.                                                      */
  function simulate(d) {
    var needs = [
      ['income', entered(d.mIncome)], ['monthly expenses', entered(d.mExpenses)],
      ['your age', entered(d.age)],
      ['your deductible', entered(state.deductibleTarget)],
      ['your contribution %', entered(state.contribPct)],
      ['your match cap %', entered(d.matchCapPct)],
      ['emergency fund balance', entered(d.efBalance)],
      ['Roth contributed so far', entered(state.rothCur)],
      ['prepaid goal', entered(state.prepaidTarget)],
      ['prepaid balance', entered(state.prepaidBal)]
    ];
    if (state.hdhp) needs.push(['HSA contributed so far', entered(state.hsaCur)]);
    var missing = needs.filter(function (n) { return !n[1]; }).map(function (n) { return n[0]; });
    if (missing.length) return { ready: false, missing: missing, baseline: null, windDone: null, windRows: [] };

    var g = state.growthOn ? state.growthRate / 100 / 12 : 0;
    var aIncome = d.mIncome * 12;
    var liveDebts = d.debts.filter(function (x) { return entered(x.balance) && entered(x.apr); })
      .map(function (x) { return Object.assign({}, x, { min: entered(x.min) ? x.min : 0 }); });

    function allocate(amount, st) {
      var rem = amount, rows = [];
      var s = Object.assign({}, st, { debts: st.debts.map(function (x) { return Object.assign({}, x); }) });
      function take(need) { var a = Math.min(rem, Math.max(0, need)); rem -= a; return a; }
      var a1 = take(state.deductibleTarget - s.cash);
      if (a1 > 0) { s.cash += a1; rows.push({ label: 'Step 1 · Deductible cash', amt: a1 }); }
      var high = s.debts.filter(function (x) { return x.apr > 6 && x.balance > 0; })
        .sort(function (a, b) { return b.apr - a.apr; });
      for (var i = 0; i < high.length; i++) {
        var p = take(high[i].balance);
        if (p > 0) { high[i].balance -= p; rows.push({ label: 'Step 3 · Pay off ' + high[i].name, amt: p }); }
        if (rem <= 0) break;
      }
      var a4 = take(state.efMonths * d.mExpenses - s.ef);
      if (a4 > 0) { s.ef += a4; rows.push({ label: 'Step 4 · Emergency reserves', amt: a4 }); }
      var a5 = take(d.iraLimit - s.rothCur);
      if (a5 > 0) { s.rothCur += a5; rows.push({ label: 'Step 5 · Fill Roth IRA', amt: a5 }); }
      if (state.hdhp) {
        var a5b = take(d.hsaLimit - s.hsaCur);
        if (a5b > 0) { s.hsaCur += a5b; rows.push({ label: 'Step 5 · Fill HSA', amt: a5b }); }
      }
      var a8 = take(state.prepaidTarget - s.prepaid);
      if (a8 > 0) { s.prepaid += a8; rows.push({ label: 'Step 8 · Prepaid future expenses', amt: a8 }); }
      var low = s.debts.filter(function (x) { return x.apr <= 6 && x.balance > 0; })
        .sort(function (a, b) { return b.apr - a.apr; });
      for (var j = 0; j < low.length; j++) {
        var p2 = take(low[j].balance);
        if (p2 > 0) { low[j].balance -= p2; rows.push({ label: 'Step 9 · Pay down ' + low[j].name, amt: p2 }); }
        if (rem <= 0) break;
      }
      if (rem > 0) rows.push({ label: 'Step 7 · Taxable brokerage (the rest)', amt: rem });
      return { state: s, rows: rows };
    }

    function runSim(init) {
      var s2need = Math.max(0, ((d.matchCapPct - state.contribPct) / 100) * d.mIncome);
      var s5need = Math.max(0, d.iraLimit - init.rothCur
        + (state.hdhp ? Math.max(0, d.hsaLimit - init.hsaCur) : 0)) / 12;
      var employeeAfterMatch = (Math.max(state.contribPct, d.matchCapPct) / 100) * aIncome;
      var s6need = Math.max(0, d.k401Limit - employeeAfterMatch) / 12;
      var flowsAt25 = employeeAfterMatch / 12 + (d.iraLimit + (state.hdhp ? d.hsaLimit : 0)) / 12
        + Math.max(0, d.k401Limit - employeeAfterMatch) / 12;
      var s7need = Math.max(0, 0.25 * d.mIncome - flowsAt25);
      var done = new Array(9).fill(null);
      var cash = init.cash, ef = init.ef, prepaid = init.prepaid;
      var dbts = init.debts.map(function (x) { return Object.assign({}, x); });
      var committed = 0, step = 0;

      function advance(m) {
        while (step < 9) {
          var av = d.gap - committed, ok = false;
          if (step === 0 && cash >= state.deductibleTarget) ok = true;
          else if (step === 1) { if (s2need <= 0) ok = true; else if (av >= s2need) { committed += s2need; ok = true; } }
          else if (step === 2 && !dbts.some(function (x) { return x.apr > 6 && x.balance > 0.5; })) ok = true;
          else if (step === 3 && ef >= state.efMonths * d.mExpenses) ok = true;
          else if (step === 4) { if (s5need <= 0) ok = true; else if (av >= s5need) { committed += s5need; ok = true; } }
          else if (step === 5) { if (s6need <= 0) ok = true; else if (av >= s6need) { committed += s6need; ok = true; } }
          else if (step === 6) { if (s7need <= 0) ok = true; else if (av >= s7need) { committed += s7need; ok = true; } }
          else if (step === 7 && prepaid >= state.prepaidTarget) ok = true;
          else if (step === 8 && !dbts.some(function (x) { return x.apr <= 6 && x.balance > 0.5; })) ok = true;
          if (!ok) return;
          done[step] = m; step++;
        }
      }

      advance(0);
      if (d.gap > 0) {
        for (var m = 1; m <= 600 && step < 9; m++) {
          dbts.forEach(function (x) {
            if (x.balance > 0) x.balance = Math.max(0, x.balance * (1 + x.apr / 1200) - x.min);
          });
          if (g > 0) prepaid *= 1 + g;
          var avail = d.gap - committed;
          if (avail <= 0) break;
          if (step === 0) cash += avail;
          else if (step === 2 || step === 8) {
            var pool = avail;
            var pick = dbts.filter(function (x) {
              return (step === 2 ? x.apr > 6 : x.apr <= 6) && x.balance > 0;
            }).sort(function (a, b) { return b.apr - a.apr; });
            for (var q = 0; q < pick.length; q++) {
              var pay = Math.min(pool, pick[q].balance);
              pick[q].balance -= pay; pool -= pay;
              if (pool <= 0) break;
            }
          }
          else if (step === 3) ef += avail;
          else if (step === 7) prepaid += avail;
          advance(m);
        }
      }
      return done;
    }

    var baseState = {
      /* Steps 1 and 4 test the SAME real balance against two different
         targets — a deductible first, then months of expenses. They used to
         be two inputs, which let them contradict each other and made you
         type your savings twice. DECISIONS.md D-049. */
      cash: d.efBalance, ef: d.efBalance, prepaid: state.prepaidBal,
      rothCur: state.rothCur, hsaCur: entered(state.hsaCur) ? state.hsaCur : 0,
      debts: liveDebts
    };
    var baseline = runSim(baseState);
    var windRows = [], windDone = baseline;
    if (state.windfallOn && entered(state.windfallAmt) && state.windfallAmt > 0) {
      var alloc = allocate(state.windfallAmt, baseState);
      windRows = alloc.rows;
      windDone = runSim(alloc.state);
    }
    return { ready: true, missing: [], baseline: baseline, windDone: windDone, windRows: windRows };
  }

  /* ---- Step definitions ---------------------------------------------------
     Each declares what it needs; a card whose inputs are missing says so
     rather than deriving a figure from nothing.                          */
  function buildSteps(d) {
    var s2gapMo = (entered(d.matchCapPct) && entered(state.contribPct) && entered(d.mIncome))
      ? Math.max(0, ((d.matchCapPct - state.contribPct) / 100) * d.mIncome) : null;
    var rated = d.debts.filter(function (x) { return entered(x.balance) && entered(x.apr) && x.balance > 0; });
    var high = rated.filter(function (x) { return x.apr > 6; });
    var low = rated.filter(function (x) { return x.apr <= 6; });
    var st = state;

    return [
      { n: 1, title: 'Deductibles covered', needs: [entered(d.efBalance), entered(st.deductibleTarget)],
        missing: 'your cash & savings and your highest deductible',
        why: "Before anything else, hold enough cash to cover your largest insurance deductible — health, auto, or home. It's the smallest wall between you and new debt. This is the same balance step 4 measures against months of expenses; it just has to clear a much lower bar first.",
        build: function () { return {
          sub: d.efBalance >= st.deductibleTarget
            ? fmt(d.efBalance) + ' in cash & savings covers your ' + fmt(st.deductibleTarget) + ' deductible.'
            : fmt(st.deductibleTarget - d.efBalance) + ' short of your highest deductible, out of '
              + fmt(d.efBalance) + ' in cash & savings.',
          pct: clamp((d.efBalance / Math.max(1, st.deductibleTarget)) * 100, 0, 100),
          act: d.efBalance < st.deductibleTarget ? 'Stack cash to ' + fmt(st.deductibleTarget) + ' first.' : 'Covered. Keep this cash untouched.' }; } },

      { n: 2, title: 'Employer match', needs: [entered(s2gapMo), entered(d.matchCapPct)],
        missing: 'your income, contribution % and match cap %',
        why: 'A match is an instant 50-100% return. Nothing else compounds a raise like this.',
        build: function () { return {
          sub: s2gapMo <= 0 ? 'Full match captured at ' + st.contribPct + '%.'
            : 'Raise contribution ' + (d.matchCapPct - st.contribPct).toFixed(1) + '% — costs ' + fmt(s2gapMo) + '/mo, returns free money.',
          pct: d.matchCapPct === 0 ? 100 : clamp((st.contribPct / d.matchCapPct) * 100, 0, 100),
          act: s2gapMo > 0 ? 'Set payroll deferral to ' + d.matchCapPct + '%.' : 'Keep it flowing every paycheck.' }; } },

      { n: 3, title: 'High-interest debt', needs: [true], missing: '',
        why: 'Paying 23% APR off is a guaranteed 23% return. Destroy this before investing further.',
        build: function () { return {
          sub: d.debts.length === 0 ? 'No debts entered.' : high.length === 0 ? 'No high-interest debt. Clear.'
            : fmt(high.reduce(function (s, x) { return s + x.balance; }, 0)) + ' above 6% APR — highest '
              + Math.max.apply(null, high.map(function (x) { return x.apr; })).toFixed(1) + '%.',
          pct: high.length === 0 ? 100 : 0,
          act: high.length ? 'Waterfall attacks highest APR first (avalanche).' : 'Stay clear.' }; } },

      { n: 4, title: 'Emergency reserves', needs: [entered(d.efBalance), entered(d.mExpenses)],
        missing: 'your emergency fund balance and monthly expenses',
        why: '3-6 months of expenses turns a job loss into an inconvenience instead of a crisis.',
        build: function () { return {
          sub: d.efBalance >= st.efMonths * d.mExpenses
            ? (d.mExpenses > 0 ? d.efBalance / d.mExpenses : 0).toFixed(1) + ' months held in cash & savings — target met.'
            : (d.mExpenses > 0 ? d.efBalance / d.mExpenses : 0).toFixed(1) + ' of ' + st.efMonths + ' months. '
              + fmt(st.efMonths * d.mExpenses - d.efBalance) + ' to go.',
          pct: clamp((d.efBalance / Math.max(1, st.efMonths * d.mExpenses)) * 100, 0, 100),
          act: 'High-yield savings, automated, boring on purpose.' }; } },

      { n: 5, title: 'Roth IRA & HSA', needs: [entered(st.rothCur), !st.hdhp || entered(st.hsaCur)],
        missing: st.hdhp ? "what you've put into your Roth IRA and HSA this year" : "what you've put into your Roth IRA this year",
        why: 'Tax-free growth forever (Roth) and the triple-tax-advantaged HSA. Fill these before returning to 401k.',
        build: function () { return {
          sub: st.rothCur >= d.iraLimit && (!st.hdhp || st.hsaCur >= d.hsaLimit) ? 'Both maxed for the year.'
            : 'Roth ' + fmt(st.rothCur) + ' of ' + fmt(d.iraLimit)
              + (st.hdhp ? ' · HSA ' + fmt(st.hsaCur) + ' of ' + fmt(d.hsaLimit) : ''),
          pct: clamp(((st.rothCur + (st.hdhp ? st.hsaCur : 0)) / Math.max(1, d.iraLimit + (st.hdhp ? d.hsaLimit : 0))) * 100, 0, 100),
          act: st.hdhp ? 'Automate both — HSA via payroll for the FICA break.' : 'Automate the Roth monthly.' }; } },

      { n: 6, title: 'Max-out retirement', needs: [entered(st.contribPct), entered(d.matchCapPct), entered(d.mIncome)],
        missing: 'your income and contribution percentages',
        why: 'Fill every remaining tax-advantaged dollar: 401k, 403b, 457. Shelter beats taxable.',
        build: function () { return {
          sub: 'Fill remaining 401k/403b space to the employee limit.',
          pct: clamp((((Math.max(st.contribPct, d.matchCapPct) / 100) * d.mIncome * 12) / Math.max(1, d.k401Limit)) * 100, 0, 100),
          act: 'Raise deferral until the IRS limit.' }; } },

      { n: 7, title: 'Hyperaccumulation', needs: [entered(st.contribPct), entered(d.matchCapPct)],
        missing: 'your contribution percentages',
        why: 'The Money Guy north star: 25% of gross saved. Past tax shelters this spills into taxable brokerage — your army of dollar bills.',
        build: function () { return {
          sub: 'Reach 25% of gross income savings rate; overflow to taxable brokerage.',
          pct: clamp(((Math.max(st.contribPct, d.matchCapPct) / 100) / 0.25) * 100, 0, 100),
          act: 'Automate into low-cost index funds.' }; } },

      { n: 8, title: 'Prepaid future expenses', needs: [entered(st.prepaidBal), entered(st.prepaidTarget)],
        missing: "your future-goal target and what's saved toward it",
        why: 'Only after your retirement is secured do you prepay the future. Oxygen mask on yourself first.',
        build: function () { return {
          sub: st.prepaidBal >= st.prepaidTarget ? 'Future goals funded.'
            : fmt(st.prepaidBal) + ' of ' + fmt(st.prepaidTarget) + ' toward 529s, weddings, next car.',
          pct: clamp((st.prepaidBal / Math.max(1, st.prepaidTarget)) * 100, 0, 100),
          act: '529s gain state tax perks in most states.' }; } },

      { n: 9, title: 'Low-interest debt prepayment', needs: [true], missing: '',
        why: "Math says low-rate debt can wait — but a paid-off house is peace the spreadsheet can't price.",
        build: function () { return {
          sub: d.debts.length === 0 ? 'No debts entered.' : low.length === 0 ? 'No low-interest debt remains.'
            : fmt(low.reduce(function (s, x) { return s + x.balance; }, 0)) + ' at 6% or below — mortgage-tier debt, last on purpose.',
          pct: low.length === 0 ? 100 : 0,
          act: 'Extra principal payments until free.' }; } }
    ];
  }

  var LABEL_STYLE = {
    fontSize: 'var(--text-xs)', textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-eyebrow)', color: 'var(--color-text-subtle)',
    display: 'block', marginBottom: '4px'
  };
  function labelEl(text, extra) {
    return h('span', { style: Object.assign({}, LABEL_STYLE, extra || {}), text: text });
  }

  /* ---- Pieces build() assembles ----------------------------------------- */

  /* The nine-facet sapphire, one facet per step. Built once; paint() only
     recolours the facets and rewrites the count. */
  function gemCrown() {
    var cx = 60, cy = 60, rOuter = 54, rInner = 21;
    var svg = h('svg', { viewBox: '0 0 120 120', style: { width: '96px', height: '96px' } });
    ui.facets = [];
    for (var i = 0; i < 9; i++) {
      var a1 = ((i * 40 - 90) * Math.PI) / 180;
      var a2 = (((i + 1) * 40 - 90) * Math.PI) / 180;
      var p = h('path', {
        d: 'M' + (cx + rOuter * Math.cos(a1)) + ',' + (cy + rOuter * Math.sin(a1))
         + ' L' + (cx + rOuter * Math.cos(a2)) + ',' + (cy + rOuter * Math.sin(a2))
         + ' L' + (cx + rInner * Math.cos(a2)) + ',' + (cy + rInner * Math.sin(a2))
         + ' L' + (cx + rInner * Math.cos(a1)) + ',' + (cy + rInner * Math.sin(a1)) + ' Z',
        stroke: 'var(--navy-850)', 'stroke-width': '1.5',
        style: { transition: 'fill 500ms ease' }
      });
      ui.facets.push(p);
      svg.appendChild(p);
    }
    ui.gemCore = h('circle', { cx: cx, cy: cy, r: rInner, stroke: 'var(--navy-850)',
      'stroke-width': '1.5', style: { transition: 'fill 500ms ease' } });
    ui.gemText = h('text', { x: cx, y: cy + 5, 'text-anchor': 'middle', 'font-size': '15',
      'font-weight': '600', 'font-family': 'var(--font-body)' });
    svg.appendChild(ui.gemCore);
    svg.appendChild(ui.gemText);
    ui.gem = svg;
    return svg;
  }

  function bar() {
    var fill = h('span', {});
    var wrap = h('div', { class: 'slaf-bar' }, fill);
    return { el: wrap, fill: fill };
  }

  /* A text field. Built once, and paint() only ever writes .value onto it —
     and only while it is not focused, so it never fights the person typing.
     Empty is null, never 0 (SPEC.md §5 rule 1). A text box, not a number
     spinner, so a stray scroll cannot silently change a balance. */
  function field(opts) {
    var input = h('input', {
      type: 'text', inputmode: 'decimal',
      placeholder: opts.placeholder || '—',
      'aria-label': opts.label || opts.placeholder || 'value'
    });
    input.addEventListener('blur', function () {
      var cleaned = input.value.replace(/[$,%\s]/g, '');
      opts.onChange(cleaned === '' ? null
        : (Number.isFinite(Number(cleaned)) ? Number(cleaned) : null));
      paint();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });
    var shell = h('span', { class: 'slaf-input-shell' }, [
      opts.prefix ? h('span', { class: 'slaf-affix', text: opts.prefix }) : null,
      input,
      opts.suffix ? h('span', { class: 'slaf-affix', text: opts.suffix }) : null
    ]);
    var el = h('label', { class: 'slaf-field', style: { marginBottom: '0' } }, [
      opts.label ? h('span', { class: 'slaf-label', text: opts.label }) : null, shell
    ]);
    ui.fields = ui.fields || [];
    ui.fields.push({ input: input, read: opts.read });
    return el;
  }

  /* A figure this room reads but does not own: renders as a link to the room
     that does, the same rule the Snapshot follows. */
  function borrowed(fieldId, label) {
    var value = h('span', { class: 'slaf-owned-value' });
    var from = h('span', { class: 'slaf-owned-from' });
    var link = h('a', { class: 'slaf-owned slaf-owned--field' }, [value, from]);
    var el = h('div', { class: 'slaf-field', style: { marginBottom: '0' } }, [
      h('span', { class: 'slaf-label' }), link
    ]);
    ui.borrowed = ui.borrowed || [];
    ui.borrowed.push({ fieldId: fieldId, label: label, el: el,
      labelEl: el.firstChild, link: link, value: value, from: from });
    return el;
  }

  function toggle(label, get, set) {
    var knob = h('span', { style: { position: 'absolute', top: '2px', width: '16px', height: '16px',
      borderRadius: '50%', background: 'white', transition: 'left 200ms' } });
    var track = h('span', { style: { position: 'relative', display: 'inline-block', width: '36px',
      height: '20px', borderRadius: '10px', transition: 'background 200ms',
      flexShrink: '0', marginLeft: '12px' } }, knob);
    var text = h('span', { style: { textAlign: 'left' }, text: label });
    var btn = h('button', { class: 'slaf-btn', type: 'button',
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
      on: { click: function () { set(!get()); paint(); } } }, [text, track]);
    ui.toggles = ui.toggles || [];
    ui.toggles.push({ get: get, track: track, knob: knob, text: text, label: label, btn: btn });
    return btn;
  }

  function disclosure(titleText, get, set, body, openWord, shutWord) {
    var title = h('span', { style: { fontWeight: '500' }, text: titleText });
    var action = h('span', { style: { color: 'var(--color-accent-hover)' } });
    var btn = h('button', { class: 'row-btn', type: 'button',
      on: { click: function () { set(!get()); paint(); } } }, [title, action]);
    ui.disclosures = ui.disclosures || [];
    ui.disclosures.push({ get: get, action: action, body: body,
      openWord: openWord || 'Hide', shutWord: shutWord || 'Edit' });
    return { btn: btn, title: title, action: action };
  }

  /* ---- build(): runs once ------------------------------------------------ */

  function build() {
    var root = document.getElementById('root');
    var wrap = h('div', { class: 'wrap' });

    wrap.appendChild(h('a', { class: 'back', href: 'map.html', text: '← All rooms' }));

    wrap.appendChild(h('header', { style: { paddingTop: '16px', paddingBottom: '20px', textAlign: 'center' } }, [
      h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: '12px' } }, gemCrown()),
      h('h1', { text: 'Financial Order of Operations' }),
      h('p', { style: { color: 'var(--color-text-subtle)', fontSize: 'var(--text-base)', marginTop: '4px' },
        text: 'Nine steps, in the exact order you need.' })
    ]));

    wrap.appendChild(h('div', { class: 'actions',
      style: { display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' } }, [
      h('button', { class: 'slaf-btn', type: 'button', text: 'Try with example numbers',
        on: { click: loadExample } }),
      h('button', { class: 'slaf-btn slaf-btn--quiet', type: 'button', text: 'Clear',
        on: { click: clearAll } })
    ]));

    /* --- gap engine --- */
    ui.gapFigure = h('p', { class: 'slaf-figure', style: { margin: '4px 0' } });
    ui.gapDetail = h('p', { style: { fontSize: 'var(--text-sm)', color: 'var(--color-accent-hover)', margin: '0' } });
    wrap.appendChild(h('div', { class: 'card card-active', style: { padding: 'var(--space-4)' } }, [
      h('div', { class: 'grid2' }, [
        borrowed('grossAnnualIncome', 'Income'),
        borrowed('monthlyExpenses', 'Expenses')
      ]),
      h('div', { style: { borderRadius: 'var(--radius-md)', background: 'rgba(8,24,51,0.6)',
        border: '1px solid var(--color-border-strong)', padding: 'var(--space-3)',
        textAlign: 'center', marginTop: 'var(--space-3)' } }, [
        labelEl('Your gap — fuels the waterfall', { marginBottom: '0' }),
        ui.gapFigure, ui.gapDetail
      ])
    ]));

    /* --- windfall --- */
    ui.windRows = h('div', { style: { marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)' } });
    var windBody = h('div', { style: { marginTop: 'var(--space-3)' } }, [
      h('p', { style: { fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: '0' },
        text: 'Bonus, inheritance, tax refund — drop a lump sum in and it pours through the FOO in strict order at month zero. Every step’s date recalculates.' }),
      h('div', { style: { display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' } }, [
        h('div', { style: { flex: '1' } }, field({ label: 'Amount', prefix: '$', placeholder: 'e.g. 10000',
          read: function () { return state.windfallAmt; },
          onChange: function (v) { state.windfallAmt = v; } })),
        h('div', { style: { flex: '1' } }, toggle('Apply it',
          function () { return state.windfallOn; }, function (v) { state.windfallOn = v; }))
      ]),
      ui.windRows
    ]);
    var windDisc = disclosure('Windfall', function () { return state.showWindfall; },
      function (v) { state.showWindfall = v; }, windBody, 'Hide', 'Open');
    ui.windTitle = windDisc.title;
    ui.windCard = h('div', { class: 'card', style: { padding: 'var(--space-4)' } },
      [h('div', { style: { padding: '0' } }, windDisc.btn), windBody]);
    windDisc.btn.style.padding = '0';
    wrap.appendChild(ui.windCard);

    /* --- your situation --- */
    ui.hsaField = field({ label: 'HSA so far this yr', prefix: '$', placeholder: 'e.g. 0',
      read: function () { return state.hsaCur; }, onChange: function (v) { state.hsaCur = v; } });
    ui.familyToggle = toggle('Family HSA coverage',
      function () { return state.hsaFamilyPlan; }, function (v) { state.hsaFamilyPlan = v; });
    ui.debtList = h('div', {});
    ui.noDebts = h('p', { class: 'needs', style: { marginTop: '0' }, text: 'No debts entered yet.' });

    var inputsBody = h('div', { style: { padding: '0 var(--space-4) var(--space-4)' } }, [
      h('div', { class: 'grid2', style: { marginBottom: 'var(--space-3)' } }, [
        borrowed('age', 'Age'),
        borrowed('cashSavings', 'Cash & savings'),
        field({ label: 'Highest deductible', prefix: '$', placeholder: 'e.g. 3000',
          read: function () { return state.deductibleTarget; }, onChange: function (v) { state.deductibleTarget = v; } }),
        field({ label: 'You contribute', suffix: '%', placeholder: 'e.g. 4',
          read: function () { return state.contribPct; }, onChange: function (v) { state.contribPct = v; } }),
        borrowed('employerMatch', 'Employer match'),
        field({ label: 'Roth so far this yr', prefix: '$', placeholder: 'e.g. 3000',
          read: function () { return state.rothCur; }, onChange: function (v) { state.rothCur = v; } }),
        field({ label: 'Prepaid goal', prefix: '$', placeholder: 'e.g. 20000',
          read: function () { return state.prepaidTarget; }, onChange: function (v) { state.prepaidTarget = v; } }),
        field({ label: 'Saved toward it', prefix: '$', placeholder: 'e.g. 0',
          read: function () { return state.prepaidBal; }, onChange: function (v) { state.prepaidBal = v; } }),
        ui.hsaField
      ]),
      h('div', { style: { display: 'grid', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' } }, [
        toggle("I'm on a high-deductible health plan (HSA eligible)",
          function () { return state.hdhp; }, function (v) { state.hdhp = v; }),
        ui.familyToggle,
        toggle('Grow prepaid savings while they sit',
          function () { return state.growthOn; }, function (v) { state.growthOn = v; })
      ]),
      labelEl('Debts'),
      h('p', { class: 'needs', style: { marginTop: '0' } }, [
        'Read from your itemised debts. ',
        h('a', { href: Ownership.linkTo('debt-payoff', 'debts'),
          style: { color: 'var(--color-accent-hover)' }, text: 'Edit them in Debt Payoff →' })
      ]),
      ui.noDebts,
      ui.debtList
    ]);
    var inputsDisc = disclosure('Your situation', function () { return state.showInputs; },
      function (v) { state.showInputs = v; }, inputsBody, 'Hide', 'Edit');
    wrap.appendChild(h('div', { class: 'card' }, [inputsDisc.btn, inputsBody]));

    /* --- the "needs more" notice above the ladder --- */
    ui.simNotice = h('p', { class: 'needs', style: { marginBottom: '0' } });
    ui.simCard = h('div', { class: 'card', style: { padding: 'var(--space-4)' } },
      [labelEl('Timeline'), ui.simNotice]);
    wrap.appendChild(ui.simCard);

    /* --- the nine step cards. Fixed count, so built once. --- */
    ui.steps = [];
    for (var i = 0; i < 9; i++) {
      (function (idx) {
        var eyebrow = labelEl('Step ' + (idx + 1), { marginBottom: '2px' });
        var title = h('span', { style: { fontWeight: '500' } });
        var sub = h('span', { style: { display: 'block', fontSize: 'var(--text-sm)', marginTop: '2px' } });
        var when = h('span', { style: { fontSize: 'var(--text-xs)', color: 'var(--color-accent-hover)' } });
        var btn = h('button', { class: 'row-btn', type: 'button', on: { click: function () {
          state.openStep = state.openStep === idx ? null : idx;
          paint();
        } } }, [
          h('span', { style: { flex: '1' } }, [eyebrow, title, sub]),
          h('span', { style: { textAlign: 'right', flexShrink: '0' } }, when)
        ]);
        var b = bar();
        var barWrap = h('div', { style: { padding: '0 var(--space-4) var(--space-3)' } }, b.el);
        var why = h('p', { style: { marginTop: '0' } });
        var act = h('p', { style: { color: 'var(--color-text)', margin: '0' } });
        var detail = h('div', { style: { padding: '0 var(--space-4) var(--space-4)',
          fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' } }, [why, act]);
        var card = h('div', { class: 'card' }, [btn, barWrap, detail]);
        ui.steps.push({ card: card, title: title, sub: sub, when: when,
          barWrap: barWrap, fill: b.fill, why: why, act: act, detail: detail });
        wrap.appendChild(card);
      })(i);
    }

    /* --- assumptions --- */
    var limitField = function (label, key) {
      return field({ label: label, prefix: '$',
        read: function () { return state.limits[key]; },
        onChange: function (v) { state.limits[key] = v; } });
    };
    var assumeBody = h('div', { style: { padding: '0 var(--space-4) var(--space-4)' } }, [
      h('p', { class: 'needs', style: { marginTop: '0' } }, [
        "These carry system defaults because they're assumptions, not facts about you. Limits load from ",
        h('code', { text: 'data/irs_limits_2026.json' }), '.'
      ]),
      h('div', { class: 'grid2' }, [
        field({ label: 'Emergency fund target', suffix: 'mo',
          read: function () { return state.efMonths; },
          onChange: function (v) { state.efMonths = entered(v) ? v : ASSUMPTIONS.efMonths; } }),
        field({ label: 'Growth on prepaid savings', suffix: '%',
          read: function () { return state.growthRate; },
          onChange: function (v) { state.growthRate = entered(v) ? v : ASSUMPTIONS.growthRate; } }),
        limitField('401k limit', 'k401'), limitField('401k catch-up 50+', 'k401Catchup'),
        limitField('IRA limit', 'ira'), limitField('IRA catch-up 50+', 'iraCatchup'),
        limitField('HSA self', 'hsaSelf'), limitField('HSA family', 'hsaFamily')
      ])
    ]);
    var assumeDisc = disclosure('Assumptions & 2026 IRS limits',
      function () { return state.showAssumptions; },
      function (v) { state.showAssumptions = v; }, assumeBody, 'Hide', 'Edit');
    wrap.appendChild(h('div', { class: 'card' }, [assumeDisc.btn, assumeBody]));

    wrap.appendChild(h('p', { style: { fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)',
      textAlign: 'center', marginTop: 'var(--space-6)', lineHeight: 'var(--leading-loose)' },
      text: "Inspired by The Money Guy Show's Financial Order of Operations. Educational tool, not financial advice. Your numbers stay in this browser." }));

    root.appendChild(h('div', { class: 'page' }, wrap));
  }

  /* ---- paint(): runs on every change ------------------------------------
     Writes only. Creates nothing that holds an input.                    */

  function paint() {
    var d = derive();
    var sim = simulate(d);
    var steps = buildSteps(d);
    var active = state.windfallOn ? sim.windDone : sim.baseline;
    var completed = active ? active.filter(function (x) { return x === 0; }).length : null;
    var curIdx = active ? (active.indexOf(null) === -1 && active.findIndex(function (x) { return x !== 0; }) === -1
      ? 8 : (active.findIndex(function (x) { return x !== 0; }) === -1 ? 8 : active.findIndex(function (x) { return x !== 0; }))) : -1;

    /* gem */
    var lit = completed === null ? 0 : completed;
    ui.facets.forEach(function (p, i) {
      p.setAttribute('fill', i < lit ? 'var(--sapphire-500)' : 'var(--navy-700)');
      p.setAttribute('opacity', i < lit ? '1' : '0.55');
    });
    ui.gemCore.setAttribute('fill', lit === 9 ? 'var(--sapphire-200)' : 'var(--navy-750)');
    ui.gemText.setAttribute('fill', lit === 9 ? 'var(--navy-850)' : 'var(--sapphire-200)');
    ui.gemText.textContent = completed === null ? '—' : lit + '/9';
    ui.gem.setAttribute('aria-label', completed === null
      ? 'Not enough entered to score the ladder' : lit + ' of 9 steps complete');

    /* borrowed figures */
    ui.borrowed.forEach(function (b) {
      var info = Ownership.describe(b.fieldId, state.household, ROOM_ID);
      if (!info) return;
      b.labelEl.textContent = b.label || info.label;
      b.link.setAttribute('href', info.href);
      b.link.className = 'slaf-owned slaf-owned--field' + (info.isSet ? '' : ' slaf-owned--empty');
      b.value.textContent = info.display;
      b.from.textContent = info.ownerTitle + ' →';
    });

    /* every field: value only, and never while it is focused */
    ui.fields.forEach(function (f) {
      if (document.activeElement === f.input) return;
      var v = f.read();
      f.input.value = entered(v) ? String(v) : '';
    });

    /* toggles */
    ui.toggles.forEach(function (t) {
      var on = t.get();
      t.track.style.background = on ? 'var(--color-accent)' : 'var(--navy-600)';
      t.knob.style.left = on ? '18px' : '2px';
      t.btn.setAttribute('aria-pressed', String(on));
    });
    ui.toggles[0].text.textContent = state.windfallOn ? 'Applied' : 'Apply it';

    /* disclosures */
    ui.disclosures.forEach(function (dd) {
      var open = dd.get();
      dd.action.textContent = open ? dd.openWord : dd.shutWord;
      dd.body.hidden = !open;
    });

    /* gap */
    if (d.gapReady) {
      ui.gapFigure.className = 'slaf-figure';
      ui.gapFigure.style.color = d.gap > 0 ? 'var(--sapphire-100)' : 'var(--color-critical)';
      ui.gapFigure.textContent = (d.gap >= 0 ? '+' : '−') + fmt(d.gap);
      ui.gapFigure.appendChild(h('span', {
        style: { fontSize: 'var(--text-md)', color: 'var(--color-accent-hover)' }, text: '/mo' }));
      ui.gapDetail.className = '';
      ui.gapDetail.textContent = fmt(d.mIncome) + '/mo in · ' + fmt(d.mExpenses) + '/mo out'
        + (d.gap <= 0 ? ' — a negative gap blocks every step.' : '');
    } else {
      ui.gapFigure.className = 'slaf-figure slaf-figure--incomplete';
      ui.gapFigure.style.color = '';
      ui.gapFigure.textContent = '—';
      ui.gapDetail.className = 'needs';
      ui.gapDetail.textContent = 'Add your income and expenses above.';
    }

    /* windfall */
    ui.windTitle.textContent = 'Windfall' + (state.windfallOn && entered(state.windfallAmt)
      ? ' — ' + fmt(state.windfallAmt) + ' applied' : '');
    ui.windCard.style.borderColor = state.windfallOn ? 'var(--color-caution)' : 'var(--color-border)';
    ui.windCard.style.background = state.windfallOn ? 'rgba(232,184,75,0.08)' : 'var(--color-surface)';
    ui.windRows.textContent = '';
    if (state.windfallOn && sim.windRows.length) {
      sim.windRows.forEach(function (r, i) {
        ui.windRows.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between',
          padding: '4px 0', borderTop: i ? '1px solid var(--color-border)' : 'none' } }, [
          h('span', { style: { color: 'var(--color-text-muted)' }, text: r.label }),
          h('span', { style: { fontVariantNumeric: 'tabular-nums' }, text: fmt(r.amt) })
        ]));
      });
      ui.windRows.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between',
        padding: '8px 0 0', borderTop: '1px solid var(--color-border-strong)',
        marginTop: '4px', fontWeight: '600' } }, [
        h('span', { text: 'Allocated' }),
        h('span', { text: fmt(sim.windRows.reduce(function (s, r) { return s + r.amt; }, 0)) })
      ]));
    }

    /* HSA-only controls appear and disappear by HIDING, never by being
       destroyed and rebuilt — see the note at the top of this file. */
    ui.hsaField.hidden = !state.hdhp;
    ui.familyToggle.hidden = !state.hdhp;

    /* debts (display only — safe to rebuild) */
    ui.noDebts.hidden = d.debts.length !== 0;
    ui.debtList.textContent = '';
    d.debts.forEach(function (x) {
      ui.debtList.appendChild(h('div', { style: { borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)', padding: 'var(--space-3)', marginBottom: 'var(--space-2)' } }, [
        h('div', { style: { display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' } }, [
          h('span', { style: { flex: '1', fontSize: 'var(--text-base)' }, text: x.name }),
          entered(x.apr) ? h('span', { style: { fontSize: 'var(--text-xs)', padding: '2px 8px',
            borderRadius: '999px',
            background: x.apr > 6 ? 'rgba(229,72,77,0.2)' : 'rgba(30,58,138,0.5)',
            color: x.apr > 6 ? 'var(--color-critical)' : 'var(--color-text-muted)' },
            text: x.apr > 6 ? 'Step 3' : 'Step 9' }) : null
        ]),
        h('div', { style: { display: 'flex', gap: 'var(--space-4)', fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' } }, [
          h('span', { text: entered(x.balance) ? fmt(x.balance) : '—' }),
          h('span', { text: entered(x.apr) ? x.apr + '%' : '—' }),
          h('span', { text: (entered(x.min) ? fmt(x.min) + '/mo' : '—') + ' min' })
        ])
      ]));
    });

    /* the "needs more" notice */
    ui.simCard.hidden = sim.ready;
    if (!sim.ready) {
      ui.simNotice.textContent = 'The month-by-month projection needs a few more numbers: '
        + sim.missing.join(', ') + ". Each step below still shows whatever it can from what you've entered.";
    }

    /* the nine steps */
    steps.forEach(function (s, i) {
      var node = ui.steps[i];
      var ready = s.needs.every(Boolean);
      var built = ready ? s.build() : null;
      var landed = active ? active[i] : null;
      node.card.className = 'card' + (sim.ready && i === curIdx ? ' card-active' : '');
      node.title.textContent = s.title;
      node.sub.textContent = ready ? built.sub : 'Add ' + s.missing + ' to see this.';
      node.sub.style.color = ready ? 'var(--color-text-muted)' : 'var(--color-text-faint)';
      node.when.textContent = sim.ready ? monthLabel(landed) : '—';
      node.barWrap.hidden = !ready;
      if (ready) node.fill.style.width = clamp(built.pct, 0, 100) + '%';
      node.detail.hidden = state.openStep !== i;
      node.why.textContent = s.why;
      node.act.hidden = !ready;
      if (ready) {
        node.act.textContent = '';
        node.act.appendChild(h('strong', { text: 'Do this:' }));
        node.act.appendChild(document.createTextNode(' ' + built.act));
      }
    });
  }

  /* ---- Actions ----------------------------------------------------------- */

  function loadExample() {
    /* Only this room's own inputs. The household figures belong to Start
       Here and Debt Payoff — loading them from here would be writing fields
       this room does not own. */
    state.deductibleTarget = 3000;
    state.contribPct = 3;
    state.rothCur = 0;
    state.hsaCur = 0;
    state.prepaidTarget = 20000;
    state.prepaidBal = 0;
    paint();
  }

  function clearAll() {
    ['deductibleTarget', 'contribPct', 'rothCur', 'hsaCur',
     'prepaidTarget', 'prepaidBal', 'windfallAmt'].forEach(function (k) { state[k] = null; });
    paint();
  }

  /* ---- Boot -------------------------------------------------------------- */

  build();
  paint();

  Spine.registerRoom(ROOM_ID);
  Spine.onChange(function (h0) { state.household = h0; paint(); });

  Reference.load(['irsLimits']).then(function (t) {
    var L = t.irsLimits.limits;
    state.limits = {
      k401: L.elective401k, k401Catchup: L.elective401kCatchup50Plus,
      ira: L.ira, iraCatchup: L.iraCatchup50Plus,
      hsaSelf: L.hsaSelfOnly, hsaFamily: L.hsaFamily
    };
    paint();
  }).catch(function () { /* the fallback limits already render */ });
})();
