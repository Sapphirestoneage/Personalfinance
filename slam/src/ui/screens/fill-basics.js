// Fill in, pass 2 Basics: profile, situation, household, income.
// Only the fields that apply are shown (no roommates = no roommate fields; family only when living with family).

import { h, options } from '../dom.js';
import { money } from '../format.js';
import { question } from '../components/value-input.js';
import { statusChip } from '../components/status.js';
import { addIncome, addDeduction, removeDeduction } from '../../store/edits.js';
import { DEDUCTION_KINDS } from '../../calc/deductions.js';

const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const SITUATIONS = [['employed', 'Employed'], ['self-employed', 'Self-employed'], ['between-jobs', 'Between jobs'], ['student', 'Student']];
const LIVING_WITH = [['', 'Pick one'], ['alone', 'On my own'], ['partner', 'With a partner or spouse'], ['roommates', 'With roommates'], ['family', 'With family (parents or relatives)']];
const FILING = [['single', 'Single'], ['married-joint', 'Married, filing jointly'], ['married-separate', 'Married, filing separately'], ['head-of-household', 'Head of household']];
const INCOME_TYPES = [['w2', 'W-2 paycheck (tax withheld)'], ['1099', '1099 contractor (nothing withheld)'], ['side', 'Side income (nothing withheld)'], ['unemployment', 'Unemployment (income tax owed, not withheld)'], ['family', 'Family support (gift, not taxed)'], ['not-taxable', 'Not taxable']];
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

function payTable(row) {
  const cell = (x, money2) => h('td', { class: 'num' }, money2(x));
  const exact = (x) => money(x, true);
  return h('div', { class: 'table-wrap', style: 'margin-top:8px' }, h('table', { class: 'budget' },
    h('thead', {}, h('tr', {}, ['', 'Paycheck', 'Month', 'Year', 'Hour'].map((x) => h('th', {}, x)))),
    h('tbody', {},
      h('tr', {}, h('td', {}, 'Gross', row.grossFrom === 'hourly' ? h('span', { class: 'xs muted' }, ' (rate x hours)') : null),
        cell(row.grossPerPaycheck, exact), cell(row.grossMonthly, exact), cell(row.grossAnnual, exact), cell(row.grossPerHour, exact)),
      row.deductions.length ? h('tr', {}, h('td', {}, 'Deductions'),
        cell(row.deductionsPerPaycheck, exact), cell(row.deductionsMonthly, exact), cell(row.deductionsAnnual, exact), h('td', {})) : null,
      h('tr', {}, h('td', {}, 'Take-home', row.takeHomeStatus === 'guess' ? h('span', { class: 'xs st-guess' }, ' (guess)') : null),
        cell(row.takeHomePerPaycheck, exact), cell(row.takeHomeMonthly, exact), cell(row.takeHomeAnnual, exact), cell(row.takeHomePerHour, exact)))));
}

// Paycheck deductions: retirement as a % of gross or an amount, plus health,
// HSA or FSA, transportation, Roth, and other. Amounts come from calc.
function deductionsBlock(ctx, inc, row) {
  const setD = (id, k) => (d, v) => { d.income.find((x) => x.id === inc.id).deductions.find((x) => x.id === id)[k] = v; };
  const rows = row ? row.deductions : [];
  const exact = (x) => money(x, true);
  return h('div', { style: 'margin-top:8px' },
    h('div', { class: 'field-label' }, 'Paycheck deductions'),
    h('p', { class: 'muted xs' }, 'Taken out before the money lands. Take-home is what is left. Retirement here counts toward the savings rate.'),
    inc.deductions.map((d) => {
      const r = rows.find((x) => x.id === d.id) || {};
      const path = ['income', inc.id, 'deductions', d.id];
      return h('div', { class: 'card', style: 'margin:8px 0' },
        h('div', { class: 'row' },
          h('select', { 'aria-label': 'Deduction', 'data-key': JSON.stringify(path) + ':kind', onchange: (e) => ctx.update('Deduction type', (doc) => setD(d.id, 'kind')(doc, e.target.value)) },
            options(Object.entries(DEDUCTION_KINDS).map(([k, x]) => [k, x.label]), d.kind)),
          d.kind === 'other' ? h('input', { type: 'text', placeholder: 'What is it?', value: d.label, 'data-key': JSON.stringify(path) + ':label',
            onchange: (e) => ctx.update('Deduction name', (doc) => setD(d.id, 'label')(doc, e.target.value)) }) : null,
          h('div', { class: 'toggle', role: 'group', 'aria-label': 'Entered as' },
            h('button', { 'aria-pressed': d.mode === 'percent' ? 'true' : 'false', onclick: () => ctx.update('Deduction as %', (doc) => setD(d.id, 'mode')(doc, 'percent')) }, '% of gross'),
            h('button', { 'aria-pressed': d.mode === 'amount' ? 'true' : 'false', onclick: () => ctx.update('Deduction as $', (doc) => setD(d.id, 'mode')(doc, 'amount')) }, '$ amount')),
          h('button', { class: 'btn small ghost danger', onclick: () => ctx.update('Remove deduction', (doc) => removeDeduction(doc, inc.id, d.id)) }, 'Remove')),
        d.mode === 'percent'
          ? textField(ctx, 'Percent of gross pay', [...path, 'percent'], d.percent, { numeric: true, width: '6em', set: (doc, v) => {
            if (v !== null && (v < 0 || v > 100)) throw new Error('Use a percent from 0 to 100');
            setD(d.id, 'percent')(doc, v);
          } })
          : question(ctx, 'Amount', null, [...path, 'amount'], d.amount),
        d.kind === 'other' ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.pretax, 'data-key': JSON.stringify(path) + ':pretax',
          onchange: (e) => ctx.update('Before tax', (doc) => setD(d.id, 'pretax')(doc, e.target.checked)) }), 'Taken out before tax') : null,
        r.monthly !== null && r.monthly !== undefined
          ? h('p', { class: 'small num' }, exact(r.perPaycheck) + ' a paycheck, ' + exact(r.monthly) + ' a month, ' + exact(r.annual) + ' a year')
          : h('p', { class: 'small muted' }, d.mode === 'percent' ? 'Needs a percent and gross pay (or an hourly rate and hours).' : 'Enter the amount.'));
    }),
    h('div', { class: 'row' }, [['retirement', '+ Retirement'], ['health', '+ Health insurance'], ['transportation', '+ Transportation'], ['hsa', '+ HSA or FSA'], ['roth', '+ Roth'], ['other', '+ Other']]
      .map(([k, label]) => h('button', { class: 'btn small', onclick: () => ctx.update('Add deduction', (doc) => { addDeduction(doc, inc.id, k); }) }, label))));
}

function incomeCard(ctx, inc, row) {
  const p = (k) => ['income', inc.id, k];
  const set = (k) => (d, v) => { d.income.find((x) => x.id === inc.id)[k] = v; };
  const withheldNote = {
    w2: 'Tax is withheld from this pay.', '1099': 'Nothing is withheld; self-employment tax applies.', side: 'Nothing is withheld; self-employment tax applies.',
    unemployment: 'Income tax is owed but not withheld. No self-employment tax.', family: 'Help from family. A gift, so it is not taxed as income.', 'not-taxable': 'No tax.'
  }[inc.type];
  const isWork = inc.type !== 'unemployment' && inc.type !== 'not-taxable' && inc.type !== 'family';
  const hourly = isWork && inc.payBasis === 'hourly';
  return h('div', { class: 'card' },
    h('div', { class: 'spread' }, h('h3', {}, inc.label), inc.state !== 'active' ? statusChip(null, inc.state) : null),
    h('div', { class: 'grid two' },
      textField(ctx, 'Name', p('label'), inc.label, { set: set('label') }),
      selectField(ctx, 'Type', inc.type, INCOME_TYPES, set('type'), JSON.stringify(p('type'))),
      selectField(ctx, 'Paid', inc.payFrequency, FREQS, set('payFrequency'), JSON.stringify(p('payFrequency'))),
      isWork ? selectField(ctx, 'Pay basis', inc.payBasis, [['salary', 'Salary'], ['hourly', 'Hourly']], set('payBasis'), JSON.stringify(p('payBasis'))) : null,
      selectField(ctx, 'State', inc.state, STATES_OF_ITEM, set('state'), JSON.stringify(p('state')))),
    h('p', { class: 'muted xs' }, withheldNote),
    question(ctx, 'Take-home pay', 'What lands in the bank account', p('takeHome'), inc.takeHome),
    row && row.takeHomeStatus === 'guess'
      ? h('p', { class: 'small' }, statusChip('guess'), ' Estimated take-home from gross: ', h('b', { class: 'num' }, money(row.takeHomeMonthly)), ' / month. ' + row.takeHomeNote + '. Tax year ' + row.estimate.taxYear + '.')
      : null,
    hourly
      ? question(ctx, 'Hourly rate', 'Before tax. Gross pay is worked out from this and the hours below', p('hourlyRate'), inc.hourlyRate, { cadence: false, placeholder: '$ / hour' })
      : question(ctx, 'Gross pay (optional)', 'Before tax. Only needed if take-home is unknown, or for the income statement', p('gross'), inc.gross),
    isWork ? textField(ctx, hourly ? 'Hours worked per week (needed for hourly pay)' : 'Hours worked per week (optional, for per-hour pay and the hours-of-work lens)', p('hoursPerWeek'), inc.hoursPerWeek, { numeric: true, width: '6em', set: set('hoursPerWeek') }) : null,
    hourly && (inc.hourlyRate.amount === null || !inc.hoursPerWeek) ? h('p', { class: 'small warn' }, 'Add the hourly rate and the hours per week to work out gross pay.') : null,
    isWork ? deductionsBlock(ctx, inc, row) : null,
    row && (row.grossMonthly !== null || row.takeHomeMonthly !== null) ? payTable(row) : null);
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
        selectField(ctx, 'Who do you live with?', hh.livingWith || '', LIVING_WITH, (d, v) => {
          d.household.livingWith = v || null;
          if (v !== 'roommates') d.household.roommates.count = 0;
        }, 'living-with'),
        hh.livingWith === 'roommates' ? textField(ctx, 'How many roommates', ['household', 'roommates', 'count'], rm.count, { numeric: true, width: '6em', set: (d, v) => { d.household.roommates.count = v; } }) : null,
        hh.livingWith === 'family' ? textField(ctx, 'People in the home besides you', ['household', 'family', 'count'], hh.family.count, { numeric: true, width: '6em', set: (d, v) => { d.household.family.count = v; } }) : null),
      hh.livingWith === 'roommates' && rm.count > 0 ? h('div', {},
        question(ctx, 'Total rent for the place', 'What everyone pays together. Your share is the Rent line in the Actual pass.', ['household', 'roommates', 'totalRent'], rm.totalRent)) : null,
      hh.livingWith === 'family' ? h('p', { class: 'small muted' }, 'Anything you pay your family for rent or bills goes on the Housing lines in the Actual pass. If you pay nothing, mark Housing "Doesn\'t apply" in the Rough pass.') : null),

    h('h2', {}, 'Income'),
    doc.income.length ? null : h('p', { class: 'muted' }, 'No income yet. Add each source of money coming in.'),
    doc.income.map((inc) => incomeCard(ctx, inc, summary.income.sources.find((s) => s.id === inc.id))),
    h('button', { class: 'btn', 'data-path': JSON.stringify(['income']), onclick: () => ctx.update('Add income', (d) => {
      addIncome(d, { type: defaultIncomeType(d.situation), label: 'Income ' + (d.income.length + 1) });
    }) }, '+ Add income source'));
}
