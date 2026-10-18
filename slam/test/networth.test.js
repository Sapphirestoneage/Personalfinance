// Two net worths (S-111): total and FI, locked in things you use, tiers, debts by type, and
// milestones. Every expected number is worked out by hand in the comments.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { migrate } from '../src/store/migrate.js';
import { validateHousehold } from '../src/store/validate.js';
import { addAccount, setBalance, setAccountField } from '../src/store/accounts.js';
import { addDebt } from '../src/store/edits.js';
import { netWorthAt, netWorthByMonth, milestones, balanceMonths } from '../src/calc/networth.js';

const one = (a, opts = {}) => makeValue(a, { cadence: 'one-off', ...opts });

// Checking, a Roth IRA, a home with a mortgage, a Visa, and a student loan with no account.
function sample() {
  const d = migrate(newHousehold('Sample'));
  d.currentMonth = '2026-10';
  const chk = addAccount(d, { id: 'chk', name: 'Checking', type: 'checking' });
  const roth = addAccount(d, { id: 'roth', name: 'Roth IRA', type: 'roth-ira' });
  const home = addAccount(d, { id: 'home', name: 'Condo', type: 'home' });
  const mortgage = addDebt(d, { id: 'mort', label: 'Mortgage', type: 'mortgage' });
  const card = addDebt(d, { id: 'visa-debt', label: 'Visa', type: 'credit-card' });
  addAccount(d, { id: 'visa', name: 'Visa', type: 'credit-card', debtId: card.id });
  const student = addDebt(d, { id: 'stu', label: 'Student loan', type: 'student-loan' });
  student.balance = one(12000);
  setAccountField(d, home.id, 'securedDebtId', mortgage.id);
  const put = (m, id, start, end) => { if (start !== null) setBalance(d, m, id, 'start', one(start)); if (end !== null) setBalance(d, m, id, 'end', one(end)); };
  put('2026-09', chk.id, 1000, 1200);
  put('2026-10', chk.id, null, 1500);
  put('2026-09', roth.id, null, 5000);
  put('2026-10', roth.id, null, 5300);
  put('2026-09', home.id, null, 300000);
  put('2026-10', home.id, null, 302000);
  put('2026-09', mortgage.id, null, 250000);
  put('2026-10', mortgage.id, null, 249600);
  put('2026-09', 'visa', null, 800);
  put('2026-10', 'visa', null, 600);
  return d;
}

test('total, FI, and locked in, at two month ends', () => {
  const d = sample();
  assert.deepEqual(validateHousehold(d), []);
  // Sep 30. Assets: checking 1,200 + Roth 5,000 + condo 300,000 = 306,200.
  // Debts: Visa 800 + mortgage 250,000 + student loan 12,000 (on the debt, undated) = 262,800.
  // Total: 306,200 - 262,800 = 43,400.
  // FI: checking 1,200 + Roth 5,000 = 6,200, less the Visa 800 and the student loan 12,000 (the mortgage is
  // secured by the condo, which does not count): 6,200 - 12,800 = -6,600.
  // Locked in: 43,400 - (-6,600) = 50,000 = the condo 300,000 less its mortgage 250,000.
  const sep = netWorthAt(d, '2026-09-30');
  assert.deepEqual([sep.assetsTotal, sep.debtsTotal, sep.total, sep.fi, sep.locked], [306200, 262800, 43400, -6600, 50000]);
  assert.deepEqual(sep.lockedRows.map((r) => [r.name, r.value, r.debt, r.equity]), [['Condo', 300000, 250000, 50000]]);
  // Oct 31. Assets 1,500 + 5,300 + 302,000 = 308,800; debts 600 + 249,600 + 12,000 = 262,200; total 46,600.
  // FI: 6,800 - (600 + 12,000) = -5,800. Locked: 302,000 - 249,600 = 52,400 = 46,600 + 5,800.
  const oct = netWorthAt(d, '2026-10-31');
  assert.deepEqual([oct.total, oct.fi, oct.locked], [46600, -5800, 52400]);
  // By tier: 1 is checking 1,500; through 2 the same (nothing in tier 2); through 3 adds the Roth = 6,800; all = 308,800.
  assert.deepEqual(oct.byTier, { 1: 1500, 2: 1500, 3: 6800, 4: 308800 });
  assert.deepEqual(oct.debtsByType.map((t) => [t.type, t.amount]), [['credit-card', 600], ['mortgage', 249600], ['student-loan', 12000]]);
  assert.deepEqual(oct.missing, []);
});

test('FI net worth never includes an asset that does not count, or the debt it secures', () => {
  const d = sample();
  const oct = () => netWorthAt(d, '2026-10-31');
  const fiNames = (nw) => [...nw.assets.filter((a) => a.fi).map((a) => a.name), ...nw.debts.filter((x) => x.counts).map((x) => x.name)];
  assert.deepEqual(fiNames(oct()), ['Checking', 'Roth IRA', 'Visa', 'Student loan']);
  // A car with no value yet: the total waits for it (empty is not zero); FI does not need it.
  addAccount(d, { id: 'car', name: 'Car', type: 'vehicle' });
  assert.deepEqual([oct().total, oct().fi, oct().missing], [null, -5800, ['Car']]);
  // The coach counts the condo toward FI: then its mortgage counts too, FI = total, nothing is locked in.
  // 1,500 + 5,300 + 302,000 - (600 + 249,600 + 12,000) = 46,600.
  d.accounts = d.accounts.filter((a) => a.id !== 'car');
  setAccountField(d, 'home', 'countsForFI', true);
  assert.deepEqual([oct().total, oct().fi, oct().locked, oct().lockedRows.length], [46600, 46600, 0, 0]);
});

test('every month end, and milestones as dated events', () => {
  const d = sample();
  assert.deepEqual(balanceMonths(d), ['2026-09', '2026-10']);
  const s = netWorthByMonth(d);
  assert.deepEqual(s.map((x) => [x.month, x.date, x.total, x.fi]), [['2026-09', '2026-09-30', 43400, -6600], ['2026-10', '2026-10-31', 46600, -5800]]);
  // Non-mortgage debt in October: Visa 600 + student loan 12,000 = 12,600.
  assert.equal(s[1].nonMortgageDebt, 12600);
  // A made-up series: FI -500, 200, 12,000, 9,000, 30,000; total -100, 50, ...; other debt 300, then 0.
  const at = (i, fi, total, nonMortgageDebt) => ({ month: '2026-0' + i, date: '2026-0' + i + '-28', fi, total, nonMortgageDebt });
  const m = milestones([at(1, -500, -100, 300), at(2, 200, 50, 0), at(3, 12000, 13000, 0), at(4, 9000, 10000, 0), at(5, 30000, 31000, 0)]);
  // FI and total cross $0 in month 2, debt-free (but the mortgage) in month 2, $10k in month 3, $25k in month 5;
  // $50k and $100k never happen. Month 4's dip below $10k does not undo month 3.
  assert.deepEqual(m.map((x) => [x.key, x.month, x.celebrate]), [['fi-zero', '2026-02', true], ['total-zero', '2026-02', true], ['debt-free', '2026-02', false], ['fi-10000', '2026-03', false], ['fi-25000', '2026-05', false]]);
  // A series that starts above a line has no event for it, and a gap (null) is not a crossing.
  assert.deepEqual(milestones([at(1, 500, 500, 0), at(2, null, null, null), at(3, 600, 600, 0)]), []);
});
