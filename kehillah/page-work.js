/* kehillah/page-work.js, Work with me (KD-005). Reads page-home.js's services and faq renderers; the stops are the coach console's nine. */
(function () {
  'use strict';
  var K = SLAF.K;
  var STOPS = [
    ['The big picture', 'What you want, in your words. Three goals with rough dates is enough.'],
    ['Money coming in', 'The number that lands in the account each month. The before-tax number can wait.'],
    ['Money going out', 'Four boxes: home, food, getting around, everything else. Rough is fine. Then what is left.'],
    ['What you owe', 'Every debt, its balance and its rate. Then the month each one is gone.'],
    ['The cushion', 'How long you could go if pay stopped. Cash first, then the insurance that protects the rest.'],
    ['What you own', 'Every account with money in it, and whether it is cash you can spend or money for later.'],
    ['Taxes', 'Two facts set the rate. Then one easy win.'],
    ['Goals and the map', 'A price and a date on each goal, what each needs a month, and whether it fits.'],
    ['Big decisions', 'The choices on your mind this year: a home, a child, a job, a move, care. Each gets a verdict: go, wait, or no.']
  ];
  K.boot('work-with-me', function (T) {
    var P = T.practice;
    K.el('book').setAttribute('href', K.bookHref(T));
    K.el('pricing').textContent = P.pricing;
    K.services(K.el('services'), T, 'full-path');
    K.el('stops').innerHTML = STOPS.map(function (s) { return '<li><b>' + K.esc(s[0]) + '</b><span class="k-note">' + K.esc(s[1]) + '</span></li>'; }).join('');
    K.el('steps').innerHTML = P.steps.map(function (s) { return '<li><b>' + K.esc(s.title) + '</b><span class="k-note">' + K.esc(s.plain) + '</span></li>'; }).join('');
    K.faq(K.el('faq'), T);
  });
})();
