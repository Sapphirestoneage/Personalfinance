// Standard types under the names people choose. Names are free to edit; the
// type is what calculations follow (FAT, housing share, guesses, DRAFTT) and
// what spending is tracked by, like the basic categories in Rocket Money.
// No imports. schema.js takes the default lines' types from here; migrate.js guesses a type for older lines.

// What a category counts as. FAT is housing + food + transport.
export const CATEGORY_TYPES = [
  ['housing', 'Housing'],
  ['food', 'Food'],
  ['transport', 'Transportation'],
  ['debt', 'Debt payments'],
  ['health', 'Health'],
  ['bills', 'Bills & Utilities'],
  ['fun', 'Personal & Fun'],
  ['annual', 'Annual & Irregular'],
  ['fees', 'Fees'],
  ['giving', 'Giving'],
  ['savings', 'Savings'],
  ['education', 'Education'],
  ['family', 'Family Care'],
  ['pets', 'Pets'],
  ['travel', 'Travel'],
  ['business', 'Business'],
  ['taxes', 'Taxes'],
  ['other', 'Other']
];
export const CATEGORY_TYPE_IDS = CATEGORY_TYPES.map(([id]) => id);

// What a line is, with keywords that recognize a typed name. A keyword matches anywhere in the
// lowercased name, so a stem like 'therap' catches therapy and therapist (see guessLineType).
export const LINE_TYPES = [
  ['rent', 'Rent & Mortgage', ['rent', 'mortgage']],
  ['utilities', 'Utilities', ['utilit', 'electric', 'water', 'trash', 'heat', 'gas and electric', 'power']],
  ['internet-phone', 'Internet & Phone', ['internet', 'wifi', 'phone', 'cell']],
  ['home-insurance', 'Home & Renters Insurance', ['renters', 'home insurance', 'homeowner']],
  ['home-garden', 'Home & Garden', ['repair', 'furniture', 'hoa', 'garden', 'cleaning', 'home']],
  ['groceries', 'Groceries', ['grocer', 'supermarket']],
  ['dining', 'Dining & Drinks', ['eating out', 'dining', 'restaurant', 'lunch', 'dinner', 'bar', 'drinks', 'alcohol']],
  ['delivery', 'Food Delivery', ['delivery', 'doordash', 'uber eats', 'grubhub']],
  ['coffee', 'Coffee', ['coffee', 'cafe']],
  ['car-payment', 'Car Payment', ['car payment', 'auto loan', 'lease']],
  ['auto-insurance', 'Auto Insurance', ['car insurance', 'auto insurance']],
  ['gas', 'Gas & Fuel', ['gas', 'fuel', 'charging']],
  [
    'public-transit',
    'Public Transit',
    ['transit', 'metro', 'subway', 'bus', 'train', 'coach', 'bus ticket', 'train ticket', 'public transportation']
  ],
  ['rideshare', 'Rideshare & Taxi', ['uber', 'lyft', 'rideshare', 'taxi']],
  [
    'auto-maintenance',
    'Auto Maintenance',
    ['maintenance', 'oil change', 'tires', 'car wash', 'registration', 'inspection']
  ],
  ['parking-tolls', 'Parking & Tolls', ['parking', 'toll']],
  ['health-insurance', 'Health Insurance', ['premium', 'health insurance']],
  [
    'medical',
    'Medical',
    ['medical', 'doctor', 'copay', 'prescription', 'out of pocket', 'dental', 'vision', 'pharmacy']
  ],
  ['therapy', 'Therapy & Mental Health', ['therap', 'counsel']],
  ['fitness', 'Fitness', ['gym', 'fitness', 'yoga', 'climbing']],
  ['subscriptions', 'Subscriptions & Streaming', ['subscription', 'streaming', 'netflix', 'spotify', 'apps']],
  ['software', 'Software & Tech', ['software', 'cloud', 'tech']],
  ['shopping', 'Shopping', ['shopping', 'amazon', 'target']],
  ['clothing', 'Clothing', ['cloth', 'shoes']],
  ['personal-care', 'Personal Care', ['personal care', 'hair', 'nails', 'self-care', 'skincare']],
  ['entertainment', 'Entertainment & Rec', ['entertain', 'concert', 'movie', 'going out', 'tickets to', 'games']],
  ['hobbies', 'Hobbies', ['hobb', 'craft']],
  ['travel', 'Travel & Vacation', ['travel', 'vacation', 'trip', 'flight', 'hotel']],
  ['gifts', 'Gifts', ['gift', 'birthday', 'holiday']],
  ['pets', 'Pets', ['pet', 'dog', 'cat', 'vet']],
  ['family-care', 'Family Care & Childcare', ['childcare', 'daycare', 'babysit', 'kids', 'family']],
  ['education', 'Education', ['tuition', 'school', 'course', 'class', 'books', 'education']],
  ['charity', 'Charitable Donations', ['giving', 'charity', 'donation', 'tithe', 'church']],
  ['bank-fees', 'Bank Fees', ['overdraft', 'atm', 'foreign transaction', 'bank fee']],
  ['late-fees', 'Late Fees & Tickets', ['late fee', 'ticket', 'fine', 'penalty']],
  ['interest', 'Interest Charged', ['interest']],
  ['taxes', 'Taxes', ['tax']],
  ['business', 'Business', ['business', 'client', 'work expense']],
  ['legal', 'Legal', ['legal', 'lawyer']],
  ['annual', 'Annual & Irregular', ['yearly', 'annual', 'irregular', 'membership']],
  ['emergency-fund', 'Emergency Fund', ['emergency']],
  ['retirement', 'Retirement', ['retire', 'ira', '401']],
  ['investing', 'Investing', ['invest', 'brokerage', 'stocks']],
  ['savings-goal', 'Savings Goal', ['goal', 'saving', 'fund']],
  ['extra-debt', 'Extra on Debt', ['extra', 'pay down', 'payoff', 'pay off']],
  ['loan', 'Loan Payment', ['loan']],
  ['other', 'Other', []]
];
export const LINE_TYPE_IDS = LINE_TYPES.map(([id]) => id);

export function lineTypeLabel(id) {
  const t = LINE_TYPES.find(([k]) => k === id);
  return t ? t[1] : 'Other';
}

export function categoryTypeLabel(id) {
  const t = CATEGORY_TYPES.find(([k]) => k === id);
  return t ? t[1] : 'Other';
}

// The type a typed name most likely means: the longest keyword found wins.
// Nothing found is "other" (the coach can pick). Inside the Savings category only these types
// make sense, and a name nothing matches is a savings goal rather than other.
const SAVINGS_LINE_TYPES = ['emergency-fund', 'retirement', 'investing', 'savings-goal', 'extra-debt'];

export function guessLineType(name, categoryType) {
  const n = String(name || '').toLowerCase();
  const pool = categoryType === 'savings' ? LINE_TYPES.filter(([id]) => SAVINGS_LINE_TYPES.includes(id)) : LINE_TYPES;
  let best = categoryType === 'savings' ? 'savings-goal' : 'other';
  let len = 0;
  // The label itself counts as a keyword, so typing a type's own name always finds it. On a tie
  // (two keywords of one length) the earlier type in the list keeps it.
  for (const [id, label, words] of pool) {
    for (const w of [label.toLowerCase(), ...words])
      if (w && n.includes(w) && w.length > len) {
        best = id;
        len = w.length;
      }
  }
  return best;
}

// Starting types for the default lines (their ids never change), and for the fee lines that
// feeLine() in edits.js makes on first use from schema.js FEE_LINES (S-123).
export const DEFAULT_LINE_TYPES = {
  rent: 'rent',
  utilities: 'utilities',
  internet: 'internet-phone',
  'home-insurance': 'home-insurance',
  groceries: 'groceries',
  'eating-out': 'dining',
  delivery: 'delivery',
  'car-payment': 'car-payment',
  'car-insurance': 'auto-insurance',
  gas: 'gas',
  transit: 'public-transit',
  maintenance: 'auto-maintenance',
  premiums: 'health-insurance',
  'out-of-pocket': 'medical',
  therapy: 'therapy',
  subscriptions: 'subscriptions',
  shopping: 'shopping',
  entertainment: 'entertainment',
  travel: 'travel',
  hobbies: 'hobbies',
  gifts: 'gifts',
  yearly: 'annual',
  'fee-overdraft': 'bank-fees',
  'fee-late': 'late-fees',
  'fee-atm': 'bank-fees',
  'fee-foreign': 'bank-fees',
  'fee-interest': 'interest',
  'giving-line': 'charity',
  'emergency-fund': 'emergency-fund',
  retirement: 'retirement',
  'other-goals': 'savings-goal'
};
