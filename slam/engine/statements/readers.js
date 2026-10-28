// The readers (S-243): one per kind of statement. Each takes the page text, the profile's labels laid over the
// generic ones, and returns fields: { key: { value, conf } }, plus the lists a statement carries (APR tiers,
// holdings, sources, funds, transactions). Money is in dollars to the cent, rates are fractions (0.1874), dates ISO.
// Nothing here writes to the household; apply.js does that after the review.

import { LABELS } from './profiles/generic.js';
import { field, missing, val, findMoney, findSecondMoney, moneyCellsAfter, findTextCell, findRate, findDate, findDateRange, findText, findInt, findLastFour, has, parseMoney, parseRate, parseDate, dateInPeriod, daysBetween, MONEY_RE, DATE_RE } from './text.js';

// The profile's words first, then the generic ones, key by key.
export function labelsFor(profile, section) {
  const g = LABELS[section] || {}, p = (profile && profile.labels && profile.labels[section]) || {};
  const out = {};
  for (const k of new Set([...Object.keys(p), ...Object.keys(g)])) {
    const a = p[k], b = g[k];
    out[k] = Array.isArray(a) || Array.isArray(b) ? [...[].concat(a || []), ...[].concat(b || [])] : a !== undefined ? a : b;
  }
  return out;
}
const money = (text, L, k, o) => findMoney(text, L[k], o);
const rate = (text, L, k) => findRate(text, L[k]);
const date = (text, L, k) => findDate(text, L[k]);
const int = (text, L, k) => findInt(text, L[k]);
const txt = (text, L, k) => findText(text, L[k]);
const txtCell = (ctx, L, k) => findTextCell(ctx.pages, L[k], ctx.text);
const abs = (f) => (val(f) === null ? f : { ...f, value: Math.abs(f.value) });
const isMoneyToken = (s) => parseMoney(s) !== null && /\d/.test(s);

// ---------------------------------------------------------------- what every statement carries
// The owner lines sit over the street in the address block: the first cell of a line that reads like a street or a
// PO box, with the city/state/zip line under it. One or two all-caps lines above are the names; a second line that
// reads like a company is the business name, otherwise a second person (a joint account). Inferred, never certain.
const ORG = /\b(LLC|L\.L\.C\.|INC|INC\.|CORP|CORPORATION|CO\.|LTD|LLP|PLLC|P\.?C\.?|SOLUTIONS|SERVICES|GROUP|CONSULTING|STUDIO|STUDIOS|DESIGN|DESIGNS|PARTNERS|ASSOCIATES|ENTERPRISES|HOLDINGS|COMPANY|AGENCY|LABS|MEDIA|CAPITAL|VENTURES|FOUNDATION|TRUST|DBA|PHOTOGRAPHY|CONSTRUCTION|THERAPY|DENTAL|LAW|REALTY|PROPERTIES|FARM|BAKERY|CAFE|SHOP|STORE)\b/i;
const NOT_A_NAME = /\b(ACCOUNT|STATEMENT|PAYMENT|BALANCE|SUMMARY|TOTAL|CHASE|BANK|VISA|MASTERCARD|CARD|CUSTOMER|SERVICE|P\.?O\.? BOX|PAGE|DATE|AMOUNT|DUE|NEW|PREVIOUS|CREDIT|MEMBER|SINCE|PLEASE|REMIT|SEND|MAIL|PAYMENTS|CARDMEMBER)\b/i;
const CITY = /^[A-Z][A-Za-z .'-]+,? [A-Z]{2} \d{5}(?:-\d{4})?$/;
const STREET = /^(?:\d+[A-Z]?\s+\S|P\.?O\.? BOX\s+\d+|PO BOX)/i;
const PERSON = /^[A-Z][A-Z.'-]+(?: [A-Z][A-Z.'-]*){1,3}$/;
export function readOwners(pages) {
  for (const page of (pages || []).slice(0, 2)) {
    const lines = page.lines || [];
    for (let i = 1; i < lines.length; i++) {
      const city = (lines[i].cells[0] || {}).text || '';
      if (!CITY.test(city)) continue;
      const street = (lines[i - 1].cells[0] || {}).text || '';
      if (!STREET.test(street)) continue;
      const above = [];
      for (let j = i - 2; j >= 0 && j >= i - 4; j--) {
        const c = lines[j].cells[0]; if (!c) break;
        const t = c.text.trim();
        if (!/^[A-Z0-9&.,' -]{3,48}$/.test(t) || NOT_A_NAME.test(t) || /\d{3,}/.test(t)) break;
        if (Math.abs(c.x - lines[i].cells[0].x) > 6) break;
        above.unshift(t);
      }
      if (!above.length) continue;
      const names = [], firstWords = above[0];
      let business = null;
      // "JORDAN DEMO AND SAM DEMO", "A & B", "A JTWROS": one line, two people.
      const split = firstWords.split(/\s+(?:AND|&)\s+/);
      if (split.length === 2 && split.every((x) => PERSON.test(x))) names.push(...split); else names.push(firstWords.replace(/\s+(JTWROS|JT TEN|TEN COM|TTEE)$/, ''));
      if (above[1]) { if (ORG.test(above[1]) || !PERSON.test(above[1])) business = above[1]; else names.push(above[1]); }
      const joint = names.length > 1 || /\b(JTWROS|JT TEN|TEN COM)\b/.test(firstWords);
      return { names: field(names, 'inferred'), business: business ? field(business, 'inferred') : missing(), joint: field(joint, 'inferred') };
    }
  }
  return { names: missing(), business: missing(), joint: missing() };
}

// Product by the profile's list ([regex, words, business?]); the first match wins.
export function readProduct(text, profile) {
  for (const [r, words, business] of (profile && profile.products) || []) if (r.test(text)) return { product: field(words, 'label'), business: !!business };
  return { product: missing(), business: false };
}

export function readCommon(ctx) {
  const L = labelsFor(ctx.profile, 'common');
  const text = ctx.text;
  const lastFour = findLastFour(text, L.lastFour);
  let period = findDateRange(text, L.period);
  // A period printed with no label ("September 11, 2026 through October 10, 2026", "09/04/26 - 10/03/26").
  if (!val(period)) { const m = new RegExp('(' + DATE_RE.source + ')\\s*(?:through|to|until|-)\\s*(' + DATE_RE.source + ')', 'i').exec(text); if (m) { const a = parseDate(m[1]), b = parseDate(m[1 + 1 + 9]); if (a && b && a <= b) period = field({ open: a, close: b }, 'inferred'); } }
  let closing = val(period) && period.value.close ? field(period.value.close, period.conf) : date(text, L, 'closing');
  if (val(closing) && !val(period)) period = field({ open: null, close: closing.value }, 'inferred');
  const owners = readOwners(ctx.pages);
  const { product, business } = readProduct(text, ctx.profile);
  return { lastFour, period, closing, product, nameOnAccount: owners.names, businessName: owners.business, joint: owners.joint, businessHint: business || val(owners.business) !== null };
}

// ---------------------------------------------------------------- transactions out of the lines
// A row is a date (MM/DD, with or without a year, sometimes a second posting date), words, and an amount at the end
// (a bank row carries the running balance after it). The section it sits under says what it is.
const ROW = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(?:(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+)?(.+?)\s+(-?\$?\s?\(?[\d,]+\.\d{2}\)?-?(?:\s?CR)?)(?:\s+(-?\$?\s?[\d,]+\.\d{2}))?\s*$/;
const PAYMENT_WORDS = /payment|thank you|autopay|pymt/i;
const INTEREST_WORDS = /interest charge|interest charged|finance charge/i;
const FEE_WORDS = /\bfee\b|late charge|overdraft|insufficient funds|service charge/i;
const DIVIDEND_WORDS = /dividend|div\b|cap(?:ital)? gain/i;
const TRANSFER_WORDS = /transfer|xfer|to savings|from savings|to checking|from checking|online transfer|zelle|venmo/i;
const DEPOSIT_WORDS = /deposit|payroll|direct dep|dir dep|salary|credit\b|refund|interest paid|interest earned/i;
export function readTransactions(ctx, kind) {
  const out = [];
  const close = val(ctx.common && ctx.common.closing);
  const secs = (labelsFor(ctx.profile, kind === 'card' ? 'card' : 'bank').sections) || {};
  for (const page of ctx.pages || []) {
    let section = null;
    for (const line of page.lines || []) {
      const t = line.text.trim();
      for (const [k, r] of Object.entries(secs)) if (r.test(t) && t.length < 60) section = k;
      const m = ROW.exec(t);
      if (!m) continue;
      const raw = m[1].includes('/') && m[1].split('/').length === 3 ? parseDate(m[1]) : dateInPeriod(m[1], close);
      const amount = parseMoney(m[4]);
      if (!raw || amount === null) continue;
      const description = m[3].replace(/\s+/g, ' ').trim();
      if (/^(total|subtotal)\b/i.test(description)) continue;
      out.push({ date: raw, description, amount, balance: m[5] ? parseMoney(m[5]) : null, type: txType(kind, section, description, amount) });
    }
  }
  return out;
}
function txType(kind, section, d, amount) {
  if (kind === 'card') {
    if (section === 'interest' || INTEREST_WORDS.test(d)) return 'interest';
    if (section === 'fee' || FEE_WORDS.test(d)) return 'fee';
    if (section === 'payment' || amount < 0) return PAYMENT_WORDS.test(d) ? 'payment' : 'credit';
    if (section === 'cashAdvance') return 'cash_advance';
    if (section === 'transfer') return 'transfer';
    return 'purchase';
  }
  if (kind === 'investment') { if (DIVIDEND_WORDS.test(d)) return 'dividend'; if (/interest/i.test(d)) return 'interest'; if (FEE_WORDS.test(d)) return 'fee'; return amount >= 0 ? 'deposit' : 'withdrawal'; }
  if (INTEREST_WORDS.test(d) || /interest (?:paid|earned|payment)/i.test(d)) return 'interest';
  if (section === 'fee' || FEE_WORDS.test(d)) return 'fee';
  if (TRANSFER_WORDS.test(d)) return 'transfer';
  if (PAYMENT_WORDS.test(d) && amount < 0) return 'payment';
  if (section === 'deposit' || (amount > 0 && DEPOSIT_WORDS.test(d))) return 'deposit';
  return amount >= 0 ? (section === 'withdrawal' ? 'withdrawal' : 'deposit') : 'withdrawal';
}

// ---------------------------------------------------------------- holdings
// A holding row names a ticker (1 to 5 capitals) with shares, price and value after it, then cost basis and gain when
// the statement gives them. Rows under a class heading (Stocks, ETFs, Mutual funds, Bonds, Cash) carry that class.
const NUM = /^-?\(?\$?\s?[\d,]*\.?\d+\)?%?$/;
const NOT_TICKER = new Set(['CASH', 'TOTAL', 'USD', 'ETF', 'ETFS', 'FUND', 'INC', 'CORP', 'CO', 'LLC', 'NAV', 'YTD', 'APY', 'CD', 'IRA', 'HSA', 'TSP', 'N/A', 'NA', 'SWEEP', 'CLASS', 'FDIC']);
export function readHoldings(ctx) {
  const L = labelsFor(ctx.profile, 'investment');
  const out = [];
  for (const page of ctx.pages || []) {
    let assetClass = null;
    for (const line of page.lines || []) {
      const t = line.text.trim();
      if (L.assetClass.test(t)) { assetClass = t.replace(/\s+/g, ' ').toLowerCase(); continue; }
      if (/^total/i.test(t)) continue;
      const toks = t.split(/\s+/);
      const nums = [];
      while (toks.length && NUM.test(toks[toks.length - 1])) nums.unshift(toks.pop());
      if (nums.length < 3 || !toks.length) continue;
      let ti = -1;
      for (let i = toks.length - 1; i >= 0; i--) if (/^[A-Z]{1,5}$/.test(toks[i]) && !NOT_TICKER.has(toks[i])) { ti = i; break; }
      if (ti < 0) continue;
      const name = (ti === toks.length - 1 ? toks.slice(0, ti) : [...toks.slice(0, ti), ...toks.slice(ti + 1)]).join(' ').replace(/[,;:]+$/, '').trim();
      const n = nums.map((x) => (x.endsWith('%') ? null : parseMoney(x)));
      const [shares, price, value, costBasis = null, gain = null] = n;
      if (shares === null || price === null || value === null) continue;
      // Shares and price must multiply to about the value; otherwise the numbers are not a holding row.
      if (Math.abs(shares * price - value) > Math.max(1, value * 0.02)) continue;
      out.push({ ticker: toks[ti], name: name || toks[ti], shares, price, value, costBasis, gain, assetClass });
    }
  }
  return out;
}

// ---------------------------------------------------------------- credit card
const APR_KIND = (label) => (/cash/i.test(label) ? 'cash' : /transfer/i.test(label) ? 'transfer' : /loan/i.test(label) ? 'loan' : /purchase/i.test(label) ? 'purchase' : /penalty/i.test(label) ? 'penalty' : 'other');
export function readCard(ctx) {
  const L = labelsFor(ctx.profile, 'card');
  const text = ctx.text;
  const f = {
    previousBalance: money(text, L, 'previousBalance'), payments: money(text, L, 'payments'), purchases: money(text, L, 'purchases'),
    cashAdvances: money(text, L, 'cashAdvances'), balanceTransfers: money(text, L, 'balanceTransfers'), fees: money(text, L, 'fees'),
    interest: money(text, L, 'interest'), newBalance: money(text, L, 'newBalance'), pastDue: money(text, L, 'pastDue'), overLimit: money(text, L, 'overLimit'),
    limit: money(text, L, 'limit'), availableCredit: money(text, L, 'availableCredit'), cashLine: money(text, L, 'cashLine'), availableCash: money(text, L, 'availableCash'),
    minimum: money(text, L, 'minimum'), dueDate: date(text, L, 'dueDate'), daysInCycle: int(text, L, 'daysInCycle'),
    autopayAmount: money(text, L, 'autopayAmount'), penaltyApr: rate(text, L, 'penaltyApr'), lateFeeMax: money(text, L, 'lateFeeMax'),
    ytdFees: money(text, L, 'ytdFees'), ytdInterest: money(text, L, 'ytdInterest'),
    pointsPrevious: int(text, L, 'pointsPrevious'), pointsAvailable: int(text, L, 'pointsAvailable'), pointsRedeemed: abs(int(text, L, 'pointsRedeemed')), pointsEarned: int(text, L, 'pointsEarned')
  };
  // Payments and credits read as money out of the balance: kept positive.
  f.payments = abs(f.payments);
  // AutoPay: on when an amount is printed or the words say so; off when the statement invites signing up; else not shown.
  if (val(f.autopayAmount) !== null || has(text, L.autopayOn)) f.autopay = field(true, val(f.autopayAmount) !== null ? 'label' : 'inferred');
  else if (has(text, L.autopayOff)) f.autopay = field(false, 'inferred');
  else f.autopay = missing('not shown on this statement');
  // AutoPay type: the full balance when the amount is the new balance, the minimum when it is the minimum due, else fixed.
  const ap = val(f.autopayAmount), nb = val(f.newBalance), mn = val(f.minimum);
  f.autopayType = ap === null ? (val(f.autopay) === false ? field('off', 'inferred') : missing()) : field(nb !== null && Math.abs(ap - nb) < 0.005 ? 'full' : mn !== null && Math.abs(ap - mn) < 0.005 ? 'minimum' : 'fixed', 'inferred');
  // The APR table: every row with a rate, the balance subject to interest and the interest charged.
  const tiers = [];
  for (const page of ctx.pages || []) for (const line of page.lines || []) {
    const m = L.aprRow.exec(line.text.trim());
    if (!m) continue;
    const label = m[1].replace(/\s+/g, ' ').trim();
    if (!label || /penalty|late fee|may increase/i.test(label) || label.length > 60 || /\bAPY\b|yield/i.test(label)) continue;
    const kind = APR_KIND(label);
    if (kind === 'other' && !/promo|intro|special/i.test(label)) continue;
    const rest = m[4].match(/-\s?0\s?-|\(?-?\$?[\d,]+(?:\.\d{2})?\)?/g) || [];
    const until = /prior to (\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(label);
    tiers.push({ kind, label, apr: parseRate(m[2] + '%'), variable: /\(v\)/i.test(m[3]), subject: rest[0] !== undefined ? parseMoney(rest[0]) : null, interest: rest[1] !== undefined ? parseMoney(rest[1]) : null, until: until ? parseDate(until[1]) : null });
  }
  f.tiers = tiers;
  const first = (k) => tiers.find((t) => t.kind === k);
  const purchaseTiers = tiers.filter((t) => t.kind === 'purchase');
  // The purchase APR today is the tier with no end date (new purchases); an older tier is kept in the list.
  const current = purchaseTiers.find((t) => !t.until) || purchaseTiers[0];
  f.apr = current ? field(current.apr, 'label') : missing();
  f.cashApr = first('cash') ? field(first('cash').apr, 'label') : missing();
  f.transferApr = first('transfer') ? field(first('transfer').apr, 'label') : missing();
  f.loanApr = first('loan') ? field(first('loan').apr, 'label') : missing();
  if (val(f.interest) === null && tiers.length) { const sum = tiers.reduce((s, t) => s + (t.interest || 0), 0); f.interest = field(Math.round(sum * 100) / 100, 'inferred'); }
  // The minimum payment warning table.
  const w1 = /only the minimum payment\s+(?:about\s+)?(\d+)\s+(years?|months?)\s+\$?([\d,]+)/i.exec(text);
  const w2 = /\$([\d,]+)\s+(\d+)\s+months?\s+\$?([\d,]+)/i.exec(text.slice(w1 ? w1.index : 0));
  f.minimumWarning = w1 ? field({ minimumOnlyMonths: /year/i.test(w1[2]) ? +w1[1] * 12 : +w1[1], minimumOnlyTotal: parseMoney(w1[3]), payoffIn3Payment: w2 ? parseMoney(w2[1]) : null, payoffIn3Total: w2 ? parseMoney(w2[3]) : null }, 'label') : missing();
  // Rewards: the earn-rate lines as text, points earned as their sum when no total is printed.
  const earnLines = [];
  for (const page of ctx.pages || []) for (const line of page.lines || []) { const t = line.text.trim(); if (/^\+?\s?\d+(?:\.\d+)?\s?%/.test(t) && /\b(earn|back|on|per)\b/i.test(t) && t.length < 140) earnLines.push(t); }
  f.earnRates = earnLines;
  if (val(f.pointsEarned) === null && earnLines.length) { const sum = earnLines.map((l) => { const m = /(-?[\d,]+)\s*$/.exec(l); return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0; }).reduce((a, b) => a + b, 0); f.pointsEarned = field(sum, 'inferred'); }
  if (val(f.pointsEarned) === null && val(f.pointsPrevious) !== null && val(f.pointsAvailable) !== null) f.pointsEarned = field(val(f.pointsAvailable) - val(f.pointsPrevious) + (val(f.pointsRedeemed) || 0), 'inferred');
  f.transactions = readTransactions(ctx, 'card');
  // An annual fee this period, from the fee rows.
  const af = f.transactions.find((t) => t.type === 'fee' && /annual (?:membership )?fee/i.test(t.description));
  f.annualFee = af ? field(af.amount, 'label') : missing();
  return f;
}

// ---------------------------------------------------------------- checking, savings
export function readBank(ctx) {
  const L = labelsFor(ctx.profile, 'bank');
  const text = ctx.text;
  const f = {
    beginning: money(text, L, 'beginning'), ending: money(text, L, 'ending'), deposits: money(text, L, 'deposits'), withdrawals: abs(money(text, L, 'withdrawals')),
    apy: rate(text, L, 'apy'), interestPeriod: money(text, L, 'interestPeriod'), interestYtd: money(text, L, 'interestYtd'),
    fees: abs(money(text, L, 'fees')), overdraft: abs(money(text, L, 'overdraft')), minBalance: money(text, L, 'minBalance')
  };
  if (val(f.withdrawals) === null) {
    // Each summary line that names a kind of withdrawal, counted once, never a dated row.
    let sum = 0, any = false;
    for (const line of text.split('\n')) {
      if (/^\d{1,2}\//.test(line.trim()) || !L.withdrawalParts.some((r) => new RegExp(r.source, 'i').test(line))) continue;
      const m = findMoney(line, L.withdrawalParts);
      if (val(m) !== null) { sum += Math.abs(m.value); any = true; }
    }
    if (any) f.withdrawals = field(Math.round(sum * 100) / 100, 'inferred');
  }
  f.transactions = readTransactions(ctx, 'bank');
  if (val(f.interestPeriod) === null) { const i = f.transactions.find((t) => t.type === 'interest'); if (i) f.interestPeriod = field(Math.abs(i.amount), 'inferred'); }
  return f;
}

// ---------------------------------------------------------------- CD
export function readCd(ctx) {
  const L = labelsFor(ctx.profile, 'cd');
  const text = ctx.text;
  const f = { balance: money(text, L, 'balance'), rate: rate(text, L, 'rate'), apy: rate(text, L, 'apy'), term: txtCell(ctx, L, 'term'), openDate: date(text, L, 'openDate'), maturity: date(text, L, 'maturity'), penalty: txtCell(ctx, L, 'penalty') };
  if (val(f.term)) f.term = field(f.term.value.replace(/[.,;].*$/, '').trim().slice(0, 40), 'label');
  if (val(f.penalty)) f.penalty = field(f.penalty.value.replace(/^(?:is|of|:)\s*/i, '').slice(0, 120), 'label');
  return f;
}

// ---------------------------------------------------------------- brokerage, IRA, HSA, 529
export function readInvestment(ctx) {
  const L = labelsFor(ctx.profile, 'investment');
  const text = ctx.text;
  const closeYear = val(ctx.common && ctx.common.closing) ? +ctx.common.closing.value.slice(0, 4) : null;
  const f = {
    beginning: money(text, L, 'beginning'), ending: money(text, L, 'ending'), deposits: money(text, L, 'deposits'), withdrawals: abs(money(text, L, 'withdrawals')),
    changeInValue: money(text, L, 'changeInValue'), dividendsPeriod: money(text, L, 'dividendsPeriod'), dividendsYtd: money(text, L, 'dividendsYtd'), interestYtd: money(text, L, 'interestYtd'),
    qualifiedDividends: money(text, L, 'qualifiedDividends'), ordinaryDividends: money(text, L, 'ordinaryDividends'), realizedShort: money(text, L, 'realizedShort'), realizedLong: money(text, L, 'realizedLong'),
    cashBalance: money(text, L, 'cashBalance'), sweepYield: rate(text, L, 'sweepYield'), fees: abs(money(text, L, 'fees')), costBasis: money(text, L, 'costBasis'), unrealized: money(text, L, 'unrealized'),
    distributionsYtd: abs(money(text, L, 'distributionsYtd')), conversions: money(text, L, 'conversions'), rolloverIn: money(text, L, 'rolloverIn'),
    employeeContrib: money(text, L, 'employeeContrib'), employerContrib: money(text, L, 'employerContrib'), investedBalance: money(text, L, 'investedBalance'), threshold: money(text, L, 'threshold'),
    beneficiary: missing()
  };
  // A two-column income table (this period, year to date): the second figure on the label's line is the year's.
  const pair = (labels) => { const c = moneyCellsAfter(ctx.pages, labels); return c.length >= 2 ? field(c[1], 'label') : missing(); };
  if (val(f.dividendsYtd) === null) { const p = pair([/dividends(?: and interest)?(?: income)?$/i, /dividends$/i]); f.dividendsYtd = val(p) !== null ? p : findSecondMoney(text, [/dividends(?: and interest)?/i]); }
  { const q = pair([/qualified dividends$/i]); if (val(q) !== null) f.qualifiedDividends = q; }
  if (val(f.interestYtd) === null) { const p = pair([/interest(?: income)?$/i]); f.interestYtd = val(p) !== null ? p : findSecondMoney(text, [/interest(?: income)?/i]); }
  if (val(f.beneficiary) === null) f.beneficiary = txtCell(ctx, L, 'beneficiary');
  // Contributions by tax year: "Contributions for tax year 2026 $3,500.00"; a plain year-to-date figure is the close year's.
  const byYear = {};
  const rg = new RegExp(L.contributionsForYear.source, 'gi'); let m;
  while ((m = rg.exec(text))) { const y = +(m[1] || m[3]); const a = parseMoney(m[2] || m[4]); if (a !== null && !/distribution|employer|conversion/i.test(m[0])) byYear[y] = Math.max(byYear[y] || 0, a); }
  const ytd = money(text, L, 'contributionsYtd');
  if (!Object.keys(byYear).length && val(ytd) !== null && closeYear) byYear[closeYear] = ytd.value;
  f.contributions = Object.keys(byYear).length ? field(Object.entries(byYear).map(([year, amount]) => ({ year: +year, amount })), Object.keys(byYear).length && !/distribution/i.test(String(ytd.note)) ? 'label' : 'inferred') : missing();
  if (val(f.beneficiary)) f.beneficiary = field(f.beneficiary.value.replace(/[.,;].*$/, '').trim().slice(0, 60), 'label');
  f.holdings = readHoldings(ctx);
  if (val(f.costBasis) === null && f.holdings.length && f.holdings.every((h) => h.costBasis !== null)) f.costBasis = field(Math.round(f.holdings.reduce((s, h) => s + h.costBasis, 0) * 100) / 100, 'inferred');
  if (val(f.unrealized) === null && f.holdings.length && f.holdings.every((h) => h.gain !== null)) f.unrealized = field(Math.round(f.holdings.reduce((s, h) => s + h.gain, 0) * 100) / 100, 'inferred');
  if (val(f.investedBalance) === null && f.holdings.length) f.investedBalance = field(Math.round(f.holdings.reduce((s, h) => s + h.value, 0) * 100) / 100, 'inferred');
  // The plan's state for a 529, from the plan's own words.
  const st = /\b(New York|NY|California|CA|Utah|UT|Nevada|NV|Ohio|OH|Virginia|VA|Illinois|IL|Michigan|MI|Pennsylvania|PA|New Jersey|NJ|Massachusetts|MA|Connecticut|CT|Maryland|MD|Texas|TX|Florida|FL|Georgia|GA|Colorado|CO|Oregon|OR|Washington|WA|Indiana|IN|Wisconsin|WI|Minnesota|MN|Iowa|IA|Nebraska|NE|Alaska|AK)(?:'s)? (?:529|college savings|direct plan|scholarshare|bright start|my529|path2college)/i.exec(text);
  f.planState = st ? field(st[1], 'inferred') : missing();
  f.transactions = readTransactions(ctx, 'investment');
  return f;
}

// ---------------------------------------------------------------- 401(k), 403(b), 457, TSP
const RECORDKEEPERS = /\b(Fidelity|Vanguard|Empower|Principal|Voya|T\. ?Rowe Price|Schwab|ADP|Paychex|Guideline|Human Interest|Betterment|John Hancock|TIAA|Nationwide|MassMutual|Transamerica|Alight|Merrill|Prudential|Lincoln Financial|Ascensus|Slavic401k|Vestwell|Thrift Savings Plan)\b/i;
export function readPlan(ctx) {
  const L = labelsFor(ctx.profile, 'plan');
  const text = ctx.text;
  const f = {
    planName: txtCell(ctx, L, 'planName'), employer: txtCell(ctx, L, 'employer'), total: money(text, L, 'total'), vestedBalance: money(text, L, 'vestedBalance'), vestedPct: rate(text, L, 'vestedPct'),
    unvested: money(text, L, 'unvested'), contributionRate: rate(text, L, 'contributionRate'), ytdEmployee: money(text, L, 'ytdEmployee'), ytdEmployer: money(text, L, 'ytdEmployer'),
    loanBalance: money(text, L, 'loanBalance'), loanPayment: money(text, L, 'loanPayment'), personalReturn: rate(text, L, 'personalReturn'), fees: abs(money(text, L, 'fees'))
  };
  for (const k of ['planName', 'employer']) if (val(f[k])) f[k] = field(f[k].value.replace(/\s{2,}.*$/, '').replace(/[.;].*$/, '').trim().slice(0, 80), 'label');
  const rk = RECORDKEEPERS.exec(text);
  f.recordkeeper = rk ? field(rk[1], 'inferred') : missing();
  // Balance by source.
  const sources = [];
  const rg = new RegExp(L.sourceRow.source, 'gim'); let m;
  while ((m = rg.exec(text))) { const name = m[1].replace(/\s+/g, ' ').toLowerCase(); if (!sources.some((s) => s.source === name)) sources.push({ source: name, amount: parseMoney(m[2]) }); }
  f.sources = sources;
  const match = sources.filter((s) => /match|safe harbor|employer/.test(s.source)).reduce((a, s) => a + (s.amount || 0), 0);
  if (val(f.total) === null && sources.length) f.total = field(Math.round(sources.reduce((a, s) => a + (s.amount || 0), 0) * 100) / 100, 'inferred');
  if (val(f.unvested) === null && val(f.total) !== null && val(f.vestedBalance) !== null) f.unvested = field(Math.round((f.total.value - f.vestedBalance.value) * 100) / 100, 'inferred');
  if (val(f.vestedPct) === null && val(f.unvested) !== null && match > 0) f.vestedPct = field(Math.round((1 - f.unvested.value / match) * 10000) / 10000, 'inferred');
  // Funds: name, ticker when printed, expense ratio, value.
  const funds = [];
  for (const page of ctx.pages || []) for (const line of page.lines || []) { const fm = L.fundRow.exec(line.text.trim()); if (fm && !/^totals?$/i.test(fm[1].trim())) funds.push({ name: fm[1].trim(), ticker: fm[2] || null, expenseRatio: parseRate(fm[3] + '%'), value: parseMoney(fm[4]) }); }
  f.funds = funds;
  f.transactions = [];
  return f;
}

// ---------------------------------------------------------------- loans
export function readLoan(ctx) {
  const L = labelsFor(ctx.profile, 'loan');
  const text = ctx.text;
  const f = {
    servicer: txtCell(ctx, L, 'servicer'), loanType: txtCell(ctx, L, 'loanType'), originalAmount: money(text, L, 'originalAmount'), principal: money(text, L, 'principal'),
    rate: rate(text, L, 'rate'), payment: money(text, L, 'payment'), dueDate: date(text, L, 'dueDate'), remainingTerm: int(text, L, 'remainingTerm'), payoffDate: date(text, L, 'payoffDate'),
    interestYtd: money(text, L, 'interestYtd'), pastDue: money(text, L, 'pastDue'), escrowBalance: money(text, L, 'escrowBalance'), escrowTaxes: money(text, L, 'escrowTaxes'),
    escrowInsurance: money(text, L, 'escrowInsurance'), escrowPmi: money(text, L, 'escrowPmi'), propertyAddress: txtCell(ctx, L, 'propertyAddress'), plan: txtCell(ctx, L, 'plan'), qualifyingPayments: int(text, L, 'qualifyingPayments')
  };
  for (const k of ['servicer', 'loanType', 'propertyAddress', 'plan']) if (val(f[k])) f[k] = field(f[k].value.replace(/\s{2,}.*$/, '').replace(/[;].*$/, '').trim().slice(0, 80), 'label');
  if (has(text, L.privateLoan)) f.federal = field(false, 'inferred'); else if (has(text, L.federal)) f.federal = field(true, 'inferred'); else f.federal = missing();
  f.fixedRate = /\bfixed\b/i.test(text) && !/\bvariable\b/i.test(text) ? field(true, 'inferred') : /\bvariable\b/i.test(text) ? field(false, 'inferred') : missing();
  if (ctx.type !== 'mortgage') for (const k of ['escrowBalance', 'escrowTaxes', 'escrowInsurance', 'escrowPmi', 'propertyAddress']) f[k] = missing();
  if (ctx.type !== 'student_loan') { f.plan = missing(); f.qualifyingPayments = missing(); }
  // A federal plan's words become the household's own id for it when they match one.
  if (val(f.plan)) { const w = f.plan.value; const id = [[/standard/i, 'standard'], [/graduated/i, 'graduated'], [/extended/i, 'extended'], [/income[- ]based|\bIBR\b/i, 'ibr'], [/repayment assistance|\bRAP\b/, 'rap'], [/pay as you earn|\bPAYE\b/, 'paye'], [/income[- ]contingent|\bICR\b/, 'icr'], [/\bSAVE\b/, 'save'], [/forbearance|deferment|paused/i, 'paused']].find(([r]) => r.test(w)); if (id) f.plan = field(id[1], f.plan.conf); }
  f.transactions = readTransactions(ctx, 'bank');
  return f;
}

export const READERS = { card: readCard, bank: readBank, cd: readCd, investment: readInvestment, plan: readPlan, loan: readLoan };
