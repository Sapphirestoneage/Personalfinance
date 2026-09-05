/* test/rooms/ledger.js — the tax engine for dated income, and the month. D-128. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, path, Money, Schema, TABLES, SelfEmployed } = t;
  const Ledger = require(path.join(ROOT, 'engines/ledger.js'));
  const Reference = require(path.join(ROOT, 'shared/reference.js'));
  const TaxRoom = require(path.join(ROOT, 'engines/taxroom.js'));
  section('The ledger engine (D-128, D-129): four methods, four answers');

  const T = { effectiveTaxRates: TABLES.effectiveTaxRates, seTax: TABLES.seTax };
  /* Robin's shape: $72,000 of W-2 pay, single. */
  const hh = () => Schema.createHousehold({ filingStatus: 'single', state: 'NC',
    people: [Schema.createPerson({ id: 'P', role: 'adult', employmentStatus: 'employed', incomeSources: [Schema.createIncomeSource({ id: 'i', personId: 'P', grossAnnualIncomeCents: 7200000 })] })] });
  const mk = (kind, extra) => Schema.createIncomeEntry(Object.assign({ kind: kind, amountCents: 200000, frequency: 'once', receivedOn: '2026-09-10' }, extra || {}));
  const h = hh();
  const rate = Reference.lookupEffectiveTaxRate(T.effectiveTaxRates, 72000, 'single').value;

  const w2 = Ledger.netOf(mk('w2'), h, T);
  const se = Ledger.netOf(mk('se'), h, T);
  const gift = Ledger.netOf(mk('gift'), h, T);
  checkTrue('all three net', Money.isOk(w2) && Money.isOk(se) && Money.isOk(gift));
  check('a W-2 $2,000 is withheld at the year’s blended rate', w2.taxCents, Math.round(200000 * rate));
  check('… so it nets gross less that', w2.value, 200000 - Math.round(200000 * rate));
  check('… and says which rate and why', w2.pieces.rate + '/' + w2.pieces.basis, rate + '/sources');
  /* By hand: SE tax on $2,000 of profit beside $72,000 of wages: 92.35% ×
     2,000 = $1,847 of net earnings; Social Security 12.4% (the wage base
     is not used up), Medicare 2.9% → the engine's own figure; income tax
     on profit less half the SE tax at (rate − 7.65%). */
  const seTax = SelfEmployed.selfEmploymentTax(200000, 'single', T.seTax, { priorWagesCents: 7200000 });
  const incomeTax = (200000 - seTax.deductibleHalfCents) * (rate - T.seTax.employeeFicaRate);
  check('a 1099 $2,000 pays SE tax plus income tax at the rate less FICA', se.taxCents, Math.round(seTax.value + incomeTax));
  check('… in two named pieces', se.pieces.seTaxCents + '/' + se.pieces.incomeTaxCents, Math.round(seTax.value) + '/' + Math.round(incomeTax));
  check('a gift pays nothing', gift.taxCents + '/' + gift.value, '0/200000');
  checkTrue('three genuinely different answers', w2.value !== se.value && se.value !== gift.value && w2.value !== gift.value);
  checkTrue('the SE answer is the lowest, the gift the highest', se.value < w2.value && w2.value < gift.value);
  /* Unemployment (D-129): ordinary income tax at the rate less the FICA
     share — no SE tax, unlike 1099; nothing withheld, unlike W-2. */
  const ue = Ledger.netOf(mk('unemployment'), h, T);
  const ueTax = Math.round(200000 * (rate - T.seTax.employeeFicaRate));
  check('an unemployment $2,000 pays income tax only, at the rate less FICA', ue.taxCents + '/' + ue.method, ueTax + '/unemployment');
  checkTrue('… less than 1099 (no SE tax) and less than W-2 (no payroll share)', ue.taxCents < se.taxCents && ue.taxCents < w2.taxCents && ue.taxCents > 0);
  check('… none of it withheld: all of it is owed later', ue.withheldCents + '/' + ue.owedCents + '/' + ue.cashReceivedCents, '0/' + ueTax + '/200000');
  check('W-2 tax is withheld, nothing owed, less cash lands', w2.withheldCents + '/' + w2.owedCents + '/' + w2.cashReceivedCents, w2.taxCents + '/0/' + (200000 - w2.taxCents));
  check('1099 tax is all owed, all the cash lands', se.withheldCents + '/' + se.owedCents + '/' + se.cashReceivedCents, '0/' + se.taxCents + '/200000');
  const four = [w2.value, se.value, ue.value, gift.value];
  check('four genuinely different answers for the same $2,000', new Set(four).size, 4);
  check('untaxable other nets like a gift', Ledger.netOf(mk('other', { taxable: false }), h, T).taxCents, 0);
  check('a bonus withholds like wages', Ledger.netOf(mk('bonus'), h, T).taxCents, w2.taxCents);

  /* Costs come off the SE base, and off the net shown. */
  const gig = mk('se', { costs: [{ label: 'Miles', amountCents: 20000, category: 'mileage' }] });
  const g = Ledger.netOf(gig, h, T);
  check('$200 of mileage comes off the taxable profit', g.taxableCents, 180000);
  check('… and off the net', g.value, g.takeHomeCents - 20000);
  checkTrue('… and lowers the tax', g.taxCents < se.taxCents);
  check('the net-of-costs figure shown on the entry', Ledger.netOfCostsCents(gig, h), 180000);
  const gigNd = mk('se', { costs: [{ amountCents: 20000, category: 'mileage', deductible: false }] });
  check('a cost unticked as deductible still costs but does not reduce the tax base', Ledger.netOf(gigNd, h, T).taxableCents + '/' + Ledger.netOf(gigNd, h, T).allCostsCents, '200000/20000');
  /* A linked expense from the log counts only when deductible. */
  const h2 = hh(); h2.ledger.income = [gig];
  h2.expenses.entries = [
    Schema.createExpenseEntry({ id: 'e1', categoryId: 'platform_fees', amountCents: 5000, source: 'log', date: '2026-09-11', linkedIncomeId: gig.id, deductible: true }),
    Schema.createExpenseEntry({ id: 'e2', categoryId: 'groceries', amountCents: 9000, source: 'log', date: '2026-09-11', deductible: true })
  ];
  check('a linked deductible expense joins the costs', Ledger.costs(gig, h2).deductibleCents, 25000);
  check('a personal expense marked deductible does not — the constructor refused it', h2.expenses.entries[1].deductible + '/' + Ledger.linkedExpenses(h2, gig.id).length, 'false/1');
  check('a W-2 entry ignores costs handed to it', Ledger.netOf(mk('w2', { costs: [{ amountCents: 1 }] }), h, T).allCostsCents, 0);

  /* Reasons, not numbers. */
  check('no amount → asks', Ledger.netOf(mk('w2', { amountCents: null }), h, T).status, 'incomplete');
  check('no filing status → asks', Ledger.netOf(mk('w2'), Schema.createHousehold({}), T).status, 'incomplete');
  check('a gift needs no filing status', Ledger.netOf(mk('gift'), Schema.createHousehold({}), T).value, 200000);
  const alone = Schema.createHousehold({ filingStatus: 'single' });
  alone.ledger.income = [Schema.createIncomeEntry({ id: 'r', kind: 'w2', amountCents: 300000, frequency: 'monthly', receivedOn: '2026-01-05' })];
  check('with no sources the ledger’s own recurring pay sets the band', Ledger.netOf(alone.ledger.income[0], alone, T).pieces.basis + '/' + Ledger.netOf(alone.ledger.income[0], alone, T).pieces.annualGrossCents, 'ledger/3600000');

  /* Frequencies and the month. */
  check('annual gross: fortnightly × 26', Ledger.annualGrossCents(mk('w2', { amountCents: 250000, frequency: 'fortnightly' })), 6500000);
  check('a month of it: ÷ 12', Ledger.monthlyGrossCents(mk('w2', { amountCents: 250000, frequency: 'fortnightly' })), Math.round(6500000 / 12));
  check('a one-time entry has no month', Ledger.monthlyGrossCents(mk('w2')), null);
  const fort = mk('w2', { amountCents: 250000, frequency: 'fortnightly', receivedOn: '2026-09-04' });
  check('fortnightly from Sep 4 lands twice in September', Ledger.occurrences(fort, '2026-09').map(o => o.date).join(','), '2026-09-04,2026-09-18');
  check('… and three times in October', Ledger.occurrences(fort, '2026-10').map(o => o.date).join(','), '2026-10-02,2026-10-16,2026-10-30');
  check('… and never in August, before it was first received', Ledger.occurrences(fort, '2026-08').length, 0);
  check('weekly from a Friday: four Fridays in September 2026', Ledger.occurrences(mk('w2', { frequency: 'weekly', receivedOn: '2026-09-04' }), '2026-09').length, 4);
  check('monthly on the 31st lands on the 30th in September', Ledger.occurrences(mk('w2', { frequency: 'monthly', receivedOn: '2026-01-31' }), '2026-09')[0].date, '2026-09-30');
  check('annual lands in its month only', Ledger.occurrences(mk('bonus', { frequency: 'annual', receivedOn: '2025-12-15' }), '2026-12').length + '/' + Ledger.occurrences(mk('bonus', { frequency: 'annual', receivedOn: '2025-12-15' }), '2026-11').length, '1/0');
  check('a one-time entry lands on its date', Ledger.occurrences(mk('gift'), '2026-09').length + '/' + Ledger.occurrences(mk('gift'), '2026-10').length, '1/0');
  const undated = Ledger.occurrences(mk('w2', { frequency: 'monthly', receivedOn: null, amountCents: 120000 }), '2026-09');
  check('an undated recurring entry lands as its average, marked estimated', undated[0].cents + '/' + undated[0].estimated, '120000/true');

  const h3 = hh();
  h3.ledger.income = [fort, gig, mk('gift'), Schema.createIncomeEntry({ id: 'old', kind: 'w2', amountCents: 999900, frequency: 'monthly', receivedOn: '2026-01-01', active: false }), Schema.createIncomeEntry({ id: 'hid', kind: 'gift', amountCents: 10000, frequency: 'once', receivedOn: '2026-09-20', hidden: true })];
  const m = Ledger.month(h3, T, '2026-09');
  check('the month adds every active landing', m.count, 4);
  check('… gross: two fortnightly cheques, the gig, the gift, the hidden gift', m.grossCents, 500000 + 200000 + 200000 + 10000);
  const fortNet = Ledger.netOf(fort, h3, T);
  check('… net: each landing netted, costs off once', m.netCents, fortNet.takeHomeCents * 2 + (200000 - g.taxCents - 20000) + 200000 + 10000);
  checkTrue('an archived entry never counts', !m.rows.some(r => r.entry.id === 'old'));
  checkTrue('a hidden one always does', m.rows.some(r => r.entry.id === 'hid'));
  check('the month is labelled', m.label, 'September 2026');
  check('this month reads the clock', Ledger.thisMonth(Date.parse('2026-09-05T12:00:00')), '2026-09');

  /* How sure a date is (D-130): estimated lands and counts; potential is
     drawn apart and never counted. */
  const h5 = hh(); h5.ledger.income = [
    Schema.createIncomeEntry({ id: 'a', kind: 'w2', amountCents: 100000, frequency: 'once', receivedOn: '2026-09-10' }),
    Schema.createIncomeEntry({ id: 'b', kind: 'bonus', amountCents: 50000, frequency: 'once', receivedOn: '2026-09-20', dateKind: 'estimated' }),
    Schema.createIncomeEntry({ id: 'c', kind: 'bonus', amountCents: 300000, frequency: 'once', receivedOn: '2026-09-25', dateKind: 'potential' })
  ];
  check('unknown reads as exact; the three kinds are kept', h5.ledger.income.map(e => e.dateKind).join(','), 'exact,estimated,potential');
  check('an estimated landing carries its kind', Ledger.occurrences(h5.ledger.income[1], '2026-09')[0].dateKind + '/' + Ledger.occurrences(h5.ledger.income[1], '2026-09')[0].estimated, 'estimated/true');
  const m5 = Ledger.month(h5, T, '2026-09');
  check('exact and estimated count, potential does not', m5.grossCents + '/' + m5.count, '150000/2');
  check('… and the potential one is listed apart with its amount', m5.potentialRows.map(r => r.entry.id).join(',') + '/' + m5.potentialCents, 'c/300000');

  /* The Tax room reads the ledger when it recurs. */
  const y = Ledger.annualByMethod(h3, Date.parse('2026-09-20'));
  check('the year by method: wages from the fortnightly cheque', y.wagesCents, 6500000);
  check('… self-employment net of the mileage', y.selfEmploymentCents, 180000);
  check('… the gifts untaxed, the archived entry ignored', y.untaxedCents + '/' + y.counted, '210000/4');
  const h4 = hh(); h4.ledger.income = h3.ledger.income.concat([Schema.createIncomeEntry({ id: 'ue', kind: 'unemployment', amountCents: 50000, frequency: 'weekly', receivedOn: '2026-08-07' })]);
  const y4 = Ledger.annualByMethod(h4, Date.parse('2026-09-20'));
  check('… unemployment annualised on its own, not as wages', y4.unemploymentCents + '/' + y4.wagesCents, '2600000/6500000');
  const Tax = require(path.join(ROOT, 'engines/tax.js'));
  const asWages = Tax.estimate(h4, TABLES, { wagesCents: 6500000 + 2600000, selfEmploymentCents: 180000 });
  const asOther = Tax.estimate(h4, TABLES, { wagesCents: 6500000, selfEmploymentCents: 180000, otherOrdinaryCents: 2600000 });
  check('Tax.estimate taxes unemployment as ordinary income …', asOther.agiCents, asWages.agiCents);
  checkTrue('… but with no payroll tax on it', asOther.ficaCents < asWages.ficaCents && asOther.value < asWages.value);
  check('… and reports it', asOther.otherOrdinaryCents, 2600000);
  check('the Tax room hands it through', TaxRoom.splitIncome(h4).unemploymentCents + '/' + TaxRoom.picture(h4, TABLES).unemploymentCents, '2600000/2600000');
  const split = TaxRoom.splitIncome(h3);
  check('the Tax room’s split comes from the ledger', split.fromLedger + '/' + split.wagesCents + '/' + split.selfEmploymentCents, 'true/6500000/180000');
  check('… and from the sources when there is no ledger', TaxRoom.splitIncome(hh()).fromLedger + '/' + TaxRoom.splitIncome(hh()).wagesCents, 'undefined/7200000');
  checkTrue('and the Tax room’s picture still computes', Money.isOk(TaxRoom.picture(h3, TABLES)));
};
