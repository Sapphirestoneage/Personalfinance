# Coach Mode: the spec

Repo: `Sapphirestoneage/PersonalFinance` (Money Rooms / SPARKS / SLAF)
Written: Sept 24, 2026
Scope decided by the owner: **just me first, clients later.** Clients will eventually get a view with monthly check-ins and comments, but this pass builds the coach side only and lays the data shapes the client side will need.

Decision: D-338 (the freeze is lifted for `coach/` and its three screens only).
The later client portal: `docs/COACH-MODE-LATER.md`.

---

## 1. The shift in one paragraph

Money Rooms was built as self-serve software: a stranger alone with the tool, so every screen had to guide, gate, explain, and forgive. Coach Mode flips that. Eli is the guide. He drives the software live on a call, the client watches their numbers and their future update, and between calls the client checks in the way you'd log a workout in a fitness app. It replaces the shared Google Sheet Eli uses with clients today. Coach Mode does not need to be simple, it needs to be **fast for Eli and clear for the client.**

## 2. What it keeps, what it skips

**Keeps (unchanged):** the 89 engines, the 80 reference data files, the household model (`slaf.household.v2`), ownership, blocks and scenarios, snapshots and undo, the vault (sealed backups), the Ledger rows, ratios, the timeline and journey map.

**Skips in coach mode:** onboarding doors, the five-input opening, level gates, "what should I fill next" nudges, beginner feature switches. In coach mode every feature switch is on, every ratio is visible, nothing is locked. Eli decides what's next, not the app.

**Does not change the public site.** A visitor to the public Money Rooms sees exactly what they see today. Coach Mode is reached only by a Settings switch (or `?coach=1` once, which sets the switch).

## 3. The three screens

Coach Mode adds three screens under a new `coach/` folder. It adds no rooms to `rooms/`.

### 3.1 Coach Home (the roster)

A list of clients. Each row shows:
- name (or nickname), stage on their session path, date of last session
- next session date if set
- how many numbers are rough or stale
- whether their monthly check-in is in, late, or missing
- FI date band now vs at their first session (the "progress photo")

Actions: new client, open session, open client view, sealed backup of one client, archive client.
One row is always "Demo client (example numbers)" for practice and for showing prospects.

### 3.2 The Session (the console)

This is where Eli spends 90% of his time. Layout on a laptop:

- **Left: the session path.** A checklist of stops (default below). Each stop expands into its items: the Ledger rows to fill, the questions to ask the client in plain words, and what "done" means. Checking an item ticks it for this client permanently. The current stop is highlighted.
- **Center: the work area.** The existing room or Ledger section for the current stop, embedded, with all advanced fields showing.
- **Right: the ratio rail.** Pinned, always visible: savings rate, debt-to-income, emergency fund months, liquidity rate, housing share, FI date band, net worth, plus whatever ratios the current stop unlocks. Each ratio shows before-this-session and now.
- **Top bar:** client name, session timer, "Detour", "Client view" toggle, "End session".

**Detour.** When the conversation hits a stumbling block ("we can't decide the debt plan until we know the real monthly surplus"), Eli taps Detour, picks any stop or room, works there, and a breadcrumb chip at the top ("Back to Debt, item 3") returns him exactly where he left. Detours nest at most two deep.

**Quick entry.** A single input box at the bottom of the console accepts shorthand while the client talks:
- `car 450/mo 5.9% 38 left`
- `rent 2100`
- `401k 38k match 4%`
- `hysa 12.5k`

It parses into Ledger rows, shows a one-line preview ("Car loan: $450 a month, 5.9%, 38 payments left. Enter to save"), and saves on Enter. Anything it can't parse is saved as a note on the stop, never guessed into a number. Empty is not zero still holds.

**Notes.** Two note fields per stop and per session: **Coach notes** (private, never in the client view or any client-facing export) and **Shared notes** (appear in the recap and the client view).

**Homework.** Any item can be turned into homework with one tap ("Find your 401k fee ratio, due before next session"). Homework appears in the recap and the client view.

### 3.3 Client View (presenter mode)

What the client sees while Eli screen-shares, and later what they'll open themselves. It hides every coach-only element (coach notes, the path's scripts, raw data, stale warnings meant for Eli). It shows four things, top to bottom:

1. **The life map.** A horizontal timeline from today to the FI date band and beyond: their age along the bottom, goals placed at their target dates, milestones from the milestone ladder (max 401k + Roth, Coast FI, FI stages), and any scenario blocks Eli chose to show. Each goal carries a status: on track, needs $X a month more, or needs a decision.
2. **How long each goal takes.** For each goal: target amount, date, monthly amount needed, and at the current pace when it lands.
3. **What changed.** Since the last session: numbers updated, FI date moved from X to Y, homework done.
4. **Homework and next session.**

It must look great on a phone, since that's where clients will open it later.

## 4. The default session path

Stored in `data/session_paths.json`, so it's editable without code. Eli can reorder stops per client, skip stops, or pick a different path template.

| Stop | What it covers | Done when |
|---|---|---|
| 0. The life picture | What they want, when, values, big dates coming (wedding, move, kid, career change) | At least three goals with rough dates |
| 1. Income | Every source, take-home, pay frequency, variability | Take-home monthly is known or "roughly" |
| 2. Spending & cash flow | Needs (food, housing, transport), wants, the typical month, surplus | Monthly surplus computes |
| 3. Debt | Every debt, rate, minimum, payoff order | Payoff plan chosen, debt-free date shows |
| 4. Safety | Emergency fund target, insurance, protection | Emergency months computes, gap named |
| 5. Assets & accounts | Every account, tax type, contributions, match, fees | Net worth and savings rate compute |
| 6. Taxes | Filing status, state, pretax vs Roth, easy wins | Marginal rate and one tax move named |
| 7. Goals & the life map | Price each goal, place it, fund it | Every goal has a monthly number and a status |
| 8. Decisions | Scenario blocks: house, car, job, kid, sabbatical, geo move | Each block has a verdict: go, wait, or no |

Each stop in the JSON lists: its Ledger rows, the existing rooms it can open, the ratios it unlocks, plain-words questions for Eli to ask, and its done-when test (evaluated, not typed).

## 5. Session lifecycle

1. **Start session.** Takes a snapshot of the client's household ("start of session, Sept 24"). Starts the timer.
2. **Work.** Everything saves live into that client's household as it does today.
3. **End session.** Takes an end snapshot and builds the **recap**, a diff of the two snapshots written in plain words:
   - what we covered (stops and items ticked)
   - numbers that changed (old, new)
   - ratios before and after
   - FI date band before and after
   - shared notes
   - homework with due dates
   Eli edits the recap text, then exports it as a one-page PDF or a sealed file, or copies it as plain text for email. Coach notes never appear.
4. **History.** Every session is kept: date, length, stops covered, recap. Any past session's snapshot can be opened read-only ("the plan as of June 3").

## 6. Check-ins and comments (built as data now, client-facing later)

The client side comes later, but the shapes land now so nothing has to migrate.

**Monthly check-in.** A short dated record: balances that moved (cash, debts, investments), income this month if it differs, one "how are you feeling about money" 1-5, a free-text line, and homework ticked. Until clients have logins, **Eli enters check-ins** (from a text, an email, or a call), and a check-in form in Client View lets a client fill it on Eli's screen during a session.

**Comments.** A comment can attach to any Ledger row, goal, or recap. Fields: who (coach or client), when, text, resolved. For now only Eli writes them, including ones he logs on the client's behalf ("Client says rent is going up to 2,300 in March").

## 7. Storage and privacy (just me first)

- **Many households in one browser.** Today there is one household per browser. Coach Mode adds profiles: each client is a profile, and the app's existing keys live under that profile. The personal household Eli uses today stays exactly where it is, as the default profile, untouched.
- **Nothing leaves the device** except as a file Eli makes. Per-client backup uses the existing vault (AES-256-GCM, passphrase). "Back up all clients" makes one sealed file.
- **Real client data never enters the repo.** The repo is public. The app already forbids real data; Coach Mode makes it mechanical: a `.gitignore` rule for backup and export filenames, and a test that fails if any committed file carries a coach export signature.
- **Demo client** uses the existing demo persona and corpus households, so Claude Code can build and test everything with zero real data.
- **Screen-share safety.** Client View never shows other clients, the roster, or coach notes. Switching clients requires going through Coach Home, never a dropdown on the session screen, so the wrong household can't flash on a shared screen.

## 8. Moving clients off the Google Sheet

An **Import from sheet** step on Coach Home: Eli exports a client's Google Sheet tab as CSV, drops it in, and maps columns to Ledger rows once (the mapping is saved as a named template, so the second client takes seconds). Uses the existing `shared/csv.js` and `shared/importer.js`. Unmapped columns become notes on the client, not numbers.

## 9. Later, not now: the client portal

Written down so the data shapes are right, but **do not build in this pass:**
- Accounts with email magic-link login, a hosted database (Supabase with row-level security: a client reads only their own rows, the coach reads all), the same household shape stored per client.
- Client opens Client View on their phone, submits the monthly check-in, comments on a number, ticks homework.
- Coach Home gets a "new since last look" badge per client.
- Before this ships: a privacy note, a short disclaimer (coach, not an investment adviser), export and delete-my-data, and an audit log.

## 10. What makes it better than the Google Sheet

If it doesn't beat the sheet on these, it's not done:
1. The life map updates live as numbers change, and the client can see their future move.
2. Every ratio is always computed and compared to last time, with no formulas to maintain.
3. The recap writes itself.
4. Detour keeps the session flowing without losing your place.
5. Each client's history is kept, so progress is visible over months.
6. A new client starts on a path, not a blank sheet.
