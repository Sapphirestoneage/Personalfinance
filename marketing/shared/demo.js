/* ==========================================================================
   marketing/shared/demo.js, the example data. MD-004.
   --------------------------------------------------------------------------
   Twelve weeks of made-up posts, people and touches, laid out relative to
   the day it is loaded so the Scoreboard always looks current. Every name
   and number is invented; nothing here is anyone's real contact or result.
     Demo.build(today) -> { posts, people, touches, targets }
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.MktDemo = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var DAY = 86400000;
  function ms(iso) { return Date.parse(iso + 'T12:00:00Z'); }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(d, n) { return iso(ms(d) + n * DAY); }
  /* A small seeded generator, so the demo is the same every time. */
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  var CHANNELS = ['instagram', 'instagram', 'linkedin', 'youtube', 'newsletter', 'tiktok'];
  var FORMATS = { instagram: ['short_video', 'carousel', 'story'], linkedin: ['text', 'carousel'], youtube: ['long_video'], newsletter: ['email'], tiktok: ['short_video'] };
  var PILLARS = ['money habits', 'behind the scenes', 'client story', 'a mistake I made', 'how to'];
  var HOOKS = ['The one number nobody checks', 'I did this wrong for ten years', 'What a client asked me this week', 'Three minutes on the thing you keep putting off', 'Stop budgeting. Do this instead.', 'What I would tell my younger self about debt', 'The spreadsheet that runs my life', 'Why your emergency fund is the wrong size'];
  var CTAS = ['none', 'comment', 'dm', 'follow', 'link', 'book'];
  var FIRST = ['Ada', 'Ben', 'Cleo', 'Dev', 'Esme', 'Femi', 'Gus', 'Hana', 'Iris', 'Jonah', 'Kit', 'Lena', 'Mo', 'Nia', 'Oren', 'Pia', 'Quinn', 'Rae', 'Sol', 'Tess', 'Uma', 'Vik', 'Wren', 'Zed'];
  var LAST = ['Okafor', 'Lindqvist', 'Marsh', 'Patel', 'Reyes', 'Sato', 'Novak', 'Byrne', 'Haddad', 'Kowalski', 'Moreau', 'Osei'];
  var COMPANIES = ['Northwind Studio', 'Bramble & Co', 'Halcyon Physio', 'Tidewater Books', 'Ferro Fitness', 'Oak Lane Dental', '', ''];
  var STAGES = ['stranger', 'follower', 'follower', 'conversation', 'conversation', 'conversation', 'lead', 'lead', 'call', 'client', 'client', 'advocate', 'lost'];
  var SOURCES = ['content', 'content', 'referral', 'event', 'known', 'cold'];
  var KINDS = { follower: ['comment', 'dm'], conversation: ['dm', 'dm', 'email'], lead: ['email', 'call', 'voice'], call: ['email'], client: ['call', 'email'], advocate: ['email', 'gift'], lost: ['dm'], stranger: ['comment'] };

  function build(today) {
    var r = rng(20260926), posts = [], people = [], touches = [], n = 0;
    var start = addDays(today, -83);
    for (var d = 0; d < 84; d++) {
      var day = addDays(start, d), dow = new Date(ms(day)).getUTCDay();
      var howMany = dow === 0 ? 0 : dow === 6 ? (r() < 0.3 ? 1 : 0) : (r() < 0.75 ? 1 : 0) + (r() < 0.25 ? 1 : 0);
      for (var i = 0; i < howMany; i++) {
        var ch = CHANNELS[Math.floor(r() * CHANNELS.length)], fm = FORMATS[ch][Math.floor(r() * FORMATS[ch].length)];
        var base = { instagram: 900, linkedin: 1400, youtube: 600, newsletter: 380, tiktok: 2200 }[ch] * (0.6 + r() * 1.2) * (1 + d / 120);
        var checked = d < 81;
        var imp = checked ? Math.round(base * (fm === 'short_video' ? 1.6 : fm === 'story' ? 0.4 : 1)) : null;
        var er = 0.015 + r() * 0.05 + (fm === 'carousel' ? 0.02 : 0);
        var eng = imp === null ? null : Math.round(imp * er);
        var cta = CTAS[Math.floor(r() * CTAS.length)];
        posts.push({ id: 'demo_p' + (++n), date: day, channel: ch, format: fm, pillar: PILLARS[Math.floor(r() * PILLARS.length)], hook: HOOKS[Math.floor(r() * HOOKS.length)], cta: cta, link: '',
          minutes: fm === 'long_video' ? 240 : fm === 'email' ? 90 : fm === 'carousel' ? 60 : 25,
          results: imp === null ? { impressions: null, likes: null, comments: null, shares: null, saves: null, clicks: null, dms: null, follows: null, leads: null }
            : { impressions: imp, likes: Math.round(eng * 0.7), comments: Math.round(eng * 0.12), shares: Math.round(eng * 0.08), saves: Math.round(eng * 0.1), clicks: cta === 'link' ? Math.round(imp * 0.012) : (ch === 'newsletter' ? Math.round(imp * 0.04) : null),
              dms: cta === 'dm' ? Math.round(imp * 0.004) : (r() < 0.3 ? Math.round(imp * 0.001) : null), follows: Math.round(imp * 0.006), leads: cta === 'book' || cta === 'dm' ? (r() < 0.5 ? 1 : 0) : (r() < 0.1 ? 1 : 0) },
          resultsAt: imp === null ? null : addDays(day, 3), notes: '', createdAt: day + 'T12:00:00.000Z' });
      }
    }
    for (var k = 0; k < 24; k++) {
      var stage = STAGES[k % STAGES.length], created = addDays(start, Math.floor(r() * 70));
      var p = { id: 'demo_c' + (k + 1), name: FIRST[k] + ' ' + LAST[(k * 5) % LAST.length], email: FIRST[k].toLowerCase() + '@example.com', phone: '', company: COMPANIES[k % COMPANIES.length], role: '', platform: ['instagram', 'linkedin', 'email'][k % 3], handle: '@' + FIRST[k].toLowerCase() + '.demo',
        source: SOURCES[k % SOURCES.length], stage: stage, stageHistory: [], tags: k % 4 === 0 ? ['small business'] : k % 4 === 1 ? ['parent'] : [], cadence: null, nextAt: null, value: stage === 'client' || stage === 'advocate' ? [120000, 250000, 480000][k % 3] : null, notes: '', fromPostId: k % 3 === 0 ? 'demo_p' + (1 + Math.floor(r() * 20)) : null, archived: false, createdAt: created + 'T12:00:00.000Z' };
      var order = ['stranger', 'follower', 'conversation', 'lead', 'call', 'client', 'advocate'], upto = stage === 'lost' ? 2 : order.indexOf(stage), at = created;
      for (var s = 0; s <= upto; s++) { p.stageHistory.push({ stage: order[s], at: at }); at = addDays(at, 2 + Math.floor(r() * 9)); if (at > today) at = today; }
      if (stage === 'lost') p.stageHistory.push({ stage: 'lost', at: at });
      var kinds = KINDS[stage], nTouch = stage === 'stranger' ? 0 : 1 + Math.floor(r() * 4), tAt = created;
      for (var t = 0; t < nTouch; t++) {
        tAt = addDays(tAt, 3 + Math.floor(r() * 12)); if (tAt > today) break;
        var out = r() < 0.55 ? 'replied' : 'none';
        touches.push({ id: 'demo_t' + (++n), personId: p.id, date: tAt, kind: kinds[t % kinds.length], lane: p.source === 'cold' ? 'cold' : p.source === 'content' ? 'content' : p.source === 'referral' ? 'referral' : 'warm', direction: 'out', outcome: t === nTouch - 1 && stage === 'call' ? 'booked' : t === nTouch - 1 && stage === 'client' ? 'sold' : out, note: '', createdAt: tAt + 'T12:00:00.000Z' });
        if (out === 'replied' && r() < 0.5) { var inAt = addDays(tAt, 1); if (inAt <= today) touches.push({ id: 'demo_t' + (++n), personId: p.id, date: inAt, kind: 'dm', lane: 'warm', direction: 'in', outcome: 'none', note: 'They wrote back.', createdAt: inAt + 'T12:00:00.000Z' }); }
      }
      /* Slide this person's touches so the last one is recent: the due list then reads like a real week, not a backlog. */
      var mine = touches.filter(function (t) { return t.personId === p.id; });
      if (mine.length) {
        var lastAt = mine.reduce(function (m, t) { return t.date > m ? t.date : m; }, '');
        var want = addDays(today, -(stage === 'follower' || stage === 'advocate' || stage === 'lost' ? 10 + Math.floor(r() * 30) : Math.floor(r() * 12)));
        var shift = Math.round((ms(want) - ms(lastAt)) / DAY);
        mine.forEach(function (t) { t.date = addDays(t.date, shift); t.createdAt = t.date + 'T12:00:00.000Z'; });
        var first = mine.reduce(function (m, t) { return t.date < m ? t.date : m; }, '9999');
        if (first < created) { p.createdAt = first + 'T12:00:00.000Z'; p.stageHistory.forEach(function (h) { if (h.at < first) h.at = first; }); }
      }
      people.push(p);
    }
    return { posts: posts, people: people, touches: touches, targets: { postsPerWeek: 5, outreachPerWeek: 25, conversationsPerWeek: 10, leadsPerWeek: 3, callsPerWeek: 2 } };
  }
  return { build: build };
});
