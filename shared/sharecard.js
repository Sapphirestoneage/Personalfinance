/* ==========================================================================
   shared/sharecard.js — share progress, not balances. DECISIONS.md D-212 (H8).
   --------------------------------------------------------------------------
   A shareable card carries only ratios, percentages and time: "FI date
   moved 14 months closer", "savings rate up to 22%", "debt-free date:
   March 2028". Encoded in the URL, no dollar amount, nothing stored
   anywhere. Every card is built from a fixed list of fields; a field that
   is not on the list cannot be encoded, so a balance cannot leak in by
   accident.

     ShareCard.TYPES                  the five card types
     ShareCard.make(type, h, tables)  → { type, ok, title, line, fields } or a
                                        card with ok:false and a reason
     ShareCard.all(h, tables)         every card that can be made
     ShareCard.encode(card) / decode(str)   the URL payload (base64url JSON)
     ShareCard.link(card, base)       'rooms/progress-card.html#c=…'
     ShareCard.leaks(text, h)         every household cents value that appears
                                      in a text, for the test: must be []
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), Tier0: require('../engines/tier0.js'), Ownership: require('./ownership.js'),
      Debt: (function () { try { return require('../engines/debt.js'); } catch (e) { return null; } })(),
      Doors: (function () { try { return require('./doors.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, Ownership: S.Ownership, Debt: S.Debt, Doors: S.Doors };
  }
  var api = factory(deps);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.ShareCard = api; }
})(typeof self !== 'undefined' ? self : null, function (D) {
  'use strict';
  var Money = D.Money, Schema = D.Schema, Tier0 = D.Tier0;
  var TYPES = ['fiDate', 'savingsRate', 'debtFree', 'runway', 'understanding', 'wrapped', 'unlearn'];
  /* The only fields a card may carry. Everything is a ratio, a percent, a
     count of months or years, or a year; never cents. */
  var ALLOWED = { t: 'string', y: 'number', m: 'number', p: 'number', d: 'string', at: 'string', h: 'number', n: 'number', r: 'string', z: 'number', w: 'number' };
  function monthWord(ym) { var m = Number(String(ym).slice(5, 7)); return ['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1] + ' ' + String(ym).slice(0, 4); }
  function addMonths(ym, n) { var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n; return (y + Math.floor(m / 12)) + '-' + ('0' + ((m % 12) + 1)).slice(-2); }
  function make(type, household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    var today = Schema.localMonth();
    var card = { type: type, ok: false, title: '', line: '', fields: { t: type, at: today } };
    if (type === 'fiDate') {
      var y = Tier0.yearsToFire(h, T);
      if (!Money.isOk(y)) return Object.assign(card, { reason: y.reason });
      var year = Number(today.slice(0, 4)) + Math.ceil(y.value);
      card.fields.y = year; card.fields.m = Math.round(y.value * 12);
      /* J6: the date with its range, from the return bands (a good decade,
         a poor one), never a single point. */
      var bands = T.returnBands && T.returnBands.percentiles;
      if (bands) {
        var best = Tier0.yearsToFire(h, T, { expectedReturnRate: bands.p75 }), worst = Tier0.yearsToFire(h, T, { expectedReturnRate: bands.p25 });
        if (Money.isOk(best)) card.fields.w = Number(today.slice(0, 4)) + Math.ceil(best.value);
        if (Money.isOk(worst)) card.fields.z = Number(today.slice(0, 4)) + Math.ceil(worst.value);
      }
      var moved = o.previousYears !== undefined && o.previousYears !== null ? Math.round((o.previousYears - y.value) * 12) : null;
      if (moved !== null) card.fields.p = moved;
      card.title = y.alreadyThere ? 'Financially independent' : 'FI date: about ' + year + (card.fields.w && card.fields.z ? ' (' + card.fields.w + ' to ' + card.fields.z + ')' : '');
      card.line = moved !== null && moved !== 0 ? 'FI date moved ' + Math.abs(moved) + ' month' + (Math.abs(moved) === 1 ? '' : 's') + (moved > 0 ? ' closer' : ' further out') + '.' : 'About ' + Math.round(y.value) + ' years at the current pace.';
      card.ok = true; return card;
    }
    if (type === 'savingsRate') {
      var sr = Tier0.savingsRate(h, T);
      var r = Money.isOk(sr.includingMatch) ? sr.includingMatch : sr.excludingMatch;
      if (!Money.isOk(r)) return Object.assign(card, { reason: r.reason });
      var pct = Math.round(r.value * 100);
      card.fields.p = pct;
      if (o.previousRate !== undefined && o.previousRate !== null) card.fields.m = Math.round(o.previousRate * 100);
      card.title = 'Savings rate: ' + pct + '%';
      card.line = o.previousRate !== undefined && o.previousRate !== null ? 'Savings rate ' + (pct >= Math.round(o.previousRate * 100) ? 'up' : 'down') + ' to ' + pct + '% from ' + Math.round(o.previousRate * 100) + '%.' : pct + '% of take-home pay saved.';
      card.ok = true; return card;
    }
    if (type === 'debtFree') {
      if (!D.Debt || !T.debtRules) return Object.assign(card, { reason: 'The debt rules are not loaded.' });
      var debts = Schema.aggregatableDebts(h).filter(function (d) { return Money.isEntered(d.balanceCents) && d.balanceCents > 0; });
      if (!debts.length) return Object.assign(card, { reason: 'No debt listed.' });
      var sim = D.Debt.simulate(h, T.debtRules, { strategyId: 'avalanche' });
      if (!Money.isOk(sim)) return Object.assign(card, { reason: sim.reason });
      var when = addMonths(today, sim.months);
      card.fields.d = when; card.fields.m = sim.months;
      card.title = 'Debt-free: ' + monthWord(when);
      card.line = sim.months + ' month' + (sim.months === 1 ? '' : 's') + ' at the current pace, highest rate first.';
      card.ok = true; return card;
    }
    if (type === 'runway') {
      var ef = Tier0.emergencyFundMonths(h);
      if (!Money.isOk(ef)) return Object.assign(card, { reason: ef.reason });
      var months = Math.round(ef.value * 10) / 10;
      card.fields.m = months;
      card.title = 'Runway: ' + months + ' months';
      card.line = 'Cash covers ' + months + ' month' + (months === 1 ? '' : 's') + ' of spending.';
      card.ok = true; return card;
    }
    if (type === 'understanding') {
      if (!D.Doors || !T.ledgerRows) return Object.assign(card, { reason: 'The rows are not loaded.' });
      var u = D.Doors.understanding(h, T, [], T.confidenceWeights);
      card.fields.p = u.percent;
      card.title = u.percent + '% of the picture';
      card.line = 'I understand ' + u.percent + '% of my financial picture.';
      card.ok = true; return card;
    }
    if (type === 'wrapped') {
      /* I1: the four lines, from the year's snapshots; days, hours, a
         percent and a count. Needs opts.wrapped from engines/wrapped.js. */
      var W = o.wrapped;
      if (!W || !W.ok) return Object.assign(card, { reason: 'The year needs a snapshot from earlier in it.' });
      var byId = {}; W.lines.forEach(function (l) { byId[l.id] = l; });
      card.fields.y = W.year; card.fields.d = String(byId.freedom.value); card.fields.h = byId.priciest.value; card.fields.p = byId.earned.value; card.fields.n = byId.learned.value;
      card.title = 'Money Wrapped ' + W.year;
      card.line = W.lines.map(function (l) { return l.text; }).join(' ');
      card.ok = true; return card;
    }
    if (type === 'unlearn') {
      /* I5: the three rules most worth unlearning, by id; names only. */
      var ids = (o.unlearn || []).slice(0, 3);
      if (!ids.length) return Object.assign(card, { reason: 'Nothing to unlearn yet.' });
      card.fields.r = ids.join(',');
      card.title = 'Three rules I let go of';
      card.line = ids.map(function (id) { return RULE_NAMES[id] || id; }).join(' · ');
      card.ok = true; return card;
    }
    return Object.assign(card, { reason: 'No such card.' });
  }
  var RULE_NAMES = { four_percent: 'The 4% rule', fifty_thirty_twenty: '50/30/20', die_with_zero: 'Die With Zero', max_401k_first: 'Max your 401(k) first', six_months: 'Six months of expenses', pay_off_mortgage: 'Pay off the mortgage early', never_touch_ef: 'Never touch the emergency fund', save_ten_percent: 'Save 10%', hundred_minus_age: '100 minus your age in stocks' };
  function all(household, tables, opts) { return TYPES.filter(function (t) { return t !== 'wrapped' && t !== 'unlearn'; }).map(function (t) { return make(t, household, tables, opts); }).filter(function (c) { return c.ok; }); }
  function clean(fields) {
    var out = {};
    Object.keys(fields || {}).forEach(function (k) { if (ALLOWED[k] && typeof fields[k] === ALLOWED[k]) out[k] = fields[k]; });
    return out;
  }
  function b64(s) { return (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(s) { var t = s.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; return typeof atob === 'function' ? decodeURIComponent(escape(atob(t))) : Buffer.from(t, 'base64').toString('utf8'); }
  function encode(card) { return b64(JSON.stringify(clean(card.fields))); }
  function decode(str) {
    try { var f = clean(JSON.parse(unb64(String(str || '').replace(/^#?c=/, '')))); return f.t && TYPES.indexOf(f.t) !== -1 ? f : null; } catch (e) { return null; }
  }
  /** The card as words, from the payload alone (what the receiver sees). */
  function render(fields) {
    var f = fields || {};
    if (f.t === 'fiDate') return { title: f.y ? 'FI date: about ' + f.y + (f.w && f.z ? ' (' + f.w + ' to ' + f.z + ')' : '') : 'Financial independence', line: typeof f.p === 'number' && f.p !== 0 ? 'FI date moved ' + Math.abs(f.p) + ' month' + (Math.abs(f.p) === 1 ? '' : 's') + (f.p > 0 ? ' closer' : ' further out') + '.' : (typeof f.m === 'number' ? 'About ' + Math.round(f.m / 12) + ' years at the current pace.' : '') };
    if (f.t === 'savingsRate') return { title: 'Savings rate: ' + f.p + '%', line: typeof f.m === 'number' ? 'Savings rate ' + (f.p >= f.m ? 'up' : 'down') + ' to ' + f.p + '% from ' + f.m + '%.' : f.p + '% of take-home pay saved.' };
    if (f.t === 'debtFree') return { title: 'Debt-free: ' + (f.d ? monthWord(f.d) : 'soon'), line: typeof f.m === 'number' ? f.m + ' month' + (f.m === 1 ? '' : 's') + ' at the current pace.' : '' };
    if (f.t === 'runway') return { title: 'Runway: ' + f.m + ' months', line: 'Cash covers ' + f.m + ' month' + (f.m === 1 ? '' : 's') + ' of spending.' };
    if (f.t === 'understanding') return { title: f.p + '% of the picture', line: 'I understand ' + f.p + '% of my financial picture.' };
    if (f.t === 'wrapped') {
      var days = Number(f.d);
      return { title: 'Money Wrapped ' + (f.y || ''), line: (isNaN(days) ? '' : (days >= 0 ? days + ' days of freedom bought. ' : Math.abs(days) + ' days of freedom given back. '))
        + (typeof f.h === 'number' ? 'The priciest recurring cost took ' + f.h + ' hours of work. ' : '') + (typeof f.p === 'number' ? 'Biggest earned change: ' + (f.p >= 0 ? 'up ' : 'down ') + Math.abs(f.p) + '%. ' : '') + (typeof f.n === 'number' ? f.n + ' number' + (f.n === 1 ? '' : 's') + ' learned.' : '') };
    }
    if (f.t === 'unlearn') return { title: 'Three rules I let go of', line: String(f.r || '').split(',').filter(Boolean).map(function (id) { return RULE_NAMES[id] || id; }).join(' · ') };
    return { title: 'A progress card', line: '' };
  }
  function link(card, base) { return (base || 'rooms/progress-card.html') + '#c=' + encode(card); }
  /* For the test: every cents value the household holds (100 cents or more),
     as cents, as whole dollars and as formatted dollars; any that appears
     in the text is a leak. */
  function leaks(text, household) {
    /* A link's payload is scanned decoded, not as base64 letters. */
    var s = String(text || '').replace(/#c=([A-Za-z0-9_\-]+)/g, function (m, p) { try { return ' ' + unb64(p) + ' '; } catch (e) { return ' '; } });
    var vals = [];
    (function walk(v) {
      if (typeof v === 'number' && Math.abs(v) >= 10000 && Number.isInteger(v)) vals.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { if (k !== 'meta') walk(v[k]); });
    })(household);
    var found = [];
    vals.forEach(function (c) {
      var forms = [String(c), String(Math.round(c / 100)), Money.formatCents(c), Money.formatCents(c).replace(/^\$/, '')];
      forms.forEach(function (f) { if (f.length >= 4 && s.indexOf(f) !== -1 && found.indexOf(f) === -1) found.push(f); });
    });
    return found;
  }
  return { TYPES: TYPES, ALLOWED: ALLOWED, RULE_NAMES: RULE_NAMES, make: make, all: all, encode: encode, decode: decode, render: render, link: link, leaks: leaks, clean: clean };
});
