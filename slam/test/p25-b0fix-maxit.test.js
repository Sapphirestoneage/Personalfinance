// Phase 2.5, Batch 0 fixes: answers 43, 47, 49 and 63 in "How much to max it?". Made-up demo household only.
//   43: a year with nothing recorded names the account to record it on (the panel shows its record form).
//   47: an HSA through payroll: the paid-in-from row, the Sankey and the cash check all follow the one switch.
//   49: the employer-part line in client words.
//   63: only pay still to come can be matched, so unmatched 401(k) money never goes ahead of the IRA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { editFact, setThroughPayroll } from '../engine/edits.js';
import { summarize } from '../engine/summary.js';
import { moneyFlow } from '../engine/flow.js';
import { maxIt, maxItSim, maxItCash, payrollSaving } from '../engine/maxit.js';
import { readJson, loadRules, SLAM } from './spine-helpers.js';

const R = loadRules();
const T = '2026-10-23';
const F = (value, kind = 'known') => ({ value, kind, asOf: '2026-10-01', source: 'test (made up)' });
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const at = (s, asOf) => ({ ...s, meta: { ...s.meta, asOf } });
const w2 = (id, pid, amt) => ({ id, type: 'w2', label: id, personId: pid, amount: F(amt), cadence: 'monthly', start: '2024-01-01', end: null, withholding: { federal: F(0), state: F(0) } });
const acct = (id, type, family, extra = {}) => ({ id, type, family, name: F(id), balance: F(1000), contributions: F([{ year: 2026, amount: 0 }]), ...extra });
const hsa = (extra = {}) => ({ id: 'h', type: 'hsa', family: 'hsaFsa', name: F('Health savings'), balance: F(1000), coverageLevel: F('self'), monthlyContribution: F(200), ...extra });
const flowOf = (s) => { const sp = applyDefaults(s, R); const f = moneyFlow(sp, R, summarize(sp, R, { flags: false }).cashflow); return f.links.filter((l) => l.to === 'save:h' || l.to === 'save:sim').map((l) => l.from + '>' + l.to + ' ' + l.amount); };

test('answer 63: the 401(k) up to the match is only what the paychecks left can be matched on', () => {
  const base = demo();
  const s = (asOf) => at({ ...base, debts: [], income: [w2('job', 'casey', 500)], accounts: [...base.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth').map((a) => (a.id === 'hysa' ? { ...a, balance: F(80000) } : a)), acct('k', 'k401', 'employerRetirement', { matchRate: F(0.5), matchCap: F(0.06) }), acct('r', 'roth_ira', 'ira')] }, asOf);
  const fills = (x) => { const mx = maxIt(x, R, { sim: maxItSim(x, R) }); return mx.pools.filter((p) => !p.spill && p.year === 2026).map((p) => [p.key, p.fill]); };
  // February 1: 11 paychecks of $500 left, 6% of $5,500 is $330 that the match reaches; the Roth takes the rest.
  assert.deepEqual(fills(s('2026-02-01')), [['deferral:casey', 330], ['ira:casey', 5670]]);
  // October 22: 2 paychecks left, so $60, never $360 of unmatched 401(k) money ahead of the IRA.
  assert.deepEqual(fills(s('2026-10-22')), [['deferral:casey', 60], ['ira:casey', 5940]]);
});

test('answer 47: an HSA from take-home or through payroll, the same on the paid-in-from row and the Sankey', () => {
  const d = demo();
  const off = applyDefaults({ ...d, accounts: [...d.accounts, hsa()] }, R);
  assert.equal(off.accounts.find((a) => a.id === 'h').fundedFrom.value, 'chk', 'from take-home: the main checking account (a guess)');
  assert.deepEqual(flowOf(off), ['acct:chk>save:h 200']);
  const on = applyDefaults(setThroughPayroll(off, 'h', true, T), R);
  assert.deepEqual([on.accounts.find((a) => a.id === 'h').throughPayroll.value, on.accounts.find((a) => a.id === 'h').fundedFrom.value], [true, 'paycheck']);
  assert.deepEqual(flowOf(on), ['in:salary>save:h 200']);
  const back = applyDefaults(setThroughPayroll(on, 'h', false, T), R);
  assert.equal(back.accounts.find((a) => a.id === 'h').fundedFrom.value, 'chk', 'switched off: the guess comes back');
  // Picking "from my paycheck" on the row turns the switch on, and the other way.
  const picked = editFact(off, 'accounts.h.fundedFrom', 'set', { value: 'paycheck', today: T });
  assert.equal(picked.accounts.find((a) => a.id === 'h').throughPayroll.value, true);
  assert.equal(editFact(picked, 'accounts.h.fundedFrom', 'set', { value: 'chk', today: T }).accounts.find((a) => a.id === 'h').throughPayroll.value, false);
  // An old house guess of "paycheck" on an HSA from take-home is guessed again.
  const old = applyDefaults({ ...d, accounts: [...d.accounts, hsa({ fundedFrom: { value: 'paycheck', kind: 'rough', asOf: T, source: 'mainChecking' } })] }, R);
  assert.equal(old.accounts.find((a) => a.id === 'h').fundedFrom.value, 'chk');
  // A SIMPLE IRA comes from pay (answer 50), so the Sankey draws it from pay.
  assert.deepEqual(flowOf({ ...d, accounts: [...d.accounts, { id: 'sim', type: 'simple_ira', family: 'ira', name: F('SIMPLE'), balance: F(1000), monthlyContribution: F(300) }] }), ['in:salary>save:sim 300']);
});

test('answer 47: through payroll, the cash check counts the HSA net of the tax it saves', () => {
  const d = demo();
  const off = applyDefaults({ ...d, accounts: [...d.accounts, hsa({ monthlyContribution: F(0) })] }, R);
  const on = applyDefaults(setThroughPayroll(off, 'h', true, T), R);
  const ps = payrollSaving(on, R, 2026);
  assert.ok(ps && ps.rate > 0.0765 && ps.rate < 0.6, JSON.stringify(ps));
  const cashOf = (s) => { const sim = maxItSim(s, R); const mx = maxIt(s, R, { sim }); return maxItCash(s, R, mx, { sim, rows: mx.rows.filter((r) => r.id === 'h:2026') }); };
  const a = cashOf(off), b = cashOf(on);
  assert.ok(a.total > 0);
  assert.ok(Math.abs(b.total - Math.round(a.total * (1 - ps.rate) * 100) / 100) <= 0.05, b.total + ' is the take-home cost less the tax saved');
  assert.match(b.words, /Through payroll, Health savings costs \$[\d,.]+ less: it comes off pay before [\d.]+% of income tax, Social Security and Medicare\./);
  assert.doesNotMatch(a.words, /Through payroll/);
});

test('answers 43 and 49: client words, and a blank year names the account to record it on', () => {
  const d = demo();
  const s = applyDefaults({ ...d, accounts: [...d.accounts, { id: 'trad', type: 'traditional_ira', family: 'ira', name: F('Trad IRA'), balance: F(1000) }] }, R);
  const mx = maxIt(s, R, { sim: maxItSim(s, R) });
  const r = mx.rows.find((x) => x.id === 'trad:2026');
  assert.equal(r.room, null);
  assert.ok(r.blankAccount, 'the account with nothing recorded is named');
  assert.doesNotMatch(r.why, /empty is not zero/);
  const src = readFileSync(SLAM + 'engine/maxit.js', 'utf8');
  assert.doesNotMatch(src, /the app does not know whether it was/);
  assert.match(src, /Only the employer part counts here: the employee part had to be chosen by /);
  // The panel puts the record form on this account's blank year and links to the other account's panel.
  const panel = readFileSync(SLAM + 'ui/maxit-panel.js', 'utf8');
  assert.match(panel, /r\.blankAccount === r\.accountId \? h\('div', \{ class: 'edit-actions' \}, record\)/);
});
