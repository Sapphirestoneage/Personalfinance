#!/usr/bin/env node
/* ==========================================================================
   tools/context/watch.js — the hourly repo check, as one command.
   --------------------------------------------------------------------------
   Several Claude sessions push to main at once. This runs every check that
   catches the ways that goes wrong, and prints a report short enough for a
   session to read in one breath:

     ALL CLEAR — one line, nothing to say
     PROBLEM   — one line per thing broken, each naming its own fix

   Reads only. It never commits, never pushes, never edits a file.

   Run:  node tools/context/watch.js            (the last 75 minutes)
         node tools/context/watch.js --since=6h (a wider window)
         node tools/context/watch.js --no-tests (skip the unit suite)
   ========================================================================== */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const REPO = 'Sapphirestoneage/Personalfinance';

const argv = process.argv.slice(2);
const flag = (name, dflt) => { const m = argv.map(a => new RegExp('^--' + name + '=(.+)$').exec(a)).find(Boolean); return m ? m[1] : dflt; };
const SINCE = flag('since', '75 minutes ago');
const RUN_TESTS = argv.indexOf('--no-tests') < 0;

const problems = [];
const notes = [];
function sh(cmd, opts) {
  try { return execSync(cmd, Object.assign({ cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 }, opts || {})).trim(); }
  catch (e) { return { failed: true, out: String((e.stdout || '') + (e.stderr || '')).trim(), code: e.status }; }
}
const ok = (r) => typeof r === 'string';

/* ---- 1. What landed on main ------------------------------------------- */
sh('git fetch origin main --quiet');
const commits = sh(`git log --oneline --since="${SINCE}" origin/main`);
const commitLines = ok(commits) && commits ? commits.split('\n') : [];

/* ---- 2. CI on main ----------------------------------------------------- */
let ci = 'unknown';
const runsRaw = sh(`curl -sS -m 25 "https://api.github.com/repos/${REPO}/actions/workflows/test.yml/runs?branch=main&per_page=5"`);
if (ok(runsRaw)) {
  try {
    const runs = JSON.parse(runsRaw).workflow_runs || [];
    const done = runs.filter(r => r.status === 'completed');
    const latest = done[0];
    const pending = runs.filter(r => r.status !== 'completed').length;
    if (!latest) ci = 'no completed run yet';
    else if (latest.conclusion === 'success') ci = 'green' + (pending ? ` (${pending} still running)` : '');
    else {
      ci = latest.conclusion;
      /* Name the step that failed, so the report says where to look. */
      let step = 'unknown step';
      const jobsRaw = sh(`curl -sS -m 25 "https://api.github.com/repos/${REPO}/actions/runs/${latest.id}/jobs"`);
      if (ok(jobsRaw)) {
        try {
          const j = (JSON.parse(jobsRaw).jobs || [])[0];
          const bad = (j && j.steps || []).find(s => s.conclusion === 'failure');
          if (bad) step = bad.name;
        } catch (e) { /* keep 'unknown step' */ }
      }
      problems.push(`CI on main is ${latest.conclusion}: the "${step}" step failed on ${latest.head_sha.slice(0, 7)} (${(latest.head_commit && latest.head_commit.message || '').split('\n')[0].slice(0, 70)}). Open ${latest.html_url} and fix that step.`);
    }
  } catch (e) { ci = 'could not read the CI status'; }
} else ci = 'could not reach GitHub';

/* ---- 3. Checks against origin/main's content --------------------------- */
/* Read files out of origin/main rather than checking it out: the working
   tree stays exactly as the session found it. */
function fromMain(file) { const r = sh(`git show origin/main:${file}`); return ok(r) ? r : null; }
function listMain(dir, suffix) {
  const r = sh(`git ls-tree --name-only origin/main ${dir}`);
  return ok(r) ? r.split('\n').filter(f => f.endsWith(suffix)) : [];
}

/* Every engine needs a property file, or the Lane 2 step fails. */
const engines = listMain('engines/', '.js').map(f => path.basename(f, '.js'));
const props = listMain('tests/properties/', '.test.js').map(f => path.basename(f, '.test.js'));
const orphanEngines = engines.filter(e => props.indexOf(e) < 0);
if (orphanEngines.length) problems.push(`${orphanEngines.length} engine(s) have no property test file: ${orphanEngines.join(', ')}. Lane 2 fails in CI until each gets tests/properties/<name>.test.js.`);

/* A decision number used twice is two sessions reaching for the same one. */
const decisions = fromMain('DECISIONS.md');
if (decisions) {
  const seen = {}, dupes = [];
  decisions.split('\n').forEach(l => { const m = /^## (DD?-\d{3})\b/.exec(l); if (m) { if (seen[m[1]]) { if (dupes.indexOf(m[1]) < 0) dupes.push(m[1]); } seen[m[1]] = true; } });
  if (dupes.length) problems.push(`Decision number(s) used twice in DECISIONS.md: ${dupes.join(', ')}. Two sessions took the same number; renumber the later one.`);
}

/* The generated context files, stale? Only meaningful on a clean tree. */
const dirty = sh('git status --porcelain');
if (ok(dirty) && !dirty) {
  const check = sh('node tools/context/build.js --check');
  if (!ok(check)) problems.push('The context index files are out of date. Run: node tools/context/build.js');
} else notes.push('context freshness not checked (the working tree has uncommitted changes)');

/* ---- 4. Branches carrying work not yet on main ------------------------- */
const heads = sh("git ls-remote --heads origin 'refs/heads/claude/*'");
const stale = [];
if (ok(heads) && heads) {
  heads.split('\n').forEach(line => {
    const ref = line.split('\t')[1];
    if (!ref) return;
    const name = ref.replace('refs/heads/', '');
    sh(`git fetch origin ${name} --quiet`);
    const ahead = sh(`git rev-list --count origin/main..FETCH_HEAD`);
    if (!ok(ahead) || ahead === '0') return;
    const when = sh('git log -1 --format=%cI FETCH_HEAD');
    const days = ok(when) ? (Date.now() - new Date(when).getTime()) / 86400000 : 0;
    if (days > 1) stale.push(`${name}: ${ahead} commit(s) not on main, last touched ${Math.floor(days)} day(s) ago`);
  });
}

/* ---- 5. The unit suite, only when something landed --------------------- */
let tests = 'not run (nothing new landed)';
if (RUN_TESTS && commitLines.length) {
  const r = sh('node test/run.js 2>&1 | tail -3');
  if (ok(r)) {
    const line = r.split('\n').filter(Boolean).pop() || '';
    tests = line.replace(/^[^\w]*/, '');
    if (/✗|failed/i.test(line)) problems.push(`The unit suite fails on main: ${line.trim()}. Run node test/run.js to see which check.`);
  } else {
    tests = 'the unit suite could not run';
    problems.push('The unit suite could not run on main. Run node test/run.js and read the error.');
  }
}

/* ---- The report -------------------------------------------------------- */
const out = [];
if (!problems.length) {
  out.push(`ALL CLEAR: ${commitLines.length} commit(s) on main in the window, CI ${ci}, ${engines.length} engines all covered, no duplicate decision numbers.`);
} else {
  out.push(`PROBLEMS: ${problems.length}`);
  problems.forEach((p, i) => out.push(`${i + 1}. ${p}`));
}
if (commitLines.length) {
  out.push('', 'Landed on main:');
  commitLines.slice(0, 12).forEach(l => out.push('  ' + l.slice(0, 100)));
  if (commitLines.length > 12) out.push(`  … and ${commitLines.length - 12} more`);
}
if (stale.length) { out.push('', 'Branches unmerged for over a day:'); stale.forEach(s => out.push('  ' + s)); }
if (tests !== 'not run (nothing new landed)') out.push('', 'Unit suite: ' + tests);
if (notes.length) out.push('', 'Notes: ' + notes.join('; '));
console.log(out.join('\n'));
process.exitCode = 0;
