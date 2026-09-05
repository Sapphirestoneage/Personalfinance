# LATER.md — things that would be better, not built this pass

The one-pager brief (D-094 onward) says: do not add rooms or features
outside it; if something would be substantially better, write it here.
This is that list. Nothing on it is scheduled. Each line says what it is,
why it is not now, and where the work already is, if anywhere.

## Parked from T8 (the FI-losophy rooms, D-093 draft)

The T8 foundations were built and green (11,698 checks) before the brief
arrived and are set aside in a git stash on the working branch, labelled
"T8 foundations: display unit, engines, data, skeleton rooms (D-093
draft) — set aside for the one-pager". Popping it will conflict with
`shared/money.js` (`formatAsTime` now lives in the tree), `schema.js`,
`ownership.js`, `spine-v2.js`, `theme.css` and `registry.js`; take the
tree's side and re-apply the T8 additions on top.

- **Enough** — a monthly "enough" number and the ETA to it as a seventh
  dashboard instrument. Overlaps the FI number; the brief's dashboard has
  four blocks and no seventh instrument.
- **Designed Week** — the week as 168 hour-blocks, what each costs and
  buys. Time-denominated display belongs to the lens now (`hours`);
  the week as a room is out of scope.
- **Time Buckets** — money by decade of life, ideas per bucket.
- **Dreamline** — dated dreams costed against the savings rate.
- **Reversibility** — a decision's undo cost. The command log gives the
  literal version; the room was about life decisions.
- **Unlearning** — a catalogue of money rules to drop. The brief's
  "next thing to learn / unlearn" block on the dashboard is the small
  version; the catalogue (`data/unlearning.json` in the stash) could feed
  it later.
- **Display unit as a household setting** (`meta.displayUnit`, every
  formatter honouring it). The brief's lens is per session and per page,
  which is simpler; a stored preference can come back if people ask.

## Noticed while building the core

- **Undo across tabs.** The log is per browser and the cache is per tab;
  two tabs open on the same household can each undo their own writes and
  clobber the other's. A `storage` event listener that reloads the cache
  would fix it. Not now: the brief's flow is one page at a time.
- **Undo labels for list edits.** "assets.2 and 3 more" is what an
  unlabelled write to a list looks like when no owned field moved. Every
  room write of consequence moves an owned field, so it rarely shows;
  the fix is a label on each `upsert*` call.
- **The lens on a phone.** Four buttons top right beside two undo
  buttons is a lot of chrome at 390px. The room template step will
  decide where the toggle sits; the undo pair may collapse to one menu.
- **`rooms.json`.** The brief wants the registry as JSON. It stays a JS
  module so the map draws synchronously; a build-free export of the
  same rows to JSON is a ten-line script if a consumer outside the
  browser ever needs it.
- **Student Loan Decision, Money Calendar & Pay-Later.** Named in the
  brief as rooms to read first; they are ideas in `SPEC.md` /
  `ROADMAP.md`, not rooms. If they are wanted they are tranche work.
