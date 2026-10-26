// Writes docs/FORMULAS.md from the one formula registry (engine/math.js): every metric's formula, its definition in
// plain words, and the layers it reads. Run: node tools/formulas-doc.mjs (test/p25-b-formulas.test.js checks the file
// is up to date).
import { writeFileSync } from 'node:fs';
import { METRICS, READS } from '../engine/math.js';

const UNIT_WORDS = { usd: 'dollars', 'usd/month': 'dollars a month', 'usd/year': 'dollars a year', months: 'months', years: 'years', ratio: 'a share (percent)', age: 'an age', count: 'a count' };
export function formulasDoc() {
  const lines = [
    '# Formulas',
    '',
    'Every metric the app shows, from the one registry (`engine/math.js`). Show the math, the One-pager and every screen',
    'read the same entry. Written by `node tools/formulas-doc.mjs`; do not edit by hand. The hand-checked tests are in',
    '`test/p25-b-formulas.test.js` (the Phase 2.5 definitions) and the golden tests (`test/demo.golden.test.js` and others).',
    '',
    'Families of metrics built per item (one card, one account, one Plan step, one DRAFTT letter) follow the same',
    'pattern and are listed in the registry under `cardUtil:`, `maxit:`, `plan:` and the rest.',
    '',
    '| Metric | Formula | In plain words | Reads | Unit |',
    '| --- | --- | --- | --- | --- |'
  ];
  for (const m of METRICS) lines.push('| ' + [m.label + ' (`' + m.id + '`)', m.formula, m.plain || '', (READS[m.id] || []).join(', '), UNIT_WORDS[m.unit] || m.unit].map((x) => String(x).replace(/\|/g, '/')).join(' | ') + ' |');
  lines.push('', 'DRAFTT (`plan:draftt:<letter>`): DRAFTT share = the letter\'s amount a month / take-home (Retirement / gross). Shares only, no bands. Reads Numbers and House defaults (the housing reference).', '');
  return lines.join('\n');
}
if (process.argv[1] && process.argv[1].endsWith('formulas-doc.mjs')) writeFileSync(new URL('../docs/FORMULAS.md', import.meta.url), formulasDoc());
