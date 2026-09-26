/* ==========================================================================
   shared/chartbox.js, a number set with a picture around it. D-348.
   --------------------------------------------------------------------------
   The owner: "I want there to be a ton of data visualisations for each number
   set possible as well as the ability to change the type of chart and colors
   of each."

   A room hands one of these a NUMBER SET and a KIND. This draws it, puts the
   figure beside every mark, offers the chart types that are honest for that
   kind, offers eight colour orders, keeps the reader's pick on this device,
   and carries a table underneath for anyone who would rather read it.

     ChartBox.draw(host, spec)     draw or redraw into an element
     ChartBox.KINDS                the kinds, and the types each may take
     ChartBox.THEMES               the colour orders
     ChartBox.colors(id, n)        the hexes a chart is currently using

   spec:
     id        a short stable name; the reader's picks are kept under it
     kind      'breakdown' | 'compare' | 'series' | 'meter'
     title     one line saying what the picture shows (optional)
     rows      [{ label, value, note, empty, zones, marker, color }]
     format    value -> string, the app's own formatter, never a raw number
     max       an explicit top of scale (optional)
     empty     what to say when nothing can be drawn

   WHY A KIND AND NOT A TYPE. A share of a whole is honest as a ring, a bar or
   one stacked bar, and dishonest as a line. The reader picks inside the set
   that fits their number set, so no choice can turn a chart into a lie
   (docs/DESIGN.md 13).

   WHY THE COLOURS ARE NOT A WHEEL. Eight hues, eight orders of them, each
   run against this app's dark panel for contrast and for the three common
   kinds of colour blindness. A free colour picker can make a chart nobody
   can read; these cannot. Status colours (in range, watch, outside) are not
   in the palette: they stay reserved, and always ship with their word
   (docs/DESIGN.md 15).

   NOTHING IS COMPUTED HERE. Every figure comes in from an engine. This file
   only chooses a shape and a hue, and prints what it was given.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./charts.js'), null);
  } else {
    var S = root.SLAF || {};
    var api = factory(S.Charts, S.Prefs);
    root.SLAF = S;
    root.SLAF.ChartBox = api;
  }
}(typeof self !== 'undefined' ? self : this, function (Charts, Prefs) {
  'use strict';

  /* The eight hues, and the orders a reader can pick between. These are the
     dataviz reference palette's dark steps, and every order below was run
     through that skill's validator against this app's own panel (#12151B):
     lightness band, chroma floor, colour-vision separation on adjacent pairs,
     the normal-vision floor and contrast. Only orders that pass all five are
     here, which is why a reader can change the colours of any chart in the
     app and never produce one that cannot be read. The same eight are used by
     Coach Mode (CD-010), so a client sees one palette across both. */
  var HUES = {
    blue:    '#3987e5',
    orange:  '#d95926',
    aqua:    '#199e70',
    yellow:  '#c98500',
    magenta: '#d55181',
    green:   '#008300',
    violet:  '#9085e9',
    red:     '#e66767'
  };
  var THEMES = [
    { id: 'sapphire', label: 'Sapphire', order: ['blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red'] },
    { id: 'sunset',   label: 'Sunset',   order: ['orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red', 'blue'] },
    { id: 'sea',      label: 'Sea',      order: ['aqua', 'yellow', 'magenta', 'green', 'violet', 'red', 'blue', 'orange'] },
    { id: 'honey',    label: 'Honey',    order: ['yellow', 'magenta', 'green', 'violet', 'red', 'blue', 'orange', 'aqua'] },
    { id: 'berry',    label: 'Berry',    order: ['magenta', 'green', 'violet', 'red', 'blue', 'orange', 'aqua', 'yellow'] },
    { id: 'forest',   label: 'Forest',   order: ['green', 'violet', 'red', 'blue', 'orange', 'aqua', 'yellow', 'magenta'] },
    { id: 'violet',   label: 'Violet',   order: ['violet', 'red', 'blue', 'orange', 'aqua', 'yellow', 'magenta', 'green'] },
    { id: 'ember',    label: 'Ember',    order: ['red', 'violet', 'green', 'magenta', 'yellow', 'aqua', 'orange', 'blue'] }
  ];

  /* What a kind may be drawn as. Ordered: the first is the default, and it is
     the shape the dataviz rule would pick for that kind on its own. */
  var KINDS = {
    breakdown: [
      { id: 'donut',   label: 'Ring' },
      { id: 'bars',    label: 'Bars' },
      { id: 'columns', label: 'Columns' },
      { id: 'stacked', label: 'One bar' }
    ],
    compare: [
      { id: 'bars',    label: 'Bars' },
      { id: 'columns', label: 'Columns' }
    ],
    series: [
      { id: 'area',    label: 'Area' },
      { id: 'columns', label: 'Columns' },
      { id: 'bars',    label: 'Bars' }
    ],
    meter: [
      { id: 'bars',    label: 'Bullet' },
      { id: 'columns', label: 'Columns' }
    ]
  };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function themeById(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return THEMES[0];
  }
  function typesFor(kind, spec) {
    if (spec && typeof spec.render === 'function') {
      var own = { id: 'native', label: spec.shapeLabel || 'As drawn' };
      /* Offer another shape only when there are rows to build one from.
         Otherwise the reader taps "Columns" and gets an empty box, which is
         a worse chart than the one they had. */
      return rowsOf(spec).length ? [own].concat(KINDS[kind] || []) : [own];
    }
    return (KINDS[kind] || KINDS.compare).slice();
  }

  /* ---- What the reader picked, on this device ------------------------------
     A display choice, never a household fact: it rides in shared/prefs.js
     beside the other device preferences and is not exported with the numbers
     (D-173 made the same call for whose band a row reads). */
  function prefGet(id, what, fallback) {
    if (!Prefs || !Prefs.get) return fallback;
    var v = Prefs.get('chart.' + id + '.' + what, null);
    return v === null || v === undefined ? fallback : v;
  }
  function prefSet(id, what, value) {
    if (Prefs && Prefs.set) Prefs.set('chart.' + id + '.' + what, value);
  }
  function typeOf(spec) {
    var types = typesFor(spec.kind, spec);
    var want = prefGet(spec.id, 'type', null);
    for (var i = 0; i < types.length; i++) if (types[i].id === want) return want;
    return types[0].id;
  }
  function themeOf(spec) { return themeById(prefGet(spec.id, 'theme', 'sapphire')).id; }
  function tableOpen(spec) { return prefGet(spec.id, 'table', false) === true; }

  /* The hexes a chart is using: the theme's order, cycled if a set is longer
     than eight. A row that carries its own colour keeps it, because a verdict
     colour means something and a palette does not get to overrule it. */
  function colors(id, count, themeId) {
    var order = themeById(themeId || prefGet(id, 'theme', 'sapphire')).order;
    var out = [];
    for (var i = 0; i < (count || 0); i++) out.push(HUES[order[i % order.length]]);
    return out;
  }

  /* ---- Drawing -------------------------------------------------------------
     Every type here is one this app already draws (shared/charts.js), handed
     the same rows in the shape that type wants. Nothing new is invented for a
     shape: if a kind cannot be drawn honestly one way, that way is not in its
     list above. */
  /* A number set arrives in whatever shape the room already had it: rows of
     label and value, a donut's slices, or a column's parts. One list comes
     out, so the shape the reader picks is drawn from the same figures. */
  function rowsOf(spec) {
    if (spec.rows && spec.rows.length) {
      if (spec.rows.length === 1 && spec.rows[0].parts) {
        return spec.rows[0].parts.map(function (p) {
          return { label: p.label, value: p.value, color: p.color, note: p.note };
        });
      }
      return spec.rows.slice();
    }
    if (spec.slices && spec.slices.length) return spec.slices.slice();
    if (spec.columns && spec.columns.length) {
      return spec.columns.map(function (c) {
        var total = (c.parts || []).reduce(function (t, p) { return t + (typeof p.value === 'number' ? p.value : 0); }, 0);
        return { label: c.label, value: total, color: (c.parts && c.parts[0] && c.parts[0].color) || null };
      });
    }
    return [];
  }

  function paint(spec) {
    var rows = rowsOf(spec);
    /* A room that hands in its own drawing draws it, empty or not: the room
       knows what to say when there is nothing yet, and it says it better than
       this file can. The shapes below are only for a set of rows. */
    if (typeOf(spec) === 'native' && typeof spec.render === 'function') {
      return spec.render(colors(spec.id, Math.max(rows.length, spec.hues || 4), themeOf(spec)));
    }
    if (!rows.length) {
      return '<div class="slaf-chart is-empty"><p class="slaf-reason">'
        + esc(spec.empty || 'Nothing to draw yet.') + '</p></div>';
    }
    /* A ring of one slice says 100% and nothing else: it is a figure wearing
       a circle. A share of a whole needs at least two parts before it is a
       picture, and until then the room says what would make it one. */
    if (spec.kind === 'breakdown' && rows.filter(function (r) { return r.value; }).length < 2) {
      return '<div class="slaf-chart is-empty"><p class="slaf-reason">'
        + esc(spec.one || spec.empty || 'One part is all there is so far, so there is nothing to compare it with yet.')
        + '</p></div>';
    }
    var type = typeOf(spec);
    var hues = colors(spec.id, Math.max(rows.length, spec.hues || 0), themeOf(spec));
    /* A room with a picture this file has no shape for (a drawdown path, a
       week laid out in hours, a Sankey) hands in its own drawing instead; it
       is drawn above, before the empty check, because the room's own empty
       words are better than this file's. */
    /* The theme owns the colour. A row keeps its own only when the spec says
       the colours carry meaning, which is the verdict case: in range, watch
       and outside are reserved and a palette does not get to overrule them
       (docs/DESIGN.md 15). */
    var painted = rows.map(function (r, i) {
      var o = {};
      for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k];
      o.color = spec.keepColors && r.color ? r.color : hues[i];
      return o;
    });
    var format = spec.format || function (v) { return String(v); };

    if (type === 'donut') {
      /* When the figures are already shares of one, the ring's own percent
         column would print each one twice. */
      var sum = painted.reduce(function (t, r) { return t + (typeof r.value === 'number' ? r.value : 0); }, 0);
      return Charts.donut({
        slices: painted.map(function (r) { return { label: r.label, value: r.value, color: r.color, note: r.note }; }),
        format: format, center: spec.center || null, empty: spec.empty,
        showShare: !(sum > 0.98 && sum < 1.02)
      });
    }
    if (type === 'columns') {
      /* One column a row, one part in each: Charts.columns stacks parts, and
         a plain comparison is the one-part case of that. */
      return Charts.columns({
        columns: painted.map(function (r) {
          return { label: r.label, parts: [{ label: r.label, value: r.value, color: r.color }] };
        }),
        format: format, captions: false, legend: false, empty: spec.empty
      });
    }
    if (type === 'stacked') {
      return Charts.stacked({
        rows: [{ label: spec.title || 'All of it',
                 parts: painted.map(function (r) { return { label: r.label, value: r.value, color: r.color }; }) }],
        format: format, empty: spec.empty
      });
    }
    if (type === 'area') {
      /* Charts.area takes [x, y] pairs; a set with labels rather than dates
         is drawn in the order it arrived, which is what a series is. */
      return Charts.area({
        series: [{ label: spec.title || 'Over time', color: painted[0].color,
                   points: painted.map(function (r, i) { return [i, r.value === null ? 0 : r.value]; }) }],
        y: { format: format }, x: { label: spec.xLabel || '' },
        empty: spec.empty
      });
    }
    return Charts.bars({ rows: painted, format: format, max: spec.max || null, empty: spec.empty });
  }

  /* ---- The twin ------------------------------------------------------------
     Every drawing has a text equivalent (docs/DESIGN.md 21). The figure is
     already printed beside each mark; this is the whole set in one table, for
     anyone who would rather read than look, and for a screen reader following
     a header row. */
  function tableHtml(spec) {
    var format = spec.format || function (v) { return String(v); };
    var all = rowsOf(spec);
    var rows = all.map(function (r) {
      return '<tr><th scope="row">' + esc(r.label) + '</th><td>'
        + esc(r.value === null || r.value === undefined ? (r.empty || 'not yet') : format(r.value))
        + '</td>' + (all.some(function (x) { return x.note; })
          ? '<td>' + esc(r.note || '') + '</td>' : '') + '</tr>';
    }).join('');
    return '<table class="cbx-table"><caption class="slaf-sr-only">' + esc(spec.title || 'The figures behind the picture')
      + '</caption><thead><tr><th scope="col">What</th><th scope="col">How much</th>'
      + (all.some(function (x) { return x.note; }) ? '<th scope="col">Note</th>' : '')
      + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  /* ---- The controls --------------------------------------------------------
     A fold, shut at rest: a room with nine charts would otherwise carry nine
     rows of chrome before a single number. Inside: the shapes this kind can
     take, the colour orders, and the table switch. */
  function controlsHtml(spec) {
    var type = typeOf(spec), theme = themeOf(spec);
    var shapes = typesFor(spec.kind, spec).map(function (t) {
      return '<button type="button" class="cbx-chip" data-cbx-type="' + esc(t.id) + '" aria-pressed="'
        + (t.id === type ? 'true' : 'false') + '">' + esc(t.label) + '</button>';
    }).join('');
    var paints = THEMES.map(function (t) {
      var sw = t.order.slice(0, 4).map(function (h) {
        return '<i style="background:' + HUES[h] + '"></i>';
      }).join('');
      return '<button type="button" class="cbx-swatch" data-cbx-theme="' + esc(t.id) + '" aria-pressed="'
        + (t.id === theme ? 'true' : 'false') + '" title="' + esc(t.label) + '">'
        + sw + '<span>' + esc(t.label) + '</span></button>';
    }).join('');
    return '<details class="cbx-tools"' + '><summary>Change the picture</summary>'
      + '<div class="cbx-tool"><span class="cbx-tool-lbl">Shape</span><span class="cbx-chips" role="group" aria-label="Chart shape">' + shapes + '</span></div>'
      + '<div class="cbx-tool"><span class="cbx-tool-lbl">Colours</span><span class="cbx-chips" role="group" aria-label="Chart colours">' + paints + '</span></div>'
      + '<div class="cbx-tool"><span class="cbx-tool-lbl">Numbers</span><span class="cbx-chips">'
      + '<button type="button" class="cbx-chip" data-cbx-table="1" aria-pressed="' + (tableOpen(spec) ? 'true' : 'false')
      + '">Show as a table</button></span></div>'
      + '</details>';
  }

  /* ---- Mounting ------------------------------------------------------------
     The host is rebuilt on every draw, which is safe: a chart holds no live
     input, so D-034 does not apply. The tools fold keeps its open state
     across a redraw, because a reader who opened it is mid-decision. */
  var OPEN = {};
  function draw(host, spec) {
    if (!host || !spec || !spec.id) return null;
    var wasOpen = OPEN[spec.id] === true;
    var art = paint(spec);
    /* Nothing drawn yet means nothing to re-shape, recolour or tabulate: the
       controls would be four rows of chrome around one sentence. The room's
       own sentence is the whole box until there is a figure in it. */
    var bare = !rowsOf(spec).length && /is-empty/.test(art);
    host.innerHTML =
      (spec.title && !bare ? '<p class="cbx-title">' + esc(spec.title) + '</p>' : '')
      + '<div class="cbx-art">' + art + '</div>'
      + (bare ? '' : controlsHtml(spec))
      + (!bare && tableOpen(spec) ? '<div class="cbx-twin">' + tableHtml(spec) + '</div>' : '');
    host.className = (host.className || '').indexOf('cbx') > -1 ? host.className : ((host.className || '') + ' cbx').trim();
    var tools = host.querySelector('.cbx-tools');
    if (tools && wasOpen) tools.open = true;
    if (tools) tools.addEventListener('toggle', function () { OPEN[spec.id] = tools.open; });
    if (!host.__cbxWired) {
      host.__cbxWired = true;
      host.addEventListener('click', function (ev) {
        var t = ev.target.closest ? ev.target.closest('[data-cbx-type],[data-cbx-theme],[data-cbx-table]') : null;
        if (!t) return;
        var last = host.__cbxSpec || spec;
        if (t.hasAttribute('data-cbx-type')) prefSet(last.id, 'type', t.getAttribute('data-cbx-type'));
        else if (t.hasAttribute('data-cbx-theme')) prefSet(last.id, 'theme', t.getAttribute('data-cbx-theme'));
        else prefSet(last.id, 'table', !tableOpen(last));
        OPEN[last.id] = true;
        draw(host, last);
      });
    }
    host.__cbxSpec = spec;
    return host;
  }

  return {
    draw: draw, paint: paint, tableHtml: tableHtml, controlsHtml: controlsHtml,
    colors: colors, typesFor: typesFor, typeOf: typeOf, themeOf: themeOf,
    HUES: HUES, THEMES: THEMES, KINDS: KINDS
  };
}));
