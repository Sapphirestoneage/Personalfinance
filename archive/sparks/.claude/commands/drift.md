---
description: Find fields and files that nothing reads, and say what to do about them
---
Run `node tools/context/build.js`, then read `docs/context/FIELDS.md`.

For every field listed under "no other room mentions it", sort it into one of:
- **really read**: something reads it through `shared/schema.js` or
  `shared/daite.js` (grep for its schema path), so the mention count is
  misleading;
- **dead end**: nothing outside its owner reads it;
- **unclear**: you cannot tell without opening more.

Also list the files in `rooms/` that `docs/context/ROOMS.md` says are not in
the registry.

Report as one short table (field, owner, verdict, one-line reason) and suggest
fixes. Do not make any change.
