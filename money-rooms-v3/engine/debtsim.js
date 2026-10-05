/* Debt payoff simulation, month by month. Interest = balance x rate / 12
   (promo rate while it runs); each debt gets its minimum; a paid-off debt's
   minimum rolls to the next in order; an overpayment rolls the same month;
   a card on full autopay is paid in month 1 with no interest. One function
   for avalanche, snowball and stress order. */

export function addMonths(ym, n) {
  const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10) - 1 + n;
  return String(y + Math.floor(m / 12)).padStart(4, '0') + '-' + String((m % 12 + 12) % 12 + 1).padStart(2, '0');
}
export function monthsBetween(a, b) {
  return (parseInt(b.slice(0, 4), 10) - parseInt(a.slice(0, 4), 10)) * 12 + parseInt(b.slice(5, 7), 10) - parseInt(a.slice(5, 7), 10);
}

export function effectiveRate(d, ym) {
  if (d.promoApr !== null && d.promoApr !== undefined && d.promoEnd && ym < d.promoEnd) return d.promoApr;
  return d.rate;
}

/* debts: [{ id, balance, rate, promoApr, promoEnd, minimum, full, stress }]; order: array of ids; from: 'YYYY-MM'. */
export function simulate(debts, order, from, maxMonths, series) {
  const bal = {}; debts.forEach(d => { bal[d.id] = d.balance; });
  const paid = {}; let ym = from; let interest = 0; let freed = 0; const milestones = []; const months = [];
  const byId = {}; debts.forEach(d => { byId[d.id] = d; });
  const limit = maxMonths || 600;
  for (let step = 1; step <= limit; step++) {
    ym = addMonths(ym, 1);
    if (series && step <= 360) months.push({ month: ym, balances: Object.assign({}, bal) });
    let extra = freed;
    for (const id of order) {
      const d = byId[id];
      if (paid[id]) continue;
      let i, pay;
      if (d.full) { pay = bal[id]; i = 0; }
      else { i = Math.round(bal[id] * effectiveRate(d, ym) / 12); pay = d.minimum + extra; extra = 0; }
      interest += i;
      const nb = bal[id] + i - pay;
      if (nb <= 0) { extra = -nb; paid[id] = ym; freed += d.minimum; bal[id] = 0; milestones.push({ month: ym, rowId: id, freedCents: freed }); }
      else bal[id] = nb;
    }
    if (Object.keys(paid).length === debts.length) { if (series) months.push({ month: ym, balances: Object.assign({}, bal) }); return { debtFree: ym, months: step, interest, paid, milestones, stalled: false, series: months }; }
  }
  return { debtFree: null, months: null, interest, paid, milestones, stalled: true, series: months };
}

/* Balances at each December for the projection. */
export function yearEndBalances(debts, order, from, years) {
  const out = {};
  const bal = {}; debts.forEach(d => { bal[d.id] = d.balance; });
  const paid = {}; let ym = from; let freed = 0;
  const byId = {}; debts.forEach(d => { byId[d.id] = d; });
  for (let step = 1; step <= years * 12 + 12; step++) {
    ym = addMonths(ym, 1);
    let extra = freed;
    for (const id of order) {
      const d = byId[id];
      if (paid[id]) continue;
      let i, pay;
      if (d.full) { pay = bal[id]; i = 0; }
      else { i = Math.round(bal[id] * effectiveRate(d, ym) / 12); pay = d.minimum + extra; extra = 0; }
      const nb = bal[id] + i - pay;
      if (nb <= 0) { extra = -nb; paid[id] = ym; freed += d.minimum; bal[id] = 0; } else bal[id] = nb;
    }
    if (ym.endsWith('-12')) out[parseInt(ym.slice(0, 4), 10)] = Object.values(bal).reduce((s, b) => s + b, 0);
  }
  return out;
}
