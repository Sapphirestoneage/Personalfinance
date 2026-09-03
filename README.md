# SPARKS / SLAF

A suite of small, self-contained personal-finance tools — "rooms" — that all
read from and write to one canonical household model.

No build step, no framework requirement, no server. Every room is a static
HTML file that includes a handful of shared JavaScript modules and the shared
stylesheet. Open the Map, pick a room, type your numbers; the numbers follow
you into the next room.

## Run it

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Serving over HTTP matters: rooms `fetch()` their reference tables out of
`data/`, and `file://` blocks that.

## Layout

```
index.html          Map shell — room directory, tag filter, visited progress
rooms/              One HTML file per room
shared/             The spine everything depends on
  theme.css           navy-sapphire design tokens (colour + type)
  fonts.css           Fraunces + Space Grotesk
  money.js            integer cents, decimal rates, safe divide, Result type
  schema.js           THE household data model + field dictionary
  spine-v2.js         localStorage persistence, getProfile/updateProfile/…
  registry.js         which rooms exist, their tags and deep-link anchors
  reference.js        loader + pure lookups for data/
  demo-persona.js     the one demo household used by every "try an example"
engines/            Shared calculation engines — one function per concept
  tier0.js            the nine Tier 0 outputs
  foo.js              Financial Order of Operations ladder + flags
data/               Versioned reference tables (JSON, never inlined in code)
test/run.js         Re-derives every formula outside the browser
SPEC.md             The full Tier 0–2 build spec. The authority.
DECISIONS.md        Running log of what was decided and why.
CLAUDE.md           Working agreement for anyone (human or agent) editing this.
```

## Verify

```sh
node test/run.js
```

This re-derives every Tier 0 formula against the demo persona from
independently written expectations, checks the unit and null-vs-zero rules,
and confirms every deep-link anchor declared in `shared/registry.js` actually
exists in its room. It exits non-zero on failure.

## Rules that are easy to break

- **Empty is not zero.** Inputs ship blank with a format-only placeholder.
  `null` means "not entered"; `0` means the user typed zero.
- **No `|| 0` in a formula.** A missing input yields an incomplete output,
  not a wrong number.
- **Money is integer cents.** Format to dollars at display time only.
- **Reference data lives in `data/`.** Never inline a rate or a limit.

Read `SPEC.md` before adding a room. Read `CLAUDE.md` before changing shared
code.

## Not financial advice

Educational tooling. The tax rates, percentile bands, and contribution limits
in `data/` are approximations carrying explicit precision caveats — check
them against a primary source before relying on any output.
