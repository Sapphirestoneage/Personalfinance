// The Profile (Phase 2.5 B3, docs/specs/profile-questions.md): how the client's life works right now, in three levels.
// Level 1 is answered before the first call (taps only, "Not sure" always allowed, areas in any order); Level 2 is asked
// in the session, only for what Level 1 ticked; Level 3 is the homework: every Level 2 question can be known now, looked
// up later (a to-do with where to find it) or not sure (a rough default, listed in Still guessing).
//
// Every answer is a Fact in spine.profile (the Profile layer). Every question changes at least one of: which fields
// show, what a number means, the starting guess, or what the app does (its `does`). Changing an answer hides fields,
// never deletes them; switching back shows what was typed. Each change is a life change in spine.lifeChanges (History).
// A number (a balance, an amount) never changes which fields show: fieldsFor reads the answers only.
//
// Pure functions; the pages call them through the shell's change(), so Undo takes any of it back.

import { fact, setAt, getAt, valueOf as v, whoSupplies } from './spine.js';
import { setPay } from './edits.js';

export const NOT_SURE = 'notSure';
const YES_NO = [['yes', 'Yes'], ['no', 'No']];

// ---------------------------------------------------------------- Level 1: before the first call
// { id, area, label, kind: one | many | text | year | state | date | count, options, when(answers), does }
export const AREAS = [
  ['you', 'You'], ['home', 'Home'], ['around', 'Getting around'], ['work', 'Work'], ['people', 'Money with other people'],
  ['debt', 'Debt'], ['accounts', 'Accounts'], ['health', 'Health'], ['style', 'Spending style'], ['goals', 'Goals']
];
export const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const W2 = (a) => ['w2', 'both'].includes(ans(a, 'work'));
const SELF = (a) => ['self', 'both'].includes(ans(a, 'work'));
export const LEVEL1 = [
  { id: 'firstName', area: 'you', label: 'Your first name', kind: 'text', does: 'Names the household on every page.' },
  { id: 'birthYear', area: 'you', label: 'The year you were born', kind: 'year', does: 'Sets your age for the cushion target, Coast FI and the turning-26 switch.' },
  { id: 'state', area: 'you', label: 'The state you live in', kind: 'state', does: 'Picks the state tax.' },
  { id: 'livesWith', area: 'you', label: 'Who lives with you?', kind: 'many', options: [['alone', 'Just me'], ['partner', 'A partner'], ['kids', 'Kids'], ['adults', 'Other adults']], exclusive: ['alone'], does: 'Kids shows childcare; with a partner or other adults, a new housing or food line starts shared, half each.' },
  { id: 'tone', area: 'you', label: 'How should I talk to you?', kind: 'one', options: [['gentle', 'Gently'], ['straight', 'Straight to it'], ['numbers', 'Numbers only']], does: 'Sets how Today words the next step; it never changes a number.' },
  { id: 'home', area: 'home', label: 'Where do you live?', kind: 'one', options: [['rent', 'I rent'], ['own', 'I own'], ['roommates', 'With roommates'], ['family', 'With family']], does: 'Shows rent or a mortgage and the bills that go with it.' },
  { id: 'roommates', area: 'home', label: 'How many roommates?', kind: 'one', options: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4 or more']], when: (a) => ans(a, 'home') === 'roommates', does: 'Rent and the bills read as your share.' },
  { id: 'whoseFamily', area: 'home', label: 'Whose family?', kind: 'one', options: [['parents', 'My parents'], ['partner', 'A partner\'s family'], ['other', 'Other family']], when: (a) => ans(a, 'home') === 'family', does: 'Names who covers the bills they pay for you.' },
  { id: 'familyPay', area: 'home', label: 'What do you pay your family?', kind: 'one', options: [['rent', 'Rent'], ['bills', 'Some bills'], ['nothing', 'Nothing']], when: (a) => ans(a, 'home') === 'family', does: 'Rent becomes "paid to family"; utilities are covered unless you pay bills.' },
  { id: 'ownLoan', area: 'home', label: 'Is there a mortgage?', kind: 'one', options: [['mortgage', 'A mortgage'], ['paidOff', 'Paid off']], when: (a) => ans(a, 'home') === 'own', does: 'Shows the mortgage, or only the property tax and insurance.' },
  { id: 'moving', area: 'home', label: 'Moving in the next year?', kind: 'one', options: [['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']], does: 'Adds moving costs as a goal to plan for.' },
  { id: 'getAround', area: 'around', label: 'How do you get around?', kind: 'one', options: [['car', 'My own car'], ['carLoan', 'A car with a loan'], ['lease', 'A leased car'], ['transit', 'Transit'], ['rideshare', 'Rideshare'], ['mix', 'A mix']], does: 'Shows the car costs, a loan or lease, transit or rides.' },
  { id: 'work', area: 'work', label: 'What kind of work?', kind: 'one', options: [['w2', 'A job (W-2)'], ['self', 'Self-employed'], ['both', 'Both'], ['between', 'Between jobs'], ['student', 'Student'], ['retired', 'Retired']], does: 'Shows the pay fields that fit and the tax set-aside on self-employed pay.' },
  { id: 'payType', area: 'work', label: 'How are you paid?', kind: 'one', options: [['salary', 'Salary'], ['hourly', 'By the hour'], ['mix', 'Some of each']], when: W2, does: 'Salary is a yearly amount; by the hour is rate x hours.' },
  { id: 'payOften', area: 'work', label: 'How often?', kind: 'one', options: [['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['semimonthly', 'Twice a month'], ['monthly', 'Once a month']], when: W2, does: 'Puts paydays on the Calendar.' },
  { id: 'extras', area: 'work', label: 'Any extras?', kind: 'many', options: [['bonus', 'Bonus'], ['overtime', 'Overtime'], ['tips', 'Tips'], ['commission', 'Commission'], ['none', 'None']], exclusive: ['none'], when: W2, does: 'Each extra gets its own line, so the steady part stays steady.' },
  { id: 'offers', area: 'work', label: 'What does work offer?', kind: 'many', options: [['k401', '401(k) or similar'], ['health', 'Health insurance'], ['hsa', 'HSA'], ['fsa', 'FSA']], when: W2, does: 'Opens those accounts in the session.' },
  { id: 'quarterly', area: 'work', label: 'Paying quarterly taxes?', kind: 'one', options: YES_NO, when: SELF, does: 'No or not sure turns on a set-aside on every deposit.' },
  { id: 'unemployment', area: 'work', label: 'Getting unemployment?', kind: 'one', options: YES_NO, when: (a) => ans(a, 'work') === 'between', does: 'Shows the weekly benefit and its end date.' },
  { id: 'unemploymentEnd', area: 'work', label: 'When does it end? (if you know)', kind: 'date', when: (a) => ans(a, 'work') === 'between' && ans(a, 'unemployment') === 'yes', does: 'Ends the benefit on the Calendar.' },
  { id: 'publicService', area: 'work', label: 'Work for a nonprofit, government or school?', kind: 'one', options: YES_NO, does: 'Shows Public Service Loan Forgiveness on federal student loans.' },
  { id: 'getMoney', area: 'people', label: 'Get money from family or a partner?', kind: 'one', options: YES_NO, does: 'Shows money from a person, taxed the right way.' },
  { id: 'getMoneyFor', area: 'people', label: 'What is it?', kind: 'many', options: [['gift', 'Gift or support'], ['allowance', 'Allowance'], ['childSupport', 'Child support'], ['alimony', 'Alimony'], ['loan', 'A loan']], when: (a) => ans(a, 'getMoney') === 'yes', does: 'A gift and child support are not taxed; a loan becomes a debt.' },
  { id: 'give', area: 'people', label: 'Do you give money regularly?', kind: 'many', options: [['family', 'Family support'], ['tzedakah', 'Tzedakah or maaser'], ['childSupport', 'Child support'], ['none', 'None']], exclusive: ['none'], does: 'Shows each as a line; maaser as a share of pay.' },
  { id: 'applyCredit', area: 'debt', label: 'Planning to apply for credit in the next 12 months?', kind: 'one', options: [['yes', 'Yes'], ['no', 'No']], does: 'A loan, a card or a lease: card use then comes first, since it is part of a credit score.' },
  { id: 'debts', area: 'debt', label: 'Which debts do you have?', kind: 'many', options: [['cards', 'Credit cards'], ['student', 'Student loans'], ['car', 'Car'], ['mortgage', 'Mortgage'], ['personal', 'Personal loan'], ['family', 'Owed to family'], ['bnpl', 'Buy now, pay later'], ['medical', 'Medical'], ['none', 'None']], exclusive: ['none'], does: 'Opens each debt in the session.' },
  { id: 'studentType', area: 'debt', label: 'Student loans: federal or private?', kind: 'one', options: [['federal', 'Federal'], ['private', 'Private'], ['both', 'Some of each']], when: (a) => has(a, 'debts', 'student'), does: 'Federal loans show plans and forgiveness.' },
  { id: 'cardsFull', area: 'debt', label: 'In the last 3 months, did you pay the full statement?', kind: 'one', options: [['always', 'Always'], ['sometimes', 'Sometimes'], ['no', 'No']], when: (a) => has(a, 'debts', 'cards'), does: 'Always means cards are paid in full; otherwise the rate matters.' },
  { id: 'behind', area: 'debt', label: 'Behind on any payment right now?', kind: 'one', options: YES_NO, does: 'Yes opens "When it won\'t all get paid" first.' },
  { id: 'accounts', area: 'accounts', label: 'Which accounts do you have?', kind: 'many', options: [['checking', 'Checking'], ['savings', 'Savings'], ['k401', '401(k) or similar'], ['ira', 'IRA'], ['hsa', 'HSA'], ['brokerage', 'Brokerage'], ['crypto', 'Crypto'], ['none', 'None']], exclusive: ['none'], does: 'Opens each account in the session.' },
  { id: 'emergencySeparate', area: 'accounts', label: 'Emergency money kept apart from checking?', kind: 'one', options: YES_NO, does: 'Yes shows an emergency fund account.' },
  { id: 'health', area: 'health', label: 'Where is your health insurance from?', kind: 'one', options: [['work', 'Work'], ['parent', 'A parent\'s plan'], ['marketplace', 'Marketplace'], ['medicaid', 'Medicaid'], ['none', 'None']], does: 'A parent\'s plan sets the turning-26 switch on the Calendar.' },
  { id: 'tracking', area: 'style', label: 'How do you keep track now?', kind: 'one', options: [['none', 'I don\'t'], ['app', 'An app'], ['spreadsheet', 'A spreadsheet'], ['statements', 'Statements']], does: 'Spending opens on what fits: adding purchases, or importing a statement.' },
  { id: 'goals', area: 'goals', label: 'Pick your top 3', kind: 'many', max: 3, options: [['emergency', 'An emergency fund'], ['debtFree', 'Out of debt'], ['home', 'Buy a home'], ['car', 'A car'], ['travel', 'Travel'], ['wedding', 'A wedding'], ['kids', 'Kids'], ['invest', 'Start investing'], ['business', 'Start a business'], ['school', 'School']], does: 'Adds those goals, ready for an amount and a date.' },
  { id: 'fi', area: 'goals', label: 'Financial independence?', kind: 'one', options: [['yes', 'Yes'], ['curious', 'Curious'], ['notNow', 'Not now']], does: 'Not now keeps FI off Today.' }
];
const L1 = new Map(LEVEL1.map((q) => [q.id, q]));

// ---------------------------------------------------------------- reading the answers
// answers: a plain map { id: value } (the before-call page keeps one), or read from a spine's Facts.
export const answersOf = (spine) => Object.fromEntries(Object.entries((spine && spine.profile) || {}).map(([k, f]) => [k, v(f)]).filter(([, x]) => x !== null && x !== undefined));
export function ans(a, id) { const x = a ? a[id] : null; return x === undefined ? null : x; }
export function has(a, id, val) { const x = ans(a, id); return Array.isArray(x) ? x.includes(val) : x === val; }
// Open: not answered, not sure, or one of vals. A field shows while its question is open, so nothing is hidden before
// the client says so.
const open = (a, id, vals) => { const x = ans(a, id); if (x === null || x === NOT_SURE) return true; return Array.isArray(x) ? vals.some((y) => x.includes(y)) : vals.includes(x); };
export const asked = (a, q) => !q.when || q.when(a);

// ---------------------------------------------------------------- what the answers set up
// The fields a profile can show or hide, with their section (the DATING letter), their words, and when they show.
// Expense keys match the Session's starter lines (data/session-presets.json) and a line's own key or id.
const FIELDS = [
  ['rent', 'N', (a) => (ans(a, 'home') === 'roommates' ? 'Rent, your share' : 'Rent'), (a) => open(a, 'home', ['rent', 'roommates', 'other'])],
  ['renters-insurance', 'N', 'Renter\'s insurance', (a) => open(a, 'home', ['rent', 'roommates', 'other'])],
  ['mortgage', 'N', 'Mortgage payment', (a) => ans(a, 'home') === null || ans(a, 'home') === NOT_SURE || (ans(a, 'home') === 'own' && open(a, 'ownLoan', ['mortgage']))],
  ['property-tax', 'N', 'Property tax', (a) => open(a, 'home', ['own'])],
  ['home-insurance', 'N', 'Home insurance', (a) => open(a, 'home', ['own'])],
  ['utilities', 'N', (a) => (ans(a, 'home') === 'roommates' ? 'Utilities, your share' : 'Utilities'), () => true],
  ['internet', 'N', 'Internet', () => true],
  ['pay-family', 'N', 'Rent paid to family', (a) => ans(a, 'home') === 'family' && open(a, 'familyPay', ['rent'])],
  ['car-payment', 'N', 'Car payment', (a) => open(a, 'getAround', ['carLoan', 'mix'])],
  ['lease', 'N', 'Lease payment', (a) => open(a, 'getAround', ['lease', 'mix'])],
  ['car-insurance', 'N', 'Car insurance', (a) => open(a, 'getAround', ['car', 'carLoan', 'lease', 'mix'])],
  ['car-gas', 'N', 'Gas', (a) => open(a, 'getAround', ['car', 'carLoan', 'lease', 'mix'])],
  ['car-upkeep', 'N', 'Car upkeep', (a) => open(a, 'getAround', ['car', 'carLoan', 'lease', 'mix'])],
  ['transit', 'N', 'Transit', (a) => open(a, 'getAround', ['transit', 'mix'])],
  ['rides', 'N', 'Rides', (a) => open(a, 'getAround', ['rideshare', 'transit', 'mix'])],
  ['childcare', 'N', 'Childcare', (a) => has(a, 'livesWith', 'kids')],
  ['family-support', 'N', 'Family support you give', (a) => has(a, 'give', 'family')],
  ['tzedakah', 'N', 'Tzedakah or maaser', (a) => has(a, 'give', 'tzedakah')],
  ['child-support-paid', 'N', 'Child support you pay', (a) => has(a, 'give', 'childSupport')],
  ['salary', 'I', 'Yearly salary', (a) => W2(a) && open(a, 'payType', ['salary', 'mix'])],
  ['hourly', 'I', 'Hourly rate x usual hours a week', (a) => W2(a) && open(a, 'payType', ['hourly', 'mix'])],
  ['bonus', 'I', 'Bonus', (a) => W2(a) && has(a, 'extras', 'bonus')],
  ['overtime', 'I', 'Overtime', (a) => W2(a) && has(a, 'extras', 'overtime')],
  ['tips', 'I', 'Tips', (a) => W2(a) && has(a, 'extras', 'tips')],
  ['commission', 'I', 'Commission', (a) => W2(a) && has(a, 'extras', 'commission')],
  ['self-pay', 'I', 'Self-employed pay (1099)', SELF],
  ['set-aside', 'T', 'Tax set-aside on every deposit', (a) => SELF(a) && open(a, 'quarterly', ['no'])],
  ['estimated-payments', 'T', 'Quarterly estimated payments made', (a) => SELF(a) && [null, 'yes'].includes(ans(a, 'quarterly'))],
  ['unemployment', 'I', 'Unemployment a week', (a) => ans(a, 'work') === 'between' && open(a, 'unemployment', ['yes'])],
  ['gift-in', 'I', 'Gift or support from a person', (a) => has(a, 'getMoneyFor', 'gift')],
  ['allowance', 'I', 'Allowance', (a) => has(a, 'getMoneyFor', 'allowance')],
  ['child-support-in', 'I', 'Child support you get', (a) => has(a, 'getMoneyFor', 'childSupport')],
  ['alimony-in', 'I', 'Alimony you get', (a) => has(a, 'getMoneyFor', 'alimony')],
  ['family-loan', 'D', 'Loan from a person', (a) => has(a, 'getMoneyFor', 'loan') || has(a, 'debts', 'family')],
  ['cards', 'D', 'Credit cards', (a) => has(a, 'debts', 'cards')],
  ['student-federal', 'D', 'Federal student loans', (a) => has(a, 'debts', 'student') && open(a, 'studentType', ['federal', 'both'])],
  ['student-private', 'D', 'Private student loans', (a) => has(a, 'debts', 'student') && open(a, 'studentType', ['private', 'both'])],
  ['pslf', 'D', 'Public Service Loan Forgiveness', (a) => has(a, 'debts', 'student') && open(a, 'studentType', ['federal', 'both']) && ans(a, 'publicService') === 'yes'],
  ['car-loan', 'D', 'Car loan', (a) => has(a, 'debts', 'car') || ans(a, 'getAround') === 'carLoan'],
  ['mortgage-loan', 'D', 'Mortgage', (a) => has(a, 'debts', 'mortgage') || (ans(a, 'home') === 'own' && ans(a, 'ownLoan') === 'mortgage')],
  ['personal-loan', 'D', 'Personal loan', (a) => has(a, 'debts', 'personal')],
  ['bnpl', 'D', 'Buy now, pay later', (a) => has(a, 'debts', 'bnpl')],
  ['medical-debt', 'D', 'Medical debt', (a) => has(a, 'debts', 'medical')],
  ['checking', 'A', 'Checking', (a) => open(a, 'accounts', ['checking'])],
  ['savings', 'A', 'Savings', (a) => has(a, 'accounts', 'savings')],
  ['emergency-fund', 'A', 'Emergency fund', (a) => ans(a, 'emergencySeparate') === 'yes'],
  ['k401', 'A', '401(k) or similar', (a) => has(a, 'accounts', 'k401') || has(a, 'offers', 'k401')],
  ['ira', 'A', 'IRA', (a) => has(a, 'accounts', 'ira')],
  ['hsa', 'A', 'HSA', (a) => has(a, 'accounts', 'hsa') || has(a, 'offers', 'hsa')],
  ['fsa', 'A', 'FSA', (a) => has(a, 'offers', 'fsa')],
  ['brokerage', 'A', 'Brokerage', (a) => has(a, 'accounts', 'brokerage')],
  ['crypto', 'A', 'Crypto', (a) => has(a, 'accounts', 'crypto')],
  ['health-premium', 'N', 'Health insurance premium', (a) => open(a, 'health', ['marketplace', 'work'])],
  ['turning-26', 'T', 'Turning 26: a parent\'s plan ends', (a) => ans(a, 'health') === 'parent'],
  ['moving', 'G', 'Moving costs', (a) => ['yes', 'maybe'].includes(ans(a, 'moving'))],
  ['fi-goal', 'G', 'Financial independence', (a) => ans(a, 'fi') !== 'notNow']
];
export const FIELD_KEYS = FIELDS.map(([k]) => k);
// Expense lines a profile can hide (the N fields); a line's key is its own `key`, else its id.
const LINE_KEYS = new Set(FIELDS.filter(([, sec]) => sec === 'N').map(([k]) => k));
const word = (w, a) => (typeof w === 'function' ? w(a) : w);

// fieldsFor(answers) -> { shown: [{ key, section, label }], hidden: [key], covered: { key: by }, meaning: { key: words },
// does: [what the app does], setup: { area: line } }. Depends on the answers only; the order they were given in does
// not matter.
export function fieldsFor(a = {}) {
  const shown = [], hidden = [];
  for (const [key, section, label, when] of FIELDS) if (when(a)) shown.push({ key, section, label: word(label, a) }); else hidden.push(key);
  const covered = {};
  // Living with family: rent becomes "Rent paid to family" (hidden when you pay them nothing or only bills), and
  // utilities and internet default to covered, unless you pay some bills.
  // Whose family covers them (question 96): parents, a partner's family, or other family; unsaid reads Family.
  const family = { parents: 'Parents', partner: 'Partner\'s family', other: 'Family' }[ans(a, 'whoseFamily')] || 'Family';
  if (ans(a, 'home') === 'family' && ans(a, 'familyPay') !== 'bills') { covered.utilities = family; covered.internet = family; }
  const meaning = {};
  if (W2(a) && ans(a, 'payType') === 'hourly') meaning.pay = 'hourly rate x usual hours a week x 52 / 12, a month';
  else if (W2(a) && ans(a, 'payType') === 'salary') meaning.pay = 'yearly salary / 12, a month';
  else if (W2(a) && ans(a, 'payType') === 'mix') meaning.pay = 'yearly salary / 12, plus hourly rate x hours';
  if (ans(a, 'home') === 'roommates') meaning.rent = 'your share of the rent, not the whole rent';
  if (ans(a, 'home') === 'family') meaning.rent = 'what you pay your family';
  const does = [];
  if (ans(a, 'behind') === 'yes') does.push({ id: 'behindFirst', words: 'Plan opens on "When it won\'t all get paid" first.' });
  if (SELF(a) && open(a, 'quarterly', ['no'])) does.push({ id: 'setAsideEveryDeposit', words: 'Every self-employed deposit sets tax aside.' });
  if (has(a, 'debts', 'cards')) does.push({ id: 'cardPay', words: ans(a, 'cardsFull') === 'always' ? 'Cards are paid in full each month.' : 'Cards carry a balance, so each card\'s rate matters.' });
  if (ans(a, 'health') === 'parent') does.push({ id: 'turning26', words: 'The Calendar shows the day a parent\'s plan ends at 26.' });
  if (ans(a, 'tracking')) does.push({ id: 'spendingStart', words: ans(a, 'tracking') === 'none' ? 'Spending opens on adding a purchase.' : 'Spending opens on importing a statement.' });
  if (ans(a, 'tone')) does.push({ id: 'tone', words: ans(a, 'tone') === 'gentle' ? 'Today starts with one gentle next step.' : ans(a, 'tone') === 'numbers' ? 'Today shows the numbers and the button, without the sentences.' : 'Today says what to do first, plainly.' });
  if (ans(a, 'fi') === 'notNow') does.push({ id: 'fiOff', words: 'FI stays off Today.' });
  return { shown, hidden, covered, meaning, does, setup: setupLines(a, shown, covered) };
}
export const shows = (a, key) => fieldsFor(a).shown.some((f) => f.key === key);
// A Session starter line shows unless the profile hides it (a line the profile does not know about always shows).
export const showsKey = (a, key) => !FIELD_KEYS.includes(key) || shows(a, key);
// The Level 1 question a line waits on before a typical amount fills it (housing and getting around).
export const waitsOn = (key) => (['rent', 'pay-family', 'renters-insurance', 'mortgage', 'property-tax', 'home-insurance'].includes(key) ? 'home' : ['car-payment', 'lease', 'car-insurance', 'car-gas', 'car-upkeep', 'transit', 'rides'].includes(key) ? 'getAround' : null);

// One line per area, saying what it set up ("Rent, your share; utilities, your share").
function setupLines(a, shown, covered) {
  const by = (sec, keys) => shown.filter((f) => f.section === sec && (!keys || keys.includes(f.key))).map((f) => f.label);
  const list = (xs) => (xs.length ? xs.join(', ') : 'nothing yet');
  const out = {};
  const answered = (area) => LEVEL1.some((q) => q.area === area && ans(a, q.id) !== null);
  if (answered('you')) out.you = [ans(a, 'firstName'), ans(a, 'birthYear') ? 'born ' + ans(a, 'birthYear') : null, ans(a, 'state') && ans(a, 'state') !== NOT_SURE ? ans(a, 'state') + ' tax' : null, has(a, 'livesWith', 'kids') ? 'childcare shown' : null].filter(Boolean).join('; ') || 'Nothing yet';
  if (answered('home')) out.home = 'Shows ' + list(by('N', ['rent', 'pay-family', 'renters-insurance', 'mortgage', 'property-tax', 'home-insurance', 'utilities', 'internet'])) + (ans(a, 'home') === 'family' ? '; ' + (['utilities', 'internet'].filter((k) => covered[k]).join(' and ') || 'no bills') + ' covered by family' : '');
  if (answered('around')) out.around = 'Shows ' + list(by('N', ['car-payment', 'lease', 'car-insurance', 'car-gas', 'car-upkeep', 'transit', 'rides']));
  if (answered('work')) out.work = 'Shows ' + list(by('I').concat(by('T', ['set-aside', 'estimated-payments'])));
  if (answered('people')) out.people = 'Shows ' + list([...by('I', ['gift-in', 'allowance', 'child-support-in', 'alimony-in']), ...by('N', ['family-support', 'tzedakah', 'child-support-paid']), ...by('D', ['family-loan'])]);
  if (answered('debt')) out.debt = 'Opens ' + list(by('D'));
  if (answered('accounts')) out.accounts = 'Opens ' + list(by('A'));
  if (answered('health')) out.health = ans(a, 'health') === 'parent' ? 'Turning 26 on the Calendar' : 'Shows ' + list(by('N', ['health-premium']));
  if (answered('style')) out.style = ans(a, 'tracking') === 'none' ? 'Spending opens on adding a purchase' : 'Spending opens on importing a statement';
  if (answered('goals')) out.goals = 'Goals: ' + list([...(Array.isArray(ans(a, 'goals')) ? ans(a, 'goals') : []).map(goalWords), ...(ans(a, 'fi') === 'notNow' ? [] : ['Financial independence'])]);
  return out;
}
const goalWords = (k) => (L1.get('goals').options.find(([x]) => x === k) || [k, k])[1];

// A line hidden by the profile (kept, not deleted): an expense whose key is one of the profile's lines and does not
// show for these answers. With no profile, nothing is hidden.
export const lineKey = (e) => (e && typeof e.key === 'string' && e.key) || (e && e.id) || null;
export function hiddenLine(spine, e) {
  const k = lineKey(e);
  if (!k || !LINE_KEYS.has(k) || !spine.profile) return false;
  const a = answersOf(spine);
  // Nothing is hidden before the client says so: the line's own question must be answered (not "Not sure").
  if (!(GOVERNS[k] || []).some((q) => a[q] !== undefined && a[q] !== NOT_SURE)) return false;
  return !shows(a, k);
}
// The Level 1 questions that decide whether each expense line shows.
const HOME_Q = ['home', 'familyPay', 'ownLoan'];
const GOVERNS = {
  rent: HOME_Q, 'pay-family': HOME_Q, 'renters-insurance': HOME_Q, mortgage: HOME_Q, 'property-tax': HOME_Q, 'home-insurance': HOME_Q,
  'car-payment': ['getAround'], lease: ['getAround'], 'car-insurance': ['getAround'], 'car-gas': ['getAround'], 'car-upkeep': ['getAround'], transit: ['getAround'], rides: ['getAround'],
  childcare: ['livesWith'], 'family-support': ['give'], tzedakah: ['give'], 'child-support-paid': ['give'], 'health-premium': ['health']
};

// ---------------------------------------------------------------- answering
const NAME_SOURCE = 'profile';
// What a value must look like for its question. Returns the value to keep, or undefined when it cannot be used.
export function cleanAnswer(id, value) {
  const q = L1.get(id) || L2.get(id);
  if (!q || value === null || value === undefined) return undefined;
  if (value === NOT_SURE) return NOT_SURE;
  const ok = new Set((q.options || []).map(([k]) => k));
  if (q.kind === 'one') return ok.has(value) ? value : undefined;
  if (q.kind === 'many') {
    if (!Array.isArray(value)) return undefined;
    let list = [...new Set(value.filter((x) => ok.has(x)))];
    const ex = list.find((x) => (q.exclusive || []).includes(x));
    if (ex) list = [ex];
    if (q.max) list = list.slice(0, q.max);
    return list.length ? list.sort((x, y) => q.options.findIndex(([k]) => k === x) - q.options.findIndex(([k]) => k === y)) : undefined;
  }
  if (q.kind === 'text') return typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : undefined;
  if (q.kind === 'year') return Number.isInteger(value) && value >= 1920 && value <= 2015 ? value : undefined;
  if (q.kind === 'state') return STATES.includes(value) ? value : undefined;
  if (q.kind === 'date') return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  return undefined;
}

// One answer: the Fact, a life change logged with its date, then the money it moves (covers, the card setting, the
// name, the birth year, the state, a parent's plan). A cleared answer (null) is logged too. by: who gave it.
export function applyAnswer(spine, id, value, { today, by = 'client', source = NAME_SOURCE } = {}) {
  const clean = value === null ? null : cleanAnswer(id, value);
  if (clean === undefined) return spine;
  const before = spine.profile && spine.profile[id] ? v(spine.profile[id]) : null;
  if (JSON.stringify(before) === JSON.stringify(clean)) return spine;
  const profile = { ...(spine.profile || {}) };
  if (clean === null) delete profile[id]; else profile[id] = fact(clean, { kind: 'known', asOf: today, source, by });
  const log = [...(spine.lifeChanges || [])];
  log.push({ id: 'lc-' + (log.length + 1), date: today, question: id, from: before, to: clean });
  return syncProfile({ ...spine, profile, lifeChanges: log }, { today, changed: id });
}
export function applyAnswers(spine, answers, opts) {
  let s = spine;
  for (const q of [...LEVEL1, ...LEVEL2]) if (answers[q.id] !== undefined) s = applyAnswer(s, q.id, answers[q.id], opts);
  return s;
}
// The words for one life change: "Where do you live?: I rent to With family".
export function changeWords(c) {
  const q = L1.get(c.question) || L2.get(c.question);
  const say = (x) => (x === null || x === undefined ? 'blank' : x === NOT_SURE ? 'Not sure' : Array.isArray(x) ? x.map((k) => optWords(q, k)).join(', ') : optWords(q, x));
  return (q ? q.label : c.question) + ' ' + say(c.from) + ' to ' + say(c.to);
}
const optWords = (q, k) => (q && q.options ? (q.options.find(([x]) => x === k) || [k, String(k)])[1] : String(k));

// What the answers move, idempotent: run after every answer. It touches only what the profile set (a cover marked
// "Family", a guess sourced "profile"), so nothing the client typed is overwritten.
export function syncProfile(spine, { today, changed = null }) {
  const a = answersOf(spine);
  const f = fieldsFor(a);
  let s = spine;
  for (const e of spine.expenses || []) {
    const k = lineKey(e), by = e.coveredBy && v(e.coveredBy), want = f.covered[k] || null;
    const mine = !!e.coveredBy && e.coveredBy.source === NAME_SOURCE;
    if (want && (!by || (mine && by !== want))) s = setAt(s, 'expenses.' + e.id, { ...getAt(s, 'expenses.' + e.id), covered: fact(true, { asOf: today, source: NAME_SOURCE }), coveredBy: fact(want, { asOf: today, source: NAME_SOURCE }) });
    else if (!want && ((by === 'Family' && e.coveredBy.source !== 'typed') || mine || (by === 'Parents' && e.covered && e.covered.source === NAME_SOURCE))) {
      const x = { ...getAt(s, 'expenses.' + e.id) }; delete x.covered; delete x.coveredBy; s = setAt(s, 'expenses.' + e.id, x);
    }
  }
  // A guess from the profile goes where nothing was typed: a blank, its own earlier guess, or a house default.
  const guess = (path, value) => { const cur = getAt(s, path); if (!cur || cur.kind === 'missing' || cur.source === NAME_SOURCE || whoSupplies(cur) === 'default') s = setAt(s, path, fact(value, { kind: 'rough', asOf: today, source: NAME_SOURCE, by: 'client', note: 'a guess from your profile' })); };
  const person = (s.household.people || [])[0];
  if (person && a.firstName && (!person.name || person.name === 'You' || person.nameFrom === NAME_SOURCE)) s = setAt(s, 'household.people', s.household.people.map((p, i) => (i ? p : { ...p, name: a.firstName, nameFrom: NAME_SOURCE })));
  if (person && Number.isInteger(a.birthYear)) guess('household.people.' + person.id + '.birthDate', a.birthYear + '-07-01');
  if (a.state && a.state !== NOT_SURE) guess('household.state', a.state);
  if (has(a, 'debts', 'cards') && a.cardsFull && a.cardsFull !== NOT_SURE) guess('household.cardPayPolicy', a.cardsFull === 'always' ? 'statement' : 'minimum');
  // How the paycheck is figured follows the answer (salary is a yearly amount, by the hour is rate x hours): the first
  // W-2 line takes that basis and the pay frequency. setPay keeps the other way's numbers, so switching back finds them.
  // Only when that answer is the one changing (changed), so a later answer never undoes what the coach typed.
  if (changed === 'payType' || changed === 'payOften') {
    const job = (s.income || []).find((x) => x.type === 'w2' && x.cadence !== 'once');
    const basis = { salary: 'salary', hourly: 'hourly' }[a.payType] || (job && v(job.payBasis) !== 'steady' && v(job.payBasis) !== 'lumpy' ? v(job.payBasis) : null);
    const often = ['weekly', 'biweekly', 'semimonthly', 'monthly'].includes(a.payOften) ? a.payOften : undefined;
    if (job && basis && (v(job.payBasis) !== basis || (often && job.cadence !== often))) s = setPay(s, job.id, { basis, cadence: often }, today);
  }
  // Goals picked (Level 1) are added once, ready for an amount and a date; moving in the next year adds moving costs;
  // FI yes or curious adds the FI goal. A goal is never removed when an answer changes (the client may have typed in it).
  // Only when that answer is the one changing, and only what it newly picks: a goal the client deleted is not put back.
  const picks = (x, q) => (q === 'goals' ? (Array.isArray(x) ? x : []) : q === 'moving' ? (['yes', 'maybe'].includes(x) ? ['moving'] : []) : ['yes', 'curious'].includes(x) ? ['fi'] : []);
  if (['goals', 'moving', 'fi'].includes(changed)) {
    const last = [...(s.lifeChanges || [])].reverse().find((c) => c.question === changed);
    const before = new Set(picks(last ? last.from : null, changed));
    for (const k of picks(a[changed], changed)) {
      if (before.has(k) || (s.goals || []).some((g) => g.key === k || (k === 'fi' && g.type === 'fi'))) continue;
      let id = k === 'fi' ? 'fi' : 'goal-' + k, n = 2;
      while ((s.goals || []).some((g) => g.id === id)) id = (k === 'fi' ? 'fi' : 'goal-' + k) + '-' + n++;
      const goal = k === 'fi' ? { id, key: k, type: 'fi', label: 'Financial independence' } : { id, key: k, type: k === 'debtFree' ? 'payoff' : 'savings', label: k === 'moving' ? 'Moving costs' : goalWords(k), target: fact(null, { asOf: today, source: NAME_SOURCE }) };
      s = { ...s, goals: [...(s.goals || []), goal] };
    }
  }
  // A parent's plan ends at 26: a dated change in health coverage, kept only while the answer is a parent's plan.
  const hc = (s.household.healthCoverage || []).filter((x) => x.id !== 'turning-26');
  const birth = person ? v(getAt(s, 'household.people.' + person.id + '.birthDate')) : null;
  if (a.health === 'parent' && birth) hc.push({ id: 'turning-26', from: (+birth.slice(0, 4) + 26) + birth.slice(4), value: fact(null, { asOf: today, source: NAME_SOURCE, note: 'a parent\'s plan ends at 26: pick the new coverage' }) });
  if (JSON.stringify(hc) !== JSON.stringify(s.household.healthCoverage || [])) s = setAt(s, 'household.healthCoverage', hc);
  return s;
}

// The gut number: "About how much do you spend a month?", saved to Numbers as a guess.
export function setGutNumber(spine, amount, { today, source = NAME_SOURCE } = {}) {
  if (amount === null || amount === undefined) { const h = { ...spine.household }; delete h.gutSpending; return { ...spine, household: h }; }
  return setAt(spine, 'household.gutSpending', fact(amount, { kind: 'rough', asOf: today, source, by: 'client', note: 'your best guess before we looked anything up' }));
}

// ---------------------------------------------------------------- the answers file (Level 1, sent by the client)
export const ANSWERS_KIND = 'slam-answers/1';
export const answersFileName = (first, date) => 'answers-' + (String(first || 'client').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client') + '-' + date + '.json';
export function answersFile(answers, gut, savedAt) {
  const clean = {};
  for (const q of LEVEL1) { const x = answers[q.id] === undefined ? undefined : cleanAnswer(q.id, answers[q.id]); if (x !== undefined) clean[q.id] = x; }
  return { kind: ANSWERS_KIND, savedAt, answers: clean, gutSpending: typeof gut === 'number' && gut >= 0 ? gut : null };
}
// Reads a file's JSON: { answers, gut, problems } where problems name what could not be used. Throws when it is not an
// answers file at all.
export function readAnswersFile(x) {
  if (!x || typeof x !== 'object' || x.kind !== ANSWERS_KIND || !x.answers || typeof x.answers !== 'object') throw new Error('This is not a "Before our first call" answers file.');
  const answers = {}, problems = [];
  for (const [id, val] of Object.entries(x.answers)) {
    const c = L1.has(id) ? cleanAnswer(id, val) : undefined;
    if (c === undefined) problems.push(L1.has(id) ? (L1.get(id).label + ': could not be read') : 'An answer this app does not ask (' + id + ')'); else answers[id] = c;
  }
  const gut = typeof x.gutSpending === 'number' && x.gutSpending >= 0 ? x.gutSpending : null;
  return { answers, gut, savedAt: typeof x.savedAt === 'string' ? x.savedAt : null, problems };
}
// Import answers (the coach): fills the Profile and the gut number, each answer a life change from the file.
export function loadAnswers(spine, file, { today }) {
  let s = applyAnswers(spine, file.answers, { today, by: 'client', source: 'answers file' });
  if (file.gut !== null && file.gut !== undefined) s = setGutNumber(s, file.gut, { today, source: 'answers file' });
  return s;
}

// ---------------------------------------------------------------- Level 2: in the session
// Opened only for what Level 1 ticked. kind 'one' is a Profile answer; kind 'field' is a number in My numbers, with
// where to find it (Level 3).
const WHERE = {
  paystub: 'Your paystub', benefits: 'Your benefits site or HR', plan: 'The plan or brokerage site', card: 'The card app or a statement',
  studentaid: 'studentaid.gov or your loan servicer', lender: 'The lender app', taxReturn: 'Last year\'s tax return', bank: 'Bank statements'
};
export const WHERE_WORDS = WHERE;
export const LEVEL2 = [
  { id: 'incomeSecurity', area: 'work', label: 'How secure is your income?', kind: 'one', options: [['solid', 'Solid'], ['okay', 'Okay'], ['shaky', 'Shaky']], opens: (a) => W2(a) || SELF(a), does: 'Okay adds a month to the cushion; shaky adds three.' },
  { id: 'payChange', area: 'work', label: 'Pay changes coming?', kind: 'one', options: [['yes', 'Yes'], ['no', 'No']], opens: (a) => W2(a) || SELF(a), does: 'Yes puts the change on the Calendar with its date.' },
  { id: 'payRate', area: 'work', label: 'Your pay rate (yearly salary, or hourly rate and usual hours)', kind: 'field', where: 'paystub', opens: W2 },
  { id: 'businessStructure', area: 'work', label: 'Business structure', kind: 'one', options: [['sole', 'Just me (sole)'], ['llc', 'LLC'], ['scorp', 'S corp']], opens: SELF, does: 'An S corp pays you a wage; the rest stays 1099.' },
  { id: 'businessAccount', area: 'work', label: 'A separate business account?', kind: 'one', options: YES_NO, opens: SELF, does: 'No adds "open a business account" to the to-dos.' },
  { id: 'businessRetirement', area: 'work', label: 'Retirement through the business', kind: 'one', options: [['none', 'None'], ['sep', 'SEP IRA'], ['solo', 'Solo 401(k)']], opens: SELF, does: 'Opens that account.' },
  { id: 'k401Type', area: 'k401', label: '401(k): traditional, Roth or both?', kind: 'one', options: [['traditional', 'Traditional'], ['roth', 'Roth'], ['both', 'Both']], opens: (a) => has(a, 'accounts', 'k401') || has(a, 'offers', 'k401'), does: 'Sets whether it lowers your tax now.' },
  { id: 'k401Contribution', area: 'k401', label: 'What goes in (% or $ per check)', kind: 'field', where: 'paystub', opens: (a) => has(a, 'accounts', 'k401') || has(a, 'offers', 'k401') },
  { id: 'k401Match', area: 'k401', label: 'The match formula and vesting', kind: 'field', where: 'benefits', opens: (a) => has(a, 'accounts', 'k401') || has(a, 'offers', 'k401') },
  { id: 'fullMatch', area: 'k401', label: 'Getting the full match?', kind: 'one', options: YES_NO, opens: (a) => has(a, 'accounts', 'k401') || has(a, 'offers', 'k401'), does: 'No or not sure puts "Get the match" first.' },
  { id: 'oldK401', area: 'k401', label: 'Old 401(k)s at past jobs?', kind: 'one', options: YES_NO, opens: (a) => has(a, 'accounts', 'k401') || has(a, 'offers', 'k401'), does: 'Yes adds them as accounts to find.' },
  { id: 'iraType', area: 'ira', label: 'IRA: traditional or Roth?', kind: 'one', options: [['traditional', 'Traditional'], ['roth', 'Roth'], ['both', 'Both']], opens: (a) => has(a, 'accounts', 'ira'), does: 'Sets the IRA type.' },
  { id: 'pretaxIra', area: 'ira', label: 'Any pre-tax IRA money?', kind: 'one', options: YES_NO, opens: (a) => has(a, 'accounts', 'ira'), does: 'Yes warns before a backdoor Roth.' },
  { id: 'hsaPayroll', area: 'hsa', label: 'HSA through payroll?', kind: 'one', options: YES_NO, opens: (a) => has(a, 'accounts', 'hsa') || has(a, 'offers', 'hsa'), does: 'Through payroll skips Social Security and Medicare tax.' },
  { id: 'hsaInvest', area: 'hsa', label: 'HSA invested or cash?', kind: 'one', options: [['invest', 'Invested'], ['cash', 'Cash']], opens: (a) => has(a, 'accounts', 'hsa') || has(a, 'offers', 'hsa'), does: 'Invested counts toward FI.' },
  { id: 'hsaReceipts', area: 'hsa', label: 'Saving receipts?', kind: 'one', options: YES_NO, opens: (a) => has(a, 'accounts', 'hsa') || has(a, 'offers', 'hsa'), does: 'No adds "keep receipts" to the to-dos.' },
  { id: 'brokerage', area: 'brokerage', label: 'What is in the brokerage, and its fee', kind: 'field', where: 'plan', opens: (a) => has(a, 'accounts', 'brokerage') },
  { id: 'cardDetails', area: 'cards', label: 'Each card: which card, business or personal, rate, due day, limit, any 0% promo and its end', kind: 'field', where: 'card', opens: (a) => has(a, 'debts', 'cards') },
  { id: 'studentDetails', area: 'student', label: 'Student loans: federal or private, plan, rate, forgiveness and payments made', kind: 'field', where: 'studentaid', opens: (a) => has(a, 'debts', 'student') },
  { id: 'carDetails', area: 'car', label: 'Car: rate, payment, payoff date; a lease\'s miles and end', kind: 'field', where: 'lender', opens: (a) => has(a, 'debts', 'car') || ['carLoan', 'lease'].includes(ans(a, 'getAround')) },
  { id: 'mortgageDetails', area: 'mortgage', label: 'Mortgage: rate, years left, PMI, taxes and insurance in the payment', kind: 'field', where: 'lender', opens: (a) => has(a, 'debts', 'mortgage') || ans(a, 'ownLoan') === 'mortgage' },
  { id: 'hdhp', area: 'health', label: 'A high-deductible plan?', kind: 'one', options: YES_NO, opens: (a) => ['work', 'marketplace'].includes(ans(a, 'health')), does: 'Yes opens an HSA.' },
  { id: 'healthCosts', area: 'health', label: 'Deductible, out-of-pocket max and premium', kind: 'field', where: 'benefits', opens: (a) => ['work', 'marketplace', 'parent'].includes(ans(a, 'health')) },
  { id: 'bigMedical', area: 'health', label: 'Big medical costs expected?', kind: 'one', options: YES_NO, opens: (a) => ans(a, 'health') !== null, does: 'Yes adds a medical goal.' },
  { id: 'stressMost', area: 'debtAll', label: 'Which debt stresses you most?', kind: 'field', where: null, opens: (a) => Array.isArray(ans(a, 'debts')) && ans(a, 'debts').filter((x) => x !== 'none').length > 0 },
  { id: 'goalDetails', area: 'goalsAll', label: 'Each goal: amount and date', kind: 'field', where: null, opens: (a) => Array.isArray(ans(a, 'goals')) && ans(a, 'goals').length > 0 },
  { id: 'goalPace', area: 'goalsAll', label: 'One goal at a time, or several?', kind: 'one', options: [['one', 'One at a time'], ['several', 'Several at once']], opens: (a) => Array.isArray(ans(a, 'goals')) && ans(a, 'goals').length > 1, does: 'Sets how the Plan funds goals.' },
  { id: 'statements', area: 'statements', label: 'The last 2 statements for each card and bank account, as CSV', kind: 'field', where: 'bank', opens: (a) => ans(a, 'tracking') !== null }
];
const L2 = new Map(LEVEL2.map((q) => [q.id, q]));
export const L2_AREAS = { work: 'Work', k401: '401(k) or similar', ira: 'IRA', hsa: 'HSA', brokerage: 'Brokerage', cards: 'Cards', student: 'Student loans', car: 'Car', mortgage: 'Mortgage', health: 'Health', debtAll: 'Debt overall', goalsAll: 'Goals', statements: 'Statements' };
// The Level 2 areas Level 1 opened, in session order, each with its questions.
export function level2(a) {
  const out = [];
  for (const [area, label] of Object.entries(L2_AREAS)) {
    const qs = LEVEL2.filter((q) => q.area === area && q.opens(a));
    if (qs.length) out.push({ area, label, questions: qs });
  }
  return out;
}

// ---------------------------------------------------------------- Level 3: homework
// Each Level 2 question: "I know it" (answered now), "I'll look it up" (a to-do with where to find it) or "Not sure"
// (a rough default; listed in Still guessing). Kept in spine.coaching.homework (the Coaching layer).
export const STATUS = ['known', 'lookup', 'notSure', 'done'];
export function setHomework(spine, id, status, { today }) {
  const q = L2.get(id);
  if (!q || !STATUS.includes(status)) return spine;
  const list = ((spine.coaching && spine.coaching.homework) || []).filter((x) => x.id !== id);
  list.push({ id, label: q.label, where: q.where ? WHERE[q.where] : null, status, date: today });
  return { ...spine, coaching: { ...(spine.coaching || {}), homework: list } };
}
// The client's to-dos, grouped by where to find each item, for the one-pager and the recap.
export function homeworkList(spine) {
  const items = ((spine.coaching && spine.coaching.homework) || []).filter((x) => x.status === 'lookup');
  const groups = new Map();
  for (const x of items) { const k = x.where || 'Ask Eli'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x.label); }
  return [...groups.entries()].map(([where, labels]) => ({ where, items: labels }));
}
export const stillGuessing = (spine) => ((spine.coaching && spine.coaching.homework) || []).filter((x) => x.status === 'notSure');

// Extra cushion months for income security (Level 2): okay +1, shaky +3 (house defaults CUSHION_OKAY_EXTRA,
// CUSHION_SHAKY_EXTRA).
export function cushionExtraMonths(spine, rules, year) {
  const s = spine.profile && spine.profile.incomeSecurity ? v(spine.profile.incomeSecurity) : null;
  // A stale answer (work changed to retired) no longer moves the cushion: its question is not open.
  if (s !== null && !L2.get('incomeSecurity').opens(answersOf(spine))) return 0;
  if (s === 'okay') return rules.get('CUSHION_OKAY_EXTRA', year);
  if (s === 'shaky') return rules.get('CUSHION_SHAKY_EXTRA', year);
  return 0;
}

// The tone answer, for the words on Today.
// A new housing or food line starts shared, half each, with a partner or other adults at home (Level 1).
export const startsShared = (a, fat) => (has(a, 'livesWith', 'partner') || has(a, 'livesWith', 'adults')) && (fat === 'accommodation' || fat === 'food');
export const toneOf = (spine) => (spine.profile && spine.profile.tone ? v(spine.profile.tone) : null);
// Where Spending opens: adding a purchase when they do not keep track, else importing a statement.
export const spendingStart = (spine) => { const t = spine.profile && spine.profile.tracking ? v(spine.profile.tracking) : null; return t === null || t === NOT_SURE ? null : t === 'none' ? 'add' : 'import'; };
export const questionById = (id) => L1.get(id) || L2.get(id) || null;
