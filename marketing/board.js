/* marketing/board.js, the Scoreboard screen (MD-006, MD-009). See index.html. */
(function () {
  'use strict';
  var UI = SLAF.MktUI, M = SLAF.Mkt, K = SLAF.KPI, el = UI.el, esc = UI.esc;
  var T = null, TODAY = UI.today();

  function data() { return { posts: M.posts(), people: M.people(), touches: M.touches() }; }
  /* A blank target means the usual one from data/tables.json; a typed number wins. */
  function targets() { var out = {}; T.tables.targets.forEach(function (t) { var v = M.target(t.id); out[t.id] = v === null ? t.default : v; }); return out; }
  function labels() { var L = {}; ['targets', 'channels', 'formats', 'ctas', 'lanes', 'sources', 'stages'].forEach(function (k) { L[k] = {}; T.tables[k].forEach(function (r) { L[k][r.id] = r.label; }); }); return L; }
  function range() {
    var v = el('period').value;
    if (v === 'all') return { from: null, to: TODAY, label: 'all time', days: null };
    return { from: K.addDays(TODAY, -(Number(v) - 1)), to: TODAY, label: 'last ' + v + ' days', days: Number(v) };
  }
  function inRange(p, r) { return (!r.from || p.date >= r.from) && p.date <= r.to; }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function tile(id, label, value, o) {
    o = o || {};
    return '<div class="stat' + (o.zone ? ' zone-' + o.zone : '') + '"><div class="lbl"><span>' + esc(label) + '</span>' + UI.help('readout', o.help || id, T, label) + '</div>'
      + '<div class="now' + (value === 'not yet' ? ' is-none' : '') + '">' + esc(value) + '</div>' + (o.sub ? '<div class="' + (o.zone ? 'word' : 'was') + '">' + esc(o.sub) + '</div>' : '') + (o.extra || '') + '</div>';
  }
  function delta(d, o) {
    o = o || {};
    if (!d || d.better === null) return d ? '<div class="delta"><span>no change</span></div>' : '<div class="delta"><span>' + esc(o.none || 'no earlier period to compare') + '</span></div>';
    var text = d.pct === null ? (d.abs > 0 ? '+' : '') + (o.fmt ? o.fmt(d.abs) : d.abs) : (d.pct > 0 ? '+' : '') + UI.pct(d.pct);
    return '<div class="delta ' + (d.better ? 'up' : 'down') + '"><span class="arrow" aria-hidden="true">' + (d.abs > 0 ? '▲' : '▼') + '</span><b>' + esc(text) + '</b><span>' + esc(o.vs || 'vs before') + '</span></div>';
  }

  /* ---- This week's read -------------------------------------------------------- */
  function drawRead() {
    var r = range(), L = labels();
    var due = K.due(M.people(), M.touches(), T.tables.stages, M.settings().cadences, TODAY);
    var list = K.insights(data(), { today: TODAY, range: r, targets: targets(), labels: L, people: due, max: 7 });
    el('read-when').textContent = 'Read on ' + UI.day(TODAY) + ', over the ' + r.label;
    el('read').innerHTML = list.map(function (i) { return '<li class="' + i.kind + '"><span>' + esc(i.text) + (i.href ? ' <a href="' + esc(i.href) + '">open</a>' : '') + '</span></li>'; }).join('');
    var streak = K.streak(M.posts(), targets().postsPerWeek, TODAY);
    el('streak').innerHTML = '<div class="big">' + (streak === null ? '–' : streak) + '</div><div class="l">' + (streak === null ? 'set a posts target for a streak' : (streak === 1 ? 'week' : 'weeks') + ' in a row on target') + '</div>' + UI.help('readout', 'streak', T, 'Streak');
  }

  /* ---- This week ---------------------------------------------------------------- */
  function drawWeek() {
    var sc = K.scorecard(data(), targets(), TODAY);
    el('week-range').textContent = UI.day(sc.from) + ' to ' + UI.day(sc.to);
    var words = { done: 'target hit', good: 'on pace', watch: 'a little behind', out: 'behind', none: 'no target set' };
    el('week').innerHTML = sc.rows.map(function (r) {
      var t = T.tables.targets.filter(function (x) { return x.id === r.id; })[0];
      var share = r.target ? Math.min(1, r.actual / r.target) : 0, paceAt = r.target ? Math.min(1, sc.elapsed) : 0;
      var extra = '<div class="pace" aria-hidden="true"><i style="width:' + (share * 100).toFixed(0) + '%"></i>' + (r.target ? '<b style="left:' + (paceAt * 100).toFixed(0) + '%"></b>' : '') + '</div>';
      var usual = M.target(r.id) === null;
      var sub = r.target === null ? 'no target set' : r.zone === 'done' ? 'target hit: ' + r.target : r.actual + ' of ' + r.target + (usual ? ' (the usual)' : '') + ', ' + words[r.zone];
      return tile(r.id, t.label, String(r.actual), { zone: r.zone, sub: sub, extra: extra, help: r.read });
    }).join('');
    T.tables.targets.forEach(function (t) { var box = document.querySelector('[data-target="' + t.id + '"]'); if (box && document.activeElement !== box) { box.value = M.target(t.id) === null ? '' : M.target(t.id); box.placeholder = 'usual: ' + t.default; } });
  }
  document.addEventListener('change', function (e) {
    var t = e.target.closest && e.target.closest('[data-target]'); if (!t) return;
    if (!M.setTarget(t.getAttribute('data-target'), t.value)) { t.classList.add('is-bad'); return; }
    t.classList.remove('is-bad'); drawWeek(); drawRead();
  });

  /* ---- The numbers ------------------------------------------------------------- */
  function drawNumbers() {
    var r = range(), c = K.compare(data(), r), p = c.now, d = c.delta;
    var vs = c.before ? 'vs previous ' + c.days + ' days' : '';
    var unchecked = p.posts - p.postsChecked;
    el('period-note').textContent = c.before ? 'Each number against the ' + c.days + ' days before it.' : 'All time; nothing to compare against.';
    var G = T.tables.goodEngagementRate, R = T.tables.goodReplyRate;
    el('numbers').innerHTML = [
      tile('posts', 'Posts', String(p.posts), { sub: unchecked ? unchecked + ' without results yet' : '', extra: delta(d.posts, { vs: vs }) }),
      tile('impressions', 'Reach', UI.n(p.impressions), { sub: p.postsChecked ? 'across ' + p.postsChecked + ' posts' : 'type results on a post', extra: delta(d.impressions, { vs: vs }) }),
      tile('engagementRate', 'Engagement rate', UI.pct(p.engagementRate), { zone: p.engagementRate === null ? null : p.engagementRate >= G.good ? 'good' : p.engagementRate >= G.watch ? 'watch' : 'out', sub: p.engagements === null ? '' : UI.n(p.engagements) + ' engagements', extra: delta(d.engagementRate, { vs: vs, fmt: function (v) { return UI.pct(v); } }) }),
      tile('follows', 'New followers', UI.n(p.follows), { sub: p.follows !== null && p.impressions ? UI.pct(p.follows / p.impressions) + ' of reach' : '', extra: delta(d.follows, { vs: vs }) }),
      tile('hours', 'Content hours', p.hours === null ? 'not yet' : String(p.hours), { sub: p.hoursPerLead === null ? 'type minutes on posts' : p.hoursPerLead + ' hours a lead', help: 'hours', extra: delta(d.hoursPerLead, { vs: 'a lead, vs before' }) }),
      tile('outreach', 'Reach-outs', String(p.outreach), { sub: p.peopleReached + ' people', extra: delta(d.outreach, { vs: vs }) }),
      tile('conversations', 'Conversations', String(p.conversations), { sub: p.replyRate === null ? 'no reach-outs yet' : UI.pct(p.replyRate) + ' reply rate', zone: p.replyRate === null ? null : p.replyRate >= R.good ? 'good' : p.replyRate >= R.watch ? 'watch' : 'out', extra: delta(d.conversations, { vs: vs }) }),
      tile('leads', 'Leads', String(p.leads), { sub: p.postLeads !== null ? p.postLeads + ' credited to posts' : '', extra: delta(d.leads, { vs: vs }) }),
      tile('calls', 'Calls booked', String(p.calls), { extra: delta(d.calls, { vs: vs }) }),
      tile('clients', 'Clients won', String(p.clients), { sub: p.revenue === null ? '' : UI.money(p.revenue) + ' agreed', extra: delta(d.revenue, { vs: 'revenue, vs before', fmt: UI.money }) })
    ].join('');
    drawFunnel(r, p); drawWhere(r); drawMoney(r);
  }
  function drawFunnel(r, p) {
    var f = K.funnel(data(), r);
    el('funnel').innerHTML = f.steps.map(function (s, i) {
      var v = num(s.value) ? s.value : null;
      var w = v === null ? 0 : i === 0 || s.ofPrevious === null ? 100 : Math.max(1, Math.min(100, s.ofPrevious * 100));
      return '<li class="' + (s.id === f.worst ? 'is-worst' : '') + (i < 3 ? ' is-post' : '') + '"><span>' + esc(s.label) + '</span><div class="bar-h" aria-hidden="true"><i style="width:' + w.toFixed(1) + '%"></i></div><span class="v">' + UI.n(v) + '</span><span class="r">' + (s.ofPrevious === null ? (i === 0 ? '' : '') : UI.pct(s.ofPrevious)) + '</span></li>';
    }).join('');
    var worst = f.steps.filter(function (s) { return s.id === f.worst; })[0];
    el('funnel-note').textContent = worst ? 'The biggest drop among the people steps is at "' + worst.label.toLowerCase() + '": ' + UI.pct(worst.ofPrevious) + ' of the step before. That is the one thing to work on.' : 'Type results on posts and log touches, and the funnel fills in.';
    el('funnel-help').innerHTML = UI.help('readout', 'funnel', T, 'The funnel');
    var total = p.outreach || 0;
    el('lanes').innerHTML = T.tables.lanes.map(function (l) { var n = p.lanes[l.id] || 0; return '<div class="lane"><div class="n">' + n + '</div><div class="l">' + esc(l.label) + '</div><div class="sub">' + (total ? UI.pct(n / total) : '') + '</div></div>'; }).join('');
    el('lanes-help').innerHTML = UI.help('readout', 'outreach', T, 'Reach-outs');
    el('lanes-note').textContent = total ? total + ' reach-outs to ' + p.peopleReached + ' people, ' + p.conversations + ' conversations.' : 'Log a touch on the People screen and the lanes fill in.';
  }
  function grpRow(g, name) { return '<tr><td>' + esc(name) + '</td><td class="num">' + g.posts + '</td><td class="num">' + UI.n(g.impressions) + '</td><td class="num">' + UI.pct(g.engagementRate) + '</td><td class="num">' + UI.n(g.follows) + '</td><td class="num">' + UI.n(g.leads) + '</td></tr>'; }
  var GHEAD = '<thead><tr><th>%</th><th class="num">Posts</th><th class="num">Reach</th><th class="num">Eng. rate</th><th class="num">Follows</th><th class="num">Leads</th></tr></thead>';
  function drawWhere(r) {
    var posts = M.posts().filter(function (p) { return inRange(p, r); }), L = labels();
    var ch = K.byChannel(posts), fm = K.byFormat(posts), pi = K.byPillar(posts), wd = K.byWeekday(posts), cta = K.byCta(posts);
    el('tbl-channel').innerHTML = GHEAD.replace('%', 'Channel') + '<tbody>' + (ch.length ? ch.map(function (g) { return grpRow(g, L.channels[g.id] || g.id); }).join('') : '<tr><td colspan="6" class="faint">No posts in this period.</td></tr>') + '</tbody>';
    el('tbl-cta').innerHTML = '<thead><tr><th>Ask</th><th class="num">Posts</th><th class="num">Eng. rate</th><th class="num">DMs</th><th class="num">Clicks</th><th class="num">Leads</th><th class="num">Leads a post</th></tr></thead><tbody>'
      + (cta.length ? cta.map(function (g) { return '<tr><td>' + esc(L.ctas[g.id] || g.id) + '</td><td class="num">' + g.posts + '</td><td class="num">' + UI.pct(g.engagementRate) + '</td><td class="num">' + UI.n(g.dms) + '</td><td class="num">' + UI.n(g.clicks) + '</td><td class="num">' + UI.n(g.leads) + '</td><td class="num">' + (g.leadsPerPost === null ? 'not yet' : g.leadsPerPost) + '</td></tr>'; }).join('') : '<tr><td colspan="7" class="faint">No posts in this period.</td></tr>') + '</tbody>';
    var best = K.bestPosts(posts, { n: 5 });
    el('tbl-best').innerHTML = '<thead><tr><th>Date</th><th>Channel</th><th>Format</th><th>Hook</th><th>Ask</th><th class="num">Reach</th><th class="num">Eng. rate</th><th class="num">Saves</th><th class="num">DMs</th><th class="num">Leads</th></tr></thead><tbody>'
      + (best.length ? best.map(function (b) { var q = b.post; return '<tr><td>' + esc(UI.day(q.date)) + '</td><td>' + esc(L.channels[q.channel] || q.channel) + '</td><td>' + esc(L.formats[q.format] || q.format) + '</td><td class="hook" title="' + esc(q.hook) + '">' + esc(q.hook || '(no hook typed)') + '</td><td>' + esc(L.ctas[q.cta] || q.cta) + '</td><td class="num">' + UI.n(q.results.impressions) + '</td><td class="num">' + UI.pct(b.r.engagementRate) + '</td><td class="num">' + UI.n(q.results.saves) + '</td><td class="num">' + UI.n(q.results.dms) + '</td><td class="num">' + UI.n(q.results.leads) + '</td></tr>'; }).join('') : '<tr><td colspan="10" class="faint">Needs posts with reach and engagement typed in.</td></tr>') + '</tbody>';
    var slices = function (list, names, key) { return list.filter(function (g) { return num(g[key]); }).slice(0, 8).map(function (g) { return { id: g.id, label: names ? (names[g.id] || g.id) : (g.id === 'other' ? '(no topic)' : g.id), value: g[key] }; }); };
    UI.chart(el('pic-channel'), 'channel', { kind: 'breakdown', title: 'Reach by channel', unit: 'count', slices: slices(ch, L.channels, 'impressions') }, { height: 220 });
    UI.chart(el('pic-format'), 'format', { kind: 'compare', title: 'Engagement rate by format', unit: 'rate', oneColor: true, slices: slices(fm.slice().sort(function (a, b) { return (b.engagementRate || 0) - (a.engagementRate || 0); }), L.formats, 'engagementRate') }, { height: 220, type: 'hbar' });
    UI.chart(el('pic-pillar'), 'pillar', { kind: 'compare', title: 'Engagement rate by topic', unit: 'rate', oneColor: true, slices: slices(pi.slice().sort(function (a, b) { return (b.engagementRate || 0) - (a.engagementRate || 0); }), null, 'engagementRate') }, { height: 220, type: 'hbar' });
    UI.chart(el('pic-weekday'), 'weekday', { kind: 'compare', title: 'Engagement rate by weekday', unit: 'rate', oneColor: true, slices: wd.filter(function (g) { return num(g.engagementRate); }).map(function (g) { return { id: g.id, label: g.id, value: g.engagementRate }; }) }, { height: 220, type: 'bar' });
    drawHeat();
  }
  function drawHeat() {
    var h = K.heatmap(M.posts(), { weeks: 12, to: TODAY });
    var level = function (n) { return n === 0 ? 0 : h.max <= 1 ? 4 : Math.min(4, Math.ceil(n / h.max * 4)); };
    el('heat').innerHTML = '<div class="heat-days">' + h.weekdays.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div><div class="heat-grid">' + h.cells.map(function (col, i) {
      var s = h.starts[i], d = new Date(s + 'T12:00:00Z'), lbl = (i % 2 === 0) ? (d.getUTCMonth() + 1) + '/' + d.getUTCDate() : '';
      return '<span class="wk">' + lbl + '</span>' + col.map(function (c) { return '<button type="button" class="heat-cell' + (c.future ? ' future' : ' l' + level(c.count)) + (c.date === TODAY ? ' today' : '') + '" aria-label="' + esc(UI.day(c.date) + ': ' + (c.future ? 'not yet' : c.count + (c.count === 1 ? ' post' : ' posts'))) + '" title="' + esc(UI.day(c.date) + ': ' + (c.future ? 'not yet' : c.count + (c.count === 1 ? ' post' : ' posts'))) + '"></button>'; }).join('');
    }).join('') + '</div>';
    el('heat-key').innerHTML = '<span>none</span><i class="heat-cell l0"></i><i class="heat-cell l1"></i><i class="heat-cell l2"></i><i class="heat-cell l3"></i><i class="heat-cell l4"></i><span>' + h.max + ' a day</span>';
    el('heat-note').textContent = h.daysTotal ? 'Posted on ' + h.daysActive + ' of the last ' + h.daysTotal + ' days (' + UI.pct(h.daysActive / h.daysTotal) + ').' : '';
  }
  function drawMoney(r) {
    var L = labels(), a = K.attribution(M.people(), M.posts(), r), c = K.conversion(M.people());
    el('money-note').textContent = a.linked + ' of ' + (a.linked + a.unlinked) + ' people are linked to the post that brought them. Set it on a person under Edit.';
    el('conv').innerHTML = [
      tile('conv-lead', 'Conversation to lead', UI.pct(c.leadRate), { sub: c.reached.lead + ' of ' + c.reached.conversation + ', all time', help: 'leads' }),
      tile('conv-call', 'Lead to call', UI.pct(c.callRate), { sub: c.reached.call + ' of ' + c.reached.lead + ', all time', help: 'calls' }),
      tile('conv-close', 'Call to client', UI.pct(c.closeRate), { sub: c.reached.client + ' of ' + c.reached.call + ', all time', help: 'clients' }),
      tile('conv-days', 'Days from lead to client', c.daysToClose === null ? 'not yet' : String(c.daysToClose), { sub: c.daysToLead === null ? 'the middle case' : 'and ' + c.daysToLead + ' from conversation to lead', help: 'funnel' })
    ].join('');
    var ATTR = '<thead><tr><th>%</th><th class="num">People</th><th class="num">Leads</th><th class="num">Clients</th><th class="num">Revenue</th></tr></thead>';
    var row = function (g, name) { return '<tr><td>' + esc(name) + '</td><td class="num">' + g.people + '</td><td class="num">' + g.leads + '</td><td class="num">' + g.clients + '</td><td class="num">' + UI.money(g.revenue) + '</td></tr>'; };
    el('tbl-lane').innerHTML = ATTR.replace('%', 'Lane') + '<tbody>' + (a.byLane.length ? a.byLane.map(function (g) { return row(g, L.sources[g.id] || g.id); }).join('') : '<tr><td colspan="5" class="faint">Add people, and this fills in.</td></tr>') + '</tbody>';
    el('tbl-attr').innerHTML = ATTR.replace('%', 'Channel') + '<tbody>' + (a.byChannel.length ? a.byChannel.map(function (g) { return row(g, L.channels[g.id] || g.id); }).join('') : '<tr><td colspan="5" class="faint">Nobody is linked to a post yet.</td></tr>') + '</tbody>';
  }

  /* ---- Week by week -------------------------------------------------------------- */
  function drawPics() {
    var w = K.weekly(data(), { weeks: 12, to: TODAY });
    UI.chart(el('pic-posts'), 'posts', { kind: 'series', title: 'Posts a week', unit: 'count', x: w.x, series: [{ id: 'posts', label: 'Posts', values: w.series.posts }] }, { type: 'bar', height: 200 });
    UI.chart(el('pic-reach'), 'reach', { kind: 'series', title: 'Reach a week', unit: 'count', x: w.x, series: [{ id: 'reach', label: 'Reach', values: w.series.impressions }] }, { type: 'area', height: 200 });
    UI.chart(el('pic-outreach'), 'outreach', { kind: 'series', title: 'Reach-outs and conversations', unit: 'count', x: w.x, series: [{ id: 'out', label: 'Reach-outs', values: w.series.outreach }, { id: 'conv', label: 'Conversations', values: w.series.conversations }] }, { type: 'bar', height: 200 });
    UI.chart(el('pic-leads'), 'leads', { kind: 'series', title: 'Leads and calls', unit: 'count', x: w.x, series: [{ id: 'leads', label: 'Leads', values: w.series.leads }, { id: 'calls', label: 'Calls booked', values: w.series.calls }] }, { type: 'line', height: 200 });
  }

  /* ---- Who to contact today ----------------------------------------------------- */
  function drawDue() {
    var list = K.due(M.people(), M.touches(), T.tables.stages, M.settings().cadences, TODAY).filter(function (d) { return d.status === 'overdue' || d.status === 'today'; }).slice(0, 8);
    el('due-help').innerHTML = UI.help('readout', 'due', T, 'Who to contact today');
    el('due').innerHTML = list.length ? list.map(function (d) {
      return '<li class="' + d.status + '"><div class="who"><a href="people.html?person=' + encodeURIComponent(d.person.id) + '">' + esc(d.person.name) + '</a><span class="pill st-' + esc(d.person.stage) + '">' + esc(UI.label(T.tables.stages, d.person.stage)) + '</span><span class="pill ' + d.status + '">' + (d.status === 'overdue' ? d.daysOver + (d.daysOver === 1 ? ' day over' : ' days over') : 'today') + '</span></div>'
        + '<span class="why">' + esc(d.why) + '</span><p class="how">' + esc(d.how) + '</p></li>';
    }).join('') : '<li><span class="mkt-note">Nobody is due. ' + (M.people().length ? 'Nice.' : 'Add people on the People screen.') + '</span></li>';
  }

  /* ---- Share report ------------------------------------------------------------------ */
  function report() {
    var r = range(), L = labels(), c = K.compare(data(), r), p = c.now, d = c.delta, f = K.funnel(data(), r), sc = K.scorecard(data(), targets(), TODAY), a = K.attribution(M.people(), M.posts(), r), cv = K.conversion(M.people());
    var line = function (k, v) { return (k + ' ').padEnd(28, '.') + ' ' + v; };
    var ch = function (key) { var x = d[key]; return !x || x.better === null ? '' : '  (' + (x.pct === null ? (x.abs > 0 ? '+' : '') + x.abs : (x.pct > 0 ? '+' : '') + UI.pct(x.pct)) + ' vs before)'; };
    var out = ['MARKETING SCOREBOARD, ' + r.label + ' (to ' + UI.day(TODAY) + ')', ''];
    out.push('THE READ');
    K.insights(data(), { today: TODAY, range: r, targets: targets(), labels: L, people: K.due(M.people(), M.touches(), T.tables.stages, M.settings().cadences, TODAY), max: 6 }).forEach(function (i) { out.push('- ' + i.text); });
    out.push('', 'CONTENT'); out.push(line('Posts', p.posts + (p.posts - p.postsChecked ? ' (' + (p.posts - p.postsChecked) + ' without results)' : '') + ch('posts')));
    out.push(line('Reach', UI.n(p.impressions) + ch('impressions'))); out.push(line('Engagement rate', UI.pct(p.engagementRate) + ch('engagementRate'))); out.push(line('Saves / comments / shares', UI.n(p.saves) + ' / ' + UI.n(p.comments) + ' / ' + UI.n(p.shares)));
    out.push(line('New followers', UI.n(p.follows) + ch('follows'))); out.push(line('Content hours', p.hours === null ? 'not yet' : p.hours + (p.hoursPerLead === null ? '' : ' (' + p.hoursPerLead + ' a lead)')));
    out.push('', 'PEOPLE'); out.push(line('Reach-outs', p.outreach + ' to ' + p.peopleReached + ' people' + ch('outreach')));
    out.push(line('By lane', T.tables.lanes.map(function (l) { return l.label.toLowerCase() + ' ' + (p.lanes[l.id] || 0); }).join(', ')));
    out.push(line('Conversations', p.conversations + (p.replyRate === null ? '' : ' (' + UI.pct(p.replyRate) + ' reply rate)') + ch('conversations')));
    out.push(line('Leads', p.leads + ch('leads'))); out.push(line('Calls booked', p.calls + ch('calls'))); out.push(line('Clients won', p.clients + (p.revenue === null ? '' : ', ' + UI.money(p.revenue) + ' agreed') + ch('revenue')));
    out.push('', 'FUNNEL (each step as a share of the one before)'); f.steps.forEach(function (s) { out.push(line(s.label, UI.n(s.value) + (s.ofPrevious === null ? '' : '  ' + UI.pct(s.ofPrevious)) + (s.id === f.worst ? '  <- worst drop' : ''))); });
    out.push('', 'CONVERSION, ALL TIME'); out.push(line('Conversation to lead', UI.pct(cv.leadRate))); out.push(line('Lead to call', UI.pct(cv.callRate))); out.push(line('Call to client', UI.pct(cv.closeRate))); out.push(line('Days from lead to client', cv.daysToClose === null ? 'not yet' : String(cv.daysToClose)));
    if (a.byLane.length) { out.push('', 'BY LANE (people, leads, clients, revenue)'); a.byLane.forEach(function (g) { out.push(line(L.sources[g.id] || g.id, g.people + ', ' + g.leads + ', ' + g.clients + ', ' + UI.money(g.revenue))); }); }
    if (a.byChannel.length) { out.push('', 'BY THE POST THAT BROUGHT THEM'); a.byChannel.forEach(function (g) { out.push(line(L.channels[g.id] || g.id, g.people + ', ' + g.leads + ', ' + g.clients + ', ' + UI.money(g.revenue))); }); }
    out.push('', 'THIS WEEK (' + UI.day(sc.from) + ' to ' + UI.day(sc.to) + ')');
    sc.rows.forEach(function (row) { out.push(line(L.targets[row.id], row.actual + (row.target === null ? ' (no target)' : ' of ' + row.target + ', ' + { done: 'hit', good: 'on pace', watch: 'a little behind', out: 'behind' }[row.zone]))); });
    var byCh = K.byChannel(M.posts().filter(function (x) { return inRange(x, r); }));
    if (byCh.length) { out.push('', 'BY CHANNEL'); byCh.forEach(function (g) { out.push(line(L.channels[g.id] || g.id, g.posts + ' posts, reach ' + UI.n(g.impressions) + ', eng. ' + UI.pct(g.engagementRate) + ', leads ' + UI.n(g.leads))); }); }
    out.push('', 'Made with the Marketing Scoreboard. Reach and engagement are the platforms\' own numbers, typed by hand. Blank means not entered, never zero.');
    return out.join('\n');
  }

  /* ---- Wiring -------------------------------------------------------------------------- */
  function wire() {
    el('btn-demo').addEventListener('click', function () { M.loadDemo(SLAF.MktDemo.build(TODAY)); location.reload(); });
    el('btn-targets').addEventListener('click', function () { var open = el('targets').hidden; el('targets').hidden = !open; el('btn-targets').setAttribute('aria-expanded', String(open)); el('btn-targets').textContent = open ? 'Done' : 'Edit targets'; if (open) el('t-posts').focus(); });
    el('period').addEventListener('change', function () { drawNumbers(); drawRead(); });
    el('btn-save').addEventListener('click', function () { UI.download(M.filename('all'), JSON.stringify(M.exportAll(), null, 1)); UI.say('say', 'Saved. Keep that file somewhere safe; it is the only copy.', 'good'); });
    el('file-load').addEventListener('change', function () {
      UI.readFile(el('file-load')).then(function (text) {
        var obj; try { obj = JSON.parse(text); } catch (e) { UI.say('say', 'That is not a Scoreboard file.', 'bad'); return; }
        var replace = M.posts().length + M.people().length > 0 ? confirm('Replace what is here with the file? Cancel merges the file in instead.') : true;
        var r = M.importAll(obj, { replace: replace });
        if (!r.ok) { UI.say('say', r.why, 'bad'); return; }
        location.reload();
      }).catch(function (e) { UI.say('say', e.message, 'bad'); });
    });
    el('btn-share').addEventListener('click', function () { el('share-text').value = report(); el('share-dialog').showModal(); });
    el('share-close').addEventListener('click', function () { el('share-dialog').close(); });
    el('share-save').addEventListener('click', function () { UI.download('scoreboard-report-' + TODAY + '.txt', el('share-text').value, 'text/plain'); });
    el('share-copy').addEventListener('click', function () { el('share-text').select(); try { navigator.clipboard.writeText(el('share-text').value); } catch (e) { document.execCommand('copy'); } el('share-copy').textContent = 'Copied'; setTimeout(function () { el('share-copy').textContent = 'Copy'; }, 1500); });
  }
  function drawAll() { drawRead(); drawWeek(); drawNumbers(); drawPics(); drawDue(); }
  function draw() {
    el('head').innerHTML = UI.header({ screen: 'Scoreboard', title: 'What gets measured', sub: 'Posts, people and the numbers between them. Everything stays in this browser.' });
    el('welcome').hidden = M.posts().length + M.people().length > 0;
    drawAll();
    el('words').innerHTML = UI.words(T);
  }
  UI.boot(function (tables) { T = tables; wire(); draw(); M.onChange(drawAll); });
})();
