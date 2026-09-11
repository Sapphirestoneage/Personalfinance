/* ==========================================================================
   engines/onepager.js — the One-Pager: one page for any conversation.
   DECISIONS.md D-219 (K2).
   --------------------------------------------------------------------------
   The "one pager out" half of the suite's core goal. Two versions of the
   same page: Private (full numbers, for someone the person trusts) and
   Public (ratios, percentages and time only, under the share-card rules:
   never a cents figure). An audience preset decides which sections show;
   the person can switch any section on or off.

   Every figure is read from the engines that already own it: take-home
   and the savings rate from engines/tier0.js, the ratios from
   engines/ratios.js, the piles by tax type from engines/trap.js, the FI
   number and years from engines/tier0.js. Nothing here is a second
   calculation. Blanks stay blank ("not entered"); a row marked not sure
   yet says so in words; nothing shows $0 for a figure nobody typed.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'), Ratios: require('./ratios.js'), Trap: require('./trap.js'),
      Gate: (function () { try { return require('../shared/gate.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, Ratios: S.Ratios, Trap: S.Trap, Gate: S.Gate };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Ratios, deps.Trap, deps.Gate);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.OnePager = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Ratios, Trap, Gate) {
  'use strict';

  var MONTHS = 12;
  var VERSIONS = ['private', 'public'];
  var SECTIONS = [
    { id: 'story', title: 'The story' }, { id: 'cashflow', title: 'Cash flow' }, { id: 'income', title: 'Income' },
    { id: 'debts', title: 'Debts' }, { id: 'credit', title: 'Credit notes' }, { id: 'assets', title: 'Assets by tax type' },
    { id: 'goals', title: 'Goals' }, { id: 'timeline', title: 'Timeline' }, { id: 'ratios', title: 'Ratios' }
  ];
  var AUDIENCES = [
    { id: 'partner', label: 'Partner', line: 'Before moving in together: cash flow, debts, goals.', sections: ['story', 'cashflow', 'debts', 'goals'] },
    { id: 'coach', label: 'Coach', line: 'Everything.', sections: SECTIONS.map(function (s) { return s.id; }) },
    { id: 'lender', label: 'Lender prep', line: 'Income, debts, debt-to-income, credit notes.', sections: ['income', 'debts', 'credit', 'ratios'] },
    { id: 'planner', label: 'Planner', line: 'Assets by tax type, goals, timeline.', sections: ['assets', 'goals', 'timeline', 'ratios'] },
    { id: 'podcast', label: 'Podcast', line: 'The story plus ratios.', sections: ['story', 'ratios', 'timeline'] }
  ];
  var PUBLIC_KINDS = { rate: true, months: true, years: true, text: true, date: true, count: true, age: true };

  function audienceById(id) { return AUDIENCES.filter(function (a) { return a.id === id; })[0] || AUDIENCES[1]; }

  /* One row. A missing value is a blank row, never 0. */
  function row(label, kind, value, opts) {
    var o = opts || {};
    var blank = value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value));
    var notSure = !!o.notSure;
    return { label: label, kind: kind, value: blank ? null : value, blank: blank && !notSure, notSure: notSure, note: o.note || null };
  }
  function fmt(r) {
    if (r.notSure) return 'not sure yet';
    if (r.blank) return '';
    switch (r.kind) {
      case 'cents': return Money.formatCents(r.value);
      case 'rate': return Money.formatRate(r.value, { decimals: 1 });
      case 'months': return (Math.round(r.value * 10) / 10) + ' month' + (r.value === 1 ? '' : 's');
      case 'years': return (Math.round(r.value * 10) / 10) + ' year' + (r.value === 1 ? '' : 's');
      case 'age': return String(r.value);
      case 'count': return String(r.value);
      default: return String(r.value);
    }
  }
  function val(r) { return Money.isOk(r) ? r.value : null; }
  function ratio(ctx, id) { var r = Ratios.byId(id); if (!r) return null; var out = r.compute(ctx); return Money.isOk(out) ? out.value : null; }

  function sections(h, T) {
    var ctx = Ratios.context(h, T);
    var adults = Schema.adults(h), people = (h.people || []).length;
    var sit = Gate ? Gate.situationOf(h) : null;
    var sitLabel = sit && Gate.SITUATIONS ? (Gate.SITUATIONS.filter(function (s) { return s.id === sit; })[0] || {}).label : null;
    var age = Schema.primaryAge(h);
    var gross = Schema.grossAnnualIncomeCents(h), take = Schema.takeHomeAnnualCents(h, T), spend = Schema.monthlyExpensesCents(h);
    var sr = Tier0.savingsRate(h, T); var basis = Money.isOk(sr.includingMatch) ? sr.includingMatch : sr.excludingMatch;
    var piles = Trap.piles(h);
    var nw = Tier0.netWorth(h), fi = Tier0.fireNumber(h), fiYears = Tier0.yearsToFire(h, T, null, { fractional: true });
    var year = Number(Schema.localMonth().slice(0, 4));
    var debts = (h.debts || []).filter(function (d) { return Money.isEntered(d.balanceCents); });
    var out = {};
    out.story = [
      row('Situation', 'text', sitLabel ? sitLabel.replace(/ —.*$/, '') : null),
      row('Household', 'count', people || null, { note: adults.length >= 2 ? 'two adults' : 'one adult' }),
      row('Age', 'age', Money.isEntered(age) ? Math.floor(age) : null),
      row('State', 'text', h.state || null)
    ];
    out.cashflow = [
      row('Take-home, a month', 'cents', Money.isOk(take) ? Math.round(take.value / MONTHS) : null),
      row('Spending, a month', 'cents', val(spend), { notSure: !Money.isOk(spend) && !!Schema.notSure(h, 'monthlyExpenses') }),
      row('Saved, a month', 'cents', Money.isOk(basis) ? Math.round(basis.annualSavingsCents / MONTHS) : null, { note: Money.isOk(basis) && basis.variant === 'includingMatch' ? 'with the employer match' : null }),
      row('Savings rate', 'rate', ratio(ctx, 'savingsRate')),
      row('Emergency fund', 'months', ratio(ctx, 'emergencyFundMonths'))
    ];
    var sources = Schema.allIncomeSources ? Schema.allIncomeSources(h) : [];
    out.income = [
      row('Gross income, a year', 'cents', val(gross), { notSure: !Money.isOk(gross) && !!Schema.notSure(h, 'grossAnnualIncome') }),
      row('Income sources', 'count', sources.length || null),
      row('Filing status', 'text', h.filingStatus || null),
      row('Effective tax rate', 'rate', Money.isOk(take) && Money.isEntered(take.effectiveRate) ? take.effectiveRate : null)
    ];
    out.debts = debts.map(function (d) { return row((d.label || d.type || 'A debt') + (Money.isEntered(d.rate) ? ' at ' + Money.formatRate(d.rate, { decimals: 1 }) : ''), 'cents', d.balanceCents); })
      .concat([row('Total owed', 'cents', debts.length ? debts.reduce(function (s, d) { return s + d.balanceCents; }, 0) : null), row('Debt-to-income', 'rate', ratio(ctx, 'debtToIncome')), row('Debts', 'count', debts.length || null)]);
    out.credit = [
      row('Credit utilisation', 'rate', ratio(ctx, 'creditUtilization')),
      row('Revolving share of debt', 'rate', ratio(ctx, 'revolvingShare')),
      row('Back-end ratio', 'rate', ratio(ctx, 'backEndRatio'))
    ];
    out.assets = [
      row('Cash', 'cents', piles.cashCents || null, { notSure: !piles.cashCents && !!Schema.notSure(h, 'cashSavings') }), row('Taxable accounts', 'cents', piles.taxableCents || null),
      row('Roth', 'cents', (piles.rothBasisCents + piles.rothEarningsCents) || null), row('Pre-tax', 'cents', piles.pretaxCents || null),
      row('Home equity', 'cents', piles.homeCents ? piles.homeEquityCents : null), row('Net worth', 'cents', val(nw)),
      row('Invested share of assets', 'rate', ratio(ctx, 'investedShare'))
    ];
    var goals = (h.goals || []).map(function (g) { return row(g.name || 'A goal', 'cents', Money.isEntered(g.lumpTargetCents) ? g.lumpTargetCents : null, { note: Money.isEntered(g.savedCents) ? Money.formatCents(g.savedCents) + ' saved' : null }); });
    out.goals = goals.concat([
      row('FI number', 'cents', val(fi)), row('Years to FI', 'years', val(fiYears)),
      row('Stop working at', 'age', h.targets && Money.isEntered(h.targets.retireAge) ? h.targets.retireAge : null),
      row('FI ratio', 'rate', ratio(ctx, 'fiRatio'))
    ]);
    var fiYear = Money.isOk(fiYears) ? year + Math.ceil(fiYears.value) : null;
    out.timeline = [
      row('Now', 'age', Money.isEntered(age) ? Math.floor(age) : null),
      row('FI date', 'date', fiYear ? String(fiYear) : null),
      row('Stop working', 'date', Money.isEntered(age) && h.targets && Money.isEntered(h.targets.retireAge) ? String(year + Math.max(0, Math.round(h.targets.retireAge - age))) : null),
      row('Retirement money without penalty', 'date', Money.isEntered(age) ? String(year + Math.max(0, Math.ceil(59.5 - age))) : null),
      row('Medicare', 'date', Money.isEntered(age) ? String(year + Math.max(0, Math.round(65 - age))) : null)
    ];
    out.ratios = ['savingsRate', 'emergencyFundMonths', 'debtToIncome', 'fiRatio', 'netWorthToIncome', 'investedShare'].map(function (id) {
      var r = Ratios.byId(id); var v = ratio(ctx, id);
      return row(r ? r.label : id, id === 'emergencyFundMonths' ? 'months' : 'rate', v);
    });
    return out;
  }

  /**
   * build(household, tables, opts) → Result
   *   opts.audience   partner | coach | lender | planner | podcast (default coach)
   *   opts.version    private | public (default private)
   *   opts.sections   { id: true | false } overrides on the preset
   *   value   the sections shown: [{ id, title, rows: [{ label, kind, value, blank, notSure, text }] }]
   */
  function build(household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    var aud = audienceById(o.audience);
    var version = VERSIONS.indexOf(o.version) > -1 ? o.version : 'private';
    var all = sections(h, T);
    var shown = SECTIONS.filter(function (s) {
      var on = aud.sections.indexOf(s.id) > -1;
      if (o.sections && typeof o.sections[s.id] === 'boolean') on = o.sections[s.id];
      return on;
    }).map(function (s) {
      var rows = (all[s.id] || []).filter(function (r) { return version === 'private' || PUBLIC_KINDS[r.kind]; });
      rows.forEach(function (r) { r.text = fmt(r); });
      return { id: s.id, title: s.title, rows: rows };
    }).filter(function (s) { return s.rows.length; });
    return Money.ok(shown, { audience: aud.id, audienceLabel: aud.label, version: version, sectionsOn: shown.map(function (s) { return s.id; }), at: Schema.localMonth() });
  }

  /** The page as plain text, one line a row, for the leak test and the clipboard. */
  function text(built) {
    if (!Money.isOk(built)) return '';
    return built.value.map(function (s) { return s.title + '\n' + s.rows.map(function (r) { return '  ' + r.label + ': ' + (r.text === '' ? '(not entered)' : r.text); }).join('\n'); }).join('\n\n');
  }

  return { VERSIONS: VERSIONS, SECTIONS: SECTIONS, AUDIENCES: AUDIENCES, PUBLIC_KINDS: PUBLIC_KINDS, audienceById: audienceById, build: build, text: text, sections: sections };
});
