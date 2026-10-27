// Every page script parses as a module (a syntax slip once left Profile on "Loading..."; node --check missed it).
// Importing one outside a browser stops at the first use of the page (document, window): that is fine; a SyntaxError
// is not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

for (const dir of ['ui', 'engine']) for (const f of readdirSync(new URL('../' + dir, import.meta.url)).filter((x) => x.endsWith('.js'))) {
  test(dir + '/' + f + ' parses', async () => {
    try { await import('../' + dir + '/' + f); } catch (err) { assert.ok(!(err instanceof SyntaxError), dir + '/' + f + ': ' + err.message); }
  });
}
