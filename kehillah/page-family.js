/* kehillah/page-family.js, Making a Family (KD-004). */
(function () {
  'use strict';
  var K = SLAF.K, M = SLAF.Money;
  K.boot('family', function (T) {
    var F = T.family;
    K.chips(K.el('path'), F.paths.map(function (p) { return { id: p.id, label: p.label }; }), 'family.path', paint);
    K.bindMoney(K.el('perTry'), 'family.perTryCents', paint);
    K.bindNumber(K.el('tries'), 'family.tries', paint, { integer: true });
    K.bindMoney(K.el('once'), 'family.onceCents', paint);
    K.bindMoney(K.el('covered'), 'family.coveredCents', paint);
    K.bindMoney(K.el('saved'), 'family.savedCents', paint);
    K.bindMoney(K.el('monthly'), 'family.monthlyCents', paint);
    K.el('afterward').innerHTML = F.afterward.map(function (a) {
      return '<div class="k-row"><div><div class="k-label">' + K.esc(a.label) + '</div><p class="k-plain">' + K.esc(a.plain) + '</p><div class="k-guide">Typical: ' + K.esc(K.range(a.lowCents, a.highCents)) + '</div></div><div class="k-box"><span class="slaf-input-shell"><span class="slaf-affix">$</span><input type="text" id="after-' + K.esc(a.id) + '" autocomplete="off" placeholder="not entered" aria-label="' + K.esc(a.label) + '"/></span></div></div>';
    }).join('');
    F.afterward.forEach(function (a) { K.bindMoney(K.el('after-' + a.id), 'family.afterward.' + a.id, paint); });

    function paint() {
      var plan = K.plan();
      var R = SLAF.Family.read(F, plan.family, new Date());
      var p = R.path;
      K.el('path-plain').textContent = p ? p.plain : 'Choose one to see its guide figures.';
      var perTry = p && p.perTryHighCents > 0;
      K.el('row-try').hidden = !!p && !perTry; K.el('row-tries').hidden = !!p && !perTry;
      K.el('g-try').textContent = p && perTry ? 'Typical: ' + K.range(p.perTryLowCents, p.perTryHighCents) + ' a try' : '';
      K.el('g-tries').textContent = p && perTry ? 'Usually ' + p.triesLow + ' to ' + p.triesHigh : '';
      K.el('once-label').textContent = p ? p.onceLabel + '.' : 'Screening, legal work, storage, an agency.';
      K.el('g-once').textContent = p ? 'Typical: ' + K.range(p.onceLowCents, p.onceHighCents) : '';
      var s = K.el('stats'); s.innerHTML = '<div id="s1"></div><div id="s2"></div><div id="s3"></div><div id="s4"></div>';
      var okc = M.isOk(R.costCents);
      K.stat(K.el('s1'), 'The whole cost', okc ? K.money(R.costCents.value) : 'not yet', okc ? (perTry ? plan.family.tries + ' tries at ' + K.money(plan.family.perTryCents) + ', plus ' + K.money(plan.family.onceCents) + ' once' : 'one-time costs') : R.costCents.reason, !okc);
      var back = R.coveredCents + R.creditCents;
      K.stat(K.el('s2'), 'Comes back', p ? K.money(back) : 'not yet', p ? (R.creditCents ? 'the adoption credit, about ' + K.money(R.creditCents) + (R.coveredCents ? ', and ' + K.money(R.coveredCents) + ' covered' : '') : (R.coveredCents ? 'covered by someone else' : 'nothing entered as covered')) : '', !p);
      var okt = M.isOk(R.targetCents);
      K.stat(K.el('s3'), 'Yours to find', okt ? K.money(R.targetCents.value) : 'not yet', okt && M.isOk(R.timeline) ? (R.timeline.value.gapCents === 0 ? 'saved in full' : K.money(R.timeline.value.gapCents) + ' still to save') : (okt ? 'type what is set aside' : ''), !okt);
      var tl = R.timeline;
      K.stat(K.el('s4'), 'There by', M.isOk(tl) && tl.value.date ? (tl.value.months === 0 ? 'already' : K.day(tl.value.date)) : 'not yet', M.isOk(tl) ? (tl.value.months ? tl.value.months + ' months at ' + K.money(tl.value.monthlyCents) + ' a month' : (tl.partial ? tl.reason : '')) : tl.reason, !(M.isOk(tl) && tl.value.date));
      K.bar(K.el('bar'), M.isOk(tl) ? tl.value.share : null, M.isOk(tl) && tl.value.share >= 1 ? 'good' : null);
      K.el('bar-say').textContent = M.isOk(tl) ? Math.round(tl.value.share * 100) + '% of the target is set aside.' + (R.afterwardCents ? ' Afterward, another ' + K.money(R.afterwardCents) + ' you have named.' : '') : 'The bar fills in as the boxes do.';
    }
    paint();
    K.words(K.el('words'), T, ['IUI', 'IVF', 'Reciprocal IVF', 'Second-parent adoption', 'Empty is not zero']);
    K.foot(K.el('foot'), T, 'family');
  });
})();
