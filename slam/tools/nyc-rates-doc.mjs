// Writes docs/NYC_RATES_TO_CHECK.md from data/rules-2026.json: every New York City bracket by filing status and the
// Yonkers surcharge exactly as the engine reads them, with their source, for the owner to check in one glance.
// node tools/nyc-rates-doc.mjs   (test/nyc-tax.test.js fails when the doc is stale)
import { readFileSync, writeFileSync } from 'node:fs';
export function nycRatesDoc() {
  const d = JSON.parse(readFileSync(new URL('../data/rules-2026.json', import.meta.url), 'utf8'));
  const rules = Array.isArray(d) ? d : d.rules;
  const get = (id) => rules.find((r) => r.id === id);
  const money = (x) => '$' + x.toLocaleString('en-US');
  const pct = (x) => (Math.round(x * 100000) / 1000).toFixed(3) + '%';
  const L = ['# New York City and Yonkers rates to check', '',
    'Every New York City bracket and the Yonkers surcharge, exactly as the tax engine uses them (from `data/rules-2026.json`).',
    'Check each line against the New York State IT-201 instructions (the New York City tax rate schedules and the Yonkers worksheet).',
    'All of them stay marked **verify** until you confirm them. To fix one, change its value in `data/rules-2026.json` and run `node tools/nyc-rates-doc.mjs`.', '',
    'How the engine uses them: the city tax is figured on New York State taxable income (federal AGI less the New York standard deduction; no New York adjustments are modeled), bracket by bracket. The Yonkers surcharge is a share of the New York State tax (credits are not modeled). Both are full-year resident rules.', ''];
  for (const [id, words] of [['NYC_BRK_S', 'Single'], ['NYC_BRK_J', 'Married filing jointly (and qualifying surviving spouse)'], ['NYC_BRK_MFS', 'Married filing separately'], ['NYC_BRK_H', 'Head of household']]) {
    const r = get(id);
    L.push('## ' + words + ' (`' + id + '`, ' + r.verified + ')', '', '| Taxable income | Rate |', '|---|---|');
    let lo = 0;
    for (const [top, rate] of r.value) { L.push('| ' + (top === null ? 'Over ' + money(lo) : money(lo) + ' to ' + money(top)) + ' | ' + pct(rate) + ' |'); lo = top; }
    L.push('', 'Source: ' + r.source, '');
  }
  const y = get('YONKERS_SURCHARGE');
  L.push('## Yonkers resident surcharge (`YONKERS_SURCHARGE`, ' + y.verified + ')', '', '**' + pct(y.value) + '** of the net New York State tax.', '', 'Source: ' + y.source, '');
  L.push('Checked by: ________   Date: ________   Changes: ____________________', '');
  return L.join('\n');
}
if (import.meta.url === 'file://' + process.argv[1]) writeFileSync(new URL('../docs/NYC_RATES_TO_CHECK.md', import.meta.url), nycRatesDoc());
