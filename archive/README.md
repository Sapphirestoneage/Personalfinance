# The archive: how this repository got here

This folder holds every earlier generation of the tool, moved here on 2026-10-23 and otherwise
unchanged. The current build is SLAM, in `slam/` at the repository root. Nothing was deleted:
every page that had a public address still has one, because a small redirect page sits at each
old path and forwards to the new one, hash and all.

The same person built all of it in about four months, a money coach working with Claude Code,
one branch and one small commit per change. Each generation was a fresh answer to the same
question: what does a client need to see, in one sitting with their coach, to stop stressing
about money? What each attempt got wrong is written down in `../slam/LESSONS.md` as the 23 rules
SLAM is checked against. Where this page attributes a rule to a version, the attribution comes
from that file or from the decisions logs; everything else describes what the code does.

## 1. The FOO ladder (July 2026)

Where: `sparks/index.html`, `sparks/foo-ladder.js`, and the file `sparks/Inheritance FOO`, the
July 6 original with no file extension.

One HTML page that walked a household through the Financial Order of Operations: which dollar
goes where first (the employer match, high-interest debt, an emergency fund, and so on up the
ladder). Everything was in the one file: the numbers, the assumptions (a 3-month emergency fund,
"high interest" meaning any APR over 6%) and the drawing. Money was floating-point dollars.

What it left behind: the ladder itself, which SPARKS kept as a room and as the top of its
Dashboard. And two habits SLAM later wrote down as rules: an assumption typed into code
disagrees with the same assumption typed elsewhere (the SPARKS data file says 7.5%, this page
says 6%), so reference numbers belong in data files with a source and a year; and float dollars
drift, so money needs a deliberate representation.

## 2. SPARKS, also called SLAF (September 2026)

Where: `sparks/`, the whole September tree. Decisions D-001 (2026-09-03) to D-341.

The idea was a house of small rooms. Each room answered one question (the lean month, the FI
date, which account the next dollar goes to, what a move or a kid would cost) and all of them
read one household object in the browser's storage. The rules were strict and they are still
good ones: one owner per shared field (editable in one room, a read-only link everywhere else);
money as integer cents; "empty is not zero", so a missing number gives an incomplete reading
rather than a false zero; reference data in `data/`, versioned by year; one formula in one
function. It grew its own vocabulary: DAITE (the five money families), FAT (the three boxes of
a lean month), DRAFTT (seven shares of income), Spheres, Blocks, Lenses, Levers, the Ledger,
the Solar System. It has 35,885 unit checks, twelve browser gates, a property-test harness
("Lane 2") and a context toolchain that packs just enough of the 1 MB decisions log for an AI
session to work on one room.

It also grew to 93 rooms. A merge programme cut them to 37 (the cut list is
`sparks/docs/room-map.json`) and a freeze stopped new ones (D-313). By then the household model
had 110 owned fields, four onboarding doors, and typical-versus-actual spread over four rooms;
`sparks/docs/ARCHITECTURE.md` lists these as known structural problems.

Two of SLAM's rules name the rooms directly: each room ran its own math and they disagreed
(rule 3; the audit found money arithmetic inline in 33 of the 99 pages), and the app grew to
67 rooms (rule 5). Four more read like this period: the same fact asked in several places
drifted (rule 1, which the ownership map was built to prevent); too many questions up front
(rule 4; the fix here was a five-input opening, D-312); charts buried behind long paths
(rule 7); data living only in this browser with no backup until late (rule 9, D-204). The
ideas that carried forward: one store, pure engines, "empty is not zero", reference data with
a source and a year, and a decisions log with a number on every entry.

Three side apps were built on the same shared files and live inside `sparks/`:

- **Dungeons & Dividends** (`sparks/dnd/`, September 4 to 24, decisions DD-001 to DD-030).
  A finance character sheet as a role-playing game: Strength is earning power, Constitution is
  whether a savings rate can be sustained, Hit Points are runway in weeks. Eleven pages, its
  own tests, and byte-identical copies of the SPARKS `shared/` files kept in step by a test.
  It shows the cost of that independence: the same 4,000 lines live in four places.
- **Coach Mode** (`sparks/coach/`, September 24 to 26, decisions CD-001 onward). The first
  coach-operated attempt: a roster, a live session that follows a path of stops, and a view the
  client sees. Three days of work, and the shape every later version kept: the coach drives the
  session, one client at a time. It also set the rule that a client's numbers never enter this
  public repository, enforced by `.gitignore` patterns and a test.
- **Marketing Scoreboard** (`sparks/marketing/`, September 26, decisions MD-001 onward). Not a
  finance tool: a content log, a small CRM and weekly targets for the coaching business, with
  a spreadsheet twin where "every number is a formula you can click" (MD-010).

## 3. Money Rooms v2 (a separate repository, to 2026-10-05)

Not in this repository. It is `Sapphirestoneage/money-rooms`
(https://github.com/Sapphirestoneage/money-rooms): the same rooms idea rebuilt in Vite and
TypeScript, the one generation with a build step. The generations after it went back to plain
files served as they are.

## 4. Money Rooms v3, Coach Edition (October 5 to 17)

Where: `money-rooms-v3/`. 105 commits, 117 decisions, its own unit suite and an hour-long
browser sweep that photographs every screen at three widths (the screenshots are still here,
74 MB of them).

One page instead of many, driven by the coach. The engine stored every quantity with its
period, basis and tax treatment and threw on a mismatch (`engine/units.js`), parsed numbers the
way people say them ("1900 every two weeks"), and computed 74 metrics and 40 lenses from one
client record with an append-only journal. Readings were grouped into seven "planets" of five
stations each, with an FI ladder (Lean, Barista, FI, Fat, Coast) and a year-by-year projection.

Three of SLAM's rules are already practised here: every answer carries a state and a source
(`engine/states.js`; rules 2 and 15), every amount is normalized to monthly whatever cadence
it was given in (`engine/units.js`; rule 13), and every data library says where it came from
and when. What SLAM did differently afterwards: Today shows four numbers and one Next card
instead of a shelf of 74 metrics (rules 7 and 8), and one-time setup is kept apart from
weekly use (rule 5).

## 5. SLAM, Stress Less About Money (October 15 onward)

Where: `../slam/`, at the root. Decisions S-001 onward.

Started fresh from the 23 rules, with the Budget as the first tool and the monthly loop (Plan,
Track, Review) as the menu. One number store, one math library of pure functions, screens that
never calculate, dollars as typed with rounding only at display, hand-computed test households,
and every record stamped with an id, timestamps, author and version so a shared version can
come later without a rewrite. The root `README.md` and `docs/` describe it.

## Where everything went

| Before 2026-10-23 | Now |
| --- | --- |
| `index.html`, `foo-ladder.js`, `map.html`, `Inheritance FOO` | `archive/sparks/` (same names) |
| `rooms/`, `engines/`, `shared/`, `data/`, `fixtures/`, `scripts/`, `vendor/` | `archive/sparks/<same>/` |
| `test/` (the SPARKS suite), `tests/` (Lane 2), `tools/` (context tools), `.claude/` | `archive/sparks/<same>/` |
| `README.md`, `CLAUDE.md`, `SPEC.md`, `ROADMAP.md`, `DECISIONS.md`, `STATUS.md`, `PROGRESS.md`, `PANEL_REVIEW.md`, `MONEY-MAP.md`, `DESIGN-AUDIT.md`, `RELEASE.md`, `LATER.md` | `archive/sparks/<same>` |
| `docs/` (everything except this pass's `AUDIT.md` and `HANDOFF.md`) | `archive/sparks/docs/` |
| `rooms.json`, `sync.json`, `version.json`, `favicon.svg`, the seven `.png` files | `archive/sparks/` |
| `dnd/`, `coach/`, `marketing/` | `archive/sparks/dnd/`, `archive/sparks/coach/`, `archive/sparks/marketing/` |
| `.github/workflows/test.yml`, `pages.yml` (the September CI) | `archive/sparks/.github/workflows/` (kept as a record; the live workflows are new files at the root) |
| `money-rooms-v3/` | `archive/money-rooms-v3/` |
| `slam/` | unchanged |

The side apps stayed inside `sparks/` because they were built inside it: their tests, their
vendoring tool and the SPARKS browser gates all reach them by relative path, and moving them
beside it would have meant editing archived code.

## Running an archived app

Each generation is served from its own folder, the way it was built. From the repository root:

```
# SPARKS, D&D, Coach Mode, Marketing Scoreboard (one server for all four)
cd archive/sparks && python3 -m http.server 8000
# then http://localhost:8000/ (the Dashboard), /map.html, /dnd/, /coach/, /marketing/

# Money Rooms v3
cd archive && python3 -m http.server 8000
# then http://localhost:8000/money-rooms-v3/
```

Their tests still run, and still pass. The workflow `.github/workflows/archive.yml` runs them
whenever something under `archive/` changes, or on demand from the Actions tab. By hand:

```
cd archive/sparks
node test/run.js && node test/solar.js && node dnd/test/run.js && node coach/test/run.js \
  && node marketing/test/run.js && node test/export.js && node test/xlsx.js
(cd tests && npm ci && npm test)          # Lane 2; it rewrites tests/reports/ and docs/lane2-findings.md
python3 -m http.server 8765 &             # then the twelve browser gates, test/render.js and friends
node ../money-rooms-v3/tests/run.js
node ../money-rooms-v3/tests/ui.js        # about an hour; serves its own copy
```

## The redirects

Every page that had a public address under https://sapphirestoneage.github.io/Personalfinance/
still has one. A small file at the old path carries the visitor to the new one and keeps the
hash and query string, so a link to a room, a D&D sheet, a coach screen or a Money Rooms view
shared before the move still lands. The root address now opens SLAM; the earlier Dashboard it
showed is at `archive/sparks/index.html`. Images and other non-page files that were linked
directly (for example the D&D share images) did not get stubs; the pages that reference them
were updated to their new addresses.
