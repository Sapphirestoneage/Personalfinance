/* kehillah/page-resources.js, Resources (KD-004). A list, escaped. */
(function () {
  'use strict';
  var K = SLAF.K;
  K.boot('resources', function (T) {
    K.el('groups').innerHTML = T.resources.groups.map(function (g) {
      return '<section class="k-card" aria-label="' + K.esc(g.label) + '"><h2>' + K.esc(g.label) + '</h2><p class="k-note">' + K.esc(g.plain) + '</p><ul class="k-links" style="margin-top:var(--space-3)">' + g.items.map(function (it) {
        var external = /^https?:/.test(it.url);
        return '<li><a href="' + K.esc(it.url) + '"' + (external ? ' rel="noopener"' : '') + '>' + K.esc(it.name) + '</a><span class="k-note">' + K.esc(it.plain) + '</span></li>';
      }).join('') + '</ul></section>';
    }).join('');
    K.words(K.el('words'), T, ['Kehillah', 'Gemach', 'Guarantor', 'Sliding scale', 'Shul']);
    K.foot(K.el('foot'), T, 'resources');
  });
})();
