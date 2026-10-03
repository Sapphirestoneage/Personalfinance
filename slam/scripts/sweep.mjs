/* Every main screen at two widths, light and dark. node scripts/sweep.mjs <out> */
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
for (const [w, tag] of [[360, 'w360'], [412, 'w412']]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
    const page = await ctx.newPage();
    const shot = (name) => page.screenshot({ path: `${out}/${tag}-${scheme}-${name}.png`, fullPage: true });
    const go = async (p) => { await page.goto(`http://127.0.0.1:4173/#/${p}`); await page.getByTestId('hide').waitFor(); await page.waitForTimeout(350); };
    await go('today'); await shot('01-today-fresh');
    await go('businesses/setup'); await page.getByTestId('tick-inPerson').check(); await page.getByTestId('tick-content').check(); await page.waitForTimeout(200); await shot('02-setup');
    await go('toolbox/diagnose?guided=1&business=you-inPerson'); await shot('03-guided');
    await page.getByTestId('q-inputs-inquiriesPerMonth').fill('40'); await page.getByTestId('tool-next').click();
    await page.getByTestId('q-tool-bookingsLastMonth').fill('3'); await page.getByTestId('tool-next').click();
    await page.getByTestId('q-single-priceCents').fill('450'); await page.getByTestId('tool-next').click(); await page.waitForTimeout(300); await shot('04-diagnosis');
    await go('demo'); await page.getByTestId('sample-sample-inperson').click(); await page.getByTestId('sample-sample-inperson').click().catch(() => {}); await page.getByTestId('today-numbers').waitFor(); await page.waitForTimeout(300); await shot('05-today-sample');
    await go('numbers'); await page.waitForTimeout(600); await shot('06-numbers');
    await go('hypotheticals'); await page.getByTestId('edit-Disaster').click(); await page.getByTestId('event-price_war').click(); await page.waitForTimeout(600); await shot('07-hypotheticals');
    await go('businesses'); await shot('08-businesses');
    await go('businesses/sample-inperson-inPerson'); await page.waitForTimeout(600); await shot('09-tab-inperson');
    await go('businesses/sample-inperson-content'); await page.waitForTimeout(600); await shot('10-tab-content');
    await go('toolbox'); await shot('11-toolbox');
    await go('toolbox/offer?business=sample-inperson-inPerson'); await shot('12-offer');
    await go('toolbox/plan?business=sample-inperson-inPerson'); await shot('13-plan');
    await go('clients'); await page.getByTestId('new-client').click(); await page.waitForTimeout(200); await shot('14-client-form');
    await go('demo'); await shot('15-demo');
    await go('businesses/settings'); await shot('16-settings');
    await page.getByTestId('menu').click(); await page.waitForTimeout(250); await shot('17-menu');
    await page.keyboard.press('Escape'); await page.getByTestId('hide').click(); await page.waitForTimeout(200); await shot('18-hidden');
    await ctx.close();
  }
}
await browser.close();
console.log('sweep done');
