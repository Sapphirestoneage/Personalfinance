/* test/rooms/kids.js — the Kids and Tuition room (D-099).
   Hand-derived numbers as literals; nothing copied from engine output. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Registry, Ownership, Gate, Projection, TABLES } = t;
  const Kids = require(path.join(ROOT, 'engines/kids.js'));
  const T = { childCost: TABLES.childCost, childcareByState: TABLES.childcareByState };

  section('Kids and Tuition — the tables');

  const cost = TABLES.childCost, care = TABLES.childcareByState;
  checkTrue('data/child_cost.json is filled and says its USDA basis', !!cost && /USDA/.test(cost.source) && !/PLACEHOLDER/.test(cost.source));
  checkTrue('… and that it excludes college', /excludes college/.test(cost.confidenceNote));
  check('… six three-year bands', cost.bands.length, 6);
  check('… the 3-to-5 band starts at month 36 and costs $1,300 a month', cost.bands[1].fromMonths + '/' + cost.bands[1].monthlyCents, '36/130000');
  check('… the 9-to-11 band starts at month 108 and costs $1,500 a month', cost.bands[3].fromMonths + '/' + cost.bands[3].monthlyCents, '108/150000');
  checkTrue('… the college conventions give a monthly figure and no lump sum', Money.isEntered(cost.college.half.monthlyCents) && !Money.isEntered(cost.college.half.targetCents) && !Money.isEntered(cost.college.half.totalCents));
  checkTrue('data/childcare_by_state.json is filled', !!care && !/PLACEHOLDER/.test(care.source) && !!care.states);
  check('… NC is $1,000 a month ($12,000 ÷ 12)', care.states.NC.monthlyCents, 100000);
  check('… with a national figure of $1,042 a month', care.national.monthlyCents, 104200);

  function household(o) {
    const opts = o || {};
    const person = Schema.createPerson({ id: 'p', label: 'You', role: 'adult', employmentStatus: opts.status || 'employed' });
    return Schema.createHousehold({
      people: [person],
      state: opts.state === undefined ? null : opts.state,
      dependents: opts.dependents === undefined ? null : opts.dependents,
      community: { daySchool: opts.daySchool === undefined ? null : opts.daySchool },
      kids: opts.kids || {},
      expenses: { monthlyEssential: { estimatedValueCents: 400000 } }
    });
  }

  section('Kids and Tuition — the worked case');

  /* Two children, 4 and 9, in NC. Target $50,000 each, $5,000 saved,
     $200 a month going in, 5% real.

     The cost now
       age 4 = 48 months  → band 3-5  (from 36)   $1,300/mo
                            under five → NC childcare $1,000/mo
                            → $2,300/mo
       age 9 = 108 months → band 9-11 (from 108)  $1,500/mo, no childcare
                            → $1,500/mo
       household           $3,800/mo  ×12 = $45,600 a year

     Tuition — the pot goes to the oldest first, so the 9-year-old holds the
     $5,000 and the 4-year-old $0. Monthly rate r = 0.05 ÷ 12 = 0.0041667.

       9-year-old: n = 9 × 12 = 108 months
         (1+r)^108 = 1.566847
         saved grown = 500,000 × 1.566847 = 783,423
         shortfall S = 5,000,000 − 783,423 = 4,216,577
         PMT = S × r ÷ ((1+r)^n − 1) = 4,216,577 × 0.0041667 ÷ 0.566847
             = 17,569.1 ÷ 0.566847 = 30,994 cents  → $309.94/mo
       4-year-old: n = 14 × 12 = 168 months, saved 0
         (1+r)^168 = 2.010826
         PMT = 5,000,000 × 0.0041667 ÷ 1.010826 = 20,833.3 ÷ 1.010826
             = 20,610 cents → $206.10/mo
       needed  30,994 + 20,610 = 51,604 → $516.04/mo
       going in $200 → $316.04 short → watch
       gap today  (50,000 − 5,000) + (50,000 − 0) = $95,000                 */
  const base = household({ state: 'NC', dependents: [{ age: 4 }, { age: 9 }], kids: { tuitionTargetCents: 5000000, tuitionSavedCents: 500000, tuitionMonthlyCents: 20000 } });
  const r = Kids.plan(base, T);
  checkTrue('the worked case computes', Money.isOk(r), r.reason);
  check('two children', r.count, 2);
  const four = r.children[0], nine = r.children[1];
  check('age 4 → band 3-5', four.band.id, '3-5');
  check('… $1,300 a month from the band', four.costCents, 130000);
  check('… childcare applies, $1,000 in NC', four.childcareApplies + '/' + four.childcareCents + '/' + four.childcareSource, 'true/100000/state');
  check('… $2,300 a month all in', four.monthlyCents, 230000);
  check('… 14 years to 18', four.yearsTo18, 14);
  check('age 9 → band 9-11', nine.band.id, '9-11');
  check('… $1,500 a month, no childcare', nine.costCents + '/' + nine.childcareApplies + '/' + nine.childcareCents, '150000/false/0');
  check('… 9 years to 18', nine.yearsTo18, 9);
  check('household $3,800 a month', r.monthlyCents, 380000);
  check('… $45,600 a year is the number', r.value, 4560000);
  check('… childcare $1,000 a month, one under five', r.childcareMonthlyCents + '/' + r.underFive, '100000/1');
  check('the pot goes to the 9-year-old first: $5,000', nine.tuition.savedCents, 500000);
  check('… and the 4-year-old holds $0', four.tuition.savedCents, 0);
  check('9-year-old: 108 months', nine.tuition.months, 108);
  check('… growth factor 1.566847', nine.tuition.growthFactor, 1.566847, 1e-5);
  check('… shortfall at 18 $42,165.77', nine.tuition.shortfallCents, 4216577, 2);
  check('… needs $309.94 a month (within $1)', nine.tuition.neededMonthlyCents, 30994, 100);
  check('4-year-old: 168 months, growth 2.010826', four.tuition.months + '/' + four.tuition.growthFactor.toFixed(6), '168/2.010826');
  check('… needs $206.10 a month (within $1)', four.tuition.neededMonthlyCents, 20610, 100);
  check('household needs $516.04 a month', r.tuition.neededMonthlyCents, 51604, 200);
  check('… $200 going in is short by $316.04', r.tuition.shortMonthlyCents, 31604, 200);
  checkTrue('… not on time', r.tuition.onTime === false);
  check('… so the zone is watch', r.zone, 'watch');
  check('… the gap today is $95,000', r.tuition.gapCents, 9500000);
  check('… the real return is 5%', r.tuition.returnReal, 0.05);

  /* The level payment, put back through the projection engine's monthly
     compounding, lands on the target: the two formulas agree. */
  const back9 = Projection.futureValueMonthlyCents({ startCents: 500000, monthlyContributionCents: nine.tuition.neededMonthlyCents, annualRate: 0.05, months: 108 });
  check('… paying $309.94 a month on $5,000 for 108 months lands on $50,000', back9.value, 5000000, 200);
  const back4 = Projection.futureValueMonthlyCents({ startCents: 0, monthlyContributionCents: four.tuition.neededMonthlyCents, annualRate: 0.05, months: 168 });
  check('… paying $206.10 a month for 168 months lands on $50,000', back4.value, 5000000, 200);
  /* And it IS the loan formula on the present value of the shortfall:
     4,216,577 ÷ 1.566847 = 2,691,124 cents borrowed over 108 months at 5%. */
  check('… the same as the loan payment on the shortfall’s present value', Projection.levelPaymentCents({ principalCents: 2691124, annualRate: 0.05, months: 108 }).value, 30994, 2);
  /* At 0% it is simply the shortfall split by the months. */
  check('at 0% the monthly is the shortfall over the months: $45,000 ÷ 108', Kids.levelMonthlyToTarget(5000000, 500000, 108, 0).neededMonthlyCents, 41667, 1);

  section('Kids and Tuition — edge cases');

  /* An age missing: costed at the youngest band, with a note. */
  const noAge = Kids.plan(household({ state: 'NC', dependents: [{ age: null }] }), T);
  checkTrue('age missing → costed at the youngest band', Money.isOk(noAge) && noAge.children[0].band.id === '0-2' && noAge.children[0].costCents === 120000);
  checkTrue('… says the age is not entered', noAge.children[0].ageKnown === false && /not entered/.test(noAge.children[0].note) && noAge.children[0].label === 'Age not entered');
  check('… childcare included, eighteen years to go', noAge.children[0].childcareCents + '/' + noAge.children[0].yearsTo18, '100000/18');

  /* Over 18: no cost, 'past 18', and tuition due now. */
  const grown = Kids.plan(household({ state: 'NC', dependents: [{ age: 19 }], kids: { tuitionTargetCents: 5000000, tuitionSavedCents: 1000000 } }), T);
  check('child over 18 → $0 cost', grown.children[0].monthlyCents, 0);
  checkTrue('… with past-18 wording', grown.children[0].past18 === true && /[Pp]ast 18/.test(grown.children[0].note));
  checkTrue('… tuition due now, no monthly figure', grown.children[0].tuition.dueNow === true && grown.children[0].tuition.neededMonthlyCents === null);
  check('… the gap is target less saved, $40,000', grown.tuition.gapCents, 4000000);
  check('… one bill due now', grown.tuition.dueNowCount, 1);
  check('… the year is $0', grown.value, 0);

  /* No state: the childcare line says so and the national figure stands in. */
  const noState = Kids.plan(household({ dependents: [{ age: 2 }] }), T);
  check('no state → the national childcare figure', noState.children[0].childcareCents + '/' + noState.children[0].childcareSource, '104200/national');
  checkTrue('… and the line says no state is entered', /[Nn]o state entered/.test(noState.children[0].childcareReason));
  const noNational = Kids.plan(household({ dependents: [{ age: 2 }] }), { childCost: cost, childcareByState: { states: care.states } });
  checkTrue('… with no national figure either the line is not priced', noNational.children[0].childcareCents === null && noNational.childcareUnknown === 1 && /no national/.test(noNational.children[0].childcareReason));
  check('… and the band still counts', noNational.monthlyCents, 120000);

  /* Tuition target 0 or blank: no tuition line. */
  const zeroTarget = Kids.plan(household({ state: 'NC', dependents: [{ age: 4 }], kids: { tuitionTargetCents: 0, tuitionMonthlyCents: 20000 } }), T);
  checkTrue('tuition target 0 → no tuition line', zeroTarget.tuition === null && /zero/.test(zeroTarget.tuitionReason));
  check('… and no zone', zeroTarget.zone, null);
  const noTarget = Kids.plan(household({ state: 'NC', dependents: [{ age: 4 }] }), T);
  checkTrue('no target entered → no tuition line, says so', noTarget.tuition === null && /[Nn]o tuition target/.test(noTarget.tuitionReason));

  /* Saved at or past the target: funded. */
  const funded = Kids.plan(household({ state: 'NC', dependents: [{ age: 4 }, { age: 9 }], kids: { tuitionTargetCents: 5000000, tuitionSavedCents: 10000000, tuitionMonthlyCents: 0 } }), T);
  checkTrue('saved ≥ target → funded for every child', funded.tuition.allFunded === true && funded.children.every(c => c.tuition.funded && c.tuition.neededMonthlyCents === 0));
  check('… nothing needed a month, gap $0', funded.tuition.neededMonthlyCents + '/' + funded.tuition.gapCents, '0/0');
  checkTrue('… $0 going in is still on time', funded.tuition.onTime === true && funded.zone === null);
  /* Growth alone gets there: $30,000 today at 5% real for 14 years is
     $30,000 × 2.010826 = $60,325 > $50,000. */
  const grows = Kids.plan(household({ state: 'NC', dependents: [{ age: 4 }], kids: { tuitionTargetCents: 5000000, tuitionSavedCents: 3000000 } }), T);
  checkTrue('saved that grows past the target → funded', grows.children[0].tuition.funded === true);
  check('… shortfall negative: $50,000 − $60,325', grows.children[0].tuition.shortfallCents, -1032479, 5);
  /* Monthly entered but not short → on time, no zone. */
  const onTime = Kids.plan(household({ state: 'NC', dependents: [{ age: 4 }], kids: { tuitionTargetCents: 5000000, tuitionMonthlyCents: 25000 } }), T);
  checkTrue('$250 a month against $206.10 needed → on time', onTime.tuition.onTime === true && onTime.zone === null && onTime.tuition.shortMonthlyCents === 0);
  /* Monthly not entered: no verdict, no zone. */
  checkTrue('nothing entered as going in → no verdict', noTarget.zone === null && Kids.plan(household({ state: 'NC', dependents: [{ age: 4 }], kids: { tuitionTargetCents: 5000000 } }), T).tuition.onTime === null);

  /* A day school in the picture: the table's private-school figure from five. */
  const school = Kids.plan(household({ state: 'NC', dependents: [{ age: 4 }, { age: 9 }], daySchool: true }), T);
  check('day school → $1,000 a month for the 9-year-old only', school.children[0].daySchoolCents + '/' + school.children[1].daySchoolCents, '0/100000');
  check('… $4,800 a month all in', school.monthlyCents, 480000);
  checkTrue('… without it, nothing added', r.daySchool === false && r.daySchoolMonthlyCents === 0);

  /* No dependents: incomplete, and the registry hides the room. */
  const nobody = Kids.plan(household({ dependents: [] }), T);
  checkTrue('an empty list → incomplete, says nobody depends', nobody.status === 'incomplete' && /[Nn]obody/.test(nobody.reason));
  checkTrue('… and the registry hides the room', Gate.exists(household({ dependents: [] }), 'dependents') === false && Registry.requires('kids').indexOf('dependents') !== -1);
  checkTrue('… but shows it with a child', Gate.exists(base, 'dependents') === true);
  const unasked = Kids.plan(household({}), T);
  checkTrue('not asked → incomplete, points to Start Here', unasked.status === 'incomplete' && /Start Here/.test(unasked.reason) && unasked.missing.indexOf('dependents') !== -1);

  /* The legacy yes/no: one child of unknown age. */
  const legacy = Kids.plan(Schema.createHousehold(Object.assign({}, household({ state: 'NC' }), { dependents: true })), T);
  checkTrue('legacy dependents:true → one child of unknown age', Money.isOk(legacy) && legacy.count === 1 && legacy.children[0].ageKnown === false);
  check('… at the youngest band with childcare', legacy.children[0].monthlyCents, 220000);

  /* Empty household: an incomplete Result with a reason, never a throw. */
  let empty;
  try { empty = Kids.plan(Schema.createHousehold({}), T); } catch (e) { empty = { threw: e.message }; }
  checkTrue('empty household → incomplete, no throw', empty && empty.status === 'incomplete', empty && empty.threw);
  checkTrue('… with a reason', typeof empty.reason === 'string' && empty.reason.length > 0);
  let none;
  try { none = Kids.plan(null, T); } catch (e) { none = { threw: e.message }; }
  checkTrue('… null household too', none && none.status === 'incomplete', none && none.threw);
  checkTrue('… a missing cost table is a reason, not a figure', Kids.plan(base, {}).status === 'incomplete' && /child_cost/.test(Kids.plan(base, {}).reason));
  checkTrue('… no result carries a status key in its extras', r.status === 'ok' && Object.keys(r).filter(k => k === 'status').length === 1);

  /* Ages are whole years; a 17-year-old has 12 months and the last band. */
  const seventeen = Kids.plan(household({ state: 'NC', dependents: [{ age: 17 }], kids: { tuitionTargetCents: 1200000, tuitionSavedCents: 0 } }), T);
  check('age 17 → band 15-17, $1,800 a month', seventeen.children[0].band.id + '/' + seventeen.children[0].costCents, '15-17/180000');
  /* 12 months at r: (1+r)^12 = 1.051162; PMT = 1,200,000 × 0.0041667 ÷ 0.051162 = 97,726 */
  check('… $12,000 in 12 months needs $977.26 a month', seventeen.children[0].tuition.neededMonthlyCents, 97726, 100);

  section('Kids and Tuition — the room on the template');

  const html = fs.readFileSync(path.join(ROOT, 'rooms/kids.html'), 'utf8');
  checkTrue('rooms/kids.html mounts on the template', /Room\.mount\(\{/.test(html) && /id: 'kids'/.test(html));
  ['room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list', 'room-standalone', 'load-notice']
    .forEach(id => checkTrue('… host #' + id, html.indexOf('id="' + id + '"') !== -1));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading'].forEach(id => checkTrue('… section #' + id, html.indexOf('id="' + id + '"') !== -1));
  checkTrue('… the assumptions drawer is a details', /<details class="room-drawer" id="assumptions">/.test(html));
  const src = f => html.indexOf('src="../' + f + '"');
  checkTrue('… loads the engine after projection and tier0 and before the lens', src('engines/projection.js') < src('engines/kids.js') && src('engines/tier0.js') < src('engines/kids.js') && src('engines/kids.js') < src('shared/lens.js'));
  checkTrue('… is not the stub', html.indexOf('STUB') === -1 && html.indexOf('Hourly.realHourlyWage') === -1);
  checkTrue('… writes the three tuition fields through Spine.set', ['kids.tuitionTargetCents', 'kids.tuitionSavedCents', 'kids.tuitionMonthlyCents'].every(p => html.indexOf("Spine.set('" + p + "'") !== -1));
  checkTrue('… and nothing else', (html.match(/Spine\.set\(/g) || []).length === 3 && !/upsertPerson|upsertAsset|updateProfile|Spine\.set\('dependents/.test(html));
  checkTrue('… reads the dependents, the state and spending as chips', /reads: \['dependents', 'state', 'monthlyExpenses'\]/.test(html));
  checkTrue('… loads the two tables', /'childCost'/.test(html) && /'childcareByState'/.test(html));
  checkTrue('… one bars chart', (html.match(/Charts\.bars\(/g) || []).length === 2 && !/Charts\.(area|donut|stacked)\(/.test(html));
  checkTrue('… three inputs, one per owned field', ['tuitionTargetCents', 'tuitionSavedCents', 'tuitionMonthlyCents'].every(c => html.indexOf("ctl: '" + c + "'") !== -1));
  checkTrue('… no target is proposed, and the hint says why', !/propose:/.test(html) && /gives no lump sum/.test(html));
  checkTrue('… says the USDA basis and that it excludes college in the drawer', /cost\.source/.test(html) && /cost\.confidenceNote/.test(html));
  checkTrue('… a why for every situation', Gate.SITUATIONS.every(s => new RegExp(s.id + ": '").test(html)));
  checkTrue('… the retired why says grandchildren are not dependents unless entered', /grandchildren are not dependents/.test(html));
  checkTrue('… and the scope line says what it does not do', /scope: 'This room does not know a school’s actual price, financial aid, or 529 rules\.'/.test(html));

  const room = Registry.byId('kids');
  checkTrue('the registry row exists', !!room && room.href === 'rooms/kids.html');
  ['tuitionTarget', 'tuitionSaved', 'tuitionMonthly'].forEach(f => {
    const d = Ownership.field(f);
    checkTrue('ownership: ' + f + ' is owned by kids at #inputs', !!d && d.owner === 'kids' && d.anchor === 'inputs');
  });
  const owned = Ownership.describe('tuitionTarget', base, 'kids');
  checkTrue('… the target reads back $50,000', owned && owned.isSet && owned.result.value === 5000000);
};
