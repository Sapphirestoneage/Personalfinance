# RELEASE.md — before anything is tagged or shared (D-210, G3.17)

The test suite runs on every push and gates the Pages publish (D-204).
It runs in a headless Chromium with touch emulation, which is not a phone.
jsdom and emulation do not behave like either keyboard. So before a
release is tagged, or the app is shown to anyone new, one person taps
through the four things below on **a real Android phone** and **a real
iPhone**, in the browser each one ships with.

Use invented numbers only. The repo is public and so is the Pages site.

## The four walks

1. **The First Round** (`rooms/first-round.html`). Five screens, one
   answer each. The keyboard opens on every box on the first tap, stays
   open between boxes, and the insight card shows without a list of
   missing fields.
2. **One door** (`rooms/ledger.html`, then any door). Open a level, tap a
   suggestion chip, type over a value, mark one row "Not sure yet". The
   understanding line moves; nothing typed disappears.
3. **Express** (`rooms/express.html`). Type into three boxes in a row,
   add a debt with a name and last four, change the situation. Rows hide
   and show without clearing anything; the keyboard never closes on its own.
4. **An import** (`rooms/data.html`). Load a backup file made on the other
   phone. The counts sentence reads right, Undo brings the old one back,
   and the household matches the source to the cent.

## What to watch for on each

- The soft keyboard closes and does not come back after a tap (D-034).
  This is the bug the suite exists for and the one emulation hides.
- A box that shows `0` where nothing was typed (Empty is not zero).
- A number that reads differently on the two phones.
- The error panel ("Something went wrong. Your data is safe.") appearing
  at all. If it does, tap Copy bug report and paste it into the issue.
- Safari: after a week without a visit, the household must still be there
  (installed to the home screen, or the persist prompt was accepted).

## Then

- `node tools/stamp-build.js`, commit, push to `main`, confirm the build
  stamp in every room's footer matches `version.json`.
- Note the two phones (model and OS version) in the commit message.
