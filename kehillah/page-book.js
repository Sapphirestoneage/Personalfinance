/* kehillah/page-book.js, Book (KD-005). The booking address from data/practice.json; honest when it is not set. */
(function () {
  'use strict';
  var K = SLAF.K;
  K.boot('book', function (T) {
    var B = T.practice.booking;
    K.el('plain').textContent = B.plain;
    var url = /^https:\/\//.test(B.url || '') ? B.url : null;
    var email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(B.email || '') ? B.email : null;
    var a = K.el('actions');
    if (url) a.innerHTML = '<a class="slaf-btn slaf-btn--primary k-bigbtn" href="' + K.esc(url) + '" rel="noopener">' + K.esc(B.label) + '</a>' + (email ? '<a class="slaf-btn k-bigbtn" href="mailto:' + K.esc(email) + '">Or email Eli</a>' : '');
    else if (email) a.innerHTML = '<a class="slaf-btn slaf-btn--primary k-bigbtn" href="mailto:' + K.esc(email) + '?subject=' + encodeURIComponent('A free call') + '">Email Eli to set a time</a>';
    else a.innerHTML = '';
    K.say('say', url ? 'The calendar opens in a new tab. Pick any time that is free.' : email ? 'Say a few times that work for you and Eli replies with a link.' : 'Online booking is being set up. Check back in a few days, or find Eli through the communities on the Resources page.', url || email ? null : 'bad');
  });
})();
