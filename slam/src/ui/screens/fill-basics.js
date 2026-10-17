// Fill in, pass 2 Basics: profile, situation, household, income.
// Only the fields that apply are shown (no roommates = no roommate fields; family only when living with family).

import { h, options } from '../dom.js';
import { money, pct } from '../format.js';
import { question } from '../components/value-input.js';
import { statusChip } from '../components/status.js';
import { addIncome, addDeduction, removeDeduction } from '../../store/edits.js';
import { DEDUCTION_KINDS } from '../../calc/deductions.js';
import { makeValue } from '../../store/value.js';

const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const SITUATIONS = [['employed', 'Employed'], ['self-employed', 'Self-employed'], ['between-jobs', 'Between jobs'], ['student', 'Student']];
const LIVING_WITH = [['', 'Pick one'], ['alone', 'On my own'], ['partner', 'With a partner or spouse'], ['roommates', 'With roommates'], ['family', 'With family (parents or relatives)']];
const FILING = [['single', 'Single'], ['married-joint', 'Married, filing jointly'], ['married-separate', 'Married, filing separately'], ['head-of-household', 'Head of household']];
const INCOME_TYPES = [['w2', 'W-2 paycheck (tax withheld)'], ['1099', '1099 contractor (nothing withheld)'], ['side', 'Side income (nothing withheld)'], ['unemployment', 'Unemployment benefits'], ['family', 'Family support (gift, not taxed)'], ['not-taxable', 'Not taxable']];
const FREQS = [['weekly', 'Weekly'], ['biweekly', 'Every two weeks'], ['semimonthly', 'Twice a month'], ['monthly', 'Monthly']];
const WITHHOLDING = [['', 'Not sure yet'], ['ten-percent', 'Yes, 10% federal'], ['none', 'No']];

// Picking a type sets kind defaults: unemployment arrives weekly and gets a real name.
function setIncomeType(inc, type) {
  inc.type = type;
  if (type !== 'unemployment') return;
  if (/^Income \d+$/.test(inc.label) || inc.label === 'Paycheck') inc.label = 'Unemployment benefits';
  if (inc.gross.amount === null && inc.gross.status === null) inc.gross.cadence = 'week';
}

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
      row.preTaxMonthly ? h('tr', {}, h('td', {}, 'Pre-tax deductions'),
        cell(-row.preTaxPerPaycheck, exact), cell(-row.preTaxMonthly, exact), cell(-row.preTaxAnnual, exact), h('td', {})) : null,
      row.withheldMonthly !== null ? h('tr', {}, h('td', {}, 'Taxes withheld', h('span', { class: 'xs muted' }, row.withheldFrom === 'paystub' ? ' (paystub)' : ' (gross minus the rest)')),
        cell(-row.withheldPerPaycheck, exact), cell(-row.withheldMonthly, exact), cell(-row.withheldAnnual, exact), h('td', {})) : null,
      row.postTaxMonthly ? h('tr', {}, h('td', {}, 'Post-tax deductions'),
        cell(-row.postTaxPerPaycheck, exact), cell(-row.postTaxMonthly, exact), cell(-row.postTaxAnnual, exact), h('td', {})) : null,
      h('tr', {}, h('td', {}, 'Take-home', row.takeHomeStatus === 'guess' ? h('span', { class: 'xs st-guess' }, ' (guess)') : null),
        cell(row.takeHomePerPaycheck, exact), cell(row.takeHomeMonthly, exact), cell(row.takeHomeAnnual, exact), cell(row.takeHomePerHour, exact)))));
}

// Paycheck deductions: retirement as a % of gross or an amount, plus health,
// HSA or FSA, transportation, Roth, and other. Amounts come from calc.
function deductionsBlock(ctx, inc, row) {
  const setD = (id, k) => (d, v) => { d.income.find((x) => x.id === inc.id).deductions.find((x) => x.id === id)[k] = v; };
  const rows = row ? row.deductions : [];
  const exact = (x) => money(x, true);
  const one = (d) => {
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
  };
  const pre = inc.deductions.filter((d) => (rows.find((x) => x.id === d.id) || { lowersIncomeTax: true }).lowersIncomeTax);
  const post = inc.deductions.filter((d) => !pre.includes(d));
  const add = (kinds, label) => h('select', { class: 'add-select', 'aria-label': label, 'data-key': 'add-ded:' + inc.id + ':' + label,
    onchange: (e) => { const k = e.target.value; if (k) ctx.update('Add deduction', (doc) => { addDeduction(doc, inc.id, k); }); } },
    options([['', label], ...kinds.map((k) => [k, DEDUCTION_KINDS[k].label])], ''));
  const PRE_KINDS = ['retirement', 'health', 'dental', 'vision', 'hsa', 'transportation', 'other'];
  const POST_KINDS = ['roth', 'life', 'disability', 'union', 'garnishment'];
  return h('div', { style: 'margin-top:8px' },
    h('p', { class: 'muted xs' }, 'Copy these from a paystub, in its order. Retirement here counts toward the savings rate. "Other" can be before or after tax.'),
    h('div', { class: 'field-label' }, 'Pre-tax deductions'),
    pre.map(one),
    add(PRE_KINDS, '+ Add a pre-tax deduction'),
    h('div', { class: 'field-label', style: 'margin-top:12px' }, 'Post-tax deductions'),
    post.map(one),
    add(POST_KINDS, '+ Add a post-tax deduction'));
}

const WITHHELD_LABELS = [['federal', 'Federal income tax'], ['socialSecurity', 'Social Security (OASDI)'], ['medicare', 'Medicare'], ['state', 'State income tax'], ['local', 'Local or city tax'],
  ['sdi', 'State disability insurance (SDI)'], ['pfl', 'Paid family or medical leave'], ['sui', 'State unemployment (employee share)'], ['other', 'Other tax']];
// The three federal lines are on every W-2 paystub; the rest show only once added (S-080).
const CORE_TAX = ['federal', 'socialSecurity', 'medicare'];

// Taxes withheld: copied from the paystub, then checked against the year's estimate.
function withheldBlock(ctx, inc, row) {
  const t = row && row.taxCheck;
  const exact = (x) => money(x, true);
  const entered = Object.values(inc.withheld).some((v) => v.status !== null);
  let check = null;
  if (t) {
    const per = (annual) => exact(annual / (row.grossPerPaycheck ? (row.grossAnnual / row.grossPerPaycheck) : 12));
    const gap = t.gapAnnual;
    check = h('div', { class: 'card', style: 'margin:8px 0' },
      h('div', { class: 'field-label' }, 'Tax check'),
      h('p', { class: 'small' }, 'Withheld: ', h('b', { class: 'num' }, exact(row.withheldPerPaycheck)), ' a paycheck (', pct(t.withheldRate, 1), ' of gross), ',
        t.withheldFrom === 'paystub' ? 'from the paystub lines.' : 'worked out as gross minus deductions minus take-home, so it includes any state tax.'),
      h('p', { class: 'small' }, 'Estimated tax for the year: federal income tax ', h('b', { class: 'num' }, money(t.estIncomeTaxAnnual)), ' + Social Security and Medicare ',
        h('b', { class: 'num' }, money(t.estFicaAnnual)), ' = ', h('b', { class: 'num' }, money(t.estTotalAnnual)), ', about ', per(t.estTotalAnnual), ' a paycheck (',
        pct(t.estRate, 1), ' of gross).', h('span', { class: 'muted xs' }, ' State tax not estimated. Tax year ' + t.taxYear + '.')),
      gap === null ? null : h('p', { class: 'small ' + (gap < -1 ? 'warn' : '') },
        gap >= 1 ? 'Withholding is about ' + money(gap) + ' more than the estimate for the year, so a refund is likely.'
          : gap <= -1 ? 'Withholding is about ' + money(-gap) + ' short of the estimate for the year. That could be owed at tax time' + (t.withheldFrom === 'paystub' ? '.' : ', or the take-home typed is higher than the real paycheck.') + ' Setting aside ' + per(-gap) + ' a paycheck covers it.'
            : 'Withholding matches the estimate.'),
      t.stubMismatchMonthly !== null && Math.abs(t.stubMismatchMonthly) >= 1 ? h('p', { class: 'small warn' },
        'The paystub lines leave ' + money(Math.abs(t.stubMismatchMonthly)) + ' a month ' + (t.stubMismatchMonthly > 0 ? 'less' : 'more') + ' than the take-home typed. Something may be missing (another deduction or tax).') : null);
  }
  return h('div', { style: 'margin-top:12px' },
    h('details', { open: entered || ctx.ui.expanded.has('withheld:' + inc.id) ? true : null,
      ontoggle: (e) => { if (e.target.open) ctx.ui.expanded.add('withheld:' + inc.id); else ctx.ui.expanded.delete('withheld:' + inc.id); } },
      h('summary', { class: 'field-label' }, 'Taxes withheld (copy from the paystub, optional)'),
      h('p', { class: 'muted xs' }, 'Each tax line on the paystub, per paycheck. With the first three, take-home is worked out if it is blank. Add any other line the paystub shows (state, local, SDI, paid leave); remove any that is not there.'),
      WITHHELD_LABELS.filter(([k]) => CORE_TAX.includes(k) || inc.withheld[k].status !== null || ctx.ui.expanded.has('tax:' + inc.id + ':' + k)).map(([k, label]) =>
        h('div', { class: 'tax-line' }, question(ctx, label, null, ['income', inc.id, 'withheld', k], inc.withheld[k]),
          CORE_TAX.includes(k) ? null : h('button', { class: 'btn small ghost danger', 'aria-label': 'Remove ' + label, onclick: () => {
            ctx.ui.expanded.delete('tax:' + inc.id + ':' + k);
            ctx.update('Remove ' + label, (d) => { d.income.find((x) => x.id === inc.id).withheld[k] = makeValue(null, { cadence: 'paycheck' }); });
          } }, 'Remove'))),
      (() => {
        const more = WITHHELD_LABELS.filter(([k]) => !CORE_TAX.includes(k) && inc.withheld[k].status === null && !ctx.ui.expanded.has('tax:' + inc.id + ':' + k));
        return more.length ? h('select', { class: 'add-select', 'aria-label': 'Add a tax line', 'data-key': 'add-tax:' + inc.id,
          onchange: (e) => { if (e.target.value) { ctx.ui.expanded.add('tax:' + inc.id + ':' + e.target.value); ctx.ui.focusPath = ['income', inc.id, 'withheld', e.target.value]; ctx.rerender(); } } },
          options([['', '+ Add a tax line'], ...more], '')) : null;
      })()),
    check);
}

// One plain choice instead of a state dropdown (S-081): an income counts, or it is
// set aside (archived, kept for the record). An old "hidden" state still counts.
function countButton(ctx, inc) {
  if (inc.state === 'archived') return null;
  return h('div', { class: 'row' },
    inc.state === 'hidden' ? h('button', { class: 'btn small ghost', onclick: () => ctx.update('Show income', (d) => { d.income.find((x) => x.id === inc.id).state = 'active'; }) }, 'Hidden (still counts): show it') : null,
    h('button', { class: 'btn small ghost', 'data-key': 'stop-income:' + inc.id, onclick: () => ctx.update('Stop counting income', (d) => { d.income.find((x) => x.id === inc.id).state = 'archived'; }) }, 'Stop counting this income'));
}

// An archived income is skipped by every calculation, so say so plainly, with a way back.
function archivedNote(ctx, inc) {
  if (inc.state !== 'archived') return null;
  return h('p', { class: 'small warn' }, 'Archived: this income does not count anywhere (take-home, deductions, taxes). ',
    h('button', { class: 'btn small', onclick: () => ctx.update('Count income again', (d) => { d.income.find((x) => x.id === inc.id).state = 'active'; }) }, 'Count it again'));
}

// Unemployment asks one number. The rest (what lands, tax to plan for, when it ends) is worked out.
function benefitCard(ctx, inc, row) {
  const p = (k) => ['income', inc.id, k];
  const set = (k) => (d, v) => { d.income.find((x) => x.id === inc.id)[k] = v; };
  const u = row && row.unemployment;
  const exact = (x) => money(x, true);
  let plan = null;
  if (u) {
    const lands = u.withholding === 'ten-percent'
      ? [exact(u.benefitWeekly * 0.9) + ' a week lands after the 10%, about ' + money(u.takeHomeMonthly) + ' a month.']
      : [exact(u.benefitWeekly) + ' a week, about ' + money(u.takeHomeMonthly) + ' a month.'];
    const taxLine = u.estTaxAnnual === 0
      ? 'At this amount, no federal income tax is likely.'
      : u.withholding === 'ten-percent'
        ? (u.owedAtTaxTime > 0 ? 'The 10% may not cover it all. Setting aside about ' + exact(u.setAsideWeekly) + ' more a week avoids a surprise.' : 'The 10% likely covers the federal tax' + (u.refundLikely > 1 ? ', with maybe ' + money(u.refundLikely) + ' back.' : '.'))
        : 'To avoid a surprise at tax time, set aside about ' + exact(u.setAsideWeekly) + ' a week (' + money(u.estTaxAnnual) + ' for a full year of benefits).';
    plan = h('div', { class: 'card', style: 'margin:8px 0' },
      h('p', { class: 'small' }, h('b', {}, lands[0])),
      h('p', { class: 'small' }, taxLine, h('span', { class: 'muted xs' }, ' Federal only, tax year ' + u.taxYear + '.')),
      u.endsAround ? h('p', { class: 'small' }, 'Benefits end around ' + u.endsAround + ', with about ' + money(u.stillToCome) + ' still to come.') : null);
  }
  return h('div', { class: 'card' },
    h('div', { class: 'spread' }, h('h3', {}, inc.label), countButton(ctx, inc)),
    archivedNote(ctx, inc),
    h('p', { class: 'muted small' }, 'Benefits are there for exactly this. They count as income for tax, so a little planning now keeps things calm later.'),
    h('div', { class: 'grid two' },
      textField(ctx, 'Name', p('label'), inc.label, { set: set('label') }),
      selectField(ctx, 'Type', inc.type, INCOME_TYPES, (d, v) => setIncomeType(d.income.find((x) => x.id === inc.id), v), JSON.stringify(p('type'))),
      selectField(ctx, 'Arrives', inc.payFrequency, FREQS, set('payFrequency'), JSON.stringify(p('payFrequency')))),
    question(ctx, 'Benefit amount', 'The amount on your benefit notice, before any tax', p('gross'), inc.gross),
    h('div', { class: 'grid two' },
      selectField(ctx, 'Is federal tax withheld? (optional)', inc.withholding || '', WITHHOLDING, (d, v) => set('withholding')(d, v || null), JSON.stringify(p('withholding'))),
      textField(ctx, 'Weeks of benefits left (optional)', p('benefitWeeksLeft'), inc.benefitWeeksLeft, { numeric: true, width: '6em', set: (d, v) => {
        if (v !== null && v < 0) throw new Error('Use 0 or more weeks');
        set('benefitWeeksLeft')(d, v);
      } })),
    plan);
}

// Hourly (and any W-2 pay with gross known): the estimated paycheck is worked out,
// never asked; the actual paycheck is optional, and a difference is laid out step by step.
function paycheckBlock(ctx, inc, row, askActual) {
  const exact = (x) => money(x, true);
  const est = row ? row.estimatedTakeHomePerPaycheck : null;
  const gap = row ? row.paycheckGapPerPaycheck : null;
  const steps = row && est !== null ? [
    ['Gross' + (row.grossFrom === 'hourly' ? ' (rate x hours)' : ''), exact(row.grossPerPaycheck)],
    row.preTaxPerPaycheck ? ['Pre-tax deductions', '-' + exact(row.preTaxPerPaycheck)] : null,
    [row.estimatedFrom === 'paystub lines' ? 'Taxes (from the paystub lines)' : 'Taxes (estimated federal income tax and FICA)', '-' + exact(row.estimatedTaxPerPaycheck)],
    row.postTaxPerPaycheck ? ['Post-tax deductions', '-' + exact(row.postTaxPerPaycheck)] : null,
    ['Estimated paycheck', exact(est)]
  ].filter(Boolean) : [];
  return h('div', { class: 'card', style: 'margin:8px 0' },
    h('div', { class: 'field-label' }, 'Paycheck'),
    est === null ? h('p', { class: 'small muted' }, 'Add the pay above to work out the paycheck.')
      : h('table', { class: 'budget' }, h('tbody', {}, steps.map(([k, v], i) => h('tr', { class: i === steps.length - 1 ? 'total' : '' }, h('td', {}, k), h('td', { class: 'num' }, v))))),
    askActual ? question(ctx, 'Actual paycheck (optional)', 'From a real paystub, to check the estimate. Leave blank to budget with the estimate', ['income', inc.id, 'takeHome'], inc.takeHome) : null,
    gap === null ? null : Math.abs(gap) < 1 ? h('p', { class: 'small' }, 'The actual paycheck matches the estimate.')
      : h('div', { class: 'small' },
        h('p', { class: 'warn' }, 'Doesn\'t add up: the actual paycheck is ' + exact(Math.abs(gap)) + ' ' + (gap > 0 ? 'more' : 'less') + ' than the estimate.'),
        h('p', { class: 'muted' }, 'Worth checking: ' + (gap < 0
          ? 'a deduction or tax not listed yet (health insurance, state or local tax), fewer hours than usual, or unpaid time off.'
          : 'more hours or overtime, a different rate, a deduction listed here that is not on the paystub, or tax withheld at a lower rate than the estimate.') +
          (row.estimatedFrom === 'tax estimate' ? ' Copying the tax lines from the paystub above makes the estimate exact.' : '')),
        h('p', { class: 'muted xs' }, 'The budget uses the actual paycheck.')));
}

function incomeCard(ctx, inc, row) {
  if (inc.type === 'unemployment') return benefitCard(ctx, inc, row);
  const p = (k) => ['income', inc.id, k];
  const set = (k) => (d, v) => { d.income.find((x) => x.id === inc.id)[k] = v; };
  const withheldNote = {
    w2: 'Tax is withheld from this pay.', '1099': 'Nothing is withheld; self-employment tax applies.', side: 'Nothing is withheld; self-employment tax applies.',
family: 'Help from family. A gift, so it is not taxed as income.', 'not-taxable': 'No tax.'
  }[inc.type];
  const isWork = inc.type !== 'unemployment' && inc.type !== 'not-taxable' && inc.type !== 'family';
  const hourly = isWork && inc.payBasis === 'hourly';
  return h('div', { class: 'card' },
    h('div', { class: 'spread' }, h('h3', {}, inc.label), countButton(ctx, inc)),
    archivedNote(ctx, inc),
    h('div', { class: 'grid two' },
      textField(ctx, 'Name', p('label'), inc.label, { set: set('label') }),
      selectField(ctx, 'Type', inc.type, INCOME_TYPES, (d, v) => setIncomeType(d.income.find((x) => x.id === inc.id), v), JSON.stringify(p('type'))),
      selectField(ctx, 'Paid', inc.payFrequency, FREQS, set('payFrequency'), JSON.stringify(p('payFrequency'))),
      isWork ? selectField(ctx, 'Pay basis', inc.payBasis, [['salary', 'Salary'], ['hourly', 'Hourly']], set('payBasis'), JSON.stringify(p('payBasis'))) : null),
    h('p', { class: 'muted xs' }, withheldNote),
    hourly ? null : question(ctx, 'Take-home pay', 'What lands in the bank account (net pay). Blank is fine if the paystub lines are copied below', p('takeHome'), inc.takeHome),
    hourly ? null : row && row.takeHomeStatus === 'guess'
      ? h('p', { class: 'small' }, statusChip('guess'), ' Estimated take-home from gross: ', h('b', { class: 'num' }, money(row.takeHomeMonthly)), ' / month. ' + row.takeHomeNote + '. Tax year ' + row.estimate.taxYear + '.')
      : row && row.takeHomeStatus === 'computed'
        ? h('p', { class: 'small' }, statusChip('computed'), ' Take-home from the paystub lines: ', h('b', { class: 'num' }, money(row.takeHomePerPaycheck, true)), ' a paycheck, ', h('b', { class: 'num' }, money(row.takeHomeMonthly)), ' a month.')
        : null,
    hourly
      ? question(ctx, 'Hourly rate', 'Before tax. Gross pay is worked out from this and the hours below', p('hourlyRate'), inc.hourlyRate, { cadence: false, placeholder: '$ / hour' })
      : question(ctx, 'Gross pay (optional)', 'Before tax. Only needed if take-home is unknown, or for the income statement', p('gross'), inc.gross),
    isWork ? textField(ctx, hourly ? 'Hours worked per week (needed for hourly pay)' : 'Hours worked per week (optional, for per-hour pay and the hours-of-work lens)', p('hoursPerWeek'), inc.hoursPerWeek, { numeric: true, width: '6em', set: set('hoursPerWeek') }) : null,
    hourly && (inc.hourlyRate.amount === null || !inc.hoursPerWeek) ? h('p', { class: 'small warn' }, 'Add the hourly rate and the hours per week to work out gross pay.') : null,
    isWork ? deductionsBlock(ctx, inc, row) : null,
    inc.type === 'w2' ? withheldBlock(ctx, inc, row) : null,
    hourly || (row && row.paycheckGapMonthly !== null && row.paycheckGapMonthly !== undefined) ? paycheckBlock(ctx, inc, row, hourly) : null,
    row && (row.grossMonthly !== null || row.takeHomeMonthly !== null) ? payTable(row) : null);
}

export function renderBasics(ctx, summary) {
  const doc = ctx.doc;
  const pr = doc.profile;
  const hh = doc.household;
  const rm = hh.roommates;
  const setProfile = (k) => (d, v) => { d.profile[k] = v; };

  return h('div', {},
    h('div', { class: 'card' }, h('h2', {}, 'Profile'),
      h('div', { class: 'grid two' },
        textField(ctx, 'Name', ['profile', 'name'], pr.name, { set: (d, v) => { d.profile.name = v || 'Client'; } }),
        textField(ctx, 'Birth year', ['profile', 'birthYear'], pr.birthYear, { numeric: true, width: '7em', set: setProfile('birthYear') }),
        selectField(ctx, 'State', pr.state || '', [['', 'Pick a state'], ...STATES.map((s) => [s, s])], (d, v) => { d.profile.state = v || null; }, 'profile-state'))),

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
      const inc = addIncome(d, { type: 'w2', label: 'Income ' + (d.income.length + 1) });
      setIncomeType(inc, defaultIncomeType(d.situation));
    }) }, '+ Add income source'),
    coachNotesCard(ctx));
}

// The coach's own notes about the client (S-096): coach-only, so the client view leaves the card out.
function coachNotesCard(ctx) {
  if (ctx.role === 'client') return null;
  return h('div', { class: 'card', id: 'coach-notes' }, h('h2', {}, 'Coach notes'),
    h('p', { class: 'muted small' }, 'Only you see these. The client view hides them.'),
    h('textarea', { 'data-key': 'coach-notes', 'aria-label': 'Coach notes', value: ctx.doc.coachNotes || '',
      onchange: (e) => ctx.update('Coach notes', (d) => { d.coachNotes = e.target.value; }) }));
}
