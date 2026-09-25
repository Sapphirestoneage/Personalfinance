/* Phone flows against the production build. The acceptance criteria of
   phases 0 and 1: a first-time user reaches her bottleneck in under 5
   minutes, data survives reload, export then import restores exactly,
   quick-hide, no request leaves the device, and it opens offline. */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function open(page: Page, path = 'today') {
  await page.goto(`./#/${path}`);
  await expect(page.getByTestId('hide')).toBeVisible();
  await expect(page.getByTestId('loading')).toHaveCount(0);
}

async function loadSample(page: Page, id = 'sample-inperson') {
  await open(page, 'demo');
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId(`sample-${id}`).click();
  await expect(page.getByTestId('today-numbers')).toBeVisible();
}

test.describe('first-time user', () => {
  test('reaches her bottleneck from three numbers in under 5 minutes', async ({ page }) => {
    const started = Date.now();
    await open(page);
    await expect(page.getByTestId('next-title')).toContainText('Setup');
    await page.getByTestId('next-go').click();
    await page.getByTestId('tick-inPerson').check();
    await page.getByTestId('setup-done').click();

    await expect(page.getByTestId('next-title')).toContainText('Quick diagnosis');
    await page.getByTestId('next-go').click();
    await expect(page.getByTestId('tool-guided')).toContainText('Question 1 of 3');
    await page.getByTestId('q-inputs-inquiriesPerMonth').fill('40');
    await page.getByTestId('tool-next').click();
    await page.getByTestId('q-tool-bookingsLastMonth').fill('3');
    await page.getByTestId('tool-next').click();
    await page.getByTestId('q-single-priceCents').fill('450');
    await page.getByTestId('tool-next').click();

    await expect(page.getByTestId('tool-result')).toContainText('The bottleneck');
    await expect(page.getByTestId('tool-result')).toContainText('People who pass screening are not booking');
    await expect(page.getByTestId('tool-summary')).toContainText('Fix this first');
    expect(Date.now() - started).toBeLessThan(5 * 60 * 1000);

    await page.getByTestId('tool-finish').click();
    await expect(page.getByTestId('tool-saved')).toBeVisible();
    await open(page);
    await expect(page.getByTestId('next-title')).toContainText('Your offer');
    await expect(page.getByTestId('progress')).toContainText('2 of 9');
  });

  test('her numbers are labeled yours and survive a reload', async ({ page }) => {
    await open(page, 'businesses/setup');
    await page.getByTestId('tick-inPerson').check();
    await page.getByTestId('setup-done').click();
    await open(page, 'businesses/you-inPerson');
    await expect(page.getByTestId('in-inquiriesPerMonth-label')).toContainText('estimate');
    await page.getByTestId('in-inquiriesPerMonth').fill('42');
    await page.getByTestId('in-inquiriesPerMonth').blur();
    await expect(page.getByTestId('in-inquiriesPerMonth-label')).toHaveText('yours');
    const gp = await page.getByTestId('tab-gp').textContent();
    await page.reload();
    await expect(page.getByTestId('in-inquiriesPerMonth')).toHaveValue('42');
    await expect(page.getByTestId('in-inquiriesPerMonth-label')).toHaveText('yours');
    await expect(page.getByTestId('tab-gp')).toHaveText(gp ?? '');
  });

  test('an empty field is not entered and the screen names what is missing', async ({ page }) => {
    await open(page, 'businesses/setup');
    await page.getByTestId('tick-inPerson').check();
    await open(page, 'businesses/you-inPerson');
    await page.getByTestId('in-bookingRate').fill('');
    await page.getByTestId('in-bookingRate').blur();
    await expect(page.getByTestId('tab-incomplete')).toContainText('bookingRate');
    await open(page, 'numbers');
    await expect(page.getByTestId('numbers-incomplete')).toContainText('bookingRate');
  });
});

test.describe('demo mode and dashboards', () => {
  test('a sample fills every screen', async ({ page }) => {
    await loadSample(page);
    await expect(page.getByTestId('today-profit')).toContainText('$');
    await open(page, 'numbers');
    await expect(page.getByTestId('profit')).toContainText('$');
    await expect(page.getByTestId('share-bars')).toContainText('brings');
    await expect(page.getByTestId('levers')).toContainText('+1 point');
    await open(page, 'hypotheticals');
    for (const k of ['Disaster', 'Normal', 'Dream']) await expect(page.getByTestId(`scenario-${k}`)).toContainText('$');
    await expect(page.getByTestId('runway')).toBeVisible();
    const before = await page.getByTestId('scenario-Disaster').textContent();
    await page.getByTestId('edit-Disaster').click();
    await page.getByTestId('event-house_stops').click();
    await expect(page.getByTestId('scenario-Disaster')).not.toHaveText(before ?? '');
    await expect(page.getByTestId('scenario-Normal')).toContainText('$');
    await open(page, 'businesses');
    await expect(page.getByTestId('biz-inPerson')).toContainText('#1');
    await open(page, 'demo');
    await page.getByTestId('presenter').click();
    await expect(page.getByTestId('presenter')).toHaveAttribute('aria-checked', 'true');
  });

  test('ranking changes #1 and inactive businesses stay out of totals', async ({ page }) => {
    await loadSample(page);
    await open(page, 'numbers');
    const four = await page.getByTestId('gross-profit').textContent();
    await open(page, 'businesses/setup');
    await page.getByTestId('down-inPerson').click();
    await expect(page.getByTestId('rank-content')).toContainText('#1');
    await page.getByTestId('tick-calls').uncheck();
    await open(page, 'numbers');
    await expect(page.getByTestId('gross-profit')).not.toHaveText(four ?? '');
    await open(page, 'businesses');
    await expect(page.getByTestId('inactive-calls')).toBeVisible();
    await page.getByTestId('add-calls').click();
    await expect(page.getByTestId('biz-calls')).toBeVisible();
  });

  test('the toolbox runs standalone in a sandbox and saves on request', async ({ page }) => {
    await loadSample(page);
    await open(page, 'toolbox');
    await page.getByTestId('tool-plan').click();
    await expect(page.getByTestId('sandbox')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('q-shared-incomeGoalCents').fill('8000');
    await page.getByTestId('q-shared-incomeGoalCents').blur();
    await expect(page.getByTestId('tool-result')).toContainText('Contacts a month for $8,000');
    await open(page, 'businesses/settings');
    await expect(page.getByTestId('shared-incomeGoalCents')).toHaveValue('10000');
    await open(page, 'toolbox/plan');
    await page.getByTestId('q-shared-incomeGoalCents').fill('8000');
    await page.getByTestId('q-shared-incomeGoalCents').blur();
    await page.getByTestId('tool-finish').click();
    await expect(page.getByTestId('tool-saved')).toBeVisible();
    await open(page, 'businesses/settings');
    await expect(page.getByTestId('shared-incomeGoalCents')).toHaveValue('8000');
  });
});

test.describe('check-in and clients', () => {
  test('two taps log a contact; a saved check-in counts', async ({ page }) => {
    await loadSample(page);
    await page.getByTestId('plus-contact').click();
    await expect(page.getByTestId('ci-inquiries')).toHaveText('1');
    await page.reload();
    await expect(page.getByTestId('ci-inquiries')).toHaveText('1');
    await page.getByTestId('ci-bookings-plus').click();
    await page.getByTestId('save-checkin').click();
    await expect(page.getByTestId('checkin-saved')).toContainText('1 check-in');
    await expect(page.getByTestId('momentum')).toContainText('after 4 check-ins');
  });

  test('clients are aliases with a stage and a budget flag', async ({ page }) => {
    await loadSample(page);
    await open(page, 'clients');
    await page.getByTestId('new-client').click();
    await page.getByTestId('cf-alias').fill('Blue');
    await page.getByTestId('cf-stage').selectOption('regular');
    await page.getByTestId('cf-budget').fill('200');
    await page.getByTestId('cf-save').click();
    await expect(page.getByTestId('client-Blue')).toBeVisible();
    await page.getByTestId('client-Blue').click();
    await page.getByTestId('cf-paid').fill('250');
    await page.getByTestId('cf-log').click();
    await page.getByTestId('cf-save').click();
    await expect(page.getByTestId('client-flags')).toContainText('Blue is $50 past');
    await open(page);
    await expect(page.getByTestId('budget-flags')).toContainText('Blue');
  });
});

test.describe('privacy and offline', () => {
  test('export then import restores everything exactly, with neutral names', async ({ page }) => {
    await loadSample(page);
    await open(page, 'businesses/sample-inperson-inPerson');
    await page.getByTestId('in-inquiriesPerMonth').fill('42');
    await page.getByTestId('in-inquiriesPerMonth').blur();
    await open(page, 'demo');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
    expect(download.suggestedFilename()).toMatch(/^numbers-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const text = readFileSync((await download.path())!, 'utf8');
    expect(text).not.toMatch(/domme|findom|kink/i);
    await expect(page.getByTestId('note')).toContainText('private');

    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('reset').click();
    await expect(page.getByTestId('next-title')).toContainText('Setup');
    await open(page, 'demo');
    await page.getByTestId('import-file').setInputFiles({ name: 'numbers-backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.getByTestId('note')).toContainText('Restored');
    await open(page, 'businesses/sample-inperson-inPerson');
    await expect(page.getByTestId('in-inquiriesPerMonth')).toHaveValue('42');

    await open(page, 'demo');
    const [snap] = await Promise.all([page.waitForEvent('download'), page.getByTestId('snapshot').click()]);
    expect(snap.suggestedFilename()).toMatch(/^numbers-snapshot-/);
    const snapshot = JSON.parse(readFileSync((await snap.path())!, 'utf8'));
    expect(snapshot.format).toBe('slam-snapshot');
    expect(snapshot.clients).toBeUndefined();
  });

  test('one tap hides the app behind a plain screen', async ({ page }) => {
    await loadSample(page);
    await page.getByTestId('hide').click();
    await expect(page.getByTestId('quick-hide')).toBeVisible();
    await expect(page.getByTestId('quick-hide')).not.toContainText(/SLAM|money|profit/i);
    await page.getByRole('button', { name: 'Return' }).click();
    await expect(page.getByTestId('next-card')).toBeVisible();
  });

  test('zero network requests leave the device', async ({ page, baseURL }) => {
    const away: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(baseURL!)) away.push(r.url());
    });
    await loadSample(page);
    for (const p of ['numbers', 'clients', 'businesses', 'hypotheticals', 'toolbox/offer', 'demo']) await open(page, p);
    await page.waitForTimeout(500);
    expect(away).toEqual([]);
  });

  test('opens offline once installed', async ({ page, context }) => {
    await loadSample(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(500);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('today-numbers')).toBeVisible({ timeout: 15_000 });
    await open(page, 'hypotheticals');
    await expect(page.getByTestId('scenario-Dream')).toContainText('$');
    await context.setOffline(false);
  });
});
