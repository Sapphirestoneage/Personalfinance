// A new client (practical run, S-269): an empty household with only a name. Every number starts missing (empty is not
// zero); the assumptions start from the house's standard set as guesses, so the FI math has something to read.

const F = (value, kind, today) => ({ value, kind, asOf: today, source: 'new client' });
export const slugOf = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client';

export function blankHousehold(name, today) {
  const nm = String(name || '').trim() || 'New client', id = slugOf(nm.split(' ')[0]);
  return {
    schema: 'slam-spine/1',
    meta: { name: nm, asOf: today },
    household: {
      people: [{ id, name: nm, birthDate: F(null, 'missing', today) }],
      filingStatus: F(null, 'missing', today), state: F(null, 'missing', today), county: F(null, 'missing', today), nycResident: F(null, 'missing', today),
      situation: [{ id: 'now', from: null, value: F(null, 'missing', today) }],
      healthCoverage: [{ id: 'now', from: null, personId: id, value: F(null, 'missing', today), planType: F(null, 'missing', today) }]
    },
    income: [], expenses: [], accounts: [], debts: [], goals: [], taxYears: [], lent: [], log: [], feed: [], profile: {},
    assumptions: { inflation: F(0.03, 'rough', today), realReturn: F(0.06, 'rough', today), withdrawalRate: F(0.04, 'rough', today), lifeExpectancy: F(92, 'rough', today), coastAge: F(65, 'rough', today) }
  };
}

// A client renamed: the household's name, and its first person's name when it was the client's name.
export function renameHousehold(spine, name, oldName) {
  const people = (spine.household.people || []).map((p, i) => (i === 0 && (!p.name || p.name === oldName) ? { ...p, name } : p));
  return { ...spine, meta: { ...spine.meta, name }, household: { ...spine.household, people } };
}
