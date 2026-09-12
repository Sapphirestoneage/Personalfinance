'use strict';
/* Property tests for engines/ownership.js (lane 2, section 2, L-2). Nothing
   here is household-first, so the generic four do not apply; these are the
   invariants the four readings have to keep between them. */
const H = require('./_harness.js');
const { fc, prop, TABLES, Money, same } = H;
const O = H.engine('ownership');
const T = { housingConventions: TABLES.housingConventions };
const base = fc.record({
  price: fc.integer({ min: 1000, max: 500000000 }),
  down: fc.integer({ min: 0, max: 100 }).map((n) => n / 100),
  rate: fc.integer({ min: 0, max: 200 }).map((n) => n / 1000),
  term: fc.constantFrom(180, 240, 360),
  hoa: fc.integer({ min: 0, max: 200000 })
});
const optsOf = (o, extra) => Object.assign({ priceCents: o.price, downPct: o.down, annualRate: o.rate, termMonths: o.term, hoaMonthlyCents: o.hoa, tables: T }, extra || {});

const props = [
  prop('a month of owning is whole cents throughout, the same twice, and never NaN', base, (o) => {
    const a = O.cost(optsOf(o));
    if (!Money.isOk(a)) return typeof a.reason === 'string' || 'incomplete without a reason';
    const bad = H.badNumbers(a, 'cost', new Set(), 0);
    if (bad.length) return bad[0];
    const frac = H.fractionalCents(a, 'cost', new Set(), 0);
    if (frac.length) return frac[0];
    return same(a, O.cost(optsOf(o))) || 'differs between calls';
  }),
  prop('the parts add up: every line sums to the total, and the carry plus the equity is the same total', base, (o) => {
    const a = O.cost(optsOf(o));
    if (!Money.isOk(a)) return true;
    const parts = a.paymentCents + a.propertyTaxMonthlyCents + a.insuranceMonthlyCents + a.maintenanceMonthlyCents + a.pmiMonthlyCents + a.hoaMonthlyCents;
    if (parts !== a.totalMonthlyCents) return 'lines sum to ' + parts + ', total says ' + a.totalMonthlyCents;
    if (a.carryMonthlyCents + a.equityMonthlyCents !== a.totalMonthlyCents) return 'carry ' + a.carryMonthlyCents + ' + equity ' + a.equityMonthlyCents + ' is not ' + a.totalMonthlyCents;
    return a.loanCents + a.downCents === a.priceCents || ('loan + down is not the price');
  }),
  prop('putting more down never makes the month cost more, and mortgage insurance only appears under the line', base, (o) => {
    const low = O.cost(optsOf(o, { downPct: 0.05 })), high = O.cost(optsOf(o, { downPct: 0.25 }));
    if (!Money.isOk(low) || !Money.isOk(high)) return true;
    if (high.totalMonthlyCents > low.totalMonthlyCents) return 'more down costs more a month: ' + high.totalMonthlyCents + ' vs ' + low.totalMonthlyCents;
    if (high.pmiMonthlyCents !== 0) return 'mortgage insurance charged at 25% down';
    /* Under the line it is charged at the convention's rate; on a price
       small enough that a month of it is under a cent, that is zero, which
       is the rounding being honest rather than the rule not applying. */
    const want = Math.round(low.loanCents * low.rates.pmi / 12);
    return low.pmiMonthlyCents === want || ('mortgage insurance is ' + low.pmiMonthlyCents + ', the rate says ' + want);
  }),
  prop('let out: the rent less the empty stretch, less the running costs, is the operating income, and the loan comes off after', fc.record({ b: base, rent: fc.integer({ min: 0, max: 2000000 }) }), (o) => {
    const r = O.rental(optsOf(o.b, { grossRentMonthlyCents: o.rent }));
    if (!Money.isOk(r)) return true;
    if (r.effectiveRentMonthlyCents !== r.grossRentMonthlyCents - r.vacancyCents) return 'the empty stretch does not come off the rent';
    if (r.noiMonthlyCents !== r.effectiveRentMonthlyCents - r.operatingMonthlyCents) return 'operating income is not rent less costs';
    if (r.cashFlowMonthlyCents !== r.noiMonthlyCents - r.debtServiceMonthlyCents) return 'cash flow is not operating income less the loan';
    const frac = H.fractionalCents(r, 'rental', new Set(), 0);
    return !frac.length || frac[0];
  }),
  prop('holding it: the balance only falls, what you keep never exceeds what it is worth, and the sums reconcile', fc.record({ b: base, years: fc.integer({ min: 1, max: 40 }) }), (o) => {
    const h = O.hold(optsOf(o.b, { years: o.years }));
    if (!Money.isOk(h)) return true;
    if (h.balanceCents < 0) return 'a negative balance';
    if (h.netProceedsCents > h.valueAtSaleCents) return 'you keep more than it sells for';
    if (h.equityCents !== h.valueAtSaleCents - h.balanceCents) return 'equity is not value less balance';
    if (h.paidCents !== h.cashToCloseCents + h.monthlyCents * h.monthsHeld) return 'what you paid does not add up';
    if (h.costOfOwningCents !== h.paidCents - h.netProceedsCents) return 'the cost of owning is not what you paid less what you keep';
    const longer = O.hold(optsOf(o.b, { years: Math.min(40, o.years + 5) }));
    if (Money.isOk(longer) && longer.balanceCents > h.balanceCents) return 'the loan grew over five more years';
    return true;
  }),
  prop('a house hack: what you pay to live there is the month less the rent the other units bring', fc.record({ b: base, rents: fc.array(fc.integer({ min: 0, max: 1000000 }), { minLength: 1, maxLength: 4 }) }), (o) => {
    const k = O.hack(optsOf(o.b, { unitRentsCents: o.rents }));
    if (!Money.isOk(k)) return true;
    const gross = o.rents.reduce((s, r) => s + r, 0);
    if (k.grossRentMonthlyCents !== gross) return 'the rents do not add up';
    if (k.collectedMonthlyCents !== gross - k.vacancyCents) return 'the empty stretch does not come off';
    if (k.youPayMonthlyCents !== k.monthlyCostCents - k.collectedMonthlyCents) return 'what you pay is not the month less the rent';
    if (k.theyPayYou !== (k.youPayMonthlyCents < 0)) return 'the they-pay-you flag disagrees with the figure';
    const frac = H.fractionalCents(k, 'hack', new Set(), 0);
    return !frac.length || frac[0];
  }),
  prop('underwriting: the reserves only ever make it worse, and the gap is exactly what the listing left out', fc.record({ b: base, rent: fc.integer({ min: 0, max: 2000000 }) }), (o) => {
    const u = O.underwrite(optsOf(o.b, { grossRentMonthlyCents: o.rent }));
    if (!Money.isOk(u)) return true;
    if (u.cashFlowMonthlyCents !== u.noiMonthlyCents - u.debtServiceMonthlyCents) return 'cash flow is not operating income less the loan';
    if (u.advertisedCashFlowMonthlyCents !== u.grossRentMonthlyCents - u.debtServiceMonthlyCents) return 'the advertised figure is not rent less the loan';
    if (u.reservesMissedMonthlyCents !== u.advertisedCashFlowMonthlyCents - u.cashFlowMonthlyCents) return 'the gap does not reconcile';
    if (u.advertisedCashFlowMonthlyCents < u.cashFlowMonthlyCents) return 'counting the reserves made it look better';
    if (u.operatingMonthlyCents < u.capexMonthlyCents + u.managementMonthlyCents) return 'the reserves are not inside the running costs';
    const frac = H.fractionalCents(u, 'underwrite', new Set(), 0);
    return !frac.length || frac[0];
  }),
  prop('the ratios are their own definitions, and cash-on-cash divides by the cash put in, never by equity', fc.record({ noi: fc.integer({ min: -500000, max: 5000000 }), ds: fc.integer({ min: 0, max: 5000000 }), value: fc.integer({ min: 1, max: 900000000 }), cash: fc.integer({ min: 1, max: 90000000 }), equity: fc.integer({ min: 1, max: 900000000 }) }), (o) => {
    const m = O.metrics({ noiAnnualCents: o.noi, debtServiceAnnualCents: o.ds, valueCents: o.value, cashInvestedCents: o.cash, equityCents: o.equity });
    if (Math.abs(m.capRate - o.noi / o.value) > 1e-12) return 'the cap rate is not operating income over value';
    if (o.ds > 0 && Math.abs(m.dscr - o.noi / o.ds) > 1e-12) return 'the cover is not operating income over the loan';
    if (Math.abs(m.cashOnCash - (o.noi - o.ds) / o.cash) > 1e-12) return 'cash-on-cash is not cash flow over the cash put in';
    if (Math.abs(m.returnOnEquity - (o.noi - o.ds) / o.equity) > 1e-12) return 'the return on equity is not cash flow over equity';
    return o.cash === o.equity || m.cashOnCash !== m.returnOnEquity || 'the two returns are the same number on different denominators';
  }),
  prop('the total return is its four parts and nothing else, and the loan paid down plus what is left is the loan', fc.record({ b: base, rent: fc.integer({ min: 0, max: 2000000 }), years: fc.integer({ min: 1, max: 30 }), marginal: fc.constantFrom(null, 0.12, 0.24, 0.32) }), (o) => {
    const t = O.totalReturn(optsOf(o.b, { grossRentMonthlyCents: o.rent, years: o.years, marginalRate: o.marginal }));
    if (!Money.isOk(t)) return true;
    const sum = t.parts.reduce((s2, p2) => s2 + p2.cents, 0);
    if (sum !== t.totalCents) return 'the parts sum to ' + sum + ', the total says ' + t.totalCents;
    if (t.cashFlowCents + t.principalPaidCents + t.appreciationCents + t.shelterCents !== t.totalCents) return 'the four named figures do not reconcile';
    /* The loan is the price less the ROUNDED down payment, which is not
       always the same cent as rounding the price times the share. Ask the
       engine what the loan was rather than deriving it a second way. */
    const loan = O.cost(optsOf(o.b)).loanCents;
    if (t.principalPaidCents + t.balanceCents !== loan) return 'paid down plus outstanding is not the loan';
    if (o.marginal === null && t.shelterCents !== 0) return 'a shelter was counted with no tax bracket';
    if (t.appreciationCents !== 0) return 'growth was assumed without being asserted';
    return true;
  }),
  prop('every stress is a worse day than today, never a better one', fc.record({ b: base, rent: fc.integer({ min: 1, max: 2000000 }) }), (o) => {
    const st = O.stress(optsOf(o.b, { grossRentMonthlyCents: o.rent }));
    if (!Money.isOk(st)) return true;
    for (const sc of st.scenarios) {
      if (sc.swingCents === undefined) continue;
      if (sc.swingCents > 0) return sc.label + ' made the deal better by ' + sc.swingCents;
    }
    return st.survived <= st.total || 'more scenarios survived than were run';
  }),
  prop('a missing price, an impossible down payment or a negative rate is refused with a reason, never a number', fc.record({ b: base, which: fc.constantFrom('price', 'down', 'rate') }), (o) => {
    const bad = { price: { priceCents: null }, down: { downPct: 1.5 }, rate: { annualRate: -0.01 } }[o.which];
    const r = O.cost(optsOf(o.b, bad));
    if (Money.isOk(r)) return o.which + ' was accepted';
    return (typeof r.reason === 'string' && r.reason.length > 0) || 'refused without saying why';
  })
];
module.exports = H.suite('ownership', props);
if (require.main === module) H.main(module.exports);
