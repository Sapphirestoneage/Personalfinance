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
      group: 'home', aliases: ['begin', 'setup', 'one-pager', 'situation', 'intake'],
      kind: 'core',
      needs: ['employmentStatus', 'unemployment', 'dob', 'state', 'filingStatus', 'grossAnnualIncome', 'monthlyExpenses', 'cashSavings', 'investments',
              'employerMatch', 'contributionPercent', 'capturingFullMatch', 'highestDeductible', 'hasDebt'],
      order: 1,
      title: 'Start Here',
      blurb: 'One page. Say your situation, fix the guesses that are wrong, and get a dashboard back. Every other room opens already filled in.',
      href: 'rooms/start.html',
      tier: 0,
      tags: ['income', 'cashflow', 'debt'],
      daite: { reads: ['assets.cashCents', 'assets.contributions.pretax', 'assets.invested', 'debt.none', 'expenses', 'income.grossAnnualCents', 'income.sources[].benefit', 'income.sources[].employerMatch', 'taxes.filingStatus', 'taxes.state', 'taxes.zip', 'you.cover', 'you.dob', 'you.situation'], writes: ['assets.cashCents', 'assets.contributions.pretax', 'assets.invested', 'debt.none', 'income.grossAnnualCents', 'income.sources[].benefit', 'income.sources[].employerMatch', 'income.sources[].lastPay', 'taxes.filingStatus', 'taxes.state', 'taxes.zip', 'you.cover', 'you.dependents', 'you.dob', 'you.situation'] },
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
      features: ['afterTaxNetWorth', 'homeDetail', 'agingParents'],
      group: 'scorecard', aliases: ['snapshot', 'draftt', 'lenses', 'scorecard', 'nine numbers'],
      kind: 'read',
      needs: ['grossAnnualIncome', 'monthlyExpenses', 'cashSavings', 'investments', 'totalDebt', 'dob', 'filingStatus'],
      order: 4,
      title: 'The Scorecard',
      blurb: 'Everything you have entered, read back six ways: one score, the nine numbers, the savings rate, every ratio, five quick sums, and where you think you rank. Nothing here asks for a new figure.',
      href: 'rooms/financial-snapshot.html',
      tier: 0,
      tags: ['income', 'cashflow', 'debt'],
      daite: { reads: ['assets.cashCents', 'assets.invested', 'debt.items', 'expenses', 'income.grossAnnualCents', 'taxes.filingStatus', 'you.dob'], writes: [] },
      subsections: [
        { id: 'view-the-score',       label: 'The score' },
        { id: 'view-the-nine',        label: 'The nine numbers' },
        { id: 'view-savings-rate',    label: 'Savings rate' },
        { id: 'view-every-ratio',     label: 'Every ratio' },
        { id: 'view-quick-math',      label: 'Quick math' },
        { id: 'view-where-you-rank',  label: 'Where you rank' },
        { id: 'out-score',            label: 'Everything, at once' },
        { id: 'out-pillars',          label: 'What the score is made of' },
        { id: 'out-rate',             label: 'The savings rate' },
        { id: 'out-wealth',           label: 'The wealth ratios' },
        { id: 'habit',                label: 'A habit, compounded' },
        { id: 'guess',                label: 'Your guess' },
        { id: 'draftt',               label: 'DRAFTT' },
        { id: 'lenses',               label: 'Lenses' },
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
      features: ['equityComp', 'matchVesting'],
      group: 'numbers', subgroup: 'income', aliases: ['pay', 'salary', 'paycheck', 'sources'],
      kind: 'about-you',
      needs: [],
      order: 3.2,
      title: 'Income',
      blurb: 'Everything coming in, logged as it lands — a paycheque, a gig, a gift, a dividend, the rent — each netted the way it is actually taxed.',
      href: 'rooms/income.html',
      tier: 1,
      tags: ['income'],
      daite: { reads: [], writes: ['income.costs', 'income.ledger', 'income.sources[].type', 'income.sources[].survivesJobLoss'] },
      subsections: [
        { id: 'month', label: 'This month' },
        { id: 'log',   label: 'Every entry' },
        { id: 'add',   label: 'Add an entry' },
        { id: 'costs', label: 'The costs of earning it' }
      ]
    },
    {
      id: 'budget',
      features: ['annualLines'],
      group: 'numbers', subgroup: 'expenses', aliases: ['budget', 'buckets', 'estimate', 'plan the month'],
      kind: 'about-you',
      needs: [],
      order: 3.4,
      title: 'Budget',
      blurb: 'Five buckets, estimated beside actual, read from what Income and Cash Flow logged \u2014 never typed here \u2014 and closed at the end of the month.',
      href: 'rooms/budget.html',
      tier: 1,
      tags: ['income', 'cashflow', 'debt'],
      daite: { reads: [], writes: ['expenses.budget', 'expenses.months'] },
      subsections: [
        { id: 'sheet',  label: 'The sheet' },
        { id: 'close',  label: 'Month-end' },
        { id: 'months', label: 'Closed months' }
      ]
    },
    {
      id: 'variance',
      group: 'numbers', subgroup: 'expenses', aliases: ['estimated', 'actual', 'over', 'under'],
      kind: 'read',
      needs: ['monthsClosed'],
      order: 3.5,
      title: 'Estimated vs Actual',
      blurb: 'Every closed month read back: what you expected against what happened, bucket by bucket, and whether the guesses are getting better.',
      href: 'rooms/variance.html',
      tier: 1,
      tags: ['income', 'cashflow'],
      daite: { reads: ['expenses.months'], writes: [] },
      subsections: [
        { id: 'month',   label: 'One month' },
        { id: 'trend',   label: 'Month over month' },
        { id: 'buckets', label: 'Bucket by bucket' }
      ]
    },
    {
      /* For most households the second-largest purchase and the most
         frequent large one, and Big Purchase is generic (D-149). */
      id: 'car',
      group: 'decisions', subgroup: 'home',
      aliases: ['car', 'vehicle', 'auto', 'lease', '20/3/8', 'first car', 'car check', 'car loan', 'new or used'],
      kind: 'explore',
      needs: ['grossAnnualIncome'],
      order: 26.2,
      title: 'Wheels',
      blurb: 'Does the car fit \u2014 twenty percent down, three years, under eight percent of what you earn \u2014 and underneath the payment, what it loses, what it costs to run, and whether the loan fits.',
      href: 'rooms/car.html',
      tier: 1,
      tags: ['cashflow', 'debt'],
      daite: { reads: ['income.grossAnnualCents', 'expenses', 'assets.invested', 'taxes.filingStatus'], writes: [] },
      subsections: [
        { id: 'check',      label: '20 / 3 / 8' },
        { id: 'check-inputs', label: 'The car' },
        { id: 'newused',    label: 'New against used' },
        { id: 'out-drop',   label: 'What it loses' },
        { id: 'out-run',    label: 'What it costs to run' },
        { id: 'out-loan',   label: 'Whether the loan fits' },
        { id: 'out-ways',   label: 'Lease, new, or a year old' },
        { id: 'reading',    label: 'Reading from elsewhere' }
      ]
    },
    {
      /* "I left my job — what happens to my 401(k)?" Accounts covers Roth
         vs Traditional, not this (D-150). */
      id: 'rollover',
      group: 'numbers', subgroup: 'assets', aliases: ['old 401k', 'rollover', 'left behind'],
      kind: 'explore',
      needs: [],
      order: 26.8,
      title: 'The Account You Left Behind',
      blurb: 'A workplace plan at an old job has four possible futures, and one of them is much worse than the others. What each costs you, and the paperwork trap in the middle.',
      href: 'rooms/rollover.html',
      tier: 2,
      tags: ['income'],
      daite: { reads: [], writes: [] },
      subsections: [
        { id: 'out-four',   label: 'The four things you can do' },
        { id: 'out-trap',   label: 'The trap in the middle' },
        { id: 'out-cost',   label: 'What cashing out costs' },
        { id: 'reading',    label: 'Reading from elsewhere' }
      ]
    },
    {
      /* The most-asked consumer money question, and the app had no room for
         it (D-147). It computes NO score — it cannot see the file — so it
         shows what it can see, says what moves one, and stops. */
      id: 'credit',
      group: 'numbers', subgroup: 'debt', aliases: ['credit score', 'report', 'file'],
      kind: 'read',
      /* It reads the itemised debts, which is where a card's balance and its
         limit live — the two figures the utilisation and credit-mix rows are
         made of. It writes nothing and owns nothing. */
      needs: ['totalDebt'],
      order: 26.4,
      title: 'Your Credit File',
      blurb: 'What a score is made of, which parts this app can actually see, and the one that moves fastest. No score here \u2014 that comes from a file only the bureaus hold.',
      href: 'rooms/credit.html',
      tier: 1,
      tags: ['debt'],
      daite: { reads: ['debt.items'], writes: [] },
      subsections: [
        { id: 'out-what',     label: 'What it is made of' },
        { id: 'out-yours',    label: 'What this app can see' },
        { id: 'out-stays',    label: 'How long things stay' },
        { id: 'out-rights',   label: 'What you are entitled to' },
        { id: 'reading',      label: 'Reading from elsewhere' }
      ]
    },
    {
      /* The highest-stress money moment there is, and Between Jobs was the
         nearest thing — which assumes job loss specifically (D-148). */
      id: 'cant-pay',
      group: 'numbers', subgroup: 'debt', aliases: ['bills', 'triage', 'late', 'behind'],
      kind: 'explore',
      needs: [],
      order: 26.6,
      title: 'When It Won\u2019t All Get Paid',
      blurb: 'A short month, and not everything can be paid. Which bill to protect first, what is negotiable, what a phone call is worth, and who helps for free.',
      href: 'rooms/cant-pay.html',
      tier: 0,
      tags: ['cashflow', 'debt'],
      daite: { reads: [], writes: [] },
      subsections: [
        { id: 'out-gap',     label: 'What the gap is' },
        { id: 'out-order',   label: 'The order to pay in' },
        { id: 'out-calls',   label: 'The calls worth making' },
        { id: 'out-help',    label: 'Free help' },
        { id: 'reading',     label: 'Reading from elsewhere' }
      ]
    },
    {
      /* WHAT a month costs (D-192): split out of Cash Flow so the four
         numbers, the yearly costs and the split have one plain home. */
      id: 'expenses',
      features: ['annualLines', 'agingParents'],
      group: 'numbers', subgroup: 'expenses', aliases: ['spending', 'expenses', 'rent', 'food', 'FAT', 'wants', 'month', 'typical month', 'split', 'categories'],
      kind: 'core',
      needs: ['monthlyExpenses'],
      order: 3,
      title: 'Expenses',
      blurb: 'What a month costs you: four numbers, the yearly costs, and an optional split by category, measured against a budget.',
      href: 'rooms/expenses.html',
      tier: 1,
      tags: ['cashflow'],
      daite: { reads: ['expenses'], writes: ['expenses', 'expenses.needs.accommodation', 'expenses.needs.food', 'expenses.needs.transportation', 'expenses.wants', 'expenses.wants.therapy', 'expenses.annual[]'] },
      subsections: [
        { id: 'picture',         label: 'At a glance' },
        { id: 'spending',        label: '1 · The essentials' },
        { id: 'lines',           label: '2 · Everything else' },
        { id: 'month',           label: '3 · Your month' },
        { id: 'more',            label: 'More' }
      ]
    },
    {
      /* WHEN the money moves (D-192): the log on its dates, this month at
         a glance, and where it flows. It reads the typical month from
         Expenses and never types it. */
      id: 'cash-flow',
      features: [],
      group: 'numbers', subgroup: 'expenses', aliases: ['log', 'receipts', 'this month', 'flow', 'sankey', 'what is left'],
      kind: 'about-you',
      needs: [],
      order: 3.1,
      title: 'Cash Flow',
      blurb: 'When the money moves: this month at a glance, every receipt logged on its date, and where it all flows.',
      href: 'rooms/cash-flow.html',
      tier: 1,
      tags: ['cashflow', 'income'],
      daite: { reads: ['expenses', 'income'], writes: ['expenses.log'] },
      subsections: [
        { id: 'glance',          label: 'At a glance' },
        { id: 'log',             label: 'The expense log' },
        { id: 'flow',            label: 'Where it flows' },
        { id: 'out-net-flow',    label: 'What’s left' }
      ]
    },
    {
      id: 'debt-payoff',
      features: ['studentLoanPaths'],
      group: 'numbers', subgroup: 'debt', aliases: ['loans', 'credit card', 'avalanche', 'snowball', 'minimums'],
      kind: 'core',
      needs: ['totalDebt', 'monthlyDebtPayments'],
      order: 2,
      title: 'Debt Payoff',
      blurb: 'Every debt, in the order you\u2019ll clear them — and what avalanche, snowball, or just getting the worst one gone would each cost.',
      href: 'rooms/debt-payoff.html',
      tier: 1,
      tags: ['debt'],
      daite: { reads: ['debt.items', 'debt.items[].minimumCents'], writes: ['debt.items', 'debt.items[].minimumCents', 'debt.items[].balanceCents', 'debt.items[].rate'] },
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
      features: ['afterTaxNetWorth', 'incomeFloor', 'equityComp', 'homeDetail'],
      group: 'numbers', subgroup: 'assets', aliases: ['net worth', 'balance sheet', 'accounts', 'property', 'what you own'],
      kind: 'core',
      needs: ['cashSavings', 'investments', 'totalDebt'],
      order: 5,
      title: 'The Statement',
      blurb: 'Everything you own in three portfolios, how sure you are of each, how fast you could reach it — and the one number underneath. The place to add a house or a car.',
      href: 'rooms/statement.html',
      tier: 1,
      tags: ['debt'],
      daite: { reads: ['assets.cashCents', 'assets.invested', 'debt.items'], writes: ['assets', 'assets.property', 'assets.items[].valueCents', 'assets.items[].taxCharacter', 'assets.items[].tier', 'assets.items[].costBasisCents'] },
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
      id: 'fire-lab',
      features: ['showNominal', 'sequenceRisk'],
      group: 'scorecard', aliases: ['lab', 'variants', 'lean', 'fat', 'coast', 'barista'],
      kind: 'read',
      needs: ['monthlyExpenses', 'investments'],
      order: 8.5,
      title: 'FIRE Lab',
      blurb: 'Every FIRE calculation on one screen and drawn: the number, how far along you are, the six flavours side by side, the milestones, the path, and what a different withdrawal rate does to all of it.',
      href: 'rooms/fire-lab.html',
      tier: 1,
      tags: ['income', 'cashflow'],
      daite: { reads: ['assets.invested', 'expenses'], writes: [] },
      subsections: [
        { id: 'number',      label: 'The number' },
        { id: 'swr',         label: 'Withdrawal rate' },
        { id: 'flavours',    label: 'The flavours' },
        { id: 'split',       label: 'Where it comes from' },
        { id: 'milestones',  label: 'Milestones' },
        { id: 'path',        label: 'The path' },
        { id: 'sensitivity', label: 'If the assumptions are wrong' }
      ]
    },
    {
      id: 'fire',
      features: ['afterTaxNetWorth', 'showNominal', 'preMedicare', 'incomeFloor'],
      group: 'scorecard', aliases: ['fire', 'financial independence', 'retire early', 'number'],
      kind: 'read',
      needs: ['monthlyExpenses', 'investments', 'dob'],
      order: 8,
      title: 'FIRE Number',
      blurb: 'What you\u2019d need before work became optional \u2014 lean, standard, chubby, fat, coast or barista, from one formula.',
      href: 'rooms/fire.html',
      tier: 1,
      tags: ['income', 'cashflow'],
      daite: { reads: ['assets.invested', 'expenses', 'you.dob'], writes: ['plans.targets'] },
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
      group: 'numbers', subgroup: 'income', aliases: ['hourly', 'wage', 'commute', 'hours', 'ymoyl'],
      kind: 'about-you',
      needs: ['grossAnnualIncome'],
      order: 9,
      title: 'Real Hourly Wage',
      blurb: 'What the job actually pays, once you count every hour it takes and everything it costs you to do it.',
      href: 'rooms/real-hourly-wage.html',
      tier: 1,
      tags: ['income'],
      daite: { reads: ['income.grossAnnualCents'], writes: [] },
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
      group: 'decisions', subgroup: 'home', aliases: ['hassle', 'diy', 'chores', 'cheaper option'],
      kind: 'about-you',
      needs: ['grossAnnualIncome'],
      order: 10,
      title: 'Worth the Hassle',
      blurb: 'What a money-saving chore actually pays per hour \u2014 against what an hour of your life already earns, and how much you hate doing it.',
      href: 'rooms/hassle.html',
      tier: 1,
      tags: ['income', 'cashflow'],
      daite: { reads: ['income.grossAnnualCents'], writes: [] },
      subsections: [
        { id: 'chore',     label: 'The chore' },
        { id: 'out-rate',  label: 'What it pays an hour' },
        { id: 'out-wage',  label: 'Against an hour of your life' },
        { id: 'presets',   label: 'Common ones' },
        { id: 'reading',   label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'self-employed',
      group: 'decisions', subgroup: 'work', aliases: ['self-employed', 'freelance', '1099', 'own business'], appliesWhen: 'situation != retired',
      kind: 'explore',
      needs: ['grossAnnualIncome', 'filingStatus', 'state'],
      order: 12,
      title: 'Going Self-Employed',
      blurb: 'What a contract rate has to be to match a salary, where the 15.3% actually lands, and what to send in each quarter.',
      href: 'rooms/self-employed.html',
      tier: 1,
      tags: ['income'],
      daite: { reads: ['income.grossAnnualCents', 'taxes.filingStatus', 'taxes.state'], writes: [] },
      subsections: [
        { id: 'compare',   label: 'Salary vs. contract' },
        { id: 'setax',     label: 'Self-employment tax' },
        { id: 'quarterly', label: 'Quarterly estimates' },
        { id: 'reading',   label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'side-hustle',
      group: 'decisions', subgroup: 'work', aliases: ['hustle', 'side income', 'gig'], appliesWhen: 'situation != retired',
      kind: 'explore',
      needs: ['grossAnnualIncome', 'filingStatus'],
      order: 13,
      title: 'Side Hustle',
      blurb: 'What the second job actually pays after tax, costs and the hours it eats \u2014 and what a week looks like with it in.',
      href: 'rooms/side-hustle.html',
      tier: 2,
      tags: ['income'],
      daite: { reads: ['income.grossAnnualCents', 'taxes.filingStatus'], writes: [] },
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
      features: ['afterTaxNetWorth'],
      group: 'home', aliases: ['home', 'overview', 'tiles'],
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
      daite: { reads: ['assets.cashCents', 'assets.invested', 'debt.items', 'expenses', 'income.grossAnnualCents'], writes: [] },
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
    /* The Ledger (18.4, 18.5; D-185): every number the app can hold, one
       row each, in nine spheres. Six ways in, one set of rows (D-230). */
    {
      id: 'ledger',
      /* Home, not Upkeep, since D-230: three doors side by side under Home
         was what lost people (D-186), and there is now one door. The First
         Round, Express, Front Doors and the Walk-Through are its views. */
      group: 'home', aliases: ['ledger', 'the ledger', 'rows', 'spheres', 'progress',
                               'first round', 'five questions', 'quick start', 'begin',
                               'express', 'whole form', 'all at once', 'everything',
                               'front doors', 'arrangements', 'ways in',
                               'walk-through', 'guided', 'tour',
                               'refresh', 'stale', 'update numbers', 'confirm',
                               'welcome back', 'been a while', 'comeback'],
      kind: 'about-you',
      utility: true,
      needs: [],
      order: 0.5,
      title: 'The Ledger',
      blurb: 'Every number the app can hold, one line each. Six ways in and they all write the same rows: the six doors, five questions to start, the whole form at once, what has moved since last time, twenty arrangements, and the short route through.',
      href: 'rooms/ledger.html',
      tier: 0,
      tags: ['income', 'cashflow', 'debt'],
      daite: { reads: ["assets","assets.allocation","assets.cashCents","assets.contributions.hsa","assets.contributions.pretax","assets.contributions.roth","assets.invested","assets.property","debt.items","debt.items[].minimumCents","debt.items[].plan","debt.none","expenses","expenses.floor","expenses.giving","expenses.insurance","expenses.log","expenses.months","expenses.needs.accommodation","expenses.needs.food","expenses.needs.transportation","expenses.shared","expenses.wants","expenses.wants.therapy","income.cadence","income.future","income.grossAnnualCents","income.ledger","income.sources[].benefit","income.sources[].employerMatch","income.variable","taxes.filingStatus","taxes.marginalRate","taxes.otherPreTax","taxes.state","taxes.withheld","taxes.zip","you.cover","you.dependents","you.dob","you.estate","you.partner","you.situation"],
               /* It owns none of these. Round 1, all at once and since last
                  time each write through Ownership.write, which is the owner's
                  own path — one record, never a second copy (D-230). */
               writes: ["assets.cashCents","assets.invested","debt.items","expenses","income.grossAnnualCents","income.sources[].lastPay","taxes.zip","you.dob","you.situation"] },
      subsections: [
        { id: 'doors-home',   label: 'The six doors' },
        { id: 'door-D',       label: 'Debt' },
        { id: 'door-A',       label: 'Assets' },
        { id: 'door-I',       label: 'Income' },
        { id: 'door-T',       label: 'Taxes' },
        { id: 'door-E',       label: 'Expenses' },
        { id: 'door-you',     label: 'You' },
        { id: 'view-round1',  label: 'Round 1' },
        { id: 'view-express', label: 'All at once' },
        { id: 'view-since',   label: 'Since last time' },
        { id: 'view-shelves', label: 'Arrangements' },
        { id: 'view-route',   label: 'The route' },
        { id: 'spheres-fold', label: 'The nine spheres' },
        { id: 'backup',       label: 'Backup' }
      ]
    },
    {
      id: 'accounts',
      group: 'numbers', subgroup: 'assets', aliases: ['401k', 'ira', 'roth', 'hsa', 'allocation', 'contributions', 'match'],
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
      daite: { reads: ['income.grossAnnualCents', 'taxes.filingStatus'], writes: ['assets.allocation', 'assets.contributions.hsa', 'assets.contributions.roth', 'taxes.marginalRate'] },
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
      group: 'matters', aliases: ['values', 'what matters', 'priorities'],
      kind: 'about-you',
      needs: ['monthlyExpenses'],
      order: 21,
      title: 'What Matters',
      blurb: 'The five things you say matter most, next to where the money actually went. No score \u2014 just the two lists, side by side.',
      href: 'rooms/values.html',
      tier: 2,
      tags: ['cashflow'],
      daite: { reads: ['expenses'], writes: ['plans.values'] },
      subsections: [
        { id: 'stated',      label: 'What matters to you' },
        { id: 'spending',    label: 'What the money serves' },
        { id: 'out-compare', label: 'The two lists' },
        { id: 'out-unclaimed', label: 'Serving nothing you named' },
        { id: 'reading',     label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'credential',
      group: 'decisions', subgroup: 'work', aliases: ['degree', 'course', 'certification', 'learning', 'school'], appliesWhen: 'situation != retired',
      kind: 'explore',
      needs: ['grossAnnualIncome'],
      order: 16,
      title: 'Worth Learning',
      blurb: 'A degree, a bootcamp or a weekend course \u2014 what it costs including the time, what the raise is worth after tax, and when it pays back.',
      href: 'rooms/credential.html',
      tier: 2,
      tags: ['income'],
      daite: { reads: ['income.grossAnnualCents'], writes: [] },
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
      group: 'matters', aliases: ['joy', 'fulfillment curve', 'satisfaction'],
      kind: 'about-you',
      needs: ['monthlyExpenses'],
      order: 18,
      /* Was also called "Enough", which the room at order 43 is actually about
         — the monthly figure you would live on by choice. Two rooms under one
         name in the menu, the map and all twenty Front Doors layouts is a
         coin toss every time. "The Joy Curve" is not invented here: it is what
         the Enough room's own copy already calls this one's output. D-164. */
      title: 'The Joy Curve',
      blurb: 'What each thing costs a month, against what it is actually worth to you \u2014 and the four places that lands.',
      href: 'rooms/fulfillment.html',
      tier: 1,
      tags: ['cashflow'],
      daite: { reads: ['expenses'], writes: ['plans.ratings'] },
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
      group: 'matters', aliases: ['rerank', 'cut', 'keep', 'value rank'],
      kind: 'about-you',
      needs: ['monthlyExpenses'],
      order: 19,
      title: 'The Rerank',
      blurb: 'Your costs in order of size, then in order of what they give you \u2014 and the lines where the two orders disagree.',
      href: 'rooms/rerank.html',
      tier: 1,
      tags: ['cashflow'],
      daite: { reads: ['expenses'], writes: ['expenses.log', 'plans.rerank'] },
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
      group: 'levelup', aliases: ['skills', 'stack', 'earn more'],
      kind: 'about-you',
      needs: [],
      order: 20,
      title: 'The Skill Stacker',
      blurb: 'Three money skills at a time: did it or didn\u2019t, what today was worth, and what the ledger becomes by 65.',
      href: 'rooms/stacker.html',
      tier: 2,
      tags: ['cashflow'],
      daite: { reads: [], writes: ['progress.learning'] },
      subsections: [
        { id: 'today',   label: 'Today' },
        { id: 'browse',  label: 'Every skill' },
        { id: 'stacks',  label: 'The stacks' },
        { id: 'curves',  label: 'Three curves' },
        { id: 'reading', label: 'Reading from elsewhere' }
      ]
    },
    /* The Skill Tree and the Exercise Library (D-131): what the next hour
       does, beside the ladder's what the next dollar does. */
    {
      id: 'skill-tree',
      group: 'levelup', aliases: ['skill tree', 'tech tree', 'curriculum'],
      kind: 'about-you',
      needs: [],
      order: 20.2,
      title: 'The Skill Tree',
      blurb: 'What the next hour does: every money skill in five bands, open, locked with the reason, done, or skipped because you are already past it. The ladder runs above it and the two unlock each other.',
      href: 'rooms/skill-tree.html',
      tier: 2,
      tags: ['cashflow'],
      daite: { reads: [], writes: ['progress.learning'] },
      subsections: [
        { id: 'next',    label: 'What opens next' },
        { id: 'ladder',  label: 'The fortress line' },
        { id: 'board',   label: 'The board' },
        { id: 'warps',   label: 'Warps' },
        { id: 'reading', label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'exercises',
      group: 'levelup', aliases: ['exercises', 'practice', 'drills'],
      kind: 'about-you',
      needs: [],
      order: 20.4,
      title: 'Exercises',
      blurb: 'Every doable thing in one place, fifteen minutes or less by default: the first fifteen minutes of a skill, a named exercise from the canon credited to its author, or a calculation run on your own numbers. Completing one opens the skill it belongs to.',
      href: 'rooms/exercises.html',
      tier: 2,
      tags: ['cashflow'],
      daite: { reads: [], writes: ['progress.learning'] },
      subsections: [
        { id: 'list',    label: 'What applies to you' },
        { id: 'runs',    label: 'What the runs found' },
        { id: 'reading', label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'goals',
      group: 'matters', aliases: ['goals', 'targets', 'wedding', 'dream'],
      kind: 'about-you',
      needs: ['monthlyExpenses'],
      order: 22,
      title: 'Goals',
      blurb: 'A wedding, a deposit, a big trip. What it costs, what it needs a month, and whether that actually fits alongside everything else.',
      href: 'rooms/goals.html',
      tier: 2,
      tags: ['cashflow'],
      daite: { reads: ['expenses'], writes: ['plans.goals'] },
      subsections: [
        { id: 'out-together', label: 'All of it together' },
        { id: 'add',          label: 'Start something' }
      ]
    },
    {
      id: 'worth',
      group: 'decisions', subgroup: 'home', aliases: ['worth it', 'purchase', 'joy per dollar'],
      kind: 'about-you',
      needs: ['grossAnnualIncome'],
      order: 24,
      title: 'Worth It',
      blurb: 'What you thought something would be worth before you bought it, against what it turned out to be worth \u2014 and what that gap says about your own guesses.',
      href: 'rooms/worth.html',
      tier: 1,
      tags: ['cashflow'],
      daite: { reads: ['income.grossAnnualCents'], writes: ['plans.worth'] },
      subsections: [
        { id: 'things',      label: 'The things' },
        { id: 'out-each',    label: 'The arithmetic on each' },
        { id: 'out-gap',     label: 'Before against after' },
        { id: 'out-regrets', label: 'The ones you would take back' },
        { id: 'reading',     label: 'Reading from elsewhere' }
      ]
    },
    /* The Cushion (D-232): four readings of one number. The Runway, Between
       Jobs, The Quit Fund and Sleep At Night each answered how long you
       could stop earning; the aliases carry all four so a search for any of
       them lands, and the seven fields the last two owned are owned here. */
    {
      id: 'runway',
      features: ['jobLossCushions', 'preMedicare', 'agingParents'],
      group: 'decisions', subgroup: 'moves',
      aliases: ['runway', 'months of cash', 'how long', 'cushion', 'emergency fund',
                'unemployed', 'laid off', 'job loss', 'cobra', 'between jobs',
                'quit fund', 'walk away', 'freedom fund',
                'sleep at night', 'swan', 'coverage', '3am'],
      kind: 'about-you',
      needs: ['cashSavings', 'monthlyExpenses'],
      order: 26,
      title: 'The Cushion',
      blurb: 'How long could you not earn? One number, four readings: plainly, while job hunting, by choice, and the amount that stops the 3am arithmetic.',
      href: 'rooms/runway.html',
      tier: 2,
      tags: ['income', 'cashflow'],
      daite: { reads: ['assets.cashCents', 'expenses', 'income.sources[].benefit', 'you.cover', 'you.dependents'],
               writes: ['expenses.floor', 'plans.betweenJobs', 'plans.swan', 'you.cover'] },
      subsections: [
        { id: 'view-how-long',    label: 'How long' },
        { id: 'view-job-hunting', label: 'While job hunting' },
        { id: 'view-by-choice',   label: 'By choice' },
        { id: 'view-at-3am',      label: 'At 3am' },
        { id: 'the-plan',    label: 'The situation' },
        { id: 'out-runway',  label: 'How long the money lasts' },
        { id: 'out-path',    label: 'The drawdown' },
        { id: 'out-fix',     label: 'What would buy you more' },
        { id: 'out-compare', label: 'The same money, three exits' },
        { id: 'bj-number',   label: 'The day the cash runs out' },
        { id: 'inputs',      label: 'The search and the floor' },
        { id: 'months',      label: 'Months of freedom' },
        { id: 'dates',       label: 'When you would have' },
        { id: 'am-number',   label: 'Your number' },
        { id: 'coverage',    label: 'Coverage checkup' },
        { id: 'out-gap',     label: 'Getting there' },
        { id: 'hl-reading',  label: 'Reading from elsewhere' }
      ]
    },
    {
      id: 'foo-ladder',
      features: ['matchVesting'],
      /* One question at three amounts since D-231: the next $100, every
         month from here, a lump sum. The aliases carry the two rooms that
         became readings so a search for either still lands. */
      group: 'scorecard', aliases: ['foo', 'order of operations', 'next dollar', 'ladder',
                                    'next $100', 'next hundred', 'where does it go',
                                    'windfall', 'bonus', 'inheritance', 'lump sum'],
      kind: 'read',
      /* Every shared figure the month-by-month timeline reads, so the
         footer and the timeline cannot disagree about what is missing.
         The two prepaid figures stay local to the page and optional.
         BRIEF §1.1 item 2. */
      needs: ['grossAnnualIncome', 'filingStatus', 'monthlyExpenses', 'cashSavings', 'employerMatch', 'dob',
              'highestDeductible', 'contributionPercent', 'rothContributed', 'hsaContributed'],
      order: 23,
      title: 'What The Next Dollar Does',
      blurb: 'One question at three amounts: where the next $100 goes, what every month from here does as it walks the nine steps, and what to do with a lump sum all at once. The step number stands above all three.',
      href: 'rooms/foo-ladder.html',
      tier: 0,
      tags: ['cashflow', 'debt'],
      daite: { reads: ['assets.cashCents', 'assets.contributions.hsa', 'assets.contributions.pretax', 'assets.contributions.roth', 'expenses', 'income.grossAnnualCents', 'income.sources[].employerMatch', 'taxes.filingStatus', 'you.cover', 'you.dob'], writes: [] },
      /* The ladder reading has no stable anchors of its own (D-007); the
         other two readings do, and they are the old rooms' deep links. */
      subsections: [
        { id: 'view-next100',  label: 'The next $100' },
        { id: 'view-ladder',   label: 'Every month from here' },
        { id: 'view-windfall', label: 'A lump sum' },
        { id: 'ranked',        label: 'What the numbers say' },
        { id: 'the-money',     label: 'The lump-sum decision' },
        { id: 'out-when',      label: 'When spreading it wins' },
        { id: 'out-cost',      label: 'What the caution costs' },
        { id: 'out-scenarios', label: 'Suppose it did this instead' },
        { id: 'out-windows',   label: 'How long you take' }
      ]
    },
    {
      id: 'what-if-life',
      features: ['showNominal'],
      group: 'decisions', subgroup: 'years', aliases: ['what if', 'sabbatical', 'life event', 'triple d'],
      kind: 'explore',
      needs: ['grossAnnualIncome', 'monthlyExpenses', 'cashSavings', 'investments'],
      order: 28,
      title: 'What If, Life',
      blurb: 'A sabbatical, a move, a second income \u2014 one event at a time, three ways: dream, default, disaster.',
      href: 'rooms/what-if-life.html',
      tier: 2,
      tags: ['cashflow', 'income'],
      daite: { reads: ['assets.cashCents', 'assets.invested', 'expenses', 'income.grossAnnualCents'], writes: ['scenarios'] },
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

  /* The Degree Decision (K9, D-219): a degree as a sum, the break-even age
     and the lifetime difference as ranges, the FI date with and without. */
  ROOMS.push({
    id: 'degree',
    group: 'decisions', subgroup: 'work', aliases: ['degree', 'masters', 'mba', 'go back to school', 'tuition', 'break-even'],
    appliesWhen: 'situation != retired',
    kind: 'explore',
    needs: ['dob'],
    order: 37.7,
    title: 'The Degree Decision',
    blurb: 'A degree as a sum: tuition, the pay given up, the loan and employer help against the pay with it and without it, each a range. The break-even age, the lifetime difference by 65, and the FI date with and without.',
    href: 'rooms/degree.html',
    tier: 2,
    tags: ['income'],
    daite: { reads: ['income.grossAnnualCents', 'you.dob', 'expenses', 'taxes.filingStatus', 'assets.invested'], writes: [] },
    subsections: [{ id: 'answer', label: 'Break-even' }, { id: 'inputs', label: 'The degree' }, { id: 'sum', label: 'The sum' }]
  });

  /* The Timeline — jobs and benefits as dated periods that stack, and the
     months they add up to (D-152). It OWNS futureIncome[], which used to be
     edited on The Statement: a dated period belongs in the room that draws
     it on a grid. Placed after the numbered path because it is a planning
     room, not a fact-gathering one — you need to know what today is before
     laying out what comes after it. */
  ROOMS.push({
    id: 'timeline',
    features: ['showMilestones'],
    group: 'decisions', subgroup: 'years', aliases: ['timeline', 'jobs', 'what comes next', 'life'],
    kind: 'about-you',
    needs: ['dob'],
    order: 28.5,
    title: 'What Comes Next',
    blurb: 'Jobs, benefits and anything else that pays, each as a period with a start and an end — laid end to end so you can see where they overlap, where the gaps are, and what any month between now and then actually adds up to.',
    href: 'rooms/timeline.html',
    tier: 0,
    tags: ['income', 'cashflow'],
    daite: { reads: ['you.dob'], writes: ['income.future', 'you.periods'] },
    subsections: [
      { id: 'out-months',  label: 'The months ahead' },
      { id: 'out-periods', label: 'What you have listed' },
      { id: 'out-gaps',    label: 'Gaps and overlaps' },
      { id: 'reading',     label: 'Reading from elsewhere' }
    ]
  });

  /* Your Statements — the three documents a company files, for a household,
     plus the period in words (D-156). A `read` room: it owns nothing, writes
     nothing, and every figure on it belongs to another room. */
  ROOMS.push({
    id: 'statements',
    group: 'scorecard', aliases: ['statements', 'history of net worth', 'monthly statement'],
    kind: 'read',
    needs: ['grossAnnualIncome', 'monthlyExpenses', 'cashSavings', 'investments', 'totalDebt'],
    order: 4.5,
    title: 'Your Statements',
    blurb: 'An income statement, a cash flow statement and a balance sheet — the three documents a company produces every quarter, for a household. Plus the same period written out in sentences.',
    href: 'rooms/statements.html',
    tier: 0,
    tags: ['income', 'cashflow', 'debt'],
    daite: { reads: ['assets.cashCents', 'assets.invested', 'debt.items', 'expenses', 'income.grossAnnualCents'], writes: [] },
    subsections: [
      { id: 'out-basis', label: 'What these are built from' },
      { id: 'out-doc',   label: 'The statements' },
      { id: 'out-how',   label: 'How each line is worked out' }
    ]
  });

  /* Settings — every user-scope feature switch on one screen (D-180). */
  ROOMS.push({
    id: 'settings',
    group: 'upkeep', aliases: ['settings', 'switches', 'features', 'preferences', 'toggles', 'backup'],
    kind: 'core',
    utility: true,
    needs: [],
    order: 98.5,
    title: 'Settings',
    blurb: 'Every switch, on one screen: what makes the numbers more honest, who is in the household, how far ahead to look, and what a beginner can skip. Nothing here changes a stored number.',
    href: 'rooms/settings.html',
    tier: 0,
    tags: ['income', 'cashflow', 'debt'],
    daite: { reads: [], writes: ['prefs.features'] },
    subsections: [
      { id: 'accuracy',  label: 'Accuracy' },
      { id: 'household', label: 'Household' },
      { id: 'horizon',   label: 'Horizon' },
      { id: 'advanced',  label: 'Advanced' },
      { id: 'backup',    label: 'Backup' }
    ]
  });

  /* Protection — the tranche rooms on the template (D-098). */
  ROOMS.push({
    id: 'protection',
    features: ['agingParents'],
    /* Two readings since D-236: what stands behind you if a year goes
       wrong, and where it all goes if the worst does. */
    group: 'decisions', subgroup: 'family',
    aliases: ['insurance', 'life insurance', 'disability', 'coverage',
              'estate', 'will', 'beneficiary', 'power of attorney', 'what happens if'],
    kind: 'about-you',
    needs: ['monthlyExpenses', 'cashSavings', 'grossAnnualIncome'],
    order: 32,
    title: 'Protection',
    blurb: 'What a bad year would cost and what stands behind you — health, disability, life, the cushion — and the three estate facts that decide where it all goes if the worst happens.',
    href: 'rooms/protection.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['assets.cashCents', 'assets', 'expenses', 'income.grossAnnualCents', 'you.dependents'], writes: ['expenses.insurance', 'you.cover', 'you.estate'] },
      subsections: [
        { id: 'view-cover',         label: 'Cover' },
        { id: 'view-where-it-goes', label: 'Where it goes' },
        { id: 'number',      label: 'The biggest gap' },
        { id: 'chart',       label: 'Need against held' },
        { id: 'inputs',      label: 'Health cover' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'es-number',   label: 'What would pass without them' },
        { id: 'es-inputs',   label: 'The three facts' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Decumulation — the tranche rooms on the template (D-098). */
  ROOMS.push({
    id: 'decumulation',
    features: ['showNominal', 'showMilestones', 'sequenceRisk', 'preMedicare', 'incomeFloor', 'inheritanceRules'],
    group: 'decisions', subgroup: 'moves', aliases: ['retirement withdrawals', 'draw down', '4%', 'vpw', 'social security'], appliesWhen: 'situation != student',
    kind: 'about-you',
    needs: ['investments', 'monthlyExpenses', 'grossAnnualIncome'],
    order: 33,
    title: 'Drawing It Down',
    blurb: 'How a retiree draws: the withdrawal rate against the convention, what the variable-percentage table allows at your age, and the age the money lasts to.',
    href: 'rooms/decumulation.html',
    tier: 2,
    tags: ['income'],
    daite: { reads: ['assets.invested', 'expenses', 'income.grossAnnualCents'], writes: ['assets.allocation', 'plans.decumulation'] },
      subsections: [
        { id: 'number',      label: 'The age the money lasts to' },
        { id: 'chart',       label: 'The balance, year by year' },
        { id: 'inputs',      label: 'How you draw' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Roth Conversions Before 65 (J8, D-216): conversions are reported
     income and reported income sets the marketplace premium; the two priced
     together to Medicare, as a range across the cliff-on and cliff-off
     rules. Behind the preMedicare switch. */
  ROOMS.push({
    id: 'roth-aca',
    features: ['preMedicare'],
    group: 'decisions', subgroup: 'moves', aliases: ['roth conversion', 'aca', 'marketplace', 'obamacare', 'subsidy cliff', 'premium tax credit', 'before 65'],
    appliesWhen: 'situation != student',
    kind: 'explore',
    needs: ['dob', 'filingStatus'],
    order: 33.5,
    title: 'Roth Conversions Before 65',
    blurb: 'Converting pre-tax money to Roth is reported income, and reported income sets what the marketplace charges for health cover until Medicare. Year by year to 65, tax and premiums together, as a range.',
    href: 'rooms/roth-aca.html',
    tier: 2,
    tags: ['income'],
    daite: { reads: ['assets.invested', 'taxes.filingStatus', 'you.dob'], writes: [] },
    subsections: [
      { id: 'number',      label: 'Tax and premiums, together, to 65' },
      { id: 'inputs',      label: 'The what-if' },
      { id: 'years',       label: 'Year by year' },
      { id: 'assumptions', label: 'Assumptions' }
    ]
  });

  /* Micro-Retirement Planner (K5, D-219): a planned break of 1 to 12 months,
     what it costs and what it buys on one screen. */
  ROOMS.push({
    id: 'micro-retirement',
    group: 'decisions', subgroup: 'work', aliases: ['micro-retirement', 'mini retirement', 'sabbatical', 'break', 'gap year', 'time off'],
    appliesWhen: 'situation != retired',
    kind: 'explore',
    needs: ['monthlyExpenses'],
    order: 31.7,
    title: 'Micro-Retirement Planner',
    blurb: 'A planned break from work of one to twelve months: the fund it needs with health cover and a re-entry cushion, the date you would be ready, how far the FI date moves, the career-momentum cost as a range, and what the break buys in weeks.',
    href: 'rooms/micro-retirement.html',
    tier: 2,
    tags: ['cashflow', 'income'],
    daite: { reads: ['expenses', 'assets.cashCents', 'income.grossAnnualCents', 'taxes.filingStatus', 'you.dob', 'assets.invested'], writes: [] },
    subsections: [{ id: 'fund', label: 'The fund' }, { id: 'sides', label: 'Both sides' }]
  });
  /* The Middle Class Trap Test (K1, D-218): both sides of the debate on
     the household's numbers, four paths to the pre-tax money, each with a
     verdict and its range. */
  ROOMS.push({
    id: 'middle-class-trap',
    group: 'decisions', subgroup: 'moves', aliases: ['middle class trap', 'trap', 'bridge', 'roth ladder', '72t', 'rule of 55', 'early retirement'],
    appliesWhen: 'situation != student',
    kind: 'explore',
    needs: ['dob', 'monthlyExpenses'],
    order: 33.7,
    title: 'The Middle Class Trap Test',
    blurb: 'Is a net worth that is mostly the house and the 401(k) a trap before 59 and a half, or a planning problem? Both sides on your numbers: bridge accounts, the Roth conversion ladder, 72(t) payments and the Rule of 55, year by year, each with a verdict and its range.',
    href: 'rooms/middle-class-trap.html',
    tier: 2,
    tags: ['income'],
    daite: { reads: ['assets', 'assets.invested', 'expenses', 'income.grossAnnualCents', 'taxes.filingStatus', 'you.dob', 'plans.targets'], writes: [] },
    subsections: [{ id: 'verdict', label: 'What the numbers say' }, { id: 'debate', label: 'The debate' }, { id: 'paths', label: 'Four paths' }, { id: 'years', label: 'Year by year' }, { id: 'assumptions', label: 'Assumptions' }]
  });
  /* The Referee (K3, D-218): debates as buttons, both sides on your numbers. */
  ROOMS.push({
    id: 'debates',
    group: 'matters', aliases: ['referee', 'debate', 'debates', 'both sides', 'flip point', 'mortgage or invest', 'roth or traditional', 'rent or buy'],
    kind: 'explore',
    needs: [],
    order: 48.5,
    title: 'The Referee',
    blurb: 'Money debates people already have, both sides stated fairly with their sources, run on your numbers: the answer as a range, the flip point where it changes, and how close you sit to it.',
    href: 'rooms/debates.html',
    tier: 2,
    tags: ['income', 'debt'],
    daite: { reads: ['assets.invested', 'debt.items', 'expenses', 'expenses.needs.accommodation', 'income.grossAnnualCents', 'taxes.filingStatus', 'you.dob'], writes: [] },
    subsections: [{ id: 'pick', label: 'Pick a debate' }, { id: 'answer', label: 'The answer' }, { id: 'sides', label: 'Both sides' }]
  });
  /* Tax — the tranche rooms on the template (D-098). */
  ROOMS.push({
    id: 'tax',
    features: ['equityComp', 'inheritanceRules', 'givingVehicles'],
    group: 'numbers', subgroup: 'taxes', aliases: ['taxes', 'bracket', 'marginal', 'effective', 'refund', 'withholding'],
    kind: 'about-you',
    needs: ['grossAnnualIncome', 'filingStatus', 'state'],
    order: 34,
    title: 'Tax',
    blurb: 'Federal, state and payroll tax on your income: the effective rate, the marginal bracket and the room left in it, and whether a refund or a bill is coming.',
    href: 'rooms/tax.html',
    tier: 2,
    tags: ['income'],
    daite: { reads: ['income.grossAnnualCents', 'taxes.filingStatus', 'taxes.state'], writes: ['taxes.otherPreTax', 'taxes.withheld'] },
      subsections: [
        { id: 'number',      label: 'Your effective rate' },
        { id: 'chart',       label: 'Where a dollar of pay goes' },
        { id: 'inputs',      label: 'Pre-tax and withheld' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Giving — the tranche rooms on the template (D-098). */
  ROOMS.push({
    id: 'giving',
    features: ['givingVehicles'],
    group: 'decisions', subgroup: 'family', aliases: ['giving', 'charity', 'donate', 'tithe', 'daf'],
    kind: 'about-you',
    needs: ['grossAnnualIncome'],
    order: 36,
    title: 'Giving',
    blurb: 'A share of income given, what it is in dollars and in months of FI, and where it sits against the conventions.',
    href: 'rooms/giving.html',
    tier: 2,
    tags: ['income'],
    daite: { reads: ['income.grossAnnualCents'], writes: ['expenses.giving'] },
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
    features: ['matchVesting', 'studentLoanPaths'],
    group: 'decisions', subgroup: 'work', aliases: ['job offer', 'new job', 'raise', 'offer'], appliesWhen: 'situation != retired',
    kind: 'about-you',
    needs: ['grossAnnualIncome'],
    order: 37,
    title: 'Career Move',
    blurb: 'An offer against the job you have: the real hourly wage of each, the take-home difference, and how far the FI date moves.',
    href: 'rooms/career-move.html',
    tier: 2,
    tags: ['income'],
    daite: { reads: ['income.grossAnnualCents'], writes: ['plans.careerMove'] },
      subsections: [
        { id: 'number',      label: 'The real difference an hour' },
        { id: 'chart',       label: 'Now against the offer' },
        { id: 'inputs',      label: 'The offer' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Offer Compare (K8, D-219): two to four offers priced as what they are
     worth in a year and per real hour, with the FI date under each. */
  ROOMS.push({
    id: 'offer-compare',
    group: 'decisions', subgroup: 'work', aliases: ['offer', 'offers', 'job offer', 'compare offers', 'match', 'equity', 'negotiate'],
    appliesWhen: 'situation != retired',
    kind: 'explore',
    needs: [],
    order: 37.5,
    title: 'Offer Compare',
    blurb: 'Two to four job offers side by side: each one’s real yearly value after the match, health premiums and the commute, its value per real hour, the FI date under each, and the one line that decides it.',
    href: 'rooms/offer-compare.html',
    tier: 2,
    tags: ['income'],
    daite: { reads: ['expenses', 'income.grossAnnualCents', 'taxes.filingStatus', 'taxes.state', 'assets.invested'], writes: ['income.grossAnnualCents', 'income.sources[].employerMatch', 'taxes.state'] },
    subsections: [{ id: 'decider', label: 'What decides it' }, { id: 'offers', label: 'The offers' }, { id: 'results', label: 'Side by side' }]
  });

  /* Partner — the second wave of tranche rooms (D-099). */
  ROOMS.push({
    id: 'partner',
    group: 'decisions', subgroup: 'family', aliases: ['partner', 'marriage', 'combine', 'spouse'],
    kind: 'about-you',
    needs: ['grossAnnualIncome', 'monthlyExpenses'],
    order: 38,
    title: 'Partner',
    blurb: 'Two incomes, one household: how the shared month is split, what each of you keeps, and how much rides on one paycheque.',
    href: 'rooms/partner.html',
    tier: 2,
    tags: ['income', 'cashflow'],
    daite: { reads: ['expenses', 'income.grossAnnualCents', 'you.partner'], writes: ['expenses.shared', 'you.partner'] },
      subsections: [
        { id: 'view',        label: 'Which view' },
        { id: 'track',       label: 'Are we on track?' },
        { id: 'number',      label: 'Each share of the shared month' },
        { id: 'chart',       label: 'The shared month, split' },
        { id: 'inputs',      label: 'How you split' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'tags',        label: 'Yours, mine, ours' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Wedding Countdown (K11, D-217): a total or a build-up, dated through the
     one countdown; each extra table in dollars and FI days. */
  ROOMS.push({
    id: 'wedding',
    group: 'decisions', subgroup: 'family', aliases: ['wedding', 'engagement', 'ring', 'guests', 'marry'],
    kind: 'explore',
    needs: [],
    order: 38.5,
    title: 'Wedding Countdown',
    blurb: 'The date the wedding is paid for with no debt, from a total or from guests, fixed costs and the ring, and what every extra table costs in dollars and in days of financial independence.',
    href: 'rooms/wedding.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['expenses', 'income.grossAnnualCents', 'assets.invested'], writes: [] },
    subsections: [{ id: 'date', label: 'Affordable, with no debt' }, { id: 'inputs', label: 'The wedding, and the fund' }, { id: 'tables', label: 'Every extra table' }]
  });
  /* Kids and Tuition — the second wave of tranche rooms (D-099). */
  ROOMS.push({
    id: 'kids',
    group: 'decisions', subgroup: 'family', aliases: ['kids', 'children', 'childcare', 'tuition', '529'],
    kind: 'about-you',
    needs: ['monthlyExpenses'],
    order: 39,
    title: 'Kids and Tuition',
    blurb: 'What each child costs a year at their age, childcare while they are small, and what tuition needs a month to land on time.',
    href: 'rooms/kids.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['expenses'], writes: ['assets.invested', 'plans.kids'] },
      subsections: [
        { id: 'number',      label: 'What the kids cost a year' },
        { id: 'chart',       label: 'By child, a month' },
        { id: 'inputs',      label: 'Tuition' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* The Deal — Tier 17 (D-227). Housing Decision asks whether to buy where
     you live; this asks whether a building pays, and what living in one
     unit of it would cost. Both sit on engines/ownership.js. */
  ROOMS.push({
    id: 'property',
    group: 'decisions', subgroup: 'home',
    aliases: ['rental', 'landlord', 'house hack', 'investment property', 'deal', 'cap rate', 'real estate'],
    kind: 'about-you',
    needs: [],
    order: 40.7,
    title: 'The Deal',
    blurb: 'A property priced the way it actually runs: the reserves a listing leaves out, the four ways it pays, what breaks it, and what living in one unit would cost against renting.',
    href: 'rooms/property.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: [], writes: ['assets.property'] },
    subsections: [
      { id: 'deal',        label: 'The deal' },
      { id: 'month',       label: 'What it costs a month' },
      { id: 'letting',     label: 'Let it out' },
      { id: 'return',      label: 'The four ways it pays' },
      { id: 'stress',      label: 'What breaks it' },
      { id: 'hack',        label: 'Live in one, let the rest' },
      { id: 'assumptions', label: 'Where the rates come from' }
    ]
  });

  /* Housing Decision — the second wave of tranche rooms (D-099). */
  ROOMS.push({
    id: 'housing',
    features: ['homeDetail'],
    group: 'decisions', subgroup: 'home', aliases: ['house', 'buy', 'rent', 'mortgage', 'home'],
    kind: 'about-you',
    needs: ['monthlyExpenses', 'grossAnnualIncome', 'cashSavings'],
    order: 40,
    title: 'Housing Decision',
    blurb: 'Rent against buying, this place, this rate: the monthly cost of each, the price-to-rent ratio, and the years to a down payment.',
    href: 'rooms/housing.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['assets.cashCents', 'expenses', 'income.grossAnnualCents'], writes: ['plans.housing'] },
      subsections: [
        { id: 'number',      label: 'Own against rent, a month' },
        { id: 'chart',       label: 'Rent against own' },
        { id: 'inputs',      label: 'The place' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Down Payment Countdown (K6, D-217): what each way in needs in cash, the
     date at the pace, and the payment at each. */
  ROOMS.push({
    id: 'down-payment',
    group: 'decisions', subgroup: 'moves', aliases: ['down payment', 'save for a house', 'fha', 'pmi', 'closing costs', 'first home'],
    kind: 'explore',
    needs: [],
    order: 40.5,
    title: 'Down Payment Countdown',
    blurb: 'For a home price, the date you could buy at 3.5%, 5%, 10% and 20% down, each with closing costs and the lender’s reserves counted, and the monthly payment at each with tax, insurance and mortgage insurance where it applies.',
    href: 'rooms/down-payment.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['taxes.state'], writes: [] },
    subsections: [{ id: 'inputs', label: 'The home, and the fund' }, { id: 'options', label: 'Four ways in' }]
  });

  /* Big Purchase — the second wave of tranche rooms (D-099). */
  ROOMS.push({
    id: 'big-purchase',
    group: 'decisions', subgroup: 'home', aliases: ['purchase', 'buy something', 'save up'],
    kind: 'about-you',
    needs: ['cashSavings', 'monthlyExpenses'],
    order: 41,
    title: 'Big Purchase',
    blurb: 'One thing you are eyeing: hours of your life, months of FI, what the cash looks like after, and what financing it costs.',
    href: 'rooms/big-purchase.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['assets.cashCents', 'expenses'], writes: ['plans.purchase'] },
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
    group: 'numbers', subgroup: 'income', aliases: ['freelance', 'commission', 'irregular', 'rolling average'],
    kind: 'about-you',
    needs: ['grossAnnualIncome', 'monthlyExpenses'],
    order: 42,
    title: 'Variable Income',
    blurb: 'A low month, a high month, an average: the salary to pay yourself, the buffer that smooths the gap, and how many low months it covers.',
    href: 'rooms/variable-income.html',
    tier: 2,
    tags: ['income'],
    daite: { reads: ['expenses', 'income.grossAnnualCents'], writes: ['income.variable'] },
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
    group: 'matters', aliases: ['enough', 'contentment', 'fi two'],
    kind: 'about-you',
    needs: ['monthlyExpenses', 'investments'],
    order: 43,
    title: 'Enough',
    blurb: 'The monthly figure you would live on by choice — typed, or proposed from the joy curve — and the second FI number it makes, against the first.',
    href: 'rooms/enough.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['assets.invested', 'expenses'], writes: ['plans.enough'] },
      subsections: [
        { id: 'number',      label: 'Enough, a month' },
        { id: 'chart',       label: 'Two FI numbers' },
        { id: 'inputs',      label: 'What enough is' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* The Long Way Round — four strategies over five years (D-167). Sits beside
     Enough because both ask what the money is for, not just how much. */
  ROOMS.push({
    id: 'adventure',
    features: ['showNominal', 'showMilestones', 'sequenceRisk', 'jobLossCushions', 'timeBudget'],
    group: 'decisions', subgroup: 'years', aliases: ['five years', 'long way', 'paths', 'scenario', 'shocks'],
    kind: 'explore',
    needs: ['grossAnnualIncome', 'monthlyExpenses', 'investments'],
    order: 43.5,
    title: 'The Long Way Round',
    blurb: 'Every way through the next five years on one card each, measured against drifting \u2014 then one chart, the headwinds and tailwinds, and a link you can keep.',
    href: 'rooms/adventure.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['assets.invested', 'assets.cashCents', 'expenses', 'income.grossAnnualCents', 'debt.items'], writes: [] },
    utility: false,
    subsections: [
      { id: 's-stand', label: 'Where you stand' },
      { id: 's-ways',  label: 'The ways through' },
      { id: 's-way',   label: 'The chosen way' }
    ]
  });

  /* Designed Week — the LATER.md rooms (D-101). */
  ROOMS.push({
    id: 'week',
    features: ['timeBudget'],
    group: 'matters',
    aliases: ['week', 'hours', 'designed week', 'time', 'time buckets', 'decades', 'experiences', 'die with zero'],
    kind: 'about-you',
    needs: ['monthlyExpenses'],
    order: 44,
    title: 'The Life',
    blurb: 'The week you would design, priced, and the decades you plan to spend \u2014 whether the life you want and the money for it line up in time.',
    href: 'rooms/week.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['expenses', 'assets.invested'], writes: ['plans.week', 'plans.buckets'] },
      subsections: [
        { id: 'number',      label: 'The designed week, a month' },
        { id: 'chart',       label: 'Where the hours go' },
        { id: 'inputs',      label: 'The blocks' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' },
        { id: 'bk-number',   label: 'Planned, all decades' },
        { id: 'bk-chart',    label: 'By decade' },
        { id: 'bk-inputs',   label: 'Each decade' }
      ]
  });

  /* Dreamline — the LATER.md rooms (D-101). */
  ROOMS.push({
    id: 'dreamline',
    group: 'matters', aliases: ['dream', 'price the dream', 'dreamline'],
    kind: 'about-you',
    needs: ['monthlyExpenses', 'grossAnnualIncome'],
    order: 46,
    title: 'Price the Dream',
    blurb: 'Price the dreams a month, add the cost of living, pad it: the target monthly income, and the hours a week at your real rate it takes.',
    href: 'rooms/dreamline.html',
    tier: 2,
    tags: ['income'],
    daite: { reads: ['expenses', 'income.grossAnnualCents'], writes: ['plans.dreams'] },
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
    group: 'matters', aliases: ['undo', 'reversible', 'one-way door'],
    kind: 'about-you',
    needs: ['cashSavings', 'monthlyExpenses'],
    order: 47,
    title: 'Can It Be Undone',
    blurb: 'A decision you are weighing: what it would cost to undo, and how long — a door, or a one-way street.',
    href: 'rooms/reversibility.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['assets.cashCents', 'expenses'], writes: ['plans.reversibility'] },
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
    group: 'matters', aliases: ['unlearn', 'myths', 'advice'],
    kind: 'about-you',
    needs: ['monthlyExpenses'],
    order: 48,
    title: 'Unlearning',
    blurb: 'The advice everyone hears, sorted by whether it still applies to you — and the rules you have let go of.',
    href: 'rooms/unlearning.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['expenses'], writes: ['plans.unlearning'] },
      subsections: [
        { id: 'number',      label: 'Rules that no longer apply' },
        { id: 'chart',       label: 'Applies, past it, not yet' },
        { id: 'inputs',      label: 'Let go' },
        { id: 'rules',       label: 'Does it apply to you now?' },
        { id: 'quiz',        label: 'The Unlearning Quiz' },
        { id: 'amounts',     label: 'Through the lens' },
        { id: 'assumptions', label: 'Assumptions' },
        { id: 'reading',     label: 'What this reads' }
      ]
  });

  /* Student Loan Decision — the LATER.md rooms (D-101). */
  ROOMS.push({
    id: 'student-loans',
    features: ['studentLoanPaths'],
    group: 'numbers', subgroup: 'debt', aliases: ['college', 'loan forgiveness', 'idr'],
    kind: 'about-you',
    needs: ['totalDebt', 'grossAnnualIncome'],
    order: 49,
    title: 'Student Loan Decision',
    blurb: 'Standard, income-driven, or aggressive: what each pays a month, when each clears, and what each costs in interest — for the loans you listed.',
    href: 'rooms/student-loans.html',
    tier: 2,
    tags: ['debt'],
    daite: { reads: ['debt.items', 'income.grossAnnualCents'], writes: ['debt.items[].plan'] },
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
    features: ['annualLines'],
    group: 'numbers', subgroup: 'expenses', aliases: ['calendar', 'bills', 'due', 'pay later', 'dates'],
    kind: 'about-you',
    needs: ['monthlyExpenses', 'cashSavings'],
    order: 50,
    title: 'Money Calendar & Pay-Later',
    blurb: 'Paydays and bills across a month, pay-later instalments counted: the low point, and the day it lands.',
    href: 'rooms/calendar.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['assets.cashCents', 'expenses'], writes: ['expenses.log', 'income.cadence'] },
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
    group: 'upkeep', aliases: ['history', 'changes', 'log'],
    kind: 'read',
    needs: ['cashSavings', 'investments', 'totalDebt'],
    order: 51,
    title: 'History',
    blurb: 'Every snapshot you froze, and what moved between them: net worth over time, and the log of what you changed.',
    href: 'rooms/history.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['assets.cashCents', 'assets.invested', 'debt.items'], writes: ['prefs.history'] },
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
    group: 'upkeep', aliases: ['export', 'import', 'backup', 'json', 'csv', 'your data', 'bank csv', 'statement download'],
    kind: 'core',
    utility: true,
    needs: [],
    order: 98,
    title: 'Your Data',
    blurb: 'Download a file, copy a share link, load one — replacing or adding to what is here — or paste in a statement and have every line sorted into the debt, account, expense or income it is.',
    href: 'rooms/data.html',
    tier: 0,
    tags: ['income', 'cashflow', 'debt'],
    daite: { reads: [], writes: ['assets', 'debt', 'expenses', 'income', 'plans', 'taxes', 'you'] },
    subsections: [
      { id: 'out',   label: 'Take it with you' },
      { id: 'file',  label: 'Load a file' },
      { id: 'paste', label: 'Paste in new numbers' },
      { id: 'bank',  label: 'Bank CSV' },
      { id: 'sheet', label: 'A spreadsheet, and the app' },
      { id: 'reset', label: 'Start over' }
    ]
  });

  /* The One-Pager (K2, D-219): one page of the household for any
     conversation; Private with full numbers, Public with ratios and time. */
  ROOMS.push({
    id: 'one-pager',
    /* Three things to hand over since D-234: the progress card, the year in
       four lines, and the whole page. The aliases carry all three. */
    group: 'upkeep', aliases: ['one pager', 'one-pager', 'snapshot page', 'print', 'share with a coach', 'lender', 'planner',
                               'card', 'progress card', 'share progress', 'shape not size',
                               'wrapped', 'money wrapped', 'my year', 'year in review'],
    kind: 'read',
    needs: ['grossAnnualIncome'],
    order: 98.3,
    title: 'The Card',
    blurb: 'Everything you would hand someone else, three ways: a progress card that carries the shape and never the size, your year in four lines, and the whole page for a lender or a planner.',
    href: 'rooms/one-pager.html',
    tier: 1,
    tags: ['income', 'cashflow', 'debt'],
    daite: { reads: ['assets', 'debt.items', 'expenses', 'income.grossAnnualCents', 'taxes.filingStatus', 'taxes.state', 'you.dob', 'you.situation', 'plans.targets'], writes: [] },
    subsections: [
      { id: 'view-the-card', label: 'The card' },
      { id: 'view-the-year', label: 'The year' },
      { id: 'view-the-page', label: 'The whole page' },
      { id: 'the-card',      label: 'Share the shape' },
      { id: 'audience',      label: 'Who is it for' },
      { id: 'page',          label: 'The page' }
    ]
  });

  /* Where every room's out-of-scope line points (D-097). Reads the gate for
     a line per stage; owns nothing; optional by definition. */
  ROOMS.push({
    id: 'get-help',
    group: 'upkeep', aliases: ['help', 'advisor', 'counsellor', 'crisis'],
    kind: 'explore',
    utility: true,
    needs: [],
    order: 29,
    title: 'Get Help',
    blurb: 'What these rooms deliberately do not do, and what kind of person answers those questions. Kinds of help, never a name.',
    href: 'rooms/get-help.html',
    tier: 0,
    tags: ['income', 'cashflow', 'debt'],
    daite: { reads: [], writes: [] },
    subsections: [
      { id: 'not-here', label: 'What these rooms do not do' },
      { id: 'who',      label: 'Who answers them' },
      { id: 'stage',    label: 'At your stage' }
    ]
  });

  /* Reachable Money (H4, D-212): an amount and a by-when; the order to pull
     it and what each dollar costs on the way out. Reads only. */
  ROOMS.push({
    id: 'reachable',
    group: 'decisions', subgroup: 'moves', aliases: ['reachable', 'waterfall', 'emergency money', 'pull money', 'liquid'],
    kind: 'explore',
    needs: ['cashSavings'],
    order: 12.5,
    title: 'Reachable Money',
    blurb: 'If you needed money, where would it come from and what would each dollar cost on the way out? Cash and Roth contributions free, taxable on the gains, pre-tax with the penalty. Home equity shown, never counted.',
    href: 'rooms/reachable.html',
    tier: 1,
    tags: ['cashflow'],
    daite: { reads: ['assets.cashCents', 'assets.items', 'debt.items', 'income.grossAnnualCents', 'taxes.filingStatus', 'you.dob'], writes: [] },
    subsections: [
      { id: 'headline', label: 'In an emergency' },
      { id: 'pull',     label: 'A specific amount' }
    ]
  });

  /* Your Coast Date (I4, D-213): its own formula, not a FIRE variant. */
  ROOMS.push({
    id: 'coast-date',
    group: 'scorecard', aliases: ['coast', 'coast date', 'stop saving', 'coast fire date'],
    kind: 'read',
    needs: ['dob', 'investments', 'monthlyExpenses'],
    order: 25.5,
    title: 'Your Coast Date',
    blurb: 'The earliest date you could stop saving for retirement and still reach the FI number by your target age, in today’s dollars; and what today’s money grows to with nothing more added.',
    href: 'rooms/coast-date.html',
    tier: 1,
    tags: ['cashflow'],
    daite: { reads: ['assets.invested', 'expenses', 'income.grossAnnualCents', 'taxes.filingStatus', 'you.dob'], writes: [] },
    subsections: [{ id: 'date', label: 'Coast date' }, { id: 'reverse', label: 'The reverse view' }]
  });
  /* The Race to $100K (K4, D-217): the next rung and every rung to $1M, dated
     through the one countdown, with saving and growth split at each. */
  ROOMS.push({
    id: 'race',
    group: 'scorecard', aliases: ['race', '100k', 'first 100k', 'rungs', 'million'],
    kind: 'read',
    needs: ['cashSavings', 'monthlyExpenses', 'grossAnnualIncome'],
    order: 25.9,
    title: 'The Race to $100K',
    blurb: 'The date your net worth reaches its next $100,000 rung, then every rung to $1 million, with what came from saving and what came from growth at each. The first $100K is the hardest; this shows why.',
    href: 'rooms/race.html',
    tier: 1,
    tags: ['cashflow'],
    daite: { reads: ['assets', 'assets.cashCents', 'debt.items', 'expenses', 'income.grossAnnualCents', 'taxes.filingStatus'], writes: [] },
    subsections: [{ id: 'next', label: 'The next rung' }, { id: 'rungs', label: 'Every rung to $1 million' }]
  });
  /* `needs` lists the shared fields a room reads before it can show its main
     output — the ids in shared/ownership.js, which know who owns each one and
     which question to land on. shared/progress.js turns that into "what is
     left, and where", and test/run.js checks every id is real. An empty list
     means the room stands on its own. See DECISIONS.md D-050. */

  /* The path, in the order a person should walk it (SPEC.md §12.6 keeps the
     tag filter; this adds the sequence the filter sits on top of). */
  /* ---- The sidebar's groups (D-177). Purpose, not kind: kind stays a
     property for ownership rules and is no longer a heading. Subgroups are
     labels, never links. DRAFTT and the map are links into pages that are
     not rooms; they ride in `links`. ---- */
  var GROUPS = [
    { id: 'home',      label: 'Home' },
    { id: 'numbers',   label: 'Your Numbers', note: 'the owners; everything else reads from here',
      subgroups: [{ id: 'debt', label: 'Debt' }, { id: 'assets', label: 'Assets' }, { id: 'income', label: 'Income' }, { id: 'taxes', label: 'Taxes' }, { id: 'expenses', label: 'Expenses' }] },
    { id: 'scorecard', label: 'Scorecard', note: 'read-only',
      links: [{ after: 'financial-snapshot', title: 'DRAFTT', href: 'rooms/financial-snapshot.html#draftt', aliases: ['draftt', 'measuring stick', 'bands'] }] },
    { id: 'decisions', label: 'Decisions', note: 'calculators',
      subgroups: [{ id: 'work', label: 'Work' }, { id: 'home', label: 'Home & things' }, { id: 'family', label: 'Family' }, { id: 'moves', label: 'Money moves' }, { id: 'years', label: 'Years out' }] },
    { id: 'matters',   label: 'What Matters' },
    { id: 'levelup',   label: 'Level Up' },
    { id: 'upkeep',    label: 'Upkeep',
      links: [{ after: 'history', title: 'Every room, on one page', href: 'map.html', aliases: ['map', 'all rooms', 'every room'] }] }
  ];
  /* The order the brief lists rooms within a group, where it differs from
     path order. Anything not named falls in after, in path order. */
  var GROUP_ORDER = {
    home: ['dashboard', 'planner', 'start'],
    numbers: ['debt-payoff', 'student-loans', 'cant-pay', 'credit', 'statement', 'accounts', 'rollover', 'income', 'variable-income', 'real-hourly-wage', 'tax', 'budget', 'expenses', 'cash-flow', 'variance', 'calendar'],
    scorecard: ['financial-snapshot', 'foo-ladder', 'fire', 'fire-lab', 'statements'],
    decisions: ['career-move', 'self-employed', 'side-hustle', 'credential', 'housing', 'big-purchase', 'car', 'worth', 'hassle', 'partner', 'kids', 'protection', 'estate', 'giving', 'runway', 'decumulation', 'adventure', 'what-if-life', 'timeline'],
    matters: ['values', 'goals', 'enough', 'fulfillment', 'rerank', 'dreamline', 'week', 'buckets', 'reversibility', 'unlearning'],
    levelup: ['skill-tree', 'stacker', 'exercises'],
    upkeep: ['data', 'ledger', 'history', 'settings', 'get-help']
  };
  function groups() { return GROUPS.slice(); }
  function groupById(id) { return GROUPS.filter(function (g) { return g.id === id; })[0] || null; }
  /** A room's appliesWhen, read against a situation id — a few fixed
      phrases, never evaluated as code (the levers use the same idiom). */
  function appliesToSituation(room, situationId) {
    var w = room && room.appliesWhen;
    if (!w) return true;
    if (!situationId) return true;                /* situation unanswered: everything applies */
    return String(w).split('||').every(function (c) {
      c = c.trim();
      var m = /^situation\s*(!=|==)\s*([a-zA-Z]+)$/.exec(c);
      if (!m) return true;
      return m[1] === '!=' ? situationId !== m[2] : situationId === m[2];
    });
  }
  /** The rooms of one group in the brief's order, absent when their
      appliesWhen fails for this household's situation. */
  function inGroup(groupId, situationId) {
    var order = GROUP_ORDER[groupId] || [];
    var rooms = ROOMS.filter(function (r) { return r.group === groupId && appliesToSituation(r, situationId); });
    return rooms.sort(function (a, b) {
      var ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return (a.order || 99) - (b.order || 99);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
  /** Does a query match this room? Title, or any alias, case-blind. */
  function matches(room, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    if (String(room.title || '').toLowerCase().indexOf(q) !== -1) return true;
    return (room.aliases || []).some(function (a) { return String(a).toLowerCase().indexOf(q) !== -1; });
  }

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
    fire: ['savingsRate'],
    /* Between Jobs became the Cushion's while-job-hunting reading (D-232),
       which anyone may open: it reads as if the pay stopped today and says
       so. The Cushion itself requires nothing. */
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
  /* The DAITE declaration a room carries (D-171): the paths it reads and
     the paths it writes, as family plus child path. Ownership checks
     itself against `writes`; the tests fail on an undeclared family. */
  function daite(roomId) {
    var r = byId(roomId);
    return (r && r.daite) ? { reads: r.daite.reads.slice(), writes: r.daite.writes.slice() } : { reads: [], writes: [] };
  }
  /** Every room that declares it writes this path. */
  function writersOf(path) {
    return ROOMS.filter(function (r) { return r.daite && r.daite.writes.indexOf(path) !== -1; }).map(function (r) { return r.id; });
  }
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
    GROUPS: GROUPS,
    groups: groups,
    groupById: groupById,
    inGroup: inGroup,
    appliesToSituation: appliesToSituation,
    matches: matches,
    daite: daite,
    writersOf: writersOf,
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
