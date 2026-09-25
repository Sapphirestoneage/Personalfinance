# SLAM Profit Engine (Stress Less About Money)

Read this whole file before touching anything under `slam/`. It is the spec
for phases 0 and 1, condensed. The root `CLAUDE.md` is for the SPARKS app and
does not apply here except where this file says so. When this file and the
owner's messages conflict, the owner's latest message wins; update this file.

## What it is

A local-first, phone-first web app for professional dommes that shows how
every business decision flows to profit. The person users contact is
"Sapphire". No backend, no accounts, no analytics, no AI features, no
third-party requests in v1. Data stays on the device; the phone's lock is
the protection (no passphrase, no encryption layer). A one-tap quick-hide
screen exists.

## Stack (decided, do not reopen)

React 19 + TypeScript + Vite 8, installable offline PWA (`vite-plugin-pwa`).
Zustand for state. IndexedDB via Dexie. Zod schemas. Apache ECharts.
Tailwind 4 (mobile-first, light and dark). Vitest for the engine, Playwright
for flows. `vite-plugin-singlefile` is optional (`SINGLEFILE=1 npm run build`).

Commands (run from `slam/`): `npm run dev`, `npm test` (engine + golden),
`npm run build`, `npm run test:e2e` (needs a build), `npm run check` (all).

## Layout

- `src/engine/` pure functions, no UI, no storage. F01..F12, F23, F24 live in
  `formulas.ts`; one file per business model under `businesses/`;
  `aggregate.ts` (F23), `scenarios.ts` (F24), `sensitivity.ts` (F12),
  `reverse.ts` (F10), `leverage.ts` (F11), `reader.ts` (assumption reader).
- `src/data/` Zod schemas (`schemas.ts`), Dexie db (`db.ts`),
  export/import (`transfer.ts`), assumption helpers (`assumptions.ts`),
  Zustand store (`store.ts`).
- `src/content/` canonical demo profile, presets, samples, glossary,
  template copy. All copy non-explicit. Hormozi frameworks credited with a
  non-affiliation line; no book text reproduced.
- `src/features/` one folder per screen: today (check-in), numbers, clients,
  businesses (list, setup, tab, shared settings), hypotheticals, toolbox
  (ToolShell + `tools.ts`, the eight tools as data), demo (samples, backup,
  snapshot, presenter), quick-hide, shared (ui, Bars, NumberField, hooks).
- `src/app/` the hash router and the Layout (three-bar menu, Hide button).
- `src/content/fields.ts` every typed field with plain, domme and pro
  labels; `stages.ts` the nine pathway stages; `samples.ts` the three
  sample profiles, the fresh profile, and the benchmarks the diagnosis
  compares against.
- `src/engine/pathway.ts` (next step), `src/engine/diagnose.ts` (the
  bottleneck: biggest gain from bringing one sales step to typical;
  screening is never a candidate; capacity wins when the cap binds),
  `src/engine/reality.ts` (log funnel, check-ins vs model, milestones),
  `src/engine/explain.ts` (the math with her numbers, for Pro mode).
- `tests/golden/` G1..G21 (Vitest). `tests/unit/` engine, schema, storage,
  pathway, diagnosis and sample tests. `tests/e2e/` Playwright phone flows.

## App structure (phase 1)

Side menu (three-bar icon): Today (one "do this next" card, pathway
progress, 60-second check-in), My Numbers (combined dashboard), Clients
(inquiry log and CRM), My businesses (one tab per business in priority
order; inactive ones grayed out below with one-tap Add), Hypotheticals,
Toolbox.

Setup: tick every business she runs, drag into priority order (#1 = main
engine). Inactive businesses never enter any total. Priority decides
dashboard order, hour allocation, and what "do this next" focuses on. Warn
gently above 5 active businesses.

Business tabs, v1 builds four: Content, Calls, In-person, Findom and
regulars. v2: classes and events, space rental, teaching dommes, vanilla
crossover, custom. Each tab has its own inputs. Shared settings live once:
available hours, recovery days (never zero), fixed costs, income goal, tax
set-aside %.

Pathway stages: Setup, Diagnose, Offer, Presence, Conversations, Bookings,
Money per client, Plan, Strategy. Business #1 goes through every stage,
then #2 starts at Diagnose. Tools open in guided mode (one question per
screen, known values prefilled). In the Toolbox the same tools open
standalone with sandbox on; "Save to my business" makes results real;
finishing standalone checks off the matching pathway step.

Hypotheticals: Normal = her numbers. Dream = +30% inquiries/audience, +20%
conversion. Disaster = -40% inquiries/audience, -25% conversion. Editable
per business. Events: platform ban, house stops sending clients, top regular
leaves, a month off sick, processor holds funds 30 days, price war; dream
events: viral post, press feature, waitlist, regular upgrades to retainer.
Show all three side by side, each business's share, and runway in Disaster.

## Simplicity rules (acceptance criteria)

- First useful insight under 3 minutes; check-in under 90 seconds; every
  screen answers one question.
- Start from three numbers (contacts last month, bookings, price);
  everything else is a labeled estimate she can fix in one tap.
- Plain or Domme labels by default; business jargon only in Pro mode.
- No scores or levels until she has 4 check-ins of real data.
- Phone-first charts: big number plus simple bars, every chart has a text
  summary.

## Data model (Zod, `src/data/schemas.ts`)

Every stored number is an `Assumption`: `{ key, value, label, source,
updated }` where `value` is `number | null` (null = not entered, never 0)
and `label` is one of Book, Preset, Placeholder, Cohort, Yours. The engine
reads numbers only through Assumptions (via `engine/reader.ts`), and every
engine result carries `basedOn` (keys touched and the weakest label), so
every number on screen can say whether it is hers or an estimate.

Entities: Profile (settings = shared Assumptions, mode, pathway progress,
check-in count), Business (type, active, priority, inputs = Assumptions,
scenarioOverrides), Offer (per business: type, price, variable cost, all-in
hours, fee, recurring, months retained, take rate), Scenario (Dream, Normal,
Disaster: multipliers and events), Source (type, owned or rented, cost),
ClientRecord (alias, source, stage, key dates, screening RESULT only,
deposit status, offers bought, referred by, contact consent, next action,
lost reason, agreed budget for regulars, optional notes), Sale (optional
client link; anonymous allowed), WeekLog, Milestone.

Rules: computed values are never stored. Money is integer cents in storage;
rates are fractions (0.5 not 50). Schemas are `strict()`: unknown keys are
rejected, so a legal name or address field cannot sneak in. Changing a
stored shape needs a Dexie version bump and an upgrade function.

## Formulas (`src/engine/formulas.ts`, pure)

- F01 clients = inquiries x pass x booking x show (x close for consult offers)
- F02 gross profit per sale = price x (1 - fee) - variable cost
- F03 sessions = new clients x (1 + rebook), plus continuity sessions
- F04 capacity cap: sessions = min(demand, capacity sessions, sellable hours / all-in hours)
- F05 monthly profit = total gross profit - acquisition spend - fixed costs
- F06 lifetime gross profit = gross profit per month x months retained
- F07 cost to acquire = (acquisition spend + acquisition hours x hourly value) / new clients
- F08 LTGP:CAC ratio; payback days = CAC / (monthly GP per client / 30)
- F09 throughput per hour = (price - variable cost) / all-in hours
- F10 reverse solve: inquiries needed = ceil((goal + fixed + acquisition spend) / GP per inquiry), then capacity check
- F11 leverage score = added annual profit / (cash + hours x hourly value + learning cost) x 52 / (52 + weeks to money)
- F12 sensitivity: profit change from +1 point on each rate, +1% price, +1% inquiries, -1% cost
- F23 only active businesses enter any total; shared hours allocated in priority order
- F24 scenarios: multipliers and events per active business; runway = cash / monthly shortfall, shortfall = max(0, income goal - profit)

In-person offer model (pinned by G1, G7, G8): every new client has one
single session; clients who do not take the retainer rebook at the rebook
rate; retainer clients (take rate x new clients) get sessions per month x
months kept and no single rebook; the add-on is bought by take rate x new
clients with fee but no variable cost. When the main offer is a consult
offer (the arc), clients = funnel x close, sessions = clients x arc
sessions, no rebook, add-on or retainer. When capacity caps sessions, every
volume scales by cap / demand.

Scenario multipliers: "inquiries/audience" scales inquiries, followers,
calls and new tributes. "conversion" scales the sales conversion step only
(consult close, follower to subscriber, follower to tribute). It never
touches screening, booking or show rates, so screening is never a sales
lever, and G20 holds.

## Canonical sample assumptions (demo profile; every example uses these)

60 inquiries/mo; pass 50%, booking 40%, show 85%; consult close 40%; rebook
30%; session fees 5%; delivery cost $100/session; single session $500 for
90 min, 4 all-in hours; add-on $200 at 25%; retainer $1,500/mo for 2
sessions, 10% take, 4 months; Discipline Arc $3,000 for 4 sessions over 8
weeks, $400 delivery + 5% fees, 14 all-in hours; capacity 18 sessions/mo;
fixed costs $1,500/mo; subscription $15 (80% kept); custom $100 (80% kept);
digital product $150 ($140 kept); video call $200/30 min (90% kept);
regular finsub $500/mo (90% kept, 6 months). Source: `src/content/canonical.ts`.

## Golden tests (`tests/golden/`, write first)

G1 $4,972.50 GP, 13.26 sessions. G2 price $600: +$1,259.70. G3 rebook 60%:
+$1,147.50. G4 screening 60%: +$994.50. G5 double inquiries, cap 18:
+$1,777.50. G6 per 10 inquiries: $828.75, 2.21 sessions. G7 with add-on and
retainer: $1,723.38, 3.52 sessions. G8 $3,000 arc at 40% close: $1,666.
G9 reverse solve $6,000 with G7 offer: 44 inquiries, ~15.5 sessions.
G10 $93.75/hour. G11 +1 point booking: +$124.31. G12 events: 1.0 and 3.15
clients. G13 curve b=0.65: ~1,000 people from 1,000 posts. G14 +$1,890.
G15 stack: $8,090. G16 $1,500 GP, 6.67 clients, 93.3 hours. G17 $2,450,
4.08, 57.1. G18 value stack $3,225 > $3,000. G19 Normal $3,472.50.
G20 Dream $4,964.25, 17.24 sessions; Disaster $1,483.50. G21 only source
stops: profit is -$1,500.

## Non-negotiables

- Never store legal names, ID documents, photos, addresses, or screening
  documents. Screening keeps a result only.
- Screening is never shortened or treated as a sales step. Hard limits are
  never suggested. Recovery days can't be zero. Volume advice never exceeds
  capacity.
- Findom features include agreed budgets and a check-in prompt when a
  regular exceeds theirs.
- No legal, tax, or investment advice; point to a professional.
- Every number on screen shows whether it's hers or an estimate.
- Exports are plain files and remind her to store them privately. File
  names and titles never reveal the kind of work (`numbers-backup-DATE.json`).
- Empty is not zero: `null` = not entered. No silent `|| 0`. A missing
  input yields an incomplete result naming what is missing.
- One formula, one function. Parameterize; never copy a calculation.
- Nothing in the app, its manifest, its file names or its DB name says what
  kind of work this is.

## Phases

Phase 0 (done): project setup, Zod schemas, Dexie storage with
export/import, Assumption and label system loaded with the canonical
assumptions, formulas F01-F12, F23, F24, golden tests G1-G21 passing.

Phase 1 (done): side menu, business selection and ranking, the four v1
business tabs, Hypotheticals, Quick Diagnosis, demo mode (3 sample
profiles, presenter view, reset), My Numbers dashboard, weekly check-in
with the two-tap contact log, snapshot file for Sapphire. The phone flows
in `tests/e2e/flows.spec.ts` prove: a first-time user reaches her
bottleneck from three numbers in under 5 minutes, data survives reload,
export then import restores exactly, quick-hide, zero requests leave the
device, and the app opens offline.

How the screens use the engine: a first-time user starts on a fresh
profile (nothing ticked, every number a labeled preset). Today shows the
next pathway step; guided tools write her answers live (label Yours);
Toolbox tools open in a sandbox and write only on "Save to my business".
Either way finishing a tool checks off that stage for that business.
Store writes are optimistic (screen first, row second). A check-in counts
once per week, when she presses Save; "+1 contact" alone does not.

Polish passes after phase 1 (done): field tiers (core first, detail
folded; Pro shows all and spells out the math, `engine/explain.ts`);
sources of contacts, owned or rented, feeding the ban and house events;
the value equation and value stack in the Offer tool, the 3 : 1
worth-to-cost rule, daily reach in Conversations, contacts-needed in the
diagnosis, reach actions in the check-in; the reality loop
(`engine/reality.ts`: rates from the client log, check-ins vs the model,
milestones); editable event sizes; charts loaded on demand; a CSS bar
list for levers; an install hint; a sample banner. Content levers are
measured on next month's gross profit (`leverBasisCents`) so churn and
conversion carry their real value while this month's number stays what
she typed.

Next (not started): v2 business types, guided-mode copy per label mode,
and the owner's answers to `docs/OPEN-QUESTIONS.md`.

Open questions and the working assumptions behind them are in
`docs/OPEN-QUESTIONS.md`. Answer them there; do not reopen decided items.

## Glossary (one meaning per term)

- **Inquiry**: one new person who made contact this month. Also "contact".
- **Pass rate**: share of inquiries whose screening result is a pass. Never a sales lever.
- **Booking rate**: share of passed inquiries who book.
- **Show rate**: share of bookings who turn up.
- **Close rate**: share of consultations that buy a consult offer (the arc).
- **New client**: an inquiry who passed, booked and showed (F01).
- **Session**: one delivered in-person appointment. Retainer and arc sessions count.
- **Rebook rate**: extra single sessions per new client over their life (0.3 = 30%).
- **Continuity sessions**: sessions from retainers, on top of singles.
- **Offer**: one thing she sells: single, add-on, retainer, arc, subscription, custom, PPV, digital product, call, tribute.
- **Take rate**: share of new clients who buy an optional offer.
- **Fee**: platform or processor cut, a fraction of price.
- **Variable cost**: cash cost of delivering one sale (delivery cost).
- **Gross profit (GP)**: price x (1 - fee) - variable cost, summed.
- **Fixed costs**: monthly costs that do not move with volume.
- **Acquisition spend / hours**: money and time spent finding clients.
- **Monthly profit**: GP - acquisition spend - fixed costs (F05).
- **Capacity**: the most sessions a month allows (sessions cap or sellable hours / all-in hours).
- **All-in hours**: total hours one sale costs her, including prep, travel, recovery, admin.
- **Sellable hours**: available hours per week x 52 / 12.
- **Recovery days**: days per week with no client work; at least 1.
- **Throughput**: GP per all-in hour (F09).
- **LTGP**: lifetime gross profit of one client (F06).
- **CAC**: cost to acquire one client (F07).
- **Payback days**: days until a client's GP covers their CAC (F08).
- **Leverage score**: added annual profit per unit of cost, discounted by weeks to money (F11).
- **Sensitivity**: profit change per small move in one input (F12).
- **Scenario**: Normal, Dream or Disaster: a multiplier set plus events.
- **Event**: a switchable shock applied to a business inside a scenario.
- **Runway**: months cash lasts at the current shortfall (F24).
- **Shortfall**: income goal minus monthly profit when positive.
- **Assumption**: one stored number with a label saying where it came from.
- **Label**: Book (a credited framework's typical figure), Preset (SLAM default), Placeholder (obviously provisional), Cohort (from Sapphire's cohort), Yours (she typed it).
- **Active business**: ticked in Setup; only active businesses enter totals.
- **Priority**: rank of an active business; #1 is the main engine.
- **Pathway**: the guided sequence of stages, one business at a time.
- **Sandbox**: a tool run whose results are not saved unless she chooses "Save to my business".
- **Check-in**: the weekly 60-second log of real numbers.
- **Regular**: a recurring findom client with an agreed budget.
- **Agreed budget**: the monthly ceiling a regular set; exceeding it prompts a check-in.
- **Quick-hide**: the one-tap neutral screen.
- **Snapshot**: the plain export file she can send to Sapphire.
