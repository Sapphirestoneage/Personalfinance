// Turns a bank or card CSV into SLAM transactions: detects the format,
// normalizes signs (positive = money out), classifies the kind, and maps
// each one to a budget line (learned mappings first, then keyword rules).
// Supported: Chase card, Chase checking, Amex, Capital One, and a generic
// date / description / amount file.

import { parseCSV } from './csv.js';

export const FORMATS = {
  'chase-card': { label: 'Chase credit card', headers: ['transaction date', 'post date', 'description', 'category', 'type', 'amount'] },
  'chase-checking': { label: 'Chase checking', headers: ['details', 'posting date', 'description', 'amount', 'type', 'balance'] },
  amex: { label: 'American Express', headers: ['date', 'description', 'amount'], extra: ['card member', 'account #', 'extended details', 'appears on your statement as'] },
  'capital-one': { label: 'Capital One', headers: ['transaction date', 'posted date', 'card no.', 'description', 'category', 'debit', 'credit'] },
  generic: { label: 'Generic (date, description, amount)', headers: ['date', 'description', 'amount'] }
};

const norm = (h) => h.trim().toLowerCase();

export function detectFormat(headerRow) {
  const hs = headerRow.map(norm);
  const has = (list) => list.every((x) => hs.includes(x));
  if (has(FORMATS['capital-one'].headers)) return 'capital-one';
  if (has(FORMATS['chase-card'].headers)) return 'chase-card';
  if (has(FORMATS['chase-checking'].headers)) return 'chase-checking';
  if (has(FORMATS.amex.headers) && FORMATS.amex.extra.some((x) => hs.includes(x))) return 'amex';
  if (hs.some((x) => x.includes('date')) && hs.some((x) => x.includes('desc') || x === 'payee' || x === 'name') && hs.some((x) => x.includes('amount'))) return 'generic';
  return null;
}

// MM/DD/YYYY, M/D/YY, or YYYY-MM-DD -> YYYY-MM-DD
export function parseDate(s) {
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  }
  return null;
}

export function parseMoney(s) {
  const t = String(s === undefined ? '' : s).trim();
  if (t === '') return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-');
  const n = Number(t.replace(/[()$,\s+-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

// A short, stable merchant key: "WHOLE FOODS MARKET #123" -> "WHOLE FOODS MARKET".
export function merchantKey(description) {
  let d = String(description).toUpperCase();
  d = d.replace(/^(SQ \*|TST\* ?|POS |PURCHASE AUTHORIZED ON \d\d\/\d\d |DEBIT CARD PURCHASE |PAYPAL \*)/, '');
  d = d.replace(/#\s*\d+/g, ' ').replace(/\b\d{3,}\b/g, ' ').replace(/[*]/g, ' ').replace(/[^A-Z0-9&.' /-]/g, ' ');
  const words = d.split(/\s+/).filter(Boolean);
  return words.slice(0, 3).join(' ') || 'UNKNOWN';
}

// Read one row into { date, description, outflow, typeHint } where outflow > 0 is money out.
function readRow(format, cols, row, flip) {
  const get = (name) => row[cols.indexOf(name)];
  if (format === 'capital-one') {
    const debit = parseMoney(get('debit'));
    const credit = parseMoney(get('credit'));
    return { date: parseDate(get('transaction date')), description: get('description'), outflow: (debit || 0) - (credit || 0), typeHint: null };
  }
  if (format === 'chase-card') {
    const a = parseMoney(get('amount'));
    return { date: parseDate(get('transaction date')), description: get('description'), outflow: a === null ? null : -a, typeHint: (get('type') || '').toLowerCase() };
  }
  if (format === 'chase-checking') {
    const a = parseMoney(get('amount'));
    return { date: parseDate(get('posting date')), description: get('description'), outflow: a === null ? null : -a, typeHint: (get('type') || '').toLowerCase() };
  }
  if (format === 'amex') {
    const a = parseMoney(get('amount'));
    return { date: parseDate(get('date')), description: get('description'), outflow: a, typeHint: null };
  }
  // generic: negative means money out unless the coach flips it
  const dateCol = cols.find((c) => c.includes('date'));
  const descCol = cols.find((c) => c.includes('desc') || c === 'payee' || c === 'name');
  const amtCol = cols.find((c) => c.includes('amount'));
  const a = parseMoney(row[cols.indexOf(amtCol)]);
  return { date: parseDate(row[cols.indexOf(dateCol)]), description: row[cols.indexOf(descCol)], outflow: a === null ? null : (flip ? a : -a), typeHint: null };
}

function rx(pattern) { return new RegExp(pattern, 'i'); }

export function classifyKind(t, kindRules, isCard) {
  const d = t.description;
  const hint = t.typeHint;
  if (hint === 'payment' || rx(kindRules['card-payment']).test(d)) return 'card-payment';
  if (rx(kindRules.transfer).test(d)) return 'transfer';
  if (t.outflow < 0) {
    if (rx(kindRules.income).test(d)) return 'income';
    if (rx(kindRules.reimbursement).test(d)) return 'reimbursement';
    if (hint === 'return' || rx(kindRules.refund).test(d) || isCard) return 'refund';
    return 'income';
  }
  if (hint === 'fee' || rx(kindRules.fee).test(d)) return 'fee';
  return 'spend';
}

export function isBnpl(t, kindRules) {
  return rx(kindRules.bnpl).test(t.description);
}

// Learned mapping for the merchant first, then the first keyword rule that matches.
export function mapLine(t, rules, memory) {
  if (memory && memory[t.merchant]) return memory[t.merchant];
  if (t.kind === 'card-payment' || t.kind === 'transfer' || t.kind === 'income') return null;
  if (t.kind === 'reimbursement') return null; // a reimbursement only reduces a line the coach picks
  const d = t.description.toUpperCase();
  const hit = rules.find((r) => d.includes(r.match));
  return hit ? hit.lineId : null;
}

// Full import: text in, transactions out (not yet saved).
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
    if (!r.date || r.outflow === null || r.outflow === undefined || !r.description) { skipped.push(i + 2); return; }
    const base = { date: r.date, amount: Math.round(r.outflow * 100) / 100 + 0, description: r.description.trim(), account, typeHint: r.typeHint, outflow: r.outflow };
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

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
