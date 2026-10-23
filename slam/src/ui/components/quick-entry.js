// Quick entry (S-085): log one amount in a few taps, phone first. Amount, line (recent lines
// first, search by name), date (today), and optional merchant, note, and account (the last one
// used). Spending, refund, or income. The sheet keeps what was typed in ctx.ui.qe, so a re-render
// (a toast, say) puts every box back as it was. Recent lines and the last account come from
// engines/log.js; an entry is saved with addEntry (store/log.js); the amount is read by parseAmount (value-input.js).

import { h, options } from '../dom.js';
import { money, todayIso } from '../format.js';
import { parseAmount } from './value-input.js';
import { addEntry } from '../../store/log.js';
import { recentLines, lastAccount } from '../../engines/log.js';

export function openQuickEntry(ctx, preset = {}) {
  ctx.ui.qe = { kind: 'spend', amount: '', lineId: null, incomeId: null, date: todayIso(), merchant: '', note: '', account: lastAccount(ctx.doc), search: '', ...preset };
  ctx.ui.focusKey = 'qe-amount';
  ctx.rerender();
}

export function quickEntryButton(ctx, label = '+ Quick entry', preset) {
  return h('button', { class: 'btn primary', 'data-key': 'open-quick-entry', onclick: () => openQuickEntry(ctx, preset) }, label);
}

function linesOf(doc) {
  const out = [];
  for (const c of doc.categories) {
    // The debt category is left out: its payments come from the debts (Accounts, Credit and debt), not from entries logged to a line here.
    if (c.state === 'archived' || c.id === 'debt') continue;
    for (const l of c.lines) if (l.state !== 'archived') out.push({ id: l.id, name: l.name, cat: c.name });
  }
  return out;
}

export function quickEntrySheet(ctx) {
  const q = ctx.ui.qe;
  if (!q || !ctx.doc) return null;
  const doc = ctx.doc;
  const all = linesOf(doc);
  const recent = recentLines(doc).map((id) => all.find((l) => l.id === id)).filter(Boolean);
  const ordered = [...recent, ...all.filter((l) => !recent.includes(l))];
  const close = () => { ctx.ui.qe = null; ctx.rerender(); };
  const chips = h('div', { class: 'qe-lines', role: 'listbox', 'aria-label': 'Line' });
  // The chips are redrawn in place rather than through a full rerender, so the search box keeps its focus
  // and caret while you type.
  const drawChips = () => {
    const term = q.search.trim().toLowerCase();
    const list = q.kind === 'income'
      ? doc.income.filter((i) => i.state !== 'archived').map((i) => ({ id: i.id, name: i.label, cat: 'Income' }))
      : ordered.filter((l) => !term || l.name.toLowerCase().includes(term) || l.cat.toLowerCase().includes(term)).slice(0, term ? 12 : 8);
    const picked = q.kind === 'income' ? q.incomeId : q.lineId;
    chips.replaceChildren(...list.map((l) => h('button', { class: 'tag-chip', role: 'option', 'aria-pressed': picked === l.id ? 'true' : 'false', 'data-key': 'qe-line:' + l.id, title: l.cat,
      onclick: () => { if (q.kind === 'income') q.incomeId = l.id; else q.lineId = l.id; drawChips(); } }, l.name)));
    if (!list.length) chips.append(h('span', { class: 'xs muted' }, 'No line by that name.'));
  };
  drawChips();
  const save = (again) => {
    const a = parseAmount(q.amount);
    if (a === null || a === undefined || a === 0) return ctx.toast('Type an amount');
    if (q.kind !== 'income' && !q.lineId) return ctx.toast('Pick a line');
    // The log's sign convention: spending is positive, a refund or income is negative; a typed minus sign is ignored.
    const amount = q.kind === 'spend' ? Math.abs(a) : -Math.abs(a);
    let saved;
    ctx.update('Quick entry', (d) => { saved = addEntry(d, { date: q.date, amount, kind: q.kind, lineId: q.kind === 'income' ? null : q.lineId, incomeId: q.kind === 'income' ? q.incomeId : null, merchant: q.merchant, note: q.note, account: q.account }); });
    if (!saved) return;
    const where = q.kind === 'income' ? 'income' : (all.find((l) => l.id === q.lineId) || {}).name;
    ctx.toast('Logged ' + money(Math.abs(amount), true) + (where ? ' to ' + where : ''));
    // "Save and add another" keeps the kind, date, and account; amount, line, merchant, and note start blank.
    if (again) openQuickEntry(ctx, { kind: q.kind, date: q.date, account: q.account });
    else close();
  };
  const kinds = [['spend', 'Spending'], ['refund', 'Refund'], ['income', 'Income']];
  return h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Quick entry' },
      h('div', { class: 'spread' }, h('h2', { style: 'margin:0' }, 'Quick entry'), h('button', { class: 'btn small ghost', 'aria-label': 'Close', onclick: close }, '×')),
      h('div', { class: 'toggle', role: 'group', 'aria-label': 'Kind' }, kinds.map(([k, label]) => h('button', { 'aria-pressed': q.kind === k ? 'true' : 'false', 'data-key': 'qe-kind:' + k,
        onclick: () => { q.kind = k; ctx.rerender(); } }, label))),
      h('input', { type: 'text', inputmode: 'decimal', class: 'amount big', placeholder: '$0.00', 'aria-label': 'Amount', 'data-key': 'qe-amount', value: q.amount,
        oninput: (e) => { q.amount = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') save(false); } }),
      q.kind === 'income' ? h('div', { class: 'xs muted' }, 'Which income? (optional)')
        : h('input', { type: 'search', placeholder: 'Find a line', 'aria-label': 'Find a line', 'data-key': 'qe-search', value: q.search,
          oninput: (e) => { q.search = e.target.value; drawChips(); } }),
      chips,
      h('div', { class: 'qe-row' },
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Date'), h('input', { type: 'date', 'data-key': 'qe-date', value: q.date, onchange: (e) => { q.date = e.target.value || todayIso(); } })),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Account'), h('select', { 'data-key': 'qe-account', onchange: (e) => { q.account = e.target.value || null; } },
          options([['', 'Not set'], ...doc.accounts.filter((a) => a.state !== 'archived').map((a) => [a.id, a.name])], q.account || '')))),
      h('div', { class: 'qe-row' },
        h('input', { type: 'text', placeholder: 'Merchant (optional)', 'aria-label': 'Merchant', 'data-key': 'qe-merchant', value: q.merchant, oninput: (e) => { q.merchant = e.target.value; } }),
        h('input', { type: 'text', placeholder: 'Note (optional)', 'aria-label': 'Note', 'data-key': 'qe-note', value: q.note, oninput: (e) => { q.note = e.target.value; } })),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', 'data-key': 'qe-save', onclick: () => save(false) }, 'Save'),
        h('button', { class: 'btn', 'data-key': 'qe-save-again', onclick: () => save(true) }, 'Save and add another'))));
}
