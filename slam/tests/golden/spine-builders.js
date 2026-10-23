// Small builders for made-up households (golden households and personas).
// Every value is a Fact; nothing here is a real person's data.

export const AS_OF = '2026-10-22';
export const SRC = 'checker (made up)';
export const F = (value, kind = 'known') => ({ value, asOf: AS_OF, source: SRC, kind: value === null ? (kind === 'notForMe' ? 'notForMe' : 'missing') : kind });
export const K = (v) => F(v, 'known');
export const RO = (v) => F(v, 'rough');
export const M = () => F(null);
export const NFM = () => F(null, 'notForMe');

export const person = (id, name, birth) => ({ id, name, birthDate: K(birth) });

export const house = ({ people, filing = 'single', state = 'NY', county = 'Albany', nyc = false, situation = 'employed', coverage = 'employer', planType = 'other', expenseDefaults, payers, situationNext, coverageNext }) => ({
  people,
  filingStatus: K(filing), state: K(state), county: K(county), nycResident: K(nyc),
  ...(expenseDefaults ? { expenseDefaults } : {}), ...(payers ? { payers } : {}),
  situation: [{ id: 'now', from: null, value: K(situation) }, ...(situationNext ? [{ id: 'next', from: situationNext.from, value: K(situationNext.value) }] : [])],
  healthCoverage: [{ id: 'now', from: null, personId: people[0].id, value: K(coverage), planType: K(planType) }, ...(coverageNext ? [{ id: 'next', from: coverageNext.from, personId: people[0].id, value: K(coverageNext.value), planType: coverageNext.planType ? K(coverageNext.planType) : M(), enrolled: coverageNext.enrolled === undefined ? M() : K(coverageNext.enrolled), setAside: coverageNext.setAside === undefined ? M() : K(coverageNext.setAside) }] : [])]
});

export const stream = (id, type, label, amount, cadence, { start = null, end = null, fed = 0, st = 0, personId = 'p1', likelihood, businessExpenses, kind = 'known', notes } = {}) => ({
  id, type, label, personId, amount: F(amount, kind), cadence, start, end,
  ...(likelihood !== undefined ? { likelihood: RO(likelihood) } : {}),
  ...(businessExpenses !== undefined ? { businessExpenses: K(businessExpenses) } : {}),
  withholding: { federal: K(fed), state: K(st) },
  ...(notes ? { notes } : {})
});

export const expense = (id, label, amount, { fat = null, need = true, cadence = 'monthly', start = null, end = null, kind = 'known', shared, yourShare, whoPays = 'part', coveredBy, fixed = null, subscription, notes } = {}) => ({
  id, label, amount: F(amount, kind), cadence, start, end, fixed, need: need === null ? M() : K(need), fat,
  ...(shared ? { shared: K(true), sharedWith: K(shared), whoPays: K(whoPays), ...(yourShare !== undefined ? { yourShare: K(yourShare) } : {}) } : {}),
  ...(coveredBy ? { covered: K(true), coveredBy: K(coveredBy) } : {}),
  ...(subscription ? { subscription: K(true), renews: M(), reviewed: M() } : {}),
  ...(notes ? { notes } : {})
});

export const cash = (id, type, name, balance, { apy, role, owner } = {}) => ({ id, family: 'cash', type, name: K(name), balance: K(balance), ...(apy !== undefined ? { apy: K(apy) } : {}), ...(role ? { role: K(role) } : {}), ...(owner ? { owner: K(owner) } : {}) });
export const acct = (id, family, type, name, balance, extra = {}) => ({ id, family, type, name: K(name), balance: K(balance), ...extra });

export const card = (id, name, balance, apr, limit, { min, due, stress, business = false, reports = true, promoApr, promoEnds, deferred, payPolicy } = {}) => ({
  id, family: 'debt', type: 'credit_card', name: K(name), balance: K(balance), apr: apr === null ? M() : K(apr), limit: K(limit),
  minimum: min === undefined ? M() : K(min), dueDay: due === undefined ? M() : K(due),
  ...(stress ? { stress: K(stress) } : {}),
  ...(promoApr !== undefined ? { promoApr: K(promoApr), promoEnds: K(promoEnds), deferredInterest: K(!!deferred) } : {}),
  ...(payPolicy ? { payPolicy: K(payPolicy) } : {}),
  business: K(business), reportsToPersonalCredit: K(reports)
});
export const loan = (id, type, name, balance, apr, min, { due, extra = {} } = {}) => ({ id, family: 'debt', type, name: K(name), balance: K(balance), apr: apr === null ? NFM() : K(apr), minimum: min === null ? M() : K(min), ...(due !== undefined ? { dueDay: K(due) } : {}), ...extra });

export const assumptions = (over = {}) => ({ inflation: RO(0.03), realReturn: RO(0.05), withdrawalRate: K(0.04), lifeExpectancy: RO(90), coastAge: K(65), ...over });
export const taxYear = (over = {}) => ({ id: '2026', year: 2026, estimatedPaidFederal: K(0), estimatedPaidState: K(0), setAside: K(0), ...over });
export const spine = (id, name, body, from = 'tests/golden/households/') => ({ schema: 'slam-spine/1', meta: { name: name + ' (made up)', asOf: AS_OF, demo: true, from: from + id + '.json' }, ...body });
