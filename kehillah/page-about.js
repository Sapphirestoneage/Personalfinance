/* kehillah/page-about.js, About (KD-005). Every word from data/practice.json. */
(function () {
  'use strict';
  var K = SLAF.K;
  K.boot('about', function (T) {
    var P = T.practice;
    K.el('name').textContent = P.person.name;
    K.el('meta').textContent = P.person.pronouns + '. ' + P.person.role + ', ' + P.practice.name + '. ' + P.person.where;
    K.el('lead').textContent = P.about.lead;
    K.el('paragraphs').innerHTML = P.about.paragraphs.map(function (p) { return '<p>' + K.esc(p) + '</p>'; }).join('');
    K.el('values').innerHTML = P.about.values.map(function (v) { return '<div><b>' + K.esc(v.title) + '</b><p class="k-note">' + K.esc(v.plain) + '</p></div>'; }).join('');
    K.el('book').setAttribute('href', K.bookHref(T));
    if (P.person.photo) { var img = document.createElement('img'); img.src = P.person.photo; img.alt = P.person.name; img.style.width = '100%'; img.style.borderRadius = 'var(--radius-lg)'; K.el('portrait').replaceWith(img); }
  });
})();
