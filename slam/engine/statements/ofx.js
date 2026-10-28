// OFX and QFX (S-243): the bank, card and brokerage download format. SGML (no closing tags on leaves) and XML both
// read. Returns one plain record: what account it is, its last four, balance as of a day, the transactions and, for
// an investment account, positions and cash. Full account numbers are reduced to the last four and never kept.

const TAG = /<(\/?)([A-Za-z0-9._]+)>([^<]*)/g;
export function parseOfx(text) {
  const s = String(text || '');
  const body = s.includes('<OFX>') ? s.slice(s.indexOf('<OFX>')) : s;
  const root = { tag: 'ROOT', kids: [], text: '' };
  const stack = [root];
  let m;
  while ((m = TAG.exec(body))) {
    const [, close, name, raw] = m;
    const tag = name.toUpperCase(), txt = raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    if (close) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; } continue; }
    const node = { tag, kids: [], text: txt };
    stack[stack.length - 1].kids.push(node);
    if (!txt) stack.push(node);
  }
  return root;
}
const find = (node, tag) => { if (!node) return null; if (node.tag === tag) return node; for (const k of node.kids) { const f = find(k, tag); if (f) return f; } return null; };
const findAll = (node, tag, out = []) => { if (!node) return out; if (node.tag === tag) out.push(node); for (const k of node.kids) findAll(k, tag, out); return out; };
const leaf = (node, tag) => { const f = find(node, tag); return f ? f.text : null; };
const num = (x) => { if (x === null || x === undefined || x === '') return null; const n = Number(String(x).replace(/,/g, '')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
const day = (x) => (x && /^\d{8}/.test(x) ? x.slice(0, 4) + '-' + x.slice(4, 6) + '-' + x.slice(6, 8) : null);
const lastFour = (id) => { const d = String(id || '').replace(/\D/g, ''); return d.length >= 4 ? d.slice(-4) : null; };

const TRN_TYPE = { CREDIT: 'deposit', DEBIT: 'withdrawal', INT: 'interest', DIV: 'dividend', FEE: 'fee', SRVCHG: 'fee', DEP: 'deposit', ATM: 'withdrawal', POS: 'purchase', XFER: 'transfer', CHECK: 'withdrawal', PAYMENT: 'payment', CASH: 'withdrawal', DIRECTDEP: 'deposit', DIRECTDEBIT: 'withdrawal', REPEATPMT: 'payment', OTHER: null };
export function readOfx(text) {
  const root = parseOfx(text);
  const cc = find(root, 'CCSTMTRS'), bank = find(root, 'STMTRS'), inv = find(root, 'INVSTMTRS');
  const stmt = cc || bank || inv;
  if (!stmt) throw new Error('This file does not hold an account statement.');
  const acctType = cc ? 'credit_card' : inv ? 'brokerage' : ({ CHECKING: 'checking', SAVINGS: 'savings', MONEYMRKT: 'savings', CREDITLINE: 'personal_loan', CD: 'cd' }[(leaf(stmt, 'ACCTTYPE') || '').toUpperCase()] || 'checking');
  const org = leaf(root, 'ORG'), broker = leaf(stmt, 'BROKERID');
  const out = { accountType: acctType, institution: org || broker || null, lastFour: lastFour(leaf(stmt, 'ACCTID')), balance: null, asOf: null, periodStart: day(leaf(stmt, 'DTSTART')), periodEnd: day(leaf(stmt, 'DTEND')), transactions: [], holdings: [], cash: null };
  const led = find(stmt, 'LEDGERBAL');
  if (led) { out.balance = num(leaf(led, 'BALAMT')); out.asOf = day(leaf(led, 'DTASOF')); }
  // A card's ledger balance is what is owed; OFX writes it negative. Kept positive, like a statement does.
  if (cc && out.balance !== null) out.balance = Math.abs(out.balance);
  for (const t of findAll(stmt, 'STMTTRN')) {
    const amt = num(leaf(t, 'TRNAMT')); const d = day(leaf(t, 'DTPOSTED'));
    if (amt === null || !d) continue;
    const trn = (leaf(t, 'TRNTYPE') || 'OTHER').toUpperCase();
    const description = [leaf(t, 'NAME'), leaf(t, 'MEMO')].filter(Boolean).join(' ').trim();
    // A card's charges read positive, its payments negative (as a statement prints them); a bank's deposits positive.
    const amount = cc ? -amt : amt;
    let type = TRN_TYPE[trn] || null;
    if (cc) type = /payment|thank you|autopay/i.test(description) || trn === 'PAYMENT' ? 'payment' : trn === 'INT' ? 'interest' : trn === 'FEE' || trn === 'SRVCHG' ? 'fee' : amount < 0 ? 'credit' : 'purchase';
    else if (!type) type = amount >= 0 ? 'deposit' : 'withdrawal';
    out.transactions.push({ date: d, description, amount, type, fitid: leaf(t, 'FITID') });
  }
  if (inv) {
    const names = {};
    for (const si of findAll(root, 'SECINFO')) { const id = leaf(si, 'UNIQUEID'); if (id) names[id] = { name: leaf(si, 'SECNAME'), ticker: leaf(si, 'TICKER') }; }
    for (const p of findAll(stmt, 'INVPOS')) {
      const id = leaf(p, 'UNIQUEID'), n = names[id] || {};
      const shares = num(leaf(p, 'UNITS')), price = num(leaf(p, 'UNITPRICE')), value = num(leaf(p, 'MKTVAL'));
      if (value === null) continue;
      out.holdings.push({ ticker: n.ticker || id || null, name: n.name || n.ticker || id || 'Holding', shares, price, value, costBasis: null, gain: null, assetClass: null });
    }
    const ib = find(stmt, 'INVBAL');
    if (ib) out.cash = num(leaf(ib, 'AVAILCASH'));
    const tot = out.holdings.reduce((s, h) => s + h.value, 0) + (out.cash || 0);
    if (out.balance === null && (out.holdings.length || out.cash !== null)) out.balance = Math.round(tot * 100) / 100;
    out.asOf = out.asOf || day(leaf(stmt, 'DTASOF'));
    for (const t of findAll(stmt, 'INCOME')) { const amt = num(leaf(t, 'TOTAL')); const d = day(leaf(t, 'DTTRADE')); if (amt !== null && d) out.transactions.push({ date: d, description: (leaf(t, 'MEMO') || 'Income') + (names[leaf(t, 'UNIQUEID')] ? ' ' + names[leaf(t, 'UNIQUEID')].ticker : ''), amount: amt, type: /DIV/i.test(leaf(t, 'INCOMETYPE') || '') ? 'dividend' : 'interest' }); }
  }
  return out;
}
