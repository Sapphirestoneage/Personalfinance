# Coach Mode, later: the client portal

Written: Sept 24, 2026; revised Sept 25 when Coach Mode became its own app (D-339, CD-001 onward).
Spec: `coach/SPEC.md` section 9. **Nothing here is built.** This file
exists so the shapes the portal reads are fixed now and nothing needs to
migrate when it ships.

## What the portal is

- Accounts with an email magic-link login, and a hosted database (Supabase,
  with row-level security: a client reads only their own rows, the coach
  reads all of them), holding the same household shape, one per client.
- The client opens Client View on their phone, submits the monthly check-in,
  comments on a number, and ticks homework.
- Coach Home gains a "new since last look" badge per client.

## Before it ships (not optional)

1. A privacy note: what is stored, where, who can read it, how long.
2. A short disclaimer: a coach, not an investment adviser.
3. Export my data, and delete my data, from the client's side.
4. An audit log: who read or changed which client's rows, and when.
5. The repository stays public and data-free: the guard in
   `test/coach-checks.js` (no tracked file carries the coach signature) and
   the `.gitignore` rules stay, and no key or connection string is committed.

## Every Coach Mode shape the portal will read

All of these are stored today in the coach's browser by `coach/shared/coach.js`.
The portal stores the same JSON per client; nothing is renamed or reshaped.

### One client: `coach.client.<id>.v1`

```
{ household: <Schema.createHousehold, schema version 2, the SPARKS shape>,
  coach: {
    sessions:  [{ id, startedAt, endedAt | null, startSnapshotId, endSnapshotId | null,
                  stopsCovered: [stopId], ticked: [{ stopId, itemId }],
                  recapText | null, durationMs | null }],
    notes:     [{ id, kind: 'coach' | 'shared', stopId | null, sessionId | null,
                  text, at, source: 'typed' | 'quick' | 'import' }],
    homework:  [{ id, text, dueOn | null, stopId | null, itemId | null,
                  sessionId | null, at, doneAt | null }],
    checkins:  [{ id, date, balances: { <fieldId> | <fieldId>:<itemId>: cents },
                  incomeCents | null, feeling: 1-5 | null, text,
                  homeworkTicked: [homeworkId], enteredBy: 'coach' | 'client', at }],
    comments:  [{ id, target: { kind: 'row' | 'goal' | 'recap', id },
                  by: 'coach' | 'client', loggedByCoach, at, text, resolvedAt | null }],
    decisions: [{ id, label, startsOn: 'YYYY-MM' | null, verdict: 'go' | 'wait' | 'no' | null,
                  showClient, note | null }] } }
```

The household keeps the SPARKS shape exactly (field ids are SPARKS Ledger
row ids, written where SPARKS writes them, `coach/shared/fields.js`), so a
client's household could open in Money Rooms unchanged. `meta.fields` carries
`{ asOf, source: 'coach', confidence: 'roughly' | 'sure' }` per entry.

Row-level rules the portal must enforce on top of that shape:

- **`notes` where `kind === 'coach'` are never sent to a client.** Split
  them into a coach-only table, or filter at the policy level; never filter
  only in the page. Client View reads the record only through
  `ClientView.visible` (`coach/clientview.js`): shared notes, homework,
  check-in dates and feelings, and decisions marked `showClient`.
- A client may insert a `checkins` row with `enteredBy: 'client'` and a
  `comments` row with `by: 'client'`, `loggedByCoach: false`; they may set
  `doneAt` on their own homework. Nothing else is client-writable.
- A check-in's balances are written to the fields that hold them (CD-008).
  The portal does the same on the server, or queues the check-in for the
  coach to apply; it never lets a client write a household field directly.

### Snapshots: `coach.client.<id>.snaps.v1`

`[{ id, at, reason: 'coach-session-start' | 'coach-session-end', household }]`,
append-only: the frozen plan a recap and a read-only view are built from.

### The roster, the coach's own: `coach.roster.v1`

**No money, ever.**

```
{ version: 1,
  clients: [{ id, name, createdAt, archived, pathId,
              stops: { <stopId>: { items: { <itemId>: tickedAt } } },
              nextSessionAt | null, demo, stopOrder | null, skipped: { <stopId>: true } }],
  importTemplates: { <name>: { columns: { <header>: 'field:<id>' | 'qe:<word>' | null }, savedAt } } }
```

In the portal this is the coach's table. A client may read its own `name`
and `nextSessionAt`, and nothing of another client.

### Reference data the portal reads as is

`coach/data/`: `session_paths.json` (the stops, their fields, read-outs and
done-when tests), `fields.json`, `quick_entry.json`, and the SPARKS tables
the engines read (vendored copies).

### Files that already leave the device

Coach backups and recaps carry `slafCoachExport: 1` and a `kind` of
`'client'`, `'all'` or `'recap'`, sealed with `shared/vault.js`. A client
file holds `{ client, data, snapshots }` (the stored strings as they are).
The portal's import path is `Coach.openFile` then `Coach.restore`, pointed at
the server instead of localStorage.

## The "new since last look" badge

Needs one more roster field when the portal ships: `lastLookAt` per client,
set when the coach opens that client's session or view. The badge is any
`checkins`, `comments` or homework `doneAt` newer than it. Adding it is a
roster change only; no household shape changes.
