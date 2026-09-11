---
description: Take one owner-approved item off the STATUS.md cut list and do the merge
---
Read `STATUS.md`. Take the top item on the cut list that the owner has
approved. If none is approved, propose one in two lines and wait for a yes.

Then:
1. `node tools/context/pack.js <id>` for every room involved. Read the cards
   and the latest decisions only.
2. Do the merge. Every moved field gets exactly one new owner in
   `shared/ownership.js`. Every old URL redirects to the new room; nothing
   404s. Deep-link hashes keep working.
3. Run `node test/run.js` and `node test/forms.js`.
4. Run `/wrap`.

Report screens and fields before and after, as two numbers each.
