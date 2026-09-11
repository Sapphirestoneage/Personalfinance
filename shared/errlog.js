/* ==========================================================================
   shared/errlog.js — the local error log. DECISIONS.md D-210 (G3.16).
   --------------------------------------------------------------------------
   The first script on every page (tools/stamp-build.js puts it there), so
   an error anywhere, even in a script that never finished loading, lands
   in a small log in this browser: the last 50, no financial values (any
   run of three or more digits is blanked before it is written), and a
   friendly panel instead of a blank screen: "Something went wrong. Your
   data is safe." with a Copy bug report button. The log lives under the
   'slaf.' prefix, so the backup carries it like every other key (D-202).

     ErrLog.read()            the entries, oldest first
     ErrLog.record(kind, message, where)   append one (also used by tests)
     ErrLog.report()          the bug report text: version, build, room,
                              the last errors, the device
     ErrLog.clear()
   No dependency: it must run before anything else has loaded.
   ========================================================================== */
(function (root) {
  'use strict';
  var KEY = 'slaf.errlog.v1';
  var MAX = 50;
  function store() { return root.localStorage; }
  function read() {
    try { var raw = store().getItem(KEY); var a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function write(list) {
    try { store().setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (e) { /* storage refused: the panel still shows */ }
  }
  function clear() { try { store().removeItem(KEY); } catch (e) { /* fine */ } }
  /* No financial values in the log: a number of three or more digits, with
     or without commas and cents, becomes a hash before it is stored. */
  function scrub(s) { return String(s === null || s === undefined ? '' : s).replace(/\d[\d,]{2,}(\.\d+)?/g, '#').slice(0, 300); }
  function room() {
    try { var m = /([^\/]+)\.html$/.exec(root.location.pathname || ''); return m ? m[1] : 'index'; } catch (e) { return 'unknown'; }
  }
  function build() {
    try { var m = root.document.querySelector('meta[name="slaf-build"]'); return m ? m.getAttribute('content') : null; } catch (e) { return null; }
  }
  function device() { try { return String(root.navigator.userAgent || '').slice(0, 160); } catch (e) { return ''; } }
  function record(kind, message, where) {
    var entry = { at: new Date().toISOString(), kind: kind || 'error', room: room(), message: scrub(message), where: scrub(where), build: build() };
    var list = read();
    list.push(entry);
    write(list);
    try { panel(entry); } catch (e) { /* never let the panel be the next error */ }
    return entry;
  }
  function version() {
    try { return root.SLAF && root.SLAF.Schema && root.SLAF.Schema.APP_VERSION ? root.SLAF.Schema.APP_VERSION : null; } catch (e) { return null; }
  }
  function report() {
    var list = read().slice(-5);
    var lines = ['Money Rooms bug report', 'version: ' + (version() || 'unknown') + ' build ' + (build() || 'unknown'), 'room: ' + room(), 'device: ' + device(), 'when: ' + new Date().toISOString(), ''];
    if (!list.length) lines.push('no errors logged');
    list.forEach(function (e) { lines.push(e.at + ' [' + e.room + '] ' + e.kind + ': ' + e.message + (e.where ? ' (' + e.where + ')' : '')); });
    lines.push('', 'No amounts are in this report: numbers are blanked before they are logged.');
    return lines.join('\n');
  }
  /* The panel: one per page, plain words, buttons only. Built with
     textContent so the error text itself can never render as markup. */
  function panel(entry) {
    var doc = root.document;
    if (!doc || !doc.body) return;
    var box = doc.getElementById('slaf-error');
    if (!box) {
      box = doc.createElement('div');
      box.id = 'slaf-error';
      box.className = 'slaf-error';
      box.setAttribute('role', 'alert');
      var h = doc.createElement('b'); h.textContent = 'Something went wrong. Your data is safe.'; box.appendChild(h);
      var p = doc.createElement('p'); p.className = 'slaf-error-what'; box.appendChild(p);
      var acts = doc.createElement('div'); acts.className = 'slaf-error-acts';
      var copy = doc.createElement('button'); copy.type = 'button'; copy.className = 'slaf-btn'; copy.textContent = 'Copy bug report';
      copy.addEventListener('click', function () {
        var text = report();
        var done = function () { copy.textContent = 'Copied'; };
        try { root.navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); }); } catch (e) { fallback(text); done(); }
      });
      var reload = doc.createElement('button'); reload.type = 'button'; reload.className = 'slaf-btn slaf-btn--quiet'; reload.textContent = 'Reload';
      reload.addEventListener('click', function () { try { root.location.reload(); } catch (e) { /* fine */ } });
      var close = doc.createElement('button'); close.type = 'button'; close.className = 'slaf-btn slaf-btn--quiet'; close.textContent = 'Dismiss';
      close.addEventListener('click', function () { box.hidden = true; });
      acts.appendChild(copy); acts.appendChild(reload); acts.appendChild(close); box.appendChild(acts);
      doc.body.insertBefore(box, doc.body.firstChild);
    }
    box.hidden = false;
    box.querySelector('.slaf-error-what').textContent = 'Nothing typed was lost: it is saved in this browser as it was before. What broke: ' + entry.message + (entry.where ? ' (' + entry.where + ')' : '') + '.';
  }
  function fallback(text) {
    try {
      var ta = root.document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
      root.document.body.appendChild(ta); ta.select(); root.document.execCommand('copy'); ta.remove();
    } catch (e) { /* fine */ }
  }
  if (root.addEventListener) {
    root.addEventListener('error', function (ev) {
      var msg = ev && ev.message ? ev.message : (ev && ev.error ? String(ev.error) : 'script error');
      var where = ev && ev.filename ? String(ev.filename).replace(/^.*\//, '') + (ev.lineno ? ':' + ev.lineno : '') : '';
      record('error', msg, where);
    });
    root.addEventListener('unhandledrejection', function (ev) {
      var r = ev && ev.reason;
      record('promise', r && r.message ? r.message : String(r || 'rejected'), r && r.stack ? String(r.stack).split('\n')[1] || '' : '');
    });
  }
  root.SLAF = root.SLAF || {};
  root.SLAF.ErrLog = { read: read, record: record, report: report, clear: clear, scrub: scrub, KEY: KEY, MAX: MAX };
})(typeof self !== 'undefined' ? self : this);
