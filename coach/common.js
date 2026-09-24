/* ==========================================================================
   coach/common.js, the small pieces the three coach screens share (D-338).
   --------------------------------------------------------------------------
     CoachUI.el(id), esc(s)       the usual two
     CoachUI.guard(host)          true when Coach Mode is on; else fills host
                                  with the one screen a visitor sees here and
                                  returns false (nothing else is drawn)
     CoachUI.param(name)          a query parameter
     CoachUI.say(id, text, kind)  a status line ('good' | 'bad' | null)
     CoachUI.download(name, text, mime)
     CoachUI.readFile(input)      Promise<text> of the chosen file
     CoachUI.clientOr(id)         the roster entry, or null (never a guess)
     CoachUI.duration(ms)         '1h 05m' / '12m'
     CoachUI.day(iso)             'Sep 24, 2026'
   ========================================================================== */
(function (root) {
  'use strict';
  var SLAF = root.SLAF = root.SLAF || {};
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(root.location.search || '');
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }
  function guard(host) {
    if (SLAF.Profiles && SLAF.Profiles.coachOn()) return true;
    host.innerHTML = '<section class="slaf-card coach-off"><span class="slaf-eyebrow">Coach Mode</span>'
      + '<h1>Coach Mode is off</h1><p class="slaf-lede">These screens are for a money coach running live sessions with clients. '
      + 'Turn Coach Mode on in <a href="../rooms/settings.html#advanced">Settings</a>. Your own numbers are never touched.</p>'
      + '<p><a class="slaf-btn" href="../index.html">Back to Money Rooms</a></p></section>';
    return false;
  }
  function say(id, text, kind) {
    var n = el(id); if (!n) return;
    n.textContent = text || '';
    n.className = 'coach-say' + (kind === 'good' ? ' is-good' : kind === 'bad' ? ' is-bad' : '');
  }
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function readFile(input) {
    return new Promise(function (resolve, reject) {
      var f = input && input.files && input.files[0];
      if (!f) { reject(new Error('Choose a file first.')); return; }
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(new Error('That file did not read.')); };
      r.readAsText(f);
    });
  }
  function clientOr(id) { return id && SLAF.Coach ? SLAF.Coach.client(id) : null; }
  function duration(ms) {
    if (typeof ms !== 'number' || ms < 0) return '';
    var m = Math.round(ms / 60000), h = Math.floor(m / 60);
    return h ? h + 'h ' + ('0' + (m - h * 60)).slice(-2) + 'm' : m + 'm';
  }
  function day(iso) {
    if (!iso) return '';
    var d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  SLAF.CoachUI = { el: el, esc: esc, param: param, guard: guard, say: say, download: download, readFile: readFile, clientOr: clientOr, duration: duration, day: day };
})(typeof self !== 'undefined' ? self : this);
