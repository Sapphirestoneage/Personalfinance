# Lane 2 proposals

Changes lane 2 needs in files it may not touch (`shared/spine-v2.js`, `shared/schema.js`, `engines/`, `rooms/`, `.github/`). Each is the exact change, for the master build to apply or refuse. Nothing here is applied.

## P-1: a CI workflow that runs the corpus test (section 1)

The repo has no `.github/workflows/`. The gate for section 1 says "corpus test runs in CI", so this is the file. It runs the repo's own unit suite too, since that is what a contributor runs first.

File: `.github/workflows/tests.yml`

```yaml
name: tests
on:
  push:
    branches: [main, lane2]
  pull_request:
jobs:
  unit-and-corpus:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node test/run.js
      - run: node tests/corpus.test.js
      - run: node dnd/test/run.js
      - run: node test/export.js
```

Notes: the Playwright gates (`test/render.js`, `test/forms.js`, and the rest) need a browser and a local server and are left out here on purpose; a second job can add them once the master build wants them on every push. `tests/corpus.test.js` has no dependencies. When section 2 lands, add `cd tests && npm ci && node properties/run.js` after the corpus line.

## P-2: register three tables in `shared/reference.js` (section 1, observation)

`test/run.js` loads `data/access_rules.json`, `data/confidence_weights.json` and `data/ui_benefits.json` by hand because `Reference.TABLE_FILES` does not list them, and the corpus test had to do the same. If they are meant to be loaded by rooms through `Reference.load`, the change is three lines in `TABLE_FILES`:

```js
    accessRules: 'access_rules.json',
    confidenceWeights: 'confidence_weights.json',
    uiBenefits: 'ui_benefits.json',
```

If they are loaded another way on purpose, no change; this is only what the sweep tripped on. DECIDE: master build.
