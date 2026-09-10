#!/usr/bin/env node
/* ==========================================================================
   tests/tools/build-exports.js - the migration corpus, rebuilt from git.
   --------------------------------------------------------------------------
   Lane 2, section 5 (DECISIONS.md L-5). For every commit that touched the
   spine or the schema, this checks that version's shared/ out of git,
   builds a handful of the section 1 households THROUGH THAT VERSION'S
   Schema.createHousehold, exports them with that version's
   Spine.exportJSON (or, before the export existed, the stored blob), and
   keeps the result only when the household's SHAPE (the set of key
   paths) differs from the last one kept. So fixtures/exports/ holds one
   set of files per format the app has ever produced, named by commit
   date and short hash, plus the pre-spine flat profile the legacy
   migration reads.

   The shape signature ignores values and ids: it is the sorted list of
   key paths, arrays collapsed to [] with their first element's keys.
   fixtures/exports/README.md lists every format kept and the paths that
   appeared or vanished between one and the next.

   Run:  node tests/tools/build-exports.js
   Needs git and the repo history; writes nothing outside fixtures/exports/
   and a scratch directory under tests/.cache/ (git-ignored).
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'fixtures', 'exports');
const CACHE = path.join(ROOT, 'tests', '.cache', 'exports');
const B = require('./build-households.js');

/* The households exported under every format: enough to cover income,
   two adults, property, a pension, unemployment, forty debts and a
   maxed-out saver, without thirty files per format. */
const PICK = ['grad-broke', 'dink-highearn', 'house-hacker', 'near-retiree', 'between-jobs', 'max-savers', 'forty-debts'];
const SPECS = B.ARCHETYPES.concat(B.EDGES).filter((s) => PICK.indexOf(s.id) >= 0);

function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
function commits() {
  return git(['log', '--format=%H|%h|%ad|%s', '--date=short', '--reverse', '--', 'shared/schema.js', 'shared/spine-v2.js', 'shared/money.js'])
    .trim().split('\n').filter(Boolean).map((l) => { const [full, short, date, ...rest] = l.split('|'); return { full, short, date, subject: rest.join('|') }; });
}
function checkout(c) {
  const dir = path.join(CACHE, c.short);
  if (fs.existsSync(path.join(dir, 'shared', 'spine-v2.js'))) return dir;
  fs.mkdirSync(dir, { recursive: true });
  const tar = execFileSync('git', ['archive', c.full, 'shared', 'data'], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar });
  return dir;
}

/* Runs in a child process so each version's modules load fresh. */
const CHILD = `
'use strict';
const dir = process.argv[1], repo = process.argv[2];
const B = require(repo + '/tests/tools/build-households.js');
const Money = require(dir + '/shared/money.js');
const Schema = require(dir + '/shared/schema.js');
const Spine = require(dir + '/shared/spine-v2.js');
const out = { api: { exportJSON: typeof Spine.exportJSON === 'function', importJSON: typeof Spine.importJSON === 'function', setFat: typeof Spine.setFat === 'function', setMonthlyExpenses: typeof Spine.setMonthlyExpenses === 'function', schemaVersion: Schema.SCHEMA_VERSION }, exports: [] };
const specs = JSON.parse(process.argv[3]);
specs.forEach(function (spec) {
  const rec = { id: spec.id, known: spec.__known };
  try {
    const h = B.build(spec, Schema);
    /* A month, in the shape this version knows: the four buckets if it has
       them, else the one estimated figure the older shape carried. */
    const fat = spec.fat;
    if (fat) {
      const total = Math.round((fat.food + fat.accommodation + fat.transportation + fat.wants) * 100);
      h.expenses = h.expenses || {};
      if (!h.expenses.needs) h.expenses.monthlyEssential = Object.assign({}, h.expenses.monthlyEssential || {}, { estimatedValueCents: total });
    }
    Spine.reset();
    const patch = {};
    Object.keys(h).forEach(function (k) { if (k !== 'schemaVersion') patch[k] = h[k]; });
    try { Spine.updateProfile(patch); } catch (e) {
      Spine.updateProfile({ people: h.people, filingStatus: h.filingStatus, state: h.state, assets: h.assets, debts: h.debts, expenses: h.expenses });
      rec.patchFallback = e.message;
    }
    if (fat && !h.expenses.needs && typeof Spine.setMonthlyExpenses === 'function') {
      try { Spine.setMonthlyExpenses(Math.round((fat.food + fat.accommodation + fat.transportation + fat.wants) * 100)); } catch (e) { rec.setMonthlyExpensesFailed = e.message; }
    }
    if (typeof Spine.exportJSON === 'function') { rec.text = Spine.exportJSON(); rec.via = 'exportJSON'; }
    else { rec.text = JSON.stringify(Spine.getProfile(), null, 2); rec.via = 'storedBlob'; }
  } catch (e) { rec.error = (e && e.stack || String(e)).split('\\n').slice(0, 3).join(' | '); }
  out.exports.push(rec);
});
process.stdout.write(JSON.stringify(out));
`;

function signature(obj) {
  const paths = new Set();
  (function walk(v, trail) {
    if (Array.isArray(v)) { paths.add(trail + '[]'); if (v.length && v[0] && typeof v[0] === 'object') walk(v[0], trail + '[]'); return; }
    if (!v || typeof v !== 'object') return;
    Object.keys(v).forEach((k) => {
      if (/^(id|personId|ownerIds|createdAt|updatedAt|exportedAt|blockId|assetId|mortgageId)$/.test(k)) return;
      const t = trail ? trail + '.' + k : k;
      paths.add(t);
      walk(v[k], t);
    });
  })(obj, '');
  return Array.from(paths).sort();
}
function household(parsed) { return parsed && parsed.format ? parsed.household : parsed; }

/* ---- Main -------------------------------------------------------------------- */
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
const list = commits();
const kept = [];
let prevSig = null;
const specsForChild = SPECS.map((s) => Object.assign({}, s, { __known: B.known(s) }));
list.forEach((c, i) => {
  const dir = checkout(c);
  let result;
  try {
    const stdout = execFileSync('node', ['-e', CHILD, dir, ROOT, JSON.stringify(specsForChild)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    result = JSON.parse(stdout);
  } catch (e) {
    console.log('skip ' + c.short + ' ' + c.date + ': this version could not run in node (' + String(e.stderr || e.message).split('\n')[0].slice(0, 120) + ')');
    return;
  }
  const good = result.exports.filter((r) => r.text);
  if (!good.length) { console.log('skip ' + c.short + ' ' + c.date + ': no export produced (' + (result.exports[0] && result.exports[0].error) + ')'); return; }
  const sample = household(JSON.parse(good[0].text));
  const sig = signature(sample);
  const isLast = i === list.length - 1;
  const changed = !prevSig || sig.join('\n') !== prevSig.join('\n');
  if (!changed && !isLast) return;
  const added = prevSig ? sig.filter((p) => prevSig.indexOf(p) === -1) : sig;
  const removed = prevSig ? prevSig.filter((p) => sig.indexOf(p) === -1) : [];
  /* Every household for a format that removed or renamed a path, changed
     how it exports, or sits at either end of the history; one sample
     household (dink-highearn) for a format that only added paths. */
  const viaChanged = kept.length && kept[kept.length - 1].via !== good[0].via;
  const full = !prevSig || isLast || removed.length > 0 || viaChanged;
  const format = { commit: c.short, full: c.full, date: c.date, subject: c.subject, via: good[0].via, api: result.api, added, removed, files: [], sample: !full };
  good.filter((r) => full || r.id === 'dink-highearn').forEach((r) => {
    const name = c.date + '-' + c.short + '-' + r.id + '.json';
    const parsed = JSON.parse(r.text);
    /* An exportJSON file is kept as it came, plus the lane2 note beside it.
       A stored blob (before the export existed) is the bare household the
       app kept in localStorage, which the import path also accepts. */
    const wrapped = Object.assign({}, parsed, {
      lane2: { section: 5, commit: c.short, date: c.date, subject: c.subject, via: r.via, specId: r.id, known: r.known, patchFallback: r.patchFallback || null }
    });
    fs.writeFileSync(path.join(OUT, name), JSON.stringify(wrapped, null, 2) + '\n');
    format.files.push(name);
  });
  const errs = result.exports.filter((r) => r.error);
  if (errs.length) format.errors = errs.map((r) => r.id + ': ' + r.error);
  kept.push(format);
  prevSig = sig;
  console.log('kept ' + c.short + ' ' + c.date + ' (' + format.via + ', +' + added.length + ' -' + removed.length + ' paths): ' + c.subject.slice(0, 70));
});

/* The pre-spine flat profile: the shape Spine._migrateLegacy() reads from
   the old localStorage key. Never had an export; written by hand here. */
const legacy = { annualSalary: 62000, hoursPerWeek: 40, studentLoanBalance: 22000, studentLoanRate: 5.3, visitedRooms: ['real-hourly-wage', 'student-loan'] };
fs.writeFileSync(path.join(OUT, '2026-09-02-pre-spine-flat-profile.json'), JSON.stringify(Object.assign({}, legacy, {
  lane2: { section: 5, commit: null, date: '2026-09-02', subject: 'The flat profile the pre-spine tools kept under slaf.profile (no schemaVersion); Spine._migrateLegacy reads it', via: 'legacyStorage', specId: 'grad-frugal-like', known: { grossAnnualCents: 6200000, studentLoanBalanceCents: 2200000, studentLoanRate: 0.053 } }
}), null, 2) + '\n');
kept.unshift({ commit: null, date: '2026-09-02', subject: 'pre-spine flat profile (legacy localStorage shape)', via: 'legacyStorage', added: ['annualSalary', 'hoursPerWeek', 'studentLoanBalance', 'studentLoanRate', 'visitedRooms'], removed: [], files: ['2026-09-02-pre-spine-flat-profile.json'] });

/* Drop files from earlier runs that no format claims any more. */
const claimed = new Set([].concat.apply([], kept.map((k) => k.files)));
fs.readdirSync(OUT).filter((f) => f.endsWith('.json') && !claimed.has(f)).forEach((f) => fs.unlinkSync(path.join(OUT, f)));

/* The index. */
const L = ['# Export formats', '', 'Generated by `node tests/tools/build-exports.js` (lane 2, section 5, L-5). One block per shape the app has produced, oldest first, with the key paths that appeared or vanished since the block before. Each file is a real export from that commit (or, before `Spine.exportJSON` existed, the stored household blob) of one section 1 household, wrapped with a `lane2` note carrying the household\'s hand-computed `known` values. `tests/migration.test.js` imports every file through the current app.', ''];
kept.forEach((k) => {
  L.push('## ' + k.date + (k.commit ? ' `' + k.commit + '`' : '') + ' ' + k.subject);
  L.push('');
  L.push('Via `' + k.via + '`' + (k.sample ? ' (paths were only added, so one sample household)' : '') + '. Files: ' + k.files.map((f) => '`' + f + '`').join(', '));
  if (k.added.length) { L.push(''); L.push('Paths added (' + k.added.length + '): ' + k.added.slice(0, 60).map((p) => '`' + p + '`').join(', ') + (k.added.length > 60 ? ' and ' + (k.added.length - 60) + ' more' : '')); }
  if (k.removed.length) { L.push(''); L.push('Paths removed (' + k.removed.length + '): ' + k.removed.map((p) => '`' + p + '`').join(', ')); }
  if (k.errors) { L.push(''); L.push('Households that could not be built at this commit: ' + k.errors.join('; ')); }
  L.push('');
});
fs.writeFileSync(path.join(OUT, 'README.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generatedFrom: list.length + ' commits touching shared/schema.js, shared/spine-v2.js or shared/money.js', formats: kept.map((k) => ({ commit: k.commit, date: k.date, subject: k.subject, via: k.via, sample: !!k.sample, files: k.files, added: k.added.length, removed: k.removed.length })) }, null, 2) + '\n');
console.log(kept.length + ' formats kept out of ' + list.length + ' commits; ' + claimed.size + ' files under fixtures/exports/');
