/* ==========================================================================
   shared/workbook.js, the whole app as one spreadsheet. DECISIONS.md D-356.
   --------------------------------------------------------------------------
   The owner asked for the app as a really professional spreadsheet, because
   thirty-seven rooms is a lot of app when all you want is to sit down with
   your numbers. This is that file: every one of the Ledger's rows, grouped by
   door, each asked in the same plain words the app asks it in, with the five
   sentences that say what it means and where to find it; and a tab that works
   out what the numbers say.

   It is a MODEL, not a photograph of one. Every figure the app derives is a
   real spreadsheet formula over named cells, so the file keeps working after
   you close the app and type something new:

       netWorth          = cashSavings+investments+otherAssets-totalDebt
       runwayMonths      = cashSavings/monthlyExpenses
       weightedDebtRate  = SUMPRODUCT(debtBalance,debtRate)/totalDebt

   ONE FORMULA, ONE FUNCTION still holds. Nothing here is a second definition
   of an app calculation that could quietly drift:
     - the thirteen computed ROWS are generated from `formula.terms` in
       data/ledger-rows.json, the same signed sum the app reads;
     - the nineteen READINGS are listed in data/workbook.json, and each one
       names the engine that owns it. test/run.js works every reading out
       both ways, on several households, and fails if they disagree.

     Workbook.build(h, tables, opts)  → { sheets, names }, for Xlsx.build
     Workbook.file(h, tables, opts)   → Uint8Array, the workbook itself
     Workbook.name(day)               → money-rooms-2026-09-26.xlsx

   Empty is not zero, here too. A row nobody has answered is an empty shaded
   cell, never a typed 0, and every reading that divides by a blank shows
   nothing rather than an answer it does not have.
   ========================================================================== */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Workbook = api; }
})(typeof self !== 'undefined' ? self : null, function (root) {
  'use strict';
  /* Resolved when they are used, not when this file loads: in a page this
     module sits above shared/csvexport.js in the script list, and a name
     captured up there would be undefined for the whole session. */
  var NODE = typeof module === 'object' && !!module.exports;
  function dep(name, path) {
    if (NODE) return require(path);
    var S = (root && root.SLAF) || {};
    return S[name];
  }
  function Money() { return dep('Money', './money.js'); }
  function Schema() { return dep('Schema', './schema.js'); }
  function LedgerRows() { return dep('LedgerRows', './ledger-rows.js'); }
  function Xlsx() { return dep('Xlsx', './xlsx.js'); }
  function CsvExport() { return dep('CsvExport', './csvexport.js'); }

  /* The columns, in the order they are read left to right. The headings are
     the ones shared/csvexport.js already knows how to read back (D-220), so
     this file still goes out, gets typed in, and comes home. */
  var COLUMNS = [
    { header: 'In plain words', width: 54, kind: 'question', from: 'plain' },
    { header: 'Which one', width: 18, from: 'item' },
    { header: 'Your number', width: 16, from: 'value' },
    { header: 'In', width: 13, from: 'unit' },
    { header: 'What it means', width: 46, kind: 'help', from: 'means' },
    { header: 'Where to find it', width: 46, kind: 'help', from: 'where' },
    { header: 'Close enough', width: 36, kind: 'help', from: 'roughly' },
    { header: 'If you are not sure', width: 40, kind: 'help', from: 'unsure' },
    { header: 'What it unlocks', width: 34, kind: 'help', from: 'unlocks' },
    { header: 'How sure', width: 14, from: 'state' },
    { header: 'Last checked', width: 13, from: 'as_of' },
    { header: 'Came from', width: 13, from: 'source' },
    { header: 'What it is', width: 34, from: 'label' },
    { header: 'row id', width: 20, kind: 'note', from: 'row' },
    { header: 'item id', width: 14, kind: 'note', from: 'item_id' }
  ];
  var VALUE_AT = 2;                     /* the column a number is typed into */
  var UNIT_IN = { cents: 'dollars', rate: 'a percent', percent: 'a percent', months: 'months', years: 'years',
    count: 'a number', bool: 'yes or no', enum: 'a choice', text: 'text', date: 'a date', formula: 'words' };
  /* How many lines a one-line-per-item row gets in an empty file, so there is
     somewhere to type the second debt before you own it. */
  var SPARE = 5;

  function colName(i) { return Xlsx().colName(i); }
  function ref(sheet, col, row) { return "'" + String(sheet).replace(/'/g, "''") + "'!$" + colName(col) + '$' + row; }
  function range(sheet, col, from, to) { return ref(sheet, col, from) + ':$' + colName(col) + '$' + to; }

  /* A defined name has to be a name and not an address: Excel refuses `T5`
     and anything starting with a digit. Every row id in the app is a camelCase
     word, so this only ever guards against a future one that is not. */
  function nameable(id) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) && !/^[A-Za-z]{1,3}[0-9]{1,7}$/.test(id) && id.toUpperCase() !== 'R' && id.toUpperCase() !== 'C';
  }

  /* The value cell, in the unit the sheet shows it in: dollars for cents, a
     fraction for a percent (the cell's own format writes the % sign), the day
     for a date, the word for a choice. Blank stays blank. */
  function kindOf(unit) {
    if (unit === 'cents') return 'money';
    if (unit === 'rate' || unit === 'percent') return 'percent';
    if (unit === 'months' || unit === 'years' || unit === 'count') return 'number';
    if (unit === 'date') return 'date';
    return 'text';
  }
  function valueCell(line, row, tables) {
    var kind = kindOf(line.unit);
    var typed = 'input' + kind.charAt(0).toUpperCase() + kind.slice(1);
    if (line.raw === null || line.raw === undefined) return { v: '', kind: typed };
    if (line.unit === 'cents') return { v: Math.round(line.raw) / 100, kind: typed };
    if (line.unit === 'rate' || line.unit === 'percent') {
      var whole = CsvExport() && CsvExport().wholePercent ? CsvExport().wholePercent(row) : false;
      return { v: whole ? line.raw / 100 : line.raw, kind: typed };
    }
    if (kind === 'number') return { v: line.raw, kind: typed };
    if (kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(line.raw))) return { v: line.raw, kind: typed };
    if (line.unit === 'bool') return { v: line.raw === true ? 'yes' : line.raw === false ? 'no' : '', kind: typed };
    /* A choice reads in words, never as the id it is stored under: the app
       shows "Employed", so the sheet does too, and the dropdown beside it
       offers the same words back. */
    var word = CsvExport() && CsvExport().shown ? CsvExport().shown(row, line.raw, tables) : '';
    return { v: word || (line.value === '' ? String(line.raw) : line.value), kind: typed };
  }

  /* ---- The thirteen computed rows ------------------------------------------
     Generated, never written out by hand: `formula.terms` in
     data/ledger-rows.json is the signed sum the app itself reads, so the cell
     says the same thing the engine does. A row whose terms are not a plain
     sum (an age, a yes-or-no, anything that reads the app's own log) gets its
     sentence instead of a formula, because a wrong formula is worse than an
     honest blank. */
  var BY_HAND = {
    age: 'IF(dob="","",DATEDIF(dob,TODAY(),"Y"))',
    capturingFullMatch: 'IF(OR(contributionPercent="",employerMatch=""),"",IF(contributionPercent>=employerMatch,"yes","no"))',
    otherAssets: 'SUMIF(assetKind,"real_estate",assetValue)+SUMIF(assetKind,"vehicle",assetValue)+SUMIF(assetKind,"other",assetValue)'
  };
  function computedFormula(row, named) {
    if (BY_HAND[row.id] !== undefined) return BY_HAND[row.id];
    var terms = (row.formula && row.formula.terms) || [];
    if (!terms.length) return null;
    /* A row whose formula names a reference table is not the sum of its terms:
       the confidence-weighted net worth lists assets and debts, but each asset
       is multiplied by a weight from data/confidence_weights.json first, and
       adding the terms up would print a different number under the right
       label. Those rows get their sentence instead. */
    if (((row.formula && row.formula.references) || []).length) return null;
    var parts = [];
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (t.coef !== 1 && t.coef !== -1) return null;         /* not a plain sum */
      var n = named[t.id];
      if (!n) return null;                                    /* not on the sheet */
      var piece = n.isRange ? 'SUM(' + t.id + ')' : t.id;
      parts.push((t.coef === -1 ? '-' : (i ? '+' : '')) + piece);
    }
    return parts.join('');
  }

  /** build(h, tables, opts) → { sheets, names }: everything Xlsx.build wants. */
  function build(household, tables, opts) {
    var o = opts || {};
    var plan = o.plan || (tables || {}).workbook
      || (typeof require === 'function' && typeof module === 'object' ? require('../data/workbook.json') : null);
    if (!plan) throw new Error('Workbook.build needs data/workbook.json (load the `workbook` reference table)');
    var h = household || {};
    var all = ((tables || {}).ledgerRows || {}).rows || LedgerRows().all();
    var byId = {};
    all.forEach(function (r) { byId[r.id] = r; });
    var lines = withEveryRow(CsvExport().rows(h, tables), all);

    var named = {}, sheets = [], names = [];
    var doorSheets = [];

    /* ---- Pass one: lay the door tabs out and remember where each row landed.
       A name is only worth having when the sheet holds exactly one of a row
       (a single cell) or a run of lines of it (a range to sum across). */
    plan.doors.forEach(function (door) {
      var mine = lines.filter(function (l) { return l.door === door.id; });
      if (!mine.length) return;
      var rows = [], at = {};
      mine.forEach(function (l) {
        var row = byId[l.row] || { id: l.row, unit: l.unit };
        var n = rows.length + 2;                              /* row 1 is the heading */
        if (!at[l.row]) at[l.row] = { from: n, to: n, repeat: !!row.repeat, row: row };
        at[l.row].to = n;
        rows.push({ line: l, row: row, n: n });
      });
      /* Room for a debt you have not taken on yet. */
      Object.keys(at).forEach(function (id) {
        var slot = at[id];
        if (!slot.repeat) return;
        var have = rows.filter(function (r) { return r.line.row === id; }).length;
        for (var i = have; i < SPARE; i++) {
          var n = null;
          rows.splice(indexAfter(rows, id), 0, { line: blankLine(slot.row), row: slot.row, n: 0 });
        }
      });
      /* Renumber after the padding moved things, then remember the spans. */
      at = {};
      rows.forEach(function (r, i) {
        r.n = i + 2;
        var id = r.line.row;
        if (!at[id]) at[id] = { from: r.n, to: r.n, repeat: !!r.row.repeat, row: r.row };
        at[id].to = r.n;
      });
      doorSheets.push({ door: door, tab: door.tab, rows: rows, at: at });
      Object.keys(at).forEach(function (id) {
        var slot = at[id];
        if (!nameable(id)) return;
        named[id] = slot.repeat || slot.to > slot.from
          ? { isRange: true, ref: range(door.tab, VALUE_AT, slot.from, slot.to) }
          : { isRange: false, ref: ref(door.tab, VALUE_AT, slot.from) };
      });
    });
    /* The assets tab carries the one thing the export never had: which pile a
       line belongs to, without which net worth cannot leave cash alone. */
    var assetKind = assetKindColumn(doorSheets, h);
    if (assetKind) named.assetKind = { isRange: true, ref: assetKind.ref };

    /* ---- Pass two: write the cells, now that every name has an address. */
    doorSheets.forEach(function (d) {
      var body = d.rows.map(function (r) {
        var row = r.row, line = r.line;
        var cells = COLUMNS.map(function (c) {
          if (c.from === 'value') {
            var f = row.kind === 'computed' ? computedFormula(row, named) : null;
            if (f) return { f: f, kind: 'read' + kindOf(row.unit).charAt(0).toUpperCase() + kindOf(row.unit).slice(1) };
            if (row.kind === 'computed') return { v: '', kind: 'text' };
            return valueCell(line, row, tables);
          }
          if (c.from === 'unit') return UNIT_IN[line.unit] || line.unit;
          if (c.from === 'plain') return { v: row.plain || line.label, kind: 'question' };
          if (['means', 'where', 'roughly', 'unsure', 'unlocks'].indexOf(c.from) > -1) {
            if (row.kind === 'computed' && c.from === 'means') {
              return { v: (row.formula && row.formula.words) ? 'The sheet works this out: ' + row.formula.words + '.' : 'The sheet works this out.', kind: 'help' };
            }
            return { v: row[c.from] || '', kind: 'help' };
          }
          if (c.kind === 'note') return { v: line[c.from] || '', kind: 'note' };
          return line[c.from] === undefined ? '' : line[c.from];
        });
        return cells;
      });
      var sheet = {
        name: d.tab,
        columns: COLUMNS.map(function (c) { return { header: c.header, width: c.width }; }),
        rows: body,
        freeze: { x: 1, y: 1 },
        validations: validationsFor(d, byId, tables)
      };
      if (assetKind && assetKind.tab === d.tab) addAssetKind(sheet, assetKind);
      sheets.push(sheet);
    });

    /* ---- The readings, and the one assumption behind the last of them. */
    var says = readingSheet(plan, named, names);
    sheets.push(says);
    sheets.unshift(startHere(plan, h));

    Object.keys(named).forEach(function (id) { names.push({ name: id, ref: named[id].ref }); });
    return { sheets: sheets, names: names, plan: plan };
  }

  /* The app only shows a person the rows their situation calls for: no partner
     questions when you live alone, no last-pay question while you are working.
     A file that says it is the whole app has to hold them anyway, or somebody
     who marries next year finds the sheet has nothing to say about it. So the
     ones the situation left out are put back, blank, with the state saying
     why they are quiet. D-356. */
  function withEveryRow(lines, all) {
    var seen = {};
    lines.forEach(function (l) { seen[l.row] = true; });
    var extra = [];
    all.forEach(function (r) {
      if (seen[r.id] || /^prefs\./.test(r.path)) return;
      var line = blankLine(r);
      line.state = 'not yours yet';
      extra.push(line);
      if (!r.repeat) return;
      for (var i = 1; i < SPARE; i++) extra.push(Object.assign({}, blankLine(r), { state: 'not yours yet' }));
    });
    return lines.concat(extra);
  }

  function indexAfter(rows, id) {
    for (var i = rows.length - 1; i >= 0; i--) if (rows[i].line.row === id) return i + 1;
    return rows.length;
  }
  function blankLine(row) {
    return { raw: null, kind: row.kind, door: row.door, level: row.level, row: row.id, label: row.label,
      item: '', institution: '', value: '', unit: row.unit, state: '', as_of: '', source: '', item_id: '' };
  }

  /* A choice or a yes-or-no becomes a dropdown, so it cannot be typed wrong
     and so the formulas that read it ("yes") always find what they expect. */
  function validationsFor(d, byId, tables) {
    var out = [];
    Object.keys(d.at).forEach(function (id) {
      var row = byId[id];
      if (!row) return;
      var values = row.unit === 'bool' ? ['yes', 'no']
        : (row.unit === 'enum' && CsvExport() && CsvExport().enumChoices
            ? CsvExport().enumChoices(row, tables).map(function (c) { return c.label || c.id; })
            : null);
      if (!values || !values.length) return;
      var slot = d.at[id];
      out.push({ ref: colName(VALUE_AT) + slot.from + ':' + colName(VALUE_AT) + slot.to, values: values });
    });
    return out;
  }

  /* Which pile each thing you own belongs to. The app keeps it on the asset
     itself; the sheet needs it in a column, because "everything else you own"
     is the part of net worth that is neither cash nor invested. */
  var ASSET_KINDS = ['cash', 'investment', 'retirement', 'real_estate', 'vehicle', 'other'];
  function assetKindColumn(doorSheets, h) {
    for (var i = 0; i < doorSheets.length; i++) {
      var slot = doorSheets[i].at.assetValue;
      if (!slot) continue;
      var items = (h && h.assets) || [];
      return { tab: doorSheets[i].tab, from: slot.from, to: slot.to, items: items,
        at: COLUMNS.length,
        ref: range(doorSheets[i].tab, COLUMNS.length, slot.from, slot.to) };
    }
    return null;
  }
  function addAssetKind(sheet, k) {
    sheet.columns = sheet.columns.concat([{ header: 'Which pile', width: 16 }]);
    var seen = 0;
    sheet.rows.forEach(function (cells, i) {
      var n = i + 2;
      if (n < k.from || n > k.to) return;
      var item = k.items[seen++];
      cells[k.at] = { v: (item && item.category) || '', kind: 'inputText' };
    });
    sheet.validations = (sheet.validations || []).concat([
      { ref: colName(k.at) + k.from + ':' + colName(k.at) + k.to, values: ASSET_KINDS }
    ]);
  }

  /* ---- What it says --------------------------------------------------------
     Every line is a formula over the names above, so the tab is alive: change
     what a month costs on tab 3 and the runway, the cushion and the FI number
     all move. A reading that leans on something nobody has entered shows
     nothing, which is the app's own rule about empty. */
  function readingSheet(plan, named, names) {
    var tab = 'What it says';
    var rows = [], at = 2;
    rows.push([{ v: 'What your numbers say', kind: 'title' }]);
    rows.push([{ v: 'Every figure here is worked out from the tabs before it. Type there, and these move.', kind: 'help' }]);
    rows.push([]);
    at = 4;
    (plan.assumptions || []).forEach(function (a) {
      rows.push([{ v: a.label, kind: 'question' }, { v: a.value, kind: 'input' + a.kind.charAt(0).toUpperCase() + a.kind.slice(1) }, { v: a.words, kind: 'help' }]);
      if (nameable(a.name)) names.push({ name: a.name, ref: ref(tab, 1, rows.length) });
      at = rows.length + 1;
    });
    rows.push([]);
    rows.push([{ v: 'The reading', kind: 'band' }, { v: 'Your number', kind: 'band' }, { v: 'How it is worked out', kind: 'band' }, { v: 'reading id', kind: 'band' }]);
    plan.readings.forEach(function (r) {
      rows.push([
        { v: r.label, kind: 'question' },
        { f: r.excel, kind: 'read' + r.kind.charAt(0).toUpperCase() + r.kind.slice(1) },
        { v: r.words, kind: 'help' },
        { v: r.id, kind: 'note' }
      ]);
      if (nameable(r.id) && !named[r.id]) names.push({ name: r.id, ref: ref(tab, 1, rows.length) });
    });
    return {
      name: tab, noHeader: true, noFilter: true, noGrid: true, freeze: { x: 1, y: 0 },
      columns: [{ header: '', width: 46 }, { header: '', width: 18 }, { header: '', width: 68 }, { header: '', width: 18 }],
      rows: rows
    };
  }

  function startHere(plan, h) {
    var day = Schema().localDay();
    var L = [
      [{ v: plan.title + ', on one sheet', kind: 'title' }],
      [{ v: 'Made ' + day + (Schema().APP_VERSION ? ', app version ' + Schema().APP_VERSION : ''), kind: 'help' }],
      [],
      [{ v: 'What this is', kind: 'band' }],
      [{ v: 'Every question the app can ask, on six tabs, in the order worth doing them. Answer what you can, leave the rest blank, and the last tab works out what your numbers say.', kind: 'question' }],
      [],
      [{ v: 'How to read it', kind: 'band' }],
      [{ v: 'A shaded cell is yours to type in.', kind: 'question' }],
      [{ v: 'A bold figure is one the sheet works out. Do not type over it: the formula is the point.', kind: 'question' }],
      [{ v: 'Blank means not answered. It never means zero, and nothing here will treat it as zero.', kind: 'question' }],
      [{ v: 'Every question carries five sentences to its right: what it means, where to find it, what is close enough, what to do if you are not sure, and what answering it unlocks.', kind: 'question' }],
      [],
      [{ v: 'The order worth doing them in', kind: 'band' }]
    ];
    plan.doors.forEach(function (d) { L.push([{ v: d.tab, kind: 'question' }, { v: d.blurb, kind: 'help' }]); });
    L.push([]);
    L.push([{ v: 'Two promises', kind: 'band' }]);
    L.push([{ v: 'Nothing in this file leaves your computer. It was made on your own machine and it is yours.', kind: 'question' }]);
    L.push([{ v: 'Every figure on What it says is the same arithmetic the app does. The app’s own tests work each one out both ways and fail if they ever disagree.', kind: 'question' }]);
    return {
      name: 'Start here', noHeader: true, noFilter: true, noGrid: true, freeze: { x: 0, y: 0 },
      columns: [{ header: '', width: 86 }, { header: '', width: 60 }],
      rows: L
    };
  }

  /** file(h, tables, opts) → the workbook as bytes. */
  function file(household, tables, opts) {
    var o = opts || {};
    var b = build(household, tables, o);
    return Xlsx().build(b.sheets, { title: (b.plan.title || 'Money Rooms'), creator: b.plan.title || 'Money Rooms',
      day: Schema().localDay(), now: o.now, names: b.names });
  }
  function name(day) { return 'money-rooms-' + day + '.xlsx'; }

  return { build: build, file: file, name: name, COLUMNS: COLUMNS, ASSET_KINDS: ASSET_KINDS, SPARE: SPARE, nameable: nameable, computedFormula: computedFormula, BY_HAND: BY_HAND };
});
