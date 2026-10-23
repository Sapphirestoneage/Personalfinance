// The Spending page (S-206): safe to spend, the five-second logger, per-tag
// budgets with their pace, the burn tiers, where the money goes with the cut
// simulator, the bill autopsy, "can I spend this", price increases and free
// trials, the check-in (drift, momentum, staleness) and the month-end sweep.
// Every number comes from engine/spending.js, engine/cashsim.js and the
// summary; every number has Show the math. Formatting only.

import { summarize } from '../engine/summary.js';
import { cashsim, burnTiers } from '../engine/cashsim.js';
import { spendingView, cutSimulator, canISpend, checkInForecast, cleanMerchant, TAG_WORDS } from '../engine/spending.js';
import { estimatedVsActual } from '../engine/compare.js';
import { proposeCsv, proposeBudget, applyImport, budgetDocsFromStorage, FORMATS } from '../engine/feed.js';
import { logSpend, removeLog, checkIn, setSweep, parseInput, createHistory, commit, undo, canUndo, undoLabel } from '../engine/edits.js';
import { applyDefaults } from '../engine/defaults.js';
import { FAT } from '../engine/schema.js';
import { mathButton } from './math-panel.js';
import { loadAll, save, SOURCE_WORDS } from './household.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { pickedWindow, windowBar } from './window.js';
import { h, chip, money, shortDate, monthWords, ledgerHref } from './view.js';

const app = document.getElementById('app');
const VIZ = ['viz-1', 'viz-2', 'viz-3', 'viz-4', 'viz-5'];
const TAGS = [...FAT, 'other'];
const kindChip = (k) => chip(k === 'computed' ? 'known' : k);
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const pc = (f) => Math.round(f * 1000) / 10 + '%';

let hist, rules, source, lastSaved = null, merchantRules = { kindRules: {}, rules: [] };
let window_ = pickedWindow();
// What the page's forms hold between renders.
const form = { csv: '', csvFormat: 'auto', csvWith: 'cash', proposals: null, picks: null, importWords: '', amount: '', tag: 'other', paidWith: 'cash', merchant: '', expenseId: '', date: todayIso(), dropped: new Set(), towardDebt: false, askAmount: '', askWith: 'cash', checkDate: todayIso(), sweepOn: null, sweepTo: '', sweepKeep: '' };

function apply(next, label) {
  hist = commit(hist, applyDefaults(next, rules), label);
  source = 'saved';
  lastSaved = (save(hist.present) ? 'Saved in this browser: ' : 'Could not save in this browser (storage is blocked), so this lasts until the page closes: ') + label + '.';
  render();
}
function tryApply(fn, label) { try { apply(fn(hist.present), label); return true; } catch (err) { lastSaved = err.message; render(); return false; } }

// ---------------------------------------------------------------- pieces
function staleBanner(st) {
  return h('div', { class: 'stale-banner' + (st.stale ? '' : ' fresh'), role: st.stale ? 'alert' : 'status' },
    h('span', {}, h('strong', {}, st.stale ? 'Stale: ' : 'Fresh: '), st.words),
    h('a', { class: 'btn' + (st.stale ? ' primary' : ''), href: '#checkin' }, 'Check in'));
}

function safeCard(vw, ctx) {
  const s = vw.safe;
  return h('section', { class: 'card', 'aria-labelledby': 'safe-h' },
    h('h2', { id: 'safe-h' }, 'Safe to spend'),
    s.today === null ? h('p', { class: 'muted missing-row' }, 'Missing: a checking balance.') : [
      h('div', { class: 'safe-row' }, h('p', { class: 'safe-big' + (s.today < 0 ? ' low' : '') }, money(s.today)), h('span', { class: 'muted' }, s.daysUntil ? 'until the next paycheck on ' + shortDate(s.nextIncome) + ' (' + s.daysUntil + ' days): ' + money(s.perDay) + ' a day' : 'to the end of the window')),
      h('p', { class: 'tile-sub' }, kindChip(s.kind), ' Cash outside the cushion (' + money(s.cash) + '), less what is committed before then (' + money(s.committed) + '), less the floor on checking (' + money(s.floor) + ').' + (s.excludesCushion ? ' The cushion is not spending money.' : '')),
      mathButton(['spend:safeToday', ...(s.daysUntil ? ['spend:safePerDay'] : [])], ctx)]);
}

// The five-second logger: amount, a tag chip, paid with, a merchant (cleaned as you type), Add.
function loggerCard(vw, spine, ctx) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const amount = h('input', { id: 'log-amount', class: 'amount-box', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', 'aria-label': 'Amount' });
  amount.value = form.amount;
  const merchant = h('input', { id: 'log-merchant', type: 'text', autocomplete: 'off', placeholder: 'Where (optional)' });
  merchant.value = form.merchant;
  const hint = h('p', { class: 'merchant-hint' }, form.merchant && cleanMerchant(form.merchant) && cleanMerchant(form.merchant) !== form.merchant.trim() ? 'Reads as ' + cleanMerchant(form.merchant) : '');
  merchant.addEventListener('input', () => { form.merchant = merchant.value; const c = cleanMerchant(merchant.value); hint.textContent = c && c !== merchant.value.trim() ? 'Reads as ' + c : ''; });
  const paid = h('select', { id: 'log-paid', 'aria-label': 'Paid with' }, h('option', { value: 'cash' }, 'Cash or debit'), ...(spine.debts || []).filter((d) => d.type === 'credit_card').map((d) => h('option', { value: d.id }, d.name && d.name.value ? d.name.value : d.id)));
  paid.value = form.paidWith;
  const line = h('select', { id: 'log-line', 'aria-label': 'A line it belongs to' }, h('option', { value: '' }, 'Just the tag'), ...(spine.expenses || []).map((e) => h('option', { value: e.id }, e.label)));
  line.value = form.expenseId;
  const date = h('input', { id: 'log-date', type: 'date', 'aria-label': 'Day' }); date.value = form.date;
  const chips = h('div', { class: 'tag-chips', role: 'group', 'aria-label': 'Tag' }, TAGS.map((t) => h('button', { type: 'button', class: 'tag-chip', 'aria-pressed': String(form.tag === t), onclick: () => { form.tag = t; for (const b of chips.children) b.setAttribute('aria-pressed', String(b.textContent === TAG_WORDS[t])); } }, TAG_WORDS[t])));
  const submit = (kind) => {
    const p = parseInput('money', amount.value);
    if (!p.ok) { msg.textContent = p.message; amount.focus(); return; }
    form.amount = ''; form.merchant = ''; form.paidWith = paid.value; form.expenseId = line.value; form.date = date.value || todayIso();
    const exp = line.value ? spine.expenses.find((e) => e.id === line.value) : null;
    tryApply((s) => logSpend(s, { amount: p.value, date: form.date, kind, tag: exp ? exp.fat || 'other' : form.tag, expenseId: line.value || null, merchant: cleanMerchant(merchant.value), note: merchant.value.trim() && cleanMerchant(merchant.value) !== merchant.value.trim() ? merchant.value.trim() : null, paidWith: paid.value }).spine, (kind === 'refund' ? 'Refund ' : 'Spent ') + money(p.value, !Number.isInteger(p.value)) + (exp ? ' on ' + exp.label : ' on ' + TAG_WORDS[form.tag].toLowerCase()));
  };
  const entries = vw.log;
  return h('section', { class: 'card', id: 'log', 'aria-labelledby': 'log-h' },
    h('h2', { id: 'log-h' }, 'Log a spend ', h('span', { class: 'count' }, String(entries.length) + ' this month')),
    h('form', { class: 'logger', novalidate: true, onsubmit: (e) => { e.preventDefault(); submit('spend'); } },
      h('label', { for: 'log-amount', class: 'edit-label' }, 'How much'), amount,
      chips,
      h('label', { for: 'log-line', class: 'edit-label' }, 'A line it belongs to (optional)'), line,
      h('label', { for: 'log-paid', class: 'edit-label' }, 'Paid with'), paid,
      h('label', { for: 'log-merchant', class: 'edit-label' }, 'Where'), merchant, hint,
      h('label', { for: 'log-date', class: 'edit-label' }, 'Day'), date,
      msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add it'), h('button', { type: 'button', class: 'btn', onclick: () => submit('refund') }, 'It was a refund'))),
    entries.length ? h('ul', { class: 'log-list', 'aria-label': 'This month\'s log' }, entries.map((e) => h('li', {},
      h('span', {}, shortDate(e.date)), h('span', {}, h('strong', {}, e.merchant || (e.kind === 'refund' ? 'Refund' : e.kind === 'income' ? 'Income' : 'Spend')), e.expenseId ? ' (' + ((spine.expenses.find((x) => x.id === e.expenseId) || {}).label || e.expenseId) + ')' : e.tag ? ' (' + TAG_WORDS[e.tag].toLowerCase() + ')' : ''), e.paidWith && e.paidWith !== 'cash' ? h('span', { class: 'pill' }, ((spine.debts || []).find((d) => d.id === e.paidWith) || {}).name?.value || e.paidWith) : null, e.source === 'import' ? h('span', { class: 'pill' }, 'imported') : null,
      h('span', { class: 'log-amt' }, (e.kind === 'refund' ? '+' : e.kind === 'income' ? '+' : '-') + money(e.amount, !Number.isInteger(e.amount))),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => tryApply((s) => removeLog(s, e.id), 'Removed ' + money(e.amount, !Number.isInteger(e.amount)) + ' on ' + shortDate(e.date)) }, 'Remove')))) : h('p', { class: 'muted' }, 'Nothing logged this month. Logged spends count against the tag budgets and feed estimated vs actual.'));
}

// One tag's bar: spent against the budget, with a mark where the budget expects you to be today.
function budgetCell(r) {
  if (r.budget === null) return h('span', { class: 'missing-row' }, 'Missing: a line\'s amount');
  const spentShare = r.budget ? Math.min(1, r.spent / r.budget) : 0;
  const markShare = r.expected !== null && r.budget ? Math.min(1, r.expected / r.budget) : null;
  const bar = h('div', { class: 'budget-bar', role: 'img', 'aria-label': money(r.spent) + ' of ' + money(r.budget) }, h('div', { class: 'fill' + (r.hot ? ' hot' : ''), style: 'width:' + pc(spentShare) }));
  if (markShare !== null) bar.append(h('span', { class: 'mark', style: 'left:' + pc(markShare) }));
  return [bar, h('span', { class: 'muted' }, money(r.spent) + ' of ' + money(r.budget))];
}

function tagsCard(vw, ctx) {
  const t = vw.tags;
  return h('section', { class: 'card', 'aria-labelledby': 'tags-h' },
    h('h2', { id: 'tags-h' }, 'Budgets by tag, ' + monthWords(t.ym)),
    h('p', { class: 'muted' }, t.day ? 'Day ' + t.day + ' of ' + t.daysInMonth + '. The bar is what is spent against the budget; the mark is where the budget expects you to be today. Running hot means past that mark by ' + Math.round((t.hotMultiple - 1) * 100) + '% or more.' : 'A past month: spent against the budget.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Tag'), h('th', {}, 'Spent of budget'), h('th', { class: 'num' }, 'Left'), h('th', { class: 'num' }, 'At this pace'), h('th', { class: 'num' }, 'Last month, same day'))),
      h('tbody', {}, t.rows.map((r) => h('tr', { class: r.hot ? 'tight' : '' },
        h('td', {}, r.label, ' ', r.hot ? h('span', { class: 'hot-chip' }, 'running hot') : r.over ? h('span', { class: 'hot-chip' }, 'over') : r.budget !== null && r.budget > 0 ? h('span', { class: 'hot-chip fine' }, 'on track') : null),
        h('td', {}, budgetCell(r)),
        h('td', { class: 'num' }, r.left === null ? 'missing' : money(r.left)),
        h('td', { class: 'num' }, r.pace === null ? '' : money(r.pace)),
        h('td', { class: 'num' }, money(r.lastMonthSameDay))))))),
    h('p', { class: 'tile-note' }, kindChip(t.kind), ' Budgets are the spine\'s lines a month by tag; spent is the log. A missing line amount makes the tag\'s budget a missing row, not a smaller number.'),
    mathButton(t.rows.flatMap((r) => ['spend:tagBudget:' + r.tag, 'spend:tagSpent:' + r.tag, ...(r.pace !== null ? ['spend:pace:' + r.tag] : [])]), ctx));
}

function tiersCard(tiers, ctx) {
  return h('section', { class: 'card', 'aria-labelledby': 'tiers-h' },
    h('h2', { id: 'tiers-h' }, 'Burn, in four tiers'),
    h('ol', { class: 'tiers' }, tiers.tiers.map((x) => h('li', {}, h('span', {}, x.label), h('span', { class: 'tier-amt' }, money(x.amount)), h('span', { class: 'tier-cum' }, 'so far ' + money(x.cumulative))))),
    h('p', { class: 'tile-sub' }, kindChip(tiers.kind), ' ', tiers.takeHome.value === null ? h('span', { class: 'missing-row' }, 'Missing: take-home pay') : 'Take-home ' + money(tiers.takeHome.value) + ' a month; ' + (tiers.unallocated.value === null ? 'unallocated unknown' : tiers.unallocated.value >= 0 ? money(tiers.unallocated.value) + ' not yet allocated' : money(-tiers.unallocated.value) + ' short of take-home') + '.'),
    h('details', { class: 'later-list' }, h('summary', {}, 'What the tiers mean'), h('ul', {}, h('li', {}, 'Core burn: food, housing and transportation. What it costs to be alive and get to work.'), h('li', {}, 'Everything else: every other line that is not debt.'), h('li', {}, 'Minimums: what every debt demands a month.'), h('li', {}, 'Extra, saving and the set-aside: what goes beyond the minimums, into saving, and aside for tax that nothing withholds.'), h('li', {}, 'The four add up to what leaves; what is left of take-home is unallocated. Card spending counts in its own tier; the card\'s settling payment is not a tier of its own.'))),
    mathButton(tiers.tiers.map((x) => 'spend:tier:' + x.id), ctx));
}

function donutCard(vw, spine, rerender, ctx) {
  const d = vw.donut;
  if (!d.slices.length) return null;
  let acc = 0;
  const stops = d.slices.map((x, i) => { const from = acc; acc += (x.share || 0) * 100; return 'var(--' + VIZ[i % VIZ.length] + ') ' + from + '% ' + Math.min(100, acc) + '%'; });
  const ring = h('div', { class: 'donut', role: 'img', 'aria-label': 'Where the money goes: ' + d.slices.map((x) => x.label + ' ' + money(x.amount)).join(', '), style: 'background: conic-gradient(' + stops.join(', ') + ')' });
  const cut = cutSimulator(spine, rules, ctx().s, { dropped: [...form.dropped], towardDebt: form.towardDebt });
  const cutCtx = () => ({ ...ctx(), cut });
  return h('section', { class: 'card', 'aria-labelledby': 'donut-h' },
    h('h2', { id: 'donut-h' }, 'Where the money goes'),
    h('div', { class: 'donut-wrap' }, ring, h('ul', { class: 'donut-list', 'aria-label': 'The slices' }, d.slices.map((x, i) => h('li', {}, h('span', { class: 'sw ' + VIZ[i % VIZ.length], 'aria-hidden': 'true' }), x.label, h('span', { class: 'd-amt' }, money(x.amount) + (x.share !== null ? ' (' + Math.round(x.share * 100) + '%)' : '')))))),
    h('p', { class: 'tile-sub' }, kindChip(d.kind), ' ', d.total === null ? h('span', { class: 'missing-row' }, 'Missing: take-home pay; shares are of what is planned.') : 'Of ' + money(d.total) + ' take-home a month.' + (d.short ? ' ' + money(d.short) + ' more leaves than comes in.' : '')),
    h('details', { class: 'flow-list', open: form.dropped.size > 0 }, h('summary', {}, 'The lines: tap one to drop it and see what that saves'),
      h('p', { class: 'muted' }, 'A dropped line is a what-if on this page only; the Ledger is untouched.'),
      ...d.slices.filter((x) => x.items.length).map((x) => [h('h3', { class: 'month-h' }, x.label), ...x.items.map((i) => h('div', { class: 'cut-row' + (form.dropped.has(i.id) ? ' dropped' : '') }, h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(form.dropped.has(i.id)), onclick: () => { if (form.dropped.has(i.id)) form.dropped.delete(i.id); else form.dropped.add(i.id); rerender(); } }, form.dropped.has(i.id) ? 'Put back' : 'Drop'), h('span', { class: 'cut-name' }, h('a', { href: ledgerHref(i.path) }, i.label)), h('span', { class: 'cut-amt' }, money(i.amount) + ' a month')))]),
      h('label', { class: 'check-row', for: 'cut-debt' }, h('input', { type: 'checkbox', id: 'cut-debt', checked: form.towardDebt, onchange: (e) => { form.towardDebt = e.target.checked; rerender(); } }), h('span', {}, h('strong', {}, 'Put what I save toward the debt'), h('span', { class: 'choice-sub' }, 'the saving joins the extra at the debt on the monthly plan'))),
      form.dropped.size ? [h('div', { class: 'tool-result' }, h('strong', {}, money(cut.saved) + ' a month saved'), ' by dropping ' + cut.dropped.map((i) => i.label).join(', ') + '. Surplus ' + (cut.surplusBefore === null ? 'unknown' : money(cut.surplusBefore) + ' to ' + money(cut.surplusAfter)) + '.', cut.debt ? (cut.debt.neverAfter ? ' Even so the monthly plan never pays everything off.' : ' Debt free ' + (cut.debt.debtFreeAfter ? monthWords(cut.debt.debtFreeAfter) : 'never') + ' instead of ' + (cut.debt.debtFreeBefore ? monthWords(cut.debt.debtFreeBefore) : 'never') + (cut.debt.monthsSooner ? ', ' + cut.debt.monthsSooner + ' months sooner' : '') + (cut.debt.interestSaved !== null ? ', ' + money(cut.debt.interestSaved) + ' less interest.' : '.')) : ''),
        mathButton(['spend:cut', ...(cut.debt && cut.debt.interestSaved !== null ? ['spend:cutDebt'] : [])], cutCtx)] : null));
}

function autopsyCard(vw, ctx) {
  const a = vw.autopsy;
  return h('section', { class: 'card', 'aria-labelledby': 'autopsy-h' },
    h('h2', { id: 'autopsy-h' }, 'Bill autopsy ', h('span', { class: 'count' }, money(a.yearlyTotal) + ' a year')),
    h('p', { class: 'muted' }, 'Every recurring item ranked by what it costs a year. A subscription not reviewed in a year is stale: open it in the Ledger and set the day you looked.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', { class: 'num' }, 'A month'), h('th', { class: 'num' }, 'A year'), h('th', {}, 'Reviewed'))),
      h('tbody', {}, a.rows.map((r) => h('tr', { class: r.stale && r.subscription ? 'tight' : '' }, h('td', {}, h('a', { href: ledgerHref(r.path) }, r.label), r.subscription ? [' ', h('span', { class: 'pill pill-sub' }, 'sub')] : null, r.need === false ? [' ', h('span', { class: 'pill' }, 'want')] : null), h('td', { class: 'num' }, money(r.monthly)), h('td', { class: 'num' }, money(r.yearly)), h('td', {}, r.reviewed ? shortDate(r.reviewed) : r.subscription ? h('span', { class: 'missing-row' }, 'never') : '')))))),
    mathButton(a.rows.slice(0, 5).map((r) => 'spend:autopsy:' + r.id), ctx, 0, 'Show the math for the top five'));
}

function askCard(c, spine, rerender, ctx) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const amount = h('input', { id: 'ask-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off' }); amount.value = form.askAmount;
  const paid = h('select', { id: 'ask-paid' }, h('option', { value: 'cash' }, 'Cash or debit'), ...(spine.debts || []).filter((d) => d.type === 'credit_card').map((d) => h('option', { value: d.id }, d.name && d.name.value ? d.name.value : d.id)));
  paid.value = form.askWith;
  const parsed = form.askAmount.trim() === '' ? null : parseInput('money', form.askAmount);
  const ask = parsed && parsed.ok ? canISpend(spine, rules, c.sim, { amount: parsed.value, paidWith: form.askWith }) : null;
  return h('section', { class: 'card', 'aria-labelledby': 'ask-h' },
    h('h2', { id: 'ask-h' }, 'Can I spend this?'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const p = parseInput('money', amount.value); if (!p.ok) { msg.textContent = p.message; return; } form.askAmount = amount.value; form.askWith = paid.value; rerender(); } },
      h('label', { for: 'ask-amount', class: 'edit-label' }, 'How much, today'), amount,
      h('label', { for: 'ask-paid', class: 'edit-label' }, 'Paid with'), paid, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Tell me'))),
    ask && ask.verdict ? [
      h('p', {}, h('span', { class: 'verdict ' + ask.verdict }, ask.verdict === 'yes' ? 'Yes' : ask.verdict === 'tight' ? 'Tight' : 'No')),
      h('ul', {}, h('li', {}, 'Safe to spend goes from ' + money(ask.safeBefore) + ' to ' + money(ask.safeAfter) + '.'), h('li', {}, 'The low point goes from ' + money(ask.lowBefore.amount) + ' on ' + shortDate(ask.lowBefore.date) + ' to ' + money(ask.lowAfter.amount) + ' on ' + shortDate(ask.lowAfter.date) + (ask.shortfalls ? ', with ' + ask.shortfalls + ' payment' + (ask.shortfalls === 1 ? '' : 's') + ' held back by the floor' : '') + '.'), ask.interest ? h('li', {}, money(ask.interest) + ' of interest ' + ask.interestNote + '.') : ask.interestNote ? h('li', {}, ask.interestNote + '.') : null, h('li', {}, ask.hours === null ? h('span', { class: 'missing-row' }, 'Hours of life: missing hours worked a week (enter it in the Ledger under Filing).') : 'Hours of life: ' + ask.hours + ' at ' + money(ask.hourlyWage) + ' of take-home an hour.'), ask.delayDays !== null ? h('li', {}, 'It delays what the surplus buys by about ' + ask.delayDays + ' days.') : h('li', {}, 'No surplus to delay: this comes out of the cushion or onto a card.')),
      h('p', { class: 'tile-note' }, kindChip(ask.kind), ' The same day-by-day run with the purchase added today.'),
      mathButton(['spend:ask'], () => ({ ...ctx(), ask }))] : null);
}

function pricesCard(vw, ctx) {
  const p = vw.prices, f = vw.trials;
  if (!p.rows.length && !f.rows.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'prices-h' },
    h('h2', { id: 'prices-h' }, 'Price increases and free trials'),
    p.rows.length ? h('ul', { class: 'flow-list' }, p.rows.map((r) => h('li', {}, h('a', { href: ledgerHref(r.path) }, r.label), ': the last charge (' + money(r.logged) + ' on ' + shortDate(r.date) + ') is ' + Math.round(r.change * 100) + '% over the planned ' + money(r.planned) + '. Update the line, or cancel it.'))) : null,
    f.rows.length ? h('ul', { class: 'flow-list' }, f.rows.map((r) => h('li', {}, h('a', { href: ledgerHref(r.path) }, r.label), r.converted ? ': the free trial ended ' + shortDate(r.trialEnds) + '; it now charges ' + (r.converts === null ? 'an amount not entered' : money(r.converts)) + '.' : ': free trial ends ' + shortDate(r.trialEnds) + ' (' + r.daysLeft + ' days)' + (r.soon ? ', then ' + (r.converts === null ? 'it charges an amount not entered' : money(r.converts)) + '. Cancel it before then, or keep it on purpose.' : '.')))) : null,
    p.rows.length ? mathButton(p.rows.map((r) => 'spend:priceChange:' + r.id), ctx) : null);
}

function checkinCard(c, spine, vw, ctx) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const date = h('input', { id: 'ci-date', type: 'date' }); date.value = form.checkDate;
  const f = checkInForecast(spine, c.sim, form.checkDate >= c.sim.start ? form.checkDate : c.sim.start);
  const boxes = f.accounts.map((a) => ({ a, input: h('input', { id: 'ci-' + a.id, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: f.forecast[a.id] === null ? '' : String(f.forecast[a.id]) }) }));
  const dr = vw.drift, mo = vw.momentum;
  return h('section', { class: 'card', id: 'checkin', 'aria-labelledby': 'ci-h' },
    h('h2', { id: 'ci-h' }, 'Check in: real balances'),
    h('p', { class: 'muted' }, 'Type what each account really holds. The forecast for that day is the hint in the box. Saving re-anchors the household to that day and records the miss.'),
    h('form', { class: 'checkin-grid', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const balances = {}, forecast = {};
      for (const { a, input } of boxes) { if (input.value.trim() === '') continue; const p = parseInput('money', input.value); if (!p.ok) { msg.textContent = a.name + ': ' + p.message; input.focus(); return; } balances[a.id] = p.value; forecast[a.id] = f.forecast[a.id]; }
      if (!Object.keys(balances).length) { msg.textContent = 'Type at least one balance'; return; }
      form.checkDate = date.value || todayIso();
      tryApply((s) => checkIn(s, { date: form.checkDate, balances, forecast }), 'Checked in on ' + shortDate(form.checkDate));
    } },
      h('label', { for: 'ci-date', class: 'edit-label' }, 'On'), date,
      ...boxes.flatMap(({ a, input }) => [h('label', { for: 'ci-' + a.id, class: 'edit-label' }, a.name + (a.cushion ? ' (cushion)' : '') + ', forecast ' + (f.forecast[a.id] === null ? 'unknown' : money(f.forecast[a.id])) + ', now ' + (a.now === null ? 'missing' : money(a.now))), input]),
      msg, h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save the check-in'))),
    h('h3', { class: 'month-h' }, 'Drift'), h('p', { class: 'tile-sub' }, dr.words),
    h('h3', { class: 'month-h' }, 'Momentum'), h('p', { class: 'tile-sub' }, mo.words),
    mathButton([...(dr.count ? ['spend:drift'] : []), ...(mo.perMonth !== null ? ['spend:momentum'] : [])].length ? [...(dr.count ? ['spend:drift'] : []), ...(mo.perMonth !== null ? ['spend:momentum'] : [])] : [], ctx));
}

function sweepCard(c, spine, vw, ctx) {
  const sw = vw.sweep;
  const cal = (spine.calendar || {}).sweep || {};
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const on = h('input', { type: 'checkbox', id: 'sweep-on', checked: cal.on === true });
  const to = h('select', { id: 'sweep-to' }, h('option', { value: '' }, 'Pick an account'), ...c.sim.model.accounts.filter((a) => !a.primary).map((a) => h('option', { value: a.id }, a.name)));
  to.value = cal.to || '';
  const keep = h('input', { id: 'sweep-keep', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0' }); keep.value = cal.keep !== undefined ? String(cal.keep) : '';
  return h('section', { class: 'card', 'aria-labelledby': 'sweep-h' },
    h('h2', { id: 'sweep-h' }, 'Month-end sweep'),
    h('p', { class: 'muted' }, 'At each month end, what checking holds above the floor and a keep amount moves to the account picked. A hard reset: the month starts from the floor plus the keep.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const k = keep.value.trim() === '' ? { ok: true, value: 0 } : parseInput('money', keep.value); if (!k.ok) { msg.textContent = 'Keep: ' + k.message; return; } if (on.checked && !to.value) { msg.textContent = 'Pick the account it sweeps to'; return; } tryApply((s) => setSweep(s, { on: on.checked, to: to.value || null, keep: k.value }), on.checked ? 'Sweep on, to ' + (to.options[to.selectedIndex] || {}).text : 'Sweep off'); } },
      h('label', { class: 'check-row', for: 'sweep-on' }, on, h('span', {}, h('strong', {}, 'Sweep at month end'))),
      h('label', { for: 'sweep-to', class: 'edit-label' }, 'To'), to,
      h('label', { for: 'sweep-keep', class: 'edit-label' }, 'Keep above the floor'), keep, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save'))),
    sw.on ? [h('p', { class: 'tile-sub' }, sw.moves.length ? 'Inside the window: ' + sw.moves.map((m) => money(m.amount) + ' on ' + shortDate(m.date) + (m.toName ? ' to ' + m.toName : '')).join('; ') + ' (' + money(sw.total) + ' in all).' : 'Nothing above the floor and the keep at a month end inside the window.'), mathButton(['spend:sweep'], ctx)] : h('p', { class: 'muted' }, 'Off.'));
}

// Estimated vs actual (S-207): the plan month by month against the log, over the selector's window.
function compareCard(spine, ctx) {
  const c = estimatedVsActual(spine, rules, { months: window_ });
  const cctx = () => ({ ...ctx(), compare: c });
  const win = monthWords(c.from) + (c.from === c.to ? '' : ' to ' + monthWords(c.to));
  const diffWords = (d) => (d === null ? 'missing' : d > 0 ? '+' + money(d) + ' over' : d < 0 ? money(-d) + ' under' : 'on the plan');
  return h('section', { class: 'card', 'aria-labelledby': 'cmp-h' },
    h('h2', { id: 'cmp-h' }, 'Estimated vs actual, ' + win),
    c.monthsSilent.length ? h('p', { class: 'muted' }, 'Nothing logged in ' + c.monthsSilent.map(monthWords).join(', ') + ': ' + (c.monthsSilent.length === c.months.length ? 'the window is empty so far.' : 'those months read as nothing spent, not as zero.')) : null,
    h('p', { class: 'tile-sub' }, kindChip(c.kind), ' Spending: logged ' + money(c.spend.actual) + ' against ' + (c.spend.planned === null ? 'a plan with a missing line' : money(c.spend.planned) + ' planned') + ' (' + diffWords(c.spend.diff) + '). Income: ' + (c.income.actual === null ? 'nothing logged' : money(c.income.actual) + ' logged against ' + (c.income.planned === null ? 'a plan with a missing stream' : money(c.income.planned) + ' planned')) + '. ' + (c.savingsRate.real !== null ? 'Savings rate from the real ledger ' + Math.round(c.savingsRate.real * 1000) / 10 + '%' + (c.savingsRate.plan !== null ? ' against ' + Math.round(c.savingsRate.plan * 1000) / 10 + '% planned' : '') + '.' : c.savingsRate.note)),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Tag'), h('th', { class: 'num' }, 'Planned'), h('th', { class: 'num' }, 'Logged'), h('th', { class: 'num' }, 'Difference'))),
      h('tbody', {}, c.tags.map((r) => h('tr', { class: r.diff !== null && r.diff > 0 ? 'tight' : '' }, h('td', {}, r.label, r.unassigned ? h('span', { class: 'choice-sub' }, ' (' + money(r.unassigned) + ' not on a line)') : null), h('td', { class: 'num' }, r.missing ? 'missing' : money(r.planned)), h('td', { class: 'num' }, money(r.actual)), h('td', { class: 'num' }, diffWords(r.diff))))))),
    h('details', { class: 'flow-list' }, h('summary', {}, 'Every line (' + c.lines.length + ')'),
      h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Line'), h('th', { class: 'num' }, 'Planned'), h('th', { class: 'num' }, 'Logged'), h('th', { class: 'num' }, 'Difference'))),
        h('tbody', {}, c.lines.map((r) => h('tr', {}, h('td', {}, h('a', { href: ledgerHref(r.path) }, r.label), ' ', h('span', { class: 'choice-sub' }, r.entries + (r.entries === 1 ? ' entry' : ' entries'))), h('td', { class: 'num' }, r.missing ? 'missing' : money(r.planned)), h('td', { class: 'num' }, money(r.actual)), h('td', { class: 'num' }, diffWords(r.diff)))))))),
    mathButton(['compare:spend', 'compare:income', 'compare:savingsReal', ...c.tags.map((r) => 'compare:tag:' + r.tag)], cctx));
}

// The feed (S-207): a statement pasted in, or the old Budget's households saved in this browser; nothing lands until Apply.
function importCard(spine, merchantRules) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const text = h('textarea', { id: 'csv-text', rows: 5, placeholder: 'Paste the CSV from your bank or card here (Chase, Amex, Capital One, or date, description, amount)', 'aria-label': 'Statement CSV' });
  text.value = form.csv;
  const fmt = h('select', { id: 'csv-format' }, h('option', { value: 'auto' }, 'Tell the format from the headers'), ...Object.entries(FORMATS).map(([k, f]) => h('option', { value: k }, f.label)));
  fmt.value = form.csvFormat;
  const paid = h('select', { id: 'csv-with' }, h('option', { value: 'cash' }, 'Checking or debit'), ...(spine.debts || []).filter((d) => d.type === 'credit_card').map((d) => h('option', { value: d.id }, d.name && d.name.value ? d.name.value : d.id)));
  paid.value = form.csvWith;
  let docs = [];
  try { docs = budgetDocsFromStorage((k) => localStorage.getItem(k), Object.keys(localStorage)); } catch { docs = []; }
  const p = form.proposals;
  const picks = form.picks;
  return h('section', { class: 'card', id: 'import', 'aria-labelledby': 'imp-h' },
    h('h2', { id: 'imp-h' }, 'Feed the log'),
    h('p', { class: 'muted' }, 'Real dates and amounts come in from a statement or from the Budget app\'s log. Each line is matched to the plan (within 2% and 5 days), called recurring (a merchant seen three times), or new; card payments and transfers are not spending. Nothing lands until you apply, and nothing lands twice.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); form.csv = text.value; form.csvFormat = fmt.value; form.csvWith = paid.value; try { form.proposals = proposeCsv(spine, rules, text.value, { format: fmt.value, paidWith: paid.value, merchantRules }); form.picks = null; form.importWords = ''; } catch (err) { msg.textContent = err.message; return; } render(); } },
      h('label', { for: 'csv-text', class: 'edit-label' }, 'A statement'), text,
      h('label', { for: 'csv-format', class: 'edit-label' }, 'Format'), fmt,
      h('label', { for: 'csv-with', class: 'edit-label' }, 'This statement is for'), paid, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Read the statement'), ...docs.map((d) => h('button', { type: 'button', class: 'btn', onclick: () => { form.proposals = proposeBudget(spine, rules, d.doc, { merchantRules }); form.picks = null; form.importWords = ''; render(); } }, 'Read the Budget app: ' + d.name + ' (' + d.transactions + ')')))),
    form.importWords ? h('p', { class: 'tool-result' }, form.importWords) : null,
    p ? [h('p', { class: 'tile-sub' }, (p.label ? p.label + ': ' : '') + p.words + (p.skippedRows && p.skippedRows.length ? ' Rows skipped (no date, amount or words): ' + p.skippedRows.join(', ') + '.' : '')),
      h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Take'), h('th', {}, 'Day'), h('th', {}, 'Where'), h('th', { class: 'num' }, 'Amount'), h('th', {}, 'Line'), h('th', {}, 'Status'))),
        h('tbody', {}, p.proposals.map((x) => { const on = picks ? picks.includes(x.key) : x.include; return h('tr', { class: x.status === 'matched' ? '' : x.status === 'new' ? 'tight' : '' }, h('td', {}, h('input', { type: 'checkbox', 'aria-label': 'Take ' + (x.merchant || x.description), checked: on, disabled: x.status === 'skip' || x.status === 'same', onchange: (e) => { const set = new Set(picks || p.proposals.filter((y) => y.include).map((y) => y.key)); if (e.target.checked) set.add(x.key); else set.delete(x.key); form.picks = [...set]; } })), h('td', {}, shortDate(x.date)), h('td', {}, x.merchant || x.description), h('td', { class: 'num' }, (x.kind === 'income' || x.kind === 'refund' ? '+' : '-') + money(x.amount, !Number.isInteger(x.amount))), h('td', {}, x.expenseId ? ((spine.expenses || []).find((e) => e.id === x.expenseId) || {}).label || x.expenseId : x.kind === 'income' ? 'income' : x.tag ? TAG_WORDS[x.tag] : ''), h('td', {}, h('span', { class: 'pill' + (x.status === 'new' ? ' pill-maybe' : x.status === 'skip' || x.status === 'same' ? ' pill-done' : '') }, x.status === 'same' ? 'already in' : x.status), ' ', h('span', { class: 'choice-sub' }, x.why))); })))),
      h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: () => { const picked = picks || p.proposals.filter((y) => y.include).map((y) => y.key); let r = null; const ok = tryApply((s) => { r = applyImport(s, p.proposals, { picks: picked }); return r.spine; }, 'Imported ' + picked.length + ' entr' + (picked.length === 1 ? 'y' : 'ies')); if (ok) { form.proposals = null; form.picks = null; form.importWords = r ? 'Added ' + r.added + ', skipped ' + r.skipped + ' (already in the log, or not spending).' : ''; render(); } } }, 'Apply what is ticked'), h('button', { type: 'button', class: 'btn ghost', onclick: () => { form.proposals = null; form.picks = null; render(); } }, 'Discard'))] : null);
}

// ---------------------------------------------------------------- render
function render() {
  const spine = withScenario(hist.present, rules, pickedScenario());
  const s = summarize(spine, rules, { flags: false });
  const sim = cashsim(spine, rules, { months: window_ });
  const c = { sim };
  const today = todayIso();
  const vw = spendingView(spine, rules, sim, s, { today });
  const tiers = burnTiers(spine, rules, s.cashflow, { extra: spine.debtPlan && spine.debtPlan.extra && spine.debtPlan.extra.value !== null ? spine.debtPlan.extra.value : 0 });
  const ctx = () => ({ spine, rules, s, sim, spend: vw, tiers });
  const focusId = document.activeElement && document.activeElement.id;
  app.replaceChildren(...[
    h('nav', { class: 'page-links', 'aria-label': 'Pages' }, h('a', { href: 'dashboard.html' }, 'Dashboard'), h('a', { href: 'ledger.html' }, 'Ledger'), h('a', { href: 'calendar.html' }, 'Calendar'), h('a', { href: 'windfall.html' }, 'Windfall'), h('a', { href: 'math.html' }, 'All formulas')),
    h('header', { class: 'top' },
      h('div', {}, h('h1', {}, 'Spending'), h('p', { class: 'muted' }, spine.meta.name, ' · numbers as of ', shortDate(spine.meta.asOf), ' · ', SOURCE_WORDS[source])),
      h('nav', { class: 'top-actions' }, h('button', { type: 'button', class: 'btn', disabled: !canUndo(hist), title: canUndo(hist) ? 'Undo ' + undoLabel(hist) : null, onclick: () => { const before = hist; hist = undo(hist); if (hist !== before) { save(hist.present); lastSaved = 'Undone: ' + undoLabel(before) + '.'; render(); } } }, canUndo(hist) ? 'Undo' : 'Nothing to undo'))),
    h('p', { class: 'saved-line', role: 'status', 'aria-live': 'polite' }, lastSaved || ''),
    staleBanner(vw.stale),
    windowBar(window_, (n) => { window_ = n; render(); }),
    safeCard(vw, ctx),
    loggerCard(vw, spine, ctx),
    tagsCard(vw, ctx),
    compareCard(spine, ctx),
    importCard(spine, merchantRules),
    tiersCard(tiers, ctx),
    donutCard(vw, spine, render, ctx),
    askCard(c, spine, render, ctx),
    autopsyCard(vw, ctx),
    pricesCard(vw, ctx),
    checkinCard(c, spine, vw, ctx),
    sweepCard(c, spine, vw, ctx),
    h('p', { class: 'muted' }, 'The log is what happened; the plan is the Ledger. Estimated against actual for this month is on the Dashboard too.')
  ].filter(Boolean));
  if (focusId === 'log-merchant') { const i = document.getElementById('log-merchant'); if (i) i.focus({ preventScroll: true }); }
}

loadAll().then(async (loaded) => {
  hist = createHistory(loaded.spine); rules = loaded.rules; source = loaded.source;
  try { const r = await fetch(new URL('../data/merchant-rules.json', import.meta.url), { cache: 'no-store' }); if (r.ok) merchantRules = await r.json(); } catch { /* the house rules are optional: without them every line is new */ }
  render();
  if (loaded.problem) app.prepend(h('p', { class: 'card', role: 'alert' }, loaded.problem));
}).catch((err) => { app.replaceChildren(h('p', { class: 'card' }, 'The Spending page could not load: ' + err.message)); });
