// Track (S-106): weekly use only, no setup. In loop order: today's scheduled
// items to confirm, Quick entry, the log for this month, the cash calendar,
// then import a bank or card CSV (matched to what was logged), and a real
// balance check. Accounts, paydays, bill dates, and the cushion live in Setup;
// when one is missing, a one-line prompt links there.
// Line actuals come from the log on their own (S-087); there is no confirm step.

import { h, options } from '../dom.js';
import { waitingCard, checkBalancesCard } from '../components/cashflow.js';
import { cashflowCards } from '../charts/cash-charts.js';
import { emptyState } from '../components/jump.js';
import { money, monthLabel } from '../format.js';
import { importCSV, FORMATS } from '../../calc/tx-import.js';
import { setTransactionLine, setTransactionKind, removeTransaction } from '../../store/edits.js';
import { mergeImport, confirmMatch, rejectMatch, markNotDuplicate, editEntry } from '../../store/log.js';
import { parseAmount } from '../components/value-input.js';
import { matchImport, matchSummary, isPending, sourceOf } from '../../calc/log.js';
import { quickEntryButton } from '../components/quick-entry.js';
import { dayLabel } from '../format.js';

const SOURCE_LABELS = { manual: 'Logged', scheduled: 'Scheduled', import: 'Bank' };
const acctName = (doc, id) => (doc.accounts.find((a) => a.id === id) || { name: 'Unknown account' }).name;

// Imported entries that may be something already logged: same, or different?
function possibleCard(ctx) {
  const doc = ctx.doc;
  const waiting = doc.transactions.filter(isPending);
  if (!waiting.length) return null;
  const byId = Object.fromEntries(doc.transactions.map((t) => [t.id, t]));
  return h('div', { class: 'card flag', id: 'possible-matches' },
    h('h2', {}, 'Possible matches to confirm (' + waiting.length + ')'),
    h('p', { class: 'muted small' }, 'These bank entries look like something already logged, but not clearly. Until you answer, only the logged one counts.'),
    h('ul', { class: 'plain' }, waiting.map((t) => h('li', {},
      h('div', { style: 'flex:1 1 220px' }, h('b', {}, 'Bank: ' + t.description + ' ' + money(Math.abs(t.amount), true) + ', ' + dayLabel(t.date)),
        t.possible.map((id) => byId[id] ? h('div', { class: 'row small' }, 'Logged: ' + (byId[id].description || byId[id].note || 'entry') + ' ' + money(Math.abs(byId[id].amount), true) + ', ' + dayLabel(byId[id].date),
          h('button', { class: 'btn small', 'data-key': 'same-' + t.id + '-' + id, onclick: () => ctx.update('Same entry', (d) => confirmMatch(d, t.id, id)) }, 'Same, merge')) : null)),
      h('button', { class: 'btn small ghost', 'data-key': 'different-' + t.id, onclick: () => ctx.update('Different entries', (d) => rejectMatch(d, t.id)) }, 'Different')))));
}

// Owed back by someone, a one-off, or which purchase a reimbursement pays back (S-088).
function entryMore(ctx, t) {
  const key = 'more:' + t.id;
  const open = ctx.ui.expanded.has(key);
  const toggle = h('button', { class: 'btn small ghost', 'data-key': key, 'aria-expanded': open ? 'true' : 'false', onclick: () => { if (open) ctx.ui.expanded.delete(key); else ctx.ui.expanded.add(key); ctx.rerender(); } },
    (t.owed ? 'Owed ' + money(t.owed, true) + ', ' : '') + (t.oneOff ? 'One-off, ' : '') + (open ? 'Less' : 'More'));
  if (!open) return toggle;
  const purchases = ctx.doc.transactions.filter((x) => x.owed && x.id !== t.id);
  return h('div', { class: 'row small', style: 'flex-basis:100%' }, toggle,
    t.amount > 0 ? h('label', { class: 'row' }, 'Someone owes me back', h('input', { type: 'text', inputmode: 'decimal', class: 'amount', style: 'width:6em', 'data-key': 'owed:' + t.id, value: t.owed ? String(t.owed) : '',
      onchange: (e) => { const a = parseAmount(e.target.value); ctx.update('Owed back', (d) => editEntry(d, t.id, { owed: a || null })); } })) : null,
    t.amount > 0 ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!t.oneOff, 'data-key': 'oneoff:' + t.id, onchange: (e) => ctx.update('One-off', (d) => editEntry(d, t.id, { oneOff: e.target.checked })) }), 'One-off (kept out of the monthly budget)') : null,
    t.kind === 'reimbursement' ? h('label', { class: 'row' }, 'Pays back', h('select', { 'data-key': 'settles:' + t.id, onchange: (e) => ctx.update('Pays back', (d) => editEntry(d, t.id, { settles: e.target.value || null })) },
      options([['', 'Nothing in particular'], ...purchases.map((x) => [x.id, dayLabel(x.date) + ' ' + (x.description || x.note || 'purchase') + ', owed ' + money(x.owed, true)])], t.settles || ''))) : null);
}

const KINDS = [['spend', 'Spending'], ['fee', 'Fee'], ['refund', 'Refund'], ['reimbursement', 'Reimbursement'], ['card-payment', 'Card payment'], ['transfer', 'Transfer'], ['income', 'Income']];
const KIND_NAME = Object.fromEntries(KINDS);

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
  const live = ctx.doc.accounts.filter((a) => a.state !== 'archived');
  ui.txImport = ui.txImport || { account: (live.find((a) => a.type === 'checking') || live[0] || {}).id || '', format: 'auto', flip: false, pending: null, error: null };
  const st = ui.txImport;
  const file = h('input', { type: 'file', accept: '.csv,text/csv', class: 'sr-only', id: 'tx-file', onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      st.pending = importCSV(await f.text(), { account: st.account || null, format: st.format, flip: st.flip, rulesData: ctx.refs.merchantRules, memory: ctx.doc.merchantMemory });
      // Line the file up with what was already logged (calc decides; nothing is saved yet).
      st.pending.match = matchImport(ctx.doc.transactions, st.pending.transactions);
      st.error = null;
    } catch (err) { st.error = err.message; st.pending = null; }
    ctx.rerender();
  } });
  const p = st.pending;
  return h('div', { class: 'card', id: 'import-card' },
    h('h2', {}, 'Import transactions'),
    h('p', { class: 'muted small' }, 'Download a CSV from the bank or card website. Supported: ' + Object.values(FORMATS).map((f) => f.label).join(', ') + '. Nothing is sent anywhere.'),
    h('div', { class: 'grid two' },
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Which account is this file?'), h('select', { 'data-key': 'tx-account', onchange: (e) => { st.account = e.target.value; } },
        options([['', 'Not set'], ...live.map((a) => [a.id, a.name])], st.account))),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Format'), h('select', { 'data-key': 'tx-format', onchange: (e) => { st.format = e.target.value; ctx.rerender(); } },
        options([['auto', 'Detect automatically'], ...Object.entries(FORMATS).map(([k, f]) => [k, f.label])], st.format)))),
    st.format === 'generic' || st.format === 'auto' ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.flip, 'data-key': 'tx-flip', onchange: (e) => { st.flip = e.target.checked; } }),
      'Generic files only: positive amounts are money out') : null,
    file, h('label', { for: 'tx-file', class: 'btn' }, 'Choose CSV file'),
    st.error ? h('p', { class: 'bad small' }, st.error) : null,
    p ? h('div', { class: 'card flag', style: 'margin-top:12px' },
      h('p', { class: 'small' }, 'Read as ' + p.formatLabel + ': ' + p.transactions.length + ' rows' + (p.skippedRows.length ? ', ' + p.skippedRows.length + ' rows skipped (no date or amount)' : '') + '.'),
      h('p', { class: 'small', 'data-key': 'match-summary' }, h('b', {}, matchSummary(p.match)), ' Matches merge into one entry: the bank\'s date and merchant, your line and note. Possible matches wait for you to say same or different.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', 'data-key': 'tx-add', disabled: p.match.same === p.transactions.length, onclick: () => {
          ctx.update('Import ' + p.formatLabel, (d) => { mergeImport(d, p.match); });
          ctx.toast(matchSummary(p.match));
          st.pending = null;
        } }, 'Add to the log'),
        h('button', { class: 'btn', onclick: () => { st.pending = null; ctx.rerender(); } }, 'Cancel'))) : null);
}

function logCard(ctx, summary, month, months) {
  const doc = ctx.doc;
  const ui = ctx.ui;
  const lines = lineOptions(doc);
  const dups = summary.transactions ? summary.transactions.detections.duplicates : [];
  const dupIds = new Set(dups.flatMap((x) => x.ids.slice(1)));
  const dupPairs = Object.fromEntries(dups.map((x) => [x.ids[1], x.ids]));
  const showAll = ui.txShowAll !== false;
  const remember = ui.txRemember !== false;
  const inMonth = doc.transactions.filter((t) => t.date.startsWith(month));
  const needs = inMonth.filter((t) => !isPending(t) && !t.lineId && (t.kind === 'spend' || t.kind === 'fee' || t.kind === 'refund'));
  const list = (showAll ? inMonth : needs).slice(0, 300);
  const needIds = new Set(needs.map((t) => t.id));
  const needsLine = (t) => needIds.has(t.id);
  const editing = (t) => ctx.ui.expanded.has('entry:' + t.id);
  const toggleEdit = (t) => { if (editing(t)) ctx.ui.expanded.delete('entry:' + t.id); else ctx.ui.expanded.add('entry:' + t.id); ctx.rerender(); };
  const names = Object.fromEntries(lines);
  const lineName = (id) => (id ? (names[id] || '').split(' / ').pop() : '');
  return h('div', { class: 'card', id: 'log-card' },
    h('div', { class: 'spread' }, h('h2', { style: 'margin:0' }, 'The log'),
      h('select', { 'aria-label': 'Month', 'data-key': 'tx-month', onchange: (e) => { ctx.ui.txMonth = e.target.value; ctx.rerender(); } }, options(months.map((m) => [m, monthLabel(m)]), month))),
    h('p', { class: 'muted small' }, 'Everything logged this month: quick entries, confirmed bills and paychecks, and bank imports. Pick a line for anything that needs one.'),
    h('div', { class: 'spread' },
      h('div', { class: 'toggle' },
        h('button', { 'aria-pressed': !showAll ? 'true' : 'false', onclick: () => { ui.txShowAll = false; ctx.rerender(); } }, 'Needs a line (' + needs.length + ')'),
        h('button', { 'aria-pressed': showAll ? 'true' : 'false', onclick: () => { ui.txShowAll = true; ctx.rerender(); } }, 'All (' + inMonth.length + ')'))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: remember, 'data-key': 'tx-remember', onchange: (e) => { ui.txRemember = e.target.checked; } }), 'Remember my fixes for each merchant'),
    list.length ? h('ul', { class: 'plain' }, list.map((t) => h('li', {},
      h('div', { style: 'flex:1 1 220px;min-width:0' },
        h('div', {}, h('b', {}, t.description || '(no merchant)'), h('span', { class: 'src-chip' }, SOURCE_LABELS[sourceOf(t)] + (t.mergedFrom ? ', merged' : '')),
          isPending(t) ? h('span', { class: 'chip st-will-email', style: 'margin-left:6px' }, 'Possible match') : null,
          dupIds.has(t.id) ? h('span', { class: 'chip st-dont-know', style: 'margin-left:6px' }, 'Likely duplicate') : null,
          dupIds.has(t.id) ? h('button', { class: 'btn small ghost', 'data-key': 'not-dup-' + t.id, onclick: () => ctx.update('Both charges are real', (d) => markNotDuplicate(d, dupPairs[t.id])) }, 'Both are real') : null,
          t.bnpl ? h('span', { class: 'chip st-will-email', style: 'margin-left:6px' }, 'Buy now, pay later') : null),
        h('div', { class: 'xs muted' }, dayLabel(t.date) + (t.account ? ', ' + acctName(doc, t.account) : '') + (t.note ? ', ' + t.note : ''))),
      h('b', { class: 'num' }, money(t.amount, true)),
      // One line per entry (S-106): its line as text, and Edit for the kind, line, and the rest.
      // An entry that needs a line shows the line picker right away.
      editing(t) || needsLine(t) ? h('select', { 'aria-label': 'Budget line', 'data-key': 'tx-line-' + t.id, onchange: (e) => ctx.update('Map transaction', (d) => setTransactionLine(d, t.id, e.target.value, remember)) }, options(lines, t.lineId || ''))
        : h('span', { class: 'small muted' }, lineName(t.lineId) || KIND_NAME[t.kind] || ''),
      editing(t) ? h('select', { 'aria-label': 'Kind', 'data-key': 'tx-kind-' + t.id, onchange: (e) => ctx.update('Transaction kind', (d) => setTransactionKind(d, t.id, e.target.value)) }, options(KINDS, t.kind)) : null,
      editing(t) ? h('button', { class: 'btn small ghost danger', onclick: () => ctx.update('Remove transaction', (d) => removeTransaction(d, t.id)) }, 'Remove') : null,
      editing(t) ? entryMore(ctx, t) : null,
      h('button', { class: 'btn small ghost more-ctl', 'data-key': 'edit-entry:' + t.id, 'aria-expanded': editing(t) ? 'true' : 'false', onclick: () => toggleEdit(t) }, editing(t) ? 'Done' : 'Edit'))))
      : showAll ? h('div', { class: 'empty-state row' }, h('span', { class: 'small' }, 'Nothing logged this month yet. Log the first thing you spend.'), quickEntryButton(ctx, 'Log an entry'))
        : h('p', { class: 'muted small' }, 'Everything this month has a line.'));
}

// What is missing for the calendar, as one-line prompts that link to Setup.
function setupPrompts(ctx) {
  const doc = ctx.doc;
  const live = (xs) => xs.filter((x) => x.state !== 'archived');
  const out = [];
  if (!live(doc.accounts).length) out.push(emptyState(ctx, 'Add a checking account so the calendar knows where your cash is.', 'setup:accounts', 'Add an account', 'prompt-accounts'));
  const noPayday = live(doc.income).filter((i) => i.payFrequency !== 'semimonthly' && !i.nextPayDate.date);
  if (noPayday.length) out.push(emptyState(ctx, 'Add a payday so the calendar knows when money comes in.', 'setup:income', 'Add a payday', 'prompt-payday'));
  return out.length ? h('div', { class: 'card prompts' }, out) : null;
}

export function renderTrack(ctx, summary) {
  const tx = summary.transactions;
  const months = [...new Set([...(tx ? tx.months : []), ctx.doc.currentMonth])].sort();
  const month = months.includes(ctx.ui.txMonth) ? ctx.ui.txMonth : ctx.doc.currentMonth;
  return h('div', {},
    h('h1', {}, 'Track'),
    setupPrompts(ctx),
    waitingCard(ctx, summary),
    h('div', { class: 'card spread', id: 'quick-entry-card' }, h('span', {}, 'Spent something? Log it in a few taps.'), quickEntryButton(ctx)),
    logCard(ctx, summary, month, months),
    h('section', { id: 'calendar' }, h('h2', {}, 'Cash calendar'), h('div', { class: 'grid' }, cashflowCards(ctx, summary))),
    importCard(ctx),
    possibleCard(ctx),
    checkBalancesCard(ctx));
}
