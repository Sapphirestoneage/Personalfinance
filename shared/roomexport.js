/* ==========================================================================
   shared/roomexport.js — every room, on its own, as a file you can keep.
   --------------------------------------------------------------------------
   Your Data (rooms/data.html) exports the whole household. That is the right
   thing for a backup and the wrong thing for everything else: nobody wants to
   send an accountant their entire life to ask about one figure.

   So every room can hand you just itself:

     rows(roomId, household)     what this room is reading, as label/value
     csv(roomId, household)      those rows as CSV
     json(roomId, household)     those rows plus provenance, as JSON
     mount(roomId, host)         the three buttons, in the room's footer
     provide(roomId, fn)         a room adds its OWN rows to the default set

   WHAT AN EXPORT IS ALLOWED TO CONTAIN. Only what the room already shows on
   screen. An export is not a back door to figures a room does not display —
   if a number is not in the room, it is not in the room's file.

   EMPTY IS NOT ZERO, IN THE FILE TOO. A field that is not entered exports as
   an empty cell with a `status` of `not entered`, never as 0. A spreadsheet
   that turns a blank into a zero and then averages it is exactly the harm
   this app spends its whole time avoiding, and a CSV is the easiest place in
   the world for that to happen.

   IT ALSO SAYS WHAT IT IS. Every file carries the room, the date, the app
   version, and — for anything the intake guessed rather than the person
   entering it — a `guessed` flag, because a figure's confidence has to
   survive leaving the app or the export is worse than useless.

   NOTHING LEAVES THE BROWSER. The file is built in memory and handed to the
   browser's own download. No request is made, and no service sees it.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('./money.js'),
      Registry: require('./registry.js'),
      Ownership: require('./ownership.js'),
      Schema: require('./schema.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Registry: root.SLAF && root.SLAF.Registry,
      Ownership: root.SLAF && root.SLAF.Ownership,
      Schema: root.SLAF && root.SLAF.Schema
    };
  }
  var api = factory(deps.Money, deps.Registry, deps.Ownership, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.RoomExport = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Registry, Ownership, Schema) {
  'use strict';

  /* A room may register extra rows of its own — a debt schedule, a set of
     statement lines. Keyed by room id so a page cannot leak rows into
     another room's file. */
  var extra = {};
  function provide(roomId, fn) { if (roomId && typeof fn === 'function') extra[roomId] = fn; }

  /**
   * What this room is reading, one row per figure.
   *   { label, value, cents, status, owner, guessed, section }
   *
   * `status` is 'entered', 'guessed', 'not entered' or 'not applicable' —
   * four states a spreadsheet cell cannot express on its own, which is
   * precisely why the column exists.
   */
  function rows(roomId, household) {
    var room = Registry.byId(roomId);
    if (!room) return [];
    var h = household || {};
    var guessed = (h.meta && h.meta.guessed) || {};
    var out = [];

    (room.needs || []).forEach(function (fieldId) {
      var d = Ownership.describe(fieldId, h, roomId);
      if (!d) return;
      if (!d.applies) {
        out.push({
          section: 'What this room reads', label: d.label, value: '', cents: null,
          status: 'not applicable', owner: d.ownerTitle,
          note: d.notApplicableBecause || '', guessed: false
        });
        return;
      }
      out.push({
        section: 'What this room reads',
        label: d.label,
        value: d.isSet ? String(d.display) : '',
        /* The machine-readable amount lives on the result, not on the
           describe row itself — reading a `raw` that was never there left
           the whole column blank, which is exactly the sort of silently
           empty spreadsheet cell this module exists to prevent. */
        cents: d.isSet && d.result && Money.isEntered(d.result.value) ? d.result.value : null,
        status: !d.isSet ? 'not entered' : (guessed[fieldId] || d.guessed ? 'guessed' : 'entered'),
        owner: d.ownerTitle,
        note: '',
        guessed: !!guessed[fieldId]
      });
    });

    if (extra[roomId]) {
      try {
        (extra[roomId](h) || []).forEach(function (r) {
          out.push({
            section: r.section || 'This room’s own figures',
            label: r.label, value: r.value === undefined || r.value === null ? '' : String(r.value),
            cents: Money.isEntered(r.cents) ? r.cents : null,
            status: r.status || (r.value === null || r.value === undefined ? 'not entered' : 'entered'),
            owner: r.owner || room.title, note: r.note || '', guessed: !!r.guessed
          });
        });
      } catch (e) { /* a room's own rows must never break its export */ }
    }
    return out;
  }

  function esc(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function csv(roomId, household, meta) {
    var room = Registry.byId(roomId) || { title: roomId };
    var m = meta || {};
    var head = ['# ' + room.title,
                '# exported ' + (m.on || Schema.localDay()),
                '# ' + (m.version ? 'Money Rooms v' + m.version : 'Money Rooms'),
                '# A blank value means NOT ENTERED. It does not mean zero.'];
    var cols = ['Section', 'Figure', 'Value', 'Amount (cents)', 'Status', 'Owned by', 'Note'];
    var body = rows(roomId, household).map(function (r) {
      return [r.section, r.label, r.value, r.cents === null ? '' : r.cents,
              r.status, r.owner, r.note].map(esc).join(',');
    });
    return head.join('\n') + '\n' + cols.join(',') + '\n' + body.join('\n') + '\n';
  }

  function json(roomId, household, meta) {
    var room = Registry.byId(roomId) || { title: roomId, href: '' };
    var m = meta || {};
    return JSON.stringify({
      room: { id: roomId, title: room.title, href: room.href },
      exportedOn: m.on || new Date().toISOString(),
      appVersion: m.version || null,
      note: 'A null amount means the figure was not entered. It does not mean zero.',
      rows: rows(roomId, household)
    }, null, 2);
  }

  /* ---- The control ---------------------------------------------------------
     Three buttons, no inputs, so the container can be rebuilt freely. */

  function download(name, text, mime) {
    if (typeof document === 'undefined') return;
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    /* Revoke on the next tick: Safari has not finished reading the blob when
       click() returns, and revoking immediately gives an empty file. */
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function slug(s) {
    return String(s || 'room').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function mount(roomId, host) {
    if (typeof document === 'undefined' || !host) return null;
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    var Spine = g && g.SLAF && g.SLAF.Spine;
    if (!Spine) return null;
    var room = Registry.byId(roomId);
    if (!room) return null;

    /* One folded line (D-186): the three buttons were the same furniture
       at the foot of every room, and read as something to do. */
    var box = document.createElement('details');
    box.className = 'slaf-export';
    box.innerHTML = '<summary class="slaf-export-h">Save or print this room</summary>'
      + '<div class="slaf-export-acts">'
      + '<button type="button" class="slaf-btn" data-x="csv">CSV</button>'
      + '<button type="button" class="slaf-btn" data-x="json">JSON</button>'
      + '<button type="button" class="slaf-btn" data-x="print">Print / PDF</button>'
      + '</div>'
      + '<p class="slaf-export-note">This room only; your whole household is in '
      + '<a href="' + (atRoot(roomId) ? '' : '') + 'data.html">Your Data</a>. Nothing is uploaded.</p>';
    host.appendChild(box);

    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-x]');
      if (!b) return;
      var what = b.getAttribute('data-x');
      var h = Spine.getProfile();
      var meta = { version: Schema && Schema.APP_VERSION, on: Schema.localDay() };
      var base = slug(room.title) + '-' + meta.on;
      if (what === 'csv') download(base + '.csv', csv(roomId, h, meta), 'text/csv');
      else if (what === 'json') download(base + '.json', json(roomId, h, meta), 'application/json');
      else if (what === 'print') window.print();
    });
    return box;
  }

  function atRoot(roomId) {
    var room = Registry.byId(roomId);
    return !!(room && room.href && room.href.indexOf('rooms/') !== 0);
  }

  return { rows: rows, csv: csv, json: json, mount: mount, provide: provide, _download: download };
});
