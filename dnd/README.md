# Dungeons & Dividends

A personal-finance RPG character sheet. Answer eighteen questions and get your
class. Add five numbers and get your Level, your Hit Points and your Armour
Class.

**It runs entirely in your browser.** There is no server, no account, no
analytics and no network call after the page loads — the numbers you type stay
in your own browser's storage, because there is nowhere else for them to go.
You can read every line of this repo and check that.

---

## The idea

D&D lets you see the consequences of a build *before* you commit to it. You
know what a Level 20 Fighter with no Constitution looks like long before you
get there. Most financial advice does the opposite: it arrives generalised,
with no sense of where you actually are.

So this is a character sheet.

| Mechanic | What it actually measures |
|---|---|
| **STR** Strength | Earning power |
| **DEX** Dexterity | How easily you can get out of the way of a hit |
| **CON** Constitution | Whether you can sustain a savings rate without breaking |
| **INT** Intelligence | Knowing the rules — tax, accounts, instruments |
| **WIS** Wisdom | Judgment, foresight, and knowing your own patterns |
| **CHA** Charisma | Negotiation, network, and bringing people with you |
| **Level** | How far through **your own** FI number you are — not a dollar target |
| **Hit Points** | Weeks you could cover with no income at all |
| **Armour Class** | What stops a hit landing in the first place |

Two people can both hit Level 20 with wildly different balances, because Level
20 always means the same thing: 100% of *your* number.

The sharp end is that Level and HP are different axes. Someone can be Level 15
on paper and sitting at 2 HP, because equity locked in a house does not pay a
hospital bill. That is the whole point of splitting them.

## Two tiers

**Tier 1 — the quiz.** No money at all. Eighteen questions gets you three of
your six ability scores, the nine sub-stats beneath them, the class you lean
toward, and your alignment on a 3×3 grid from Hearthkeeper to Arsonist.
Shareable, and honest about being partial.

**Tier 2 — the sheet.** Five numbers (plus how you file, which is only used to
estimate tax) and the rest resolves: all six scores, Level, HP, AC, Debt
Burden, class, subclass and feats.

Your class can change between the two, and that is intentional. The leaning is
temperament; the real assignment is where money actually moves. A class here is
a lever you pull, not a personality.

## Nothing is guessed

The rule the whole engine is built around: **empty is not zero.**

- An unanswered sub-stat is not an 8. It is unscored, and it says what it wants.
- An ability score with two of its three sub-stats answered is not an average
  of two. It is unscored.
- **Max HP is withheld entirely until Constitution is real.** A Hit Die plus an
  assumed +0 modifier is a fabricated character, and a believable wrong number
  is worse than a missing one.

You will see em-dashes on a half-finished sheet. That is the design.

## Where the numbers come from

The rulebook this implements deliberately left every dollar-to-score threshold
unspecified. Those were set separately and they all live in
[`data/dnd_scoring.json`](data/dnd_scoring.json), apart from the transcribed
rules, so recalibrating never edits a rule.

**The calibration: a US-population-median household scores 10 on every computed
sub-stat.** Median personal earnings (~$60k), the median saving rate (~6% of
gross), the median household's cash reserve (~1 month) — all score 10, which is
what makes a +0 modifier mean what it says. Most people who build a sheet land
13–16.

Those medians are **rounded conventions, not fitted distributions**. The file
says so itself, next to each ladder, and `test/run.js` asserts every one of
them — so if you retune the file, the tests tell you which promise you broke.

## Porting into SPARKS

This is a standalone tool that currently lives inside the SPARKS repository,
in this folder. It is **not** part of the suite — not a room, not in
`shared/registry.js`, never on the Map — it simply shares an address for now,
and the folder is built to be lifted into its own repository later without a
single edit.

It stores your sheet in the exact shape the SPARKS suite uses — a real
household object, not a private bag of fields.

That is not over-engineering; it is what makes carrying your data across a
**copy rather than a translation**. Nothing has to be mapped, re-rounded or
re-entered, and the two tools cannot disagree about a number because they run
the same engines over the same shape. "Take it with you" at the bottom of the
sheet downloads it as readable JSON — not an encoded blob, so you can see
exactly what you would be handing over before you hand it over.

**[`FORMAT.md`](FORMAT.md) is the contract**, if you are writing something that
reads these files. The one rule worth reading even if you read nothing else:
the file is a **partial** household and must be **merged, not applied**. A full
household also carries goals, ratings and a values profile that this tool
cannot produce — so they are absent from the export rather than present-and-
empty, and an importer that replaced a household wholesale would wipe work
someone did in SPARKS. `contains` names exactly which keys are present so you
never have to infer intent from a missing field.

`shared/export.js` also exports `validate()` — the same checks an importer
should run, shipped here so both sides agree on what "valid" means.

`test/parity.js` is the check that keeps this claim true: it builds a character
here and asserts it produces the same Level, Debt Burden, class and HP as the
main suite does for the same person.

## Layout

```
index.html      Tier 1 — the quiz and its result
sheet.html      Tier 2 — the full character sheet
bestiary.html   Monsters, Hazards, the Revenue Guild, Status Effects, Feat Trees
shared/
  store.js        persistence — the ONE file written for this product
  export.js       the character export, and its validator
  money.js        integer cents, safe divide, the Result type      \\
  schema.js       the household data model                          |  vendored
  reference.js    the data/ loader                                  |  verbatim
engines/                                                            |  from
  character.js    the 18 sub-stats, HP, AC, Level, class            |  SPARKS
  tier0.js        savings rate, emergency fund, FIRE number         |
  projection.js   compound growth — the only such loop             /
data/
  dnd_rules.json      the rulebook, transcribed
  dnd_classes.json    seven classes, 1-20, with subclasses and feats
  dnd_scoring.json    every threshold, and the quiz
  dnd_alignments.json the 3x3 alignment grid — picked, never computed
FORMAT.md       the export contract, for anyone writing an importer
test/run.js     the schema and the calibration promise
test/parity.js  same numbers as the main suite
test/export.js  the export contract, asserted
```

**The vendored files are byte-identical copies** of the ones in the parent
folder, deliberately keeping their original namespace so the comparison stays
exact. The single exception is the table list in `shared/reference.js`, which
had to be trimmed to the tables this product actually ships — it is commented
as such.

Duplicating them is what makes this folder liftable, and the parent suite's
`test/run.js` asserts every copy is identical so the two cannot silently drift.
**If you fix a bug in `../engines/tier0.js`, copy it here too** — that test
will tell you, but it is easier to remember than to be told.

## Running it

No build step, no dependencies, no framework. It does need to be *served*
rather than opened as a file, because it fetches its data. From the
repository root:

```
python3 -m http.server 8000
```

then open <http://localhost:8000/dnd/>.

Its own tests, run from this folder:

```
node test/run.js && node test/parity.js && node test/export.js
```

The parent suite's `node test/run.js`, run from the repository root, also
checks that the vendored copies here have not drifted.

## This is a game, not advice

It is a lens on numbers you already have. Nothing here is financial advice, no
threshold in it is a law, and a low score is a prompt to look at something —
not a verdict on you.
