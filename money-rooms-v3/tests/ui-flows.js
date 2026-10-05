/* Scripted journeys. Each flow gets a fresh page and asserts behaviour with check(). */
import fs from 'node:fs';
import path from 'node:path';

export const flows = [
  {
    name: 'level0-load-save-export-import-undo',
    async run(page, { base, check, APP }) {
      await page.goto(base + 'index.html#/home');
      await page.waitForSelector('text=No clients yet');
      await page.fill('input[aria-label="New client name"]', 'Jordan');
      await page.press('input[aria-label="New client name"]', 'Enter');
      await page.waitForSelector('.fieldrow[data-field="name"]');
      check('new client opens with its name', (await page.inputValue('.fieldrow[data-field="name"] input')) === 'Jordan');
      check('topbar names the client', (await page.textContent('#topbar-client')) === 'Jordan');

      await page.fill('.fieldrow[data-field="city"] input', 'Brooklyn');
      await page.press('.fieldrow[data-field="city"] input', 'Tab');
      await page.fill('.fieldrow[data-field="birthDate"] input', '1999-03-14');
      await page.press('.fieldrow[data-field="birthDate"] input', 'Tab');
      await page.selectOption('.fieldrow[data-field="state"] select.select', 'NY');
      await page.waitForTimeout(500);
      check('saved indicator shows Saved', (await page.textContent('#saved')) === 'Saved');
      check('age shows beside the birth date', (await page.textContent('.fieldrow[data-field="birthDate"] label')).indexOf('age 27') !== -1);

      await page.reload();
      await page.waitForSelector('.fieldrow[data-field="city"] input');
      check('a reload keeps the client and the city', (await page.inputValue('.fieldrow[data-field="city"] input')) === 'Brooklyn');
      check('state persisted', (await page.inputValue('.fieldrow[data-field="state"] select.select')) === 'NY');

      /* state chip by keystroke: focus the chip select for city and press r */
      const chip = page.locator('.fieldrow[data-field="city"] select[aria-label="Answer state"]');
      await chip.focus();
      await page.keyboard.press('r');
      await page.waitForTimeout(100);
      check('one key sets Rough', (await page.textContent('.fieldrow[data-field="city"] .chip')) === 'Rough');

      /* undo and redo */
      await page.click('#undo');
      await page.waitForTimeout(100);
      check('undo reverts the state', (await page.textContent('.fieldrow[data-field="city"] .chip')) === 'Known');
      await page.click('#redo');
      await page.waitForTimeout(100);
      check('redo re-applies it', (await page.textContent('.fieldrow[data-field="city"] .chip')) === 'Rough');
      await page.keyboard.press('Escape');
      await page.click('body', { position: { x: 5, y: 300 } });
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(100);
      check('Ctrl+Z undoes too', (await page.textContent('.fieldrow[data-field="city"] .chip')) === 'Known');

      /* export */
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('table.data button:has-text("Export")')]);
      const tmp = path.join(APP, 'screenshots', '.tmp-export.json');
      fs.mkdirSync(path.dirname(tmp), { recursive: true });
      await download.saveAs(tmp);
      const exported = JSON.parse(fs.readFileSync(tmp, 'utf8'));
      check('export carries the record and its journal', exported.record && exported.record.sun.f.city.v === 'Brooklyn' && Array.isArray(exported.record.journal) && exported.record.journal.length > 3);
      const journalLen = exported.record.journal.length;

      /* change, then import the file over it: the import wins and can be undone */
      await page.fill('.fieldrow[data-field="city"] input', 'Queens');
      await page.press('.fieldrow[data-field="city"] input', 'Tab');
      await page.waitForTimeout(400);
      await page.setInputFiles('input[aria-label="Import a client file"]', tmp);
      await page.waitForSelector('.toast');
      await page.waitForTimeout(200);
      check('import restores the exported city', (await page.inputValue('.fieldrow[data-field="city"] input')) === 'Brooklyn');
      check('import offers undo', (await page.textContent('.toast')).indexOf('Undo import') !== -1);
      await page.click('.toast button');
      await page.waitForTimeout(200);
      check('undo import brings back the newer copy', (await page.inputValue('.fieldrow[data-field="city"] input')) === 'Queens');
      fs.unlinkSync(tmp);

      /* client view hides the coach panels */
      await page.click('#view-client');
      await page.waitForTimeout(100);
      check('client view hides the clients panel', (await page.isVisible('.panel.coach-only')) === false);
      await page.keyboard.press('`');
      await page.waitForTimeout(100);
      check('backtick toggles back to coach', (await page.getAttribute('body', 'data-view')) === 'coach');

      /* quick note */
      await page.keyboard.press('Control+.');
      await page.waitForSelector('.quicknote input');
      await page.fill('.quicknote input', 'ask about the bonus');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
      const state = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('mr3:client:')))));
      check('quick note lands in the record', state.quickNotes.length === 1 && state.quickNotes[0].text === 'ask about the bonus');
      check('record carries schemaVersion', typeof state.schemaVersion === 'number');
      check('journal grew after import and later edits', state.journal.length >= journalLen);
    },
  },
];
