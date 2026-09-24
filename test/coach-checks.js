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
  pending.push((async function () {
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
  })());

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

  return Promise.all(pending);
};
