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

import { valueOf as v, round2 } from './spine.js';
import { matchTiersOf, blendedRate } from './match.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A date in words for a sentence ("Feb 28, 2027"), never the stored form.
const dateWords = (iso) => (iso ? MONTH_NAMES[+iso.slice(5, 7) - 1] + ' ' + +iso.slice(8, 10) + ', ' + iso.slice(0, 4) : 'its end date');
import { debtLoss } from './debt.js';
import { fooLadder, RUNG_LABELS } from './plan.js';
import { answersOf, protectionGaps } from './profile.js';

const QUESTIONS = {
  deductibles: 'What is your highest insurance deductible?',
  employerMatch: 'What does your employer match, and up to what share of pay?',
  reserves: 'What year were you born, and what do you spend a month?',
  rothHsa: 'What goes into your IRA and HSA now?',
  maxRetirement: 'What goes into your workplace retirement plan now?'
};

export function rankSteps(spine, rules, s, { asOf = spine.meta.asOf, sim = null, foo = null } = {}) {
  const year = +asOf.slice(0, 4);
  const ladder = foo || fooLadder(spine, rules, s, { asOf, sim });
  const hi = rules.get('APP_HI_RATE', year);
  const losing = [];
  for (const d of spine.debts || []) {
    const l = debtLoss(spine, rules, d, asOf);
    if (!l) continue;
    const bal = v(d.balance), name = v(d.name) || d.id, path = 'debts.' + d.id + '.balance', ends = d.promoEnds ? v(d.promoEnds) : null;
    const deferredUnknown = l.promo && (!d.deferredInterest || v(d.deferredInterest) === null);
    if (l.promo) losing.push({ id: 'promo:' + d.id, rung: l.after >= hi ? 'highInterest' : null, label: 'Clear the ' + name + ' before its intro rate ends', loss: l.loss, path, debt: d.id,
      why: money0(bal) + ' at 0% until ' + dateWords(ends) + (l.deferred ? '; interest is deferred, so any balance left then is charged about ' + money0(l.back) + ' of interest' : '; then ' + Math.round(l.after * 1000) / 10 + '%' + (deferredUnknown ? '. Check the card\'s terms for deferred interest' : '')) + '.' });
    else losing.push({ id: 'interest:' + d.id, rung: 'highInterest', label: 'Pay down the ' + name + ' (' + Math.round(l.rate * 1000) / 10 + '%)', loss: l.loss, path, debt: d.id,
      why: money0(bal) + ' at ' + Math.round(l.rate * 1000) / 10 + '% costs about ' + money0(l.loss) + ' a month in interest.' });
  }
  // The employer match not taken: the contribution short a month, times the match rate.
  const em = ladder.rungs.find((r) => r.id === 'employerMatch');
  if (em && em.need && em.need > 0) {
    // The match a dollar short earns, tier by tier (S-272): the blended rate over the full match.
    const rate = Math.max(0, ...(spine.accounts || []).map((a) => blendedRate(matchTiersOf(a))));
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
