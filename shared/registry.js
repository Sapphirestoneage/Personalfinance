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
      kind: 'core',
      needs: ['employmentStatus', 'unemployment', 'dob', 'state', 'filingStatus', 'grossAnnualIncome', 'monthlyExpenses', 'cashSavings', 'investments',
              'employerMatch', 'contributionPercent', 'capturingFullMatch', 'highestDeductible', 'hasDebt'],
      order: 1,
      title: 'Start Here',
      blurb: 'One page. Say your situation, fix the guesses that are wrong, and get a dashboard back. Every other room opens already filled in.',
      href: 'rooms/start.html',
      tier: 0,
      tags: ['income', 'cashflow', 'debt'],
      subsections: [
        { id: 'q-employment',  label: 'Your situation' },
        { id: 'q-about',       label: 'About you' },
        { id: 'q-income',      label: 'What you earn' },
        { id: 'q-own-work',    label: 'Your own work' },
        { id: 'q-unemployed',  label: 'Between jobs' },
        { id: 'q-partner',     label: 'The other of you' },
        { id: 'q-expenses',    label: 'What goes out' },
        { id: 'q-cash',        label: 'Cash and the deductible' },
        { id: 'q-investments', label: 'Investments' },
        { id: 'q-plan',        label: 'Your 401(k)' },
        { id: 'q-debt',        label: 'What you owe' },
        { id: 'q-fine-tune',   label: 'Fine-tune' },
        { id: 'q-import',      label: 'Paste numbers in' }
      ]
    },
    {
      id: 'financial-snapshot',
      kind: 'read',
      needs: ['grossAnnualIncome', 'monthlyExpenses', 'cashSavings', 'investments', 'totalDebt', 'dob', 'filingStatus'],
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
        { id: 'out-benchmarks',       label: 'Three benchmarks' },
        { id: 'out-foo',              label: 'FOO placement' },
        { id: 'out-flags',            label: 'Out-of-bounds flags' }
      ]
    },
    {
      id: 'income',
      kind: 'about-you',
      needs: [],
      order: 3.2,
      title: 'Income',
      blurb: 'Everything coming in, logged as it lands — a paycheque, a gig, a gift, a dividend, the rent — each netted the way it is actually taxed.',
      href: 'rooms/income.html',
      tier: 1,
      tags: ['income'],
      subsections: [
        { id: 'month', label: 'This month' },
        { id: 'log',   label: 'Every entry' },
        { id: 'add',   label: 'Add an entry' },
        { id: 'costs', label: 'The costs of earning it' }
      ]
    },
    {
      id: 'cash-flow',
      kind: 'core',
      needs: ['monthlyExpenses'],
      order: 3,
      title: 'Cash Flow',
      blurb: 'Where the money actually goes, by category — measured against a budget, and against what you thought you spent.',
      href: 'rooms/cash-flow.html',
      tier: 1,
      tags: ['cashflow', 'income'],
      subsections: [
        { id: 'glance',          label: 'At a glance' },
        { id: 'spending',        label: 'A typical month' },
        { id: 'log',             label: 'The expense log' },
        { id: 'out-summary',     label: 'Monthly spending' },
        { id: 'out-net-flow',    label: 'What’s left' },
        { id: 'out-template',    label: 'Against a budget' },
        { id: 'out-divergence',  label: 'Guess vs. reality' }
      ]
    },
    {
      id: 'debt-payoff',
      kind: 'core',
      needs: ['totalDebt', 'monthlyDebtPayments'],
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
      id: 'statement',
      kind: 'core',
      needs: ['cashSavings', 'investments', 'totalDebt'],
      order: 5,
      title: 'The Statement',
      blurb: 'Everything you own in three portfolios, how sure you are of each, how fast you could reach it — and the one number underneath. The place to add a house or a car.',
      href: 'rooms/statement.html',
      tier: 1,
      tags: ['debt'],
      /* Replaces Net Worth (D-069); rooms/net-worth.html redirects here. */
      subsections: [
        { id: 'portfolios', label: 'Three portfolios' },
        { id: 'assets',     label: 'Rate what you own' },
        { id: 'ladder',     label: 'The liquidity ladder' },
        { id: 'bridge',     label: 'The bridge to 59½' },
        { id: 'brackets',   label: 'Your bracket' },
        { id: 'worst-year', label: 'The worst plausible year' },
        { id: 'future',     label: 'Money that is coming' },
        { id: 'reading',    label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'savings-rate',
      kind: 'read',
      needs: ['grossAnnualIncome', 'monthlyExpenses'],
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
      kind: 'about-you',
      needs: ['monthlyExpenses', 'cashSavings'],
      order: 7,
      title: 'Sleep At Night',
      blurb: 'The amount of cash that stops the 3am arithmetic \u2014 your number, beside the one the maths produces.',
      href: 'rooms/sleep-at-night.html',
      tier: 1,
      tags: ['cashflow'],
      subsections: [
        { id: 'number',        label: 'Your number' },
        { id: 'deductible',    label: 'Your highest deductible' },
        { id: 'coverage',      label: 'Coverage checkup' },
        { id: 'out-compare',   label: 'Yours vs. the maths' },
        { id: 'out-gap',       label: 'Getting there' },
        { id: 'milestones',    label: 'The usual milestones' },
        { id: 'reading',       label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'fire',
      kind: 'read',
      needs: ['monthlyExpenses', 'investments', 'dob'],
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
        { id: 'targets',    label: 'Your targets' },
        { id: 'params',     label: 'Try different assumptions' }
      ]
    },
    {
      id: 'real-hourly-wage',
      kind: 'about-you',
      needs: ['grossAnnualIncome'],
      order: 9,
      title: 'Real Hourly Wage',
      blurb: 'What the job actually pays, once you count every hour it takes and everything it costs you to do it.',
      href: 'rooms/real-hourly-wage.html',
      tier: 1,
      tags: ['income'],
      /* The template room (D-097): the same six ids every room on the
         template has, so a deep link means the same thing everywhere. */
      subsections: [
        { id: 'number',      label: 'Your real rate' },
        { id: 'chart',       label: 'Where the week goes' },
        { id: 'inputs',      label: 'The hours it takes' },
        { id: 'amounts',     label: 'Priced in life' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
    },
    {
      id: 'hassle',
      kind: 'about-you',
      needs: ['grossAnnualIncome'],
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
      kind: 'explore',
      needs: [],
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
      kind: 'explore',
      needs: ['grossAnnualIncome', 'filingStatus', 'state'],
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
      kind: 'explore',
      needs: ['grossAnnualIncome', 'filingStatus'],
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
      kind: 'read',
      needs: ['grossAnnualIncome', 'monthlyExpenses', 'cashSavings', 'investments', 'totalDebt'],
      order: 15,
      title: 'The Dashboard',
      blurb: 'Home. Where you are, the next thing money should do, the next thing to learn, and the date it points to \u2014 every number opens the room it came from.',
      /* The front door since D-058: index.html renders the dashboard once
         it has what it needs, and the intake landing until then. */
      href: 'index.html',
      tier: 1,
      tags: ['income', 'cashflow', 'debt'],
      subsections: [
        { id: 'where',        label: 'Where you are' },
        { id: 'next',         label: 'The next thing money should do' },
        { id: 'learn',        label: 'The next thing to learn' },
        { id: 'date',         label: 'The date it points to' },
        { id: 'full-panel',   label: 'The full panel' },
        { id: 'out-radar',    label: 'All of it at once' },
        { id: 'out-altitude', label: 'Altitude' },
        { id: 'out-weather',  label: 'Weather' },
        { id: 'out-plan',     label: 'Flight plan' },
        { id: 'reading',      label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'accounts',
      /* Not a what-if: it holds facts about your retirement setup that other
         rooms read. An explore room owns nothing anybody waits on, and this
         one owns four things. DECISIONS.md D-052. */
      kind: 'about-you',
      needs: ['grossAnnualIncome', 'filingStatus'],
      order: 17,
      title: 'Where It Goes & how it\u2019s split',
      blurb: 'Roth, Traditional or taxable, how much a Solo 401(k) actually lets you put away \u2014 and the mix you are aiming for.',
      href: 'rooms/accounts.html',
      tier: 2,
      tags: ['income'],
      subsections: [
        { id: 'setup',   label: 'Your retirement setup' },
        { id: 'compare', label: 'Roth vs. Traditional vs. taxable' },
        { id: 'solo',       label: 'Solo 401(k)' },
        { id: 'allocation', label: 'How it\u2019s split' },
        { id: 'reading',    label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'values',
      kind: 'about-you',
      needs: ['monthlyExpenses'],
      order: 21,
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
      kind: 'read',
      needs: ['grossAnnualIncome', 'monthlyExpenses', 'cashSavings', 'investments', 'totalDebt'],
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
      kind: 'explore',
      needs: ['grossAnnualIncome'],
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
      kind: 'about-you',
      needs: ['monthlyExpenses'],
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
      id: 'rerank',
      kind: 'about-you',
      needs: ['monthlyExpenses'],
      order: 19,
      title: 'The Rerank',
      blurb: 'Your costs in order of size, then in order of what they give you \u2014 and the lines where the two orders disagree.',
      href: 'rooms/rerank.html',
      tier: 1,
      tags: ['cashflow'],
      subsections: [
        { id: 'costs',   label: '1 \u00b7 What it costs' },
        { id: 'rate',    label: '2 \u00b7 What it gives you' },
        { id: 'rerank',  label: '3 \u00b7 Put them in your order' },
        { id: 'gap',     label: '4 \u00b7 The gap' },
        { id: 'reading', label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'stacker',
      kind: 'about-you',
      needs: [],
      order: 20,
      title: 'The Skill Stacker',
      blurb: 'Three money skills at a time: did it or didn\u2019t, what today was worth, and what the ledger becomes by 65.',
      href: 'rooms/stacker.html',
      tier: 2,
      tags: ['cashflow'],
      subsections: [
        { id: 'today',   label: 'Today' },
        { id: 'browse',  label: 'Every skill' },
        { id: 'stacks',  label: 'The stacks' },
        { id: 'curves',  label: 'Three curves' },
        { id: 'reading', label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'goals',
      kind: 'about-you',
      needs: ['monthlyExpenses'],
      order: 22,
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
      kind: 'about-you',
      needs: ['grossAnnualIncome'],
      order: 24,
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
      kind: 'explore',
      needs: [],
      order: 25,
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
      kind: 'explore',
      needs: ['cashSavings', 'monthlyExpenses'],
      order: 26,
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
      id: 'health',
      kind: 'read',
      needs: ['dob', 'grossAnnualIncome', 'monthlyExpenses', 'cashSavings', 'investments'],
      order: 27,
      title: 'The Score',
      blurb: 'One number for the whole picture, weighted for the decade you\u2019re in \u2014 and every part of how it was arrived at.',
      href: 'rooms/health.html',
      tier: 1,
      tags: ['income', 'cashflow', 'debt'],
      subsections: [
        { id: 'out-score',    label: 'Everything, at once' },
        { id: 'out-pillars',  label: 'What it is made of' },
        { id: 'out-headroom', label: 'Where the points are' },
        { id: 'out-cohorts',  label: 'How much the weighting matters' },
        { id: 'out-missing',  label: 'What is not in it' },
        { id: 'reading',      label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'foo-ladder',
      kind: 'read',
      /* Every shared figure the month-by-month timeline reads, so the
         footer and the timeline cannot disagree about what is missing.
         The two prepaid figures stay local to the page and optional.
         BRIEF §1.1 item 2. */
      needs: ['grossAnnualIncome', 'filingStatus', 'monthlyExpenses', 'cashSavings', 'employerMatch', 'dob',
              'highestDeductible', 'contributionPercent', 'rothContributed', 'hsaContributed'],
      order: 23,
      title: 'FOO Ladder',
      blurb: 'Walk the nine steps of the Financial Order of Operations month by month, and watch the sapphire light up as each one lands.',
      href: 'rooms/foo-ladder.html',
      tier: 0,
      tags: ['cashflow', 'debt'],
      /* The FOO calculator sat at the repo root until D-058, so this href
         is relative to map.html, which also lives at the root. A
         single-view app with no stable section anchors yet; declaring none
         is deliberate — see DECISIONS.md D-007. */
      subsections: []
    },
    {
      id: 'what-if-life',
      kind: 'explore',
      needs: ['grossAnnualIncome', 'monthlyExpenses', 'cashSavings', 'investments'],
      order: 28,
      title: 'What If, Life',
      blurb: 'A sabbatical, a move, a second income \u2014 one event at a time, three ways: dream, default, disaster.',
      href: 'rooms/what-if-life.html',
      tier: 2,
      tags: ['cashflow', 'income'],
      subsections: [
        { id: 'pick',     label: 'Pick an event' },
        { id: 'answers',  label: 'Its questions' },
        { id: 'three',    label: 'Dream, default, disaster' },
        { id: 'saved',    label: 'Saved scenarios' },
        { id: 'reading',  label: 'Reading from elsewhere' }
      ]
    }
  ];

  /* `kind` is the honest answer to "what is this room FOR?" — and the three
     answers are genuinely different jobs, which the map had been hiding by
     presenting all twenty-five as one numbered path:

       core       the four rooms everything else is built from
       read       it tells you what it already knows — no input at all
       about-you  optional self-reports: what you WANT, not what you have
       explore    a what-if, kept out of your real figures

     `core` is deliberately only four rooms. An earlier pass put eleven in
     one bucket labelled "the ones that matter", including four rating
     exercises — which is precisely the overwhelm this split exists to
     undo. If everything matters, nothing does.

     A person who does not know which kind they are looking at cannot tell
     what is required from what is optional, which is most of why a suite
     this size feels like homework. See DECISIONS.md D-051.

  /* A utility page: reached from the dashboard's staleness line and from
     the room-to-room nav, never listed on the map's groups — it asks for
     nothing new, it re-asks the three figures that move. It writes those
     through the owner's own write path (Ownership.write), so it is not a
     second editor of a second copy. DECISIONS.md D-057. */
  ROOMS.push({
    id: 'refresh',
    kind: 'core',
    utility: true,
    needs: ['cashSavings', 'investments', 'totalDebt'],
    order: 99,   /* always last on the path (D-057), whatever rooms are added */
    title: 'Refresh',
    blurb: 'The three figures that move — cash, investments, what you owe — re-checked in under a minute, and a snapshot taken so the dashboard can say what changed.',
    href: 'rooms/refresh.html',
    tier: 0,
    tags: ['cashflow', 'debt'],
    subsections: [
      { id: 'fields', label: 'The three that move' },
      { id: 'done',   label: 'Snapshot' }
    ]
  });

  /* Between Jobs — the tranche rooms on the template (D-098). */
  ROOMS.push({
    id: 'between-jobs',
    kind: 'about-you',
    needs: ['unemployment', 'monthlyExpenses', 'cashSavings'],
    order: 31,
    title: 'Between Jobs',
    blurb: 'The runway against the search: the day the cash runs out, with the benefit and severance counted, and the floor you could drop to.',
    href: 'rooms/between-jobs.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'The day the cash runs out' },
        { id: 'chart',       label: 'Cash, month by month' },
        { id: 'inputs',      label: 'The search and the floor' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Protection — the tranche rooms on the template (D-098). */
  ROOMS.push({
    id: 'protection',
    kind: 'about-you',
    needs: ['monthlyExpenses', 'cashSavings', 'grossAnnualIncome'],
    order: 32,
    title: 'Protection',
    blurb: 'What a bad year would cost and what stands behind you: health, disability, life, the cushion — each need against what is held.',
    href: 'rooms/protection.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'The biggest gap' },
        { id: 'chart',       label: 'Need against held' },
        { id: 'inputs',      label: 'Health cover' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Decumulation — the tranche rooms on the template (D-098). */
  ROOMS.push({
    id: 'decumulation',
    kind: 'about-you',
    needs: ['investments', 'monthlyExpenses', 'grossAnnualIncome'],
    order: 33,
    title: 'Decumulation',
    blurb: 'How a retiree draws: the withdrawal rate against the convention, what the variable-percentage table allows at your age, and the age the money lasts to.',
    href: 'rooms/decumulation.html',
    tier: 2,
    tags: ['income'],
      subsections: [
        { id: 'number',      label: 'The age the money lasts to' },
        { id: 'chart',       label: 'The balance, year by year' },
        { id: 'inputs',      label: 'How you draw' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Tax — the tranche rooms on the template (D-098). */
  ROOMS.push({
    id: 'tax',
    kind: 'about-you',
    needs: ['grossAnnualIncome', 'filingStatus', 'state'],
    order: 34,
    title: 'Tax',
    blurb: 'Federal, state and payroll tax on your income: the effective rate, the marginal bracket and the room left in it, and whether a refund or a bill is coming.',
    href: 'rooms/tax.html',
    tier: 2,
    tags: ['income'],
      subsections: [
        { id: 'number',      label: 'Your effective rate' },
        { id: 'chart',       label: 'Where a dollar of pay goes' },
        { id: 'inputs',      label: 'Pre-tax and withheld' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Estate Basics — the tranche rooms on the template (D-098). */
  ROOMS.push({
    id: 'estate',
    kind: 'about-you',
    needs: [],
    order: 35,
    title: 'Estate Basics',
    blurb: 'Three facts — beneficiaries named, a will, a power of attorney — and what would pass without them.',
    href: 'rooms/estate.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'In place' },
        { id: 'chart',       label: 'What passes how' },
        { id: 'inputs',      label: 'The three facts' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Giving — the tranche rooms on the template (D-098). */
  ROOMS.push({
    id: 'giving',
    kind: 'about-you',
    needs: ['grossAnnualIncome'],
    order: 36,
    title: 'Giving',
    blurb: 'A share of income given, what it is in dollars and in months of FI, and where it sits against the conventions.',
    href: 'rooms/giving.html',
    tier: 2,
    tags: ['income'],
      subsections: [
        { id: 'number',      label: 'Given, a year' },
        { id: 'chart',       label: 'Three shares of income' },
        { id: 'inputs',      label: 'How much' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Career Move — the second wave of tranche rooms (D-099). */
  ROOMS.push({
    id: 'career-move',
    kind: 'about-you',
    needs: ['grossAnnualIncome'],
    order: 37,
    title: 'Career Move',
    blurb: 'An offer against the job you have: the real hourly wage of each, the take-home difference, and how far the FI date moves.',
    href: 'rooms/career-move.html',
    tier: 2,
    tags: ['income'],
      subsections: [
        { id: 'number',      label: 'The real difference an hour' },
        { id: 'chart',       label: 'Now against the offer' },
        { id: 'inputs',      label: 'The offer' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Partner — the second wave of tranche rooms (D-099). */
  ROOMS.push({
    id: 'partner',
    kind: 'about-you',
    needs: ['grossAnnualIncome', 'monthlyExpenses'],
    order: 38,
    title: 'Partner',
    blurb: 'Two incomes, one household: how the shared month is split, what each of you keeps, and how much rides on one paycheque.',
    href: 'rooms/partner.html',
    tier: 2,
    tags: ['income', 'cashflow'],
      subsections: [
        { id: 'number',      label: 'Each share of the shared month' },
        { id: 'chart',       label: 'The shared month, split' },
        { id: 'inputs',      label: 'How you split' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Kids and Tuition — the second wave of tranche rooms (D-099). */
  ROOMS.push({
    id: 'kids',
    kind: 'about-you',
    needs: ['monthlyExpenses'],
    order: 39,
    title: 'Kids and Tuition',
    blurb: 'What each child costs a year at their age, childcare while they are small, and what tuition needs a month to land on time.',
    href: 'rooms/kids.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'What the kids cost a year' },
        { id: 'chart',       label: 'By child, a month' },
        { id: 'inputs',      label: 'Tuition' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Housing Decision — the second wave of tranche rooms (D-099). */
  ROOMS.push({
    id: 'housing',
    kind: 'about-you',
    needs: ['monthlyExpenses', 'grossAnnualIncome', 'cashSavings'],
    order: 40,
    title: 'Housing Decision',
    blurb: 'Rent against buying, this place, this rate: the monthly cost of each, the price-to-rent ratio, and the years to a down payment.',
    href: 'rooms/housing.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'Own against rent, a month' },
        { id: 'chart',       label: 'Rent against own' },
        { id: 'inputs',      label: 'The place' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Big Purchase — the second wave of tranche rooms (D-099). */
  ROOMS.push({
    id: 'big-purchase',
    kind: 'about-you',
    needs: ['cashSavings', 'monthlyExpenses'],
    order: 41,
    title: 'Big Purchase',
    blurb: 'One thing you are eyeing: hours of your life, months of FI, what the cash looks like after, and what financing it costs.',
    href: 'rooms/big-purchase.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'What it costs in life' },
        { id: 'chart',       label: 'Cash before and after' },
        { id: 'inputs',      label: 'The purchase' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Variable Income — the second wave of tranche rooms (D-099). */
  ROOMS.push({
    id: 'variable-income',
    kind: 'about-you',
    needs: ['grossAnnualIncome', 'monthlyExpenses'],
    order: 42,
    title: 'Variable Income',
    blurb: 'A low month, a high month, an average: the salary to pay yourself, the buffer that smooths the gap, and how many low months it covers.',
    href: 'rooms/variable-income.html',
    tier: 2,
    tags: ['income'],
      subsections: [
        { id: 'number',      label: 'The salary to pay yourself' },
        { id: 'chart',       label: 'Low, average, high' },
        { id: 'inputs',      label: 'The months' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Enough — the LATER.md rooms (D-101). */
  ROOMS.push({
    id: 'enough',
    kind: 'about-you',
    needs: ['monthlyExpenses', 'investments'],
    order: 43,
    title: 'Enough',
    blurb: 'The monthly figure you would live on by choice — typed, or proposed from the joy curve — and the second FI number it makes, against the first.',
    href: 'rooms/enough.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'Enough, a month' },
        { id: 'chart',       label: 'Two FI numbers' },
        { id: 'inputs',      label: 'What enough is' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Designed Week — the LATER.md rooms (D-101). */
  ROOMS.push({
    id: 'week',
    kind: 'about-you',
    needs: ['monthlyExpenses'],
    order: 44,
    title: 'Designed Week',
    blurb: 'The week you would design: 168 hours in blocks, what each block costs and buys, and the month that week adds up to against the one you have.',
    href: 'rooms/week.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'The designed week, a month' },
        { id: 'chart',       label: 'Where the hours go' },
        { id: 'inputs',      label: 'The blocks' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Time Buckets — the LATER.md rooms (D-101). */
  ROOMS.push({
    id: 'buckets',
    kind: 'about-you',
    needs: ['investments', 'monthlyExpenses'],
    order: 45,
    title: 'Time Buckets',
    blurb: 'What you plan to do in each decade, priced, and whether the plan and the money line up in time.',
    href: 'rooms/buckets.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'Planned, all decades' },
        { id: 'chart',       label: 'By decade' },
        { id: 'inputs',      label: 'Each decade' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Dreamline — the LATER.md rooms (D-101). */
  ROOMS.push({
    id: 'dreamline',
    kind: 'about-you',
    needs: ['monthlyExpenses', 'grossAnnualIncome'],
    order: 46,
    title: 'Dreamline',
    blurb: 'Price the dreams a month, add the cost of living, pad it: the target monthly income, and the hours a week at your real rate it takes.',
    href: 'rooms/dreamline.html',
    tier: 2,
    tags: ['income'],
      subsections: [
        { id: 'number',      label: 'Target monthly income' },
        { id: 'chart',       label: 'Dreams against the month' },
        { id: 'inputs',      label: 'The dreams' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Reversibility — the LATER.md rooms (D-101). */
  ROOMS.push({
    id: 'reversibility',
    kind: 'about-you',
    needs: ['cashSavings', 'monthlyExpenses'],
    order: 47,
    title: 'Reversibility',
    blurb: 'A decision you are weighing: what it would cost to undo, and how long — a door, or a one-way street.',
    href: 'rooms/reversibility.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'What undoing costs' },
        { id: 'chart',       label: 'Cost and months to undo' },
        { id: 'inputs',      label: 'The decision' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Unlearning — the LATER.md rooms (D-101). */
  ROOMS.push({
    id: 'unlearning',
    kind: 'about-you',
    needs: ['monthlyExpenses'],
    order: 48,
    title: 'Unlearning',
    blurb: 'The advice everyone hears, sorted by whether it still applies to you — and the rules you have let go of.',
    href: 'rooms/unlearning.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'Rules that no longer apply' },
        { id: 'chart',       label: 'Applies, past it, not yet' },
        { id: 'inputs',      label: 'Let go' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Student Loan Decision — the LATER.md rooms (D-101). */
  ROOMS.push({
    id: 'student-loans',
    kind: 'about-you',
    needs: ['totalDebt', 'grossAnnualIncome'],
    order: 49,
    title: 'Student Loan Decision',
    blurb: 'Standard, income-driven, or aggressive: what each pays a month, when each clears, and what each costs in interest — for the loans you listed.',
    href: 'rooms/student-loans.html',
    tier: 2,
    tags: ['debt'],
      subsections: [
        { id: 'number',      label: 'The plan that clears them' },
        { id: 'chart',       label: 'Three plans, side by side' },
        { id: 'inputs',      label: 'The plan' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Money Calendar & Pay-Later — the LATER.md rooms (D-101). */
  ROOMS.push({
    id: 'calendar',
    kind: 'about-you',
    needs: ['monthlyExpenses', 'cashSavings'],
    order: 50,
    title: 'Money Calendar & Pay-Later',
    blurb: 'Paydays and bills across a month, pay-later instalments counted: the low point, and the day it lands.',
    href: 'rooms/calendar.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'The low point this month' },
        { id: 'chart',       label: 'Cash across the month' },
        { id: 'inputs',      label: 'Paydays, bills, pay-later' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* History — the LATER.md rooms (D-101). */
  ROOMS.push({
    id: 'history',
    kind: 'read',
    needs: ['cashSavings', 'investments', 'totalDebt'],
    order: 51,
    title: 'History',
    blurb: 'Every snapshot you froze, and what moved between them: net worth over time, and the log of what you changed.',
    href: 'rooms/history.html',
    tier: 2,
    tags: ['cashflow'],
      subsections: [
        { id: 'number',      label: 'Since the first snapshot' },
        { id: 'chart',       label: 'Net worth over time' },
        { id: 'inputs',      label: 'Compare and freeze' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Your Data: every way numbers get in or out of this browser — a file, a
     share link, a pasted statement sorted into the right lists — in one
     place. Writes through the same spine helpers the owner rooms use; owns
     no field (D-125). A utility, off the path like Refresh (D-057). */
  ROOMS.push({
    id: 'data',
    kind: 'core',
    utility: true,
    needs: [],
    order: 98,
    title: 'Your Data',
    blurb: 'Download a file, copy a share link, load one — replacing or adding to what is here — or paste in a statement and have every line sorted into the debt, account, expense or income it is.',
    href: 'rooms/data.html',
    tier: 0,
    tags: ['income', 'cashflow', 'debt'],
    subsections: [
      { id: 'out',   label: 'Take it with you' },
      { id: 'file',  label: 'Load a file' },
      { id: 'paste', label: 'Paste in new numbers' },
      { id: 'reset', label: 'Start over' }
    ]
  });

  /* Where every room's out-of-scope line points (D-097). Reads the gate for
     a line per stage; owns nothing; optional by definition. */
  ROOMS.push({
    id: 'get-help',
    kind: 'explore',
    utility: true,
    needs: [],
    order: 29,
    title: 'Get Help',
    blurb: 'What these rooms deliberately do not do, and what kind of person answers those questions. Kinds of help, never a name.',
    href: 'rooms/get-help.html',
    tier: 0,
    tags: ['income', 'cashflow', 'debt'],
    subsections: [
      { id: 'not-here', label: 'What these rooms do not do' },
      { id: 'who',      label: 'Who answers them' },
      { id: 'stage',    label: 'At your stage' }
    ]
  });

  /* `needs` lists the shared fields a room reads before it can show its main
     output — the ids in shared/ownership.js, which know who owns each one and
     which question to land on. shared/progress.js turns that into "what is
     left, and where", and test/run.js checks every id is real. An empty list
     means the room stands on its own. See DECISIONS.md D-050. */

  /* The path, in the order a person should walk it (SPEC.md §12.6 keeps the
     tag filter; this adds the sequence the filter sits on top of). */
  function inOrder() {
    return ROOMS.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
  }

  function all() { return inOrder(); }

  /* Which branch a room needs before it is a room for this household
     (D-094). Rooms with none are for everyone. The check is Gate.exists,
     reached lazily because the gate loads after the registry. */
  var REQUIRES = {
    accounts: ['retirement'],
    credential: ['career'],
    'self-employed': ['ownWork'],
    'side-hustle': ['career'],
    'real-hourly-wage': ['hours'],
    hassle: ['hours'],
    'savings-rate': ['savingsRate'],
    fire: ['savingsRate'],
    'between-jobs': ['unemployment'],
    protection: ['protection'],
    decumulation: ['decumulation'],
    tax: ['income'],
    'career-move': ['career'],
    partner: ['partner'],
    kids: ['dependents'],
    'variable-income': ['variableIncome'],
    dreamline: ['hours'],
    'student-loans': ['debt']
  };
  function gate() {
    if (typeof module === 'object' && module.exports) return require('./gate.js');
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    return g && g.SLAF && g.SLAF.Gate ? g.SLAF.Gate : null;
  }
  function requires(roomId) { return REQUIRES[roomId] || []; }
  function applies(room, household) {
    var G = gate();
    if (!G || !household) return true;
    return requires(room.id).every(function (k) { return G.exists(household, k); });
  }
  /** The rooms that exist for this household, in path order. */
  function forHousehold(household) {
    return inOrder().filter(function (r) { return applies(r, household); });
  }

  /** The next room after this one that hasn't been visited yet. Pass the
   *  household and Debt Payoff is skipped for someone who answered "no
   *  debt" (D-061) — there is nothing to list there. */
  function nextAfter(roomId, visitedIds, household) {
    var noDebt = !!(household && household.meta && household.meta.hasDebt === false);
    var path = inOrder().filter(function (r) { return !(noDebt && r.id === 'debt-payoff') && !r.utility; });
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

  function byTag(tag, household) {
    var list = household ? forHousehold(household) : all();
    if (!tag || tag === 'all') return list;
    return list.filter(function (r) { return r.tags.indexOf(tag) !== -1; });
  }

  function total() { return ROOMS.length; }

  return {
    FILTER_TAGS: FILTER_TAGS,
    ROOMS: ROOMS,
    all: all,
    inOrder: inOrder,
    REQUIRES: REQUIRES,
    requires: requires,
    applies: applies,
    forHousehold: forHousehold,
    nextAfter: nextAfter,
    byId: byId,
    byTag: byTag,
    total: total
  };
});
