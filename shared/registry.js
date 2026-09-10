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
      daite: { reads: ['assets.cashCents', 'assets.contributions.pretax', 'assets.invested', 'debt.none', 'expenses', 'income.grossAnnualCents', 'income.sources[].benefit', 'income.sources[].employerMatch', 'taxes.filingStatus', 'taxes.state', 'taxes.zip', 'you.cover', 'you.dob', 'you.situation'], writes: ['assets.cashCents', 'assets.contributions.pretax', 'assets.invested', 'debt.none', 'income.grossAnnualCents', 'income.sources[].benefit', 'income.sources[].employerMatch', 'taxes.filingStatus', 'taxes.state', 'taxes.zip', 'you.cover', 'you.dependents', 'you.dob', 'you.situation'] },
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
      title: 'Financial Snapshot',
      blurb: 'The payoff: nine numbers read off everything you\u2019ve entered. Net worth, savings rate, runway, FIRE number, and which rung you\u2019re on.',
      href: 'rooms/financial-snapshot.html',
      tier: 0,
      tags: ['income', 'cashflow', 'debt'],
      daite: { reads: ['assets.cashCents', 'assets.invested', 'debt.items', 'expenses', 'income.grossAnnualCents', 'taxes.filingStatus', 'you.dob'], writes: [] },
      subsections: [
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
      daite: { reads: [], writes: ['income.costs', 'income.ledger'] },
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
      group: 'decisions', subgroup: 'home', aliases: ['car', 'vehicle', 'auto', 'lease', '20/3/8'],
      kind: 'explore',
      needs: ['grossAnnualIncome'],
      order: 26.2,
      title: 'What A Car Costs',
      blurb: 'The sticker price is the smallest part. Depreciation, the running costs, and whether the loan fits \u2014 against the one test that says if the car fits your life.',
      href: 'rooms/car.html',
      tier: 2,
      tags: ['cashflow', 'debt'],
      daite: { reads: ['income.grossAnnualCents'], writes: [] },
      subsections: [
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
      daite: { reads: ['expenses'], writes: ['expenses', 'expenses.needs.accommodation', 'expenses.needs.food', 'expenses.needs.transportation', 'expenses.wants', 'expenses.wants.therapy'] },
      subsections: [
        { id: 'picture',         label: 'At a glance' },
        { id: 'spending',        label: 'The four numbers' },
        { id: 'lines',           label: 'Subscriptions and lines' },
        { id: 'out-summary',     label: 'By category' },
        { id: 'out-template',    label: 'Against a budget' },
        { id: 'out-divergence',  label: 'Lines vs. the four' }
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
      daite: { reads: ['debt.items', 'debt.items[].minimumCents'], writes: ['debt.items', 'debt.items[].minimumCents'] },
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
      daite: { reads: ['assets.cashCents', 'assets.invested', 'debt.items'], writes: ['assets', 'assets.property'] },
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
      group: 'scorecard', aliases: ['savings rate', 'how much saved'],
      kind: 'read',
      needs: ['grossAnnualIncome', 'monthlyExpenses'],
      order: 6,
      title: 'Savings Rate',
      blurb: 'The share of your income that stays yours \u2014 both ways of counting it, and what one more point of it is worth.',
      href: 'rooms/savings-rate.html',
      tier: 0,
      tags: ['income', 'cashflow'],
      daite: { reads: ['expenses', 'income.grossAnnualCents'], writes: [] },
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
      group: 'matters', aliases: ['sleep', 'risk', 'coverage checkup', 'worry'],
      kind: 'about-you',
      needs: ['monthlyExpenses', 'cashSavings'],
      order: 7,
      title: 'Sleep At Night',
      blurb: 'The amount of cash that stops the 3am arithmetic \u2014 your number, beside the one the maths produces.',
      href: 'rooms/sleep-at-night.html',
      tier: 1,
      tags: ['cashflow'],
      daite: { reads: ['assets.cashCents', 'expenses'], writes: ['plans.swan', 'you.cover'] },
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
      id: 'quick-math',
      group: 'decisions', subgroup: 'moves', aliases: ['quick', 'rule of thumb', 'car rule', 'back of envelope'],
      kind: 'explore',
      needs: [],
      order: 11,
      title: 'Quick Math',
      blurb: 'Four small answers: is switching savings accounts worth it, what that thing costs per use, whether you can afford the car, and the rule of five.',
      href: 'rooms/quick-math.html',
      tier: 1,
      tags: ['cashflow'],
      daite: { reads: [], writes: [] },
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
       row each, in nine spheres. Reads everything, writes nothing until
       18.1 moves entry here. */
    {
      id: 'ledger',
      /* Under Upkeep beside Refresh until 18.1 makes it the place numbers
         are entered (D-186): three doors side by side under Home was one of
         the things that lost people. */
      group: 'upkeep', aliases: ['ledger', 'the ledger', 'rows', 'spheres', 'progress'],
      kind: 'about-you',
      utility: true,
      needs: [],
      order: 98.2,
      title: 'The Ledger',
      blurb: 'Every number the app can hold, one line each, in the order they matter: what is entered, what is rough, what is still to look up, and where each is read.',
      href: 'rooms/ledger.html',
      tier: 0,
      tags: ['income', 'cashflow', 'debt'],
      daite: { reads: ["assets","assets.allocation","assets.cashCents","assets.contributions.hsa","assets.contributions.pretax","assets.contributions.roth","assets.invested","assets.property","debt.items","debt.items[].minimumCents","debt.items[].plan","debt.none","expenses","expenses.floor","expenses.giving","expenses.insurance","expenses.log","expenses.months","expenses.needs.accommodation","expenses.needs.food","expenses.needs.transportation","expenses.shared","expenses.wants","expenses.wants.therapy","income.cadence","income.future","income.grossAnnualCents","income.ledger","income.sources[].benefit","income.sources[].employerMatch","income.variable","taxes.filingStatus","taxes.marginalRate","taxes.otherPreTax","taxes.state","taxes.withheld","taxes.zip","you.cover","you.dependents","you.dob","you.estate","you.partner","you.situation"], writes: [] },
      subsections: [
        { id: 'target-wrap', label: 'The target' },
        { id: 'spheres',     label: 'The rows, by sphere' }
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
      id: 'ratios',
      group: 'scorecard', aliases: ['ratios', 'dti', 'emergency fund', 'benchmarks'],
      kind: 'read',
      needs: ['grossAnnualIncome', 'monthlyExpenses', 'cashSavings', 'investments', 'totalDebt'],
      order: 14,
      title: 'Every Ratio',
      blurb: 'Thirty ratios people actually quote, computed from what you have already entered \u2014 with the two this app refuses to guess at named as such.',
      href: 'rooms/ratios.html',
      tier: 1,
      tags: ['income', 'cashflow', 'debt'],
      daite: { reads: ['assets.cashCents', 'assets.invested', 'debt.items', 'expenses', 'income.grossAnnualCents'], writes: [] },
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
    {
      id: 'windfall',
      group: 'decisions', subgroup: 'moves', aliases: ['windfall', 'bonus', 'inheritance', 'lump sum'],
      kind: 'explore',
      needs: [],
      order: 25,
      title: 'The Windfall',
      blurb: 'A bonus, an inheritance, a sale \u2014 all at once or spread out, and the exact condition under which spreading it wins.',
      href: 'rooms/windfall.html',
      tier: 1,
      tags: ['income'],
      daite: { reads: [], writes: [] },
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
      features: ['jobLossCushions'],
      group: 'decisions', subgroup: 'moves', aliases: ['runway', 'months of cash', 'how long'],
      kind: 'explore',
      needs: ['cashSavings', 'monthlyExpenses'],
      order: 26,
      title: 'The Runway',
      blurb: 'The income stops and the bills don\u2019t \u2014 quitting, laid off, or starting something. How many months that is, and what would buy you more of them.',
      href: 'rooms/runway.html',
      tier: 2,
      tags: ['income', 'cashflow'],
      daite: { reads: ['assets.cashCents', 'expenses'], writes: [] },
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
      group: 'scorecard', aliases: ['score', 'health', 'grade'],
      kind: 'read',
      needs: ['dob', 'grossAnnualIncome', 'monthlyExpenses', 'cashSavings', 'investments'],
      order: 27,
      title: 'The Score',
      blurb: 'One number for the whole picture, weighted for the decade you\u2019re in \u2014 and every part of how it was arrived at.',
      href: 'rooms/health.html',
      tier: 1,
      tags: ['income', 'cashflow', 'debt'],
      daite: { reads: ['assets.cashCents', 'assets.invested', 'expenses', 'income.grossAnnualCents', 'you.dob'], writes: [] },
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
      features: ['matchVesting'],
      group: 'scorecard', aliases: ['foo', 'order of operations', 'next dollar', 'ladder'],
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
      daite: { reads: ['assets.cashCents', 'assets.contributions.hsa', 'assets.contributions.pretax', 'assets.contributions.roth', 'expenses', 'income.grossAnnualCents', 'income.sources[].employerMatch', 'taxes.filingStatus', 'you.cover', 'you.dob'], writes: [] },
      /* The FOO calculator sat at the repo root until D-058, so this href
         is relative to map.html, which also lives at the root. A
         single-view app with no stable section anchors yet; declaring none
         is deliberate — see DECISIONS.md D-007. */
      subsections: []
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

  /* A utility page: reached from the dashboard's staleness line and from
     the room-to-room nav, never listed on the map's groups — it asks for
     nothing new, it re-asks the three figures that move. It writes those
     through the owner's own write path (Ownership.write), so it is not a
     second editor of a second copy. DECISIONS.md D-057. */
  ROOMS.push({
    id: 'refresh',
    group: 'upkeep', aliases: ['refresh', 'stale', 'update numbers', 'confirm'],
    kind: 'core',
    utility: true,
    needs: ['cashSavings', 'investments', 'totalDebt'],
    order: 99,   /* always last on the path (D-057), whatever rooms are added */
    title: 'Refresh',
    blurb: 'The three figures that move — cash, investments, what you owe — re-checked in under a minute, and a snapshot taken so the dashboard can say what changed.',
    href: 'rooms/refresh.html',
    tier: 0,
    tags: ['cashflow', 'debt'],
    daite: { reads: ['assets.cashCents', 'assets.invested', 'debt.items'], writes: ['assets.cashCents', 'assets.invested', 'debt.items'] },
    subsections: [
      { id: 'fields', label: 'The three that move' },
      { id: 'done',   label: 'Snapshot' }
    ]
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

  /* Front Doors — the same rooms, arranged twenty different ways (D-153).
     A utility like Refresh and Your Data: it is a way of MOVING through the
     rooms, not a room with a number in it, so it stays off the numbered path
     and out of D-051's four-room core cap. */
  ROOMS.push({
    id: 'doors',
    group: 'upkeep', aliases: ['front doors', 'arrangements', 'ways in'],
    kind: 'core',
    utility: true,
    needs: [],
    order: 96,
    title: 'Front Doors',
    blurb: 'Twenty ways into the same rooms — by the question you came with, by what could go wrong, by how long it takes, by how often you would open it. The rooms never change; only the shelves.',
    href: 'rooms/doors.html',
    tier: 0,
    tags: ['income', 'cashflow', 'debt'],
    daite: { reads: [], writes: ['prefs.door'] },
    subsections: [
      { id: 'out-pick', label: 'Choose an arrangement' },
      { id: 'out-door', label: 'The rooms' },
      { id: 'out-why',  label: 'Why this one' }
    ]
  });

  /* Settings — every user-scope feature switch on one screen (D-180). */
  ROOMS.push({
    id: 'settings',
    group: 'upkeep', aliases: ['settings', 'switches', 'features', 'preferences', 'toggles'],
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
      { id: 'advanced',  label: 'Advanced' }
    ]
  });

  /* The Walk-Through — the short, finishable route through the suite
     (D-149). `utility: true` for the same reason Refresh is: it is a way of
     moving through the rooms, not a room with a number in it, so it stays
     off the numbered path and out of the four-room core cap (D-051). */
  ROOMS.push({
    id: 'walk',
    group: 'upkeep', aliases: ['walk-through', 'guided', 'tour'],
    kind: 'core',
    utility: true,
    needs: [],
    order: 97,   /* ahead of Your Data (98) and Refresh (99), both utilities */
    title: 'The Walk-Through',
    blurb: 'The short route through this app: five sets of steps, only the ones that are for you, with somewhere to say when each is done.',
    href: 'rooms/walk.html',
    tier: 0,
    tags: ['income', 'cashflow', 'debt'],
    daite: { reads: [], writes: ['progress.walk'] },
    subsections: [
      { id: 'out-top',    label: 'Where you are' },
      { id: 'out-stages', label: 'The five sets' }
    ]
  });

  /* Between Jobs — the tranche rooms on the template (D-098). */
  ROOMS.push({
    id: 'between-jobs',
    features: ['preMedicare', 'jobLossCushions'],
    group: 'decisions', subgroup: 'work', aliases: ['unemployed', 'laid off', 'job loss', 'runway', 'cobra'], appliesWhen: 'situation != retired',
    kind: 'about-you',
    needs: ['unemployment', 'monthlyExpenses', 'cashSavings'],
    order: 31,
    title: 'Between Jobs',
    blurb: 'The runway against the search: the day the cash runs out, with the benefit and severance counted, and the floor you could drop to.',
    href: 'rooms/between-jobs.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['assets.cashCents', 'expenses', 'income.sources[].benefit'], writes: ['expenses.floor', 'plans.betweenJobs'] },
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
    features: ['agingParents'],
    group: 'decisions', subgroup: 'family', aliases: ['insurance', 'life insurance', 'disability', 'coverage'],
    kind: 'about-you',
    needs: ['monthlyExpenses', 'cashSavings', 'grossAnnualIncome'],
    order: 32,
    title: 'Protection',
    blurb: 'What a bad year would cost and what stands behind you: health, disability, life, the cushion — each need against what is held.',
    href: 'rooms/protection.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['assets.cashCents', 'expenses', 'income.grossAnnualCents'], writes: ['expenses.insurance', 'you.cover'] },
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

  /* Estate Basics — the tranche rooms on the template (D-098). */
  ROOMS.push({
    id: 'estate',
    group: 'decisions', subgroup: 'family', aliases: ['will', 'estate', 'beneficiary', 'power of attorney'],
    kind: 'about-you',
    needs: [],
    order: 35,
    title: 'Estate Basics',
    blurb: 'Three facts — beneficiaries named, a will, a power of attorney — and what would pass without them.',
    href: 'rooms/estate.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: [], writes: ['you.estate'] },
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
    group: 'matters', aliases: ['week', 'hours', 'designed week', 'time'],
    kind: 'about-you',
    needs: ['monthlyExpenses'],
    order: 44,
    title: 'Designed Week',
    blurb: 'The week you would design: 168 hours in blocks, what each block costs and buys, and the month that week adds up to against the one you have.',
    href: 'rooms/week.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['expenses'], writes: ['plans.week'] },
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
    features: ['timeBudget'],
    group: 'matters', aliases: ['time buckets', 'decades', 'experiences', 'die with zero'],
    kind: 'about-you',
    needs: ['investments', 'monthlyExpenses'],
    order: 45,
    title: 'Time Buckets',
    blurb: 'What you plan to do in each decade, priced, and whether the plan and the money line up in time.',
    href: 'rooms/buckets.html',
    tier: 2,
    tags: ['cashflow'],
    daite: { reads: ['assets.invested', 'expenses'], writes: ['plans.buckets'] },
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
    group: 'upkeep', aliases: ['export', 'import', 'backup', 'json', 'csv', 'your data'],
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
      { id: 'reset', label: 'Start over' }
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
    scorecard: ['financial-snapshot', 'savings-rate', 'ratios', 'health', 'foo-ladder', 'fire', 'fire-lab', 'statements'],
    decisions: ['career-move', 'self-employed', 'side-hustle', 'between-jobs', 'credential', 'housing', 'big-purchase', 'car', 'worth', 'hassle', 'partner', 'kids', 'protection', 'estate', 'giving', 'windfall', 'runway', 'decumulation', 'quick-math', 'adventure', 'what-if-life', 'timeline'],
    matters: ['sleep-at-night', 'values', 'goals', 'enough', 'fulfillment', 'rerank', 'dreamline', 'week', 'buckets', 'reversibility', 'unlearning'],
    levelup: ['skill-tree', 'stacker', 'exercises'],
    upkeep: ['data', 'refresh', 'history', 'settings', 'get-help', 'doors', 'walk']
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
