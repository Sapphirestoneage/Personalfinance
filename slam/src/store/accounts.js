// Accounts and month balances (S-084). No math here: adding, renaming,
// archiving, linking a card to its debt, and storing a typed balance.
// A month's start that was never typed is carried from last month's end by
// calc (balances.js), so it is never stored twice.

import { newAccount, newBalance } from './schema.js';

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

export function findAccount(doc, id) {
  return doc.accounts.find((a) => a.id === id) || null;
}

export function setAccountField(doc, id, field, value) {
  const a = findAccount(doc, id);
  if (!a) throw new Error('No account ' + id);
  if (!['name', 'type', 'institution', 'state', 'debtId'].includes(field)) throw new Error('Unknown account field ' + field);
  if (field === 'name' && !String(value || '').trim()) throw new Error('An account needs a name');
  a[field] = field === 'debtId' ? value || null : value;
}

// which: 'start' or 'end'. value is a Value (from the input).
export function setBalance(doc, month, accountId, which, value) {
  if (!findAccount(doc, accountId)) throw new Error('No account ' + accountId);
  if (which !== 'start' && which !== 'end') throw new Error('A balance is a start or an end');
  doc.balances[month] = doc.balances[month] || {};
  doc.balances[month][accountId] = doc.balances[month][accountId] || newBalance();
  doc.balances[month][accountId][which] = { ...value, cadence: 'one-off' };
}
