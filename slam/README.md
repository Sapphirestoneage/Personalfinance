# SLAM Profit Engine

Stress Less About Money: a local-first, phone-first web app that shows how
every business decision flows to profit. Everything stays on the device.

Phases 0 and 1 are in, plus four polish passes (layering, the Hormozi-
inspired tools, the reality loop, phone polish): the engine (`src/engine`), the data layer with
labeled assumptions, Dexie storage and plain-file backup (`src/data`), the
canonical sample and three demo profiles (`src/content`), golden tests
G1-G21 (`tests/golden`), and the screens (`src/features`): Today with the
check-in, My Numbers, Clients, My businesses, Hypotheticals, Toolbox, and
Demo/backup. `CLAUDE.md` is the condensed spec; `docs/OPEN-QUESTIONS.md`
lists what still needs the owner's answer.

```
npm ci
npm run dev        # http://localhost:5173
npm test           # engine, golden and storage tests (Vitest)
npm run build      # installable PWA in dist/
npm run test:e2e   # phone flows against the build (Playwright)
npm run check      # all of the above
```

`npm run build:app` writes the committed copy under `app/`, which GitHub
Pages serves from `main` at https://sapphirestoneage.github.io/Personalfinance/slam/app/
once this branch is merged. Rebuild it in every commit that changes the app.
`SINGLEFILE=1 npm run build` produces one self-contained HTML file.
If Playwright's own Chromium is not installed, point it at one:
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.
