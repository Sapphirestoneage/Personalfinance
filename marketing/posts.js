/* marketing/posts.js, the Content log screen (MD-007). See posts.html. */
(function () {
  'use strict';
  var UI = SLAF.MktUI, M = SLAF.Mkt, K = SLAF.KPI, el = UI.el, esc = UI.esc;
  var T = null, TODAY = UI.today(), sortBy = 'date', sortDir = -1, openId = null;

  function fill() {
    el('f-date').value = TODAY;
    el('f-channel').innerHTML = UI.options(T.tables.channels, 'instagram');
    el('f-format').innerHTML = UI.options(T.tables.formats, 'short_video');
    el('f-cta').innerHTML = UI.options(T.tables.ctas, 'none');
    ['date', 'channel', 'format', 'pillar', 'cta', 'minutes', 'hook'].forEach(function (id) { el('h-' + id).innerHTML = UI.help('field', id, T); });
    var seen = {}; M.posts().forEach(function (p) { if (p.pillar) seen[p.pillar] = 1; });
    el('pillars').innerHTML = Object.keys(seen).sort().map(function (p) { return '<option value="' + esc(p) + '"></option>'; }).join('');
  }
  function submitNew(e) {
    e.preventDefault();
    var r = M.addPost({ date: el('f-date').value, channel: el('f-channel').value, format: el('f-format').value, pillar: el('f-pillar').value, cta: el('f-cta').value, minutes: el('f-minutes').value, hook: el('f-hook').value, link: el('f-link').value });
    if (!r.ok) { UI.say('say-new', 'Check: ' + r.bad.join(', ') + '. A count is a whole number or blank.', 'bad'); return; }
    UI.say('say-new', 'Logged. Come back in a few days and type its results.', 'good');
    el('f-hook').value = ''; el('f-link').value = ''; el('f-minutes').value = '';
    fill(); el('f-date').value = TODAY; drawTable();
  }

  /* ---- The table ------------------------------------------------------------- */
  var COLS = [
    { id: 'date', label: 'Date', get: function (p) { return p.date; } },
    { id: 'channel', label: 'Channel', get: function (p) { return UI.label(T.tables.channels, p.channel); } },
    { id: 'format', label: 'Format', get: function (p) { return UI.label(T.tables.formats, p.format); } },
    { id: 'pillar', label: 'Topic', get: function (p) { return p.pillar; } },
    { id: 'hook', label: 'Hook', get: function (p) { return p.hook; } },
    { id: 'impressions', label: 'Reach', num: true, get: function (p) { return p.results.impressions; } },
    { id: 'engagementRate', label: 'Eng.', num: true, rate: true, get: function (p) { return K.postResults(p).engagementRate; } },
    { id: 'saves', label: 'Saves', num: true, get: function (p) { return p.results.saves; } },
    { id: 'dms', label: 'DMs', num: true, get: function (p) { return p.results.dms; } },
    { id: 'follows', label: 'Follows', num: true, get: function (p) { return p.results.follows; } },
    { id: 'leads', label: 'Leads', num: true, get: function (p) { return p.results.leads; } }
  ];
  function visible() {
    var f = el('filter').value, q = el('search').value.trim().toLowerCase();
    var list = M.posts().filter(function (p) {
      var checked = K.postResults(p).checked;
      if (f === 'unchecked' && checked) return false; if (f === 'checked' && !checked) return false;
      return !q || (p.hook + ' ' + p.pillar + ' ' + p.notes).toLowerCase().indexOf(q) !== -1;
    });
    var col = COLS.filter(function (c) { return c.id === sortBy; })[0];
    list.sort(function (a, b) { var x = col.get(a), y = col.get(b); if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1; return (x < y ? -1 : x > y ? 1 : 0) * sortDir; });
    return list;
  }
  function drawTable() {
    var list = visible(), all = M.posts(), waiting = all.filter(function (p) { return !K.postResults(p).checked; }).length;
    el('log-count').textContent = all.length ? all.length + ' posts, ' + waiting + ' waiting for results' : '';
    el('tbl').innerHTML = '<thead><tr>' + COLS.map(function (c) { return '<th' + (c.num ? ' class="num"' : '') + '><button type="button" data-sort="' + c.id + '" aria-sort="' + (sortBy === c.id ? (sortDir < 0 ? 'descending' : 'ascending') : 'none') + '">' + esc(c.label) + '</button></th>'; }).join('') + '<th></th></tr></thead><tbody>'
      + (list.length ? list.map(function (p) {
        var checked = K.postResults(p).checked;
        var row = '<tr data-id="' + esc(p.id) + '" class="' + (p.id === openId ? 'is-open' : '') + (checked ? '' : ' is-unchecked') + '">' + COLS.map(function (c) {
          var v = c.get(p), text = c.rate ? UI.pct(v) : c.num ? UI.n(v) : (c.id === 'date' ? UI.day(v) : v);
          if (c.num && (v === null || v === undefined)) text = checked ? 'blank' : '';
          return '<td class="' + (c.num ? 'num' : c.id === 'hook' ? 'hook' : '') + '"' + (c.id === 'hook' ? ' title="' + esc(v) + '"' : '') + '>' + esc(text) + '</td>';
        }).join('') + '<td><button type="button" class="slaf-linkbtn rowbtn" data-open="' + esc(p.id) + '">' + (p.id === openId ? 'Close' : checked ? 'Edit' : 'Type results') + '</button></td></tr>';
        if (p.id === openId) row += '<tr class="is-open"><td colspan="' + (COLS.length + 1) + '">' + resultsForm(p) + '</td></tr>';
        return row;
      }).join('') : '<tr><td colspan="' + (COLS.length + 1) + '" class="faint">' + (all.length ? 'Nothing matches.' : 'No posts yet. Log the first one above.') + '</td></tr>') + '</tbody>';
  }
  function resultsForm(p) {
    return '<form class="results" data-id="' + esc(p.id) + '" autocomplete="off"><p class="mkt-note">Type the platform\'s numbers as they are today. Blank means not checked. ' + (p.resultsAt ? 'Last typed ' + UI.day(p.resultsAt) + '.' : '') + '</p>'
      + '<div class="results-grid">' + T.tables.results.map(function (r) { var v = p.results[r.id]; return '<label class="inline"><span>' + esc(r.label) + '</span><input type="text" inputmode="numeric" name="' + esc(r.id) + '" value="' + (v === null || v === undefined ? '' : v) + '"/></label>'; }).join('') + '</div>'
      + '<div class="row" style="margin-top:8px"><label class="inline"><span>Hook</span><input type="text" name="hook" class="wide" value="' + esc(p.hook) + '"/></label><label class="inline"><span>Topic</span><input type="text" name="pillar" class="mid" value="' + esc(p.pillar) + '"/></label><label class="inline"><span>Minutes to make</span><input type="text" name="minutes" class="short" inputmode="numeric" value="' + (p.minutes === null ? '' : p.minutes) + '"/></label><label class="inline"><span>Notes</span><input type="text" name="notes" class="wide" value="' + esc(p.notes) + '"/></label></div>'
      + '<div class="mkt-actions" style="margin-top:8px"><button type="submit" class="slaf-btn slaf-btn--primary">Save results</button><button type="button" class="slaf-btn slaf-btn--quiet" data-remove="' + esc(p.id) + '">Remove this post</button><span class="mkt-say" id="say-row"></span></div></form>';
  }
  document.addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-sort]'))) { var id = b.getAttribute('data-sort'); if (sortBy === id) sortDir = -sortDir; else { sortBy = id; sortDir = id === 'date' ? -1 : -1; } drawTable(); return; }
    if ((b = e.target.closest('[data-open]'))) { var pid = b.getAttribute('data-open'); openId = openId === pid ? null : pid; drawTable(); if (openId) { var f = document.querySelector('form.results input'); if (f) f.focus(); } return; }
    if ((b = e.target.closest('[data-remove]'))) { if (confirm('Remove this post and its results?')) { M.removePost(b.getAttribute('data-remove')); openId = null; drawTable(); } return; }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('form.results'); if (!f) return;
    e.preventDefault();
    var results = {}; T.tables.results.forEach(function (r) { results[r.id] = f.elements[r.id].value; });
    var r = M.updatePost(f.getAttribute('data-id'), { results: results, hook: f.elements.hook.value, pillar: f.elements.pillar.value, minutes: f.elements.minutes.value, notes: f.elements.notes.value });
    if (!r.ok) { UI.say('say-row', 'Check: ' + r.bad.join(', ') + '. Whole numbers or blank.', 'bad'); return; }
    openId = null; drawTable(); UI.say('say-log', 'Saved.', 'good');
  });

  /* ---- CSV in and out ------------------------------------------------------------- */
  function saveCsv() {
    var cols = [{ id: 'date', label: 'date' }, { id: 'channel', label: 'channel' }, { id: 'format', label: 'format' }, { id: 'pillar', label: 'topic' }, { id: 'hook', label: 'hook' }, { id: 'cta', label: 'cta' }, { id: 'link', label: 'link' }, { id: 'minutes', label: 'minutes' }]
      .concat(T.tables.results.map(function (r) { return { id: r.id, label: r.id === 'impressions' ? 'reach' : r.id, get: function (p) { return p.results[r.id]; } }; }))
      .concat([{ id: 'engagementRate', label: 'engagement_rate', get: function (p) { var v = K.postResults(p).engagementRate; return v === null ? '' : Math.round(v * 10000) / 10000; } }, { id: 'resultsAt', label: 'results_typed_on' }, { id: 'notes', label: 'notes' }]);
    UI.download(M.filename('posts'), UI.csv(M.posts(), cols), 'text/csv');
  }
  function importCsv() {
    UI.readFile(el('file-csv')).then(function (text) {
      if (SLAF.Csv.looksBinary(text)) { UI.say('say-log', 'That is a workbook, not a CSV. Save it as CSV first.', 'bad'); return; }
      var parsed = SLAF.Csv.parse(text), recs = SLAF.Csv.records(text);
      var m = M.mapPosts(recs, { headers: parsed.headers });
      if (!m.mapping.date) { UI.say('say-log', 'No date column found. The header needs a "date" column.', 'bad'); return; }
      if (!m.posts.length) { UI.say('say-log', 'No rows read. ' + (m.skipped[0] ? 'Line ' + m.skipped[0].line + ': ' + m.skipped[0].why : ''), 'bad'); return; }
      if (!confirm('Add ' + m.posts.length + ' posts from the file?' + (m.skipped.length ? ' ' + m.skipped.length + ' rows will be skipped.' : ''))) return;
      M.addPosts(m.posts); drawTable(); fill();
      UI.say('say-log', 'Added ' + m.posts.length + ' posts.' + (m.skipped.length ? ' Skipped ' + m.skipped.length + '.' : ''), 'good');
    }).catch(function (e) { UI.say('say-log', e.message, 'bad'); });
    el('file-csv').value = '';
  }

  UI.boot(function (tables) {
    T = tables;
    el('head').innerHTML = UI.header({ screen: 'Content', title: 'The content log', sub: 'One row a post. Type its numbers a few days later; blank is not zero.' });
    fill(); drawTable();
    el('new-post').addEventListener('submit', submitNew);
    el('filter').addEventListener('change', drawTable); el('search').addEventListener('input', drawTable);
    el('btn-csv').addEventListener('click', saveCsv); el('file-csv').addEventListener('change', importCsv);
  });
})();
