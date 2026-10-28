// From a file to one document record (S-243). A PDF arrives as pdf.js text items per page, a CSV or OFX as text.
// The record carries what was read and how sure each value is; the page lines stay in memory for the review's
// Details and a re-read under a corrected type, and are never saved. Full account numbers are masked on the way in.

import { linesFromItems, cleanLines, textOf, field, missing, val, mask } from './text.js';
import { classifyText, typeConfidence, READER, DOC_TYPES } from './classify.js';
import { pickProfile, PROFILES } from './profiles/index.js';
import { readCommon, READERS } from './readers.js';
import { readCsv } from './csv.js';
import { readOfx } from './ofx.js';

let seq = 0;
export const resetIds = () => { seq = 0; };
const nextId = () => 'f' + (++seq);

// The institution named in the text: the profile's, else the first known name found (data/institutions.json).
function institutionOf(text, profile, institutions, pages = []) {
  if (profile && profile.id !== 'generic') return field(profile.institution ? profile.institution(text) : profile.name, 'label');
  // The words at the top of the first page, when they read like a name (a bank's name sits there in large type);
  // a known name found in the text is only a fallback, since a fund's name in the holdings is not the institution.
  const first = ((pages[0] || {}).lines || []).map((l) => (l.cells[0] || {}).text || '').find((t) => /^[A-Za-z][A-Za-z.,'& -]{2,48}$/.test(t) && !/statement|summary|account|page|customer|period|balance/i.test(t));
  if (first) return field(first.trim(), 'inferred');
  const names = (institutions && institutions.names) || [];
  const aliases = (institutions && institutions.aliases) || {};
  for (const n of names) if (new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)) return field(aliases[n] || n, 'inferred');
  return missing();
}

// pages: [{ lines }] already cleaned. Runs the classifier, picks the profile and the reader for the type.
export function readPages(name, pages, { institutions = null, profiles = PROFILES, type = null } = {}) {
  const text = pages.map((p) => textOf(p.lines)).join('\n');
  const guess = classifyText(text);
  const profile = pickProfile(text, profiles);
  const doc = { id: nextId(), file: { name: String(name || 'statement.pdf'), kind: 'pdf', pages: pages.length }, pages, text, profile: profile.id, institution: institutionOf(text, profile, institutions, pages), type: type || guess.type, typeConf: type ? 'label' : typeConfidence(guess), typeWhy: guess.why, unsupportedAs: guess.unsupportedAs || null };
  return fill(doc, profile);
}
function fill(doc, profile) {
  const ctx = { text: doc.text, pages: doc.pages, profile, type: doc.type };
  doc.common = readCommon(ctx);
  ctx.common = doc.common;
  doc.reader = READER[doc.type] || null;
  doc.fields = doc.reader ? READERS[doc.reader](ctx) : { transactions: [] };
  // A savings statement with an APY at or over 2% is a high-yield account.
  if (doc.type === 'savings' && val(doc.fields.apy) !== null && doc.fields.apy.value >= 0.02 && doc.typeConf !== 'label') doc.type = 'hysa';
  // A card with Ink on it, or a business name over the address, is a business account.
  doc.business = doc.common.businessHint || (doc.type === 'credit_card' && /business/i.test(val(doc.common.product) || ''));
  return doc;
}
// The same file read again as another type (the review screen's type list).
export function reread(doc, type, { profiles = PROFILES } = {}) {
  if (doc.file.kind !== 'pdf' || !DOC_TYPES[type]) return { ...doc, type, typeConf: 'label' };
  const profile = profiles.find((p) => p.id === doc.profile) || pickProfile(doc.text, profiles);
  return fill({ ...doc, type, typeConf: 'label' }, profile);
}
// From pdf.js: items per page.
export function readPdfItems(name, itemsPerPage, opts) {
  const pages = itemsPerPage.map((items) => ({ lines: cleanLines(linesFromItems(items)) }));
  return readPages(name, pages, opts);
}
// From plain text pages (tests, and a text dump): each line's first cell is the line.
export function readTextPages(name, textPages, opts) {
  const pages = textPages.map((t) => ({ lines: cleanLines(String(t).split('\n').map((s, i) => ({ y: -i, x: 0, text: s.trim(), cells: s.trim() ? [{ x: 0, text: s.trim() }] : [] })).filter((l) => l.text)) }));
  return readPages(name, pages, opts);
}

// A CSV: transactions or positions. mapping and flip come back from the review screen when the columns were fixed.
export function readCsvFile(name, text, { mapping = null, flip = null, type = null } = {}) {
  const r = readCsv(text, { name, mapping, flip });
  const t = type || r.accountType || (r.kind === 'positions' ? 'brokerage' : 'unknown');
  const dates = r.transactions.map((x) => x.date).sort();
  const last = r.transactions.length ? r.transactions.reduce((a, b) => (a.date >= b.date ? a : b)) : null;
  const doc = {
    id: nextId(), file: { name, kind: 'csv', pages: 1, rows: r.transactions.length + r.holdings.length }, pages: [], text: '',
    profile: r.institution ? r.institution.toLowerCase().replace(/\s+/g, '-') : 'generic', institution: r.institution ? field(r.institution, 'label') : missing(),
    type: t, typeConf: type ? 'label' : r.accountType ? 'inferred' : r.kind === 'positions' ? 'inferred' : 'missing', typeWhy: r.format ? [r.format] : [], unsupportedAs: null,
    csv: { kind: r.kind, header: r.header, signature: r.signature, map: r.map, needsMapping: r.needsMapping, skipped: r.skipped, flip: flip },
    common: { lastFour: r.lastFour ? field(r.lastFour, 'inferred') : missing(), period: dates.length ? field({ open: dates[0], close: dates[dates.length - 1] }, 'inferred') : missing(), closing: dates.length ? field(dates[dates.length - 1], 'inferred') : missing(), product: missing(), nameOnAccount: missing(), businessName: missing(), joint: missing(), businessHint: false },
    reader: READER[t] || null, business: false
  };
  const f = { transactions: r.transactions, holdings: r.holdings };
  if (r.kind === 'positions') { const total = Math.round(r.holdings.reduce((s, h) => s + h.value, 0) * 100) / 100; f.ending = r.holdings.length ? field(total, 'inferred') : missing(); f.investedBalance = f.ending; const cb = r.holdings.every((h) => h.costBasis !== null) && r.holdings.length ? Math.round(r.holdings.reduce((s, h) => s + h.costBasis, 0) * 100) / 100 : null; f.costBasis = cb === null ? missing() : field(cb, 'inferred'); f.unrealized = cb === null ? missing() : field(Math.round((total - cb) * 100) / 100, 'inferred'); }
  else if (last && last.balance !== null) { if (doc.reader === 'card') f.newBalance = field(last.balance, 'inferred'); else f.ending = field(last.balance, 'inferred'); }
  doc.fields = f;
  return doc;
}

// An OFX or QFX download.
export function readOfxFile(name, text, { type = null } = {}) {
  const r = readOfx(text);
  const t = type || r.accountType;
  const close = r.asOf || r.periodEnd || (r.transactions.length ? r.transactions.map((x) => x.date).sort().pop() : null);
  const doc = {
    id: nextId(), file: { name, kind: 'ofx', pages: 1, rows: r.transactions.length + r.holdings.length }, pages: [], text: '',
    profile: 'generic', institution: r.institution ? field(mask(r.institution), 'label') : missing(), type: t, typeConf: type ? 'label' : 'inferred', typeWhy: ['the file says ' + r.accountType.replace(/_/g, ' ')], unsupportedAs: null,
    common: { lastFour: r.lastFour ? field(r.lastFour, 'label') : missing(), period: field({ open: r.periodStart, close }, r.periodEnd ? 'label' : 'inferred'), closing: close ? field(close, r.asOf ? 'label' : 'inferred') : missing(), product: missing(), nameOnAccount: missing(), businessName: missing(), joint: missing(), businessHint: false },
    reader: READER[t] || null, business: false
  };
  const f = { transactions: r.transactions, holdings: r.holdings };
  if (doc.reader === 'card') f.newBalance = r.balance === null ? missing() : field(r.balance, 'label');
  else if (doc.reader === 'investment') { f.ending = r.balance === null ? missing() : field(r.balance, 'label'); f.cashBalance = r.cash === null ? missing() : field(r.cash, 'label'); }
  else f.ending = r.balance === null ? missing() : field(r.balance, 'label');
  doc.fields = f;
  return doc;
}

// One door for the review screen: { name, kind: 'pdf' | 'csv' | 'ofx', items?: [[...]], text? }.
export function readFile(file, opts = {}) {
  if (file.kind === 'pdf') return readPdfItems(file.name, file.items, opts);
  if (file.kind === 'csv') return readCsvFile(file.name, file.text, opts);
  if (file.kind === 'ofx') return readOfxFile(file.name, file.text, opts);
  throw new Error('Not a PDF, CSV or OFX file');
}
export const kindOfName = (name) => (/\.pdf$/i.test(name) ? 'pdf' : /\.csv$/i.test(name) ? 'csv' : /\.(ofx|qfx|qbo)$/i.test(name) ? 'ofx' : null);
