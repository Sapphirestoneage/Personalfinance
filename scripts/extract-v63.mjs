#!/usr/bin/env node
/* scripts/extract-v63.mjs — port the DATA of FI-Skill-Tree-v6.3, not the file.
   D-131. Reads the 356KB standalone tree and emits data/skill_tree.json,
   data/skill_links.json and data/exercises.json in the shapes below, each
   stamped with version / asOf / source / confidence.

   THE FILE IS NOT IN THIS REPO. This script looks for it at the root, in
   docs/, and at $SKILL_TREE_V63; until it is there it exits 2 and prints
   the shape it will write. The mapping from the file's internals to these
   shapes has to be written against the real file, so the extraction body
   is a stub that throws once the file is found. Everything downstream
   (engines/skilltree.js, the rooms, the tests) is built against the shape,
   not the file, and runs today on data/skill_tree.json's seed from the
   house catalogue (scripts/seed-skill-tree.mjs).

   Shapes written:
     data/skill_tree.json   { id, version, asOf, source, confidence, confidenceNote, note,
                              bands: [{ id, label, order }],
                              trees: [{ id, label, lever }],
                              skills: [{ id, name, tree, band, minutes, prereqs: [skillId],
                                         gate: { foo: n } | null,
                                         requires: [{ kind: 'household', field, gte }],
                                         appliesWhen: [{ field: 'situation', op: 'in', value: [] }],
                                         unlocks: [{ room } | { number }],
                                         proof, boostedBy: [eventId], stackerId | null }],
                              warps: [{ id, label, proof: { kind, field, gte | equals }, bypasses: [skillId] }] }
     data/skill_links.json  { …stamp, links: [{ from, to, kind: 'skill' | 'foo', note }],
                              fooRequires: { step: [skillId] }, fooUnlocks: { step: [skillId] } }
     data/exercises.json    { …stamp, exercises: [{ id, kind: micro|quest|dare|canon|run, title,
                              origin: { work, author, note } | null, minutes, cost, advances: [skillId],
                              room, requires: [fieldId], appliesWhen: [], proof, writes, band, compute }] }
   Expected counts from v6.3: 625 skills, ~280 links, 125 micro actions. */
import fs from 'node:fs';
import path from 'node:path';

const candidates = [
  process.env.SKILL_TREE_V63,
  path.resolve('FI-Skill-Tree-v6.3.html'),
  path.resolve('docs/FI-Skill-Tree-v6.3.html')
].filter(Boolean);
const found = candidates.find((p) => fs.existsSync(p));
if (!found) {
  console.error('FI-Skill-Tree-v6.3.html not found. Looked at:\n  ' + candidates.join('\n  '));
  console.error('Drop the file at the repo root (or set SKILL_TREE_V63) and run again.');
  console.error('Until then data/skill_tree.json holds the seed from scripts/seed-skill-tree.mjs.');
  process.exit(2);
}
const html = fs.readFileSync(found, 'utf8');
console.log('Found ' + found + ' (' + html.length + ' bytes).');
/* The extraction body must be written against the file's real internals:
   find how the 625 skills, the links and the micro actions are held, map
   each to the shapes above, verify the counts, then write the three files. */
throw new Error('extract-v63: the mapping from the file’s internals is not written yet. Open the file, find how the skills are held, and write it here.');
