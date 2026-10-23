// Search (S-108): one box in the header ("/" jumps to it). It finds lines, categories, merchants,
// entries, net worth numbers, accounts (with the latest balance), debts, charts, settings, months,
// and screens by name, grouped by type, and each result jumps to its one home (nav.js). Keyboard:
// arrows move, Enter opens, Escape closes. Results are big enough to tap. Parked tools only show when
// Future tools are on. Places and the chart registry come from nav.js; the net worth numbers from
// netWorthAt (engines/networth.js) and each account's latest balance from balanceAt (engines/balances.js).

import { h } from '../dom.js';
import { money, monthLabel, dayLabel, todayIso } from '../format.js';
import { SCREENS, INSIGHT_TABS, SETUP_SECTIONS, CHARTS } from '../nav.js';
import { netWorthAt, LABELS, typeLabel } from '../../engines/networth.js';
import { balanceAt } from '../../engines/balances.js';

const GROUPS = [
  'Lines',
  'Categories',
  'Merchants',
  'Entries',
  'Net worth',
  'Accounts',
  'Debts',
  'Charts',
  'Settings',
  'Months',
  'Screens',
  'Future'
];
const PER_GROUP = 5;

// Everything findable, built from the household on screen: [group, name, detail, target].
// A target is a place (nav.js) plus what to open, scroll to, and name in the breadcrumb.
function index(ctx) {
  const doc = ctx.doc;
  const live = (xs) => xs.filter((x) => x.state !== 'archived');
  const out = [];
  for (const c of live(doc.categories)) {
    // The one total ('everything', settings.singleTotal) is not listed. Debt payments is left out of
    // Categories because its amount is computed from the debts on the Accounts screen, not typed on Your estimates.
    if (c.id === 'everything') continue;
    if (c.id !== 'debt')
      out.push([
        'Categories',
        c.name,
        'Your estimates',
        { where: 'estimates', open: 'rough:' + c.id, anchor: 'est-' + c.id, item: c.name }
      ]);
    for (const l of live(c.lines))
      out.push([
        'Lines',
        l.name,
        c.name,
        { where: 'review', open: 'rv-cat:' + c.id, anchor: 'rv-cat-' + c.id, item: l.name }
      ]);
  }
  const merchants = new Map();
  for (const t of doc.transactions || []) {
    if (t.deleted) continue;
    // description is the merchant as typed or imported; merchant is its normalized key (store/log.js), the fallback.
    const m = t.description || t.merchant;
    if (m) merchants.set(m, (merchants.get(m) || 0) + 1);
  }
  for (const [m, n] of merchants)
    out.push([
      'Merchants',
      m,
      n + ' entr' + (n === 1 ? 'y' : 'ies'),
      { where: 'insights:time', ui: { trendFocus: 'm:' + m }, anchor: 'trend-pickers', item: m }
    ]);
  // Only the latest 400 entries are indexed, which keeps the index small on a long log.
  for (const t of (doc.transactions || []).filter((x) => !x.deleted).slice(-400)) {
    const name = t.description || t.note || 'Entry';
    out.push([
      'Entries',
      name,
      dayLabel(t.date) + ', ' + money(Math.abs(t.amount), true),
      {
        where: 'log',
        ui: { txMonth: t.date.slice(0, 7) },
        open: 'entry:' + t.id,
        item: name + ', ' + dayLabel(t.date),
        extra: money(Math.abs(t.amount), true)
      }
    ]);
  }
  // Net worth numbers (S-114): each opens how it was worked out, in Insights, Net worth.
  const nw = netWorthAt(doc, todayIso());
  for (const [key, how, label] of [
    ['total', 'nwTotal', LABELS.total],
    ['fi', 'nwFI', LABELS.fi],
    ['locked', 'nwLocked', LABELS.locked]
  ]) {
    out.push([
      'Net worth',
      label,
      nw[key] === null ? 'Needs balances' : money(nw[key]),
      { where: 'insights:networth', ui: { how }, anchor: 'nw-tiles', item: label }
    ]);
  }
  const latest = (key) => {
    const b = balanceAt(doc, key, todayIso());
    return b ? money(b.amount) + ' on ' + dayLabel(b.date) : 'No balance yet';
  };
  for (const a of live(doc.accounts))
    out.push([
      'Accounts',
      a.name,
      (a.institution || typeLabel(a.type)) + ', ' + latest(a.id),
      { where: 'balances', item: a.name }
    ]);
  for (const d of live(doc.debts)) out.push(['Debts', d.label, 'Debt', { where: 'setup:debts', item: d.label }]);
  for (const [anchor, name, where] of CHARTS)
    out.push([
      'Charts',
      name,
      where.replace('insights:', 'Insights, ').replace('setup:', 'Setup, '),
      { where, anchor, item: name }
    ]);
  for (const [id, name] of SETUP_SECTIONS) out.push(['Settings', name, 'Setup', { where: 'setup:' + id, item: name }]);
  // Two settings people look for by name that are not sections of their own.
  out.push(
    ['Settings', 'Cushion', 'Setup, coach settings', { where: 'setup:coach', item: 'Cushion' }],
    ['Settings', 'Paydays', 'Setup, income', { where: 'setup:income', anchor: 'paydays-card', item: 'Paydays' }]
  );
  for (const m of doc.months)
    out.push([
      'Months',
      monthLabel(m.key),
      'Closed',
      { where: 'months', ui: { monthsPick: m.key }, item: monthLabel(m.key) }
    ]);
  out.push([
    'Months',
    monthLabel(doc.currentMonth),
    'Working on it',
    { where: 'review', item: monthLabel(doc.currentMonth) }
  ]);
  // Insights opens on Where it goes; the fallthrough sends Setup, and Accounts too, to Setup, Basics.
  for (const [id, name] of SCREENS)
    out.push([
      'Screens',
      name,
      'Screen',
      {
        where:
          id === 'review'
            ? 'review'
            : id === 'today'
              ? 'today'
              : id === 'track'
                ? 'track'
                : id === 'plan'
                  ? 'plan'
                  : id === 'insights'
                    ? 'insights:where'
                    : 'setup:basics'
      }
    ]);
  for (const [id, name] of INSIGHT_TABS) out.push(['Screens', 'Insights, ' + name, 'Tab', { where: 'insights:' + id }]);
  if (ctx.future) {
    out.push(
      ['Future', 'Dream life', 'Future', { where: 'future:eras', item: 'Dream life' }],
      ['Future', 'Eras', 'Future', { where: 'future:eras', item: 'Eras' }],
      ['Future', 'Next stage', 'Future', { where: 'future:next', item: 'Next stage' }]
    );
    for (const e of (doc.eras && doc.eras.list) || [])
      out.push(['Future', e.name, 'Era', { where: 'future:eras', item: e.name }]);
  }
  return out;
}

export function searchResults(ctx, q) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = index(ctx).filter(([, name, detail, target]) => {
    const hay = (name + ' ' + detail + ' ' + (target.extra || '')).toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  // Names that start with the words first, then by group order.
  const starts = (name) => (name.toLowerCase().startsWith(words[0]) ? 0 : 1);
  hits.sort((a, b) => starts(a[1]) - starts(b[1]));
  const out = [];
  for (const g of GROUPS) out.push(...hits.filter((x) => x[0] === g).slice(0, PER_GROUP));
  return out;
}

// Opening a result clears the box, expands the target's row (ui.expanded), and names it in the breadcrumb (S-108).
function open(ctx, target) {
  const st = ctx.ui.search;
  st.q = '';
  st.sel = 0;
  if (target.open) ctx.ui.expanded.add(target.open);
  ctx.jump(target.where, { ui: { ...(target.ui || {}), crumbItem: target.item || null }, anchor: target.anchor });
}

export function searchBox(ctx) {
  const st = (ctx.ui.search = ctx.ui.search || { q: '', sel: 0 });
  const results = searchResults(ctx, st.q);
  const sel = Math.min(st.sel, Math.max(0, results.length - 1));
  const list = st.q.trim()
    ? h(
        'div',
        { class: 'search-results', role: 'listbox', id: 'search-results' },
        results.length
          ? GROUPS.filter((g) => results.some((r) => r[0] === g)).map((g) =>
              h(
                'div',
                { class: 'search-group' },
                h('div', { class: 'xs muted search-head' }, g),
                results.map((r, i) =>
                  r[0] !== g
                    ? null
                    : h(
                        'button',
                        {
                          class: 'search-hit',
                          role: 'option',
                          'aria-selected': i === sel ? 'true' : 'false',
                          'data-key': 'sr:' + i,
                          // mousedown is swallowed so the box keeps focus and the list stays open until the click lands.
                          onmousedown: (e) => e.preventDefault(),
                          onclick: () => open(ctx, r[3])
                        },
                        h('span', {}, r[1]),
                        h('span', { class: 'xs muted' }, r[2])
                      )
                )
              )
            )
          : h(
              'p',
              { class: 'small muted', style: 'padding:8px 12px;margin:0' },
              'Nothing by that name. Try a line, a merchant, or a month.'
            )
      )
    : null;
  return h(
    'div',
    { class: 'search' },
    h('input', {
      type: 'search',
      id: 'search',
      'data-key': 'search',
      placeholder: 'Search  /',
      'aria-label': 'Search',
      autocomplete: 'off',
      value: st.q,
      'aria-controls': 'search-results',
      'aria-expanded': list ? 'true' : 'false',
      oninput: (e) => {
        st.q = e.target.value;
        st.sel = 0;
        ctx.rerender();
      },
      onkeydown: (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          st.sel = Math.min(sel + 1, results.length - 1);
          ctx.rerender();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          st.sel = Math.max(sel - 1, 0);
          ctx.rerender();
        }
        // Enter and Escape blur the box so a phone keyboard goes away.
        else if (e.key === 'Enter' && results[sel]) {
          e.preventDefault();
          e.target.blur();
          open(ctx, results[sel][3]);
        } else if (e.key === 'Escape') {
          st.q = '';
          e.target.blur();
          ctx.rerender();
        }
      }
    }),
    list
  );
}
