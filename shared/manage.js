/* ==========================================================================
   shared/manage.js — hide, set aside, restore: the sources panel the Income
   room and the expense log share. DECISIONS.md D-128 (7).
   --------------------------------------------------------------------------
   Two states, deliberately different:
     hidden    cosmetic. Off the default list, still counted in every total.
     archived  active = false. Stops counting toward new estimates and
               actuals from now on; a closed month that referenced it is a
               frozen record and shows it exactly as it was.
   filter() is the pure part, so test/run.js can check the three chips
   without a browser. panel() is the markup; bind() the taps; the room does
   the writes, because the room owns the records.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Manage = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var STATES = ['active', 'hidden', 'archived'];
  function stateOf(item) { return item.active === false ? 'archived' : item.hidden === true ? 'hidden' : 'active'; }
  /** The items in one of the three states. 'active' = shown and counted. */
  function filter(items, state) {
    var s = STATES.indexOf(state) >= 0 ? state : 'active';
    return (items || []).filter(function (it) { return stateOf(it) === s; });
  }
  function counts(items) {
    var out = { active: 0, hidden: 0, archived: 0 };
    (items || []).forEach(function (it) { out[stateOf(it)]++; });
    return out;
  }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /**
   * panel(items, state) — the chips and the rows for one state.
   * items: [{ id, label, meta, hidden, active }]
   */
  function panel(items, state) {
    var c = counts(items);
    var chips = STATES.map(function (s) {
      var word = s === 'active' ? 'Active' : s === 'hidden' ? 'Hidden' : 'Set aside';
      return '<button type="button" class="slaf-manage-chip" data-manage-state="' + s + '" aria-pressed="' + (s === state) + '">' + word + ' <small>' + c[s] + '</small></button>';
    }).join('');
    var rows = filter(items, state).map(function (it) {
      var acts = [];
      if (it.active === false) acts.push('<button type="button" class="slaf-manage-act" data-manage="restore" data-id="' + esc(it.id) + '">Restore</button>');
      else {
        acts.push('<button type="button" class="slaf-manage-act" data-manage="' + (it.hidden ? 'show' : 'hide') + '" data-id="' + esc(it.id) + '">' + (it.hidden ? 'Show' : 'Hide') + '</button>');
        acts.push('<button type="button" class="slaf-manage-act" data-manage="archive" data-id="' + esc(it.id) + '">Set aside</button>');
      }
      return '<li><span><b>' + esc(it.label) + '</b>' + (it.meta ? '<small>' + esc(it.meta) + '</small>' : '') + '</span><span class="slaf-manage-acts">' + acts.join('') + '</span></li>';
    }).join('') || '<li><span class="slaf-hint">Nothing ' + (state === 'active' ? 'active' : state === 'hidden' ? 'hidden' : 'set aside') + '.</span></li>';
    return '<div class="slaf-manage-chips">' + chips + '</div>'
      + '<p class="slaf-hint slaf-manage-note">' + (state === 'hidden' ? 'Hidden is cosmetic: off the list, still counted in every total.' : state === 'archived' ? 'Set aside stops counting from now on. Months already closed keep it as they were.' : 'Hide what clutters the list; set aside what is over.') + '</p>'
      + '<ul class="slaf-manage-list">' + rows + '</ul>';
  }

  /** bind(container, onChip, onAct) — once per container. */
  function bind(container, onChip, onAct) {
    if (!container || container.__manageBound) return;
    container.__manageBound = true;
    container.addEventListener('click', function (evt) {
      var chip = evt.target.closest('[data-manage-state]');
      if (chip) { onChip(chip.getAttribute('data-manage-state')); return; }
      var act = evt.target.closest('[data-manage]');
      if (act) onAct(act.getAttribute('data-manage'), act.getAttribute('data-id'));
    });
  }

  /**
   * suggestArchive(items, isMonthClosed, dismissed) — one-time items whose
   * month has closed and that nobody has answered for yet.
   */
  function suggestArchive(items, isMonthClosed, dismissed) {
    var d = dismissed || [];
    return (items || []).filter(function (it) {
      return it.active !== false && it.once === true && it.month && isMonthClosed(it.month) && d.indexOf(it.id) === -1;
    });
  }

  return { STATES: STATES, stateOf: stateOf, filter: filter, counts: counts, panel: panel, bind: bind, suggestArchive: suggestArchive };
});
