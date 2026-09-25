#!/usr/bin/env node
/* ==========================================================================
   coach/test/run.js, Coach Mode's own tests. CD-001 onward.
   --------------------------------------------------------------------------
   Dependency-free, like dnd/test/run.js: node only, a fake localStorage,
   the vault's real crypto. Also run in CI beside the SPARKS suite.

     node coach/test/run.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const COACH = path.join(__dirname, '..');
const ROOT = path.join(COACH, '..');
const C = (f) => path.join(COACH, f);

let passed = 0;
const failures = [];
function check(name, actual, expected) { if (actual === expected) { passed++; return; } failures.push(name + '\n      expected: ' + JSON.stringify(expected) + '\n      actual:   ' + JSON.stringify(actual)); }
function checkTrue(name, ok, detail) { if (ok) { passed++; return; } failures.push(name + (detail ? '\n      ' + detail : '')); }
function section(t) { console.log('\n' + t); }
const pending = [];

/* A localStorage with the full Storage surface, and the coach modules fresh over it. */
function fakeStorage(seed) {
  const store = Object.assign({}, seed || {});
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] === undefined ? null : Object.keys(store)[i], get length() { return Object.keys(store).length; }, store };
}
function fresh(seed) {
  ['shared/coach.js', 'shared/fields.js'].forEach(m => { delete require.cache[require.resolve(C(m))]; });
  const s = fakeStorage(seed);
  global.localStorage = s;
  const Tables = require(C('shared/tables.js'));
  const T = Tables.loadSync();
  const Fields = require(C('shared/fields.js'));
  Fields.use(T.coachFields);
  const Coach = require(C('shared/coach.js'));
  return { s, T, Fields, Coach, Session: require(C('engines/session.js')), Q: require(C('engines/quickentry.js')), Demo: require(C('shared/demo-persona.js')),
    Schema: require(C('shared/schema.js')), Money: require(C('shared/money.js')), Csv: require(C('shared/csv.js')) };
}
function done() { delete global.localStorage; }

/* ======================================================================
   A separate app: its own copies, its own keys, nothing reached outside
   ====================================================================== */
section('A separate app (CD-001)');
{
  const V = require(C('tools/vendor.js'));
  const drift = V.FILES.filter(f => !fs.existsSync(path.join(ROOT, f)) || !fs.existsSync(C(f)) || Buffer.compare(fs.readFileSync(path.join(ROOT, f)), fs.readFileSync(C(f))) !== 0);
  checkTrue('every vendored copy is byte-identical to SPARKS (' + V.FILES.length + ' files; run node coach/tools/vendor.js)', drift.length === 0, drift.join(', '));
  checkTrue('Ratios, Goals, the spine and ownership are not carried', ['engines/ratios.js', 'engines/goals.js', 'shared/spine-v2.js', 'shared/ownership.js', 'shared/lens.js'].every(f => !fs.existsSync(C(f))));
  /* Every require of every coach module resolves inside coach/. */
  const outside = [];
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'test' && e.name !== 'tools') walk(p); } else if (/\.(js|html|css)$/.test(e.name)) {
    const t = fs.readFileSync(p, 'utf8');
    (t.match(/require\('([^']+)'\)/g) || []).forEach(r => { const rel = r.slice(9, -2); if (rel[0] === '.' && path.resolve(path.dirname(p), rel).indexOf(COACH) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
    (t.match(/(?:src|href)="([^"#?]+)"/g) || []).forEach(r => { const rel = r.replace(/^(src|href)="/, '').replace(/"$/, ''); if (!/^(https?:|mailto:)/.test(rel) && /\.(js|css|svg|html|woff2)$/.test(rel) && path.resolve(path.dirname(p), rel).indexOf(COACH) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
  } }); }
  walk(COACH);
  checkTrue('nothing in coach/ loads a file from outside coach/', outside.length === 0, outside.join('; '));
  const pages = fs.readdirSync(COACH).filter(f => f.endsWith('.html')).sort();
  check('three screens and nothing more', pages.join(), 'client.html,index.html,session.html');
  pages.forEach(p => {
    const t = fs.readFileSync(C(p), 'utf8');
    checkTrue(p + ' refuses every frame and every other origin', /frame-src 'none'/.test(t) && /default-src 'self'/.test(t));
    checkTrue(p + ' marks its inputs built once (D-034)', /LIVE-FORM: built once/.test(t));
  });
  /* No coach source reads or writes a SPARKS key. */
  const own = ['shared/coach.js', 'shared/fields.js', 'shared/tables.js', 'engines/session.js', 'engines/quickentry.js', 'home.js', 'console.js', 'clientpage.js', 'clientview.js', 'common.js'];
  const slaf = own.filter(f => /['"]slaf\.[a-z]/.test(fs.readFileSync(C(f), 'utf8')));
  checkTrue('no coach module names a SPARKS storage key', slaf.length === 0, slaf.join(', '));
  const sess = fs.readFileSync(C('session.html'), 'utf8') + fs.readFileSync(C('console.js'), 'utf8');
  checkTrue('the Session has no client picker (switching goes through Home)', !/Coach\.clients\(/.test(sess) && !/<select[^>]*client/i.test(sess));
  checkTrue('the Session embeds no room', !/<iframe/i.test(sess));
}

/* ======================================================================
   The store (CD-002)
   ====================================================================== */
section('The store: coach keys only, every call names its client (CD-002)');
{
  const SPARKS = JSON.stringify({ schemaVersion: 2, people: [], assets: [{ id: 'x', valueCents: 123400 }] });
  const { s, Coach, Demo } = fresh({ 'slaf.household.v2': SPARKS, 'slaf.prefs.v1': '{}' });
  const a = Coach.addClient({ name: 'Alex', now: '2026-09-25T10:00:00Z' });
  const b = Coach.addClient({ name: 'Bo' });
  Coach.addItem(a.id, 'asset', { label: 'A', accountType: 'hysa' });
  const aAsset = Coach.household(a.id).assets[0].id;
  Coach.setField(a.id, 'assetValue', 222200, aAsset);
  Coach.setField(b.id, 'cashSavings', 333300);
  checkTrue('a number written for one client never reaches another', JSON.stringify(Coach.household(b.id)).indexOf('222200') === -1 && JSON.stringify(Coach.household(a.id)).indexOf('333300') === -1);
  check('the SPARKS household is byte for byte what it was', s.getItem('slaf.household.v2'), SPARKS);
  checkTrue('every key written is a coach key', Object.keys(s.store).filter(k => k.indexOf('slaf.') !== 0).every(k => k.indexOf('coach.') === 0));
  Coach.snapshot(a.id, 'x');
  const before = Object.keys(s.store).filter(k => k.indexOf('coach.client.' + a.id + '.') !== 0 && k !== Coach.ROSTER).sort().map(k => k + '=' + s.store[k]).join('|');
  Coach.removeClient(a.id);
  checkTrue('deleting a client removes every key of theirs', Object.keys(s.store).every(k => k.indexOf('coach.client.' + a.id + '.') !== 0));
  check('and nothing else', Object.keys(s.store).filter(k => k !== Coach.ROSTER).sort().map(k => k + '=' + s.store[k]).join('|'), before);
  check('the roster lost exactly that client', Coach.clients().map(c => c.name).join(), 'Bo');
  Coach.updateClient(b.id, { nextSessionAt: '2026-10-01', balanceCents: 5 });
  Coach.tick(b.id, 'income', 'field:takeHomeMonthly', true, '2026-09-25T10:05:00Z');
  Coach.tick(b.id, 'income', 'field:takeHomeMonthly', true, '2026-09-26T10:05:00Z');
  check('a tick keeps its first moment', Coach.ticked(b.id, 'income', 'field:takeHomeMonthly'), '2026-09-25T10:05:00.000Z');
  checkTrue('the roster refuses a field it does not know, and holds no money', s.getItem(Coach.ROSTER).indexOf('balanceCents') === -1 && !/333300|222200/.test(s.getItem(Coach.ROSTER)));
  checkTrue('a bad client id is refused, never written as a key', (() => { try { Coach.household('../x'); return false; } catch (e) { return true; } })());
  const d = Coach.ensureDemo(Demo, '2026-09-25T12:00:00Z');
  check('the demo client says example numbers', d.name, 'Demo client (example numbers)');
  check('asking again makes no second one', Coach.ensureDemo(Demo).id, d.id);
  checkTrue('it is the example persona, marked demo, with three dated goals', Coach.household(d.id).meta.isDemo === true && Coach.household(d.id).goals.filter(g => g.targetDate).length === 3);
  Coach.archive(b.id, true);
  check('archived clients leave the live roster', Coach.clients().map(c => c.name).join(), d.name);
  done();
}

/* ======================================================================
   The entry fields (CD-003)
   ====================================================================== */
section('The entry fields land where SPARKS reads them (CD-003)');
{
  const { Coach, Fields, T, Schema, Money } = fresh({});
  const F = T.coachFields.fields;
  const missing = Object.keys(F).filter(id => !Fields.known(id));
  checkTrue('every field in data/fields.json has a place in the household', missing.length === 0, missing.join(', '));
  const c = Coach.addClient({ name: 'Casey' });
  const W = (id, v, item) => Coach.setField(c.id, id, v, item);
  W('takeHomeMonthly', 420000); W('grossAnnualIncome', 7200000); W('accommodationMonthly', 150000); W('foodMonthly', 60000);
  W('transportationMonthly', 30000); W('wantsMonthly', 50000); W('cashSavings', 900000); W('filingStatus', 'single'); W('marginalRate', 0.22);
  W('employerMatch', { matchPercent: 0.5, matchCapPercentOfSalary: 0.06 }); W('dob', '1994-04-12'); W('dependents', 2);
  const h = Coach.household(c.id);
  check('take-home reads through Schema', Schema.takeHomeMonthlyCents(h, T).value, 420000);
  check('gross reads through Schema', Schema.grossAnnualIncomeCents(h).value, 7200000);
  check('the four spending lines are the monthly total', Schema.monthlyExpensesCents(h).value, 290000);
  check('cash reads through Schema', Schema.cashCents(h).value, 900000);
  check('the marginal rate is the assumption SPARKS resolves', Schema.resolveAssumptions(h).marginalRate, 0.22);
  check('the match sits on the income source', Schema.primaryPerson(h).incomeSources[0].employerMatch.matchCapPercentOfSalary, 0.06);
  check('dependents count', h.dependents.length, 2);
  check('the age reads from the date of birth', Math.floor(Schema.primaryAge(h, '2026-09-25')), 32);
  W('foodMonthly', null);
  check('a cleared box is null, not zero', Fields.read(Coach.household(c.id), 'foodMonthly'), null);
  check('and the spending total says it is incomplete, not smaller', Schema.monthlyExpensesCents(Coach.household(c.id)).status === 'ok' ? Schema.monthlyExpensesCents(Coach.household(c.id)).value : 'incomplete', Schema.monthlyExpensesCents(Coach.household(c.id)).status === 'ok' ? 230000 : 'incomplete');
  check('an empty box parses to null', Fields.parse('foodMonthly', '  ').value, null);
  check('a zero typed is zero', Fields.parse('foodMonthly', '0').value, 0);
  check('an amount parses to cents', Fields.parse('foodMonthly', '$2,100.50').value, 210050);
  check('a rate is typed as a percent', Fields.parse('debtRate', '5.9').value, 0.059);
  check('nonsense is refused, not zero', Fields.parse('foodMonthly', 'lots').ok, false);
  const debt = Coach.addItem(c.id, 'debt', { label: 'Card', type: 'credit_card' });
  W('debtBalance', 320000, debt); W('debtRate', 0.229, debt); W('debtMinPayment', 9500, debt);
  const h2 = Coach.household(c.id);
  check('a debt line reads through Schema', Schema.totalDebtCents(h2).value + ':' + Schema.monthlyDebtPaymentsCents(h2).value, '320000:9500');
  check('adding a debt says there is debt', h2.meta.hasDebt, true);
  checkTrue('each entry is stamped: when, and rough or sure', h2.meta.fields['debtBalance:' + debt].source === 'coach' && h2.meta.fields.takeHomeMonthly.confidence === 'sure');
  Coach.setField(c.id, 'takeHomeMonthly', 420000, null, { rough: true });
  check('a rough entry counts as rough', require(C('engines/session.js')).roughCount(Coach.household(c.id)), 1);
  Coach.removeItem(c.id, 'debt', debt);
  checkTrue('removing a line removes it and its stamps', Coach.household(c.id).debts.length === 0 && !Coach.household(c.id).meta.fields['debtBalance:' + debt]);
  check('the text of a match', Fields.text('employerMatch', { matchPercent: 1, matchCapPercentOfSalary: 0.04 }), 'dollar for dollar up to 4% of pay');
  check('an unfinished match reads as not entered', Fields.read(Schema.createHousehold({ people: [Schema.createPerson({ incomeSources: [Schema.createIncomeSource({})] })] }), 'employerMatch'), null);
  done();
}

/* ======================================================================
   The path, the rail, goals: parity with SPARKS (CD-001, CD-004)
   ====================================================================== */
section('The path, and the rail equal to SPARKS (CD-004)');
{
  const { T, Session, Fields, Demo, Schema } = fresh({});
  const SP = T.sessionPaths;
  check('the default path is the spec\'s nine stops in order', SP.paths[0].stops.join(), 'life,income,spending,debt,safety,assets,taxes,goals,decisions');
  const bad = [];
  Object.keys(SP.stops).forEach(id => {
    const st = SP.stops[id];
    (st.fields || []).forEach(f => { if (/^list:/.test(f) ? !T.coachFields.lists[f.slice(5)] : !Fields.def(f)) bad.push(id + ': field ' + f); });
    (st.figures || []).forEach(f => { if (Session.READOUTS.indexOf(f) === -1 || !SP.readouts[f]) bad.push(id + ': read-out ' + f); });
    (st.doneWhen || []).forEach(t => { if (Session.TESTS.indexOf(t.test) === -1) bad.push(id + ': test ' + t.test); });
    if (!st.doneLabel || !(st.doneWhen || []).length) bad.push(id + ': done');
  });
  SP.rail.forEach(r => { if (Session.READOUTS.indexOf(r) === -1) bad.push('rail ' + r); });
  checkTrue('every field, read-out and test the path names exists', bad.length === 0, bad.join('; '));
  const stops = Session.path(SP, 'default', { stopOrder: ['debt', 'income'], skipped: { life: true } });
  check('a client\'s own order goes first', stops.slice(0, 3).map(s => s.id).join(), 'debt,income,life');
  check('a skipped stop is marked, not dropped', stops.filter(s => s.skipped).map(s => s.id).join(), 'life');
  check('items: fields, then questions', Session.items(SP.stops.debt).map(i => i.id).join(), 'field:hasDebt,list:debt,q:every,q:order');

  /* Parity: the rail against SPARKS' own Ratios, and goals against Goals,
     on every corpus household. Skipped outside the repository. */
  const ratiosPath = path.join(ROOT, 'engines/ratios.js');
  if (fs.existsSync(ratiosPath)) {
    const Ratios = require(ratiosPath);
    const Goals = require(path.join(ROOT, 'engines/goals.js'));
    const Ref = require(path.join(ROOT, 'shared/reference.js'));
    const ST = {};
    Object.keys(Ref.TABLE_FILES).forEach(k => { try { ST[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', Ref.TABLE_FILES[k]), 'utf8')); } catch (e) { /* optional */ } });
    const dir = path.join(ROOT, 'fixtures/households');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const diffs = [];
    let compared = 0;
    files.forEach(f => {
      const h = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const ctx = Ratios.context(h, ST, {});
      Session.rail(h, T).forEach(r => {
        const def = Ratios.byId(r.id); if (!def) return;
        if (r.id === 'housingRatio' && ctx.spend) return;       /* SPARKS reads a categorised month there; the coach keeps none */
        const s = def.compute(ctx);
        const want = s.status === 'ok' ? s.value : null;
        compared++;
        if (!(want === r.value || (want !== null && r.value !== null && Math.abs(want - r.value) < 1e-9))) diffs.push(f + ' ' + r.id + ': SPARKS ' + want + ', coach ' + r.value);
        const zone = want === null ? 'none' : Ratios.verdict(r.id, want, ST.ratioBenchmarks).zone;
        if (zone !== r.zone) diffs.push(f + ' ' + r.id + ' zone: SPARKS ' + zone + ', coach ' + r.zone);
      });
    });
    checkTrue('the rail equals SPARKS Ratios on every corpus household (' + compared + ' ratios)', diffs.length === 0 && compared > 50, diffs.slice(0, 5).join('; '));
    const h = Demo.build();
    const gd = [];
    [['2028-06-01', 2500000, 300000], ['2031-09-01', 6000000, 500000], ['2030-01-01', 1800000, 0]].forEach(x => {
      const g = Schema.createGoal({ name: 'x', targetDate: x[0], lumpTargetCents: x[1], savedCents: x[2] });
      h.goals = [g];
      const want = Goals.plan(h, g, ST, { asOf: '2026-09-25' }).value;
      const got = Session.goals(h, T, { asOf: '2026-09-25' })[0].monthlyCents;
      if (want !== got) gd.push(x[0] + ': SPARKS ' + want + ', coach ' + got);
    });
    checkTrue('each goal\'s monthly figure equals SPARKS Goals', gd.length === 0, gd.join('; '));
  } else console.log('  (parity skipped: SPARKS engines not beside coach/)');
}

/* ======================================================================
   Quick entry (CD-005): the owner's four, then seeded random properties
   ====================================================================== */
section('Quick entry: shorthand into entries, never a guessed number (CD-005)');
{
  const { T, Q } = fresh({});
  const QE = T.quickEntry;
  const car = Q.parse('car 450/mo 5.9% 38 left', QE, {});
  check('car: a new car loan', car.add && car.add.fields.type, 'auto');
  check('car: payment and rate, no balance', car.writes.map(w => w.field + '=' + w.value).join(), 'debtMinPayment=45000,debtRate=0.059');
  check('car: payments left kept as a note', car.note, 'Car loan: 38 payments left');
  check('rent 2100', Q.parse('rent 2100', QE, {}).writes.map(w => w.field + '=' + w.value).join(), 'accommodationMonthly=210000');
  const k = Q.parse('401k 38k match 4%', QE, {});
  check('401k: value and match, dollar for dollar up to 4%', k.writes.map(w => w.field + '=' + JSON.stringify(w.value)).join(), 'assetValue=3800000,employerMatch={"matchPercent":1,"matchCapPercentOfSalary":0.04},assetAccountType="401k"');
  check('hysa 12.5k', Q.parse('hysa 12.5k', QE, {}).writes[0].value, 1250000);
  check('a line naming nothing is a note', Q.parse('lunch with mom', QE, {}).kind, 'note');
  check('two amounts for one row is a note', Q.parse('rent 2100 1900', QE, {}).kind, 'note');
  check('a known word with no number is a note, never zero', Q.parse('rent', QE, {}).kind, 'note');
  check('one of a kind on file is updated, not duplicated', Q.parse('card 3000', QE, { debts: [{ id: 'd1', type: 'credit_card' }] }).writes[0].item, 'd1');
  /* Properties, seeded: typed cents read back exactly; a debt line writes
     only what it said. */
  let seed = 20260925; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const typed = (c) => { const d = Math.floor(c / 100), r = c % 100; return r ? d + '.' + String(r).padStart(2, '0') : String(d); };
  let exact = 0, honest = 0;
  for (let i = 0; i < 400; i++) {
    const cents = rnd(99999999);
    if (Q.amountCents(typed(cents), null) === cents) exact++;
    const o = { bal: rnd(2) ? rnd(9999999) : null, pay: rnd(2) ? rnd(500000) : null, rate: rnd(2) ? rnd(3500) : null, left: rnd(2) ? 1 + rnd(360) : null };
    const parts = ['card']; if (o.bal !== null) parts.push(typed(o.bal)); if (o.pay !== null) parts.push(typed(o.pay) + '/mo'); if (o.rate !== null) parts.push((o.rate / 100) + '%'); if (o.left !== null) parts.push(o.left + ' left');
    const p = Q.parse(parts.join(' '), QE, {});
    const by = {}; p.writes.forEach(w => { by[w.field] = w.value; });
    const ok = (o.bal === null && o.pay === null && o.rate === null) ? p.kind === 'note'
      : (o.bal === null ? !('debtBalance' in by) : by.debtBalance === o.bal) && (o.pay === null ? !('debtMinPayment' in by) : by.debtMinPayment === o.pay)
        && (o.rate === null ? !('debtRate' in by) : Math.abs(by.debtRate - o.rate / 10000) < 1e-12) && (o.left === null || (p.note || '').indexOf(o.left + ' payments left') !== -1);
    if (ok) honest++;
  }
  check('400 random amounts read back to the exact cents', exact, 400);
  check('400 random debt lines write only what they said', honest, 400);
}

/* ======================================================================
   A session start to end, the recap, Client View (CD-006, CD-007)
   ====================================================================== */
section('A session, the recap, Client View: no coach note ever shows (CD-006, CD-007)');
{
  const { s, T, Coach, Session, Q, Demo, Fields } = fresh({});
  const ClientView = require(C('clientview.js'));
  const d = Coach.ensureDemo(Demo);
  const sess = Coach.startSession(d.id, '2026-09-25T15:00:00Z');
  checkTrue('start freezes the household in a labelled snapshot', Coach.snapshots(d.id).some(x => x.id === sess.startSnapshotId && x.reason === 'coach-session-start' && x.household));
  check('starting twice keeps the one open session', Coach.startSession(d.id).id, sess.id);
  const quick = Coach.applyQuick(d.id, Q.parse('car 450/mo 5.9% 38 left', T.quickEntry, Coach.household(d.id)), { stopId: 'debt', sessionId: sess.id });
  check('quick entry writes the car loan', Coach.household(d.id).debts.filter(x => x.label === 'Car loan').map(x => x.minPaymentCents + '@' + x.rate).join(), '45000@0.059');
  check('and keeps the rest as a private stop note', quick.note.kind + ':' + quick.note.stopId + ':' + quick.note.source, 'coach:debt:quick');
  const unread = Coach.applyQuick(d.id, Q.parse('client mentions a bonus maybe', T.quickEntry, Coach.household(d.id)), { stopId: 'income' });
  check('a line quick entry cannot read writes no number', unread.written, 0);
  Coach.addNote(d.id, { kind: 'coach', text: 'PRIVATE-7731 worried about job', stopId: 'income', sessionId: sess.id });
  Coach.addNote(d.id, { kind: 'shared', text: 'SHARED keep three months of cash', stopId: 'safety', sessionId: sess.id });
  Coach.addHomework(d.id, { text: 'Find the 401k fee ratio', dueOn: '2026-10-08', sessionId: sess.id });
  Coach.addComment(d.id, { target: { kind: 'row', id: 'accommodationMonthly' }, by: 'client', text: 'COMMENT rent to 2,300 in March' });
  Coach.tick(d.id, 'debt', 'q:every', true);
  const ended = Coach.endSession(d.id, sess.id, { stopsCovered: ['debt'], ticked: [{ stopId: 'debt', itemId: 'q:every' }], now: '2026-09-25T16:05:00Z' });
  checkTrue('end snapshots again, and closes with its length', !!ended.endSnapshotId && ended.durationMs === 65 * 60000 && Coach.openSession(d.id) === null);
  const before = Coach.snapshotHousehold(d.id, ended.startSnapshotId), after = Coach.snapshotHousehold(d.id, ended.endSnapshotId);
  check('the start snapshot is the plan as it was', before.debts.some(x => x.label === 'Car loan'), false);
  const r = Coach.record(d.id);
  const stops = Session.path(T.sessionPaths, 'default', {});
  const recap = Session.recap(before, after, T, { stops, stopsCovered: ended.stopsCovered, ticked: ended.ticked, notes: r.notes, homework: r.homework, sessionId: sess.id, readings: Fields.readings });
  checkTrue('the recap: covered, the new debt, ratios, the FI date, shared notes, homework',
    /Debt \(1 item done\)/.test(recap.text) && /Added Car loan: rate 5\.9%, payment \$450/.test(recap.text) && /Debt-to-income: \d+% to \d+%/.test(recap.text)
    && /The FI date/.test(recap.text) && /SHARED keep three months/.test(recap.text) && /401k fee ratio \(by 2026-10-08\)/.test(recap.text), recap.text);
  checkTrue('no coach note reaches the recap: typed, quick or unread', ['PRIVATE-7731', '38 payments left', 'bonus maybe', 'COMMENT'].every(t => recap.text.indexOf(t) === -1));
  Coach.saveRecap(d.id, sess.id, recap.text + '\nEdited by the coach.');
  const rf = Coach.recapFile(d.id, Coach.record(d.id).sessions[0].recapText);
  checkTrue('a recap file is the text and the name, never the household', rf.kind === 'recap' && /Edited/.test(rf.text) && !rf.data && JSON.stringify(rf).indexOf('PRIVATE') === -1);
  /* Client View gets the whole record, and still shows only what it may. */
  const html = ClientView.render(Coach.household(d.id), T, { record: Coach.record(d.id), readings: Fields.readings, name: d.name, asOf: '2026-09-25', since: before, sinceDate: sess.startedAt, nextSessionAt: '2026-10-08', mapWidth: 360 });
  checkTrue('Client View renders no coach note and no comment', ['PRIVATE-7731', '38 payments left', 'bonus maybe', 'COMMENT'].every(t => html.indexOf(t) === -1));
  checkTrue('it shows the shared note, the homework and the shown decision', /SHARED keep/.test(html) && /401k fee ratio/.test(html) && /Buy a car next year/.test(html));
  checkTrue('the four sections, in order', ['cv-map', 'cv-goals', 'cv-changed', 'cv-homework'].every((id, i, a) => html.indexOf('id="' + id + '"') !== -1 && (i === 0 || html.indexOf('id="' + a[i - 1] + '"') < html.indexOf('id="' + id + '"'))));
  checkTrue('the one door into the record keeps only shared notes, homework, check-ins', Object.keys(ClientView.visible(Coach.record(d.id))).sort().join() === 'checkins,homework,shared');
  Coach.setDecision(d.id, Coach.record(d.id).decisions[0].id, { showClient: false });
  checkTrue('a decision not marked "show client" is not drawn', ClientView.render(Coach.household(d.id), T, { record: Coach.record(d.id), asOf: '2026-09-25', mapWidth: 900 }).indexOf('Buy a car next year') === -1);
  const g = Session.goals(Coach.household(d.id), T, { asOf: '2026-09-25' });
  checkTrue('each demo goal has an amount, a monthly figure and a status', g.length === 3 && g.every(x => x.totalCents !== null && x.monthlyCents !== null && ['on-track', 'short', 'decide'].indexOf(x.status) !== -1));
  const client = fs.readFileSync(C('clientpage.js'), 'utf8');
  checkTrue('Client View reads no roster list', !/Coach\.clients\(|Coach\.roster\(/.test(client));
  checkTrue('in presenter mode it links nowhere', /presenter \? '<span>Client view<\/span>'/.test(client));
  checkTrue('no SPARKS key was written through all of it', Object.keys(s.store).every(k => k.indexOf('coach.') === 0));
  done();
}

/* ======================================================================
   Check-ins, comments, the sheet import (CD-006, CD-008)
   ====================================================================== */
section('Check-ins, comments, a sheet in (CD-006, CD-008)');
{
  const { T, Coach, Session, Q, Demo, Csv } = fresh({});
  const d = Coach.ensureDemo(Demo);
  const debt = Coach.household(d.id).debts[0], acct = Coach.household(d.id).assets[0];
  Coach.addHomework(d.id, { text: 'Log in and find the fee' });
  const hw = Coach.record(d.id).homework[0];
  const ci = Coach.addCheckin(d.id, { date: '2026-10-01', balances: { ['debtBalance:' + debt.id]: 123400, ['assetValue:' + acct.id]: 800000 }, feeling: 4, text: 'Better', homeworkTicked: [hw.id], enteredBy: 'client' });
  check('the owning debt line moved', Coach.household(d.id).debts[0].balanceCents, 123400);
  check('and the account', Coach.household(d.id).assets[0].valueCents, 800000);
  checkTrue('the check-in keeps what was reported', ci.balances['debtBalance:' + debt.id] === 123400 && ci.feeling === 4 && ci.enteredBy === 'client' && ci.incomeCents === null);
  checkTrue('homework ticked in it is done', !!Coach.record(d.id).homework[0].doneAt);
  const ci2 = Coach.addCheckin(d.id, { date: '2026-10-02', balances: {}, text: 'no numbers' });
  check('an empty balance is not reported, nothing is written as zero', Object.keys(ci2.balances).length + ':' + Coach.household(d.id).debts[0].balanceCents, '0:123400');
  const cm = Coach.addComment(d.id, { target: { kind: 'goal', id: Coach.household(d.id).goals[0].id }, by: 'client', text: 'Maybe smaller' });
  checkTrue('a comment logged for the client says so', cm.by === 'client' && cm.loggedByCoach === true && cm.resolvedAt === null);
  Coach.resolveComment(d.id, cm.id, true);
  checkTrue('and can be resolved', !!Coach.record(d.id).comments[0].resolvedAt);
  check('check-in in within a month', Session.checkinStatus(Coach.record(d.id).checkins, Date.parse('2026-10-20')), 'in');
  check('late after five weeks', Session.checkinStatus(Coach.record(d.id).checkins, Date.parse('2026-11-20')), 'late');
  check('missing after two months, or never', Session.checkinStatus([], Date.parse('2026-11-20')), 'missing');

  const c = Coach.addClient({ name: 'Sheet Client' });
  const csv = 'Month,Rent,Food,Car loan,HYSA,Mood,Marginal\nAug,"$2,000",550,,9000,ok,22%\nSep,"$2,100",600,12000,12500,good,22%\n';
  const cols = Coach.suggest(['Month', 'Rent', 'Food', 'Car loan', 'HYSA', 'Mood', 'Marginal'], T);
  check('the first guess maps Rent', cols.Rent, 'qe:rent');
  check('and a debt column to its quick-entry word', cols['Car loan'], 'qe:car loan');
  check('and leaves a column it does not know unmapped', cols.Mood, null);
  cols.Marginal = 'field:marginalRate'; cols.Food = 'field:foodMonthly';
  const plan = Coach.sheetPlan(csv, cols, T, Csv, Q);
  check('the last filled line of each column is read', plan.writes.filter(w => w.header === 'Food')[0].value, 60000);
  checkTrue('unmapped columns become notes, never numbers', plan.notes.some(n => /Mood: good/.test(n)) && plan.notes.some(n => /Month: Sep/.test(n)));
  Coach.applySheet(c.id, plan, T, Q);
  const ch = Coach.household(c.id);
  check('rent reached the housing line', ch.expenses.needs.accommodation.monthlyCents, 210000);
  check('the marginal rate is read as 22%', Coach.household(c.id).assumptionOverrides.marginalRate, 0.22);
  check('the car loan was added with its balance', ch.debts.map(x => x.label + ':' + x.balanceCents).join(), 'Car loan:1200000');
  check('the HYSA was added as an account', ch.assets.filter(a => a.accountType === 'hysa').map(a => a.valueCents).join(), '1250000');
  checkTrue('the notes are private coach notes', Coach.record(c.id).notes.length === 2 && Coach.record(c.id).notes.every(n => n.kind === 'coach' && n.source === 'import'));
  check('imported entries are marked rough', Session.roughCount(ch) >= 4, true);
  Coach.saveTemplate('My sheet', cols);
  check('a mapping is kept by name in the roster', Coach.templates()['My sheet'].columns.Rent, 'qe:rent');
  done();
}

/* ======================================================================
   Files: sealed, restored, never readable (CD-002)
   ====================================================================== */
pending.push(async function () {
  section('Files: one client or all, sealed, restored into a fresh browser (CD-002)');
  const a = fresh({});
  const c = a.Coach.addClient({ name: 'Eden' });
  a.Coach.setField(c.id, 'cashSavings', 555500);
  a.Coach.startSession(c.id);
  a.Coach.tick(c.id, 'income', 'q:paystub', true);
  const stored = a.s.getItem('coach.client.' + c.id + '.v1');
  const sealed = await a.Coach.seal(a.Coach.clientFile(c.id), 'correct horse battery');
  const other = a.Coach.addClient({ name: 'Fox' });
  const all = await a.Coach.seal(a.Coach.allFile(), 'correct horse battery');
  checkTrue('a sealed file never shows a number in the clear', sealed.indexOf('555500') === -1 && all.indexOf('555500') === -1);
  checkTrue('the sealed envelope carries the coach signature', JSON.parse(sealed).slafCoachExport === 1);
  done();
  const b = fresh({ 'slaf.household.v2': '{"schemaVersion":2}' });
  const opened = await b.Coach.openFile(sealed, 'correct horse battery');
  const res = b.Coach.restore(opened);
  checkTrue('one client restores into a fresh browser', res.length === 1 && res[0].ok);
  check('its data byte for byte', b.s.getItem('coach.client.' + c.id + '.v1'), stored);
  check('its snapshots', b.Coach.snapshots(c.id).length, 1);
  check('its ticks', !!b.Coach.ticked(c.id, 'income', 'q:paystub'), true);
  check('and the SPARKS household beside it untouched', b.s.getItem('slaf.household.v2'), '{"schemaVersion":2}');
  check('a second restore is refused without replace', b.Coach.restore(opened)[0].ok, false);
  check('and allowed with it', b.Coach.restore(opened, { replace: true })[0].ok, true);
  let wrong = null;
  try { await b.Coach.openFile(sealed, 'not the passphrase'); } catch (e) { wrong = e.message; }
  checkTrue('a wrong passphrase is a refusal, never garbage', /does not open/.test(wrong || ''));
  done();
  const g = fresh({});
  const res2 = g.Coach.restore(await g.Coach.openFile(all, 'correct horse battery'));
  check('"back up all clients" restores every client', res2.filter(x => x.ok).length, 2);
  check('names and all', g.Coach.clients().map(x => x.name).sort().join(), 'Eden,Fox');
  check('Fox has an empty household, not a copy of Eden\'s', JSON.stringify(g.Coach.household(other.id)).indexOf('555500'), -1);
  done();
});

/* ======================================================================
   No real data in the repository; no em dash in what ships
   ====================================================================== */
section('No real data in the repository, no em dash in coach/');
{
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  checkTrue('.gitignore refuses coach backups and recaps', /money-rooms-coach-\*/.test(ignore) && /money-rooms-recap-\*/.test(ignore));
  let tracked = [];
  try { tracked = require('child_process').execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean); } catch (e) { tracked = []; }
  const SIG = new RegExp('"' + 'slafCoach' + 'Export"\\s*:');       /* built from parts, so this file is no match */
  const carrying = tracked.filter(f => !/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|pdf|zip|xlsx)$/i.test(f) && (() => { try { return SIG.test(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return false; } })());
  checkTrue('no tracked file carries a coach export (' + tracked.length + ' files read)', tracked.length > 0 && carrying.length === 0, carrying.join(', '));
  checkTrue('no tracked file is named like a coach export', tracked.every(f => !/money-rooms-(coach|recap)-/.test(f)));
  const EM = [String.fromCharCode(0x2014), '\\u2014', '&mdash;', '&#8212;'];
  const dirty = [];
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(html|js|css|json)$/.test(e.name) && p !== __filename) { const t = fs.readFileSync(p, 'utf8'); if (EM.some(x => t.indexOf(x) !== -1)) dirty.push(path.relative(COACH, p)); } }); }
  walk(COACH);
  checkTrue('no em dash anywhere in coach/', dirty.length === 0, dirty.join(', '));
}

/* ---- Report --------------------------------------------------------------- */
pending.reduce((chain, fn) => chain.then(fn), Promise.resolve())
  .catch(e => { failures.push('async checks threw: ' + (e && e.stack || e)); })
  .then(function () {
    console.log('\n' + '-'.repeat(66));
    if (!failures.length) { console.log('ok ' + passed + ' coach checks passed'); process.exit(0); }
    console.log('FAIL ' + failures.length + ' failed, ' + passed + ' passed\n');
    failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
    process.exit(1);
  });
