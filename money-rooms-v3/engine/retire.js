/* Retirement for two (Level 13, MR-067). Pure. The investment growth
   calculator in the Personal Finance Club style, for one or two people:
   what today's balances and monthly investing become by each person's
   retirement, split into what was put in and what growth added, and
   beside it the potential: invest more now, more from a later year, or
   max out an account, and the new total. Year by year, the household's
   return assumption, real dollars when the return is after inflation. */
export function personPath(p, rate, toAge) {
  const years = Math.max(0, toAge - p.age); const out = [{ age: p.age, year: 0, balance: p.balance, contributed: p.balance, growth: 0 }];
  let bal = p.balance, put = p.balance;
  for (let y = 1; y <= years; y++) { const extra = (p.extraFromYear && y >= p.extraFromYear ? (p.extraMonthly || 0) : (p.extraFromYear ? 0 : (p.extraMonthly || 0))) * 12; const c = (p.age + y <= p.retireAge ? p.monthly * 12 + extra : 0); bal = Math.round(bal * (1 + rate) + c * (1 + rate / 2)); put += c; out.push({ age: p.age + y, year: y, balance: bal, contributed: put, growth: bal - put }); }
  return out;
}
/* inp: { people: [{ name, age, retireAge, balance, monthly }], rate, withdrawalRate, spendingMonthly, potential: { extraMonthly, extraFromYear, maxOut: { label, limitAnnual, currentAnnual } } } */
export function retireFor(inp) {
  const people = (inp.people || []).filter(p => p && p.age > 0 && p.retireAge > p.age); if (!people.length) return { needs: ['an age, a retirement age, a balance and a monthly amount'] };
  const rate = inp.rate; const wr = inp.withdrawalRate || 0.04; const horizon = Math.max(...people.map(p => p.retireAge));
  const passive = people.map(p => ({ person: p, path: personPath(p, rate, horizon) }));
  const combined = Array.from({ length: horizon - Math.min(...people.map(p => p.age)) + 1 }, (_, i) => { const year = i; const rows = passive.map(x => x.path[Math.min(x.path.length - 1, year)] || x.path[x.path.length - 1]); return { year, age: people[0].age + year, balance: rows.reduce((s, r) => s + r.balance, 0), contributed: rows.reduce((s, r) => s + r.contributed, 0), growth: rows.reduce((s, r) => s + r.growth, 0) }; });
  const atRetire = combined[combined.length - 1];
  const pot = inp.potential || {}; const extraMonthly = (pot.extraMonthly || 0) + (pot.maxOut ? Math.max(0, Math.round(((pot.maxOut.limitAnnual || 0) - (pot.maxOut.currentAnnual || 0)) / 12)) : 0);
  const potentialPeople = people.map((p, i) => Object.assign({}, p, i === 0 ? { extraMonthly, extraFromYear: pot.extraFromYear || 0 } : {}));
  const potential = potentialPeople.map(p => personPath(p, rate, horizon));
  const combinedPot = combined.map((c, i) => { const rows = potential.map(path => path[Math.min(path.length - 1, i)]); return { year: c.year, age: c.age, balance: rows.reduce((s, r) => s + r.balance, 0), contributed: rows.reduce((s, r) => s + r.contributed, 0), growth: rows.reduce((s, r) => s + r.growth, 0) }; });
  const atRetirePot = combinedPot[combinedPot.length - 1];
  const each = passive.map((x, i) => { const last = x.path[x.path.length - 1]; const atOwn = x.path.find(r => r.age === x.person.retireAge) || last; return { name: x.person.name || (i ? 'Partner' : 'You'), retireAge: x.person.retireAge, atRetirement: atOwn.balance, contributed: atOwn.contributed, growth: atOwn.growth, monthly: x.person.monthly }; });
  const incomeMonthly = Math.round(atRetire.balance * wr / 12); const incomeMonthlyPot = Math.round(atRetirePot.balance * wr / 12);
  const fiNumber = inp.spendingMonthly ? Math.round(inp.spendingMonthly * 12 / wr) : null;
  const firstEnough = fiNumber ? combined.find(c => c.balance >= fiNumber) : null; const firstEnoughPot = fiNumber ? combinedPot.find(c => c.balance >= fiNumber) : null;
  return { people: each, horizonAge: horizon, years: combined, potentialYears: combinedPot, atRetirement: atRetire, potentialAtRetirement: atRetirePot, gain: atRetirePot.balance - atRetire.balance, extraMonthly, extraFromYear: pot.extraFromYear || 0, maxOut: pot.maxOut || null, incomeMonthly, incomeMonthlyPot, fiNumber, enoughAge: firstEnough ? firstEnough.age : null, enoughAgePot: firstEnoughPot ? firstEnoughPot.age : null, rate, withdrawalRate: wr, totalContributed: atRetire.contributed, totalGrowth: atRetire.growth };
}
