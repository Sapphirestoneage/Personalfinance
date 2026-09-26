/* marketing/board.js, the Scoreboard screen (MD-006). See index.html. */
(function () {
  'use strict';
  var UI = SLAF.MktUI, M = SLAF.Mkt, K = SLAF.KPI, el = UI.el, esc = UI.esc;
  var T = null, TODAY = UI.today();

  function data() { return { posts: M.posts(), people: M.people(), touches: M.touches() }; }
  function targets() { var out = {}; T.tables.targets.forEach(function (t) { out[t.id] = M.target(t.id); }); return out; }
  function range() {
    var v = el('period').value;
    if (v === 'all') return { from: null, to: TODAY, label: 'all time' };
    return { from: K.addDays(TODAY, -(Number(v) - 1)), to: TODAY, label: 'last ' + v + ' days' };
  }
  function tile(id, label, value, opts) {
    var o = opts || {};
    return '<div class="stat' + (o.zone ? ' zone-' + o.zone : '') + '"><div class="lbl"><span>' + esc(label) + '</span>' + UI.help('readout', o.help || id, T, label) + '</div>'
      + '<div class="now' + (value === 'not yet' ? ' is-none' : '') + '">' + esc(value) + '</div>' + (o.sub ? '<div class="' + (o.zone ? 'word' : 'was') + '">' + esc(o.sub) + '</div>' : '') + (o.extra || '') + '</div>';
  }

  /* ---- This week ------------------------------------------------------------- */
  function drawWeek() {
    var sc = K.scorecard(data(), targets(), TODAY);
    el('week-range').textContent = UI.day(sc.from) + ' to ' + UI.day(sc.to);
    var words = { done: 'target hit', good: 'on pace', watch: 'a little behind', out: 'behind', none: 'no target set' };
    el('week').innerHTML = sc.rows.map(function (r) {
      var t = T.tables.targets.filter(function (x) { return x.id === r.id; })[0];
      var share = r.target ? Math.min(1, r.actual / r.target) : 0, paceAt = r.target ? Math.min(1, sc.elapsed) : 0;
      var extra = '<div class="pace" aria-hidden="true"><i style="width:' + (share * 100).toFixed(0) + '%"></i>' + (r.target ? '<b style="left:' + (paceAt * 100).toFixed(0) + '%"></b>' : '') + '</div>'
        + '<div class="lbl" style="margin-top:8px"><label class="inline"><span>Target a week</span><input class="target" type="text" inputmode="numeric" data-target="' + esc(r.id) + '" value="' + (r.target === null ? '' : r.target) + '" aria-label="' + esc(t.label) + ' target"/></label>'
        + (r.target !== null && r.zone !== 'done' ? '<span class="was">' + r.left + ' to go, ' + r.expected + ' by now</span>' : '') + '</div>';
      return tile(r.id, t.label, String(r.actual), { zone: r.zone, sub: words[r.zone], extra: extra, help: r.read });
    }).join('');
    var streak = K.streak(M.posts(), M.target('postsPerWeek'), TODAY);
    el('week').insertAdjacentHTML('beforeend', tile('streak', 'Posting streak', streak === null ? 'not yet' : streak + (streak === 1 ? ' week' : ' weeks'), { sub: streak === null ? 'set a posts target' : 'weeks in a row on target' }));
  }
  document.addEventListener('change', function (e) {
    var t = e.target.closest && e.target.closest('[data-target]'); if (!t) return;
    if (!M.setTarget(t.getAttribute('data-target'), t.value)) { t.classList.add('is-bad'); return; }
    t.classList.remove('is-bad'); drawWeek();
  });

  /* ---- The numbers ------------------------------------------------------------ */
  function drawNumbers() {
    var r = range(), p = K.period(data(), r);
    var unchecked = p.posts - p.postsChecked;
    el('numbers').innerHTML = [
      tile('posts', 'Posts', String(p.posts), { sub: unchecked ? unchecked + ' without results yet' : (p.posts ? 'all with results' : '') }),
      tile('impressions', 'Reach', UI.n(p.impressions), { sub: p.postsChecked ? 'across ' + p.postsChecked + ' posts' : 'type results on a post' }),
      tile('engagementRate', 'Engagement rate', UI.pct(p.engagementRate), { zone: p.engagementRate === null ? null : p.engagementRate >= T.tables.goodEngagementRate.good ? 'good' : p.engagementRate >= T.tables.goodEngagementRate.watch ? 'watch' : 'out', sub: p.engagements === null ? '' : UI.n(p.engagements) + ' engagements' }),
      tile('follows', 'New followers', UI.n(p.follows), { sub: p.follows !== null && p.impressions ? UI.pct(p.follows / p.impressions) + ' of reach' : '' }),
      tile('outreach', 'Reach-outs', String(p.outreach), { sub: p.peopleReached + ' people' }),
      tile('conversations', 'Conversations', String(p.conversations), { sub: p.replyRate === null ? 'no reach-outs yet' : UI.pct(p.replyRate) + ' reply rate', help: 'conversations', zone: p.replyRate === null ? null : p.replyRate >= T.tables.goodReplyRate.good ? 'good' : p.replyRate >= T.tables.goodReplyRate.watch ? 'watch' : 'out' }),
      tile('leads', 'Leads', String(p.leads), { sub: p.postLeads !== null ? p.postLeads + ' credited to posts' : '' }),
      tile('calls', 'Calls booked', String(p.calls)),
      tile('clients', 'Clients won', String(p.clients), { sub: p.revenue === null ? '' : UI.money(p.revenue) + ' agreed' }),
      tile('hours', 'Content hours', p.hours === null ? 'not yet' : String(p.hours), { sub: p.hoursPerLead === null ? 'type minutes on posts' : p.hoursPerLead + ' hours a lead', help: 'hours' })
    ].join('');
    el('lanes').innerHTML = T.tables.lanes.map(function (l) { return '<div class="lane"><div class="n">' + (p.lanes[l.id] || 0) + '</div><div class="l">' + esc(l.label) + '</div></div>'; }).join('');
    drawFunnel(r); drawWhere(r);
  }
  function drawFunnel(r) {
    var f = K.funnel(data(), r), max = null;
    f.steps.forEach(function (s) { if (typeof s.value === 'number' && (max === null || s.value > max)) max = s.value; });
    el('funnel').innerHTML = f.steps.map(function (s) {
      var v = typeof s.value === 'number' ? s.value : null;
      var w = v === null || !max ? 0 : Math.max(0.5, Math.sqrt(v / max) * 100);   /* square root, so the small steps stay visible beside reach */
      return '<li' + (s.id === f.worst ? ' class="is-worst"' : '') + '><span>' + esc(s.label) + '</span><div class="bar-h" aria-hidden="true"><i style="width:' + w.toFixed(1) + '%"></i></div><span class="v">' + UI.n(v) + '</span><span class="r">' + (s.ofPrevious === null ? '' : UI.pct(s.ofPrevious)) + '</span></li>';
    }).join('');
    var worst = f.steps.filter(function (s) { return s.id === f.worst; })[0];
    el('funnel-note').textContent = worst ? 'The biggest drop is at "' + worst.label + '": ' + UI.pct(worst.ofPrevious) + ' of the step before. That is the one thing to work on.' : 'Type results on posts and log touches, and the funnel fills in.';
    el('funnel-help').innerHTML = UI.help('readout', 'funnel', T, 'The funnel');
  }
  function fmtRow(g) { return '<td class="num">' + g.posts + '</td><td class="num">' + UI.n(g.impressions) + '</td><td class="num">' + UI.pct(g.engagementRate) + '</td><td class="num">' + UI.n(g.follows) + '</td><td class="num">' + UI.n(g.leads) + '</td><td class="num">' + (g.hours === null ? 'not yet' : g.hours) + '</td>'; }
  var HEAD = '<thead><tr><th>%</th><th class="num">Posts</th><th class="num">Reach</th><th class="num">Eng. rate</th><th class="num">Follows</th><th class="num">Leads</th><th class="num">Hours</th></tr></thead>';
  function drawWhere(r) {
    var posts = M.posts().filter(function (p) { return (!r.from || p.date >= r.from) && p.date <= r.to; });
    var ch = K.byChannel(posts), pi = K.byPillar(posts);
    el('tbl-channel').innerHTML = HEAD.replace('%', 'Channel') + '<tbody>' + (ch.length ? ch.map(function (g) { return '<tr><td>' + esc(UI.label(T.tables.channels, g.id)) + '</td>' + fmtRow(g) + '</tr>'; }).join('') : '<tr><td colspan="7" class="faint">No posts in this period.</td></tr>') + '</tbody>';
    el('tbl-pillar').innerHTML = HEAD.replace('%', 'Topic') + '<tbody>' + (pi.length ? pi.map(function (g) { return '<tr><td>' + esc(g.id === 'other' ? '(no topic)' : g.id) + '</td>' + fmtRow(g) + '</tr>'; }).join('') : '<tr><td colspan="7" class="faint">No posts in this period.</td></tr>') + '</tbody>';
    var best = K.bestPosts(posts, { n: 5 });
    el('tbl-best').innerHTML = '<thead><tr><th>Date</th><th>Channel</th><th>Hook</th><th class="num">Reach</th><th class="num">Eng. rate</th><th class="num">Saves</th><th class="num">DMs</th></tr></thead><tbody>'
      + (best.length ? best.map(function (b) { return '<tr><td>' + esc(UI.day(b.post.date)) + '</td><td>' + esc(UI.label(T.tables.channels, b.post.channel)) + '</td><td class="hook" title="' + esc(b.post.hook) + '">' + esc(b.post.hook || '(no hook typed)') + '</td><td class="num">' + UI.n(b.post.results.impressions) + '</td><td class="num">' + UI.pct(b.r.engagementRate) + '</td><td class="num">' + UI.n(b.post.results.saves) + '</td><td class="num">' + UI.n(b.post.results.dms) + '</td></tr>'; }).join('') : '<tr><td colspan="7" class="faint">Needs posts with reach and engagement typed in.</td></tr>') + '</tbody>';
    var chSpec = { kind: 'breakdown', title: 'Reach by channel', unit: 'count', slices: ch.filter(function (g) { return typeof g.impressions === 'number'; }).map(function (g) { return { id: g.id, label: UI.label(T.tables.channels, g.id), value: g.impressions }; }) };
    var piSpec = { kind: 'compare', title: 'Engagement rate by topic', unit: 'rate', slices: pi.filter(function (g) { return typeof g.engagementRate === 'number'; }).slice(0, 8).map(function (g) { return { id: g.id, label: g.id === 'other' ? '(no topic)' : g.id, value: g.engagementRate }; }) };
    UI.chart(el('pic-channel'), 'channel', chSpec, { height: 220 });
    UI.chart(el('pic-pillar'), 'pillar', piSpec, { height: 220, type: 'hbar' });
  }

  /* ---- Week by week ------------------------------------------------------------- */
  function drawPics() {
    var w = K.weekly(data(), { weeks: 12, to: TODAY });
    UI.chart(el('pic-posts'), 'posts', { kind: 'series', title: 'Posts a week', unit: 'count', x: w.x, series: [{ id: 'posts', label: 'Posts', values: w.series.posts }] }, { type: 'bar', height: 200 });
    UI.chart(el('pic-reach'), 'reach', { kind: 'series', title: 'Reach a week', unit: 'count', x: w.x, series: [{ id: 'reach', label: 'Reach', values: w.series.impressions }] }, { type: 'area', height: 200 });
    UI.chart(el('pic-outreach'), 'outreach', { kind: 'series', title: 'Reach-outs and conversations', unit: 'count', x: w.x, series: [{ id: 'out', label: 'Reach-outs', values: w.series.outreach }, { id: 'conv', label: 'Conversations', values: w.series.conversations }] }, { type: 'bar', height: 200 });
    UI.chart(el('pic-leads'), 'leads', { kind: 'series', title: 'Leads and calls', unit: 'count', x: w.x, series: [{ id: 'leads', label: 'Leads', values: w.series.leads }, { id: 'calls', label: 'Calls booked', values: w.series.calls }] }, { type: 'line', height: 200 });
  }

  /* ---- Who to contact today --------------------------------------------------- */
  function drawDue() {
    var list = K.due(M.people(), M.touches(), T.tables.stages, M.settings().cadences, TODAY).filter(function (d) { return d.status === 'overdue' || d.status === 'today'; }).slice(0, 8);
    el('due-help').innerHTML = UI.help('readout', 'due', T, 'Who to contact today');
    el('due').innerHTML = list.length ? list.map(function (d) {
      return '<li class="' + d.status + '"><div class="who"><a href="people.html?person=' + encodeURIComponent(d.person.id) + '">' + esc(d.person.name) + '</a><span class="pill st-' + esc(d.person.stage) + '">' + esc(UI.label(T.tables.stages, d.person.stage)) + '</span><span class="pill ' + d.status + '">' + (d.status === 'overdue' ? d.daysOver + (d.daysOver === 1 ? ' day over' : ' days over') : 'today') + '</span></div>'
        + '<span class="why">' + esc(d.why) + '</span><p class="how">' + esc(d.how) + '</p></li>';
    }).join('') : '<li><span class="mkt-note">Nobody is due. ' + (M.people().length ? 'Nice.' : 'Add people on the People screen.') + '</span></li>';
  }

  /* ---- Share report ------------------------------------------------------------- */
  function report() {
    var r = range(), p = K.period(data(), r), f = K.funnel(data(), r), sc = K.scorecard(data(), targets(), TODAY);
    var line = function (a, b) { return (a + ' ').padEnd(26, '.') + ' ' + b; };
    var out = ['MARKETING SCOREBOARD, ' + r.label + ' (to ' + UI.day(TODAY) + ')', ''];
    out.push('CONTENT'); out.push(line('Posts', p.posts + (p.posts - p.postsChecked ? ' (' + (p.posts - p.postsChecked) + ' without results)' : '')));
    out.push(line('Reach', UI.n(p.impressions))); out.push(line('Engagement rate', UI.pct(p.engagementRate))); out.push(line('Saves / comments / shares', UI.n(p.saves) + ' / ' + UI.n(p.comments) + ' / ' + UI.n(p.shares)));
    out.push(line('New followers', UI.n(p.follows))); out.push(line('Content hours', p.hours === null ? 'not yet' : p.hours + (p.hoursPerLead === null ? '' : ' (' + p.hoursPerLead + ' a lead)')));
    out.push('', 'PEOPLE'); out.push(line('Reach-outs', p.outreach + ' to ' + p.peopleReached + ' people'));
    out.push(line('By lane', T.tables.lanes.map(function (l) { return l.label.toLowerCase() + ' ' + (p.lanes[l.id] || 0); }).join(', ')));
    out.push(line('Conversations', p.conversations + (p.replyRate === null ? '' : ' (' + UI.pct(p.replyRate) + ' reply rate)')));
    out.push(line('Leads', String(p.leads))); out.push(line('Calls booked', String(p.calls))); out.push(line('Clients won', p.clients + (p.revenue === null ? '' : ', ' + UI.money(p.revenue) + ' agreed')));
    out.push('', 'FUNNEL'); f.steps.forEach(function (s) { out.push(line(s.label, UI.n(s.value) + (s.ofPrevious === null ? '' : '  (' + UI.pct(s.ofPrevious) + ' of the step before)') + (s.id === f.worst ? '  <- worst drop' : ''))); });
    out.push('', 'THIS WEEK (' + UI.day(sc.from) + ' to ' + UI.day(sc.to) + ')');
    sc.rows.forEach(function (row) { var t = T.tables.targets.filter(function (x) { return x.id === row.id; })[0]; out.push(line(t.label, row.actual + (row.target === null ? ' (no target)' : ' of ' + row.target + ', ' + { done: 'hit', good: 'on pace', watch: 'a little behind', out: 'behind' }[row.zone]))); });
    var ch = K.byChannel(M.posts().filter(function (x) { return (!r.from || x.date >= r.from) && x.date <= r.to; }));
    if (ch.length) { out.push('', 'BY CHANNEL'); ch.forEach(function (g) { out.push(line(UI.label(T.tables.channels, g.id), g.posts + ' posts, reach ' + UI.n(g.impressions) + ', eng. ' + UI.pct(g.engagementRate) + ', leads ' + UI.n(g.leads))); }); }
    out.push('', 'Made with the Marketing Scoreboard. Reach and engagement are the platforms\' own numbers, typed by hand. Blank means not entered, never zero.');
    return out.join('\n');
  }

  /* ---- Files ----------------------------------------------------------------------- */
  function wire() {
    el('btn-demo').addEventListener('click', function () { M.loadDemo(SLAF.MktDemo.build(TODAY)); location.reload(); });
    el('period').addEventListener('change', drawNumbers);
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

  function draw() {
    el('head').innerHTML = UI.header({ screen: 'Scoreboard', title: 'What gets measured', sub: 'Posts, people and the numbers between them. Everything stays in this browser.' });
    el('welcome').hidden = M.posts().length + M.people().length > 0;
    drawWeek(); drawNumbers(); drawPics(); drawDue();
    el('words').innerHTML = UI.words(T);
  }
  UI.boot(function (tables) { T = tables; wire(); draw(); M.onChange(function () { drawWeek(); drawNumbers(); drawPics(); drawDue(); }); });
})();
