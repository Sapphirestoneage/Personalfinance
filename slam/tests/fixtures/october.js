// The October household used by the bridge and loop tests (worked out by hand
// in test/bridge.test.js). opts.atm adds 60 of ATM cash no line explains.

import { newHousehold } from '../../src/store/schema.js';
import { makeValue } from '../../src/store/value.js';
import { migrate } from '../../src/store/migrate.js';
import { addAccount, setBalance } from '../../src/store/accounts.js';
import { addDebt, findLine } from '../../src/store/edits.js';
import { addEntry, editEntry } from '../../src/store/log.js';

const one = (a) => makeValue(a, { cadence: 'one-off' });

export function october(opts = {}) {
  const raw = newHousehold('Bridge');
  raw.currentMonth = '2026-10';
  raw.income.push({ id: 'job', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: makeValue(4000), gross: makeValue(), deductions: [], state: 'active' });
  const d = migrate(raw);
  const visa = addDebt(d, { label: 'Visa', type: 'credit-card' });
  visa.minimum = makeValue(40);
  addAccount(d, { id: 'chk', name: 'Checking', type: 'checking' });
  addAccount(d, { id: 'sav', name: 'Savings', type: 'savings' });
  addAccount(d, { id: 'visa', name: 'Visa', type: 'credit-card' });
  setBalance(d, '2026-10', 'chk', 'start', one(2000));
  setBalance(d, '2026-10', 'sav', 'start', one(5000));
  setBalance(d, '2026-10', 'visa', 'start', one(500));
  findLine(d, 'rent').line.actual = makeValue(1500);
  findLine(d, 'emergency-fund').line.actual = makeValue(200);
  const ins = findLine(d, 'car-insurance').line;
  ins.estimate = makeValue(1200, { cadence: 'year' });
  ins.dueMonth = one(10);
  ins.dueDay = one(14);
  addEntry(d, { date: '2026-10-01', amount: -2000, kind: 'income', incomeId: 'job', account: 'chk' });
  addEntry(d, { date: '2026-10-15', amount: -2000, kind: 'income', incomeId: 'job', account: 'chk' });
  addEntry(d, { date: '2026-10-20', amount: -300, kind: 'income', incomeId: 'job', account: 'chk', note: 'bonus' });
  addEntry(d, { date: '2026-10-05', amount: 300, lineId: 'groceries', account: 'visa' });
  addEntry(d, { date: '2026-10-06', amount: 100, lineId: 'groceries', account: 'chk' });
  addEntry(d, { date: '2026-10-14', amount: 1200, lineId: 'car-insurance', account: 'chk', merchant: 'Geico' });
  addEntry(d, { date: '2026-10-03', amount: 200, kind: 'transfer', account: 'chk', note: 'to savings' });
  addEntry(d, { date: '2026-10-03', amount: -200, kind: 'transfer', account: 'sav', note: 'from checking' });
  const concert = addEntry(d, { date: '2026-10-10', amount: 120, lineId: 'shopping', account: 'chk', merchant: 'Ticketmaster' });
  editEntry(d, concert.id, { owed: 60 });
  const couch = addEntry(d, { date: '2026-10-12', amount: 250, lineId: 'shopping', account: 'chk', merchant: 'Couch' });
  editEntry(d, couch.id, { oneOff: true });
  addEntry(d, { date: '2026-10-25', amount: 450, kind: 'card-payment', account: 'chk' });
  addEntry(d, { date: '2026-10-25', amount: -450, kind: 'card-payment', account: 'visa' });
  if (opts.atm) addEntry(d, { date: '2026-10-28', amount: 60, account: 'chk', merchant: 'ATM withdrawal' });
  setBalance(d, '2026-10', 'chk', 'end', one(opts.atm ? 2420 : 2480));
  if (!opts.noSavingsEnd) setBalance(d, '2026-10', 'sav', 'end', one(5200));
  setBalance(d, '2026-10', 'visa', 'end', one(350));
  return d;
}

