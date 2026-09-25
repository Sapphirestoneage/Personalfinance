/* Phase 0 acceptance on a phone-sized browser against the production build:
   data survives reload, export then import restores everything exactly,
   quick-hide works, and nothing leaves the device. */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function ready(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId('month-card')).toBeVisible();
}

test.describe('phase 0', () => {
  test('opens on the sample profile with labeled estimates and real numbers', async ({ page }) => {
    await ready(page);
    await expect(page.getByTestId('inquiries')).toHaveValue('60');
    await expect(page.getByTestId('inquiries-label')).toContainText('estimate');
    await expect(page.getByTestId('gross-profit')).toContainText('$');
    await expect(page.getByTestId('basis')).toContainText('estimate');
    await expect(page.getByTestId('scenario-Normal')).toContainText('$');
    await expect(page.getByTestId('scenario-Dream')).toContainText('$');
    await expect(page.getByTestId('scenario-Disaster')).toContainText('$');
  });

  test('a typed number survives a reload and is labeled yours', async ({ page }) => {
    await ready(page);
    const gpBefore = await page.getByTestId('gross-profit').textContent();
    await page.getByTestId('inquiries').fill('42');
    await page.getByTestId('inquiries').blur();
    await expect(page.getByTestId('inquiries-label')).toHaveText('yours');
    await expect(page.getByTestId('gross-profit')).not.toHaveText(gpBefore ?? '');
    const gpAfter = await page.getByTestId('gross-profit').textContent();

    await page.reload();
    await expect(page.getByTestId('month-card')).toBeVisible();
    await expect(page.getByTestId('inquiries')).toHaveValue('42');
    await expect(page.getByTestId('inquiries-label')).toHaveText('yours');
    await expect(page.getByTestId('gross-profit')).toHaveText(gpAfter ?? '');
    await expect(page.getByTestId('status-card')).toContainText('saved before');
  });

  test('an empty field is not entered, and the screen says what is missing', async ({ page }) => {
    await ready(page);
    await page.getByTestId('inquiries').fill('');
    await page.getByTestId('inquiries').blur();
    await expect(page.getByTestId('incomplete')).toContainText('inquiriesPerMonth');
    await page.reload();
    await expect(page.getByTestId('incomplete')).toBeVisible();
  });

  test('export then import restores everything exactly', async ({ page }) => {
    await ready(page);
    await page.getByTestId('inquiries').fill('42');
    await page.getByTestId('inquiries').blur();
    await expect(page.getByTestId('inquiries-label')).toHaveText('yours');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
    expect(download.suggestedFilename()).toMatch(/^numbers-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await download.path();
    const text = readFileSync(path!, 'utf8');
    const file = JSON.parse(text);
    expect(file.format).toBe('slam-backup');
    expect(text).not.toMatch(/domme|findom|kink/i);
    await expect(page.getByTestId('note')).toContainText('private');

    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('reset').click();
    await expect(page.getByTestId('inquiries')).toHaveValue('60');
    await expect(page.getByTestId('inquiries-label')).toContainText('estimate');

    await page.getByTestId('import-file').setInputFiles({ name: 'numbers-backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.getByTestId('note')).toContainText('Restored');
    await expect(page.getByTestId('inquiries')).toHaveValue('42');
    await expect(page.getByTestId('inquiries-label')).toHaveText('yours');

    /* and a second export is byte-for-byte the first, apart from the stamp */
    const [again] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
    const second = JSON.parse(readFileSync((await again.path())!, 'utf8'));
    delete file.exportedAt;
    delete second.exportedAt;
    expect(second).toEqual(file);
  });

  test('one tap hides the app behind a plain screen', async ({ page }) => {
    await ready(page);
    await page.getByTestId('hide').click();
    await expect(page.getByTestId('quick-hide')).toBeVisible();
    await expect(page.getByTestId('quick-hide')).not.toContainText(/SLAM|money|profit/i);
    await page.getByRole('button', { name: 'Return' }).click();
    await expect(page.getByTestId('month-card')).toBeVisible();
  });

  test('no request leaves the device', async ({ page, baseURL }) => {
    const away: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(baseURL!)) away.push(r.url());
    });
    await ready(page);
    await page.getByTestId('inquiries').fill('50');
    await page.getByTestId('inquiries').blur();
    await page.getByTestId('hide').click();
    await page.waitForTimeout(500);
    expect(away).toEqual([]);
  });

  test('opens offline once installed', async ({ page, context }) => {
    await ready(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(500);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('month-card')).toBeVisible({ timeout: 15_000 });
    await context.setOffline(false);
  });
});
