// Same account, several files (S-243): grouped by institution and last four (else type and product), newest closing
// date first. The newest statement sets the moving numbers; the older ones are kept as month-end snapshots. Static
// numbers (rates, limits, product, plan, vesting) that differ from what the household already holds are listed so
// each change is confirmed on the review screen before it lands.

import { val } from './text.js';
import { DOC_TYPES } from './classify.js';
import { accountKey, docRank } from './derive.js';
import { valueOf } from '../spine.js';

const close = (d) => val(d.common && d.common.closing) || '';
export function groupDocs(docs) {
  const groups = {};
  for (const d of docs) {
    if (!d.reader) continue;
    const k = accountKey(d);
    (groups[k] = groups[k] || { key: k, docs: [] }).docs.push(d);
  }
  // A statement outranks a transactions file (a CSV holds no balances or rates); among statements the newest wins.
  return Object.values(groups).map((g) => { g.docs.sort((a, b) => docRank(b) - docRank(a) || close(b).localeCompare(close(a))); g.newest = g.docs[0]; g.older = g.docs.slice(1); return g; });
}

// The household item this group is, when one is there already: by last four and institution first, then by the
// institution and the product or name words. Returns { item, how, candidates } where candidates are every item of
// the right collection so the screen can offer a pick.
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && w.length > 2);
export function matchExisting(group, spine) {
  const d = group.newest;
  const dt = DOC_TYPES[d.type] || {};
  const coll = dt.coll;
  if (!coll) return { item: null, how: null, candidates: [] };
  const list = (spine[coll] || []).filter((x) => (coll === 'debts') === (DOC_TYPES[d.type].section === 'debt'));
  const four = val(d.common.lastFour), inst = words(val(d.institution)).join(' ');
  // The same institution: the household's words hold the statement's, or the first words agree ("Fidelity" and
  // "Fidelity Investments"); J.P. Morgan investing sits with Chase.
  const sameInst = (x) => { const xi = words(valueOf(x.institution)).join(' '); const xn = words(valueOf(x.name)).join(' '); const a = inst.split(' ')[0], b = xi.split(' ')[0]; return !inst || xi.includes(inst) || xn.includes(inst) || (!!b && a === b) || (inst === 'j p morgan' && /chase/.test(xi + xn)); };
  let item = four ? list.find((x) => valueOf(x.lastFour) === four && sameInst(x)) || null : null;
  if (item) return { item, how: 'lastFour', candidates: list };
  const sameType = list.filter((x) => x.type === dt.preset && sameInst(x));
  const pw = words(val(d.common.product));
  item = sameType.find((x) => { const nw = words(valueOf(x.name)); return pw.length && pw.every((w) => nw.includes(w)) && !valueOf(x.lastFour); }) || null;
  if (item) return { item, how: 'name', candidates: list };
  // One account of this type at this bank with no last four on record is the likely one.
  if (sameType.length === 1 && !valueOf(sameType[0].lastFour)) return { item: sameType[0], how: 'only', candidates: list };
  return { item: null, how: null, candidates: list };
}

// Static numbers to confirm: [{ key, label, from, to, type }], where the household's value differs from the statement's.
export const STATIC = {
  card: [['apr', 'Interest rate on purchases', 'rate'], ['cashApr', 'Cash advance rate', 'rate'], ['transferApr', 'Balance transfer rate', 'rate'], ['limit', 'Credit limit', 'money'], ['product', 'Card', 'text'], ['lateFeeMax', 'Late fee, up to', 'money']],
  bank: [['apy', 'Interest rate (APY)', 'rate'], ['product', 'Account', 'text']],
  cd: [['rate', 'Interest rate', 'rate'], ['maturityDate', 'Matures on', 'date']],
  investment: [['product', 'Account', 'text']],
  plan: [['vestedPct', 'Vested', 'rate'], ['contributionRate', 'Contribution rate', 'rate'], ['planName', 'Plan', 'text'], ['employer', 'Employer', 'text']],
  loan: [['apr', 'Interest rate', 'rate'], ['minimum', 'Monthly payment', 'money'], ['plan', 'Repayment plan', 'text'], ['fixedRate', 'Fixed rate', 'bool']]
};
export function staticDiffs(group, item, facts) {
  if (!item) return [];
  const out = [];
  for (const [key, label, type] of STATIC[group.newest.reader] || []) {
    const f = facts[key];
    if (!f || f.value === null || f.kind === 'missing') continue;
    const have = item[key] ? valueOf(item[key]) : null;
    if (have === null) continue;
    const same = type === 'rate' || type === 'money' ? Math.abs(have - f.value) < 0.00005 : String(have) === String(f.value);
    if (!same) out.push({ key, label, from: have, to: f.value, type });
  }
  return out;
}
