/* test/rooms/week.js — the Designed Week room (D-101).
   Hand-derived numbers as literals; nothing copied from engine output. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Registry, Ownership, Gate, Tier0, Hourly, Demo, TABLES } = t;
  const Week = require(path.join(ROOT, 'engines/week.js'));
  const T = { weekBlocks: TABLES.weekBlocks, expenseCategories: TABLES.expenseCategories, effectiveTaxRates: TABLES.effectiveTaxRates };

  section('Designed Week — the table');

  const tbl = TABLES.weekBlocks;
  checkTrue('data/week_blocks.json is filled and honest', !!tbl && tbl.confidence === 'convention' && !/PLACEHOLDER/.test(tbl.source));
  check('… 168 hours in a week', tbl.hoursInWeek, 168);
  check('… thirteen starter blocks', tbl.blocks.length, 13);
  check('… the first five are sleep, work, getting there, home, cooking', tbl.blocks.slice(0, 5).map(b => b.id).join(','), 'sleep,work,getting-there,home,cook-eat');
  checkTrue('… every block names a category in data/expense_categories.json or none', tbl.blocks.every(b => b.categoryId === null || TABLES.expenseCategories.categories.some(c => c.id === b.categoryId)));
  check('… the starter hours add to 164, four short of the week', tbl.blocks.reduce((s, b) => s + b.hours, 0), 164);
  check('the engine reads the week from the table', Week.hoursInWeek(T), 168);
  check('… and falls back to 168 without it', Week.hoursInWeek(null), 168);
  check('… a table block by id', Week.tableBlock(T, 'cook-eat').hours, 12);

  section('Designed Week — the units, once');

  /* $80 a week × 52 ÷ 12 = $346.67; $300 a month × 12 ÷ 52 = $69.23. */
  check('a week to a month: 8,000¢ → 34,667¢', Week.weeklyToMonthlyCents(8000), 34667);
  check('a month to a week: 30,000¢ → 6,923¢', Week.monthlyToWeeklyCents(30000), 6923);

  function household(o) {
    const opts = o || {};
    const person = Schema.createPerson({ id: 'p', label: 'You', role: 'adult', employmentStatus: opts.status || 'employed',
      incomeSources: Money.isEntered(opts.gross) ? [Schema.createIncomeSource({ id: 'i', personId: 'p', type: 'w2', grossAnnualIncomeCents: opts.gross })] : [],
      work: opts.work || {} });
    return Schema.createHousehold({
      people: [person], filingStatus: 'single',
      expenses: { monthlyEssential: { estimatedValueCents: Money.isEntered(opts.spend) ? opts.spend : null }, entries: opts.entries || [] },
      designedWeek: { blocks: opts.blocks || [] }
    });
  }
  function block(id, label, hours, costCents, categoryId) { return { id, label, hours, costCents: costCents === undefined ? null : costCents, categoryId: categoryId || null }; }

  section('Designed Week — the worked case');

  /* sleep 56h $0, work 40h $0, family 20h $80/wk, play 10h $60/wk, rest 8h $0
       hours 56+40+20+10+8 = 134; unplaced 168 − 134 = 34
       a week (80+60) = $140 → 14,000¢; a month 14,000 × 52 ÷ 12 = 60,666.67 → 60,667¢
       a year 14,000 × 52 = 728,000¢
       FI at 4%: 60,667 × 12 ÷ 0.04 = 728,004 ÷ 0.04 = 18,200,100¢ ($182,001)
       against $3,150 now: 60,667 − 315,000 = −254,333¢ */
  const worked = [block('sleep', 'Sleep', 56, 0), block('work', 'Work', 40, 0), block('people', 'Family, care, calls', 20, 8000), block('fun', 'Things you do for fun', 10, 6000), block('rest', 'Rest', 8, 0)];
  const base = household({ gross: 7200000, spend: 315000, blocks: worked, work: { contractedHoursPerWeek: 40 } });
  const p = Week.priced(base, T);
  checkTrue('the week prices', Money.isOk(p), p.reason);
  check('134 hours placed', p.hours, 134);
  check('34 unplaced', p.unplacedHours, 34);
  check('… not over the week', p.overHours, false);
  check('a week: $140', p.weeklyCents, 14000);
  check('a month: $606.67', p.monthlyCents, 60667);
  check('… which is the value', p.value, 60667);
  check('a year: $7,280', p.annualCents, 728000);
  check('five blocks, none unpriced (a stored $0 is a cost)', p.blockCount + '/' + p.unpricedCount, '5/0');
  check('each row carries its month', p.rows.map(r => r.costMonthlyCents).join(','), '0,0,34667,26000,0');

  const fi = Week.fiNumber(base, T);
  checkTrue('the FI number computes', Money.isOk(fi), fi.reason);
  check('… $182,001 at 4%', fi.value, 18200100);
  check('… at the household’s withdrawal rate', fi.swrRate, 0.04);
  checkTrue('… and is Tier0.fireNumber fed the designed month, not a second formula',
    fi.value === Tier0.fireNumber(Object.assign({}, base, { expenses: { monthlyEssential: { estimatedValueCents: 60667 } } })).value);
  const fi3 = Week.fiNumber(Object.assign({}, base, { assumptions: { swrRate: 0.035 } }), T);
  check('… a different withdrawal rate changes it: 728,004 ÷ 0.035', fi3.value, 20800114);

  const g = Week.gap(base, T);
  checkTrue('the gap computes', Money.isOk(g), g.reason);
  check('… designed − now = −$2,543.33', g.value, -254333);
  check('… against the month you have', g.nowMonthlyCents, 315000);
  checkTrue('… nothing tracked, so no lines to compare', g.tracked === false && g.rows.length === 0);

  const d = Week.design(base, T);
  checkTrue('the design is one Result', Money.isOk(d) && d.value === 60667 && d.fiCents === 18200100 && d.gapCents === -254333);
  checkTrue('… the wage applies to an employed person', d.wageApplies === true);
  checkTrue('… and the hours-of-itself line is the month over the real rate', d.realHourlyCents > 0 && Math.abs(d.hoursOfItself - Math.round(60667 / d.realHourlyCents * 10) / 10) < 1e-9);
  checkTrue('… the real rate is Hourly’s, not a second one', d.realHourlyCents === Hourly.realHourlyWage(base, T).realHourlyCents);
  check('the pure line: $606.67 a month at $21.04/h is 28.8 hours', Week.hoursOfItself(60667, 2104).value, 28.8);
  checkTrue('… a wage of zero is a reason, not infinity', Week.hoursOfItself(60667, 0).status === 'incomplete');
  checkTrue('… no result carries a status key in its extras', Object.keys(d).filter(k => k === 'status').length === 1 && d.status === 'ok');

  section('Designed Week — costs from the tracked month');

  /* Tracked: groceries $450/mo, dining out $260/mo. A block on groceries is
     proposed 450 × 12 ÷ 52 = $103.85 a week → 10,385¢; dining out 260 × 12 ÷ 52 = $60 → 6,000¢. */
  const entries = [
    Schema.createExpenseEntry({ id: 'e1', categoryId: 'groceries', amountCents: 45000, period: 'monthly', source: 'manual' }),
    Schema.createExpenseEntry({ id: 'e2', categoryId: 'dining_out', amountCents: 26000, period: 'monthly', source: 'manual' })
  ];
  const tracked = household({ spend: 315000, entries, blocks: [block('cook-eat', 'Cooking and eating in', 12, null, 'groceries'), block('out', 'Out', 6, 5000, 'dining_out'), block('sleep', 'Sleep', 56, null)] });
  const by = Week.trackedByCategory(tracked, T);
  check('the tracked month by category', by.groceries + '/' + by.dining_out, '45000/26000');
  check('a groceries block is proposed $103.85 a week', Week.proposeCost(tracked, T, { categoryId: 'groceries' }), 10385);
  check('… a block with no category proposes nothing', Week.proposeCost(tracked, T, { categoryId: null }), null);
  check('… a category not tracked proposes nothing', Week.proposeCost(tracked, T, { categoryId: 'travel' }), null);
  check('… and nothing without a tracked month', Week.proposeCost(base, T, { categoryId: 'groceries' }), null);
  const tp = Week.priced(tracked, T);
  check('an unstored cost falls back to the tracked line: 10,385 + 5,000 (stored wins) + 0', tp.weeklyCents, 15385);
  check('… and says where each came from', tp.rows.map(r => r.costSource).join(','), 'tracked,stored,none');
  check('… sleep has hours and no cost: priced $0, counted', tp.unpricedCount + ':' + tp.unpricedLabels.join(), '1:Sleep');
  const tg = Week.gap(tracked, T);
  checkTrue('the gap has lines when a month is tracked', tg.tracked && tg.rows.length === 2);
  const gro = tg.rows.filter(r => r.categoryId === 'groceries')[0], din = tg.rows.filter(r => r.categoryId === 'dining_out')[0];
  check('… groceries: 10,385 × 52 ÷ 12 = 45,002 designed against 45,000 now', gro.designedMonthlyCents + '/' + gro.nowMonthlyCents + '/' + gro.deltaCents, '45002/45000/2');
  check('… dining out: 5,000 × 52 ÷ 12 = 21,667 against 26,000 → −4,333', din.designedMonthlyCents + '/' + din.deltaCents, '21667/-4333');
  checkTrue('… neither dropped nor added', !gro.dropped && !gro.added && !din.dropped && !din.added);
  const dropped = Week.gap(household({ spend: 315000, entries, blocks: [block('cook-eat', 'Cooking', 12, null, 'groceries')] }), T);
  checkTrue('a tracked line the week never mentions is dropped', dropped.rows.filter(r => r.categoryId === 'dining_out')[0].dropped === true);
  const added = Week.gap(household({ spend: 315000, entries, blocks: [block('away', 'Away', 2, 4000, 'travel')] }), T);
  checkTrue('a line the month never had is added', added.rows.filter(r => r.categoryId === 'travel')[0].added === true);

  section('Designed Week — edge cases');

  const none = Week.design(household({ spend: 315000 }), T);
  checkTrue('no blocks → incomplete, "place an hour"', none.status === 'incomplete' && /[Pp]lace an hour/.test(none.reason) && none.missing.indexOf('designedWeek') !== -1);
  const unplaced = Week.design(household({ spend: 315000, blocks: [block('sleep', 'Sleep', null, 0)] }), T);
  checkTrue('a block with no hours is not placed', unplaced.status === 'incomplete');
  checkTrue('… but a typed zero is', Money.isOk(Week.priced(household({ spend: 315000, blocks: [block('home', 'Home', 0, 35000, 'housing')] }), T)));

  /* Over the week: 100 + 80 = 180 hours. Shown as 180, flagged, unplaced 0. */
  const over = Week.priced(household({ spend: 315000, blocks: [block('sleep', 'Sleep', 100, 0), block('work', 'Work', 80, 0)] }), T);
  check('hours over 168 → the sum is shown', over.hours, 180);
  checkTrue('… and flagged', over.overHours === true);
  check('… unplaced reads 0', over.unplacedHours, 0);
  check('… with the sign kept aside', over.rawUnplacedHours, -12);

  /* Hours and no cost: priced $0, not blank. */
  const nocost = Week.design(household({ spend: 315000, blocks: [block('people', 'Family', 20, null)] }), T);
  checkTrue('a block with hours and no cost is priced $0', Money.isOk(nocost) && nocost.value === 0 && nocost.weeklyCents === 0);
  check('… and named', nocost.unpricedCount + ':' + nocost.unpricedLabels[0], '1:Family');
  check('… a $0 month is a $0 FI number, not a reason', nocost.fiCents, 0);

  /* No wage (retired): the hours-of-itself line is absent, the rest is not. */
  const retired = Week.design(household({ status: 'retired', spend: 300000, blocks: worked }), T);
  checkTrue('retired → the wage does not apply', Money.isOk(retired) && retired.wageApplies === false && retired.hoursOfItself === null && retired.realHourlyCents === null);
  checkTrue('… with the reason', /situation/.test(retired.wageReason));
  check('… and the month still prices', retired.value, 60667);
  checkTrue('… as does the FI number', retired.fiCents === 18200100);
  const noincome = Week.design(household({ spend: 315000, blocks: worked, work: { contractedHoursPerWeek: 40 } }), T);
  checkTrue('employed with no income → the line waits with Hourly’s reason', noincome.wageApplies && noincome.hoursOfItself === null && /income/.test(noincome.wageReason));

  /* No month to compare: the number stands, the gap says why. */
  const nonow = Week.design(household({ blocks: worked }), T);
  checkTrue('no spending → the month prices and the gap waits', Money.isOk(nonow) && nonow.value === 60667 && nonow.gapCents === null && nonow.nowMonthlyCents === null && /expenses/.test(nonow.nowReason));

  /* Empty household: a reason, never a throw. */
  let empty;
  try { empty = Week.design(Schema.createHousehold({}), T); } catch (e) { empty = { threw: e.message }; }
  checkTrue('empty household → incomplete, no throw', empty && empty.status === 'incomplete', empty && empty.threw);
  checkTrue('… with a reason', typeof empty.reason === 'string' && empty.reason.length > 0);
  let notables;
  try { notables = Week.design(base, {}); } catch (e) { notables = { threw: e.message }; }
  checkTrue('… and no tables is not a throw either', notables && Money.isOk(notables) && notables.hoursInWeek === 168, notables && notables.threw);
  checkTrue('… the ownership read agrees on the hours', Ownership.field('designedHours').read(base).value === 134);

  /* The demo persona with the worked week. */
  const demo = Demo.build();
  demo.designedWeek = Schema.createDesignedWeek({ blocks: worked });
  const dd = Week.design(demo, T);
  checkTrue('the demo persona with the worked week computes', Money.isOk(dd) && dd.value === 60667 && dd.hoursOfItself !== null, dd.reason);
  check('… against Robin’s month', dd.nowMonthlyCents, Money.toCents(Demo.VALUES.monthlyEssentialExpenses));
  demo.expenses.entries = Demo.buildSpending();
  const dt = Week.design(demo, T);
  checkTrue('… and with the tracked month, a groceries block would be $103.85 a week', Week.proposeCost(demo, T, { categoryId: 'groceries' }) === 10385 && dt.tracked === true);

  section('Designed Week — the room on the template');

  const html = fs.readFileSync(path.join(ROOT, 'rooms/week.html'), 'utf8');
  checkTrue('rooms/week.html mounts on the template', /Room\.mount\(\{/.test(html) && /id: 'week'/.test(html));
  ['room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list', 'room-standalone', 'load-notice']
    .forEach(id => checkTrue('… host #' + id, html.indexOf('id="' + id + '"') !== -1));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading'].forEach(id => checkTrue('… section #' + id, html.indexOf('id="' + id + '"') !== -1));
  const tag = f => html.indexOf('src="../' + f + '"');
  checkTrue('… loads the engine after tier0, hourly and cashflow, before the lens', tag('engines/tier0.js') < tag('engines/week.js') && tag('engines/hourly.js') < tag('engines/week.js') && tag('engines/cashflow.js') < tag('engines/week.js') && tag('engines/week.js') < tag('shared/lens.js') && tag('engines/week.js') > 0);
  checkTrue('… is not the stub', html.indexOf('STUB') === -1 && html.indexOf('Hourly.realHourlyWage') === -1);
  checkTrue('… declares LIVE-FORM: built once', /LIVE-FORM: built once/.test(html));
  checkTrue('… writes designedWeek.blocks through Spine.set and nothing else', (html.match(/Spine\.set\(/g) || []).length === 1 && html.indexOf("Spine.set('designedWeek.blocks'") !== -1 && !/upsertPerson|upsertAsset|updateProfile/.test(html));
  checkTrue('… the cost rides in the same write', /costCents: cost/.test(html) && /proposeCost\(/.test(html));
  checkTrue('… the shared numbers are read, not edited', /reads: \['monthlyExpenses', 'grossAnnualIncome'\]/.test(html));
  checkTrue('… one stacked chart', (html.match(/Charts\.stacked\(/g) || []).length === 2 && !/Charts\.(area|donut|bars)\(/.test(html));
  const ids = (html.match(/\{ id: '([a-z-]+)',\s+label:/g) || []).map(m => m.replace(/\{ id: '/, '').replace(/',\s+label:/, ''));
  check('… the page names the table’s thirteen blocks in the table’s order', ids.join(','), tbl.blocks.map(b => b.id).join(','));
  tbl.blocks.forEach(b => checkTrue('… block ' + b.id + ' keeps the table’s label and category', html.indexOf("label: '" + b.label + "'") !== -1 && html.indexOf("categoryId: " + (b.categoryId ? "'" + b.categoryId + "'" : 'null')) !== -1));
  checkTrue('… five inputs, the rest folded', /inputs: BLOCKS\.slice\(0, 5\)/.test(html) && /more: BLOCKS\.slice\(5\)/.test(html));
  checkTrue('… the table proposes the hours through Suggest', /propose: function/.test(html) && /tableBlock\(T, def\.id\)/.test(html));
  checkTrue('… the scope line says what it does not do', /scope: 'This room does not schedule anything/.test(html));
  checkTrue('… why is written for every situation', Gate.SITUATIONS.every(s => new RegExp(s.id + ": '.{40,}").test(html)));
  checkTrue('… the over-the-week case is said', /more hours than the week has/.test(html));
  checkTrue('… and the no-cost case', /priced \$0, not blank/.test(html));

  const room = Registry.byId('week');
  checkTrue('the registry row exists', !!room && room.href === 'rooms/week.html');
  check('… appears for everyone', Gate.SITUATIONS.filter(s => Registry.applies(room, household({ status: s.status }))).map(s => s.id).join(','), Gate.SITUATIONS.map(s => s.id).join(','));
  check('… the write is owned here', Ownership.field('designedHours').owner, 'week');
  check('… anchored on the inputs', Ownership.field('designedHours').anchor, 'inputs');
};
