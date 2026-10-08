/* One formula for every level-payment loan (Level 13, MR-067): mortgages,
   car loans, pay-later plans with interest. Cents in, cents out; rates as
   fractions. The house, home, car and calendar engines all call these; none
   carries its own copy. */

/* The payment on a level loan: principal x r / (1 - (1 + r)^-n); principal / n at 0%. */
export function levelPayment(principalCents, annualRate, months) {
  if (!(months > 0)) return 0;
  const r = (annualRate || 0) / 12;
  if (r === 0) return Math.round(principalCents / months);
  return Math.round(principalCents * r / (1 - Math.pow(1 + r, -months)));
}
/* The principal a payment carries at a rate over a term (the inverse). */
export function principalForPayment(paymentCents, annualRate, months) {
  if (!(months > 0)) return 0;
  const r = (annualRate || 0) / 12;
  if (r === 0) return Math.round(paymentCents * months);
  return Math.round(paymentCents * (1 - Math.pow(1 + r, -months)) / r);
}
/* Month by month: interest, principal, balance; extra principal shortens the loan. */
export function amortize(principalCents, annualRate, months, extraMonthlyCents) {
  const pay = levelPayment(principalCents, annualRate, months); const r = (annualRate || 0) / 12;
  const rows = []; let bal = principalCents; let m = 0; let totalInterest = 0;
  while (bal > 0 && m < months + 600) {
    m++;
    const interest = Math.round(bal * r);
    let principal = pay - interest + (extraMonthlyCents || 0);
    if (principal > bal) principal = bal;
    bal -= principal; totalInterest += interest;
    rows.push({ month: m, interest, principal, balance: bal, payment: interest + principal });
    if (m >= months && bal > 0 && (extraMonthlyCents || 0) === 0) { rows[rows.length - 1].principal += bal; rows[rows.length - 1].payment += bal; rows[rows.length - 1].balance = 0; bal = 0; }
  }
  return { payment: pay, months: rows.length, totalInterest, rows };
}
/* Yearly roll-up of a schedule: interest and principal paid in each year, the balance at year end. */
export function byYear(schedule) {
  const out = []; const rows = schedule.rows;
  for (let y = 0; y * 12 < rows.length; y++) {
    const slice = rows.slice(y * 12, y * 12 + 12);
    out.push({ year: y + 1, interest: slice.reduce((s, r) => s + r.interest, 0), principal: slice.reduce((s, r) => s + r.principal, 0), balance: slice[slice.length - 1].balance });
  }
  return out;
}
/* Balance after n months, with no extra payments. */
export function balanceAfter(principalCents, annualRate, months, n) {
  const r = (annualRate || 0) / 12; const pay = levelPayment(principalCents, annualRate, months);
  if (n >= months) return 0;
  if (r === 0) return Math.max(0, principalCents - pay * n);
  return Math.max(0, Math.round(principalCents * Math.pow(1 + r, n) - pay * (Math.pow(1 + r, n) - 1) / r));
}
/* Months of a loan at a payment (null when the payment does not cover the interest). */
export function monthsToPayOff(principalCents, annualRate, paymentCents) {
  const r = (annualRate || 0) / 12;
  if (paymentCents <= 0) return null;
  if (r === 0) return Math.ceil(principalCents / paymentCents);
  if (paymentCents <= principalCents * r) return null;
  return Math.ceil(-Math.log(1 - principalCents * r / paymentCents) / Math.log(1 + r));
}
