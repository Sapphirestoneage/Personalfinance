/* test/rooms/exercises.js — the exercise library: five kinds, one shape; a run computes
   on the household through the owning engine and stays locked, naming the field, until
   it can; completing one boosts its skill to Open, never to Done. D-131. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Demo, TABLES } = t;
  const E = require(path.join(ROOT, 'engines/exercises.js'));
  const ST = require(path.join(ROOT, 'engines/skilltree.js'));
  section('The exercise library (D-131): five kinds, the runs computed, never a silent number');

  const T = TABLES;
  check('the five kinds', E.KINDS.join(','), 'micro,quest,dare,canon,run');
  checkTrue('every exercise carries the one shape', E.all(T).every(e => e.id && E.KINDS.indexOf(e.kind) >= 0 && e.title && Money.isEntered(e.minutes) && Money.isEntered(e.cost) && Array.isArray(e.advances) && e.advances.length && e.room && Array.isArray(e.requires) && e.band && 'proof' in e && 'origin' in e && 'writes' in e));
  checkTrue('a canon exercise credits a work and an author and reproduces no text: origin is attribution only', E.all(T).filter(e => e.kind === 'canon').every(e => e.origin.work && e.origin.author && (e.origin.note || '').length < 80));
  checkTrue('a run names what it computes and where the result goes', E.all(T).filter(e => e.kind === 'run').every(e => e.compute && e.writes === 'exercises.results'));

  /* A bare household: every run is locked and names its field. */
  const bare = Schema.createHousehold({ people: [Schema.createPerson({ id: 'P', role: 'adult', employmentStatus: 'employed' })] });
  const rb = E.compute(bare, T, 'run-fire-number');
  check('a run with an unmet requirement stays locked and names the field', rb.status + '/' + rb.missing.join(','), 'incomplete/monthlyExpenses');
  checkTrue('… the reason says what and where', /Needs: Monthly expenses\./.test(rb.reason));
  const lb = E.list(bare, T, { maxMinutes: null });
  checkTrue('the list marks it locked with a link to the owner room', lb.rows.filter(r => r.id === 'run-fire-number')[0].locked && /cash-flow\.html/.test(lb.rows.filter(r => r.id === 'run-fire-number')[0].reasons[0].href));
  checkTrue('a micro or canon exercise is never locked', lb.rows.filter(r => r.kind !== 'run').every(r => !r.locked));

  /* The demo persona: the runs compute through the owning engines. */
  const demo = Demo.build();
  const Fire = require(path.join(ROOT, 'engines/fire.js'));
  const fire = E.compute(demo, T, 'run-fire-number');
  check('the FIRE number run is the fire engine’s own figure', fire.value, Fire.calculateFIRE(demo, T, {}).value);
  checkTrue('… with a one-line summary and figures to store', /is the number/.test(fire.summary) && fire.figures.fireNumberCents === fire.value);
  const grid = E.compute(demo, T, 'run-sensitivity');
  check('the sensitivity grid is 4 × 5', grid.figures.cells.length + 'x' + grid.figures.cells[0].length, '4x5');
  checkTrue('… and its centre is the base number', grid.figures.cells[2][2] === fire.value);
  checkTrue('… rising with the withdrawal rate falling and the month rising', grid.figures.cells[0][0] > grid.figures.cells[3][0] && grid.figures.cells[0][4] > grid.figures.cells[0][0]);
  const miles = E.compute(demo, T, 'run-milestones');
  check('the milestones run gives the years to 25, 50, 75 and 100%', miles.figures.milestones.map(m => m.share).join(','), '0.25,0.5,0.75,1');
  checkTrue('… in rising order', miles.figures.milestones.every((m, i, a) => i === 0 || m.reached || a[i - 1].reached || m.years >= a[i - 1].years));
  const sr = E.compute(demo, T, 'run-savings-rate');
  checkTrue('the savings-rate run gives both ways', Money.isOk(sr) && Money.isEntered(sr.figures.residual) && Money.isEntered(sr.figures.withMatch));
  checkTrue('the bridge and the worst year come from the statement engine', Money.isOk(E.compute(demo, T, 'run-bridge')) && Money.isOk(E.compute(demo, T, 'run-worst-year')));
  check('coast, lean, fat are variants of one formula', ['run-coast', 'run-lean', 'run-fat'].map(id => E.compute(demo, T, id).status).join(','), 'ok,ok,ok');
  check('barista asks for the part-time income rather than inventing one', E.compute(demo, T, 'run-barista').status, 'incomplete');
  check('a micro is not a run', E.compute(demo, T, 'mx-enter-the-facts').status, 'incomplete');
  check('a run with no calculation bound says so', E.compute(demo, T, 'run-triple-d').status, 'incomplete');

  /* The list: what applies, sorted by the band you are in, capped at fifteen minutes. */
  const ld = E.list(demo, T);
  checkTrue('the default list is fifteen minutes or under', ld.rows.every(r => r.minutes <= 15));
  checkTrue('… sorted by distance from the band you are in', ld.rows.every((r, i, a) => i === 0 || r.distance >= a[i - 1].distance));
  checkTrue('… and never shows an exercise for a fogged or not-yours skill', ld.rows.every(r => !r.fogged && !r.notYours));
  const retiredOnly = E.list(demo, T, { maxMinutes: null }).rows.some(r => r.id === 'run-withdrawal');
  check('a retiree-only run is not listed for the demo (employed)', retiredOnly, false);
  check('the kind filter works', E.list(demo, T, { kind: 'canon', maxMinutes: null }).rows.every(r => r.kind === 'canon'), true);

  /* Completing one boosts its skill to open, never to done. */
  const h = Schema.createHousehold({ filingStatus: 'single', state: 'NC',
    people: [Schema.createPerson({ id: 'P', role: 'adult', employmentStatus: 'employed', incomeSources: [Schema.createIncomeSource({ id: 'i', personId: 'P', grossAnnualIncomeCents: 7200000 })] })],
    assets: [Schema.createAsset({ id: 'a', category: 'cash', valueCents: 400000 })], expenses: { monthlyEssential: { estimatedValueCents: 250000 } } });
  check('before: the ladder skill is locked', ST.evaluate(h, T).byId['close-a-month'].state, 'locked');
  h.exercises = { done: { 'mx-close-a-month': '2026-09-04' }, results: {} };
  const after = ST.evaluate(h, T).byId['close-a-month'];
  check('after its micro: open by boost, not done', after.state + '/' + after.provenance, 'open/boost');
  checkTrue('… the boost bar counts the exercise', after.boost.met.indexOf('exercise:mx-close-a-month') >= 0);
  checkTrue('the list shows it done', E.list(h, T).rows.filter(r => r.id === 'mx-close-a-month')[0].done === '2026-09-04');
};
