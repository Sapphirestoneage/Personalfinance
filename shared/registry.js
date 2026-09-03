/* ==========================================================================
   shared/registry.js — the rooms the Map shell knows about.
   --------------------------------------------------------------------------
   `tags` drive the Map shell's filter. SPEC.md §12.6 locks the filter set to
   All / income / cashflow / debt — a room may carry other tags, but at least
   one of those three is what makes it findable.

   `subsections` are deep-link targets. EVERY id listed here must exist as a
   real element id in the room's HTML — test/run.js checks that and fails the
   build if one is missing.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Registry = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var FILTER_TAGS = ['income', 'cashflow', 'debt'];

  var ROOMS = [
    {
      id: 'financial-snapshot',
      title: 'Financial Snapshot',
      blurb: 'Ten inputs in, nine numbers out — net worth, savings rate, runway, FIRE number, and where you actually sit on the ladder.',
      href: 'rooms/financial-snapshot.html',
      tier: 0,
      tags: ['income', 'cashflow', 'debt'],
      subsections: [
        { id: 'inputs',               label: 'Your numbers' },
        { id: 'out-net-worth',        label: 'Net worth' },
        { id: 'out-savings-rate',     label: 'Savings rate' },
        { id: 'out-emergency-fund',   label: 'Emergency fund' },
        { id: 'out-dti',              label: 'Debt-to-income' },
        { id: 'out-fire',             label: 'FIRE number' },
        { id: 'out-fire-progress',    label: 'FIRE progress' },
        { id: 'out-percentile',       label: 'Net worth percentile' },
        { id: 'out-retirement',       label: 'Retirement benchmark' },
        { id: 'out-foo',              label: 'FOO placement' },
        { id: 'out-flags',            label: 'Out-of-bounds flags' }
      ]
    },
    {
      id: 'foo-ladder',
      title: 'FOO Ladder',
      blurb: 'Walk the nine steps of the Financial Order of Operations month by month, and watch the sapphire light up as each one lands.',
      href: 'rooms/foo-ladder.html',
      tier: 0,
      tags: ['cashflow', 'debt'],
      /* This room is a single-view React app with no stable section anchors
         yet. Declaring none is deliberate — see DECISIONS.md D-007. */
      subsections: []
    }
  ];

  function all() { return ROOMS.slice(); }

  function byId(id) {
    for (var i = 0; i < ROOMS.length; i++) { if (ROOMS[i].id === id) return ROOMS[i]; }
    return null;
  }

  function byTag(tag) {
    if (!tag || tag === 'all') return all();
    return ROOMS.filter(function (r) { return r.tags.indexOf(tag) !== -1; });
  }

  function total() { return ROOMS.length; }

  return {
    FILTER_TAGS: FILTER_TAGS,
    ROOMS: ROOMS,
    all: all,
    byId: byId,
    byTag: byTag,
    total: total
  };
});
