// Short random ids for households, lines, debts, and income sources.

export function newId(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 9);
}
