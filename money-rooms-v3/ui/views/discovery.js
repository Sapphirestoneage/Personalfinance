/* The discovery call (Level 8, MR-045): one scrolling table, a chip bar for
   listening mode, Save applies everything to the record through the engine,
   then the summary sheet. Coach view only. No math here: parsing and
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

const AREAS = [['accommodation', 'Home (rent or mortgage)'], ['utilities', 'Phone, internet, subscriptions'], ['food', 'Food'], ['transportation', 'Getting around'], ['therapy', 'Health and therapy'], ['wants', 'Fun and wants'], ['irregular', 'Once-a-year things']];
const WORK = [['employed', 'Employed'], ['self-employed', 'Self-employed'], ['between-jobs', 'Between jobs'], ['student', 'Student'], ['retired', 'Retired'], ['mixed', 'A mix']];

function blankForm() { return { snapshot: { name: '', birth: '', city: '', workSituation: 'employed', employerType: 'company', employer: '', roommates: 0, roommateNames: [], lease: 'none', partner: false, partnerName: '' }, whyNow: '', money: { gross: '', takeHome: '', partnerTakeHome: '', contribPct: '', matchKnown: false, match: '', cash: [], invest: [], debt: [] }, spending: { gutTotal: '', areas: {}, phoneFamilyPlan: false }, goals: [], mindset: { stuck: [], avoidsAccounts: false, struggles: [], stress: null }, words: [], tierOverride: null }; }

export function mount(host, app) {
  const D = app.data.discovery; const tiers = app.data.colTiers;
  if (app.route.params.id === 'summary') return mountSummary(host, app);
  let form = (app.record && app.record.discovery && app.record.discovery.form && !app.record.discovery.applied) ? app.record.discovery.form : blankForm();
  const applied = !!(app.record && app.record.discovery && app.record.discovery.applied);
  host.appendChild(h('header', null, h('h1', null, 'Discovery call'), h('span', { class: 'sub' }, applied ? 'This client already had a discovery call. Open the summary, or start a fresh form for a new client.' : 'Type what they say, in their words. Tap the chips while they talk. Save when the call ends.'),
    h('div', { class: 'actions' }, applied ? h('a', { class: 'btn', href: '#/discovery/summary' }, 'Summary') : null, h('button', { class: 'btn primary', 'aria-label': 'Save the discovery call', onClick: save }, applied ? 'Save as a new client' : 'Save and build the first draft'))));
  const chips = h('section', { class: 'panel chipbar-panel' });
  const table = h('section', { class: 'panel discovery' });
  host.appendChild(chips); host.appendChild(table);
  const hints = {};
  function tierPreview() { const t = form.tierOverride ? { tier: form.tierOverride, basis: 'override' } : tierFor(form.snapshot.city, null, tiers); return t; }
  function draw() {
    clear(chips); clear(table);
    /* listening mode */
    chips.appendChild(h('h2', null, 'Listening', h('span', { class: 'tag' }, 'tap what you hear, in any order')));
    chips.appendChild(h('div', { class: 'chipbar', role: 'group', 'aria-label': 'Common facts' }, D.chips.map(c => { const on = chipOn(form, c); return h('button', { class: 'chip toggle' + (on ? ' on' : ''), 'aria-pressed': String(on), onClick: () => { applyChip(form, c, !on); draw(); } }, c.label); })));
    /* the table */
    const sec = (title, body) => table.appendChild(h('div', { class: 'disc-section' }, h('h3', null, title), body));
    const t = tierPreview();
    sec(D.sections.snapshot, h('div', null,
      row(D.questions.name, text('snapshot.name', 'Name', 'How they want to be called')),
      row(D.questions.birth, text('snapshot.birth', 'Birth date or age', '27, 1999, or 1999-03-14')),
      row(D.questions.city, h('div', null, text('snapshot.city', 'City', '', refreshTier), h('div', { class: 'small muted tierline' }, tierLine(t)), h('div', { class: 'row tierchips', role: 'group', 'aria-label': 'Cost-of-living tier' }, ['HCOL', 'MCOL', 'LCOL'].map(tt => h('button', { class: 'chip toggle' + (t.tier === tt ? ' on' : ''), 'aria-pressed': String(t.tier === tt), title: tierLabel(tt, 'client', tiers), onClick: () => { form.tierOverride = form.tierOverride === tt ? null : tt; refreshTier(); } }, tt))))),
      row(D.questions.work, select('snapshot.workSituation', WORK, 'Work situation')),
      row(D.questions.employerType, h('div', { class: 'row' }, select('snapshot.employerType', D.employerTypes, 'Employer type'), text('snapshot.employer', 'Employer, optional'))),
      row(D.questions.roommates, h('div', { class: 'row' }, h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Roommates' }, [0, 1, 2, 3].map(n => h('button', { 'aria-pressed': String(form.snapshot.roommates === n), onClick: () => { form.snapshot.roommates = n; draw(); } }, n === 0 ? 'None' : String(n)))), form.snapshot.roommates ? Array.from({ length: form.snapshot.roommates }, (_, i) => h('input', { class: 'input', style: { width: '120px' }, 'aria-label': 'Roommate ' + (i + 1) + ' nickname, optional', value: form.snapshot.roommateNames[i] || '', onChange: e => { form.snapshot.roommateNames[i] = e.target.value.trim(); } })) : null)),
      row(D.questions.partner, h('div', { class: 'row' }, h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Partner' }, [[false, 'No'], [true, 'Yes']].map(([v, l]) => h('button', { 'aria-pressed': String(form.snapshot.partner === v), onClick: () => { form.snapshot.partner = v; draw(); } }, l))), form.snapshot.partner ? h('input', { class: 'input', style: { width: '140px' }, 'aria-label': 'Partner nickname, optional', value: form.snapshot.partnerName || '', onChange: e => { form.snapshot.partnerName = e.target.value.trim(); } }) : null)),
      form.snapshot.roommates ? row(D.questions.lease, h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Lease' }, D.lease.map(l => h('button', { 'aria-pressed': String(form.snapshot.lease === l[0]), onClick: () => { form.snapshot.lease = l[0]; draw(); } }, l[1])))) : null));
    sec(D.sections.why, row(D.questions.whyNow, area('whyNow', 'Why now')));
    sec(D.sections.money, h('div', null,
      row(D.questions.gross, said('money.gross', 'Pay before tax', { kind: 'income' })),
      row(D.questions.takeHome, said('money.takeHome', 'Take-home', { kind: 'income', defaultCadence: 'paycheck' })),
      form.snapshot.partner ? row(D.questions.partnerTakeHome, said('money.partnerTakeHome', "Partner's take-home", { kind: 'income', defaultCadence: 'paycheck' })) : null,
      row(D.questions.contrib, h('div', { class: 'row' }, text('money.contribPct', 'Contribution percent', '4%'), h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: form.money.matchKnown, onChange: e => { form.money.matchKnown = e.target.checked; } }), ' There is a match'), text('money.match', 'Match, if known', '100% up to 4%'))),
      listRows('Cash and savings accounts', 'money.cash', 'Savings, Venmo, checking', 'rough balance'),
      listRows('Investment accounts', 'money.invest', '401k, Roth IRA', 'rough balance or "will send"'),
      listRows('Debts', 'money.debt', 'Credit card, student loan', 'rough balance or "not given"')));
    sec(D.sections.spending, h('div', null,
      row(D.questions.gutTotal, said('spending.gutTotal', 'Spending a month, their guess')),
      h('p', { class: 'small muted' }, 'Only what they volunteer. Anything left blank gets a guess for their cost area.'),
      AREAS.map(([cat, label]) => { form.spending.areas[cat] = form.spending.areas[cat] || { said: '', shared: false }; const a = form.spending.areas[cat]; return h('div', { class: 'fieldrow disc-row' }, h('label', null, label), h('div', { class: 'control' }, saidBox(v => { a.said = v; }, a.said, label, {})), h('span', { class: 'src small' }, (cat === 'accommodation' || cat === 'utilities') && form.snapshot.roommates ? h('label', null, h('input', { type: 'checkbox', checked: a.shared, onChange: e => { a.shared = e.target.checked; } }), ' shared') : '')); }),
      h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: form.spending.phoneFamilyPlan, onChange: e => { form.spending.phoneFamilyPlan = e.target.checked; } }), ' Phone on a family plan (0)')));
    sec(D.sections.goals, h('div', null, h('div', { class: 'goal-cards' }, form.goals.map((g, i) => h('div', { class: 'goal-card' }, h('input', { class: 'input', 'aria-label': 'Goal', value: g.text, onChange: e => { g.text = e.target.value.trim(); } }), h('div', { class: 'row' }, h('input', { class: 'input', style: { width: '110px' }, 'aria-label': 'When, optional', value: g.when || '', title: 'April, next September, 2027-06', onChange: e => { g.when = e.target.value.trim(); } }), h('input', { class: 'input num', style: { width: '110px' }, 'aria-label': 'Amount, optional', value: g.amount || '', onChange: e => { g.amount = e.target.value.trim(); } }), h('button', { class: 'btn small quiet', onClick: () => { form.goals.splice(i, 1); draw(); } }, 'Remove'))))), h('button', { class: 'btn small', onClick: () => { form.goals.push({ text: '', when: '', amount: '' }); draw(); } }, 'Add a goal')));
    sec(D.sections.mindset, h('div', null,
      row(D.questions.stuck, chipset(D.stuck, form.mindset.stuck)),
      row(D.questions.avoids, h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Avoids accounts' }, [[true, 'Yes'], [false, 'No']].map(([v, l]) => h('button', { 'aria-pressed': String(form.mindset.avoidsAccounts === v), onClick: () => { form.mindset.avoidsAccounts = v; draw(); } }, l)))),
      row(D.questions.struggle, chipset(D.struggles, form.mindset.struggles)),
      row('On a scale of one to ten, how stressed do you feel about money right now?', h('div', { class: 'row taps stress-scale', role: 'group', 'aria-label': 'Money stress, one to ten' }, Array.from({ length: 10 }, (_, k) => h('button', { class: 'btn small' + (form.mindset.stress === k + 1 ? ' primary' : ''), 'aria-pressed': String(form.mindset.stress === k + 1), onClick: () => { form.mindset.stress = k + 1; draw(); } }, String(k + 1)))))));
    sec(D.sections.words, h('div', null, h('p', { class: 'small muted' }, 'Verbatim, one line each. Saved as-is.'), form.words.map((w, i) => h('div', { class: 'row', style: { marginBottom: '4px' } }, h('input', { class: 'input wide', 'aria-label': 'Their words', value: w, onChange: e => { form.words[i] = e.target.value; } }), h('button', { class: 'btn small quiet', onClick: () => { form.words.splice(i, 1); draw(); } }, 'Remove'))), h('button', { class: 'btn small', onClick: () => { form.words.push(''); draw(); } }, 'Add a quote')));
  }
  function row(q, control) { return h('div', { class: 'disc-q' }, h('p', { class: 'readaloud' }, q), control); }
  function tierLine(t) { return form.snapshot.city ? (t.basis === 'metro' ? t.metroLabel + ' metro, ' : t.basis === 'state-nonmetro' ? 'outside a metro, ' : t.basis === 'override' ? 'your call, ' : '') + tierLabel(t.tier, 'coach', tiers) + ' (' + tierLabel(t.tier, 'client', tiers) + ')' : 'The cost-of-living tier comes from the city.'; }
  /* the tier line and chips update in place as the city is typed; the form itself is never rebuilt under the cursor (D-034) */
  function refreshTier() { const t = tierPreview(); const line = table.querySelector('.tierline'); if (line) line.textContent = tierLine(t); table.querySelectorAll('.tierchips button').forEach(b => { const on = b.textContent === t.tier; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }
  function get(path) { return path.split('.').reduce((o, k) => (o || {})[k], form); }
  function put(path, v) { const ks = path.split('.'); let o = form; ks.slice(0, -1).forEach(k => { o = o[k]; }); o[ks[ks.length - 1]] = v; }
  function text(path, label, hintWords, after) { return h('input', { class: 'input wide', type: 'text', 'aria-label': label, title: hintWords || '', value: get(path) || '', onChange: e => { put(path, e.target.value.trim()); if (after) after(); } }); }
  function area(path, label) { return h('textarea', { class: 'input wide', 'aria-label': label, value: get(path) || '', onChange: e => put(path, e.target.value.trim()) }); }
  function select(path, options, label) { return h('select', { class: 'select', 'aria-label': label, onChange: e => put(path, e.target.value) }, options.map(o => h('option', { value: o[0], selected: get(path) === o[0] }, o[1]))); }
  function saidBox(onSet, value, label, opts) {
    const wrap = h('span', { class: 'saidbox' });
    const input = h('input', { class: 'input wide', type: 'text', 'aria-label': label, value: value || '' });
    const hint = h('span', { class: 'small muted heard' });
    const show = v => { const p = parseSaid(v, opts); hint.textContent = !v ? '' : !p ? 'Did not catch a number' : p.unknown ? 'Unknown, goes on their plate' : p.none ? 'None' : F.dollarsWhole(p.cents) + (p.cadence === 'paycheck' ? ' a paycheck (' + F.dollarsWhole(toMonthly(p.cents, 'paycheck', p.payFrequency)) + ' a month)' : p.cadence === 'week' ? ' a week' : p.cadence === 'year' ? ' a year' : p.cadence === 'oneoff' ? '' : ' a month') + (p.state === 'rough' ? ', rough' : '') + (p.split ? ', your share ' + F.dollarsWhole(p.share) : ''); };
    input.addEventListener('input', () => show(input.value)); input.addEventListener('change', e => { onSet(e.target.value.trim()); show(e.target.value); });
    show(value); wrap.appendChild(input); wrap.appendChild(hint); return wrap;
  }
  function said(path, label, opts) { return saidBox(v => put(path, v), get(path), label, opts || {}); }
  function listRows(title, path, nameWords, saidWords) {
    const list = get(path);
    return h('div', { class: 'disc-list' }, h('h4', null, title), list.map((it, i) => h('div', { class: 'row', style: { marginBottom: '4px' } }, h('input', { class: 'input', style: { width: '180px' }, 'aria-label': title + ' name', title: nameWords, value: it.name || '', onChange: e => { it.name = e.target.value.trim(); } }), saidBox(v => { it.said = v; }, it.said, title + ' ' + saidWords, {}), h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: !!it.known, onChange: e => { it.known = e.target.checked; } }), ' known'), h('button', { class: 'btn small quiet', onClick: () => { list.splice(i, 1); draw(); } }, 'Remove'))), h('button', { class: 'btn small', onClick: () => { list.push({ name: '', said: '' }); draw(); } }, 'Add'));
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

function chipOn(form, c) { return Object.keys(c.writes).every(k => { const v = c.writes[k]; if (k === 'sun.workSituation') return form.snapshot.workSituation === v; if (k === 'sun.filingStatus') return form.snapshot.filingStatus === v; if (k === 'sun.dependents') return form.snapshot.dependents === v; if (k === 'household.roommates') return form.snapshot.roommates === v; if (k === 'household.partner') return form.snapshot.partner === true; if (k === 'household.lease') return form.snapshot.lease === v; if (k === 'spending.phone') return form.spending.phoneFamilyPlan === true; if (k === 'income.matchKnown') return form.money.matchKnown === true; if (k === 'mindset.avoidsAccounts') return form.mindset.avoidsAccounts === true; if (k === 'goal') return form.goals.some(g => g.text === v); if (k === 'note') return (form.words || []).includes(v); return false; }); }
function applyChip(form, c, on) { Object.keys(c.writes).forEach(k => { const v = c.writes[k]; if (k === 'sun.workSituation') form.snapshot.workSituation = on ? v : 'employed'; else if (k === 'sun.filingStatus') form.snapshot.filingStatus = on ? v : undefined; else if (k === 'sun.dependents') form.snapshot.dependents = on ? v : undefined; else if (k === 'household.roommates') form.snapshot.roommates = on ? v : 0; else if (k === 'household.partner') form.snapshot.partner = on; else if (k === 'household.lease') form.snapshot.lease = on ? v : 'none'; else if (k === 'spending.phone') form.spending.phoneFamilyPlan = on; else if (k === 'income.matchKnown') form.money.matchKnown = on; else if (k === 'mindset.avoidsAccounts') form.mindset.avoidsAccounts = on; else if (k === 'goal') { if (on) { if (!form.goals.some(g => g.text === v)) form.goals.push({ text: v, when: '', amount: '' }); } else form.goals = form.goals.filter(g => g.text !== v); } else if (k === 'note') { if (on) form.words.push(v); else form.words = form.words.filter(w => w !== v); } }); }

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
    sheet.appendChild(h('section', null, h('h3', null, 'Snapshot'), h('p', null, [s.snapshot.age !== null ? 'Age ' + s.snapshot.age : null, s.snapshot.city ? s.snapshot.city + (s.snapshot.state ? ', ' + s.snapshot.state : '') : null, s.snapshot.work || null, s.snapshot.tier ? tierLabel(s.snapshot.tier.tier, 'coach', tiers) + ' (' + s.snapshot.tierWord + (s.snapshot.tier.basis === 'metro' ? ', ' + s.snapshot.tier.metroLabel : s.snapshot.tier.outsideMetro ? ', outside a metro' : '') + ')' : null, hh.partner ? 'partner' + (hh.partner.nickname ? ' (' + hh.partner.nickname + ')' : '') + ((hh.basis || 'together') === 'together' ? ', money counted together' : ', just their own money counted') : null, hh.roommates.length ? hh.roommates.length + (hh.roommates.length === 1 ? ' roommate' : ' roommates') + (hh.roommates[0].nickname ? ' (' + hh.roommates.map(r => r.nickname).filter(Boolean).join(', ') + ')' : '') + ', lease ' + ({ mine: 'in their name only', both: 'in both names', theirs: 'in the roommate\'s name', none: 'none' }[hh.lease] || hh.lease) : hh.partner ? null : 'lives alone'].filter(Boolean).join('. ') + '.'),
      h('div', { class: 'row no-print tierchips' }, h('span', { class: 'small muted' }, 'Tier: '), ['HCOL', 'MCOL', 'LCOL'].map(tt => h('button', { class: 'chip toggle' + (s.snapshot.tier && s.snapshot.tier.tier === tt ? ' on' : ''), 'aria-pressed': String(!!(s.snapshot.tier && s.snapshot.tier.tier === tt)), onClick: () => app.colTier(s.snapshot.tier && s.snapshot.tier.tier === tt && s.snapshot.tier.source === 'client' ? null : { tier: tt, source: 'client' }) }, tt)), h('span', { class: 'small muted' }, s.snapshot.tier && s.snapshot.tier.source === 'client' ? 'your call; tap again to go back to the city' : 'from the city'))));
    if (s.words.length) sheet.appendChild(h('section', null, h('h3', null, 'Their words'), h('ul', null, s.words.map(w => h('li', null, '"' + w + '"')))));
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
