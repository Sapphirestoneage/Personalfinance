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
      id: 'start',
      order: 1,
      title: 'Start Here',
      blurb: 'Nine questions, one at a time, in plain English. Answer once and every other room opens already filled in.',
      href: 'rooms/start.html',
      tier: 0,
      tags: ['income', 'cashflow', 'debt'],
      subsections: [
        { id: 'q-dob',         label: 'Date of birth' },
        { id: 'q-state',       label: 'State' },
        { id: 'q-filing',      label: 'Filing status' },
        { id: 'q-income',      label: 'Gross annual income' },
        { id: 'q-expenses',    label: 'Monthly expenses' },
        { id: 'q-cash',        label: 'Cash & savings' },
        { id: 'q-investments', label: 'Investments' },
        { id: 'q-match',       label: 'Employer match' },
        { id: 'q-capturing',   label: 'Capturing the match' }
      ]
    },
    {
      id: 'financial-snapshot',
      order: 4,
      title: 'Financial Snapshot',
      blurb: 'The payoff: nine numbers read off everything you\u2019ve entered. Net worth, savings rate, runway, FIRE number, and which rung you\u2019re on.',
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
      id: 'cash-flow',
      order: 3,
      title: 'Cash Flow',
      blurb: 'Where the money actually goes, by category — measured against a budget, and against what you thought you spent.',
      href: 'rooms/cash-flow.html',
      tier: 1,
      tags: ['cashflow', 'income'],
      subsections: [
        { id: 'spending',        label: 'A typical month' },
        { id: 'out-summary',     label: 'Monthly spending' },
        { id: 'out-net-flow',    label: 'What’s left' },
        { id: 'out-template',    label: 'Against a budget' },
        { id: 'out-divergence',  label: 'Guess vs. reality' }
      ]
    },
    {
      id: 'debt-payoff',
      order: 2,
      title: 'Debt Payoff',
      blurb: 'Every debt, in the order you\u2019ll clear them — and what avalanche, snowball, or just getting the worst one gone would each cost.',
      href: 'rooms/debt-payoff.html',
      tier: 1,
      tags: ['debt'],
      subsections: [
        { id: 'debts',           label: 'What you owe' },
        { id: 'extra',           label: 'Beyond the minimums' },
        { id: 'out-plan',        label: 'Debt-free in' },
        { id: 'out-strategies',  label: 'Which order' },
        { id: 'out-timeline',    label: 'The order they fall' }
      ]
    },
    {
      id: 'fire',
      order: 5,
      title: 'FIRE Number',
      blurb: 'What you\u2019d need before work became optional \u2014 lean, standard, chubby, fat, coast or barista, from one formula.',
      href: 'rooms/fire.html',
      tier: 1,
      tags: ['income', 'cashflow'],
      subsections: [
        { id: 'reading',    label: 'What this reads' },
        { id: 'out-target', label: 'Your number' },
        { id: 'variants',   label: 'Six ways to ask it' },
        { id: 'params',     label: 'Try different assumptions' }
      ]
    },
    {
      id: 'real-hourly-wage',
      order: 6,
      title: 'Real Hourly Wage',
      blurb: 'What the job actually pays, once you count every hour it takes and everything it costs you to do it.',
      href: 'rooms/real-hourly-wage.html',
      tier: 1,
      tags: ['income'],
      subsections: [
        { id: 'reading',   label: 'What this reads' },
        { id: 'out-rate',  label: 'Your real rate' },
        { id: 'hours',     label: 'The hours it takes' },
        { id: 'out-hours', label: 'Paid vs. given' },
        { id: 'out-price', label: 'Priced in life' }
      ]
    },
    {
      id: 'foo-ladder',
      order: 7,
      title: 'FOO Ladder',
      blurb: 'Walk the nine steps of the Financial Order of Operations month by month, and watch the sapphire light up as each one lands.',
      href: 'index.html',
      tier: 0,
      tags: ['cashflow', 'debt'],
      /* The FOO calculator sits at the repo root (index.html), so this href
         is relative to map.html, which also lives at the root. A single-view
         React app with no stable section anchors yet; declaring none is
         deliberate — see DECISIONS.md D-007. */
      subsections: []
    }
  ];

  /* The path, in the order a person should walk it (SPEC.md §12.6 keeps the
     tag filter; this adds the sequence the filter sits on top of). */
  function inOrder() {
    return ROOMS.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
  }

  function all() { return inOrder(); }

  /** The next room after this one that hasn't been visited yet. */
  function nextAfter(roomId, visitedIds) {
    var path = inOrder();
    var seen = visitedIds || [];
    var from = 0;
    /* A null roomId asks for the first unvisited room anywhere on the path. */
    if (roomId) {
      for (var i = 0; i < path.length; i++) { if (path[i].id === roomId) { from = i + 1; break; } }
    }
    for (var j = from; j < path.length; j++) {
      if (seen.indexOf(path[j].id) === -1) return path[j];
    }
    return path[from] || null;
  }

  function byId(id) {
    for (var i = 0; i < ROOMS.length; i++) { if (ROOMS[i].id === id) return ROOMS[i]; }
    return null;
  }

  function byTag(tag) {
    if (!tag || tag === 'all') return all();
    return inOrder().filter(function (r) { return r.tags.indexOf(tag) !== -1; });
  }

  function total() { return ROOMS.length; }

  return {
    FILTER_TAGS: FILTER_TAGS,
    ROOMS: ROOMS,
    all: all,
    inOrder: inOrder,
    nextAfter: nextAfter,
    byId: byId,
    byTag: byTag,
    total: total
  };
});
