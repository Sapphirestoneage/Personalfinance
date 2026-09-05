/* test/rooms/history.js — History: every snapshot, and what moved. D-122. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Demo, Registry, Ownership, Spine, Instruments, TABLES } = t;
  const H = require(path.join(ROOT, 'engines/history.js'));
  section('History (D-122): since the first snapshot');

  const T = TABLES;
  Spine.reset();
  /* Nothing frozen: a reason, and the log still listed. */
  /* Snapshots are passed explicitly: the shared store already holds some
     from earlier sections, and this room's arithmetic is about the list
     it is given. */
  const none = H.review(Spine.getProfile(), [], T, {});
  checkTrue('no snapshots: freeze once to start', !Money.isOk(none) && /Freeze once/.test(none.reason));
  check('… and the log is empty', none.log.count, 0);

  /* The demo, frozen; cash moves; frozen again. */
  Spine.registerRoom('history');
  const demo = Demo.build();
  Spine.updateProfile({ people: demo.people, assets: demo.assets, debts: demo.debts, expenses: demo.expenses, state: demo.state, filingStatus: demo.filingStatus, meta: { hasDebt: false } });
  const snap1 = Instruments.snapshot(Spine.getProfile(), T);
  const one = H.review(Spine.getProfile(), [snap1], T, {});
  checkTrue('one snapshot: the change since it is zero', Money.isOk(one) && one.value === 0);
  check('… no zone with one snapshot', one.zone, null);
  const cash = Spine.getProfile().assets.filter(a => a.category === 'cash')[0];
  Spine.upsertAsset({ id: cash.id, valueCents: cash.valueCents + 250000 });
  const after = H.review(Spine.getProfile(), [snap1], T, { now: Date.now() + 86400000 * 30 });
  check('cash up $2,500: net worth up $2,500 since the first snapshot', after.value, 250000);
  check('… the cash change says so', after.cash.delta, 250000);
  check('… investments unchanged', after.investments.delta, 0);
  checkTrue('… as a share of before', Math.abs(after.netWorth.pct - 250000 / 3590000) < 1e-9);
  check('… still no zone with one snapshot, whichever way it moved', after.zone, null);
  check('… the baseline is the first', after.baseline.id, snap1.id);
  check('… the log names the last change', after.log.last.label.indexOf('Cash') !== -1 || after.log.last.label.indexOf('cash') !== -1, true);
  checkTrue('… the chart has the snapshot and today', after.points.length === 2 && after.points[1].isNow === true && after.points[0].isBaseline === true);
  checkTrue('… every instrument is listed then and now', after.instruments.length === Instruments.INSTRUMENTS.length);
  const snap2 = Instruments.snapshot(Spine.getProfile(), T);
  Spine.set('history.compareTo', snap2.id);
  const from2 = H.review(Spine.getProfile(), [snap1, snap2], T, {});
  check('comparing against the second: no change yet', from2.value, 0);
  check('… measured from it', from2.baseline.id, snap2.id);
  Spine.set('history.compareTo', 'snap_gone');
  const gone = H.review(Spine.getProfile(), [snap1, snap2], T, {});
  checkTrue('a deleted compare-to falls back to the first, and says so', gone.baseline.id === snap1.id && gone.baselineFallback === true);
  checkTrue('an empty household does not throw', (function () { try { H.review(Schema.createHousehold({}), [], T, {}); H.review(null, null, T, {}); return true; } catch (e) { return false; } })());
  check('change(): after − before and the share', JSON.stringify(H.change(100, 150)), JSON.stringify({ before: 100, after: 150, delta: 50, pct: 0.5 }));
  check('… a zero before has no share', H.change(0, 150).pct, null);
  Spine.reset();

  const page = fs.readFileSync(path.join(ROOT, 'rooms/history.html'), 'utf8');
  checkTrue('the page mounts the template as history', /Room\.mount\(\{/.test(page) && /id: 'history'/.test(page));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading', 'room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list'].forEach(id => checkTrue(`… has #${id}`, new RegExp('id="' + id + '"').test(page)));
  checkTrue('… the compare-to select is painted from the snapshots, never under focus', /sel === document\.activeElement/.test(page));
  checkTrue('… freeze goes through the instruments engine', /Instruments\.snapshot\(/.test(page));
  checkTrue('… writes only history.*', (page.match(/Spine\.set\('([a-zA-Z.]+)'/g) || []).every(m => /history\./.test(m)));
  check('compare-to is owned here', Ownership.field('historyCompareTo').owner, 'history');
  check('History is a reading, last of the rooms', Registry.byId('history').kind, 'read');
};
