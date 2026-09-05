/* test/rooms/protection.js — the Protection room (D-098).
   Hand-derived numbers as literals; nothing copied from engine output. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Registry, Ownership, Gate, TABLES } = t;
  const Protection = require(path.join(ROOT, 'engines/protection.js'));
  const T = { protectionConventions: TABLES.protectionConventions };

  section('Protection — the table and the engine');

  const conv = TABLES.protectionConventions;
  checkTrue('data/protection_conventions.json is filled', !!conv && conv.confidence === 'convention' && !/PLACEHOLDER/.test(conv.source));
  check('… disability replaces 60% of pay', conv.disabilityReplacementShare, 0.6);
  check('… life cover is 10x gross', conv.lifeCoverMultiple, 10);
  check('… cushion floor 3 months, full 6', conv.cushionFloorMonths + '/' + conv.cushionFullMonths, '3/6');
  checkTrue('… and the source calls them rules of thumb', /rules? of thumb/i.test(conv.source));

  function household(o) {
    const opts = o || {};
    const status = opts.status || 'employed';
    const person = Schema.createPerson({ id: 'p', label: 'You', role: 'adult', employmentStatus: status,
      incomeSources: Money.isEntered(opts.gross) ? [Schema.createIncomeSource({ id: 'i', personId: 'p', type: 'w2', grossAnnualIncomeCents: opts.gross })] : [] });
    return Schema.createHousehold({
      people: [person],
      assets: Money.isEntered(opts.cash) ? [Schema.createAsset({ id: 'c', category: 'cash', liquid: true, valueCents: opts.cash })] : [],
      expenses: { monthlyEssential: { estimatedValueCents: Money.isEntered(opts.spend) ? opts.spend : null } },
      dependents: opts.dependents === undefined ? null : opts.dependents,
      insurance: Object.assign({ highestDeductibleCents: 150000 }, opts.insurance || {})
    });
  }
  const line = (r, id) => r.lines.filter(l => l.id === id)[0];

  /* The brief's worked case: gross $60,000, spending $3,000/mo, cash $6,000,
     deductible $1,500, one dependent aged 4, term life $100,000, disability
     $2,000/mo.
       bad year    need $1,500 (the deductible; no oopMax)   held $6,000   gap -$4,500
       disability  need 60,000 × 0.6 ÷ 12 = $3,000/mo        held $2,000   gap $1,000/mo
       life        need 60,000 × 10 = $600,000                held $100,000 gap $500,000
       cushion     need 3,000 × 3 = $9,000                    held $6,000   gap $3,000
     Three lines short → 'out'; the biggest, ranked by a year of it
     (12,000 for disability against 500,000 for life), is life. */
  const base = household({ gross: 6000000, spend: 300000, cash: 600000, dependents: [{ age: 4 }], insurance: { termLifeCents: 10000000, disabilityMonthlyCents: 200000 } });
  const r = Protection.checkup(base, T);
  checkTrue('the worked case computes', Money.isOk(r), r.reason);
  check('bad year: need is the deductible', line(r, 'badYear').needCents, 150000);
  check('… held is cash', line(r, 'badYear').heldCents, 600000);
  check('… gap -$4,500 (covered)', line(r, 'badYear').gapCents, -450000);
  checkTrue('… and says the deductible stood in', line(r, 'badYear').usesOopMax === false);
  check('disability: need $3,000 a month', line(r, 'disability').needCents, 300000);
  check('… held $2,000', line(r, 'disability').heldCents, 200000);
  check('… gap $1,000 a month', line(r, 'disability').gapCents, 100000);
  check('… ranked as a year of it', line(r, 'disability').rankCents, 1200000);
  check('life: need $600,000', line(r, 'life').needCents, 60000000);
  check('… gap $500,000', line(r, 'life').gapCents, 50000000);
  check('cushion: need three months, $9,000', line(r, 'cushion').needCents, 900000);
  check('… full cushion $18,000', line(r, 'cushion').fullCents, 1800000);
  check('… gap $3,000', line(r, 'cushion').gapCents, 300000);
  check('… two months held', line(r, 'cushion').monthsHeld, 2, 1e-9);
  check('the number is the biggest gap, life', r.biggest.id, 'life');
  check('… $500,000', r.value, 50000000);
  check('three lines short → out', r.zone, 'out');
  check('… named', r.short.map(l => l.id).join(','), 'disability,life,cushion');
  check('every line applies', r.lines.filter(l => l.applies).length, 4);

  section('Protection — edge cases');

  /* Nobody depends on the income: life is not a line. */
  const nobody = Protection.checkup(household({ gross: 6000000, spend: 300000, cash: 600000, dependents: false, insurance: { disabilityMonthlyCents: 200000 } }), T);
  checkTrue('nobody depends → life line does not apply', line(nobody, 'life').applies === false);
  checkTrue('… and says why', /Nobody depends/.test(line(nobody, 'life').reason));
  check('… two lines short → out (disability, cushion)', nobody.zone, 'out');
  check('… biggest is disability: a year of $1,000/mo outranks the $3,000 cushion gap', nobody.biggest.id, 'disability');

  /* The legacy yes/no still reads as one dependent. */
  const legacy = Protection.checkup(Schema.createHousehold(Object.assign({}, household({ gross: 6000000, spend: 300000, cash: 600000 }), { dependents: true })), T);
  checkTrue('a legacy dependents:true reads as one dependent', line(legacy, 'life').applies === true && line(legacy, 'life').dependents === 1);
  check('… with the 10x need', line(legacy, 'life').needCents, 60000000);
  checkTrue('… and term life not entered is said, not zeroed', line(legacy, 'life').heldCents === null && /not entered/.test(line(legacy, 'life').reason));
  checkTrue('dependents unanswered → life applies but the need waits for the answer', (function () {
    const l = line(Protection.checkup(household({ gross: 6000000, spend: 300000, cash: 600000 }), T), 'life');
    return l.applies && l.needCents === null && /Start Here/.test(l.reason);
  })());

  /* Between jobs: no pay to replace; COBRA is flagged. */
  const bj = Protection.checkup(household({ status: 'unemployed', spend: 300000, cash: 600000, dependents: false, insurance: { health: { type: 'cobra', monthlyCents: 65000 } } }), T);
  checkTrue('between jobs → disability line does not apply', line(bj, 'disability').applies === false);
  checkTrue('… and says why', /Between jobs/.test(line(bj, 'disability').reason));
  check('… health cover on COBRA is flagged', bj.healthFlag, 'cobra');
  check('… the monthly cost is read', bj.healthMonthlyCents, 65000);
  check('… cushion gap $3,000 is the one line short → watch', bj.zone + '/' + bj.biggest.id, 'watch/cushion');
  checkTrue('COBRA while employed is not flagged', Protection.checkup(household({ gross: 6000000, spend: 300000, cash: 600000, dependents: false, insurance: { health: { type: 'cobra' } } }), T).healthFlag === null);

  /* Retired: no pay to replace either. */
  const ret = Protection.checkup(household({ status: 'retired', spend: 300000, cash: 2000000, dependents: false }), T);
  checkTrue('retired → disability line does not apply', line(ret, 'disability').applies === false && /Retired/.test(line(ret, 'disability').reason));

  /* The out-of-pocket maximum stands in for the deductible when entered. */
  const oop = Protection.checkup(household({ gross: 6000000, spend: 300000, cash: 600000, dependents: false, insurance: { oopMaxCents: 800000 } }), T);
  check('oopMax entered → the bad year is the oopMax, $8,000', line(oop, 'badYear').needCents, 800000);
  checkTrue('… and says so', line(oop, 'badYear').usesOopMax === true);
  check('… gap $2,000', line(oop, 'badYear').gapCents, 200000);

  /* No health cover: the same need, flagged. */
  const none = Protection.checkup(household({ gross: 6000000, spend: 300000, cash: 600000, dependents: false, insurance: { health: { type: 'none' } } }), T);
  check('no health cover is flagged', none.healthFlag, 'none');
  checkTrue('… on the bad-year line', line(none, 'badYear').noHealthCover === true);
  check('… need still the deductible', line(none, 'badYear').needCents, 150000);

  /* Cash typed as zero: gaps equal needs. Cash never entered: held is not
     entered, said as such, and no gap is invented. */
  const broke = Protection.checkup(household({ gross: 6000000, spend: 300000, cash: 0, dependents: false, insurance: { disabilityMonthlyCents: 300000 } }), T);
  check('cash of zero → bad-year gap equals the need', line(broke, 'badYear').gapCents, 150000);
  check('… cushion gap equals the need', line(broke, 'cushion').gapCents, 900000);
  const nocash = Protection.checkup(household({ gross: 6000000, spend: 300000, dependents: false }), T);
  checkTrue('cash not entered → held is null and says so', line(nocash, 'cushion').heldCents === null && /cash/.test(line(nocash, 'cushion').reason));
  checkTrue('… no gap is invented', line(nocash, 'cushion').gapCents === null && line(nocash, 'badYear').gapCents === null);
  checkTrue('… the unknown lines are listed', nocash.unknown.map(l => l.id).indexOf('cushion') !== -1);

  /* Every line covered → good, value 0, nothing biggest. */
  const good = Protection.checkup(household({ gross: 6000000, spend: 300000, cash: 1000000, dependents: [{ age: 4 }], insurance: { termLifeCents: 60000000, disabilityMonthlyCents: 300000 } }), T);
  check('every line covered → good', good.zone, 'good');
  check('… value 0', good.value, 0);
  checkTrue('… no biggest', good.biggest === null);
  check('… nothing short', good.short.length, 0);

  /* Empty household: an incomplete Result with reasons, never a throw. */
  let empty;
  try { empty = Protection.checkup(Schema.createHousehold({}), T); } catch (e) { empty = { threw: e.message }; }
  checkTrue('empty household → incomplete, no throw', empty && empty.status === 'incomplete', empty && empty.threw);
  checkTrue('… with a reason', typeof empty.reason === 'string' && empty.reason.length > 0);
  checkTrue('… and a missing table is a reason too', Protection.checkup(base, {}).status === 'incomplete');
  checkTrue('… no result carries a status key in its extras', !Object.keys(r).some(k => k === 'status' && r[k] !== 'ok'));

  section('Protection — the room on the template');

  const html = fs.readFileSync(path.join(ROOT, 'rooms/protection.html'), 'utf8');
  checkTrue('rooms/protection.html mounts on the template', /Room\.mount\(\{/.test(html) && /id: 'protection'/.test(html));
  ['room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list', 'room-standalone', 'load-notice']
    .forEach(id => checkTrue('… host #' + id, html.indexOf('id="' + id + '"') !== -1));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading'].forEach(id => checkTrue('… section #' + id, html.indexOf('id="' + id + '"') !== -1));
  const tag = f => html.indexOf('<script src="../' + f + '"');
  checkTrue('… loads the engine after tier0 and before the lens', tag('engines/tier0.js') !== -1 && tag('engines/tier0.js') < tag('engines/protection.js') && tag('engines/protection.js') < tag('shared/lens.js'));
  checkTrue('… is not the stub', html.indexOf('STUB') === -1 && html.indexOf('Hourly.realHourlyWage') === -1);
  checkTrue('… writes health cover through Spine.set on the two paths it owns', /Spine\.set\('insurance\.health\.type'/.test(html) && /Spine\.set\('insurance\.health\.monthlyCents'/.test(html));
  checkTrue('… and nothing else', (html.match(/Spine\.set\(/g) || []).length === 2 && !/upsertPerson|upsertAsset|updateProfile/.test(html));
  checkTrue('… the coverage facts are read, not edited', /reads: \[/.test(html) && ['termLife', 'disabilityMonthly', 'oopMax', 'umbrella', 'highestDeductible', 'dependents', 'monthlyExpenses', 'cashSavings', 'grossAnnualIncome'].every(f => html.indexOf("'" + f + "'") !== -1));
  checkTrue('… one bars chart', /Charts\.bars\(/.test(html) && !/Charts\.(area|donut|stacked)\(/.test(html));
  checkTrue('… the select offers every health type', Schema.HEALTH_TYPES.every(v => html.indexOf("'" + v + "'") !== -1));
  checkTrue('… and the scope line says what it does not do', /scope: 'This room does not quote a policy/.test(html));

  const room = Registry.byId('protection');
  checkTrue('the registry row exists', !!room && room.href === 'rooms/protection.html');
  check('… appears for everyone but a student', Gate.SITUATIONS.filter(s => Registry.applies(room, household({ status: s.status }))).map(s => s.id).join(','), 'employed,selfEmployed,betweenJobs,retired,mixed');
  check('… the two writes are owned here', Ownership.field('healthCover').owner + '/' + Ownership.field('healthMonthly').owner, 'protection/protection');
  check('… and the coverage facts by Sleep At Night', ['termLife', 'disabilityMonthly', 'oopMax', 'umbrella'].map(f => Ownership.field(f).owner).join(','), 'sleep-at-night,sleep-at-night,sleep-at-night,sleep-at-night');
};
