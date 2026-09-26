/* ==========================================================================
   me/render.js: draws the page from window.ME (content.js). Nothing here
   is content; if a word on the page is wrong, it is in content.js.
   ========================================================================== */
(function () {
  'use strict';
  var C = window.ME || {};
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (attrs[k] !== '' && attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function external(url) { return /^https?:/.test(url) && url.indexOf(location.host) === -1; }
  function link(url, attrs, children) {
    var a = el('a', attrs, children);
    a.href = url;
    if (external(url)) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }
  function flag(item) { return item.example ? el('span', { 'class': 'example-flag', text: 'example' }) : null; }
  function initials(name) {
    return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join('');
  }
  function hide(id) { var s = $(id); if (s) s.hidden = true; }

  /* ---- Head, title, structured data --------------------------------------- */
  document.title = C.name + ' · ' + (C.tagline || 'about me');
  var desc = (C.about && C.about[0]) || C.tagline || '';
  ['description', 'og:description', 'twitter:description'].forEach(function (n) {
    var m = document.querySelector('meta[name="' + n + '"], meta[property="' + n + '"]');
    if (m) m.setAttribute('content', desc);
  });
  var ogt = document.querySelector('meta[property="og:title"]'); if (ogt) ogt.setAttribute('content', C.name);
  var ld = {
    '@context': 'https://schema.org', '@type': 'Person', name: C.name,
    url: location.origin + location.pathname,
    email: C.contact && C.contact.email ? 'mailto:' + C.contact.email : undefined,
    sameAs: (C.links || []).map(function (l) { return l.url; }).filter(function (u) { return /^https?:/.test(u); }),
    jobTitle: C.resume && C.resume.headline,
    description: desc,
    knowsAbout: (C.resume && C.resume.skills || []).filter(function (s) { return !/your skill/i.test(s); })
  };
  document.head.appendChild(el('script', { type: 'application/ld+json', text: JSON.stringify(ld) }));

  /* ---- Header and hero ---------------------------------------------------- */
  $('brand').textContent = C.name;
  $('name').textContent = C.name;
  $('tagline').textContent = C.tagline || '';
  var where = $('where');
  if (C.location) where.textContent = C.location; else where.hidden = true;
  var av = $('avatar');
  if (C.photo) av.appendChild(el('img', { src: C.photo, alt: C.name }));
  else av.textContent = initials(C.name);
  var links = $('links');
  (C.links || []).forEach(function (l, i) {
    if (!l.url) return;
    links.appendChild(link(l.url, { 'class': 'pill' + (i === 0 ? ' primary' : ''), text: l.label }));
  });
  if (C.resume && C.resume.file) links.appendChild(link(C.resume.file, { 'class': 'pill', text: 'Resume (PDF)', download: '' }));

  /* ---- About -------------------------------------------------------------- */
  var about = $('about-text');
  (C.about || []).forEach(function (p) { about.appendChild(el('p', { text: p })); });
  if (!(C.about || []).length) hide('about');

  /* ---- Card grids: projects, hobbies, tools ------------------------------ */
  function card(item) {
    var kids = [flag(item)];
    var h = el('h3', {}, [item.url ? link(item.url, { text: item.title }) : el('span', { text: item.title })]);
    kids.push(h);
    if (item.status) kids.push(el('span', { 'class': 'status ' + item.status.replace(/\s+/g, '-'), text: item.status }));
    if (item.blurb) kids.push(el('p', { text: item.blurb }));
    if (item.tags && item.tags.length) kids.push(el('div', { 'class': 'tags' }, item.tags.map(function (t) { return el('span', { 'class': 'tag-chip', text: t }); })));
    if (item.url) kids.push(link(item.url, { 'class': 'go', text: 'Open it' }));
    return el('article', { 'class': 'card' + (item.example ? ' example' : '') }, kids);
  }
  function grid(id, list) {
    var g = $(id);
    if (!list || !list.length) { hide(id.replace('-grid', '')); return; }
    list.forEach(function (it) { g.appendChild(card(it)); });
  }
  grid('projects-grid', C.projects);
  grid('hobbies-grid', C.hobbies);
  grid('tools-grid', C.tools);

  /* ---- Resume ------------------------------------------------------------- */
  var R = C.resume;
  if (!R) hide('resume');
  else {
    $('resume-lead').textContent = R.headline || '';
    $('resume-summary').textContent = R.summary || '';
    var jobs = $('jobs');
    (R.experience || []).forEach(function (j) {
      jobs.appendChild(el('article', { 'class': 'job' + (j.example ? ' example' : '') }, [
        flag(j),
        el('h3', { 'class': 'role', text: j.role }),
        el('div', { 'class': 'meta', text: [j.org, j.dates].filter(Boolean).join(' · ') }),
        el('ul', {}, (j.points || []).map(function (p) { return el('li', { text: p }); }))
      ]));
    });
    var skills = $('skills');
    (R.skills || []).forEach(function (s) { skills.appendChild(el('li', { text: s })); });
    var edu = $('education');
    (R.education || []).forEach(function (e) {
      edu.appendChild(el('div', { 'class': 'edu' + (e.example ? ' example' : '') }, [el('strong', { text: e.school }), document.createTextNode(e.detail || '')]));
    });
    if (!(R.education || []).length) $('education-block').hidden = true;
    var dl = $('download');
    if (R.file) dl.appendChild(link(R.file, { 'class': 'pill primary', text: 'Download resume (PDF)', download: '' }));
    else dl.hidden = true;
  }

  /* ---- Contact and footer ------------------------------------------------- */
  var K = C.contact || {};
  $('contact-lead').textContent = K.lead || '';
  var em = $('contact-email');
  if (K.email) { em.textContent = K.email; em.href = 'mailto:' + K.email; } else em.hidden = true;
  $('foot-name').textContent = C.name;
  $('foot-year').textContent = String(new Date().getFullYear());
  var fl = $('foot-links');
  (C.links || []).forEach(function (l) { if (l.url) fl.appendChild(link(l.url, { text: l.label })); });

  /* ---- Theme toggle (remembered in this browser only) --------------------- */
  var root = document.documentElement, btn = $('theme');
  function paint() {
    var t = root.getAttribute('data-theme');
    btn.textContent = t === 'dark' ? '☀' : t === 'light' ? '☽' : '◑';
    btn.setAttribute('aria-label', 'Theme: ' + (t || 'match the system'));
  }
  try { var saved = localStorage.getItem('me.theme'); if (saved) root.setAttribute('data-theme', saved); } catch (e) {}
  btn.addEventListener('click', function () {
    var t = root.getAttribute('data-theme');
    var next = t === 'dark' ? 'light' : t === 'light' ? null : 'dark';
    if (next) root.setAttribute('data-theme', next); else root.removeAttribute('data-theme');
    try { if (next) localStorage.setItem('me.theme', next); else localStorage.removeItem('me.theme'); } catch (e) {}
    paint();
  });
  paint();

  /* ---- Current section in the nav ----------------------------------------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.top nav a'));
  navLinks = navLinks.filter(function (a) { var s = document.querySelector(a.getAttribute('href')); return s && !s.hidden; });
  document.querySelectorAll('.top nav a').forEach(function (a) { if (navLinks.indexOf(a) === -1) a.hidden = true; });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        navLinks.forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('href') === '#' + e.target.id ? 'true' : 'false'); });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    navLinks.forEach(function (a) { io.observe(document.querySelector(a.getAttribute('href'))); });
  }
})();
