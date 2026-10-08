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
];

async function importHousehold(page, APP, name) {
  await page.setInputFiles('input[aria-label="Import a client file"]', path.join(APP, 'tests', 'households', name + '.json'));
  await page.waitForSelector('.toast');
  await page.waitForSelector('.orbit');
}

/* Each household knows how to load itself into the page. */
export const HOUSEHOLDS = [
  {
    id: 'empty',
    async load(page) {
      await page.click('button[aria-label="New client"]');
      await page.fill('input[aria-label="New client name"]', 'Example household');
      await page.press('input[aria-label="New client name"]', 'Enter');
      await page.waitForSelector('.fieldrow[data-field="birthDate"]');
    },
  },
  { id: 'jordan', async load(page, { APP }) { await importHousehold(page, APP, 'jordan'); } },
  { id: 'dev', async load(page, { APP }) { await importHousehold(page, APP, 'dev'); } },
  { id: 'maya', async load(page, { APP }) { await importHousehold(page, APP, 'maya'); } },
  { id: 'extreme', async load(page, { APP }) { await importHousehold(page, APP, 'extreme'); } },
  { id: 'maya-discovery', async load(page, { APP }) { await importHousehold(page, APP, 'maya-discovery'); } },
];
