// The friction audit (Batch 0 of the practical run): plays the coach running a full first session on two made-up
// households (Maya and Dre, no real data), from opening the app to printing the one-pager, typing every number through
// the screens as on a call. It logs every tap, key, scroll, page change and dead end (a tap that changed nothing), and
// every screen where the next step sits below the fold. Time is at the CLIENT_TEST pace: 5 s a tap, 45 s a typed
// answer, 60 s a result talked through.
//
// Run from the repo root with the slam folder served:
//   (cd slam && python3 -m http.server 8765 &) ; node slam/tools/friction-audit.mjs --out slam/docs/FRICTION_BEFORE.md
// --json FILE also writes the raw numbers (the after run reads the before numbers from docs/friction-before.json).

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.env.SLAM_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const PACE = { tap: 5, typed: 45, result: 60 };
const VIEW = { width: 1280, height: 800 };
// The before run used Tab between boxes (Enter did nothing then); --tab-only repeats it.
const KEYS_FIRST = !process.argv.includes('--tab-only');

// ---------------------------------------------------------------- the two households (made up)
const HOUSEHOLDS = [
  { name: 'Maya', filing: 'single', rent: true,
    debts: [['credit_card', { bal: '4200', apr: '24.99', min: '120', day: '15', pay: 'minimum' }], ['student_loan', { bal: '28000', apr: '5.5', min: '310', day: '1' }]],
    accounts: [['checking', '2400'], ['savings', '6000'], ['k401', '18500', { match: ['100', '4'] }]],
    income: [{ type: 'w2', name: 'Salary at Northwind', amount: '2615', basis: 'salary', schedule: 'biweekly' }],
    needs: { rent: '1650', electric: '70', internet: '60', phone: '45', groceries: '450', 'eating-out': '200', transit: '120', subscriptions: '35', gym: '40' },
    goals: [['Emergency fund', '10000', '2027-12-31']] },
  { name: 'Dre', filing: 'married', rent: false,
    debts: [['auto_loan', { bal: '14500', apr: '6.9', min: '420', day: '10' }], ['credit_card', { bal: '1200', apr: '22', min: '40', day: '20', pay: 'statement' }], ['mortgage', { bal: '312000', apr: '6.1', min: '2350', day: '1' }]],
    accounts: [['checking', '5200'], ['hysa', '22000'], ['k401', '64000', { match: ['50', '6'] }], ['hsa', '3800'], ['brokerage', '15000'], ['home', '420000']],
    income: [{ type: 'w2', name: 'Salary at Larkspur Labs', amount: '8000', basis: 'salary', schedule: 'semimonthly' }, { type: '1099', name: 'Design work', amount: '1500' }],
    needs: { 'property-tax': '400', 'home-insurance': '120', electric: '140', internet: '75', phone: '110', groceries: '900', 'eating-out': '300', 'car-insurance': '160', 'car-gas': '180', subscriptions: '60', miscellaneous: '200' },
    goals: [['Kitchen', '25000', '2028-06-30']] },
  // The couple (Batch 9): two W-2s in New York City, joint and separate accounts, one student loan, a 401(k) with a match.
  { name: 'Jordan', partner: 'Sam', filing: 'married', where: 'nyc', rent: true, couple: true,
    debts: [['student_loan', { bal: '28000', apr: '5.5', min: '300', day: '5', whose: 'partner' }], ['credit_card', { bal: '1800', apr: '24', min: '60', day: '22', pay: 'minimum', whose: 'joint' }]],
    accounts: [['checking', '6000', { whose: 'joint' }], ['savings', '18000', { whose: 'joint' }], ['k401', '62000', { match: ['100', '4'], whose: 'me' }], ['k401', '24000', { whose: 'partner' }]],
    income: [{ type: 'w2', name: 'Salary at Harbor Design', amount: '7500', basis: 'salary', schedule: 'monthly', whose: 'me' }, { type: 'w2', name: 'Salary at Northside Schools', amount: '5200', basis: 'salary', schedule: 'monthly', whose: 'partner' }],
    needs: { rent: '3400', electric: '180', internet: '70', phone: '120', groceries: '900', 'eating-out': '500', transit: '264' },
    goals: [['Emergency fund', '30000', '2027-12-31']] }
];

// ---------------------------------------------------------------- the recorder
function recorder(page) {
  const r = { taps: 0, keys: 0, typed: 0, confirmed: 0, scrolls: 0, pages: 0, screens: 0, results: 0, dead: [], below: [], log: [], lost: [], step: 'start', perStep: {} };
  const bump = (k, n = 1) => { r[k] += n; const s = (r.perStep[r.step] = r.perStep[r.step] || { taps: 0, typed: 0, scrolls: 0 }); if (k in s) s[k] += n; };
  const snap = () => page.evaluate(() => location.href + '|' + (document.querySelector('main') || document.body).innerText.length + '|' + ((document.querySelector('main') || document.body).innerText.slice(0, 400)) + '|' + (document.activeElement && document.activeElement.id));
  const inView = (loc) => loc.evaluate((el) => { const b = el.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; });
  r.lose = (secs, words) => { r.lost.push({ step: r.step, secs, words }); };
  r.tap = async (sel, why, { expectChange = true } = {}) => {
    const loc = page.locator(sel).first();
    await loc.waitFor({ state: 'visible', timeout: 8000 });
    if (!(await inView(loc))) { bump('scrolls'); r.log.push('scroll to ' + why); }
    const before = await snap();
    await loc.click(); bump('taps'); r.log.push('tap ' + why); r.lastTyped = false;
    await page.waitForTimeout(250);
    if (expectChange && before === (await snap())) { r.dead.push({ step: r.step, what: why }); r.lose(PACE.tap, 'A tap that changed nothing: ' + why); }
  };
  r.type = async (sel, text, why) => {
    const loc = page.locator(sel).first();
    await loc.waitFor({ state: 'visible', timeout: 8000 });
    if (!(await inView(loc))) { bump('scrolls'); r.log.push('scroll to ' + why); }
    const focused = await loc.evaluate((el) => el === document.activeElement);
    if (!focused) { await loc.click(); bump('taps'); if (r.lastTyped) r.lose(PACE.tap, 'Tab does not reach the next box: a tap into each one'); }
    await loc.fill(''); await page.keyboard.type(text);
    // Keyboard first: Enter saves a box and moves on where the app has it (outside a form); in a form, Tab.
    await page.keyboard.press((await loc.evaluate((el) => !!el.form)) || !KEYS_FIRST ? 'Tab' : 'Enter');
    r.keys += text.length + 1; bump('typed'); r.log.push('type ' + why + ': ' + text); r.lastTyped = true;
    await page.waitForTimeout(150);
  };
  r.pick = async (sel, value, why) => {
    const loc = page.locator(sel).first();
    if (!(await inView(loc))) { bump('scrolls'); r.log.push('scroll to ' + why); }
    await loc.selectOption(value); bump('taps', 2); r.log.push('pick ' + why + ': ' + value); await page.waitForTimeout(200);
  };
  r.has = async (sel) => (await page.locator(sel).count()) > 0 && page.locator(sel).first().isVisible();
  r.nextVisible = async () => {
    const loc = page.locator('.step-nav .btn.primary').first();
    if (!(await loc.count())) return;
    if (!(await inView(loc))) { r.below.push(r.step); r.lose(PACE.tap, 'Next step below the fold on ' + r.step); }
  };
  r.talk = () => { r.results += 1; };
  // Looks right (S-282): Enter with nothing in focus keeps every guess on the screen; each kept guess is a field
  // confirmed, not typed.
  r.confirm = async () => {
    if (!(await r.has('#looks-right'))) return;
    const n = await page.evaluate(() => { const m = (document.querySelector('.looks-right-bar') || document.body).innerText.match(/(\d+) guess/); return m ? +m[1] : 0; });
    if (!n) return;
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Enter'); r.keys += 1; bump('taps'); r.confirmed += n; r.log.push('Enter: keep ' + n + ' guesses'); await page.waitForTimeout(500);
  };
  return r;
}

async function blankFile(name) {
  const demo = JSON.parse(readFileSync(new URL('../fixtures/demo.json', import.meta.url), 'utf8'));
  const person = { ...demo.household.people[0], id: name.toLowerCase(), name };
  const blank = { ...demo, meta: { name: name + ' (made up)', asOf: demo.meta.asOf }, household: { ...demo.household, people: [person] },
    income: [], expenses: [], accounts: [], debts: [], goals: [], taxYears: [], lent: [], log: [], feed: [], profile: {} };
  const dir = mkdtempSync(join(tmpdir(), 'friction-'));
  const file = join(dir, name.toLowerCase() + '.json');
  writeFileSync(file, JSON.stringify(blank));
  return file;
}

// ---------------------------------------------------------------- one session
async function run(browser, hh) {
  const ctx = await browser.newContext({ viewport: VIEW, acceptDownloads: true });
  const page = await ctx.newPage();
  const r = recorder(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let lastPath = null;
  page.on('framenavigated', (f) => { if (f !== page.mainFrame()) return; const path = new URL(f.url()).pathname; if (path !== lastPath) { r.pages += 1; lastPath = path; } });
  await page.addInitScript(() => { const push = history.pushState.bind(history); history.pushState = (...a) => { window.__screens = (window.__screens || 0) + 1; return push(...a); }; window.print = () => { window.__printed = true; }; });
  const screensNow = () => page.evaluate(() => window.__screens || 0);
  let screens = 0;
  const go = async (url) => { screens += await screensNow(); await page.goto(BASE + url); await page.waitForTimeout(900); };
  const nav = async (sel, why) => { screens += await screensNow(); await r.tap(sel, why); await page.waitForTimeout(700); };
  // To a Guide me step: Next when it is the next one, else its name on the step bar (one tap either way).
  const toStep = async (id) => {
    const words = { debt: 'Debt', assets: 'Assets', income: 'Income', needs: 'Needs', goals: 'Goals' }[id];
    if (await r.has('.step-nav .btn.primary:has-text("' + words + '")')) await nav('.step-nav .btn.primary:has-text("' + words + '")', 'Next: ' + words);
    else await nav('a[href="#/' + id + '"]', words + ' on the step bar');
  };

  // Open the app.
  await page.goto(BASE); await page.waitForTimeout(1200);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.reload(); await page.waitForTimeout(1200);
  r.step = 'new client';
  const file = await blankFile(hh.name);
  if (await page.locator('#client-new').count()) {
    await r.tap('#client-switch', 'the client switcher');
    await r.tap('#client-new', 'New client');
    await r.type('#client-name', hh.name, 'the client\'s name');
    await r.tap('#client-create', 'Create');
  } else {
    // No New client: start from a blank household file, through the name menu's Open file.
    r.lose(120, 'No way to start a new client: the coach makes a blank file and opens it');
    await r.tap('summary.whose-name', 'the name menu');
    const chooser = page.waitForEvent('filechooser');
    await r.tap('.whose-items button:has-text("Open file")', 'Open file', { expectChange: false });
    await (await chooser).setFiles(file); r.taps += 1; r.log.push('pick the blank file');
    await page.waitForTimeout(1200);
  }
  // Guide me (S-280): the Numbers tab, then the Guide me switch.
  if (!(await page.url()).includes('guide=1')) { if (!(await page.url()).includes('ledger.html')) await nav('nav.tabbar a[href="ledger.html"]', 'the Numbers tab'); await nav('.guide-switch', 'Guide me'); }
  if (await r.has('.step-nav .btn.primary:has-text("Start")')) await nav('.step-nav .btn.primary', 'Start');
  await toStep('debt');

  // D: debts.
  r.step = 'debt';
  const doneEmpty = await page.evaluate(() => document.querySelectorAll('.stepper-seg.is-done').length);
  if (doneEmpty) r.lose(PACE.result, 'The progress tracker says ' + doneEmpty + ' steps are done on an empty household');
  if (hh.couple) {
    if (await r.has('#who-two')) {
      await r.tap('#who-two', 'The two of us');
      await r.type('#p-name', hh.partner, 'partner\'s name');
      await r.tap('form.who-card button[type=submit]', 'Add partner');
    } else r.lose(180, 'No way to add a partner in the Session');
  }
  // Whose an item is (a couple): the last Whose box on screen, when it is not already right.
  const whose = async (prefix, w) => { if (!hh.couple || !w) return; const sel = await page.evaluate((p) => { const x = [...document.querySelectorAll('select[id^="w-"]')].filter((b) => !p || b.closest(p)); return x.length ? '#' + CSS.escape(x[x.length - 1].id) : null; }, prefix); if (!sel) { r.lose(30, 'No Whose box'); return; } if ((await page.locator(sel).inputValue()) !== w) await r.pick(sel, w, 'whose'); };
  const seen = new Set();
  for (const [type, d] of hh.debts) {
    if (await r.has('#dq-' + type) ) await r.tap('#dq-' + type, 'Yes to ' + type);
    else if (seen.has(type) || !(await r.has('#dq-' + type))) {
      const label = { credit_card: 'Credit card', student_loan: 'Student loan', auto_loan: 'Car loan', mortgage: 'Mortgage' }[type];
      if (await r.has('.edit-actions button:text-is("' + label + '")')) await r.tap('.edit-actions button:text-is("' + label + '")', 'Add ' + label);
      else { r.lose(240, 'A ' + label.toLowerCase() + ' cannot be added in the Session: done later in My numbers'); hh.later = (hh.later || []).concat([[type, d]]); continue; }
    }
    seen.add(type);
    const id = await page.evaluate(() => { const x = [...document.querySelectorAll('input[id^="d-bal-"]')]; return x[x.length - 1].id.slice(6); });
    await r.type('#d-bal-' + id, d.bal, type + ' balance');
    await r.type('#d-apr-' + id, d.apr, type + ' rate');
    await r.type('#d-min-' + id, d.min, type + ' payment');
    await r.type('#d-day-' + id, d.day, type + ' due day');
    if (d.pay && (await r.has('#d-pay-' + id + '-' + d.pay))) await r.tap('#d-pay-' + id + '-' + d.pay, 'paid in full?');
    await whose(null, d.whose);
  }
  for (const t of ['credit_card', 'student_loan', 'auto_loan', 'family_iou']) if (await r.has('#dqn-' + t)) await r.tap('#dqn-' + t, 'No to ' + t);
  await r.confirm(); r.talk(); await r.nextVisible(); await toStep('assets');

  // A: assets.
  r.step = 'assets';
  const LABEL = { checking: 'Checking', savings: 'Savings', hysa: 'High-yield savings', k401: '401(k)', hsa: 'HSA', brokerage: 'Brokerage', home: 'Home', car: 'Car' };
  for (const [type, bal, more] of hh.accounts) {
    if (type === 'k401' && (await r.has('#aq-work'))) await r.tap('#aq-work', 'Yes, a plan at work');
    else if (type === 'savings' && (await r.has('#aq-save'))) await r.tap('#aq-save', 'Yes, savings');
    else await r.tap('.edit-actions button:text-is("' + LABEL[type] + '")', 'Add ' + LABEL[type]);
    const id = await page.evaluate(() => { const x = [...document.querySelectorAll('input[id^="a-bal-"]')]; return x[x.length - 1].id.slice(6); });
    await r.type('#a-bal-' + id, bal, LABEL[type] + ' balance');
    if (more && more.whose && hh.couple && (await r.has('#w-' + id))) { if ((await page.locator('#w-' + id).inputValue()) !== more.whose) await r.pick('#w-' + id, more.whose, 'whose'); }
    if (more && more.match) {
      if (await r.has('#q-m-' + id + '-yes')) {
        await r.tap('#q-m-' + id + '-yes', 'Yes, a match');
        if (await r.has('#a-mr-' + id)) { await r.type('#a-mr-' + id, more.match[0], 'match rate'); await r.type('#a-mc-' + id, more.match[1], 'match up to'); }
      } else if (await page.locator('#tk-' + id + '-match-yes').count()) {
        // The type's questions (S-270): open the fold, Yes to the match, then the first tier.
        if (!(await page.locator('#tk-' + id + '-match-yes').isVisible())) await r.tap('#tk-' + id + '-match-yes >> xpath=ancestor::details[1]/summary', 'the plan\'s questions');
        await r.tap('#tk-' + id + '-match-yes', 'Yes, a match');
        await r.type('#tk-' + id + '-matchTiers', more.match[0], 'match %');
        await r.type('#tk-' + id + '-matchTiers >> xpath=ancestor::div[contains(@class,"tier-row")]/input[2]', more.match[1], 'of the first % of pay');
      }
    }
  }
  await r.confirm(); r.talk(); await r.nextVisible(); await toStep('income');

  // T: taxes (on the Income step now, S-280).
  r.step = 'taxes';
  if (await r.has('#t-filing') && !hh.couple) await r.pick('#t-filing', hh.filing === 'married' ? 'mfj' : 'single', 'filing status').catch(async () => r.pick('#t-filing', { index: 1 }, 'filing status'));
  if (hh.where && (await r.has('#t-where'))) await r.pick('#t-where', hh.where, 'where you live');
  r.talk();

  // I: income.
  r.step = 'income';
  for (const x of hh.income) {
    await r.tap('#i-add, button:has-text("+ Add income")', '+ Add income');
    await r.type('#add-name', x.name, 'income name');
    await r.type('#add-amount', x.amount, 'income amount');
    if (await r.has('#add-type')) await r.pick('#add-type', x.type, 'kind of income');
    if (x.basis && (await r.has('#add-basis-' + x.basis))) await r.tap('#add-basis-' + x.basis, 'how it is paid');
    if (x.schedule && (await r.has('#add-schedule'))) await r.pick('#add-schedule', x.schedule, 'how often');
    await r.tap('form.add-form button[type=submit]', 'Add');
    await whose(null, x.whose);
  }
  await r.confirm(); r.talk(); await r.nextVisible(); await toStep('needs');

  // N: needs.
  r.step = 'needs';
  for (const [k, amt] of Object.entries(hh.needs)) {
    // Needs come in folded groups (S-283): open the group first, one tap.
    if ((await page.locator('#n-' + k).count()) && !(await r.has('#n-' + k))) await r.tap('details.need-group:has(#n-' + k + ') > summary', 'the group with ' + k);
    if (await r.has('#n-' + k)) await r.type('#n-' + k, amt, k); else r.lose(60, 'No box for ' + k + ' in the Session');
  }
  if (hh.rent && hh.needs.rent === undefined && (await r.has('#n-rent'))) await r.type('#n-rent', '1650', 'rent');
  await r.confirm(); r.talk(); await r.nextVisible(); await toStep('goals');

  // G: goals.
  r.step = 'goals';
  for (const [name, amt, by] of hh.goals) {
    await r.tap('button:has-text("+ Add a goal")', '+ Add a goal');
    await r.type('#add-name', name, 'goal name');
    await r.type('#add-amount', amt, 'goal amount');
    if (await r.has('#add-by')) { await page.locator('#add-by').fill(by); r.typed += 1; r.taps += 1; }
    await r.tap('form.add-form button[type=submit]', 'Add');
  }
  r.talk();

  // What the Session could not take: My numbers.
  if (hh.later && hh.later.length) {
    r.step = 'my numbers (left over)';
    for (const [type, d] of hh.later) {
      await go('ledger.html#/debt'); r.pages += 0;
      await r.tap('button.btn.add', '+ Add a debt');
      if (await r.has('#add-type')) await r.pick('#add-type', type, 'kind of debt');
      await r.type('#add-amount', d.bal, type + ' balance');
      await r.tap('form.add-form button[type=submit]', 'Add');
      r.lose(90, 'Rate, payment and due day of the ' + type + ' are one screen deeper in My numbers');
    }
  }

  // The one-pager.
  r.step = 'one-pager';
  if (await r.has('#end-call')) { await nav('#end-call', 'End call'); await nav('#ec-print', 'Print or save the one-pager'); }
  else { await go('onepager.html'); r.lose(PACE.tap * 2, 'The one-pager is not on the Session: the coach goes to it by address or the menu'); }
  if (await r.has('button:has-text("Print")')) await r.tap('button:has-text("Print")', 'Print', { expectChange: false });
  r.talk();
  const printed = await page.evaluate(() => !!window.__printed);
  screens += await screensNow();
  r.screens = screens;
  // The Session's own tracker on an empty household (seen on the way): steps with $0 read done.
  await ctx.close();
  if (process.env.FRICTION_LOG) console.error(hh.name + ':\n  ' + r.log.join('\n  '));
  return { name: hh.name, ...r, printed, errors, log: undefined, logged: r.log.length };
}

// ---------------------------------------------------------------- the report
// The time: taps, typed answers and results at the pace, plus the time each friction loses (a blank file to make, a
// screen to go find).
const minutes = (x) => Math.round(((x.taps * PACE.tap) + (x.typed * PACE.typed) + (x.results * PACE.result) + x.lost.reduce((a, l) => a + l.secs, 0)) / 6) / 10;
function report(runs, before) {
  const L = [];
  L.push('# Friction audit, ' + (before ? 'after' : 'before'), '');
  L.push('Minutes are taps, typed answers and results at the pace, plus the time each friction below loses.', '');
  L.push('Made by `node slam/tools/friction-audit.mjs` on ' + new Date().toISOString().slice(0, 10) + '. Made-up households (Maya: renter, one W-2; Dre: homeowner, a W-2 and 1099 work, a mortgage' + (runs.some((x) => x.name === 'Jordan') ? '; Jordan and Sam: a couple in New York City, two W-2s' : '') + '), a full first session from opening the app to printing the one-pager, on a 1280 x 800 laptop screen. Time at the CLIENT_TEST pace: ' + PACE.tap + ' s a tap, ' + PACE.typed + ' s a typed answer, ' + PACE.result + ' s a result talked through.', '');
  L.push('| Household | Numbers typed | Confirmed with Enter | Taps | Taps per number | Keys | Keypresses per number | Scrolls | Page loads | Screen changes | Page changes per session | Dead ends | Next below the fold | Results talked | Minutes |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const x of runs) L.push('| ' + [x.name, x.typed, x.confirmed || 0, x.taps, (x.taps / x.typed).toFixed(2), x.keys, (x.keys / x.typed).toFixed(1), x.scrolls, x.pages, x.screens, x.pages + x.screens, x.dead.length, x.below.length, x.results, minutes(x)].join(' | ') + ' |');
  if (before) {
    L.push('', '## Before and after', '', '| Household | Keypresses per number, before | after | Page changes per session, before | after | Fields typed / confirmed with Enter, before | after | Taps per number, before | after | Minutes, before | after |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const x of runs) { const b = before.find((y) => y.name === x.name); if (b) L.push('| ' + [x.name, (b.keys / b.typed).toFixed(1), (x.keys / x.typed).toFixed(1), b.pages + b.screens, x.pages + x.screens, b.typed + ' / ' + (b.confirmed || 0), x.typed + ' / ' + (x.confirmed || 0), (b.taps / b.typed).toFixed(2), (x.taps / x.typed).toFixed(2), minutes(b), minutes(x)].join(' | ') + ' |'); }
  }
  L.push('', '## Per step (taps, typed answers, scrolls)', '');
  for (const x of runs) L.push('- ' + x.name + ': ' + Object.entries(x.perStep).map(([k, v]) => k + ' ' + v.taps + '/' + v.typed + '/' + v.scrolls).join('; '));
  const lost = runs.flatMap((x) => x.lost.map((l) => ({ ...l, name: x.name })));
  const byWords = new Map();
  for (const l of lost) { const k = l.words.replace(/ (Maya|Dre|Jordan)\b/, ''); const e = byWords.get(k) || { words: k, secs: 0, n: 0 }; e.secs += l.secs; e.n += 1; byWords.set(k, e); }
  const ranked = [...byWords.values()].sort((a, b) => b.secs - a.secs);
  L.push('', '## The worst frictions, by time lost', '');
  ranked.slice(0, 10).forEach((e, i) => L.push((i + 1) + '. ' + e.words + ' (' + e.n + 'x, about ' + Math.round(e.secs / 6) / 10 + ' min)'));
  if (!ranked.length) L.push('None found.');
  L.push('', '## Dead ends', '');
  const dead = runs.flatMap((x) => x.dead.map((d) => x.name + ', ' + d.step + ': ' + d.what));
  L.push(...(dead.length ? dead.map((d) => '- ' + d) : ['None.']));
  L.push('', '## Errors', '', ...(runs.some((x) => x.errors.length) ? runs.flatMap((x) => x.errors.map((e) => '- ' + x.name + ': ' + e)) : ['None.']));
  L.push('', '## Printed', '', runs.map((x) => x.name + ': ' + (x.printed ? 'yes' : 'no')).join(', '), '');
  return L.join('\n');
}

// --from FILE: the report again from saved numbers (no browser).
const runs = [];
if (arg('--from')) runs.push(...JSON.parse(readFileSync(arg('--from'), 'utf8')).map((x) => ({ errors: [], ...x })));
else {
  const browser = await playwright.chromium.launch();
  for (const hh of HOUSEHOLDS.filter((x) => !process.env.FRICTION_ONLY || x.name === process.env.FRICTION_ONLY)) { try { runs.push(await run(browser, structuredClone(hh))); } catch (err) { console.error(hh.name + ': ' + err.message); process.exitCode = 1; } }
  await browser.close();
}
const beforeFile = arg('--before');
const before = beforeFile && existsSync(beforeFile) ? JSON.parse(readFileSync(beforeFile, 'utf8')) : null;
const md = report(runs, before);
if (arg('--out')) writeFileSync(arg('--out'), md);
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(runs.map(({ name, taps, keys, typed, confirmed, scrolls, pages, screens, results, dead, below, lost, perStep, printed }) => ({ name, taps, keys, typed, confirmed, scrolls, pages, screens, results, dead, below, lost, perStep, printed })), null, 1));
console.log(md.split('\n').slice(0, 30).join('\n'));
