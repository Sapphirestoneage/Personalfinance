import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { createRecord, createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { hourlyToMonthly } from '../../engine/parse.js';
import { checklist } from '../../engine/checklist.js';
import { loadData } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-12';

test('an hourly wage and paid hours give gross pay (MR-096): one formula, an inferred value the ledger names, a checklist line that counts', () => {
  const rec = createRecord(); setField(rec, 'sun', 'filingStatus', 'single', 'known', 'client');
  const job = createRow('income', 'w2', { nickname: 'Shop', f: freshFacts(data.fields, 'income', 'w2') }); addRow(rec, job, { session: null });
  setField(rec, job.id, 'hourlyRate', 2500, 'known', 'client'); setField(rec, job.id, 'hoursPaid', 30, 'known', 'client');
  const R = compute(rec, data, { today: TODAY });
  assert.equal(R.metrics.gross.status, 'ok'); assert.equal(R.metrics.gross.value.cents, hourlyToMonthly(2500, 30));
  assert.ok(R.metrics.takeHome.status === 'ok' && R.metrics.takeHome.value.cents < R.metrics.gross.value.cents, 'take-home follows from the worked-out gross');
  const e = (R.enriched.income || []).find(x => x.rowId === job.id && x.field === 'grossPay'); assert.ok(e && e.value.cents === hourlyToMonthly(2500, 30));
  const items = checklist(rec, R, data).sections.find(s => s.id === 'income').groups.find(g => g.id === 'w2').items;
  const gp = items.find(i => i.field === 'grossPay'); assert.equal(gp.status, 'in'); assert.ok(/Worked out/.test(gp.text));
  /* a typed gross pay wins over the wage */
  setField(rec, job.id, 'grossPay', 400000, 'known', 'client', { cad: 'month' });
  const R2 = compute(rec, data, { today: TODAY }); assert.equal(R2.metrics.gross.value.cents, 400000); assert.ok(!(R2.enriched.income || []).some(x => x.rowId === job.id && x.field === 'grossPay'));
  ['w2', 'c1099', 'side'].forEach(t => assert.ok(data.fields.planets.income.types[t].fields.includes('hourlyRate'), t));
});
