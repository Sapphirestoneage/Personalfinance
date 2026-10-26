// The parser's own cases (S-237): test/parse-answer.test.js checks every one, and the Key tab of the numbers
// spreadsheet shows the ones marked key, so the Key never promises a format the parser cannot read.
// Each: [answer, { expect, sure, spending }, want]. want: { status, kind, ...facts } (facts compared as given).
// Read with today = 2026-10-26.
export const TODAY = '2026-10-26';

export const CASES = [
  // Money
  { key: 'Money', answer: '$1,000', expect: 'money', want: { status: 'ok', kind: 'known', value: 1000 } },
  { key: 'Money', answer: '1000', expect: 'money', want: { status: 'ok', kind: 'known', value: 1000 } },
  { key: 'Money', answer: '1k', expect: 'money', want: { status: 'ok', kind: 'known', value: 1000 } },
  { key: 'Money', answer: '1.5k', expect: 'money', want: { status: 'ok', kind: 'known', value: 1500 } },
  { key: 'Money', answer: 'about 18k', expect: 'money', want: { status: 'ok', kind: 'rough', value: 18000 } },
  { key: 'Money', answer: '~$800', expect: 'expenses', want: { status: 'ok', kind: 'rough', amount: 800, cadence: 'monthly' } },
  { key: 'Money', answer: '$50k a year', expect: 'income', want: { status: 'ok', kind: 'known', amount: 50000, cadence: 'yearly' } },
  { key: 'Money', answer: 'a grand a month', expect: 'expenses', want: { status: 'ok', kind: 'known', amount: 1000, cadence: 'monthly' } },
  { answer: '$2,500.50', expect: 'money', want: { status: 'ok', value: 2500.5 } },
  { answer: '$5 and $6', expect: 'expenses', want: { status: 'review' } },
  { answer: 'blah blah', expect: 'expenses', want: { status: 'review' } },
  // How often
  { key: 'How often', answer: '$40 a week', expect: 'expenses', want: { amount: 40, cadence: 'weekly' } },
  { answer: '$40 weekly', expect: 'expenses', want: { amount: 40, cadence: 'weekly' } },
  { key: 'How often', answer: '$40/wk', expect: 'expenses', want: { amount: 40, cadence: 'weekly' } },
  { key: 'How often', answer: '$1,000 per month', expect: 'expenses', want: { amount: 1000, cadence: 'monthly' } },
  { answer: '$1,000 a month', expect: 'expenses', want: { amount: 1000, cadence: 'monthly' } },
  { key: 'How often', answer: '1k/mo', expect: 'expenses', want: { amount: 1000, cadence: 'monthly' } },
  { answer: '$1,000 monthly', expect: 'expenses', want: { amount: 1000, cadence: 'monthly' } },
  { answer: '$1,200 a year', expect: 'expenses', want: { amount: 1200, cadence: 'yearly' } },
  { key: 'How often', answer: '$1,200 annually', expect: 'expenses', want: { amount: 1200, cadence: 'yearly' } },
  { key: 'How often', answer: '$2,300 per paycheck', expect: 'income', want: { amount: 2300, cadence: 'biweekly' } },
  { answer: '$1,500 biweekly', expect: 'income', want: { amount: 1500, cadence: 'biweekly' } },
  { key: 'How often', answer: '$1,500 every 2 weeks', expect: 'income', want: { amount: 1500, cadence: 'biweekly' } },
  { answer: '$300', expect: 'expenses', spending: true, want: { status: 'ok', amount: 300, cadence: 'monthly', noted: true } },
  { answer: '$4,000', expect: 'income', want: { status: 'review' } },
  // Rates
  { key: 'Rates', answer: '6%', expect: 'rate', want: { status: 'ok', value: 0.06 } },
  { key: 'Rates', answer: '6 percent', expect: 'rate', want: { status: 'ok', value: 0.06 } },
  { key: 'Rates', answer: '.06', expect: 'rate', want: { status: 'ok', value: 0.06 } },
  { key: 'Rates', answer: '0%', expect: 'rate', want: { status: 'ok', value: 0 } },
  { key: 'Rates', answer: '0 apr', expect: 'rate', want: { status: 'ok', value: 0 } },
  { key: 'Rates', answer: 'no interest', expect: 'rate', want: { status: 'ok', value: 0 } },
  { answer: '3', expect: 'rate', want: { status: 'ok', value: 0.03, noted: true } },
  // Dates
  { key: 'Dates', answer: 'July 15, 2001', expect: 'date', want: { status: 'ok', value: '2001-07-15' } },
  { key: 'Dates', answer: '7/15/01', expect: 'date', want: { status: 'ok', value: '2001-07-15' } },
  { key: 'Dates', answer: 'Jan 2027', expect: 'date', want: { status: 'ok', value: '2027-01-01', noted: true } },
  { key: 'Dates', answer: 'May', expect: 'date', want: { status: 'ok', value: '2027-05-01', noted: true } },
  { key: 'Dates', answer: 'until May 2027', expect: 'date', want: { status: 'ok', value: '2027-05-31' } },
  { key: 'Dates', answer: '$300 a month starting Jan', expect: 'expenses', want: { status: 'ok', amount: 300, start: '2027-01-01', noted: true } },
  { answer: '2001-07-15', expect: 'date', want: { status: 'ok', value: '2001-07-15' } },
  { answer: '2/30/2001', expect: 'date', want: { status: 'review' } },
  // Several facts in one answer
  { key: 'Several facts in one answer', answer: '$2,000 left, $500 a month, 0%', expect: 'debts', want: { status: 'ok', balance: 2000, payment: 500, rate: 0 } },
  { key: 'Several facts in one answer', answer: 'Capital One Quicksilver, $7k limit, 0% until May 2027', expect: 'debts', want: { status: 'ok', lender: 'Capital One Quicksilver', limit: 7000, promoRate: 0, promoEnds: '2027-05-31' } },
  { key: 'Several facts in one answer', answer: 'Deloitte Jan-Jun: $56,500 pay, $11,700 federal, $4,500 NY', expect: 'income', want: { status: 'ok', label: 'Deloitte', amount: 56500, cadence: 'total', start: '2026-01-01', end: '2026-06-30', federal: 11700, state: 4500 } },
  { answer: '$9,000 left, 22% apr, $250 min', expect: 'debts', want: { status: 'ok', balance: 9000, rate: 0.22, payment: 250 } },
  { answer: '$6,000 a month, $550 federal, $280 state', expect: 'income', want: { status: 'ok', amount: 6000, cadence: 'monthly', federal: 550, state: 280 } },
  { answer: '$30,000 by Dec 2027', expect: 'goals', want: { status: 'ok', target: 30000, by: '2027-12-31' } },
  { answer: '$12,000, 4%', expect: 'accounts', want: { status: 'ok', balance: 12000, rate: 0.04 } },
  // Lists
  { key: 'Lists', answer: '2022: 4k, 2023: 3k', expect: 'contributions', want: { status: 'ok', contributions: [{ year: 2022, amount: 4000 }, { year: 2023, amount: 3000 }] } },
  { answer: '$18,000, 2022: 4k, 2023: 3k', expect: 'accounts', want: { status: 'ok', balance: 18000, contributions: [{ year: 2022, amount: 4000 }, { year: 2023, amount: 3000 }] } },
  { key: 'Lists', answer: '8% / 6% / 4%', expect: 'scenarios', want: { status: 'ok', scenarios: { best: 0.08, likely: 0.06, worst: 0.04 } } },
  // Not known, and a real zero
  { key: 'Not known yet (left blank, never $0)', answer: '', expect: 'money', want: { status: 'missing', kind: 'missing' } },
  { key: 'Not known yet (left blank, never $0)', answer: "don't know", expect: 'money', want: { status: 'missing', kind: 'missing' } },
  { key: 'Not known yet (left blank, never $0)', answer: 'idk', expect: 'expenses', want: { status: 'missing', kind: 'missing' } },
  { key: 'Not known yet (left blank, never $0)', answer: '?', expect: 'money', want: { status: 'missing', kind: 'missing' } },
  { key: 'Not known yet (left blank, never $0)', answer: 'n/a', expect: 'debts', want: { status: 'missing', kind: 'missing' } },
  { key: 'Not known yet (left blank, never $0)', answer: 'not sure', expect: 'money', want: { status: 'missing', kind: 'missing' } },
  { key: 'A real zero', answer: '$0', expect: 'money', want: { status: 'ok', kind: 'known', value: 0 } },
  { key: 'A real zero', answer: 'none', expect: 'expenses', want: { status: 'ok', kind: 'known', amount: 0 } },
  // Hedge words and How sure?
  { key: 'Rough on purpose', answer: 'around $1,200', expect: 'money', sure: 'I know it', want: { status: 'ok', kind: 'rough', value: 1200 } },
  { key: 'Rough on purpose', answer: 'maybe $300 a month', expect: 'expenses', want: { kind: 'rough', amount: 300 } },
  { key: 'Rough on purpose', answer: 'roughly 2k', expect: 'money', want: { kind: 'rough', value: 2000 } },
  { answer: '$1,000', expect: 'money', sure: 'I know it', want: { kind: 'known' } },
  { answer: '$1,000', expect: 'money', sure: 'known', want: { kind: 'known' } },
  { answer: '$1,000', expect: 'money', sure: 'sure', want: { kind: 'known' } },
  { answer: '$1,000', expect: 'money', sure: 'rough guess', want: { kind: 'rough' } },
  { answer: '$1,000', expect: 'money', sure: 'rough', want: { kind: 'rough' } },
  { answer: '$1,000', expect: 'money', sure: 'estimate', want: { kind: 'rough' } },
  { answer: '', expect: 'money', sure: "don't know", want: { status: 'missing', kind: 'missing' } },
  { answer: '', expect: 'money', sure: 'unknown', want: { status: 'missing', kind: 'missing' } },
  { answer: '$1,000', expect: 'money', sure: "don't know", want: { status: 'review' } },
  { answer: '$1,000', expect: 'money', sure: 'purple', want: { status: 'review' } },
  // Other field types
  { answer: 'yes', expect: 'bool', want: { value: true } },
  { answer: 'no', expect: 'bool', want: { value: false } },
  { answer: '2', expect: 'int', want: { value: 2 } },
  { answer: '40 hours a week', expect: 'int', want: { value: 40 } },
  { answer: 'Albany', expect: 'text', want: { value: 'Albany' } }
];
