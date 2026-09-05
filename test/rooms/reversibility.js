/* test/rooms/reversibility.js — Reversibility: what a decision costs to undo. D-118. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Demo, Registry, Ownership, TABLES } = t;
  const R = require(path.join(ROOT, 'engines/reversibility.js'));
  section('Reversibility (D-118): what undoing costs, by decision');

  const T = TABLES;
  const demo = Demo.build();

  /* The table. */
  const list = R.list(T);
  checkTrue('the table lists decisions', list.length >= 4);
  checkTrue('every decision has an id, a label, a why and a reversible flag', list.every(d => d.id && d.label && d.why && d.reversible !== undefined));
  checkTrue('ids are unique', new Set(list.map(d => d.id)).size === list.length);

  /* The house, by hand: 8% of the price plus a local move. */
  const house = R.undo(demo, 'buy-a-house', { price: 30000000 }, T);
  checkTrue('the house prices', Money.isOk(house), house.reason);
  check('8% of $300,000 plus a $2,000 local move', house.value, 30000000 * 0.08 + 200000);
  check('… four months to undo, from the table', house.months, 4);
  check('… partly reversible', house.reversible, 'partly');
  check('… against $3,150 a month: 8.3 months of spending → a one-way street', house.verdict, 'a one-way street');
  check('… zone out', house.zone, 'out');
  const cheap = R.undo(demo, 'buy-a-house', { price: 1000000 }, T);
  check('a $10,000 place: $2,800 to undo', cheap.value, 280000);
  check('… under a month of spending, but four months to undo: a heavy door', cheap.verdict, 'a heavy door');

  /* The verdict's rules, directly. */
  check('a door: small and quick', R.verdict(100000, 1, 315000, true), 'a door');
  check('a heavy door: small but slow', R.verdict(100000, 3, 315000, true), 'a heavy door');
  check('a one-way street: over six months of spending', R.verdict(2000000, 1, 315000, true), 'a one-way street');
  check('… or over a year to undo', R.verdict(100000, 13, 315000, true), 'a one-way street');
  check('… or marked irreversible whatever it costs', R.verdict(100, 0, 315000, false), 'a one-way street');
  check('no spending: no verdict', R.verdict(100000, 1, null, true), null);

  /* Every decision evaluates on the demo with defaults, without throwing. */
  list.forEach(function (d) {
    let r = null, threw = false;
    try { r = R.undo(demo, d.id, {}, T); } catch (e) { threw = true; }
    checkTrue(`${d.id} evaluates without throwing`, !threw && r !== null && typeof r.status === 'string');
    if (r && d.undoCents === null) checkTrue(`${d.id} has no honest figure and says so`, r.value === null && r.unpriced === true && r.verdict === 'a one-way street');
  });

  /* Edge cases. */
  checkTrue('no decision → pick one', !Money.isOk(R.undo(demo, null, {}, T)) && /Pick a decision/.test(R.undo(demo, null, {}, T).reason));
  checkTrue('an unknown decision says so', /No decision/.test(R.undo(demo, 'nope', {}, T).reason));
  checkTrue('a missing answer with no default asks for it', /price/i.test(R.undo(demo, 'buy-a-house', {}, T).reason));
  checkTrue('an empty household does not throw', (function () { try { R.undo(Schema.createHousehold({}), 'buy-a-house', { price: 30000000 }, T); return true; } catch (e) { return false; } })());
  checkTrue('… and with no spending there is no verdict, with a reason', R.undo(Schema.createHousehold({}), 'buy-a-house', { price: 30000000 }, T).verdict === null);
  checkTrue('slots sort questions by the box they need', (function () { const s = R.slots(R.byId(T, 'move-cities')); return s.choice.length === 1 && s.choice[0].id === 'distance'; })());

  /* The page and the map. */
  const page = fs.readFileSync(path.join(ROOT, 'rooms/reversibility.html'), 'utf8');
  checkTrue('the page mounts the template as reversibility', /Room\.mount\(\{/.test(page) && /id: 'reversibility'/.test(page));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading', 'room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list'].forEach(id => checkTrue(`… has #${id}`, new RegExp('id="' + id + '"').test(page)));
  checkTrue('… writes only reversibility.*', (page.match(/Spine\.set\('([a-zA-Z.]+)'/g) || []).every(m => /reversibility\./.test(m)));
  checkTrue('… declares its live-form discipline', /LIVE-FORM: built once/.test(page));
  check('the decision is owned here', Ownership.field('reversibilityDecision').owner, 'reversibility');
  checkTrue('the room is for everyone', Registry.requires('reversibility').length === 0);
};
