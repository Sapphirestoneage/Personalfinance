// Accounts and month balances (S-084). No math here: adding, renaming,
// archiving, linking a card to its debt, and storing a typed balance.
// A month's start that was never typed is carried from last month's end by
// calc (balances.js), so it is never stored twice.

import { addBalanceCheck } from './cashflow.js';
import { newAccount, newBalance, ACCOUNT_TYPE_INFO, LIQUIDITY_TIERS, SECURED_TYPES, securedFields, ownedFields, ALTERNATIVES } from './schema.js';

export function addAccount(doc, fields = {}) {
  const acct = newAccount(fields);
  // A card links to its debt when there is exactly one card debt it could be.
  if (acct.type === 'credit-card' && !acct.debtId) {
    const taken = new Set(doc.accounts.map((a) => a.debtId).filter(Boolean));
    const free = doc.debts.filter((d) => d.type === 'credit-card' && d.state !== 'archived' && !taken.has(d.id));
    const byName = free.filter((d) => d.label.toLowerCase() === acct.name.toLowerCase());
    const pick = byName.length === 1 ? byName[0] : free.length === 1 ? free[0] : null;
    if (pick) acct.debtId = pick.id;
  }
  doc.accounts.push(acct);
  return acct;
}

// One card account for each card debt that has none yet, named and linked to it (S-102). Returns how many.
export function addCardAccounts(doc) {
  const taken = new Set(doc.accounts.filter((a) => a.state !== 'archived').map((a) => a.debtId).filter(Boolean));
  const free = doc.debts.filter((d) => d.type === 'credit-card' && d.state !== 'archived' && !taken.has(d.id));
  for (const d of free) doc.accounts.push(newAccount({ name: d.label, type: 'credit-card', debtId: d.id }));
  return free.length;
}

export function findAccount(doc, id) {
  return doc.accounts.find((a) => a.id === id) || null;
}

export function setAccountField(doc, id, field, value) {
  const a = findAccount(doc, id);
  if (!a) throw new Error('No account ' + id);
  if (!['name', 'type', 'institution', 'state', 'debtId', 'tier', 'countsForFI', 'securedDebtId'].includes(field)) throw new Error('Unknown account field ' + field);
  if (field === 'name' && !String(value || '').trim()) throw new Error('An account needs a name');
  if (field === 'tier' && !LIQUIDITY_TIERS.includes(value)) throw new Error('A liquidity tier is 1 to 4');
  if (field === 'countsForFI' && typeof value !== 'boolean') throw new Error('Counts toward FI is yes or no');
  if (field === 'securedDebtId' && value && !(doc.debts || []).some((d) => d.id === value)) throw new Error('No debt ' + value);
  if (field === 'type') {
    // A new type brings its own tier and FI default (S-110); a home or vehicle gets its purchase fields.
    const info = ACCOUNT_TYPE_INFO[value];
    if (!info) throw new Error('Unknown account type ' + value);
    a.type = value;
    a.tier = info.tier;
    a.countsForFI = info.fi;
    if (SECURED_TYPES.includes(value)) Object.assign(a, securedFields(a));
    else { delete a.purchasePrice; delete a.purchaseDate; delete a.securedDebtId; }
    for (const k of ['rentAlt', 'rideshareAlt', 'transitAlt', 'rentalAlt']) if (!(ALTERNATIVES[value] || []).includes(k)) delete a[k];
    if (info.kind === 'valued') Object.assign(a, ownedFields(value, a));
    else delete a.notes;
    return;
  }
  a[field] = field === 'debtId' || field === 'securedDebtId' ? value || null : value;
}

// A home or vehicle's purchase price (a Value) or date ('YYYY-MM-DD' or null).
export function setPurchase(doc, id, field, value) {
  const a = findAccount(doc, id);
  if (!a || !SECURED_TYPES.includes(a.type)) throw new Error('Only a home or vehicle has a purchase');
  if (field === 'price') a.purchasePrice = { ...value, cadence: 'one-off' };
  else if (field === 'date') {
    if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('A date is YYYY-MM-DD');
    a.purchaseDate = { ...a.purchaseDate, date: value, status: value ? 'known' : null };
  } else throw new Error('Unknown purchase field ' + field);
}

// Balances are kept for an account, or for a debt that has no account of its own (S-110).
function hasBalances(doc, key) {
  return !!findAccount(doc, key) || (doc.debts || []).some((d) => d.id === key);
}

// The account a paycheck deduction goes into (S-110), or null.
export function setDeductionAccount(doc, incomeId, deductionId, accountId) {
  const inc = (doc.income || []).find((i) => i.id === incomeId);
  const d = inc && (inc.deductions || []).find((x) => x.id === deductionId);
  if (!d) throw new Error('No deduction ' + deductionId);
  if (accountId && !findAccount(doc, accountId)) throw new Error('No account ' + accountId);
  d.accountId = accountId || null;
}

// The day a balance was read (S-100), 'YYYY-MM-DD', or null for the month's first or last day.
export function setBalanceDate(doc, month, accountId, which, date) {
  if (!hasBalances(doc, accountId)) throw new Error('No account ' + accountId);
  if (which !== 'start' && which !== 'end') throw new Error('A balance is a start or an end');
  if (date !== null && !(/^\d{4}-\d{2}-\d{2}$/.test(date) && date.slice(0, 7) === month)) throw new Error('Pick a day in ' + month);
  doc.balances[month] = doc.balances[month] || {};
  doc.balances[month][accountId] = doc.balances[month][accountId] || newBalance();
  if (date === null) delete doc.balances[month][accountId][which + 'On'];
  else doc.balances[month][accountId][which + 'On'] = date;
}

// which: 'start' or 'end'. value is a Value (from the input).
export function setBalance(doc, month, accountId, which, value) {
  if (!hasBalances(doc, accountId)) throw new Error('No account ' + accountId);
  if (which !== 'start' && which !== 'end') throw new Error('A balance is a start or an end');
  doc.balances[month] = doc.balances[month] || {};
  doc.balances[month][accountId] = doc.balances[month][accountId] || newBalance();
  doc.balances[month][accountId][which] = { ...value, cadence: 'one-off' };
}

// The alternative to owning (S-113): rent for a similar home, or rideshare, transit, and a rental a month.
export function setAlternative(doc, id, key, value) {
  const a = findAccount(doc, id);
  if (!a || !(ALTERNATIVES[a.type] || []).includes(key)) throw new Error('No alternative ' + key + ' for this account');
  a[key] = { ...value, cadence: value.cadence || 'month' };
}

// The coach's notes on a thing the client owns (coach-only, S-113).
export function setAccountNotes(doc, id, text) {
  const a = findAccount(doc, id);
  if (!a || a.notes === undefined) throw new Error('Notes are for a home, a vehicle, or another thing you own');
  a.notes = String(text || '');
}

// The return the equity could earn elsewhere, a year (an assumption, 0% to 20%).
export function setOwnReturn(doc, rate) {
  if (!(typeof rate === 'number' && rate >= 0 && rate <= 0.2)) throw new Error('Use a return from 0% to 20% a year');
  doc.settings.ownReturn = rate;
}

// Update a balance (S-136): what the account holds on a day. It becomes that month's end, read on that day,
// so the month's numbers (bridge, net worth) keep working; an earlier reading in the same month is kept as a
// balance check, so the history loses nothing. value is a Value (from the input).
export function updateBalance(doc, accountId, date, value) {
  if (!hasBalances(doc, accountId)) throw new Error('No account ' + accountId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('A date is YYYY-MM-DD');
  const month = date.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const last = month + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
  const b = ((doc.balances || {})[month] || {})[accountId];
  const prev = b && b.end && b.end.amount !== null && b.end.amount !== undefined ? { date: b.endOn || last, amount: b.end } : null;
  if (prev && prev.date < date) addBalanceCheck(doc, accountId, prev.date, prev.amount);
  setBalance(doc, month, accountId, 'end', value);
  setBalanceDate(doc, month, accountId, 'end', date === last ? null : date);
}
