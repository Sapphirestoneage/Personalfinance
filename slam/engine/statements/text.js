// Statement text helpers (the statement uploader, S-243). pdf.js hands back positioned text items; this turns them
// into lines, drops the noise a statement carries (facsimile marks, remittance OCR lines, page numbers), masks
// anything that looks like a full account number, and finds money, rates and dates next to a label. Every finder
// returns a Field: { value, conf } with conf 'label' (found next to its label), 'inferred' (worked out from
// something else) or 'missing' (not found). Nothing here knows an issuer; profiles supply the labels.

export const CONF = ['label', 'inferred', 'missing'];
export const field = (value, conf = 'label', note = null) => (value === null || value === undefined ? { value: null, conf: 'missing', note } : { value, conf, note });
export const missing = (note = null) => ({ value: null, conf: 'missing', note });
export const val = (f) => (f && f.value !== undefined ? f.value : null);

// ---------------------------------------------------------------- lines out of pdf.js items
// items: [{ str, transform: [a, b, c, d, x, y], width, height }]. Items on one baseline (within tolerance) make a
// line, left to right; a wide gap starts a new cell, so an address block on the left stays apart from the column
// beside it. Rotated text (a side-ways scenario mark, a barcode caption) is left out.
export function linesFromItems(items, { tolerance = 2.5 } = {}) {
  const flat = [];
  for (const it of items || []) {
    if (!it || typeof it.str !== 'string' || !it.str.trim()) continue;
    const t = it.transform || [1, 0, 0, 1, 0, 0];
    if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01) continue;
    const size = Math.abs(t[3]) || Math.abs(t[0]) || 10;
    flat.push({ str: it.str, x: t[4], y: t[5], w: it.width || 0, size });
  }
  flat.sort((a, b) => (Math.abs(b.y - a.y) > tolerance ? b.y - a.y : a.x - b.x));
  const lines = [];
  for (const it of flat) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= tolerance) last.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  return lines.map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    const cells = [];
    let prev = null;
    for (const it of l.items) {
      const gap = prev ? it.x - (prev.x + prev.w) : 0;
      if (!prev || gap > Math.max(8, prev.size * 1.5)) cells.push({ x: it.x, text: it.str.trim() });
      else cells[cells.length - 1].text = (cells[cells.length - 1].text + ' ' + it.str).replace(/\s+/g, ' ').trim();
      prev = it;
    }
    return { y: l.y, x: l.items[0].x, text: cells.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim(), cells };
  });
}

// ---------------------------------------------------------------- noise and masking
const NOISE = [
  /^SCENARIO[- ]?\w*$/i, /This Statement is a Facsimile/i, /^Page \d+ of \d+$/i, /^\d+ of \d+$/,
  /^(?:\d[ -]?){20,}$/, // a remittance OCR line: digits only, long
  /^[\d ]{30,}$/, /^[|I1l ]{20,}$/ // a barcode drawn as glyphs
];
export const isNoise = (text) => !text || NOISE.some((re) => re.test(text.trim()));
// A run of 12 or more digits (spaces or dashes between groups allowed) is a full account or routing number: masked to
// its last four so it is never kept, shown or searched.
export const mask = (text) => String(text).replace(/\b(?:\d[ -]?){6,15}(\d{4})\b/g, (m, last) => '••••' + last);
export function cleanLines(lines) {
  return lines.filter((l) => !isNoise(l.text)).map((l) => ({ ...l, text: mask(l.text), cells: l.cells.map((c) => ({ ...c, text: mask(c.text) })) }));
}
export const textOf = (lines) => lines.map((l) => l.text).join('\n');

// ---------------------------------------------------------------- money, rates, dates
// "$1,234.56", "-$12.00", "($12.00)", "1,234.56-", "12.00 CR" (a credit) and the statement zero "- 0 -" or "-0-".
export const MONEY_RE = /\(?-?\s?\$?\s?-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\)?(?:\s?(?:CR|-))?|-\s?0\s?-/;
export function parseMoney(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  if (/^-\s?0\s?-$/.test(t)) return 0;
  const neg = /^\(.*\)$/.test(t) || /^-\s?\$?/.test(t) || /-$/.test(t) || /\bCR$/.test(t) || /^\$\s?-/.test(t);
  const n = Number(t.replace(/CR$/, '').replace(/[()$,\s+-]/g, ''));
  if (!Number.isFinite(n) || t.replace(/[^\d]/g, '') === '') return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}
export const cents = (x) => (x === null || x === undefined ? null : Math.round(x * 100));
export const RATE_RE = /(\d{1,2}(?:\.\d{1,3})?)\s?%/;
export const parseRate = (s) => { const m = RATE_RE.exec(String(s)); return m ? Math.round(Number(m[1]) * 10000) / 1000000 : null; };

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b|\b(\d{4})-(\d{2})-(\d{2})\b|\b([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})\b/;
const pad = (n) => String(n).padStart(2, '0');
export function parseDate(s) {
  const m = DATE_RE.exec(String(s));
  if (!m) return null;
  if (m[1]) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return isReal(y + '-' + pad(m[1]) + '-' + pad(m[2])); }
  if (m[4]) return isReal(m[4] + '-' + m[5] + '-' + m[6]);
  const mi = MONTHS.findIndex((x) => x.startsWith(m[7].toLowerCase().slice(0, 3)));
  return mi < 0 ? null : isReal(m[9] + '-' + pad(mi + 1) + '-' + pad(m[8]));
}
const isReal = (iso) => { const t = Date.parse(iso + 'T00:00:00Z'); return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso ? null : iso; };
export const toDay = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
export const daysBetween = (a, b) => toDay(b) - toDay(a);
export const fromDay = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
// "MM/DD" with no year, dated inside a statement period: the period's year, or the year before when the month is
// later than the period's close (a December purchase on a January statement).
export function dateInPeriod(mmdd, close) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(mmdd).trim());
  if (!m || !close) return null;
  let y = +close.slice(0, 4);
  if (+m[1] > +close.slice(5, 7)) y -= 1;
  return isReal(y + '-' + pad(m[1]) + '-' + pad(m[2]));
}

// ---------------------------------------------------------------- finders
// labels: a list of regexes (strings or RegExp) tried in order; the value is the first money / rate / date after the
// label on its line (within `span` characters). The text is the page text with lines kept, so a label never reads
// a value from the line below it.
const re = (x) => (x instanceof RegExp ? new RegExp(x.source, x.flags.includes('i') ? x.flags : x.flags + 'i') : new RegExp(x, 'i'));
function after(text, labels, span = 60) {
  const out = [];
  for (const l of [].concat(labels || [])) {
    const r = re(l);
    const rg = new RegExp(r.source, r.flags.includes('g') ? r.flags : r.flags + 'g');
    let m;
    while ((m = rg.exec(text))) {
      if (!m[0].length) { rg.lastIndex++; continue; }
      const lineEnd = text.indexOf('\n', m.index + m[0].length);
      const rest = text.slice(m.index + m[0].length, Math.min(lineEnd < 0 ? text.length : lineEnd, m.index + m[0].length + span));
      out.push({ rest, label: m[0], index: m.index });
    }
  }
  return out;
}
export function findMoney(text, labels, { span = 60, allowZero = true } = {}) {
  for (const c of after(text, labels, span)) {
    const m = MONEY_RE.exec(c.rest);
    if (!m) continue;
    // A date or a count right after the label is not the amount ("Deposits and Additions 3 $4,000.00" reads the $).
    const pick = pickMoney(c.rest);
    if (pick === null) continue;
    if (pick === 0 && !allowZero) continue;
    return field(pick, 'label', c.label);
  }
  return missing();
}
// The first money token in a run, skipping a bare count (no $ and no cents) when a dollar amount follows it, and
// never a piece of a date or a percent.
function pickMoney(rest) {
  const r = rest.replace(/^[\s:]+/, '');
  if (/^\d{1,2}\/\d{1,2}/.test(r)) return null;
  const tokens = moneyTokens(r).slice(0, 4);
  if (!tokens.length) return null;
  const dollar = tokens.find((t) => /[$.]|-\s?0\s?-/.test(t));
  return parseMoney(dollar || tokens[0]);
}
// Whole money tokens in a run: never a piece of a date, a percent or a longer number.
const TOKEN_RE = /(?<![\w\/.,-])(?:-\s?0\s?-|\(?-?\$?\s?-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\)?(?:\s?CR)?)(?![\d\/%.,])/g;
export const moneyTokens = (s) => (String(s).match(TOKEN_RE) || []).map((t) => t.trim()).filter((t) => /\d/.test(t));
// The second money token on a line that starts with the label (a "This period / Year to date" table).
export function findSecondMoney(text, labels) {
  for (const l of [].concat(labels || [])) {
    const r = re(l);
    const rg = new RegExp('^' + r.source.replace(/^\^/, ''), 'im');
    const m = rg.exec(text);
    if (!m) continue;
    const lineEnd = text.indexOf('\n', m.index); const line = text.slice(m.index + m[0].length, lineEnd < 0 ? text.length : lineEnd);
    const toks = moneyTokens(line).filter((t) => /[$.]|-\s?0\s?-/.test(t));
    if (toks.length >= 2) return field(parseMoney(toks[1]), 'label', m[0]);
  }
  return missing();
}
// Table cells (pdf.js lines keep them apart): the money cells to the right of the cell that starts with the label,
// on the same line. [period, year to date] in a two-column income table. [] when no such cell.
export function moneyCellsAfter(pages, labels) {
  for (const l of [].concat(labels || [])) {
    const r = new RegExp('^' + re(l).source.replace(/^\^/, ''), 'i');
    for (const page of pages || []) for (const line of page.lines || []) {
      const i = (line.cells || []).findIndex((c) => r.test(c.text));
      if (i < 0) continue;
      const own = moneyTokens(line.cells[i].text.replace(r, ''));
      const rest = line.cells.slice(i + 1).map((c) => c.text.trim()).filter((t) => moneyTokens(t).length === 1 && /^[-($]?[\d$,.()\s-]+(?:CR)?$|^-\s?0\s?-$/.test(t)).map((t) => parseMoney(t));
      const out = [...own.map(parseMoney), ...rest].filter((x) => x !== null);
      if (out.length) return out;
    }
  }
  return [];
}
// Words after a label inside its own cell (or the next cell when the label fills its cell), so a name in the left
// column never runs into the column beside it. Falls back to the line when the document has no cells.
export function findTextCell(pages, labels, text) {
  for (const l of [].concat(labels || [])) {
    const r = re(l);
    for (const page of pages || []) for (const line of page.lines || []) {
      const cells = line.cells || [];
      for (let i = 0; i < cells.length; i++) {
        const m = r.exec(cells[i].text);
        if (!m) continue;
        const own = cells[i].text.slice(m.index + m[0].length).replace(/^[:\s]+/, '').trim();
        const t = own || (cells[i + 1] ? cells[i + 1].text.trim() : '');
        if (t) return field(t, 'label', m[0]);
      }
    }
  }
  return pages && pages.length ? missing() : findText(text, labels);
}
export function findRate(text, labels, { span = 60 } = {}) {
  for (const c of after(text, labels, span)) { const r = parseRate(c.rest); if (r !== null) return field(r, 'label', c.label); }
  return missing();
}
export function findDate(text, labels, { span = 60 } = {}) {
  for (const c of after(text, labels, span)) { const d = parseDate(c.rest); if (d) return field(d, 'label', c.label); }
  return missing();
}
// "09/08/26 - 10/07/26", "September 11, 2026 through October 10, 2026": { open, close }.
export function findDateRange(text, labels, { span = 80 } = {}) {
  for (const c of after(text, labels, span)) {
    const rg = new RegExp(DATE_RE.source, 'g'); const ds = []; let m;
    while ((m = rg.exec(c.rest)) && ds.length < 2) { const d = parseDate(m[0]); if (d) ds.push(d); }
    if (ds.length === 2) return field({ open: ds[0], close: ds[1] }, 'label', c.label);
    if (ds.length === 1) return field({ open: null, close: ds[0] }, 'label', c.label);
  }
  return missing();
}
export function findText(text, labels, { span = 60 } = {}) {
  for (const c of after(text, labels, span)) { const t = c.rest.replace(/^[:\s]+/, '').trim(); if (t) return field(t, 'label', c.label); }
  return missing();
}
export function findInt(text, labels, { span = 40 } = {}) {
  for (const c of after(text, labels, span)) { const m = /-?\d[\d,]*/.exec(c.rest); if (m) return field(parseInt(m[0].replace(/,/g, ''), 10), 'label', c.label); }
  return missing();
}
// Yes/no words after a label ("AutoPay: ON", "Fixed").
export const has = (text, labels) => [].concat(labels || []).some((l) => re(l).test(text));
// The last four digits after a label ("Account Number: •••• 1245", "ending in 1245", "XXXX-1245").
export function findLastFour(text, labels) {
  for (const c of after(text, labels, 60)) {
    // Dates on the same line are not account digits; the first run of four or more digits after the label is.
    const rest = c.rest.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ').replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/[\u2022xX*#]/g, ' ');
    const runs = rest.match(/\d[\d -]*\d|\d{4,}/g) || [];
    const digits = runs.map((r) => r.replace(/\D/g, '')).filter((d) => d.length >= 4);
    if (digits.length) return field(digits[0].slice(-4), 'label', c.label);
  }
  return missing();
}
