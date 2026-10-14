/* The checklist (MR-077): every piece of information the numbers need for
   one client, with what is on file for each and whether it counts as in.
   One list, in the order the rooms ask for it: the household facts, then
   each room's row types and every row's counted facts, then the first call.
   Pure: reads the record and the result, writes nothing, does no money
   math. The same rules as the fill tracker decide what counts (tags never;
   a cadence-tied field only in its cadence; a type assumed none counts as
   answered; a rough total stands in for detail rows; optional facts and
   optional types are listed but never counted). */
import { PLANETS, PLANET_LABELS, SUN_ASKED, SUN_MORE, FILING_STATUSES } from './sun.js';
import { typesFor, primaryFieldOf, askedOnRow, isNoneRow } from './fields.js';
import { hasValue, isRough } from './states.js';
import { confirmItems } from './discovery.js';
import { getAnchor, AREAS } from './anchors.js';
import * as F from './format.js';

const SUMMARY = { spending: 'summary', debt: 'summary', invest: 'summary' };
const SUN_LABELS = { name: 'Name', birthDate: 'Birth date', state: 'State', city: 'City', workSituation: 'Work situation', dependents: 'Dependents', filingStatus: 'Filing status', bigGoal: 'Big goal' };
const WORK_LABELS = { employed: 'Employed', 'self-employed': 'Self-employed', 'between-jobs': 'Between jobs', student: 'Student', retired: 'Retired', mixed: 'Mixed' };
const CADENCE_SHORT = { paycheck: 'a paycheck', week: 'a week', month: 'a month', quarter: 'a quarter', year: 'a year', oneoff: 'one-off' };

/* The status words, one per kind of answer. Done is "the numbers can use it or it was answered as none". */
export const STATUS = Object.freeze({
  in: { label: 'In', done: true },
  rough: { label: 'Rough', done: true },
  send: { label: 'Will send', done: false },
  none: { label: 'None', done: true },
  na: { label: 'Not applicable', done: true },
  missing: { label: 'Missing', done: false },
  add: { label: 'Add', done: false },
  optional: { label: 'Optional', done: false },
});

const empty = f => !f || f.v === null || f.v === undefined || f.v === '';

/* What one field says, in words: the value with its cadence, or the state when there is no value. */
export function fieldText(def, f, record) {
  if (!f) return '';
  if (f.state === 'will-send') return 'Will send';
  if (f.state === 'not-applicable') return 'Not applicable';
  if (f.state === 'not-for-me') return 'Not for me';
  if (f.state === 'none') return 'None';
  if (!hasValue(f) || empty(f)) return '';
  const rough = isRough(f);
  const cad = def.cadence && f.cad ? ' ' + (CADENCE_SHORT[f.cad] || f.cad) : '';
  switch (def.kind) {
    case 'money': return ((f.v && typeof f.v === 'object') ? F.dollarsWhole(f.v.low, { rough: true }) + ' to ' + F.dollarsWhole(f.v.high) : F.dollarsWhole(f.v, { rough })) + cad;
    case 'percent': return F.percent(f.v, { rough });
    case 'int': return F.integer(f.v, { rough });
    case 'hours': return F.hours(f.v, { rough });
    case 'month': return F.date(f.v, { rough });
    case 'date': return F.dateLong(f.v);
    case 'bool': return f.v ? 'Yes' : 'No';
    case 'credits': return f.v && typeof f.v === 'object' ? Object.keys(f.v).length + ' used' : '';
    case 'choice': {
      let opts = def.options || [];
      /* a spending line paid by card names the card: the same list the ledger offers */
      if (def.dynamicOptions === 'cards' && record) opts = opts.concat(record.planets.debt.rows.filter(x => x.type === 'card' && x.nickname).map(x => [x.nickname, 'Credit card: ' + x.nickname]));
      const o = opts.find(x => x[0] === f.v);
      return o ? o[1] : String(f.v);
    }
    default: return String(f.v);
  }
}

/* The status of one field under the counting rules. */
export function statusOf(f) {
  if (!f || f.state === 'unknown') return 'missing';
  if (f.state === 'will-send') return 'send';
  if (f.state === 'none') return 'none';
  if (f.state === 'not-applicable' || f.state === 'not-for-me') return 'na';
  if (empty(f)) return 'missing';
  return isRough(f) ? 'rough' : 'in';
}

function sunText(id, f, data) {
  if (!f || empty(f)) return '';
  if (id === 'birthDate') return F.dateLong(f.v) + (isRough(f) ? ' (rough)' : '');
  if (id === 'workSituation') return WORK_LABELS[f.v] || String(f.v);
  if (id === 'filingStatus') { const o = FILING_STATUSES.find(x => x[0] === f.v); return o ? o[1] : String(f.v); }
  if (id === 'state' && data && data.usStates) { const s = (data.usStates.states || []).find(x => x[0] === f.v); return s ? s[1] : String(f.v); }
  return String(f.v);
}

function item(o) {
  const st = STATUS[o.status];
  return Object.assign({ sub: '', text: '', rowId: null, field: null, planet: null, type: null, addRow: false, required: true }, o, { done: st.done, counts: o.required !== false });
}

function householdText(hh) {
  const parts = [];
  const partners = (hh.partners || (hh.partner ? [hh.partner] : [])).filter(Boolean);
  if (partners.length) parts.push((partners.length === 1 ? 'Partner' : partners.length + ' partners') + (partners.map(p => p.nickname).filter(Boolean).length ? ': ' + partners.map(p => p.nickname).filter(Boolean).join(', ') : '') + ((hh.basis || 'together') === 'together' ? ', counted together' : ', counted separately'));
  if (hh.roommates && hh.roommates.length) parts.push(hh.roommates.length + (hh.roommates.length === 1 ? ' roommate' : ' roommates') + ', lease ' + ({ mine: 'in their name', both: 'in both names', theirs: 'in the roommate\'s name', none: 'none' }[hh.lease] || hh.lease));
  return parts.length ? parts.join('; ') : 'Lives alone';
}

export function checklist(record, result, data) {
  const fields = data.fields;
  const sections = [];
  const work = record.sun.f.workSituation ? record.sun.f.workSituation.v : null;

  /* 1. the household facts: the four asked, the three behind More, and who they live with */
  const hhItems = SUN_ASKED.concat(SUN_MORE).map(id => {
    const f = record.sun.f[id]; const required = SUN_ASKED.indexOf(id) !== -1;
    const status = empty(f) ? (required ? 'missing' : 'optional') : (isRough(f) ? 'rough' : 'in');
    return item({ id: 'sun:' + id, label: SUN_LABELS[id] || id, text: sunText(id, f, data), status, required, rowId: 'sun', field: id, planet: 'sun', href: '#/ledger' });
  });
  const hh = record.household || { roommates: [], partners: [], partner: null, lease: 'none', basis: 'together' };
  const hhAnswered = !!((hh.roommates && hh.roommates.length) || (hh.partners && hh.partners.length) || hh.partner || (record.discovery && record.discovery.confirmed && record.discovery.confirmed.household) || (record.journal || []).some(j => j.kind === 'household'));
  hhItems.push(item({ id: 'household', label: 'Who they live with', text: hhAnswered ? householdText(hh) : '', status: hhAnswered ? 'in' : 'missing', href: '#/callpath', planet: 'sun' }));
  sections.push({ id: 'household', label: 'Household facts', href: '#/ledger', groups: [{ id: 'sun', label: 'Household facts', items: hhItems }] });

  /* 2. every room: its row types, each row's counted facts */
  PLANETS.forEach(p => {
    const rows = record.planets[p].rows;
    const pl = fields.planets[p];
    const derived = !!(pl && pl.derived);
    const groups = [];
    const summaryRow = rows.find(r => r.type === 'summary');
    const summaryIn = summaryRow && Object.values(summaryRow.f).some(f => f && hasValue(f));
    const detailRows = rows.filter(r => r.type !== 'summary' && !isNoneRow(fields, r));
    typesFor(fields, p, work).forEach(t => {
      const have = rows.filter(r => r.type === t.id);
      const optionalType = t.id === 'other' || !!t.optionalType;
      const href = '#/ledger/' + p + '/' + t.id;
      const g = { id: t.id, label: t.plural || t.label, href, planet: p, type: t.id, rows: have.length, optional: optionalType, single: !!t.single, items: [], note: '' };
      if (!have.length) {
        if (t.id === 'summary') { g.note = detailRows.length ? 'Not needed: the detail rows carry the total' : ''; if (!detailRows.length && !derived) g.items.push(item({ id: 'type:' + p + ':' + t.id, label: 'Rough total, or the detail rows below', status: 'optional', required: false, planet: p, type: t.id, href, addRow: true })); }
        else if (t.assumeNone) g.items.push(item({ id: 'type:' + p + ':' + t.id, label: t.label, text: 'None (assumed until a row says otherwise)', status: 'none', planet: p, type: t.id, href, addRow: true }));
        else if (optionalType || derived) g.items.push(item({ id: 'type:' + p + ':' + t.id, label: 'Add ' + (t.plural || t.label) + ' if any', status: 'optional', required: false, planet: p, type: t.id, href, addRow: true }));
        else if (SUMMARY[p] && summaryIn) g.items.push(item({ id: 'type:' + p + ':' + t.id, label: 'Add ' + (t.plural || t.label) + ' to replace the rough total', status: 'optional', required: false, planet: p, type: t.id, href, addRow: true }));
        else g.items.push(item({ id: 'type:' + p + ':' + t.id, label: 'Add ' + (t.plural || t.label) + ', or mark none', status: 'add', planet: p, type: t.id, href, addRow: true }));
        groups.push(g); return;
      }
      have.forEach(r => {
        const name = r.nickname || t.label;
        if (isNoneRow(fields, r)) { g.items.push(item({ id: 'row:' + r.id, label: name, sub: '', text: 'None', status: 'none', rowId: r.id, field: primaryFieldOf(fields, p, t.id).id, planet: p, type: t.id, href })); return; }
        const standsDown = r.type === 'summary' && detailRows.length > 0; /* detail rows override a rough total */
        const prim = primaryFieldOf(fields, p, t.id);
        const order = t.fields.slice().sort((a, b) => (prim && a === prim.id ? -1 : 0) - (prim && b === prim.id ? -1 : 0));
        order.forEach(fid => {
          const d = fields.fields[fid]; if (!d || d.tag || !askedOnRow(fields, r, fid)) return;
          const f = r.f[fid];
          const required = !d.optional && !standsDown && !optionalType;
          let status = statusOf(f); let text = fieldText(d, f, record);
          const worked = status === 'missing' && result && result.enriched && (result.enriched[p] || []).find(e => e.rowId === r.id && e.field === fid && e.value && e.value.status === 'ok');
          if (worked) { status = 'in'; text = 'Worked out: ' + F.dollarsWhole(worked.value.cents) + ' a month'; } /* MR-096: gross pay from the hourly wage and hours */
          if (!required && (status === 'missing' || status === 'add')) status = 'optional';
          g.items.push(item({ id: 'row:' + r.id + ':' + fid, label: d.label, sub: name, text, status, required, primary: !!(prim && fid === prim.id), rowId: r.id, field: fid, planet: p, type: t.id, href }));
        });
      });
      groups.push(g);
    });
    sections.push({ id: p, label: PLANET_LABELS[p], href: '#/ledger/' + p, derived, groups });
  });

  /* 3. the first call: the form, what is still to confirm, the gut and dream figures */
  const c = confirmItems(record, result || {}, data);
  const callItems = [];
  const disc = record.discovery || null;
  callItems.push(item({ id: 'call:form', label: 'Discovery call form', text: disc ? 'On file' + (disc.at ? ', ' + F.dateLong(String(disc.at).slice(0, 10)) : '') : '', status: disc ? 'in' : 'missing', href: '#/discovery', planet: 'call' }));
  const toConfirm = c.said.length + c.guesses.length;
  callItems.push(item({ id: 'call:confirm', label: 'First-call items confirmed', text: toConfirm ? toConfirm + ' still to confirm' : (disc || c.said.length || c.guesses.length ? 'All confirmed' : 'Nothing to confirm'), status: toConfirm ? 'missing' : 'in', href: '#/callpath', planet: 'call' }));
  const gut = AREAS.filter(a => getAnchor(record, 'gut', 'spending:' + a)).length;
  const dream = AREAS.filter(a => getAnchor(record, 'dream', 'spending:' + a)).length;
  callItems.push(item({ id: 'call:gut', label: 'Gut figures, one per spending area', text: gut + ' of ' + AREAS.length + ' areas', status: gut === AREAS.length ? 'in' : (gut ? 'rough' : 'missing'), href: '#/callpath', planet: 'call' }));
  callItems.push(item({ id: 'call:dream', label: 'Dream figures, one per spending area', text: dream + ' of ' + AREAS.length + ' areas', status: dream === AREAS.length ? 'in' : (dream ? 'rough' : 'missing'), href: '#/callpath', planet: 'call' }));
  sections.push({ id: 'call', label: 'The first call', href: '#/callpath', groups: [{ id: 'call', label: 'The first call', items: callItems }] });

  /* the counts: required items only; rough counts as in but is reported on its own */
  const all = sections.flatMap(s => s.groups.flatMap(g => g.items));
  const count = list => { const req = list.filter(i => i.counts); return { total: req.length, done: req.filter(i => i.done).length, open: req.filter(i => !i.done).length, rough: req.filter(i => i.status === 'rough').length }; };
  sections.forEach(s => { s.groups.forEach(g => Object.assign(g, count(g.items))); Object.assign(s, count(s.groups.flatMap(g => g.items))); });
  const totals = count(all);
  const next = all.find(i => i.counts && !i.done) || null;
  return Object.assign({ sections, items: all, next, complete: totals.open === 0 }, totals);
}
