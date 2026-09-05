/* test/rooms/unlearning.js — the Unlearning room (D-101).
   The demo's sort is derived by hand below, rule by rule, as literals;
   nothing is copied from engine output. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Demo, Registry, Ownership, Foo, Ratios, TABLES } = t;
  const Unlearning = require(path.join(ROOT, 'engines/unlearning.js'));
  const T = TABLES;

  section('Unlearning — the table');

  const table = T.unlearning;
  checkTrue('data/unlearning.json is filled and says where its steps and zones come from', !!table && /foo_rules/.test(table.source) && /ratio_benchmarks/.test(table.source));
  check('… marked as a convention', table.confidence, 'convention');
  checkTrue('… and says the step mapping is a judgement', /judgement/.test(table.confidenceNote));
  const ids = table.rules.map(r => r.id);
  check('every rule id is unique', new Set(ids).size, ids.length);
  checkTrue('every rule has advice, a source, and a step range or a ratio', table.rules.every(r => r.advice && r.source && (Array.isArray(r.steps) || (r.ratio && r.ratio.id && Array.isArray(r.ratio.zones)))));
  checkTrue('every step range is [min, max] within 0–9 with min ≤ max', table.rules.filter(r => r.steps).every(r =>
    r.steps.length === 2 && Number.isInteger(r.steps[0]) && Number.isInteger(r.steps[1]) && r.steps[0] >= 0 && r.steps[1] <= 9 && r.steps[0] <= r.steps[1]));
  checkTrue('every ratio a rule names is one engines/ratios.js computes', table.rules.filter(r => r.ratio).every(r => Ratios.RATIOS ? Ratios.RATIOS.some(x => x.id === r.ratio.id) : true));
  checkTrue('every ratio zone named is good, watch, or out', table.rules.filter(r => r.ratio).every(r => r.ratio.zones.every(z => ['good', 'watch', 'out'].includes(z))));
  checkTrue('every ratio a rule names has a band in data/ratio_benchmarks.json', table.rules.filter(r => r.ratio).every(r => !!T.ratioBenchmarks.bands[r.ratio.id]));
  check('the starter-fund rule is about $1,000', table.rules.find(r => r.id === 'starter-fund-first').amountCents, 100000);
  check('the six-months rule is about 6 months', table.rules.find(r => r.id === 'six-months-of-expenses').months, 6);
  checkTrue('no rule repeats an advice-translator item id (the dashboard block is the top line, not a copy)', !ids.some(id => T.adviceTranslator.items.some(i => i.id === id)));

  section('Unlearning — the demo, sorted by hand');

  /* The demo persona (shared/demo-persona.js): the ladder stops UNMET on
     step 2, capture the match (test/run.js, "foo placement step number").
     Its banded ratios (engines/ratios.js against ratio_benchmarks v1.3):
       debtToIncome  1,220 owed a month ÷ 6,000 gross a month... the engine
                     reads 0.051 → good (≤ 0.28)
       savingsRate   0.285 → good (≥ 0.15)
       housingRatio  no verdict: the demo enters no housing payment
       emergencyFund 9,500 ÷ 3,150 = 3.02 months → watch
     Against step 2 and those zones, rule by rule:
       starter-fund-first        steps [0,1]   2 > 1                → stop
       pay-off-all-debt…         steps [3,3]   2 < 3                → not yet (the step decides before the ratio)
       get-the-match             steps [2,9]   2 inside             → applies
       six-months-of-expenses    steps [4,4]   2 < 4                → not yet
       cut-the-lattes            savingsRate in [out]; it is good  → stop
       max-the-roth              steps [6,9]   2 < 6                → not yet
       buy-dont-rent             steps [4,9] + housingRatio [good]: 2 < 4 → not yet (housing has no verdict, but the step decides)
       invest-in-index-funds     steps [2,9]   2 inside             → applies
       hustle-harder             savingsRate in [out]; it is good  → stop
       hyper-accumulate          steps [7,9]   2 < 7                → not yet
       never-carry-a-balance     steps [0,9]   2 inside             → applies
       prepay-the-mortgage       steps [9,9]   2 < 9                → not yet
     applies 3 · stop 3 · not yet 6 · unknown 0. Nothing let go of yet, so
     the number — stop believing and not yet dropped — is 3. */
  const APPLIES = ['get-the-match', 'invest-in-index-funds', 'never-carry-a-balance'];
  const STOP = ['starter-fund-first', 'cut-the-lattes', 'hustle-harder'];
  const NOT_YET = ['pay-off-all-debt-before-investing', 'six-months-of-expenses', 'max-the-roth', 'buy-dont-rent', 'hyper-accumulate', 'prepay-the-mortgage'];

  const demo = Demo.build();
  check('the demo is on step 2 (the premise of the hand sort)', Foo.evaluate(demo, T).placement.step, 2);
  const st = Unlearning.standing(demo, T, {});
  check('standing reads step 2', st.step, 2);
  check('… as the exact range [2, 2]', JSON.stringify(st.range), '[2,2]');
  check('… debtToIncome good', st.zones.debtToIncome, 'good');
  check('… savingsRate good', st.zones.savingsRate, 'good');
  check('… emergencyFundMonths watch', st.zones.emergencyFundMonths, 'watch');
  checkTrue('… housingRatio has no verdict', st.zones.housingRatio === undefined);

  const c = Unlearning.classify(demo, T, {});
  checkTrue('the demo classifies', Money.isOk(c), c.reason);
  check('every rule is judged once', c.rows.length, table.rules.length);
  check('applies: the three by hand', c.columns.applies.map(r => r.id).sort().join(','), APPLIES.slice().sort().join(','));
  check('stop believing: the three by hand', c.columns.stop.map(r => r.id).sort().join(','), STOP.slice().sort().join(','));
  check('not yet: the six by hand', c.columns.notYet.map(r => r.id).sort().join(','), NOT_YET.slice().sort().join(','));
  check('unknown: none', c.columns.unknown.length, 0);
  check('the counts agree with the hand count', [c.counts.applies, c.counts.stop, c.counts.notYet, c.counts.unknown].join('/'), '3/3/6/0');
  check('the number is 3: the stop-believing rules not yet let go of', c.value, 3);
  check('… zone watch while any is left to drop', c.zone, 'watch');
  check('… the next to drop is the first stop rule in table order', c.next.id, 'starter-fund-first');
  checkTrue('… and it says why in steps', /step 2 is past steps 0–1/.test(c.next.why));
  checkTrue('the ratio rule says which ratio and which zone', /savingsRate is good, not out/.test(c.rows.find(r => r.id === 'cut-the-lattes').why));
  checkTrue('a step-and-ratio rule out of step range says the step decided', /this is for step 3/.test(c.rows.find(r => r.id === 'pay-off-all-debt-before-investing').why));
  check('nothing let go of yet', c.counts.dropped + '/' + c.counts.letGoEarly, '0/0');

  /* The lens: what the stop rules are about. The starter fund carries
     $1,000; the lattes and the hustle carry nothing; six months is not a
     stop rule for the demo, so it does not appear. */
  const amounts = Unlearning.amounts(c, 315000);
  check('one amount, the starter fund', amounts.length, 1);
  check('… $1,000', amounts[0].cents, 100000);
  check('… labelled with the advice', amounts[0].id, 'starter-fund-first');

  section('Unlearning — judge, one rule at a time');

  const exact = { step: 5, range: [5, 5], zones: { savingsRate: 'out', debtToIncome: 'watch' } };
  check('step below the range → not yet', Unlearning.judge({ id: 'a', advice: 'a', steps: [6, 9] }, exact).status, 'notYet');
  check('step above the range → stop', Unlearning.judge({ id: 'a', advice: 'a', steps: [0, 4] }, exact).status, 'stop');
  check('step inside the range → applies', Unlearning.judge({ id: 'a', advice: 'a', steps: [5, 5] }, exact).status, 'applies');
  check('ratio in the zone → applies', Unlearning.judge({ id: 'a', advice: 'a', ratio: { id: 'savingsRate', zones: ['out'] } }, exact).status, 'applies');
  check('ratio out of the zone → stop', Unlearning.judge({ id: 'a', advice: 'a', ratio: { id: 'debtToIncome', zones: ['out'] } }, exact).status, 'stop');
  check('ratio without a verdict → unknown', Unlearning.judge({ id: 'a', advice: 'a', ratio: { id: 'housingRatio', zones: ['good'] } }, exact).status, 'unknown');
  check('both: the step in range and the ratio in zone → applies', Unlearning.judge({ id: 'a', advice: 'a', steps: [3, 9], ratio: { id: 'savingsRate', zones: ['out'] } }, exact).status, 'applies');
  check('both: the step in range and the ratio out of zone → stop', Unlearning.judge({ id: 'a', advice: 'a', steps: [3, 9], ratio: { id: 'debtToIncome', zones: ['out'] } }, exact).status, 'stop');
  check('both: the step in range and no verdict → unknown', Unlearning.judge({ id: 'a', advice: 'a', steps: [3, 9], ratio: { id: 'housingRatio', zones: ['good'] } }, exact).status, 'unknown');
  check('both: the step below the range decides, whatever the ratio', Unlearning.judge({ id: 'a', advice: 'a', steps: [7, 9], ratio: { id: 'savingsRate', zones: ['out'] } }, exact).status, 'notYet');
  check('no placement, no zones → unknown', Unlearning.judge({ id: 'a', advice: 'a', steps: [0, 9] }, { step: null, range: null, zones: {} }).status, 'unknown');
  /* A ladder that stopped on a step it could not judge: at least step 5. */
  const atLeast = { step: null, range: [5, 9], zones: {} };
  check('at least step 5: a rule ending at 4 is past → stop', Unlearning.judge({ id: 'a', advice: 'a', steps: [0, 4] }, atLeast).status, 'stop');
  check('at least step 5: a rule from 2 to 9 holds anywhere in the range → applies', Unlearning.judge({ id: 'a', advice: 'a', steps: [2, 9] }, atLeast).status, 'applies');
  check('at least step 5: a rule for 6 to 9 might or might not → unknown', Unlearning.judge({ id: 'a', advice: 'a', steps: [6, 9] }, atLeast).status, 'unknown');
  checkTrue('… and says the range it is working from', /somewhere from step 5 to 9/.test(Unlearning.judge({ id: 'a', advice: 'a', steps: [6, 9] }, atLeast).why));
  check('dropped is read from the list', Unlearning.judge({ id: 'a', advice: 'a', steps: [0, 4] }, exact, ['a']).dropped, true);
  check('a dropped rule that still applies is let go early', Unlearning.judge({ id: 'a', advice: 'a', steps: [5, 5] }, exact, ['a']).letGoEarly, true);
  check('a dropped rule that is past is not', Unlearning.judge({ id: 'a', advice: 'a', steps: [0, 4] }, exact, ['a']).letGoEarly, false);

  section('Unlearning — edge cases');

  /* No FOO placement: an empty household. Every rule is unknown and the
     engine says so instead of counting. */
  const empty = Schema.createHousehold({});
  let threw = false, e = null;
  try { e = Unlearning.classify(empty, T, {}); } catch (err) { threw = true; }
  checkTrue('an empty household does not throw', !threw);
  check('… and comes back incomplete', e.status, 'incomplete');
  checkTrue('… with a reason that names the ladder', /ladder/.test(e.reason));
  check('… every rule unknown', e.counts.unknown, table.rules.length);
  check('… and still carries the rows for the chart', e.rows.length, table.rules.length);
  checkTrue('… standing has no step and no range', Unlearning.standing(empty, T, {}).step === null && Unlearning.standing(empty, T, {}).range === null);
  check('the null household is the same', Unlearning.classify(null, T, {}).status, 'incomplete');
  check('no table → incomplete, naming it', Unlearning.classify(demo, {}, {}).missing.join(','), 'unlearning');

  /* A rule dropped that still applies → flagged, and it does not lower the number. */
  const early = Demo.build();
  early.unlearning = Schema.createUnlearning({ dropped: ['get-the-match'] });
  const ce = Unlearning.classify(early, T, {});
  check('dropping a rule that applies leaves the number at 3', ce.value, 3);
  check('… flags it as let go early', ce.letGoEarly.map(r => r.id).join(','), 'get-the-match');
  check('… still counts it as applies', ce.columns.applies.length, 3);
  check('… one dropped', ce.counts.dropped, 1);

  /* Dropping a stop rule lowers the number by one. */
  const one = Demo.build();
  one.unlearning = Schema.createUnlearning({ dropped: ['starter-fund-first'] });
  const c1 = Unlearning.classify(one, T, {});
  check('dropping the starter fund → 2 left', c1.value, 2);
  check('… the next to drop moves on', c1.next.id, 'cut-the-lattes');
  check('… stop believing still counts 3, one of them let go', c1.counts.stop + '/' + c1.counts.stopDropped, '3/1');
  check('… zone still watch', c1.zone, 'watch');

  /* All stop rules dropped → zone good, value 0. */
  const done = Demo.build();
  done.unlearning = Schema.createUnlearning({ dropped: STOP.slice() });
  const cd = Unlearning.classify(done, T, {});
  check('all three let go → 0 left', cd.value, 0);
  check('… zone good', cd.zone, 'good');
  checkTrue('… nothing next', cd.next === null);
  check('… none let go early', cd.counts.letGoEarly, 0);

  /* The dropped list is normalised: strings only, no blanks. */
  check('droppedIds ignores junk', Unlearning.droppedIds({ unlearning: { dropped: ['a', '', null, 3, 'b'] } }).join(','), 'a,b');
  check('droppedIds on nothing is empty', Unlearning.droppedIds({}).length, 0);
  check('toggle adds once', Unlearning.toggle(['a'], 'b', true).join(','), 'a,b');
  check('toggle does not duplicate', Unlearning.toggle(['a', 'b'], 'b', true).join(','), 'a,b');
  check('toggle removes', Unlearning.toggle(['a', 'b'], 'a', false).join(','), 'b');
  check('createUnlearning keeps only string ids', Schema.createUnlearning({ dropped: ['x', 2, ''] }).dropped.join(','), 'x');

  /* The lens with a months rule in the stop column: $3,150 × 6. */
  const past = { columns: { stop: [{ id: 'm', advice: 'Six months', amountCents: null, months: 6 }, { id: 'n', advice: 'Nothing', amountCents: null, months: null }] } };
  check('a months rule prices at months × spending', Unlearning.amounts(past, 315000)[0].cents, 1890000);
  check('… and a rule about neither carries nothing', Unlearning.amounts(past, 315000).length, 1);
  check('… no spending known → the months rule carries nothing', Unlearning.amounts(past, null).length, 0);
  check('no classification → no amounts', Unlearning.amounts(null, 315000).length, 0);

  /* Retired, everything met: the ladder's top. Most rules are past. */
  const retiredStanding = { step: 9, range: [9, 9], zones: {} };
  const retiredRows = table.rules.map(r => Unlearning.judge(r, retiredStanding));
  check('at step 9 nothing is "not yet"', retiredRows.filter(r => r.status === 'notYet').length, 0);
  checkTrue('… and the starter fund, the match-only rule at 2–9 aside, the six months, and the roth-at-6 sort as expected',
    retiredRows.find(r => r.id === 'starter-fund-first').status === 'stop' && retiredRows.find(r => r.id === 'six-months-of-expenses').status === 'stop'
    && retiredRows.find(r => r.id === 'get-the-match').status === 'applies' && retiredRows.find(r => r.id === 'prepay-the-mortgage').status === 'applies');

  section('Unlearning — the household, the ownership, the page');

  check('the schema creates the branch', JSON.stringify(Schema.createHousehold({}).unlearning), '{"dropped":[]}');
  check('the ownership row is owned by this room', Ownership.field('unlearningDropped').owner, 'unlearning');
  check('… anchored at the inputs', Ownership.field('unlearningDropped').anchor, 'inputs');
  check('the registry needs a month of spending', Registry.byId('unlearning').needs.join(','), 'monthlyExpenses');
  checkTrue('the room appears for everyone', Registry.applies ? Registry.applies(Registry.byId('unlearning'), demo) : true);

  const html = fs.readFileSync(path.join(ROOT, 'rooms/unlearning.html'), 'utf8');
  ['room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list', 'room-standalone', 'load-notice'].forEach(id =>
    checkTrue('the page has #' + id, new RegExp('id="' + id + '"').test(html)));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading'].forEach(id =>
    checkTrue('the page has the section #' + id, new RegExp('id="' + id + '"').test(html)));
  checkTrue('the page mounts the template', /Room\.mount\(\{/.test(html));
  checkTrue('… as the unlearning room', /id: 'unlearning'/.test(html));
  checkTrue('… declares its live-form discipline', /LIVE-FORM: built once/.test(html));
  checkTrue('… loads its engine and the two it reads', /engines\/unlearning\.js/.test(html) && /engines\/foo\.js/.test(html) && /engines\/ratios\.js/.test(html));
  checkTrue('… writes only unlearning.dropped', (html.match(/Spine\.set\(/g) || []).length >= 1 && (html.match(/Spine\.set\('unlearning\.dropped'/g) || []).length === (html.match(/Spine\.set\(/g) || []).length);
  checkTrue('… says the select is page-local', /PAGE-LOCAL/.test(html));
  checkTrue('… reads the three chips', /reads: \['monthlyExpenses', 'cashSavings', 'grossAnnualIncome'\]/.test(html));
  checkTrue('… names the dashboard block and D-096 in the drawer', /advice_translator\.json/.test(html) && /D-096/.test(html));
  checkTrue('… says what it does not do', /scope: 'This room does not tell you what to believe/.test(html));
  checkTrue('… one chart, bars', (html.match(/Charts\.bars\(/g) || []).length === 2 && !/Charts\.(area|donut|stacked)\(/.test(html));
  checkTrue('… why covers all six situations', ['employed', 'selfEmployed', 'mixed', 'student', 'retired', 'betweenJobs'].every(s => new RegExp(s + ": '").test(html)));
};
