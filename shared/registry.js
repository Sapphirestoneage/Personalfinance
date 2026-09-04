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
        { id: 'out-rewards',     label: 'Rewards vs. carrying' },
        { id: 'out-timeline',    label: 'The order they fall' }
      ]
    },
    {
      id: 'net-worth',
      order: 5,
      title: 'Net Worth',
      blurb: 'Everything you own, everything you owe, and the one number underneath. The place to add a house or a car.',
      href: 'rooms/net-worth.html',
      tier: 1,
      tags: ['debt'],
      subsections: [
        { id: 'out-net-worth',  label: 'Net worth' },
        { id: 'assets',         label: 'What you own' },
        { id: 'from-elsewhere', label: 'Counted, but owned elsewhere' },
        { id: 'ledger',         label: 'The whole ledger' }
      ]
    },
    {
      id: 'savings-rate',
      order: 6,
      title: 'Savings Rate',
      blurb: 'The share of your income that stays yours \u2014 both ways of counting it, and what one more point of it is worth.',
      href: 'rooms/savings-rate.html',
      tier: 0,
      tags: ['income', 'cashflow'],
      subsections: [
        { id: 'out-rate',      label: 'Your rate' },
        { id: 'breakdown',     label: 'Where it comes from' },
        { id: 'out-benchmark', label: 'Against the benchmark' },
        { id: 'what-if',       label: 'What one more point is worth' },
        { id: 'reading',       label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'sleep-at-night',
      order: 7,
      title: 'Sleep At Night',
      blurb: 'The amount of cash that stops the 3am arithmetic \u2014 your number, beside the one the maths produces.',
      href: 'rooms/sleep-at-night.html',
      tier: 1,
      tags: ['cashflow'],
      subsections: [
        { id: 'number',        label: 'Your number' },
        { id: 'out-compare',   label: 'Yours vs. the maths' },
        { id: 'out-gap',       label: 'Getting there' },
        { id: 'milestones',    label: 'The usual milestones' },
        { id: 'reading',       label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'fire',
      order: 8,
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
      order: 9,
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
      id: 'hassle',
      order: 10,
      title: 'Worth the Hassle',
      blurb: 'What a money-saving chore actually pays per hour \u2014 against what an hour of your life already earns, and how much you hate doing it.',
      href: 'rooms/hassle.html',
      tier: 1,
      tags: ['income', 'cashflow'],
      subsections: [
        { id: 'chore',     label: 'The chore' },
        { id: 'out-rate',  label: 'What it pays an hour' },
        { id: 'out-wage',  label: 'Against an hour of your life' },
        { id: 'presets',   label: 'Common ones' },
        { id: 'reading',   label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'quick-math',
      order: 11,
      title: 'Quick Math',
      blurb: 'Four small answers: is switching savings accounts worth it, what that thing costs per use, whether you can afford the car, and the rule of five.',
      href: 'rooms/quick-math.html',
      tier: 1,
      tags: ['cashflow'],
      subsections: [
        { id: 'hysa',    label: 'Switching savings accounts' },
        { id: 'peruse',  label: 'Cost per use' },
        { id: 'car',     label: 'The 20/3/8 rule' },
        { id: 'five',    label: 'The rule of five' },
        { id: 'habit',   label: 'The $30k / $90k rule' },
        { id: 'reading', label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'self-employed',
      order: 12,
      title: 'Going Self-Employed',
      blurb: 'What a contract rate has to be to match a salary, where the 15.3% actually lands, and what to send in each quarter.',
      href: 'rooms/self-employed.html',
      tier: 1,
      tags: ['income'],
      subsections: [
        { id: 'compare',   label: 'Salary vs. contract' },
        { id: 'setax',     label: 'Self-employment tax' },
        { id: 'quarterly', label: 'Quarterly estimates' },
        { id: 'reading',   label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'side-hustle',
      order: 13,
      title: 'Side Hustle',
      blurb: 'What the second job actually pays after tax, costs and the hours it eats \u2014 and what a week looks like with it in.',
      href: 'rooms/side-hustle.html',
      tier: 2,
      tags: ['income'],
      subsections: [
        { id: 'hustle',      label: 'The hustle' },
        { id: 'out-net',     label: 'What you keep' },
        { id: 'out-vs-job',  label: 'Against the day job' },
        { id: 'out-week',    label: 'What a week becomes' },
        { id: 'reading',     label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'dashboard',
      order: 15,
      title: 'The Dashboard',
      blurb: 'Every threshold ratio as one shape, plus altitude, fuel, engine load and thrust \u2014 the whole panel at a glance.',
      href: 'rooms/dashboard.html',
      tier: 1,
      tags: ['income', 'cashflow', 'debt'],
      subsections: [
        { id: 'out-radar',    label: 'All of it at once' },
        { id: 'out-altitude', label: 'Altitude' },
        { id: 'out-fuel',     label: 'Fuel' },
        { id: 'out-load',     label: 'Engine load' },
        { id: 'out-thrust',   label: 'Thrust' },
        { id: 'out-plan',     label: 'Flight plan' },
        { id: 'reading',      label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'accounts',
      order: 17,
      title: 'Where It Goes',
      blurb: 'Roth, Traditional or taxable \u2014 and how much a Solo 401(k) actually lets you put away.',
      href: 'rooms/accounts.html',
      tier: 2,
      tags: ['income'],
      subsections: [
        { id: 'compare', label: 'Roth vs. Traditional vs. taxable' },
        { id: 'solo',    label: 'Solo 401(k)' },
        { id: 'reading', label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'values',
      order: 19,
      title: 'What Matters',
      blurb: 'The five things you say matter most, next to where the money actually went. No score \u2014 just the two lists, side by side.',
      href: 'rooms/values.html',
      tier: 2,
      tags: ['cashflow'],
      subsections: [
        { id: 'stated',      label: 'What matters to you' },
        { id: 'spending',    label: 'What the money serves' },
        { id: 'out-compare', label: 'The two lists' },
        { id: 'out-unclaimed', label: 'Serving nothing you named' },
        { id: 'reading',     label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'ratios',
      order: 14,
      title: 'Every Ratio',
      blurb: 'Thirty ratios people actually quote, computed from what you have already entered \u2014 with the two this app refuses to guess at named as such.',
      href: 'rooms/ratios.html',
      tier: 1,
      tags: ['income', 'cashflow', 'debt'],
      subsections: [
        { id: 'summary',     label: 'How many are answerable' },
        { id: 'out-lending', label: 'What a lender looks at' },
        { id: 'out-safety',  label: 'How much cushion' },
        { id: 'out-wealth',  label: 'What you own' },
        { id: 'out-blocked', label: 'What this cannot answer' },
        { id: 'reading',     label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'credential',
      order: 16,
      title: 'Worth Learning',
      blurb: 'A degree, a bootcamp or a weekend course \u2014 what it costs including the time, what the raise is worth after tax, and when it pays back.',
      href: 'rooms/credential.html',
      tier: 2,
      tags: ['income'],
      subsections: [
        { id: 'what',        label: 'What you are weighing' },
        { id: 'out-payback', label: 'When it pays back' },
        { id: 'out-value',   label: 'What it is worth today' },
        { id: 'out-hours',   label: 'Priced in hours' },
        { id: 'reading',     label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'fulfillment',
      order: 18,
      title: 'Enough',
      blurb: 'What each thing costs a month, against what it is actually worth to you \u2014 and the four places that lands.',
      href: 'rooms/fulfillment.html',
      tier: 1,
      tags: ['cashflow'],
      subsections: [
        { id: 'rate',        label: 'Rate what you spend on' },
        { id: 'out-curve',   label: 'Where it all falls' },
        { id: 'out-quadrants', label: 'The four corners' },
        { id: 'out-ranked',  label: 'Joy per dollar' },
        { id: 'reading',     label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'goals',
      order: 20,
      title: 'Goals',
      blurb: 'A wedding, a deposit, a big trip. What it costs, what it needs a month, and whether that actually fits alongside everything else.',
      href: 'rooms/goals.html',
      tier: 2,
      tags: ['cashflow'],
      subsections: [
        { id: 'out-together', label: 'All of it together' },
        { id: 'add',          label: 'Start something' }
      ]
    },
    {
      id: 'worth',
      order: 22,
      title: 'Worth It',
      blurb: 'What you thought something would be worth before you bought it, against what it turned out to be worth \u2014 and what that gap says about your own guesses.',
      href: 'rooms/worth.html',
      tier: 1,
      tags: ['cashflow'],
      subsections: [
        { id: 'things',      label: 'The things' },
        { id: 'out-each',    label: 'The arithmetic on each' },
        { id: 'out-gap',     label: 'Before against after' },
        { id: 'out-regrets', label: 'The ones you would take back' },
        { id: 'reading',     label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'windfall',
      order: 23,
      title: 'The Windfall',
      blurb: 'A bonus, an inheritance, a sale \u2014 all at once or spread out, and the exact condition under which spreading it wins.',
      href: 'rooms/windfall.html',
      tier: 1,
      tags: ['income'],
      subsections: [
        { id: 'the-money',      label: 'The decision' },
        { id: 'out-when',       label: 'When spreading it wins' },
        { id: 'out-cost',       label: 'What the caution costs' },
        { id: 'out-scenarios',  label: 'Suppose it did this instead' },
        { id: 'out-windows',    label: 'How long you take' }
      ]
    },
    {
      id: 'runway',
      order: 24,
      title: 'The Runway',
      blurb: 'The income stops and the bills don\u2019t \u2014 quitting, laid off, or starting something. How many months that is, and what would buy you more of them.',
      href: 'rooms/runway.html',
      tier: 2,
      tags: ['income', 'cashflow'],
      subsections: [
        { id: 'the-plan',    label: 'The situation' },
        { id: 'out-runway',  label: 'How long the money lasts' },
        { id: 'out-path',    label: 'The drawdown' },
        { id: 'out-fix',     label: 'What would buy you more' },
        { id: 'out-compare', label: 'The same money, three exits' },
        { id: 'reading',     label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'foo-ladder',
      order: 21,
      title: 'FOO Ladder',
      blurb: 'Walk the nine steps of the Financial Order of Operations month by month, and watch the sapphire light up as each one lands.',
      href: 'index.html',
      tier: 0,
      tags: ['cashflow', 'debt'],
      /* The FOO calculator sits at the repo root (index.html), so this href
         is relative to map.html, which also lives at the root. A
         single-view app with no stable section anchors yet; declaring none
         is deliberate — see DECISIONS.md D-007. */
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
