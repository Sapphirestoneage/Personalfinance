// Short random ids for every record: households, lines, debts, income sources,
// accounts, entries, tags, and checks. No imports.

// The prefix says what the id names; the 7 base-36 characters (about 78 billion values)
// are random enough that two devices do not make the same id (merging is by id, S-096).
export function newId(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 9);
}
