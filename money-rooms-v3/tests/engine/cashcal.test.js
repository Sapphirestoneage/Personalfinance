/* The cash flow calendar (Level 13, MR-067): the self-test assertions from the reference spec (section 7) and the
   brief's own, on hand-built models, plus the Maya fixture through buildModel. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../engine/cashcal.js';
import { compute } from '../../engine/compute.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-05';
/* a small household: checking 1,500, savings 4,000 (the cushion), biweekly pay 1,200 from Oct 9, rent 900 on the 1st, utilities 150 on the 15th, 600 a month everyday, a card */
function model(over) {
  return Object.assign({ start: TODAY, days: 60, accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 150000, primary: true, cushion: false, autoCover: false }, { id: 'sav', name: 'Savings', type: 'hysa', balance: 400000, primary: false, cushion: true, autoCover: false }],
    incomes: [{ id: 'pay', label: 'Pay', cents: 120000, cadence: 'biweekly', anchor: '2026-10-09', to: 'chk' }],
    bills: [{ id: 'rent', label: 'Rent', cents: 90000, cadence: 'month', day: 1, paidWith: 'cash', category: 'accommodation', movable: false }, { id: 'util', label: 'Utilities', cents: 15000, cadence: 'month', day: 15, paidWith: 'cash', category: 'utilities', movable: true }, { id: 'food', label: 'Groceries', cents: 60000, cadence: 'spread', paidWith: 'cash', category: 'food' }],
    cards: [], loans: [], payLater: [], transfers: [], maybe: [], extras: [], logs: [], overrides: {}, floor: 0, floorSource: 'zero', guard: true, sweep: false, sweepTo: null, sweepKeep: 10000, shock: null, needs: [], likelyThreshold: 0.6, everydayMonthly: 60000, realHourlyWage: 2500, surplusMonthly: 50000 }, over || {});
}
const card = over => Object.assign({ id: 'card', name: 'Card', balance: 100000, apr: 0.24, promoApr: null, promoEnd: null, limit: 500000, minimum: null, stmtDay: 10, graceDays: 24, dueDay: null, payInFull: false, autopay: 'none', goalNoInterest: false, lateFee: 3000, penaltyApr: 0.2999, reportDay: null, annualFee: 0, minPct: 0.02, minFloor: 2500, revolving: true, estimated: false }, over || {});

test('paydays by cadence: biweekly steps both ways from the anchor, semimonthly pairs, monthly clamps to the month', () => {
  assert.deepEqual(C.paydays('biweekly', '2026-10-23', '2026-10-05', '2026-11-20'), ['2026-10-09', '2026-10-23', '2026-11-06', '2026-11-20']);
  assert.deepEqual(C.paydays('semimonthly', '2026-10-15', '2026-10-01', '2026-11-30'), ['2026-10-15', '2026-10-31', '2026-11-15', '2026-11-30']);
  assert.deepEqual(C.paydays('semimonthly', '2026-10-05', '2026-10-01', '2026-10-31'), ['2026-10-05', '2026-10-20']);
  assert.deepEqual(C.paydays('monthly', '2026-01-31', '2026-02-01', '2026-03-31'), ['2026-02-28', '2026-03-31']);
  assert.deepEqual(C.occurrences({ cadence: 'month', day: 31 }, '2026-02-01', '2026-04-30'), ['2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(C.occurrences({ cadence: 'year', month: 3, day: 15 }, '2026-10-01', '2027-09-30'), ['2027-03-15']);
});
test('the balance walks day by day: paydays in, bills out, everyday spread; the low point lands before the first payday', () => {
  const run = C.simulate(model());
  assert.equal(run.days.length, 60); assert.equal(run.low.date, '2026-10-08');
  const d9 = run.days.find(d => d.date === '2026-10-09'); assert.ok(d9.events.some(e => e.kind === 'income' && e.cents === 120000));
  const d15 = run.days.find(d => d.date === '2026-10-15'); assert.ok(d15.events.some(e => e.kind === 'bill' && e.cents === -15000));
  const nov1 = run.days.find(d => d.date === '2026-11-01'); assert.ok(nov1.events.some(e => e.label === 'Rent' && e.cents === -90000));
  /* everyday: 600 a month spread by the month's days */
  const perDay = run.days[0].events.filter(e => e.kind === 'everyday').reduce((s, e) => s - e.cents, 0); assert.equal(perDay, Math.round(60000 / 31));
  assert.ok(run.totals.in > 0 && run.totals.out > 0);
});
test('null is never zero: a line with no amount is left out and named in needs, not counted as 0', () => {
  const maya = loadHousehold('maya'); const R = compute(maya, data, { today: TODAY });
  const row = maya.planets.spending.rows.find(r => r.id === 'm-phone'); row.f.amount = { v: null, state: 'unknown', source: 'client' };
  const m = C.buildModel(maya, R, data, { days: 30 });
  assert.ok(!m.bills.some(b => b.id === 'm-phone')); assert.ok(m.needs.some(n => n.rowId === 'm-phone'));
});
test('interest accrues on a carried balance at the statement, on the average daily balance, and never on a pay-in-full card', () => {
  const carried = C.simulate(model({ cards: [card()] })); const st = carried.cards.card;
  assert.ok(st.interest > 0, 'interest charged'); assert.ok(st.statements.length >= 1); assert.equal(st.statements[0].date, '2026-10-10'); assert.equal(st.statements[0].due, '2026-11-03');
  const expected = Math.round(st.statements[0].adb * 0.24 / 12); assert.equal(st.statements[0].interest, expected);
  const full = C.simulate(model({ cards: [card({ payInFull: true, revolving: false })] })); assert.equal(full.cards.card.interest, 0);
  const auto = C.simulate(model({ cards: [card({ autopay: 'statement', revolving: false })] })); assert.equal(auto.cards.card.interest, 0, 'statement autopay keeps the grace period');
});
test('the grace period: a statement paid in full by its due date means no interest at the next close; a minimum keeps it revolving', () => {
  const min = C.simulate(model({ days: 90, cards: [card({ autopay: 'minimum' })] })); assert.ok(min.cards.card.revolving); assert.ok(min.cards.card.statements.filter(s => s.interest > 0).length >= 2);
  const paid = C.simulate(model({ days: 90, accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 900000, primary: true }], cards: [card({ autopay: 'statement' })] }));
  const sts = paid.cards.card.statements; assert.ok(sts[0].interest > 0, 'the first close charges interest on the carried balance'); assert.equal(sts[1].interest, 0, 'paid in full by the due date, so the next close is interest free'); assert.ok(paid.cards.card.cleared !== null);
});
test('cleared means stopped revolving, not balance zero, and it works at 0% too', () => {
  const daily = model().bills.concat([{ id: 'gas', label: 'Gas', cents: 12000, cadence: 'spread', paidWith: 'card', category: 'transportation' }]);
  const run = C.simulate(model({ days: 90, bills: daily, accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 900000, primary: true }], cards: [card({ autopay: 'statement' })] }));
  assert.equal(run.cards.card.cleared, '2026-11-03'); assert.ok(run.cards.card.balance > 0, 'still used daily');
  const promo = C.simulate(model({ days: 90, accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 900000, primary: true }], cards: [card({ autopay: 'statement', promoApr: 0, promoEnd: '2027-06' })] }));
  assert.equal(promo.cards.card.interest, 0); assert.equal(promo.cards.card.cleared, '2026-11-03');
});
test('paying more clears sooner and costs less', () => {
  const a = C.simulate(model({ days: 365, cards: [card({ autopay: 20000 })] })); const b = C.simulate(model({ days: 365, cards: [card({ autopay: 40000 })] }));
  assert.ok(b.cards.card.interest < a.cards.card.interest); assert.ok((b.cards.card.cleared || '9999') <= (a.cards.card.cleared || '9999'));
});
test('a missed or unfundable payment costs the late fee and the penalty rate; the floor guard records the shortfall', () => {
  const run = C.simulate(model({ accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 20000, primary: true }], incomes: [], cards: [card({ autopay: 'minimum' })] }));
  assert.ok(run.lateFees >= 3000); assert.ok(run.shortfalls.length > 0); assert.ok(run.cards.card.penaltyUntil);
  const day = run.days.find(d => d.date === run.cards.card.statements[0].due); assert.ok(day.events.some(e => e.kind === 'late-fee'));
});
test('the penalty rate applies after a miss, the promo rate until its end, the standard rate otherwise', () => {
  const c = card({ promoApr: 0.0, promoEnd: '2026-11' }); const run = C.simulate(model({ days: 120, cards: [c] }));
  const sts = run.cards.card.statements; assert.equal(sts[0].interest, 0, 'October statement at 0% promo'); assert.equal(sts[1].interest, 0, 'November still promo'); assert.ok(sts[2].interest > 0, 'December reverts');
});
test('cash never breaches the floor when the guard is on: planned payments stop and are listed as shortfalls', () => {
  const run = C.simulate(model({ floor: 100000, floorSource: 'fixed', accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 120000, primary: true }], incomes: [] }));
  assert.ok(run.days.every(d => d.primary >= 100000 - Math.round(60000 / 31) * 60), 'everyday spending is never guarded, planned bills are');
  assert.ok(run.shortfalls.some(s => s.label === 'Rent'));
  const off = C.simulate(model({ floor: 100000, floorSource: 'fixed', guard: false, accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 120000, primary: true }], incomes: [] }));
  assert.ok(off.days.some(d => d.primary < 100000)); assert.equal(off.shortfalls.length, 0);
});
test('auto-cover pulls from a spare account before a guarded payment fails', () => {
  const run = C.simulate(model({ floor: 100000, floorSource: 'fixed', accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 120000, primary: true }, { id: 'sav', name: 'Savings', type: 'hysa', balance: 400000, autoCover: true }], incomes: [] }));
  assert.ok(run.days.some(d => d.events.some(e => e.kind === 'auto-cover'))); assert.ok(!run.shortfalls.some(s => s.label === 'Rent'));
});
test('transfers net to zero across accounts, and go to the goals bucket when no account matches', () => {
  const run = C.simulate(model({ transfers: [{ id: 't', label: 'To savings', cents: 20000, cadence: 'month', day: 12, from: 'chk', to: 'sav' }, { id: 'g', label: 'To the goal', cents: 5000, cadence: 'month', day: 12, from: 'chk', to: 'goals' }] }));
  const base = C.simulate(model()); const d = run.days.find(x => x.date === '2026-10-12');
  assert.equal(d.balances.chk + d.balances.sav + 5000, base.days.find(x => x.date === '2026-10-12').balances.chk + base.days.find(x => x.date === '2026-10-12').balances.sav);
  assert.ok(d.events.some(e => e.kind === 'to-goals' && e.cents === 5000));
});
test('the month-end sweep moves what is left above the floor and the keep amount', () => {
  const run = C.simulate(model({ sweep: true, sweepTo: 'sav', floor: 50000, floorSource: 'fixed' })); const oct31 = run.days.find(d => d.date === '2026-10-31');
  const sw = oct31.events.find(e => e.kind === 'sweep'); assert.ok(sw); assert.equal(oct31.primary, 50000 + 10000);
});
test('pay-later plans pay exactly their total, flagged as debt, and loans with a term pay more than principal', () => {
  const run = C.simulate(model({ days: 120, payLater: [{ id: 'pl', label: 'Shoes', total: 24000, installment: 6000, nextDate: '2026-10-12', freq: 'biweekly', paid: 0 }] }));
  const paid = run.days.flatMap(d => d.events).filter(e => e.kind === 'paylater').reduce((s, e) => s - e.cents, 0); assert.equal(paid, 24000); assert.equal(run.days[0].payLater, 24000); assert.equal(run.days[run.days.length - 1].payLater, 0);
  const loan = C.simulate(model({ days: 365, loans: [{ id: 'l', name: 'Car loan', balance: 1800000, rate: 0.065, payment: C.levelPayment(1800000, 0.065, 60), day: 1 }] }));
  assert.ok(loan.loans.l.paid > loan.loans.l.interest); assert.ok(loan.loans.l.paid - loan.loans.l.interest + loan.loans.l.balance === 1800000, 'principal paid plus balance is the loan'); assert.ok(loan.loans.l.interest > 0);
  assert.equal(C.levelPayment(1800000, 0.065, 60), 35219);
});
test('overrides move, re-price or skip one occurrence without touching the rule', () => {
  const moved = C.simulate(model({ overrides: { 'util|2026-10-15': { date: '2026-10-20' } } })); assert.ok(!moved.days.find(d => d.date === '2026-10-15').events.some(e => e.label === 'Utilities')); assert.ok(moved.days.find(d => d.date === '2026-10-20').events.some(e => e.label === 'Utilities')); assert.ok(moved.days.find(d => d.date === '2026-11-15').events.some(e => e.label === 'Utilities'), 'the rule still fires next month');
  const priced = C.simulate(model({ overrides: { 'util|2026-10-15': { cents: 9900 } } })); assert.ok(priced.days.find(d => d.date === '2026-10-15').events.some(e => e.cents === -9900));
  const skipped = C.simulate(model({ overrides: { 'rent|2026-11-01': { skip: true } } })); assert.ok(!skipped.days.find(d => d.date === '2026-11-01').events.some(e => e.label === 'Rent'));
});
test('weighted maybe money falls between the ignored and likely-only results', () => {
  const m = model({ maybe: [{ id: 'mb', label: 'Bonus', cents: 50000, date: '2026-10-20', likelihood: 0.7, direction: 'in' }] });
  const t = C.threeWays(m); assert.ok(t.ignore.end < t.weighted.end && t.weighted.end < t.likely.end, JSON.stringify(t));
  const low = C.simulate(m, { maybeMode: 'likely' }); assert.ok(low.days.find(d => d.date === '2026-10-20').events.some(e => e.kind === 'maybe-in'));
  const under = C.simulate(model({ maybe: [{ id: 'mb', label: 'Bonus', cents: 50000, date: '2026-10-20', likelihood: 0.4, direction: 'in' }] }), { maybeMode: 'likely' }); assert.ok(!under.days.find(d => d.date === '2026-10-20').events.some(e => e.kind === 'maybe-in'), 'under 60% is not likely');
});
test('safe to spend: cash outside the cushion, minus everything committed before the next income, minus the floor', () => {
  const run = C.simulate(model({ floor: 20000, floorSource: 'fixed' })); const s = run.safeToSpend;
  assert.equal(s.nextIncome, '2026-10-09'); assert.ok(s.excludesCushion);
  const committed = run.days.slice(1, 4).flatMap(d => d.events).filter(e => e.cents < 0 && !e.card).reduce((a, e) => a - e.cents, 0);
  assert.equal(s.committed, committed); assert.equal(s.today, run.days[0].balances.chk - committed - 20000);
  assert.equal(s.byDay.length, 60);
});
test('the paycheck map: each paycheck funds the bills until the next; everyday spending is one bucket; the bills add up', () => {
  const run = C.simulate(model()); assert.ok(run.paychecks.length >= 4); const p = run.paychecks[0]; assert.equal(p.date, '2026-10-09'); assert.equal(p.until, '2026-10-23');
  const sum = p.bills.reduce((s, b) => s + b.cents, 0); assert.equal(p.left, p.cents - sum);
  const outflows = run.days.slice(4, 18).flatMap(d => d.events).filter(e => e.cents < 0 && !e.card && e.kind !== 'shortfall' && e.kind !== 'statement').reduce((s, e) => s - e.cents, 0); assert.equal(sum, outflows);
  assert.ok(p.bills.some(b => b.label === 'Everyday spending'));
});
test('burn tiers reconcile: dated bills plus everyday plus card and loan payments equal the total out', () => {
  const run = C.simulate(model({ cards: [card({ autopay: 'minimum' })] })); const ev = run.days.flatMap(d => d.events);
  const out = ev.filter(e => e.cents < 0 && e.kind !== 'shortfall' && e.kind !== 'statement').reduce((s, e) => s - e.cents, 0);
  const sum = run.days.reduce((s, d) => s + d.out, 0); assert.equal(out, sum);
});
test('can I spend this: yes, tight or no, with the new low point, hours of work and the goal delay', () => {
  const m = model({ floor: 20000, floorSource: 'fixed' }); const yes = C.canISpend(m, { cents: 5000, date: '2026-10-20' }); assert.equal(yes.verdict, 'yes'); assert.equal(yes.hours, 2); assert.equal(yes.delayDays, 3);
  const no = C.canISpend(m, { cents: 200000, date: '2026-10-06' }); assert.ok(no.verdict === 'no' || no.verdict === 'tight'); assert.ok(no.lowAfter.cents <= yes.lowAfter.cents);
  const onCard = C.canISpend(model({ cards: [card()] }), { cents: 10000, date: '2026-10-06', paidWith: 'card' }); assert.equal(onCard.interest, 2400);
});
test('the bill timing fixer finds a due-date move that raises the low point', () => {
  const m = model({ bills: [{ id: 'rent', label: 'Rent', cents: 90000, cadence: 'month', day: 1, paidWith: 'cash', category: 'accommodation' }, { id: 'util', label: 'Utilities', cents: 60000, cadence: 'month', day: 7, paidWith: 'cash', category: 'utilities', movable: true }, { id: 'food', label: 'Groceries', cents: 60000, cadence: 'spread', paidWith: 'cash', category: 'food' }], accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 70000, primary: true }] });
  const fx = C.billTimingFixes(m); assert.ok(fx.fixes.length >= 1, 'a fix'); assert.equal(fx.fixes[0].id, 'util'); assert.ok(fx.fixes[0].gain > 0); assert.ok(/move the due date/.test(fx.fixes[0].script));
});
test('the outlook is deterministic by seed, brackets the base run, and widens with the wobble', () => {
  const m = model({ bills: model().bills.map(b => Object.assign({}, b, { variable: true })) });
  const a = C.outlook(m, { runs: 40, seed: 7 }); const b = C.outlook(m, { runs: 40, seed: 7 }); assert.deepEqual(a, b);
  const base = C.simulate(m); assert.ok(a.low.worst <= base.low.cents + 1 && a.low.best >= base.low.cents - 1);
  const wide = C.outlook(m, { runs: 40, seed: 7, wobble: 0.4 }); assert.ok(wide.low.best - wide.low.worst >= a.low.best - a.low.worst);
  const band = C.outlook(m, { runs: 10, seed: 1, band: true }); assert.equal(band.band.length, 60);
});
test('an income shock shows the runway and the bills at risk first', () => {
  const r = C.incomeShock(model({ floor: 0 }), { from: TODAY, months: 3 }); assert.ok(r.runwayDays !== null && r.runwayDays > 0); assert.ok(r.atRisk.length > 0); assert.ok(r.atRisk[0].date >= r.firstBad);
});
test('life event items land from the event date, with repeats and likelihoods, and never touch the record until confirmed', () => {
  const t = data.lifeEvents.templates.find(x => x.id === 'move'); const items = C.lifeEventItems(t, '2026-11-01');
  assert.equal(items.length, t.items.length); assert.equal(items[0].date, '2026-11-01'); assert.equal(items.find(i => /deposit returned/i.test(i.label)).date, '2026-12-06');
  const maya = loadHousehold('maya'); assert.equal(JSON.stringify(maya.calendar.extras), '[]');
});
test('the spend logger feeds the run and the pace: a log today lowers safe to spend, the pace reads budget, spent, left and a day to stay inside', () => {
  const m = model(); const logged = Object.assign({}, m, { logs: [{ id: 'l1', date: TODAY, cents: 4000, what: 'Lunch', tag: 'food', paidWith: 'cash' }] });
  assert.equal(C.simulate(logged).safeToSpend.today, C.simulate(m).safeToSpend.today - 4000);
  const maya = loadHousehold('maya'); const R = compute(maya, data, { today: TODAY }); const cal = Object.assign(C.calendarOf(maya), { logs: [{ id: 'a', date: '2026-10-03', cents: 12000, tag: 'food' }, { id: 'b', date: '2026-09-02', cents: 9000, tag: 'food' }] });
  const pace = C.spendPace(C.buildModel(maya, R, data), R, cal, TODAY); const food = pace.find(p => p.tag === 'food'); assert.equal(food.spent, 12000); assert.equal(food.lastBySameDay, 9000); assert.equal(food.left, food.budget - 12000); assert.equal(food.perDay, Math.round(food.left / 27));
});
test('card helpers: utilization before the report, which card nets rewards against interest, the balance transfer check', () => {
  const m = model({ cards: [card({ reportDay: 12, limit: 200000 }), card({ id: 'c2', name: 'Sapphire Preferred', balance: 0, revolving: false, payInFull: true })] }); const run = C.simulate(m);
  const u = C.utilizationCheck(m.cards[0], run, 0.3); assert.ok(u.utilization >= 0.5 && u.warn);
  const w = C.whichCard(m, run, { cents: 10000, category: 'dining' }, data.cards); assert.equal(w[0].id, 'c2', 'the pay-in-full card with 3x dining wins'); assert.ok(w[0].rewards > 0 && w[0].interest === 0); assert.ok(w[1].interest > 0);
  const bt = C.balanceTransfer({ balance: 500000, apr: 0.24, feeShare: 0.03, promoMonths: 18, postApr: 0.24, payment: 30000 }); assert.ok(bt.fee === 15000 && bt.interestSkipped > bt.fee && bt.worthIt);
});
test('the weekly check-in: what was due since, and drift read as a lean or as noise', () => {
  const run = C.simulate(model()); const due = C.dueSince(run, '2026-10-08', '2026-10-16'); assert.ok(due.some(e => e.kind === 'income') && due.some(e => e.label === 'Utilities')); assert.ok(!due.some(e => e.kind === 'everyday'));
  assert.equal(C.drift([{ actual: { chk: 90000 }, forecast: { chk: 110000 } }, { actual: { chk: 80000 }, forecast: { chk: 99000 } }, { actual: { chk: 70000 }, forecast: { chk: 91000 } }]).kind, 'bias');
  assert.equal(C.drift([{ actual: { chk: 90000 }, forecast: { chk: 110000 } }, { actual: { chk: 120000 }, forecast: { chk: 99000 } }, { actual: { chk: 70000 }, forecast: { chk: 71000 } }]).kind, 'noise');
});
test('Maya through buildModel: paydays from the anchor, dated bills on their days, cards with statement and due days, the pay-later plan, the cushion in savings, no shortfalls', () => {
  const maya = loadHousehold('maya'); const R = compute(maya, data, { today: TODAY }); const m = C.buildModel(maya, R, data, { days: 60 });
  assert.equal(m.incomes.find(i => i.id === 'm-w2').anchor, '2026-10-09'); assert.equal(m.incomes.find(i => i.id === 'm-w2').cents, 251237);
  assert.equal(m.bills.find(b => b.id === 'm-rent').day, 1); assert.equal(m.bills.find(b => b.id === 'm-rent').paidWith, 'm-bilt', 'rent rides on the Bilt card');
  assert.equal(m.cards.find(c => c.id === 'm-csp').stmtDay, 18); assert.equal(m.cards.find(c => c.id === 'm-csp').dueDay, 13);
  assert.equal(m.payLater.length, 1); assert.ok(m.accounts.find(a => a.id === 'm-hysa').cushion); assert.equal(m.floorSource, 'cushion-account'); assert.equal(m.floor, 0);
  const run = C.simulate(m); assert.equal(run.shortfalls.length, 0); assert.equal(run.interest.total, 0, 'both cards are paid in full'); assert.ok(run.safeToSpend.today > 0); assert.equal(run.low.date, '2026-10-08');
  const y = C.yearStrip(m); assert.equal(y.months.length, 13);
});
test('the calendar section is journaled through the record API and amounts never live in it', () => {
  const maya = loadHousehold('maya'); const n = maya.journal.length; const line = C.setCalendar(maya, cal => { cal.dueDays['m-phone'] = 22; }, { session: 's4' });
  assert.ok(line && line.kind === 'section'); assert.equal(maya.journal.length, n + 1); assert.equal(C.calendarOf(maya).dueDays['m-phone'], 22);
  assert.equal(C.setCalendar(maya, cal => { cal.dueDays['m-phone'] = 22; }), null, 'no change, no line');
  Object.keys(C.calendarOf(maya).dueDays).forEach(k => assert.ok(typeof C.calendarOf(maya).dueDays[k] !== 'object'));
});

/* ---- v44 parity (MR-068): the rules read out of the pasted cashflow-v44 engine ---- */
test('v44: a minimum that cannot be funded is not paid at all, costs the late fee and the penalty rate, and is listed as missed', () => {
  const run = C.simulate(model({ accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 1000, primary: true }], incomes: [], bills: [], cards: [card({ autopay: 'minimum', balance: 200000 })] }));
  const miss = run.shortfalls.find(s => s.missed); assert.ok(miss && miss.kind === 'card-payment'); assert.equal(run.cards.card.paid, 0, 'no partial payment'); assert.equal(run.lateFees, 3000); assert.ok(run.cards.card.penaltyUntil);
});
test('v44: charges the client already budgets for are paid with the minimum, so they never become debt', () => {
  const bills = [{ id: 'gas', label: 'Gas', cents: 12000, cadence: 'month', day: 12, paidWith: 'card', category: 'transportation', budgeted: true }];
  const a = C.simulate(model({ days: 90, bills, cards: [card({ autopay: 'minimum' })] })); const b = C.simulate(model({ days: 90, bills: bills.map(x => Object.assign({}, x, { budgeted: false })), cards: [card({ autopay: 'minimum' })] }));
  assert.ok(a.cards.card.paid > b.cards.card.paid + 10000, 'the budgeted charges ride on the payment'); assert.ok(a.cards.card.balance < b.cards.card.balance);
});
test('v44: the extra at the debt lands on its day, aims by rate with a 0% promo last, student loans and the everyday card wait, and what finishes rolls in', () => {
  const two = [card({ id: 'hi', name: 'High', balance: 100000, apr: 0.27, autopay: 'minimum' }), card({ id: 'promo', name: 'Promo', balance: 100000, apr: 0.29, promoApr: 0, promoEnd: '2027-06', autopay: 'minimum' })];
  const run = C.simulate(model({ days: 40, accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 900000, primary: true }], cards: two, extra: { cents: 30000, day: 14, strategy: 'avalanche', stopAtHi: false, hiRate: 0.10, rollFreed: true } }));
  const d14 = run.days.find(d => d.date === '2026-10-14'); const ev = d14.events.find(e => e.kind === 'extra-payment'); assert.ok(ev && /High/.test(ev.label), 'the promo card at 0% sorts last'); assert.equal(run.extraPaid, 30000);
  const snow = C.simulate(model({ days: 40, accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 900000, primary: true }], cards: [card({ id: 'big', name: 'Big', balance: 300000, apr: 0.20, autopay: 'minimum' }), card({ id: 'small', name: 'Small', balance: 50000, apr: 0.15, autopay: 'minimum' })], extra: { cents: 30000, day: 14, strategy: 'snowball', stopAtHi: false, hiRate: 0.10, rollFreed: true } }));
  assert.ok(/Small/.test(snow.days.find(d => d.date === '2026-10-14').events.find(e => e.kind === 'extra-payment').label));
  const waits = C.simulate(model({ days: 40, accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 900000, primary: true }], cards: [card({ id: 'float', name: 'Everyday', balance: 100000, apr: 0.30, autopay: 'minimum', goalNoInterest: true }), card({ id: 'other', name: 'Other', balance: 100000, apr: 0.12, autopay: 'minimum' })], loans: [{ id: 'stu', name: 'Student', balance: 500000, rate: 0.05, payment: 10000, day: 1, payLast: true }], extra: { cents: 30000, day: 14, strategy: 'avalanche', stopAtHi: false, hiRate: 0.10, rollFreed: true } }));
  assert.ok(/Other/.test(waits.days.find(d => d.date === '2026-10-14').events.find(e => e.kind === 'extra-payment').label), 'the everyday card and the student loan wait');
  const hiOnly = C.simulate(model({ days: 40, accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 900000, primary: true }], cards: [card({ id: 'low', name: 'Low', balance: 100000, apr: 0.06, autopay: 'minimum' })], extra: { cents: 30000, day: 14, strategy: 'avalanche', stopAtHi: true, hiRate: 0.10, rollFreed: true } }));
  assert.equal(hiOnly.extraPaid, 0, 'with stopAtHi the extra stops once nothing is above the high rate');
  const roll = C.simulate(model({ days: 120, accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 900000, primary: true }], cards: [card({ id: 'c', name: 'Card', balance: 400000, apr: 0.24, autopay: 'minimum' })], payLater: [{ id: 'pl', label: 'Plan', total: 6000, installment: 6000, nextDate: '2026-10-06', freq: 'monthly', paid: 0 }], extra: { cents: 0, day: 14, strategy: 'avalanche', stopAtHi: false, hiRate: 0.10, rollFreed: true } }));
  assert.equal(roll.extraPaid, 6000 * 4, 'a finished plan rolls its installment into the extra on every extra day that follows (Oct 14 to Jan 14)');
});
test('v44: why it is taking so long names the reason, and the target solver finds the extra a month', () => {
  const m = model({ days: 365, accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 900000, primary: true }], cards: [card({ autopay: 'minimum', balance: 300000, minFloor: 2500, minPct: 0.01 })] });
  const run = C.simulate(m); assert.equal(C.whyStuck(m, run, 'card').code, 'rate');
  const spend = model({ days: 365, accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 900000, primary: true }], bills: model().bills.concat([{ id: 'gas', label: 'Gas', cents: 30000, cadence: 'spread', paidWith: 'card', category: 'transportation' }]), cards: [card({ autopay: 'minimum', balance: 100000, minPct: 0.05 })] });
  assert.equal(C.whyStuck(spend, C.simulate(spend), 'card').code, 'spending');
  const sv = C.solvePayoff(m, 'card', '2027-04-01'); assert.ok(sv.need > 0 && sv.need % 500 === 0 && sv.date <= '2027-04-01', JSON.stringify(sv));
  const already = C.solvePayoff(Object.assign({}, m, { extra: { cents: 100000, day: 14, strategy: 'avalanche', stopAtHi: false, hiRate: 0.1, rollFreed: true } }), 'card', '2027-04-01'); assert.ok(already.already);
  const never = C.solvePayoff(m, 'card', '2026-10-20'); assert.ok(never.impossible);
});
test('v44: the dry date on total cash, and Maya\'s extra comes from the goal timeline when the coach sets none', () => {
  const run = C.simulate(model({ accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 80000, primary: true }], incomes: [], floor: 0, guard: false })); assert.ok(run.firstDryTotal && run.firstDryTotal === run.firstBelowZero);
  const maya = loadHousehold('maya'); const R = compute(maya, data, { today: TODAY }); const m = C.buildModel(maya, R, data, { days: 60 }); assert.ok(m.extra && ['goal-plan', 'none'].includes(m.extra.source)); assert.equal(m.extra.day, 14);
  assert.equal(m.cards.find(c => c.id === 'm-csp').reportDay, 18, 'the report day defaults to the statement day');
});
