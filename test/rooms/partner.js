/* test/rooms/partner.js — the Partner room (D-099).
   Hand-derived numbers as literals; nothing copied from engine output. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Registry, Ownership, Gate, Ratios, TABLES } = t;
  const Partner = require(path.join(ROOT, 'engines/partner.js'));
  const T = { effectiveTaxRates: TABLES.effectiveTaxRates, partnerConventions: TABLES.partnerConventions };

  section('Partner — the table and the engine');

  const conv = TABLES.partnerConventions;
  checkTrue('data/partner_conventions.json is filled', !!conv && conv.confidence === 'convention' && !/PLACEHOLDER/.test(conv.source));
  check('… three modes, in the schema’s order', (conv.modes || []).map(m => m.id).join(','), 'equal,proportional,pooled');
  checkTrue('… each with a sentence and when people choose it', conv.modes.every(m => typeof m.sentence === 'string' && m.sentence.length > 20 && typeof m.whenChosen === 'string' && m.whenChosen.length > 20));
  check('… and the engine reads them by id', Partner.convention(T, 'pooled').label, 'One pool');
  check('… an unknown mode reads as nothing', Partner.convention(T, 'thirds'), null);

  /* you: gross a year (undefined = none entered); them: the same; solo: one adult;
     shared: the typed shared month; spend: the household month; mode. */
  function household(o) {
    const opts = o || {};
    const you = Schema.createPerson({ id: 'p', label: 'You', role: 'adult', employmentStatus: opts.status || 'employed',
      incomeSources: opts.you === undefined ? [] : [Schema.createIncomeSource({ id: 'intake_income', personId: 'p', type: 'w2', grossAnnualIncomeCents: opts.you })] });
    const them = Schema.createPerson({ id: 'q', label: opts.label === undefined ? 'Sam' : opts.label, role: 'adult', employmentStatus: 'employed',
      incomeSources: opts.them === undefined ? [] : [Schema.createIncomeSource({ id: 'intake_partner_income', personId: 'q', type: 'w2', grossAnnualIncomeCents: opts.them })] });
    return Schema.createHousehold({
      people: opts.solo ? [you] : [you, them],
      filingStatus: opts.filing === undefined ? 'married_joint' : opts.filing,
      expenses: { monthlyEssential: { estimatedValueCents: opts.spend === undefined ? null : opts.spend } },
      partner: { splitMode: opts.mode || null, sharedMonthlyCents: opts.shared === undefined ? null : opts.shared }
    });
  }

  /* The brief's worked case: you $72,000, partner $48,000, shared $3,000 a
     month, filing jointly.
       take-home, one at a time at married_joint (effective_tax_rates_2026):
         $72,000 sits in the ≤$90,000 band at 14% → tax $10,080 → $61,920 a
         year → $5,160 a month
         $48,000 sits in the ≤$60,000 band at 11% → tax $5,280 → $42,720 a
         year → $3,560 a month
         together $8,720 a month
       proportional  3,000 × 72 ÷ 120 = $1,800 · 3,000 × 48 ÷ 120 = $1,200
                     1,800 ÷ 5,160 = 34.88% · 1,200 ÷ 3,560 = 33.71%
       equal         $1,500 each · 1,500 ÷ 5,160 = 29.07% · 1,500 ÷ 3,560 = 42.13%
       pooled        $3,000 out of $8,720 in → $5,720 left
       concentration 72,000 ÷ 120,000 = 0.6                                  */
  const prop = Partner.split(household({ you: 7200000, them: 4800000, shared: 300000, mode: 'proportional' }), T);
  checkTrue('the worked case computes in proportion', Money.isOk(prop), prop.reason);
  check('proportional: you pay $1,800', prop.people[0].shareCents, 180000);
  check('… they pay $1,200', prop.people[1].shareCents, 120000);
  check('… the number is your share', prop.value, 180000);
  check('… your take-home $5,160', prop.people[0].takeHomeCents, 516000);
  check('… theirs $3,560', prop.people[1].takeHomeCents, 356000);
  check('… you keep $3,360', prop.people[0].keepsCents, 336000);
  check('… they keep $2,360', prop.people[1].keepsCents, 236000);
  check('… 34.88% of your take-home', prop.people[0].burden, 0.3488, 0.0001);
  check('… 33.71% of theirs', prop.people[1].burden, 0.3371, 0.0001);
  check('… income concentration 0.6', prop.concentration, 0.6, 1e-9);
  check('… the same figure the ratio engine gives', prop.concentration, Ratios.byId('incomeConcentration').compute(Ratios.context(household({ you: 7200000, them: 4800000 }), T)).value, 1e-12);
  check('… the shared month was typed', prop.sharedSource, 'typed');
  check('… the mode was chosen, nothing fell back', String(prop.modeChosen) + '/' + String(prop.modeFallback), 'proportional/null');
  check('… the lower earner is them', prop.lowerIndex + '/' + prop.higherIndex, '1/0');
  check('… no zone: neither share is heavy', prop.zone, null);
  check('… the effective rates come back for the drawer', prop.people[0].effectiveRate + '/' + prop.people[1].effectiveRate, '0.14/0.11');

  const eq = Partner.split(household({ you: 7200000, them: 4800000, shared: 300000, mode: 'equal' }), T);
  check('equal: $1,500 each', eq.people[0].shareCents + '/' + eq.people[1].shareCents, '150000/150000');
  check('… you keep $3,660', eq.people[0].keepsCents, 366000);
  check('… they keep $2,060', eq.people[1].keepsCents, 206000);
  check('… the fairness note: 29.07% of the higher take-home', eq.people[eq.higherIndex].burden, 0.2907, 0.0001);
  check('… against 42.13% of the lower', eq.people[eq.lowerIndex].burden, 0.4213, 0.0001);
  check('… an odd cent goes to one side, and the halves still sum', (function () {
    const r = Partner.split(household({ you: 7200000, them: 4800000, shared: 300001, mode: 'equal' }), T);
    return r.people[0].shareCents + r.people[1].shareCents;
  })(), 300001);

  const pooled = Partner.split(household({ you: 7200000, them: 4800000, shared: 300000, mode: 'pooled' }), T);
  check('pooled: the number is the shared month', pooled.value, 300000);
  check('… $8,720 in', pooled.poolInCents, 872000);
  check('… $5,720 left', pooled.poolLeftCents, 572000);
  checkTrue('… no shares', pooled.people[0].shareCents === null && pooled.people[1].shareCents === null);
  check('… the two take-homes still come back', pooled.totalTakeHomeCents, 872000);

  section('Partner — edge cases');

  /* One adult: the registry already removes the room; the engine says why. */
  const solo = Partner.split(household({ you: 7200000, shared: 300000, solo: true }), T);
  checkTrue('one adult → incomplete, "Just you"', !Money.isOk(solo) && /^Just you/.test(solo.reason) && solo.justYou === true);
  check('… the partner branch is absent for one adult, so the registry hides the room', Gate.exists(household({ you: 7200000, solo: true }), 'partner'), false);
  check('… and shows it for two', Gate.exists(household({ you: 7200000, them: 4800000 }), 'partner'), true);

  /* No split chosen: halves, said to be the default. No shared month typed:
     the household month, said to be borrowed. */
  const dflt = Partner.split(household({ you: 7200000, them: 4800000, spend: 350000 }), T);
  check('no split chosen → equal halves of the household month, $1,750', dflt.value, 175000);
  check('… said to be the default', dflt.modeChosen, null);
  check('… the shared month came from Start Here', dflt.sharedSource, 'household');
  checkTrue('a typed shared month wins over the household month', Partner.split(household({ you: 7200000, them: 4800000, spend: 350000, shared: 300000 }), T).sharedCents === 300000);

  /* Partner's pay not entered: proportional falls back to halves with a
     reason; equal computes regardless. */
  const noPay = Partner.split(household({ you: 7200000, shared: 300000, mode: 'proportional' }), T);
  check('partner pay not entered, proportional → halves', noPay.people[0].shareCents + '/' + noPay.people[1].shareCents, '150000/150000');
  check('… applied as equal', noPay.mode, 'equal');
  checkTrue('… with the reason', /Their pay is not entered/.test(noPay.modeFallback));
  checkTrue('… their take-home says why it is blank', noPay.people[1].takeHomeCents === null && /No pay/.test(noPay.people[1].takeHomeReason));
  checkTrue('… their gross is not entered, not zero', noPay.people[1].grossAnnualCents === null);
  check('… one paycheque is the whole household income', noPay.concentration, 1, 1e-9);
  const noPayEq = Partner.split(household({ you: 7200000, shared: 300000, mode: 'equal' }), T);
  check('… equal still computes without their pay', noPayEq.value + '/' + noPayEq.modeFallback, '150000/null');
  checkTrue('your pay missing instead names you', /Your pay is not entered/.test(Partner.split(household({ them: 4800000, shared: 300000, mode: 'proportional' }), T).modeFallback));

  /* Partner earning zero (typed): proportional gives them nothing and says so. */
  const zero = Partner.split(household({ you: 7200000, them: 0, shared: 300000, mode: 'proportional' }), T);
  check('partner earning zero, proportional → you pay all $3,000', zero.people[0].shareCents, 300000);
  check('… they pay $0', zero.people[1].shareCents, 0);
  check('… and it is said', zero.zeroEarner, 'Sam');
  check('… the mode did not fall back', zero.mode + '/' + zero.modeFallback, 'proportional/null');
  check('… 3,000 ÷ 5,160 = 58.14% of your take-home → watch', zero.zone, 'watch');
  check('… you are the heavy one', zero.heavy.join(','), 'You');
  checkTrue('both at zero → halves with a reason', (function () { const r = Partner.split(household({ you: 0, them: 0, shared: 300000, mode: 'proportional' }), T); return r.mode === 'equal' && /above zero/.test(r.modeFallback); })());

  /* Shared month larger than the two take-homes: out of pocket, zone out. */
  const big = Partner.split(household({ you: 7200000, them: 4800000, shared: 1000000, mode: 'equal' }), T);
  check('shared $10,000 against $8,720 in → $1,280 out of pocket', big.outOfPocketCents, 128000);
  check('… zone out', big.zone, 'out');
  check('… the lower earner keeps less than nothing: 3,560 − 5,000', big.people[1].keepsCents, -144000);
  check('… pooled says the same: $1,280 short', Partner.split(household({ you: 7200000, them: 4800000, shared: 1000000, mode: 'pooled' }), T).poolLeftCents, -128000);
  check('… and is out', Partner.split(household({ you: 7200000, them: 4800000, shared: 1000000, mode: 'pooled' }), T).zone, 'out');

  /* Heavy without being out: $6,000 halves against $3,560 → watch. */
  const heavy = Partner.split(household({ you: 7200000, them: 4800000, shared: 600000, mode: 'equal' }), T);
  check('halves of $6,000: 3,000 ÷ 3,560 = 84% of the lower take-home → watch', heavy.zone, 'watch');
  check('… and 3,000 ÷ 5,160 = 58% of the higher, so both are heavy', heavy.heavy.join(','), 'You,Sam');
  check('… $6,000 against $8,720 in is not out of pocket', heavy.outOfPocketCents, null);

  /* No filing status: shares still compute, take-home says why. */
  const noFiling = Partner.split(household({ you: 7200000, them: 4800000, shared: 300000, mode: 'equal', filing: null }), T);
  check('no filing status → shares still $1,500 each', noFiling.people[0].shareCents + '/' + noFiling.people[1].shareCents, '150000/150000');
  checkTrue('… take-home not estimated, with the reason', noFiling.people[0].takeHomeCents === null && /filing status/.test(noFiling.people[0].takeHomeReason));
  checkTrue('… no burden, no zone, nothing invented', noFiling.people[0].burden === null && noFiling.zone === null && noFiling.totalTakeHomeCents === null);

  /* Nothing to share: no typed month and no household month. */
  const nothing = Partner.split(household({ you: 7200000, them: 4800000 }), T);
  checkTrue('no shared month anywhere → incomplete, says where to add it', !Money.isOk(nothing) && /Start Here/.test(nothing.reason) && nothing.missing.indexOf('sharedMonthlyCents') !== -1);

  /* The stored choice is validated by the schema: an unknown mode reads as unchosen. */
  check('an unknown stored mode reads as the default', Partner.split(household({ you: 7200000, them: 4800000, shared: 300000, mode: 'thirds' }), T).modeChosen, null);

  /* Labels: the intake's default partner label, and a person with none. */
  check('the partner’s label comes through', prop.people[1].label, 'Sam');
  check('… and an unlabelled partner is "The other of you"', Partner.split(household({ you: 7200000, them: 4800000, shared: 300000, label: null }), T).people[1].label, 'The other of you');

  /* Empty household, null household: no throw, a reason. */
  checkTrue('an empty household says why instead of throwing', (function () { try { const r = Partner.split(Schema.createHousehold({}), T); return !Money.isOk(r) && typeof r.reason === 'string'; } catch (e) { return false; } })());
  checkTrue('a null household too', (function () { try { return !Money.isOk(Partner.split(null, T)); } catch (e) { return false; } })());
  checkTrue('two adults and no tables at all: shares compute, tax says why', (function () {
    try { const r = Partner.split(household({ you: 7200000, them: 4800000, shared: 300000, mode: 'equal' }), {}); return Money.isOk(r) && r.value === 150000 && r.people[0].takeHomeCents === null && /table/.test(r.people[0].takeHomeReason); } catch (e) { return false; }
  })());

  section('Partner — the room on the template');

  const html = fs.readFileSync(path.join(ROOT, 'rooms/partner.html'), 'utf8');
  checkTrue('rooms/partner.html mounts on the template', /Room\.mount\(\{/.test(html) && /id: 'partner'/.test(html));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading'].forEach(id => checkTrue(`… has the section #${id}`, new RegExp('id="' + id + '"').test(html)));
  ['room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list', 'room-standalone', 'load-notice'].forEach(id => checkTrue(`… has the host #${id}`, new RegExp('id="' + id + '"').test(html)));
  checkTrue('… the registry’s subsections are all present', Registry.byId('partner').subsections.every(s => new RegExp('id="' + s.id + '"').test(html)));
  checkTrue('… no stub marker remains', !/STUB/.test(html) && !/Hourly\.realHourlyWage/.test(html));
  checkTrue('… it loads the partner engine after ratios and before the template', (function () {
    const at = f => html.indexOf('src="../' + f + '"');
    return at('engines/ratios.js') > -1 && at('engines/ratios.js') < at('engines/partner.js') && at('engines/partner.js') < at('shared/room.js');
  })());
  checkTrue('… writes only through the two owned paths', (html.match(/Spine\.set\('partner\./g) || []).length === 2 && !/upsertIncomeSource|upsertPerson/.test(html));
  checkTrue('… one Charts.stacked, no other chart', (html.match(/Charts\.stacked\(/g) || []).length === 2 && !/Charts\.(area|donut|bars)\(/.test(html));
  checkTrue('… says what it does not do', /scope: 'This room does not decide what is fair/.test(html));
  checkTrue('… declares its live-form policy', /LIVE-FORM: built once/.test(html));
  checkTrue('… says the tax split is an approximation', /approximation/.test(html));
  check('the ownership rows belong to this room', Ownership.field('splitMode').owner + '/' + Ownership.field('sharedMonthly').owner, 'partner/partner');
  check('… on the inputs anchor', Ownership.field('splitMode').anchor + '/' + Ownership.field('sharedMonthly').anchor, 'inputs/inputs');
  check('… and the split row does not apply to one adult', Ownership.describe('splitMode', household({ you: 7200000, solo: true }), 'partner').applies, false);
};
