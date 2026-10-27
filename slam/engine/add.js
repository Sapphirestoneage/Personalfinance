// One way to add anything (S-237): Session and My numbers both call addWithAnswers, so the same answers always give
// the same saved item. The form (ui/add-form.js) asks; this file turns the answers into the item. Pure, no DOM.
//
// addWithAnswers(spine, { collection, type, label, amount, cadence, fat, answers }, today) -> { spine, id, firstPath, collection }
//   amount: what the amount box holds, read by type (a paycheck on salary: the yearly salary; by the hour: the rate;
//   1099 in lumps: the last 12 months; unemployment: a week; a card or account: the balance; a goal: the target).
//   null leaves it missing (never $0).

import { addItem, putFact, setPay, editIncome } from './edits.js';
import { getAt, setAt } from './spine.js';
import { inForce, addDays } from './spine.js';
import { PRESETS } from './schema.js';

// The income kinds the form offers first, in plain words, then the rest.
export const INCOME_FIRST = [['w2', 'Paycheck (W-2)'], ['1099', '1099 work'], ['unemployment', 'Unemployment'], ['side', 'Side money (not 1099)'], ['person', 'Money from a person']];
export const INCOME_MORE = [['tips', 'Tips'], ['rental', 'Rental income'], ['pension', 'Pension'], ['ss', 'Social Security'], ['other', 'Other income']];
export const INCOME_WORDS = Object.fromEntries([...INCOME_FIRST, ...INCOME_MORE]);
// How often, in plain words. Paychecks only come on a pay schedule.
export const OFTEN_WORDS = [['monthly', 'A month'], ['semimonthly', 'Twice a month'], ['biweekly', 'Every 2 weeks'], ['weekly', 'A week'], ['quarterly', 'A quarter'], ['yearly', 'A year']];
export const PAY_SCHEDULE = [['biweekly', 'Every 2 weeks'], ['semimonthly', 'Twice a month'], ['weekly', 'Weekly'], ['monthly', 'Monthly']];
export const W2_BASIS = [['salary', 'Salary'], ['hourly', 'By the hour'], ['both', 'Salary plus tips, overtime or commission']];
export const SELF_BASIS = [['steady', 'About the same each month'], ['lumpy', 'In lumps']];

// What goes in the name box, by what is being added.
export function namePlaceholder(collection, type) {
  if (collection === 'income') return 'Where it comes from, e.g. Hudson Valley Health';
  if (collection === 'expenses') return 'What it\'s for, e.g. Rent';
  if (collection === 'goals') return 'Goal, e.g. Trip to Lisbon';
  if (collection === 'debts') return type === 'credit_card' || !type ? 'Card name, e.g. Chase Freedom' : 'Loan, e.g. ' + (PRESETS[type] ? PRESETS[type].label : 'Car loan');
  return 'Account, e.g. Chase savings';
}

// The amount box's label, by type and answers.
export function amountWords(collection, type, answers = {}) {
  if (collection === 'income') {
    if (type === 'w2') return answers.payBasis === 'hourly' ? 'Per hour, before tax' : 'Yearly salary, before tax';
    if ((type === '1099' || type === 'side') && answers.payBasis === 'lumpy') return 'All of it over the last 12 months';
    if (type === 'unemployment') return 'How much a week';
    return 'How much, before tax';
  }
  if (collection === 'debts') return 'How much you owe';
  if (collection === 'accounts') return 'How much is in it';
  if (collection === 'goals') return 'How much you need';
  return 'How much';
}

// The first choice, from the situation in force today: between jobs starts on Unemployment, self-employed on 1099.
export function firstIncomeType(spine, today) {
  const now = inForce(spine.household && spine.household.situation, today);
  const s = now && now.value ? now.value.value : null;
  return s === 'between_jobs' ? 'unemployment' : s === 'self_employed' ? '1099' : 'w2';
}

export function addWithAnswers(spine, { collection, type, label, amount = null, cadence = 'monthly', fat = null, answers = {} }, today) {
  const name = String(label || '').trim() || (collection === 'income' ? INCOME_WORDS[type] || 'Income' : collection === 'expenses' ? 'New expense' : collection === 'goals' ? 'New goal' : (PRESETS[type] || {}).label);
  if (collection !== 'income') {
    const made = addItem(spine, { collection, type, label: name, cadence, fat }, today);
    if (amount === null) return { ...made, collection };
    return { ...made, collection, spine: putFact(made.spine, made.firstPath, amount, 'known', today) };
  }
  const a = answers || {};
  // Money from a person that is a loan is a debt you owe, not income.
  if (type === 'person' && a.purpose === 'loan') {
    const r = addItem(spine, { collection: 'debts', type: 'family_iou', label: 'Owed to ' + (String(a.from || '').trim() || 'a person') }, today);
    return { ...r, collection: 'debts', spine: amount === null ? r.spine : putFact(r.spine, r.firstPath, amount, 'known', today) };
  }
  const often = type === 'w2' ? (PAY_SCHEDULE.some(([k]) => k === cadence) ? cadence : 'biweekly') : type === 'unemployment' ? 'weekly' : cadence;
  const made = addItem(spine, { collection: 'income', type, label: name, cadence: often }, today);
  const id = made.id, base = 'income.' + id;
  let s = made.spine;
  if (type === 'w2') {
    const basis = a.payBasis === 'hourly' ? 'hourly' : 'salary';
    s = setPay(s, id, basis === 'hourly' ? { basis, hourlyRate: amount, hoursPerWeek: a.hoursPerWeek ?? null, cadence: often } : { basis, salary: amount, cadence: often }, today);
    if (a.payBasis === 'both') s = addItem(s, { collection: 'income', type: 'tips', label: name + ': tips, overtime, commission' }, today).spine;
  } else if ((type === '1099' || type === 'side') && a.payBasis === 'lumpy') {
    s = setPay(s, id, { basis: 'lumpy', yearTotal: amount }, today);
  } else {
    s = editIncome(s, id, { amount, cadence: often }, today);
    if (type === '1099' || type === 'side') s = setPay(s, id, { basis: 'steady' }, today);
  }
  if (type === 'unemployment') {
    const end = a.endDate || (Number.isInteger(a.weeksLeft) ? addDays(today, a.weeksLeft * 7) : null);
    if (end) s = editIncome(s, id, { amount, cadence: 'weekly', end }, today);
  }
  if (type === 'person') {
    if (a.from) s = putFact(s, base + '.from', String(a.from).trim(), 'known', today);
    if (a.purpose) s = putFact(s, base + '.purpose', a.purpose, 'known', today);
    if (a.purpose === 'allowance') s = putFact(s, base + '.allowanceMode', 'gift', 'known', today);
  }
  return { spine: s, id, firstPath: made.firstPath, collection: 'income' };
}

// The add form's "More options" (slim by default), set on the item just made: institution, the rate (a debt's APR, a
// cash account's APY, a fixed-term rate), a debt's minimum and due day, the date the amount is as of, and a note on
// the amount. Blank leaves the field as it was: missing, never 0.
// What to ask about a new account, by its family (owner, 2026-10-27, S-264): each a field of engine/schema.js FAMILIES,
// so it lands where My numbers already reads it. [key, label, type, hint or options]; a choice lists [value, words].
export const ACCOUNT_DETAILS = {
  employerRetirement: [
    ['monthlyContribution', 'You put in a month', 'money', 'e.g. 500'],
    ['matchRate', 'Employer match: this share of what you put in', 'rate', 'e.g. 50'],
    ['matchCap', 'Up to this share of your pay', 'rate', 'e.g. 6'],
    ['vestingType', 'The employer\'s money is yours', 'choice', [['immediate', 'Right away'], ['cliff', 'All at once after some years (cliff)'], ['graded', 'A share each year (graded)']]],
    ['vestingYears', 'Years until it is all yours', 'int', 'e.g. 3'],
    ['employerType', 'Employer', 'choice', [['private', 'A company'], ['nonprofit', 'A nonprofit'], ['government', 'State or local government'], ['federal', 'Federal government'], ['self', 'Self-employed']]],
    ['loanBalance', 'A loan from this plan, owed', 'money', 'e.g. 3,000']
  ],
  ira: [
    ['monthlyContribution', 'You put in a month', 'money', 'e.g. 300'],
    ['basis', 'Put in so far (your contributions)', 'money', 'e.g. 12,000'],
    ['coveredByWorkplacePlan', 'Also covered by a plan at work?', 'bool', null]
  ],
  hsaFsa: [
    ['coverageLevel', 'Health plan covers', 'choice', [['self', 'Just me'], ['family', 'Family']]],
    ['monthlyContribution', 'You put in a month', 'money', 'e.g. 200'],
    ['employerSeed', 'Employer puts in a year', 'money', 'e.g. 500'],
    ['throughPayroll', 'Taken out of your paycheck?', 'bool', null],
    ['investedPortion', 'Of it, invested', 'money', 'e.g. 2,000']
  ],
  cash: [['role', 'What it is for', 'choice', [['spending', 'Everyday spending'], ['emergency', 'Emergency fund'], ['sinking', 'Saving for something'], ['holding', 'Holding money']]]],
  fixedTerm: [['maturityDate', 'Matures on', 'date', null]],
  taxable: [
    ['monthlyContribution', 'You put in a month', 'money', 'e.g. 200'],
    ['costBasis', 'Paid in so far (cost basis)', 'money', 'e.g. 8,000']
  ],
  education: [
    ['beneficiary', 'For whom', 'text', 'e.g. Maya'],
    ['childBirthYear', 'Their birth year', 'int', 'e.g. 2018'],
    ['monthlyContribution', 'You put in a month', 'money', 'e.g. 100']
  ],
  otherAssets: [
    ['incomeProduced', 'It pays you a month', 'money', 'e.g. 1,200'],
    ['appreciationRate', 'Grows a year', 'rate', 'e.g. 3']
  ]
};
export const accountDetails = (type) => ACCOUNT_DETAILS[(PRESETS[type] || {}).family] || [];
// Writes the details typed (already parsed) onto the new account, each as known.
export function addDetails(made, details, today) {
  if (made.collection !== 'accounts') return made;
  const base = made.firstPath.split('.').slice(0, 2).join('.');
  let s = made.spine;
  for (const [k, value] of Object.entries(details)) if (value !== null && value !== undefined && value !== '') s = putFact(s, base + '.' + k, value, 'known', today);
  return { ...made, spine: s };
}
export function moreFields(collection, type) {
  const fam = (PRESETS[type] || {}).family;
  if (collection === 'debts') return ['institution', 'rate', 'minimum', 'dueDay', ...(type === 'credit_card' ? ['annualFee'] : []), 'asOf', 'note'];
  if (collection === 'accounts') return ['institution', ...(fam === 'cash' || fam === 'fixedTerm' ? ['rate'] : []), 'asOf', 'note'];
  return ['asOf', 'note'];
}
export function addMore(made, more = {}, today) {
  const base = made.firstPath.split('.').slice(0, 2).join('.');
  const item = getAt(made.spine, base) || {};
  const fam = (PRESETS[item.type] || {}).family;
  const rateField = made.collection === 'debts' ? 'apr' : fam === 'cash' ? 'apy' : 'rate';
  let s = made.spine;
  for (const k of ['institution', 'rate', 'minimum', 'dueDay', 'annualFee']) if (more[k] !== null && more[k] !== undefined && more[k] !== '') s = putFact(s, base + '.' + (k === 'rate' ? rateField : k), more[k], 'known', today);
  const f = getAt(s, made.firstPath);
  if (f && f.value !== null && f.value !== undefined && ((more.asOf && more.asOf !== f.asOf) || more.note)) s = setAt(s, made.firstPath, { ...f, ...(more.asOf ? { asOf: more.asOf } : {}), ...(more.note ? { note: String(more.note).trim().slice(0, 200) } : {}) });
  return { ...made, spine: s };
}
