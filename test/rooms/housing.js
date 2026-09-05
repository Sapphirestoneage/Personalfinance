/* test/rooms/housing.js — the Housing Decision room (D-099).
   Hand-derived numbers as literals; nothing copied from engine output. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Registry, Ownership, Gate, Projection, Demo, TABLES } = t;
  const Housing = require(path.join(ROOT, 'engines/housing.js'));
  const T = { housingConventions: TABLES.housingConventions, priceToRent: TABLES.priceToRent, mortgageRates: TABLES.mortgageRates,
              ratioBenchmarks: TABLES.ratioBenchmarks, effectiveTaxRates: TABLES.effectiveTaxRates };

  section('Housing Decision — the tables and the payment');

  const conv = TABLES.housingConventions;
  checkTrue('data/housing_conventions.json is filled', !!conv && conv.confidence === 'convention' && !/PLACEHOLDER/.test(conv.source));
  check('… tax 1.1%, insurance 0.5%, maintenance 1%, closing 3%', [conv.propertyTaxRate, conv.insuranceRate, conv.maintenanceRate, conv.closingCostRate].join(','), '0.011,0.005,0.01,0.03');
  check('… a 30-year term', conv.termMonths, 360);
  check('… a 3-month floor', conv.guardrails.emergencyFundMonths, 3);
  checkTrue('data/price_to_rent.json carries the bands', TABLES.priceToRent.bands && TABLES.priceToRent.bands.buyingFavouredBelow === 15 && TABLES.priceToRent.bands.rentingFavouredAbove === 20);
  checkTrue('… and is honest about the ratio', TABLES.priceToRent.confidence === 'unverified' && TABLES.priceToRent.ratio === 18);
  checkTrue('data/mortgage_rates.json is dated', /^\d{4}-\d{2}-\d{2}$/.test(TABLES.mortgageRates.asOf) && TABLES.mortgageRates.thirtyYearFixed === 0.065);

  /* The payment by hand: P = 240,000, r = 0.065/12 = 0.00541667, n = 360.
     (1+r)^n = 6.99135…; P·r = 1,300; ×6.99135 = 9,088.76; ÷ 5.99135 = 1,516.96. */
  const pay = Housing.monthlyPayment(24000000, 0.065, 30);
  checkTrue('the payment computes', Money.isOk(pay), pay.reason);
  check('… $1,516.96 a month on $240,000 at 6.5% over 30 years', pay.value, 151696, 100);
  checkTrue('… and is the one amortisation in the repo', pay.value === Projection.levelPaymentCents({ principalCents: 24000000, annualRate: 0.065, months: 360 }).value);
  check('rate 0 → the principal split evenly', Housing.monthlyPayment(24000000, 0, 30).value, Math.round(24000000 / 360));
  check('no principal → no payment', Housing.monthlyPayment(0, 0.065, 30).value, 0);
  checkTrue('a missing input is a reason, not a number', Housing.monthlyPayment(null, 0.065, 30).status === 'incomplete');

  function household(o) {
    const opts = o || {};
    const status = opts.status || 'employed';
    const person = Schema.createPerson({ id: 'p', label: 'You', role: 'adult', employmentStatus: status,
      incomeSources: Money.isEntered(opts.gross) ? [Schema.createIncomeSource({ id: 'i', personId: 'p', type: 'w2', grossAnnualIncomeCents: opts.gross })] : [] });
    return Schema.createHousehold({
      people: [person],
      filingStatus: 'single',
      assets: Money.isEntered(opts.cash) ? [Schema.createAsset({ id: 'c', category: 'cash', liquid: true, valueCents: opts.cash })] : [],
      expenses: { monthlyEssential: { estimatedValueCents: Money.isEntered(opts.spend) ? opts.spend : null } },
      housing: opts.housing || {},
      meta: opts.meta || {}
    });
  }

  section('Housing Decision — the worked case');

  /* Price $300,000, 20% down, 6.5% over 30 years, rent $1,900; gross
     $90,000, spending $3,500/mo, cash $20,000.
       principal 240,000; payment 1,516.96
       tax 300,000 × 1.1% ÷ 12 = 275; insurance × 0.5% ÷ 12 = 125; maintenance × 1% ÷ 12 = 250
       own = 1,516.96 + 650 = 2,166.96; against rent 1,900 → +266.96
       price-to-rent 300,000 ÷ 22,800 = 13.16 → under 15, buying favoured
       housing ratio 2,166.96 ÷ 7,500 = 28.9% → over 28, under 33: watch
       down 60,000; closing 9,000; cash after 20,000 − 69,000 = −49,000; floor 10,500 → below
       year-one interest: 240,000 at 0.5417%/mo, twelve months of a
       1,516.96 payment ≈ 15,520 → 1,293/mo; principal ≈ 224/mo */
  const base = household({ gross: 9000000, spend: 350000, cash: 2000000, housing: { rentMonthlyCents: 190000, priceCents: 30000000, downPct: 0.2, rate: 0.065 } });
  const r = Housing.compare(base, T);
  checkTrue('the worked case computes', Money.isOk(r), r.reason);
  check('principal $240,000', r.principalCents, 24000000);
  check('payment $1,516.96', r.paymentCents, 151696, 100);
  check('tax $275', r.taxCents, 27500);
  check('insurance $125', r.insuranceCents, 12500);
  check('maintenance $250', r.maintenanceCents, 25000);
  check('own $2,166.96', r.ownCents, 216696, 100);
  check('rent $1,900', r.rentCents, 190000);
  check('the number: +$266.96 a month to own', r.value, 26696, 100);
  check('price-to-rent 13.2', r.priceToRent, 13.16, 0.01);
  check('… buying favoured', r.priceToRentBand, 'buying');
  check('housing ratio 28.9%', r.housingRatio, 0.2889, 0.001);
  check('… watch, from the 28% front-end band', r.housingZone + '/' + r.zone, 'watch/watch');
  check('… the band is the Ratios room’s', r.housingBand.good + '/' + r.housingBand.warn, '0.28/0.33');
  check('year-one interest a month ≈ $1,293', r.interestMonthlyCents, 129333, 200);
  check('… principal is the rest of the payment', r.principalMonthlyCents + r.interestMonthlyCents, r.paymentCents);
  check('unrecoverable = interest + tax + insurance + maintenance', r.unrecoverableCents, r.interestMonthlyCents + 65000);
  check('down $60,000', r.downCents, 6000000);
  check('closing $9,000', r.closingCents, 900000);
  check('cash after closing −$49,000', r.cashAfterCents, -4900000);
  check('… under the $10,500 floor', r.floorCents + '/' + r.belowFloor, '1050000/true');
  checkTrue('years to the down payment is the shortfall over a year of savings', r.shortfallCents === 4000000 && r.annualSavingsCents > 0 && Math.abs(r.yearsToDown - 4000000 / r.annualSavingsCents) < 1e-9);
  checkTrue('… and not invented past what is saved', r.yearsToDown > 0 && r.neverAtThisPace === false);

  section('Housing Decision — edge cases');

  /* No rent (Start Here's answer): own against $0, said. */
  const nr = Housing.compare(household({ gross: 9000000, spend: 350000, cash: 2000000, meta: { noRent: true }, housing: { priceCents: 30000000, downPct: 0.2, rate: 0.065 } }), T);
  checkTrue('noRent → computes with no rent entered', Money.isOk(nr), nr.reason);
  check('… rent is $0 and flagged as none', nr.rentCents + '/' + nr.rentIsNone, '0/true');
  check('… the number is the whole of owning', nr.value, nr.ownCents);
  checkTrue('… and there is no price-to-rent', nr.priceToRent === null && nr.priceToRentBand === 'none');
  const nrTyped = Housing.compare(household({ gross: 9000000, spend: 350000, cash: 2000000, meta: { noRent: true }, housing: { rentMonthlyCents: 190000, priceCents: 30000000, downPct: 0.2, rate: 0.065 } }), T);
  check('… a typed rent wins over the answer', nrTyped.rentCents + '/' + nrTyped.rentIsNone, '190000/false');

  /* No price: incomplete, and it says which box. */
  const np = Housing.compare(household({ gross: 9000000, spend: 350000, cash: 2000000, housing: { rentMonthlyCents: 190000, downPct: 0.2, rate: 0.065 } }), T);
  checkTrue('no price → incomplete, naming the price', np.status === 'incomplete' && np.missing.indexOf('priceCents') !== -1 && /price/.test(np.reason));
  checkTrue('rent missing without a noRent answer is asked for', Housing.compare(household({ gross: 9000000, housing: { priceCents: 30000000, downPct: 0.2, rate: 0.065 } }), T).missing.indexOf('rentMonthlyCents') !== -1);
  checkTrue('a price of zero is a reason, not a comparison', Housing.compare(household({ gross: 9000000, housing: { rentMonthlyCents: 190000, priceCents: 0, downPct: 0.2, rate: 0.065 } }), T).status === 'incomplete');

  /* 100% down: no mortgage; own is tax + insurance + maintenance = $650. */
  const full = Housing.compare(household({ gross: 9000000, spend: 350000, cash: 2000000, housing: { rentMonthlyCents: 190000, priceCents: 30000000, downPct: 1, rate: 0.065 } }), T);
  check('100% down → no principal, no payment', full.principalCents + '/' + full.paymentCents, '0/0');
  check('… own is tax + insurance + maintenance, $650', full.ownCents, 65000);
  check('… all of it unrecoverable', full.unrecoverableCents, 65000);
  check('… −$1,250 a month to own', full.value, -125000);

  /* Rate 0: the payment is the principal split over the months. */
  const zero = Housing.compare(household({ gross: 9000000, spend: 350000, cash: 2000000, housing: { rentMonthlyCents: 190000, priceCents: 30000000, downPct: 0.2, rate: 0 } }), T);
  check('rate 0 → payment = 240,000 ÷ 360', zero.paymentCents, Math.round(24000000 / 360));
  check('… no interest, so the payment is all principal', zero.interestMonthlyCents + '/' + zero.principalMonthlyCents, '0/' + zero.paymentCents);

  /* Cash short of the down payment: a years-to-down line. Gross $90,000,
     spend $3,500: a year of savings is what tier0 says; cash $20,000
     against $60,000 down → 40,000 short. */
  check('cash short → the shortfall is down − cash', r.shortfallCents, 4000000);
  const rich = Housing.compare(household({ gross: 9000000, spend: 350000, cash: 8000000, housing: { rentMonthlyCents: 190000, priceCents: 30000000, downPct: 0.2, rate: 0.065 } }), T);
  check('cash in hand → 0 years', rich.yearsToDown, 0);
  check('… cash after closing $11,000, above the floor', rich.cashAfterCents + '/' + rich.belowFloor, '1100000/false');

  /* Savings ≤ 0: never at this pace, said rather than divided. Spending
     $7,500/mo on $90,000 gross leaves nothing after tax. */
  const broke = Housing.compare(household({ gross: 9000000, spend: 750000, cash: 2000000, housing: { rentMonthlyCents: 190000, priceCents: 30000000, downPct: 0.2, rate: 0.065 } }), T);
  checkTrue('savings ≤ 0 → never at this pace', broke.annualSavingsCents <= 0 && broke.neverAtThisPace === true && broke.yearsToDown === null);
  checkTrue('… with the words', /never/.test(broke.yearsReason));

  /* No cash entered: nothing is invented. */
  const nocash = Housing.compare(household({ gross: 9000000, spend: 350000, housing: { rentMonthlyCents: 190000, priceCents: 30000000, downPct: 0.2, rate: 0.065 } }), T);
  checkTrue('cash not entered → no cash-after, no years, a reason', nocash.cashAfterCents === null && nocash.yearsToDown === null && /cash/.test(nocash.yearsReason));

  /* No income: the ratio waits; the comparison does not. */
  const noinc = Housing.compare(household({ spend: 350000, cash: 2000000, housing: { rentMonthlyCents: 190000, priceCents: 30000000, downPct: 0.2, rate: 0.065 } }), T);
  checkTrue('no income → the comparison still computes', Money.isOk(noinc) && noinc.value === r.value);
  checkTrue('… the housing ratio waits with a reason and no zone', noinc.housingRatio === null && noinc.zone === null && /income/.test(noinc.ratioReason));

  /* Bands: the edges of price-to-rent. */
  check('price-to-rent 14.9 → buying', Housing.priceToRentBand(14.9, TABLES.priceToRent), 'buying');
  check('… 15 → neutral', Housing.priceToRentBand(15, TABLES.priceToRent), 'neutral');
  check('… 20 → neutral', Housing.priceToRentBand(20, TABLES.priceToRent), 'neutral');
  check('… 20.1 → renting', Housing.priceToRentBand(20.1, TABLES.priceToRent), 'renting');
  check('… no table → none', Housing.priceToRentBand(18, null), 'none');

  /* Empty household: an incomplete Result with reasons, never a throw. */
  let empty;
  try { empty = Housing.compare(Schema.createHousehold({}), T); } catch (e) { empty = { threw: e.message }; }
  checkTrue('empty household → incomplete, no throw', empty && empty.status === 'incomplete', empty && empty.threw);
  checkTrue('… with a reason', typeof empty.reason === 'string' && empty.reason.length > 0);
  checkTrue('… and a missing table is a reason too', Housing.compare(base, {}).status === 'incomplete');
  checkTrue('… no result carries a status key in its extras', Object.keys(r).filter(k => k === 'status').length === 1 && r.status === 'ok');

  /* The demo persona with the worked place. */
  const demo = Demo.build();
  demo.housing = { rentMonthlyCents: 190000, priceCents: 30000000, downPct: 0.2, rate: 0.065 };
  const dr = Housing.compare(demo, T);
  checkTrue('the demo persona with the worked place computes', Money.isOk(dr), dr.reason);
  check('… the same own cost', dr.ownCents, 216696, 100);

  section('Housing Decision — the room on the template');

  const html = fs.readFileSync(path.join(ROOT, 'rooms/housing.html'), 'utf8');
  checkTrue('rooms/housing.html mounts on the template', /Room\.mount\(\{/.test(html) && /id: 'housing'/.test(html));
  ['room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list', 'room-standalone', 'load-notice']
    .forEach(id => checkTrue('… host #' + id, html.indexOf('id="' + id + '"') !== -1));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading'].forEach(id => checkTrue('… section #' + id, html.indexOf('id="' + id + '"') !== -1));
  const tag = f => html.indexOf('src="../' + f + '"');
  checkTrue('… loads the engine after ratios and projection, before the lens', tag('engines/projection.js') < tag('engines/housing.js') && tag('engines/ratios.js') < tag('engines/housing.js') && tag('engines/housing.js') < tag('shared/lens.js') && tag('engines/housing.js') > 0);
  checkTrue('… is not the stub', html.indexOf('STUB') === -1 && html.indexOf('Hourly.realHourlyWage') === -1);
  checkTrue('… writes the four housing paths through Spine.set', ['housing.rentMonthlyCents', 'housing.priceCents', 'housing.downPct', 'housing.rate'].every(p => html.indexOf("Spine.set('" + p + "'") !== -1));
  checkTrue('… and nothing else', (html.match(/Spine\.set\(/g) || []).length === 4 && !/upsertPerson|upsertAsset|updateProfile/.test(html));
  checkTrue('… the shared numbers are read, not edited', /reads: \[/.test(html) && ['monthlyExpenses', 'grossAnnualIncome', 'cashSavings', 'state'].every(f => html.indexOf("'" + f + "'") !== -1));
  checkTrue('… reads the no-rent answer', /meta\.noRent/.test(html));
  checkTrue('… one stacked chart', /Charts\.stacked\(/.test(html) && !/Charts\.(area|donut|bars)\(/.test(html));
  checkTrue('… four inputs, each with a proposal for what has a convention', (html.match(/ctl: '/g) || []).length === 4 && (html.match(/propose: function/g) || []).length === 4);
  checkTrue('… says the price and rent are held still', /held still/.test(html));
  checkTrue('… and the scope line says what it does not do', /scope: 'This room does not know your market/.test(html));
  checkTrue('… why is written for every situation', Gate.SITUATIONS.every(s => new RegExp(s.id + ": '.{40,}").test(html)));

  const room = Registry.byId('housing');
  checkTrue('the registry row exists', !!room && room.href === 'rooms/housing.html');
  check('… appears for everyone', Gate.SITUATIONS.filter(s => Registry.applies(room, household({ status: s.status }))).map(s => s.id).join(','), Gate.SITUATIONS.map(s => s.id).join(','));
  check('… the four writes are owned here', ['rentAlternative', 'homePrice', 'downPct', 'mortgageRate'].map(f => Ownership.field(f).owner).join(','), 'housing,housing,housing,housing');
  check('… anchored on the inputs', ['rentAlternative', 'homePrice', 'downPct', 'mortgageRate'].map(f => Ownership.field(f).anchor).join(','), 'inputs,inputs,inputs,inputs');

  /* One rent (D-130, Q11): Cash Flow's housing line is what you pay. */
  const withLine = household({ gross: 9000000, spend: 350000, cash: 2000000, housing: { priceCents: 30000000, downPct: 0.2, rate: 0.065 } });
  withLine.expenses.entries = [Schema.createExpenseEntry({ id: 'rent', categoryId: 'housing', amountCents: 190000, period: 'monthly' })];
  const rl = Housing.compare(withLine, T);
  check('with no rent typed here, the housing line in Cash Flow is the rent', rl.rentCents + '/' + rl.rentSource, '190000/cash-flow');
  check('… and the number matches the worked case', rl.value, 26696, 100);
  withLine.housing.rentMonthlyCents = 210000;
  check('a rent typed here is a place you would rent instead, and wins', Housing.compare(withLine, T).rentCents + '/' + Housing.compare(withLine, T).rentSource, '210000/housing');
  check('Schema.rentMonthlyCents reads the line first', Schema.rentMonthlyCents(withLine).cents + '/' + Schema.rentMonthlyCents(withLine).source, '190000/cash-flow');
  withLine.expenses.entries = [];
  check('… then the room’s own field', Schema.rentMonthlyCents(withLine).source, 'housing');
  check('… and a logged occurrence in the housing category is not the line', (function () { const x = household({}); x.expenses.entries = [Schema.createExpenseEntry({ categoryId: 'housing', amountCents: 5000, period: 'once', date: '2026-09-01', source: 'log' })]; return Schema.rentMonthlyCents(x).source; })(), 'none');
  const Own = require(path.join(ROOT, 'shared/ownership.js'));
  check('the rent you pay is owned by Cash Flow; the alternative by Housing', Own.FIELDS.rentMonthly.owner + '/' + Own.FIELDS.rentAlternative.owner, 'cash-flow/housing');
};
