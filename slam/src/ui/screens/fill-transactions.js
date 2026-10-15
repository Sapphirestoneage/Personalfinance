// Fill in, pass 6 Transactions: import a bank or card CSV, review and fix the
// mapping (remembered per merchant), fill a month's actuals after the client
// confirms, and see what the transactions reveal. Lives inside Fill in so the
// app keeps four screens.

import { h, options } from '../dom.js';
import { money, monthLabel } from '../format.js';
import { importCSV, FORMATS } from '../../calc/tx-import.js';
import { actualsProposal } from '../../calc/tx-analysis.js';
import { addTransactions, setTransactionLine, setTransactionKind, removeTransaction, applyTransactionActuals } from '../../store/edits.js';

const KINDS = [['spend', 'Spending'], ['fee', 'Fee'], ['refund', 'Refund'], ['reimbursement', 'Reimbursement'], ['card-payment', 'Card payment'], ['transfer', 'Transfer'], ['income', 'Income']];

function lineOptions(doc) {
  const out = [['', 'Not mapped']];
  for (const c of doc.categories) {
    if (c.state === 'archived') continue;
    for (const l of c.lines) if (l.state !== 'archived') out.push([l.id, c.name + ' / ' + l.name]);
  }
  return out;
}

function importCard(ctx) {
  const ui = ctx.ui;
  ui.txImport = ui.txImport || { account: 'Checking', format: 'auto', flip: false, pending: null, error: null };
  const st = ui.txImport;
  const file = h('input', { type: 'file', accept: '.csv,text/csv', class: 'sr-only', id: 'tx-file', onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      st.pending = importCSV(await f.text(), { account: st.account, format: st.format, flip: st.flip, rulesData: ctx.refs.merchantRules, memory: ctx.doc.merchantMemory });
      const have = new Set(ctx.doc.transactions.map((t) => t.id));
      st.pending.fresh = st.pending.transactions.filter((t) => !have.has(t.id)).length;
      st.error = null;
    } catch (err) { st.error = err.message; st.pending = null; }
    ctx.rerender();
  } });
  const p = st.pending;
  return h('div', { class: 'card' },
    h('h2', {}, 'Import transactions'),
    h('p', { class: 'muted small' }, 'Download a CSV from the bank or card website. Supported: ' + Object.values(FORMATS).map((f) => f.label).join(', ') + '. Nothing is sent anywhere.'),
    h('div', { class: 'grid two' },
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Account name'), h('input', { type: 'text', value: st.account, 'data-key': 'tx-account', onchange: (e) => { st.account = e.target.value || 'Account'; } })),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Format'), h('select', { 'data-key': 'tx-format', onchange: (e) => { st.format = e.target.value; ctx.rerender(); } },
        options([['auto', 'Detect automatically'], ...Object.entries(FORMATS).map(([k, f]) => [k, f.label])], st.format)))),
    st.format === 'generic' || st.format === 'auto' ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.flip, 'data-key': 'tx-flip', onchange: (e) => { st.flip = e.target.checked; } }),
      'Generic files only: positive amounts are money out') : null,
    file, h('label', { for: 'tx-file', class: 'btn' }, 'Choose CSV file'),
    st.error ? h('p', { class: 'bad small' }, st.error) : null,
    p ? h('div', { class: 'card flag', style: 'margin-top:12px' },
      h('p', { class: 'small' }, 'Read as ' + p.formatLabel + ': ' + p.transactions.length + ' rows, ' + p.fresh + ' new' + (p.skippedRows.length ? ', ' + p.skippedRows.length + ' rows skipped (no date or amount)' : '') + '.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', disabled: !p.fresh, onclick: () => {
          let n = 0;
          ctx.update('Import ' + p.fresh + ' transactions', (d) => { n = addTransactions(d, p.transactions); });
          st.pending = null;
          ctx.toast(n + ' transactions added');
        } }, 'Add ' + p.fresh + ' transactions'),
        h('button', { class: 'btn', onclick: () => { st.pending = null; ctx.rerender(); } }, 'Cancel'))) : null);
}

function reviewCard(ctx, summary, month) {
  const doc = ctx.doc;
  const ui = ctx.ui;
  const lines = lineOptions(doc);
  const dupIds = new Set((summary.transactions ? summary.transactions.detections.duplicates : []).flatMap((x) => x.ids.slice(1)));
  const showAll = ui.txShowAll;
  const remember = ui.txRemember !== false;
  const inMonth = doc.transactions.filter((t) => t.date.startsWith(month));
  const needs = inMonth.filter((t) => !t.lineId && (t.kind === 'spend' || t.kind === 'fee' || t.kind === 'refund'));
  const list = (showAll ? inMonth : needs).slice(0, 300);
  return h('div', { class: 'card' },
    h('div', { class: 'spread' }, h('h2', { style: 'margin:0' }, 'Review'),
      h('div', { class: 'toggle' },
        h('button', { 'aria-pressed': !showAll ? 'true' : 'false', onclick: () => { ui.txShowAll = false; ctx.rerender(); } }, 'Needs a line (' + needs.length + ')'),
        h('button', { 'aria-pressed': showAll ? 'true' : 'false', onclick: () => { ui.txShowAll = true; ctx.rerender(); } }, 'All (' + inMonth.length + ')'))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: remember, 'data-key': 'tx-remember', onchange: (e) => { ui.txRemember = e.target.checked; } }), 'Remember my fixes for each merchant'),
    list.length ? h('ul', { class: 'plain' }, list.map((t) => h('li', {},
      h('div', { style: 'flex:1 1 220px;min-width:0' },
        h('div', {}, h('b', {}, t.description), dupIds.has(t.id) ? h('span', { class: 'chip st-dont-know', style: 'margin-left:6px' }, 'Likely duplicate') : null,
          t.bnpl ? h('span', { class: 'chip st-will-email', style: 'margin-left:6px' }, 'Buy now, pay later') : null),
        h('div', { class: 'xs muted' }, t.date + ', ' + t.account)),
      h('b', { class: 'num' }, money(t.amount, true)),
      h('select', { 'aria-label': 'Kind', 'data-key': 'tx-kind-' + t.id, onchange: (e) => ctx.update('Transaction kind', (d) => setTransactionKind(d, t.id, e.target.value)) }, options(KINDS, t.kind)),
      h('select', { 'aria-label': 'Budget line', 'data-key': 'tx-line-' + t.id, onchange: (e) => ctx.update('Map transaction', (d) => setTransactionLine(d, t.id, e.target.value, remember)) }, options(lines, t.lineId || '')),
      h('button', { class: 'btn small ghost danger', onclick: () => ctx.update('Remove transaction', (d) => removeTransaction(d, t.id)) }, 'Remove'))))
      : h('p', { class: 'muted small' }, showAll ? 'No transactions this month.' : 'Everything this month has a line.'));
}

function fillCard(ctx, summary, month) {
  const p = actualsProposal(summary.model, ctx.doc.transactions, month);
  const changing = p.rows.filter((r) => r.changes);
  return h('div', { class: 'card' },
    h('h2', {}, 'Fill ' + monthLabel(month) + ' actuals from transactions'),
    h('p', { class: 'muted small' }, 'Card payments, transfers, and income are left out. Refunds and Venmo or Zelle paybacks reduce the line they are mapped to. Check with the client before replacing what was typed.'),
    p.rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'budget' },
      h('thead', {}, h('tr', {}, ['Line', 'Typed', 'From bank', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, p.rows.map((r) => h('tr', {}, h('td', {}, r.category + ' / ' + r.name), h('td', { class: 'num' }, money(r.typed, true)),
        h('td', { class: 'num' }, money(r.fromTransactions, true) + ' (' + r.count + ')'), h('td', { class: 'small' }, r.changes ? 'will change' : 'same')))))) : h('p', { class: 'muted small' }, 'No mapped transactions this month.'),
    p.unmappedCount ? h('p', { class: 'small warn' }, p.unmappedCount + (p.unmappedCount === 1 ? ' purchase (' : ' purchases (') + money(p.unmapped, true) + (p.unmappedCount === 1 ? ') has' : ') have') + ' no line yet and ' + (p.unmappedCount === 1 ? 'is' : 'are') + ' not included.') : null,
    changing.length ? h('button', { class: 'btn primary', style: 'margin-top:8px', onclick: () => {
      if (!confirm('Replace ' + changing.length + ' actuals with the transaction totals? (Undo works.)')) return;
      ctx.update('Fill actuals from transactions', (d) => applyTransactionActuals(d, changing, monthLabel(month)));
      ctx.toast(changing.length + ' actuals updated');
    } }, 'Client confirmed: replace ' + changing.length + ' actuals') : null);
}

function findingsCard(summary) {
  const d = summary.transactions.detections;
  const li = (a, b) => h('li', { class: 'small' }, h('span', {}, a), h('b', { class: 'num' }, b));
  return h('div', { class: 'card' },
    h('h2', {}, 'What the transactions show'),
    h('ul', { class: 'plain' },
      li('Subscriptions (' + d.subscriptions.length + ')', money(d.subscriptionsYearly) + ' a year'),
      d.priceCreep.map((p) => li('Price went up: ' + p.merchant + ' ' + money(p.from, true) + ' to ' + money(p.to, true), '+' + money(p.yearly, true) + ' a year')),
      d.trials.map((t) => li('Free trial turned paid: ' + t.merchant + ' on ' + t.paidDate, money(t.amount, true) + ' a month')),
      d.duplicates.map((x) => li('Likely duplicate: ' + x.merchant + ' on ' + x.date, money(x.amount, true))),
      d.fees.length ? li('Fees (' + d.fees.length + ')', money(d.feesTotal, true)) : null,
      d.bnpl.length ? li('Buy now, pay later payments (' + d.bnpl.length + ')', money(d.bnplTotal, true)) : null));
}

export function renderTransactions(ctx, summary) {
  const tx = summary.transactions;
  const months = tx ? tx.months : [];
  const month = months.includes(ctx.ui.txMonth) ? ctx.ui.txMonth : months[months.length - 1];
  return h('div', {},
    importCard(ctx),
    tx ? h('div', { class: 'row', style: 'margin:12px 0' }, h('b', {}, 'Month'),
      h('select', { 'data-key': 'tx-month', onchange: (e) => { ctx.ui.txMonth = e.target.value; ctx.rerender(); } }, options(months.map((m) => [m, monthLabel(m)]), month))) : null,
    tx ? reviewCard(ctx, summary, month) : null,
    tx ? fillCard(ctx, summary, month) : null,
    tx ? findingsCard(summary) : h('p', { class: 'muted' }, 'No transactions yet. This pass is optional.'));
}
