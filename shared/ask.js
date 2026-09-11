/* ==========================================================================
   shared/ask.js — ask at the moment of need. DECISIONS.md D-207 (Phase D).
   --------------------------------------------------------------------------
   When a room opens and a row it asks for (askIn in data/ledger-rows.json)
   is blank, the room asks it right there, inline, one question, instead of
   bouncing the person back to the Ledger. At most one ask per room visit.
   The answer writes THROUGH THE OWNER (Ownership.write): the ownership map
   does not change, the owner room's own spine call runs.

     pick(h, roomId, tables, sug)  the one row to ask, or null:
                                   { row, item, suggestion }
     mount(roomId, host)           the card, once per visit, at the top of
                                   the room; loads what it needs

   Mounted from Progress.mount, so no room needs wiring; ask.js loads the
   registry reader and the suggestion engine itself when a room does not
   carry them. A suggestion for the row shows as a chip beside the box
   ("Suggested $64 a month · use it"), never typed into it.

   LIVE-FORM: built once — the card and its one control are created once
   on mount and only hidden after the answer; nothing is rebuilt while a
   finger is in the box.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Ask = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  function g() { return typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : {}); }
  function deps() {
    if (typeof module === 'object' && module.exports) {
      return { Money: require('./money.js'), Schema: require('./schema.js'), Ownership: require('./ownership.js'), LedgerRows: require('./ledger-rows.js'), Spine: require('./spine-v2.js'),
        Suggest: (function () { try { return require('./suggest.js'); } catch (e) { return null; } })(), Registry: require('./registry.js') };
    }
    var S = g().SLAF || {};
    return { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, LedgerRows: S.LedgerRows, Spine: S.Spine, Suggest: S.Suggest, Registry: S.Registry };
  }
  var ASKABLE_UNITS = ['cents', 'percent', 'rate', 'months', 'years', 'count', 'enum', 'bool', 'text'];

  /* Which item of a repeat row still lacks this value. */
  function itemMissing(row, item) {
    if (row.id === 'debtMinPayment') return !isEntered(item.minPaymentCents);
    if (row.id === 'debtRate') return !isEntered(item.rate);
    if (row.id === 'debtBalance') return !isEntered(item.balanceCents);
    if (row.id === 'assetValue') return !isEntered(item.valueCents);
    if (row.id === 'assetCharacter') return !item.taxCharacter;
    if (row.id === 'assetTier') return !item.tier;
    if (row.id === 'assetCostBasis') return !isEntered(item.costBasisCents);
    if (row.id === 'incomeType') return !item.type;
    if (row.id === 'paySurvives') return item.survivesJobLoss === null || item.survivesJobLoss === undefined;
    return false;
  }
  function isEntered(v) { return v !== null && v !== undefined && !(typeof v === 'number' && isNaN(v)); }
  /* A row marked "not sure yet" is not asked again until the month the
     person named has come, or ever, when they named none (G2.7, D-209). */
  function parked(household, key) {
    var D = deps();
    var ns = D.Schema && D.Schema.notSure ? D.Schema.notSure(household, key) : null;
    if (!ns) return false;
    if (!ns.expectedBy) return true;
    return ns.expectedBy >= D.Schema.localMonth();
  }

  function pick(household, roomId, tables, sug) {
    var D = deps();
    if (!D.LedgerRows) return null;
    var rows = D.LedgerRows.rows(household, tables, { filter: 'all' });
    var byRow = {}; (sug || []).forEach(function (s) { if (!s.na) byRow[s.key] = s; });
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.askIn !== roomId || r.kind === 'computed' || ASKABLE_UNITS.indexOf(r.unit) === -1) continue;
      var f = D.Ownership.FIELDS[r.id];
      if (!f || typeof f.write !== 'function') continue;
      if (r.repeat) {
        var items = D.LedgerRows.items(household, r) || [];
        for (var j = 0; j < items.length; j++) {
          if (itemMissing(r, items[j]) && !parked(household, r.id + ':' + items[j].id)) return { row: r, item: items[j], suggestion: byRow[r.id + ':' + items[j].id] || null };
        }
        continue;
      }
      if (r.status === 'missing' || (r.status === 'notSure' && !parked(household, r.id))) return { row: r, item: null, suggestion: byRow[r.id] || null };
    }
    return null;
  }

  /* ---- The card ------------------------------------------------------------ */
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var ENUM_LABELS = {
    healthCover: { employer: 'Through work', marketplace: 'Marketplace', cobra: 'COBRA', medicaid: 'Medicaid', parent: 'A parent’s plan', none: 'None' },
    filingStatus: { single: 'Single', married_joint: 'Married, joint', married_separate: 'Married, separate', head_of_household: 'Head of household' },
    assetCharacter: { cash: 'Cash', taxable: 'Taxable', pretax: 'Pre-tax (401k, IRA)', roth: 'Roth', hsa: 'HSA', '529': '529', daf: 'Donor-advised', property: 'Property', business: 'Business', other: 'Other', unknown: 'Not sure' },
    assetTier: { cash: 'Cash', taxable: 'Taxable', retirement: 'Retirement', property: 'Property', other: 'Other' },
    incomeType: { w2: 'W-2 job', '1099': '1099 / own work', passive: 'Passive', benefit: 'A benefit', pension: 'Pension', socialSecurity: 'Social Security', equity: 'Equity' },
    loanPlan: { standard: 'Standard', income_driven: 'Income-driven', aggressive: 'Aggressive' },
    splitMode: { equal: 'Equal halves', proportional: 'In proportion to income', pooled: 'One pool' },
    payCadence: { weekly: 'Every week', fortnightly: 'Every two weeks', semimonthly: 'Twice a month', monthly: 'Monthly', irregular: 'Irregular' },
    employmentStatus: { employed: 'Working for an employer', selfEmployed: 'Self-employed', both: 'A job and my own work', unemployed: 'Between jobs', student: 'Student', retired: 'Retired' },
    debtType: { credit_card: 'Credit card', student_loan: 'Student loan', auto: 'Car loan', mortgage: 'Mortgage', personal: 'Personal loan', medical: 'Medical', family: 'Owed to family', other: 'Other' }
  };
  function control(row, D) {
    var u = row.unit;
    if (u === 'bool') return '<div class="choices" data-ask-bool><button type="button" class="choice" data-ask-val="true">Yes</button><button type="button" class="choice" data-ask-val="false">No</button></div>';
    if (u === 'enum') {
      var vals = row.values || Object.keys(ENUM_LABELS[row.id] || {});
      var labels = ENUM_LABELS[row.id] || {};
      return '<div class="choices" data-ask-enum>' + vals.map(function (v) { return '<button type="button" class="choice" data-ask-val="' + esc(v) + '">' + esc(labels[v] || v) + '</button>'; }).join('') + '</div>';
    }
    var affix = u === 'cents' ? '$' : (u === 'percent' || u === 'rate') ? '%' : '';
    var suffix = u === 'months' ? 'months' : u === 'years' ? 'years' : '';
    var ph = u === 'cents' ? 'e.g. 1,200' : u === 'percent' ? 'e.g. 6' : u === 'rate' ? 'e.g. 24.99' : u === 'months' ? 'e.g. 6' : u === 'years' ? 'e.g. 20' : u === 'count' ? 'e.g. 2' : '';
    return '<span class="slaf-input-shell">' + (affix ? '<span class="affix">' + affix + '</span>' : '') + '<input type="text" inputmode="' + (u === 'text' ? 'text' : 'decimal') + '" placeholder="' + esc(ph) + '" data-ask-input aria-label="' + esc(row.label) + '"/>' + (suffix ? '<span class="affix">' + suffix + '</span>' : '') + '</span>'
      + unitHtml(row, D, 'data-ask-period');
  }
  /* The unit beside the box (G2.8): gross or net and the period, from the
     one reader in shared/ledger-rows.js; a period select where the row
     has a period, so an amount typed a week converts before it saves. */
  function unitHtml(row, D, attr) {
    var LR = (D || deps()).LedgerRows;
    var label = LR && LR.unitLabel ? LR.unitLabel(row) : '';
    var p = LR && LR.period ? LR.period(row) : null;
    if (!label) return '';
    if (!p) return '<span class="slaf-unit">' + esc(label) + '</span>';
    var basis = /^gross/.test(label) ? 'gross, ' : /^net/.test(label) ? 'net, ' : '';
    var words = LR.PERIOD_WORDS;
    return '<span class="slaf-unit">' + esc(basis) + '<select ' + attr + ' aria-label="Period">' + ['month', 'year', 'week', 'fortnight'].map(function (k) {
      return '<option value="' + k + '"' + (k === p ? ' selected' : '') + '>' + esc(words[k]) + '</option>'; }).join('') + '</select></span>';
  }
  /** An amount typed in another period, converted to the row's own before
      it saves (G2.8): { value, note } — note says what happened, or null. */
  function toRowPeriod(row, cents, typedPeriod, D) {
    var LR = (D || deps()).LedgerRows, M = (D || deps()).Money;
    var p = LR && LR.period ? LR.period(row) : null;
    if (!p || !typedPeriod || typedPeriod === p || !M.isEntered(cents)) return { value: cents, note: null };
    var v = M.convertPeriod(cents, typedPeriod, p);
    return { value: v, note: M.formatCents(cents) + ' ' + LR.PERIOD_WORDS[typedPeriod] + ' is ' + M.formatCents(v) + ' ' + LR.PERIOD_WORDS[p] + '.' };
  }
  /** The obvious slip on a percent box (G2.8): 4 typed as 0.04, or 24.99 as
      2499. A plain question with the readings on offer, never an error;
      null when the number reads only one way. */
  function slip(row, raw) {
    var u = row && row.unit;
    if (u !== 'percent' && u !== 'rate') return null;
    var s = String(raw === null || raw === undefined ? '' : raw).trim();
    if (s === '') return null;
    var n = Number(s.replace(/[^0-9.\-]/g, ''));
    if (isNaN(n) || n <= 0) return null;
    var whole = row.id === 'contributionPercent';                   /* stored as 6, not 0.06 */
    function pct(x) { return (Math.round(x * 100) / 100) + '%'; }
    function r6(x) { return Math.round(x * 1000000) / 1000000; }
    if (n < 1) {
      var big = n * 100;
      return { typed: s, question: 'You typed ' + s + '. Did you mean ' + pct(big) + ' or ' + pct(n) + '?',
        options: [{ label: pct(big), value: r6(whole ? big : n) }, { label: pct(n), value: r6(whole ? n : n / 100) }] };
    }
    if (n > 100) {
      var small = n / 100;
      return { typed: s, question: 'You typed ' + s + '%. Did you mean ' + pct(small) + '?',
        options: [{ label: pct(small), value: r6(whole ? small : small / 100) }, { label: 'Type it again', value: null }] };
    }
    return null;
  }
  function parse(row, raw, D) {
    D = D || deps();
    var u = row.unit, s = String(raw === null || raw === undefined ? '' : raw).trim();
    if (s === '') return null;
    if (u === 'cents') return D.Money.parseMoney(s);
    var n = Number(s.replace(/[^0-9.\-]/g, ''));
    if (isNaN(n)) return null;
    if (u === 'rate') return n > 1 ? Math.round(n * 100) / 10000 : n;           /* 24.99 → 0.2499; 0.25 stays */
    if (u === 'percent') return row.id === 'contributionPercent' ? n : (n > 1 ? Math.round(n * 100) / 10000 : n);
    return n;
  }
  function itemLabel(item) { return item ? (item.label || item.source || item.type || 'this one') : ''; }

  function mountCard(roomId, host, tables) {
    var D = deps();
    var h = D.Spine.getProfile();
    var sug = D.Suggest && D.Suggest.suggestions ? D.Suggest.suggestions(h, tables) : [];
    var p = pick(h, roomId, tables, sug);
    if (!p) return null;
    var doc = g().document;
    var card = doc.createElement('div');
    card.setAttribute('role', 'region');
    card.className = 'slaf-card slaf-ask';
    card.id = 'slaf-ask';
    card.setAttribute('data-ask-row', p.row.id);
    var q = p.item ? p.row.label + ' for ' + itemLabel(p.item) : p.row.label;
    card.innerHTML = '<span class="slaf-eyebrow">One question this room needs</span>'
      + '<p class="ask-q">' + esc(q) + '<span class="ask-why"> · unlocks ' + esc(p.row.unlocks) + '</span></p>'
      + '<div class="ask-ctl">' + control(p.row, D) + '</div>'
      + (p.suggestion ? '<button type="button" class="slaf-use-this ask-sug" data-ask-sug>Suggested ' + esc(p.suggestion.display) + ' · use it</button><span class="slaf-hint ask-how">' + esc(p.suggestion.how) + '</span>' : '')
      + '<div class="ask-slip" data-ask-slip hidden></div>'
      + '<div class="ask-acts"><button type="button" class="slaf-btn slaf-btn--primary" data-ask-save hidden>Save</button><button type="button" class="slaf-btn slaf-btn--quiet" data-ask-skip>Not now</button>'
      + '<button type="button" class="slaf-btn slaf-btn--quiet" data-ask-notsure>Not sure yet</button>'
      + '<label class="ask-memory"><input type="checkbox" data-ask-memory/> from memory</label></div>'
      + '<div class="ask-when" data-ask-when hidden><label>Expect to know by <input type="month" data-ask-expected aria-label="Expected month"/></label> <button type="button" class="slaf-btn slaf-btn--small" data-ask-notsure-save>Mark it</button></div>'
      + '<p class="slaf-hint ask-note" hidden></p>';
    var first = host.querySelector('.slaf-room-head, .room-head, header');
    if (first && first.parentNode === host) host.insertBefore(card, first.nextSibling); else host.insertBefore(card, host.firstChild);

    var ctx = p.item ? { itemId: p.item.id } : null;
    var key = p.item ? p.row.id + ':' + p.item.id : p.row.id;
    function close(text) {
      card.querySelector('.ask-note').hidden = false;
      card.querySelector('.ask-note').textContent = text;
      card.querySelector('.ask-ctl').hidden = true;
      card.querySelector('.ask-acts').hidden = true;
      card.querySelector('[data-ask-when]').hidden = true;
      card.querySelector('[data-ask-slip]').hidden = true;
      var sb = card.querySelector('[data-ask-sug]'); if (sb) sb.hidden = true;
      var hw = card.querySelector('.ask-how'); if (hw) hw.hidden = true;
      setTimeout(function () { card.hidden = true; }, 1800);
    }
    function done(value, how, note) {
      var mem = card.querySelector('[data-ask-memory]');
      if (D.Spine.tagWrite && how === 'suggested') D.Spine.tagWrite({ source: 'suggested', confidence: 'roughly' });
      else if (D.Spine.tagWrite && mem && mem.checked) D.Spine.tagWrite({ source: 'memory', confidence: 'roughly' });
      D.Ownership.write(p.row.id, value, ctx);
      close((note ? note + ' ' : '') + 'Saved. Every room that reads it has it now.');
    }
    var input = card.querySelector('[data-ask-input]');
    if (input) {
      var save = card.querySelector('[data-ask-save]');
      save.hidden = false;
      save.addEventListener('click', function () {
        var sl = slip(p.row, input.value);
        var box = card.querySelector('[data-ask-slip]');
        if (sl) {
          box.hidden = false;
          box.innerHTML = '<p class="ask-q">' + esc(sl.question) + '</p><div class="choices">' + sl.options.map(function (o, i) { return '<button type="button" class="choice" data-ask-slipopt="' + i + '">' + esc(o.label) + '</button>'; }).join('') + '</div>';
          box.onclick = function (ev) {
            var b = ev.target.closest ? ev.target.closest('[data-ask-slipopt]') : null;
            if (!b) return;
            var o = sl.options[Number(b.getAttribute('data-ask-slipopt'))];
            box.hidden = true; box.innerHTML = '';
            if (o.value === null) { input.value = ''; input.focus(); return; }
            done(o.value, 'typed');
          };
          return;
        }
        var v = parse(p.row, input.value, D);
        if (v === null) { card.querySelector('.ask-note').hidden = false; card.querySelector('.ask-note').textContent = 'A number, please.'; return; }
        var per = card.querySelector('[data-ask-period]');
        var conv = p.row.unit === 'cents' && per ? toRowPeriod(p.row, v, per.value, D) : { value: v, note: null };
        done(conv.value, 'typed', conv.note);
      });
      input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') save.click(); });
    }
    card.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-ask-val],[data-ask-sug],[data-ask-skip],[data-ask-notsure],[data-ask-notsure-save]') : null;
      if (!b) return;
      if (b.hasAttribute('data-ask-skip')) { card.hidden = true; return; }
      /* "Not sure yet" (G2.7): a mark, never a value, with the month they
         expect to know by; the card stops asking until then. */
      if (b.hasAttribute('data-ask-notsure')) { card.querySelector('[data-ask-when]').hidden = false; return; }
      if (b.hasAttribute('data-ask-notsure-save')) {
        var when = card.querySelector('[data-ask-expected]').value || null;
        D.Spine.setNotSure(key, { expectedBy: when });
        close('Marked not sure yet' + (when ? ', to look at by ' + when : '') + '. It stays blank, never zero.');
        return;
      }
      if (b.hasAttribute('data-ask-sug')) { done(p.suggestion.value, 'suggested'); return; }
      var raw = b.getAttribute('data-ask-val');
      done(p.row.unit === 'bool' ? raw === 'true' : raw, 'typed');
    });
    return card;
  }

  /* Load what this room does not carry, then the tables, then the card. */
  function needScript(name) {
    var S = g().SLAF || {};
    var map = { 'levers.js': 'Levers', 'daite.js': 'Daite', 'staleness.js': 'Staleness', 'ledger-rows.js': 'LedgerRows', 'suggest.js': 'Suggest', 'tax.js': 'Tax' };
    return !S[map[name]];
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var doc = g().document;
      var s = doc.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('could not load ' + src)); };
      doc.head.appendChild(s);
    });
  }
  /** Load what this page does not carry (the registry reader, the
      suggestion engine, their deps) and the tables they read; resolves to
      the tables, with LedgerRows in use. Shared with shared/reopen.js. */
  var ensured = null;
  function ensure() {
    if (ensured) return ensured;
    var S = g().SLAF || {};
    if (!S.Spine || !S.Ownership || !S.Reference || !S.Registry) return Promise.reject(new Error('no spine'));
    var base = (typeof location !== 'undefined' && location.pathname.indexOf('/rooms/') !== -1) ? '../' : '';
    var order = ['levers.js', 'daite.js', 'staleness.js', 'ledger-rows.js', 'suggest.js'].filter(needScript).map(function (n) { return base + 'shared/' + n; });
    if (needScript('tax.js')) order.unshift(base + 'engines/tax.js');
    var chain = Promise.resolve();
    order.forEach(function (src) { chain = chain.then(function () { return loadScript(src); }); });
    ensured = chain.then(function () {
      var S2 = g().SLAF;
      var names = ['ledgerRows', 'staleness'].concat(S2.Suggest ? S2.Suggest.TABLES : []);
      return S2.Reference.load(names).then(function (t) { S2.LedgerRows.use(t.ledgerRows); return t; });
    });
    return ensured;
  }
  function mount(roomId, host) {
    var doc = g().document;
    if (!doc || !host || doc.getElementById('slaf-ask')) return null;
    return ensure().then(function (t) { return mountCard(roomId, host, t); }).catch(function () { return null; });
  }

  return { pick: pick, parse: parse, slip: slip, toRowPeriod: toRowPeriod, unitHtml: unitHtml, parked: parked, mount: mount, ensure: ensure,
    control: function (row) { return control(row, deps()); }, esc: esc, ASKABLE_UNITS: ASKABLE_UNITS, ENUM_LABELS: ENUM_LABELS };
});
