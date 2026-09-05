/* test/rooms/presets.js — the Savings and Investments presets. D-129. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, path, fs, Money, Schema, TABLES } = t;
  const Presets = require(path.join(ROOT, 'engines/presets.js'));
  const Budget = require(path.join(ROOT, 'engines/budget.js'));
  const QuickMath = require(path.join(ROOT, 'engines/quickmath.js'));
  const Spine = require(path.join(ROOT, 'shared/spine-v2.js'));
  section('Presets (D-129): Rule of Five, Max IRA, Max 401(k), stacked into the estimate');

  const T = { irsLimits: TABLES.irsLimits, effectiveTaxRates: TABLES.effectiveTaxRates, seTax: TABLES.seTax, expenseCategories: TABLES.expenseCategories };
  const L = TABLES.irsLimits.limits;
  const NOW = Date.parse('2026-09-15T12:00:00');
  const hh = (extra) => Schema.createHousehold(Object.assign({ filingStatus: 'single', state: 'NC',
    people: [Schema.createPerson({ id: 'P', role: 'adult', dob: '1990-04-01', employmentStatus: 'employed', incomeSources: [Schema.createIncomeSource({ id: 'i', personId: 'P', grossAnnualIncomeCents: 7200000 })] })],
    assets: [Schema.createAsset({ id: 'a', category: 'cash', valueCents: 400000 })] }, extra || {}));

  /* Max IRA: the table, a twelfth, catch-up at exactly 50. */
  const ira = Presets.maxIra(hh(), T, NOW);
  check('Max IRA at 36 is a twelfth of the limit', ira.value + '/' + ira.catchUp, Math.round(L.ira * 100 / 12) + '/false');
  const at49 = Presets.maxIra(hh({ people: [Schema.createPerson({ id: 'P', role: 'adult', dob: '1976-09-16' })] }), T, NOW);
  const at50 = Presets.maxIra(hh({ people: [Schema.createPerson({ id: 'P', role: 'adult', dob: '1976-09-15' })] }), T, NOW);
  check('the day before 50: no catch-up', at49.catchUp + '/' + at49.age, 'false/49');
  check('at exactly 50: the catch-up', at50.catchUp + '/' + at50.value, 'true/' + Math.round((L.ira + L.iraCatchup50Plus) * 100 / 12));
  const noDob = Presets.maxIra(hh({ people: [Schema.createPerson({ id: 'P', role: 'adult' })] }), T, NOW);
  check('no date of birth: the base limit, and it says to add one', noDob.ageUnknown + '/' + noDob.value + '/' + /date of birth/.test(noDob.why), 'true/' + Math.round(L.ira * 100 / 12) + '/true');

  /* Max 401(k): absent unless indicated. */
  const no401 = Presets.max401k(hh(), T, NOW);
  check('Max 401(k) is not there until an employer 401(k) is indicated', no401.status, 'incomplete');
  checkTrue('… and is not in the offered list at all — absent, not disabled', !Presets.available(hh(), T, { now: NOW }).some(p => p.id === 'max401k'));
  checkTrue('… the question is asked once, when the situation could carry a plan', Presets.ask401k(hh()) === true && Presets.ask401k(hh({ retirement: { has401k: false } })) === false);
  checkTrue('… and not of the self-employed', Presets.ask401k(hh({ people: [Schema.createPerson({ id: 'P', role: 'adult', employmentStatus: 'selfEmployed' })] })) === false);
  const yes401 = Presets.max401k(hh({ retirement: { has401k: true } }), T, NOW);
  check('indicated: a twelfth of the elective limit', yes401.value, Math.round(L.elective401k * 100 / 12));
  check('… catch-up at 50', Presets.max401k(hh({ retirement: { has401k: true }, people: [Schema.createPerson({ id: 'P', role: 'adult', dob: '1970-01-01' })] }), T, NOW).value, Math.round((L.elective401k + L.elective401kCatchup50Plus) * 100 / 12));
  check('… said no: absent again', Presets.available(hh({ retirement: { has401k: false } }), T, { now: NOW }).some(p => p.id === 'max401k'), false);

  /* Rule of Five: through QuickMath.ruleOfFive, never a second formula. */
  const r5none = Presets.ruleOfFive(hh(), T);
  check('Rule of Five needs the Big Purchase price', r5none.status + '/' + r5none.missing[0], 'incomplete/purchase.priceCents');
  const hp = hh({ purchase: { priceCents: 200000, monthsAway: 10 } });
  const r5 = Presets.ruleOfFive(hp, T);
  const q = QuickMath.ruleOfFive(hp, 200000);
  check('… five of a $2,000 thing is $10,000; $4,000 in cash leaves $6,000, over 10 months', r5.value + '/' + r5.shortfallCents + '/' + r5.monthsAway, Math.ceil(q.shortfallCents / 10) + '/' + q.shortfallCents + '/10');
  check('… the figures are QuickMath’s own', r5.neededCents + '/' + r5.cashCents, q.neededCents + '/' + q.cashCents);
  check('… no date: a year, and it says so', Presets.ruleOfFive(hh({ purchase: { priceCents: 200000 } }), T).monthsAssumed + '/' + Presets.ruleOfFive(hh({ purchase: { priceCents: 200000 } }), T).value, 'true/' + Math.ceil(q.shortfallCents / 12));
  check('… already passing: nothing more', Presets.ruleOfFive(hh({ purchase: { priceCents: 50000 } }), T).value, 0);

  /* Stacking into the estimate. */
  const hs = hh({ retirement: { has401k: true }, purchase: { priceCents: 200000, monthsAway: 10 }, budget: { presets: { '2026-09': { investments: ['maxIra', 'max401k'], savings: ['ruleOfFive'] } } } });
  const st = Presets.stacked(hs, T, '2026-09', { now: NOW });
  check('two presets stack in Investments', st.investments.cents + '/' + st.investments.items.map(i => i.id).join('+'), (ira.value + yes401.value) + '/maxIra+max401k');
  check('one in Savings', st.savings.cents, r5.value);
  const sheet = Budget.month(hs, T, T.expenseCategories, '2026-09', NOW);
  const row = b => sheet.rows.filter(r => r.bucket === b)[0];
  check('the budget’s Estimated is the stack', row('investments').estimatedCents + '/' + row('investments').estBasis + '/' + row('investments').estFrom, (ira.value + yes401.value) + '/presets/Max the IRA + Max the 401(k)');
  hs.budget.estimated = { '2026-09': { savings: 10000 } };
  check('a hand-set figure keeps the presets on top of it', Budget.month(hs, T, T.expenseCategories, '2026-09', NOW).rows.filter(r => r.bucket === 'savings')[0].estimatedCents, 10000 + r5.value);
  hs.retirement.has401k = false;
  check('take the 401(k) away and it drops out of the live figure, the IRA stays', Budget.month(hs, T, T.expenseCategories, '2026-09', NOW).rows.filter(r => r.bucket === 'investments')[0].estimatedCents, ira.value);
  check('the constructor keeps only known presets, once each', Schema.createBudget({ presets: { '2026-09': { investments: ['maxIra', 'maxIra', 'nope'], income: [] }, bad: { savings: ['ruleOfFive'] } } }).presets['2026-09'].investments.join(',') + '/' + Object.keys(Schema.createBudget({ presets: { bad: { savings: ['ruleOfFive'] } } }).presets).length, 'maxIra/0');

  /* The spine: toggle, and the one-time 401(k) answer. */
  Spine.reset();
  Spine.updateProfile({ retirement: { has401k: true } });
  check('has401k is stored as asked', Spine.getProfile().retirement.has401k, true);
  Spine.togglePreset('2026-09', 'investments', 'maxIra');
  Spine.togglePreset('2026-09', 'investments', 'max401k');
  check('presets toggle on', Spine.getProfile().budget.presets['2026-09'].investments.join(','), 'maxIra,max401k');
  Spine.togglePreset('2026-09', 'investments', 'maxIra');
  check('… and off', Spine.getProfile().budget.presets['2026-09'].investments.join(','), 'max401k');
  Spine.setHas401k(false);
  check('the answer can change', Spine.getProfile().retirement.has401k, false);
  Spine.reset();

  const page = fs.readFileSync(path.join(ROOT, 'rooms/budget.html'), 'utf8');
  checkTrue('the room stacks presets with buttons, nothing typed', /data-preset=/.test(page) && /Spine\.togglePreset\(/.test(page) && /data-has401k=/.test(page) && /Presets\.ask401k\(/.test(page));
  checkTrue('… and loads the limits table it reads', /'irsLimits'/.test(page) && /engines\/presets\.js/.test(page));
};
