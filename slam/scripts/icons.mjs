/* Renders public/icon.svg to the PNG sizes the manifest needs, with the
   Chromium Playwright already has. Run: node scripts/icons.mjs */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#0f172a">${svg.replace('width="64" height="64"', `width="${size}" height="${size}"`)}</body></html>`);
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png);
  await page.close();
}
await browser.close();
console.log('icons written');
