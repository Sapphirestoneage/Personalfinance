/* Scripted journeys. Each flow gets a fresh page and asserts behaviour with check(). */
import fs from 'node:fs';
import path from 'node:path';

export const flows = [
  {
    name: 'level0-load-save-export-import-undo',
    async run(page, { base, check, APP }) {
      await page.goto(base + 'index.html#/home');
      await page.waitForSelector('text=No clients yet');
      await page.click('button[aria-label="New client"]');
      await page.fill('input[aria-label="New client name"]', 'Jordan');
      await page.press('input[aria-label="New client name"]', 'Enter');
      await page.waitForSelector('.fieldrow[data-field="birthDate"]');
      await openMore(page);
      check('new client opens with its name', (await page.inputValue('.fieldrow[data-field="name"] input')) === 'Jordan');
      check('the state starts on New York as an estimate', (await page.inputValue('.fieldrow[data-field="state"] select.select')) === 'NY' && (await page.textContent('.fieldrow[data-field="state"] .src .chip')) === 'Estimated');
      check('topbar names the client', (await page.textContent('#topbar-client')) === 'Jordan');

      await page.fill('.fieldrow[data-field="bigGoal"] input', 'Brooklyn');
      await page.press('.fieldrow[data-field="bigGoal"] input', 'Tab');
      await page.fill('.fieldrow[data-field="birthDate"] input', '1999-03-14');
      await page.press('.fieldrow[data-field="birthDate"] input', 'Tab');
      await page.selectOption('.fieldrow[data-field="state"] select.select', 'NJ');
      await page.selectOption('.fieldrow[data-field="state"] select.select', 'NY');
      await page.waitForTimeout(500);
      check('changing the state makes the client its source', (await page.textContent('.fieldrow[data-field="state"] .src .chip')) === 'Client');
      check('saved indicator shows Saved', (await page.textContent('#saved')) === 'Saved');
      check('age shows beside the birth date', (await page.textContent('.fieldrow[data-field="birthDate"] label')).indexOf('age 27') !== -1);

      await page.reload();
      await page.waitForSelector('.fieldrow[data-field="birthDate"]');
      await openMore(page);
      check('a reload keeps the client and the big goal', (await page.inputValue('.fieldrow[data-field="bigGoal"] input')) === 'Brooklyn');
      check('state persisted', (await page.inputValue('.fieldrow[data-field="state"] select.select')) === 'NY');

      /* state chip by keystroke: focus the chip select for city and press r */
      const chip = page.locator('.fieldrow[data-field="bigGoal"] select[aria-label="Answer state"]');
      await chip.focus();
      await page.keyboard.press('r');
      await page.waitForTimeout(100);
      check('one key sets Rough', (await page.textContent('.fieldrow[data-field="bigGoal"] .chip')) === 'Rough');

      /* undo and redo */
      await page.click('#undo');
      await page.waitForTimeout(100);
      check('undo reverts the state', (await page.textContent('.fieldrow[data-field="bigGoal"] .chip')) === 'Known');
      await page.click('#redo');
      await page.waitForTimeout(100);
      check('redo re-applies it', (await page.textContent('.fieldrow[data-field="bigGoal"] .chip')) === 'Rough');
      await page.keyboard.press('Escape');
      await page.click('main > header h1');
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(100);
      check('Ctrl+Z undoes too', (await page.textContent('.fieldrow[data-field="bigGoal"] .chip')) === 'Known');

      /* export */
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('table.data button:has-text("Export")')]);
      const tmp = path.join(APP, 'screenshots', '.tmp-export.json');
      fs.mkdirSync(path.dirname(tmp), { recursive: true });
      await download.saveAs(tmp);
      const exported = JSON.parse(fs.readFileSync(tmp, 'utf8'));
      check('export carries the record and its journal', exported.record && exported.record.sun.f.bigGoal.v === 'Brooklyn' && Array.isArray(exported.record.journal) && exported.record.journal.length > 3);
      const journalLen = exported.record.journal.length;

      /* change, then import the file over it: the import wins and can be undone */
      await openMore(page);
      await page.fill('.fieldrow[data-field="bigGoal"] input', 'Queens');
      await page.press('.fieldrow[data-field="bigGoal"] input', 'Tab');
      await page.waitForTimeout(400);
      await page.setInputFiles('input[aria-label="Import a client file"]', tmp);
      await page.waitForSelector('.toast');
      await page.waitForTimeout(200);
      check('import restores the exported big goal', (await page.inputValue('.fieldrow[data-field="bigGoal"] input')) === 'Brooklyn');
      check('import offers undo', (await page.textContent('.toast')).indexOf('Undo import') !== -1);
      await page.click('.toast button');
      await page.waitForTimeout(200);
      check('undo import brings back the newer copy', (await page.inputValue('.fieldrow[data-field="bigGoal"] input')) === 'Queens');
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

import { enterHousehold, compareToSpec } from './ui-keyboard.js';
import { specs } from './households/specs.mjs';

flows.push({
  name: 'level1-jordan-keyboard-only',
  async run(page, { base, check, APP }) {
    await page.goto(base + 'index.html#/home');
    await page.waitForSelector('text=No clients yet');
    const t0 = Date.now();
    const { keys, rowIds } = await enterHousehold(page, specs.jordan, check);
    const seconds = Math.round((Date.now() - t0) / 1000);
    const record = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('mr3:client:')))));
    compareToSpec(record, specs.jordan, rowIds, check, 'keyboard');
    fs.mkdirSync(path.join(APP, 'screenshots'), { recursive: true });
    fs.writeFileSync(path.join(APP, 'screenshots', '.tmp-keyboard-timing.json'), JSON.stringify({ seconds, keys, rows: Object.keys(rowIds).length }));
    /* round trip: export, wipe, import, compare again */
    await page.goto(base + 'index.html#/home');
    await page.waitForSelector('table.data button:has-text("Export")');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('table.data button:has-text("Export")')]);
    const tmp = path.join(APP, 'screenshots', '.tmp-jordan-export.json');
    await download.saveAs(tmp);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('text=No clients yet');
    await page.setInputFiles('input[aria-label="Import a client file"]', tmp);
    await page.waitForSelector('.orbit');
    const back = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('mr3:client:')))));
    compareToSpec(back, specs.jordan, rowIds, check, 'round trip');
    check('round trip keeps the journal', back.journal.length >= record.journal.length);
    fs.unlinkSync(tmp);
  },
});

/* Level 2: the one-pager prints to exactly one page; a keystroke recompute for Maya stays under 100 ms; the demo button loads Maya. */
async function importFixture(page, APP, name) {
  await page.setInputFiles('input[aria-label="Import a client file"]', path.join(APP, 'tests', 'households', name + '.json'));
  await page.waitForSelector('.orbit');
}
/* The extra household facts sit behind a disclosure; open it only when it is closed. */
async function openMore(page) {
  const btn = page.locator('button[aria-label="More facts"]');
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
}
function pdfPages(buf) {
  const text = buf.toString('latin1');
  const m = text.match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : 0;
}
flows.push({
  name: 'level2-onepager-prints-to-one-page',
  async run(page, { base, check, APP }) {
    for (const name of ['jordan', 'dev', 'maya']) {
      await page.goto(base + 'index.html#/home');
      await page.waitForSelector('#main h1');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForSelector('text=No clients yet');
      await importFixture(page, APP, name);
      await page.goto(base + 'index.html#/onepager');
      await page.waitForSelector('.onepager');
      await page.emulateMedia({ media: 'print' });
      const buf = await page.pdf({ format: 'Letter', printBackground: true });
      await page.emulateMedia({ media: 'screen' });
      const pages = pdfPages(buf);
      check(name + ': one-pager prints to exactly one page', pages === 1, pages + ' pages');
      if (name === 'maya') { fs.mkdirSync(path.join(APP, 'screenshots', 'level-2'), { recursive: true }); fs.writeFileSync(path.join(APP, 'screenshots', 'level-2', 'maya-onepager.pdf'), buf); }
    }
  },
});
flows.push({
  name: 'level2-maya-recompute-under-100ms',
  async run(page, { base, check, APP }) {
    await page.goto(base + 'index.html#/home');
    await page.waitForSelector('text=No clients yet');
    await importFixture(page, APP, 'maya');
    await page.goto(base + 'index.html#/ledger/spending/line');
    await page.waitForSelector('.ledger-table');
    const cell = page.locator('tr[data-row="m-groc"] [data-col="amount"]');
    await cell.focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('531');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    const ms = await page.evaluate(() => mr3.lastComputeMs);
    check('Maya recompute after a keystroke is under 100 ms', typeof ms === 'number' && ms < 100, ms + ' ms');
    const val = await page.evaluate(() => mr3.record.planets.spending.rows.find(r => r.id === 'm-groc').f.amount.v);
    check('the typed amount landed', val === 53100, String(val));
    fs.writeFileSync(path.join(APP, 'screenshots', '.tmp-perf.json'), JSON.stringify({ ms }));
  },
});
flows.push({
  name: 'level2-load-demo-and-client-view',
  async run(page, { base, check }) {
    await page.goto(base + 'index.html#/home');
    await page.waitForSelector('text=No clients yet');
    await page.click('text=Load demo client');
    await page.waitForSelector('.orbit');
    check('demo loads Maya', (await page.textContent('#topbar-client')) === 'Maya Lindqvist');
    await page.goto(base + 'index.html#/measure');
    await page.waitForSelector('.kpis');
    const lensCount = await page.locator('.lens').count();
    check('coach view shows every firing lens', lensCount >= 5, String(lensCount));
    await page.click('#view-client');
    await page.waitForTimeout(200);
    const clientLenses = await page.locator('.lens').count();
    check('client view shows only the picked lenses', clientLenses < lensCount && clientLenses >= 1, String(clientLenses));
    const text = await page.evaluate(() => document.body.innerText);
    check('client view hides private notes and my plate', text.indexOf('Private note') === -1);
    await page.click('.kpi');
    await page.waitForSelector('.drawer');
    check('a number opens its math', (await page.textContent('.drawer')).indexOf('Formula') !== -1);
  },
});

/* Level 3: a scripted mock session for Jordan, start to finish. */
flows.push({
  name: 'level3-jordan-mock-session',
  async run(page, { base, check, APP }) {
    await page.goto(base + 'index.html#/home');
    await page.waitForSelector('text=No clients yet');
    await importFixture(page, APP, 'jordan');
    await page.goto(base + 'index.html#/session');
    await page.waitForSelector('.next-card');
    const q1 = await page.textContent('.ask.big .ask-text');
    check('the next question is a plain sentence about one fact', /\?$/.test(q1.trim()) && q1.length > 20, q1);
    const smaller = await page.locator('.next-card .ask:not(.big)').count();
    check('one big question and two smaller ones', smaller === 2, String(smaller));
    const circle = await page.locator('.panel:has(h2:has-text("Everything unsure")) tbody tr').count();
    check('a ranked list of everything unsure follows', circle >= 3, String(circle));
    /* their plate and my plate */
    const theirs = await page.textContent('button:has-text("Their plate")');
    const mine = await page.textContent('button:has-text("My plate")');
    check('their plate has client facts to bring', /\((\d+)\)/.test(theirs) && parseInt(theirs.match(/\((\d+)\)/)[1], 10) > 0, theirs);
    check('my plate has lookups to confirm', /\((\d+)\)/.test(mine) && parseInt(mine.match(/\((\d+)\)/)[1], 10) > 0, mine);
    const email = await page.inputValue('textarea.email');
    check('the follow-up email groups by institution with where to find each number', email.indexOf('Where:') !== -1 && email.indexOf('Subject:') === 0 && !/\$\d/.test(email.split('\n').slice(4).join('\n')), email.slice(0, 120));
    /* ask the big question: jump to the cell, answer it */
    await page.click('.ask.big a.btn');
    await page.waitForTimeout(300);
    const focused = await page.evaluate(() => { const a = document.activeElement; return a && (a.dataset.col || a.getAttribute('aria-label')); });
    check('Ask it lands in the right cell', !!focused, String(focused));
    await page.keyboard.press('Control+a');
    await page.keyboard.type('v2000');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    await page.goto(base + 'index.html#/session');
    await page.waitForSelector('.next-card');
    const q2 = await page.textContent('.ask.big .ask-text');
    check('answering moves the next question on', q2 !== q1, q2);
    /* mark a plate item done, then close the session */
    await page.click('button:has-text("Their plate")');
    await page.click('tbody tr:first-child input.pick');
    await page.waitForTimeout(150);
    check('a plate item can be marked done', await page.isChecked('tbody tr:first-child input.pick'));
    await page.click('text=Close this session');
    await page.waitForTimeout(200);
    const sessions = await page.evaluate(() => mr3.record.sessions.length);
    check('closing takes a session snapshot', sessions === 1, String(sessions));
    await page.goto(base + 'index.html#/ledger/spending/line');
    await page.waitForSelector('.ledger-table');
    const cell = page.locator('tr[data-row="j-groc"] [data-col="amount"]');
    await cell.focus(); await page.keyboard.press('Control+a'); await page.keyboard.type('v455'); await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    await page.goto(base + 'index.html#/onepager');
    await page.waitForSelector('.onepager');
    const op = await page.textContent('.onepager');
    check('the one-pager shows what changed since the session closed', op.indexOf('Groceries') !== -1 && op.indexOf('$455') !== -1, op.slice(0, 80));
  },
});

/* Level 4: Jordan + kid + Portugal, each alone and together; Promote writes one goal. */
flows.push({
  name: 'level4-jordan-kid-portugal',
  async run(page, { base, check, APP }) {
    await page.goto(base + 'index.html#/home');
    await page.waitForSelector('text=No clients yet');
    await importFixture(page, APP, 'jordan');
    await page.goto(base + 'index.html#/scenarios');
    await page.waitForSelector('.timeline');
    await page.selectOption('select[aria-label="Add a block"]', 'kid');
    await page.waitForSelector('.timeline .block');
    await page.selectOption('select[aria-label="Add a block"]', 'geo');
    await page.waitForTimeout(200);
    check('two blocks sit on the timeline', (await page.locator('.timeline .block').count()) === 2);
    await page.fill('input[aria-label="Block name"]', 'Portugal');
    await page.press('input[aria-label="Block name"]', 'Tab');
    await page.waitForTimeout(200);
    const rows = await page.locator('.panel:has(h2:has-text("Each alone and together")) tbody tr').allInnerTexts();
    const foot = await page.locator('.panel:has(h2:has-text("Each alone and together")) tfoot tr').allInnerTexts();
    check('the table shows today, each block alone and all together', rows.length === 3 && rows[1].indexOf('A child alone') !== -1 && rows[2].indexOf('Portugal alone') !== -1 && foot.length === 1 && foot[0].indexOf('All together') !== -1, rows.join(' / ') + ' // ' + foot.join(''));
    /* drag with the keyboard: focus the block and move it two years */
    const block = page.locator('.timeline .block').first();
    await block.focus();
    const before = await block.innerText();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    const after = await page.locator('.timeline .block').first().innerText();
    check('a block moves along the timeline', after !== before, before + ' then ' + after);
    /* reality untouched until Promote */
    const goalsBefore = await page.evaluate(() => mr3.record.planets.life.rows.length);
    await page.click('button:has-text("Add to Life plan")');
    await page.waitForTimeout(200);
    const goalsAfter = await page.evaluate(() => mr3.record.planets.life.rows.length);
    check('Promote adds exactly one Life plan goal through the Ledger', goalsAfter === goalsBefore + 1);
    const promotedChips = await page.locator('.chip:has-text("In the Life plan")').allInnerTexts();
    check('the block is marked promoted', promotedChips.length === 1, JSON.stringify(promotedChips));
  },
});

/* Level 7: an end-to-end mock session for Dev (self-employed, Solo 401k, HSA, the
   harder household): open, ask, answer, mark done, note, close, read the one-pager. */
flows.push({
  name: 'level7-dev-mock-session',
  async run(page, { base, check, APP }) {
    await page.goto(base + 'index.html#/home');
    await page.waitForSelector('text=No clients yet');
    await importFixture(page, APP, 'dev');
    await page.goto(base + 'index.html#/measure');
    await page.waitForSelector('.kpi');
    const kpis = await page.locator('.kpi').count();
    check('Dev opens on a full Measure screen', kpis >= 40, String(kpis));
    await page.goto(base + 'index.html#/session');
    await page.waitForSelector('.next-card');
    const q1 = await page.textContent('.ask.big .ask-text');
    check('Dev gets a plain question first', /\?$/.test(q1.trim()), q1);
    const unsure = await page.locator('.panel:has(h2:has-text("Everything unsure")) tbody tr').count();
    check('Dev has a ranked list of unsure facts', unsure >= 3, String(unsure));
    const email = await page.inputValue('textarea.email');
    check('the email asks Dev by institution and carries no balances', email.indexOf('Where:') !== -1 && !/\$\d/.test(email.split('\n').slice(4).join('\n')), email.slice(0, 100));
    /* answer the big question in the Ledger */
    await page.click('.ask.big a.btn');
    await page.waitForTimeout(300);
    const focused = await page.evaluate(() => { const a = document.activeElement; return a && (a.dataset.col || a.getAttribute('aria-label')); });
    check('Ask it lands in a Ledger cell for Dev', !!focused, String(focused));
    await page.keyboard.press('Control+a');
    await page.keyboard.type('v1200');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    await page.goto(base + 'index.html#/session');
    await page.waitForSelector('.next-card');
    const q2 = await page.textContent('.ask.big .ask-text');
    check('the answered fact leaves the next-question card', q2 !== q1, q2);
    /* a note, then close */
    await page.fill('input[aria-label="Session note"]', 'Confirmed the Solo 401k deposit; HSA statement to come.');
    await page.click('text=Close this session');
    await page.waitForTimeout(200);
    const saved = await page.evaluate(() => mr3.record.sessions.map(s => s.note || s.summary || ''));
    check('closing saves the typed note with the snapshot', saved.length === 1 && saved[0].indexOf('Solo 401k') !== -1, JSON.stringify(saved));
    await page.waitForSelector('text=Since last time');
    await page.goto(base + 'index.html#/onepager');
    await page.waitForSelector('.onepager');
    await page.emulateMedia({ media: 'print' });
    const pages = pdfPages(await page.pdf({ format: 'Letter', printBackground: true }));
    await page.emulateMedia({ media: 'screen' });
    check('the one-pager still prints to one page after the session', pages === 1, pages + ' pages');
    const op = await page.textContent('.onepager');
    check('the one-pager carries no private notes', op.indexOf('HSA statement to come') === -1);
  },
});
