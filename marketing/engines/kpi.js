/* ==========================================================================
   marketing/engines/kpi.js, every reading the Scoreboard shows. MD-003.
   --------------------------------------------------------------------------
   Pure: lists in, figures out. Nothing here reads storage or the clock; the
   page passes today. Empty is not zero: a figure nobody typed is null, and
   a rate with a null in it is null, never 0%.

     KPI.postResults(post)               engagements, engagementRate, ctr...
     KPI.weekStart(iso)                  the Monday of that week, ISO date
     KPI.period(data, { from, to })       the readings for a date range
     KPI.funnel(data, { from, to })       stranger to client, step by step
     KPI.byChannel(posts)                one row a channel
     KPI.byPillar(posts)                 one row a topic
     KPI.weekly(data, { weeks, to })      series for the charts, week by week
     KPI.scorecard(data, targets, today) this week against the targets, with pace
     KPI.streak(posts, target, today)    weeks in a row on target
     KPI.bestPosts(posts, o)             ranked by engagement rate
     KPI.nextTouch(person, touches, stages, cadences, today)
     KPI.due(people, touches, stages, cadences, today)   who to contact, in order
     KPI.lanes(touches)                  the Core Four, counted
   data: { posts, people, touches }
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.KPI = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var DAY = 86400000;
  var STAGE_ORDER = { stranger: 0, follower: 1, conversation: 2, lead: 3, call: 4, client: 5, advocate: 6, lost: 7 };
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function sum(list) { var s = null; list.forEach(function (v) { if (num(v)) s = (s === null ? 0 : s) + v; }); return s; }
  function rate(a, b) { return num(a) && num(b) && b > 0 ? a / b : null; }
  function ms(iso) { return Date.parse(iso + 'T12:00:00Z'); }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(d, n) { return iso(ms(d) + n * DAY); }
  function daysBetween(a, b) { return Math.round((ms(b) - ms(a)) / DAY); }
  function inRange(d, r) { return !!d && (!r.from || d >= r.from) && (!r.to || d <= r.to); }
  function weekStart(d) { var t = ms(d), dow = (new Date(t).getUTCDay() + 6) % 7; return iso(t - dow * DAY); }

  /* ---- One post ------------------------------------------------------------- */
  function postResults(p) {
    var r = p.results || {};
    var eng = sum([r.likes, r.comments, r.shares, r.saves]);
    var checked = ['impressions', 'likes', 'comments', 'shares', 'saves', 'clicks', 'dms', 'follows', 'leads'].some(function (k) { return num(r[k]); });
    return { checked: checked, engagements: eng, engagementRate: rate(eng, r.impressions), saveRate: rate(r.saves, r.impressions), commentRate: rate(r.comments, r.impressions),
      ctr: rate(r.clicks, r.impressions), followRate: rate(r.follows, r.impressions), dmRate: rate(r.dms, r.impressions), minutes: num(p.minutes) ? p.minutes : null };
  }

  /* ---- The period ----------------------------------------------------------- */
  function stageEvents(people, stage, r) {
    var n = 0, value = null;
    people.forEach(function (p) { (p.stageHistory || []).forEach(function (h) { if (h.stage === stage && inRange(h.at, r)) { n++; if (stage === 'client' && num(p.value)) value = (value === null ? 0 : value) + p.value; } }); });
    return { count: n, value: value };
  }
  function period(data, r) {
    r = r || {};
    var posts = (data.posts || []).filter(function (p) { return inRange(p.date, r); });
    var touches = (data.touches || []).filter(function (t) { return inRange(t.date, r); });
    var people = data.people || [];
    var rs = posts.map(postResults), checked = rs.filter(function (x) { return x.checked; });
    var impressions = sum(posts.map(function (p) { return p.results && p.results.impressions; }));
    var engagements = sum(rs.map(function (x) { return x.engagements; }));
    var out = {
      from: r.from || null, to: r.to || null,
      posts: posts.length, postsChecked: checked.length,
      impressions: impressions, engagements: engagements, engagementRate: rate(engagements, impressions),
      saves: sum(posts.map(function (p) { return p.results && p.results.saves; })), comments: sum(posts.map(function (p) { return p.results && p.results.comments; })),
      shares: sum(posts.map(function (p) { return p.results && p.results.shares; })), clicks: sum(posts.map(function (p) { return p.results && p.results.clicks; })),
      dms: sum(posts.map(function (p) { return p.results && p.results.dms; })), follows: sum(posts.map(function (p) { return p.results && p.results.follows; })),
      postLeads: sum(posts.map(function (p) { return p.results && p.results.leads; })),
      minutes: sum(rs.map(function (x) { return x.minutes; }))
    };
    out.hours = num(out.minutes) ? Math.round(out.minutes / 6) / 10 : null;
    var outTouches = touches.filter(function (t) { return t.direction === 'out'; });
    var reached = {}, replied = {};
    outTouches.forEach(function (t) { reached[t.personId] = 1; if (t.outcome && t.outcome !== 'none' && t.outcome !== 'declined') replied[t.personId] = 1; });
    touches.filter(function (t) { return t.direction === 'in'; }).forEach(function (t) { replied[t.personId] = 1; });
    out.outreach = outTouches.length; out.peopleReached = Object.keys(reached).length; out.conversations = Object.keys(replied).length;
    out.replyRate = out.peopleReached ? rate(Object.keys(replied).filter(function (id) { return reached[id]; }).length, out.peopleReached) : null;
    out.lanes = lanes(outTouches);
    out.leads = stageEvents(people, 'lead', r).count;
    /* a call booked: the stage change, or a touch marked booked for someone whose stage never said so in the period */
    var calledIds = {}; people.forEach(function (p) { if ((p.stageHistory || []).some(function (h) { return h.stage === 'call' && inRange(h.at, r); })) calledIds[p.id] = 1; });
    var bookedIds = {}; touches.forEach(function (t) { if (t.outcome === 'booked' && !calledIds[t.personId]) bookedIds[t.personId] = 1; });
    out.calls = Object.keys(calledIds).length + Object.keys(bookedIds).length;
    var won = stageEvents(people, 'client', r); out.clients = won.count; out.revenue = won.value;
    out.newPeople = people.filter(function (p) { return inRange(String(p.createdAt || '').slice(0, 10), r); }).length;
    out.hoursPerLead = num(out.hours) && out.leads > 0 ? Math.round(out.hours / out.leads * 10) / 10 : null;
    return out;
  }

  function funnel(data, r) {
    var p = period(data, r);
    var steps = [
      { id: 'impressions', label: 'Reached', value: p.impressions },
      { id: 'engagements', label: 'Engaged', value: p.engagements },
      { id: 'follows', label: 'Followed', value: p.follows },
      { id: 'conversations', label: 'Talked to me', value: p.conversations },
      { id: 'leads', label: 'Became a lead', value: p.leads },
      { id: 'calls', label: 'Booked a call', value: p.calls },
      { id: 'clients', label: 'Became a client', value: p.clients }
    ];
    var prev = null;
    steps.forEach(function (s) { s.ofPrevious = prev === null ? null : rate(s.value, prev.value); if (num(s.value)) prev = s; });
    var worst = null;
    steps.forEach(function (s) { if (num(s.ofPrevious) && (worst === null || s.ofPrevious < worst.ofPrevious)) worst = s; });
    return { steps: steps, worst: worst ? worst.id : null };
  }

  function groupBy(posts, key) {
    var g = {}; posts.forEach(function (p) { var k = (p[key] || '') || 'other'; (g[k] = g[k] || []).push(p); });
    return Object.keys(g).map(function (k) { var pr = period({ posts: g[k], people: [], touches: [] }, {}); return { id: k, posts: g[k].length, impressions: pr.impressions, engagements: pr.engagements, engagementRate: pr.engagementRate, follows: pr.follows, leads: pr.postLeads, hours: pr.hours }; })
      .sort(function (a, b) { return (b.impressions || 0) - (a.impressions || 0) || b.posts - a.posts; });
  }
  function byChannel(posts) { return groupBy(posts, 'channel'); }
  function byPillar(posts) { return groupBy(posts.map(function (p) { return Object.assign({}, p, { pillar: (p.pillar || '').trim().toLowerCase() }); }), 'pillar'); }
  function byFormat(posts) { return groupBy(posts, 'format'); }

  function weekly(data, o) {
    o = o || {}; var n = o.weeks || 12, last = weekStart(o.to), starts = [];
    for (var i = n - 1; i >= 0; i--) starts.push(addDays(last, -7 * i));
    var rows = starts.map(function (s) { return period(data, { from: s, to: addDays(s, 6) }); });
    return { starts: starts, x: starts.map(function (s) { var d = new Date(ms(s)); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); }), rows: rows,
      series: { posts: rows.map(function (r) { return r.posts; }), impressions: rows.map(function (r) { return r.impressions; }), engagements: rows.map(function (r) { return r.engagements; }),
        outreach: rows.map(function (r) { return r.outreach; }), conversations: rows.map(function (r) { return r.conversations; }), leads: rows.map(function (r) { return r.leads; }), follows: rows.map(function (r) { return r.follows; }), calls: rows.map(function (r) { return r.calls; }) } };
  }

  /* ---- This week against the targets ---------------------------------------- */
  var TARGET_READ = { postsPerWeek: 'posts', outreachPerWeek: 'outreach', conversationsPerWeek: 'conversations', leadsPerWeek: 'leads', callsPerWeek: 'calls' };
  function scorecard(data, targets, today) {
    var start = weekStart(today), end = addDays(start, 6), p = period(data, { from: start, to: end });
    var elapsed = (daysBetween(start, today) + 1) / 7;
    var rows = Object.keys(TARGET_READ).map(function (id) {
      var t = targets && num(targets[id]) ? targets[id] : null, actual = p[TARGET_READ[id]];
      var expected = t === null ? null : t * elapsed, zone = 'none';
      if (t !== null) zone = actual >= t ? 'done' : actual >= expected ? 'good' : actual >= expected * 0.6 ? 'watch' : 'out';
      return { id: id, read: TARGET_READ[id], target: t, actual: actual, expected: expected === null ? null : Math.round(expected * 10) / 10, left: t === null ? null : Math.max(0, t - actual), zone: zone };
    });
    return { from: start, to: end, elapsed: Math.round(elapsed * 100) / 100, rows: rows };
  }
  function streak(posts, target, today) {
    if (!num(target) || target <= 0) return null;
    var s = weekStart(today), n = 0, guard = 0;
    var thisWeek = posts.filter(function (p) { return inRange(p.date, { from: s, to: addDays(s, 6) }); }).length;
    if (thisWeek < target) s = addDays(s, -7);       /* the current week counts once it is on target */
    while (guard++ < 520) {
      var c = posts.filter(function (p) { return inRange(p.date, { from: s, to: addDays(s, 6) }); }).length;
      if (c < target) break;
      n++; s = addDays(s, -7);
    }
    return n;
  }
  function bestPosts(posts, o) {
    o = o || {}; var min = num(o.minImpressions) ? o.minImpressions : 100;
    return posts.map(function (p) { return { post: p, r: postResults(p) }; })
      .filter(function (x) { return num(x.r.engagementRate) && x.post.results.impressions >= min; })
      .sort(function (a, b) { return b.r.engagementRate - a.r.engagementRate; }).slice(0, o.n || 5);
  }

  /* ---- People: when and how ------------------------------------------------- */
  function stageOf(stages, id) { return (stages || []).filter(function (s) { return s.id === id; })[0] || null; }
  function nextTouch(person, touches, stages, cadences, today) {
    var st = stageOf(stages, person.stage);
    var mine = (touches || []).filter(function (t) { return t.personId === person.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var last = mine[0] || null;
    var days = num(person.cadence) ? person.cadence : (cadences && num(cadences[person.stage])) ? cadences[person.stage] : (st ? st.cadence : null);
    var out = { personId: person.id, last: last, days: days, how: st ? st.how : '', when: null, status: 'never', daysOver: null, why: '' };
    if (person.nextAt) { out.when = person.nextAt; out.why = 'the date you set'; }
    else if (!num(days) || days === 0) { out.status = 'never'; out.why = days === 0 ? 'set to never' : 'no rhythm for ' + (st ? st.label.toLowerCase() : person.stage); return out; }
    else if (last) { out.when = addDays(last.date, days); out.why = 'every ' + days + (days === 1 ? ' day' : ' days') + ' after the last touch'; }
    else { out.when = today; out.why = 'never touched yet'; }
    var over = daysBetween(out.when, today);
    out.daysOver = over;
    out.status = over > 0 ? 'overdue' : over === 0 ? 'today' : over >= -7 ? 'soon' : 'later';
    if (last && last.direction === 'out' && last.outcome === 'none' && mine.filter(function (t) { return t.direction === 'out' && t.outcome === 'none'; }).length >= 3 && out.status !== 'later') out.how = 'Three unanswered. Try a different channel, or leave it until they post.';
    return out;
  }
  function due(people, touches, stages, cadences, today) {
    var rank = { overdue: 0, today: 1, soon: 2, later: 3, never: 4 };
    return (people || []).filter(function (p) { return !p.archived; }).map(function (p) { return Object.assign({ person: p }, nextTouch(p, touches, stages, cadences, today)); })
      .sort(function (a, b) { return rank[a.status] - rank[b.status] || (b.daysOver || 0) - (a.daysOver || 0) || (STAGE_ORDER[b.person.stage] || 0) - (STAGE_ORDER[a.person.stage] || 0); });
  }
  function lanes(touches) {
    var out = { warm: 0, cold: 0, content: 0, paid: 0, referral: 0 };
    (touches || []).forEach(function (t) { if (t.direction !== 'out') return; out[t.lane] = (out[t.lane] || 0) + 1; });
    return out;
  }
  function pipeline(people) {
    var out = {}; Object.keys(STAGE_ORDER).forEach(function (s) { out[s] = 0; });
    (people || []).forEach(function (p) { if (!p.archived) out[p.stage] = (out[p.stage] || 0) + 1; });
    return out;
  }

  return { STAGE_ORDER: STAGE_ORDER, postResults: postResults, weekStart: weekStart, addDays: addDays, daysBetween: daysBetween, period: period, funnel: funnel,
    byChannel: byChannel, byPillar: byPillar, byFormat: byFormat, weekly: weekly, scorecard: scorecard, streak: streak, bestPosts: bestPosts,
    nextTouch: nextTouch, due: due, lanes: lanes, pipeline: pipeline };
});
