/* The call path (Level 8, MR-049): Session 1 and later sessions as one question
   at a time. Stop order and copy live in data/callpath.json; this module turns
   the record into the questions each stop asks and tracks progress per
   session. Pure; the view renders sentences and answer boxes. */
import { AREAS, getAnchor } from './anchors.js';
import { isGuessRow } from './guesses.js';
import { hasValue, numberOf } from './states.js';
import { confirmItems } from './discovery.js';

export function stops(data) { return data.callpath.stops; }
export function areaLabel(data, cat) { const a = data.callpath.areas.find(x => x[0] === cat); return a ? a[1] : cat; }
export function progressOf(record, sessionId) { const p = (record.callProgress || {})[sessionId || 'current'] || {}; return p; }
export function markStop(record, sessionId, stopId, status) { record.callProgress = record.callProgress || {}; const k = sessionId || 'current'; record.callProgress[k] = Object.assign({}, record.callProgress[k] || {}, { [stopId]: status }); return record.callProgress[k]; }

/* Gut questions in order: Sun basics only if missing, take-home only if missing, the gut total, each area (anchored ones confirm, guessed ones first), debt, cash, invested, the first draft. */
export function gutQuestions(record, result, data) {
  const qs = []; const S = result.sun && result.sun.outputs; const gut = (record.anchors && record.anchors.gut) || {};
  const areas = data.callpath.areas.map(a => a[0]);
  if (!hasValue(record.sun.f.birthDate)) qs.push({ id: 'sun:birthDate', kind: 'birth', sentence: 'When were you born, or how old are you?', target: { rowId: 'sun', field: 'birthDate' } });
  if (!hasValue(record.sun.f.city)) qs.push({ id: 'sun:city', kind: 'text', sentence: 'Where do you live?', target: { rowId: 'sun', field: 'city' } });
  const take = S && S.income.takeHomeMonthly && S.income.takeHomeMonthly.status === 'ok';
  if (!take) qs.push({ id: 'income:takeHome', kind: 'money', sentence: 'What lands in your account each time you are paid?', anchor: 'income:takeHome', defaultCadence: 'paycheck' });
  qs.push(gut['spending:total'] ? { id: 'gut:total', kind: 'confirm', sentence: 'Earlier you put a normal month at about ' + dollars(gut['spending:total'].cents) + '. Does that still feel right?', anchor: 'spending:total', current: gut['spending:total'].cents } : { id: 'gut:total', kind: 'money', sentence: data.callpath.stops.find(s => s.id === 'gut').intro, anchor: 'spending:total' });
  const standIns = (S && S.spending.standIns) || {};
  const ordered = areas.slice().sort((a, b) => (standIns[b] === 'guess' ? 1 : 0) - (standIns[a] === 'guess' ? 1 : 0));
  ordered.forEach((cat, i) => {
    const a = gut['spending:' + cat]; const label = areaLabel(data, cat);
    const shared = (cat === 'accommodation' || cat === 'utilities') && record.household && record.household.roommates.length;
    if (a) qs.push({ id: 'gut:' + cat, kind: 'confirm', area: cat, areaIndex: i + 1, areaCount: ordered.length, sentence: 'For ' + label + ' you had about ' + dollars(a.cents) + ' a month' + (a.shared ? ', your part' : '') + '. Still feel right?', anchor: 'spending:' + cat, current: a.cents, shared });
    else qs.push({ id: 'gut:' + cat, kind: 'money', area: cat, areaIndex: i + 1, areaCount: ordered.length, sentence: data.callpath.stops.find(s => s.id === 'gut').areaPrompt.replace('{area}', label) + (standIns[cat] === 'guess' ? ' (a guess fills it today)' : ''), anchor: 'spending:' + cat, shared, sharedPrompt: shared ? data.callpath.stops.find(s => s.id === 'gut').sharedPrompt : null, guess: standIns[cat] === 'guess' });
  });
  const debt = S && S.debt.totalDebt && S.debt.totalDebt.status === 'ok';
  if (!debt && !gut['debt:total']) qs.push({ id: 'debt:total', kind: 'money', sentence: 'Roughly, what do you owe in total: cards, loans, everything?', anchor: 'debt:total', defaultCadence: 'oneoff' });
  if (!(S && S.debt.debtServiceMonthly && S.debt.debtServiceMonthly.status === 'ok') && !gut['debt:minimums']) qs.push({ id: 'debt:minimums', kind: 'money', sentence: 'And what goes to those debts each month, the minimums?', anchor: 'debt:minimums' });
  if (!(S && S.invest.cashBalances && S.invest.cashBalances.status === 'ok') && !gut['safety:cash']) qs.push({ id: 'safety:cash', kind: 'money', sentence: 'How much cash do you have on hand, checking and savings together?', anchor: 'safety:cash', defaultCadence: 'oneoff' });
  if (!(S && S.invest.investedAssets && S.invest.investedAssets.status === 'ok') && !gut['invest:total']) qs.push({ id: 'invest:total', kind: 'money', sentence: 'And roughly, what is invested: retirement accounts, brokerage?', anchor: 'invest:total', defaultCadence: 'oneoff' });
  qs.push({ id: 'firstDraft', kind: 'card', sentence: 'Here is the first draft.' });
  return qs;
}

/* Dream questions: each area, then the dream FI age, then the comparison card. The gut stays hidden unless the coach reveals it. */
export function dreamQuestions(record, result, data) {
  const qs = []; const dream = (record.anchors && record.anchors.dream) || {};
  const areas = data.callpath.areas; const stop = data.callpath.stops.find(s => s.id === 'dream');
  areas.forEach(([cat, label], i) => {
    const a = dream['spending:' + cat];
    qs.push({ id: 'dream:' + cat, kind: a ? 'confirm' : 'money', area: cat, areaIndex: i + 1, areaCount: areas.length, sentence: a ? 'For ' + label + ' you pictured what you would want is ' + dollars(a.cents) + ' a month. Still?' : stop.areaPrompt.replace('{area}', label), anchor: 'spending:' + cat, current: a ? a.cents : null, gut: getAnchor(record, 'gut', 'spending:' + cat), housingChoice: cat === 'accommodation' && record.household && record.household.roommates.length ? stop.housingChoice : null });
  });
  const fi = dream['life:fiAge'];
  qs.push({ id: 'dream:fiAge', kind: fi ? 'confirm' : 'age', sentence: fi ? 'You pictured work being optional at ' + fi.value + '. Still the age?' : stop.fiAge, anchor: 'life:fiAge', current: fi ? fi.value : null });
  qs.push({ id: 'dreamCard', kind: 'card', sentence: 'Today against the dream.' });
  return qs;
}

/* The real numbers: anchored areas with no lines first, then the leverage list, biggest dollars first. */
export function actualItems(record, result, data, leverageItems) {
  const S = result.sun && result.sun.outputs; const standIns = (S && S.spending.standIns) || {};
  const first = AREAS.filter(cat => standIns[cat] === 'anchor').map(cat => ({ id: 'actual:' + cat, kind: 'area', area: cat, label: areaLabel(data, cat), sentence: 'Let us put real lines under ' + areaLabel(data, cat) + '. What are the bills there, one by one?', href: '#/ledger/spending/line', anchor: getAnchor(record, 'gut', 'spending:' + cat) }));
  const rest = (leverageItems || []).filter(i => !i.note && i.rowId !== 'sun').map(i => ({ id: 'actual:' + i.rowId + '|' + i.field, kind: 'cell', rowId: i.rowId, field: i.field, planet: i.planet, label: (i.row ? i.row + ': ' : '') + i.label.toLowerCase(), sentence: i.question, dollarsAnnual: i.dollarsAnnual }));
  return first.concat(rest);
}

/* MR-074: the Confirm stop is a table, not a script. Each item carries what it is, what was given and a state word. */
export function givenText(i) {
  if (i.state === 'unknown') return 'not given';
  if (i.state === 'will-send') return 'they will send it';
  if (i.state === 'none') return 'none';
  if (i.kind === 'money') return dollars(numberOf({ v: i.value, state: i.state, source: 'discovery' }) || 0) + (i.cad && i.cad !== 'month' ? (i.cad === 'paycheck' ? ' per paycheck' : i.cad === 'year' ? ' a year' : i.cad === 'week' ? ' a week' : i.cad === 'oneoff' ? '' : ' per ' + i.cad) : ' a month');
  if (i.kind === 'percent') return (Math.round((i.value || 0) * 1000) / 10) + '%';
  if (i.rowId === 'sun' && i.field === 'birthDate') return String(i.value);
  return i.value === null || i.value === undefined ? 'not given' : String(i.value);
}
export function stateWord(i) { return i.state === 'rough' ? 'rough' : i.state === 'unknown' ? 'open' : i.state === 'will-send' ? 'waiting' : i.state === 'known' ? 'as said' : i.state || ''; }
export function confirmQuestions(record, result, data) {
  const c = confirmItems(record, result, data);
  return { said: c.said.map(i => Object.assign({}, i, { sentence: sayLine(i, data), given: givenText(i), stateWord: stateWord(i) })), guesses: c.guesses.map(g => Object.assign({}, g, { sentence: 'For ' + g.label.toLowerCase() + ' I guessed ' + dollars(g.cents) + ' a month' + (g.shared ? ' for the whole place, so about ' + dollars(Math.round(g.cents * (g.share || 0.5))) + ' as your share' : '') + '. Is yours close?' })), tierConfirmed: c.tierConfirmed, householdConfirmed: c.householdConfirmed };
}
function sayLine(i, data) {
  if (i.kind === 'money') return 'You said ' + (i.state === 'unknown' ? 'you did not know ' + i.label : i.state === 'will-send' ? 'you would send ' + i.label : (dollars(numberOf({ v: i.value, state: i.state, source: 'discovery' }) || 0) + (i.cad && i.cad !== 'month' ? ' per ' + (i.cad === 'paycheck' ? 'paycheck' : i.cad) : ' a month') + ' for ' + i.label)) + '. Still right?';
  if (i.rowId === 'sun') return 'You told me ' + (i.field === 'birthDate' ? 'your birth date' : i.field === 'city' ? 'you live in ' + i.value : 'you are ' + i.value) + '. Still right?';
  if (i.value === null || i.value === undefined) return 'You said ' + (i.state === 'will-send' ? 'you would send ' : 'you did not know ') + i.label + '. Still right?';
  return 'You said ' + String(i.value) + ' for ' + i.label + '. Still right?';
}
function dollars(c) { return '$' + Math.round((c || 0) / 100).toLocaleString('en-US'); }
