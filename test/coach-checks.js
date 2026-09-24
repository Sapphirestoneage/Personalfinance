/* ==========================================================================
   test/coach-checks.js, Coach Mode's checks, run from test/run.js. D-338+.
   --------------------------------------------------------------------------
   Kept beside run.js rather than inside it so the coach build reads as one
   place. run(h) takes the harness ({ check, checkTrue, section, ROOT }) and
   returns a promise for the checks that need the vault's real crypto; the
   report in run.js waits for it.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function run(h) {
  const { check, checkTrue, section, ROOT } = h;
  const P = (f) => path.join(ROOT, f);
  const pending = [];

  /* A localStorage with the full Storage surface, and a clean module graph
     over it: the profile layer, the spine, scenarios, the roster. */
  function fakeStorage(seed) {
    const store = Object.assign({}, seed || {});
    return {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i] === undefined ? null : Object.keys(store)[i],
      get length() { return Object.keys(store).length; },
      store
    };
  }
  const MODS = ['shared/profiles.js', 'shared/spine-v2.js', 'shared/scenarios.js', 'shared/coach.js', 'shared/backup.js'];
  function drop() { MODS.forEach(m => { delete require.cache[require.resolve(P(m))]; }); }
  function fresh(seed) {
    drop();
    const s = fakeStorage(seed);
    global.localStorage = s;
    const Schema = require(P('shared/schema.js'));
    global.SLAF = { Schema };
    const Profiles = require(P('shared/profiles.js'));
    const Spine = require(P('shared/spine-v2.js'));
    global.SLAF.Spine = Spine;
    const Scenarios = require(P('shared/scenarios.js'));
    const Coach = require(P('shared/coach.js'));
    return { s, Profiles, Spine, Scenarios, Coach, Schema };
  }
  function done() { drop(); delete global.localStorage; delete global.SLAF; }
  function coachOn(s) { s.setItem('slaf.prefs.v1', JSON.stringify({ coachMode: true })); }

  /* ======================================================================
     Phase A: profiles (D-339)
     ====================================================================== */
  section('Coach Mode A: profiles, many households in one browser (D-339)');

  {
    const { Profiles } = fresh({});
    check('the default profile is today\'s exact key', Profiles.key('slaf.household.v2', 'default'), 'slaf.household.v2');
    check('a client profile prefixes the same key', Profiles.key('slaf.household.v2', 'c_1'), 'slaf.p.c_1.household.v2');
    check('snapshots move with the profile', Profiles.key('slaf.snapshots.v1', 'c_1'), 'slaf.p.c_1.snapshots.v1');
    check('preferences are the device\'s, never scoped', Profiles.key('slaf.prefs.v1', 'c_1'), 'slaf.prefs.v1');
    check('the roster is never scoped', Profiles.key('slaf.coach.v1', 'c_1'), 'slaf.coach.v1');
    checkTrue('a bad id is refused, never written as a key', (() => { try { Profiles.key('slaf.household.v2', '../x'); return false; } catch (e) { return true; } })());
    done();
  }

  /* With Coach Mode off, a remembered profile counts for nothing. */
  {
    const { s, Profiles, Spine } = fresh({});
    Profiles.use('c_1');
    check('coach mode off: the active profile is the default, whatever the tab remembers', Profiles.active(), 'default');
    Spine.upsertPerson({ label: 'Me' });
    checkTrue('coach mode off: the household is written to today\'s key', !!s.getItem('slaf.household.v2') && !s.getItem('slaf.p.c_1.household.v2'));
    done();
  }

  /* The default profile round-trips unchanged: the exact stored bytes of a
     personal household are the same after a trip through a client. */
  {
    const { s, Profiles, Spine } = fresh({});
    coachOn(s);
    Spine.upsertPerson({ label: 'Me' });
    Spine.upsertAsset({ label: 'Savings', type: 'cash', balanceCents: 123400 });
    const before = s.getItem('slaf.household.v2');
    const beforeSnaps = s.getItem('slaf.snapshots.v1');
    Spine.useProfile('c_alpha');
    check('a fresh client profile starts empty', Spine.getProfile().assets.length, 0);
    Spine.upsertAsset({ label: 'Client cash', type: 'cash', balanceCents: 999900 });
    Spine.appendSnapshot({ reason: 'coach-session-start' });
    Spine.useProfile('default');
    check('back home, the personal household is byte for byte what it was', s.getItem('slaf.household.v2'), before);
    check('and its snapshots too', s.getItem('slaf.snapshots.v1'), beforeSnaps);
    check('the personal household reads its own number', Spine.getProfile().assets[0].balanceCents, 123400);
    done();
  }

  /* Switching never leaks a number across profiles, in either direction,
     through the spine, the snapshots or the scenarios store. */
  {
    const { s, Profiles, Spine, Scenarios } = fresh({});
    coachOn(s);
    Spine.upsertAsset({ label: 'Mine', type: 'cash', balanceCents: 111100 });
    Scenarios.pin({ room: 'adventure', label: 'my way', query: 'a=1' });
    Spine.useProfile('c_a');
    Spine.upsertAsset({ label: 'A', type: 'cash', balanceCents: 222200 });
    check('client A sees no scenario of the personal household', Scenarios.all().length, 0);
    Scenarios.pin({ room: 'adventure', label: 'A way', query: 'a=2' });
    Spine.useProfile('c_b');
    Spine.upsertAsset({ label: 'B', type: 'cash', balanceCents: 333300 });
    const bJson = JSON.stringify(Spine.getProfile());
    checkTrue('client B holds none of A\'s or the personal numbers', bJson.indexOf('222200') === -1 && bJson.indexOf('111100') === -1);
    check('client B sees no scenario of A', Scenarios.all().length, 0);
    Spine.useProfile('c_a');
    const aJson = JSON.stringify(Spine.getProfile());
    checkTrue('client A holds none of B\'s or the personal numbers', aJson.indexOf('333300') === -1 && aJson.indexOf('111100') === -1);
    check('client A\'s scenario is still A\'s', Scenarios.all().map(x => x.label).join(), 'A way');
    Spine.useProfile('default');
    check('home again, one scenario, the personal one', Scenarios.all().map(x => x.label).join(), 'my way');
    const mine = JSON.stringify(Spine.getProfile());
    checkTrue('the personal household holds no client number', mine.indexOf('222200') === -1 && mine.indexOf('333300') === -1);
    /* A read of another profile does not switch and does not cache. */
    const peek = Spine.householdOf('c_b');
    check('householdOf reads another profile without switching', peek.assets[0].balanceCents, 333300);
    check('and the active profile is untouched', Spine.activeProfile(), 'default');
    check('householdOf an unknown profile is null, not an empty household', Spine.householdOf('c_zzz'), null);
    /* A cache read before a switch never lands in the next profile. */
    Spine.getProfile();
    Profiles.use('c_b');
    Spine.upsertAsset({ label: 'B2', type: 'cash', balanceCents: 444400 });
    Profiles.use('default');
    checkTrue('a write after a raw switch lands in the profile switched to', JSON.stringify(Spine.householdOf('c_b')).indexOf('444400') !== -1 && JSON.stringify(Spine.getProfile()).indexOf('444400') === -1);
    done();
  }

  /* Deleting a client profile removes every key under its prefix, and
     nothing else. */
  {
    const { s, Spine, Coach } = fresh({});
    coachOn(s);
    Spine.upsertAsset({ label: 'Mine', type: 'cash', balanceCents: 100 });
    const a = Coach.addClient({ name: 'Alex' });
    const b = Coach.addClient({ name: 'Bo' });
    Spine.useProfile(a.id); Spine.upsertAsset({ label: 'A', type: 'cash', balanceCents: 200 }); Spine.appendSnapshot({ reason: 'x' });
    Spine.useProfile(b.id); Spine.upsertAsset({ label: 'B', type: 'cash', balanceCents: 300 });
    Spine.useProfile('default');
    const snapshotOthers = () => Object.keys(s.store).filter(k => k.indexOf('slaf.p.' + a.id + '.') !== 0 && k !== 'slaf.coach.v1').sort().map(k => k + '=' + s.store[k]).join('|');
    const othersBefore = snapshotOthers();
    Coach.removeClient(a.id);
    checkTrue('no key under the removed client\'s prefix survives', Object.keys(s.store).every(k => k.indexOf('slaf.p.' + a.id + '.') !== 0));
    check('every other key is still there, unchanged', snapshotOthers(), othersBefore);
    check('the roster lost exactly that client', Coach.clients().map(c => c.name).join(), 'Bo');
    checkTrue('the default profile cannot be removed', (() => { try { require(P('shared/profiles.js')).remove('default'); return false; } catch (e) { return true; } })());
    done();
  }

  /* The roster holds no money, ever: every value in it is a name, a date,
     an id, a flag or a tick. */
  {
    const { s, Coach } = fresh({});
    coachOn(s);
    const c = Coach.addClient({ name: 'Casey', now: '2026-09-24T10:00:00Z' });
    Coach.tick(c.id, 'income', 'takeHome', true, '2026-09-24T10:05:00Z');
    Coach.updateClient(c.id, { nextSessionAt: '2026-10-01', balanceCents: 5 });
    const raw = s.getItem('slaf.coach.v1');
    checkTrue('the roster refuses a field it does not know (no money slips in)', raw.indexOf('balanceCents') === -1);
    check('a tick is a moment, kept', Coach.ticked(c.id, 'income', 'takeHome'), '2026-09-24T10:05:00.000Z');
    Coach.tick(c.id, 'income', 'takeHome', true, '2026-09-25T10:05:00Z');
    check('ticking again keeps the first moment', Coach.ticked(c.id, 'income', 'takeHome'), '2026-09-24T10:05:00.000Z');
    checkTrue('the roster entry has the spec\'s fields', ['id', 'name', 'createdAt', 'archived', 'pathId', 'stops', 'nextSessionAt'].every(k => k in Coach.client(c.id)));
    Coach.archive(c.id, true);
    check('archived clients leave the live roster', Coach.clients().length, 0);
    check('and are listed with the archived', Coach.clients({ archived: true }).length, 1);
    done();
  }

  /* The device backup (D-202) never carries a client, and loading one never
     removes the clients. */
  {
    const { s, Spine, Coach } = fresh({});
    coachOn(s);
    const Backup = require(P('shared/backup.js'));
    Spine.upsertAsset({ label: 'Mine', type: 'cash', balanceCents: 100 });
    const c = Coach.addClient({ name: 'Dee' });
    Spine.useProfile(c.id); Spine.upsertAsset({ label: 'D', type: 'cash', balanceCents: 777700 }); Spine.useProfile('default');
    const file = Backup.toJSON();
    checkTrue('the personal backup carries no client key and no roster', file.indexOf('slaf.p.') === -1 && file.indexOf('slaf.coach.v1') === -1 && file.indexOf('777700') === -1);
    const r = Backup.apply(file);
    checkTrue('loading the personal backup leaves the clients where they are', r.ok && !!s.getItem('slaf.p.' + c.id + '.household.v2') && !!s.getItem('slaf.coach.v1'));
    check('the drift guard does not count coach keys as strays', Backup.drift().length, 0);
    done();
  }

  /* A4: one client's sealed file restores into a fresh browser; all
     clients go in one file. Real crypto, so these run async. */
  pending.push(async function () {
    const { s, Spine, Coach } = fresh({});
    coachOn(s);
    const c = Coach.addClient({ name: 'Eden' });
    Spine.useProfile(c.id);
    Spine.upsertAsset({ label: 'E', type: 'cash', balanceCents: 555500 });
    Spine.appendSnapshot({ reason: 'coach-session-start' });
    Spine.useProfile('default');
    Coach.tick(c.id, 'income', 'takeHome', true);
    const sealed = await Coach.seal(Coach.clientFile(c.id), 'correct horse battery');
    const beforeHousehold = s.getItem('slaf.p.' + c.id + '.household.v2');
    const other = Coach.addClient({ name: 'Fox' });
    const all = await Coach.seal(Coach.allFile(), 'correct horse battery');
    checkTrue('a sealed coach file never shows a number in the clear', sealed.indexOf('555500') === -1 && all.indexOf('555500') === -1);
    checkTrue('the sealed envelope carries the coach signature', JSON.parse(sealed).slafCoachExport === 1);
    done();

    /* A fresh browser. */
    const f = fresh({});
    coachOn(f.s);
    const opened = await f.Coach.openFile(sealed, 'correct horse battery');
    const res = f.Coach.restore(opened);
    checkTrue('one client restores into a fresh browser', res.length === 1 && res[0].ok);
    check('with the household byte for byte', f.s.getItem('slaf.p.' + c.id + '.household.v2'), beforeHousehold);
    check('with its snapshots', f.Spine.snapshotsOf(c.id).length, 1);
    check('with its roster entry and ticks', !!f.Coach.ticked(c.id, 'income', 'takeHome'), true);
    checkTrue('and the fresh browser\'s own household untouched', f.s.getItem('slaf.household.v2') === null);
    check('a second restore of the same client is refused without replace', f.Coach.restore(opened)[0].ok, false);
    check('and allowed with it', f.Coach.restore(opened, { replace: true })[0].ok, true);
    let wrong = null;
    try { await f.Coach.openFile(sealed, 'not the passphrase'); } catch (e) { wrong = e.message; }
    checkTrue('a wrong passphrase is a refusal, never garbage', /does not open/.test(wrong || ''));
    done();

    const g = fresh({});
    coachOn(g.s);
    const allOpened = await g.Coach.openFile(all, 'correct horse battery');
    const res2 = g.Coach.restore(allOpened);
    check('"back up all clients" restores every client', res2.filter(x => x.ok).length, 2);
    check('names and all', g.Coach.clients().map(x => x.name).sort().join(), 'Eden,Fox');
    checkTrue('Fox has an empty household, not a copy of Eden\'s', g.Spine.householdOf(other.id) === null);
    done();
  });

  /* No real data in the repository: .gitignore refuses the file names, and
     no tracked file carries the signature as JSON. */
  {
    const ignore = fs.readFileSync(P('.gitignore'), 'utf8');
    checkTrue('.gitignore refuses coach backups and exports', /money-rooms-coach-\*/.test(ignore) && /money-rooms-recap-\*/.test(ignore));
    let tracked = [];
    try { tracked = require('child_process').execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean); } catch (e) { tracked = []; }
    /* Built from parts, so this file is not itself a match. */
    const SIG = new RegExp('"' + 'slafCoach' + 'Export"\\s*:');
    const carrying = tracked.filter(f => {
      if (/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|pdf|zip|xlsx)$/i.test(f)) return false;
      let t = ''; try { t = fs.readFileSync(P(f), 'utf8'); } catch (e) { return false; }
      return SIG.test(t);
    });
    checkTrue('no tracked file carries a coach export (' + tracked.length + ' files read)', tracked.length > 0 && carrying.length === 0, carrying.join(', '));
    checkTrue('no tracked file is named like a coach export', tracked.every(f => !/money-rooms-(coach|recap)-/.test(f)));
  }

  /* Every page that loads the spine loads the profile layer first. */
  {
    const pages = ['index.html', 'map.html'].concat(fs.readdirSync(P('rooms')).filter(f => f.endsWith('.html')).map(f => 'rooms/' + f))
      .concat(fs.existsSync(P('coach')) ? fs.readdirSync(P('coach')).filter(f => f.endsWith('.html')).map(f => 'coach/' + f) : []);
    const bad = pages.filter(f => {
      if (!fs.existsSync(P(f))) return false;
      const t = fs.readFileSync(P(f), 'utf8');
      const sp = t.indexOf('shared/spine-v2.js');
      if (sp === -1) return false;
      const pr = t.indexOf('shared/profiles.js');
      return pr === -1 || pr > sp;
    });
    checkTrue('every page with the spine loads shared/profiles.js before it', bad.length === 0, bad.join(', '));
  }


  /* ======================================================================
     C1: the session paths file, and the engine that reads it (D-340)
     ====================================================================== */
  section('Coach Mode C1: the session paths, every name resolves (D-340)');
  {
    const SP = JSON.parse(fs.readFileSync(P('data/session_paths.json'), 'utf8'));
    const rows = JSON.parse(fs.readFileSync(P('data/ledger-rows.json'), 'utf8')).rows.map(r => r.id);
    const Ratios = require(P('engines/ratios.js'));
    const Registry = require(P('shared/registry.js'));
    const Session = require(P('engines/session.js'));
    const Reference = require(P('shared/reference.js'));
    check('the file is registered as a reference table', Reference.TABLE_FILES.sessionPaths, 'session_paths.json');
    check('the quick-entry words are too', Reference.TABLE_FILES.quickEntry, 'quick_entry.json');
    const def = SP.paths.filter(p => p.id === 'default')[0];
    check('the default path is the spec\'s nine stops in order', def.stops.join(), 'life,income,spending,debt,safety,assets,taxes,goals,decisions');
    const bad = [];
    Object.keys(SP.stops).forEach(id => {
      const st = SP.stops[id];
      (st.ledgerRows || []).forEach(r => { if (rows.indexOf(r) === -1) bad.push(id + ': row ' + r); });
      (st.ratios || []).forEach(r => { if (!Ratios.byId(r)) bad.push(id + ': ratio ' + r); });
      (st.rooms || []).forEach(r => { const room = Registry.byId(r.split('#')[0]); if (!room) bad.push(id + ': room ' + r); else if (r.indexOf('#') !== -1 && !(room.subsections || []).some(x => x.id === r.split('#')[1])) bad.push(id + ': section ' + r); });
      (st.doneWhen || []).forEach(t => { if (Session.TESTS.indexOf(t.test) === -1) bad.push(id + ': test ' + t.test); });
      if (!st.doneWhen || !st.doneWhen.length) bad.push(id + ': no doneWhen');
      if (!st.doneLabel) bad.push(id + ': no doneLabel');
      const qids = (st.questions || []).map(q => q.id);
      if (new Set(qids).size !== qids.length) bad.push(id + ': duplicate question id');
    });
    SP.paths.forEach(p => p.stops.forEach(id => { if (!SP.stops[id]) bad.push(p.id + ': stop ' + id); }));
    SP.rail.forEach(r => { if (!Ratios.byId(r)) bad.push('rail: ' + r); });
    checkTrue('every row, ratio, room, section and test the paths name exists', bad.length === 0, bad.join('; '));
    checkTrue('the rail holds the spec\'s five ratios (FI band and net worth are drawn beside them)', ['savingsRate', 'debtToIncome', 'emergencyFundMonths', 'liquidityRatio', 'housingRatio'].every(x => SP.rail.indexOf(x) !== -1));
    /* A client's own order and skips */
    const stops = Session.path(SP, 'default', { stopOrder: ['debt', 'income'], skipped: { life: true } });
    check('a client\'s own order goes first, the rest follow', stops.slice(0, 3).map(s => s.id).join(), 'debt,income,life');
    check('a skipped stop is marked, not dropped', stops.filter(s => s.skipped).map(s => s.id).join(), 'life');
    check('items: the rows, then the questions', Session.items(SP.stops.income).map(i => i.id).slice(0, 2).join(), 'row:grossAnnualIncome,row:takeHomeMonthly');
  }


  /* ======================================================================
     B: Coach Home's logic, the demo client and the sheet import (D-341)
     ====================================================================== */
  section('Coach Mode B: the demo client, and a sheet in (D-341)');
  function tablesAll() {
    const Reference = require(P('shared/reference.js'));
    const T = {};
    Object.keys(Reference.TABLE_FILES).forEach(k => { try { T[k] = JSON.parse(fs.readFileSync(P('data/' + Reference.TABLE_FILES[k]), 'utf8')); } catch (e) { /* optional */ } });
    return T;
  }
  function withOwnership(seed) {
    const f = fresh(seed || {});
    coachOn(f.s);
    global.SLAF.Money = require(P('shared/money.js'));
    global.SLAF.Registry = require(P('shared/registry.js'));
    delete require.cache[require.resolve(P('shared/ownership.js'))];
    global.SLAF.Ownership = require(P('shared/ownership.js'));
    global.SLAF.Csv = require(P('shared/csv.js'));
    global.SLAF.QuickEntry = require(P('engines/quickentry.js'));
    return f;
  }
  function doneOwn() { delete require.cache[require.resolve(P('shared/ownership.js'))]; done(); }
  {
    const T = tablesAll();
    const { s, Spine, Coach } = withOwnership();
    const Demo = require(P('shared/demo-persona.js'));
    const d = Coach.ensureDemo(Demo, '2026-09-24T12:00:00Z');
    check('the demo client is labelled example numbers', d.name, 'Demo client (example numbers)');
    check('asking again does not make a second one', Coach.ensureDemo(Demo).id, d.id);
    const h = Spine.householdOf(d.id);
    checkTrue('the demo household is the example persona, marked demo', h.meta.isDemo === true && h.people[0].label === Demo.build().people[0].label);
    check('with three goals that have dates, so the life picture stop is done', h.goals.filter(g => g.targetDate).length, 3);
    checkTrue('and the personal household was never written', s.getItem('slaf.household.v2') === null);

    /* A sheet: mapped columns go to their rows; the rest become notes. */
    const c = Coach.addClient({ name: 'Sheet Client' });
    const csv = 'Month,Rent,Food,Car loan,HYSA,Mood,Marginal\n' + 'Aug,"$2,000",550,,9000,ok,22%\n' + 'Sep,"$2,100",600,12000,12500,good,22%\n';
    const cols = Coach.suggest(['Month', 'Rent', 'Food', 'Car loan', 'HYSA', 'Mood', 'Marginal'], T);
    check('the first guess maps Rent to its row', cols.Rent, 'qe:rent');
    check('and Food', cols.Food, 'qe:food');
    cols.Food = 'row:foodMonthly';     /* a Ledger row picked by hand reads the cell straight */
    check('and a debt column to the quick-entry word', cols['Car loan'], 'qe:car loan');
    check('and leaves a column it does not know unmapped', cols.Mood, null);
    cols.Marginal = 'row:marginalRate';
    const plan = Coach.sheetPlan(csv, cols, T);
    check('the last filled line of each column is read', plan.writes.filter(w => w.header === 'Food')[0].value, 60000);
    checkTrue('unmapped columns become notes, never numbers', plan.notes.some(n => /Mood: good/.test(n)) && plan.notes.some(n => /Month: Sep/.test(n)));
    Spine.useProfile(c.id);
    const out = Coach.applySheet(plan, T);
    const ch = Spine.getProfile();
    check('rent reached the housing row', ch.expenses.needs.accommodation.monthlyCents, 210000);
    check('the car loan was added as a debt with its balance', ch.debts.map(x => x.label + ':' + x.balanceCents).join(), 'Car loan:1200000');
    check('the HYSA was added as an account', ch.assets.filter(a => a.accountType === 'hysa').map(a => a.valueCents).join(), '1250000');
    checkTrue('the notes are private coach notes', Coach.record().notes.length === 2 && Coach.record().notes.every(n => n.kind === 'coach' && n.source === 'import'));
    check('written count', out.written >= 4, true);
    Spine.useProfile('default');
    checkTrue('the personal household never saw the sheet', s.getItem('slaf.household.v2') === null);
    Coach.saveTemplate('My sheet', cols);
    check('a mapping is kept by name in the roster', Coach.templates()['My sheet'].columns.Rent, 'qe:rent');
    checkTrue('the roster still carries no money', !/210000|1200000|1250000/.test(s.getItem('slaf.coach.v1')));
    doneOwn();
  }
  {
    const settings = fs.readFileSync(P('rooms/settings.html'), 'utf8');
    checkTrue('Settings has the Coach Mode switch, a preference, off by default', /data-pref-toggle="coachMode"/.test(settings) && /Prefs\.get\('coachMode', false\) === true/.test(settings));
    const home = fs.readFileSync(P('coach/home.js'), 'utf8');
    checkTrue('Coach Home puts the tab back on the personal household first', home.indexOf("Spine.useProfile('default')") !== -1 && home.indexOf("Spine.useProfile('default')") < home.indexOf('Reference.load'));
    checkTrue('Coach Home reads clients without switching (householdOf)', /Spine\.householdOf\(c\.id\)/.test(home));
    checkTrue('Coach Home is guarded: nothing draws with Coach Mode off', /if \(!UI\.guard\(el\('main'\)\)\) return;/.test(home));
    const coachPages = fs.readdirSync(P('coach')).filter(f => f.endsWith('.html'));
    checkTrue('coach/ holds its three screens and nothing more (D-338)', coachPages.every(f => ['index.html', 'session.html', 'client.html'].indexOf(f) !== -1), coachPages.join(', '));
  }


  /* ======================================================================
     C and E: the console's writes, the session lifecycle and the recap
     (D-342, D-343)
     ====================================================================== */
  section('Coach Mode C, E: a session start to end, and its recap (D-342, D-343)');
  {
    const T = tablesAll();
    const { s, Spine, Coach, Profiles } = withOwnership();
    const Session = require(P('engines/session.js'));
    const Q = require(P('engines/quickentry.js'));
    const Demo = require(P('shared/demo-persona.js'));
    const d = Coach.ensureDemo(Demo);
    Spine.useProfile(d.id);
    const sess = Coach.startSession('2026-09-24T15:00:00Z');
    checkTrue('start session freezes the household in a labelled snapshot', Spine.listSnapshots().some(x => x.id === sess.startSnapshotId && x.reason === 'coach-session-start' && x.rawInputs.household));
    check('starting twice keeps the one open session', Coach.startSession().id, sess.id);
    const quick = Coach.applyQuick(Q.parse('car 450/mo 5.9% 38 left', T.quickEntry, Spine.getProfile()), { stopId: 'debt', sessionId: sess.id });
    check('quick entry writes the owning rows', Spine.getProfile().debts.filter(x => x.label === 'Car loan').map(x => x.minPaymentCents + '@' + x.rate).join(), '45000@0.059');
    check('and keeps the words it did not read as a private stop note', quick.note.kind + ':' + quick.note.stopId + ':' + quick.note.text, 'coach:debt:Car loan: 38 payments left');
    const unparsed = Coach.applyQuick(Q.parse('client mentions a bonus maybe', T.quickEntry, Spine.getProfile()), { stopId: 'income' });
    check('a line quick entry cannot read writes no number, only a note', unparsed.written + ':' + unparsed.note.text, '0:client mentions a bonus maybe');
    Coach.addNote({ kind: 'coach', text: 'PRIVATE-ONLY-7731', stopId: 'debt', sessionId: sess.id });
    Coach.addNote({ kind: 'shared', text: 'We will clear the card first', stopId: 'debt', sessionId: sess.id });
    Coach.addHomework({ text: 'Find the 401k fee ratio', dueOn: '2026-10-08', stopId: 'assets', sessionId: sess.id });
    Coach.tick(d.id, 'debt', 'q:every', true);
    const ended = Coach.endSession(sess.id, { stopsCovered: ['debt'], ticked: [{ stopId: 'debt', itemId: 'q:every' }], now: '2026-09-24T16:05:00Z' });
    checkTrue('end session snapshots again and closes it with its length', !!ended.endSnapshotId && ended.durationMs === 65 * 60000 && Coach.openSession() === null);
    const before = Coach.snapshotHousehold(ended.startSnapshotId), after = Coach.snapshotHousehold(ended.endSnapshotId);
    check('the start snapshot is the plan as it was (no car loan)', before.debts.some(x => x.label === 'Car loan'), false);
    check('the end snapshot has it', after.debts.some(x => x.label === 'Car loan'), true);
    const stops = Session.path(T.sessionPaths, 'default', {});
    const r = Coach.record();
    const recap = Session.recap(before, after, T, { stops, stopsCovered: ended.stopsCovered, ticked: ended.ticked, notes: r.notes, homework: r.homework, sessionId: sess.id });
    checkTrue('the recap says what was covered', /Debt \(1 item done\)/.test(recap.text));
    checkTrue('the recap names the new debt', /Added Car loan: rate 5\.9%, payment \$450/.test(recap.text), recap.text);
    checkTrue('ratios before and after', /Debt-to-income: \d+% to \d+%/.test(recap.text));
    checkTrue('the FI band before and after', /The FI date: .* before, .* now|The FI date: .*\(same\)/.test(recap.text));
    checkTrue('shared notes and homework with the due date are in', /clear the card first/.test(recap.text) && /401k fee ratio \(by 2026-10-08\)/.test(recap.text));
    checkTrue('no coach note reaches the recap, not the typed one, not the quick-entry one', recap.text.indexOf('PRIVATE-ONLY-7731') === -1 && recap.text.indexOf('38 payments left') === -1 && recap.text.indexOf('bonus maybe') === -1);
    Coach.saveRecap(sess.id, recap.text + '\nEdited by the coach.');
    const file = Coach.recapFile(d.id, Coach.record().sessions[0].recapText);
    checkTrue('the recap file carries the text and the name, and no household', file.kind === 'recap' && /Edited by the coach/.test(file.text) && !file.keys && !file.household && JSON.stringify(file).indexOf('PRIVATE-ONLY-7731') === -1);
    /* The coach profile: every switch on, no ask card; home keeps its own. */
    const Features = require(P('shared/features.js'));
    Features.use(T.features);
    const userSwitches = Features.all().filter(f => f.scope === 'user');
    checkTrue('on a client household every user switch is on', userSwitches.every(f => Features.on(f.id, Spine.getProfile())));
    Spine.useProfile('default');
    checkTrue('on the coach\'s own household the defaults stand', userSwitches.some(f => !Features.on(f.id, Spine.getProfile())));
    checkTrue('the personal household never gained a coach record', s.getItem('slaf.household.v2') === null || JSON.parse(s.getItem('slaf.household.v2')).coach === undefined);
    doneOwn();
  }
  {
    const con = fs.readFileSync(P('coach/console.js'), 'utf8');
    const page = fs.readFileSync(P('coach/session.html'), 'utf8');
    checkTrue('the console has no client picker: switching goes through Coach Home', !/<select[^>]*client/i.test(page) && !/Coach\.clients\(/.test(con));
    checkTrue('an unknown client id draws nothing (no guess)', /if \(!client\) \{/.test(con));
    checkTrue('the console marks itself built once (D-034)', /LIVE-FORM: built once/.test(page));
    checkTrue('detours nest at most two deep', /MAX_DETOURS = 2/.test(con));
    checkTrue('the session embeds rooms only from this origin', /frame-src 'self'/.test(page) && !/frame-src 'self' http/.test(page));
    const settingsCsp = fs.readFileSync(P('rooms/settings.html'), 'utf8');
    checkTrue('rooms still refuse every frame', /frame-src 'none'/.test(settingsCsp));
  }

  /* The async checks run last, one after another: they swap the global
     storage like every block here, so they must not overlap the others. */
  return pending.reduce((chain, fn) => chain.then(fn), Promise.resolve());
};
