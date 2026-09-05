/* test/rooms/variable-income.js — Variable Income (D-099). Run by test/run.js. */
module.exports = function (t) {
  var check = t.check, checkTrue = t.checkTrue, Money = t.Money, Schema = t.Schema, SE = t.SelfEmployed;
  var VI = require(t.path.join(t.ROOT, 'engines/variableincome.js'));
  var T = t.TABLES;
  var table = T.variableIncomeConventions;

  t.section('Variable Income');

  /* -- The table ------------------------------------------------------------ */
  checkTrue('the table is filled, not a placeholder', !!table && !/PLACEHOLDER/.test(table.source) && table.confidence === 'convention');
  check('the pay-yourself rule sets the salary at the low month', table.payYourself && table.payYourself.basis, 'low');
  check('buffer: 3 months usual, 6 full', table.buffer.usualMonths + '/' + table.buffer.fullMonths, '3/6');
  check('the emergency cushion is 3 months of spending', table.emergencyCushionMonths, 3);
  checkTrue('tax comes off the top for the self-employed and mixed', table.taxOffTheTop.appliesTo.indexOf('selfEmployed') !== -1 && table.taxOffTheTop.appliesTo.indexOf('mixed') !== -1);
  check('proposals: 70% and 130% of the average', table.propose.lowShareOfAverage + '/' + table.propose.highShareOfAverage, '0.7/1.3');
  ['id', 'version', 'asOf', 'source', 'confidence', 'confidenceNote', 'note'].forEach(function (k) { checkTrue('header field ' + k, typeof table[k] === 'string' && table[k].length > 0); });

  /* -- A self-employed household, built by hand ------------------------------
     $60,000 a year from own work (1099), $3,000 a month spending, $9,000
     cash, single. */
  function build(o) {
    var p = Schema.createPerson({ id: 'p', label: 'You', role: 'adult', employmentStatus: o.status || 'selfEmployed' });
    if (o.source !== null) {
      p.incomeSources.push(Schema.createIncomeSource(Object.assign({ id: 's', personId: 'p', type: '1099', grossAnnualIncomeCents: 6000000 }, o.source || {})));
    }
    (o.extraSources || []).forEach(function (s) { p.incomeSources.push(Schema.createIncomeSource(s)); });
    var h = Schema.createHousehold({
      people: [p], filingStatus: 'single',
      assets: o.cash === null ? [] : [Schema.createAsset({ id: 'c', category: 'cash', liquid: true, valueCents: o.cash === undefined ? 900000 : o.cash })],
      variableIncome: { bufferMonths: o.buffer === undefined ? 3 : o.buffer }
    });
    if (o.spending !== null) h.expenses.monthlyEssential.estimatedValueCents = o.spending === undefined ? 300000 : o.spending;
    return h;
  }

  /* Case 1, by hand: average = 60,000 ÷ 12 = $5,000. Low $3,500, high
     $6,500, buffer 3 months: gap = 5,000 − 3,500 = $1,500; buffer needed =
     1,500 × 3 = $4,500. Cushion = 3 × 3,000 = $9,000; cash $9,000, so free
     cash = 0 and the cushion comes first. Low 3,500 > spending 3,000: no
     shortfall, the cash covers every low month. Salary = the low month. */
  var h1 = build({ source: { variableLowCents: 350000, variableHighCents: 650000 } });
  var r1 = VI.plan(h1, T);
  checkTrue('case 1 plans', Money.isOk(r1), r1.reason);
  check('average month = 60,000 ÷ 12 = $5,000', r1.averageMonthCents, 500000);
  check('… read as gross ÷ 12', r1.averageBasis, 'gross');
  check('the salary is the low month, $3,500', r1.value, 350000);
  check('… and not spending', r1.salaryIsSpending, false);
  check('gap = 5,000 − 3,500 = $1,500', r1.gapCents, 150000);
  check('buffer needed = 1,500 × 3 = $4,500', r1.bufferNeededCents, 450000);
  check('cushion = 3 × 3,000 = $9,000', r1.cushionCents, 900000);
  check('free cash after the cushion = 9,000 − 9,000 = $0', r1.freeCashCents, 0);
  check('… so nothing of the buffer is held', r1.bufferHeldCents, 0);
  check('… and the cushion comes first', r1.cushionCompetes, true);
  check('low above spending: no shortfall', r1.shortfallCents, 0);
  check('… the cash covers every low month', r1.coversEveryOne, true);
  check('… so no count of low months', r1.lowMonthsCovered, null);
  check('zone watch: buffer wanted, none held', r1.zone, 'watch');
  check('the source is own work', r1.sourceIsOwnWork, true);

  /* The tax set-aside is the Self-Employed room's quarterly ÷ 3, on the
     $60,000 read as profit — reused, never re-derived. */
  var q = SE.quarterlyEstimated(h1, T, { expectedNetProfitCents: 6000000 });
  checkTrue('the quarterly estimate is ok on $60,000 single', Money.isOk(q));
  check('tax set-aside a month = the quarterly ÷ 3', r1.taxSetAsideMonthlyCents, Math.round(q.perQuarterCents / 3));
  checkTrue('… and is more than nothing', r1.taxSetAsideMonthlyCents > 0);
  check('… on the own-work source’s annual figure', r1.taxSetAside.expectedNetProfitCents + '/' + r1.taxSetAside.profitBasis, '6000000/own-work source');

  /* Case 2, by hand: low $2,500 < spending $3,000: shortfall $500; cash
     9,000 ÷ 500 = 18 low months in a row; the salary is spending. */
  var h2 = build({ source: { variableLowCents: 250000, variableHighCents: 650000 } });
  var r2 = VI.plan(h2, T);
  check('case 2: shortfall = 3,000 − 2,500 = $500', r2.shortfallCents, 50000);
  check('… the cash covers 9,000 ÷ 500 = 18 low months', r2.lowMonthsCovered, 18);
  check('… the salary is spending, $3,000', r2.value, 300000);
  check('… flagged as spending', r2.salaryIsSpending, true);
  check('… gap = 5,000 − 2,500 = $2,500', r2.gapCents, 250000);
  check('… buffer needed = 2,500 × 3 = $7,500', r2.bufferNeededCents, 750000);
  check('… 18 ≥ 3 and nothing held: watch', r2.zone, 'watch');

  /* -- Edge cases ------------------------------------------------------------ */
  /* Low month above spending with cash to spare: every one, and good. Cash
     $13,500: cushion 9,000, free 4,500 ≥ the 4,500 buffer. */
  var r3 = VI.plan(build({ source: { variableLowCents: 350000, variableHighCents: 650000 }, cash: 1350000 }), T);
  check('low above spending, buffer fully held: every one', r3.coversEveryOne, true);
  check('… free cash = 13,500 − 9,000 = $4,500', r3.freeCashCents, 450000);
  check('… held = the $4,500 needed', r3.bufferHeldCents, 450000);
  check('… zone good', r3.zone, 'good');
  check('… cushion and buffer do not compete', r3.cushionCompetes, false);

  /* No cash: covers 0 low months, and that is out. */
  var r4 = VI.plan(build({ source: { variableLowCents: 250000 }, cash: 0 }), T);
  check('no cash: covers 0 low months', r4.lowMonthsCovered, 0);
  check('… zone out (fewer than 3 low months covered with a shortfall)', r4.zone, 'out');
  var r4b = VI.plan(build({ source: { variableLowCents: 250000 }, cash: null }), T);
  check('cash not entered: the count is null, not zero', r4b.lowMonthsCovered, null);
  checkTrue('… and carries the schema’s reason', typeof r4b.cashReason === 'string' && r4b.cashReason.length > 0);

  /* Low = high = average: gap 0, buffer $0. */
  var r5 = VI.plan(build({ source: { variableLowCents: 500000, variableHighCents: 500000 } }), T);
  check('low = high = average: gap 0', r5.gapCents, 0);
  check('… buffer $0', r5.bufferNeededCents, 0);
  check('… nothing to compete over', r5.cushionCompetes, false);
  check('… zone good (a $0 buffer is held)', r5.zone, 'good');

  /* Buffer 0 months: needed $0, held $0. */
  var r6 = VI.plan(build({ source: { variableLowCents: 350000 }, buffer: 0 }), T);
  check('buffer 0 months: needed $0', r6.bufferNeededCents, 0);
  check('… held $0', r6.bufferHeldCents, 0);
  /* Buffer not entered: the buffer parts are null, the salary still stands. */
  var r6b = VI.plan(build({ source: { variableLowCents: 350000 }, buffer: null }), T);
  check('buffer not entered: needed is null, not zero', r6b.bufferNeededCents, null);
  check('… the salary still stands', r6b.value, 350000);
  check('… no zone without a buffer to judge', r6b.zone, null);

  /* No gross → incomplete. */
  var r7 = VI.plan(build({ source: { grossAnnualIncomeCents: null, variableLowCents: 350000 } }), T);
  check('no gross: incomplete', r7.status, 'incomplete');
  checkTrue('… and says to add income', /income/.test(r7.reason));
  /* No low month → incomplete, naming the box. */
  var r8 = VI.plan(build({ source: {} }), T);
  check('no low month: incomplete', r8.status, 'incomplete');
  check('… naming the low month', r8.missing[0], 'variableLowCents');

  /* Empty household: no throw, says why. */
  var threw = false, r9 = null;
  try { r9 = VI.plan(Schema.createHousehold({}), T); } catch (e) { threw = true; }
  checkTrue('an empty household does not throw', !threw);
  check('… incomplete', r9 && r9.status, 'incomplete');
  var threw2 = false;
  try { VI.plan(undefined, T); VI.plan(null, {}); VI.plan(Schema.createHousehold({}), {}); VI.propose(Schema.createHousehold({}), {}); } catch (e) { threw2 = true; }
  checkTrue('no household, no tables: does not throw', !threw2);
  check('propose on an empty household: no low, no high, the table’s 3', JSON.stringify([VI.propose(Schema.createHousehold({}), T).lowCents, VI.propose(Schema.createHousehold({}), T).bufferMonths]), '[null,3]');

  /* A variable-basis source whose rateCents is the monthly average (the
     one-pager's "a month on average"): the average is that source's, not
     the household's gross. Own work $4,000 a month on average alongside a
     $36,000 job (mixed): average = $4,000, not (48,000 + 36,000) ÷ 12. */
  var mixed = build({ status: 'both',
    source: { frequency: 'variable', rateCents: 400000, grossAnnualIncomeCents: 4800000, variableLowCents: 300000, variableHighCents: 550000 },
    extraSources: [{ id: 'job', personId: 'p', type: 'w2', grossAnnualIncomeCents: 3600000 }] });
  var rm = VI.plan(mixed, T);
  check('mixed, own work entered as a month on average: the average is that source’s $4,000', rm.averageMonthCents, 400000);
  check('… said so', rm.averageBasis, 'source');
  check('… gap = 4,000 − 3,000 = $1,000', rm.gapCents, 100000);
  check('… the set-aside reads the own-work $48,000 as profit', rm.taxSetAside.expectedNetProfitCents, 4800000);
  /* Mixed with the own-work source typed as an annual 1099: the whole gross. */
  var mixed2 = build({ status: 'both', source: { variableLowCents: 300000 }, extraSources: [{ id: 'job', personId: 'p', type: 'w2', grossAnnualIncomeCents: 3600000 }] });
  var rm2 = VI.plan(mixed2, T);
  check('mixed, own work as an annual figure: the average is the whole gross ÷ 12 = 96,000 ÷ 12', rm2.averageMonthCents, 800000);
  check('… read as gross', rm2.averageBasis, 'gross');

  /* Employed: no quarterly to set aside, the rest still plans. */
  var emp = build({ status: 'employed', source: { type: 'w2', variableLowCents: 350000 } });
  var re = VI.plan(emp, T);
  checkTrue('employed: still plans', Money.isOk(re));
  check('… no tax set-aside', re.taxSetAsideMonthlyCents, null);
  checkTrue('… and says why', /self-employed/i.test(re.taxSetAside.reason));

  /* Proposals: 70% and 130% of the $5,000 average. */
  var g = VI.propose(h1, T);
  check('proposed low = 70% of 5,000 = $3,500', g.lowCents, 350000);
  check('proposed high = 130% of 5,000 = $6,500', g.highCents, 650000);
  check('proposed buffer = the table’s 3', g.bufferMonths, 3);

  /* A negative low month is refused, not planned. */
  check('a negative low month is incomplete', VI.plan(build({ source: { variableLowCents: -100 } }), T).status, 'incomplete');

  /* -- Ownership: the three fields are this room's --------------------------- */
  ['incomeLow', 'incomeHigh', 'bufferMonths'].forEach(function (f) {
    var d = t.Ownership.field(f);
    check('ownership: ' + f + ' is owned by variable-income at #inputs', d && (d.owner + '/' + d.anchor), 'variable-income/inputs');
  });
  check('Ownership.variableSource picks the 1099 source', t.Ownership.variableSource(mixed2).id, 's');
  check('… reads the low month from it', t.Ownership.field('incomeLow').read(h1).value, 350000);
  checkTrue('the room appears for the variableIncome branch', t.Registry.requires('variable-income').indexOf('variableIncome') !== -1);
  checkTrue('… which exists for the self-employed and mixed, not the employed', t.Gate.exists(h1, 'variableIncome') && t.Gate.exists(mixed, 'variableIncome') && !t.Gate.exists(emp, 'variableIncome'));

  /* -- The page ----------------------------------------------------------- */
  var html = t.fs.readFileSync(t.path.join(t.ROOT, 'rooms/variable-income.html'), 'utf8');
  checkTrue('the page mounts the template', /Room\.mount\(\{/.test(html) && /id: 'variable-income'/.test(html));
  t.Room.IDS.forEach(function (id) { checkTrue('the page has #' + id, html.indexOf('id="' + id + '"') !== -1); });
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading', 'room-standalone', 'load-notice'].forEach(function (id) { checkTrue('the page has the section #' + id, html.indexOf('id="' + id + '"') !== -1); });
  checkTrue('the page loads the engine after selfemployed.js', html.indexOf('engines/selfemployed.js') < html.indexOf('engines/variableincome.js') && html.indexOf('engines/variableincome.js') < html.indexOf('shared/room.js'));
  checkTrue('the page declares LIVE-FORM: built once', /LIVE-FORM: built once/.test(html));
  checkTrue('one Charts.bars call, no other chart', (html.match(/Charts\.(bars|area|donut|stacked)\(/g) || []).every(function (m) { return m === 'Charts.bars('; }));
  checkTrue('writes go through upsertIncomeSource and Spine.set', /Spine\.upsertIncomeSource\(person\.id/.test(html) && /Spine\.set\('variableIncome\.bufferMonths'/.test(html));
  checkTrue('the room says what it does not do', /scope: 'This room does not forecast a season/.test(html));
  checkTrue('no silent || 0 in the engine', !/\|\|\s*0\b/.test(t.fs.readFileSync(t.path.join(t.ROOT, 'engines/variableincome.js'), 'utf8')));
};
