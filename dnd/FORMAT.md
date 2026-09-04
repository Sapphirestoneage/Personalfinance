# The character export format

This is the contract. `shared/export.js` implements it; if the two ever
disagree, this document is what an importer was written against.

It exists so the SPARKS suite (or anything else) can accept a character built
here without guessing. The short version: **it is a partial SPARKS household in
an envelope, and you should merge it key by key, never apply it wholesale.**

```
format          "dungeons-and-dividends/character"   — check this first
formatVersion   1                                    — integer, see Versioning
schemaVersion   2                                    — the SPARKS household schema
exportedAt      ISO 8601 timestamp
source          { tool, url }
contains        [ "people", "assets", … ]            — the keys actually present
partial         true                                 — always. see below
household       { …the payload… }
summary         { … }                                — OPTIONAL, display only
```

## The one rule that matters

**`household` is a partial household. Merge it. Do not replace.**

A full SPARKS household also carries `goals`, `ratings`, `worthChecks`,
`valuesProfile`, `swan`, `assumptions` and more. This tool cannot produce any
of them, so they are **not in the file** — not present-and-empty, absent.

If you `updateProfile(envelope.household)` against an existing household you
will be fine, because absent keys are untouched. If you instead *replace* the
stored household with `envelope.household`, you will wipe goals someone spent
an hour entering. That is the failure this format is shaped to prevent, and
`contains` exists so you never have to infer intent from a missing field.

The same rule applies one level down: a sheet with no debts **omits** `debts`
rather than sending `[]`. "I have no debts" and "this tool has nothing to say
about debts" are different claims, and only the first should overwrite
anything.

## What can appear in `household`

Every key is optional. Only those named in `contains` are present.

| Key | Shape | Notes |
|---|---|---|
| `people` | `[Person]` | Exactly one, `role: "adult"`, id `dnd_person`. Its `incomeSources[0]` (id `dnd_income`) carries `grossAnnualIncomeCents`. `dob` is always `null` — this tool never asks. |
| `filingStatus` | string | One of `single`, `married_joint`, `married_separate`, `head_of_household`. Collected only because the savings rate subtracts estimated tax. |
| `assets` | `[Asset]` | At most two: `dnd_asset_cash` (`category: "cash"`, `liquid: true`) and `dnd_asset_investments` (`category: "investment"`, `liquid: false`). |
| `debts` | `[Debt]` | At most one summary record, id `dnd_debt_total`, `type: "other"`. See the warning below. |
| `expenses` | `{ monthlyEssential, entries }` | `monthlyEssential.estimatedValueCents` is set; `entries` is always `[]` — this tool does no categorisation. |
| `dndProfile` | object | Game state. Nothing in SPARKS reads it. Keep it: it round-trips, costs nothing, and is what lets someone come back. |

Ids are stable and namespaced `dnd_*` on purpose, so a re-import updates the
same records instead of growing duplicates.

### One thing to be careful with: `debts`

This tool asks for **one total** and **one yes/no** ("is any of it above 7.5%
interest?"), because asking a quiz-taker to itemise every balance loses them.
So the single debt record is a summary, and its `rate` is a **stand-in, not a
measured APR**: `0.075` when they said yes, `0.04` when they said no.

That is honest enough to place Debt Burden and no more. If your importer has a
real per-debt UI, treat this record as a placeholder to be replaced, not as
data to be trusted — and consider telling the user so, rather than letting a
made-up 4% sit in their debt list looking like something they typed.

## `summary` is not authoritative

It exists so you can show *"you are about to import The Earner, Level 3, 13/18
HP"* on a confirmation screen before someone commits.

It is **derived and a snapshot**. Recompute from `household` instead of
trusting it — you can, because the household is the real shape and the engines
are the same. Any field is absent if it could not be computed.

```json
"summary": {
  "className": "The Earner", "classId": "earner",
  "level": 3, "percentOfFiNumber": 5.1,
  "maxHpWeeks": 18, "currentHpWeeks": 13,
  "debtBurden": 2,
  "abilityScores": { "STR": 12, "DEX": 13, "CON": 14 }
}
```

HP is in **weeks**, not months, and `percentOfFiNumber` is a percentage
(`5.1`), not a fraction.

## Validating

`shared/export.js` exports `validate(input, opts)` — the same checks an
importer should run, shipped here so both sides agree on what "valid" means.
It takes a string or an object and returns
`{ ok, errors[], warnings[], envelope }`. Port it or call it; either is fine.

What it enforces, and why each is a separate case:

- **`format` must match exactly.** Reject anything else. This is the check that
  stops someone pasting an unrelated JSON file into your importer.
- **A newer `formatVersion` is a warning, not an error.** Unknown keys are
  ignorable by design, so a v2 file should still import into a v1 reader with
  a note. An *older* or non-numeric version is an error.
- **`schemaVersion` mismatch is an error** when you pass
  `expectSchemaVersion`. The household shape is not something to guess at.
- **Every key in `contains` must exist**, and anything present but unnamed, or
  outside the owned set, is a warning.

## Versioning

`formatVersion` is an integer that increments **only on a breaking change** —
a key removed, renamed, or given a different meaning. Adding an optional key
does not bump it, because readers must ignore what they do not recognise.

`schemaVersion` tracks the SPARKS household schema and is not this format's to
change; it is passed through so a reader can refuse a household it would
misread.

## A worked import, in outline

```js
const { ok, errors, warnings, envelope } =
  Export.validate(pastedText, { expectSchemaVersion: 2 });
if (!ok) return showErrors(errors);

showConfirmation(envelope.summary);        // display only

// Merge — never replace.
const patch = {};
envelope.contains.forEach(key => { patch[key] = envelope.household[key]; });
Spine.updateProfile(patch);
```

`updateProfile` merges unknown keys through untouched, so `dndProfile` simply
survives. Note that it *replaces* the arrays it is given rather than appending,
which is the right behaviour here — the `dnd_*` ids mean a re-import updates
rather than duplicates — but it does mean an existing SPARKS user's own assets
and debts would be replaced by these two summary records. If that matters to
you, merge those two arrays by id yourself rather than handing them straight
to `updateProfile`.
