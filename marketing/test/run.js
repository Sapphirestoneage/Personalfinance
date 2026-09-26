#!/usr/bin/env node
/* ==========================================================================
   marketing/test/run.js, the Marketing Scoreboard's own tests. MD-001 onward.
   --------------------------------------------------------------------------
   Dependency-free, like coach/test/run.js: node only, a fake localStorage.
   Also run in CI beside the SPARKS suite.

     node marketing/test/run.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..');
const ROOT = path.join(APP, '..');
const A = (f) => path.join(APP, f);

let passed = 0;
const failures = [];
function check(name, actual, expected) { if (actual === expected) { passed++; return; } failures.push(name + '\n      expected: ' + JSON.stringify(expected) + '\n      actual:   ' + JSON.stringify(actual)); }
function checkTrue(name, ok, detail) { if (ok) { passed++; return; } failures.push(name + (detail ? '\n      ' + detail : '')); }
function section(t) { console.log('\n' + t); }

function fakeStorage(seed) {
  const store = Object.assign({}, seed || {});
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] === undefined ? null : Object.keys(store)[i], get length() { return Object.keys(store).length; }, store };
}
function fresh(seed) {
  ['shared/mkt.js'].forEach(m => { delete require.cache[require.resolve(A(m))]; });
  const s = fakeStorage(seed);
  global.localStorage = s;
  return { s, M: require(A('shared/mkt.js')), K: require(A('engines/kpi.js')), T: require(A('shared/tables.js')).loadSync(), Demo: require(A('shared/demo.js')), Csv: require(A('shared/csv.js')) };
}
function done() { delete global.localStorage; }
const TODAY = '2026-09-26';   /* a Saturday; the week runs Mon 21 to Sun 27 */

/* ======================================================================
   A separate app: its own copies, its own keys, nothing reached outside
   ====================================================================== */
section('A separate app (MD-001)');
{
  const V = require(A('tools/vendor.js'));
  const drift = V.FILES.filter(p => !fs.existsSync(path.join(ROOT, p[0])) || !fs.existsSync(A(p[1])) || Buffer.compare(fs.readFileSync(path.join(ROOT, p[0])), fs.readFileSync(A(p[1]))) !== 0);
  checkTrue('every vendored copy is byte-identical to its source (' + V.FILES.length + ' files; run node marketing/tools/vendor.js)', drift.length === 0, drift.map(p => p[1]).join(', '));
  const outside = [];
  function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'test' && e.name !== 'tools') walk(p); } else if (/\.(js|html|css)$/.test(e.name)) {
    const t = fs.readFileSync(p, 'utf8');
    (t.match(/require\('([^']+)'\)/g) || []).forEach(r => { const rel = r.slice(9, -2); if (rel[0] === '.' && path.resolve(path.dirname(p), rel).indexOf(APP) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
    (t.match(/(?:src|href)="([^"#?]+)"/g) || []).forEach(r => { const rel = r.replace(/^(src|href)="/, '').replace(/"$/, ''); if (!/^(https?:|mailto:)/.test(rel) && /\.(js|css|svg|html|woff2)$/.test(rel) && path.resolve(path.dirname(p), rel).indexOf(APP) !== 0) outside.push(path.relative(ROOT, p) + ' -> ' + rel); });
  } }); }
  walk(APP);
  checkTrue('no file in marketing/ requires or links anything outside marketing/', outside.length === 0, outside.join(', '));
  const src = ['shared/mkt.js', 'engines/kpi.js', 'common.js', 'board.js', 'posts.js', 'people.js'].map(f => fs.readFileSync(A(f), 'utf8')).join('\n');
  checkTrue('no SPARKS or coach key is read or written (slaf. / coach.)', !/['"](slaf|coach)\.[a-z]/.test(src));
  checkTrue('every stored key starts with mkt.', Object.values(require(A('shared/mkt.js')).KEYS).every(k => k.indexOf('mkt.') === 0));
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  checkTrue('.gitignore refuses Scoreboard saves', /scoreboard-\*/.test(ignore) && /\*\.mkt\.json/.test(ignore));
  let tracked = [];
  try { tracked = require('child_process').execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean); } catch (e) { tracked = []; }
  const SIG = new RegExp('"' + 'mkt' + 'Export"\\s*:');
  const carrying = tracked.filter(f => !/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|pdf|zip|xlsx)$/i.test(f) && (() => { try { return SIG.test(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return false; } })());
  checkTrue('no tracked file carries a Scoreboard export (' + tracked.length + ' files read)', tracked.length > 0 && carrying.length === 0, carrying.join(', '));
  const EM = [String.fromCharCode(0x2014), '\\u2014', '&mdash;', '&#8212;'];
  const dirty = [];
  function walk2(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk2(p); else if (/\.(html|js|css|json)$/.test(e.name) && p !== __filename) { const t = fs.readFileSync(p, 'utf8'); if (EM.some(x => t.indexOf(x) !== -1)) dirty.push(path.relative(APP, p)); } }); }
  walk2(APP);
  checkTrue('no em dash anywhere in marketing/', dirty.length === 0, dirty.join(', '));
  const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
  checkTrue('CI runs this suite', ci.indexOf('node marketing/test/run.js') !== -1);
}

/* ======================================================================
   The tables and the words
   ====================================================================== */
section('The tables (MD-001)');
{
  const { T } = fresh();
  const t = T.tables;
  checkTrue('every stage has a rhythm (a number of days or null) and a how', t.stages.every(s => (s.cadence === null || (typeof s.cadence === 'number' && s.cadence > 0)) && s.how.length > 10));
  check('the stages are the store\'s stages, in order', t.stages.map(s => s.id).join(','), require(A('shared/mkt.js')).STAGES.join(','));
  check('the results are the store\'s results, in order', t.results.map(r => r.id).join(','), require(A('shared/mkt.js')).RESULTS.join(','));
  checkTrue('every target has a default', t.targets.every(x => typeof x.default === 'number'));
  checkTrue('every read-out on the Scoreboard has plain words', ['posts', 'impressions', 'engagementRate', 'follows', 'outreach', 'conversations', 'leads', 'calls', 'clients', 'hours', 'streak', 'funnel', 'due'].every(id => T.help.readouts[id] && T.help.readouts[id].what.length > 20));
  checkTrue('every help entry is short sentences, no dash', Object.values(T.help.readouts).concat(Object.values(T.help.fields)).every(e => Object.values(e).every(s => s.indexOf('—') === -1 && s.split(/[.!?]\s+/).every(sn => sn.split(/\s+/).length <= 30))));
  done();
}

/* ======================================================================
   The store: empty is not zero
   ====================================================================== */
section('The store (MD-002)');
{
  const { M, s } = fresh();
  check('blank is null', M.count(''), null);
  check('a typed zero is zero', M.count('0'), 0);
  check('a thousands comma reads', M.count('1,200'), 1200);
  check('words are refused', M.count('lots'), undefined);
  check('a negative count is refused', M.count('-3'), undefined);
  check('dollars become cents', M.cents('$1,250.50'), 125050);
  check('a blank amount is null', M.cents(''), null);

  let r = M.addPost({ date: '2026-09-21', channel: 'instagram', format: 'short_video', pillar: 'Money habits', hook: 'The one number', cta: 'dm', minutes: '25' });
  checkTrue('a post logs with a date', r.ok);
  checkTrue('its results start blank, not zero', Object.values(r.post.results).every(v => v === null));
  check('and it has no results date', r.post.resultsAt, null);
  check('a post without a date is refused', M.addPost({ channel: 'x' }).ok, false);
  check('a post with a bad count is refused, and nothing is written', M.addPost({ date: '2026-09-22', minutes: 'ten' }).bad.join(','), 'minutes');
  check('the log has one post', M.posts().length, 1);
  const id = r.post.id;
  r = M.updatePost(id, { results: { impressions: '1,200', likes: '40', saves: '' } });
  checkTrue('results type in later', r.ok && r.post.results.impressions === 1200 && r.post.results.likes === 40);
  check('a blank result stays null', r.post.results.saves, null);
  checkTrue('and the results date is set', /^\d{4}-\d{2}-\d{2}$/.test(r.post.resultsAt));
  check('a bad result refuses the whole save', M.updatePost(id, { results: { likes: 'many' } }).ok, false);
  check('...and the good values stand', M.post(id).results.likes, 40);
  checkTrue('everything lives under mkt. keys', Object.keys(s.store).every(k => k.indexOf('mkt.') === 0), Object.keys(s.store).join(','));

  r = M.addPerson({ name: 'Sam Lee', email: 'SAM@example.com', stage: 'conversation', tags: 'parent, small business', value: '', cadence: null });
  checkTrue('a person adds with a name', r.ok);
  check('the stage is recorded with a date', r.person.stageHistory.length, 1);
  check('tags split on commas', r.person.tags.join('|'), 'parent|small business');
  check('a blank cadence means the stage\'s rhythm', r.person.cadence, null);
  check('no name is refused', M.addPerson({ email: 'x@y.z' }).ok, false);
  check('an unknown stage is refused', M.addPerson({ name: 'A', stage: 'vip' }).ok, false);
  const pid = r.person.id;
  M.setStage(pid, 'lead', '2026-09-24');
  check('a stage change appends history', M.person(pid).stageHistory.map(h => h.stage).join(','), 'conversation,lead');
  M.setStage(pid, 'lead');
  check('the same stage again appends nothing', M.person(pid).stageHistory.length, 2);
  check('cadence zero means never', M.updatePerson(pid, { cadence: '0' }).person.cadence, 0);
  check('a bad cadence is refused', M.updatePerson(pid, { cadence: 'weekly' }).ok, false);
  check('a bad date to contact them on is refused', M.updatePerson(pid, { nextAt: 'soon' }).ok, false);
  check('a dollar value stores as cents', M.updatePerson(pid, { value: '1,200' }).person.value, 120000);

  r = M.addTouch({ personId: pid, date: '2026-09-25', kind: 'dm', lane: 'warm', outcome: 'replied' });
  checkTrue('a touch logs against a person', r.ok && r.touch.direction === 'out');
  check('a touch for nobody is refused', M.addTouch({ personId: 'nope' }).ok, false);
  check('a touch with a bad date is refused', M.addTouch({ personId: pid, date: 'last tuesday' }).bad.join(','), 'date');
  checkTrue('a touch with no date is today', /^\d{4}-\d{2}-\d{2}$/.test(M.addTouch({ personId: pid }).touch.date));
  M.removePerson(pid);
  check('removing a person removes their touches', M.touches().length, 0);

  check('a target is null until typed', M.target('postsPerWeek'), null);
  M.setTarget('postsPerWeek', '5');
  check('a target types in', M.target('postsPerWeek'), 5);
  check('a bad target is refused', M.setTarget('postsPerWeek', 'lots'), false);
  M.setTarget('postsPerWeek', '');
  check('a blank clears it', M.target('postsPerWeek'), null);
  done();
}

section('Files: save, load, and the demo (MD-002, MD-004)');
{
  const { M, Demo } = fresh();
  M.loadDemo(Demo.build(TODAY));
  checkTrue('the demo loads posts, people and touches', M.posts().length > 40 && M.people().length === 24 && M.touches().length > 20);
  checkTrue('and is marked as the demo', M.isDemo());
  const demo = Demo.build(TODAY);
  checkTrue('the demo is the same every time', JSON.stringify(demo) === JSON.stringify(Demo.build(TODAY)));
  checkTrue('no demo date is in the future', demo.posts.concat(demo.touches).every(x => x.date <= TODAY) && demo.people.every(p => p.stageHistory.every(h => h.at <= TODAY)));
  checkTrue('every demo email is at example.com', demo.people.every(p => /@example\.com$/.test(p.email)));
  checkTrue('every demo post carries every result key', demo.posts.every(p => Object.keys(p.results).length === 9));
  const file = M.exportAll();
  check('the export carries the signature', file.mktExport, 1);
  M.clearAll();
  check('clearing empties it', M.posts().length + M.people().length, 0);
  check('a stranger file is refused', M.importAll({ posts: [] }).ok, false);
  const r = M.importAll(file, { replace: true });
  checkTrue('loading the file brings everything back', r.ok && M.posts().length === file.posts.length && M.people().length === 24);
  const merged = M.importAll(file, {});
  check('loading it again merges nothing twice', merged.posts + merged.people + merged.touches, 0);
  checkTrue('the filenames are the ones .gitignore refuses', /^scoreboard-all-\d{4}-\d{2}-\d{2}\.mkt\.json$/.test(M.filename('all')) && /^scoreboard-people-.*\.csv$/.test(M.filename('people')));
  done();
}

/* ======================================================================
   Imports: any sheet's columns
   ====================================================================== */
section('Importing contacts and posts (MD-002)');
{
  const { M, Csv } = fresh();
  const linkedin = 'Notes:\n"When exporting your connection data, you may notice that some of the email addresses are missing."\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\nAda,Okafor,https://www.linkedin.com/in/ada,ada@example.com,Northwind,Founder,12 Aug 2026\nBen,Sato,https://www.linkedin.com/in/ben,,Bramble,Owner,03 Sep 2026\n';
  const lines = linkedin.split('\n'); let start = 0; for (let i = 0; i < 6; i++) if (/first name/i.test(lines[i]) && /last name/i.test(lines[i])) { start = i; break; }
  const text = lines.slice(start).join('\n');
  let m = M.mapContacts(Csv.records(text), { headers: Csv.parse(text).headers });
  check('a LinkedIn connections export reads: two people', m.people.length, 2);
  check('first and last name join', m.people[0].name, 'Ada Okafor');
  check('the URL is the handle', m.people[0].handle, 'https://www.linkedin.com/in/ada');
  check('Position is the role', m.people[0].role, 'Founder');
  check('Connected On is when they were added', m.people[0].createdAt.slice(0, 10), '2026-08-12');
  check('imported people start as strangers', m.people[1].stage, 'stranger');
  M.addPeople(m.people);
  const google = 'Name,Given Name,Family Name,E-mail 1 - Value,Phone 1 - Value,Organization 1 - Name,Group Membership\nAda Okafor,Ada,Okafor,ada@example.com,,Northwind,* myContacts\nCleo Marsh,Cleo,Marsh,cleo@example.com,555-0100,Halcyon Physio,* myContacts ::: clients\n';
  m = M.mapContacts(Csv.records(google), { headers: Csv.parse(google).headers });
  check('a Google contacts export reads, and the person already here is skipped', m.people.length, 1);
  check('...by email', m.skipped[0].why, 'already here: Ada Okafor');
  check('the phone reads', m.people[0].phone, '555-0100');
  const plain = 'name;company;stage;tags\nDev Patel;Tidewater;lead;parent, small business\n;Nobody;;\n';
  m = M.mapContacts(Csv.records(plain), { headers: Csv.parse(plain).headers });
  check('a semicolon sheet with a stage column reads the stage', m.people[0].stage, 'lead');
  check('a row without a name is skipped', m.skipped.length, 1);
  const posts = 'Date,Platform,Title,Views,Likes,Comments,Follows\n2026-09-01,instagram,First one,"1,500",60,,3\nyesterday,instagram,Bad date,10,1,,\n2026-09-02,linkedin,Second,800,,,\n';
  const mp = M.mapPosts(Csv.records(posts), { headers: Csv.parse(posts).headers });
  check('a posts sheet reads two of three rows', mp.posts.length, 2);
  check('the bad date is skipped and named', mp.skipped[0].why, 'bad date');
  check('Views is reach', mp.posts[0].results.impressions, 1500);
  check('a blank comments cell is null, not zero', mp.posts[0].results.comments, null);
  check('a post with reach and nothing else counts as checked', require(A('engines/kpi.js')).postResults(mp.posts[1]).checked, true);
  done();
}

/* ======================================================================
   The readings
   ====================================================================== */
section('The readings (MD-003)');
{
  const { K, T } = fresh();
  const P = (date, results, extra) => Object.assign({ id: 'p' + date + Math.random(), date, channel: 'instagram', format: 'text', pillar: 'x', hook: '', cta: 'none', minutes: null, results: Object.assign({ impressions: null, likes: null, comments: null, shares: null, saves: null, clicks: null, dms: null, follows: null, leads: null }, results || {}) }, extra || {});
  check('the week starts on Monday', K.weekStart('2026-09-26'), '2026-09-21');
  check('...including for a Sunday', K.weekStart('2026-09-27'), '2026-09-21');
  check('...and a Monday', K.weekStart('2026-09-21'), '2026-09-21');

  let r = K.postResults(P('2026-09-01'));
  check('a post with no results is unchecked', r.checked, false);
  check('...and its engagement rate is null, not 0%', r.engagementRate, null);
  r = K.postResults(P('2026-09-01', { impressions: 1000, likes: 30, saves: 20 }));
  check('engagements add the four that were typed', r.engagements, 50);
  check('engagement rate is engagements over reach', r.engagementRate, 0.05);
  check('a rate with a blank on top is null', K.postResults(P('2026-09-01', { impressions: 1000 })).engagementRate, null);
  check('a rate with zero reach is null, never infinity', K.postResults(P('2026-09-01', { impressions: 0, likes: 3 })).engagementRate, null);

  const empty = K.period({ posts: [], people: [], touches: [] }, { from: '2026-09-01', to: '2026-09-30' });
  check('an empty period counts zero posts', empty.posts, 0);
  check('...but its reach is null, not zero', empty.impressions, null);
  check('...and its reply rate is null', empty.replyRate, null);
  check('...and its hours are null', empty.hours, null);

  const posts = [P('2026-09-01', { impressions: 1000, likes: 50 }, { minutes: 30 }), P('2026-09-02', { impressions: 3000, likes: 100, follows: 12 }, { minutes: 90 }), P('2026-09-03'), P('2026-08-20', { impressions: 999999 })];
  const people = [
    { id: 'a', name: 'A', stage: 'lead', stageHistory: [{ stage: 'conversation', at: '2026-08-30' }, { stage: 'lead', at: '2026-09-05' }], value: null, archived: false, createdAt: '2026-08-30T12:00:00Z' },
    { id: 'b', name: 'B', stage: 'client', stageHistory: [{ stage: 'lead', at: '2026-09-06' }, { stage: 'call', at: '2026-09-08' }, { stage: 'client', at: '2026-09-12' }], value: 250000, archived: false, createdAt: '2026-09-01T12:00:00Z' },
    { id: 'c', name: 'C', stage: 'follower', stageHistory: [{ stage: 'follower', at: '2026-09-10' }], value: null, archived: false, createdAt: '2026-09-10T12:00:00Z' },
    { id: 'd', name: 'D', stage: 'call', stageHistory: [{ stage: 'call', at: '2026-07-01' }], value: null, archived: false, createdAt: '2026-07-01T12:00:00Z' }
  ];
  const touches = [
    { id: 't1', personId: 'a', date: '2026-09-02', kind: 'dm', lane: 'warm', direction: 'out', outcome: 'none' },
    { id: 't2', personId: 'a', date: '2026-09-04', kind: 'dm', lane: 'warm', direction: 'out', outcome: 'replied' },
    { id: 't3', personId: 'b', date: '2026-09-05', kind: 'email', lane: 'cold', direction: 'out', outcome: 'none' },
    { id: 't4', personId: 'c', date: '2026-09-11', kind: 'dm', lane: 'content', direction: 'in', outcome: 'none' },
    { id: 't5', personId: 'd', date: '2026-09-11', kind: 'call', lane: 'warm', direction: 'out', outcome: 'booked' },
    { id: 't6', personId: 'b', date: '2026-08-01', kind: 'email', lane: 'cold', direction: 'out', outcome: 'none' }
  ];
  const data = { posts, people, touches };
  const p = K.period(data, { from: '2026-09-01', to: '2026-09-30' });
  check('posts in the period', p.posts, 3);
  check('posts with results', p.postsChecked, 2);
  check('reach adds only the period\'s posts', p.impressions, 4000);
  check('engagement rate over the period', p.engagementRate, 150 / 4000);
  check('new followers add', p.follows, 12);
  check('hours from minutes, one decimal', p.hours, 2);
  check('reach-outs are the outgoing touches in the period', p.outreach, 4);
  check('people reached, counted once', p.peopleReached, 3);
  check('conversations: replied or reached out first, once a person', p.conversations, 3);
  check('reply rate is repliers among those reached out to', p.replyRate, 2 / 3);
  check('leads are stage changes to lead in the period', p.leads, 2);
  check('calls: the stage change, plus a booked touch for someone whose stage did not say so', p.calls, 2);
  check('clients won', p.clients, 1);
  check('revenue is the client\'s value', p.revenue, 250000);
  check('hours a lead', p.hoursPerLead, 1);
  check('lanes count outgoing touches', p.lanes.warm + ',' + p.lanes.cold + ',' + p.lanes.content, '3,1,0');

  const f = K.funnel(data, { from: '2026-09-01', to: '2026-09-30' });
  check('the funnel has seven steps', f.steps.length, 7);
  check('each step is a share of the last step that had a number', f.steps[1].ofPrevious, 150 / 4000);
  check('a step with null carries no share', f.steps[0].ofPrevious, null);
  checkTrue('the worst drop is named', f.worst !== null);

  const ch = K.byChannel(posts.filter(x => x.date >= '2026-09-01'));
  check('by channel groups the posts', ch[0].id + ':' + ch[0].posts, 'instagram:3');
  const w = K.weekly(data, { weeks: 4, to: '2026-09-26' });
  check('weekly gives one column a week', w.x.length, 4);
  check('the first column is the Monday four weeks back', w.starts[0], '2026-08-31');
  check('the week with the posts', w.series.posts[0], 3);
  check('a week with no results has null reach, not zero', w.series.impressions[3], null);

  const sc = K.scorecard({ posts: [P('2026-09-21'), P('2026-09-22'), P('2026-09-23')], people: [], touches: [] }, { postsPerWeek: 5, leadsPerWeek: 3 }, '2026-09-23');
  check('the scorecard reads this week', sc.rows[0].actual, 3);
  check('pace: three of seven days in, expected is 3/7 of the target', sc.rows[0].expected, 2.1);
  check('on pace when ahead of expected', sc.rows[0].zone, 'good');
  check('behind when far under', sc.rows[3].zone, 'out');
  check('no target means no zone', sc.rows[1].zone, 'none');
  check('done when the target is hit', K.scorecard({ posts: [1, 2, 3, 4, 5].map(i => P('2026-09-2' + i)), people: [], touches: [] }, { postsPerWeek: 5 }, '2026-09-26').rows[0].zone, 'done');

  const streakPosts = [].concat(...['2026-09-21', '2026-09-14', '2026-09-07'].map(d => [P(d), P(d)]), [P('2026-08-31')]);
  check('a streak counts weeks in a row on target, from this week', K.streak(streakPosts, 2, '2026-09-26'), 3);
  check('...and this week does not break it while it is still running', K.streak(streakPosts.slice(2), 2, '2026-09-26'), 2);
  check('no target, no streak', K.streak(streakPosts, null, '2026-09-26'), null);

  const best = K.bestPosts(posts, { n: 2 });
  check('best posts rank by engagement rate above the reach floor', best[0].post.date, '2026-09-01');
  done();
}

section('When and how to contact someone (MD-003)');
{
  const { K, T } = fresh();
  const S = T.tables.stages;
  const person = (o) => Object.assign({ id: 'x', name: 'X', stage: 'conversation', cadence: null, nextAt: null, archived: false }, o || {});
  let n = K.nextTouch(person(), [], S, {}, TODAY);
  check('never touched: due today', n.status, 'today');
  check('...with the stage\'s how', n.how, S.filter(s => s.id === 'conversation')[0].how);
  n = K.nextTouch(person(), [{ personId: 'x', date: '2026-09-15', direction: 'out', outcome: 'none' }], S, {}, TODAY);
  check('in conversation, every 7 days: touched the 15th, due the 22nd, four days over', n.when + ' ' + n.status + ' ' + n.daysOver, '2026-09-22 overdue 4');
  n = K.nextTouch(person({ cadence: 30 }), [{ personId: 'x', date: '2026-09-15', direction: 'out', outcome: 'none' }], S, {}, TODAY);
  check('a person\'s own rhythm wins', n.when, '2026-10-15');
  n = K.nextTouch(person({ cadence: 0 }), [{ personId: 'x', date: '2026-09-15', direction: 'out', outcome: 'none' }], S, {}, TODAY);
  check('a cadence of zero is never', n.status, 'never');
  n = K.nextTouch(person({ stage: 'stranger' }), [], S, {}, TODAY);
  check('a stranger has no rhythm', n.status, 'never');
  n = K.nextTouch(person({ nextAt: '2026-09-28' }), [], S, {}, TODAY);
  check('a date you set wins over everything', n.when + ' ' + n.status, '2026-09-28 soon');
  n = K.nextTouch(person(), [{ personId: 'x', date: '2026-09-25', direction: 'out', outcome: 'none' }], S, { conversation: 3 }, TODAY);
  check('a settings rhythm for the stage is used before the table\'s', n.when, '2026-09-28');
  const three = ['2026-09-01', '2026-09-08', '2026-09-15'].map(d => ({ personId: 'x', date: d, direction: 'out', outcome: 'none' }));
  n = K.nextTouch(person(), three, S, {}, TODAY);
  checkTrue('three unanswered reach-outs change the advice', /Three unanswered/.test(n.how));
  const list = K.due([person({ id: 'a' }), person({ id: 'b', stage: 'stranger' }), person({ id: 'c', nextAt: '2026-09-01' }), person({ id: 'd', archived: true })], [], S, {}, TODAY);
  check('due lists everyone not archived', list.length, 3);
  check('most overdue first', list[0].personId, 'c');
  check('never last', list[2].personId, 'b');
  done();
}

section('Against the period before, what works, attribution, the read (MD-009)');
{
  const { K, T, Demo } = fresh();
  const P = (date, results, extra) => Object.assign({ id: 'p' + date + Math.random(), date, channel: 'instagram', format: 'text', pillar: 'x', hook: '', cta: 'none', minutes: null, results: Object.assign({ impressions: null, likes: null, comments: null, shares: null, saves: null, clicks: null, dms: null, follows: null, leads: null }, results || {}) }, extra || {});
  const posts = [P('2026-09-20', { impressions: 2000, likes: 100 }), P('2026-09-10', { impressions: 1000, likes: 20 }), P('2026-09-01', { impressions: 500 }, { cta: 'book', results: { impressions: 500, leads: 2 } }), P('2026-08-25', { impressions: 1000, likes: 50 })];
  const c = K.compare({ posts, people: [], touches: [] }, { from: '2026-09-01', to: '2026-09-30' });
  check('the period before is the same length, ending the day before', c.before.from + '..' + c.before.to, '2026-08-02..2026-08-31');
  check('reach against before, as a share', c.delta.impressions.pct, 2.5);
  check('...and it is better', c.delta.impressions.better, true);
  check('a figure null in either period has no delta', c.delta.follows, undefined);
  check('all time has nothing to compare against', K.compare({ posts, people: [], touches: [] }, { from: null, to: '2026-09-30' }).before, null);
  const lower = K.compare({ posts: [P('2026-09-05', {}, { minutes: 120 }), P('2026-08-05', {}, { minutes: 60 })], people: [], touches: [] }, { from: '2026-09-01', to: '2026-09-30' });
  check('more hours is worse, not better', lower.delta.hours.better, false);

  const cta = K.byCta(posts.filter(p => p.date >= '2026-09-01'));
  check('by ask ranks by leads a post', cta[0].id + ':' + cta[0].leadsPerPost, 'book:2');
  const wd = K.byWeekday(posts);
  check('by weekday has seven rows, Monday first', wd.length + ':' + wd[0].id, '7:Mon');
  check('Sep 20 2026 is a Sunday', wd[6].posts, 1);
  const h = K.heatmap(posts, { weeks: 2, to: '2026-09-26' });
  check('the heatmap has a column a week and a cell a day', h.cells.length + 'x' + h.cells[0].length, '2x7');
  check('the day with a post counts it (Sunday of the first week)', h.cells[0][6].count, 1);
  check('today is not future', h.cells[1][5].future, false);
  check('tomorrow is', h.cells[1][6].future, true);
  checkTrue('a day after today is future', K.heatmap(posts, { weeks: 1, to: '2026-09-23' }).cells[0][6].future);

  const people = [
    { id: 'a', name: 'A', stage: 'client', source: 'referral', fromPostId: posts[0].id, value: 100000, archived: false, stageHistory: [{ stage: 'conversation', at: '2026-09-01' }, { stage: 'lead', at: '2026-09-04' }, { stage: 'call', at: '2026-09-06' }, { stage: 'client', at: '2026-09-14' }] },
    { id: 'b', name: 'B', stage: 'lead', source: 'referral', fromPostId: null, value: null, archived: false, stageHistory: [{ stage: 'conversation', at: '2026-09-02' }, { stage: 'lead', at: '2026-09-09' }] },
    { id: 'c', name: 'C', stage: 'follower', source: 'cold', fromPostId: 'gone', value: null, archived: false, stageHistory: [{ stage: 'follower', at: '2026-09-02' }] },
    { id: 'd', name: 'D', stage: 'client', source: 'cold', fromPostId: null, value: 50000, archived: true, stageHistory: [{ stage: 'client', at: '2026-09-02' }] }
  ];
  const a = K.attribution(people, posts, { from: '2026-09-01', to: '2026-09-30' });
  check('by lane: referrals brought two people, two leads, one client', a.byLane[0].id + ':' + a.byLane[0].people + ':' + a.byLane[0].leads + ':' + a.byLane[0].clients + ':' + a.byLane[0].revenue, 'referral:2:2:1:100000');
  check('an archived person is left out', a.byLane.reduce((n, g) => n + g.people, 0), 3);
  check('by channel counts only people linked to a post that exists', a.byChannel.length + ':' + a.byChannel[0].id + ':' + a.byChannel[0].people, '1:instagram:1');
  check('and says how many are linked', a.linked + ' of ' + (a.linked + a.unlinked), '1 of 3');
  const cv = K.conversion(people);
  check('conversation to lead, all time', cv.leadRate, 1);
  check('lead to call', cv.callRate, 0.5);
  check('days from lead to client, the middle case', cv.daysToClose, 10);
  check('days from conversation to lead', cv.daysToLead, 5);
  check('nobody: no rates, no days', K.conversion([]).leadRate === null && K.conversion([]).daysToClose === null, true);

  const demo = Demo.build(TODAY);
  const L = {}; ['targets', 'channels', 'formats'].forEach(k => { L[k] = {}; T.tables[k].forEach(r => { L[k][r.id] = r.label; }); });
  const due = K.due(demo.people, demo.touches, T.tables.stages, {}, TODAY);
  const read = K.insights(demo, { today: TODAY, range: { from: '2026-08-28', to: TODAY }, targets: demo.targets, labels: L, people: due, max: 7 });
  checkTrue('the read is a handful of sentences', read.length >= 3 && read.length <= 7);
  checkTrue('each one is short, plain, and ends with a full stop', read.every(i => /[.]$/.test(i.text) && i.text.indexOf('—') === -1 && i.text.length < 220), read.map(i => i.text).join(' | '));
  checkTrue('the worst comes first', read.map(i => ({ bad: 0, watch: 1, good: 2, info: 3 })[i.kind]).every((v, i, arr) => i === 0 || v >= arr[i - 1]));
  checkTrue('an overdue person is named', read.some(i => /overdue for a touch/.test(i.text)));
  const emptyRead = K.insights({ posts: [], people: [], touches: [] }, { today: TODAY, range: { from: '2026-09-01', to: TODAY }, targets: {}, labels: L, people: [] });
  check('nothing logged: one sentence that says what to do', emptyRead.length + ':' + emptyRead[0].kind, '1:info');
  const f = K.funnel(demo, { from: '2026-07-05', to: TODAY });
  checkTrue('the worst funnel step is judged among the people steps', ['conversations', 'leads', 'calls', 'clients'].indexOf(f.worst) !== -1, f.worst);
  done();
}

/* ---- Report --------------------------------------------------------------- */
console.log('\n' + '-'.repeat(66));
if (!failures.length) { console.log('ok ' + passed + ' marketing checks passed'); process.exit(0); }
console.log('FAIL ' + failures.length + ' failed, ' + passed + ' passed\n');
failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
process.exit(1);
