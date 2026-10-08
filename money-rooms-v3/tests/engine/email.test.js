import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followUpEmail } from '../../engine/email.js';
import { session } from '../../engine/leverage.js';
import { theirPlate, myPlate, sinceLastSession } from '../../engine/plates.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData();

test('the follow-up email groups their plate by institution, says where to find each number, and carries no balance', () => {
  const rec = loadHousehold('jordan');
  const s = session({ record: rec, fields: data.fields, weights: data.weights });
  const text = followUpEmail(rec, data.fields, s.theirPlate, { nextDate: 'on the 20th' });
  assert.ok(text.startsWith('Subject: '));
  assert.ok(text.indexOf('Hi Jordan,') !== -1);
  assert.ok(text.indexOf('Where:') !== -1);
  const body = text.split('\n').slice(4).join('\n');
  assert.ok(!/\$\d/.test(body), 'no dollar figure in the body');
  assert.ok(text.indexOf('Brightline Health') !== -1, 'grouped under an institution');
  assert.ok(text.indexOf(String.fromCharCode(0x2014)) === -1);
});

test('plates: client facts are theirs, lookups and estimates are mine, superseded rough totals drop out', () => {
  const leah = loadHousehold('leah');
  const theirs = theirPlate(leah, data.fields), mine = myPlate(leah, data.fields);
  assert.ok(theirs.every(i => i.source === 'client'));
  assert.ok(mine.every(i => i.source !== 'client' || i.note));
  assert.ok(!theirs.some(i => i.field === 'summaryTotal'), 'the rough total is superseded by lines');
  assert.ok(mine.some(i => i.note), 'an unfiled quick note is on my plate');
});

test('since last time collapses the journal after the last snapshot into one line per fact', () => {
  const leah = loadHousehold('leah');
  const r = sinceLastSession(leah, data.fields, () => '');
  assert.ok(r.since);
  const sapphire = r.changes.find(c => c.rowId === 'm-csp' && c.field === 'balance');
  assert.ok(sapphire && sapphire.old === 98000 && sapphire.new === 64000, JSON.stringify(sapphire));
  assert.equal(r.changes.filter(c => c.rowId === 'm-csp' && c.field === 'balance').length, 1);
});
