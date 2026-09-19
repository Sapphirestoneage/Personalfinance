---
description: Load one room's context and plan the change
argument-hint: <room-id>
---
Run `node tools/context/pack.js $ARGUMENTS` and read its output. Open only the
files it lists; nothing else.

Say in two lines: what the room owns, what it reads from other owners, and the
plan for the change asked for.

If the plan would add a screen, a field, a room, a lens or a framework, stop
and ask what it replaces before building anything (the freeze in CLAUDE.md).
