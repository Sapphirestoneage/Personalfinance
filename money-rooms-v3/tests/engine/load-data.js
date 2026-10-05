/* Node-side data loader for the engine tests: the same files the browser fetches. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, '..', '..', 'data');
export function loadData() {
  const out = {};
  fs.readdirSync(DATA).filter(f => f.endsWith('.json')).forEach(f => {
    const key = f.replace(/\.json$/, '').replace(/-(\d+)$/, '$1').replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    out[key] = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
  });
  return out;
}
export function loadHousehold(name) {
  return JSON.parse(fs.readFileSync(path.join(here, '..', 'households', name + '.json'), 'utf8')).record;
}
export function loadExpected(name) {
  return JSON.parse(fs.readFileSync(path.join(here, '..', 'households', name + '-expected.json'), 'utf8'));
}
