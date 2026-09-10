# Lane 2 log

One short paragraph per section, newest at the bottom. The lane rules are in the second-lane prompt; the decisions are the L-series in DECISIONS.md.

## Section 1: synthetic household corpus (L-1)

Thirty fixtures under `fixtures/households/` (24 archetypes, 6 edge cases), each generated through `Schema.createHousehold` by `tests/tools/build-households.js` so the shape is the live spine v2 one, with `meta.known` hand arithmetic and its working. `tests/corpus.test.js` sweeps 226 household-first engine functions across 62 engines for throws, NaN and forbidden negatives, and compares ten known values per fixture within 1%: 7109 checks, zero disagreements, one arg-map mistake of my own fixed on the way (statement.portfolios takes access rules, not debt rules). `docs/lane2-findings.md` is regenerated each run and is empty of disagreements; it does list twelve functions the sweep cannot call without a skill, goal or offer, which section 2 will feed. No CI exists in the repo, so "runs in CI" is a workflow proposal in `docs/lane2-proposals.md`. DECIDE: the expected `sphere` on each fixture is a guess until spheres.json lands; and whether known-value disagreements should fail CI (they currently only write to the findings file unless `CORPUS_STRICT=1`).
