/* Phone screenshots of the running preview, light and dark.
   Run: npm run preview & node scripts/shots.mjs <out-dir> */
import { chromium, devices } from '@playwright/test';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.getByTestId('month-card').waitFor();
  await page.screenshot({ path: `${out}/phase0-${scheme}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
