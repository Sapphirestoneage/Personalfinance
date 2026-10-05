/* The leverage engine: which unsure fact to ask about next.
   leverage = categoryWeight x itemWeight x (1 - confidence) x materiality.
   Weights live in data/weights.json. Materiality comes from the dollars the
   fact moves a year; under the $100 line it is a Small Win. Outputs: the
   next-question card (one big, two smaller), the ranked circle-back list,
   my plate and their plate. v2 (not built): leverage by FI-date sensitivity. */
import { plateItems } from './plates.js';
import { confidenceOf, hasValue, numberOf } from './states.js';
import { cadenceToMonthly } from './units.js';

const CATEGORY_OF_SPENDING = { accommodation: 'accommodation', utilities: 'utilities', food: 'food', transportation: 'transportation', therapy: 'spending', wants: 'spending', irregular: 'spending', mistakes: 'spending', other: 'spending' };
const PAYCHECKS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

function annualDollars(row, fid, def) {
  const f = row.f[fid];
  if (!f || !hasValue(f)) return null;
  const n = numberOf(f);
  if (n === null || def.kind !== 'money') return null;
  if (def.cadence) { const pf = row.f.payFrequency && hasValue(row.f.payFrequency) ? row.f.payFrequency.v : 'biweekly'; return cadenceToMonthly(n, f.cad || 'month', PAYCHECKS[pf] || 26) * 12; }
  return n;
}

/* Rank every unsure fact. ctx: { record, fields, weights, metrics } */
export function rankLeverage(ctx) {
  const { record, fields, weights } = ctx;
  const items = plateItems(record, fields);
  const rows = {}; Object.keys(record.planets).forEach(p => record.planets[p].rows.forEach(r => { rows[r.id] = r; }));
  const mat = weights.materiality;
  return items.map(it => {
    const row = rows[it.rowId];
    const def = it.field === 'quickNote' ? null : fields.fields[it.field];
    let category = it.planet;
    if (it.planet === 'spending' && row) { const cat = row.f.category && hasValue(row.f.category) ? row.f.category.v : 'other'; category = CATEGORY_OF_SPENDING[cat] || 'spending'; }
    if (it.planet === 'sun') category = 'sun';
    const catW = weights.categories[category] || 5;
    const itemW = it.planet === 'sun' ? (weights.sunItems[it.field] || 5) : (def ? def.weight : 3);
    const f = it.rowId === 'sun' ? record.sun.f[it.field] : (row ? row.f[it.field] : null);
    const conf = it.note ? 0 : confidenceOf(f);
    /* materiality: dollars the fact moves a year; a non-money fact borrows its row's headline figure */
    const moneyFact = !!(def && def.kind === 'money');
    let dollars = def ? annualDollars(row, it.field, def) : null;
    if (dollars === null && row) { const prim = Object.keys(row.f).find(k => fields.fields[k] && fields.fields[k].primary); if (prim) dollars = annualDollars(row, prim, fields.fields[prim]); }
    if (dollars === null) dollars = it.planet === 'sun' ? mat.largeAboveAnnualCents : mat.trivialBelowAnnualCents;
    const abs = Math.abs(dollars);
    const small = abs < mat.trivialBelowAnnualCents && it.planet !== 'sun' && !(def && (def.kind === 'percent' || def.kind === 'choice' || def.kind === 'month'));
    const materiality = small ? mat.trivial : abs >= mat.largeAboveAnnualCents ? mat.large : abs >= mat.trivialBelowAnnualCents * 10 ? mat.normal : mat.small;
    const leverage = Math.round(catW * itemW * (1 - conf) * materiality * 100) / 100;
    return Object.assign({}, it, { category, catW, itemW, confidence: conf, dollarsAnnual: dollars, moneyFact, materiality, small, leverage, question: questionFor(it, row, def, fields) });
  }).sort((a, b) => b.leverage - a.leverage);
}

/* The sentence Eli asks. Plain, specific, one fact. */
export function questionFor(it, row, def, fields) {
  if (it.note) return it.label;
  if (it.rowId === 'sun') return ({ name: 'What name should go on the one-pager?', birthDate: 'What is the birth date?', state: 'Which state is home?', city: 'Which city?', workSituation: 'How would you describe work right now: employed, self-employed, between jobs, a student, retired, or a mix?', dependents: 'How many dependents?', filingStatus: 'How do you file: single, married filing jointly, or head of household?', bigGoal: 'What is the one big goal?' })[it.field] || 'What is the ' + it.field + '?';
  const who = row && row.nickname ? row.nickname : (fields.planets[it.planet].types[row ? row.type : ''] || {}).label || 'this';
  const where = row && row.institution ? ' at ' + row.institution : '';
  const label = def.label.toLowerCase();
  if (it.state === 'rough') return 'You said roughly ' + describe(row, it.field, def) + ' for ' + who + where + ' ' + label + '. Can we pin it down?';
  if (it.state === 'will-send') return 'When the ' + label + ' for ' + who + where + ' arrives, where will it come from?';
  if (it.source === 'estimated') return 'The ' + label + ' for ' + who + ' is a national average. What is yours?';
  if (it.source === 'lookup-verify') return 'I looked up the ' + label + ' for ' + who + where + '. Does it match your statement?';
  return 'What is the ' + label + ' for ' + who + where + '?';
}
function describe(row, fid, def) {
  const f = row && row.f[fid]; if (!f || !hasValue(f)) return 'something';
  const v = f.v;
  if (def.kind === 'money') { if (v && typeof v === 'object') return '$' + Math.round(v.low / 100).toLocaleString('en-US') + ' to $' + Math.round(v.high / 100).toLocaleString('en-US'); return '$' + Math.round(v / 100).toLocaleString('en-US'); }
  if (def.kind === 'percent') return (Math.round(v * 1000) / 10) + '%';
  return String(v);
}

/* The next-question card: one big, two smaller; plates; circle-back list; small wins. */
export function session(ctx) {
  const ranked = rankLeverage(ctx);
  const big = ranked.filter(i => !i.small);
  return {
    next: big.slice(0, 3),
    circleBack: big.slice(3),
    smallWins: ranked.filter(i => i.small),
    myPlate: ranked.filter(i => i.plate === 'mine' && !i.small),
    theirPlate: ranked.filter(i => i.plate === 'theirs' && !i.small),
    all: ranked,
  };
}
