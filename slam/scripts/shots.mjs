/* Phone screenshots of the running preview, every main screen.
   Run: npm run preview & node scripts/shots.mjs <out-dir> [light|dark] */
import { chromium, devices } from '@playwright/test';
const out = process.argv[2] ?? '.';
const scheme = process.argv[3] ?? 'light';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ ...devices['Pixel 7'], colorScheme: scheme });
const page = await ctx.newPage();
const shot = async (name) => page.screenshot({ path: `${out}/${name}-${scheme}.png`, fullPage: true });
const go = async (p) => { await page.goto(`http://127.0.0.1:4173/#/${p}`); await page.getByTestId('hide').waitFor(); await page.waitForTimeout(300); };
await go('today'); await shot('01-today-fresh');
await go('businesses/setup'); await page.getByTestId('tick-inPerson').check(); await page.waitForTimeout(200); await shot('02-setup');
await go('toolbox/diagnose?guided=1&business=you-inPerson'); await shot('03-guided-q1');
await page.getByTestId('q-inputs-inquiriesPerMonth').fill('40'); await page.getByTestId('tool-next').click();
await page.getByTestId('q-tool-bookingsLastMonth').fill('3'); await page.getByTestId('tool-next').click();
await page.getByTestId('q-single-priceCents').fill('450'); await page.getByTestId('tool-next').click(); await page.waitForTimeout(300); await shot('04-diagnosis');
await go('demo'); await page.getByTestId('sample-sample-inperson').click(); await page.getByTestId('sample-sample-inperson').click().catch(() => {}); await page.getByTestId('today-numbers').waitFor(); await page.waitForTimeout(300); await shot('05-today-sample');
await go('numbers'); await page.waitForTimeout(500); await shot('06-numbers');
await go('hypotheticals'); await page.waitForTimeout(500); await shot('07-hypotheticals');
await go('businesses'); await shot('08-businesses');
await go('businesses/sample-inperson-inPerson'); await page.waitForTimeout(500); await shot('09-business-tab');
await go('toolbox'); await shot('10-toolbox');
await go('toolbox/offer?business=sample-inperson-inPerson'); await shot('11-offer-tool');
await go('clients'); await shot('12-clients');
await go('demo'); await shot('13-demo');
await page.getByTestId('menu').click(); await page.waitForTimeout(200); await shot('14-menu');
await ctx.close(); await browser.close();
console.log('done');
