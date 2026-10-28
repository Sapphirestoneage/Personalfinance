// The statement uploader (S-243): the classifier, the readers on the synthetic statements in test/fixtures/statements,
// the merge of several files for one account, transfers matched across accounts, the write into the household, and
// the private fixtures in tests/private-fixtures when they are on this machine (never in the repository).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { classifyText } from '../engine/statements/classify.js';
import { readTextPages, readFile, readCsvFile, readOfxFile, reread, kindOfName } from '../engine/statements/read.js';
import { mask, parseMoney, parseDate, linesFromItems, val } from '../engine/statements/text.js';
import { groupDocs, matchExisting, staticDiffs } from '../engine/statements/merge.js';
import { deriveDoc, deriveBatch, matchTransfers } from '../engine/statements/derive.js';
import { planImport, applyPlan, factsFor, logItems } from '../engine/statements/apply.js';
import { readCsv, detectColumns } from '../engine/statements/csv.js';
import { readOfx } from '../engine/statements/ofx.js';
import { PROFILES } from '../engine/statements/profiles/index.js';
import { loadHousehold } from '../engine/normalize.js';
import { validate, FAMILIES } from '../engine/schema.js';
import { getAt, valueOf } from '../engine/spine.js';
import { labelFor } from '../engine/labels.js';
import { readJson, loadRules, SLAM } from './spine-helpers.js';
import { checkFolder, compareDoc, SYNTHETIC, PRIVATE, CORE_CARD } from '../tools/statements-check.mjs';
import { pdfItems, loadPdfjs, fallbackItems } from '../tools/pdf-text.mjs';

const TODAY = '2026-10-28';
const demo = () => loadHousehold(readJson('fixtures/demo.json'));
const rules = loadRules();
const expected = JSON.parse(readFileSync(SYNTHETIC + 'expected.json', 'utf8'));
let synthetic = null;
const readSynthetic = async () => (synthetic = synthetic || await checkFolder(SYNTHETIC, { today: TODAY }));

// A card statement as text pages, for the merge and apply tests.
const cardText = ({ four = '7001', close = '10/03/26', open = '09/04/26', due = '10/31/26', balance = '512.35', limit = '5,000', apr = '22.99', min = '40.00', autopay = '40.00', product = 'SAPPHIRE PREFERRED', business = null, purchases = '412.00', fee = null } = {}) => [
  `CHASE ${product}\nACCOUNT SUMMARY\nAccount Number: 4147 2021 1234 ${four}\nPrevious Balance $340.00\nPayment, Credits -$340.00\nPurchases +$${purchases}\nCash Advances $0.00\nBalance Transfers $0.00\nFees Charged $${fee || '0.00'}\nInterest Charged $5.35\nNew Balance $${balance}\nOpening/Closing Date ${open} - ${close}\nCredit Access Line $${limit}\nAvailable Credit $4,487\nPayment Due Date ${due}\nMinimum Payment Due $${min}\n${autopay ? 'Your next AutoPay payment for $' + autopay + ' will be deducted from your Pay From account and credited on the due date.' : 'Enroll in AutoPay at chase.com/autopay.'}\nlate fee of up to $40.00\nJORDAN DEMO\n${business ? business + '\n' : ''}123 EXAMPLE ST\nANYTOWN NY 10001`,
  `ACCOUNT ACTIVITY\nPAYMENTS AND OTHER CREDITS\n09/28 AUTOMATIC PAYMENT - THANK YOU -340.00\nPURCHASE\n09/10 TRADER JOES #123 ANYTOWN NY 86.20\n${fee ? 'FEES CHARGED\n10/03 ANNUAL MEMBERSHIP FEE ' + fee + '\n' : ''}INTEREST CHARGED\n10/03 PURCHASE INTEREST CHARGE 5.35\nINTEREST CHARGES\nPURCHASES\nPurchases ${apr}%(v)(d) $40.00 $0.60\nCASH ADVANCES\nCash Advances 27.99%(v)(d) -0- -0-\nBALANCE TRANSFERS\nBalance Transfer ${apr}%(v)(d) -0- -0-`
];

test('the classifier names every kind of statement and the ones SLAM does not read yet', () => {
  const t = (s) => classifyText(s).type;
  assert.equal(t('Minimum Payment Due $40 Credit Access Line $5,000 Payment Due Date New Balance APR'), 'credit_card');
  assert.equal(t('CHECKING SUMMARY Beginning Balance Deposits and Additions Ending Balance'), 'checking');
  assert.equal(t('SAVINGS SUMMARY Annual Percentage Yield Earned 4.10% Interest Paid'), 'savings');
  assert.equal(t('Certificate of Deposit Maturity Date 03/01/2027 Term 12 months'), 'cd');
  assert.equal(t('Brokerage Account Beginning Value Ending Value Dividends Holdings Market Value'), 'brokerage');
  assert.equal(t('Roth IRA Beginning Value Ending Value Holdings'), 'ira_roth');
  assert.equal(t('Traditional IRA statement Ending Value'), 'ira_traditional');
  assert.equal(t('Rollover IRA Ending Value Market Value'), 'ira_rollover');
  assert.equal(t('SEP-IRA Ending Value Holdings'), 'ira_sep');
  assert.equal(t('ACME 401(k) Plan Vested Balance Employer Match'), 'k401');
  assert.equal(t('403(b) Plan Vested Balance'), 'k403b');
  assert.equal(t('Thrift Savings Plan Statement Vested'), 'tsp');
  assert.equal(t('Health Savings Account HSA Qualified medical'), 'hsa');
  assert.equal(t('NY 529 Direct Plan Beneficiary Market Value'), 'k529');
  assert.equal(t('Student Loan Servicer Repayment Plan Standard Qualifying payments'), 'student_loan');
  assert.equal(t('Auto Loan VIN 1HGCM Vehicle payment'), 'auto_loan');
  assert.equal(t('Mortgage Statement Escrow Principal and Interest Property Address'), 'mortgage');
  assert.equal(t('Personal Loan Installment Loan Payment'), 'personal_loan');
  assert.equal(t('Lunch menu for Tuesday'), 'unknown');
  const stub = classifyText('Earnings Statement Gross Pay Net Pay');
  assert.deepEqual([stub.type, stub.unsupportedAs], ['unsupported', 'Pay stub']);
  assert.equal(classifyText('Form W-2 Wage and Tax Statement').unsupportedAs, 'W-2');
  assert.equal(classifyText('Your Social Security Statement').unsupportedAs, 'Social Security statement');
  assert.equal(classifyText('TreasuryDirect account').unsupportedAs, 'TreasuryDirect');
});

test('money, dates and masking: a full account number never gets through', () => {
  assert.equal(parseMoney('$1,234.56'), 1234.56); assert.equal(parseMoney('-$12.00'), -12); assert.equal(parseMoney('($12.00)'), -12); assert.equal(parseMoney('-0-'), 0); assert.equal(parseMoney('- 0 -'), 0); assert.equal(parseMoney('12.00 CR'), -12);
  assert.equal(parseDate('10/07/26'), '2026-10-07'); assert.equal(parseDate('September 30, 2026'), '2026-09-30'); assert.equal(parseDate('2026-09-30'), '2026-09-30'); assert.equal(parseDate('02/30/26'), null);
  assert.equal(mask('Account Number: 4147 2021 1234 7001'), 'Account Number: ••••7001');
  assert.equal(mask('PPD ID: 1234567890'), 'PPD ID: ••••7890');
  assert.equal(mask('ANYTOWN NY 10001-1234'), 'ANYTOWN NY 10001-1234', 'a ZIP+4 is not an account number');
  assert.equal(mask('Opening/Closing Date 09/04/26 - 10/03/26'), 'Opening/Closing Date 09/04/26 - 10/03/26');
  const lines = linesFromItems([{ str: 'Previous Balance', transform: [9, 0, 0, 9, 36, 700], width: 70 }, { str: '$340.00', transform: [9, 0, 0, 9, 236, 700.4], width: 35 }, { str: 'SCENARIO-1D', transform: [0, 9, -9, 0, 600, 300], width: 50 }, { str: 'New Balance', transform: [9, 0, 0, 9, 330, 700], width: 55 }]);
  assert.equal(lines.length, 1); assert.equal(lines[0].text, 'Previous Balance $340.00 New Balance'); assert.equal(lines[0].cells.length, 3, 'wide gaps make cells; rotated text is left out');
});

test('the synthetic statements read back to their expected values', async () => {
  const r = await readSynthetic();
  assert.equal(r.docs.length, Object.keys(expected.files).length, 'every fixture read');
  assert.deepEqual(r.failures, [], 'every expected value matches');
  assert.equal(r.reported.length, 0);
});

test('the Chase profile is picked for Chase files and the generic one elsewhere; adding a profile is one file plus one line', async () => {
  const r = await readSynthetic();
  const by = (n) => r.docs.find((d) => d.file.name === n);
  assert.equal(by('chase-sapphire-preferred-7001.pdf').profile, 'chase');
  assert.equal(by('jpm-brokerage-8801.pdf').profile, 'chase');
  assert.equal(by('northwind-roth-ira-9901.pdf').profile, 'generic');
  assert.equal(by('fidelity-401k-acme.pdf').profile, 'generic');
  assert.deepEqual(PROFILES.map((p) => p.id), ['chase', 'generic']);
  for (const p of PROFILES) { assert.equal(typeof p.match, 'function'); assert.ok(Array.isArray(p.products)); assert.equal(typeof p.labels, 'object'); }
});

test('two APR tiers are both kept and the current one is the rate; AutoPay type reads full, minimum or fixed', async () => {
  const r = await readSynthetic();
  const sapphire = r.docs.find((d) => d.file.name.includes('sapphire'));
  const tiers = sapphire.fields.tiers.filter((t) => t.kind === 'purchase');
  assert.equal(tiers.length, 2); assert.equal(tiers[0].until, '2026-07-15'); assert.equal(tiers[0].subject, 300); assert.equal(val(sapphire.fields.apr), 0.2299);
  const facts = factsFor(sapphire, TODAY);
  assert.equal(facts.aprTiers.value.length, 4); assert.equal(facts.autopay.value, 'minimum'); assert.equal(facts.payPolicy.value, 'minimum');
  const amazon = r.docs.find((d) => d.file.name.includes('amazon'));
  assert.equal(val(amazon.fields.autopayType), 'full'); assert.equal(factsFor(amazon, TODAY).payPolicy.value, 'statement');
  const fixed = readTextPages('fixed.pdf', cardText({ autopay: '100.00' }));
  assert.equal(val(fixed.fields.autopayType), 'fixed');
  const off = readTextPages('off.pdf', cardText({ autopay: null }));
  assert.equal(val(off.fields.autopay), false); assert.equal(val(off.fields.autopayType), 'off');
  // The same amount as both the balance and the minimum reads as the full balance.
  const both = readTextPages('both.pdf', cardText({ balance: '21.99', min: '21.99', autopay: '21.99' }));
  assert.equal(val(both.fields.autopayType), 'full');
});

test('the flags are plain sentences: over limit, due, minimum-only AutoPay, a fee with no purchases, stale, unvested, idle cash', async () => {
  const r = await readSynthetic();
  const ids = (name) => deriveDoc(r.docs.find((d) => d.file.name.includes(name)), { today: TODAY }).flags.map((f) => f.id);
  assert.deepEqual(ids('ink-business'), ['over-limit', 'due', 'min-autopay']);
  assert.deepEqual(ids('sapphire'), ['min-autopay']);
  assert.deepEqual(ids('401k'), ['unvested']);
  assert.deepEqual(ids('roth'), ['idle-cash']);
  const feeOnly = readTextPages('fee.pdf', cardText({ purchases: '0.00', fee: '95.00', autopay: '512.35' }));
  assert.ok(deriveDoc(feeOnly, { today: TODAY }).flags.some((f) => f.id === 'fee-no-use'));
  const stale = deriveDoc(r.docs.find((d) => d.file.name.includes('sapphire')), { today: '2026-12-20' }).flags;
  assert.ok(stale.some((f) => f.id === 'stale' && /78 days/.test(f.text)));
  for (const f of [...stale, ...deriveDoc(feeOnly, { today: TODAY }).flags]) assert.match(f.text, /^[A-Z].*[.]$/, 'a flag is a sentence');
});

test('across the batch: the checking AutoPay matches the Ink card, savings matches checking, utilization skips business cards', async () => {
  const r = await readSynthetic();
  const docs = r.docs;
  const pairs = matchTransfers(docs);
  const four = (id) => val(docs.find((d) => d.id === id).common.lastFour);
  assert.deepEqual(pairs.map((p) => [four(p.from), four(p.to), p.amount, p.kind]), [['4410', '7002', 95, 'card-payment'], ['4410', '5520', 500, 'transfer']]);
  const checking = docs.find((d) => d.file.name.includes('checking-4410'));
  assert.ok(checking.fields.transactions.filter((t) => t.transferWith).length === 2, 'both bank rows are tagged');
  const b = deriveBatch(docs, { today: TODAY, rules });
  // Ink (business, 3,015.40 of 3,000) is left out of the personal figure.
  assert.equal(b.utilization.cards, 3); assert.equal(b.utilization.personalCards, 2);
  assert.ok(b.utilization.overall > b.utilization.personal);
  assert.equal(Math.round(b.utilization.personal * 10000) / 100, 5.76);
  assert.ok(b.contributions.some((c) => c.type === 'ira_roth' && c.limit === 7500 && c.ytd === 3500));
  assert.ok(b.contributions.some((c) => c.type === 'k401' && c.rule === 'K401_DEF' && c.ytd === 5400));
  assert.equal(b.netWorth.accounts, 11);
  assert.deepEqual(Object.keys(b.allocation).sort(), ['cash', 'etfs', 'not stated']);
});

test('one card, two statements: the newest sets the numbers, the older becomes a snapshot; a CSV never outranks a statement', () => {
  const older = readTextPages('aug.pdf', cardText({ close: '09/03/26', open: '08/04/26', due: '09/30/26', balance: '340.00' }));
  const newer = readTextPages('sep.pdf', cardText());
  const csv = readCsvFile('Chase7001_Activity.CSV', 'Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n10/20/2026,10/21/2026,COFFEE,Food,Sale,-4.50,\n');
  const groups = groupDocs([older, csv, newer]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].newest, newer); assert.deepEqual(groups[0].older.map((d) => d.file.name), ['aug.pdf', 'Chase7001_Activity.CSV']);
  const spine = demo();
  const plan = planImport([older, newer, csv], spine, { today: TODAY, rules });
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].facts.balance.value, 512.35);
  for (const row of plan.rows) row.addTransactions = false;
  const { spine: s, summary } = applyPlan(spine, plan, { today: TODAY });
  assert.equal(summary.snapshots, 3);
  assert.deepEqual(s.statements.map((x) => x.close), ['2026-09-03', '2026-10-03', '2026-10-20'], 'snapshots in date order');
  assert.ok(s.statements.every((x) => x.lastFour === '7001' && !JSON.stringify(x).includes('4147 2021')), 'snapshots carry only the last four');
  assert.ok(validate(s).ok, JSON.stringify(validate(s).errors.slice(0, 3)));
});

test('a card already in the household: matched by last four, then by name; static changes are listed to confirm, and unticked ones stay', () => {
  let spine = demo();
  const doc = readTextPages('visa.pdf', cardText({ four: '9999', product: 'VISA', apr: '24.99', limit: '12,000' }));
  // The demo Visa has no last four: matched as the only Chase card of its kind without one? No: three Chase cards exist, so it is new.
  const g = groupDocs([doc])[0];
  assert.equal(matchExisting(g, spine).item, null);
  spine = { ...spine, debts: spine.debts.map((d) => (d.id === 'visa' ? { ...d, lastFour: { value: '9999', kind: 'known', asOf: TODAY, source: 'ledger' } } : d)) };
  const m = matchExisting(g, spine);
  assert.equal(m.item.id, 'visa'); assert.equal(m.how, 'lastFour');
  const facts = factsFor(doc, TODAY);
  const diffs = staticDiffs(g, m.item, facts);
  assert.deepEqual(diffs.map((d) => [d.key, d.from, d.to]), [['apr', 0.22, 0.2499], ['limit', 10000, 12000]]);
  const plan = planImport([doc], spine, { today: TODAY, rules });
  const row = plan.rows[0];
  assert.equal(row.targetId, 'visa'); row.useStatic = { apr: false, limit: true }; row.addTransactions = false;
  const { spine: s, summary } = applyPlan(spine, plan, { today: TODAY });
  assert.equal(summary.updated, 1); assert.equal(summary.added, 0);
  assert.equal(valueOf(getAt(s, 'debts.visa.apr')), 0.22, 'the unticked rate keeps the household value');
  assert.equal(valueOf(getAt(s, 'debts.visa.limit')), 12000, 'the ticked limit moves');
  assert.equal(valueOf(getAt(s, 'debts.visa.balance')), 512.35, 'a moving number always moves');
  assert.equal(getAt(s, 'debts.visa.balance').source, 'statement'); assert.equal(getAt(s, 'debts.visa.balance').asOf, '2026-10-03');
  assert.ok(validate(s).ok);
});

test('the whole synthetic batch lands in the demo household: accounts, snapshots, a tax item, the log with transfers left out; the household still validates and every new field has words', async () => {
  const r = await readSynthetic();
  const spine = demo();
  const plan = planImport(r.docs, spine, { today: TODAY, rules });
  assert.equal(plan.rows.length, 11);
  assert.equal(plan.income.length, 2); assert.equal(plan.income.filter((p) => p.include).length, 0, 'the demo already has a paycheck line, so none is added by itself');
  assert.deepEqual(plan.taxes.map((t) => [t.key, t.amount]), [['otherIncome', 115.9], ['qualifiedDividends', 540], ['capitalGainsLong', 320.5]]);
  for (const row of plan.rows) row.addTransactions = true;
  plan.income[0].include = true;
  const matched = plan.rows.filter((r) => r.targetId).length;
  assert.ok(!plan.rows.some((r) => r.doc.type === 'ira_roth' && r.targetId), 'a Roth at another firm is a new account, not the demo one');
  assert.ok(plan.rows.some((r) => r.doc.type === 'k401' && r.targetId === 'k401'), 'the 401(k) at Fidelity is the household\'s Fidelity 401(k)');
  const { spine: s, summary } = applyPlan(spine, plan, { today: TODAY });
  const v = validate(s);
  assert.ok(v.ok, JSON.stringify(v.errors.slice(0, 5)));
  assert.equal(summary.updated, matched); assert.equal(summary.added, 11 - matched); assert.equal(summary.snapshots, 12); assert.equal(summary.taxes, 3); assert.equal(summary.income, 1);
  assert.ok(summary.logged >= 20, 'rows logged: ' + summary.logged);
  // Transfers and card payments never reach the log.
  assert.ok(!s.log.some((e) => /AUTOMATIC PAYMENT|Online Transfer|TRANSFER TO SAVINGS/i.test(e.merchant || '') || /AUTOMATIC PAYMENT|Online Transfer/i.test(e.note || '')));
  // The paycheck deposits went in as income, the card purchases as spending on their card.
  assert.ok(s.log.some((e) => e.kind === 'income' && e.amount === 2100));
  const ink = s.debts.find((d) => valueOf(d.lastFour) === '7002');
  assert.ok(ink && s.log.some((e) => e.paidWith === ink.id && e.amount === 59.99));
  assert.equal(valueOf(ink.business), true); assert.equal(valueOf(ink.businessName), 'DEMO CONSULTING LLC'); assert.equal(valueOf(ink.autopay), 'minimum'); assert.equal(valueOf(ink.points), 820);
  assert.equal(valueOf(getAt(s, 'taxYears.2026.qualifiedDividends')), 540);
  const roth = s.accounts.find((a) => a.type === 'roth_ira' && valueOf(a.lastFour) === '9901');
  assert.deepEqual(valueOf(roth.contributions), [{ year: 2026, amount: 3500 }]);
  assert.equal(roth.basis.kind, 'missing', 'the basis is asked for, never guessed');
  assert.equal(valueOf(getAt(s, 'accounts.roth.basis')), valueOf(getAt(spine, 'accounts.roth.basis')), 'the demo Roth is untouched');
  const k = s.accounts.find((a) => a.type === 'k401');
  assert.equal(valueOf(k.vestedPct), 0.8); assert.equal(valueOf(k.loanBalance), 3000);
  const pay = s.income.find((x) => /Paycheck \(Acme/.test(x.label));
  assert.ok(pay && pay.amount.kind === 'rough' && pay.cadence === 'biweekly');
  // Every field a statement writes is a field of its family and reads in words in My numbers.
  for (const coll of ['accounts', 'debts']) for (const item of s[coll]) for (const k of Object.keys(item)) {
    if (['id', 'family', 'type', 'notes'].includes(k)) continue;
    assert.ok(k in { ...FAMILIES.base.fields, ...FAMILIES[item.family].fields }, coll + '.' + item.id + '.' + k + ' is a field');
    assert.ok(/^[a-z]+$/.test(k) || !labelFor(s, coll + '.' + item.id + '.' + k).endsWith(k), 'label for ' + k + ' is words');
  }
  // The original household is untouched (undo is the previous object).
  assert.equal(spine.statements, undefined); assert.equal(spine.debts.length, 4);
});

test('the Roth basis is a question, never a guess', async () => {
  const r = await readSynthetic();
  const roth = r.docs.find((d) => d.type === 'ira_roth');
  const facts = factsFor(roth, TODAY);
  assert.equal(facts.basis.kind, 'missing'); assert.match(facts.basis.note, /not on a statement/);
});

test('CSV columns are found by their words, a strange header can be mapped once, and OFX reads an account', () => {
  assert.deepEqual(detectColumns(['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount', 'Memo']), { date: 0, description: 2, amount: 5, type: 4 });
  assert.deepEqual(detectColumns(['Symbol', 'Description', 'Quantity', 'Last Price', 'Current Value', 'Cost Basis Total']), { description: 1, symbol: 0, name: 1, quantity: 2, price: 3, value: 4, costBasis: 5 });
  const odd = 'Fecha,Concepto,Cargo,Abono\n01/10/2026,SUPERMERCADO,45.10,\n03/10/2026,NOMINA,,1200.00\n';
  const first = readCsv(odd, { name: 'bank.csv' });
  assert.equal(first.needsMapping, true);
  const mapped = readCsv(odd, { name: 'bank.csv', mapping: { date: 0, description: 1, debit: 2, credit: 3 } });
  assert.equal(mapped.kind, 'transactions'); assert.deepEqual(mapped.transactions.map((t) => [t.amount, t.type]), [[-45.1, 'withdrawal'], [1200, 'deposit']]);
  const ofx = readOfx(readFileSync(SYNTHETIC + 'example-credit-union-checking.qfx', 'utf8'));
  assert.equal(ofx.accountType, 'checking'); assert.equal(ofx.lastFour, '2333'); assert.equal(ofx.balance, 2235.9); assert.equal(ofx.transactions.length, 3);
  assert.ok(!JSON.stringify(ofx).includes('000111222333'), 'the full account id is not kept');
  const doc = readOfxFile('x.qfx', readFileSync(SYNTHETIC + 'example-credit-union-checking.qfx', 'utf8'));
  assert.equal(doc.type, 'checking'); assert.equal(val(doc.fields.ending), 2235.9);
});

test('a corrected type reads the same file again; an unknown file is listed, not dropped', () => {
  const doc = readTextPages('odd.pdf', ['Example Bank\nAccount Number: 1234 5678 9012 3456\nBalance $500.00\nSomething else entirely']);
  assert.equal(doc.type, 'unknown'); assert.equal(doc.reader, null);
  const asSavings = reread(doc, 'savings');
  assert.equal(asSavings.type, 'savings'); assert.equal(asSavings.typeConf, 'label'); assert.equal(val(asSavings.fields.ending), 500); assert.equal(val(asSavings.common.lastFour), '3456');
  assert.equal(kindOfName('x.QFX'), 'ofx'); assert.equal(kindOfName('x.txt'), null);
});

test('a 15-file mixed batch reads in under 15 seconds', async () => {
  const names = readdirSync(SYNTHETIC).filter((n) => kindOfName(n));
  const list = [...names, ...names.slice(0, 15 - names.length)];
  assert.equal(list.length, 15);
  const t0 = Date.now();
  const docs = [];
  for (const name of list) {
    const kind = kindOfName(name);
    docs.push(kind === 'pdf' ? readFile({ name, kind, items: (await pdfItems(SYNTHETIC + name)).pages }) : readFile({ name, kind, text: readFileSync(SYNTHETIC + name, 'utf8') }));
  }
  planImport(docs, demo(), { today: TODAY, rules });
  const ms = Date.now() - t0;
  assert.ok(ms < 15000, ms + ' ms');
});

test('the fallback PDF reader (no pdf.js) reads the synthetic PDFs the same way', async () => {
  const buf = readFileSync(SYNTHETIC + 'chase-amazon-prime-visa-7003.pdf');
  const doc = readFile({ name: 'chase-amazon-prime-visa-7003.pdf', kind: 'pdf', items: fallbackItems(buf) });
  const miss = compareDoc(doc, { ...expected.files['chase-amazon-prime-visa-7003.pdf'], flags: undefined, carrying: undefined, paidInFull: undefined }, deriveDoc(doc, { today: TODAY }));
  assert.deepEqual(miss.filter((m) => m.want !== undefined), []);
});

// The real statements on this machine (git-ignored). Skipped when the folder is empty or pdf.js is not installed.
test('private fixtures: every core card value matches expected.json', async (t) => {
  const has = existsSync(PRIVATE + 'expected.json') && readdirSync(PRIVATE).some((n) => kindOfName(n));
  if (!has) { t.skip('no private fixtures on this machine'); return; }
  if (!(await loadPdfjs())) { t.skip('pdf.js is not installed (npm install pdfjs-dist)'); return; }
  const r = await checkFolder(PRIVATE, { today: TODAY });
  const core = r.failures.filter((f) => CORE_CARD.includes(f.key) || f.key === 'autopayType' || f.key === 'tiers');
  assert.deepEqual(core, [], 'core card values');
  assert.ok(r.ms < 10000, r.ms + ' ms for ' + r.docs.length + ' files');
  for (const f of r.failures) t.diagnostic(f.file + ' ' + f.key + ': wanted ' + JSON.stringify(f.want) + ', got ' + JSON.stringify(f.got));
  for (const d of r.reported) t.diagnostic('no expected entry: ' + d.file.name + ' read as ' + d.type);
});
