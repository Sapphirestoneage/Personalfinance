/* scripts/extract-v63.mjs — turn FI-Skill-Tree-v6.3.x into the two data files
   this app reads. Written against the real source (D-139); before that it was
   a stub that documented the target shape and exited, because guessing at a
   file nobody had would have been fiction.

   Usage:  node scripts/extract-v63.mjs <path-to-FISkillTree.html>

   The source is a single HTML page whose <script> declares plain data
   literals. We do not run the page — it wants a canvas and a DOM. We find
   each `const NAME=` and balance brackets from there, so a string containing
   a brace cannot fool the scan.

   What the source holds, and what it becomes:
     DATA   25 trees x 25 skills, each [name, what, does, fits, check, tier]
     BANDS  the five bands, in order
     LINKS  [fromTree, fromLevel, toTree, toLevel], all zero-indexed
   Levels 1-25 land on the five bands five at a time, which is exactly what
   the source's own FOUNDATION..ENDGAME legend describes. Within a tree each
   level lists the one before it as its prerequisite: the source is written
   as a ladder and says so in its own copy ("Builds on L1", "After L3").
*/
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/extract-v63.mjs <path-to-FISkillTree.html>');
  process.exit(2);
}
const html = fs.readFileSync(src, 'utf8');

/** Balanced-bracket read of `const NAME= <literal>`, string-aware. */
function literal(name) {
  /* Declarations continue with a comma — `const DATA=[...],LINKS=[...]` — so
     anchor on a boundary rather than the `const` keyword. */
  const m = new RegExp('(?:^|[\\s,;])' + name + '\\s*=').exec(html);
  if (!m) throw new Error('no `' + name + '=` in ' + path.basename(src));
  const i = m.index;
  let j = html.indexOf('=', i) + 1;
  while (/\s/.test(html[j])) j++;
  const open = html[j];
  if (open !== '[' && open !== '{') throw new Error(name + ' is not an array or object literal');
  const close = open === '[' ? ']' : '}';
  let depth = 0, k = j, inStr = null, esc = false;
  for (; k < html.length; k++) {
    const c = html[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) { k++; break; } }
  }
  return JSON.parse(JSON.stringify(eval('(' + html.slice(j, k) + ')')));
}

const DATA = literal('DATA');
const BANDS = literal('BANDS');
const LINKS = literal('LINKS');

const slug = (s) => s.toLowerCase().normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-').slice(0, 54);

/* A tree's label carries an emoji and sometimes a colon; the id is the words. */
const treeId = (name) => slug(name.replace(/^[^A-Za-z]+/, '').replace(/[:(].*$/, ''));

const bands = BANDS.map((b, i) => ({
  id: b[0].toLowerCase(), label: b[0][0] + b[0].slice(1).toLowerCase(), order: i + 1
}));
const bandFor = (level) => bands[Math.min(bands.length - 1, Math.floor(level / 5))].id;

const trees = [];
const skills = [];
const idAt = [];              /* idAt[tree][level] — what LINKS points at */
const taken = new Set();

DATA.forEach((t, ti) => {
  const tid = treeId(t.name);
  trees.push({ id: tid, label: t.name.trim(), order: ti + 1, source: 'v6.3.1' });
  idAt[ti] = [];
  let prev = null;
  (t.skills || []).forEach((row, li) => {
    const [name, what, does, fits, check, tier] = row;
    let sid = tid + '-' + slug(name), n = 2;
    while (taken.has(sid)) sid = tid + '-' + slug(name) + '-' + (n++);
    taken.add(sid);
    idAt[ti][li] = sid;
    skills.push({
      id: sid, name, tree: tid, band: bandFor(li), level: li + 1, tier,
      what, does, fits, proof: check,
      prereqs: prev ? [prev] : [],
      gate: null, requires: [], appliesWhen: [], unlocks: [], boostedBy: [], stackerId: null
    });
    prev = sid;
  });
});

/* `unlocks` is NOT "the next skill". It is the chip row on a card: the room
   or the household number this skill improves, which is what the engine's
   chips() turns into links. Skill-to-skill order is already said twice and
   correctly — up a tree by `prereqs`, across trees by the lanes below — and
   writing it into `unlocks` as well put a chip reading "#" with no label and
   no destination on all 625 curriculum cards. The curriculum carries no
   room or number mapping, so its `unlocks` stay empty and its cards show no
   chip row, which is the truth. */

/* A cross-link is a shortcut lane: finishing `from` opens `to` in another
   tree without walking that tree's ladder up to it. Both ends are resolved
   to ids here so nothing downstream has to know about index pairs. */
const links = [];
let dropped = 0;
LINKS.forEach(([ft, fl, tt, tl]) => {
  const from = idAt[ft] && idAt[ft][fl];
  const to = idAt[tt] && idAt[tt][tl];
  if (!from || !to) { dropped++; return; }
  links.push({
    from, to, kind: 'skill',
    note: trees[ft].label.replace(/^[^A-Za-z]+/, '') + ' → ' + trees[tt].label.replace(/^[^A-Za-z]+/, '')
  });
});

const stamp = new Date().toISOString().slice(0, 10);
const head = (id, source) => ({
  id, version: '3.0.0', asOf: stamp, source,
  confidence: 'convention',
  confidenceNote: 'A curriculum, not a measurement. The tiers are the author’s ranking of leverage, not a claim about any particular life.'
});

/* This app has forty skills of its own — entering your facts, closing a
   month, freezing a snapshot — which a general FI curriculum has no reason
   to contain, and which the exercises, the FOO links and the Stacker all
   point at by id. They live beside this script rather than in data/ because
   data/ is for tables a room loads at runtime and no room loads this one —
   it is an input to the build, not an output of it, which is also why
   re-running this extractor can never destroy them. Merged in here. */
const app = JSON.parse(fs.readFileSync('scripts/skill_tree_app.json', 'utf8'));
/* Marked apart from the curriculum's, because the two are shaped
   differently and the tests need to know which is which: a curriculum tree
   is a 25-rung ladder, each rung standing on the one below it, while the
   app's own skills were authored as a graph — "close a month" does not
   stand on "enter the facts" in a straight line. */
/* Renumbered to continue after the curriculum's twenty-five rather than
   restarting at 1 — the board sorts its rows by `order`, and two trees
   claiming the same number put this app's six in the middle of them. */
const appTrees = (app.trees || []).filter((t) => !trees.some((x) => x.id === t.id))
  .map((t, i) => ({ ...t, order: trees.length + i + 1, source: 'app' }));
const appSkills = (app.skills || []).filter((s) => !taken.has(s.id));
/* The app's skills predate the level field. Number them within their own
   tree so every node on the board knows which rung it is, and so the
   capstone check can tell a real last rung from a node someone forgot. */
const appCount = {};
appSkills.forEach((s) => { appCount[s.tree] = (appCount[s.tree] || 0) + 1; s.level = appCount[s.tree]; });
/* The app's skills keep the room/number unlocks they were written with —
   the chips on their cards are real links, and the curriculum's are not
   there to be faked. */

fs.writeFileSync('data/skill_tree.json', JSON.stringify({
  ...head('skill_tree', 'FI Skill Tree v6.3.1 — 25 trees, 25 levels each — extracted by scripts/extract-v63.mjs, plus this app’s own skills from scripts/skill_tree_app.json. Each level carries what it is, what it does for you, where it fits, and the check that levels it.'),
  note: 'Levels 1-25 land on the five bands five at a time, which is what the source’s own FOUNDATION..ENDGAME legend describes. Within a tree, each level lists the one before it as its prerequisite. The trees after the curriculum’s twenty-five are this app’s own.',
  bands,
  trees: trees.concat(appTrees),
  skills: skills.concat(appSkills),
  warps: app.warps || []
}, null, 2) + '\n');

const existing = JSON.parse(fs.readFileSync('data/skill_links.json', 'utf8'));
fs.writeFileSync('data/skill_links.json', JSON.stringify({
  ...head('skill_links', 'FI Skill Tree v6.3.1 cross-links — the shortcut lanes between trees, extracted by scripts/extract-v63.mjs.'),
  note: 'A lane means finishing `from` opens `to` in another tree without walking that tree’s ladder up to it. The FOO mappings below are this app’s own and are not in the source.',
  links,
  fooRequires: existing.fooRequires || {},
  fooUnlocks: existing.fooUnlocks || {}
}, null, 2) + '\n');

console.log('trees   ', trees.length, '+', appTrees.length, 'app =', trees.length + appTrees.length);
console.log('skills  ', skills.length, '+', appSkills.length, 'app =', skills.length + appSkills.length);
console.log('lanes   ', links.length, dropped ? '(' + dropped + ' dropped: endpoint out of range)' : '');
console.log('bands   ', bands.map((b) => b.id).join(', '));
