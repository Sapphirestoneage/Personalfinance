// The uploader's fixture runner (S-243). Reads every statement in test/fixtures/statements/ (synthetic, committed)
// and in tests/private-fixtures/ (real, git-ignored) through the same readers the browser uses, and compares what
// it found with expected.json beside the files. Private files with no expected entry are reported, not judged, so
// their values can be confirmed by hand. Run from slam/:
//   node tools/statements-check.mjs            both folders
//   node tools/statements-check.mjs --private  the private folder only
// Real PDFs need pdf.js in Node: npm install pdfjs-dist (a dev tool, like Playwright; never shipped).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pdfItems, loadPdfjs } from './pdf-text.mjs';
import { readFile, kindOfName, resetIds } from '../engine/statements/read.js';
import { deriveDoc, deriveBatch, deriveBank } from '../engine/statements/derive.js';
import { val } from '../engine/statements/text.js';

const SLAM = fileURLToPath(new URL('..', import.meta.url));
export const SYNTHETIC = SLAM + 'test/fixtures/statements/';
export const PRIVATE = SLAM + 'tests/private-fixtures/';
const pct = (x) => (x === null || x === undefined ? null : Math.round(x * 10000) / 100);
const f = (d, k) => (d.fields && d.fields[k] ? val(d.fields[k]) : null);

// How each expected key is read off a document. Rates come back as percents, like the expected file writes them.
export const GET = {
  type: (d) => d.type, institution: (d) => val(d.institution), lastFour: (d) => val(d.common.lastFour), product: (d) => val(d.common.product),
  open: (d) => (val(d.common.period) ? d.common.period.value.open : null), close: (d) => val(d.common.closing), due: (d) => f(d, 'dueDate'),
  balance: (d) => f(d, 'newBalance') ?? f(d, 'ending') ?? f(d, 'principal') ?? f(d, 'total') ?? f(d, 'balance'),
  previousBalance: (d) => f(d, 'previousBalance'), payments: (d) => f(d, 'payments'), purchases: (d) => f(d, 'purchases'), fees: (d) => f(d, 'fees'), interest: (d) => f(d, 'interest'),
  minimum: (d) => f(d, 'minimum'), limit: (d) => f(d, 'limit'), availableCredit: (d) => f(d, 'availableCredit'), cashLine: (d) => f(d, 'cashLine'), overLimit: (d) => f(d, 'overLimit'),
  apr: (d) => pct(f(d, 'apr') ?? f(d, 'rate')), cashApr: (d) => pct(f(d, 'cashApr')), transferApr: (d) => pct(f(d, 'transferApr')), penaltyApr: (d) => pct(f(d, 'penaltyApr')),
  tiers: (d) => ((d.fields && d.fields.tiers) || []).filter((t) => t.kind === 'purchase').map((t) => ({ apr: pct(t.apr), subject: t.subject, interest: t.interest, until: t.until })),
  lateFeeMax: (d) => f(d, 'lateFeeMax'), autopayAmount: (d) => f(d, 'autopayAmount'), autopayType: (d) => f(d, 'autopayType'), ytdFees: (d) => f(d, 'ytdFees'), ytdInterest: (d) => f(d, 'ytdInterest') ?? f(d, 'interestYtd'),
  pointsPrevious: (d) => f(d, 'pointsPrevious'), pointsAvailable: (d) => f(d, 'pointsAvailable'), points: (d) => f(d, 'pointsAvailable'), pointsRedeemed: (d) => f(d, 'pointsRedeemed'), pointsEarned: (d) => f(d, 'pointsEarned'), earnRates: (d) => ((d.fields && d.fields.earnRates) || []).length,
  annualFee: (d) => f(d, 'annualFee'), minimumWarning: (d) => f(d, 'minimumWarning'),
  names: (d) => val(d.common.nameOnAccount), businessName: (d) => val(d.common.businessName), business: (d) => !!d.business,
  transactions: (d) => ((d.fields && d.fields.transactions) || []).length, transactionTypes: (d) => ((d.fields && d.fields.transactions) || []).map((t) => t.type),
  beginning: (d) => f(d, 'beginning'), deposits: (d) => f(d, 'deposits'), withdrawals: (d) => f(d, 'withdrawals'), apy: (d) => pct(f(d, 'apy')), interestPeriod: (d) => f(d, 'interestPeriod'), interestYtd: (d) => f(d, 'interestYtd'),
  dividendsPeriod: (d) => f(d, 'dividendsPeriod'), dividendsYtd: (d) => f(d, 'dividendsYtd'), qualifiedDividends: (d) => f(d, 'qualifiedDividends'), realizedShort: (d) => f(d, 'realizedShort'), realizedLong: (d) => f(d, 'realizedLong'),
  cashBalance: (d) => f(d, 'cashBalance'), sweepYield: (d) => pct(f(d, 'sweepYield')), costBasis: (d) => f(d, 'costBasis'), unrealized: (d) => f(d, 'unrealized'), contributions: (d) => f(d, 'contributions'),
  holdings: (d) => (d.fields && d.fields.holdings) || [],
  planName: (d) => f(d, 'planName'), employer: (d) => f(d, 'employer'), vestedBalance: (d) => f(d, 'vestedBalance'), vestedPct: (d) => pct(f(d, 'vestedPct')), unvested: (d) => f(d, 'unvested'), contributionRate: (d) => pct(f(d, 'contributionRate')),
  ytdEmployee: (d) => f(d, 'ytdEmployee'), ytdEmployer: (d) => f(d, 'ytdEmployer'), loanBalance: (d) => f(d, 'loanBalance'), loanPayment: (d) => f(d, 'loanPayment'), personalReturn: (d) => pct(f(d, 'personalReturn')), sources: (d) => (d.fields && d.fields.sources) || [], funds: (d) => ((d.fields && d.fields.funds) || []).length,
  loanType: (d) => f(d, 'loanType'), plan: (d) => f(d, 'plan'), fixedRate: (d) => f(d, 'fixedRate'), federal: (d) => f(d, 'federal'), originalAmount: (d) => f(d, 'originalAmount'), payment: (d) => f(d, 'payment'), qualifyingPayments: (d) => f(d, 'qualifyingPayments'),
  utilization: (d, x) => pct(x.utilization), carrying: (d, x) => x.carrying, paidInFull: (d, x) => x.paidInFull, flags: (d, x) => x.flags.map((g) => g.id), paycheck: (d, x) => (x.paychecks && x.paychecks[0] ? { employer: x.paychecks[0].employer, amount: x.paychecks[0].amount, cadence: x.paychecks[0].cadence, next: x.paychecks[0].next } : null)
};
// The core card fields the acceptance check names.
export const CORE_CARD = ['balance', 'limit', 'apr', 'cashApr', 'transferApr', 'due', 'close', 'minimum', 'autopayAmount', 'interest', 'lastFour'];

const num = (x) => typeof x === 'number';
function same(got, want) {
  if (want === null || want === undefined) return got === null || got === undefined;
  if (num(want)) return num(got) && Math.abs(got - want) < 0.006;
  if (typeof want === 'string') return typeof got === 'string' && got.trim().toLowerCase() === want.trim().toLowerCase();
  if (typeof want === 'boolean') return got === want;
  if (Array.isArray(want)) return Array.isArray(got) && got.length === want.length && want.every((w, i) => same(got[i], w));
  if (typeof want === 'object') return got && typeof got === 'object' && Object.keys(want).every((k) => same(got[k], want[k]));
  return false;
}
const show = (x) => (x === null || x === undefined ? 'nothing' : typeof x === 'object' ? JSON.stringify(x) : String(x));
// compareDoc(doc, expected, derived) -> [{ key, want, got }] for every expected key that differs.
export function compareDoc(doc, expected, derived) {
  const out = [];
  for (const [k, want] of Object.entries(expected)) {
    if (!GET[k]) { out.push({ key: k, want, got: 'no reader for this key' }); continue; }
    const got = GET[k](doc, derived);
    if (!same(got, want)) out.push({ key: k, want, got });
  }
  return out;
}

export async function readFolder(dir) {
  if (!existsSync(dir)) return [];
  const docs = [];
  for (const name of readdirSync(dir).sort()) {
    const kind = kindOfName(name);
    if (!kind) continue;
    try {
      const doc = kind === 'pdf' ? readFile({ name, kind, items: (await pdfItems(dir + name)).pages }) : readFile({ name, kind, text: readFileSync(dir + name, 'utf8') });
      docs.push(doc);
    } catch (err) { docs.push({ file: { name, kind }, error: err.message, type: 'unknown', common: {}, fields: {} }); }
  }
  return docs;
}

// Runs one folder against its expected.json. Returns { docs, failures, reported, ms }.
export async function checkFolder(dir, { today, label }) {
  const t0 = Date.now();
  const docs = await readFolder(dir);
  const ms = Date.now() - t0;
  const expPath = dir + 'expected.json';
  const exp = existsSync(expPath) ? JSON.parse(readFileSync(expPath, 'utf8')) : null;
  const day = (exp && exp.today) || today;
  const batch = deriveBatch(docs, { today: day });
  const failures = [], reported = [];
  for (const d of docs) {
    const derived = d.reader ? deriveDoc(d, { today: day }) : { flags: [] };
    if (d.reader === 'bank') deriveBank(d, derived);
    let want = exp && exp.files ? exp.files[d.file.name] : null;
    // A private file is expected by its last four under cards.
    if (!want && exp && exp.cards && d.reader === 'card') want = exp.cards[val(d.common.lastFour)];
    if (d.error) { failures.push({ file: d.file.name, key: 'read', want: 'a document', got: d.error }); continue; }
    if (!want) { reported.push(d); continue; }
    const mapped = { ...want }; delete mapped.product;
    if (want.product) mapped.product = want.product;
    for (const miss of compareDoc(d, mapped, derived)) failures.push({ file: d.file.name, ...miss });
  }
  if (exp && exp.batch) {
    const four = (id) => { const d = docs.find((x) => x.id === id); return d ? val(d.common.lastFour) : null; };
    const got = batch.transfers.map((t) => ({ fromLastFour: four(t.from), toLastFour: four(t.to), amount: t.amount, kind: t.kind }));
    if (!same(got, exp.batch.transfers)) failures.push({ file: '(batch)', key: 'transfers', want: exp.batch.transfers, got });
    if (exp.batch.utilization && !same({ overall: pct(batch.utilization.overall), personal: pct(batch.utilization.personal) }, exp.batch.utilization)) failures.push({ file: '(batch)', key: 'utilization', want: exp.batch.utilization, got: batch.utilization });
  }
  return { docs, failures, reported, ms, batch, label };
}

const summaryLine = (d) => {
  const g = (k) => show(GET[k](d, { flags: [] }));
  if (d.reader === 'card') return `${g('type')} ${g('lastFour')} ${g('product')}: close ${g('close')}, due ${g('due')}, balance ${g('balance')}, min ${g('minimum')}, limit ${g('limit')}, APR ${g('apr')} / cash ${g('cashApr')} / transfer ${g('transferApr')}, interest ${g('interest')}, YTD interest ${g('ytdInterest')}, AutoPay ${g('autopayAmount')} ${g('autopayType')}, points ${g('pointsAvailable')} (redeemed ${g('pointsRedeemed')})`;
  if (d.reader === 'bank') return `${g('type')} ${g('lastFour')} ${g('product')}: ${g('open')} to ${g('close')}, begin ${g('beginning')}, end ${g('balance')}, deposits ${g('deposits')}, withdrawals ${g('withdrawals')}, APY ${g('apy')}, interest ${g('interestPeriod')} (YTD ${g('interestYtd')}), ${g('transactions')} rows`;
  if (d.reader === 'investment') return `${g('type')} ${g('lastFour')} ${g('institution')}: close ${g('close')}, value ${g('balance')}, cash ${g('cashBalance')}, dividends YTD ${g('dividendsYtd')}, contributions ${g('contributions')}, ${GET.holdings(d).length} holdings`;
  if (d.reader === 'plan') return `${g('type')} ${g('institution')} ${g('planName')}: balance ${g('balance')}, vested ${g('vestedBalance')} (${g('vestedPct')}%), rate ${g('contributionRate')}%, YTD you ${g('ytdEmployee')} / employer ${g('ytdEmployer')}, loan ${g('loanBalance')}`;
  if (d.reader === 'loan') return `${g('type')} ${g('lastFour')} ${g('institution')}: balance ${g('balance')}, rate ${g('apr')}%, payment ${g('payment')}, due ${g('due')}, plan ${g('plan')}, YTD interest ${g('ytdInterest')}`;
  return `${d.type}${d.unsupportedAs ? ' (' + d.unsupportedAs + ')' : ''}`;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const today = new Date().toISOString().slice(0, 10);
  const only = process.argv.includes('--private') ? [PRIVATE] : process.argv.includes('--synthetic') ? [SYNTHETIC] : [SYNTHETIC, PRIVATE];
  const lib = await loadPdfjs();
  console.log(lib ? 'pdf.js: installed' : 'pdf.js: not installed (npm install pdfjs-dist); synthetic PDFs read with the fallback reader, real PDFs cannot be read');
  let bad = 0;
  for (const dir of only) {
    if (!existsSync(dir)) { console.log('\n' + dir + ': no such folder'); continue; }
    const r = await checkFolder(dir, { today, label: dir });
    console.log('\n' + dir + ': ' + r.docs.length + ' files in ' + r.ms + ' ms');
    for (const d of r.docs) console.log('  ' + d.file.name + ' -> ' + summaryLine(d));
    if (r.failures.length) { console.log('  FAILURES'); for (const x of r.failures) console.log('    ' + x.file + ' ' + x.key + ': wanted ' + show(x.want) + ', got ' + show(x.got)); bad += r.failures.length; }
    else if (r.docs.length) console.log('  every expected value matches');
    if (r.reported.length) console.log('  ' + r.reported.length + ' file(s) with no expected entry, reported above for you to confirm');
  }
  process.exit(bad ? 1 : 0);
}
