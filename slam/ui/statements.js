// Add statements (S-243): drop PDF, CSV and OFX files for any account, see one review screen, and land them in My
// numbers with one button. Reading happens on this device: pdf.js is fetched once from cdnjs, the files never leave
// the browser. Every value shows how sure it is; the shaky ones can be typed over; a value a statement did not carry
// takes one of the usual answers (rough, not sure, not now, not for me). The shell's bar offers Undo after.
// Formatting only: the readers are engine/statements/read.js, the derived numbers derive.js, the write apply.js.

import { startPage, change, refresh, current, numbersHref } from './shell.js';
import { readFile, reread, kindOfName } from '../engine/statements/read.js';
import { planImport, applyPlan, logItems } from '../engine/statements/apply.js';
import { DOC_TYPES, TYPE_CHOICES } from '../engine/statements/classify.js';
import { val } from '../engine/statements/text.js';
import { COLUMNS } from '../engine/statements/csv.js';
import { valueOf } from '../engine/spine.js';
import { parseInput } from '../engine/edits.js';
import { h, money, pct, shortDate, chip } from './view.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const MAPS_KEY = 'slam-statement-maps:v1';
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// ---------------------------------------------------------------- state (this page only; nothing here is saved)
let queue = [];        // [{ name, status: 'reading' | 'done' | 'failed', why }]
let docs = [];         // what was read
let plan = null;       // from planImport, re-made when docs change
let choice = {};       // per row key: { include, targetId, edits: {}, status: {}, useStatic: {}, open }
let addTransactions = true;
let incomePick = {}, taxPick = {};
let done = null;       // after the write: the summary
let pdfLib = null, pdfFail = null;
let logPreview = null;
const maps = (() => { try { return JSON.parse(localStorage.getItem(MAPS_KEY) || '{}') || {}; } catch { return {}; } })();
const keepMaps = () => { try { localStorage.setItem(MAPS_KEY, JSON.stringify(maps)); } catch { /* storage blocked: lasts until the page closes */ } };

// ---------------------------------------------------------------- reading files
async function pdfjs() {
  if (pdfLib) return pdfLib;
  const lib = await import(PDFJS);
  // The worker is fetched once and run from this page, so the browser never has to trust a cross-site worker.
  try { const src = await (await fetch(PDF_WORKER)).text(); lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })); } catch { lib.GlobalWorkerOptions.workerSrc = PDF_WORKER; }
  pdfLib = lib;
  return lib;
}
async function pdfItems(file) {
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) { const tc = await (await pdf.getPage(i)).getTextContent(); pages.push(tc.items.filter((it) => 'str' in it).map((it) => ({ str: it.str, transform: it.transform, width: it.width, height: it.height }))); }
  await pdf.destroy();
  return pages;
}
async function takeFiles(list) {
  const files = [...list].filter((f) => kindOfName(f.name));
  const skipped = [...list].length - files.length;
  done = null;
  for (const f of files) queue.push({ name: f.name, status: 'reading', why: null });
  if (skipped) queue.push({ name: skipped + ' file' + (skipped > 1 ? 's' : '') + ' of another kind', status: 'failed', why: 'Only PDF, CSV and OFX/QFX files are read.' });
  refresh();
  const { institutions } = current();
  for (const f of files) {
    const q = queue.find((x) => x.name === f.name && x.status === 'reading');
    try {
      const kind = kindOfName(f.name);
      let doc;
      if (kind === 'pdf') { pdfFail = null; let items; try { items = await pdfItems(f); } catch (err) { pdfFail = /import|fetch|network|Failed to/i.test(String(err && err.message)) ? 'The PDF reader could not be downloaded. Check the connection and try the PDFs again; CSV and OFX files work without it.' : null; throw err; } doc = readFile({ name: f.name, kind, items }, { institutions }); }
      else { const text = await f.text(); const remembered = kind === 'csv' ? rememberedMap(text) : null; doc = readFile({ name: f.name, kind, text }, remembered || {}); doc.rawText = text; }
      docs.push(doc); q.status = 'done';
    } catch (err) { q.status = 'failed'; q.why = pdfFail || (err && err.message) || 'could not be read'; }
    replan(); refresh();
  }
}
function rememberedMap(text) {
  const header = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const sig = header.split(',').map((x) => x.replace(/^"|"$/g, '').trim().toLowerCase()).join('|');
  return maps[sig] ? { mapping: maps[sig].map, flip: maps[sig].flip, type: maps[sig].type } : null;
}
function replan() {
  const { spine, rules } = current();
  plan = planImport(docs, spine, { today: todayIso(), rules });
  for (const row of plan.rows) {
    const c = choice[row.key] = choice[row.key] || { include: true, targetId: row.item ? row.item.id : null, edits: {}, status: {}, useStatic: {}, open: false, picked: false };
    if (!c.picked) c.targetId = row.item ? row.item.id : null;
    for (const d of row.diffs) if (c.useStatic[d.key] === undefined) c.useStatic[d.key] = true;
  }
  for (const p of plan.income) if (incomePick[p.employer] === undefined) incomePick[p.employer] = p.include;
  for (const t of plan.taxes) if (taxPick[t.key] === undefined) taxPick[t.key] = t.include;
  logPreview = null;
}

// ---------------------------------------------------------------- the rows' final numbers
const FIELD_TYPE = { money: 'money', rate: 'rate', date: 'date', int: 'int', text: 'text', bool: 'bool' };
// What each kind of account shows under Details: [key, words, type]. The rest of a statement's numbers show read-only.
const SHOW = {
  card: [['balance', 'Balance', 'money'], ['limit', 'Credit limit', 'money'], ['apr', 'Rate on purchases', 'rate'], ['cashApr', 'Cash advance rate', 'rate'], ['transferApr', 'Balance transfer rate', 'rate'], ['minimum', 'Minimum due', 'money'], ['dueDate', 'Due date', 'date'], ['statementClose', 'Statement closed', 'date'], ['autopay', 'AutoPay', 'autopay'], ['autopayAmount', 'AutoPay amount', 'money'], ['points', 'Points', 'int'], ['ytdInterest', 'Interest this year', 'money'], ['ytdFees', 'Fees this year', 'money'], ['lateFeeMax', 'Late fee, up to', 'money'], ['penaltyApr', 'Penalty rate', 'rate'], ['cashLine', 'Cash access line', 'money'], ['annualFee', 'Annual fee', 'money'], ['lastFour', 'Last 4 digits', 'text'], ['product', 'Card', 'text'], ['nameOnAccount', 'Name on the card', 'text'], ['businessName', 'Business name', 'text'], ['business', 'Business card', 'bool']],
  bank: [['balance', 'Balance', 'money'], ['apy', 'Interest rate (APY)', 'rate'], ['ytdInterest', 'Interest earned this year', 'money'], ['monthlyFee', 'Fees', 'money'], ['minBalance', 'Minimum balance', 'money'], ['statementClose', 'Statement closed', 'date'], ['lastFour', 'Last 4 digits', 'text'], ['product', 'Account', 'text'], ['nameOnAccount', 'Name on the account', 'text'], ['owner', 'Owner', 'text']],
  cd: [['balance', 'Balance', 'money'], ['rate', 'Rate', 'rate'], ['maturityDate', 'Matures on', 'date'], ['openDate', 'Opened on', 'date'], ['term', 'Term', 'text'], ['earlyWithdrawalPenalty', 'Early withdrawal penalty', 'text'], ['lastFour', 'Last 4 digits', 'text']],
  investment: [['balance', 'Value', 'money'], ['cashBalance', 'Cash in the account', 'money'], ['sweepYield', 'Cash yield', 'rate'], ['costBasis', 'Cost basis', 'money'], ['unrealizedGain', 'Unrealized gain', 'money'], ['ytdDividends', 'Dividends this year', 'money'], ['ytdInterest', 'Interest this year', 'money'], ['ytdRealizedShort', 'Short-term gains this year', 'money'], ['ytdRealizedLong', 'Long-term gains this year', 'money'], ['ytdDistributions', 'Taken out this year', 'money'], ['rolloverIn', 'Rolled in', 'money'], ['fees', 'Fees', 'money'], ['basis', 'Roth contributions to date', 'money'], ['beneficiary', 'Beneficiary', 'text'], ['planState', 'Plan state', 'text'], ['investedPortion', 'Invested part', 'money'], ['investmentThreshold', 'Cash kept before investing', 'money'], ['statementClose', 'Statement closed', 'date'], ['lastFour', 'Last 4 digits', 'text'], ['product', 'Account', 'text'], ['nameOnAccount', 'Name on the account', 'text'], ['owner', 'Owner', 'text']],
  plan: [['balance', 'Balance', 'money'], ['vestedBalance', 'Vested balance', 'money'], ['vestedPct', 'Vested', 'rate'], ['unvestedMatch', 'Employer money not yet yours', 'money'], ['contributionRate', 'Contribution rate', 'rate'], ['ytdEmployee', 'Your contributions this year', 'money'], ['ytdEmployer', 'Employer contributions this year', 'money'], ['loanBalance', 'Loan balance', 'money'], ['loanPayment', 'Loan payment', 'money'], ['personalReturn', 'Personal rate of return', 'rate'], ['fees', 'Fees', 'money'], ['planName', 'Plan', 'text'], ['employer', 'Employer', 'text'], ['institution', 'Held at', 'text'], ['statementClose', 'Statement closed', 'date'], ['lastFour', 'Last 4 digits', 'text']],
  loan: [['balance', 'Balance', 'money'], ['apr', 'Rate', 'rate'], ['fixedRate', 'Fixed rate', 'bool'], ['minimum', 'Monthly payment', 'money'], ['dueDate', 'Due date', 'date'], ['originalAmount', 'Original amount', 'money'], ['remainingTerm', 'Months left', 'int'], ['payoffDate', 'Paid off by', 'date'], ['ytdInterest', 'Interest paid this year', 'money'], ['pastDue', 'Past due', 'money'], ['federal', 'Federal loan', 'bool'], ['plan', 'Repayment plan', 'text'], ['qualifyingPayments', 'Qualifying payments', 'int'], ['loanType', 'Loan type', 'text'], ['escrowBalance', 'Escrow balance', 'money'], ['escrowTaxes', 'Escrow: taxes', 'money'], ['escrowInsurance', 'Escrow: insurance', 'money'], ['escrowPmi', 'Escrow: mortgage insurance', 'money'], ['propertyAddress', 'Property', 'text'], ['institution', 'Servicer', 'text'], ['statementClose', 'Statement date', 'date'], ['lastFour', 'Last 4 digits', 'text']]
};
const ON_STATEMENT = {
  card: [['previousBalance', 'Previous balance', 'money'], ['payments', 'Payments and credits', 'money'], ['purchases', 'Purchases', 'money'], ['cashAdvances', 'Cash advances', 'money'], ['balanceTransfers', 'Balance transfers', 'money'], ['fees', 'Fees', 'money'], ['interest', 'Interest', 'money'], ['pastDue', 'Past due', 'money'], ['overLimit', 'Over the limit', 'money'], ['availableCredit', 'Available credit', 'money'], ['pointsPrevious', 'Points before', 'int'], ['pointsEarned', 'Points earned', 'int'], ['pointsRedeemed', 'Points redeemed', 'int'], ['pointsAvailable', 'Points now', 'int']],
  bank: [['beginning', 'Beginning balance', 'money'], ['deposits', 'Deposits', 'money'], ['withdrawals', 'Withdrawals', 'money'], ['interestPeriod', 'Interest this statement', 'money'], ['fees', 'Fees', 'money'], ['overdraft', 'Overdraft charges', 'money']],
  investment: [['beginning', 'Beginning value', 'money'], ['deposits', 'Deposits', 'money'], ['withdrawals', 'Withdrawals', 'money'], ['changeInValue', 'Change in value', 'money'], ['dividendsPeriod', 'Dividends this statement', 'money'], ['qualifiedDividends', 'Qualified dividends this year', 'money']],
  plan: [], loan: [], cd: []
};
const AUTOPAY_WORDS = { off: 'Off', minimum: 'The minimum', full: 'The full balance', fixed: 'A fixed amount' };
function words(value, type) {
  if (value === null || value === undefined) return null;
  if (type === 'money') return money(value, !Number.isInteger(value));
  if (type === 'rate') { const p = Math.abs(value * 100 - Math.round(value * 100)) > 1e-9; return p ? pct(value, 2).replace(/(\.\d)0%$/, '$1%') : pct(value, 0); }
  if (type === 'date') return shortDate(value);
  if (type === 'bool') return value ? 'Yes' : 'No';
  if (type === 'autopay') return AUTOPAY_WORDS[value] || String(value);
  if (type === 'int') return Number(value).toLocaleString('en-US');
  return String(value);
}
// The Facts the row will write, after the review's edits and answers.
function finalFacts(row) {
  const c = choice[row.key], out = {};
  const asOf = val(row.doc.common.closing) || plan.today;
  for (const [k, f] of Object.entries(row.facts)) {
    if (c.useStatic[k] === false) continue;
    let g = { ...f };
    if (k in c.edits) g = { value: c.edits[k], kind: 'known', asOf, source: f.source, note: 'typed on the review screen' };
    const st = c.status[k];
    if (st === 'rough' && g.value !== null) g = { ...g, kind: 'rough' };
    else if (st === 'missing') g = { ...g, value: null, kind: 'missing', note: 'not sure yet' };
    else if (st === 'later') g = { ...g, value: null, kind: 'missing', note: 'not now' };
    else if (st === 'notForMe') g = { ...g, value: null, kind: 'notForMe' };
    out[k] = g;
  }
  return out;
}
function finalRows() {
  return plan.rows.map((row) => { const c = choice[row.key]; return { ...row, include: c.include, targetId: c.targetId, facts: finalFacts(row), useStatic: c.useStatic, addTransactions }; });
}
function previewLog() {
  if (logPreview) return logPreview;
  const rows = finalRows().filter((r) => r.include);
  logPreview = rows.length ? logItems(rows, current().spine, { today: plan.today }) : { proposals: [], counts: {} };
  return logPreview;
}

// ---------------------------------------------------------------- the write
function addAll() {
  const rows = finalRows();
  const p = { rows, income: plan.income.map((x) => ({ ...x, include: !!incomePick[x.employer] })), taxes: plan.taxes.map((x) => ({ ...x, include: !!taxPick[x.key] })) };
  let summary = null;
  const n = rows.filter((r) => r.include).length;
  const ok = change((spine) => { const r = applyPlan(spine, p, { today: plan.today }); summary = r.summary; return r.spine; }, n + ' account' + (n === 1 ? '' : 's') + ' updated from statements');
  if (!ok) return;
  done = summary; docs = []; queue = []; plan = null; choice = {}; logPreview = null;
  refresh();
}

// ---------------------------------------------------------------- the screen
const SECTION_WORDS = { debt: 'Debt', assets: 'Assets' };
const conf = (f) => (f.kind === 'missing' ? 'missing' : f.kind === 'rough' ? 'rough' : 'known');
const typeSelect = (doc) => h('select', { class: 'st-type', 'aria-label': 'What kind of account this is', onchange: (e) => { const i = docs.indexOf(doc); docs[i] = reread(doc, e.target.value); replan(); refresh(); } },
  ...TYPE_CHOICES.map((t) => h('option', { value: t, selected: t === doc.type }, DOC_TYPES[t].words)));

function dropZone(primary) {
  const input = h('input', { type: 'file', multiple: true, accept: '.pdf,.csv,.ofx,.qfx,.qbo,application/pdf,text/csv', hidden: true, 'aria-label': 'Your statement files', onchange: (e) => { takeFiles(e.target.files); e.target.value = ''; } });
  const zone = h('div', { class: 'drop-zone', role: 'group', 'aria-label': 'Drop statements here' },
    h('p', { class: 'drop-title' }, 'Drop your statements here'),
    h('p', { class: 'drop-sub' }, 'Credit cards, bank accounts, investments, retirement plans and loans. PDF, CSV or OFX/QFX, as many at once as you like.'),
    h('button', { type: 'button', class: primary ? 'btn primary' : 'btn', onclick: () => input.click() }, 'Choose files'), input,
    h('p', { class: 'drop-note' }, 'Read on this device. Nothing is uploaded, and only the last 4 digits of an account number are kept.'));
  for (const ev of ['dragenter', 'dragover']) zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  for (const ev of ['dragleave', 'drop']) zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('is-over'); });
  zone.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) takeFiles(e.dataTransfer.files); });
  return zone;
}
const progress = () => (queue.length ? h('ul', { class: 'st-queue', 'aria-live': 'polite' }, ...queue.map((q) => h('li', { class: 'st-q ' + q.status }, h('span', { class: 'st-q-name' }, q.name), ' ', h('span', { class: 'muted' }, q.status === 'reading' ? 'reading...' : q.status === 'failed' ? 'not read: ' + q.why : 'read')))) : null);

function keyNumbers(row) {
  const f = row.facts, d = row.derived, g = (k) => (f[k] && f[k].value !== null ? f[k].value : null);
  const items = [];
  const add = (label, v) => { if (v !== null && v !== undefined) items.push(h('span', { class: 'st-kv' }, h('span', { class: 'st-k' }, label), ' ', h('span', { class: 'st-v' }, v))); };
  if (row.doc.reader === 'card') { add('Limit', words(g('limit'), 'money')); add('Used', d.utilization === null ? null : pct(d.utilization, 0)); add('Due', words(g('dueDate'), 'date')); add('AutoPay', g('autopay') === null ? null : AUTOPAY_WORDS[g('autopay')]); }
  else if (row.doc.reader === 'bank') { add('APY', words(g('apy'), 'rate')); if ((d.paychecks || []).length) add('Paycheck', money(d.paychecks[0].amount) + (d.paychecks[0].cadence ? ' ' + { weekly: 'a week', biweekly: 'every two weeks', semimonthly: 'twice a month', monthly: 'a month' }[d.paychecks[0].cadence] : '')); }
  else if (row.doc.reader === 'investment') { const c = g('contributions'); add('In this year', c && c.length ? money(c.filter((x) => x.year === +plan.today.slice(0, 4)).reduce((s, x) => s + x.amount, 0)) : null); add('Cash', words(g('cashBalance'), 'money')); }
  else if (row.doc.reader === 'plan') { add('Vested', words(g('vestedPct'), 'rate')); add('In this year', words(g('ytdEmployee'), 'money')); }
  else if (row.doc.reader === 'loan') { add('Rate', words(g('apr'), 'rate')); add('Payment', words(g('minimum'), 'money')); add('Due', words(g('dueDate'), 'date')); }
  else if (row.doc.reader === 'cd') { add('Rate', words(g('rate'), 'rate')); add('Matures', words(g('maturityDate'), 'date')); }
  return h('div', { class: 'st-keys' }, ...items);
}
const balanceOf = (row) => { const f = row.facts.balance; return f && f.value !== null ? words(f.value, 'money') : 'not found'; };

function valueEditor(row, key, type, f) {
  const c = choice[row.key];
  const id = 'st-' + row.doc.id + '-' + key;
  const hint = { money: 'Dollars, for example 1200', rate: 'As a percent: 24.99 means 24.99%', date: 'YYYY-MM-DD', int: 'A whole number', text: '', bool: 'Yes or no', autopay: 'off, minimum, full or fixed' }[type] || '';
  const inputType = type === 'bool' ? 'bool' : type === 'autopay' ? 'autopay' : type === 'int' ? 'int' : type;
  const current = key in c.edits ? c.edits[key] : f.value;
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  let input;
  if (type === 'bool') input = h('select', { id }, h('option', { value: '' }, 'Choose'), h('option', { value: 'true', selected: current === true }, 'Yes'), h('option', { value: 'false', selected: current === false }, 'No'));
  else if (type === 'autopay') input = h('select', { id }, h('option', { value: '' }, 'Choose'), ...Object.entries(AUTOPAY_WORDS).map(([k, w]) => h('option', { value: k, selected: current === k }, w)));
  else input = h('input', { id, type: 'text', inputmode: type === 'text' || type === 'date' ? 'text' : 'decimal', value: current === null || current === undefined ? '' : type === 'rate' ? String(Math.round(current * 10000) / 100) : String(current), placeholder: type === 'date' ? 'YYYY-MM-DD' : '' });
  const save = () => {
    const raw = input.value.trim();
    if (!raw) { delete c.edits[key]; c.status[key] = c.status[key] || 'missing'; logPreview = null; refresh(); return; }
    let v;
    if (inputType === 'bool') v = raw === 'true'; else if (inputType === 'autopay') v = raw;
    else { const p = parseInput(type === 'int' ? 'int' : type, raw); if (!p.ok) { msg.textContent = p.message; return; } v = p.value; }
    c.edits[key] = v; delete c.status[key]; logPreview = null; refresh();
  };
  input.addEventListener('change', save);
  const status = h('select', { 'aria-label': 'If you are not sure', onchange: (e) => { if (!e.target.value) delete c.status[key]; else c.status[key] = e.target.value; logPreview = null; refresh(); } },
    h('option', { value: '', selected: !c.status[key] }, f.value === null && !(key in c.edits) ? 'Choose an answer' : 'Use this number'),
    h('option', { value: 'rough', selected: c.status[key] === 'rough' }, 'Rough: keep it, I will confirm later'),
    h('option', { value: 'missing', selected: c.status[key] === 'missing' }, 'Not sure'),
    h('option', { value: 'later', selected: c.status[key] === 'later' }, 'Not now'),
    h('option', { value: 'notForMe', selected: c.status[key] === 'notForMe' }, 'Not for me'));
  return h('div', { class: 'editor st-editor' }, input, hint ? h('p', { class: 'edit-hint' }, hint) : null, msg, status);
}

function detailRows(row) {
  const c = choice[row.key], facts = finalFacts(row);
  const list = SHOW[row.doc.reader] || [];
  const rows = [];
  for (const [key, label, type] of list) {
    const f = facts[key] || row.facts[key];
    if (!f) continue;
    const k = conf(f);
    const edited = key in c.edits;
    const shaky = k !== 'known' || f.value === null;
    const open = shaky || c.open === key;
    rows.push(h('li', { class: 'row st-field' + (shaky ? ' st-soft' : '') },
      h('div', { class: 'st-field-main' },
        h('span', { class: 'row-label' }, label),
        h('span', { class: 'row-value' + (f.value === null ? ' empty' : '') }, f.value === null ? (f.note || 'not on this statement') : words(f.value, type) + (edited ? ' (typed)' : '')),
        chip(f.kind === 'notForMe' ? 'notForMe' : k),
        !open ? h('button', { type: 'button', class: 'btn small', onclick: () => { c.open = key; refresh(); } }, 'Change') : null),
      open ? valueEditor(row, key, type, f) : null));
  }
  return h('ul', { class: 'rows' }, ...rows);
}
function onStatement(row) {
  const items = [];
  for (const [key, label, type] of ON_STATEMENT[row.doc.reader] || []) { const v = val(row.doc.fields[key]); if (v !== null) items.push(h('li', {}, label + ': ' + words(v, type))); }
  const f = row.doc.fields;
  if (f.tiers && f.tiers.length > 1) items.push(h('li', {}, 'Rate tiers: ' + f.tiers.filter((t) => t.kind === 'purchase').map((t) => words(t.apr, 'rate') + (t.until ? ' on purchases before ' + shortDate(t.until) : ' on purchases') + (t.subject !== null ? ', ' + money(t.subject, true) + ' subject to it' : '')).join('; ')));
  if (f.minimumWarning && val(f.minimumWarning)) { const w = f.minimumWarning.value; items.push(h('li', {}, 'Paying only the minimum: about ' + (w.minimumOnlyMonths >= 24 ? Math.round(w.minimumOnlyMonths / 12) + ' years' : w.minimumOnlyMonths + ' months') + ', ' + money(w.minimumOnlyTotal) + ' in all' + (w.payoffIn3Payment ? '; ' + money(w.payoffIn3Payment) + ' a month clears it in 3 years for ' + money(w.payoffIn3Total) : ''))); }
  if (f.earnRates && f.earnRates.length) items.push(h('li', {}, 'Rewards: ' + f.earnRates.join('; ')));
  if (f.holdings && f.holdings.length) items.push(h('li', {}, f.holdings.length + ' holding' + (f.holdings.length > 1 ? 's' : '') + ': ' + f.holdings.slice(0, 7).map((x) => x.ticker + ' ' + money(x.value)).join(', ') + (f.holdings.length > 7 ? ' and ' + (f.holdings.length - 7) + ' more' : '')));
  if (f.sources && f.sources.length) items.push(h('li', {}, 'By source: ' + f.sources.map((x) => x.source + ' ' + money(x.amount)).join(', ')));
  if (f.funds && f.funds.length) items.push(h('li', {}, 'Funds: ' + f.funds.map((x) => x.name + (x.expenseRatio !== null ? ' (' + words(x.expenseRatio, 'rate') + ' a year)' : '') + ' ' + money(x.value)).join(', ')));
  if (f.transactions && f.transactions.length) items.push(h('li', {}, f.transactions.length + ' transaction' + (f.transactions.length > 1 ? 's' : '') + ' on this statement'));
  if (row.older.length) items.push(h('li', {}, row.older.length + ' older statement' + (row.older.length > 1 ? 's' : '') + ' for this account, kept as history: ' + row.older.map((d) => shortDate(val(d.common.closing)) || d.file.name).join(', ')));
  return items.length ? h('div', {}, h('h4', { class: 'st-h4' }, 'On this statement'), h('ul', { class: 'st-plain' }, ...items)) : null;
}
function csvMapping(row) {
  const doc = row.doc, csv = doc.csv;
  if (!csv || !csv.needsMapping) return null;
  const roles = [['date', 'Date'], ['description', 'Words'], ['amount', 'Amount'], ['debit', 'Money out'], ['credit', 'Money in'], ['symbol', 'Symbol'], ['quantity', 'Shares'], ['price', 'Price'], ['value', 'Value'], ['costBasis', 'Cost basis']];
  const picks = { ...csv.map };
  const flip = h('input', { type: 'checkbox', checked: csv.flip === true });
  const sel = (role) => h('select', { 'aria-label': role, onchange: (e) => { if (e.target.value === '') delete picks[role]; else picks[role] = +e.target.value; } }, h('option', { value: '' }, 'none'), ...csv.header.map((hd, i) => h('option', { value: i, selected: picks[role] === i }, hd)));
  return h('div', { class: 'st-map' }, h('p', {}, 'This file’s columns are not ones SLAM knows. Say which is which once; it is remembered for files with the same columns.'),
    h('div', { class: 'st-map-grid' }, ...roles.map(([r, w]) => h('label', { class: 'st-map-row' }, h('span', { class: 'edit-label' }, w), sel(r)))),
    h('label', { class: 'check-row' }, flip, h('span', {}, h('strong', {}, 'Charges are written as negative numbers'), h('span', { class: 'choice-sub' }, 'Most card exports do this'))),
    h('button', { type: 'button', class: 'btn', onclick: () => { const i = docs.indexOf(doc); docs[i] = readFile({ name: doc.file.name, kind: 'csv', text: doc.rawText }, { mapping: picks, flip: flip.checked, type: doc.type }); docs[i].rawText = doc.rawText; maps[csv.signature] = { map: picks, flip: flip.checked, type: doc.type }; keepMaps(); replan(); refresh(); } }, 'Use these columns'));
}

function rowCard(row) {
  const c = choice[row.key];
  const id = 'st-pick-' + row.doc.id;
  const four = val(row.doc.common.lastFour);
  const target = h('select', { 'aria-label': 'Which account this is', onchange: (e) => { c.targetId = e.target.value || null; c.picked = true; logPreview = null; refresh(); } },
    h('option', { value: '', selected: !c.targetId }, 'A new account'),
    ...row.candidates.map((x) => h('option', { value: x.id, selected: c.targetId === x.id }, (valueOf(x.name) || x.id) + (valueOf(x.lastFour) ? ' …' + valueOf(x.lastFour) : ''))));
  const matchLine = row.candidates.length ? h('p', { class: 'st-match' }, c.targetId ? 'Updates ' : 'Adds ', target, c.targetId && row.how === 'lastFour' ? h('span', { class: 'muted' }, ' (same last 4)') : c.targetId && row.how ? h('span', { class: 'muted' }, ' (looks like it; change it if not)') : null) : null;
  const diffs = row.diffs.length ? h('div', { class: 'st-diffs' }, h('h4', { class: 'st-h4' }, 'Changed since last time. Use the new one?'),
    ...row.diffs.map((d) => h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: c.useStatic[d.key] !== false, onchange: (e) => { c.useStatic[d.key] = e.target.checked; refresh(); } }), h('span', {}, h('strong', {}, d.label + ': ' + words(d.from, d.type) + ' to ' + words(d.to, d.type)))))) : null;
  const flags = row.flags.length ? h('ul', { class: 'st-flags' }, ...row.flags.map((f) => h('li', { class: 'st-flag' }, f.text))) : null;
  return h('li', { class: 'st-row card' + (c.include ? '' : ' st-off') },
    h('div', { class: 'st-main' },
      h('label', { class: 'st-pick', for: id }, h('input', { type: 'checkbox', id, checked: c.include, onchange: (e) => { c.include = e.target.checked; logPreview = null; refresh(); } }), h('span', { class: 'st-name' }, row.name, four ? h('span', { class: 'st-four' }, ' …' + four) : null)),
      typeSelect(row.doc),
      h('span', { class: 'st-balance' }, balanceOf(row))),
    keyNumbers(row), matchLine, flags, diffs, csvMapping(row),
    h('details', { class: 'st-details', open: c.detailsOpen || null, ontoggle: (e) => { c.detailsOpen = e.target.open; } }, h('summary', { class: 'btn small' }, 'Details'), detailRows(row), onStatement(row), h('p', { class: 'muted st-file' }, 'From ' + row.docs.map((d) => d.file.name).join(', '))));
}

function section(name, rows) {
  if (!rows.length) return null;
  return h('section', { class: 'st-section', 'aria-labelledby': 'st-' + name }, h('h2', { id: 'st-' + name, class: 'part-h' }, SECTION_WORDS[name] || name), h('ul', { class: 'st-rows' }, ...rows.map(rowCard)));
}
function incomeCard() {
  if (!plan.income.length) return null;
  const how = { weekly: 'every week', biweekly: 'every two weeks', semimonthly: 'twice a month', monthly: 'every month' };
  return h('section', { class: 'st-section', 'aria-labelledby': 'st-income' }, h('h2', { id: 'st-income', class: 'part-h' }, 'Income'),
    ...plan.income.map((p) => h('label', { class: 'check-row st-wide' }, h('input', { type: 'checkbox', checked: !!incomePick[p.employer], onchange: (e) => { incomePick[p.employer] = e.target.checked; } }),
      h('span', {}, h('strong', {}, 'Paycheck of ' + money(p.amount) + (p.cadence ? ' ' + how[p.cadence] : '') + ' from ' + p.employer.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())), h('span', { class: 'choice-sub' }, (p.next ? 'Next one expected ' + shortDate(p.next) + '. ' : p.count === 1 ? 'Seen once, so how often is not clear yet. ' : '') + p.note + ' Seen in ' + p.fromName + '.')))));
}
function taxCard() {
  if (!plan.taxes.length) return null;
  return h('section', { class: 'st-section', 'aria-labelledby': 'st-taxes' }, h('h2', { id: 'st-taxes', class: 'part-h' }, 'Taxes'),
    ...plan.taxes.map((t) => h('label', { class: 'check-row st-wide' }, h('input', { type: 'checkbox', checked: !!taxPick[t.key], onchange: (e) => { taxPick[t.key] = e.target.checked; } }), h('span', {}, h('strong', {}, t.label + ': ' + money(t.amount, true)), h('span', { class: 'choice-sub' }, 'For ' + t.year + ', from the accounts read in.' + (t.include ? '' : ' You typed a number for this already, so it is off unless you want this one.'))))));
}
function unreadCard() {
  const list = [...plan.unsupported, ...plan.unknown, ...queue.filter((q) => q.status === 'failed')];
  if (!list.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'st-unread' }, h('h2', { id: 'st-unread' }, 'Not read'),
    h('ul', { class: 'st-plain' }, ...list.map((x) => x.file ? h('li', {}, x.file.name + ': ' + (x.type === 'unsupported' ? 'a ' + (x.unsupportedAs || 'document') + '. SLAM does not read these yet.' : 'could not tell what kind of account this is. '), x.type === 'unknown' ? typeSelect(x) : null) : h('li', {}, x.name + ': ' + x.why))));
}
function logCard() {
  const rows = plan.rows.filter((r) => choice[r.key].include && r.transactions);
  if (!rows.length) return null;
  const p = addTransactions ? previewLog() : null;
  const counts = p ? p.counts : null;
  const sub = counts ? [counts.new + ' new', counts.recurring ? counts.recurring + ' repeating' : null, counts.matched ? counts.matched + ' already planned' : null, counts.same ? counts.same + ' already logged' : null, counts.skip ? counts.skip + ' moves between your accounts left out' : null].filter(Boolean).join(', ') : rows.reduce((s, r) => s + r.transactions, 0) + ' rows on these statements';
  const shown = p ? p.proposals.filter((x) => x.status !== 'skip').slice(0, 7) : [];
  return h('section', { class: 'card', 'aria-labelledby': 'st-log' },
    h('label', { class: 'check-row st-wide' }, h('input', { type: 'checkbox', checked: addTransactions, onchange: (e) => { addTransactions = e.target.checked; refresh(); } }), h('span', {}, h('strong', {}, 'Also add the transactions to the cash flow log'), h('span', { class: 'choice-sub' }, sub))),
    p && shown.length ? h('details', { class: 'st-details' }, h('summary', { class: 'btn small' }, 'What goes in'), h('ul', { class: 'st-plain' }, ...shown.map((x) => h('li', {}, shortDate(x.date) + ' ' + (x.merchant || x.description) + ' ' + money(x.amount, true) + (x.status === 'recurring' ? ' (repeats)' : x.status === 'matched' ? ' (fits a planned line)' : ''))), p.proposals.filter((x) => x.status !== 'skip').length > 7 ? h('li', { class: 'muted' }, 'and ' + (p.proposals.filter((x) => x.status !== 'skip').length - 7) + ' more') : null)) : null);
}
function batchCard() {
  const b = plan.batch;
  const bits = [];
  if (b.utilization.cards) bits.push('Cards: ' + pct(b.utilization.overall, 0) + ' of the limits used' + (b.utilization.personalCards !== b.utilization.cards && b.utilization.personal !== null ? ', ' + pct(b.utilization.personal, 0) + ' on personal cards' : '') + '.');
  if (b.netWorth.accounts > 1) bits.push('These statements show ' + money(b.netWorth.liquid) + ' in cash and taxable investments, ' + money(b.netWorth.total) + ' net of the debts.');
  if (b.transfers.length) bits.push(b.transfers.length + ' move' + (b.transfers.length > 1 ? 's' : '') + ' between your accounts matched, so nothing counts twice.');
  for (const f of b.flags.filter((x) => !plan.rows.some((r) => r.flags.includes(x)))) bits.push(f.text);
  return bits.length ? h('section', { class: 'card' }, h('ul', { class: 'st-plain' }, ...bits.map((t) => h('li', {}, t)))) : null;
}
function doneCard() {
  const s = done;
  const parts = [s.added ? s.added + ' account' + (s.added > 1 ? 's' : '') + ' added' : null, s.updated ? s.updated + ' updated' : null, s.logged ? s.logged + ' transaction' + (s.logged > 1 ? 's' : '') + ' logged' : null, s.income ? s.income + ' paycheck line' + (s.income > 1 ? 's' : '') + ' added' : null, s.taxes ? s.taxes + ' tax item' + (s.taxes > 1 ? 's' : '') + ' for the year' : null].filter(Boolean);
  return h('section', { class: 'card', role: 'status' }, h('h2', {}, 'Added to your numbers'), h('p', {}, parts.join(', ') + '. Undo is in the bar below if anything looks off.'),
    h('p', { class: 'page-links' }, h('a', { href: numbersHref('debt') }, 'See Debt in My numbers'), ' ', h('a', { href: numbersHref('assets') }, 'See Assets')));
}

function render() {
  const out = [];
  const reviewing = !!(plan && plan.rows.length);
  if (done) out.push(doneCard());
  out.push(h('section', { class: 'card' }, dropZone(!reviewing), progress()));
  if (plan && (plan.rows.length || plan.unsupported.length || plan.unknown.length)) {
    const ready = plan.rows.filter((r) => choice[r.key].include).length;
    out.push(h('p', { class: 'lede' }, ready ? 'Check each account below, change anything that looks off, then add them all at once.' : 'Tick the accounts to add.'));
    out.push(batchCard());
    out.push(section('debt', plan.rows.filter((r) => r.section === 'debt')));
    out.push(section('assets', plan.rows.filter((r) => r.section === 'assets')));
    out.push(incomeCard(), taxCard(), unreadCard(), logCard());
    if (ready) out.push(h('div', { class: 'bulk-bar' }, h('span', { class: 'bulk-count' }, ready + ' account' + (ready === 1 ? '' : 's')), h('button', { type: 'button', class: 'btn primary', onclick: addAll }, 'Add to my numbers'), h('button', { type: 'button', class: 'btn', onclick: () => { docs = []; queue = []; plan = null; choice = {}; logPreview = null; refresh(); } }, 'Start over')));
  } else if (queue.some((q) => q.status === 'failed') && !queue.some((q) => q.status === 'reading')) out.push(h('section', { class: 'card' }, h('h2', {}, 'Not read'), h('ul', { class: 'st-plain' }, ...queue.filter((q) => q.status === 'failed').map((q) => h('li', {}, q.name + ': ' + q.why)))));
  return out;
}

startPage({ tab: 'numbers', title: 'Add statements', parent: ['My numbers', 'ledger.html'], render: () => render() });
