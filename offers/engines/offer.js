/* ==========================================================================
   offers/engines/offer.js, where an offer stands and what it reads. OD-001.
   --------------------------------------------------------------------------
   Pure: takes the answers map (offers/shared/store.js) and the levels table
   (offers/data/levels.json), returns figures. Writes nothing, formats
   nothing but the words a reading says.

   PROGRESS (the planets and bands, the same dynamic as SPARKS' Solar
   System, shared/solar.js, but over this app's own levels):
     use(table)                     take offers/data/levels.json, once a page
     fieldApplies(field, a)         appliesWhen: { key, is | not | in }
     fieldEntered(field, a)         by kind; empty is not zero
     levelState(level, a, c)        { state: done | part | notYet, filled, of }
     planet(id, a, c)               one planet: levels, bands, done, of, band
     grid(a, c)                     six planets by four bands
     ringsCleared(a, c)             bands finished on every planet, from 1
     overall(a, c)                  { done, of, rings, planets, nextRing }
     next(a, c)                     the level to do next, and why

   READINGS (the payoffs; every one returns Money.ok(value, extra) or
   Money.incomplete(reason, missing); extra carries say, lines and chart):
     reading(id, a, opts)           by id, see READINGS below
     suggest(id, a)                 a suggested line a box may start from

   Value equation: (dream x likelihood) / (time x effort), each 1 to 10.
   Margin: (price - cost) / price. Clients needed: goal / yearly price.
   One formula, one function: each lives here once.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('../shared/money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.OFFERS = root.OFFERS || {}; root.OFFERS.Offer = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var TABLE = null;
  function use(t) { TABLE = t || null; return TABLE; }
  function table() { return TABLE; }
  function planets() { return TABLE ? TABLE.planets.slice().sort(function (x, y) { return x.order - y.order; }) : []; }
  function bands() { return TABLE ? TABLE.bands.slice() : []; }
  function levels() { return TABLE ? TABLE.levels.slice() : []; }
  function rings() { return TABLE ? TABLE.rings.slice() : []; }
  function byId(id) { var all = levels(); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function planetById(id) { var all = planets(); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function forPlanet(id) { return levels().filter(function (l) { return l.planet === id; }); }
  function fieldByKey(key) {
    var all = levels();
    for (var i = 0; i < all.length; i++) for (var j = 0; j < all[i].fields.length; j++) if (all[i].fields[j].key === key) return all[i].fields[j];
    return null;
  }
  function levelOfKey(key) {
    var all = levels();
    for (var i = 0; i < all.length; i++) for (var j = 0; j < all[i].fields.length; j++) if (all[i].fields[j].key === key) return all[i];
    return null;
  }

  /* ---- Values ---------------------------------------------------------- */
  function val(a, key) { return a && Object.prototype.hasOwnProperty.call(a, key) ? a[key] : null; }
  function num(a, key) { var v = val(a, key); return typeof v === 'number' && Number.isFinite(v) ? v : null; }
  function str(a, key) { var v = val(a, key); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; }
  function list(a, key) { var v = val(a, key); return Array.isArray(v) ? v : []; }
  function cellEntered(col, v) {
    if (v === null || v === undefined || v === '') return false;
    if (col.kind === 'money' || col.kind === 'number') return typeof v === 'number' && Number.isFinite(v);
    return true;
  }
  function rowComplete(field, row, need) {
    var cols = (field.cols || []).filter(function (c) { return !c.later && (!need || need.indexOf(c.key) >= 0) && !/optional/i.test(c.label || ''); });
    return cols.every(function (c) { return cellEntered(c, row ? row[c.key] : null); });
  }
  function fullRows(field, a, need) {
    return list(a, field.key).filter(function (r) { return rowComplete(field, r, need || field.need || null); });
  }

  function fieldApplies(f, a) {
    var w = f.appliesWhen; if (!w) return true;
    var v = val(a, w.key);
    if (Object.prototype.hasOwnProperty.call(w, 'is')) return v === w.is;
    if (Object.prototype.hasOwnProperty.call(w, 'not')) return v !== null && v !== w.not;
    if (Array.isArray(w.in)) return w.in.indexOf(v) >= 0;
    return true;
  }
  function fieldEntered(f, a, c) {
    var v = val(a, f.key);
    switch (f.kind) {
      case 'money': case 'number': case 'score': case 'pct': return typeof v === 'number' && Number.isFinite(v);
      case 'text': case 'long': case 'date': case 'choice': return typeof v === 'string' && v.trim() !== '';
      case 'multi': return Array.isArray(v) && v.length > 0;
      case 'check': return !!v && (f.items || []).every(function (it) { return v[it.id] === true; });
      case 'list': return fullRows(f, a).length >= (f.minRows || 1);
      case 'confirm': return !!(c && c[levelOfKey(f.key).id]);
      default: return v !== null && v !== undefined && v !== '';
    }
  }
  /* Part credit: a checklist with some ticks, a list with some rows. */
  function fieldStarted(f, a) {
    var v = val(a, f.key);
    if (f.kind === 'check') return !!v && Object.keys(v).some(function (k) { return v[k] === true; });
    if (f.kind === 'list') return list(a, f.key).length > 0;
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length);
  }

  function levelState(level, a, c) {
    var fields = (level.fields || []).filter(function (f) { return fieldApplies(f, a); });
    var filled = 0, started = 0;
    fields.forEach(function (f) { if (fieldEntered(f, a, c)) filled++; else if (fieldStarted(f, a)) started++; });
    var state = fields.length && filled === fields.length ? 'done' : (filled || started) ? 'part' : 'notYet';
    return { state: state, filled: filled, of: fields.length };
  }

  function planet(id, a, c) {
    var p = planetById(id); if (!p) return null;
    var lv = forPlanet(id).map(function (l) { var s = levelState(l, a, c); return { level: l, state: s.state, filled: s.filled, of: s.of }; });
    var bs = bands().map(function (b) {
      var mine = lv.filter(function (x) { return x.level.band === b.n; });
      var done = mine.filter(function (x) { return x.state === 'done'; }).length;
      return { band: b.n, name: b.name, done: done, of: mine.length, cleared: mine.length > 0 && done === mine.length, levels: mine };
    });
    var done = lv.filter(function (x) { return x.state === 'done'; }).length;
    var working = 1;
    for (var i = 0; i < bs.length; i++) { if (!bs[i].cleared) { working = bs[i].band; break; } working = bs[i].band + 1; }
    if (working > bs.length) working = bs.length;
    return { id: p.id, label: p.label, letter: p.letter, sub: p.sub, order: p.order, levels: lv, bands: bs, done: done, of: lv.length,
      pct: lv.length ? done / lv.length : 0, band: working, complete: lv.length > 0 && done === lv.length };
  }
  function grid(a, c) { return planets().map(function (p) { return planet(p.id, a, c); }); }
  function ringsCleared(a, c) {
    var g = grid(a, c), n = 0;
    for (var b = 0; b < bands().length; b++) {
      if (g.every(function (p) { return p.bands[b].cleared; })) n = b + 1; else break;
    }
    return n;
  }
  function overall(a, c) {
    var g = grid(a, c);
    var done = g.reduce(function (s, p) { return s + p.done; }, 0), of = g.reduce(function (s, p) { return s + p.of; }, 0);
    var r = ringsCleared(a, c);
    return { done: done, of: of, rings: r, planets: g, nextRing: r < bands().length ? rings()[r] : null, allRings: rings() };
  }
  /* The next level: the lowest band anyone still has open, the first planet
     in order inside it. Nothing above band 1 is suggested until every
     planet has cleared band 1 (the Solar System's rule 9, kept here). */
  function next(a, c) {
    var g = grid(a, c);
    for (var b = 0; b < bands().length; b++) {
      for (var i = 0; i < g.length; i++) {
        var open = g[i].bands[b].levels.filter(function (x) { return x.state !== 'done'; })[0];
        if (open) {
          var why = b === 0 ? 'Band 1 on every planet first: a rough sketch of the whole offer before any part goes deep.'
            : g.every(function (p) { return p.bands[b - 1].cleared; }) ? 'Every planet has cleared band ' + b + '. Band ' + (b + 1) + ' is open.'
            : 'The lowest band still open. Finish it on every planet and the ring lights.';
          return { level: open.level, planet: g[i], why: why, state: open.state };
        }
      }
    }
    return null;
  }

  /* ---- The formulas (each once) ----------------------------------------- */
  function valueScore(d, l, t, e) {
    var missing = Money.missingFrom({ dream: d, likelihood: l, time: t, effort: e });
    if (missing.length) return Money.incomplete('Four scores are needed.', missing);
    if (t * e === 0) return Money.incomplete('Time and effort must be at least 1.', []);
    return Money.ok((d * l) / (t * e), { top: d * l, bottom: t * e });
  }
  function margin(priceCents, costCents) {
    var missing = Money.missingFrom({ price: priceCents, cost: costCents });
    if (missing.length) return Money.incomplete('A price and a cost are needed.', missing);
    if (priceCents <= 0) return Money.incomplete('The price must be above zero.', []);
    return Money.ok((priceCents - costCents) / priceCents, { profitCents: priceCents - costCents });
  }
  var PER_YEAR = { once: 1, month: 12, year: 1 };
  function yearlyPrice(priceCents, period) {
    if (!Money.isEntered(priceCents) || !PER_YEAR[period]) return null;
    return priceCents * PER_YEAR[period];
  }
  function clientsNeeded(goalCents, priceCents, period) {
    var yearly = yearlyPrice(priceCents, period);
    var missing = Money.missingFrom({ goal: goalCents, yearlyPrice: yearly });
    if (missing.length) return Money.incomplete('A goal, a price and how it is charged are needed.', missing);
    if (yearly <= 0) return Money.incomplete('The price must be above zero.', []);
    return Money.ok(Math.ceil(goalCents / yearly), { yearlyCents: yearly });
  }
  function multiple(topCents, bottomCents) {
    var missing = Money.missingFrom({ top: topCents, bottom: bottomCents });
    if (missing.length) return Money.incomplete('Two figures are needed.', missing);
    if (bottomCents <= 0) return Money.incomplete('The price must be above zero.', []);
    return Money.ok(topCents / bottomCents);
  }
  function rate(part, whole) {
    var missing = Money.missingFrom({ part: part, whole: whole });
    if (missing.length) return Money.incomplete('Two counts are needed.', missing);
    if (whole <= 0) return Money.incomplete('The count must be above zero.', []);
    return Money.ok(part / whole);
  }
  function sumCents(rows, key) {
    var t = 0, n = 0;
    rows.forEach(function (r) { if (Money.isEntered(r[key])) { t += r[key]; n++; } });
    return { total: t, counted: n };
  }
  /* Trim and stack: high value, low cost is a keep; high value, high cost
     is keep some; low value is a cut, whatever it costs. */
  function trimClass(row) {
    if (row.value === 'high' && row.cost === 'low') return 'keep';
    if (row.value === 'high' && row.cost === 'high') return 'keepSome';
    if (row.value === 'low') return 'cut';
    return null;
  }
  function daysBetween(fromIso, toIso) {
    var a = new Date(fromIso.length <= 10 ? fromIso + 'T12:00:00' : fromIso), b = new Date(toIso.length <= 10 ? toIso + 'T12:00:00' : toIso);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  }
  var CONTAINERS = ['challenge', 'blueprint', 'system', 'bootcamp', 'program', 'programme', 'accelerator', 'masterclass', 'intensive', 'method', 'sprint', 'course', 'workshop', 'academy', 'formula', 'playbook'];
  var STOP = ['the', 'and', 'for', 'with', 'who', 'that', 'this', 'from', 'your', 'their', 'new', 'first', 'without', 'any'];
  function words(s) { return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3 && STOP.indexOf(w) < 0; }); }
  function magicParts(name, a) {
    var n = String(name || ''), low = n.toLowerCase();
    var interval = /\b\d+\s*(day|week|month|hour|minute)s?\b/i.test(n) || /\b(daily|weekly|monthly)\b/i.test(n);
    var container = CONTAINERS.some(function (c) { return low.indexOf(c) >= 0; });
    var whoWords = words(str(a, 'magicAvatar')).concat(words(str(a, 'nicheChosen') || str(a, 'marketWho')));
    var who = whoWords.some(function (w) { return low.indexOf(w) >= 0; });
    var goalWords = words(str(a, 'magicGoal') || str(a, 'dreamOutcome'));
    var goal = goalWords.some(function (w) { return low.indexOf(w) >= 0; });
    return { who: who, goal: goal, interval: interval, container: container, count: [who, goal, interval, container].filter(Boolean).length };
  }
  function magicNames(p) {
    var r = p.reason || '', av = p.avatar || '', g = p.goal || '', iv = p.interval || '', c = p.container || '';
    function tidy(s) { return s.replace(/\s+/g, ' ').replace(/\s([,:])/g, '$1').trim(); }
    return [
      tidy('The ' + iv + ' ' + g + ' ' + c),
      tidy('The ' + r + ' ' + g + ' ' + c + ' for ' + av),
      tidy('The ' + av + ' ' + g + ' ' + c + ': ' + iv)
    ];
  }

  /* ---- Readings ----------------------------------------------------------
     Each takes the answers and returns a Result whose extra carries:
       say     one or two sentences for the payoff card
       lines   short facts under it (optional)
       chart   a spec offers/shared/charts.js can draw (optional)
     The chart carries its own table twin: { cols, rows }. */
  var DRIVER_LABEL = { dream: 'Dream outcome', likely: 'Belief it will work', time: 'Time', effort: 'Effort or sacrifice' };
  var COMMODITY = {
    price: ['A commodity today.', 'Buyers pick on price, which is the book\'s definition of a commodity. Every planet from here is how to become the only one who does what you do.'],
    mostlyPrice: ['Mostly a commodity.', 'Trust helps a little, price decides. The Crowd and Offer planets move you off the price axis.'],
    mostlyValue: ['Mostly differentiated.', 'They buy what they get, and price comes second. The Value and Enhancers planets widen that gap.'],
    onlyMe: ['A category of one.', 'Price barely comes up. The work now is to keep it that way and charge like it.']
  };

  var READINGS = {
    commodity: function (a) {
      var k = str(a, 'commodityNow'); if (!k || !COMMODITY[k]) return Money.incomplete('Answer the commodity question.', ['commodityNow']);
      var order = ['price', 'mostlyPrice', 'mostlyValue', 'onlyMe'];
      return Money.ok(order.indexOf(k), { say: COMMODITY[k][0] + ' ' + COMMODITY[k][1],
        chart: { kind: 'scale', steps: ['Commodity', 'Mostly price', 'Mostly value', 'Only you'], at: order.indexOf(k), table: { cols: ['Where you sit'], rows: [[COMMODITY[k][0]]] } } });
    },
    marketNow: function (a) {
      var m = str(a, 'marketCore'), w = str(a, 'marketWho');
      var missing = []; if (!m) missing.push('marketCore'); if (!w) missing.push('marketWho');
      if (missing.length) return Money.incomplete('Name the market and the buyer.', missing);
      var label = { health: 'Health', wealth: 'Wealth', relationships: 'Relationships', other: 'Outside the big three' }[m];
      return Money.ok(w, { say: 'Your starting avatar is ' + w + ', in the ' + label + ' market. Band 3 narrows this to a niche worth committing to.' });
    },
    marketScore: function (a) {
      var keys = [['painScore', 'Massive pain'], ['payScore', 'Purchasing power'], ['targetScore', 'Easy to target'], ['growthScore', 'Growing']];
      var missing = keys.filter(function (k) { return num(a, k[0]) === null; }).map(function (k) { return k[0]; });
      if (missing.length) return Money.incomplete('Score all four signs.', missing);
      var items = keys.map(function (k) { return { label: k[1], value: num(a, k[0]) }; });
      var total = items.reduce(function (s, i) { return s + i.value; }, 0);
      var weakest = items.slice().sort(function (x, y) { return x.value - y.value; })[0];
      var say = total >= 16 ? 'A starving crowd: ' + total + ' of 20.' : total >= 12 ? 'A decent market: ' + total + ' of 20.' : 'A thin market: ' + total + ' of 20. The book would look for a hungrier crowd before building more.';
      return Money.ok(total, { say: say + ' The weakest sign is ' + weakest.label.toLowerCase() + ' at ' + weakest.value + '.',
        chart: { kind: 'bars', items: items, max: 5, unit: 'n', table: { cols: ['Sign', 'Score of 5'], rows: items.map(function (i) { return [i.label, i.value]; }) } } });
    },
    painQuotes: function (a) {
      var rows = fullRows(fieldByKey('painQuotes'), a);
      if (rows.length < 3) return Money.incomplete('Three lines in their words.', ['painQuotes']);
      return Money.ok(rows.length, { say: rows.length + ' lines in their words, kept for the problems list on the Offer planet.', lines: rows.map(function (r) { return '"' + r.quote + '"'; }) });
    },
    nicheLadder: function (a) {
      var rows = fullRows(fieldByKey('nicheLadder'), a);
      if (rows.length < 3) return Money.incomplete('Three rungs, each with a price.', ['nicheLadder']);
      var first = rows[0].price, last = rows[rows.length - 1].price;
      var m = multiple(last, first);
      var say = Money.isOk(m) ? 'From the broad rung to the narrowest, the price is ' + Money.formatMultiple(m.value) + ' higher for nearly the same help. That is the book\'s riches in niches.' : 'The rungs are in; the price should rise as the rung narrows.';
      return Money.ok(rows.length, { say: say, chart: { kind: 'ladder', rows: rows.map(function (r, i) { return { label: r.niche, value: r.price, n: i + 1 }; }), unit: 'cents',
        table: { cols: ['Rung', 'Who it is for', 'Price'], rows: rows.map(function (r, i) { return [i + 1, r.niche, Money.formatCents(r.price)]; }) } } });
    },
    avatar: function (a) {
      var n = str(a, 'nicheChosen'); var c = val(a, 'nicheCommit') || {};
      var f = fieldByKey('nicheCommit'); var ticked = f.items.filter(function (i) { return c[i.id] === true; }).length;
      if (!n) return Money.incomplete('Name the niche.', ['nicheChosen']);
      return Money.ok(n, { say: 'Your avatar: ' + n + '. ' + (ticked === f.items.length ? 'All four commitments ticked; every other planet is built for this person.' : ticked + ' of 4 commitments ticked so far.') });
    },
    reach: function (a) {
      var rows = fullRows(fieldByKey('channels'), a);
      if (rows.length < 2) return Money.incomplete('Two places with a count.', ['channels']);
      var total = rows.reduce(function (s, r) { return s + r.count; }, 0);
      return Money.ok(total, { say: 'About ' + total.toLocaleString('en-US') + ' people across ' + rows.length + ' places you can reach.',
        chart: { kind: 'bars', items: rows.map(function (r) { return { label: r.where, value: r.count }; }), unit: 'n', table: { cols: ['Place', 'Roughly how many'], rows: rows.map(function (r) { return [r.where, r.count]; }) } } });
    },
    crowdProven: function (a) {
      var f = fieldByKey('crowdProof'), c = val(a, 'crowdProof') || {};
      var n = f.items.filter(function (i) { return c[i.id] === true; }).length;
      if (n < f.items.length) return Money.incomplete(n + ' of ' + f.items.length + ' done.', ['crowdProof']);
      return Money.ok(n, { say: 'The crowd is proven: real people, real spending, a real trend, their real words.' });
    },

    marginNow: function (a) {
      var m = margin(num(a, 'priceNow'), num(a, 'costNow'));
      if (!Money.isOk(m)) return m;
      var say = 'You keep ' + Money.formatRate(m.value, { decimals: 0 }) + ' of every ' + Money.formatCents(num(a, 'priceNow')) + ', which is ' + Money.formatCents(m.profitCents) + '. '
        + (m.value < 0.5 ? 'Under half. The book\'s vicious cycle starts here: thin margin, thin service.' : 'A margin that can fund service, proof and marketing.');
      return Money.ok(m.value, { say: say, chart: { kind: 'stack', segments: [{ label: 'Your cost', value: num(a, 'costNow') }, { label: 'What you keep', value: m.profitCents }], unit: 'cents',
        table: { cols: ['Part', 'Amount'], rows: [['Your cost', Money.formatCents(num(a, 'costNow'))], ['What you keep', Money.formatCents(m.profitCents)]] } } });
    },
    positionNow: function (a) {
      var p = str(a, 'pricePosition'), r = num(a, 'closeRateNow');
      var missing = []; if (!p) missing.push('pricePosition'); if (r === null) missing.push('closeRateNow');
      if (missing.length) return Money.incomplete('A position and a close rate.', missing);
      var order = ['cheapest', 'below', 'middle', 'above', 'top'];
      return Money.ok(r, { say: 'You sit ' + { cheapest: 'at the very bottom of the range', below: 'below the middle', middle: 'in the middle', above: 'above the middle', top: 'at the top' }[p] + ' and close ' + Money.formatRate(r, { decimals: 0 }) + ' of pitches. Both numbers are kept for the before and after.',
        chart: { kind: 'scale', steps: ['Cheapest', 'Below', 'Middle', 'Above', 'Top'], at: order.indexOf(p), table: { cols: ['Position', 'Close rate'], rows: [[p, Money.formatRate(r, { decimals: 0 })]] } } });
    },
    cycle: function (a) {
      var down = list(a, 'cycleSigns').length, up = list(a, 'cycleGood').length;
      if (!Array.isArray(val(a, 'cycleSigns')) && !Array.isArray(val(a, 'cycleGood'))) return Money.incomplete('Tick what is true.', ['cycleSigns']);
      var which = down > up ? 'down' : up > down ? 'up' : 'mixed';
      var say = which === 'down' ? 'You are riding the vicious cycle: ' + down + ' of its six signs are true. The way out is the price, not the hours.'
        : which === 'up' ? 'You are riding the virtuous cycle: ' + up + ' of its six signs are true. Keep the price where it belongs.'
        : 'A foot in each loop. The next price move decides which one you ride.';
      return Money.ok(which, { say: say, chart: { kind: 'loop', which: which, down: down, up: up, table: { cols: ['Loop', 'Signs true of 6'], rows: [['Downward', down], ['Upward', up]] } } });
    },
    valueGapNow: function (a) { return gap(a, 'priceNow', 'today\'s price'); },
    valueGapNew: function (a) { return gap(a, 'priceNew', 'the new price'); },
    clientsNeeded: function (a) {
      var period = str(a, 'pricePeriod'), goal = num(a, 'revenueGoal');
      var oldN = clientsNeeded(goal, num(a, 'priceNow'), period), newN = clientsNeeded(goal, num(a, 'priceNew'), period);
      if (!Money.isOk(newN)) return newN;
      var mOld = margin(num(a, 'priceNow'), num(a, 'costNow')), mNew = margin(num(a, 'priceNew'), num(a, 'costNow'));
      var lines = [];
      if (Money.isOk(oldN)) lines.push('At ' + Money.formatCents(num(a, 'priceNow')) + ': ' + oldN.value + ' clients' + (Money.isOk(mOld) ? ', keeping ' + Money.formatRate(mOld.value, { decimals: 0 }) : '') + '.');
      lines.push('At ' + Money.formatCents(num(a, 'priceNew')) + ': ' + newN.value + ' clients' + (Money.isOk(mNew) ? ', keeping ' + Money.formatRate(mNew.value, { decimals: 0 }) : '') + '.');
      var say = Money.isOk(oldN) ? 'The new price needs ' + newN.value + ' clients for ' + Money.formatCents(goal) + ' a year instead of ' + oldN.value + '. Fewer people, more care each.' : 'The new price needs ' + newN.value + ' clients for ' + Money.formatCents(goal) + ' a year.';
      var base = num(a, 'priceNow') || num(a, 'priceNew');
      var pts = [];
      for (var k = 0.5; k <= 3.001; k += 0.25) { var pc = Math.round(base * k); var r = clientsNeeded(goal, pc, period); if (Money.isOk(r)) pts.push({ x: pc, y: r.value }); }
      return Money.ok(newN.value, { say: say, lines: lines, chart: { kind: 'curve', points: pts, marks: [{ label: 'Today', x: num(a, 'priceNow') }, { label: 'New', x: num(a, 'priceNew') }].filter(function (m) { return Money.isEntered(m.x); }), xUnit: 'cents', yLabel: 'Clients a year',
        table: { cols: ['Price', 'Clients needed'], rows: pts.map(function (p) { return [Money.formatCents(p.x), p.y]; }) } } });
    },
    closeRateTested: function (a) {
      var rows = fullRows(fieldByKey('priceTests'), a);
      if (rows.length < 3) return Money.incomplete('Three real answers.', ['priceTests']);
      var yes = rows.filter(function (r) { return r.said === 'yes'; }).length;
      var r = rate(yes, rows.length), old = num(a, 'closeRateNow');
      var items = [{ label: 'Close rate at the new price', value: r.value }];
      if (old !== null) items.unshift({ label: 'Close rate before', value: old });
      var say = yes + ' of ' + rows.length + ' said yes at the new price' + (old !== null ? ', against ' + Money.formatRate(old, { decimals: 0 }) + ' before.' : '.') + ' ' + (yes ? 'The number holds.' : 'No yes yet: the Offer and Enhancers planets are where the price earns its keep.');
      return Money.ok(r.value, { say: say, chart: { kind: 'bars', items: items, max: 1, unit: 'pct', table: { cols: ['Measure', 'Rate'], rows: items.map(function (i) { return [i.label, Money.formatRate(i.value, { decimals: 0 })]; }) } } });
    },
    marginNew: function (a) {
      var cost = stackCost(a); var used = cost !== null ? cost : num(a, 'costNow');
      var m = margin(num(a, 'priceNew'), used);
      if (!Money.isOk(m)) return m;
      return Money.ok(m.value, { say: 'At ' + Money.formatCents(num(a, 'priceNew')) + ' you keep ' + Money.formatRate(m.value, { decimals: 0 }) + ', ' + Money.formatCents(m.profitCents) + ' a client' + (cost !== null ? ', using the costs you put on the stack.' : ', using today\'s delivery cost.'),
        chart: { kind: 'stack', segments: [{ label: 'Your cost', value: used }, { label: 'What you keep', value: m.profitCents }], unit: 'cents',
          table: { cols: ['Part', 'Amount'], rows: [['Your cost', Money.formatCents(used)], ['What you keep', Money.formatCents(m.profitCents)]] } } });
    },

    valueNow: function (a) { return equation(a, 'Now'); },
    dream: function (a) {
      var d = str(a, 'dreamOutcome'), s = str(a, 'dreamStatus');
      var missing = []; if (!d) missing.push('dreamOutcome'); if (!s) missing.push('dreamStatus');
      if (missing.length) return Money.incomplete('The outcome and the status line.', missing);
      return Money.ok(d, { say: 'The top of the equation: ' + d + ' They get to be ' + s + '.' });
    },
    proofMix: function (a) {
      var rows = fullRows(fieldByKey('proof'), a);
      if (rows.length < 2) return Money.incomplete('Two pieces of proof.', ['proof']);
      var labels = { mine: 'Your own result', client: 'Client results', credential: 'Credentials', guarantee: 'Guarantee', sample: 'Sample or demo', numbers: 'Numbers' };
      var by = {}; rows.forEach(function (r) { by[r.kind] = (by[r.kind] || 0) + 1; });
      var items = Object.keys(labels).filter(function (k) { return by[k]; }).map(function (k) { return { label: labels[k], value: by[k] }; });
      var hasClient = !!by.client;
      return Money.ok(rows.length, { say: rows.length + ' pieces of proof. ' + (hasClient ? 'Client results are the kind that look most like the buyer.' : 'None is a client result yet; that is the kind that raises belief most.'),
        chart: { kind: 'bars', items: items, unit: 'n', table: { cols: ['Kind', 'How many'], rows: items.map(function (i) { return [i.label, i.value]; }) } } });
    },
    timeline: function (a) {
      var w = str(a, 'firstWinWhat'), d = num(a, 'firstWinDays'), f = num(a, 'fullResultWeeks');
      var missing = []; if (!w) missing.push('firstWinWhat'); if (d === null) missing.push('firstWinDays'); if (f === null) missing.push('fullResultWeeks');
      if (missing.length) return Money.incomplete('A first win, its day, and the weeks to the full result.', missing);
      var fullDays = f * 7;
      var say = 'They notice ' + w + ' in ' + d + ' day' + (d === 1 ? '' : 's') + '; the full result takes ' + f + ' week' + (f === 1 ? '' : 's') + '. ' + (d <= 7 ? 'A first win inside a week is what the book asks for.' : 'The book would look for something they can feel inside the first week.');
      return Money.ok(d, { say: say, chart: { kind: 'timeline', first: { label: w, days: d }, full: { label: 'Full result', days: fullDays }, table: { cols: ['Moment', 'Days'], rows: [[w, d], ['Full result', fullDays]] } } });
    },
    effortFixed: function (a) {
      var f = fieldByKey('sacrifices'), all = list(a, 'sacrifices').filter(function (r) { return r && r.what; }), fixed = fullRows(f, a);
      if (all.length < 3) return Money.incomplete('Three sacrifices.', ['sacrifices']);
      return Money.ok(fixed.length, { say: fixed.length + ' of ' + all.length + ' sacrifices have a fix in the offer. ' + (fixed.length === all.length ? 'The bottom of the equation is getting light.' : 'Each one without a fix is weight on the bottom of the equation.'),
        chart: { kind: 'bars', items: [{ label: 'With a fix', value: fixed.length }, { label: 'Still on them', value: all.length - fixed.length }], max: all.length, unit: 'n', table: { cols: ['Sacrifices', 'Count'], rows: [['With a fix', fixed.length], ['Still on them', all.length - fixed.length]] } } });
    },
    bottomTight: function (a) { return ticks(a, 'bottomChecks', 'The bottom of the equation is as tight as the book asks.'); },
    valueChange: function (a) {
      var before = valueScore(num(a, 'dreamNow'), num(a, 'likelyNow'), num(a, 'timeNow'), num(a, 'effortNow'));
      var after = valueScore(num(a, 'dreamNew'), num(a, 'likelyNew'), num(a, 'timeNew'), num(a, 'effortNew'));
      if (!Money.isOk(after)) return after;
      if (!Money.isOk(before)) return Money.incomplete('The first rating (Value 1) is needed for a before.', ['dreamNow']);
      var m = multiple(after.value, before.value);
      var say = after.value > before.value ? 'The value score went from ' + fmtScore(before.value) + ' to ' + fmtScore(after.value) + ', ' + Money.formatMultiple(m.value) + ' what it was.'
        : after.value === before.value ? 'The value score did not move: ' + fmtScore(after.value) + ' both times.' : 'The value score fell from ' + fmtScore(before.value) + ' to ' + fmtScore(after.value) + '. Look at the bottom of the equation.';
      var pairs = [['Dream outcome', 'dreamNow', 'dreamNew'], ['Likelihood', 'likelyNow', 'likelyNew'], ['Time delay', 'timeNow', 'timeNew'], ['Effort', 'effortNow', 'effortNew']];
      return Money.ok(after.value, { say: say, chart: { kind: 'beforeAfter', groups: pairs.map(function (p) { return { label: p[0], before: num(a, p[1]), after: num(a, p[2]) }; }), max: 10, scores: { before: before.value, after: after.value },
        table: { cols: ['Part', 'Before', 'After'], rows: pairs.map(function (p) { return [p[0], num(a, p[1]), num(a, p[2])]; }).concat([['Value score', fmtScore(before.value), fmtScore(after.value)]]) } } });
    },

    brickCount: function (a) {
      var rows = fullRows(fieldByKey('brickUses'), a);
      if (rows.length < 5) return Money.incomplete('Five uses.', ['brickUses']);
      return Money.ok(rows.length, { say: rows.length + ' uses for a brick. ' + (rows.length >= 12 ? 'Well warmed up.' : rows.length >= 8 ? 'Warmed up.' : 'Loosened; the problems list wants the same speed.'),
        chart: { kind: 'count', value: rows.length, label: 'uses in two minutes', table: { cols: ['Uses'], rows: rows.map(function (r) { return [r.use]; }) } } });
    },
    journey: function (a) {
      var rows = fullRows(fieldByKey('journeySteps'), a);
      if (rows.length < 3) return Money.incomplete('Three steps.', ['journeySteps']);
      return Money.ok(rows.length, { say: rows.length + ' steps from here to the dream outcome. Every one is a place something goes wrong, which is the next level.',
        chart: { kind: 'steps', steps: rows.map(function (r) { return r.step; }), table: { cols: ['Step'], rows: rows.map(function (r, i) { return [(i + 1) + '. ' + r.step]; }) } } });
    },
    problemsByDriver: function (a) {
      var f = fieldByKey('problems'), rows = fullRows(f, a, ['problem', 'driver']);
      if (rows.length < 8) return Money.incomplete('Eight problems, each tagged.', ['problems']);
      var by = {}; rows.forEach(function (r) { by[r.driver] = (by[r.driver] || 0) + 1; });
      var items = ['dream', 'likely', 'time', 'effort'].map(function (k) { return { label: DRIVER_LABEL[k], value: by[k] || 0 }; });
      var top = items.slice().sort(function (x, y) { return y.value - x.value; })[0];
      return Money.ok(rows.length, { say: rows.length + ' problems. Most of them hurt ' + top.label.toLowerCase() + '. ' + (top.label === 'Time' || top.label === 'Effort or sacrifice' ? 'Those become delivery pieces on the next levels.' : 'Those become proof and the guarantee.'),
        chart: { kind: 'bars', items: items, unit: 'n', table: { cols: ['Part of the equation', 'Problems'], rows: items.map(function (i) { return [i.label, i.value]; }) } } });
    },
    solutionsCount: function (a) {
      var f = fieldByKey('problems'), all = fullRows(f, a, ['problem']), done = fullRows(f, a, ['problem', 'solution']);
      if (!all.length) return Money.incomplete('The problems list is empty.', ['problems']);
      if (done.length < all.length) return Money.incomplete(done.length + ' of ' + all.length + ' problems have a solution.', ['problems']);
      return Money.ok(done.length, { say: done.length + ' solutions, one per problem. The next band decides how each is delivered and which survive.' });
    },
    trimStack: function (a) {
      var rows = fullRows(fieldByKey('vehicles'), a);
      if (rows.length < 5) return Money.incomplete('Five delivery ideas, each rated.', ['vehicles']);
      var groups = { keep: [], keepSome: [], cut: [] };
      rows.forEach(function (r, i) { var k = trimClass(r); if (k) groups[k].push({ n: i + 1, label: r.solution, value: r.value, cost: r.cost }); });
      var say = groups.keep.length + ' to keep, ' + groups.keepSome.length + ' to keep if you can afford them, ' + groups.cut.length + ' to cut. ' + (groups.cut.length ? 'Cutting is what makes room for the price.' : 'Nothing to cut; check that every value rating is honest.');
      return Money.ok(groups.keep.length + groups.keepSome.length, { say: say, groups: groups, chart: { kind: 'matrix', points: rows.map(function (r, i) { return { n: i + 1, label: r.solution, value: r.value, cost: r.cost, cls: trimClass(r) }; }),
        table: { cols: ['#', 'Idea', 'Value', 'Cost', 'Verdict'], rows: rows.map(function (r, i) { return [i + 1, r.solution, r.value, r.cost, { keep: 'Keep', keepSome: 'Keep some', cut: 'Cut' }[trimClass(r)]]; }) } } });
    },
    stackVsPrice: function (a) {
      var rows = fullRows(fieldByKey('stack'), a);
      if (rows.length < 3) return Money.incomplete('Three named, priced pieces.', ['stack']);
      var total = sumCents(rows, 'valueCents').total, price = num(a, 'priceNew') !== null ? num(a, 'priceNew') : num(a, 'priceNow');
      var m = multiple(total, price);
      var say = 'The stack adds up to ' + Money.formatCents(total) + (Money.isOk(m) ? ', ' + Money.formatMultiple(m.value) + ' the price of ' + Money.formatCents(price) + '. ' + (m.value >= 5 ? 'The book\'s kind of gap.' : m.value >= 2 ? 'A gap; the bonuses widen it.' : 'Not much of a gap yet; price the pieces as if sold alone.') : '. Put a price on the Price planet to see the gap.');
      return Money.ok(total, { say: say, chart: stackChart(rows.map(function (r) { return { label: r.name, value: r.valueCents }; }), price, 'Your price') });
    },
    feedbackCount: function (a) {
      var rows = fullRows(fieldByKey('offerFeedback'), a);
      if (rows.length < 2) return Money.incomplete('Two conversations.', ['offerFeedback']);
      return Money.ok(rows.length, { say: rows.length + ' people who could buy have heard the stack, and it changed because of them.' });
    },

    enhancerCoverage: function (a) {
      var on = list(a, 'enhancersNow');
      if (!Array.isArray(val(a, 'enhancersNow'))) return Money.incomplete('Tick what you use, or none.', ['enhancersNow']);
      var built = { scarcity: str(a, 'scarcityKind') && str(a, 'scarcityKind') !== 'none', urgency: str(a, 'urgencyKind') && str(a, 'urgencyKind') !== 'none', bonuses: fullRows(fieldByKey('bonuses'), a).length >= 1, guarantee: !!str(a, 'guaranteeText') };
      var tiles = ['scarcity', 'urgency', 'bonuses', 'guarantee'].map(function (k) { return { id: k, label: k.charAt(0).toUpperCase() + k.slice(1), on: on.indexOf(k) >= 0 || !!built[k], built: !!built[k] }; });
      var lit = tiles.filter(function (t) { return t.on; }).length;
      return Money.ok(lit, { say: lit + ' of 4 enhancers ' + (lit === 1 ? 'is' : 'are') + ' in play. ' + (lit === 4 ? 'All four, which is what the book asks for.' : 'Each dark tile is a level on this planet.'),
        chart: { kind: 'tiles', tiles: tiles, table: { cols: ['Enhancer', 'In play'], rows: tiles.map(function (t) { return [t.label, t.on ? 'yes' : 'not yet']; }) } } });
    },
    objectionsCount: function (a) {
      var rows = fullRows(fieldByKey('objections'), a);
      if (rows.length < 3) return Money.incomplete('Three worries.', ['objections']);
      return Money.ok(rows.length, { say: rows.length + ' worries, in their words. Each bonus answers one; the guarantee answers the biggest.', lines: rows.map(function (r) { return '"' + r.objection + '"'; }) });
    },
    scarcityLine: function (a) {
      var k = str(a, 'scarcityKind'), n = num(a, 'scarcityCount'), why = str(a, 'scarcityWhy');
      if (!k) return Money.incomplete('Pick a kind.', ['scarcityKind']);
      if (k === 'none') return Money.ok('none', { say: 'No scarcity yet. The book would look for a true limit: how many you can serve well each month is usually it.' });
      if (n === null) return Money.incomplete('The number.', ['scarcityCount']);
      var line = { seats: 'Only ' + n + ' places each round.', bonus: 'The bonus goes to the first ' + n + ' only.', gone: 'This version is sold ' + n + ' more times, then it goes away.' }[k];
      return Money.ok(line, { say: line + (why ? ' Because: ' + why : '') });
    },
    urgencyLine: function (a, o) {
      var k = str(a, 'urgencyKind'), d = str(a, 'urgencyDate'), why = str(a, 'urgencyWhy');
      if (!k) return Money.incomplete('Pick a kind.', ['urgencyKind']);
      if (k === 'none') return Money.ok('none', { say: 'No urgency yet. A cohort start date is the book\'s most natural kind.' });
      if (!d) return Money.incomplete('The date.', ['urgencyDate']);
      var today = (o && o.today) || new Date().toISOString().slice(0, 10);
      var days = daysBetween(today, d);
      var line = { cohort: 'The next group starts on ' + d + '.', season: 'This runs until ' + d + '.', deadline: 'The price and bonuses hold until ' + d + '.', window: 'The window closes on ' + d + '.' }[k];
      var say = line + (days !== null ? (days >= 0 ? ' That is ' + days + ' day' + (days === 1 ? '' : 's') + ' from today.' : ' That date has passed; set the next one.') : '') + (why ? ' Because: ' + why : '');
      return Money.ok(days, { say: say });
    },
    offerTotal: function (a) {
      var bonuses = fullRows(fieldByKey('bonuses'), a), stack = fullRows(fieldByKey('stack'), a);
      if (bonuses.length < 3) return Money.incomplete('Three bonuses, priced.', ['bonuses']);
      var b = sumCents(bonuses, 'valueCents').total, s = sumCents(stack, 'valueCents').total, price = num(a, 'priceNew') !== null ? num(a, 'priceNew') : num(a, 'priceNow');
      var m = multiple(s + b, price);
      var say = 'Bonuses add ' + Money.formatCents(b) + (s ? ' to a stack of ' + Money.formatCents(s) : '') + (Money.isOk(m) ? ': ' + Money.formatMultiple(m.value) + ' the price.' : '.') + ' ' + (bonuses.some(function (r) { return r.kind === 'tool' || r.kind === 'checklist'; }) ? 'At least one is a tool, as the book prefers.' : 'None is a tool or checklist yet; the book prefers those to more training.');
      var segs = (s ? [{ label: 'The stack', value: s }] : []).concat(bonuses.map(function (r) { return { label: r.name, value: r.valueCents }; }));
      return Money.ok(s + b, { say: say, chart: stackChart(segs, price, 'Your price') });
    },
    guaranteeCard: function (a) {
      var k = str(a, 'guaranteeKind'), t = str(a, 'guaranteeText');
      var missing = []; if (!k) missing.push('guaranteeKind'); if (!t) missing.push('guaranteeText');
      if (missing.length) return Money.incomplete('A kind and the words.', missing);
      var kinds = { unconditional: 'Unconditional', conditional: 'Conditional', anti: 'Anti guarantee', implied: 'Implied', stacked: 'Two stacked' };
      return Money.ok(k, { say: kinds[k] + ': "' + t + '"' + (str(a, 'guaranteeCondition') ? ' It holds when the client ' + str(a, 'guaranteeCondition') + '.' : '') });
    },
    guaranteeTested: function (a) {
      var rows = fullRows(fieldByKey('guaranteeTests'), a);
      if (rows.length < 2) return Money.incomplete('Two reactions.', ['guaranteeTests']);
      var good = rows.filter(function (r) { return r.reaction === 'closed' || r.reaction === 'helped'; }).length;
      return Money.ok(good, { say: good + ' of ' + rows.length + ' reactions were good. ' + (good === rows.length ? 'The guarantee is a keeper.' : rows.some(function (r) { return r.reaction === 'worried'; }) ? 'One worried someone: the wording or the kind is off for this crowd.' : 'It did not move everyone; try the conditional form.') });
    },

    nameNowRead: function (a) {
      var h = str(a, 'hasName');
      if (!h) return Money.incomplete('Answer.', ['hasName']);
      if (h === 'no') return Money.ok(0, { say: 'No name yet. Band 2 builds one from the five MAGIC parts.' });
      var n = str(a, 'nameNow'); if (!n) return Money.incomplete('The name.', ['nameNow']);
      var p = magicParts(n, a);
      var parts = [['who', 'who it is for'], ['goal', 'the result'], ['interval', 'how long'], ['container', 'a container word']].filter(function (x) { return p[x[0]]; }).map(function (x) { return x[1]; });
      return Money.ok(p.count, { say: '"' + n + '" carries ' + p.count + ' of the 4 MAGIC parts a reader can spot' + (parts.length ? ' (' + parts.join(', ') + ').' : '.') + ' Band 2 builds one with all five.', chart: magicTiles(p) });
    },
    oneLine: function (a) {
      var l = str(a, 'oneLine'); if (!l) return Money.incomplete('One sentence.', ['oneLine']);
      return Money.ok(l, { say: l });
    },
    magicNames: function (a) {
      var keys = ['magicReason', 'magicAvatar', 'magicGoal', 'magicInterval', 'magicContainer'];
      var missing = keys.filter(function (k) { return !str(a, k); });
      if (missing.length) return Money.incomplete('All five parts.', missing);
      var names = magicNames({ reason: str(a, 'magicReason'), avatar: str(a, 'magicAvatar'), goal: str(a, 'magicGoal'), interval: str(a, 'magicInterval'), container: str(a, 'magicContainer') });
      return Money.ok(names[0], { say: 'Three names built from your five parts. Pick one on the next level, or write your own version.', lines: names });
    },
    nameChosenRead: function (a) {
      var n = str(a, 'nameChosen'); if (!n) return Money.incomplete('A name.', ['nameChosen']);
      var p = magicParts(n, a);
      return Money.ok(n, { say: '"' + n + '" is the name on the offer sheet. ' + p.count + ' of the 4 MAGIC parts a reader can spot in it.', chart: magicTiles(p) });
    },
    namesRead: function (a) { return ticks(a, 'nameChecks', 'The name and every piece pass the book\'s naming checks.'); },
    refreshPlan: function (a) {
      var rows = fullRows(fieldByKey('wrapperRotations'), a);
      if (rows.length < 2) return Money.incomplete('Two planned refreshes.', ['wrapperRotations']);
      var labels = { name: 'the name', bonus: 'a bonus', guarantee: 'the guarantee', scarcity: 'the scarcity', urgency: 'the urgency', framing: 'the price framing' };
      return Money.ok(rows.length, { say: 'The wrapper refreshes ' + rows.length + ' times: ' + rows.map(function (r) { return labels[r.what] + ' ' + r.whenNext; }).join('; ') + '. The core stays.' });
    },
    launchRead: function (a) { return ticks(a, 'launchChecks', 'Launched. The last level reads what came back.'); },
    results: function (a) {
      var p = num(a, 'pitched'), c = num(a, 'closed'), cash = num(a, 'cashCollected');
      var missing = Money.missingFrom({ pitched: p, closed: c, cashCollected: cash });
      if (missing.length) return Money.incomplete('All three numbers.', missing);
      var r = rate(c, p); if (!Money.isOk(r)) return r;
      var per = rate(cash, p), old = num(a, 'closeRateNow');
      var items = [{ label: 'Close rate now', value: r.value }]; if (old !== null) items.unshift({ label: 'Close rate before', value: old });
      var say = c + ' of ' + p + ' said yes, ' + Money.formatRate(r.value, { decimals: 0 }) + (old !== null ? ' against ' + Money.formatRate(old, { decimals: 0 }) + ' before' : '') + '. ' + Money.formatCents(cash) + ' collected, ' + Money.formatCents(Math.round(per.value)) + ' for every pitch.';
      return Money.ok(r.value, { say: say, chart: { kind: 'bars', items: items, max: 1, unit: 'pct', table: { cols: ['Measure', 'Rate'], rows: items.map(function (i) { return [i.label, Money.formatRate(i.value, { decimals: 0 })]; }) } } });
    }
  };

  function fmtScore(v) { return (Math.round(v * 10) / 10).toString(); }
  /* The four MAGIC parts a reader can spot in a name (the magnetic reason is
     not detectable from the words alone), as four tiles. */
  function magicTiles(p) {
    var tiles = [['who', 'Avatar'], ['goal', 'Goal'], ['interval', 'Interval'], ['container', 'Container']].map(function (x) { return { id: x[0], label: x[1], on: !!p[x[0]], built: false }; });
    return { kind: 'tiles', tiles: tiles, table: { cols: ['MAGIC part', 'In the name'], rows: tiles.map(function (t) { return [t.label, t.on ? 'yes' : 'not yet']; }) } };
  }
  function gap(a, priceKey, label) {
    var m = multiple(num(a, 'outcomeWorth'), num(a, priceKey));
    if (!Money.isOk(m)) return m;
    var say = 'The outcome is worth ' + Money.formatMultiple(m.value) + ' ' + label + ' of ' + Money.formatCents(num(a, priceKey)) + '. ' + (m.value >= 10 ? 'A Grand Slam gap.' : m.value >= 3 ? 'A real gap. The stack and bonuses widen it further.' : 'A thin gap; either the price is too high for the outcome or, more likely, the outcome is worth more than you wrote.');
    var items = [{ label: 'Worth to them, a year', value: num(a, 'outcomeWorth') }, { label: 'Price', value: num(a, priceKey) }];
    return Money.ok(m.value, { say: say, chart: { kind: 'bars', items: items, unit: 'cents', table: { cols: ['Figure', 'Amount'], rows: items.map(function (i) { return [i.label, Money.formatCents(i.value)]; }) } } });
  }
  function equation(a, suffix) {
    var d = num(a, 'dream' + suffix), l = num(a, 'likely' + suffix), t = num(a, 'time' + suffix), e = num(a, 'effort' + suffix);
    var s = valueScore(d, l, t, e); if (!Money.isOk(s)) return s;
    var heavy = t * e >= 25 ? 'The bottom is heavy: time and effort are where this offer loses value.' : d * l <= 25 ? 'The top is light: a bigger promise or more proof would lift it.' : 'Both halves are working; the bottom still has room.';
    return Money.ok(s.value, { say: 'Value score ' + fmtScore(s.value) + ': top ' + s.top + ' over bottom ' + s.bottom + '. ' + heavy,
      chart: { kind: 'equation', top: [{ label: 'Dream outcome', value: d }, { label: 'Likelihood', value: l }], bottom: [{ label: 'Time delay', value: t }, { label: 'Effort', value: e }], score: s.value, max: 10,
        table: { cols: ['Part', 'Score of 10'], rows: [['Dream outcome', d], ['Likelihood', l], ['Time delay', t], ['Effort and sacrifice', e], ['Value score', fmtScore(s.value)]] } } });
  }
  function ticks(a, key, sayDone) {
    var f = fieldByKey(key), c = val(a, key) || {};
    var n = f.items.filter(function (i) { return c[i.id] === true; }).length;
    if (n < f.items.length) return Money.incomplete(n + ' of ' + f.items.length + ' ticked.', [key]);
    return Money.ok(n, { say: sayDone });
  }
  function stackCost(a) {
    var rows = fullRows(fieldByKey('stack'), a).filter(function (r) { return Money.isEntered(r.costCents); });
    if (!rows.length) return null;
    return sumCents(rows, 'costCents').total;
  }
  function stackChart(segments, priceCents, priceLabel) {
    var rows = segments.map(function (s) { return [s.label, Money.formatCents(s.value)]; });
    if (Money.isEntered(priceCents)) rows.push([priceLabel, Money.formatCents(priceCents)]);
    return { kind: 'stack', segments: segments, unit: 'cents', line: Money.isEntered(priceCents) ? { label: priceLabel, value: priceCents } : null, table: { cols: ['Piece', 'Worth'], rows: rows } };
  }

  function reading(id, a, opts) {
    var fn = READINGS[id];
    if (!fn) return Money.incomplete('No such reading: ' + id, []);
    return fn(a || {}, opts || {});
  }

  /* ---- Suggestions: a line a box may start from, never stored on its own */
  var SUGGEST = {
    oneLineSuggestion: function (a) {
      var who = str(a, 'nicheChosen') || str(a, 'marketWho'), dream = str(a, 'dreamOutcome'), w = num(a, 'fullResultWeeks'), sac = list(a, 'sacrifices').filter(function (r) { return r && r.what; })[0], g = str(a, 'guaranteeText');
      if (!who && !dream) return '';
      var s = (who || 'They') + ' get ' + (dream ? dream.replace(/\.$/, '') : 'the result') + (w !== null ? ' in ' + w + ' weeks' : '') + (sac ? ' without ' + sac.what.replace(/\.$/, '').toLowerCase() : '') + (g ? ', or ' + g.replace(/\.$/, '').charAt(0).toLowerCase() + g.replace(/\.$/, '').slice(1) : '') + '.';
      return s;
    },
    avatarShort: function (a) { return str(a, 'nicheChosen') || str(a, 'marketWho') || ''; },
    intervalShort: function (a) { var w = num(a, 'fullResultWeeks'); return w === null ? '' : (w % 4 === 0 && w >= 8 ? (w / 4) + ' Month' : w + ' Week'); },
    magicFirst: function (a) { var r = READINGS.magicNames(a); return Money.isOk(r) ? r.value : ''; }
  };
  function suggest(id, a) { var fn = SUGGEST[id]; return fn ? fn(a || {}) : ''; }

  return { use: use, table: table, planets: planets, bands: bands, levels: levels, rings: rings, byId: byId, planetById: planetById, forPlanet: forPlanet, fieldByKey: fieldByKey, levelOfKey: levelOfKey,
    fieldApplies: fieldApplies, fieldEntered: fieldEntered, fullRows: fullRows, levelState: levelState, planet: planet, grid: grid, ringsCleared: ringsCleared, overall: overall, next: next,
    valueScore: valueScore, margin: margin, yearlyPrice: yearlyPrice, clientsNeeded: clientsNeeded, multiple: multiple, rate: rate, trimClass: trimClass, daysBetween: daysBetween, magicParts: magicParts, magicNames: magicNames,
    reading: reading, READINGS: Object.keys(READINGS), suggest: suggest, DRIVER_LABEL: DRIVER_LABEL };
});
