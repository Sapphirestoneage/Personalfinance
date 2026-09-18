/* ==========================================================================
   tests/e2e/harness.js — a static server, a browser, and a way to say
   "this step passed" without pulling in a test framework.
   --------------------------------------------------------------------------
   The repo has no build step and no runtime dependencies (README, "No
   dependencies"). Playwright is the one exception already made for
   test/forms.js: a local dev tool, resolved from wherever it happens to be
   installed rather than from a package.json in the project root.

   What this file gives the suites:

     resolvePlaywright()    playwright, or null with a clear reason
     serve(root)            a plain static server on a free port
     Run(name)              a tiny recorder: step(), ok(), fail(), report()
     shot(page, slug)       a screenshot into tests/e2e/screenshots/

   Nothing here knows anything about SPARKS. The flow lives in the suites.
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'screenshots');

/* ---- Playwright, wherever it lives -------------------------------------- */

const CANDIDATES = [
  '/opt/node22/lib/node_modules',
  '/usr/lib/node_modules',
  '/usr/local/lib/node_modules',
  path.join(ROOT, 'node_modules')
];

function resolvePlaywright() {
  try { return { pw: require('playwright'), from: 'require path' }; } catch (e) { /* keep looking */ }
  for (const dir of CANDIDATES) {
    const p = path.join(dir, 'playwright');
    try {
      if (fs.existsSync(p)) return { pw: require(p), from: p };
    } catch (e) { /* keep looking */ }
  }
  return {
    pw: null,
    from: null,
    why: 'playwright not found. Install it (npm i -g playwright) or set NODE_PATH to a folder that has it. Looked in: ' + CANDIDATES.join(', ')
  };
}

/* ---- A static server, so fetch() and localStorage behave like the web ---- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon'
};

function serve(root) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(root)) { res.writeHead(403); res.end('no'); return; }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found: ' + rel); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ base: 'http://127.0.0.1:' + port, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

/* ---- The recorder -------------------------------------------------------- */

function Run(name) {
  const steps = [];
  let current = null;
  return {
    name,
    step(title) {
      current = { title, status: 'pending', notes: [], shots: [] };
      steps.push(current);
      return current;
    },
    note(text) { if (current) current.notes.push(String(text)); },
    ok(text) { if (current) { current.status = 'pass'; if (text) current.notes.push(String(text)); } },
    fail(text) { if (current) { current.status = 'fail'; current.notes.push(String(text)); } },
    shot(slug) { if (current) current.shots.push(slug); },
    steps() { return steps; },
    report() {
      const pass = steps.filter((s) => s.status === 'pass').length;
      const fail = steps.filter((s) => s.status === 'fail').length;
      return { name, total: steps.length, pass, fail, steps };
    }
  };
}

/* ---- Screenshots --------------------------------------------------------- */

let shotSeq = 0;
function resetShots() {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) {
    if (f.endsWith('.png')) fs.unlinkSync(path.join(SHOTS, f));
  }
  shotSeq = 0;
}

async function shot(page, slug) {
  shotSeq += 1;
  const name = String(shotSeq).padStart(2, '0') + '-' + slug + '.png';
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
  return name;
}

/* ---- Small helpers the suites keep wanting ------------------------------- */

/** Text of the whole page, whitespace-squashed, for "does it say X" checks. */
async function bodyText(page) {
  return (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ').trim();
}

/** Wait until the page has booted its SLAF scripts (or give up). */
async function slafReady(page, ms) {
  try {
    await page.waitForFunction(() => window.SLAF && window.SLAF.Spine, null, { timeout: ms || 8000 });
    return true;
  } catch (e) { return false; }
}

/** Everything this browser has stored for the app — the "saved data" check. */
async function storedKeys(page) {
  return page.evaluate(() => {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i += 1) out.push(localStorage.key(i)); } catch (e) { /* fine */ }
    return out.filter((k) => /^slaf\./.test(k));
  });
}

module.exports = { ROOT, SHOTS, resolvePlaywright, serve, Run, shot, resetShots, bodyText, slafReady, storedKeys };
