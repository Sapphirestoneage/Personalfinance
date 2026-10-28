// What a file is (the statement uploader, S-243): one of the document types below, or unknown, or a kind SLAM does not
// read yet (a pay stub, a W-2, a 1040, a Social Security statement, a pension estimate, crypto, TreasuryDirect).
// Scoring is by words anchored to labels, never by where they sit on the page. The review screen shows the guess with
// a list to correct it; an unknown file is listed, never dropped.

// Every type: its words, the DATING section it lands in, the SLAM account type it becomes, and the family.
export const DOC_TYPES = {
  credit_card: { words: 'Credit card', section: 'debt', preset: 'credit_card', coll: 'debts' },
  checking: { words: 'Checking', section: 'assets', preset: 'checking', coll: 'accounts' },
  savings: { words: 'Savings', section: 'assets', preset: 'savings', coll: 'accounts' },
  hysa: { words: 'High-yield savings', section: 'assets', preset: 'hysa', coll: 'accounts' },
  cd: { words: 'CD', section: 'assets', preset: 'cd', coll: 'accounts' },
  brokerage: { words: 'Brokerage (taxable)', section: 'assets', preset: 'brokerage', coll: 'accounts' },
  ira_traditional: { words: 'Traditional IRA', section: 'assets', preset: 'traditional_ira', coll: 'accounts' },
  ira_roth: { words: 'Roth IRA', section: 'assets', preset: 'roth_ira', coll: 'accounts' },
  ira_rollover: { words: 'Rollover IRA', section: 'assets', preset: 'rollover_ira', coll: 'accounts' },
  ira_sep: { words: 'SEP IRA', section: 'assets', preset: 'sep_ira', coll: 'accounts' },
  k401: { words: '401(k)', section: 'assets', preset: 'k401', coll: 'accounts' },
  k403b: { words: '403(b)', section: 'assets', preset: 'k403b', coll: 'accounts' },
  k457: { words: '457(b)', section: 'assets', preset: 'k457b', coll: 'accounts' },
  tsp: { words: 'TSP', section: 'assets', preset: 'tsp', coll: 'accounts' },
  hsa: { words: 'HSA', section: 'assets', preset: 'hsa', coll: 'accounts' },
  k529: { words: '529 plan', section: 'assets', preset: 'k529', coll: 'accounts' },
  student_loan: { words: 'Student loan', section: 'debt', preset: 'student_loan', coll: 'debts' },
  auto_loan: { words: 'Auto loan', section: 'debt', preset: 'auto_loan', coll: 'debts' },
  mortgage: { words: 'Mortgage', section: 'debt', preset: 'mortgage', coll: 'debts' },
  personal_loan: { words: 'Personal loan', section: 'debt', preset: 'personal_loan', coll: 'debts' },
  unknown: { words: 'Not sure what this is', section: null, preset: null, coll: null },
  unsupported: { words: 'Not supported yet', section: null, preset: null, coll: null }
};
// The kind of reader each type uses.
export const READER = {
  credit_card: 'card', checking: 'bank', savings: 'bank', hysa: 'bank', cd: 'cd',
  brokerage: 'investment', ira_traditional: 'investment', ira_roth: 'investment', ira_rollover: 'investment', ira_sep: 'investment', hsa: 'investment', k529: 'investment',
  k401: 'plan', k403b: 'plan', k457: 'plan', tsp: 'plan',
  student_loan: 'loan', auto_loan: 'loan', mortgage: 'loan', personal_loan: 'loan'
};
export const TYPE_CHOICES = Object.keys(DOC_TYPES).filter((k) => k !== 'unsupported');

// Files SLAM does not read yet: named, and left out of the numbers.
const UNSUPPORTED = [
  [/\b(earnings statement|pay ?stub|pay statement|gross pay|net pay)\b/i, 'Pay stub'],
  [/\b(form w-2|wage and tax statement)\b/i, 'W-2'],
  [/\bform 1040\b/i, 'Tax return (1040)'],
  [/\bsocial security statement\b/i, 'Social Security statement'],
  [/\b(pension (benefit )?estimate|defined benefit)\b/i, 'Pension estimate'],
  [/\b(coinbase|kraken|bitcoin|ethereum|crypto(currency)?)\b/i, 'Crypto'],
  [/\btreasurydirect\b/i, 'TreasuryDirect']
];

// Words that vote for a type, with weights. A strong word settles it on its own.
const VOTES = {
  credit_card: [[/minimum payment due/i, 5], [/credit (access line|limit)|revolving credit amount/i, 4], [/payment due date/i, 2], [/new balance/i, 2], [/\bAPR\b/, 1], [/cash advances?/i, 1], [/purchases/i, 1], [/autopay/i, 1]],
  checking: [[/checking summary/i, 6], [/\bchecking\b/i, 3], [/deposits and additions/i, 2], [/debit card withdrawals/i, 2], [/electronic withdrawals/i, 2], [/ending balance/i, 1], [/beginning balance/i, 1]],
  savings: [[/savings summary/i, 6], [/\bsavings\b/i, 3], [/annual percentage yield earned/i, 3], [/interest paid/i, 1]],
  hysa: [[/high[- ]yield savings/i, 7], [/online savings/i, 3]],
  cd: [[/certificate of deposit/i, 7], [/\bCD\b/, 3], [/maturity date/i, 3], [/early withdrawal penalty/i, 2], [/\bterm\b/i, 1]],
  brokerage: [[/self-directed investing/i, 3], [/\bbrokerage\b/i, 4], [/market value/i, 2], [/ending value/i, 2], [/beginning value/i, 2], [/dividends/i, 1], [/holdings|positions/i, 2], [/realized gain/i, 2], [/cost basis/i, 1]],
  ira_traditional: [[/traditional ira/i, 8], [/\bIRA\b/, 3]],
  ira_roth: [[/roth ira/i, 8]],
  ira_rollover: [[/rollover ira/i, 8]],
  ira_sep: [[/sep[- ]ira/i, 8]],
  k401: [[/401\s?\(?k\)?/i, 6], [/vested/i, 2], [/employer match/i, 2], [/recordkeeper|plan sponsor/i, 1]],
  k403b: [[/403\s?\(?b\)?/i, 8], [/vested/i, 1]],
  k457: [[/457\s?\(?b\)?/i, 8]],
  tsp: [[/thrift savings plan|\bTSP\b/i, 8]],
  hsa: [[/health savings account|\bHSA\b/i, 8], [/qualified medical/i, 1]],
  k529: [[/\b529\b/, 8], [/beneficiary/i, 2]],
  student_loan: [[/student loan/i, 6], [/\b(nelnet|mohela|aidvantage|navient|sallie mae|edfinancial|great lakes|studentaid\.gov)\b/i, 6], [/repayment plan/i, 3], [/servicer/i, 2], [/qualifying payments?/i, 2]],
  auto_loan: [[/auto loan|vehicle loan|auto finance/i, 7], [/\bVIN\b/, 3], [/\bvehicle\b/i, 2]],
  mortgage: [[/\bmortgage\b/i, 6], [/\bescrow\b/i, 4], [/principal and interest|principal & interest/i, 2], [/property address/i, 3], [/\bPMI\b/, 2]],
  personal_loan: [[/personal loan|installment loan/i, 7], [/loan payment/i, 1]]
};

// classifyText(text) -> { type, score, why: [words that voted], unsupportedAs }
export function classifyText(text) {
  const t = String(text || '');
  for (const [r, label] of UNSUPPORTED) if (r.test(t)) return { type: 'unsupported', score: 1, why: [label], unsupportedAs: label };
  const scores = {};
  const why = {};
  for (const [type, votes] of Object.entries(VOTES)) {
    let s = 0; why[type] = [];
    for (const [r, w] of votes) if (r.test(t)) { s += w; why[type].push(r.source.replace(/\\b|\\s\?|\(\?\:|[()\\?]/g, '').split('|')[0]); }
    scores[type] = s;
  }
  // An IRA, HSA, 529 or workplace plan with investment words is still that account, not a brokerage; a card
  // statement that lists "checking" as the pay-from account is still a card.
  for (const k of ['ira_traditional', 'ira_roth', 'ira_rollover', 'ira_sep', 'hsa', 'k529', 'k401', 'k403b', 'k457', 'tsp']) if (scores[k] >= 6) scores[k] += Math.min(scores.brokerage, 6);
  if (scores.credit_card >= 7) { scores.checking = Math.min(scores.checking, 4); scores.savings = Math.min(scores.savings, 4); }
  if (scores.hysa >= 7) scores.savings = Math.max(0, scores.savings - 3);
  const [type, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (score < 6) return { type: 'unknown', score, why: [] };
  return { type, score, why: why[type] };
}

// Confidence words for the review screen.
export const typeConfidence = (c) => (c.type === 'unknown' || c.type === 'unsupported' ? 'missing' : c.score >= 10 ? 'label' : 'inferred');
