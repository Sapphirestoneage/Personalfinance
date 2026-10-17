# Hosting SLAM for a coach and a client

SLAM runs on one device today. This page says what is already in place for a
shared, hosted version (S-096) and what a server version would add. Nothing
here is built beyond the groundwork. No real client data is ever committed to
this public repo.

## Already in place

- **Records.** Every thing a person creates or edits (log entries, categories,
  lines, incomes, deductions, debts, accounts, balances, plan lines, tags,
  eras, estimate log rows, balance checks, Next stage costs, changes, and
  measures) has a stable `id`, `createdAt` and `updatedAt` (UTC ISO),
  `createdBy` and `updatedBy` (`coach` or `client`), and a `version` that goes
  up by one on each edit. See `src/store/records.js`. Calendar dates stay
  local `YYYY-MM-DD`.
- **No hard deletes.** A removed record stays in the file with `deleted`,
  `deletedAt`, and `deletedBy`. Calc and screens only see the live view.
- **Who is working.** `src/store/session.js` holds the role. Today it is
  always the coach. A sign-in would set it, and nothing else decides it.
- **Who sees what.** `src/store/visibility.js` is the one map. Coach-only
  fields: coach notes, plan line notes, a mistake tag until it is shared, the
  cushion setting, and the materiality setting. "View as client" uses the
  same map to show what the client would see.
- **One storage interface.** `src/store/storage.js` is async and is the only
  code that touches where data lives: `listClients()`, `loadClient(id)`,
  `saveClient(doc)`, `deleteClient(id)`, `loadBackups()`, `saveBackups(list)`,
  and `subscribe(fn)` for changes made somewhere else.
- **Merge, not replace.** `src/store/merge.js` merges two copies record by
  record. A record changed on both sides since the last shared version
  (`doc.sync.versions`) is a conflict the coach picks.

## What a server version adds

1. **Sign-in** for the coach and each client. The session sets the role.
   A client only ever loads their own household.
2. **Server storage** behind the same interface, plus per-record methods so
   one change travels at a time:
   - `saveRecord(clientId, collection, record)`: create or update one record.
     The server accepts it only if `record.version` is one past the stored
     version; otherwise it answers with the stored record (a conflict).
   - `deleteRecord(clientId, collection, id)`: sets the deleted marker. Never
     removes the row.
   - `watchClient(clientId, fn)`: calls `fn(records)` when the other side saves.
   `saveClient` stays for whole-file imports, which go through `mergeDocs`.
3. **Permissions from the visibility map.** The server never sends a
   coach-only field to a client session, and refuses a client write to one.
4. **Live sync.** The open screen reloads the changed records (the store
   already re-renders when `subscribe` fires).
5. **Client entries from their own phone.** Quick entry already stamps
   `createdBy` from the session, so a client's entries arrive marked as theirs.

## Not decided yet

Where it is hosted, how sign-in works, and what it costs. See PARKING_LOT.md.
