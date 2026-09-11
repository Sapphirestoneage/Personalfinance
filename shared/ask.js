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
          if (itemMissing(r, items[j])) return { row: r, item: items[j], suggestion: byRow[r.id + ':' + items[j].id] || null };
        }
        continue;
      }
      if (r.status === 'missing') return { row: r, item: null, suggestion: byRow[r.id] || null };
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
    payCadence: { weekly: 'Every week', fortnightly: 'Every two weeks', semimonthly: 'Twice a month', monthly: 'Monthly', irregular: 'Irregular' }
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
    return '<span class="slaf-input-shell">' + (affix ? '<span class="affix">' + affix + '</span>' : '') + '<input type="text" inputmode="' + (u === 'text' ? 'text' : 'decimal') + '" placeholder="' + esc(ph) + '" data-ask-input aria-label="' + esc(row.label) + '"/>' + (suffix ? '<span class="affix">' + suffix + '</span>' : '') + '</span>';
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
      + '<div class="ask-acts"><button type="button" class="slaf-btn slaf-btn--primary" data-ask-save hidden>Save</button><button type="button" class="slaf-btn slaf-btn--quiet" data-ask-skip>Not now</button></div>'
      + '<p class="slaf-hint ask-note" hidden></p>';
    var first = host.querySelector('.slaf-room-head, .room-head, header');
    if (first && first.parentNode === host) host.insertBefore(card, first.nextSibling); else host.insertBefore(card, host.firstChild);

    var ctx = p.item ? { itemId: p.item.id } : null;
    function done(value, how) {
      if (D.Spine.tagWrite && how === 'suggested') D.Spine.tagWrite({ source: 'suggested', confidence: 'roughly' });
      D.Ownership.write(p.row.id, value, ctx);
      card.querySelector('.ask-note').hidden = false;
      card.querySelector('.ask-note').textContent = 'Saved. Every room that reads it has it now.';
      card.querySelector('.ask-ctl').hidden = true;
      card.querySelector('.ask-acts').hidden = true;
      var sb = card.querySelector('[data-ask-sug]'); if (sb) sb.hidden = true;
      var hw = card.querySelector('.ask-how'); if (hw) hw.hidden = true;
      setTimeout(function () { card.hidden = true; }, 1800);
    }
    var input = card.querySelector('[data-ask-input]');
    if (input) {
      var save = card.querySelector('[data-ask-save]');
      save.hidden = false;
      save.addEventListener('click', function () { var v = parse(p.row, input.value, D); if (v === null) { card.querySelector('.ask-note').hidden = false; card.querySelector('.ask-note').textContent = 'A number, please.'; return; } done(v, 'typed'); });
      input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') save.click(); });
    }
    card.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-ask-val],[data-ask-sug],[data-ask-skip]') : null;
      if (!b) return;
      if (b.hasAttribute('data-ask-skip')) { card.hidden = true; return; }
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
  function mount(roomId, host) {
    var doc = g().document;
    if (!doc || !host || doc.getElementById('slaf-ask')) return null;
    var S = g().SLAF || {};
    if (!S.Spine || !S.Ownership || !S.Reference || !S.Registry) return null;
    var base = (typeof location !== 'undefined' && location.pathname.indexOf('/rooms/') !== -1) ? '../' : '';
    var order = ['levers.js', 'daite.js', 'staleness.js', 'ledger-rows.js', 'suggest.js'].filter(needScript).map(function (n) { return base + 'shared/' + n; });
    if (needScript('tax.js')) order.unshift(base + 'engines/tax.js');
    var chain = Promise.resolve();
    order.forEach(function (src) { chain = chain.then(function () { return loadScript(src); }); });
    return chain.then(function () {
      var S2 = g().SLAF;
      var names = ['ledgerRows', 'staleness'].concat(S2.Suggest ? S2.Suggest.TABLES : []);
      return S2.Reference.load(names).then(function (t) {
        S2.LedgerRows.use(t.ledgerRows);
        return mountCard(roomId, host, t);
      });
    }).catch(function () { return null; });
  }

  return { pick: pick, parse: parse, mount: mount, ASKABLE_UNITS: ASKABLE_UNITS };
});
