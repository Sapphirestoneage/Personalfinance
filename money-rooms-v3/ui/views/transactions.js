/* Transactions (Level 10, MR-055): a CSV export comes in, the columns are
   mapped (and the mapper remembered per institution), the list is cleaned,
   categorized with the coach's overrides remembered per client, read for what
   repeats and what leaks, and written into the Ledger as verified actuals.
   The session 4 reveal lives here too. The CSV itself is never stored on the
   record; only what it taught us. Coach view only. Views never do math. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { parseCsv, guessMapping, normalize, categorize, clean, detect, patterns, actuals, compareToGut, foundMoney, applyActuals } from '../../engine/transactions.js';
import { programOf } from '../../engine/program.js';
import { variancePanel } from './call.js';
import { CATEGORIES } from '../../engine/planets/spending.js';
import { readFile } from '../dom.js';

const FIELDS = [['date', 'Date'], ['description', 'Description'], ['amount', 'Amount'], ['debit', 'Debit (money out)'], ['credit', 'Credit (money in)'], ['account', 'Account'], ['category', 'Their category']];
const CAT_WORDS = { accommodation: 'Home', food: 'Food', transportation: 'Getting around', therapy: 'Health and therapy', utilities: 'Phone, internet, subscriptions', wants: 'Fun and wants', irregular: 'Once a year', mistakes: 'Fees', other: 'Other', bnpl: 'Buy now pay later', transfer: 'Person to person', cardPayment: 'Card payment', ownTransfer: 'Between your accounts', income: 'Money in', refund: 'Refund' };

export function mount(host, app) {
  const rules = app.data.merchantRules;
  let parsed = null, mapping = null, institution = '', txs = null, result = null;
  const header = h('header', null, h('h1', null, 'Transactions'), h('span', { class: 'sub' }, 'Her export, cleaned and read. Nothing here is a bank connection.'), h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/call/4' }, 'Session 4'), h('a', { class: 'btn', href: '#/ledger/spending' }, 'Spending')));
  host.appendChild(header);
  const upload = h('section', { class: 'panel' }); const mapPanel = h('section', { class: 'panel' }); const review = h('div', { class: 'stack' });
  host.appendChild(upload); host.appendChild(mapPanel); host.appendChild(review);
  const money = c => F.dollarsWhole(c);
  const P = () => programOf(app.record);

  function drawUpload() {
    clear(upload);
    const inst = h('input', { class: 'input', 'aria-label': 'Institution or app', value: institution, title: 'Rocket Money, Chase, Ally', onChange: e => { institution = e.target.value.trim(); } });
    const file = h('input', { type: 'file', accept: '.csv,text/csv', 'aria-label': 'Transactions CSV', class: 'input', onChange: async e => { const f = e.target.files[0]; if (!f) return; const text = await readFile(f); load(text); } });
    const paste = h('textarea', { class: 'input', 'aria-label': 'Or paste the CSV', style: { minHeight: '64px' } });
    upload.appendChild(h('h2', null, 'Bring in the export'));
    upload.appendChild(h('p', { class: 'small muted' }, 'Rocket Money: Settings, Export transactions. A bank: download the CSV from the account page. The export should cover the history the app pulled plus everything since.'));
    upload.appendChild(h('div', { class: 'row' }, h('label', { class: 'small' }, 'From'), inst, file, h('button', { class: 'btn', onClick: () => { if (paste.value.trim()) load(paste.value); } }, 'Use the pasted text')));
    upload.appendChild(paste);
    const T = P().transactions;
    if (T && T.importedAt) upload.appendChild(h('p', { class: 'small' }, 'Last import ' + F.dateLong(T.importedAt.slice(0, 10)) + ': ' + T.count + ' transactions over ' + Math.round(T.spanDays / 7) + ' weeks' + (T.blindSpotPct !== null && T.blindSpotPct !== undefined ? '; blind spot ' + Math.round(T.blindSpotPct * 100) + '%' : '') + '.'));
  }
  function load(text) {
    parsed = parseCsv(text); if (!parsed.headers.length) { app.toast('That file has no rows.'); return; }
    const saved = P().mappers[institution || 'default'];
    mapping = saved && saved.headers && saved.headers.join('|') === parsed.headers.join('|') ? saved.mapping : guessMapping(parsed.headers, rules);
    txs = null; result = null; drawMapping(); clear(review);
  }
  function drawMapping() {
    clear(mapPanel); if (!parsed) return;
    mapPanel.appendChild(h('h2', null, 'Which column is which', h('span', { class: 'tag' }, parsed.rows.length + ' rows' + (mapping.source === 'rocket' ? ', a Rocket Money export' : ''))));
    const sel = key => h('select', { class: 'select', 'aria-label': FIELDS.find(f => f[0] === key)[1] + ' column', onChange: e => { mapping[key] = e.target.value || null; mapping.signs = mapping.debit || mapping.credit ? 'columns' : mapping.signs === 'columns' ? 'bank' : mapping.signs; } }, [h('option', { value: '', selected: !mapping[key] }, 'none')].concat(parsed.headers.map(hh => h('option', { value: hh, selected: mapping[key] === hh }, hh))));
    mapPanel.appendChild(h('div', { class: 'map-grid' }, FIELDS.map(([k, label]) => h('div', { class: 'fieldrow' }, h('label', null, label), h('div', { class: 'control' }, sel(k))))));
    mapPanel.appendChild(h('div', { class: 'fieldrow' }, h('label', null, 'Spending shows as'), h('div', { class: 'control' }, h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Sign of spending' }, [['bank', 'Negative (a bank)'], ['rocket', 'Positive (Rocket Money)'], ['columns', 'Two columns']].map(([v, l]) => h('button', { 'aria-pressed': String(mapping.signs === v), onClick: () => { mapping.signs = v; drawMapping(); } }, l))))));
    mapPanel.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn primary', onClick: run }, 'Read the transactions'), h('span', { class: 'small muted' }, 'The mapping is remembered for ' + (institution || 'this source') + '.')));
  }
  function sharedLines() { const S = app.result.sun.outputs; return app.record.planets.spending.rows.filter(r => r.f.shared && r.f.shared.v === true && r.f.amount && typeof r.f.amount.v === 'number').map(r => { const share = r.f.myShare && typeof r.f.myShare.v === 'number' ? r.f.myShare.v : 0.5; return { rowId: r.id, name: r.nickname, fullCents: r.f.amount.v, shareCents: Math.round(r.f.amount.v * share), category: r.f.category ? r.f.category.v : 'other' }; }); }
  function run() {
    if (!parsed || !mapping.date || !mapping.description || !(mapping.amount || mapping.debit || mapping.credit)) { app.toast('Date, description and an amount column first.'); return; }
    app.mutate(rec => { const Pm = programOf(rec); Pm.mappers[institution || 'default'] = { headers: parsed.headers, mapping }; rec.program = Pm; }, 'program');
    txs = categorize(normalize(parsed, mapping, institution), rules, P().merchantOverrides);
    const cl = clean(txs, { sharedLines: sharedLines() }); const det = detect(cl.kept, rules); const pat = patterns(cl.kept, { recurring: det.recurring }); const act = actuals(cl.kept, det.spanDays, (result && result.cl ? result.cl.netted : []).filter(n => n.confirmed));
    const gut = (app.record.anchors && app.record.anchors.gut) || {}; const cmp = compareToGut(act.monthly, gut); const win = foundMoney(det, cl);
    result = { cl, det, pat, act, cmp, win };
    drawReview();
  }
  function override(merchant, cat) { app.mutate(rec => { const Pm = programOf(rec); if (cat) Pm.merchantOverrides[merchant] = cat; else delete Pm.merchantOverrides[merchant]; rec.program = Pm; }, 'program'); run(); }
  function drawReview() {
    clear(review); if (!result) return; const { cl, det, pat, act, cmp, win } = result;
    /* cleaned */
    review.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Taken out so nothing counts twice', h('span', { class: 'tag' }, cl.removed.length + ' removed, ' + cl.netted.length + ' netted')),
      h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('tbody', null, cl.removed.map(r => h('tr', null, h('td', { class: 'small muted' }, r.tx.date), h('td', { class: 'wrap' }, r.tx.description), h('td', { class: 'num' }, money(Math.abs(r.tx.amount))), h('td', { class: 'small muted' }, r.reason))).concat(cl.netted.map(nn => h('tr', null, h('td', { class: 'small muted' }, nn.tx.date), h('td', { class: 'wrap' }, nn.tx.description), h('td', { class: 'num' }, money(nn.cents)), h('td', { class: 'small' }, nn.kind === 'roommate' ? ['Matches ' + nn.lineName + ' (their share). ', h('span', { class: 'view-toggle', role: 'group', 'aria-label': 'Confirm the match' }, [[true, 'Yes'], [false, 'No']].map(([v, l]) => h('button', { 'aria-pressed': String(nn.confirmed === v), onClick: () => { nn.confirmed = v; drawReview(); } }, l)))] : nn.kind === 'refund' ? 'Refund, netted' : 'Money in by Venmo or Zelle; what was it?'))))))),
      cl.flags.length ? h('p', { class: 'small muted' }, 'Flagged: ' + cl.flags.map(f => f.tx.description + ' (' + f.kind + ')').join('; ')) : null));
    /* categorized with overrides */
    const byMerchant = {}; cl.kept.filter(t => t.amount > 0).forEach(t => { const m = byMerchant[t.merchant] = byMerchant[t.merchant] || { merchant: t.merchant, description: t.description, category: t.category, label: t.label, count: 0, cents: 0, overridden: t.overridden }; m.count++; m.cents += t.amount; });
    const merchants = Object.values(byMerchant).sort((a, b) => b.cents - a.cents);
    review.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Where each merchant goes', h('span', { class: 'tag' }, merchants.length + ' merchants; change any and it is remembered')),
      h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Merchant'), h('th', { class: 'num' }, 'Charges'), h('th', { class: 'num' }, 'Total'), h('th', null, 'Area'))), h('tbody', null, merchants.slice(0, 60).map(m => h('tr', null, h('td', { class: 'wrap' }, m.description), h('td', { class: 'num' }, String(m.count)), h('td', { class: 'num' }, money(m.cents)), h('td', null, h('select', { class: 'select', 'aria-label': 'Area for ' + m.description, onChange: e => override(m.merchant, e.target.value) }, CATEGORIES.concat(['bnpl', 'transfer']).map(c => h('option', { value: c, selected: m.category === c }, CAT_WORDS[c] || c)))))))))));
    /* detections */
    const detPanel = h('section', { class: 'panel' }, h('h2', null, 'What repeats, what leaks'));
    detPanel.appendChild(h('h3', null, 'Every month, or every year', h('span', { class: 'tag' }, det.recurring.length + ' found')));
    detPanel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('tbody', null, det.recurring.map(r => h('tr', null, h('td', { class: 'wrap' }, r.description, r.subscription ? h('span', { class: 'chip src', style: { marginLeft: '6px' } }, 'subscription') : null), h('td', null, r.cadence), h('td', { class: 'num' }, money(r.amount)), h('td', { class: 'num small muted' }, money(r.monthly) + ' a month'), h('td', { class: 'small muted' }, 'next ' + F.dateLong(r.nextDate))))))));
    if (det.fees.length) detPanel.appendChild(h('p', { class: 'small' }, h('strong', null, 'Fees: '), det.fees.map(f => f.tx.description + ' ' + money(f.tx.amount)).join('; ')));
    if (det.bnpl.length) detPanel.appendChild(h('p', { class: 'small' }, h('strong', null, 'Buy now, pay later: '), det.bnpl.length + ' payments, ' + money(det.bnpl.reduce((s, b) => s + b.tx.amount, 0)) + '; counted as debt'));
    if (det.priceCreep.length) detPanel.appendChild(h('p', { class: 'small' }, h('strong', null, 'Creeping up: '), det.priceCreep.map(p => p.description + ' ' + money(p.from) + ' to ' + money(p.to)).join('; ')));
    if (det.duplicates.length) detPanel.appendChild(h('p', { class: 'small' }, h('strong', null, 'Possible duplicates: '), det.duplicates.map(d => d.merchant + ' ' + money(d.amount) + ' on ' + d.date).join('; ')));
    review.appendChild(detPanel);
    /* patterns */
    review.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Patterns'),
      h('p', { class: 'small' }, h('strong', null, 'Top five: '), pat.topMerchants.map(t => t.merchant + ' ' + Math.round(t.share * 100) + '%').join(', ')),
      h('p', { class: 'small' }, h('strong', null, 'Small and often: '), pat.smallFrequent.count + ' charges under $25, ' + money(pat.smallFrequent.cents) + '. ', h('strong', null, 'Big and rare: '), pat.bigRare.count + ' over $100, ' + money(pat.bigRare.cents) + '.'),
      Object.keys(pat.weeknightEvening).length ? h('p', { class: 'small' }, h('strong', null, 'Weeknight takeout: '), money(Object.values(pat.weeknightEvening).reduce((s, x) => s + x, 0)) + ' Monday to Thursday.') : null,
      h('p', { class: 'small' }, h('strong', null, 'Paydays: '), (pat.calendar.payDays.length ? 'the ' + pat.calendar.payDays.join(', ') : 'none seen') + '. ', h('strong', null, 'Bills land on: '), pat.calendar.billDays.length ? 'the ' + Array.from(new Set(pat.calendar.billDays)).sort((a, b) => a - b).join(', ') : 'no fixed days', pat.calendar.lowDays.length ? '. ' + pat.calendar.lowDays[0].note : '')));
    /* actuals and the reveal */
    const rev = h('section', { class: 'panel reveal' }, h('h2', null, 'What it really is', h('span', { class: 'tag' }, 'about ' + act.months + ' months of transactions')));
    rev.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Area'), h('th', { class: 'num' }, 'What you said'), h('th', { class: 'num' }, 'What it really is'), h('th', { class: 'num' }, 'Ratio'))), h('tbody', null, Object.keys(cmp.perArea).map(c => h('tr', null, h('td', null, CAT_WORDS[c] || c), h('td', { class: 'num' }, cmp.perArea[c].estimated !== null ? money(cmp.perArea[c].estimated) : h('span', { class: 'empty-token' }, 'Not asked')), h('td', { class: 'num' }, money(cmp.perArea[c].actual)), h('td', { class: 'num' }, cmp.perArea[c].ratio !== null ? cmp.perArea[c].ratio + 'x' : '')))))));
    rev.appendChild(h('p', { class: 'big blind-spot' }, cmp.blindSpotPct !== null ? Math.round(cmp.blindSpotPct * 100) + '% of what goes out was not in your picture.' : 'No gut figures to compare yet.'));
    if (win) rev.appendChild(h('div', { class: 'panel cheer found-money' }, h('h3', null, 'Found money'), h('p', { class: 'big' }, win.text + '.'), h('p', { class: 'small muted' }, 'This is the first step for today.')));
    rev.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn primary', onClick: () => apply(result) }, 'Write these into the Ledger as real numbers'), h('span', { class: 'small muted' }, 'One verified line per repeating merchant in an area and one for the rest; your shared lines stay.')));
    review.appendChild(rev);
    if (app.record.anchors && app.record.anchors.gut && Object.keys(app.record.anchors.gut).length && app.record.planets.spending.rows.some(r => r.f.amount && r.f.amount.state === 'verified')) { const vp = h('section', { class: 'panel' }, h('h2', null, 'The full reveal')); vp.appendChild(variancePanel(app, { coach: true })); review.appendChild(vp); }
  }
  function apply(res) {
    const { det, act, cmp, win, cl } = res;
    app.mutate(rec => {
      applyActuals(rec, app.data, det, act, { session: app.session });
      const Pm = programOf(rec);
      Pm.transactions = { importedAt: new Date().toISOString(), count: txs.length, spanDays: det.spanDays, monthly: act.monthly, recurringVerified: true, allVerified: true, foundMoney: win, blindSpotPct: cmp.blindSpotPct, netted: cl.netted.filter(n => n.confirmed).length };
      Pm.blindSpot.s4 = { pct: cmp.blindSpotPct, perArea: cmp.perArea, correction: cmp.correction, at: new Date().toISOString() };
      rec.program = Pm;
    }, 'program');
    app.toast('Written: the spending lines are now real numbers.'); run();
  }
  drawUpload(); drawMapping();
  return { update() { drawUpload(); } };
}
