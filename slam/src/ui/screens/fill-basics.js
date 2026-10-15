// Fill in, pass 2 Basics: profile, situation, household, income.
// Only the fields that apply are shown (no roommates = no roommate fields).

import { h, options } from '../dom.js';
import { money } from '../format.js';
import { question } from '../components/value-input.js';
import { statusChip } from '../components/status.js';
import { addIncome } from '../../store/edits.js';

const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const SITUATIONS = [['employed', 'Employed'], ['self-employed', 'Self-employed'], ['between-jobs', 'Between jobs'], ['student', 'Student']];
const FILING = [['single', 'Single'], ['married-joint', 'Married, filing jointly'], ['married-separate', 'Married, filing separately'], ['head-of-household', 'Head of household']];
const INCOME_TYPES = [['w2', 'W-2 paycheck (tax withheld)'], ['1099', '1099 contractor (nothing withheld)'], ['side', 'Side income (nothing withheld)'], ['unemployment', 'Unemployment (income tax owed, not withheld)'], ['not-taxable', 'Not taxable']];
const FREQS = [['weekly', 'Weekly'], ['biweekly', 'Every two weeks'], ['semimonthly', 'Twice a month'], ['monthly', 'Monthly']];
const STATES_OF_ITEM = [['active', 'Active'], ['hidden', 'Hidden (still counts)'], ['archived', 'Archived (stops counting)']];

function textField(ctx, label, path, value, opts = {}) {
  const key = JSON.stringify(path);
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label),
    h('input', {
      type: opts.type || 'text', value: value === null || value === undefined ? '' : String(value), 'data-key': key, 'data-path': key,
      inputmode: opts.numeric ? 'numeric' : null, style: opts.width ? 'width:' + opts.width : null,
      onchange: (e) => {
        let v = e.target.value.trim();
        if (opts.numeric) v = v === '' ? null : Number(v);
        if (opts.numeric && v !== null && !Number.isFinite(v)) return ctx.toast('That needs a number');
        ctx.update(label, (d) => opts.set(d, v === '' ? null : v));
      }
    }));
}

function selectField(ctx, label, value, list, set, key) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label),
    h('select', { 'data-key': key, onchange: (e) => ctx.update(label, (d) => set(d, e.target.value)) }, options(list, value)));
}

function defaultIncomeType(situation) {
  if (situation.includes('employed')) return 'w2';
  if (situation.includes('self-employed')) return '1099';
  if (situation.includes('between-jobs')) return 'unemployment';
  return 'not-taxable';
}

function incomeCard(ctx, inc, row) {
  const p = (k) => ['income', inc.id, k];
  const set = (k) => (d, v) => { d.income.find((x) => x.id === inc.id)[k] = v; };
  const withheldNote = { w2: 'Tax is withheld from this pay.', '1099': 'Nothing is withheld; self-employment tax applies.', side: 'Nothing is withheld; self-employment tax applies.', unemployment: 'Income tax is owed but not withheld. No self-employment tax.', 'not-taxable': 'No tax.' }[inc.type];
  const usesHours = inc.type !== 'unemployment' && inc.type !== 'not-taxable';
  return h('div', { class: 'card' },
    h('div', { class: 'spread' }, h('h3', {}, inc.label), inc.state !== 'active' ? statusChip(null, inc.state) : null),
    h('div', { class: 'grid two' },
      textField(ctx, 'Name', p('label'), inc.label, { set: set('label') }),
      selectField(ctx, 'Type', inc.type, INCOME_TYPES, set('type'), JSON.stringify(p('type'))),
      selectField(ctx, 'Paid', inc.payFrequency, FREQS, set('payFrequency'), JSON.stringify(p('payFrequency'))),
      selectField(ctx, 'State', inc.state, STATES_OF_ITEM, set('state'), JSON.stringify(p('state')))),
    h('p', { class: 'muted xs' }, withheldNote),
    question(ctx, 'Take-home pay', 'What lands in the bank account', p('takeHome'), inc.takeHome),
    row && row.takeHomeStatus === 'guess'
      ? h('p', { class: 'small' }, statusChip('guess'), ' Estimated take-home from gross: ', h('b', { class: 'num' }, money(row.takeHomeMonthly)), ' / month. ' + row.takeHomeNote + '. Tax year ' + row.estimate.taxYear + '.')
      : null,
    question(ctx, 'Gross pay (optional)', 'Before tax. Only needed if take-home is unknown, or for the income statement', p('gross'), inc.gross),
    inc.type !== 'unemployment' && inc.type !== 'not-taxable'
      ? question(ctx, 'Pre-tax retirement (optional)', '401(k) or 403(b) taken out before tax', p('pretaxRetirement'), inc.pretaxRetirement) : null,
    usesHours ? textField(ctx, 'Hours worked per week (optional, for the hours-of-work lens)', p('hoursPerWeek'), inc.hoursPerWeek, { numeric: true, width: '6em', set: set('hoursPerWeek') }) : null);
}

export function renderBasics(ctx, summary) {
  const doc = ctx.doc;
  const pr = doc.profile;
  const hh = doc.household;
  const col = summary.profile.colTier;
  const rm = hh.roommates;
  const setProfile = (k) => (d, v) => { d.profile[k] = v; };

  return h('div', {},
    h('div', { class: 'card' }, h('h2', {}, 'Profile'),
      h('div', { class: 'grid two' },
        textField(ctx, 'Name', ['profile', 'name'], pr.name, { set: (d, v) => { d.profile.name = v || 'Client'; } }),
        textField(ctx, 'Birth year', ['profile', 'birthYear'], pr.birthYear, { numeric: true, width: '7em', set: setProfile('birthYear') }),
        selectField(ctx, 'State', pr.state || '', [['', 'Pick a state'], ...STATES.map((s) => [s, s])], (d, v) => { d.profile.state = v || null; }, 'profile-state'),
        textField(ctx, 'ZIP', ['profile', 'zip'], pr.zip, { width: '7em', set: setProfile('zip') }),
        selectField(ctx, 'Cost of living (for guesses): ' + col.tier + ', ' + col.from, pr.colTier || '',
          [['', 'Use the state'], ['HCOL', 'High (HCOL)'], ['MCOL', 'Medium (MCOL)'], ['LCOL', 'Low (LCOL)']],
          (d, v) => { d.profile.colTier = v || null; }, 'profile-col'))),

    h('div', { class: 'card' }, h('h2', {}, 'Situation'),
      h('p', { class: 'muted small' }, 'Pick all that apply.'),
      h('div', {}, SITUATIONS.map(([id, label]) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: doc.situation.includes(id), 'data-key': 'sit-' + id,
          onchange: (e) => ctx.update('Situation', (d) => {
            d.situation = e.target.checked ? [...new Set([...d.situation, id])] : d.situation.filter((s) => s !== id);
          }) }), label)))),

    h('div', { class: 'card' }, h('h2', {}, 'Household'),
      h('div', { class: 'grid two' },
        selectField(ctx, 'Filing status', hh.filingStatus, FILING, (d, v) => { d.household.filingStatus = v; }, 'filing'),
        textField(ctx, 'Dependents (0 if none)', ['household', 'dependents', 'count'], hh.dependents.count, { numeric: true, width: '6em', set: (d, v) => { d.household.dependents.count = v; } }),
        hh.dependents.count > 0 ? textField(ctx, 'Dependent ages (comma separated)', ['household', 'dependents', 'ages'], hh.dependents.ages.join(', '),
          { set: (d, v) => { d.household.dependents.ages = (v || '').split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n >= 0); } }) : null,
        textField(ctx, 'Roommates (0 if none)', ['household', 'roommates', 'count'], rm.count, { numeric: true, width: '6em', set: (d, v) => { d.household.roommates.count = v; } })),
      rm.count > 0 ? h('div', {},
        question(ctx, 'Total rent for the place', 'What everyone pays together. Your share is the Rent line in the Actual pass.', ['household', 'roommates', 'totalRent'], rm.totalRent)) : null),

    h('h2', {}, 'Income'),
    doc.income.length ? null : h('p', { class: 'muted' }, 'No income yet. Add each source of money coming in.'),
    doc.income.map((inc) => incomeCard(ctx, inc, summary.income.sources.find((s) => s.id === inc.id))),
    h('button', { class: 'btn', 'data-path': JSON.stringify(['income']), onclick: () => ctx.update('Add income', (d) => {
      addIncome(d, { type: defaultIncomeType(d.situation), label: 'Income ' + (d.income.length + 1) });
    }) }, '+ Add income source'));
}
