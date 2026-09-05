/* test/rooms/big-purchase.js — the Big Purchase room (D-099).
   Hand-derived numbers as literals; nothing copied from engine output. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Demo, Registry, Ownership, Gate, Lens, Hourly, TABLES } = t;
  const Purchase = require(path.join(ROOT, 'engines/purchase.js'));
  const T = TABLES;

  function household(o) {
    const opts = o || {};
    const person = Schema.createPerson({ id: 'p', label: 'You', role: 'adult', employmentStatus: opts.status || 'employed',
      work: Money.isEntered(opts.gross) ? { contractedHoursPerWeek: 40 } : null,
      incomeSources: Money.isEntered(opts.gross) ? [Schema.createIncomeSource({ id: 'i', personId: 'p', type: opts.type || 'w2', grossAnnualIncomeCents: opts.gross })] : [] });
    const assets = [];
    if (Money.isEntered(opts.cash)) assets.push(Schema.createAsset({ id: 'c', category: 'cash', liquid: true, valueCents: opts.cash }));
    if (Money.isEntered(opts.inv)) assets.push(Schema.createAsset({ id: 'v', category: 'investment', valueCents: opts.inv }));
    return Schema.createHousehold({
      people: [person], assets: assets, filingStatus: opts.filing || null,
      expenses: { monthlyEssential: { estimatedValueCents: Money.isEntered(opts.spend) ? opts.spend : null } },
      purchase: opts.purchase || null
    });
  }
  function withPurchase(h, purchase) { return Object.assign({}, h, { purchase: purchase }); }

  section('Big Purchase — the demo, by hand');

  /* Robin: $72,000, the demo work profile → real wage $21.04/h (the Real
     Hourly Wage section above derives it); cash $9,500; spending $3,150.
     A $1,200 thing, six months away:
       hours     1,200 ÷ 21.04                       = 57.03 h
       floor     3,150 × 3                           = $9,450
       cushion   3,150 × 6                           = $18,900
       after     9,500 − 1,200                       = $8,300   < the floor
       above     9,500 − 9,450                       = $50
       need      1,200 − 50                          = $1,150
       monthly   1,150 ÷ 6 = 191.67, up to the cent  = $191.67
     Financed at 9% over 36 months (not a car):
       r = 0.09 ÷ 12 = 0.0075
       payment = 1,200 × 0.0075 ÷ (1 − 1.0075^−36) = $38.16
       interest = 38.16 × 36 − 1,200               = $173.76                */
  const demo = Demo.build();
  check('the demo wage the hours lean on is $21.04', Hourly.realHourlyWage(demo, T, {}).realHourlyCents, 2104);

  const six = Purchase.weigh(withPurchase(demo, { priceCents: 120000, monthsAway: 6 }), T);
  checkTrue('the demo computes', Money.isOk(six), six.reason);
  check('the value is the price', six.value, 120000);
  check('57.03 hours of life', six.hours, 120000 / 2104, 1e-9);
  check('… at the $21.04 wage', six.wageCents, 2104);
  check('… the same reading the lens gives', six.hours, Lens.apply(120000, 'hours', demo, T).value, 1e-12);
  check('the floor is $9,450', six.floorCents, 945000);
  check('the full cushion is $18,900', six.fullCents, 1890000);
  check('cash after, paid today, $8,300', six.cashAfterCents, 830000);
  checkTrue('… which is under the floor', six.cashShortOfFloor === true);
  check('$50 above the floor today', six.aboveFloorCents, 5000);
  check('so $1,150 still to find', six.needCents, 115000);
  check('… $191.67 a month for six months', six.monthlySavingCents, 19167);
  checkTrue('… not affordable today', six.affordToday === false);
  check('six months away and short → watch', six.zone, 'watch');
  checkTrue('FI pushed is read through the lens', six.fiMonthsPushed !== null && six.fiMonthsPushed === Lens.apply(120000, 'pushed', demo, T).value);
  checkTrue('… and is a small number of months for $1,200', six.fiMonthsPushed >= 0 && six.fiMonthsPushed <= 6, String(six.fiMonthsPushed));
  checkTrue('paid in cash: no payment, no interest', six.financed === false && six.paymentCents === null && six.totalInterestCents === null);
  check('… the default term is 36 months', six.termMonths, 36);

  const now = Purchase.weigh(withPurchase(demo, { priceCents: 120000, monthsAway: 0 }), T);
  check('months 0 and cash short → out', now.zone, 'out');
  checkTrue('… paid now', now.paidNow === true && now.monthsKnown === true);
  checkTrue('… no monthly saving figure when there are no months', now.monthlySavingCents === null);

  const fin = Purchase.weigh(withPurchase(demo, { priceCents: 120000, monthsAway: 0, financeRate: 0.09 }), T);
  const exact = 120000 * 0.0075 / (1 - Math.pow(1.0075, -36));
  check('financed at 9% over 36 months: the level payment by the formula', fin.paymentCents, exact, 0.5);
  check('… $38.16 a month', fin.paymentCents, 3816, 1);
  check('… $173.76 of interest, from the payment actually made', fin.totalInterestCents, 3816 * 36 - 120000, 36);
  check('… the total paid reconciles', fin.totalPaidCents, fin.paymentCents * 36);
  check('… financed, the cash stays put', fin.cashAfterCents, 950000);
  check('… and the zone is watch, not out', fin.zone, 'watch');
  checkTrue('… no car rule for something that is not a car', fin.carRule === null);

  section('Big Purchase — edge cases');

  /* No price: incomplete, and it says so. */
  const noPrice = Purchase.weigh(withPurchase(demo, {}), T);
  checkTrue('no price → incomplete', noPrice.status === 'incomplete' && /price/i.test(noPrice.reason));
  check('… naming the field', noPrice.missing.join(','), 'priceCents');
  checkTrue('a negative price → incomplete', Purchase.weigh(withPurchase(demo, { priceCents: -100 }), T).status === 'incomplete');

  /* Price at or under the cash above the floor: afford it today.
       cash $20,000, spending $3,000 → floor $9,000, above $11,000; $5,000 fits. */
  const easy = Purchase.weigh(household({ gross: 7200000, cash: 2000000, spend: 300000, filing: 'single', purchase: { priceCents: 500000, monthsAway: 0 } }), T);
  checkTrue('price under the cash above the floor → afford it today', easy.affordToday === true);
  check('… nothing to find', easy.needCents, 0);
  check('… cash after $15,000, above the $9,000 floor', easy.cashAfterCents + '/' + easy.floorCents, '1500000/900000');
  check('… good', easy.zone, 'good');
  checkTrue('… and the verdict says so', /afford it today/.test(easy.verdict));

  /* Financing at 0%: the price split evenly, no interest at all.
       $1,200 over 36 = $33.33; the cent of rounding is not "interest". */
  const zero = Purchase.weigh(withPurchase(demo, { priceCents: 120000, monthsAway: 0, financeRate: 0 }), T);
  checkTrue('a rate of 0 is a loan, not cash', zero.financed === true);
  check('… payment = price ÷ term', zero.paymentCents, Math.round(120000 / 36));
  check('… interest $0', zero.totalInterestCents, 0);
  check('… total paid is the price', zero.totalPaidCents, 120000);

  /* A car: the term is 60 months and Quick Math's 20/3/8 rule is run.
       demo gross $72,000 → $6,000 a month → 8% cap $480. */
  const car = Purchase.weigh(withPurchase(demo, { priceCents: 1500000, monthsAway: 0, financeRate: 0.07, label: 'car' }), T);
  check('a car finances over 60 months', car.termMonths, 60);
  check('… the 8% payment cap is $480', car.carRule && car.carRule.paymentCapCents, 48000);
  const carExact = 1500000 * (0.07 / 12) / (1 - Math.pow(1 + 0.07 / 12, -60));
  check('… the payment by the formula', car.paymentCents, carExact, 0.5);
  checkTrue('… the term leg of 20/3/8 fails at 60 months', car.carRule.checks.filter(c => c.key === 'term')[0].pass === false);
  checkTrue('… and the rule carries no nested status', car.carRule.status === undefined);
  check('a car paid in cash still assumes the 60-month term for the drawer', Purchase.weigh(withPurchase(demo, { priceCents: 1500000, monthsAway: 0, label: 'car' }), T).termMonths, 60);
  check('termFor: 36 by default, 60 for a car', Purchase.termFor(null) + '/' + Purchase.termFor('trip') + '/' + Purchase.termFor('car'), '36/36/60');

  /* Months blank: no date yet, priced as if today. */
  const blank = Purchase.weigh(withPurchase(demo, { priceCents: 120000 }), T);
  checkTrue('months blank → not known, priced as today', blank.monthsKnown === false && blank.monthsAway === 0 && blank.paidNow === true);
  check('… and short of the floor it is out, like today', blank.zone, 'out');

  /* No wage (retired): hours absent, the FI months stand in.
       pension $48,000, spending $2,500, cash $30,000, investments $600,000, single. */
  const ret = Purchase.weigh(household({ status: 'retired', type: 'pension', gross: 4800000, cash: 3000000, inv: 60000000, spend: 250000, filing: 'single', purchase: { priceCents: 500000, monthsAway: 0 } }), T);
  checkTrue('retired → no hours', ret.hours === null && /No real hourly wage/.test(ret.hoursReason));
  checkTrue('… the FI months pushed are there instead', Money.isEntered(ret.fiMonthsPushed), ret.fiReason);
  check('… $5,000 is two months of $2,500 spending', ret.monthsOfSpending, 2, 1e-12);
  check('… floor $7,500, cash after $25,000 → good', ret.zone, 'good');

  /* No wage and no FI (between jobs, no income): months of spending stands in. */
  const bj = Purchase.weigh(household({ status: 'unemployed', cash: 900000, spend: 300000, purchase: { priceCents: 150000, monthsAway: 0 } }), T);
  checkTrue('between jobs → no hours and no FI', bj.hours === null && bj.fiMonthsPushed === null);
  check('… half a month of spending', bj.monthsOfSpending, 0.5, 1e-12);
  check('… $9,000 less $1,500 is under the $9,000 floor → out', bj.zone, 'out');

  /* Cash or spending missing: the reading is said, not invented. */
  const noCash = Purchase.weigh(household({ gross: 7200000, spend: 300000, filing: 'single', purchase: { priceCents: 100000, monthsAway: 0 } }), T);
  checkTrue('no cash → cash after is null and says why', noCash.cashAfterCents === null && /cash/i.test(noCash.cashReason));
  checkTrue('… zone withheld', noCash.zone === null && noCash.affordToday === null);
  checkTrue('… the hours still compute', noCash.hours !== null);

  /* The cost-per-use hook reuses Quick Math: $1,200 over 40 uses = $30. */
  check('cost per use through Quick Math', Purchase.weigh(withPurchase(demo, { priceCents: 120000, monthsAway: 0 }), T, { uses: 40 }).perUseCents, 3000);

  /* Empty household: an incomplete Result with a reason, never a throw. */
  let empty;
  try { empty = Purchase.weigh(Schema.createHousehold({}), T); } catch (e) { empty = { threw: e.message }; }
  checkTrue('empty household → incomplete, no throw', empty && empty.status === 'incomplete', empty && empty.threw);
  checkTrue('… with a reason', typeof empty.reason === 'string' && empty.reason.length > 0);
  let priced;
  try { priced = Purchase.weigh(withPurchase(Schema.createHousehold({}), { priceCents: 50000 }), T); } catch (e) { priced = { threw: e.message }; }
  checkTrue('empty household with a price → ok, every reading withheld with a reason', Money.isOk(priced) && priced.hours === null && priced.cashAfterCents === null && priced.zone === null, priced.threw);
  checkTrue('… no tables → no throw either', (function () { try { return Money.isOk(Purchase.weigh(withPurchase(demo, { priceCents: 50000 }), {})); } catch (e) { return false; } })());
  checkTrue('… no result carries a status key in its extras', !Object.keys(six).some(k => k === 'status' && six[k] !== 'ok'));
  check('the cushion convention is 3 and 6 months', Purchase.CUSHION.floorMonths + '/' + Purchase.CUSHION.fullMonths, '3/6');
  check('plan() reads every field entered-or-null', JSON.stringify(Purchase.plan({})), JSON.stringify({ priceCents: null, monthsAway: null, financeRate: null, label: null }));

  section('Big Purchase — the room on the template');

  const html = fs.readFileSync(path.join(ROOT, 'rooms/big-purchase.html'), 'utf8');
  checkTrue('rooms/big-purchase.html mounts on the template', /Room\.mount\(\{/.test(html) && /id: 'big-purchase'/.test(html));
  ['room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list', 'room-standalone', 'load-notice']
    .forEach(id => checkTrue('… host #' + id, html.indexOf('id="' + id + '"') !== -1));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading'].forEach(id => checkTrue('… section #' + id, html.indexOf('id="' + id + '"') !== -1));
  const at = f => html.indexOf('src="../' + f + '"');
  checkTrue('… loads the engine after hourly and quickmath and before the lens',
    at('engines/hourly.js') !== -1 && at('engines/hourly.js') < at('engines/purchase.js') && at('engines/quickmath.js') < at('engines/purchase.js') && at('engines/purchase.js') < at('shared/lens.js'));
  checkTrue('… is not the stub', html.indexOf('STUB') === -1 && html.indexOf('Hourly.realHourlyWage') === -1 && html.indexOf('person.work') === -1);
  checkTrue('… writes the four purchase fields through Spine.set', ['purchase.priceCents', 'purchase.monthsAway', 'purchase.financeRate', 'purchase.label'].every(p => html.indexOf("Spine.set('" + p + "'") !== -1));
  checkTrue('… and nothing else', (html.match(/Spine\.set\(/g) || []).length === 4 && !/upsertPerson|upsertAsset|updateProfile/.test(html));
  checkTrue('… reads cash, spending and income as chips', /reads: \['cashSavings', 'monthlyExpenses', 'grossAnnualIncome'\]/.test(html));
  checkTrue('… one bars chart', /Charts\.bars\(/.test(html) && !/Charts\.(area|donut|stacked)\(/.test(html));
  checkTrue('… the select offers every kind', Purchase.KINDS.every(k => html.indexOf("'" + k[0] + "'") !== -1) || /Purchase\.KINDS/.test(html));
  checkTrue('… the drawer links to Quick Math and Real Hourly Wage', /quick-math\.html/.test(html) && /real-hourly-wage\.html/.test(html));
  checkTrue('… and the scope line says what it does not do', /scope: 'This room does not judge whether you should/.test(html));
  checkTrue('… every situation has a why', ['employed', 'selfEmployed', 'mixed', 'student', 'retired', 'betweenJobs'].every(s => new RegExp(s + ": '[^']{40,}").test(html)));

  const room = Registry.byId('big-purchase');
  checkTrue('the registry row exists', !!room && room.href === 'rooms/big-purchase.html');
  check('… appears for everyone', Gate.SITUATIONS.filter(s => Registry.applies(room, household({ status: s.status }))).map(s => s.id).join(','), 'employed,selfEmployed,betweenJobs,student,retired,mixed');
  check('… the three writes are owned here', ['purchasePrice', 'purchaseMonths', 'purchaseRate'].map(f => Ownership.field(f).owner).join(','), 'big-purchase,big-purchase,big-purchase');
  check('… anchored on the inputs', ['purchasePrice', 'purchaseMonths', 'purchaseRate'].map(f => Ownership.field(f).anchor).join(','), 'inputs,inputs,inputs');
  check('… and the chips it reads are owned elsewhere', ['cashSavings', 'monthlyExpenses', 'grossAnnualIncome'].map(f => Ownership.field(f).owner).join(','), 'start,cash-flow,start');
};
