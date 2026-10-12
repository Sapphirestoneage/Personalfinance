# House Lights — decisions

The app's own log, `HL-###`, the way `money-rooms-v3/DECISIONS.md` carries
`MR-###`. The root `DECISIONS.md` has one entry, D-342, declaring this
directory a separate lane; everything about the app itself lives here.
Newest last.

## HL-001 — A standalone app in `house-lights/`, rebuilt from a half-arrived paste

**Why.** The owner built a Broadway ticket playbook and show logbook elsewhere
and asked to keep it in this repo. The pasted source was cut off mid-script.

**Decision.** `house-lights/index.html` is a standalone static app, a lane
beside SPARKS like `dnd/`. It does not read the household model or load the
shared spine, and the SPARKS suite does not scan it. The missing half (show
archive, logbook form and list, stats, results, tabs, start-up) was rebuilt
from the calls and element ids the surviving half already made. The archive
is 375 productions: current ones parsed from the theatre list, the rest a
`[title, house, year closed]` table compiled from memory of 2006–2026; a
wrong year is a data fix.

**Departures from SPARKS rules, deliberately.** Money is dollars as typed,
not integer cents, because that is what the existing half stored and
exported; a migration would break every backup the owner has. Empty is still
not zero: a price never entered is `null`, shown as "no price", excluded from
averages. The form is `LIVE-FORM: built once`.

**Stored shape.** `localStorage` keys `house-lights-*`, one per concern. See
README "Data". No SPARKS key is touched.

## HL-002 — Souvenirs and cups: on the entry, in a shelf, and a field guide that starts empty

**Decision.** An entry carries `souvenirs[]`, `merchSpend` and `cupPrice`;
standalone items (a gift, a cup from a friend) live in a separate `merch`
store so they never invent a show visit. The Merch tab reads both.

Which theatres sell cups is **field data, not reference data**. The guide
ships knowing only each house's operator (Shubert, Nederlander, ATG, Disney,
Roundabout, MTC, LCT, Second Stage, Circle in the Square), starts every house
unreported, and marks a house confirmed when the owner logs a cup from a show
there or taps the status. Bar policy and prices change with every production;
a hard-coded table would be wrong within a season.

**The shareable layer.** A theatregoer type computed from the log, badges that
announce themselves once (silently on first load), a 41-house emoji grid in
the Wordle idiom, a Wrapped card, Broadway Bingo with self-ticking squares, a
this-or-that Elo ranker, and the season as a programme. The masthead says
HOUSE LIGHTS, not Playbill.

## HL-003 — Installable on a phone: manifest, worker, one honest banner

**Decision.** `manifest.webmanifest` with relative `start_url` and `scope` so
it survives the `/Personalfinance/` subpath. Icons rasterised from `icon.svg`
at 512, 192 and 180 (Apple's touch icon ignores the manifest). `sw.js` is
network-first for the page so a deploy lands on the next open, cache-first
for icons, the two CDN scripts and the font stylesheet, `allSettled` on
install so an unreachable CDN cannot block the worker; `VERSION` bumped by
hand, old caches swept on activate. Safe-area padding on the hero and page.

Android gets a real Install button only when Chrome offers one
(`beforeinstallprompt`); iOS gets the Share → Add to Home Screen wording.
An installed app shows no banner; dismissal is remembered.

**Known.** An installed app on iOS has its own storage, separate from the
Safari tab it came from; Export / Import bridges it. A home-screen app is
exempt from Safari's seven-day sweep, which a bookmark is not.

## HL-004 — The phone is the primary screen

**Why.** The owner uses it on a phone and asked for a usability audit.

**Decision.** Below 640px: compact hero; the seven tabs become a fixed
bottom bar with icons, 54px, safe-area padded, `role=tablist` with
`aria-selected` in sync; inputs 16px so iOS does not zoom on focus; chips
37px, stars 32px, full-width primary button; bare entries get an "Add date,
price & rating" button and a saved entry scrolls into view and flashes; the
cup guide shows its notes field only once a house is confirmed. An empty
logbook offers "See it with an example season": eight placeholder entries
tagged EXAMPLE, loaded only on that tap, one tap to clear; houses they mark
carry the value `'demo'` so clearing removes exactly those. The Start-here
panel orders THEATR first to build a wish list, then lotteries, TKTS, box
office; its ☆ chips write to the wishlist.

**Lesson.** The phone CSS block must sit at the end of the stylesheet; placed
earlier, same-specificity base rules silently won. The audit caught it only
because it measured computed sizes.

**Verified.** `node house-lights/tests/smoke.js` (iPhone profile, nine steps)
and the Pixel-profile audit: nav fixed to the viewport bottom, tabs 54px,
hero 102px, inputs 16px, chips 37px, stars 32px; offline reload with a logged
show intact. No page errors. Root `node test/run.js` untouched and green.
