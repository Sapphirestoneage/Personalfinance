/* ==========================================================================
   shared/size.js — the page's size, before anything is drawn. D-307.
   --------------------------------------------------------------------------
   The owner, on a phone: "how do I make things get smaller". Every box is
   a tap target and every card has room to breathe, which on a large phone
   font reads as everything being big. Settings has a switch, Comfortable
   or Compact; this reads it and marks the page before the first paint, so
   a compact page never flashes large. The second script on every Money
   Rooms page, right after errlog.js (tools/stamp-build.js puts it there).
   It reads the preference straight from storage because shared/prefs.js
   loads at the end of the page, long after the first paint.

   Compact is one rule in shared/theme.css: html.is-compact { zoom }. The
   whole page scales, so a 44px tap target becomes 38px and stays above the
   32px floor (D-136), and no room needs a second set of sizes.
   ========================================================================== */
(function () {
  'use strict';
  try {
    var raw = typeof localStorage !== 'undefined' ? localStorage.getItem('slaf.prefs.v1') : null;
    var prefs = raw ? JSON.parse(raw) : null;
    if (prefs && prefs.size === 'compact' && typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.classList.add('is-compact');
    }
  } catch (e) { /* no storage, or none yet: comfortable */ }
})();
