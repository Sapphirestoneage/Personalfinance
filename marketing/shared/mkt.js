/* ==========================================================================
   marketing/shared/mkt.js, the marketing app's store. MD-002.
   --------------------------------------------------------------------------
   Everything the Scoreboard keeps, under its own 'mkt.' keys in this
   browser. It never reads or writes a SPARKS key ('slaf.') or a coach key.

     mkt.posts.v1      [post]      every piece of content and its results
     mkt.people.v1     [person]    the contacts, their stage and rhythm
     mkt.touches.v1    [touch]     every message, comment, call, meeting
     mkt.settings.v1   { targets, cadences, charts, welcomeSeen, demo }

   A post   { id, date, channel, format, pillar, hook, cta, link, minutes,
              results: { impressions, likes, comments, shares, saves, clicks,
              dms, follows, leads }, resultsAt, notes, createdAt }
            Every count is null (not entered) or an integer. Never a silent 0.
   A person { id, name, email, phone, company, role, platform, handle, source,
              stage, stageHistory: [{ stage, at }], tags, cadence, nextAt,
              value (cents), notes, fromPostId, archived, createdAt }
            cadence: null = the stage's rhythm, 0 = never, n = every n days.
   A touch  { id, personId, date, kind, lane, direction ('out' | 'in'),
              outcome, note, createdAt }

     posts() addPost(f) updatePost(id, patch) removePost(id) post(id)
     people({ archived }) person(id) addPerson(f) updatePerson(id, patch)
     setStage(id, stage, at) removePerson(id)
     touches(personId) addTouch(f) removeTouch(id)
     settings() setSettings(patch) target(id) setTarget(id, n)
     chartPref(id) setChartPref(id, patch) prefs() setPref(k, v)
     count(v)            null when blank, an integer, or undefined when bad
     mapContacts(records, opts)   a CSV's rows to people, with the mapping
     mapPosts(records)            a CSV's rows to posts
     exportAll() importAll(obj, { replace }) clearAll() filename(kind)
     loadDemo(rows) isDemo()
     onChange(fn)
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var g = root || (typeof globalThis !== 'undefined' ? globalThis : {});
  var Csv = node ? require('./csv.js') : (g.SLAF && g.SLAF.Csv);
  var api = factory(Csv, g);
  if (node) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Mkt = api; }
})(typeof self !== 'undefined' ? self : null, function (Csv, g) {
  'use strict';
  var K = { posts: 'mkt.posts.v1', people: 'mkt.people.v1', touches: 'mkt.touches.v1', settings: 'mkt.settings.v1' };
  var SIGNATURE = 1;
  var RESULTS = ['impressions', 'likes', 'comments', 'shares', 'saves', 'clicks', 'dms', 'follows', 'leads'];
  var STAGES = ['stranger', 'follower', 'conversation', 'lead', 'call', 'client', 'advocate', 'lost'];
  var listeners = [];

  /* ---- Storage: localStorage, or memory where it is refused --------------- */
  var memory = {};
  function ls() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  function get(k) { var s = ls(); if (!s) return k in memory ? memory[k] : null; try { return s.getItem(k); } catch (e) { return null; } }
  function set(k, v) { var s = ls(); if (!s) { memory[k] = v; return; } s.setItem(k, v); }
  function del(k) { var s = ls(); if (!s) { delete memory[k]; return; } try { s.removeItem(k); } catch (e) { /* fine */ } }
  function notify(what) { listeners.slice().forEach(function (fn) { try { fn(what); } catch (e) { /* a listener must not break a write */ } }); }
  function onChange(fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); }; }
  if (g && g.addEventListener) g.addEventListener('storage', function (e) { if (e.key && e.key.indexOf('mkt.') === 0) notify(e.key); });

  function readList(k) { try { var v = JSON.parse(get(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function writeList(k, list) { set(k, JSON.stringify(list)); notify(k); }
  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function uid(prefix) { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }

  /* Empty is not zero: '' and null are null; '12' is 12; 'abc' is undefined (refused). */
  function count(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) && v >= 0 ? Math.round(v) : undefined;
    var s = String(v).trim();
    if (s === '') return null;
    var n = Csv && Csv.number ? Csv.number(s) : { value: Number(s.replace(/,/g, '')), bad: isNaN(Number(s.replace(/,/g, ''))) };
    if (n.blank) return null;
    if (n.bad || typeof n.value !== 'number' || n.value < 0) return undefined;
    return Math.round(n.value);
  }
  function cents(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : undefined;
    var s = String(v).trim(); if (s === '') return null;
    var c = Csv && Csv.amount ? Csv.amount(s) : Math.round(Number(s) * 100);
    return c === undefined || c === null || isNaN(c) ? (c === null ? null : undefined) : c;
  }
  /* A date from anything a person types. Blank gives the fallback (null when
     none). A bad date gives the fallback too, or undefined when there is none,
     so the caller can refuse it. */
  function dateOf(v, fallback) {
    var s = str(v); if (!s) return fallback === undefined ? null : fallback;
    if (isDate(s)) return s;
    var d = Csv && Csv.date ? Csv.date(s) : null;
    return d || fallback;
  }

  /* ---- Posts ---------------------------------------------------------------- */
  function posts() { return readList(K.posts); }
  function post(id) { return posts().filter(function (p) { return p.id === id; })[0] || null; }
  function normalizeResults(r, base) {
    var out = base ? copy(base) : {}, bad = [];
    RESULTS.forEach(function (k) { if (!(k in out)) out[k] = null; });
    if (!r) return { results: out, bad: bad };
    RESULTS.forEach(function (k) { if (k in r) { var c = count(r[k]); if (c === undefined) bad.push(k); else out[k] = c; } });
    return { results: out, bad: bad };
  }
  function normalizePost(f, base) {
    var p = base ? copy(base) : { id: uid('p'), createdAt: new Date().toISOString(), results: {}, resultsAt: null };
    var bad = [];
    ['channel', 'format', 'pillar', 'hook', 'cta', 'link', 'notes'].forEach(function (k) { if (k in f) p[k] = str(f[k]); else if (!(k in p)) p[k] = ''; });
    if ('date' in f || !p.date) { var d = dateOf(f.date, null); if (!d) bad.push('date'); else p.date = d; }
    if ('minutes' in f) { var m = count(f.minutes); if (m === undefined) bad.push('minutes'); else p.minutes = m; }
    if (!('minutes' in p)) p.minutes = null;
    var nr = normalizeResults(f.results, p.results); p.results = nr.results; bad = bad.concat(nr.bad);
    if (f.results && !nr.bad.length && RESULTS.some(function (k) { return k in f.results; })) p.resultsAt = dateOf(f.resultsAt, today());
    if (!p.channel) p.channel = 'other';
    if (!p.cta) p.cta = 'none';
    if (!p.format) p.format = 'text';
    return { post: p, bad: bad };
  }
  function addPost(f) {
    var n = normalizePost(f || {}); if (n.bad.length) return { ok: false, bad: n.bad };
    var list = posts(); list.push(n.post); writeList(K.posts, list); return { ok: true, post: n.post };
  }
  function updatePost(id, patch) {
    var list = posts(), i = list.map(function (p) { return p.id; }).indexOf(id); if (i === -1) return { ok: false, bad: ['id'] };
    var n = normalizePost(patch || {}, list[i]); if (n.bad.length) return { ok: false, bad: n.bad };
    list[i] = n.post; writeList(K.posts, list); return { ok: true, post: n.post };
  }
  function removePost(id) { writeList(K.posts, posts().filter(function (p) { return p.id !== id; })); }

  /* ---- People --------------------------------------------------------------- */
  function people(o) { var list = readList(K.people); return (o && o.archived) ? list : list.filter(function (p) { return !p.archived; }); }
  function person(id) { return readList(K.people).filter(function (p) { return p.id === id; })[0] || null; }
  function normalizePerson(f, base) {
    var p = base ? copy(base) : { id: uid('c'), createdAt: new Date().toISOString(), stage: 'stranger', stageHistory: [], tags: [], cadence: null, nextAt: null, value: null, fromPostId: null, archived: false };
    var bad = [];
    ['name', 'email', 'phone', 'company', 'role', 'platform', 'handle', 'source', 'notes'].forEach(function (k) { if (k in f) p[k] = str(f[k]); else if (!(k in p)) p[k] = ''; });
    if (!p.name) bad.push('name');
    if ('tags' in f) p.tags = Array.isArray(f.tags) ? f.tags.map(str).filter(Boolean) : str(f.tags).split(/[,;]/).map(function (t) { return t.trim(); }).filter(Boolean);
    if ('cadence' in f) { var c = f.cadence === null ? null : count(f.cadence); if (c === undefined) bad.push('cadence'); else p.cadence = c; }
    if ('nextAt' in f) { var d = f.nextAt ? dateOf(f.nextAt, undefined) : null; if (d === undefined) bad.push('nextAt'); else p.nextAt = d; }
    if ('value' in f) { var v = cents(f.value); if (v === undefined) bad.push('value'); else p.value = v; }
    if ('fromPostId' in f) p.fromPostId = f.fromPostId || null;
    if ('archived' in f) p.archived = !!f.archived;
    if ('createdAt' in f && f.createdAt) p.createdAt = f.createdAt;
    if ('stage' in f && f.stage !== p.stage) {
      if (STAGES.indexOf(f.stage) === -1) bad.push('stage');
      else { p.stage = f.stage; p.stageHistory.push({ stage: f.stage, at: dateOf(f.stageAt, today()) }); }
    }
    if (!base && !p.stageHistory.length) p.stageHistory.push({ stage: p.stage, at: dateOf(f.stageAt, today()) });
    return { person: p, bad: bad };
  }
  function addPerson(f) {
    var n = normalizePerson(f || {}); if (n.bad.length) return { ok: false, bad: n.bad };
    var list = readList(K.people); list.push(n.person); writeList(K.people, list); return { ok: true, person: n.person };
  }
  function updatePerson(id, patch) {
    var list = readList(K.people), i = list.map(function (p) { return p.id; }).indexOf(id); if (i === -1) return { ok: false, bad: ['id'] };
    var n = normalizePerson(patch || {}, list[i]); if (n.bad.length) return { ok: false, bad: n.bad };
    list[i] = n.person; writeList(K.people, list); return { ok: true, person: n.person };
  }
  function setStage(id, stage, at) { return updatePerson(id, { stage: stage, stageAt: at }); }
  function removePerson(id) {
    writeList(K.people, readList(K.people).filter(function (p) { return p.id !== id; }));
    writeList(K.touches, readList(K.touches).filter(function (t) { return t.personId !== id; }));
  }

  /* ---- Touches -------------------------------------------------------------- */
  function touches(personId) { var list = readList(K.touches); return personId ? list.filter(function (t) { return t.personId === personId; }) : list; }
  function addTouch(f) {
    f = f || {};
    var bad = [];
    if (!f.personId || !person(f.personId)) bad.push('personId');
    var d = str(f.date) ? dateOf(f.date, undefined) : today(); if (!d) bad.push('date');
    if (bad.length) return { ok: false, bad: bad };
    var t = { id: uid('t'), personId: f.personId, date: d, kind: str(f.kind) || 'dm', lane: str(f.lane) || 'warm', direction: f.direction === 'in' ? 'in' : 'out', outcome: str(f.outcome) || 'none', note: str(f.note), createdAt: new Date().toISOString() };
    var list = readList(K.touches); list.push(t); writeList(K.touches, list);
    return { ok: true, touch: t };
  }
  function removeTouch(id) { writeList(K.touches, readList(K.touches).filter(function (t) { return t.id !== id; })); }

  /* ---- Settings ------------------------------------------------------------- */
  function settings() {
    var s; try { s = JSON.parse(get(K.settings) || '{}'); } catch (e) { s = {}; }
    if (!s || typeof s !== 'object') s = {};
    s.targets = s.targets || {}; s.cadences = s.cadences || {}; s.charts = s.charts || {};
    return s;
  }
  function setSettings(patch) { var s = settings(); Object.keys(patch || {}).forEach(function (k) { s[k] = patch[k]; }); set(K.settings, JSON.stringify(s)); notify(K.settings); return s; }
  function target(id) { var t = settings().targets[id]; return typeof t === 'number' ? t : null; }
  function setTarget(id, n) { var s = settings(); var c = n === null || n === '' ? null : count(n); if (c === undefined) return false; s.targets[id] = c; setSettings({ targets: s.targets }); return true; }
  function prefs() { return settings(); }
  function setPref(k, v) { var p = {}; p[k] = v; setSettings(p); }
  function chartPref(id) { return settings().charts[id] || {}; }
  function setChartPref(id, patch) {
    var s = settings(), c = s.charts[id] || {};
    Object.keys(patch || {}).forEach(function (k) { if (k === 'colors' && patch.colors) c.colors = Object.assign({}, c.colors || {}, patch.colors); else if (patch[k] === null) delete c[k]; else c[k] = patch[k]; });
    s.charts[id] = c; setSettings({ charts: s.charts });
  }

  /* ---- Imports: a CSV's rows to people or posts --------------------------- */
  var PEOPLE_COLUMNS = {
    name: ['name', 'full_name', 'contact', 'contact_name', 'display_name'],
    first: ['first_name', 'first', 'given_name'], last: ['last_name', 'last', 'surname', 'family_name'],
    email: ['email', 'email_address', 'e_mail', 'e_mail_address', 'email_1_value', 'e_mail_1_value', 'primary_email'],
    phone: ['phone', 'mobile', 'phone_number', 'mobile_phone', 'phone_1_value', 'cell'],
    company: ['company', 'organization', 'organisation', 'organization_name', 'organization_1_name', 'org', 'business', 'employer'],
    role: ['role', 'position', 'title', 'job_title', 'organization_title'],
    platform: ['platform', 'network', 'channel', 'social'],
    handle: ['handle', 'username', 'user_name', 'url', 'profile', 'profile_url', 'instagram', 'linkedin', 'website'],
    source: ['source', 'how_we_met', 'origin', 'lane'],
    stage: ['stage', 'status', 'pipeline'],
    tags: ['tags', 'labels', 'groups', 'group_membership', 'category'],
    notes: ['notes', 'note', 'comments'],
    createdAt: ['connected_on', 'created', 'created_at', 'date', 'added', 'date_added', 'connected']
  };
  function detect(headers, columns) {
    var keys = headers.map(function (h) { return Csv ? Csv.headerKey(h) : String(h).toLowerCase().replace(/[^a-z0-9]+/g, '_'); });
    var map = {};
    Object.keys(columns).forEach(function (field) {
      var found = null;
      columns[field].some(function (cand) { var i = keys.indexOf(cand); if (i !== -1) { found = keys[i]; return true; } return false; });
      if (found) map[field] = found;
    });
    return map;
  }
  function mapContacts(records, opts) {
    var o = opts || {}, headers = o.headers || Object.keys(records[0] || {}).filter(function (k) { return k !== '_n'; });
    var map = Object.assign(detect(headers, PEOPLE_COLUMNS), o.mapping || {});
    var existing = people({ archived: true });
    var seenEmail = {}, seenName = {};
    existing.forEach(function (p) { if (p.email) seenEmail[p.email.toLowerCase()] = true; seenName[(p.name + '|' + p.company).toLowerCase()] = true; });
    var out = [], skipped = [];
    records.forEach(function (r) {
      var f = {};
      Object.keys(map).forEach(function (field) { if (map[field] in r) f[field] = r[map[field]]; });
      var name = str(f.name) || (str(f.first) + ' ' + str(f.last)).trim();
      if (!name) { skipped.push({ line: r._n, why: 'no name' }); return; }
      var email = str(f.email).toLowerCase();
      var key = (name + '|' + str(f.company)).toLowerCase();
      if ((email && seenEmail[email]) || seenName[key]) { skipped.push({ line: r._n, why: 'already here: ' + name }); return; }
      if (email) seenEmail[email] = true; seenName[key] = true;
      var stage = str(f.stage).toLowerCase();
      var p = { name: name, email: email, phone: str(f.phone), company: str(f.company), role: str(f.role), platform: str(f.platform), handle: str(f.handle), source: str(f.source) || (o.source || 'import'), notes: str(f.notes), tags: f.tags || '', stage: STAGES.indexOf(stage) !== -1 ? stage : (o.stage || 'stranger') };
      var c = dateOf(f.createdAt, null); if (c) { p.createdAt = c + 'T12:00:00.000Z'; p.stageAt = c; }
      out.push(p);
    });
    return { people: out, skipped: skipped, mapping: map };
  }
  var POST_COLUMNS = {
    date: ['date', 'published', 'posted', 'publish_date', 'post_date', 'day'], channel: ['channel', 'platform', 'network'], format: ['format', 'type', 'kind'],
    pillar: ['pillar', 'topic', 'theme', 'category'], hook: ['hook', 'title', 'headline', 'first_line', 'caption'], cta: ['cta', 'ask', 'call_to_action'],
    link: ['link', 'url', 'permalink'], minutes: ['minutes', 'time', 'time_spent', 'minutes_spent'],
    impressions: ['impressions', 'reach', 'views', 'plays'], likes: ['likes', 'reactions', 'hearts'], comments: ['comments', 'replies'], shares: ['shares', 'reposts', 'retweets', 'sends'],
    saves: ['saves', 'bookmarks'], clicks: ['clicks', 'link_clicks'], dms: ['dms', 'messages', 'dms_started'], follows: ['follows', 'followers', 'new_followers', 'follows_gained'], leads: ['leads'], notes: ['notes', 'note']
  };
  function mapPosts(records, opts) {
    var o = opts || {}, headers = o.headers || Object.keys(records[0] || {}).filter(function (k) { return k !== '_n'; });
    var map = Object.assign(detect(headers, POST_COLUMNS), o.mapping || {});
    var out = [], skipped = [];
    records.forEach(function (r) {
      var f = { results: {} };
      Object.keys(map).forEach(function (field) { if (!(map[field] in r)) return; if (RESULTS.indexOf(field) !== -1) f.results[field] = r[map[field]]; else f[field] = r[map[field]]; });
      var n = normalizePost(f);
      if (n.bad.length) { skipped.push({ line: r._n, why: 'bad ' + n.bad.join(', ') }); return; }
      out.push(n.post);
    });
    return { posts: out, skipped: skipped, mapping: map };
  }
  function addPeople(list) { var all = readList(K.people); list.forEach(function (f) { var n = normalizePerson(f); if (!n.bad.length) all.push(n.person); }); writeList(K.people, all); return all.length; }
  function addPosts(list) { var all = posts(); list.forEach(function (p) { all.push(p); }); writeList(K.posts, all); return all.length; }

  /* ---- Files ---------------------------------------------------------------- */
  function exportAll() { return { mktExport: SIGNATURE, savedAt: new Date().toISOString(), posts: posts(), people: readList(K.people), touches: touches(), settings: settings() }; }
  function importAll(obj, o) {
    if (!obj || obj.mktExport !== SIGNATURE) return { ok: false, why: 'Not a Scoreboard file.' };
    o = o || {};
    if (o.replace) { writeList(K.posts, obj.posts || []); writeList(K.people, obj.people || []); writeList(K.touches, obj.touches || []); set(K.settings, JSON.stringify(obj.settings || {})); notify(K.settings); return { ok: true, posts: (obj.posts || []).length, people: (obj.people || []).length }; }
    var ids = {}; posts().forEach(function (p) { ids[p.id] = 1; }); readList(K.people).forEach(function (p) { ids[p.id] = 1; }); touches().forEach(function (t) { ids[t.id] = 1; });
    var np = (obj.posts || []).filter(function (p) { return !ids[p.id]; }), nc = (obj.people || []).filter(function (p) { return !ids[p.id]; }), nt = (obj.touches || []).filter(function (t) { return !ids[t.id]; });
    writeList(K.posts, posts().concat(np)); writeList(K.people, readList(K.people).concat(nc)); writeList(K.touches, touches().concat(nt));
    return { ok: true, posts: np.length, people: nc.length, touches: nt.length };
  }
  function clearAll() { Object.keys(K).forEach(function (k) { del(K[k]); }); notify('mkt.'); }
  function filename(kind) { return 'scoreboard-' + kind + '-' + today() + (kind === 'all' ? '.mkt.json' : '.csv'); }
  function loadDemo(rows) {
    clearAll();
    writeList(K.posts, rows.posts || []); writeList(K.people, rows.people || []); writeList(K.touches, rows.touches || []);
    setSettings({ demo: true, targets: rows.targets || {} });
  }
  function isDemo() { return !!settings().demo; }

  return { KEYS: K, RESULTS: RESULTS, STAGES: STAGES, SIGNATURE: SIGNATURE,
    posts: posts, post: post, addPost: addPost, updatePost: updatePost, removePost: removePost, addPosts: addPosts,
    people: people, person: person, addPerson: addPerson, updatePerson: updatePerson, setStage: setStage, removePerson: removePerson, addPeople: addPeople,
    touches: touches, addTouch: addTouch, removeTouch: removeTouch,
    settings: settings, setSettings: setSettings, target: target, setTarget: setTarget, prefs: prefs, setPref: setPref, chartPref: chartPref, setChartPref: setChartPref,
    count: count, cents: cents, dateOf: dateOf, mapContacts: mapContacts, mapPosts: mapPosts,
    exportAll: exportAll, importAll: importAll, clearAll: clearAll, filename: filename, loadDemo: loadDemo, isDemo: isDemo, onChange: onChange };
});
