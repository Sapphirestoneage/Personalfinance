// Protection (S-275): insurance policies (spine.policies) and the checks a planner runs first. Pure.
//   premiumMonthly(x)       a policy's premium a month (null when not given)
//   premiumLineFor(...)     the expense line a policy's premium replaces, so a premium is never counted twice
//   protectionChecks(...)   life, disability, liability and gaps, each with its method in words

import { valueOf as v, round2, tracker } from './spine.js';
import { POLICY_TYPES } from './schema.js';
import { answersOf, ans } from './profile.js';

export const LIFE = ['term_life', 'whole_life', 'group_life'], DISABILITY = ['std', 'ltd'];
// A premium a month: the premium as typed, a yearly one / 12.
export function premiumMonthly(x) {
  const p = x && x.premium ? v(x.premium) : null;
  if (p === null) return null;
  return round2((x.premiumCadence && v(x.premiumCadence) === 'yearly') ? p / 12 : p);
}
// The Needs lines a kind of policy pays for: an expense with one of these names is the same bill as the policy's
// premium, so while the policy has a premium the line is not counted again.
const SAME_BILL = { renters: /renter'?s? insurance/i, homeowners: /^home(owner'?s)? insurance/i, auto: /^(car|auto) insurance/i, pet: /^pet insurance/i, term_life: /^life insurance/i, whole_life: /^life insurance/i, umbrella: /^umbrella/i, std: /disability insurance/i, ltd: /disability insurance/i };
export function premiumCovers(spine, e) {
  return (spine.policies || []).find((x) => SAME_BILL[x.type] && SAME_BILL[x.type].test(String(e.label || '')) && premiumMonthly(x) !== null && !(x.throughWork && v(x.throughWork) === true)) || null;
}
export const policyName = (x) => v(x.name) || POLICY_TYPES[x.type] || x.id;

const sum = (xs) => round2(xs.reduce((a, x) => a + (x || 0), 0));
const yes = (f) => !!f && v(f) === true;
// What disability insurance pays a month if you cannot work, and after how long: { monthly, waitDays, policies }.
// Each policy pays its share of the W-2 pay a month; the short-term one first, then the long-term one.
export function disabilityCover(spine, grossW2Monthly) {
  const list = (spine.policies || []).filter((x) => DISABILITY.includes(x.type));
  const ltd = list.filter((x) => x.type === 'ltd'), std = list.filter((x) => x.type === 'std');
  const pays = (xs) => (grossW2Monthly === null ? null : sum(xs.map((x) => (x.benefitPct ? v(x.benefitPct) || 0 : 0) * grossW2Monthly)));
  const wait = (xs) => { const d = xs.map((x) => (x.eliminationDays ? v(x.eliminationDays) : null)).filter((n) => typeof n === 'number'); return d.length ? Math.min(...d) : null; };
  return { monthly: pays(ltd), waitDays: wait(ltd), short: std.length ? { monthly: pays(std), waitDays: wait(std) } : null, policies: list.map((x) => x.id) };
}

// The checks (S-275): each { id, stage: 'green' | 'yellow' | 'red' | null (skipped), headline, method, lines, path }.
// No verdicts: a gap is yellow; red only when two answers cannot both be true.
export function protectionChecks(spine, rules, s) {
  const year = +spine.meta.asOf.slice(0, 4);
  const a = answersOf(spine), pols = spine.policies || [];
  const t = tracker();
  const lo = t.rule(rules, 'APP_LIFE_YEARS_LOW', year), hi = t.rule(rules, 'APP_LIFE_YEARS_HIGH', year);
  const w2 = s.cashflow.income.streams.filter((x) => (x.type === 'w2' || x.type === 'tips') && x.included !== false);
  const grossW2 = w2.length && w2.every((x) => x.gross !== null) ? sum(w2.map((x) => x.gross)) : null;
  const gross = s.cashflow.income.gross.value, debts = s.sheet.debts.value, nw = s.sheet.netWorth.value, takeHome = s.cashflow.income.takeHome.value;
  const out = [];
  // Life: coverage against income replacement (LOW to HIGH years of pay) plus every debt cleared.
  const depends = ans(a, 'dependents') === 'yes' || (Array.isArray(ans(a, 'livesWith')) && ans(a, 'livesWith').includes('kids'));
  const life = pols.filter((x) => LIFE.includes(x.type)), cover = sum(life.map((x) => (x.coverage ? v(x.coverage) : 0)));
  const need = gross === null || debts === null ? null : { low: round2(gross * 12 * lo + debts), high: round2(gross * 12 * hi + debts) };
  if (ans(a, 'dependents') === 'no' && !depends) out.push({ id: 'life', stage: null, headline: 'Not needed now: no one depends on your income', method: 'Income replacement, skipped: the Profile says no one depends on your income.', lines: [], cover, path: 'profile.html#/protect' });
  else out.push({ id: 'life', stage: need === null ? null : cover >= need.low ? 'green' : 'yellow',
    headline: need === null ? 'Needs your income and debts' : cover ? 'Covered for ' + money(cover) + ' against about ' + money(need.low) + ' to ' + money(need.high) : 'No life insurance; about ' + money(need.low) + ' to ' + money(need.high) + ' would cover it',
    method: 'Income replacement: ' + lo + ' to ' + hi + ' years of your pay (' + (gross === null ? 'pay not given' : money(gross * 12) + ' a year') + ') plus every debt cleared (' + (debts === null ? 'debts not given' : money(debts)) + '). Group life through work counts while you have the job.',
    lines: life.map((x) => policyName(x) + ': ' + (x.coverage && v(x.coverage) !== null ? money(v(x.coverage)) : 'amount not given') + (yes(x.throughWork) && yes(x.endsWithJob) ? ', ends if you leave the job' : '')), need, cover, path: '#/protection' });
  // Disability: share of take-home replaced, and how long until it starts.
  const works = ['w2', 'self', 'both'].includes(ans(a, 'work')) || w2.length > 0;
  const d = disabilityCover(spine, grossW2);
  const share = d.monthly === null || !takeHome ? null : round2(d.monthly / takeHome * 1000) / 1000;
  out.push({ id: 'disability', stage: !works ? null : !d.policies.length ? 'yellow' : share === null ? null : share >= 0.5 ? 'green' : 'yellow',
    headline: !works ? 'Not needed now: no work income' : !d.policies.length ? 'No disability insurance: your pay has nothing behind it' : share === null ? 'Needs the share of pay it pays' : 'Replaces about ' + Math.round(share * 100) + '% of take-home' + (d.waitDays !== null ? ', after ' + d.waitDays + ' days' : ''),
    method: 'Share replaced = the benefit a month (each long-term policy\'s share of your W-2 pay' + (grossW2 === null ? '' : ', ' + money(grossW2) + ' a month') + ') / take-home (' + (takeHome === null ? 'not given' : money(takeHome)) + '). A benefit from a policy your employer pays for is taxed, so it is less than this.',
    lines: [d.short ? 'Short-term: ' + (d.short.monthly === null ? 'amount not given' : money(d.short.monthly) + ' a month') + (d.short.waitDays !== null ? ' after ' + d.short.waitDays + ' days' : '') : null, d.monthly !== null && d.policies.length ? 'Long-term: ' + money(d.monthly) + ' a month' + (d.waitDays !== null ? ' after ' + d.waitDays + ' days' : '') : null].filter(Boolean), share, path: '#/protection' });
  // Liability: umbrella plus auto (or home) liability against total net worth.
  const liab = (t2) => sum(pols.filter((x) => t2.includes(x.type)).map((x) => (x.liabilityLimit ? v(x.liabilityLimit) : 0)));
  const umb = liab(['umbrella']), auto = liab(['auto']), home = liab(['homeowners', 'renters']), limit = umb + Math.max(auto, home);
  out.push({ id: 'liability', stage: nw === null || (!umb && !auto && !home) ? null : limit >= nw ? 'green' : 'yellow',
    headline: !umb && !auto && !home ? 'No liability limits given yet' : nw === null ? 'Needs your net worth' : limit >= nw ? 'Liability covers your net worth (' + money(limit) + ' against ' + money(nw) + ')' : money(limit) + ' of liability against ' + money(nw) + ' of net worth',
    method: 'Liability covered = umbrella (' + money(umb) + ') + the larger of auto (' + money(auto) + ') and home or renters (' + money(home) + '), against total net worth. Above your net worth, a lawsuit could reach what you own.', lines: [], path: '#/protection' });
  // Gaps.
  const kinds = new Set(pols.map((x) => x.type));
  const car = (spine.accounts || []).some((x) => x.type === 'car') || (spine.debts || []).some((x) => x.type === 'auto_loan');
  const gaps = [];
  // Each gap in words, and short for the one-pager.
  const short = [];
  const gap = (words, s2) => { gaps.push(words); short.push(s2); };
  if (ans(a, 'home') === 'rent' && !kinds.has('renters')) gap('You rent and have no renters policy', 'no renters policy');
  if (ans(a, 'home') === 'own' && !kinds.has('homeowners')) gap('You own your home and have no homeowners policy', 'no homeowners policy');
  if (car && !kinds.has('auto')) gap('You have a car and no auto policy here', 'no auto policy');
  if (depends && life.length && life.every((x) => x.type === 'group_life' && (!x.endsWithJob || yes(x.endsWithJob)))) gap('Your only life insurance is through work and ends with the job', 'life insurance only through work');
  const odd = pols.filter((x) => yes(x.throughWork)).filter(() => !w2.length);
  out.push({ id: 'gaps', stage: odd.length ? 'red' : gaps.length ? 'yellow' : 'green',
    headline: odd.length ? 'A policy is through work, but no job is in Income' : gaps.length ? gaps.length + (gaps.length === 1 ? ' gap' : ' gaps') + ': ' + gaps[0].toLowerCase() : 'No gaps found',
    method: 'Gaps: renting with no renters policy, owning with no homeowners policy, a car with no auto policy, and life insurance only through work that ends with the job (when someone depends on you).',
    lines: [...gaps, ...odd.map((x) => policyName(x) + ' is marked through work, but no W-2 job is in Income')], gaps, short, path: '#/protection' });
  return out;
}
const money = (x) => (x === null || x === undefined ? 'not given' : '$' + Math.round(x).toLocaleString('en-US'));
// One line for the one-pager: what you are covered for, and the gaps.
export function protectionLine(checks) {
  const life = checks.find((c) => c.id === 'life'), dis = checks.find((c) => c.id === 'disability'), gaps = checks.find((c) => c.id === 'gaps');
  const covered = [life && life.cover ? 'life ' + money(life.cover) : null, dis && dis.share ? 'disability about ' + Math.round(dis.share * 100) + '% of take-home' : null].filter(Boolean);
  return 'Protection: ' + (covered.length ? 'covered for ' + covered.join(', ') : 'nothing on file yet') + (gaps && gaps.short.length ? '; gaps: ' + gaps.short.join(', ') : '; no gaps found') + '.';
}
