/* ==========================================================================
   shared/progress.js — what is finished, what is not, and where to go next.
   --------------------------------------------------------------------------
   Every room in this app is honest about a missing input: it shows an em
   dash and a reason. What it could not do was answer the question a person
   actually has, which is "what do I still have to fill in, and where?"

   That question is answerable because two things already exist:

     • shared/ownership.js knows, for every shared number, which room OWNS
       it, which section of that room to land on, and how to read it out of
       the household. That is a deep link to an exact field.
     • shared/registry.js knows every room and the order to walk them.

   So this file adds one thing and derives the rest: each room declares the
   fields it NEEDS (`needs` in the registry). Completeness is then just
   "how many of those read back as set", and the missing list is a list of
   links — never a list of scoldings.

   Nothing here judges. A room you have not filled in is not behind; it is
   a room whose inputs you have not given a reason to care about yet. The
   wording everywhere reflects that, and skipping is always offered beside
   finishing.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('./money.js'),
      Registry: require('./registry.js'),
      Ownership: require('./ownership.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Registry: root.SLAF && root.SLAF.Registry,
      Ownership: root.SLAF && root.SLAF.Ownership
    };
  }
  var api = factory(deps.Money, deps.Registry, deps.Ownership);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Progress = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Registry, Ownership) {
  'use strict';

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /**
   * One room's state.
   *   { roomId, title, href, needs, filled, missing, complete, share, started }
   *
   * `missing` entries carry everything a link needs: the field's label, the
   * room that owns it, and the href that lands on the exact question —
   * so a caller never has to know where anything lives.
   *
   * A room that needs nothing (Quick Math takes its own numbers) is
   * `complete: true` with `needs: 0`. It is not "done", it is never
   * blocked, and `standalone` says which.
   */
  /* How many of the rooms name each field in their own `needs`. It turns the
     missing list into a priority order: the number that unblocks twenty-seven
     rooms is a different proposition from the one that unblocks one. Counted
     from the registry, so it cannot drift from what the rooms actually ask
     for. D-162. */
  var WAITING = null;
  function waitingOn(fieldId) {
    if (!WAITING) {
      WAITING = {};
      Registry.all().forEach(function (r) {
        (r.needs || []).forEach(function (f) { WAITING[f] = (WAITING[f] || 0) + 1; });
      });
    }
    return WAITING[fieldId] || 0;
  }

  function forRoom(roomId, household) {
    var room = Registry.byId(roomId);
    if (!room) return null;
    var needs = room.needs || [];
    var missing = [], filled = [], notApplicable = [];

    needs.forEach(function (fieldId) {
      var d = Ownership.describe(fieldId, household, roomId);
      if (!d) return;                       /* unknown field id: not a gate */
      /* A field that has stopped being a question is not outstanding work.
         Someone who told us they have no employer must not be chased for
         an employer match forever. It leaves the denominator too, so the
         room can actually reach 100%. DECISIONS.md D-055. */
      if (!d.applies) {
        notApplicable.push({ fieldId: fieldId, label: d.label, because: d.notApplicableBecause });
        return;
      }
      var entry = {
        fieldId: fieldId,
        label: d.label,
        href: d.href,
        ownerId: d.ownerId,
        ownerTitle: d.ownerTitle,
        ownHere: d.isOwnHere,
        display: d.display,
        /* A guess is filled but not answered. It counts towards the room being
           able to compute, and it is still something you might want to fix, so
           it is named rather than folded silently into "done". D-162. */
        guessed: !!d.guessed,
        waits: waitingOn(fieldId)
      };
      (d.isSet ? filled : missing).push(entry);
    });

    missing.sort(function (a, b) { return b.waits - a.waits; });
    var total = filled.length + missing.length;
    return {
      roomId: room.id,
      title: room.title,
      href: room.href,
      order: room.order,
      total: total,
      filledCount: filled.length,
      filled: filled,
      missing: missing,
      notApplicable: notApplicable,
      complete: missing.length === 0,
      standalone: total === 0,
      share: total === 0 ? 1 : filled.length / total
    };
  }

  /** Every room, in the order a person walks them. */
  function all(household) {
    return Registry.inOrder().map(function (r) { return forRoom(r.id, household); })
      .filter(Boolean);
  }

  /**
   * The whole suite in one line.
   *
   * Counted over DISTINCT fields, not over rooms: eight rooms needing your
   * income is one thing to do, and counting it eight times would make the
   * bar move in a way that has nothing to do with effort.
   */
  function overall(household) {
    var seen = {}, filled = 0, total = 0;
    all(household).forEach(function (row) {
      row.filled.concat(row.missing).forEach(function (f) {
        if (seen[f.fieldId]) return;
        seen[f.fieldId] = true;
        total++;
        if (row.filled.indexOf(f) !== -1) filled++;
      });
    });
    var rooms = all(household);
    return {
      fieldsFilled: filled,
      fieldsTotal: total,
      share: total === 0 ? 1 : filled / total,
      roomsComplete: rooms.filter(function (r) { return r.complete && !r.standalone; }).length,
      roomsTotal: rooms.filter(function (r) { return !r.standalone; }).length,
      /* Distinct things still to answer, each with a link. The order is the
         path order, so working down it never sends you backwards. */
      missing: distinctMissing(rooms)
    };
  }

  function distinctMissing(rooms) {
    var seen = {}, out = [];
    rooms.forEach(function (row) {
      row.missing.forEach(function (f) {
        if (seen[f.fieldId]) { seen[f.fieldId].blocks.push(row.title); return; }
        var entry = {
          fieldId: f.fieldId, label: f.label, href: f.href,
          ownerId: f.ownerId, ownerTitle: f.ownerTitle,
          /* Which rooms are waiting on it. One field unlocking five rooms
             is worth saying — it turns a chore into a reason. */
          blocks: [row.title]
        };
        seen[f.fieldId] = entry;
        out.push(entry);
      });
    });
    return out;
  }

  /** Where to go next: the first unfinished room after this one on the path. */
  function nextUnfinished(household, fromRoomId) {
    var rows = all(household);
    var idx = -1;
    rows.forEach(function (r, i) { if (r.roomId === fromRoomId) idx = i; });
    for (var i = idx + 1; i < rows.length; i++) {
      if (!rows[i].complete && !rows[i].standalone) return rows[i];
    }
    /* Nothing after this one — wrap, so the control never dead-ends. */
    for (var j = 0; j <= idx && j < rows.length; j++) {
      if (!rows[j].complete && !rows[j].standalone) return rows[j];
    }
    return null;
  }

  /** Plain path neighbours, regardless of whether they are finished. */
  function neighbours(roomId) {
    var path = Registry.inOrder();
    var idx = -1;
    path.forEach(function (r, i) { if (r.id === roomId) idx = i; });
    return {
      prev: idx > 0 ? path[idx - 1] : null,
      next: idx >= 0 && idx < path.length - 1 ? path[idx + 1] : null,
      index: idx,
      total: path.length
    };
  }

  /* ---- The shared strip every room renders --------------------------------
     One component so the wording, the ordering and the links cannot drift
     between twenty-four rooms.                                           */

  /* A page whose registry href is not under rooms/ sits at the site root
     (the dashboard, since D-058) and links without the ../ prefix. */
  function atRoot(roomId) {
    var room = Registry.byId(roomId);
    return !!(room && room.href && room.href.indexOf('rooms/') !== 0);
  }

  function href(path, roomId) {
    /* Rooms live in rooms/; the FOO ladder is at the root. Registry hrefs
       are written relative to the root, so a room has to climb out. */
    return (atRoot(roomId) ? '' : '../') + path;
  }

  /**
   * stripHtml(roomId, household) — "what this room still needs", then the
   * back / skip-forward controls. Returns '' for a room that needs nothing
   * and has nowhere useful to point.
   */
  function stripHtml(roomId, household) {
    var row = forRoom(roomId, household);
    if (!row) return '';
    var nb = neighbours(roomId);

    var out = [];
    out.push('<div class="slaf-progress">');

    /* Simplified on the owner's word (D-186): when something is missing,
       one short head and the list, without the room counts; when nothing
       is, nothing at all. Silence is the signal that a room is complete. */
    if (row.missing.length) {
      out.push('<p class="slaf-progress-head"><strong>' + row.missing.length
        + ' still needed</strong> to finish this room.</p>');
      out.push('<ul class="slaf-progress-list">' + row.missing.map(function (f) {
        return '<li><a href="' + escapeHtml(href(f.href.replace(/^\.\.\//, ''), roomId)) + '">'
          + escapeHtml(f.label) + '</a>'
          + '<span class="slaf-progress-where">'
          + (f.ownHere ? 'on this page' : 'in ' + escapeHtml(f.ownerTitle)) + '</span></li>';
      }).join('') + '</ul>');
    }

    /* Filled with a guess is not the same as answered. A room can compute from
       guesses and still be resting on numbers nobody confirmed, so they are
       named here rather than counted quietly as done. D-162. */
    var guesses = (row.filled || []).filter(function (f) { return f.guessed; });
    if (guesses.length) {
      out.push('<p class="slaf-progress-note"><strong>' + guesses.length + ' of these '
        + (guesses.length === 1 ? 'is' : 'are') + ' still a guess</strong> \u2014 '
        + guesses.map(function (f) { return escapeHtml(f.label); }).join(', ')
        + '. Good enough to compute with, worth fixing when you know.</p>');
    }

    /* Questions that stopped applying are said out loud once, so a room that
       reads "everything it needs" is not quietly ignoring two boxes you can
       see are empty. DECISIONS.md D-055. */
    if (row.notApplicable && row.notApplicable.length) {
      out.push('<p class="slaf-progress-note">Not asked: '
        + row.notApplicable.map(function (f) { return escapeHtml(f.label); }).join(', ')
        + '. ' + escapeHtml(row.notApplicable[0].because || '') + '</p>');
    }

    /* Plain path order at both ends (D-186): a next that jumped to a
       different room each time you looked was one of the ways people got
       lost. The Walk-Through keeps the smart "next unfinished". */
    out.push('<div class="slaf-progress-nav">');
    if (nb.prev) {
      out.push('<a class="slaf-progress-btn" href="' + escapeHtml(href(nb.prev.href, roomId))
        + '">← ' + escapeHtml(nb.prev.title) + '</a>');
    } else {
      out.push('<span></span>');
    }
    if (nb.next) {
      out.push('<a class="slaf-progress-btn is-next" href="' + escapeHtml(href(nb.next.href, roomId))
        + '">Next: ' + escapeHtml(nb.next.title) + ' →</a>');
    } else {
      out.push('<span></span>');
    }
    out.push('</div>');
    out.push('</div>');
    return out.join('');
  }

  /**
   * The compact nav that sits where "← All rooms" used to: previous room,
   * the map, next room. Plain PATH ORDER, deliberately — the bottom strip
   * offers the smart "next unfinished", and a top control that jumped
   * somewhere different every time you looked at it would stop being a
   * place you can navigate by. Predictable up here, guidance down there.
   *
   * Both ends resolve to the map rather than dead-ending or wrapping, so
   * every room really does have a back and a next. DECISIONS.md D-054.
   */
  function headerNavHtml(roomId) {
    /* The front door has no "previous room". Walking the path one room at a
       time makes sense from inside it; on the dashboard "<- Every Ratio" and
       "Worth Learning ->" are two arbitrary neighbours of a page that is not
       on the path at all, and they read as instructions. The menu and the
       walk-through are the ways in from here. D-169. */
    if (roomId === 'dashboard') return '';
    var nb = neighbours(roomId);
    var mapHref = (atRoot(roomId) ? '' : '../') + 'map.html';

    function link(room, dir) {
      if (!room) {
        return '<a class="slaf-hop slaf-hop--' + dir + '" href="' + mapHref + '">'
          + (dir === 'prev' ? '← All rooms' : 'All rooms →') + '</a>';
      }
      var label = escapeHtml(room.title);
      return '<a class="slaf-hop slaf-hop--' + dir + '" href="'
        + escapeHtml(href(room.href, roomId)) + '">'
        + (dir === 'prev' ? '← ' + label : label + ' →') + '</a>';
    }

    /* At either end of the path the end-cap already points at the map, so
       the middle link would be the same destination twice. */
    var atEdge = !nb.prev || !nb.next;
    return '<nav class="slaf-hops" aria-label="Move between rooms">'
      + link(nb.prev, 'prev')
      + (atEdge ? '' : '<a class="slaf-hop slaf-hop--map" href="' + mapHref + '">All rooms</a>')
      + link(nb.next, 'next')
      + '</nav>';
  }

  /* ---- The menu ----------------------------------------------------------
     The header strip walks the path one room at a time and offers the map.
     That is fine for "what is next" and useless for "take me to the thing
     I need now" — Your Data sits at order 98, so reaching an export meant
     opening the map and scrolling to the end of fifty-seven rooms. Upkeep
     is not a destination on a journey; it is a drawer you pull open from
     wherever you are (D-135).

     Built here rather than per room for the same reason the hop strip is:
     every page already loads this file and already has the one element it
     hangs off. */

  /* ---- The sidebar (D-177) ----------------------------------------------
     Grouped by purpose, not by kind: Home, Your Numbers, Scorecard,
     Decisions, What Matters, Level Up, Upkeep — the groups and every room's
     place in them are data in shared/registry.js, rendered here once for
     every page. Groups collapse; only the current room's group opens on
     load, and what a person opens or closes is remembered in prefs. A search
     box filters by title and alias. A Recent strip sits under Home. A status
     dot marks each Your Numbers room filled, partly or empty from the
     field ledger; read-only rooms and calculators carry none. A room whose
     appliesWhen fails for this situation is absent, not greyed. */

  /* Upkeep, kept as a named list for the pages that ask for it directly
     (the map, the tests): the rooms a person reaches for from anywhere. */
  var UPKEEP = ['data', 'refresh', 'history', 'start', 'get-help'];

  function globals() { return (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null; }
  function prefs() { var g = globals(); return g && g.SLAF && g.SLAF.Prefs ? g.SLAF.Prefs : null; }
  function spine() { var g = globals(); return g && g.SLAF && g.SLAF.Spine ? g.SLAF.Spine : null; }
  function gateOf() { var g = globals(); return g && g.SLAF && g.SLAF.Gate ? g.SLAF.Gate : null; }

  function situationNow() {
    var S = spine(), G = gateOf();
    if (!S || !G) return null;
    try { return G.situationOf(S.getProfile()); } catch (e) { return null; }
  }

  /** filled · partly · empty for a Your Numbers room, from the fields it owns. */
  function roomStatus(roomId, readings) {
    if (!Ownership || !Ownership.ownedBy || !readings) return null;
    var fields = Ownership.ownedBy(roomId);
    if (!fields.length) return null;
    var filled = fields.filter(function (f) { return readings[f] !== null && readings[f] !== undefined; }).length;
    return filled === 0 ? 'empty' : filled === fields.length ? 'filled' : 'partly';
  }
  function readingsNow() {
    var S = spine();
    if (!S || !Ownership || !Ownership.readings) return null;
    try { return Ownership.readings(S.getProfile()); } catch (e) { return null; }
  }

  function menuLink(room, roomId, current, status) {
    var here = room.id === current;
    var search = (room.title + ' ' + (room.aliases || []).join(' ')).toLowerCase();
    return '<a class="slaf-menu-link' + (here ? ' is-here' : '') + '" href="'
      + escapeHtml(href(room.href, roomId)) + '"' + (here ? ' aria-current="page"' : '')
      + ' data-room="' + escapeHtml(room.id) + '" data-search="' + escapeHtml(search) + '">'
      + escapeHtml(room.title)
      + (status ? '<i class="slaf-dot is-' + status + '" title="' + status + '" aria-label="' + status + '"></i>' : '')
      + '</a>';
  }
  function extraLink(l, roomId) {
    var search = (l.title + ' ' + (l.aliases || []).join(' ')).toLowerCase();
    var to = l.href.indexOf('http') === 0 ? l.href : href(l.href, roomId);
    return '<a class="slaf-menu-link is-extra" href="' + escapeHtml(to) + '" data-search="' + escapeHtml(search) + '">' + escapeHtml(l.title) + '</a>';
  }

  function recentIds(roomId) {
    var P = prefs();
    var list = P ? P.get('recent', []) : [];
    if (!Array.isArray(list)) list = [];
    return list.filter(function (id) { return id !== roomId && Registry.byId(id); }).slice(0, 3);
  }
  function rememberVisit(roomId) {
    var P = prefs();
    if (!P || !roomId || !Registry.byId(roomId)) return;
    var list = P.get('recent', []);
    if (!Array.isArray(list)) list = [];
    list = [roomId].concat(list.filter(function (id) { return id !== roomId; })).slice(0, 6);
    P.set('recent', list);
  }

  function groupOpen(groupId, currentGroup) {
    var P = prefs();
    var stored = P ? P.get('sidebar.open', {}) : {};
    if (groupId === currentGroup) return true;
    return !!(stored && stored[groupId]);
  }

  /** The nav body only: rebuilt when the household's situation changes.
      The search box lives above it and is built once. */
  function menuBodyHtml(roomId) {
    var current = Registry.byId(roomId);
    var currentGroup = current ? current.group : null;
    var sit = situationNow();
    var readings = readingsNow();
    return Registry.groups().map(function (g) {
      var rooms = Registry.inGroup(g.id, sit);
      var links = (g.links || []);
      var byAfter = {};
      links.forEach(function (l) { byAfter[l.after || '__end'] = (byAfter[l.after || '__end'] || []).concat([l]); });
      var out = [];
      var lastSub = null;
      rooms.forEach(function (r) {
        if (g.subgroups && r.subgroup && r.subgroup !== lastSub) {
          var sg = g.subgroups.filter(function (x) { return x.id === r.subgroup; })[0];
          out.push('<p class="slaf-menu-sub" data-subgroup="' + escapeHtml(r.subgroup) + '">' + escapeHtml(sg ? sg.label : r.subgroup) + '</p>');
          lastSub = r.subgroup;
        }
        out.push(menuLink(r, roomId, roomId, g.id === 'numbers' ? roomStatus(r.id, readings) : null));
        (byAfter[r.id] || []).forEach(function (l) { out.push(extraLink(l, roomId)); });
      });
      (byAfter.__end || []).forEach(function (l) { out.push(extraLink(l, roomId)); });
      if (g.id === 'home') {
        var recent = recentIds(roomId).map(function (id) { return Registry.byId(id); }).filter(Boolean);
        if (recent.length) {
          out.push('<p class="slaf-menu-sub">Recent</p>');
          recent.forEach(function (r) { out.push(menuLink(r, roomId, roomId, null).replace('slaf-menu-link', 'slaf-menu-link is-recent')); });
        }
      }
      if (!out.length) return '';
      return '<details class="slaf-menu-group" data-group="' + escapeHtml(g.id) + '"' + (groupOpen(g.id, currentGroup) ? ' open' : '') + '>'
        + '<summary><span>' + escapeHtml(g.label) + '</span>' + (g.note ? '<small>' + escapeHtml(g.note) + '</small>' : '') + '</summary>'
        + '<div class="slaf-menu-groupbody">' + out.join('') + '</div></details>';
    }).join('');
  }

  function menuHtml(roomId) {
    return '<div class="slaf-menu-head">'
      + '<span class="slaf-menu-title">Money Rooms</span>'
      + '<button type="button" class="slaf-menu-x" data-menu-close aria-label="Close the menu">✕</button>'
      + '</div>'
      + '<div class="slaf-menu-search"><input type="search" id="slaf-menu-q" placeholder="Find a room" aria-label="Find a room" autocomplete="off"></div>'
      + '<nav class="slaf-menu-body" aria-label="All rooms">' + menuBodyHtml(roomId) + '</nav>';
  }

  /** The search: hide links that do not match, then groups with nothing
      left; while a query is in, matching groups open without being saved. */
  function applySearch(panel, query) {
    var q = String(query || '').trim().toLowerCase();
    panel.querySelectorAll('.slaf-menu-group').forEach(function (d) {
      var any = false, lastSub = null;
      d.querySelectorAll('.slaf-menu-link, .slaf-menu-sub').forEach(function (n) {
        if (n.classList.contains('slaf-menu-sub')) { n.hidden = !!q; lastSub = n; return; }
        var hit = !q || (n.getAttribute('data-search') || '').indexOf(q) !== -1;
        n.hidden = !hit;
        if (hit) { any = true; if (q === '' && lastSub) lastSub.hidden = false; }
      });
      if (!q) { d.querySelectorAll('.slaf-menu-sub').forEach(function (n) { n.hidden = false; }); }
      d.hidden = !any;
      if (q && any) d.open = true;
      else if (!q) d.open = d.getAttribute('data-was-open') === 'true';
    });
  }

  /**
   * mountMenu(roomId) — the button, the drawer and the backdrop, appended to
   * <body> so nothing clips it and so it is never inside a room's live-input
   * container (D-034). Returns the button.
   */
  function mountMenu(roomId, host) {
    if (typeof document === 'undefined') return null;
    if (document.getElementById('slaf-menu')) return null;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slaf-menu-btn';
    btn.id = 'slaf-menu-btn';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'slaf-menu');
    btn.setAttribute('aria-label', 'Menu');
    btn.innerHTML = '<span class="slaf-menu-bars" aria-hidden="true"><i></i><i></i><i></i></span>';

    var back = document.createElement('div');
    back.className = 'slaf-menu-backdrop';
    back.hidden = true;

    var panel = document.createElement('aside');
    panel.id = 'slaf-menu';
    panel.className = 'slaf-menu';
    panel.hidden = true;
    rememberVisit(roomId);
    panel.innerHTML = menuHtml(roomId);

    document.body.appendChild(back);
    document.body.appendChild(panel);

    /* Groups: remember what was opened or closed, per person, in prefs. */
    function noteOpen() {
      panel.querySelectorAll('.slaf-menu-group').forEach(function (d) { d.setAttribute('data-was-open', String(d.open)); });
    }
    noteOpen();
    panel.addEventListener('toggle', function (e) {
      var d = e.target;
      if (!d.classList || !d.classList.contains('slaf-menu-group')) return;
      var q = panel.querySelector('#slaf-menu-q');
      if (q && q.value.trim()) return;               /* a search opening a group is not a preference */
      d.setAttribute('data-was-open', String(d.open));
      var P = prefs();
      if (!P) return;
      var stored = P.get('sidebar.open', {});
      if (!stored || typeof stored !== 'object') stored = {};
      stored[d.getAttribute('data-group')] = d.open;
      P.set('sidebar.open', stored);
    }, true);
    var q = panel.querySelector('#slaf-menu-q');
    if (q) q.addEventListener('input', function () { applySearch(panel, q.value); });

    /* The situation and the dots can change under the page: rebuild the
       body only, never the search box (a live input, D-034). */
    var S = spine();
    if (S && S.onChange) {
      S.onChange(function () {
        var body = panel.querySelector('.slaf-menu-body');
        if (!body) return;
        body.innerHTML = menuBodyHtml(roomId);
        noteOpen();
        if (q && q.value.trim()) applySearch(panel, q.value);
      });
    }
    if (host && host.parentNode) host.parentNode.insertBefore(btn, host);
    else document.body.appendChild(btn);

    /* Two modes from one drawer. Narrow: a panel you pull open over the
       page and dismiss. Wide: there is room for it to simply stay, so it
       does — no button, no backdrop, no dismissing, and the page sits
       beside it. Pinning is done here rather than in CSS because [hidden]
       is display:none !important in the theme, and a media query fighting
       that with more !important is worse than one matchMedia. */
    var wide = window.matchMedia('(min-width: 1080px)');

    function pinned() { return wide.matches; }

    function setOpen(open) {
      if (pinned()) return;
      panel.hidden = !open;
      back.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      document.documentElement.classList.toggle('slaf-menu-open', open);
      if (open) {
        var first = panel.querySelector('.slaf-menu-link');
        if (first) first.focus();
      } else {
        btn.focus();
      }
    }

    function applyMode() {
      var root = document.documentElement;
      if (pinned()) {
        panel.hidden = false; back.hidden = true; btn.hidden = true;
        btn.setAttribute('aria-expanded', 'true');
        root.classList.add('slaf-menu-pinned');
        root.classList.remove('slaf-menu-open');
      } else {
        panel.hidden = true; back.hidden = true; btn.hidden = false;
        btn.setAttribute('aria-expanded', 'false');
        root.classList.remove('slaf-menu-pinned', 'slaf-menu-open');
      }
    }
    applyMode();
    if (wide.addEventListener) wide.addEventListener('change', applyMode);
    else if (wide.addListener) wide.addListener(applyMode);

    btn.addEventListener('click', function () { setOpen(panel.hidden); });
    back.addEventListener('click', function () { setOpen(false); });
    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-menu-close]')) setOpen(false);
    });
    /* Escape closes from anywhere, including from inside the drawer. */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); setOpen(false); }
    });
    return btn;
  }

  /**
   * mountHeader(roomId) — upgrade the room's single "← All rooms" link into
   * that three-way nav, in place. Every room already has one, so this needs
   * no per-room markup.
   */
  /* ---- A room that does not apply says so, instead of asking -------------
     `Gate.exists` has always known which rooms belong to which situation,
     and `Registry.applies` has always read it — but only the map and the
     menu listened. A room reached from a link, a bookmark, the header hops
     or the menu drew its whole body regardless, so someone between jobs was
     asked for their commute, their contract rate, their 401(k) and their
     children's tuition. Fourteen rooms did it.

     This is the one place to fix it, because every room reaches this
     function: 22 through `Room.mount`, the rest by calling it directly.

     What it does NOT do: decide for you. The room is folded away with the
     reason said out loud and a way back to what does apply, and "Show it
     anyway" opens it. That choice is for this visit only and is never
     stored — a view is not a fact about the household (D-052). D-142. */
  function situationNoticeHtml(roomId) {
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    var S = g && g.SLAF; if (!S || !S.Gate || !S.Spine || !S.Registry) return null;
    var h = S.Spine.getProfile();
    var sit = S.Gate.situationOf(h);
    if (!sit) return null;                       /* situation unanswered: everything applies */
    var reason = S.Gate.why(h, S.Registry.requires(roomId));
    if (!reason) return null;                    /* it applies */
    var label = String((S.Gate.byId(sit) || {}).label || sit).replace(/\s+[—-].*$/, '').toLowerCase();
    /* The way out is a step forward, not just a door back — so point at the
       rooms that DO apply and still want something from this household,
       most-wanted first. Falling back to path order only when everything
       that applies is already answered. */
    var live = S.Registry.forHousehold(h).filter(function (r) { return r.id !== roomId && !r.utility; });
    var byNeed = live.map(function (r) { return { room: r, missing: (forRoom(r.id, h) || {}).missing || [] }; })
      .filter(function (x) { return x.missing.length; })
      .sort(function (a, b) { return b.missing.length - a.missing.length; });
    var pick = (byNeed.length ? byNeed.map(function (x) { return x.room; }) : live).slice(0, 3);
    var onward = pick.map(function (r) {
      return '<a class="slaf-btn slaf-btn--quiet" href="' + escapeHtml(hrefOf(r, roomId)) + '">' + escapeHtml(r.title) + ' →</a>';
    }).join('');
    return { label: label, html: '<section class="slaf-card slaf-notapply" id="slaf-notapply" role="status">'
      + '<span class="slaf-eyebrow">Not for you right now</span>'
      + '<h2>You said you are <strong>' + escapeHtml(label) + '</strong>.</h2>'
      + '<p>' + escapeHtml(reason) + '</p>'
      + '<p class="slaf-hint">Nothing here is wrong — it just is not about you today. Change your situation in '
      + '<a href="' + escapeHtml(href('rooms/start.html', roomId)) + '#q-employment">Start Here</a> and this opens on its own.</p>'
      + (onward ? '<div class="slaf-notapply-go">' + onward + '</div>' : '')
      + '<button type="button" class="slaf-btn slaf-btn--quiet" id="slaf-showanyway">Show it anyway</button>'
      + '</section>' };
  }
  function hrefOf(room, fromRoomId) { return href(room.href, fromRoomId); }

  /**
   * Fold the room away behind the notice, and let one tap unfold it.
   *
   * Re-checked on every change to the household, not just at load. Painting
   * it once was wrong twice over: a household whose situation arrives after
   * the page does (a share link, a late table load, another tab) kept a fold
   * that no longer applied, and someone changing their situation had to
   * reload to see the room open. The phone-tap suite caught it — it sets a
   * room's situation after navigating, and the stale fold hid the inputs.
   * D-142.
   */
  function mountSituation(roomId) {
    if (typeof document === 'undefined') return null;
    var host = document.querySelector('main') || document.querySelector('.wrap') || document.getElementById('root');
    if (!host) return null;
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    var Spine = g && g.SLAF && g.SLAF.Spine;
    var shownAnyway = false;          /* this visit only, never stored (D-052) */

    function sync() {
      var want = shownAnyway ? null : situationNoticeHtml(roomId);
      var have = document.getElementById('slaf-notapply');
      if (!want) {
        if (have) { have.parentNode.removeChild(have); host.classList.remove('slaf-folded'); }
        return null;
      }
      if (have) {                     /* already folded — the reason may have changed */
        var fresh = document.createElement('div');
        fresh.innerHTML = want.html;
        have.parentNode.replaceChild(fresh.firstChild, have);
        wire(document.getElementById('slaf-notapply'), want);
        return document.getElementById('slaf-notapply');
      }
      return paint(want);
    }
    if (Spine && Spine.onChange) Spine.onChange(sync);

    function paint(notApply) {
    var wrap = document.createElement('div');
    wrap.innerHTML = notApply.html;
    var notice = wrap.firstChild;
    /* Fold by putting a class on the container, not by hiding the children
       that happen to exist right now: a room built through `Room.mount`
       fills itself in AFTER the tables load, and a one-off pass over
       `host.children` missed everything that arrived later — which showed up
       as one stray card sitting under the notice. The CSS rule keeps the
       header hops and the room's own title visible, so you always know
       which room you are looking at and how to leave it. */
    host.insertBefore(notice, host.firstChild);
    host.classList.add('slaf-folded');
    wire(notice, notApply);
    return notice;
    }

    function wire(notice, notApply) {
      var open = notice.querySelector('#slaf-showanyway');
      if (!open) return;
      open.addEventListener('click', function () {
        shownAnyway = true;
        host.classList.remove('slaf-folded');
        open.remove();
        notice.insertAdjacentHTML('beforeend',
          '<p class="slaf-hint">Shown anyway. Anything you type here still saves — it just may not mean much while you are '
          + escapeHtml(notApply.label) + '.</p>');
      });
    }

    return sync();
  }

  /* ---- The Walk-Through bar (D-149) --------------------------------------
     One strip under the header hops, on the rooms that are steps, once the
     walk has begun. It says where you are, gives you the two answers a step
     can have — done, or not for me — and then points at the next one.

     It is a container of BUTTONS, never inputs, so repainting it on every
     Spine change is outside the live-form rule entirely (D-034): there is no
     text field here to lose focus, and no soft keyboard to close.

     It appears on NOTHING unless the person started the walk. Someone who
     never wanted a guided path never sees a trace of one. */

  function walkBarHtml(roomId, tables) {
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    var Guide = g && g.SLAF && g.SLAF.Guide;
    var Spine = g && g.SLAF && g.SLAF.Spine;
    if (!Guide || !Spine || !tables) return null;
    var h = Spine.getProfile();
    if (!Guide.hasStarted(h)) return null;
    var at = Guide.stepOf(h, tables, roomId);
    if (!at) return null;

    var p = Guide.progress(h, tables);
    var hub = (atRoot(roomId) ? 'rooms/' : '') + 'walk.html';
    var dealt = at.state !== 'open';
    var out = [];

    out.push('<div class="slaf-walk' + (dealt ? ' is-dealt' : '') + '" id="slaf-walk">');
    out.push('<div class="slaf-walk-line">');
    out.push('<span class="slaf-walk-where">Step ' + at.step + ' of ' + at.total
      + ' <span class="slaf-walk-stage">' + escapeHtml(at.stage ? at.stage.title : '') + '</span></span>');
    out.push('<a class="slaf-walk-hub" href="' + hub + '">All ' + p.total + ' steps</a>');
    out.push('</div>');

    /* The bar. role="img" with a label, because a bare div of colour tells a
       screen reader nothing and the number beside it is the real content. */
    out.push('<div class="slaf-walk-track" role="img" aria-label="'
      + (p.done + p.skipped) + ' of ' + p.total + ' steps behind you">'
      + '<i style="width:' + p.pct + '%"></i></div>');

    out.push('<div class="slaf-walk-acts">');
    if (!dealt) {
      out.push('<button type="button" class="slaf-btn slaf-btn--primary" data-walk="done">I’m done with this one</button>');
      out.push('<button type="button" class="slaf-btn slaf-btn--quiet" data-walk="skipped">Not for me</button>');
    } else {
      out.push('<span class="slaf-walk-said">'
        + (at.state === 'done' ? '✓ You marked this one done.' : 'Set aside — not for you.')
        + '</span>');
      out.push('<button type="button" class="slaf-btn slaf-btn--quiet" data-walk="open">Undo</button>');
    }
    if (at.next) {
      out.push('<a class="slaf-btn' + (dealt ? ' slaf-btn--primary' : ' slaf-btn--quiet') + '" href="'
        + hrefFrom(roomId, at.next.href) + '">Next: ' + escapeHtml(at.next.title) + ' →</a>');
    } else if (dealt) {
      out.push('<a class="slaf-btn slaf-btn--primary" href="' + hub + '">That was the last one →</a>');
    }
    out.push('</div>');
    out.push('</div>');
    return out.join('');
  }

  /* A room's registry href is written from the site root ("rooms/x.html").
     From inside rooms/ that needs the "../" stripped off the front. */
  function hrefFrom(roomId, href) {
    if (atRoot(roomId)) return href;
    return href.indexOf('rooms/') === 0 ? href.slice('rooms/'.length) : '../' + href;
  }

  function mountWalk(roomId, nav) {
    if (typeof document === 'undefined') return null;
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    var Spine = g && g.SLAF && g.SLAF.Spine;
    var Reference = g && g.SLAF && g.SLAF.Reference;
    if (!Spine || !Reference || !nav || !nav.parentNode) return null;
    var tables = null;

    function sync() {
      var want = walkBarHtml(roomId, tables);
      var have = document.getElementById('slaf-walk');
      if (!want) { if (have) have.parentNode.removeChild(have); return null; }
      var box = document.createElement('div');
      box.innerHTML = want;
      var fresh = box.firstChild;
      if (have) have.parentNode.replaceChild(fresh, have);
      else nav.parentNode.insertBefore(fresh, nav.nextSibling);
      wire(fresh);
      return fresh;
    }

    function wire(bar) {
      var btns = bar.querySelectorAll('button[data-walk]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function (e) {
          var want = e.currentTarget.getAttribute('data-walk');
          Spine.markWalkStep(roomId, want === 'open' ? null : want);
          /* Spine.onChange repaints; nothing to do here. */
        });
      }
    }

    Spine.onChange(sync);
    Reference.load([ (g.SLAF.Guide && g.SLAF.Guide.TABLE) || 'walkStages' ],
      atRoot(roomId) ? 'data/' : '../data/')
      .then(function (T) { tables = T; sync(); })
      .catch(function () { /* no table, no bar. The room is unaffected. */ });
    return null;
  }

  /* The way back. A cross-room link carries ?from=<roomId> (D-161); if this
     page was reached by one, the first thing in the header is the way back to
     the room that sent you. Read from the URL rather than history.back(),
     because the browser's back button and this are different promises: back
     retraces steps, this returns to the room whose number you left to fill in,
     however many taps ago that was. Unknown or malformed ids resolve to
     nothing and the pill simply does not appear. */
  function returnHtml(roomId) {
    if (typeof location === 'undefined') return '';
    var m = /[?&]from=([^&#]+)/.exec(location.search);
    if (!m) return '';
    var fromId;
    try { fromId = decodeURIComponent(m[1]); } catch (e) { return ''; }
    if (fromId === roomId) return '';
    var room = Registry.byId(fromId);
    if (!room) return '';
    return '<a class="slaf-return" href="' + escapeHtml(href(room.href, roomId)) + '">'
      + '\u21A9 Back to ' + escapeHtml(room.title) + '</a>';
  }

  /* ---- The dead spot is the door (D-163) ----------------------------------
     Thirty-four places in the app print "Add your debts to see this" exactly
     where a number should be. The sentence names what is missing and the app
     knows which room owns it, so the words should also be the way there.

     Done at the DOM rather than in each of the twenty-one rooms that render
     their own `.slaf-reason`: they repaint on every change, so a one-shot pass
     at mount would be undone the first time anything moved. The observer is
     idempotent (a door is stamped `data-door`) and only ever APPENDS to a
     reason that has no link of its own - it never rewrites a room's words and
     never touches a control, so it stays clear of LIVE-FORM (D-034).

     The field named is the one the most rooms are waiting on, taken from the
     stored profile rather than the room's guess-filled copy: a guess makes a
     room able to compute, which is not the same as the number being known. */
  function doorHtml(roomId) {
    var row = forRoom(roomId, Spine() ? Spine().getProfile() : null);
    if (!row || !row.missing.length) return '';
    var f = row.missing[0];
    if (f.ownHere) return '';
    return '<a class="slaf-go" data-door href="' + escapeHtml(href(f.href.replace(/^\.\.\//, ''), roomId))
      + '">' + escapeHtml(f.label) + ' is in ' + escapeHtml(f.ownerTitle) + ' \u2192</a>';
  }

  function Spine() {
    var S = (typeof self !== 'undefined' ? self : this).SLAF;
    return S && S.Spine;
  }

  function mountDoors(roomId) {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    if (!Spine()) return;
    var queued = false;
    function pass() {
      queued = false;
      var html = doorHtml(roomId);
      if (!html) return;
      var list = document.querySelectorAll('.slaf-reason');
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (el.querySelector('a')) continue;            /* the room already links out */
        if (el.nextElementSibling && el.nextElementSibling.hasAttribute
            && el.nextElementSibling.hasAttribute('data-door')) continue;
        el.insertAdjacentHTML('afterend', html);
      }
    }
    function schedule() { if (queued) return; queued = true;
      (window.requestAnimationFrame || setTimeout)(pass, 0); }
    schedule();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }

  function mountHeader(roomId) {
    if (typeof document === 'undefined') return null;
    /* Mounted once. The header goes up at DOMContentLoaded (see the listener
       at the bottom of this file) so it is on screen before any table has
       loaded; the room's own later call is then a no-op. D-170. */
    var have = document.querySelector('.slaf-hops-host');
    if (have) return have;
    var back = document.querySelector('.room-back, .back');
    if (!back) return null;
    var nav = document.createElement('div');
    nav.className = 'slaf-hops-host';
    nav.innerHTML = returnHtml(roomId) + headerNavHtml(roomId);
    back.parentNode.replaceChild(nav, back);
    mountMenu(roomId, nav);
    mountSituation(roomId);
    mountWalk(roomId, nav);
    mountDoors(roomId);
    mountFold(roomId);
    mountSectionSync(roomId);
    return nav;
  }

  /* ---- Progressive disclosure: the tail of a long room folds (D-170) -----
     A room is its first few sections; the rest sit behind one button that
     names what it holds. Folding is a class on <main> plus a class on each
     folded section — nothing is detached and no input is rebuilt, so the
     live-form rule (D-034) holds and a deep link into a folded section still
     resolves: the fold opens itself when the hash points inside it, at load
     and on every hashchange. Rooms that fold on their own terms (Start
     Here's cards, the dashboard's panel) say so with data-fold="own". */
  var FOLD_KEEP = 4;
  function roomSections(host) {
    /* The situation notice folds the whole room (D-142) with a class on the
       host; lift it for the measurement so the room's own sections are seen
       as they will be once "show it anyway" is tapped. Synchronous, so no
       frame is painted in between. */
    var lifted = host.classList.contains('slaf-folded');
    if (lifted) host.classList.remove('slaf-folded');
    var out = Array.prototype.filter.call(host.children, function (n) {
      /* A section that is not displayed at mount - a wizard stage, a
         hidden branch - is not part of the room yet, so it neither folds
         nor writes itself to the URL. */
      return n.tagName === 'SECTION' && n.id && !n.hidden
        && n.id !== 'slaf-progress' && n.id !== 'slaf-notapply' && n.id !== 'slaf-ask' && n.id !== 'slaf-reopen'
        && (typeof getComputedStyle !== 'function' || getComputedStyle(n).display !== 'none');
    });
    if (lifted) host.classList.add('slaf-folded');
    return out;
  }
  function sectionName(roomId, sec) {
    var room = Registry.byId(roomId);
    var sub = room && (room.subsections || []).filter(function (x) { return x.id === sec.id; })[0];
    if (sub) return sub.label;
    var h = sec.querySelector('h2, .slaf-eyebrow, h3');
    return h ? (h.textContent || '').trim().replace(/\s+/g, ' ') : sec.id;
  }
  function mountFold(roomId) {
    if (typeof document === 'undefined') return null;
    var host = document.querySelector('main') || document.querySelector('.wrap');
    if (!host || host.getAttribute('data-fold') === 'own') return null;
    if (document.getElementById('showrest')) return null;
    var secs = roomSections(host);
    if (secs.length <= FOLD_KEEP) return null;
    var folded = secs.slice(FOLD_KEEP);
    folded.forEach(function (sec) { sec.classList.add('slaf-tail'); });
    host.classList.add('slaf-tail-folded');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'showrest';
    btn.className = 'slaf-showrest';
    var names = folded.map(function (sec) { return sectionName(roomId, sec); });
    btn.innerHTML = '<b>Show the rest</b> <small>' + escapeHtml(names.join(' · ')) + '</small>';
    secs[FOLD_KEEP - 1].parentNode.insertBefore(btn, secs[FOLD_KEEP - 1].nextSibling);

    function unfold() {
      host.classList.remove('slaf-tail-folded');
      if (btn.parentNode) btn.parentNode.removeChild(btn);
      window.removeEventListener('hashchange', check);
    }
    btn.addEventListener('click', unfold);
    function check() {
      var id = (location.hash || '').slice(1);
      if (!id) return;
      var target = document.getElementById(id);
      if (!target) return;
      var inside = folded.some(function (sec) { return sec === target || sec.contains(target); });
      if (!inside) return;
      unfold();
      target.scrollIntoView({ block: 'start' });
    }
    window.addEventListener('hashchange', check);
    check();
    return btn;
  }

  /* ---- The URL follows you (D-170) -------------------------------------
     As a section reaches the top of the screen its id becomes the hash,
     written with replaceState so nothing is added to history and nothing
     re-scrolls. Copy the address at any moment and it lands here. */
  function mountSectionSync(roomId) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return null;
    var host = document.querySelector('main') || document.querySelector('.wrap');
    if (!host) return null;
    var secs = roomSections(host);
    if (secs.length < 2) return null;
    var queued = false;
    function current() {
      /* The last section whose top has passed the upper third of the
         screen; at the very bottom, the last section on the page. */
      var line = window.innerHeight * 0.35, hit = null;
      var atEnd = window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 2;
      secs.forEach(function (sec) {
        if (sec.hidden || getComputedStyle(sec).display === 'none') return;
        var top = sec.getBoundingClientRect().top;
        if (top <= line || (atEnd && top < window.innerHeight)) hit = sec;
      });
      return hit;
    }
    function sync() {
      queued = false;
      var sec = current();
      if (!sec || location.hash === '#' + sec.id) return;
      try { history.replaceState(history.state, '', location.pathname + location.search + '#' + sec.id); } catch (err) { /* fine */ }
    }
    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      (window.requestAnimationFrame || setTimeout)(sync);
    }, { passive: true });
    return { sync: sync };
  }

  /** The room this page is, from its path — for the header-first mount. */
  function roomIdFromLocation() {
    if (typeof location === 'undefined') return null;
    var file = (location.pathname.split('/').pop() || 'index.html');
    var hit = Registry.all().filter(function (r) { return r.href.split('/').pop() === file; })[0];
    return hit ? hit.id : null;
  }

  /* ---- Two guards every room carries (D-204) ------------------------------
     1. The page and the shared core are different builds: the spine has
        already refused to write; this says so at the top of the page, once,
        with a reload button. Nothing else on the page changes.
     2. iPhone Safari drops a site's storage after seven days away unless
        the site is on the Home Screen. One quiet line, once, dismissable,
        never a popup; installed web apps never see it. */
  function mountGuards(g, Spine) {
    var Prefs = g.SLAF && g.SLAF.Prefs;
    var state = Spine.storageState ? Spine.storageState() : null;
    var main = document.querySelector('main') || document.querySelector('.wrap') || document.body;
    if (state && state.status === 'stale-page' && !document.getElementById('slaf-stale')) {
      var box = document.createElement('div');
      box.id = 'slaf-stale';
      box.className = 'slaf-stale';
      box.setAttribute('role', 'status');
      box.innerHTML = '<b>Updating, reload in a moment.</b> This page is one build and the app underneath it is another (page ' + escapeHtml(state.pageBuild) + ', app ' + escapeHtml(state.coreBuild) + '). Nothing is saved until they match. '
        + '<button type="button" class="slaf-btn" id="slaf-stale-reload">Reload</button>';
      main.insertBefore(box, main.firstChild);
      box.querySelector('#slaf-stale-reload').addEventListener('click', function () { try { g.location.reload(); } catch (e) { /* fine */ } });
    }
    var ua = g.navigator && g.navigator.userAgent ? g.navigator.userAgent : '';
    var iphoneSafari = /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    var installed = g.navigator && g.navigator.standalone === true;
    var seen = Prefs && Prefs.get ? Prefs.get('a2hs.seen', false) : true;
    if (iphoneSafari && !installed && !seen && !document.getElementById('slaf-a2hs')) {
      var line = document.createElement('p');
      line.id = 'slaf-a2hs';
      line.className = 'slaf-a2hs';
      line.innerHTML = 'On an iPhone, Safari clears a site\u2019s saved numbers after seven days away, unless the site is on your Home Screen. Tap Share, then <b>Add to Home Screen</b>, and it keeps them. '
        + '<button type="button" class="slaf-btn slaf-btn--quiet" id="slaf-a2hs-ok">Got it</button>';
      main.insertBefore(line, main.firstChild);
      line.querySelector('#slaf-a2hs-ok').addEventListener('click', function () { if (Prefs && Prefs.set) Prefs.set('a2hs.seen', true); line.remove(); });
    }
  }

  /**
   * mount(roomId) — put the strip at the end of the page and keep it live.
   *
   * Creates its container once and only ever rewrites that container's
   * innerHTML, which holds no inputs — so this can repaint freely without
   * going anywhere near the live-form rule (D-034).
   */
  function mount(roomId, opts) {
    var o = opts || {};
    if (typeof document === 'undefined') return null;
    /* The factory does not close over the UMD wrapper's `root`, so reach the
       global the same way the wrapper does rather than assuming a name. */
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    var Spine = g && g.SLAF && g.SLAF.Spine;
    if (!Spine) return null;
    mountGuards(g, Spine);

    /* Rooms use <main>; the FOO ladder builds into #root > .wrap. Try the
       shapes this app actually has rather than assuming one. */
    var host = o.into ? document.querySelector(o.into)
      : (document.querySelector('main') || document.querySelector('.wrap')
         || document.getElementById('root') || document.body);
    if (!host) return null;

    var box = document.createElement('section');
    box.className = 'slaf-progress-host';
    box.id = 'slaf-progress';
    /* Before the disclaimer if there is one, so the small print stays last. */
    var tail = host.querySelector('.disclaimer');
    if (tail) host.insertBefore(box, tail); else host.appendChild(box);

    /* The version, printed in every room's footer (D-131): version.json
       carries the same string, and the test holds the two together. */
    var version = g.SLAF.Schema && g.SLAF.Schema.APP_VERSION
      ? '<p class="slaf-version">Money Rooms v' + g.SLAF.Schema.APP_VERSION + (g.SLAF.Schema.BUILD ? ' · build ' + g.SLAF.Schema.BUILD : '') + '</p>'
      : '';
    function yearLine() {
      var R = g.SLAF.Reference;
      var notes = R && R.yearNotes ? R.yearNotes(R._cache || {}) : [];
      return notes.length ? '<p class="slaf-version">Tax and limit figures: ' + notes.map(escapeHtml).join(', ') + '. Newer tables are not in this build yet.</p>' : '';
    }
    function paint() {
      box.innerHTML = stripHtml(roomId, Spine.getProfile()) + version + yearLine();
      /* Every room gets its own export, from the one mount point every room
         already reaches — the same lever the walk strip and the situation
         notice use (D-142, D-149). No per-room wiring, so no room can be
         forgotten. D-155. */
      if (g.SLAF.RoomExport) g.SLAF.RoomExport.mount(roomId, box);
    }
    paint();
    /* The one inline question a room needs (D-207, Phase D): loaded and
       mounted from here so no room needs wiring. ask.js pulls in what the
       room does not carry. Never on the Ledger or the First Round, which
       ask their own way, and never twice. */
    var base = (typeof location !== 'undefined' && location.pathname.indexOf('/rooms/') !== -1 ? '../' : '');
    function withAsk(fn) {
      if (g.SLAF.Ask) { fn(); return; }
      var sc = document.createElement('script');
      sc.src = base + 'shared/ask.js';
      sc.onload = fn;
      document.head.appendChild(sc);
    }
    /* A life change waiting for its sheet (G2.6, D-209): shown on the next
       page opened, before the room's own question. Not on the First Round or
       Express, which show every row live already. */
    var pendingChange = Spine && Spine.reopenPending ? Spine.reopenPending() : null;
    if (pendingChange && !pendingChange.dismissed && ['first-round', 'express'].indexOf(roomId) === -1 && !document.getElementById('slaf-reopen')) {
      withAsk(function () {
        if (g.SLAF.Reopen) { g.SLAF.Reopen.mountLater(host); return; }
        var sc = document.createElement('script');
        sc.src = base + 'shared/reopen.js';
        sc.onload = function () { if (g.SLAF.Reopen) g.SLAF.Reopen.mountLater(host); };
        document.head.appendChild(sc);
      });
    }
    if (['ledger', 'first-round', 'start', 'express'].indexOf(roomId) === -1 && !document.getElementById('slaf-ask')) {
      withAsk(function () { if (g.SLAF.Ask) g.SLAF.Ask.mount(roomId, host); });
    }

    /* A write during a tap (blur → save → change) used to repaint this
       strip synchronously. When an item drops off the list the document
       gets shorter; if the page is scrolled near the bottom the browser
       clamps the scroll and everything above shifts under the finger — the
       Next button moved 40px between touchend and click and the tap was
       lost. So: repaint after the tap has finished, coalesced, and hold the
       strip's height across the change so the document never shrinks
       mid-gesture. Same family as D-034/D-046. */
    var pending = null, release = null;
    function repaintLater() {
      if (pending) clearTimeout(pending);
      pending = setTimeout(function () {
        pending = null;
        var held = box.offsetHeight;
        if (held) box.style.minHeight = held + 'px';
        paint();
        if (release) clearTimeout(release);
        release = setTimeout(function () { box.style.minHeight = ''; release = null; }, 600);
      }, 400);
    }
    Spine.onChange(repaintLater);
    /* The header nav is static for a room — path order does not change with
       the household — so it is built once and never repainted. */
    mountHeader(roomId);
    return { repaint: paint, el: box };
  }

  /* Header first: before any table loads, before the room's init can throw.
     A room that dies halfway still has its menu and its way out. D-170. */
  if (typeof document !== 'undefined' && typeof location !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      var id = roomIdFromLocation();
      if (id && !document.querySelector('.slaf-hops-host')) mountHeader(id);
    });
  }

  return {
    mount: mount,
    mountHeader: mountHeader,
    mountFold: mountFold,
    mountSectionSync: mountSectionSync,
    roomIdFromLocation: roomIdFromLocation,
    mountSituation: mountSituation,
    situationNoticeHtml: situationNoticeHtml,
    mountWalk: mountWalk,
    walkBarHtml: walkBarHtml,
    mountMenu: mountMenu,
    menuHtml: menuHtml,
    menuBodyHtml: menuBodyHtml,
    roomStatus: roomStatus,
    UPKEEP: UPKEEP,
    headerNavHtml: headerNavHtml,
    forRoom: forRoom,
    all: all,
    overall: overall,
    nextUnfinished: nextUnfinished,
    neighbours: neighbours,
    stripHtml: stripHtml
  };
});
