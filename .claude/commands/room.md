---
description: Load one room's context and plan the change
argument-hint: <room-id>
---
Run `node tools/context/pack.js $ARGUMENTS` and read its output. Open only the
files it lists; nothing else.

Say in two lines: what the room owns, what it reads from other owners, and the
plan for the change asked for.

If the plan adds a room, put it on docs/room-map.json too if it absorbs one;
otherwise just build it (D-268: no gate on growth).
