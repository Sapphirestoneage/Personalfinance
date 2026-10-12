# House Lights — Broadway ticket playbook & show logbook

A single static page: `index.html`. No build step, no server, no account.
Open it in a browser (or serve the repo with `python3 -m http.server`) and
everything you log stays in that browser's `localStorage`. The Stats tab
exports a JSON backup, a CSV, and an Excel bulk-entry template, and imports
all three back.

It is a standalone app that shares this repository the way `dnd/` does: it
does not use the SPARKS household model or the shared spine, and the SPARKS
test suite does not scan it. The root `DECISIONS.md` declares the lane in
D-342; the app's own log is `house-lights/DECISIONS.md` (`HL-###`).

## Put it on your phone

It is an installable web app. Open the published page once, then:

- **iPhone / iPad (Safari):** tap Share, then **Add to Home Screen**. A
  banner in the app says the same thing the first time you open it.
- **Android (Chrome):** tap **Install** in the banner, or the browser's
  "Install app" menu item.

After that it has its own icon, opens full-screen without browser chrome,
and works with no signal: `sw.js` caches the page, icons and the two CDN
scripts, and `manifest.webmanifest` declares the name, colours and icons.
Three home-screen shortcuts jump straight to Log a show, the cup shelf and
Results.

Two things to know. The installed app has **its own storage**, separate
from the browser tab you installed it from, so install first and log
second, or move shows across with Export / Import on the Stats tab. And on
iOS a home-screen app is exempt from Safari's seven-day storage sweep,
which is one more reason to install rather than bookmark.

## On a phone

Below 640px the layout changes shape: the hero shrinks, the seven tabs
become a fixed bottom bar with icons where a thumb can reach them, every
input is 16px so iOS does not zoom on focus, and chips, stars and buttons
grow to a comfortable tap size. An empty logbook offers **See it with an
example season** — eight made-up entries, each tagged EXAMPLE, one tap to
clear — so Stats, Merch and Results can be explored before any real show
is logged.

## Tabs

| Tab | What it does |
|---|---|
| **Guide** | 65 ways to get a Broadway ticket — lotteries, rush, TKTS, memberships, credit-card presales, papering services, ushering — with effort, reliability, price and notes. Filter by category, sort by price or effort. |
| **Logbook** | Log a show. One tap on a current show fills the theatre, category and type; Quick-add logs it instantly. Details: price × tickets, face value (for savings), rating, who you went with, vibes, seat, standout performers, who recommended it, **souvenirs you took home**, merch spend, up to three compressed photos. Future dates go to an Upcoming countdown. |
| **Shows** | A database of every Broadway production since 2006 plus what is running now. Tap once = seen; +1 for a repeat; ☆ to wishlist, ranked by priority. |
| **Theatres** | All 41 Broadway houses and the notable Off-Broadway ones as a checklist, auto-ticked when you log a show there. 📜 opens twenty years of history for that house. |
| **Merch** | The cup shelf (every souvenir cup you own, by show and house), everything else you've collected, an add-a-souvenir form for things bought without a show, and the **cup field guide**: all 41 houses with their operator, whether you've confirmed they sell cups, what you paid, and notes. |
| **Stats** | Spend, savings, ratings, buddies, recommenders, seats, performers, genre donut, timeline, and a SLAF-mode annual budget + show goal with pace tracking. |
| **Results** | The shareable stuff: your theatregoer type card with the 41-house emoji grid, badges, Wrapped for the year, Broadway Bingo, a this-or-that ranker that builds your top ten, and your season laid out as a programme. Cards save as PNG; share text copies to the clipboard. |

## Data

Everything lives in `localStorage` under `house-lights-*` keys, one per
concern (`logbook`, `theatres`, `wishlist`, `budget`, `goal`, `badges`,
`elo`, `merch`, `cups`, `bingo`). Prices are dollars as typed, `null` when
not entered. A logbook entry looks like:

```json
{
  "id": "s1710...", "show": "Hadestown", "date": "2026-03-14",
  "price": 47.5, "qty": 2, "face": 120, "theatre": "Walter Kerr Theatre",
  "method": "Broadway Direct Lottery", "type": "Broadway", "rating": 5,
  "company": "Friend", "withWho": ["Ari"], "recBy": "Zaidy",
  "vibes": ["Electric", "Cried"], "cats": ["Musical", "Original"],
  "actors": ["Reeve Carney"], "seatParts": {"level": "Orchestra", "side": "Center", "depth": "Middle", "num": "C104"},
  "seat": "Orchestra Middle Center C104", "notes": "Won on the 3rd try",
  "photos": ["data:image/jpeg;base64,..."],
  "souvenirs": ["Playbill", "Souvenir cup"], "merchSpend": 43, "cupPrice": 18
}
```

The show archive (`HIST` in the script) is `[title, house code, year closed]`
and was compiled from memory of the 2006–2026 seasons; corrections welcome.
Operators per house (`OPERATORS`) drive the cup guide's grouping. Whether a
given house sells cups, and for how much, is *your* field data: the guide
starts unreported and fills in as you log cups or tap the status yourself.

## Verifying a change

Serve the repo, open `house-lights/index.html` on a phone-sized viewport,
and tap through: log a show with a souvenir cup, confirm it appears on the
Merch shelf and marks its house in the cup guide, then reload and confirm it
persisted. Watch the console for errors. `node house-lights/tests/smoke.js`
does that path headlessly on an iPhone profile (nine steps; skips with exit 0
when Playwright or Chromium is absent).
