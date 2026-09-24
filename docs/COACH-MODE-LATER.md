# Coach Mode, later: the client portal

Written: Sept 24, 2026, at the end of the first Coach Mode build (D-338 to D-345).
Spec: `docs/COACH-MODE.md` section 9. **Nothing here is built.** This file
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

All of these are stored today in the coach's browser. The portal stores the
same JSON per client; nothing is renamed or reshaped on the way.

### The household, one per client

`slaf.household.v2` (default profile) or `slaf.p.<clientId>.household.v2`
(a client profile, D-339). The shape is `Schema.createHousehold`, schema
version 2, unchanged by Coach Mode except for one optional key:

```
household.coach = {                              // D-340; absent means empty
  sessions: [{ id, startedAt, endedAt | null, startSnapshotId, endSnapshotId | null,
               stopsCovered: [stopId], ticked: [{ stopId, itemId }],
               recapText | null, durationMs | null }],
  notes:    [{ id, kind: 'coach' | 'shared', stopId | null, sessionId | null,
               text, at, source: 'typed' | 'quick' | 'import' }],
  homework: [{ id, text, dueOn | null, stopId | null, itemId | null,
               sessionId | null, at, doneAt | null }],
  checkins: [{ id, date, balances: { <rowId> | <rowId>:<itemId>: cents },
               incomeCents | null, feeling: 1-5 | null, text,
               homeworkTicked: [homeworkId], enteredBy: 'coach' | 'client', at }],
  comments: [{ id, target: { kind: 'row' | 'goal' | 'recap', id },
               by: 'coach' | 'client', loggedByCoach, at, text, resolvedAt | null }]
}
```

Row-level rules the portal must enforce on top of that shape:

- **`notes` where `kind === 'coach'` are never sent to a client.** Split
  them into a coach-only table, or filter at the policy level; never filter
  only in the page. Client View already reads the record only through
  `ClientView.visible` (`coach/clientview.js`), which is the list of what a
  client may see: shared notes, homework, check-in dates and feelings.
- A client may insert a `checkins` row with `enteredBy: 'client'` and a
  `comments` row with `by: 'client'`, `loggedByCoach: false`; they may set
  `doneAt` on their own homework. Nothing else is client-writable.
- A check-in's balances are written to the owning rows through
  `Ownership.write` (D-345). The portal does the same on the server, or
  queues the check-in for the coach to apply; it never lets a client write
  a household field directly.

### Snapshots, one list per client

`slaf.snapshots.v1` / `slaf.p.<clientId>.snapshots.v1`, the existing
append-only list. Coach sessions add entries with `reason:
'coach-session-start'` or `'coach-session-end'` and `rawInputs: { household }`,
the frozen plan a recap and a read-only view are built from (D-343).

### Scenarios and blocks, one store per client

`slaf.scenarios.v1` / `slaf.p.<clientId>.scenarios.v1`, unchanged. The
client sees a block only if the roster marks it (below).

### The roster, the coach's own

`slaf.coach.v1` (D-339, D-341). **No money, ever.**

```
{ version: 1,
  clients: [{ id, name, createdAt, archived, pathId,
              stops: { <stopId>: { items: { <itemId>: tickedAt } } },
              nextSessionAt | null, demo, stopOrder | null, skipped: { <stopId>: true },
              blockVerdicts: { <blockId>: 'go' | 'wait' | 'no' },
              shownBlocks: { <blockId>: true } }],
  importTemplates: { <name>: { columns: { <header>: 'row:<id>' | 'qe:<word>' | null }, savedAt } } }
```

In the portal this is the coach's table. A client row may read its own
`name`, `nextSessionAt`, `shownBlocks` and `blockVerdicts` (for the blocks
shown), and nothing of another client.

### Reference data the portal reads as is

`data/session_paths.json` (the stops, their items, the done-when tests),
`data/quick_entry.json`, and every table `engines/session.js` already reads.

### Files that already leave the device

Coach backups and recaps carry `slafCoachExport: 1` and a `kind` of
`'client'`, `'all'` or `'recap'`, sealed with `shared/vault.js`. The portal's
import path for a coach moving from the browser is `Coach.openFile` then
`Coach.restore`, pointed at the server instead of localStorage.

## The "new since last look" badge

Needs one more roster field when the portal ships: `lastLookAt` per client,
set when the coach opens that client's session or view. The badge is any
`checkins`, `comments` or homework `doneAt` newer than it. Adding it is a
roster change only; no household shape changes.
