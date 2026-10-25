// Where the money goes in a month (S-192): each income stream, through the
// account it is paid into and any card a bill goes on, out to spending by
// section (or each expense in a section that is opened), debt payments,
// saving, tax and what is left. Built from cash flow, so what is left adds up
// to the month's surplus. A route that rests on a guessed link is rough.
//
// moneyFlow(spine, rules, cf, { open }) -> { nodes, links, left, short }
//   node: { id, label, col (0 income, 1 accounts, 2 cards, 3 where it goes), kind, path, section, open, amount }
//   link: { from, to, amount, rough }

import { valueOf as v, round2 } from './spine.js';
import { mainChecking } from './defaults.js';
import { payPolicyOf } from './debt.js';
import { fromPaycheck, SECTION_WORDS } from './schema.js';

const SECTION = SECTION_WORDS;
// Where-it-goes order, top to bottom: debt first, so card payments cross nothing.
const ORDER = ['debt', 'spend', 'save', 'tax', 'left'];

export function moneyFlow(spine, rules, cf, { open = [] } = {}) {
  const nodes = new Map(), links = [];
  const main = mainChecking(spine);
  const node = (id, n) => { if (!nodes.has(id)) nodes.set(id, { id, ...n }); return id; };
  const link = (from, to, amount, rough = false) => { if (amount > 0.004) links.push({ from, to, amount: round2(amount), rough }); };
  // A link Fact: its id, and whether that route is a guess. Unknown ids go to main checking.
  const route = (f, allow) => {
    const id = f ? v(f) : null;
    const ok = id && allow(id);
    return { id: ok ? id : main, rough: !ok || f.kind !== 'known' };
  };
  const isCash = (id) => (spine.accounts || []).some((a) => a.id === id && a.family === 'cash');
  const isCard = (id) => (spine.debts || []).some((d) => d.id === id && d.type === 'credit_card');
  const acct = (id) => { const a = spine.accounts.find((x) => x.id === id); return node('acct:' + id, { label: v(a.name) || id, col: 1, kind: 'account', path: 'accounts.' + id + '.balance' }); };
  const card = (id) => { const d = spine.debts.find((x) => x.id === id); return node('card:' + id, { label: v(d.name) || id, col: 2, kind: 'card', path: 'debts.' + id + '.balance' }); };
  if (!main) return { nodes: [], links: [], left: null, short: null, problem: 'Add a checking or savings account to see where the money goes.' };

  // Income: taxes withheld, pre-tax saving (split across paychecks by gross), the rest into its account.
  const streams = cf.income.streams.filter((s) => s.included && s.gross > 0);
  const w2 = streams.filter((s) => s.type === 'w2');
  const w2Gross = w2.reduce((x, s) => x + s.gross, 0);
  // Out of the paycheck by the cash flow's one rule (engine/schema.js fromPaycheck): an HSA only through payroll (answer 47).
  const payrollAccts = (spine.accounts || []).filter((a) => a.monthlyContribution && v(a.monthlyContribution) && fromPaycheck(a));
  for (const s of streams) {
    const src = (spine.income || []).find((x) => x.id === s.id) || {};
    const id = node('in:' + s.id, { label: s.label, col: 0, kind: 'income', path: 'income.' + s.id + '.amount' });
    link(id, node('tax:withheld', { label: 'Taxes withheld', col: 3, kind: 'tax' }), (s.withheld || 0) + (s.fica || 0));
    let payroll = 0;
    if (s.type === 'w2' && w2Gross > 0 && cf.saving.payroll.value) {
      for (const a of payrollAccts) {
        const part = v(a.monthlyContribution) * s.gross / w2Gross;
        payroll += part;
        link(id, node('save:' + a.id, { label: v(a.name) || a.id, col: 3, kind: 'save', path: 'accounts.' + a.id + '.monthlyContribution' }), part);
      }
    }
    const to = route(src.depositTo, isCash);
    link(id, acct(to.id), s.takeHome - payroll, to.rough);
  }

  // Spending: from an account, or onto a card. A section opened shows each expense.
  const charges = new Map();
  for (const i of cf.expenses.items) {
    if (!i.amount || i.covered) continue;
    const e = (spine.expenses || []).find((x) => x.id === i.id) || {};
    const sec = i.fat || 'other';
    const target = open.includes(sec)
      ? node('exp:' + i.id, { label: i.label, col: 3, kind: 'spend', section: sec, path: 'expenses.' + i.id + '.amount' })
      : node('sec:' + sec, { label: SECTION[sec], col: 3, kind: 'spend', section: sec, open: false });
    const via = route(e.paidFrom, (x) => isCash(x) || isCard(x));
    if (isCard(via.id)) { link(card(via.id), target, i.amount, via.rough); charges.set(via.id, (charges.get(via.id) || 0) + i.amount); }
    else link(acct(via.id), target, i.amount, via.rough);
  }
  for (const sec of open) if (nodes.has('sec:' + sec)) nodes.get('sec:' + sec).open = true;

  // Debt: a card is paid from its account for its charges plus what it pays on the
  // balance carried; a loan's payment goes straight out.
  const debtOut = node('debt:paid', { label: 'Debt payments', col: 3, kind: 'debt' });
  const paidOnBalance = new Map(cf.debtMinimums.items.map((m) => [m.id, m.amount || 0]));
  for (const d of spine.debts || []) {
    const pay = paidOnBalance.get(d.id) || 0, ch = charges.get(d.id) || 0;
    if (!pay && !ch) continue;
    const from = route(d.paidFrom, isCash);
    if (d.type === 'credit_card') {
      const c = card(d.id);
      if (payPolicyOf(spine, d) === 'statement') nodes.get(c).label += ' (paid in full)';
      link(acct(from.id), c, ch + pay, from.rough);
      link(c, debtOut, pay);
    } else link(acct(from.id), debtOut, pay, from.rough);
  }

  // Saving from take-home, into each account.
  for (const a of spine.accounts || []) {
    if (a.family === 'cash' || !a.monthlyContribution || !v(a.monthlyContribution) || payrollAccts.includes(a)) continue;
    const from = route(a.fundedFrom, isCash);
    link(acct(from.id), node('save:' + a.id, { label: v(a.name) || a.id, col: 3, kind: 'save', path: 'accounts.' + a.id + '.monthlyContribution' }), v(a.monthlyContribution), from.rough);
  }

  // Tax set aside, from the main account.
  link(acct(main), node('tax:aside', { label: 'Set aside for taxes', col: 3, kind: 'tax' }), cf.taxSetAside.total.value || 0);

  // What each account has left, or is short (drawn from its balance).
  let left = 0, short = 0;
  for (const n of [...nodes.values()].filter((x) => x.kind === 'account')) {
    const inn = links.filter((l) => l.to === n.id).reduce((x, l) => x + l.amount, 0);
    const out = links.filter((l) => l.from === n.id).reduce((x, l) => x + l.amount, 0);
    if (inn - out > 0.004) { left += inn - out; link(n.id, node('left', { label: 'Left over', col: 3, kind: 'left' }), inn - out); }
    if (out - inn > 0.004) { short += out - inn; link(node('short:' + n.id, { label: 'From ' + n.label, col: 0, kind: 'short', path: n.path }), n.id, out - inn); }
  }

  // One band per pair: bills from the same account to the same section add up; a guess anywhere makes it rough.
  const merged = new Map();
  for (const l of links) { const k = l.from + '>' + l.to; const m = merged.get(k); if (m) { m.amount = round2(m.amount + l.amount); m.rough = m.rough || l.rough; } else merged.set(k, { ...l }); }
  // Each place's dollars: the larger of what comes in and what goes out.
  for (const n of nodes.values()) { const inn = [...merged.values()].filter((l) => l.to === n.id).reduce((x, l) => x + l.amount, 0), out = [...merged.values()].filter((l) => l.from === n.id).reduce((x, l) => x + l.amount, 0); n.amount = round2(Math.max(inn, out)); }
  for (const [id, n] of nodes) if (!n.amount) nodes.delete(id);
  const list = [...nodes.values()].sort((a, b) => a.col - b.col || (a.col === 3 ? ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) : 0));
  return { nodes: list, links: [...merged.values()], left: round2(left), short: round2(short), sections: SECTION };
}
