// 80/20 (S-091): the smallest set of the biggest items that make up a share
// (80% by default) of spending. Three levels, for one month or a range: log
// entries (purchases and fees), merchants (net of refunds), and budget lines
// (actuals). Depends on log.js (counted entries), plan.js (a month's actuals and its category tree) and
// money.js (ratio, r2). Dollars over the months picked (a sum, not a monthly average); a share is a ratio 0 to 1.

import { counted } from './log.js';
import { actualsFor, modelForMonth } from './plan.js';
import { ratio, r2 } from './money.js';


/**
 * The smallest set of the biggest items that reaches a share of the total.
 * @param {Array<{key: string, label: string, amount: number}>} items dollars; only amounts above zero take part.
 * @param {number} [share=0.8] a ratio 0 to 1.
 * @returns {object} { share, items (the cut, largest first), count, of, countShare, amount, amountShare, total, cumulative }:
 *   dollars and ratios 0 to 1; count is 0 when nothing is above zero.
 */
export function paretoCut(items, share = 0.8) {
  // Largest first; ties by label, so the same data always gives the same cut.
  const all = items.filter((i) => i.amount > 0).slice().sort((a, b) => b.amount - a.amount || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const total = r2(all.reduce((a, i) => a + i.amount, 0));
  let run = 0;
  let count = 0;
  const cumulative = all.map((i) => { run += i.amount; return { ...i, cum: r2(run), cumShare: total ? run / total : null }; });
  // The 1e-9 absorbs floating-point noise, so a set that reaches exactly 80% counts.
  if (total > 0) count = cumulative.findIndex((i) => i.cum >= share * total - 1e-9) + 1;
  const cut = all.slice(0, count);
  const amount = r2(cut.reduce((a, i) => a + i.amount, 0));
  return { share, items: cut, count, of: all.length, countShare: ratio(count, all.length), amount, amountShare: ratio(amount, total), total, cumulative };
}

const pct = (x) => Math.round(x * 100) + '%';
const list = (xs) => (xs.length < 3 ? xs.join(' and ') : xs.slice(0, -1).join(', ') + ', and ' + xs[xs.length - 1]);

/**
 * The one-sentence reading for a level.
 * @param {object} cut what paretoCut returned.
 * @param {string} level 'entries', 'merchants' or 'lines'.
 * @returns {string} up to four lines are named; more are given as a percent of the count.
 */
export function paretoReading(cut, level) {
  if (!cut.of) return level === 'entries' ? 'No entries in the log for this period.' : 'Nothing to count yet.';
  const of = cut.count + ' of ' + cut.of;
  const sh = pct(cut.share);
  if (level === 'lines') return cut.count <= 4 ? cut.count + ' line' + (cut.count === 1 ? '' : 's') + ', ' + list(cut.items.map((i) => i.label)) + ', made up ' + sh + '.' : pct(cut.countShare) + ' of your lines (' + of + ') made up ' + sh + ' of your spending.';
  if (level === 'merchants') return pct(cut.countShare) + ' of your merchants (' + of + ') made up ' + sh + ' of your spending.';
  return pct(cut.countShare) + ' of your entries (' + of + ') made up ' + sh + ' of your spending.';
}

const inRange = (months) => { const set = new Set(months); return (t) => set.has(t.date.slice(0, 7)); };
// Money moved to savings (a Roth IRA, say) is not spending.
const savingsLines = (doc) => new Set(doc.categories.filter((c) => c.savings).flatMap((c) => c.lines.map((l) => l.id)));

/**
 * Purchases and fees in the months, one item each.
 * @param {object} doc the household file.
 * @param {string[]} months 'YYYY-MM' keys.
 * @returns {Array<{key: string, label: string, amount: number}>} dollars; what others owe back on an entry is taken off.
 */
export function entryItems(doc, months) {
  const lineName = Object.fromEntries(doc.categories.flatMap((c) => c.lines.map((l) => [l.id, l.name])));
  const sav = savingsLines(doc);
  // Balance adjustments are not spending.
  return counted(doc.transactions).filter(inRange(months)).filter((t) => !t.adjust && !sav.has(t.lineId) && (t.kind === 'spend' || t.kind === 'fee') && t.amount > 0)
    .map((t) => ({ key: t.id, label: (t.description || t.note || lineName[t.lineId] || 'Entry') + ', ' + t.date.slice(5), amount: t.amount - (t.owed || 0) }));
}

/**
 * Merchants, net of refunds. Entries with no merchant are grouped by their line (S-095),
 * "Rent (no merchant, by line)", never pooled into one bucket.
 * @param {object} doc the household file.
 * @param {string[]} months 'YYYY-MM' keys.
 * @returns {Array<{key: string, label: string, amount: number}>} dollars, to the cent; a refund is negative in the log, so
 *   adding it nets it off.
 */
export function merchantItems(doc, months) {
  const g = {};
  const sav = savingsLines(doc);
  const lineName = Object.fromEntries(doc.categories.flatMap((c) => c.lines.map((l) => [l.id, l.name])));
  for (const t of counted(doc.transactions).filter(inRange(months))) {
    if (t.adjust || sav.has(t.lineId) || !(t.kind === 'spend' || t.kind === 'fee' || t.kind === 'refund')) continue;
    const k = t.merchant || (lineName[t.lineId] ? lineName[t.lineId] + ' (no merchant, by line)' : 'No merchant, no line');
    g[k] = (g[k] || 0) + t.amount - (t.owed || 0);
  }
  return Object.entries(g).map(([k, v]) => ({ key: k, label: k, amount: r2(v) }));
}

/**
 * Budget lines: each spending line's actual, added over the months.
 * @param {object} doc the household file.
 * @param {object} history what monthHistory returns (summary.history).
 * @param {string[]} months 'YYYY-MM' keys.
 * @returns {Array<{key: string, label: string, amount: number}>} dollars over the months; a month with no actual on a line
 *   adds nothing (empty is not zero), and a line with none anywhere is left out.
 */
export function lineItems(doc, history, months) {
  const g = {};
  for (const m of months) {
    const a = actualsFor(doc, history, m);
    // A closed month's lines come from its snapshot (the tree as it was); an open month from the tree as it stands then.
    const rec = (doc.months || []).find((x) => x.key === m);
    const lines = rec
      ? Object.entries(rec.snapshot.lines).filter(([, l]) => !(rec.snapshot.categories[l.categoryId] || {}).savings).map(([id, l]) => ({ id, name: l.name }))
      : modelForMonth(doc, m).categories.filter((c) => !c.savings).flatMap((c) => c.lines.map((l) => ({ id: l.id, name: l.name })));
    for (const l of lines) {
      const v = a.lines[l.id];
      if (v === null || v === undefined) continue;
      g[l.id] = g[l.id] || { key: l.id, label: l.name, amount: 0 };
      g[l.id].amount = r2(g[l.id].amount + v);
    }
  }
  return Object.values(g);
}

/**
 * Months for a range picker: this month, the last 3 or 12 (ending this month), or all with data.
 * @param {object} doc the household file.
 * @param {object} history what monthHistory returns.
 * @param {string} range 'month', '3', '12', or anything else for every month with data.
 * @param {?string} anchor 'YYYY-MM', "this month" when one is picked; else the month being worked on.
 * @returns {string[]} 'YYYY-MM' keys, oldest first.
 */
export function rangeMonths(doc, history, range, anchor) {
  const cur = anchor || doc.currentMonth;
  const back = (n) => { const out = []; let [y, m] = cur.split('-').map(Number); for (let i = 0; i < n; i++) { out.unshift(y + '-' + String(m).padStart(2, '0')); m -= 1; if (m < 1) { m = 12; y -= 1; } } return out; };
  if (range === 'month') return [cur];
  if (range === '3') return back(3);
  if (range === '12') return back(12);
  return [...new Set([...history.allKeys, ...doc.transactions.map((t) => t.date.slice(0, 7)), cur])].sort();
}

/**
 * All three levels for a set of months, each with its reading.
 * @param {object} doc the household file.
 * @param {object} history what monthHistory returns.
 * @param {string[]} months 'YYYY-MM' keys.
 * @param {number} [share=0.8] a ratio 0 to 1.
 * @returns {{months: string[], noEntries: boolean, entries: object, merchants: object, lines: object}} each level is a
 *   paretoCut plus its reading.
 */
export function paretoLevels(doc, history, months, share = 0.8) {
  const entries = paretoCut(entryItems(doc, months), share);
  const merchants = paretoCut(merchantItems(doc, months), share);
  const lines = paretoCut(lineItems(doc, history, months), share);
  return {
    months, noEntries: entries.of === 0,
    entries: { ...entries, reading: paretoReading(entries, 'entries') },
    merchants: { ...merchants, reading: paretoReading(merchants, 'merchants') },
    lines: { ...lines, reading: paretoReading(lines, 'lines') }
  };
}
