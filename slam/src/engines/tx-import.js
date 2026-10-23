// Turns a bank or card CSV into SLAM transactions: detects the format, normalizes signs
// (positive = money out, in dollars to the cent), classifies the kind, and maps each one to a
// budget line (learned mappings first, then keyword rules). Supported: Chase card, Chase checking,
// Amex, Capital One, and a generic date / description / amount file. Depends on csv.js (the field
// splitter). The kind patterns and keyword rules come in as rulesData (src/data/merchant-rules.json,
// loaded by the caller) and the learned mappings as memory (doc.merchantMemory).

import { parseCSV } from './csv.js';

// A format matches when every header is present (trimmed, lower-cased). Amex also needs one of its
// extra headers, since its base three are the same as the generic file's.
export const FORMATS = {
  'chase-card': {
    label: 'Chase credit card',
    headers: ['transaction date', 'post date', 'description', 'category', 'type', 'amount']
  },
  'chase-checking': {
    label: 'Chase checking',
    headers: ['details', 'posting date', 'description', 'amount', 'type', 'balance']
  },
  amex: {
    label: 'American Express',
    headers: ['date', 'description', 'amount'],
    extra: ['card member', 'account #', 'extended details', 'appears on your statement as']
  },
  'capital-one': {
    label: 'Capital One',
    headers: ['transaction date', 'posted date', 'card no.', 'description', 'category', 'debit', 'credit']
  },
  generic: { label: 'Generic (date, description, amount)', headers: ['date', 'description', 'amount'] }
};

const norm = (h) => h.trim().toLowerCase();

/**
 * Which bank wrote the file, from its header row.
 * @param {string[]} headerRow the first CSV row
 * @returns {?string} a FORMATS key, or null when nothing matches
 */
export function detectFormat(headerRow) {
  const hs = headerRow.map(norm);
  const has = (list) => list.every((x) => hs.includes(x));
  // Most specific first; generic is anything with a date, a description (or payee or name), and an amount.
  if (has(FORMATS['capital-one'].headers)) return 'capital-one';
  if (has(FORMATS['chase-card'].headers)) return 'chase-card';
  if (has(FORMATS['chase-checking'].headers)) return 'chase-checking';
  if (has(FORMATS.amex.headers) && FORMATS.amex.extra.some((x) => hs.includes(x))) return 'amex';
  if (
    hs.some((x) => x.includes('date')) &&
    hs.some((x) => x.includes('desc') || x === 'payee' || x === 'name') &&
    hs.some((x) => x.includes('amount'))
  )
    return 'generic';
  return null;
}

/**
 * A bank date to 'YYYY-MM-DD'. Accepts MM/DD/YYYY, M/D/YY, or YYYY-MM-DD; anything after the date (a time) is ignored.
 * @param {string} s the cell
 * @returns {?string} 'YYYY-MM-DD', or null when it is not a date
 */
export function parseDate(s) {
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    // A two-digit year is 20xx: no bank export here predates 2000.
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  }
  return null;
}

/**
 * A money cell to a number: handles $, commas, spaces, a leading minus, and accountant's parentheses for negative.
 * @param {string|number|undefined} s the cell
 * @returns {?number} dollars with the sign as written; null for an empty or unreadable cell (never 0)
 */
export function parseMoney(s) {
  const t = String(s === undefined ? '' : s).trim();
  if (t === '') return null;
  // The sign is read before the symbols are stripped: (12.34) and -12.34 both mean negative.
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-');
  const n = Number(t.replace(/[()$,\s+-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/**
 * A short, stable merchant key: "WHOLE FOODS MARKET #123" -> "WHOLE FOODS MARKET". The same key ties a
 * merchant's charges together across imports and is what a learned mapping is stored under.
 * @param {string} description the bank's description
 * @returns {string} up to three upper-case words; 'UNKNOWN' when nothing is left
 */
export function merchantKey(description) {
  let d = String(description).toUpperCase();
  // Processor prefixes first (Square, Toast, PayPal, Chase's "PURCHASE AUTHORIZED ON"), then store
  // numbers, runs of three or more digits (dates, card digits), and stray punctuation.
  d = d.replace(/^(SQ \*|TST\* ?|POS |PURCHASE AUTHORIZED ON \d\d\/\d\d |DEBIT CARD PURCHASE |PAYPAL \*)/, '');
  d = d
    .replace(/#\s*\d+/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/[*]/g, ' ')
    .replace(/[^A-Z0-9&.' /-]/g, ' ');
  const words = d.split(/\s+/).filter(Boolean);
  return words.slice(0, 3).join(' ') || 'UNKNOWN';
}

// Read one row into { date, description, outflow, typeHint } where outflow > 0 is money out.
function readRow(format, cols, row, flip) {
  const get = (name) => row[cols.indexOf(name)];
  if (format === 'capital-one') {
    // Capital One splits money into debit and credit columns; an empty one means nothing moved that way.
    const debit = parseMoney(get('debit'));
    const credit = parseMoney(get('credit'));
    return {
      date: parseDate(get('transaction date')),
      description: get('description'),
      outflow: (debit || 0) - (credit || 0),
      typeHint: null
    };
  }
  // Chase writes a charge as a negative amount, so the sign flips to read as money out.
  if (format === 'chase-card') {
    const a = parseMoney(get('amount'));
    return {
      date: parseDate(get('transaction date')),
      description: get('description'),
      outflow: a === null ? null : -a,
      typeHint: (get('type') || '').toLowerCase()
    };
  }
  if (format === 'chase-checking') {
    const a = parseMoney(get('amount'));
    return {
      date: parseDate(get('posting date')),
      description: get('description'),
      outflow: a === null ? null : -a,
      typeHint: (get('type') || '').toLowerCase()
    };
  }
  // Amex already writes charges as positive.
  if (format === 'amex') {
    const a = parseMoney(get('amount'));
    return { date: parseDate(get('date')), description: get('description'), outflow: a, typeHint: null };
  }
  // generic: negative means money out unless the coach flips it
  const dateCol = cols.find((c) => c.includes('date'));
  const descCol = cols.find((c) => c.includes('desc') || c === 'payee' || c === 'name');
  const amtCol = cols.find((c) => c.includes('amount'));
  const a = parseMoney(row[cols.indexOf(amtCol)]);
  return {
    date: parseDate(row[cols.indexOf(dateCol)]),
    description: row[cols.indexOf(descCol)],
    outflow: a === null ? null : flip ? a : -a,
    typeHint: null
  };
}

function rx(pattern) {
  return new RegExp(pattern, 'i');
}

/**
 * The kind of one imported row: card-payment, transfer, income, reimbursement, refund, fee, or spend.
 * @param {{description: string, typeHint: ?string, outflow: number}} t a row from readRow; outflow in dollars, positive = money out
 * @param {Object<string, string>} kindRules a regex source per kind (rulesData.kindRules)
 * @param {boolean} isCard true for a credit card file
 * @returns {string} the kind
 */
export function classifyKind(t, kindRules, isCard) {
  const d = t.description;
  const hint = t.typeHint;
  // The bank's own type column wins when there is one (Chase: payment, return, fee).
  if (hint === 'payment' || rx(kindRules['card-payment']).test(d)) return 'card-payment';
  if (rx(kindRules.transfer).test(d)) return 'transfer';
  if (t.outflow < 0) {
    if (rx(kindRules.income).test(d)) return 'income';
    if (rx(kindRules.reimbursement).test(d)) return 'reimbursement';
    // Money in on a card is a refund unless the text says otherwise; on a checking account it is
    // income, since paychecks arrive with no keyword at all.
    if (hint === 'return' || rx(kindRules.refund).test(d) || isCard) return 'refund';
    return 'income';
  }
  if (hint === 'fee' || rx(kindRules.fee).test(d)) return 'fee';
  return 'spend';
}

/**
 * Whether a row is a buy now, pay later installment (Affirm, Klarna, and the like).
 * @param {{description: string}} t a row
 * @param {Object<string, string>} kindRules a regex source per kind; the bnpl pattern is used
 * @returns {boolean}
 */
export function isBnpl(t, kindRules) {
  return rx(kindRules.bnpl).test(t.description);
}

/**
 * The budget line for a row: the learned mapping for the merchant first, then the first keyword rule that matches.
 * @param {{merchant: string, kind: string, description: string}} t a row with its merchant key and kind
 * @param {Array<{match: string, lineId: string}>} rules keyword rules (rulesData.rules); match is upper-case text to look for
 * @param {Object<string, string>} memory merchant key to line id (doc.merchantMemory)
 * @returns {?string} a line id, or null when the row should not land on a line
 */
export function mapLine(t, rules, memory) {
  // A learned mapping wins even for a kind that normally maps nowhere: the coach chose it.
  if (memory && memory[t.merchant]) return memory[t.merchant];
  if (t.kind === 'card-payment' || t.kind === 'transfer' || t.kind === 'income') return null;
  if (t.kind === 'reimbursement') return null; // a reimbursement only reduces a line the coach picks
  const d = t.description.toUpperCase();
  const hit = rules.find((r) => d.includes(r.match));
  return hit ? hit.lineId : null;
}

/**
 * Full import: text in, transactions out (not yet saved; the caller matches them against the log).
 * @param {string} text the file's contents
 * @param {object} o account: the account id; format: a FORMATS key or 'auto'; flip: true when a generic file writes
 *   money out as positive; rulesData: merchant-rules.json; memory: doc.merchantMemory
 * @returns {{format: string, formatLabel: string, transactions: object[], skippedRows: number[]}} amounts in dollars to the
 *   cent, positive = money out; skippedRows are 1-based line numbers of rows missing a date, an amount, or a description
 */
export function importCSV(text, { account, format = 'auto', flip = false, rulesData, memory = {} }) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('The file is empty.');
  const fmt = format === 'auto' ? detectFormat(rows[0]) : format;
  if (!fmt) throw new Error('Could not tell what kind of file this is. Pick the format by hand.');
  const cols = rows[0].map(norm);
  const isCard = fmt === 'chase-card' || fmt === 'amex' || fmt === 'capital-one';
  const out = [];
  const seen = {};
  const skipped = [];
  rows.slice(1).forEach((row, i) => {
    const r = readRow(fmt, cols, row, flip);
    // Row i is line i + 2 of the file: the header is line 1 and i counts from 0.
    if (!r.date || r.outflow === null || r.outflow === undefined || !r.description) {
      skipped.push(i + 2);
      return;
    }
    // Rounded to the cent; the + 0 turns a -0 into 0.
    const base = {
      date: r.date,
      amount: Math.round(r.outflow * 100) / 100 + 0,
      description: r.description.trim(),
      account,
      typeHint: r.typeHint,
      outflow: r.outflow
    };
    base.kind = classifyKind(base, rulesData.kindRules, isCard);
    base.merchant = merchantKey(base.description);
    base.lineId = mapLine(base, rulesData.rules, memory);
    base.bnpl = isBnpl(base, rulesData.kindRules);
    // Same date, amount, and description twice in one file is kept (it may be a real
    // double charge); the occurrence number keeps re-imports from adding it again.
    const sig = [account, base.date, base.amount, base.description].join('|');
    seen[sig] = (seen[sig] || 0) + 1;
    base.id = 'tx-' + hash(sig + '|' + seen[sig]);
    delete base.typeHint;
    delete base.outflow;
    out.push(base);
  });
  return { format: fmt, formatLabel: FORMATS[fmt].label, transactions: out, skippedRows: skipped };
}

// djb2 in base 36: a short id that comes out the same on every re-import of the same row.
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
