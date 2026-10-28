// From the review screen into the household (S-243). planImport lays out what each statement would write: the
// account it is (new, or one already there), every value as a Fact with its sureness, the static changes to confirm,
// the paychecks seen, the tax items for the year, and the rows for the cash flow log with transfers and card payments
// left out. applyPlan writes what the screen kept, in one change the shell can undo: the account's Facts, a snapshot
// of every statement under spine.statements, income lines, tax-year items and the log rows.

import { setAt, getAt, valueOf } from '../spine.js';
import { addItem, editIncome } from '../edits.js';
import { propose, applyImport } from '../feed.js';
import { cleanMerchant } from '../spending.js';
import { PRESETS, fieldsFor } from '../schema.js';
import { DOC_TYPES } from './classify.js';
import { val } from './text.js';
import { groupDocs, matchExisting, staticDiffs } from './merge.js';
import { deriveDoc, deriveBatch, deriveBank, accountKey } from './derive.js';

const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
const sourceOf = (doc) => (doc.file.kind === 'pdf' ? 'statement' : doc.file.kind);
// A Fact from a read Field: found by its label is known, worked out is rough, not found is missing (with a note).
export function toFact(f, { asOf, source, note = null }) {
  const out = { value: f && f.value !== undefined && f.value !== null ? f.value : null, kind: !f || f.value === null || f.value === undefined ? 'missing' : f.conf === 'inferred' ? 'rough' : 'known', asOf, source };
  const n = note || (f && f.note) || null;
  if (n) out.note = n;
  return out;
}
const K = (value, asOf, source, kind = 'known', note = null) => ({ value, kind: value === null ? 'missing' : kind, asOf, source, ...(note ? { note } : {}) });

// Values that are written even when not found, so the gap shows in My numbers.
const ESSENTIAL = { card: ['balance', 'limit', 'apr', 'minimum', 'dueDay'], bank: ['balance'], cd: ['balance', 'rate', 'maturityDate'], investment: ['balance'], plan: ['balance'], loan: ['balance', 'apr', 'minimum'] };

// The account's Facts from the newest statement of a group. Keys are the household's field names.
export function factsFor(doc, today) {
  const f = doc.fields || {}, c = doc.common || {};
  const asOf = val(c.closing) || today, source = sourceOf(doc);
  const T = (field, note) => toFact(field, { asOf, source, note });
  const out = {};
  const put = (k, field, note) => { if (field) out[k] = T(field, note); };
  put('institution', doc.institution); put('lastFour', c.lastFour); put('product', c.product);
  if (val(c.nameOnAccount)) out.nameOnAccount = K(c.nameOnAccount.value.join(', '), asOf, source, 'rough');
  if (val(c.businessName)) out.businessName = K(c.businessName.value, asOf, source, 'rough');
  if (val(c.joint) === true) out.owner = K('joint', asOf, source, 'rough');
  if (val(c.closing)) out.statementClose = K(c.closing.value, asOf, source);
  const dayOf = (iso) => (iso ? +iso.slice(8, 10) : null);
  if (doc.reader === 'card') {
    put('balance', f.newBalance); put('statementBalance', f.newBalance); put('limit', f.limit); put('apr', f.apr); put('cashApr', f.cashApr); put('transferApr', f.transferApr); put('loanApr', f.loanApr); put('penaltyApr', f.penaltyApr);
    put('minimum', f.minimum); put('dueDate', f.dueDate); put('lateFeeMax', f.lateFeeMax); put('cashLine', f.cashLine); put('ytdInterest', f.ytdInterest); put('ytdFees', f.ytdFees); put('autopayAmount', f.autopayAmount); put('points', f.pointsAvailable);
    if (val(f.dueDate)) out.dueDay = K(dayOf(f.dueDate.value), asOf, source, 'rough', 'the day the statement was due; it can move a day or two');
    if (val(c.closing)) out.statementCloseDay = K(dayOf(c.closing.value), asOf, source, 'rough', 'the day this statement closed');
    if (f.tiers && f.tiers.length) out.aprTiers = K(f.tiers, asOf, source);
    if (val(f.autopayType)) { out.autopay = K(f.autopayType.value, asOf, source, 'rough'); if (f.autopayType.value === 'full' || f.autopayType.value === 'minimum') out.payPolicy = K(f.autopayType.value === 'full' ? 'statement' : 'minimum', asOf, source, 'rough', 'from AutoPay on the statement'); }
    else if (f.autopay && f.autopay.conf === 'missing') out.autopay = K(null, asOf, source, 'missing', 'not shown on this statement');
    if (val(f.annualFee) > 0) out.annualFee = K(f.annualFee.value, asOf, source);
    if (val(f.pastDue) > 0) out.pastDue = K(f.pastDue.value, asOf, source);
    const bizKnown = (doc.common.businessHint && /business/i.test(val(c.product) || '')) ? 'known' : 'rough';
    out.business = K(!!doc.business, asOf, source, bizKnown);
    out.reportsToPersonalCredit = K(!doc.business, asOf, source, 'rough', doc.business ? 'most business cards stay off a personal report' : 'personal cards report');
  } else if (doc.reader === 'bank') {
    put('balance', f.ending); put('apy', f.apy); put('ytdInterest', f.interestYtd); put('minBalance', f.minBalance);
    if (val(f.fees) > 0) out.monthlyFee = K(f.fees.value, asOf, source, 'rough', 'fees this statement');
  } else if (doc.reader === 'cd') {
    put('balance', f.balance); out.rate = T(val(f.rate) !== null ? f.rate : f.apy); put('maturityDate', f.maturity); put('earlyWithdrawalPenalty', f.penalty); put('openDate', f.openDate); put('term', f.term);
  } else if (doc.reader === 'investment') {
    put('balance', f.ending); put('costBasis', f.costBasis); put('unrealizedGain', f.unrealized); put('cashBalance', f.cashBalance); put('sweepYield', f.sweepYield); put('ytdDividends', f.dividendsYtd); put('ytdInterest', f.interestYtd);
    put('ytdRealizedShort', f.realizedShort); put('ytdRealizedLong', f.realizedLong); put('fees', f.fees); put('ytdDistributions', f.distributionsYtd); put('rolloverIn', f.rolloverIn); put('beneficiary', f.beneficiary); put('planState', f.planState); put('investmentThreshold', f.threshold);
    if (doc.type === 'hsa') put('investedPortion', f.investedBalance);
    const total = val(f.ending) || (f.holdings || []).reduce((s, h) => s + h.value, 0);
    if (f.holdings && f.holdings.length) out.holdings = K(f.holdings.map((h) => ({ ...h, share: total ? Math.round((h.value / total) * 10000) / 10000 : null })), asOf, source);
    if (val(f.contributions)) out.contributions = K(f.contributions.value, asOf, source, f.contributions.conf === 'inferred' ? 'rough' : 'known');
    else if (doc.type === 'hsa' && (val(f.employeeContrib) !== null || val(f.employerContrib) !== null)) { const y = +asOf.slice(0, 4), list = []; if (val(f.employeeContrib) !== null) list.push({ year: y, amount: f.employeeContrib.value }); if (val(f.employerContrib) !== null) list.push({ year: y, amount: f.employerContrib.value, kind: 'employer' }); out.contributions = K(list, asOf, source); }
    if (val(f.conversions) > 0) out.conversions = K([{ year: +asOf.slice(0, 4), amount: f.conversions.value, taxable: f.conversions.value }], asOf, source, 'rough', 'taxable part assumed to be all of it');
    if (doc.type === 'ira_roth') out.basis = K(null, asOf, source, 'missing', 'contributions to date are not on a statement; add them from your records');
  } else if (doc.reader === 'plan') {
    put('balance', f.total); put('vestedBalance', f.vestedBalance); put('vestedPct', f.vestedPct); put('unvestedMatch', f.unvested); put('contributionRate', f.contributionRate); put('ytdEmployee', f.ytdEmployee); put('ytdEmployer', f.ytdEmployer);
    put('loanBalance', f.loanBalance); put('loanPayment', f.loanPayment); put('personalReturn', f.personalReturn); put('fees', f.fees); put('employer', f.employer); put('planName', f.planName);
    if (!val(doc.institution) && val(f.recordkeeper)) out.institution = T(f.recordkeeper);
    if (f.sources && f.sources.length) out.sources = K(f.sources, asOf, source);
    if (f.funds && f.funds.length) out.funds = K(f.funds, asOf, source);
    const y = +asOf.slice(0, 4), list = [];
    if (val(f.ytdEmployee) !== null) list.push({ year: y, amount: f.ytdEmployee.value });
    if (val(f.ytdEmployer) !== null) list.push({ year: y, amount: f.ytdEmployer.value, kind: 'employer' });
    if (list.length) out.contributions = K(list, asOf, source);
  } else if (doc.reader === 'loan') {
    put('balance', f.principal); put('apr', f.rate); put('minimum', f.payment); put('dueDate', f.dueDate); put('federal', f.federal); put('plan', f.plan); put('fixedRate', f.fixedRate); put('originalAmount', f.originalAmount); put('payoffDate', f.payoffDate);
    put('remainingTerm', f.remainingTerm); put('ytdInterest', f.interestYtd); put('escrowBalance', f.escrowBalance); put('escrowTaxes', f.escrowTaxes); put('escrowInsurance', f.escrowInsurance); put('escrowPmi', f.escrowPmi); put('propertyAddress', f.propertyAddress); put('qualifyingPayments', f.qualifyingPayments); put('loanType', f.loanType);
    if (val(f.pastDue) > 0) out.pastDue = K(f.pastDue.value, asOf, source);
    if (val(f.dueDate)) out.dueDay = K(dayOf(f.dueDate.value), asOf, source, 'rough');
    if (!val(doc.institution) && val(f.servicer)) out.institution = T(f.servicer);
  }
  // Only what was found, plus the essentials as visible gaps; and only fields the account's family holds.
  const fam = PRESETS[presetFor(doc, out)] ? fieldsFor(PRESETS[presetFor(doc, out)].family) : null;
  for (const k of Object.keys(out)) if ((out[k].kind === 'missing' && !(ESSENTIAL[doc.reader] || []).includes(k) && k !== 'basis' && k !== 'autopay') || (fam && !(k in fam))) delete out[k];
  for (const k of ESSENTIAL[doc.reader] || []) if (!out[k]) out[k] = K(null, asOf, source, 'missing', 'not found on the statement');
  return out;
}
// The name a new account gets: "Chase Freedom Unlimited", "Chase Total Checking", "Fidelity 401(k)".
export function nameFor(doc) {
  const inst = val(doc.institution), prod = val(doc.common.product), dt = DOC_TYPES[doc.type] || {};
  // Plain type words go lowercase after the institution ("Chase checking"); words with an acronym stay ("Roth IRA").
  const typeWords = /^[A-Z][a-z-]+(?: [a-z-]+)*$/.test(dt.words || '') ? dt.words.toLowerCase() : dt.words || 'account';
  const base = prod ? (inst && !new RegExp('^' + inst.split(/\W/)[0], 'i').test(prod) ? inst + ' ' + prod : prod) : (inst ? inst + ' ' + typeWords : dt.words || 'Account');
  return base.replace(/\bcredit card$/i, 'card');
}
// The SLAM account type: a private student loan and a joint brokerage are their own presets.
export function presetFor(doc, facts) {
  const dt = DOC_TYPES[doc.type] || {};
  if (doc.type === 'student_loan' && facts.federal && facts.federal.value === false) return 'private_student_loan';
  if (doc.type === 'brokerage' && facts.owner && facts.owner.value === 'joint') return 'joint_brokerage';
  return dt.preset;
}

// ---------------------------------------------------------------- the plan
// The rows for the review screen, the income and tax items, the log rows, the transfers and what could not be read.
export function planImport(docs, spine, { today, rules = null } = {}) {
  const groups = groupDocs(docs);
  const batch = deriveBatch(docs, { today, rules, spine });
  const history = (spine.log || []).map((e) => ({ date: e.date, description: e.merchant || e.note || '', amount: e.kind === 'income' ? e.amount : -e.amount, type: e.kind === 'income' ? 'income' : 'spend' }));
  const rows = groups.map((g) => {
    const doc = g.newest;
    const facts = factsFor(doc, today);
    const { item, how, candidates } = matchExisting(g, spine);
    const derived = deriveDoc(doc, { today });
    if (doc.reader === 'bank') deriveBank(doc, derived, history);
    const flags = [...derived.flags, ...batch.flags.filter((x) => x.doc === doc.id)];
    const dt = DOC_TYPES[doc.type];
    return { key: g.key, doc, docs: g.docs, older: g.older, section: dt.section, coll: dt.coll, preset: presetFor(doc, facts), item, how, candidates, targetId: item ? item.id : null, facts, diffs: staticDiffs(g, item, facts), derived, flags, name: item ? valueOf(item.name) : nameFor(doc), include: true, useStatic: {}, addTransactions: true, transactions: g.docs.reduce((s, d) => s + ((d.fields && d.fields.transactions) || []).length, 0) };
  });
  for (const row of rows) for (const d of row.diffs) row.useStatic[d.key] = true;
  // Paychecks seen in the bank accounts, one per employer.
  const seen = {};
  for (const row of rows) for (const p of (row.derived.paychecks || [])) if (!seen[p.employer] || seen[p.employer].count < p.count) seen[p.employer] = { ...p, fromDoc: row.doc.id, fromName: row.name };
  const hasPay = (spine.income || []).some((s) => s.type === 'w2' && valueOf(s.amount) !== null);
  const income = Object.values(seen).map((p) => ({ ...p, include: !hasPay && p.cadence !== null, note: hasPay ? 'You already have a paycheck line, so this is just what the bank shows.' : 'Take-home as it landed in the bank, not gross pay.' }));
  // Tax items for the year: interest and ordinary dividends as other income, qualified dividends, long-term gains.
  const year = +today.slice(0, 4);
  // Only taxable accounts count: a bank account's interest and a brokerage's dividends and gains, never an IRA's.
  const sumF = (types, key) => rows.filter((r) => types.includes(r.doc.type) && r.include).reduce((s, r) => s + (val(r.doc.fields[key]) || 0), 0);
  const TAXABLE = ['brokerage'], BANK = ['checking', 'savings', 'hysa', 'cd'];
  const qd = sumF(TAXABLE, 'qualifiedDividends'), dv = sumF(TAXABLE, 'dividendsYtd'), bankInt = sumF(BANK, 'interestYtd'), invInt = sumF(TAXABLE, 'interestYtd'), st = sumF(TAXABLE, 'realizedShort'), lt = sumF(TAXABLE, 'realizedLong');
  const other = r2(bankInt + invInt + Math.max(0, dv - qd) + st);
  const ty = (spine.taxYears || []).find((t) => t.year === year);
  const own = (k) => !ty || !ty[k] || valueOf(ty[k]) === null || /^(statement|csv|ofx)$/.test(ty[k].source || '');
  const taxes = [];
  if (other > 0) taxes.push({ key: 'otherIncome', label: 'Interest and ordinary dividends so far this year', amount: other, include: own('otherIncome'), year });
  if (qd > 0) taxes.push({ key: 'qualifiedDividends', label: 'Qualified dividends so far this year', amount: r2(qd), include: own('qualifiedDividends'), year });
  if (lt !== 0) taxes.push({ key: 'capitalGainsLong', label: 'Long-term gains sold so far this year', amount: r2(lt), include: own('capitalGainsLong'), year });
  const unsupported = docs.filter((d) => d.type === 'unsupported'), unknown = docs.filter((d) => d.type === 'unknown');
  return { rows, income, taxes, batch, unsupported, unknown, today };
}

// ---------------------------------------------------------------- the log rows
// One row per transaction, with transfers and card payments left out (they are moves, not spending), bank interest
// as income, fees as spending. The feed's own matching marks what is already logged and what repeats.
export function logItems(rows, spine, { today }) {
  const items = [];
  for (const row of rows) {
    if (!row.include || !row.addTransactions) continue;
    const paidWith = row.doc.reader === 'card' ? row.targetId || row.key : 'cash';
    for (const d of row.docs) for (const t of (d.fields && d.fields.transactions) || []) {
      let kind;
      if (t.transferWith || t.type === 'transfer' || t.type === 'payment') kind = 'transfer';
      else if (d.reader === 'card') kind = t.type === 'purchase' || t.type === 'cash_advance' ? 'spend' : t.type === 'fee' || t.type === 'interest' ? 'fee' : 'refund';
      else if (d.reader === 'bank') kind = t.type === 'deposit' ? 'income' : t.type === 'interest' ? 'income' : t.type === 'fee' ? 'fee' : t.amount < 0 ? 'spend' : 'refund';
      else continue; // investment income and plan activity are not cash flow
      const merchant = kind === 'income' && t.type === 'interest' ? 'Interest' : cleanMerchant(t.description) || null;
      const sig = [accountKey(d), t.date, t.amount, t.description].join('|');
      const n = items.filter((x) => x.sig === sig).length + 1;
      items.push({ sig, key: 'stmt:' + hash(sig + '|' + n), date: t.date, amount: Math.abs(t.amount), kind, merchant, description: t.description, paidWith, expenseId: null, tag: null, transferWith: t.transferWith || null });
    }
  }
  const p = propose(spine, items, { source: 'import' });
  // A transfer's reason, in the screen's words.
  for (const x of p.proposals) { const it = items.find((i) => i.key === x.key); if (it && it.transferWith) x.why = 'a move between your own accounts, not counted'; }
  return p;
}

// ---------------------------------------------------------------- the write
// rows: the plan's rows after the review (include, targetId, facts, addTransactions); income and taxes likewise.
// Returns { spine, summary }.
export function applyPlan(spine, plan, { today }) {
  let s = spine;
  const summary = { added: 0, updated: 0, snapshots: 0, logged: 0, income: 0, taxes: 0 };
  const ids = {};
  for (const row of plan.rows) {
    if (!row.include) continue;
    let id = row.targetId || null;
    const coll = row.coll;
    if (!id) { const r = addItem(s, { collection: coll, type: row.preset, label: row.name }, today); s = r.spine; id = r.id; summary.added++; } else summary.updated++;
    ids[row.key] = id;
    const existing = getAt(s, coll + '.' + id);
    for (const [k, f] of Object.entries(row.facts)) {
      if (k === 'name') continue;
      if (f.kind === 'missing' && existing[k] && valueOf(existing[k]) !== null) continue;
      // A static change the review left unticked keeps the household's value.
      if (row.useStatic && row.useStatic[k] === false) continue;
      // Contributions by year merge: the statement's years replace those years, the rest stay.
      if (k === 'contributions' && existing.contributions && Array.isArray(valueOf(existing.contributions)) && f.value) {
        const years = new Set(f.value.map((x) => x.year + ':' + (x.kind || 'contribution')));
        const kept = valueOf(existing.contributions).filter((x) => !years.has(x.year + ':' + (x.kind || 'contribution')));
        s = setAt(s, coll + '.' + id + '.' + k, { ...f, value: [...kept, ...f.value] });
        continue;
      }
      s = setAt(s, coll + '.' + id + '.' + k, f);
    }
    // A snapshot of every statement in the group, oldest first, for month-end.
    const byClose = [...row.docs].sort((a, b) => (val(a.common.closing) || '').localeCompare(val(b.common.closing) || ''));
    for (const d of byClose) { s = { ...s, statements: [...(s.statements || []), snapshot(d, id, coll, today)] }; summary.snapshots++; }
  }
  for (const row of plan.rows) row.targetId = ids[row.key] || row.targetId;
  // Income lines from paychecks seen.
  for (const p of plan.income || []) {
    if (!p.include) continue;
    const label = 'Paycheck (' + p.employer.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) + ')';
    const r = addItem(s, { collection: 'income', type: 'w2', label, cadence: p.cadence || 'monthly' }, today);
    s = editIncome(r.spine, r.id, { amount: p.amount, cadence: p.cadence || 'monthly', payDay: p.last ? +p.last.slice(8, 10) : undefined, kind: 'rough', label }, today);
    s = setAt(s, 'income.' + r.id + '.amount', { ...getAt(s, 'income.' + r.id + '.amount'), source: 'statement', note: 'take-home as deposited; gross pay and withholding still to enter' });
    summary.income++;
  }
  // Tax-year items.
  for (const t of plan.taxes || []) {
    if (!t.include) continue;
    const list = s.taxYears || [];
    if (!list.some((x) => x.year === t.year)) s = { ...s, taxYears: [...list, { id: String(t.year), year: t.year }] };
    s = setAt(s, 'taxYears.' + t.year + '.' + t.key, K(t.amount, today, 'statement', 'rough', 'from the statements read in; add any account not read'));
    summary.taxes++;
  }
  // The log.
  if (plan.rows.some((r) => r.include && r.addTransactions)) {
    const p = logItems(plan.rows, s, { today });
    const picks = plan.picks || p.proposals.filter((x) => x.include).map((x) => x.key);
    const r = applyImport(s, p.proposals, { picks, learn: true });
    s = r.spine; summary.logged = r.added;
  }
  return { spine: s, summary };
}

// What is kept of a statement: the numbers, never the text.
export function snapshot(doc, accountId, coll, today) {
  const values = {};
  for (const [k, f] of Object.entries(doc.fields || {})) if (f && typeof f === 'object' && 'conf' in f && f.value !== null && typeof f.value !== 'object') values[k] = f.value;
  const id = 'st-' + hash([accountKey(doc), val(doc.common.closing), doc.file.name].join('|'));
  return { id, accountId, coll, type: doc.type, institution: val(doc.institution), lastFour: val(doc.common.lastFour), product: val(doc.common.product), file: { name: doc.file.name, kind: doc.file.kind }, open: val(doc.common.period) ? doc.common.period.value.open : null, close: val(doc.common.closing), due: doc.fields && val(doc.fields.dueDate), importedOn: today, values, tiers: (doc.fields && doc.fields.tiers) || [], holdings: ((doc.fields && doc.fields.holdings) || []).map((h) => ({ ticker: h.ticker, name: h.name, shares: h.shares, price: h.price, value: h.value, costBasis: h.costBasis, gain: h.gain, assetClass: h.assetClass })), sources: (doc.fields && doc.fields.sources) || [], funds: (doc.fields && doc.fields.funds) || [], transactions: ((doc.fields && doc.fields.transactions) || []).length };
}
