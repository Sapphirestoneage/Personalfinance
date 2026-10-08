/* The eight Level 12 metrics (MR-063). They read what the rest of the engine
   has already made (the goal plan, picture completeness, the guesses, the
   program's stress scores and blind spot) so they run as a second pass after
   those exist. Same shapes as engine/metrics.js: ok with math, or needs. */
import { q, U } from './units.js';
import { programOf, latestSatisfaction, latestWorthIt } from './program.js';
import { AREAS } from './anchors.js';

export const AREA_LABELS = { accommodation: 'Housing', utilities: 'Utilities and subscriptions', food: 'Food', transportation: 'Transportation', therapy: 'Health and therapy', wants: 'Wants', irregular: 'Irregular and annual' };
/* the quadrant rules: an area above a tenth of spending rated 4 or lower is the easy place to cut; one under a tenth rated 8 or higher has room */
export const WORTH_IT = Object.freeze({ bigShare: 0.10, lowScore: 4, highScore: 8 });

const okQ = v => v && v.status === 'ok';
function ok(def, value, math, extra) { return Object.assign({ def, id: def.id, status: 'ok', value, math, rough: !!(value && value.rough), confidence: value && typeof value.confidence === 'number' ? value.confidence : 1 }, extra || {}); }
function need(def, list) { return { def, id: def.id, status: 'needs', needs: list, math: null, value: null }; }
const ratio = (v, conf, rough) => ({ status: 'ok', kind: 'ratio', value: v, confidence: conf === undefined ? 1 : conf, range: null, rough: !!rough });
const count = (v, unit, conf, rough) => ({ status: 'ok', kind: 'count', unit, value: v, confidence: conf === undefined ? 1 : conf, rough: !!rough });
const inputOf = (label, value) => ({ label, value });

export function scoreMetrics(record, result, data) {
  const reg = data.metrics.metrics; const def = id => reg.find(m => m.id === id);
  const M = result.metrics; const S = result.sun && result.sun.outputs; const out = {};
  const put = m => { out[m.id] = m; };
  /* big three share */
  const take = S && okQ(S.income.takeHomeMonthly) ? S.income.takeHomeMonthly : null; const by = S && S.spending.byCategory;
  if (take && by && take.cents > 0) {
    const parts = ['accommodation', 'food', 'transportation'].map(c => [c, okQ(by[c]) ? by[c].cents : 0]);
    const sum = parts.reduce((s, p) => s + p[1], 0);
    if (sum > 0) { const r = ratio(sum / take.cents, Math.min(take.confidence, ...parts.map(p => okQ(by[p[0]]) ? by[p[0]].confidence : 1)), parts.some(p => okQ(by[p[0]]) && by[p[0]].rough)); put(ok(def('bigThreeShare'), r, { formula: '(housing + food + transportation) / take-home', inputs: parts.map(p => inputOf(p[0], q(p[1], U.monthlyAfter))).concat([inputOf('Take-home', take)]), result: r })); }
    else put(need(def('bigThreeShare'), ['spending lines for housing, food or transportation']));
  } else put(need(def('bigThreeShare'), ['take-home pay', 'monthly spending']));
  /* a month in hours */
  if (okQ(M.spending) && okQ(M.realHourlyWage) && M.realHourlyWage.value.cents > 0) { const hrs = Math.round(M.spending.value.cents / M.realHourlyWage.value.cents * 10) / 10; const c = count(hrs, 'hours', Math.min(M.spending.confidence, M.realHourlyWage.confidence), M.spending.rough || M.realHourlyWage.rough); put(ok(def('costInHours'), c, { formula: 'monthly spending / real hourly wage', inputs: [inputOf('Monthly spending', M.spending.value), inputOf('Real hourly wage', M.realHourlyWage.value)], result: c })); }
  else put(need(def('costInHours'), (M.realHourlyWage && M.realHourlyWage.needs) || ['paid hours a week', 'monthly spending']));
  /* picture completeness */
  const comp = result.completeness;
  if (comp && comp.share !== null && comp.totalCents > 0) { const r = ratio(comp.share, 1, false); put(ok(def('completeness'), r, { formula: 'dollars known or verified / all dollars in the picture (a guess counts as not in)', inputs: [inputOf('Sure dollars a year', q(comp.sureCents, U.annualNa)), inputOf('All dollars a year', q(comp.totalCents, U.annualNa))], result: r }, { sureCents: comp.sureCents, totalCents: comp.totalCents })); }
  else put(need(def('completeness'), ['income, spending and account balances']));
  /* blind spot */
  const P = programOf(record); const bs = P.blindSpot && (P.blindSpot.s9 || P.blindSpot.s4);
  if (bs && typeof bs.pct === 'number') { const r = ratio(bs.pct, 0.8, true); put(ok(def('blindSpot'), r, { formula: 'actual spending the gut did not cover / actual spending, from the transactions', inputs: [inputOf('Session', count(P.blindSpot.s9 ? 9 : 4, 'session'))], result: r })); }
  else put(need(def('blindSpot'), ['transactions compared with the gut guesses (session 4)']));
  /* guesses left */
  const g = result.guesses;
  if (g && record.planets.spending.rows.length) { const c = count(g.count || 0, 'guesses'); put(ok(def('guessesLeft'), c, { formula: 'count of spending areas filled by a national-average guess', inputs: [inputOf('Guess rows', count((g.rows || []).length, 'rows'))], result: c })); }
  else put(need(def('guessesLeft'), ['spending lines']));
  /* cushion steps covered */
  const GP = result.goalPlan;
  if (GP && GP.base && GP.base.items) {
    const steps = GP.base.items.filter(i => typeof i.step === 'number').sort((a, b) => a.step - b.step);
    const pot = GP.base.pot; const covered = steps.filter(s => s.targetCents !== null && pot !== null && pot >= s.targetCents).length;
    if (steps.length && steps.some(s => s.targetCents) && typeof pot === 'number') { const c = count(covered, 'steps', 0.9, steps.some(s => s.rough)); put(ok(def('cushionSteps'), c, { formula: 'cushion steps whose target the cash pot covers, of ' + steps.length, inputs: steps.map(s => inputOf(s.name, q(s.targetCents || 0, U.oneoff))).concat([inputOf('Cash pot', q(pot || 0, U.oneoff))]), result: c }, { of: steps.length, pot })); }
    else put(need(def('cushionSteps'), ['monthly spending', 'cash accounts']));
  } else put(need(def('cushionSteps'), ['monthly spending', 'cash accounts']));
  /* stress score */
  const st = (P.stress || []).slice(-1)[0];
  if (st && typeof st.score === 'number') { const c = count(st.score, 'of 10'); put(ok(def('stressScore'), c, { formula: 'the latest score given', inputs: [inputOf('Asked at', { status: 'ok', kind: 'text', value: st.session })], result: c }, { session: st.session, date: st.date, history: (P.stress || []).slice() })); }
  else put(need(def('stressScore'), ['a stress score from the discovery form or a session']));
  /* goals on track */
  if (GP && GP.input && GP.assessment) {
    const dated = GP.input.items.filter(i => i.type === 'dated');
    if (dated.length) { const on = dated.filter(i => GP.assessment[i.id] && ['on-time', 'done'].includes(GP.assessment[i.id].status)).length; const c = count(on, 'goals'); put(ok(def('goalsOnTrack'), c, { formula: 'dated goals the timeline reaches by their date, of ' + dated.length, inputs: dated.map(i => inputOf(i.name, { status: 'ok', kind: 'text', value: (GP.assessment[i.id] || {}).status || 'needs' })), result: c }, { of: dated.length })); }
    else put(need(def('goalsOnTrack'), ['a goal with a date on the Life plan']));
  } else put(need(def('goalsOnTrack'), ['a goal with a date on the Life plan']));
  /* satisfaction: the latest answer at a session close or a money date */
  const sat = latestSatisfaction(record);
  if (sat) { const c = count(sat.score, 'of 10'); put(ok(def('satisfaction'), c, { formula: 'the latest score given', inputs: [inputOf('Asked at', { status: 'ok', kind: 'text', value: /^md-/.test(String(sat.session)) ? 'money date ' + String(sat.session).slice(3) : sat.session === 'discovery' ? 'first call' : 'session ' + String(sat.session).replace(/^s/, '') })], result: c }, { session: sat.session, date: sat.date, history: (P.satisfaction || []).slice() })); }
  else put(need(def('satisfaction'), ['a satisfaction score from a session close or a money date']));
  /* worth-it per area, with each area's cost and share */
  const wi = latestWorthIt(record); const wiAreas = Object.keys(wi);
  if (wiAreas.length && by && S.spending.baselineMonthly && okQ(S.spending.baselineMonthly) && S.spending.baselineMonthly.cents > 0) {
    const total = S.spending.baselineMonthly.cents;
    const areas = AREAS.filter(a => wi[a]).map(a => { const cents = okQ(by[a]) ? by[a].cents : null; return { area: a, label: AREA_LABELS[a] || a, score: wi[a].score, cents, share: cents === null ? null : cents / total, perThousand: cents ? Math.round(wi[a].score / (cents / 100000) * 10) / 10 : null, session: wi[a].session }; });
    const list = { status: 'ok', kind: 'list', value: { areas }, confidence: 0.8, rough: false };
    put(ok(def('areaWorthIt'), list, { formula: 'latest worth-it score per area beside its monthly cost and share of spending', inputs: areas.map(x => inputOf(x.label, { status: 'ok', kind: 'text', value: x.score + ' of 10' + (x.cents !== null ? ', ' + Math.round(x.share * 100) + '% of spending' : '') })), result: list }, { areas }));
    const easyCut = areas.filter(x => x.share !== null && x.share > WORTH_IT.bigShare && x.score <= WORTH_IT.lowScore).sort((p, q) => q.share - p.share);
    const room = areas.filter(x => x.share !== null && x.share < WORTH_IT.bigShare && x.score >= WORTH_IT.highScore).sort((p, q) => q.score - p.score || p.share - q.share);
    const vlist = { status: 'ok', kind: 'list', value: { areas, easyCut, room }, confidence: 0.8, rough: false };
    put(ok(def('valuePerDollar'), vlist, { formula: 'worth-it score per $1,000 a month; flags: share above 10% rated 4 or lower (easy to cut), share under 10% rated 8 or higher (room to spend more)', inputs: areas.map(x => inputOf(x.label, { status: 'ok', kind: 'text', value: x.perThousand === null ? 'no cost yet' : x.perThousand + ' points per $1,000' })), result: vlist }, { areas, easyCut, room }));
  } else if (wiAreas.length) { put(need(def('areaWorthIt'), ['worth-it scores and monthly spending'])); put(need(def('valuePerDollar'), ['worth-it scores and monthly spending'])); }
  else { put(need(def('areaWorthIt'), ['worth-it scores for the spending areas'])); put(need(def('valuePerDollar'), ['worth-it scores for the spending areas'])); }
  return out;
}
