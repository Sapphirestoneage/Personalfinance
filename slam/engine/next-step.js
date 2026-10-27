// One next step (audit, 2026-10-27): Today's Next step, Do first and the Plan's NEXT all read this ranking.
// Steps that lose money come first, by the dollars lost a month:
//   interest = balance x rate / 12, on a card or loan charging at or above the high-rate line now (lower stays in order);
//   a promo or deferred-interest cliff = what it costs a month once it ends (deferred: the interest accruing now, which
//     is charged back if any balance is left), weighted by how close the end is: x (1 + 1 / months left);
//   the employer match not taken = the match missed a month.
// Card use ranks first only when the Profile says they plan to apply for credit in the next 12 months. Then the rest
// of the order, in its own order. A step blocked only by a missing number is not a step: it becomes a question on its
// card ("What's your highest insurance deductible?") and the ranking moves on.
// Protection (audit 7): each gap from the Profile (protectionGaps) ranks right after the starter emergency fund (the
// deductibles rung): ahead of the dollars-lost steps once that fund is there, else just after it.

import { valueOf as v, round2, monthKey } from './spine.js';
import { rateOn, paidInFull } from './debt.js';
import { fooLadder, RUNG_LABELS } from './plan.js';
import { answersOf, protectionGaps } from './profile.js';

const QUESTIONS = {
  deductibles: 'What is your highest insurance deductible?',
  employerMatch: 'What does your employer match, and up to what share of pay?',
  reserves: 'What year were you born, and what do you spend a month?',
  rothHsa: 'What goes into your IRA and HSA now?',
  maxRetirement: 'What goes into your workplace retirement plan now?'
};
const monthsBetween = (fromIso, toIso) => Math.max(0, (+toIso.slice(0, 4) - +fromIso.slice(0, 4)) * 12 + (+toIso.slice(5, 7) - +fromIso.slice(5, 7)));

export function rankSteps(spine, rules, s, { asOf = spine.meta.asOf, sim = null, foo = null } = {}) {
  const year = +asOf.slice(0, 4);
  const ladder = foo || fooLadder(spine, rules, s, { asOf, sim });
  const hi = rules.get('APP_HI_RATE', year);
  const losing = [];
  for (const d of spine.debts || []) {
    const bal = v(d.balance);
    if (!bal || bal <= 0 || paidInFull(spine, d)) continue;
    const name = v(d.name) || d.id, now = rateOn(d, asOf).rate, path = 'debts.' + d.id + '.balance';
    const ends = d.promoEnds ? v(d.promoEnds) : null, after = d.apr ? v(d.apr) : null;
    const inPromo = ends && ends >= asOf && now !== null && after !== null && now < after;
    if (inPromo) {
      const left = Math.max(1, monthsBetween(monthKey(asOf), monthKey(ends)));
      const deferred = d.deferredInterest && v(d.deferredInterest) === true;
      // Not sure whether interest is deferred (owner's ask): ranked as not deferred, with a line to check the terms.
      const deferredUnknown = !d.deferredInterest || v(d.deferredInterest) === null;
      const loss = round2(bal * after / 12 * (1 + 1 / left));
      losing.push({ id: 'promo:' + d.id, rung: after >= hi ? 'highInterest' : null, label: 'Clear the ' + name + ' before its intro rate ends', loss, path, debt: d.id,
        why: money0(bal) + ' at 0% until ' + ends + (deferred ? '; interest is deferred, so any balance left then is charged interest from the start' : '; then ' + Math.round(after * 1000) / 10 + '%' + (deferredUnknown ? '. Check the card\'s terms for deferred interest' : '')) + '.' });
    } else if (now !== null && now >= hi) {
      // Debt under the high-rate line keeps its place at the end of the order (low-interest debt): its minimum is paid,
      // and extra there is not money lost the way card interest is.
      losing.push({ id: 'interest:' + d.id, rung: 'highInterest', label: 'Pay down the ' + name + ' (' + Math.round(now * 1000) / 10 + '%)', loss: round2(bal * now / 12), path, debt: d.id,
        why: money0(bal) + ' at ' + Math.round(now * 1000) / 10 + '% costs about ' + money0(round2(bal * now / 12)) + ' a month in interest.' });
    }
  }
  // The employer match not taken: the contribution short a month, times the match rate.
  const em = ladder.rungs.find((r) => r.id === 'employerMatch');
  if (em && em.need && em.need > 0) {
    const rate = Math.max(0, ...(spine.accounts || []).filter((a) => a.matchRate && v(a.matchRate)).map((a) => v(a.matchRate)));
    if (rate > 0) losing.push({ id: 'match', rung: 'employerMatch', label: 'Take the full employer match', loss: round2(em.need * rate), path: em.path, why: em.why });
  }
  losing.sort((a, b) => b.loss - a.loss);
  // Card use first only when they plan to apply for credit within a year.
  const util = s.debt && s.debt.utilization ? s.debt.utilization : null;
  const credit = answersOf(spine).applyCredit === 'yes';
  const first = credit && util && util.personal && util.personal.value !== null && util.personal.value > rules.get('STAGE_UTIL_GREEN', year)
    ? [{ id: 'utilization', rung: null, label: 'Bring card use down before you apply for credit', loss: null, path: null, why: 'Card use is part of a credit score, and you plan to apply in the next 12 months.' }] : [];
  // The rest of the order, its own way: not done, and not already ranked by its loss.
  const ranked = new Set(losing.map((x) => x.rung).filter(Boolean));
  const questions = [], rest = [];
  for (const r of ladder.rungs) {
    if (r.done === true) continue;
    if (r.need === null) { questions.push({ id: 'ask:' + r.id, rung: r.id, question: QUESTIONS[r.id] || r.why, path: r.path, label: r.label }); continue; }
    if (ranked.has(r.id)) continue;
    rest.push({ id: 'rung:' + r.id, rung: r.id, label: r.label, loss: null, need: r.need, flow: r.flow, path: r.path, why: r.why });
  }
  const protect = protectionGaps(answersOf(spine)).map((g) => ({ id: 'protect:' + g.id, rung: null, label: g.label, loss: null, path: 'profile.' + g.id, href: 'profile.html#/protect', why: g.why }));
  const starter = ladder.rungs.find((r) => r.id === 'deductibles');
  const at = rest.findIndex((x) => x.rung === 'deductibles') + 1;
  const steps = starter && starter.done === true ? [...first, ...protect, ...losing, ...rest] : [...first, ...losing, ...rest.slice(0, at), ...protect, ...rest.slice(at)];
  return { steps, first: steps[0] || null, questions, ladder };
}
const money0 = (x) => '$' + Math.round(x).toLocaleString('en-US');
export { RUNG_LABELS };
