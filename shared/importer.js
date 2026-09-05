/* ==========================================================================
   shared/importer.js — new numbers in, sorted into where they belong.
   --------------------------------------------------------------------------
   The one-pager's paste (shared/gate.js parseImport) answers its own ten
   questions and nothing else: 'Chase Visa 2,300' became "total owed", and
   'rent 1,500/mo' became "a month of spending". Once the household is more
   than the one-pager — itemised debts, several accounts, a categorised
   month — a pasted statement has to land in the right LIST, as the right
   RECORD, in one batch, with one undo. This is that.

     classify(text, tables)   → rows: one per line with an amount, each
                                 placed by a word in data/import_keywords
                                 .json as a debt (of a type), an asset (of a
                                 category), an expense (in a category) or an
                                 income (on a basis). Lines nothing matches
                                 come back as 'skip', never guessed.
     plan(rows, household)    → the records to write, built with the
                                 schema's constructors, with an existing
                                 monthly expense line for the same category
                                 replaced rather than doubled.
     apply(plan, Spine)       → the writes, one batch, labelled.
     merge(current, incoming) → a loaded file ADDED to the household here:
                                 lists gain the records they lack by id,
                                 blank scalars fill, nothing entered is
                                 overwritten. Replacing is the spine's own
                                 importJSON; this is the other choice.

   Nothing here reads a bank. Every number was typed or pasted by the
   person, and every placement is shown before it is written. D-125.
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
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Importer = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  var MONTHS = 12;
  var KINDS = ['debt', 'asset', 'expense', 'income', 'skip'];
  var MONTHLY_HINT = /\/\s*mo\b|\ba month\b|\bmonth\b|\bmonthly\b|\bper mo\b|\bpm\b|\beach month\b/i;
  var ANNUAL_HINT = /\/\s*yr\b|\ba year\b|\byearly\b|\bper year\b|\bannual\b|\bsalary\b/i;
  var WEEKLY_HINT = /\/\s*wk\b|\ba week\b|\bweekly\b|\bper week\b/i;
  var FORTNIGHT_HINT = /\bbiweekly\b|\bbi-weekly\b|\bevery two weeks\b|\bevery 2 weeks\b|\bfortnight/i;
  var HOURLY_HINT = /\/\s*hr\b|\ban hour\b|\bhourly\b|\bper hour\b/i;
  var INCOME_ID = 'import_income';

  /* The amount on a line: the first number, with $ and commas allowed, a
     trailing k meaning thousands, and a leading minus kept. '401k' and
     '403b' are account names, not amounts, and are skipped first. */
  function amountIn(line) {
    var cleaned = String(line).replace(/\b(401|403|457)\s*\(?[kb]\)?\b/ig, '');
    var m = /(-?)\$?\s?(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/i.exec(cleaned);
    if (!m) return null;
    var n = Number(m[2].replace(/,/g, ''));
    if (isNaN(n)) return null;
    if (m[3]) n = n * 1000;
    return Math.round(n * 100) * (m[1] ? -1 : 1);
  }

  /* What the line calls the thing: everything but the amount and the
     punctuation around it. 'Chase Visa 2,300' → 'Chase Visa'. */
  function labelOf(line) {
    var s = String(line)
      .replace(/(-?)\$?\s?\d[\d,]*(?:\.\d+)?\s*k?\b(?![kb]\))/i, ' ')
      .replace(/\/\s*(mo|yr|wk|hr)\b/ig, ' ')
      .replace(/\b(a|per|each)\s+(month|year|week|hour)\b/ig, ' ')
      .replace(/\b(monthly|yearly|weekly|hourly|annual)\b/ig, ' ')
      .replace(/[,;:|\t]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
    if (!s) return null;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function firstWord(lower, groups, pick) {
    for (var i = 0; i < groups.length; i++) {
      var words = groups[i].words || [];
      for (var j = 0; j < words.length; j++) {
        if (lower.indexOf(words[j]) !== -1) return pick(groups[i], words[j]);
      }
    }
    return null;
  }

  function basisOf(line) {
    if (HOURLY_HINT.test(line)) return 'hourly';
    if (WEEKLY_HINT.test(line)) return 'weekly';
    if (FORTNIGHT_HINT.test(line)) return 'fortnightly';
    if (MONTHLY_HINT.test(line)) return 'monthly';
    return 'annual';
  }

  /**
   * classify(text, tables) — one row per line that carries an amount.
   *   { i, line, label, cents, monthly, kind, sub, why }
   * kind: 'debt' | 'asset' | 'expense' | 'income' | 'skip'
   * sub:  a debt type, an asset category, an expense categoryId, or an
   *       income basis — the thing the preview lets the person change.
   */
  function classify(text, tables) {
    var kw = (tables && tables.importKeywords) || {};
    var cats = ((tables && tables.expenseCategories) || {}).categories || [];
    var rows = [];
    String(text || '').split(/\r?\n/).forEach(function (raw, i) {
      var line = raw.trim();
      if (!line) return;
      var lower = line.toLowerCase();
      if (/^(label|name|item|category|description)\s*[,;\t|]\s*(amount|value|balance|total)/.test(lower)) return;
      var cents = amountIn(line);
      var monthly = MONTHLY_HINT.test(line);
      var row = { i: i, line: line, label: labelOf(line), cents: cents === null ? null : Math.abs(cents), monthly: monthly, kind: 'skip', sub: null, why: null };
      if (cents === null) { row.why = 'no amount on the line'; rows.push(row); return; }

      /* Order matters: an income word wins over an asset word ('savings
         from salary'), a debt word over an expense word ('car loan' is a
         debt, 'car insurance' is not). A debt word with a monthly amount
         is the payment, not the balance; where the table says that
         payment is an expense line, it is filed there. */
      var income = firstWord(lower, kw.income || [], function () { return true; });
      if (income) { row.kind = 'income'; row.sub = basisOf(line); row.why = 'reads as pay'; rows.push(row); return; }

      var debt = firstWord(lower, kw.debt || [], function (g, w) { return { type: g.type, word: w }; });
      if (debt) {
        var asExpense = monthly && kw.monthlyMeansExpense ? kw.monthlyMeansExpense[debt.type] : null;
        if (asExpense) { row.kind = 'expense'; row.sub = asExpense; row.why = 'a monthly ' + debt.word + ' payment'; }
        else { row.kind = 'debt'; row.sub = debt.type; row.why = '“' + debt.word + '”' + (monthly ? ' — a monthly amount, so the minimum; the balance is still needed' : ''); }
        rows.push(row); return;
      }

      var asset = firstWord(lower, kw.asset || [], function (g, w) { return { category: g.category, word: w }; });
      if (asset && !monthly) { row.kind = 'asset'; row.sub = asset.category; row.why = '“' + asset.word + '”'; rows.push(row); return; }

      var cat = firstWord(lower, (kw.expenseExtra || []).concat(cats.map(function (c) { return { categoryId: c.id, words: c.keywords || [] }; })),
        function (g, w) { return { categoryId: g.categoryId, word: w }; });
      if (cat) { row.kind = 'expense'; row.sub = cat.categoryId; row.why = '“' + cat.word + '”' + (monthly ? '' : ', taken as a month'); rows.push(row); return; }
      if (asset) { row.kind = 'asset'; row.sub = asset.category; row.why = '“' + asset.word + '”'; rows.push(row); return; }

      row.why = 'no word I know — pick where it goes, or leave it';
      rows.push(row);
    });
    return { rows: rows, taken: rows.filter(function (r) { return r.kind !== 'skip'; }).length, skipped: rows.filter(function (r) { return r.kind === 'skip'; }).length };
  }

  /* ---- The plan: records, not writes -------------------------------------- */

  function monthlyEntryFor(household, categoryId) {
    var list = (household && household.expenses && household.expenses.entries) || [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.categoryId === categoryId && e.period === 'monthly' && e.source === 'manual') return e;
    }
    return null;
  }

  /**
   * plan(rows, household) — what apply() will write, from the rows as the
   * person left them (kind and sub may have been changed in the preview).
   */
  function plan(rows, household) {
    var h = household || {};
    var person = Schema.primaryPerson(h);
    var ownerIds = person ? [person.id] : [];
    var out = { debts: [], assets: [], expenses: [], income: [], skipped: [] };
    (rows || []).forEach(function (r) {
      if (!r || r.kind === 'skip' || !Money.isEntered(r.cents)) { out.skipped.push(r); return; }
      if (r.kind === 'debt') {
        out.debts.push(Schema.createDebt({
          label: r.label, type: r.sub || 'other', ownerIds: ownerIds,
          balanceCents: r.monthly ? null : r.cents,
          minPaymentCents: r.monthly ? r.cents : null,
          interestFree: r.sub === 'family' ? true : null, rate: r.sub === 'family' ? 0 : null
        }));
      } else if (r.kind === 'asset') {
        var liquid = r.sub === 'cash';
        out.assets.push(Schema.createAsset({ label: r.label, category: r.sub || 'other', valueCents: r.cents, liquid: liquid, ownerIds: ownerIds,
          taxCharacter: r.sub === 'retirement' ? (/roth/i.test(r.line) ? 'roth' : 'pretax') : r.sub === 'investment' ? 'taxable' : null }));
      } else if (r.kind === 'expense') {
        var existing = monthlyEntryFor(h, r.sub);
        out.expenses.push(Schema.createExpenseEntry({
          id: existing ? existing.id : 'cf_' + r.sub, categoryId: r.sub, amountCents: r.cents, period: 'monthly', source: 'manual',
          fixed: existing ? existing.fixed : null, dueDay: existing ? existing.dueDay : null, dateKind: existing ? existing.dateKind : null
        }));
      } else if (r.kind === 'income') {
        out.income.push({ label: r.label, rateCents: r.cents, frequency: r.sub || 'annual' });
      }
    });
    out.count = out.debts.length + out.assets.length + out.expenses.length + out.income.length;
    return out;
  }

  /**
   * apply(plan, Spine) — one batch, one undo. Income lands on the primary
   * adult: the intake's source is updated when it is the only one, else a
   * source of its own is added, so a second job pasted in is a second
   * source and not an overwrite.
   */
  function apply(p, Spine) {
    if (!Spine) throw new Error('Importer.apply needs the spine');
    var n = p.count || 0;
    Spine.batch('Imported ' + n + (n === 1 ? ' item' : ' items'), function () {
      var person = Spine.ensurePrimaryPerson('You');
      p.debts.forEach(function (d) { Spine.upsertDebt(Object.assign({}, d, { ownerIds: d.ownerIds.length ? d.ownerIds : [person.id] })); });
      if (p.debts.length && (Spine.getProfile().meta || {}).hasDebt !== true) Spine.set('meta.hasDebt', true);
      p.assets.forEach(function (a) { Spine.upsertAsset(Object.assign({}, a, { ownerIds: a.ownerIds.length ? a.ownerIds : [person.id] })); });
      p.expenses.forEach(function (e) { Spine.upsertExpenseEntry(e); });
      p.income.forEach(function (inc, k) {
        var h = Spine.getProfile();
        var you = Schema.primaryPerson(h);
        var sources = (you && you.incomeSources) || [];
        var target = sources.length === 1 && k === 0 ? sources[0] : null;
        Spine.upsertIncomeSource(you.id, Schema.createIncomeSource(Object.assign({}, target || {}, {
          id: target ? target.id : INCOME_ID + (k ? '_' + k : ''), personId: you.id, source: inc.label || (target ? target.source : 'Pay'),
          rateCents: inc.rateCents, frequency: inc.frequency, type: target ? target.type : 'w2'
        })));
      });
    });
    return n;
  }

  /* ---- Merging a loaded file into the household here ---------------------- */

  var LISTS = ['assets', 'debts', 'goals', 'futureIncome', 'properties', 'scenarios', 'oneOffs', 'dependents', 'timeBuckets', 'dreams'];
  var SCALARS = ['filingStatus', 'state', 'capturingFullMatch'];

  function byId(list) { var m = {}; (list || []).forEach(function (x) { if (x && x.id) m[x.id] = true; }); return m; }
  function addMissing(into, from) {
    var have = byId(into);
    var added = 0;
    (from || []).forEach(function (x) { if (x && x.id && !have[x.id]) { into.push(JSON.parse(JSON.stringify(x))); added++; } });
    return added;
  }

  /**
   * merge(current, incoming) — a COPY of `current` with what `incoming`
   * adds: records its lists lack (by id), people it lacks and their
   * income sources, expense entries it lacks, and blank scalars filled.
   * Nothing already entered changes. Returns { household, added }.
   */
  function merge(current, incoming) {
    var h = JSON.parse(JSON.stringify(current || Schema.createHousehold({})));
    var inc = incoming || {};
    var added = { people: 0, incomeSources: 0, assets: 0, debts: 0, expenses: 0, other: 0, scalars: 0 };
    h.people = h.people || [];
    var people = byId(h.people);
    (inc.people || []).forEach(function (p) {
      if (!p || !p.id) return;
      if (!people[p.id]) { h.people.push(JSON.parse(JSON.stringify(p))); added.people++; return; }
      var mine = h.people.filter(function (x) { return x.id === p.id; })[0];
      mine.incomeSources = mine.incomeSources || [];
      added.incomeSources += addMissing(mine.incomeSources, p.incomeSources);
      ['dob', 'employmentStatus', 'label'].forEach(function (k) { if ((mine[k] === null || mine[k] === undefined) && p[k] !== null && p[k] !== undefined) { mine[k] = p[k]; added.scalars++; } });
    });
    LISTS.forEach(function (k) {
      if (!Array.isArray(inc[k]) || !inc[k].length) return;
      h[k] = Array.isArray(h[k]) ? h[k] : [];
      var n = addMissing(h[k], inc[k]);
      if (k === 'assets') added.assets += n; else if (k === 'debts') added.debts += n; else added.other += n;
    });
    h.expenses = h.expenses || {}; h.expenses.entries = h.expenses.entries || [];
    added.expenses += addMissing(h.expenses.entries, inc.expenses && inc.expenses.entries);
    var pairMine = h.expenses.monthlyEssential || (h.expenses.monthlyEssential = {});
    var pairIn = (inc.expenses && inc.expenses.monthlyEssential) || {};
    ['estimatedValueCents', 'trackedValueCents'].forEach(function (k) { if (!Money.isEntered(pairMine[k]) && Money.isEntered(pairIn[k])) { pairMine[k] = pairIn[k]; added.scalars++; } });
    SCALARS.forEach(function (k) { if ((h[k] === null || h[k] === undefined) && inc[k] !== null && inc[k] !== undefined) { h[k] = inc[k]; added.scalars++; } });
    /* A nested branch (retirement, insurance, …): a blank here takes a
       real value from the file. A default false or an empty list is not a
       value, so it neither fills nor counts. */
    function meaningful(v) { return (typeof v === 'number' && isFinite(v)) || (typeof v === 'string' && v !== '') || v === true || (Array.isArray(v) && v.length > 0); }
    ['retirement', 'insurance', 'calendar', 'housing', 'targets'].forEach(function (k) {
      if (!inc[k] || typeof inc[k] !== 'object') return;
      h[k] = h[k] || {};
      Object.keys(inc[k]).forEach(function (f) {
        if (!meaningful(h[k][f]) && meaningful(inc[k][f])) { h[k][f] = JSON.parse(JSON.stringify(inc[k][f])); added.scalars++; }
      });
    });
    added.total = added.people + added.incomeSources + added.assets + added.debts + added.expenses + added.other + added.scalars;
    return { household: h, added: added };
  }

  return {
    KINDS: KINDS,
    amountIn: amountIn,
    labelOf: labelOf,
    basisOf: basisOf,
    classify: classify,
    plan: plan,
    apply: apply,
    merge: merge
  };
});
