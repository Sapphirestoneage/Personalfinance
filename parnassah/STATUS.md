# Parnassah STATUS (keep short)

Updated: 2026-09-26

## Where it stands
- **Built (PN-001 to PN-014)**: the selling layer (landing, coaching, about,
  resources, book) around eight tool pages, six engines, the store, the data,
  the charts, the tests. The example family (the Adlers) fills every tool.
- **Not live yet**: `data/site.json` carries `[edit:]` placeholders (bio,
  community, credentials, prices) and no booking link or email. The tests list
  them as pending.
- The reference bands in `data/` are dated 2026-09 at low confidence: starting
  points a family replaces, not quotes.

## Next
1. **Owner**: fill `data/site.json` (the placeholders, `contact.bookingUrl` or
   `contact.email`, a photo), then merge to main so Pages serves it.
2. Walk the tool pages on a phone with a real family's shape (not their
   numbers) and note what a box needs that the help does not say.
3. Ask the owner which communities to add or drop in `communities_2026.json`.
4. A printable one-page summary from the picture page.

## Known open
- Nothing failing. `node parnassah/test/run.js` is clean.
