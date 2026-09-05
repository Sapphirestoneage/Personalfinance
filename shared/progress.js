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
        display: d.display
      };
      (d.isSet ? filled : missing).push(entry);
    });

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
    var next = nextUnfinished(household, roomId);

    var out = [];
    out.push('<div class="slaf-progress">');

    if (row.missing.length) {
      out.push('<p class="slaf-progress-head"><strong>' + row.missing.length
        + ' thing' + (row.missing.length === 1 ? '' : 's') + ' left</strong> before this room '
        + 'can show you everything — each one links straight to the question.</p>');
      out.push('<ul class="slaf-progress-list">' + row.missing.map(function (f) {
        return '<li><a href="' + escapeHtml(href(f.href.replace(/^\.\.\//, ''), roomId)) + '">'
          + escapeHtml(f.label) + '</a>'
          + '<span class="slaf-progress-where">'
          + (f.ownHere ? 'on this page' : 'in ' + escapeHtml(f.ownerTitle)) + '</span></li>';
      }).join('') + '</ul>');
    } else if (!row.standalone) {
      out.push('<p class="slaf-progress-head"><strong>This room has everything it needs.</strong> '
        + 'All ' + row.total + ' figure' + (row.total === 1 ? '' : 's')
        + ' it reads are filled in.</p>');
    } else {
      out.push('<p class="slaf-progress-head"><strong>This room stands on its own.</strong> '
        + 'It works from the numbers you type here, so there is nothing to fill in first.</p>');
    }

    /* Questions that stopped applying are said out loud once, so a room that
       reads "everything it needs" is not quietly ignoring two boxes you can
       see are empty. DECISIONS.md D-055. */
    if (row.notApplicable && row.notApplicable.length) {
      out.push('<p class="slaf-progress-note">Not asked: '
        + row.notApplicable.map(function (f) { return escapeHtml(f.label); }).join(', ')
        + '. ' + escapeHtml(row.notApplicable[0].because || '') + '</p>');
    }

    out.push('<div class="slaf-progress-nav">');
    if (nb.prev) {
      out.push('<a class="slaf-progress-btn" href="' + escapeHtml(href(nb.prev.href, roomId))
        + '">← ' + escapeHtml(nb.prev.title) + '</a>');
    } else {
      out.push('<span></span>');
    }
    if (next && next.roomId !== roomId) {
      out.push('<a class="slaf-progress-btn is-next" href="' + escapeHtml(href(next.href, roomId))
        + '">Next unfinished: ' + escapeHtml(next.title) + ' →</a>');
    } else if (nb.next) {
      out.push('<a class="slaf-progress-btn is-next" href="' + escapeHtml(href(nb.next.href, roomId))
        + '">' + escapeHtml(nb.next.title) + ' →</a>');
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

  /**
   * mountHeader(roomId) — upgrade the room's single "← All rooms" link into
   * that three-way nav, in place. Every room already has one, so this needs
   * no per-room markup.
   */
  function mountHeader(roomId) {
    if (typeof document === 'undefined') return null;
    var back = document.querySelector('.room-back, .back');
    if (!back) return null;
    var nav = document.createElement('div');
    nav.className = 'slaf-hops-host';
    nav.innerHTML = headerNavHtml(roomId);
    back.parentNode.replaceChild(nav, back);
    return nav;
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

    function paint() {
      box.innerHTML = stripHtml(roomId, Spine.getProfile());
    }
    paint();

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

  return {
    mount: mount,
    mountHeader: mountHeader,
    headerNavHtml: headerNavHtml,
    forRoom: forRoom,
    all: all,
    overall: overall,
    nextUnfinished: nextUnfinished,
    neighbours: neighbours,
    stripHtml: stripHtml
  };
});
