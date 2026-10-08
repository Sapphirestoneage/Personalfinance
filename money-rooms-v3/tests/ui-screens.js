/* The screens, households and widths the sweep covers. Grows with the levels. */
import path from 'node:path';

export const WIDTHS = [1440, 1024, 390];

export const SCREENS = [
  { id: 'home', route: 'home' },
  { id: 'income', route: 'ledger/income' },
  { id: 'income-w2', route: 'ledger/income/w2' },
  { id: 'spending-lines', route: 'ledger/spending/line' },
  { id: 'debt-cards', route: 'ledger/debt/card' },
  { id: 'debt-score', route: 'ledger/debt/score' },
  { id: 'invest-accounts', route: 'ledger/invest/account' },
  { id: 'invest-bank', route: 'ledger/invest/bank' },
  { id: 'life-goals', route: 'ledger/life/goal' },
  { id: 'taxes', route: 'ledger/taxes' },
  { id: 'measure', route: 'measure' },
  { id: 'measure-lenses', route: 'measure/lenses' },
  { id: 'measure-charts', route: 'measure/charts' },
  { id: 'measure-unlocks', route: 'measure/unlocks' },
  { id: 'measure-chart-focused', route: 'measure/charts/netWorth' },
  { id: 'measure-number-link', route: 'measure/numbers/fiDate' },
  { id: 'measure-overview', route: 'measure/overview' },
  /* every chart of Part C on its own page (MR-061): the sweep runs each at three widths, coach and client, for every household */
  { id: 'chart-savingsRateCurve', route: 'measure/charts/savingsRateCurve' },
  { id: 'chart-fiLadderLines', route: 'measure/charts/fiLadderLines' },
  { id: 'chart-netWorthStacked', route: 'measure/charts/netWorthStacked' },
  { id: 'chart-milestones', route: 'measure/charts/milestones' },
  { id: 'chart-tornado', route: 'measure/charts/tornado' },
  { id: 'chart-paycheckWaterfall', route: 'measure/charts/paycheckWaterfall' },
  { id: 'chart-spendingTreemap', route: 'measure/charts/spendingTreemap' },
  { id: 'chart-drafttBullets', route: 'measure/charts/drafttBullets' },
  { id: 'chart-debtCompared', route: 'measure/charts/debtCompared' },
  { id: 'chart-taxBucketMix', route: 'measure/charts/taxBucketMix' },
  { id: 'chart-allocationDonut', route: 'measure/charts/allocationDonut' },
  { id: 'chart-runwayStaircase', route: 'measure/charts/runwayStaircase' },
  { id: 'chart-ruleOf5Gauge', route: 'measure/charts/ruleOf5Gauge' },
  { id: 'chart-contributionRoom', route: 'measure/charts/contributionRoom' },
  { id: 'chart-incomeByType', route: 'measure/charts/incomeByType' },
  { id: 'chart-feeDrag', route: 'measure/charts/feeDrag' },
  { id: 'chart-guardrails', route: 'measure/charts/guardrails' },
  { id: 'chart-coastCurve', route: 'measure/charts/coastCurve' },
  { id: 'chart-healthcareBridge', route: 'measure/charts/healthcareBridge' },
  { id: 'chart-hoursOfWork', route: 'measure/charts/hoursOfWork' },
  { id: 'chart-gutDreamActual', route: 'measure/charts/gutDreamActual' },
  { id: 'chart-benchmarks', route: 'measure/charts/benchmarks' },
  { id: 'onepager', route: 'onepager' },
  { id: 'session', route: 'session' },
  { id: 'scenarios', route: 'scenarios' },
  { id: 'learn', route: 'learn' },
  { id: 'assumptions', route: 'assumptions' },
  { id: 'levers', route: 'levers' },
  { id: 'discovery', route: 'discovery' },
  { id: 'discovery-summary', route: 'discovery/summary' },
  { id: 'call', route: 'call' },
  { id: 'goals', route: 'goals' },
  { id: 'clients', route: 'clients' },
  { id: 'program', route: 'program' },
  { id: 'prep', route: 'prep' },
  { id: 'transactions', route: 'transactions' },
  /* Level 12 (MR-063): the scoreboard, its drawer deep link, the map (index and one number), the money date */
  { id: 'scoreboard', route: 'scoreboard' },
  { id: 'scoreboard-drawer', route: 'scoreboard/m/savingsRateTakeHome' },
  { id: 'scoreboard-group', route: 'scoreboard/safety' },
  { id: 'map', route: 'map' },
  { id: 'map-fidate', route: 'map/fiDate' },
  { id: 'money-date', route: 'money-date' },
  { id: 'chart-crossover', route: 'measure/charts/crossover' },
  { id: 'chart-effortVsMarket', route: 'measure/charts/effortVsMarket' },
  { id: 'chart-debtCurves', route: 'measure/charts/debtCurves' },
  { id: 'chart-satisfactionTrend', route: 'measure/charts/satisfactionTrend' },
  { id: 'chart-worthIt', route: 'measure/charts/worthIt' },
  { id: 'chart-fiDateWaterfall', route: 'measure/charts/fiDateWaterfall' },
  { id: 'chart-pictureVsProgress', route: 'measure/charts/pictureVsProgress' },
  { id: 'chart-cashflowCalendar', route: 'measure/charts/cashflowCalendar' },
  /* Level 13 (MR-067): the calculators hub, the calendar's tabs, the four calculators and their ten charts */
  { id: 'calculators', route: 'calculators' },
  { id: 'calendar', route: 'calendar/grid' },
  { id: 'calendar-weeks', route: 'calendar/weeks' },
  { id: 'calendar-line', route: 'calendar/line' },
  { id: 'calendar-paychecks', route: 'calendar/paychecks' },
  { id: 'calendar-year', route: 'calendar/year' },
  { id: 'calendar-agenda', route: 'calendar/agenda' },
  { id: 'calendar-cards', route: 'calendar/cards' },
  { id: 'calc-home-afford', route: 'calc/home-afford' },
  { id: 'calc-house', route: 'calc/house' },
  { id: 'calc-car', route: 'calc/car' },
  { id: 'calc-retire', route: 'calc/retire' },
  { id: 'chart-calendarBalance', route: 'measure/charts/calendarBalance' },
  { id: 'chart-paycheckMap', route: 'measure/charts/paycheckMap' },
  { id: 'chart-yearStrip', route: 'measure/charts/yearStrip' },
  { id: 'chart-homeAnswers', route: 'measure/charts/homeAnswers' },
  { id: 'chart-downPaymentLadder', route: 'measure/charts/downPaymentLadder' },
  { id: 'chart-rentVsBuy', route: 'measure/charts/rentVsBuy' },
  { id: 'chart-equityVsLoan', route: 'measure/charts/equityVsLoan' },
  { id: 'chart-carTco', route: 'measure/charts/carTco' },
  { id: 'chart-carValueVsLoan', route: 'measure/charts/carValueVsLoan' },
  { id: 'chart-retireGrowth', route: 'measure/charts/retireGrowth' },
];

async function importHousehold(page, APP, name) {
  await page.setInputFiles('input[aria-label="Import a client file"]', path.join(APP, 'tests', 'households', name + '.json'));
  await page.waitForSelector('.toast');
  await page.waitForSelector('.today-card, .client-home');
}

/* Each household knows how to load itself into the page. */
export const HOUSEHOLDS = [
  {
    id: 'empty',
    async load(page, { base }) {
      /* MR-072: a client without a call lives under More on the Clients screen */
      await page.goto(base + 'index.html#/clients'); await page.waitForSelector('.more-menu summary');
      await page.click('.more-menu summary');
      await page.click('.more-list button:has-text("New client without a call")');
      await page.fill('input[aria-label="New client name"]', 'Example household');
      await page.press('input[aria-label="New client name"]', 'Enter');
      await page.waitForSelector('.sun-panel .fieldrow'); /* a client without a call opens on the Plan, where the household facts live */
    },
  },
  { id: 'jordan', async load(page, { APP }) { await importHousehold(page, APP, 'jordan'); } },
  { id: 'dev', async load(page, { APP }) { await importHousehold(page, APP, 'dev'); } },
  { id: 'leah', async load(page, { APP }) { await importHousehold(page, APP, 'leah'); } },
  { id: 'extreme', async load(page, { APP }) { await importHousehold(page, APP, 'extreme'); } },
  { id: 'maya-discovery', async load(page, { APP }) { await importHousehold(page, APP, 'maya-discovery'); } },
];
