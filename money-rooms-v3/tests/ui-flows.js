/* Scripted journeys. Each flow gets a fresh page and asserts behaviour with check(). */
import fs from 'node:fs';
import path from 'node:path';
import { CSV as MAYA_CSV } from './households/maya-transactions.mjs';

export const flows = [
{
  name: 'level10-maya-program',
  async run(page, { base, check, APP }) {
    await page.goto(base + 'index.html#/home');
    await page.waitForSelector('#main h1, #main .empty');
    await importFixture(page, APP, 'maya-discovery');
    /* the program view and the prep screen */
    await page.goto(base + 'index.html#/program');
    await page.waitForSelector('table.program');
    check('the program view lists discovery and twelve sessions', (await page.$$('table.program tbody tr')).length === 13);
    check('the clients table on Home will say Session 1 of 12', (await page.textContent('header .sub')).indexOf('session 1 of 12') !== -1);
    await page.goto(base + 'index.html#/prep');
    await page.waitForSelector('.plan-list');
    const prep = await page.textContent('#main');
    check('the prep screen carries her words, the accounts and the plan', prep.indexOf('Her words') !== -1 && prep.indexOf('Tracking app linked') !== -1 && prep.indexOf('Gut lap') !== -1 && prep.indexOf('What this session leaves known') !== -1);
    check('no internal words on the prep screen', !/\bblock\b|curricul|priorit|\bmust\b|\bshould\b|\bcould\b|knowledge target/i.test(prep), (prep.match(/.{0,20}(block|curricul|priorit|\bmust\b|\bshould\b|\bcould\b|knowledge target).{0,20}/i) || [])[0]);
    /* session 1 */
    await page.click('a:has-text("Start session 1")');
    await page.waitForSelector('.runner-tl .tl-seg');
    check('the timeline has one segment per part and the first is lit', (await page.$$('.tl-seg')).length >= 12 && (await page.$$('.tl-seg.current')).length === 1);
    check('the urgent check offers chips', (await page.$$('.run-body .chipbar .chip')).length === 6);
    await page.click('.runner-foot button:has-text("All clear")');
    await page.waitForSelector('.run-body h2:has-text("Close open loops")');
    await page.click('.runner-foot button:has-text("Next")');
    await page.waitForSelector('.run-body h2:has-text("plan")');
    await page.click('.runner-foot button:has-text("Let\'s go")');
    await page.waitForSelector('.run-body h2:has-text("Confirm")');
    check('Confirm renders the Level 8 stop inside its part', (await page.$$('.run-body .confirm-list')).length >= 1);
    await page.click('.runner-foot button:has-text("Done with this part")');
    await page.waitForSelector('.run-body h2:has-text("Housing and roommate")');
    await page.click('.runner-foot button:has-text("Next")');
    await page.waitForSelector('.run-body h2:has-text("Gut lap")');
    check('the gut lap asks one question at a time', (await page.$$('.run-body .answer input')).length >= 1);
    await page.click('.runner-foot button:has-text("Done with this part")');
    await page.waitForSelector('.run-body h2:has-text("Debt check")');
    await page.click('.runner-foot button:has-text("Next")');
    await page.waitForSelector('.run-body h2:has-text("First accounts")');
    check('first accounts shows the tracking app and the savings with buckets in her words', (await page.$$('.checklist-card')).length >= 2 && (await page.textContent('.run-body')).indexOf('We are linking, not looking') !== -1 && (await page.textContent('.run-body')).indexOf('Buckets, in your words') !== -1);
    await page.click('.checklist-card[data-item="rocket"] button:has-text("Linked")');
    await page.waitForSelector('.checklist-card[data-item="rocket"] button[aria-pressed="true"]:has-text("Linked")');
    await page.click('.checklist-card[data-item="hysa"] button:has-text("Opened")');
    await page.waitForSelector('.checklist-card[data-item="hysa"] button[aria-pressed="true"]:has-text("Opened")');
    /* behind at minute 35: the rehearsal clock jumps and the app moves First picture */
    for (let k = 0; k < 8; k++) await page.click('button[aria-label="Rehearsal: five minutes on"]');
    await page.waitForFunction(() => (document.querySelector('.runner-note') || {}).textContent.indexOf('moved to next time') !== -1);
    check('behind at minute 35, the app moves the should part and says so', (await page.textContent('.runner-note')).indexOf('First picture moved to next time') !== -1);
    check('the clock reads the rehearsal minute', /Minute 4\d/.test(await page.textContent('.tl-clock')));
    await page.click('.runner-foot button:has-text("Next")');
    await page.waitForSelector('.run-body h2:has-text("Three steps")');
    const steps = await page.textContent('.run-body');
    check('three steps shows what she did today as done and at most three open items', steps.indexOf('Today you linked your accounts, opened high-yield savings with buckets') !== -1 && (await page.$$('.steps-list li:not(.done)')).length <= 3);
    await page.click('.runner-foot button:has-text("On to booking")');
    await page.waitForSelector('.readiness-line');
    check('the close shows the readiness line', /Session 1 targets: \d of 7 met/.test(await page.textContent('.readiness-line')));
    await page.fill('input[aria-label="Next session date"]', '2026-10-21');
    await page.click('.runner-foot button:has-text("Close the session")');
    await page.waitForSelector('.next-card');
    check('closing the session lands on the Session page', true);
    await page.goto(base + 'index.html#/program');
    await page.waitForSelector('table.program');
    const row1 = await page.textContent('table.program tr[data-session="1"]');
    check('the program view marks session 1 done with its date and targets', row1.indexOf('Done') !== -1 && /\d of 7/.test(row1));
    check('the next date shows', (await page.textContent('header .sub')).indexOf('21 Oct 2026') !== -1);
    /* urgent mode in session 2 */
    await page.goto(base + 'index.html#/call/2');
    await page.waitForSelector('.run-body .chipbar .chip');
    await page.click('.run-body .chipbar .chip:has-text("An overdraft")');
    await page.waitForFunction(() => document.querySelectorAll('.tl-seg').length === 4);
    check('urgent mode keeps four parts and says what today is about', (await page.textContent('.runner-note')).indexOf('Today is about an overdraft') !== -1 && (await page.textContent('.run-body h2')).indexOf('The urgent thing') !== -1);
    await page.goto(base + 'index.html#/program');
    await page.waitForSelector('table.program');
    check('the urgent session shows between sessions without taking a number', (await page.$$('table.program tr.urgent-row')).length === 1 && (await page.$$('table.program tbody tr')).length === 14);
    /* session 2 checklist: the urgent session moved every session 2 part to session 3, so that is where the accounts are now */
    await page.goto(base + 'index.html#/call/3');
    await page.waitForSelector('.tl-seg');
    await page.click('.tl-seg[title^="The rest of the accounts"]');
    await page.waitForSelector('.checklist-card[data-item="roth"]');
    const c2 = await page.$$eval('.checklist-card', els => els.map(e => e.dataset.item));
    check('the rest of the accounts come in order, with the rolled savings and the triggered search, in the session they moved to', c2.indexOf('roth') < c2.indexOf('k401') && c2.indexOf('k401') < c2.indexOf('card') && c2.indexOf('card') < c2.indexOf('freeze') && c2.includes('hysa') && c2.includes('unclaimed'));
    check('the card copy is plain and the order of operations reads as information', (await page.textContent('.checklist-card[data-item="card"]')).indexOf('your choice') !== -1);
    /* session 4: the transactions and the reveal */
    await page.goto(base + 'index.html#/transactions');
    await page.waitForSelector('textarea[aria-label="Or paste the CSV"]');
    await page.fill('input[aria-label="Institution or app"]', 'Rocket Money');
    await page.fill('textarea[aria-label="Or paste the CSV"]', MAYA_CSV);
    await page.click('button:has-text("Use the pasted text")');
    await page.waitForSelector('button:has-text("Read the transactions")');
    check('the mapper recognises the export', (await page.textContent('#main')).indexOf('a Rocket Money export') !== -1);
    await page.click('button:has-text("Read the transactions")');
    await page.waitForSelector('.reveal');
    const tx = await page.textContent('#main');
    check('card payments and transfers are taken out and the roommate Venmo is set aside for the coach', tx.indexOf('card payment') !== -1 && tx.indexOf('VENMO FROM DANI') !== -1 && tx.indexOf('transfer between your accounts') !== -1);
    check('subscriptions and the fee show', tx.indexOf('ADOBE ANNUAL PLAN') !== -1 && tx.indexOf('OVERDRAFT FEE') !== -1 && tx.indexOf('Buy now, pay later') !== -1);
    check('the reveal gives the blind spot and one found-money win', /\d+% of what goes out was not in your picture/.test(tx) && tx.indexOf('Found money') !== -1 && tx.indexOf('Cancel ADOBE ANNUAL PLAN') !== -1);
    await page.click('button:has-text("Write these into the Ledger")');
    await page.waitForSelector('.toast');
    await page.goto(base + 'index.html#/program');
    await page.waitForSelector('table.program');
    check('the program view now shows session 4 targets moving', /\d of 3/.test(await page.textContent('table.program tr[data-session="4"]')));
    await page.goto(base + 'index.html#/ledger/spending/line');
    await page.waitForSelector('table.ledger-table');
    check('the Ledger carries verified lines from the transactions', (await page.textContent('#main')).indexOf('Everything else') !== -1);
  },
},
{
  name: 'level11-maya-goal-timeline',
  async run(page, { base, check, APP }) {
    await page.goto(base + 'index.html#/home');
    await page.waitForSelector('#main h1');
    await importFixture(page, APP, 'maya');
    await page.waitForSelector('.goals-line');
    check('Home carries the next win and a link to the timeline', (await page.textContent('.goals-line')).indexOf('Goal timeline') !== -1);
    await page.goto(base + 'index.html#/goals');
    await page.waitForSelector('.gtl');
    const sentence = await page.textContent('.gtl-sentence');
    check('the top of the screen is one sentence: your next win', /^Your next win is .+, in [A-Z][a-z]{2} \d{4}\.$/.test(sentence.trim()), sentence);
    check('the lean month and the full month are the first rows and locked', (await page.getAttribute('.gtl-row:not(.gtl-head) >> nth=0', 'data-goal')) === 'lean' && (await page.getAttribute('.gtl-row:not(.gtl-head) >> nth=1', 'data-goal')) === 'fullmonth' && (await page.$$('.gtl-row.starter .gtl-move button')).length === 0);
    /* already met: Maya's savings already cover both floors; the card shows once */
    await page.waitForSelector('.cheer');
    const cheer = await page.textContent('.cheer');
    check('the celebration says what is already covered', cheer.indexOf('You already have a lean month covered') !== -1 && cheer.indexOf('a full month covered') !== -1);
    await page.click('.cheer button:has-text("Got it")');
    await page.waitForFunction(() => !document.querySelector('.cheer'));
    check('the celebration is shown once', (await page.$$('.cheer')).length === 0);
    check('covered steps read as covered in the table', (await page.textContent('tr[data-goal="lean"]')).indexOf('Covered already') !== -1);
    check('long-term goals sit at the right edge with their dates', (await page.$$('.gtl-row.type-long-term .gtl-edge')).length === 3);
    check('the three ways are compared in a small table', (await page.$$('table.compare tbody tr')).length === 3);
    const landsBefore = await page.textContent('tr[data-goal="full"] td:nth-child(3)');
    /* a what-if: 100 more a month; the dates move and nothing is saved */
    await page.click('button[aria-label="More: 100 dollars a month more"]');
    await page.waitForSelector('.whatif-moves');
    check('plus 100 a month says what moved', /moved up/.test(await page.textContent('.whatif-moves')));
    check('the allocation table follows the what-if', (await page.textContent('tr[data-goal="full"] td:nth-child(3)')) !== landsBefore);
    check('the what-if is not saved', (await page.textContent('.whatif .tag')).indexOf('nothing is saved') !== -1);
    await page.click('.whatif button:has-text("Reset")');
    /* using the cushion: the floor comes first again and the month is marked */
    await page.selectOption('select[aria-label="Use the cushion month"]', { index: 3 });
    await page.fill('input[aria-label="Amount used"]', '20000');
    await page.press('input[aria-label="Amount used"]', 'Enter');
    await page.waitForSelector('.gtl-cell.refill');
    check('using the cushion marks the refill on the cushion rows, the lean month first', (await page.$$('.gtl-row[data-goal="lean"] .gtl-cell.refill')).length === 1 && (await page.$$('.gtl-row[data-goal="lean"] .gtl-cell.fill')).length >= 1 && (await page.$$('.gtl-row[data-goal="fullmonth"] .gtl-cell.refill')).length === 1);
    check('the what-if chip names it', (await page.textContent('.whatif')).indexOf('Used $20,000') !== -1);
    await page.click('.whatif button:has-text("Reset")');
    /* the mode comparison: switch, then confirm writes the mode */
    await page.click('.mode-switch button:has-text("One at a time")');
    await page.waitForSelector('table.compare tr.current[data-mode="one-at-a-time"]');
    check('the switch changes the run and highlights its row', (await page.textContent('.whatif')).indexOf('Confirm') !== -1);
    await page.click('.whatif button:has-text("Confirm")');
    await page.waitForFunction(() => (document.querySelector('.whatif .tag') || {}).textContent === 'nothing changed');
    check('confirm saves the mode to the record', (await page.getAttribute('.mode-switch button:has-text("One at a time")', 'aria-pressed')) === 'true');
    /* reorder with the arrows, then confirm */
    const second = await page.getAttribute('.gtl-row:not(.gtl-head) >> nth=2', 'data-goal');
    await page.click('.gtl-row:not(.gtl-head) >> nth=3 >> button[aria-label^="Move"][aria-label$="up"]');
    await page.waitForFunction(id => document.querySelectorAll('.gtl-row:not(.gtl-head)')[2].dataset.goal !== id, second);
    check('a goal moves up the list but never above the floors', (await page.getAttribute('.gtl-row:not(.gtl-head) >> nth=0', 'data-goal')) === 'lean');
    await page.click('.whatif button:has-text("Confirm")');
    await page.waitForFunction(() => (document.querySelector('.whatif .tag') || {}).textContent === 'nothing changed');
    /* the calendar file */
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Add to calendar")')]);
    check('add to calendar downloads an ics file', /\.ics$/.test(dl.suggestedFilename()));
    /* the client view: client words only */
    await page.click('#view-client');
    await page.waitForSelector('.gtl');
    const client = await page.textContent('#main');
    check('the client view keeps the sentence and the timeline', /Your next win is/.test(client) && (await page.$$('.gtl-row')).length > 4);
    check('the client view has no internal words', !/\bHCOL\b|\banchor\b|\bvariance\b|\bestimated\b|allocation|\bmode\b|override|surplus|\bfloor\b|FAT/.test(client), (client.match(/.{0,20}(allocation|mode|override|surplus|floor|FAT).{0,20}/) || [])[0]);
    await page.goto(base + 'index.html#/onepager');
    await page.waitForSelector('.onepager');
    check('the one-pager lists the next wins', (await page.textContent('.onepager')).indexOf('Your next wins') !== -1);
    await page.click('#view-coach');
    await page.goto(base + 'index.html#/session');
    await page.waitForSelector('.next-card');
    check('the follow-up email names the next win', (await page.inputValue('textarea.email')).indexOf('Your next win') !== -1);
  },
},
{
  name: 'level8-maya-discovery-to-targets',
  async run(page, { base, check, APP }) {
    /* 1. the discovery form: Jersey City reads as HCOL before anything is saved */
    await page.goto(base + 'index.html#/home');
    await page.waitForSelector('#main h1, #main .empty');
    await page.goto(base + 'index.html#/discovery');
    await page.waitForSelector('.chipbar');
    check('the listening chips are there', (await page.$$('.chipbar .chip.toggle')).length >= 8);
    await page.fill('input[aria-label="Name"]', 'Maya');
    await page.press('input[aria-label="Name"]', 'Tab');
    await page.fill('input[aria-label="Birth date or age"]', '27');
    await page.press('input[aria-label="Birth date or age"]', 'Tab');
    await page.fill('input[aria-label="City"]', 'Jersey City');
    await page.press('input[aria-label="City"]', 'Tab');
    await page.waitForFunction(() => (document.querySelector('.tierline') || {}).textContent.indexOf('HCOL') !== -1);
    check('Jersey City is New York metro and HCOL', (await page.textContent('.tierline')).indexOf('New York') !== -1);
    check('the HCOL chip is pressed', (await page.getAttribute('.tierchips button:has-text("HCOL")', 'aria-pressed')) === 'true');
    await page.click('[aria-label="Roommates"] button:has-text("1")');
    await page.waitForSelector('[aria-label="Lease"]');
    await page.click('[aria-label="Lease"] button:has-text("Both")');
    /* a partner (MR-050): their take-home joins the picture */
    await page.click('[aria-label="Partner"] button:has-text("Yes")');
    await page.waitForSelector('input[aria-label="Partner nickname, optional"]');
    await page.fill('input[aria-label="Partner nickname, optional"]', 'Sam');
    await page.press('input[aria-label="Partner nickname, optional"]', 'Tab');
    await page.fill('input[aria-label="Take-home"]', '1900 every two weeks');
    await page.press('input[aria-label="Take-home"]', 'Tab');
    check('the take-home hint converts a paycheck to a month', (await page.textContent('.disc-q:has(input[aria-label="Take-home"]) .heard')).indexOf('a month') !== -1);
    await page.fill('input[aria-label="Partner\'s take-home"]', '2000 every two weeks');
    await page.press('input[aria-label="Partner\'s take-home"]', 'Tab');
    await page.fill('input[aria-label="Pay before tax"]', '68k');
    await page.press('input[aria-label="Pay before tax"]', 'Tab');
    await page.fill('input[aria-label="Spending a month, their guess"]', '2,500ish');
    await page.press('input[aria-label="Spending a month, their guess"]', 'Tab');
    check('2,500ish is rough', (await page.textContent('.disc-q:has(input[aria-label="Spending a month, their guess"]) .heard')).indexOf('rough') !== -1);
    await page.click('button[aria-label="Save the discovery call"]');
    await page.waitForSelector('.discovery-summary');
    const summary = await page.textContent('.discovery-summary');
    check('the summary names the tier and counts the guesses', summary.indexOf('HCOL') !== -1 && /Includes \d+ guesses/.test(summary));
    check('the summary names the partner and counts the money together', summary.indexOf('partner (Sam), money counted together') !== -1 && summary.indexOf("Sam's job") !== -1);
    check('the summary never says estimated', !/estimated/i.test(summary));
    /* 2. the built fixture: twelve guesses, a roommate, the call path */
    await page.goto(base + 'index.html#/home');
    await page.waitForSelector('#main h1');
    await importFixture(page, APP, 'maya-discovery');
    await page.goto(base + 'index.html#/discovery/summary');
    await page.waitForSelector('.discovery-summary');
    check('Maya starts with 12 guesses', (await page.textContent('.discovery-summary')).indexOf('Includes 12 guesses') !== -1);
    await page.goto(base + 'index.html#/ledger/spending/line');
    await page.waitForSelector('tr.guess-row');
    check('guess rows are marked in the ledger with the tier', (await page.$$('tr.guess-row')).length === 12 && (await page.textContent('tr.guess-row .guess-chip')).indexOf('Guess, HCOL') !== -1);
    await page.goto(base + 'index.html#/callpath');
    await page.waitForSelector('.callpath .stop');
    check('the call path has six stops and opens on Confirm', (await page.$$('.callpath .stop')).length === 6 && (await page.textContent('.callpath .stop.current')).indexOf('Confirm') !== -1);
    const confirmText = await page.textContent('.call-body');
    check('Confirm reads back what they said and the guesses', confirmText.indexOf('Still right?') !== -1 && confirmText.indexOf('Is yours close?') !== -1 && confirmText.indexOf('Guess, HCOL') !== -1);
    check('Confirm shows the roommate worst case', confirmText.indexOf('If it all falls on you') !== -1);
    /* rent is the first guess for a household with a roommate; their half replaces it */
    await page.click('.confirm-list .confirm-line:has-text("rent") button:has-text("Use mine")');
    await page.waitForSelector('.drawer input.input.big');
    await page.fill('.drawer input.input.big', 'my half is 1,650');
    await page.press('.drawer input.input.big', 'Enter');
    await page.waitForFunction(() => (document.querySelector('.sofar') || {}).textContent.indexOf('Includes 11 guesses') !== -1);
    check('their rent replaces the guess: 11 left', true);
    /* what you spend: one question at a time, area N of M */
    await page.click('.call-body button:has-text("On to what you spend")');
    await page.waitForSelector('.qcount');
    check('the gut stop opens on the total, one question at a time', /Question 1 of \d+/.test(await page.textContent('.qcount')));
    await page.fill('.answer input.input.big', '2,500ish');
    await page.press('.answer input.input.big', 'Enter');
    await page.waitForFunction(() => /Area 1 of 7/.test((document.querySelector('.qcount') || {}).textContent || ''));
    /* the areas a guess still fills come first; home, now theirs, waits its turn */
    const area1 = await page.textContent('.call-body .readaloud.big');
    check('the first area is one a guess still fills, asked as a shared bill', area1.indexOf('phone, internet') !== -1 && (await page.textContent('.call-body')).indexOf('whole bill or your part') !== -1);
    await page.fill('.answer input.input.big', 'like 400 a month');
    await page.press('.answer input.input.big', 'Enter');
    await page.waitForFunction(() => /Area 2 of 7/.test((document.querySelector('.qcount') || {}).textContent || ''));
    check('a rough answer moves to the next area', true);
    await page.click('.answer button:has-text("I don\'t know")');
    await page.waitForFunction(() => /Area 3 of 7/.test((document.querySelector('.qcount') || {}).textContent || ''));
    check('I don\'t know moves on in one tap', true);
    /* what you'd want: jump there by the stop nav */
    await page.click('.callpath .stop:has-text("want")');
    await page.waitForSelector('.qcount');
    const dreamText = await page.textContent('.call-body');
    check('the dream stop hides what they said until asked', dreamText.indexOf('They said:') === -1 && dreamText.indexOf('Show what they said') !== -1);
    await page.fill('.answer input.input.big', '350');
    await page.press('.answer input.input.big', 'Enter');
    await page.waitForTimeout(200);
    /* your targets */
    await page.click('.callpath .stop:has-text("targets")');
    await page.waitForSelector('.targets-table');
    const tt = await page.textContent('.targets');
    check('targets offer the four choices', ['What you said', "What you'd want", 'Meet in the middle', 'Keep it as is'].every(w => tt.indexOf(w) !== -1));
    await page.click('.targets-table tbody tr >> nth=0 >> button:has-text("Meet in the middle")');
    await page.waitForTimeout(300);
    check('a target is saved', (await page.getAttribute('.targets-table tbody tr >> nth=0 >> button:has-text("Meet in the middle")', 'aria-pressed')) === 'true');
    const todo = await page.textContent('.next-session');
    check('the target is a to-do for next session with her name on it', /1 item/.test(todo) && todo.indexOf('Aim for') !== -1 && todo.indexOf('(Maya)') !== -1);
    /* 3. the session page: meters, progress versus paperwork, the targets email */
    await page.goto(base + 'index.html#/session');
    await page.waitForSelector('.meter-row');
    const meters = await page.textContent('.meter-row');
    check('two meters: picture completeness and goal progress', meters.indexOf('Picture completeness') !== -1 && meters.indexOf('Goal progress') !== -1 && /Includes \d+ guesses/.test(meters));
    const prog = await page.textContent('.progress-panel');
    check('progress versus paperwork counts the rent correction as a guess replaced', prog.indexOf('Guesses replaced') !== -1 && /Guesses replaced\s*1/.test(prog.replace(/\n/g, ' ')));
    check('the email turns into the targets email', (await page.textContent('#main')).indexOf('Targets email') !== -1);
    /* 4. runway shows two numbers; the roommate what-if has its card */
    await page.goto(base + 'index.html#/measure');
    await page.waitForSelector('.kpi');
    check('runway says if it all falls on you', (await page.textContent('#main')).indexOf('If it all falls on you') !== -1);
    await page.goto(base + 'index.html#/scenarios');
    await page.waitForSelector('select.add-block');
    await page.selectOption('select.add-block', 'roommate');
    await page.waitForSelector('.fallsonyou-card');
    const card = await page.textContent('.fallsonyou-card');
    check('the roommate card gives the new bill, the bridge and the cushion', card.indexOf('Shared bills become') !== -1 && card.indexOf('Bridge for 2 months') !== -1 && card.indexOf('Cash covers') !== -1 && card.indexOf('Lease in both names') !== -1);
    /* 5. the client view: client words only */
    await page.click('#view-client');
    await page.goto(base + 'index.html#/measure');
    await page.waitForSelector('.kpi');
    const client = await page.textContent('#main');
    check('the client view never says HCOL, anchor, variance or estimated', !/\bHCOL\b|\banchor\b|\bvariance\b|\bestimated\b|stand-in|\bRPP\b/i.test(client));
    await page.goto(base + 'index.html#/ledger/spending/line');
    await page.waitForSelector('tr.guess-row');
    check('the client sees Guess, not the tier', (await page.textContent('tr.guess-row .guess-chip')) === 'Guess');
    await page.goto(base + 'index.html#/onepager');
    await page.waitForSelector('.onepager');
    const op = await page.textContent('.onepager');
    check('the one-pager carries what you said, your targets, the guesses and the worst case', op.indexOf("What you said, what it really is, what you'd want") !== -1 && op.indexOf('Your targets') !== -1 && /Includes \d+ guesses/.test(op) && op.indexOf('If it all falls on you') !== -1);
    check('the one-pager to-dos carry the target', op.indexOf('Aim for') !== -1);
    await page.click('#view-coach');
  },
},
{
  name: 'level9-maya-levers-and-shelf',
  async run(page, { base, check, APP }) {
    await page.goto(base + 'index.html#/home');
    await page.waitForSelector('#main h1');
    await page.setInputFiles('input[aria-label="Import a client file"]', path.join(APP, 'tests', 'households', 'maya.json'));
    await page.waitForSelector('.toast'); await page.waitForSelector('.orbit');
    /* the headline shelf on Home: tiles open the metric drawer with levers and the lens that reads it */
    await page.waitForSelector('.shelf-panel .shelf-tile[data-metric="fiDate"]');
    check('the Home shelf shows the FI date tile', (await page.textContent('.shelf-tile[data-metric="fiDate"] .value')).indexOf('2049') !== -1);
    check('the Home shelf carries the compact ladder', (await page.$$('.mini-ladder .mini-step')).length === 5);
    await page.click('.shelf-tile[data-metric="fiNumber"]');
    await page.waitForSelector('.drawer .metric-drawer');
    const drawerText = await page.textContent('.drawer');
    check('the metric drawer shows the math, the levers and the lens', drawerText.indexOf('Formula') !== -1 && drawerText.indexOf('Levers') !== -1 && drawerText.indexOf('Inputs that feed it') !== -1 && /lens/i.test(drawerText));
    await page.keyboard.press('Escape');
    /* the levers page */
    await page.goto(base + 'index.html#/levers');
    await page.waitForSelector('.stairs .stair');
    check('the ladder has five rungs', (await page.$$('.stairs .stair')).length === 5);
    const ladderText = await page.textContent('.ladder-panel');
    check('the rungs run Lean, Barista Lean, Barista, FI, Fat with Coast as a line', ['Lean FI', 'Barista Lean FI', 'Barista FI', 'Fat FI', 'Coast FI'].every(w => ladderText.indexOf(w) !== -1));
    check('the barista rule is live and not hard-coded', ladderText.indexOf('$30,000 at 4.0%') !== -1 && ladderText.indexOf('$34,286 at 3.5%') !== -1);
    check('the reverse barista line is there', ladderText.indexOf('Barista FI today') !== -1);
    await page.waitForSelector('.top-card .headline', { timeout: 15000 });
    check('the one-sentence card names the biggest lever', (await page.textContent('.top-card .headline')).indexOf('Your biggest lever is') === 0);
    await page.waitForSelector('.lever-row');
    const groups = await page.$$eval('.lever-group h3', els => els.map(e => e.textContent.trim()));
    check('the list is grouped by lever family', groups.length >= 3 && groups[0].indexOf('Spend less') === 0);
    /* the Ask toggle */
    await page.click('.levers-head button:has-text("Ask priority")');
    await page.waitForSelector('.lever-row');
    const askText = await page.textContent('.levers-panel');
    check('ask priority shows months at stake and a why line', askText.indexOf('at stake') !== -1 && askText.indexOf('This figure is') !== -1);
    /* a root opens every metric it feeds */
    await page.click('.lever-row');
    await page.waitForSelector('.drawer .root-drawer');
    const rootText = await page.textContent('.drawer');
    check('the root drawer lists the numbers it feeds with a direction', rootText.indexOf('Every number it feeds') !== -1 && /raises it|lowers it/.test(rootText) && rootText.indexOf('Shock') !== -1);
    await page.keyboard.press('Escape');
    /* the graph view */
    await page.click('.levers-head button:has-text("Graph")');
    await page.waitForSelector('svg.graph');
    check('the graph draws nodes and edges', (await page.$$('svg.graph circle')).length > 30 && (await page.$$('svg.graph path')).length > 30);
    /* typing a part-time income moves the Barista rungs by the rule */
    await page.click('.levers-head button:has-text("List")');
    const before = await page.textContent('.stair:nth-child(3) .stair-number');
    await page.fill('input[aria-label="Part-time income at FI, a month"]', '1500');
    await page.press('input[aria-label="Part-time income at FI, a month"]', 'Tab');
    await page.waitForTimeout(400);
    const after = await page.textContent('.stair:nth-child(3) .stair-number');
    check('part-time income lowers the Barista rung', before !== after);
    check('the FI rung does not move with part-time income', (await page.textContent('.stair:nth-child(4) .stair-number')).indexOf('$1.3M') !== -1);
    /* the client view: ladder, three levers, gentle words, no benchmarks */
    await page.click('#view-client');
    await page.waitForSelector('.stairs .stair');
    await page.waitForSelector('.lever-row', { timeout: 15000 });
    const client = await page.textContent('#main');
    check('client view keeps the ladder and three levers', (await page.$$('.lever-row')).length === 3 && client.indexOf('The number that matters most is') !== -1);
    check('client view hides Ask priority and the graph', client.indexOf('Ask priority') === -1 && client.indexOf('Graph') === -1 && client.indexOf('Millionaire') === -1);
    await page.click('#view-coach');
    /* the session: ranked by ask priority with months at stake */
    await page.goto(base + 'index.html#/session');
    await page.waitForSelector('.next-card');
    await page.waitForFunction(() => (document.querySelector('.next-card') || {}).textContent.indexOf('of FI date at stake') !== -1, null, { timeout: 15000 });
    const next = await page.textContent('.next-card');
    check('the next question card says about N months of FI date at stake and why', next.indexOf('of FI date at stake') !== -1 && next.indexOf('Ranked by ask priority') !== -1);
    check('the session carries the shelf', (await page.$$('.shelf-panel .shelf-tile')).length >= 8);
  },
},
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
      check('the state starts on New York as an estimate', (await page.inputValue('.fieldrow[data-field="state"] select.select')) === 'NY' && (await page.textContent('.fieldrow[data-field="state"] .src .chip')) === 'Guess');
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
