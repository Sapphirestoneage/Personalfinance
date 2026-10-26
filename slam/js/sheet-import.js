// Importing the numbers spreadsheet (S-237): rows a person typed, matched to the household and read, then shown as a
// preview before anything changes. Pure: no page, no file reading (the page hands in the sheets as rows of text).
// The words it matches with all live in data/import-map.json; reading one answer is js/parse-answer.js.
//
// readSheets(sheets, map) -> { rows, problems }: the My Numbers tab's rows with their section, the Key tab ignored.
// planImport(spine, rows, map, { today }) -> plan: { rows: [planned row], notInFile: [{ label, path }] }
// replanRow(spine, row, map, { today, target, answer }) -> the row again, with a picked field or an edited answer.
// applyImport(spine, plan, { today }) -> the household with every ready row applied (review rows are left out).
// Every planned row: { n, question, answer, sure, notes, section, target, candidates, parse, changes, group, why }.
// group: 'change' (old -> new), 'new', 'review' (needs a look), 'same' (nothing to change).

import { parseAnswer, readingWords, dollars, percent, dateWords, CAD_WORDS } from './parse-answer.js';
import { PRESETS, INCOME_TYPES, fieldsFor } from '../engine/schema.js';
import { getAt, setAt, isFact, valueOf } from '../engine/spine.js';
import { addItem } from '../engine/edits.js';

export const SOURCE = 'numbers spreadsheet';

// ---------------------------------------------------------------- words
const STOP = new Set(['your', 'you', 'the', 'a', 'an', 'of', 'do', 'does', 'how', 'what', 'is', 'in', 'to', 'for', 'my', 'i', 'much', 'many', 'per', 'each', 'this', 'that', 'are', 'have', 'on', 'at', 'with', 'or', 'did', 'it', 'me', 'we', 'our', 'now', 'currently', 'current', 'total', 'amount', 'and', 'about', 'roughly', 'like', 'there', 'any', 'be']);
export const norm = (t) => String(t ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[’']/g, '').replace(/\(([^)]*)\)/g, ' $1 ').replace(/[^a-z0-9%$]+/g, ' ').replace(/\s+/g, ' ').trim();

// Synonym groups: any phrase in a group reads as the group's first word, longest phrases first.
function synonymTable(map) {
  const out = [];
  for (const g of map.synonyms || []) for (const w of g) out.push([norm(w), 'syn' + norm(g[0]).replace(/ /g, '_')]);
  return out.sort((a, b) => b[0].length - a[0].length);
}
const synCache = new WeakMap();
export function tokens(text, map) {
  if (!synCache.has(map)) synCache.set(map, synonymTable(map));
  let t = ' ' + norm(text) + ' ';
  for (const [w, canon] of synCache.get(map)) if (w && t.includes(' ' + w + ' ')) t = t.split(' ' + w + ' ').join(' ' + canon + ' ');
  return new Set(t.trim().split(' ').filter((x) => x && !STOP.has(x)));
}
// How alike two sets of words are, 0 to 1, whatever their order (Dice).
export function likeness(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
}
// The best likeness of a text to any of several wordings; a wording wholly inside the text counts nearly as much.
function bestLike(textToks, wordings, map) {
  let best = 0;
  for (const w of wordings) {
    const wt = tokens(w, map);
    let s = likeness(textToks, wt);
    if (wt.size && [...wt].every((x) => textToks.has(x))) s = Math.max(s, 0.6 + 0.3 * (wt.size / Math.max(textToks.size, wt.size)));
    if (s > best) best = s;
  }
  return best;
}

// ---------------------------------------------------------------- CSV
// RFC 4180: quotes, doubled quotes, commas and new lines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------- the sheet
const cellText = (x) => (x === null || x === undefined ? '' : String(x)).trim();
const isNamed = (name, words) => words.some((w) => norm(name) === norm(w));

// Which column is which: the header row is the first with an answer column and one more we know.
function findHeader(rows, map) {
  const H = map.headers;
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cols = {};
    rows[r].forEach((c, i) => {
      const t = norm(c);
      if (!t) return;
      for (const key of ['id', 'question', 'answer', 'sure', 'notes']) if (cols[key] === undefined && H[key].some((w) => norm(w) === t)) { cols[key] = i; return; }
    });
    // A header that says more ("Your answer (type it here)") still counts.
    rows[r].forEach((c, i) => {
      const t = norm(c);
      if (!t || Object.values(cols).includes(i)) return;
      for (const key of ['answer', 'sure', 'question', 'notes', 'id']) if (cols[key] === undefined && H[key].some((w) => norm(w).length > 3 && t.includes(norm(w)))) { cols[key] = i; return; }
    });
    if (cols.answer !== undefined && (cols.question !== undefined || cols.id !== undefined)) return { at: r, cols };
  }
  return null;
}

// sheets: [{ name, rows: [[text]] }] (one sheet for a CSV). The My Numbers tab is the one named so, else the first
// tab that is not the Key and has a header row.
export function readSheets(sheets, map) {
  const usable = sheets.filter((s) => !isNamed(s.name || '', map.sheets.key));
  const pick = usable.find((s) => isNamed(s.name || '', map.sheets.numbers) && findHeader(s.rows, map)) || usable.find((s) => findHeader(s.rows, map));
  if (!pick) return { rows: [], problems: ['I could not find a "Your answer" column. The sheet needs a row of column names with Question and Your answer.'], sheet: null };
  const { at, cols } = findHeader(pick.rows, map);
  const get = (r, k) => (cols[k] === undefined ? '' : cellText(r[cols[k]]));
  const out = [];
  let section = null;
  for (let i = at + 1; i < pick.rows.length; i++) {
    const r = pick.rows[i] || [];
    const row = { n: i + 1, id: get(r, 'id'), question: get(r, 'question'), answer: get(r, 'answer'), sure: get(r, 'sure'), notes: get(r, 'notes') };
    if (!row.id && !row.question && !row.answer && !row.sure && !row.notes) continue;
    // A section header: its id says so, or its words name a section and nothing is answered on it.
    const sid = /^section:(\w+)$/.exec(row.id);
    const named = !row.answer && !row.sure && !row.notes && (!row.id || sid) ? sectionNamed(row.question, map) : null;
    if (sid || named) { section = sid ? sid[1] : named.id; continue; }
    out.push({ ...row, section });
  }
  return { rows: out, problems: [], sheet: pick.name || null, columns: Object.keys(cols) };
}
function sectionNamed(text, map) {
  const t = norm(text);
  if (!t) return null;
  return map.sections.find((s) => norm(s.title) === t || s.words.some((w) => norm(w) === t)) || null;
}

// ---------------------------------------------------------------- targets
const meOf = (spine) => spine.household.people[0].id;
const yearOf = (spine) => spine.meta.asOf.slice(0, 4);
export const fieldPath = (spine, f) => f.path.replace('$me', meOf(spine)).replace('$year', yearOf(spine));
const sectionOf = (map, id) => map.sections.find((s) => s.id === id) || null;
export const itemLabel = (it, collection) => (collection === 'accounts' || collection === 'debts' ? valueOf(it.name) || PRESETS[it.type]?.label || it.id : it.label || it.id);

// Every place a row can land: each field in the map, and each item already in the household.
function targetsOf(spine, map) {
  const out = [];
  map.fields.forEach((f, i) => out.push({ key: 'field:' + i, kind: 'field', field: f, path: fieldPath(spine, f), section: f.section, label: f.question, wordings: [f.question, ...f.words] }));
  for (const s of map.sections.filter((x) => x.collection)) {
    for (const it of spine[s.collection] || []) {
      if (s.collection === 'expenses' && (s.need === true) !== (valueOf(it.need) === true) && valueOf(it.need) !== null) continue;
      if (s.collection === 'expenses' && valueOf(it.need) === null && s.id === 'wants') continue;
      const words = [itemLabel(it, s.collection)];
      if (it.institution && valueOf(it.institution)) words.push(valueOf(it.institution) + ' ' + itemLabel(it, s.collection), valueOf(it.institution));
      out.push({ key: s.collection + '.' + it.id, kind: 'item', collection: s.collection, id: it.id, section: s.id, label: itemLabel(it, s.collection), wordings: words });
    }
  }
  return out;
}
const LABEL = { income: 'Money coming in', expenses: 'Spending', accounts: 'What you have', debts: 'What you owe', goals: 'Goals' };
export function targetWords(t) {
  if (!t) return 'nothing yet';
  if (t.kind === 'field') return t.field.question;
  if (t.kind === 'item') return t.label + ' (' + LABEL[t.collection] + ')';
  return 'New: ' + t.label + ' (' + LABEL[t.collection] + (t.typeLabel ? ', ' + t.typeLabel : '') + ')';
}

// The kind of a new item from its words (a Roth IRA, a credit card, rent).
function kindOf(map, collection, toks) {
  let best = null, score = 0;
  for (const k of map.kinds[collection] || []) {
    const s = bestLike(toks, k.words, map);
    if (s > score) { best = k; score = s; }
  }
  return score >= 0.6 ? best : null;
}
function newTarget(spine, map, row, sectionId, toks) {
  const s = sectionOf(map, sectionId);
  if (!s || !s.collection) return null;
  const kind = kindOf(map, s.collection, toks);
  const t = { key: 'new:' + s.collection + ':' + row.n, kind: 'new', collection: s.collection, section: s.id, label: row.question || 'New line', need: s.need, sure: true };
  if (s.collection === 'accounts' || s.collection === 'debts') {
    if (!kind) return { ...t, type: null, typeLabel: null, sure: false, why: 'I could not tell what kind of ' + (s.collection === 'debts' ? 'debt' : 'account') + ' this is' };
    return { ...t, type: kind.type, typeLabel: PRESETS[kind.type].label };
  }
  if (s.collection === 'income') return { ...t, type: kind ? kind.type : 'other', typeLabel: kind ? null : null };
  if (s.collection === 'goals') return { ...t, type: kind ? kind.type : 'savings' };
  return { ...t, fat: kind ? kind.fat : null };
}

// A row's target: its hidden id first, else its words (the question, the section and the notes).
function matchRow(spine, map, row, all) {
  // The hidden id: a field (with $me and $year as written), an item, or a section-and-kind for a new line.
  if (row.id) {
    const f = map.fields.findIndex((x) => x.path === row.id && x.type !== 'scenarios') ;
    if (f >= 0) return { target: all.find((t) => t.key === 'field:' + f), score: 1, by: 'id', candidates: [] };
    const byPath = all.find((t) => t.kind === 'field' && t.path === row.id);
    if (byPath) return { target: byPath, score: 1, by: 'id', candidates: [] };
    const m = /^(income|expenses|accounts|debts|goals)\.([^.\s]+)$/.exec(row.id);
    if (m) {
      const hit = all.find((t) => t.key === row.id);
      if (hit) return { target: hit, score: 1, by: 'id', candidates: [] };
      // An id from an earlier household that is not here any more: a new line, keeping its id.
      const sec = row.section && sectionOf(map, row.section) && sectionOf(map, row.section).collection === m[1] ? row.section : map.sections.find((s) => s.collection === m[1]).id;
      const t = newTarget(spine, map, row, sec, tokens(row.question + ' ' + row.notes, map));
      if (t) return { target: { ...t, keepId: m[2] }, score: t.sure ? 0.95 : 0.5, by: 'id', candidates: [] };
    }
  }
  const q = tokens(row.question, map), qn = tokens(row.question + ' ' + row.notes, map);
  const scored = all.map((t) => {
    let s = Math.max(bestLike(q, t.wordings, map), 0.9 * bestLike(qn, t.wordings, map));
    if (row.section && t.section === row.section) s += 0.1;
    else if (row.section && t.section !== row.section) s -= 0.15;
    return { t, s };
  }).sort((a, b) => b.s - a.s);
  // In a section of lines (spending, accounts, debts), a question from another section needs a near-exact match:
  // "Health insurance" under needs is a bill, not the coverage question in About you.
  const lineSec = row.section && sectionOf(map, row.section) && sectionOf(map, row.section).collection;
  if (lineSec) for (const x of scored) if (x.t.kind === 'field' && x.t.section !== row.section && x.s < 0.95) x.s = Math.min(x.s, 0.45);
  scored.sort((a, b) => b.s - a.s);
  const [first, second] = scored;
  const candidates = scored.filter((x) => x.s >= 0.35).slice(0, 4).map((x) => x.t);
  const clear = first && first.s >= 0.75 && (!second || first.s - second.s >= 0.15 || second.t.key === first.t.key);
  if (clear) return { target: first.t, score: first.s, by: 'words', candidates };
  // Nothing close in an item section: a new line there.
  const sec = row.section ? sectionOf(map, row.section) : null;
  // Nothing close in a section of lines (a question that is only near, or no line like it): a new line there.
  if (sec && sec.collection && (!first || first.s < 0.5 || (first.t.kind === 'field' && first.s < 0.75))) {
    const t = newTarget(spine, map, row, sec.id, qn);
    return { target: t, score: t.sure ? 0.9 : 0.5, by: 'new', candidates };
  }
  return { target: null, score: first ? first.s : 0, by: 'words', candidates, best: first ? first.t : null };
}

// ---------------------------------------------------------------- what a row changes
const FACT_OF = { balance: 'balance', payment: 'minimum', rate: 'apr', limit: 'limit', promoRate: 'promoApr', promoEnds: 'promoEnds', payoffDate: 'payoffDate', lender: 'institution' };
function rateField(family) { return { cash: 'apy', fixedTerm: 'rate', taxable: 'expectedReturn', otherAssets: 'appreciationRate' }[family] || null; }

// The changes a parsed row makes: [{ path, label, type, old, value, kind, plain? }]. plain: not a Fact (cadence, dates
// on an item, a label), stored as is.
function changesFor(spine, t, p, row, today) {
  const out = [];
  if (!t || p.status === 'review') return out;
  const fk = (k) => (p.kinds && p.kinds[k]) || p.kind;
  const fact = (path, label, type, value, kind) => out.push({ path, label, type, old: getAt(spine, path), value, kind });
  const plain = (path, label, type, value) => out.push({ path, label, type, old: getAt(spine, path), value, plain: true });
  const blank = p.status === 'missing' || p.status === 'notForMe';
  const F = p.facts;
  if (t.kind === 'field') {
    const f = t.field;
    if (f.type === 'name') { if (!blank) plain(t.path, 'name', 'text', F.value); return out; }
    if (f.type === 'scenarios') {
      if (blank) return out;
      out.push({ path: t.path, label: 'investment return (likely)', type: 'rate', old: getAt(spine, t.path), value: F.scenarios.likely, kind: p.kind, note: 'best ' + percent(F.scenarios.best) + ', likely ' + percent(F.scenarios.likely) + ', worst ' + percent(F.scenarios.worst) + ' (from your sheet)' });
      return out;
    }
    fact(t.path, f.question, f.type, blank ? null : F.value, blank ? p.status : p.kind);
    return out;
  }
  const base = t.collection + '.' + (t.id || '$new');
  const item = t.id ? getAt(spine, base) : null;
  const put = (k, label, type, value) => fact(base + '.' + k, label, type, value, fk(Object.keys(FACT_OF).find((x) => FACT_OF[x] === k) || k));
  if (blank) {
    const main = { income: 'amount', expenses: 'amount', accounts: 'balance', debts: 'balance', goals: (item && item.type === 'fi') || t.type === 'fi' ? 'fiNumber' : 'target' }[t.collection];
    fact(base + '.' + main, main === 'fiNumber' ? 'FI number' : main, 'money', null, p.status);
    return out;
  }
  if (t.collection === 'income' || t.collection === 'expenses') {
    if (F.amount !== undefined) put('amount', 'amount', 'money', F.amount);
    if (F.cadence) plain(base + '.cadence', 'how often', 'cadence', F.cadence);
    if (F.start) plain(base + '.start', 'starts', 'date', F.start);
    if (F.end) plain(base + '.end', 'ends', 'date', F.end);
    if (F.federal !== undefined) fact(base + '.withholding.federal', 'federal tax withheld', 'money', F.federal, fk('federal'));
    if (F.state !== undefined) fact(base + '.withholding.state', 'state tax withheld', 'money', F.state, fk('state'));
    if (t.collection === 'income' && F.label && !t.id) plain(base + '.label', 'name', 'text', row.question ? row.question : F.label);
  } else if (t.collection === 'debts') {
    for (const k of ['balance', 'payment', 'rate', 'limit', 'promoRate', 'promoEnds', 'payoffDate', 'lender']) if (F[k] !== undefined) {
      const type = { balance: 'money', payment: 'money', limit: 'money', rate: 'rate', promoRate: 'rate', promoEnds: 'date', payoffDate: 'date', lender: 'text' }[k];
      fact(base + '.' + FACT_OF[k], { payment: 'payment a month', rate: 'interest rate', promoRate: 'intro rate', promoEnds: 'intro ends', payoffDate: 'paid off by', lender: 'bank or lender' }[k] || k, type, F[k], fk(k));
    }
  } else if (t.collection === 'accounts') {
    const family = item ? item.family : PRESETS[t.type] ? PRESETS[t.type].family : null;
    if (F.balance !== undefined) fact(base + '.balance', family === 'otherAssets' ? 'value' : 'balance', 'money', F.balance, fk('balance'));
    if (F.monthly !== undefined) fact(base + '.monthlyContribution', 'put in a month', 'money', F.monthly, fk('monthly'));
    if (F.rate !== undefined) {
      const rf = rateField(family);
      if (rf) fact(base + '.' + rf, rf === 'apy' ? 'interest a year' : rf === 'expectedReturn' ? 'expected return' : rf === 'appreciationRate' ? 'grows a year' : 'rate', 'rate', F.rate, fk('rate'));
    }
    if (F.contributions) {
      const old = getAt(spine, base + '.contributions');
      const was = valueOf(old) || [];
      // Kept with what each year already said (its kind of money, what it went through).
      const merged = F.contributions.map((c) => ({ ...(was.find((x) => x.year === c.year) || {}), year: c.year, amount: c.amount }));
      fact(base + '.contributions', 'put in by year', 'list', merged, fk('contributions'));
    }
  } else if (t.collection === 'goals') {
    const fi = (item && item.type === 'fi') || t.type === 'fi';
    if (F.target !== undefined) fact(base + '.' + (fi ? 'fiNumber' : 'target'), fi ? 'FI number' : 'target', 'money', F.target, fk('target'));
    if (F.annualSpending !== undefined) fact(base + '.annualSpending', 'spending a year', 'money', F.annualSpending, fk('annualSpending'));
    if (F.by) plain(base + '.by', 'by', 'date', F.by);
  }
  if (row.notes && t.kind !== 'field') plain(base + '.notes', 'notes', 'text', row.notes);
  return out;
}
// Why a parse cannot apply as it is (a part it did not read, or a rate on an account that keeps none).
function reviewWhy(spine, t, p) {
  if (p.status === 'review') return p.problems.join('. ');
  if (t && t.kind !== 'field' && t.collection === 'accounts' && p.facts.rate !== undefined) {
    const family = t.id ? getAt(spine, 'accounts.' + t.id).family : PRESETS[t.type] && PRESETS[t.type].family;
    if (!rateField(family)) return 'A rate on this kind of account is not kept anywhere';
  }
  if (t && t.collection === 'debts' && p.facts.payment !== undefined && p.facts.paymentCadence && p.facts.paymentCadence !== 'monthly') return 'A debt payment is kept per month';
  return null;
}

// ---------------------------------------------------------------- the plan
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function sameAs(c) {
  if (c.plain) return same(c.old ?? null, c.value ?? null);
  if (!isFact(c.old)) return c.value === null && c.kind === 'missing';
  if (c.kind === 'missing' || c.kind === 'notForMe') return c.old.kind === c.kind;
  if (c.type === 'list') return c.old.kind === c.kind && same((c.old.value || []).map((x) => [x.year, x.amount]), (c.value || []).map((x) => [x.year, x.amount]));
  return c.old.kind === c.kind && same(c.old.value, c.value) && (!c.note || c.old.note === c.note);
}
const hadValue = (c) => (c.plain ? c.old !== null && c.old !== undefined : isFact(c.old) && c.old.kind !== 'missing');

function expectOf(t) {
  if (!t) return 'text';
  if (t.kind === 'field') return t.field.type === 'name' ? 'text' : t.field.type === 'choice' ? 'choice' : t.field.type;
  return t.collection;
}

export function planRow(spine, map, row, { today, target = undefined, answer = undefined, all = null } = {}) {
  const targets = all || targetsOf(spine, map);
  let m = target !== undefined ? { target, score: 1, by: 'picked', candidates: [] } : matchRow(spine, map, row, targets);
  // Two wordings of one field (Investment return as one rate, or as best / likely / worst): the answer decides.
  if (!m.target && m.candidates.length > 1) {
    const top = m.candidates.filter((c) => c.kind === 'field' && c.path === m.candidates[0].path);
    const fits = top.filter((c) => parseAnswer(answer !== undefined ? answer : row.answer, { expect: expectOf(c), sure: row.sure, today, choices: c.field.choices }).status !== 'review');
    if (top.length > 1 && fits.length === 1) m = { target: fits[0], score: 0.8, by: 'answer', candidates: m.candidates };
  }
  const t = m.target;
  const text = answer !== undefined ? answer : row.answer;
  const sec = t ? sectionOf(map, t.section) : null;
  const p = parseAnswer(text, { expect: expectOf(t), sure: row.sure, today, spending: !!(sec && sec.collection === 'expenses'), choices: t && t.kind === 'field' ? t.field.choices : null });
  const out = { ...row, answer: text, edited: answer !== undefined && answer !== row.answer, picked: target !== undefined, target: t, score: m.score, by: m.by, candidates: m.candidates.length ? m.candidates : (m.best ? [m.best] : []), parse: p, changes: [], group: 'review', why: null };
  out.reading = readingWords(p);
  // A row with nothing typed in it changes nothing, whatever it matches.
  if (!String(text).trim() && !row.sure && !row.notes) { out.group = 'same'; out.blank = true; return out; }
  if (!t) { out.why = m.candidates.length ? 'Not sure which question this is' : 'I could not match this to anything'; return out; }
  if (t.kind === 'new' && !t.sure) { out.why = t.why; return out; }
  // A close match that is not a clear one is a question, not a guess.
  if (m.by === 'words' && m.score < 0.75) { out.why = 'Not sure which question this is'; return out; }
  const why = reviewWhy(spine, t, p);
  if (why) { out.why = why; return out; }
  out.changes = changesFor(spine, t, p, row, today).filter((c) => !sameAs(c));
  if (t.kind === 'new') { out.group = !String(text).trim() && !row.notes ? 'same' : 'new'; return out; }
  // A blank answer cell changes nothing: what is there stays (a "don't know" typed in it does clear it).
  if (p.status === 'missing' && p.blank && !row.sure) { out.changes = []; out.group = 'same'; out.blank = true; return out; }
  out.group = !out.changes.length ? 'same' : out.changes.some(hadValue) ? 'change' : 'new';
  return out;
}

export function planImport(spine, rows, map, { today }) {
  const all = targetsOf(spine, map);
  const planned = rows.map((r) => planRow(spine, map, r, { today, all }));
  // Two rows on one target: both need a look (which one is right is the person's call).
  const seen = new Map();
  for (const r of planned) if (r.target && r.group !== 'review') {
    const k = r.target.key + (r.target.kind === 'field' && r.target.field.type === 'scenarios' ? ':s' : '');
    if (seen.has(k)) { for (const x of [seen.get(k), r]) { x.group = 'review'; x.why = 'Two rows answer the same question (rows ' + seen.get(k).n + ' and ' + r.n + ')'; } }
    else seen.set(k, r);
  }
  return { rows: planned, notInFile: notInFile(spine, map, planned, all) };
}
export const replanRow = (spine, row, map, o) => planRow(spine, map, row, o);

// Every place a row could go, for the quick fix: [{ group, options: [{ label, target }] }]. The row's own candidates
// come first, then every question, every line already here, and a new line of each kind in each section.
export function pickTargets(spine, map, row) {
  const all = targetsOf(spine, map);
  const opt = (t) => ({ label: targetWords(t), target: t });
  const groups = [];
  if (row.candidates && row.candidates.length) groups.push({ group: 'Closest matches', options: row.candidates.map(opt) });
  for (const sec of map.sections) {
    const options = all.filter((t) => t.section === sec.id).map(opt);
    if (sec.collection) {
      const fresh = { kind: 'new', collection: sec.collection, section: sec.id, label: row.question || 'New line', need: sec.need, sure: true };
      if (sec.collection === 'accounts' || sec.collection === 'debts') {
        for (const [type, p] of Object.entries(PRESETS)) if ((p.family === 'debt') === (sec.collection === 'debts')) options.push(opt({ ...fresh, key: 'new:' + sec.collection + ':' + type, type, typeLabel: p.label }));
      } else {
        const k = kindOf(map, sec.collection, tokens(row.question + ' ' + row.notes, map));
        options.push(opt({ ...fresh, key: 'new:' + sec.id, type: sec.collection === 'income' ? (k ? k.type : 'other') : sec.collection === 'goals' ? (k ? k.type : 'savings') : undefined, fat: sec.collection === 'expenses' ? (k ? k.fat : null) : undefined }));
      }
    }
    if (options.length) groups.push({ group: sec.title, options });
  }
  return groups;
}

// What the household has that no row in the file speaks to: left as is.
function notInFile(spine, map, planned, all) {
  const hit = new Set(planned.filter((r) => r.target).map((r) => r.target.key));
  const out = [];
  for (const t of all) {
    if (hit.has(t.key)) continue;
    if (t.kind === 'field') {
      if (t.field.type === 'scenarios' || all.some((x) => x !== t && x.kind === 'field' && x.path === t.path && hit.has(x.key))) continue;
      const v = t.field.type === 'name' ? getAt(spine, t.path) : valueOf(getAt(spine, t.path));
      if (v !== null && v !== undefined) out.push({ label: t.field.question, path: t.path });
    } else out.push({ label: t.label + ' (' + LABEL[t.collection] + ')', path: t.key });
  }
  return out;
}

// ---------------------------------------------------------------- apply
export function applyImport(spine, plan, { today }) {
  let s = structuredClone(spine);
  const stamp = { asOf: today, source: SOURCE };
  for (const r of plan.rows) {
    if (r.group !== 'change' && r.group !== 'new') continue;
    const t = r.target;
    let base = null;
    if (t.kind === 'new') {
      const made = addItem(s, { collection: t.collection, type: t.type || (t.collection === 'goals' ? 'savings' : 'other'), label: t.label, cadence: 'monthly', fat: t.fat || null }, today);
      s = made.spine;
      let id = made.id;
      if (t.keepId && !(s[t.collection] || []).some((x) => x.id === t.keepId)) { s[t.collection] = s[t.collection].map((x) => (x.id === id ? { ...x, id: t.keepId } : x)); id = t.keepId; }
      base = t.collection + '.' + id;
      if (t.collection === 'expenses') s = setAt(s, base + '.need', { value: t.need === undefined ? null : t.need, kind: t.need === undefined ? 'missing' : 'known', ...stamp });
    }
    // The tax year a field names, made when it is not there yet.
    for (const c of r.changes) {
      const path = base ? c.path.replace(/^(\w+)\.\$new/, base) : c.path;
      const ty = /^taxYears\.(\d{4})\./.exec(path);
      if (ty && !(s.taxYears || []).some((x) => x.id === ty[1])) s = { ...s, taxYears: [...(s.taxYears || []), { id: ty[1], year: +ty[1] }] };
      if (c.plain) { s = setAt(s, path, c.value); continue; }
      const f = { value: c.kind === 'missing' || c.kind === 'notForMe' ? null : c.value, kind: c.kind, ...stamp };
      const note = c.note || (r.parse.unread ? 'From your sheet: "' + r.answer + '"' : null);
      if (note) f.note = note;
      s = setAt(s, path, f);
    }
  }
  return s;
}

// ---------------------------------------------------------------- words for the preview
export function valueWords(type, v) {
  if (v === null || v === undefined) return 'missing';
  if (isFact(v)) return v.kind === 'missing' ? 'missing' : v.kind === 'notForMe' ? 'not for me' : valueWords(type, v.value) + (v.kind === 'rough' ? ' (rough)' : '');
  if (type === 'money') return dollars(v);
  if (type === 'rate') return percent(v);
  if (type === 'date') return dateWords(v);
  if (type === 'cadence') return CAD_WORDS[v] || v;
  if (type === 'bool') return v ? 'yes' : 'no';
  if (type === 'list') return v.map((x) => x.year + ': ' + dollars(x.amount)).join(', ');
  return String(v);
}
export const changeWords = (c) => c.label + ': ' + valueWords(c.type, c.old) + ' \u2192 ' + valueWords(c.type, c.plain ? c.value : { value: c.value, kind: c.kind });
export const INCOME_KINDS = INCOME_TYPES;
export { fieldsFor };
