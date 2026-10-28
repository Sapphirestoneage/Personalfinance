// CSV exports (S-243): a transactions file (date, words, an amount or a debit/credit pair) or a positions file
// (symbol, quantity, price, value, cost basis). Columns are found by their header words; the mapping can be fixed
// once and remembered by the header's signature (the review screen keeps that in this browser). Chase, Amex and
// Capital One headers are known outright.

import { parseCsv } from '../feed.js';

export const COLUMNS = {
  date: [/^(?:transaction |trans |posting |post |posted |settlement |trade |run |process(?:ed)? )?date$/i, /^date (?:posted|of transaction)$/i, /^as of$/i],
  description: [/^description$/i, /^(?:payee|name|memo|details?|merchant|narrative|transaction description|original description)$/i],
  amount: [/^amount(?: \(usd\))?$/i, /^amt$/i, /^transaction amount$/i, /^net amount$/i],
  debit: [/^debit$/i, /^withdrawals?$/i, /^charges?$/i, /^money out$/i, /^outflow$/i],
  credit: [/^credit$/i, /^deposits?$/i, /^payments?$/i, /^money in$/i, /^inflow$/i],
  type: [/^type$/i, /^transaction type$/i, /^category$/i],
  balance: [/^(?:running )?balance$/i],
  symbol: [/^symbol$/i, /^ticker$/i, /^(?:security )?id$/i],
  name: [/^(?:security )?description$/i, /^security(?: name)?$/i, /^investment$/i, /^fund(?: name)?$/i, /^name$/i],
  quantity: [/^quantity$/i, /^shares$/i, /^units$/i, /^qty$/i],
  price: [/^(?:last |current |market )?price$/i, /^nav$/i],
  value: [/^(?:current |market |total )?value$/i, /^market value$/i, /^current value$/i, /^balance$/i],
  costBasis: [/^(?:total )?cost(?: basis)?(?: total)?$/i, /^cost basis total$/i, /^average cost$/i]
};
const norm = (h) => String(h || '').replace(/^﻿/, '').trim().toLowerCase();
export const signatureOf = (header) => header.map(norm).join('|');

// The column each role maps to, by the header words; roles not found are left out.
export function detectColumns(header) {
  const hs = header.map(norm);
  const map = {};
  // The first words of a role win over a later header ("Type" before "Category").
  for (const [role, res] of Object.entries(COLUMNS)) for (const r of res) { const i = hs.findIndex((h) => r.test(h)); if (i >= 0) { map[role] = i; break; } }
  // "Details" with DEBIT/CREDIT words (Chase checking) is a type column, not the description.
  if (map.description !== undefined && hs[map.description] === 'details' && hs.includes('description')) { map.type = map.description; map.description = hs.indexOf('description'); }
  // A security's name only matters in a positions file.
  if (map.symbol === undefined && map.quantity === undefined) delete map.name;
  return map;
}
export const kindOf = (map) => (map.symbol !== undefined && map.quantity !== undefined && (map.value !== undefined || map.price !== undefined) ? 'positions' : map.date !== undefined && (map.amount !== undefined || map.debit !== undefined || map.credit !== undefined) ? 'transactions' : null);

// Known exports, by header, and what account they come from.
const KNOWN = [
  { id: 'chase-card', institution: 'Chase', accountType: 'credit_card', has: ['transaction date', 'post date', 'description', 'category', 'type', 'amount'], flip: true },
  { id: 'chase-checking', institution: 'Chase', accountType: 'checking', has: ['details', 'posting date', 'description', 'amount', 'type', 'balance'], flip: false },
  { id: 'amex', institution: 'American Express', accountType: 'credit_card', has: ['date', 'description', 'amount'], extra: ['card member', 'account #', 'extended details'], flip: false },
  { id: 'capital-one', institution: 'Capital One', accountType: 'credit_card', has: ['transaction date', 'posted date', 'card no.', 'description', 'category', 'debit', 'credit'], flip: false }
];
export function knownFormat(header) {
  const hs = header.map(norm);
  return KNOWN.find((k) => k.has.every((x) => hs.includes(x)) && (!k.extra || k.extra.some((x) => hs.includes(x)))) || null;
}

const toDate = (s) => { const t = String(s || '').trim(); let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'); m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); m = /^(\d{8})$/.exec(t); if (m) return t.slice(0, 4) + '-' + t.slice(4, 6) + '-' + t.slice(6, 8); return null; };
const toNum = (s) => { const t = String(s === undefined || s === null ? '' : s).trim(); if (!t) return null; const neg = /^\(.*\)$/.test(t) || t.startsWith('-') || /-$/.test(t); const n = Number(t.replace(/[()$,\s%+-]/g, '')); return Number.isFinite(n) ? Math.round((neg ? -n : n) * 100) / 100 : null; };
const hint = (name, re) => re.test(String(name || ''));
// What account a file is for, from its name when the headers do not say.
export function typeFromName(name) {
  const n = String(name || '');
  if (hint(n, /roth/i)) return 'ira_roth';
  if (hint(n, /rollover/i)) return 'ira_rollover';
  if (hint(n, /sep/i) && hint(n, /ira/i)) return 'ira_sep';
  if (hint(n, /\bira\b/i)) return 'ira_traditional';
  if (hint(n, /401\s?k|403\s?b|457/i)) return 'k401';
  if (hint(n, /\bhsa\b/i)) return 'hsa';
  if (hint(n, /529/)) return 'k529';
  if (hint(n, /saving/i)) return 'savings';
  if (hint(n, /checking/i)) return 'checking';
  if (hint(n, /card|credit|visa|mastercard|amex/i)) return 'credit_card';
  if (hint(n, /position|holding|portfolio|brokerage/i)) return 'brokerage';
  return null;
}
export const lastFourFromName = (name) => { const m = /(?:chase|acct|account|ending|x|\*|-)(?!19\d\d|20\d\d)(\d{4})(?=[_.\s-]|$)/i.exec(String(name || '')); return m ? m[1] : null; };

// readCsv(text, { name, mapping, flip }) -> { kind, header, signature, map, format, accountType, institution, lastFour, transactions | holdings, skipped, needsMapping }
export function readCsv(text, { name = '', mapping = null, flip = null } = {}) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('The file is empty.');
  // The header is the first row with at least two words and no amount in it (some exports start with a title line).
  let hi = rows.findIndex((r) => r.filter((c) => c.trim()).length >= 2 && r.every((c) => toDate(c) === null) && r.filter((c) => /^[A-Za-z]/.test(c.trim())).length >= 2);
  if (hi < 0) hi = 0;
  const header = rows[hi];
  const known = knownFormat(header);
  const map = mapping || detectColumns(header);
  const kind = kindOf(map);
  const out = { kind, header: header.map((h) => String(h).trim()), signature: signatureOf(header), map, format: known ? known.id : null, institution: known ? known.institution : null, accountType: known ? known.accountType : typeFromName(name), lastFour: lastFourFromName(name), transactions: [], holdings: [], skipped: [], needsMapping: !kind };
  if (!kind) return out;
  const doFlip = flip !== null ? flip : known ? known.flip : (out.accountType === 'credit_card');
  rows.slice(hi + 1).forEach((r, i) => {
    const get = (role) => (map[role] === undefined ? undefined : r[map[role]]);
    if (kind === 'transactions') {
      const date = toDate(get('date'));
      let amount = toNum(get('amount'));
      if (amount === null && (map.debit !== undefined || map.credit !== undefined)) { const d = toNum(get('debit')), c = toNum(get('credit')); if (d !== null || c !== null) amount = (c || 0) - Math.abs(d || 0); }
      const description = String(get('description') || '').trim();
      if (!date || amount === null || !description) { if (r.some((c) => c.trim())) out.skipped.push(hi + i + 2); return; }
      // A card export writes charges negative; a statement prints them positive, so the sign is turned.
      const signed = doFlip ? -amount : amount;
      const t = String(get('type') || '').toLowerCase();
      const type = out.accountType === 'credit_card'
        ? (/payment/.test(t) || /payment|thank you|autopay/i.test(description) ? 'payment' : /fee/.test(t) || /\bfee\b/i.test(description) ? 'fee' : /interest/i.test(description) ? 'interest' : signed < 0 ? 'credit' : 'purchase')
        : (/interest/i.test(description) ? 'interest' : /\bfee\b|overdraft/i.test(description) || /fee/.test(t) ? 'fee' : /transfer|xfer|zelle|venmo/i.test(description) ? 'transfer' : signed >= 0 ? 'deposit' : 'withdrawal');
      out.transactions.push({ date, description, amount: signed, balance: toNum(get('balance')), type });
    } else {
      const ticker = String(get('symbol') || '').trim().toUpperCase();
      const shares = toNum(get('quantity')), price = toNum(get('price')), value = toNum(get('value'));
      if (!ticker || (value === null && (shares === null || price === null))) { if (r.some((c) => c.trim())) out.skipped.push(hi + i + 2); return; }
      if (/^(total|cash|pending)/i.test(ticker) && value !== null && shares === null) return;
      const v = value !== null ? value : Math.round(shares * price * 100) / 100;
      const cb = toNum(get('costBasis'));
      out.holdings.push({ ticker, name: String(get('name') || ticker).trim(), shares, price, value: v, costBasis: cb, gain: cb !== null ? Math.round((v - cb) * 100) / 100 : null, assetClass: null });
    }
  });
  return out;
}
