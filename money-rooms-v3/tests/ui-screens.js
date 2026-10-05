/* The screens, households and widths the sweep covers. Grows with the levels. */
import path from 'node:path';

export const WIDTHS = [1440, 1024, 390];

export const SCREENS = [
  { id: 'home', route: 'home' },
  { id: 'income', route: 'ledger/income' },
  { id: 'income-w2', route: 'ledger/income/w2' },
  { id: 'spending-lines', route: 'ledger/spending/line' },
  { id: 'debt-cards', route: 'ledger/debt/card' },
  { id: 'invest-accounts', route: 'ledger/invest/account' },
  { id: 'life-goals', route: 'ledger/life/goal' },
  { id: 'taxes', route: 'ledger/taxes' },
  { id: 'measure', route: 'measure' },
  { id: 'onepager', route: 'onepager' },
  { id: 'session', route: 'session' },
  { id: 'scenarios', route: 'scenarios' },
  { id: 'learn', route: 'learn' },
  { id: 'assumptions', route: 'assumptions' },
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
];
