/* kehillah/page-care.js, Care (KD-004). */
(function () {
  'use strict';
  var K = SLAF.K, M = SLAF.Money;
  K.boot('care', function (T) {
    var C = T.care;
    var KIND = { once: 'once', year: 'a year', month: 'a month' };
    K.chips(K.el('insured'), [{ id: true, label: 'I have insurance' }, { id: false, label: 'No insurance' }], 'care.insured', paint);
    K.bindMoney(K.el('deductible'), 'care.deductibleCents', paint);
    K.bindMoney(K.el('oop'), 'care.oopMaxCents', paint);
    K.el('items').innerHTML = C.items.map(function (it) {
      return '<div class="k-row"><div><div class="k-label">' + K.esc(it.label) + '</div><p class="k-plain">' + K.esc(it.plain) + '</p><div class="k-guide">Typical: ' + K.esc(K.range(it.lowCents, it.highCents)) + ' ' + K.esc(KIND[it.kind]) + '</div></div>' +
        '<div class="k-box"><span class="slaf-input-shell"><span class="slaf-affix">$</span><input type="text" id="it-' + K.esc(it.id) + '" autocomplete="off" placeholder="not entered" aria-label="' + K.esc(it.label) + '"/></span><div id="cov-' + K.esc(it.id) + '"></div></div></div>';
    }).join('');
    C.items.forEach(function (it) {
      K.bindMoney(K.el('it-' + it.id), 'care.items.' + it.id + '.cents', paint);
      K.chips(K.el('cov-' + it.id), [{ id: true, label: 'Covered' }, { id: false, label: 'Not covered' }], 'care.items.' + it.id + '.covered', paint);
    });
    K.el('hsa-plain').textContent = C.hsa.plain + ' The year\'s limit is ' + K.money(C.hsa.individualCents) + ' for one person, ' + K.money(C.hsa.familyCents) + ' for a family, plus ' + K.money(C.hsa.catchUpCents) + ' from age 55.';
    K.el('fsa-plain').textContent = 'No high-deductible plan? ' + C.fsa.plain + ' The limit is ' + K.money(C.fsa.limitCents) + '.';
    K.chips(K.el('hsa-type'), [{ id: 'individual', label: 'HSA, one person' }, { id: 'family', label: 'HSA, family' }, { id: 'none', label: 'No HSA' }], 'care.hsa.type', paint);
    K.bindMoney(K.el('hsa-sofar'), 'care.hsa.soFarCents', paint);
    K.bindMoney(K.el('saved'), 'care.savedCents', paint);
    K.bindMoney(K.el('monthly'), 'care.monthlyCents', paint);
    K.el('names').innerHTML = C.names.map(function (n) {
      return '<div class="k-row"><div><div class="k-label">' + K.esc(n.label) + '</div><p class="k-plain">' + K.esc(n.plain) + '</p><div class="k-guide">Typical: ' + K.esc(K.range(n.lowCents, n.highCents)) + '</div></div><div class="k-box"><span class="slaf-input-shell"><span class="slaf-affix">$</span><input type="text" id="nm-' + K.esc(n.id) + '" autocomplete="off" placeholder="not entered" aria-label="' + K.esc(n.label) + '"/></span></div></div>';
    }).join('');
    C.names.forEach(function (n) { K.bindMoney(K.el('nm-' + n.id), 'care.names.' + n.id, paint); });

    function paint() {
      var plan = K.plan();
      var R = SLAF.Care.read(C, plan.care, new Date());
      var s = K.el('stats'); s.innerHTML = '<div id="s1"></div><div id="s2"></div><div id="s3"></div><div id="s4"></div>';
      var ok = M.isOk(R.outOfPocketCents);
      K.stat(K.el('s1'), 'Out of pocket this year', ok ? K.money(R.outOfPocketCents.value) : 'not yet', ok ? (R.outOfPocketCents.capped ? 'covered lines capped at ' + K.money(plan.care.oopMaxCents) + ', plus ' + K.money(R.uncoveredYearCents) + ' not covered' : K.money(R.outOfPocketCents.coveredPayCents) + ' covered lines, ' + K.money(R.uncoveredYearCents) + ' not covered') : R.outOfPocketCents.reason, !ok);
      K.stat(K.el('s2'), 'If nothing were covered', R.entered ? K.money(R.coveredYearCents + R.uncoveredYearCents) : 'not yet', R.entered ? R.entered + ' lines entered' : 'type any line', !R.entered);
      var okt = M.isOk(R.targetCents);
      K.stat(K.el('s3'), 'The target, with the name change', okt ? K.money(R.targetCents.value) : 'not yet', okt ? (R.namesEntered ? 'including ' + K.money(R.namesCents) + ' for the name' : 'no name-change line entered') : '', !okt);
      var tl = R.timeline;
      K.stat(K.el('s4'), 'There by', M.isOk(tl) && tl.value.date ? (tl.value.months === 0 ? 'already' : K.day(tl.value.date)) : 'not yet', M.isOk(tl) ? (tl.value.months ? tl.value.months + ' months at ' + K.money(tl.value.monthlyCents) + ' a month' : (tl.partial ? tl.reason : '')) : tl.reason, !(M.isOk(tl) && tl.value.date));
      K.bar(K.el('bar'), M.isOk(tl) ? tl.value.share : null, M.isOk(tl) && tl.value.share >= 1 ? 'good' : null);
      K.el('bar-say').textContent = M.isOk(tl) ? Math.round(tl.value.share * 100) + '% of the target is set aside.' : 'The bar fills in as the boxes do.';
      var room = R.hsaRoomCents;
      K.stat(K.el('hsa-out'), 'Room left this year', room !== null ? K.money(room) : 'not yet', room !== null ? 'untaxed, and it rolls over' : (plan.care.hsa.type === 'none' ? 'no HSA; an FSA may still fit' : 'pick the account and what is in it'), room === null);
      K.stat(K.el('names-out'), 'The name change, in all', R.namesEntered ? K.money(R.namesCents) : 'not yet', R.namesEntered ? R.namesEntered + ' of ' + R.nameRows.length + ' lines' : 'type any line', !R.namesEntered);
    }
    paint();
    K.words(K.el('words'), T, ['HSA', 'FSA', 'Out-of-pocket maximum', 'Empty is not zero']);
    K.foot(K.el('foot'), T, 'care');
  });
})();
