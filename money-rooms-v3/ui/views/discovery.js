/* The discovery call (Level 8, MR-045; rewritten in MR-073): one scrolling
   script, a chip bar for listening mode, Save applies everything to the
   record through the engine, then the summary sheet. Coach view only. Every
   question is a line to read aloud; under it, a labelled field that says what
   to type and in what unit. Pay is asked hourly or salary first and the rest
   follows; roommates and partners take any number. No math here: parsing and
   deriving happen in engine/discovery.js when the form is saved; the live
   hints under the boxes come from engine/parse.js. */
import { h, clear, qs, todayIso } from '../dom.js';
import * as F from '../../engine/format.js';
import { parseSaid, toMonthly } from '../../engine/parse.js';
import { tierFor, tierLabel } from '../../engine/col.js';
import { discoverySummary } from '../../engine/discovery.js';
import { discoveryEmail } from '../../engine/email.js';
import { clientName } from '../app.js';
import { PLANET_SHORT } from '../../engine/sun.js';
import { segmented } from '../seg.js';

const AREAS = [['accommodation', 'Home (rent or mortgage)'], ['utilities', 'Phone, internet, subscriptions'], ['food', 'Food'], ['transportation', 'Getting around'], ['therapy', 'Health and therapy'], ['wants', 'Fun and wants'], ['irregular', 'Once-a-year things']];
const WORK = [['employed', 'Employed'], ['self-employed', 'Self-employed'], ['between-jobs', 'Between jobs'], ['student', 'Student'], ['retired', 'Retired'], ['mixed', 'A mix']];
const MAX_NAMES = 6; /* names are asked for the first few people; past that only the count matters */
const COUNTS = [[0, 'None'], [1, '1'], [2, '2'], [3, '3']];

function blankPartner() { return { name: '', payType: null, takeHome: '', payFrequency: '' }; }
function blankForm() { return { snapshot: { name: '', birth: '', city: '', dependents: '', workSituation: 'employed', employerType: 'company', employer: '', roommates: 0, roommateNames: [], lease: 'none', partners: [] }, whyNow: '', context: { tried: '', ifNothing: '', bigComing: '', workStyle: null, decisionMakers: '', worthIt: '' }, money: { payType: null, gross: '', hourlyRate: '', hoursPerWeek: '', payFrequency: '', takeHome: '', steadiness: null, contribPct: '', matchKnown: false, match: '', cash: [], invest: [], debt: [] }, spending: { gutTotal: '', areas: {}, phoneFamilyPlan: false }, goals: [], mindset: { stuck: [], avoidsAccounts: false, struggles: [], stress: null }, words: [], tierOverride: null }; }
/* A form saved before MR-073 had one partner as a yes or no and no pay type; it still opens. */
function upgrade(form) {
  const s = form.snapshot; const m = form.money;
  if (!Array.isArray(s.partners)) s.partners = s.partner ? [Object.assign(blankPartner(), { name: s.partnerName || '', takeHome: m.partnerTakeHome || '' })] : [];
  if (s.dependents === undefined || s.dependents === null) s.dependents = '';
  form.context = Object.assign({ tried: '', ifNothing: '', bigComing: '', workStyle: null, decisionMakers: '', worthIt: '' }, form.context || {});
  ['payType', 'steadiness'].forEach(k => { if (m[k] === undefined) m[k] = null; });
  ['hourlyRate', 'hoursPerWeek', 'payFrequency'].forEach(k => { if (m[k] === undefined) m[k] = ''; });
  return form;
}

export function mount(host, app) {
  const D = app.data.discovery; const tiers = app.data.colTiers;
  if (app.route.params.id === 'summary') return mountSummary(host, app);
  const form = upgrade((app.record && app.record.discovery && app.record.discovery.form && !app.record.discovery.applied) ? app.record.discovery.form : blankForm());
  const applied = !!(app.record && app.record.discovery && app.record.discovery.applied);
  host.appendChild(h('header', null, h('h1', null, 'Discovery call'), h('span', { class: 'sub' }, applied ? 'This client already had a discovery call. Open the summary, or start a fresh form for a new client.' : 'Read each question aloud. Type what they say, in their words. Tap the chips while they talk. Save when the call ends.'),
    h('div', { class: 'actions' }, applied ? h('a', { class: 'btn', href: '#/discovery/summary' }, 'Summary') : null, h('button', { class: 'btn primary', 'aria-label': 'Save the discovery call', onClick: save }, applied ? 'Save as a new client' : 'Save and build the first draft'))));
  const chips = h('section', { class: 'panel chipbar-panel' });
  const table = h('section', { class: 'panel discovery' });
  host.appendChild(chips); host.appendChild(table);
  let uid = 0;
  function tierPreview() { return form.tierOverride ? { tier: form.tierOverride, basis: 'override' } : tierFor(form.snapshot.city, null, tiers); }
  function draw() {
    clear(chips); clear(table); uid = 0;
    /* listening mode */
    chips.appendChild(h('h2', null, 'Listening', h('span', { class: 'tag' }, 'tap what you hear, in any order')));
    chips.appendChild(h('div', { class: 'chipbar', role: 'group', 'aria-label': 'Common facts' }, D.chips.map(c => { const on = chipOn(form, c); return h('button', { class: 'chip toggle' + (on ? ' on' : ''), 'aria-pressed': String(on), onClick: () => { applyChip(form, c, !on); draw(); } }, c.label); })));
    const t = tierPreview(); const s = form.snapshot; const m = form.money; const c = form.context;
    const people = (s.roommates || 0) + s.partners.length;
    /* 1. getting to know you */
    sec('snapshot', [
      ask('name', field('name', text('snapshot.name'))),
      ask('birth', field('birth', text('snapshot.birth'))),
      ask('city', field('city', text('snapshot.city', refreshTier), h('div', null, h('div', { class: 'small muted tierline' }, tierLine(t)), h('div', { class: 'row tierchips', role: 'group', 'aria-label': 'Cost-of-living tier' }, ['HCOL', 'MCOL', 'LCOL'].map(tt => h('button', { class: 'chip toggle' + (t.tier === tt ? ' on' : ''), 'aria-pressed': String(t.tier === tt), title: tierLabel(tt, 'client', tiers), onClick: () => { form.tierOverride = form.tierOverride === tt ? null : tt; refreshTier(); } }, tt)))))),
      ask('dependents', field('dependents', number('snapshot.dependents'))),
      ask('work', labelled('Work situation', 'choose one', select('snapshot.workSituation', WORK, 'Work situation', draw))),
      ['employed', 'mixed'].includes(s.workSituation) ? ask('employerType', h('div', { class: 'disc-row' }, labelled('Employer type', 'choose one', select('snapshot.employerType', D.employerTypes, 'Employer type')), field('employer', text('snapshot.employer')))) : null,
      ask('roommates', h('div', null, countControl('Roommates', s.roommates, n => { s.roommates = n; draw(); }, 'roommates'),
        s.roommates ? h('div', { class: 'disc-row' }, Array.from({ length: Math.min(s.roommates, MAX_NAMES) }, (_, i) => field('roommateName', h('input', { class: 'input', type: 'text', style: { width: '140px' }, 'aria-label': 'Roommate ' + (i + 1) + ' name', value: s.roommateNames[i] || '', onChange: e => { s.roommateNames[i] = e.target.value.trim(); } }), null, 'Roommate ' + (i + 1)))) : null)),
      s.roommates ? ask('lease', segmented(D.lease, s.lease, v => { s.lease = v; draw(); }, { label: 'Lease' })) : null,
      ask('partners', h('div', null, countControl('Partners', s.partners.length, n => { while (s.partners.length < n) s.partners.push(blankPartner()); s.partners.length = n; draw(); }, 'partners'),
        s.partners.map((p, i) => partnerBlock(p, i)))),
    ]);
    /* 2. why now */
    sec('why', [
      ask('whyNow', field('whyNow', area('whyNow'))),
      ask('tried', field('tried', area('context.tried'))),
      ask('ifNothing', field('ifNothing', area('context.ifNothing'))),
    ]);
    /* 3. money: the pay type first, then the questions that fit it */
    const varies = m.payType === 'varies';
    sec('money', [
      ask('payType', segmented(D.payTypes, m.payType, v => { m.payType = v; draw(); }, { label: 'Pay type' })),
      m.payType === 'salary' ? ask('salary', said('money.gross', 'salary', { kind: 'income', defaultCadence: 'year' })) : null,
      m.payType === 'hourly' ? ask('hourlyRate', said('money.hourlyRate', 'hourlyRate', { defaultCadence: 'oneoff' })) : null,
      m.payType === 'hourly' ? ask('hoursPerWeek', field('hoursPerWeek', number('money.hoursPerWeek'))) : null,
      varies ? ask('variesGross', said('money.gross', 'variesGross', { kind: 'income', defaultCadence: 'month' })) : null,
      !m.payType ? ask('salary', said('money.gross', 'salary', { kind: 'income' })) : null,
      m.payType && !varies ? ask('payFrequency', labelled('Pay frequency', 'choose one', select('money.payFrequency', [['', 'Not asked yet']].concat(D.payFrequencies), 'Pay frequency'))) : null,
      varies ? ask('takeHomeMonth', said('money.takeHome', 'takeHomeMonth', { kind: 'income', defaultCadence: 'month' })) : ask('takeHome', said('money.takeHome', 'takeHome', { kind: 'income', defaultCadence: 'paycheck' })),
      ask('steadiness', segmented(D.steadiness, m.steadiness, v => { m.steadiness = v; draw(); }, { label: 'Steadiness' })),
      ask('contrib', h('div', { class: 'disc-row' }, field('contribPct', text('money.contribPct')), h('label', { class: 'small check' }, h('input', { type: 'checkbox', checked: m.matchKnown, onChange: e => { m.matchKnown = e.target.checked; } }), ' There is a match'), field('match', text('money.match')))),
      ask('cash', listRows('Cash and savings accounts', 'money.cash', 'accountName', 'balance', 'Add an account')),
      ask('invest', listRows('Investment and retirement accounts', 'money.invest', 'accountName', 'balance', 'Add an account')),
      ask('debt', listRows('Debts', 'money.debt', 'debtName', 'debtBalance', 'Add a debt')),
      ask('bigComing', field('bigComing', area('context.bigComing'))),
    ]);
    /* 4. spending */
    sec('spending', [
      ask('gutTotal', said('spending.gutTotal', 'gutTotal', {})),
      h('div', { class: 'disc-areas' }, AREAS.map(([cat, label]) => { form.spending.areas[cat] = form.spending.areas[cat] || { said: '', shared: false }; const a = form.spending.areas[cat]; const box = saidBox(v => { a.said = v; }, a.said, label, {}); return h('div', { class: 'disc-field' }, h('label', { class: 'disc-label', for: idFor(box) }, label, h('span', { class: 'unit' }, D.fields.area.unit)), h('div', { class: 'disc-row' }, box, (cat === 'accommodation' || cat === 'utilities') && people ? h('label', { class: 'small check' }, h('input', { type: 'checkbox', checked: a.shared, onChange: e => { a.shared = e.target.checked; } }), ' shared with the household') : null)); })),
      h('label', { class: 'small check' }, h('input', { type: 'checkbox', checked: form.spending.phoneFamilyPlan, onChange: e => { form.spending.phoneFamilyPlan = e.target.checked; } }), ' Phone is on a family plan (counts as $0)'),
    ]);
    /* 5. goals */
    sec('goals', [
      ask('goals', h('div', null, h('div', { class: 'goal-cards' }, form.goals.map((g, i) => h('div', { class: 'goal-card' },
        field('goal', h('input', { class: 'input wide', 'aria-label': 'Goal ' + (i + 1), value: g.text, onChange: e => { g.text = e.target.value.trim(); } })),
        h('div', { class: 'disc-row' },
          field('goalWhen', h('input', { class: 'input', style: { width: '130px' }, 'aria-label': 'Goal ' + (i + 1) + ' when', value: g.when || '', onChange: e => { g.when = e.target.value.trim(); } })),
          field('goalAmount', h('input', { class: 'input num', style: { width: '130px' }, 'aria-label': 'Goal ' + (i + 1) + ' amount', value: g.amount || '', onChange: e => { g.amount = e.target.value.trim(); } }))),
        h('button', { class: 'btn small quiet', onClick: () => { form.goals.splice(i, 1); draw(); } }, 'Remove')))),
        h('button', { class: 'btn small', style: { marginTop: '8px' }, onClick: () => { form.goals.push({ text: '', when: '', amount: '' }); draw(); } }, 'Add a goal'))),
    ]);
    /* 6. mindset */
    sec('mindset', [
      ask('stuck', chipset(D.stuck, form.mindset.stuck)),
      ask('avoids', segmented([[true, 'Yes'], [false, 'No']], form.mindset.avoidsAccounts, v => { form.mindset.avoidsAccounts = v; draw(); }, { label: 'Avoids accounts' })),
      ask('struggle', chipset(D.struggles, form.mindset.struggles)),
      ask('stress', h('div', { class: 'row taps stress-scale', role: 'group', 'aria-label': 'Money stress, one to ten' }, Array.from({ length: 10 }, (_, k) => h('button', { class: 'btn small' + (form.mindset.stress === k + 1 ? ' primary' : ''), 'aria-pressed': String(form.mindset.stress === k + 1), onClick: () => { form.mindset.stress = k + 1; draw(); } }, String(k + 1))))),
    ]);
    /* 7. how we would work together */
    sec('fit', [
      ask('workStyle', segmented(D.workStyles, c.workStyle, v => { c.workStyle = v; draw(); }, { label: 'Cadence' })),
      ask('decisionMakers', field('decisionMakers', text('context.decisionMakers'))),
      ask('worthIt', field('worthIt', area('context.worthIt'))),
    ]);
    /* 8. their words */
    sec('words', [
      h('div', null, form.words.map((w, i) => h('div', { class: 'disc-row', style: { marginBottom: '4px' } }, h('input', { class: 'input wide', 'aria-label': 'Quote ' + (i + 1), value: w, onChange: e => { form.words[i] = e.target.value; } }), h('button', { class: 'btn small quiet', onClick: () => { form.words.splice(i, 1); draw(); } }, 'Remove'))), h('button', { class: 'btn small', onClick: () => { form.words.push(''); draw(); } }, 'Add a quote')),
    ]);
  }
  /* ---- building blocks ---- */
  function sec(id, body) { table.appendChild(h('div', { class: 'disc-section' }, h('h3', null, D.sections[id]), D.intros && D.intros[id] ? h('p', { class: 'small muted disc-intro' }, D.intros[id]) : null, body)); }
  /* a question to read aloud, then the control under it */
  function ask(key, control) { return h('div', { class: 'disc-q' }, h('p', { class: 'readaloud' }, D.questions[key]), h('div', { class: 'disc-answer' }, control)); }
  function idFor(node) { const el = node.matches && node.matches('input, select, textarea') ? node : node.querySelector('input, select, textarea'); if (el && !el.id) el.id = 'disc-' + (++uid); return el ? el.id : null; }
  /* a labelled field: the label says what to type, the unit says in what, the example shows one */
  function field(fkey, control, extra, labelOverride) {
    const f = D.fields[fkey]; const id = idFor(control);
    const el = control.matches && control.matches('input, select, textarea') ? control : control.querySelector('input, select, textarea');
    if (el && !el.getAttribute('aria-label')) el.setAttribute('aria-label', labelOverride || f.label);
    return h('div', { class: 'disc-field' }, h('label', { class: 'disc-label', for: id }, labelOverride || f.label, f.unit ? h('span', { class: 'unit' }, f.unit) : null), control, extra || null, f.example ? h('span', { class: 'small muted example' }, 'Example: ' + f.example) : null);
  }
  function labelled(label, unit, control) { const id = idFor(control); return h('div', { class: 'disc-field' }, h('label', { class: 'disc-label', for: id }, label, unit ? h('span', { class: 'unit' }, unit) : null), control); }
  /* None, 1, 2, 3, or any number typed */
  function countControl(label, current, onPick, fkey) {
    const input = h('input', { class: 'input num', type: 'number', min: '0', max: '20', step: '1', style: { width: '90px' }, 'aria-label': D.fields[fkey].label, value: current ? String(current) : '', onChange: e => { const n = Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0)); onPick(n); } });
    return h('div', { class: 'disc-row' }, segmented(COUNTS, current, onPick, { label }), h('span', { class: 'small muted' }, 'or'), labelled(D.fields[fkey].label, D.fields[fkey].unit, input));
  }
  function partnerBlock(p, i) {
    const who = p.name || 'Partner ' + (i + 1); const varies = p.payType === 'varies';
    return h('div', { class: 'disc-sub' }, h('h4', null, who),
      field('partnerName', h('input', { class: 'input', type: 'text', style: { width: '160px' }, 'aria-label': 'Partner ' + (i + 1) + ' name', value: p.name || '', onChange: e => { p.name = e.target.value.trim(); draw(); } }), null, 'Partner ' + (i + 1) + ' name'),
      ask('partnerPayType', segmented(D.payTypes, p.payType, v => { p.payType = v; draw(); }, { label: 'Partner ' + (i + 1) + ' pay type' })),
      ask('partnerTakeHome', h('div', { class: 'disc-row' }, field(varies ? 'takeHomeMonth' : 'partnerTakeHome', saidBox(v => { p.takeHome = v; }, p.takeHome, 'Partner ' + (i + 1) + ' take-home', { kind: 'income', defaultCadence: varies ? 'month' : 'paycheck' }), null, who + "'s take-home"),
        varies ? null : labelled('Pay frequency', 'choose one', h('select', { class: 'select', 'aria-label': 'Partner ' + (i + 1) + ' pay frequency', onChange: e => { p.payFrequency = e.target.value; } }, [['', 'Not asked yet']].concat(D.payFrequencies).map(o => h('option', { value: o[0], selected: (p.payFrequency || '') === o[0] }, o[1])))))),
      h('button', { class: 'btn small quiet', onClick: () => { form.snapshot.partners.splice(i, 1); draw(); } }, 'Remove this partner'));
  }
  function tierLine(t) { return form.snapshot.city ? (t.basis === 'metro' ? t.metroLabel + ' metro, ' : t.basis === 'state-nonmetro' ? 'outside a metro, ' : t.basis === 'override' ? 'your call, ' : '') + tierLabel(t.tier, 'coach', tiers) + ' (' + tierLabel(t.tier, 'client', tiers) + ')' : 'The cost-of-living tier comes from the city.'; }
  /* the tier line and chips update in place as the city is typed; the form itself is never rebuilt under the cursor (D-034) */
  function refreshTier() { const t = tierPreview(); const line = table.querySelector('.tierline'); if (line) line.textContent = tierLine(t); table.querySelectorAll('.tierchips button').forEach(b => { const on = b.textContent === t.tier; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }
  function get(path) { return path.split('.').reduce((o, k) => (o || {})[k], form); }
  function put(path, v) { const ks = path.split('.'); let o = form; ks.slice(0, -1).forEach(k => { o = o[k]; }); o[ks[ks.length - 1]] = v; }
  function text(path, after) { return h('input', { class: 'input wide', type: 'text', value: get(path) || '', onChange: e => { put(path, e.target.value.trim()); if (after) after(); } }); }
  function number(path) { return h('input', { class: 'input num', type: 'number', min: '0', step: '1', style: { width: '110px' }, value: get(path) === null || get(path) === undefined ? '' : String(get(path)), onChange: e => put(path, e.target.value.trim()) }); }
  function area(path) { return h('textarea', { class: 'input wide', value: get(path) || '', onChange: e => put(path, e.target.value.trim()) }); }
  function select(path, options, label, after) { return h('select', { class: 'select', 'aria-label': label, onChange: e => { put(path, e.target.value); if (after) after(); } }, options.map(o => h('option', { value: o[0], selected: (get(path) || '') === o[0] }, o[1]))); }
  function saidBox(onSet, value, label, opts) {
    const wrap = h('span', { class: 'saidbox' });
    const input = h('input', { class: 'input wide', type: 'text', 'aria-label': label, value: value || '' });
    const hint = h('span', { class: 'small muted heard' });
    const show = v => { const p = parseSaid(v, opts); hint.textContent = !v ? '' : !p ? 'Did not catch a number' : p.unknown ? 'Unknown, goes on their plate' : p.none ? 'None' : F.dollarsWhole(p.cents) + (p.cadence === 'paycheck' ? ' a paycheck (' + F.dollarsWhole(toMonthly(p.cents, 'paycheck', p.payFrequency)) + ' a month)' : p.cadence === 'week' ? ' a week' : p.cadence === 'year' ? ' a year' : p.cadence === 'oneoff' ? '' : ' a month') + (p.state === 'rough' ? ', rough' : '') + (p.split ? ', your share ' + F.dollarsWhole(p.share) : ''); };
    input.addEventListener('input', () => show(input.value)); input.addEventListener('change', e => { onSet(e.target.value.trim()); show(e.target.value); });
    show(value); wrap.appendChild(input); wrap.appendChild(hint); return wrap;
  }
  function said(path, fkey, opts) { return field(fkey, saidBox(v => put(path, v), get(path), D.fields[fkey].label, opts || {})); }
  function listRows(title, path, nameKey, balanceKey, addLabel) {
    const list = get(path);
    return h('div', { class: 'disc-list' }, list.map((it, i) => h('div', { class: 'disc-row', style: { marginBottom: '6px' } },
      field(nameKey, h('input', { class: 'input', type: 'text', style: { width: '180px' }, 'aria-label': title + ' ' + (i + 1) + ' name', value: it.name || '', onChange: e => { it.name = e.target.value.trim(); } })),
      field(balanceKey, saidBox(v => { it.said = v; }, it.said, title + ' ' + (i + 1) + ' balance', {})),
      h('label', { class: 'small check' }, h('input', { type: 'checkbox', checked: !!it.known, onChange: e => { it.known = e.target.checked; } }), ' they know this one for sure'),
      h('button', { class: 'btn small quiet', onClick: () => { list.splice(i, 1); draw(); } }, 'Remove'))),
      h('button', { class: 'btn small', onClick: () => { list.push({ name: '', said: '', known: false }); draw(); } }, addLabel));
  }
  function chipset(options, arr) { return h('div', { class: 'chipbar' }, options.map(o => { const on = arr.includes(o[0]); return h('button', { class: 'chip toggle' + (on ? ' on' : ''), 'aria-pressed': String(on), onClick: () => { if (on) arr.splice(arr.indexOf(o[0]), 1); else arr.push(o[0]); draw(); } }, o[1]); })); }
  function save() {
    if (!form.snapshot.name) { app.toast('A name first, so the file has one.'); return; }
    if (!app.record || applied) app.newClient(form.snapshot.name);
    app.discovery(form);
    app.toast('Saved. The first draft is built.');
    location.hash = '#/discovery/summary';
  }
  draw();
  return { update() {} };
}

function chipOn(form, c) { return Object.keys(c.writes).every(k => { const v = c.writes[k]; if (k === 'sun.workSituation') return form.snapshot.workSituation === v; if (k === 'sun.filingStatus') return form.snapshot.filingStatus === v; if (k === 'sun.dependents') return String(form.snapshot.dependents) === String(v); if (k === 'household.roommates') return form.snapshot.roommates === v; if (k === 'household.partners') return form.snapshot.partners.length >= v; if (k === 'household.lease') return form.snapshot.lease === v; if (k === 'spending.phone') return form.spending.phoneFamilyPlan === true; if (k === 'income.matchKnown') return form.money.matchKnown === true; if (k === 'income.payType') return form.money.payType === v; if (k === 'mindset.avoidsAccounts') return form.mindset.avoidsAccounts === true; if (k === 'goal') return form.goals.some(g => g.text === v); return false; }); }
function applyChip(form, c, on) { Object.keys(c.writes).forEach(k => { const v = c.writes[k]; if (k === 'sun.workSituation') form.snapshot.workSituation = on ? v : 'employed'; else if (k === 'sun.filingStatus') form.snapshot.filingStatus = on ? v : undefined; else if (k === 'sun.dependents') form.snapshot.dependents = on ? String(v) : ''; else if (k === 'household.roommates') form.snapshot.roommates = on ? v : 0; else if (k === 'household.partners') { if (on) { while (form.snapshot.partners.length < v) form.snapshot.partners.push(blankPartner()); } else form.snapshot.partners.length = 0; } else if (k === 'household.lease') form.snapshot.lease = on ? v : 'none'; else if (k === 'spending.phone') form.spending.phoneFamilyPlan = on; else if (k === 'income.matchKnown') form.money.matchKnown = on; else if (k === 'income.payType') form.money.payType = on ? v : null; else if (k === 'mindset.avoidsAccounts') form.mindset.avoidsAccounts = on; else if (k === 'goal') { if (on) form.goals.push({ text: v, when: '', amount: '' }); else form.goals = form.goals.filter(g => g.text !== v); } }); }

/* ---- the summary sheet ---- */
function mountSummary(host, app) {
  if (!app.record || !app.record.discovery) { host.appendChild(h('header', null, h('h1', null, 'Discovery summary'))); host.appendChild(h('div', { class: 'empty' }, h('h2', null, 'No discovery call yet'), h('p', null, h('a', { class: 'next', href: '#/discovery' }, 'Start one')))); return { update() {} }; }
  const tiers = app.data.colTiers;
  host.appendChild(h('header', { class: 'no-print' }, h('h1', null, 'Discovery summary'), h('span', { class: 'sub' }, 'What we know, what we guessed, and how to run session 1.'), h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/discovery' }, 'Back to the form'), h('a', { class: 'btn', href: '#/call' }, 'Start session 1'), h('button', { class: 'btn primary', onClick: () => window.print() }, 'Print'))));
  const sheet = h('article', { class: 'onepager discovery-summary' }); host.appendChild(sheet);
  const emailPanel = h('section', { class: 'panel no-print' }); host.appendChild(emailPanel);
  function draw() {
    clear(sheet); clear(emailPanel);
    const s = discoverySummary(app.record, app.result, app.data); const hh = s.snapshot.household; const d = c => c === null || c === undefined ? 'needs inputs' : F.dollarsWhole(c);
    sheet.appendChild(h('header', { class: 'op-head' }, h('div', null, h('h2', { class: 'op-title' }, (s.snapshot.name || 'Household') + ', discovery call'), h('div', { class: 'muted small' }, s.whyNow || '')), h('div', { class: 'op-meta' }, F.dateLong(app.result.today), h('br'), 'Mode: ' + (s.howToRun.mode === 'gentle' ? 'gentle' : 'standard'))));
    sheet.appendChild(h('section', null, h('h3', null, 'Snapshot'), h('p', null, [s.snapshot.age !== null ? 'Age ' + s.snapshot.age : null, s.snapshot.city ? s.snapshot.city + (s.snapshot.state ? ', ' + s.snapshot.state : '') : null, s.snapshot.work || null, s.snapshot.tier ? tierLabel(s.snapshot.tier.tier, 'coach', tiers) + ' (' + s.snapshot.tierWord + (s.snapshot.tier.basis === 'metro' ? ', ' + s.snapshot.tier.metroLabel : s.snapshot.tier.outsideMetro ? ', outside a metro' : '') + ')' : null, s.partners.length ? (s.partners.length === 1 ? 'partner' : s.partners.length + ' partners') + (s.partners.some(p => p.nickname) ? ' (' + s.partners.map(p => p.nickname || 'unnamed').join(', ') + ')' : '') + ((hh.basis || 'together') === 'together' ? ', money counted together' : ', just their own money counted') : null, hh.roommates.length ? hh.roommates.length + (hh.roommates.length === 1 ? ' roommate' : ' roommates') + (hh.roommates[0].nickname ? ' (' + hh.roommates.map(r => r.nickname).filter(Boolean).join(', ') + ')' : '') + ', lease ' + ({ mine: 'in their name only', both: 'in both names', theirs: 'in the roommate\'s name', none: 'none' }[hh.lease] || hh.lease) : hh.partner ? null : 'lives alone'].filter(Boolean).join('. ') + '.'),
      h('div', { class: 'row no-print tierchips' }, h('span', { class: 'small muted' }, 'Tier: '), ['HCOL', 'MCOL', 'LCOL'].map(tt => h('button', { class: 'chip toggle' + (s.snapshot.tier && s.snapshot.tier.tier === tt ? ' on' : ''), 'aria-pressed': String(!!(s.snapshot.tier && s.snapshot.tier.tier === tt)), onClick: () => app.colTier(s.snapshot.tier && s.snapshot.tier.tier === tt && s.snapshot.tier.source === 'client' ? null : { tier: tt, source: 'client' }) }, tt)), h('span', { class: 'small muted' }, s.snapshot.tier && s.snapshot.tier.source === 'client' ? 'your call; tap again to go back to the city' : 'from the city'))));
    if (s.pay && s.pay.type) sheet.appendChild(h('p', { class: 'small muted' }, 'Pay: ' + (s.pay.type === 'hourly' ? 'hourly' + (s.pay.hourly ? ', ' + F.dollars(s.pay.hourly.rateCents) + ' an hour, about ' + s.pay.hourly.hoursPerWeek + ' hours a week' : '') : s.pay.type === 'salary' ? 'salary' : 'it varies') + (s.pay.frequency ? ', paid ' + ({ weekly: 'weekly', biweekly: 'every two weeks', semimonthly: 'twice a month', monthly: 'monthly' }[s.pay.frequency] || s.pay.frequency) : '') + (s.pay.steadiness ? ', ' + ({ steady: 'steady', variable: 'up and down', 'at-risk': 'at risk' }[s.pay.steadiness] || s.pay.steadiness) : '') + '.'));
    if (s.words.length) sheet.appendChild(h('section', null, h('h3', null, 'Their words'), h('ul', null, s.words.map(w => h('li', null, '"' + w + '"')))));
    /* MR-073: what they tried, what happens if nothing changes, what is coming, who else weighs in, what would make it worth it */
    const ctx = s.context || {}; const ctxLines = [['Tried before', ctx.tried], ['If nothing changes', ctx.ifNothing], ['Coming up', ctx.bigComing], ['Who else weighs in', ctx.decisionMakers], ['Worth it when', ctx.worthIt], ['Cadence', ctx.workStyle ? ({ weekly: 'a weekly check-in', biweekly: 'every two weeks', monthly: 'a monthly sit-down' }[ctx.workStyle] || ctx.workStyle) : '']].filter(x => x[1]);
    if (ctxLines.length) sheet.appendChild(h('section', null, h('h3', null, 'Context'), h('ul', null, ctxLines.map(([k, v]) => h('li', null, h('strong', null, k + ': '), v)))));
    sheet.appendChild(h('section', null, h('h3', null, 'Numbers so far'), h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Item'), h('th', null, 'What they said'), h('th', null, 'Status'), h('th', null, 'Next step'), h('th', null, 'Plate'))), h('tbody', null, s.numbers.slice(0, 40).map(n => h('tr', { class: n.status === 'guess' ? 'guess-row' : null }, h('td', null, n.item), h('td', null, n.said === 'Guess' ? h('span', { class: 'chip src src-estimated' }, 'Guess') : n.said), h('td', { class: 'small muted' }, n.status === 'guess' ? 'guess' : n.status), h('td', { class: 'small' }, n.next), h('td', { class: 'small muted' }, n.plate === 'mine' ? 'mine' : n.plate === 'theirs' ? 'theirs' : ''))))))));
    sheet.appendChild(h('section', null, h('h3', null, 'Goals'), s.goals.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Goal'), h('th', null, 'When'), h('th', null, 'How it will be measured'), h('th', null, 'What is needed'))), h('tbody', null, s.goals.map(g => h('tr', null, h('td', null, g.goal), h('td', null, g.when), h('td', { class: 'small' }, g.measure), h('td', { class: 'small' }, g.needs)))))) : h('p', { class: 'muted small' }, 'None captured.')));
    sheet.appendChild(h('section', null, h('h3', null, 'How to run sessions'), h('p', null, 'Mode: ' + s.howToRun.mode + (s.howToRun.avoidsAccounts ? ' (avoids looking at accounts)' : '') + '. ' + (s.howToRun.struggles.length ? 'Struggles: ' + s.howToRun.struggles.join(', ') + '. ' : '') + (s.howToRun.stuck.length ? 'Stuck on: ' + s.howToRun.stuck.join(', ') + '. ' : '')), s.howToRun.openQuestions.length ? h('p', null, h('strong', null, 'They asked: '), s.howToRun.openQuestions.join(' ')) : null));
    const fd = s.firstDraft;
    sheet.appendChild(h('section', null, h('h3', null, 'First draft', h('span', { class: 'tag' }, 'Includes ' + fd.guesses + (fd.guesses === 1 ? ' guess' : ' guesses'))), h('div', { class: 'kpis first-draft' }, [['Take-home a month', d(fd.takeHome)], ['Spending a month', d(fd.spending)], ['FI number', d(fd.fiNumber)], ['FI date', fd.fiDate ? F.date(fd.fiDate) + (fd.fiAge ? ', age ' + fd.fiAge : '') : 'not before 95 on this draft'], ['Cushion target', d(fd.cushion) + (fd.roommateGap ? ' incl. ' + F.dollarsWhole(fd.roommateGap) + ' roommate gap' : '')]].map(([l, v]) => h('div', { class: 'kpi' }, h('div', { class: 'label' }, l), h('div', { class: 'value rough' }, v)))), h('p', { class: 'small muted' }, 'Rough, with guesses. ', h('button', { class: 'linklike no-print', onClick: () => app.openDrawer(guessList(app)) }, 'See the guesses'))));
    if (s.roommate && !s.roommate.needs) sheet.appendChild(h('section', null, h('h3', null, 'If it all falls on you'), h('p', null, 'Shared bills would go from ' + F.dollarsWhole(s.roommate.newSharedMonthly - s.roommate.jumpMonthly) + ' to ' + F.dollarsWhole(s.roommate.newSharedMonthly) + ' a month, a jump of ' + F.dollarsWhole(s.roommate.jumpMonthly) + '. Covering ' + s.roommate.months + ' months takes about ' + F.dollarsWhole(s.roommate.bridge) + '. Cash covers ' + (s.roommate.cushionMonthsNow !== null ? s.roommate.cushionMonthsNow + ' months as now, ' + s.roommate.cushionMonthsAtNewCost + ' months at the new cost.' : 'an unknown number of months.') + ' ' + s.roommate.leaseNote)));
    sheet.appendChild(h('section', null, h('h3', null, 'Proposed Session 1 agenda'), h('ol', null, s.agenda.map(a => h('li', null, a.step, h('span', { class: 'muted small' }, ' (' + a.why + ')'))))));
    if (s.notes.length || (s.checks.takeHome && !s.checks.takeHome.agree)) sheet.appendChild(h('section', { class: 'no-print' }, h('h3', null, 'Notes for the coach'), h('ul', null, s.notes.map(n => h('li', { class: 'small' }, n)), s.checks.takeHome && !s.checks.takeHome.agree ? h('li', { class: 'small' }, 'Take-home said (' + F.dollarsWhole(s.checks.takeHome.said) + ' a month) is ' + Math.round(s.checks.takeHome.pct * 100) + '% off what gross implies (' + F.dollarsWhole(s.checks.takeHome.inferred) + '). Worth a question.') : null)));
    /* the email */
    const text = discoveryEmail(app.record, s);
    emailPanel.appendChild(h('h2', null, 'Follow-up email', h('span', { class: 'tag' }, 'after the discovery call')));
    const ta = h('textarea', { class: 'input email', readOnly: true, 'aria-label': 'Discovery follow-up email', value: text }); emailPanel.appendChild(ta);
    emailPanel.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn', onClick: () => { ta.select(); document.execCommand('copy'); app.toast('Email copied'); } }, 'Copy')));
  }
  draw();
  return { update() { draw(); } };
}

export function guessList(app) {
  const g = app.result.guesses; const tiers = app.data.colTiers; const tier = app.result.colTier;
  return h('div', null, h('h2', null, 'The guesses'), h('p', { class: 'small muted' }, 'Averages for a ' + (tier ? tierLabel(tier.tier, 'client', tiers) : 'average cost area') + ', not this household\'s numbers. Each one is on my plate to replace.'),
    h('table', { class: 'data math-table' }, h('tbody', null, g.rows.map(r => h('tr', null, h('td', null, r.name), h('td', { class: 'num' }, F.dollarsWhole(r.cents || 0) + (r.shared ? ' (full bill, shared)' : '')), h('td', { class: 'small muted' }, 'Guess' + (r.tier ? ', ' + r.tier : '')))))),
    h('p', { style: { marginTop: '8px' } }, h('a', { class: 'btn small', href: '#/call' }, 'Swap them in Confirm')));
}
