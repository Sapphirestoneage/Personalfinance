/* ==========================================================================
   engine/contributions.js, where a year's surplus goes. D-341.
   --------------------------------------------------------------------------
   The stated workplace contribution (retirement.contributionPercent of
   wages) is always made first, even in a year that cannot afford it: it
   is what the household already does. Then, if cash is under the
   emergency-fund floor, the floor is topped up. Then the surplus runs down
   the order-of-operations setting, each step to its limit:
     match      raise the workplace deferral to the share the employer matches
     hsa        the HSA, when on a high-deductible plan
     rothIra    a Roth IRA per adult, within the income phase-out
                (skipped when the backdoor exception is on)
     k401       the workplace plan to the elective limit
     tradIra    a deductible traditional IRA (not in the default order)
     taxable    everything left
   Limits come from data/tax/2026.json, indexed; catch-ups at 50, 60 to
   63 and 55 (HSA) apply by age at year end. Employer match is computed
   here too, as the employer's money, not the household's cash.
   Every figure in cents. Pure: reads inputs, returns amounts.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) deps = { Tables: require('./tables.js') };
  else deps = { Tables: root.SLAF && root.SLAF.Engine && root.SLAF.Engine.Tables };
  var api = factory(deps.Tables);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.Contributions = api; }
})(typeof self !== 'undefined' ? self : null, function (Tables) {
  'use strict';

  function dollars(c) { return '$' + Math.round(c / 100).toLocaleString('en-US'); }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function sum(a) { return a.reduce(function (t, v) { return t + v; }, 0); }

  /** The year's limits in cents for a person of this age. */
  function limits(tax, factor, age, family) {
    var L = tax.federal.limits;
    var ix = function (k, indexed) { return Tables.cents(Tables.indexDollars(L[k], factor, indexed === undefined ? L.indexed : indexed)); };
    var a = age === null || age === undefined ? 0 : age;
    var k401 = ix('elective401k') + (a >= 60 && a <= 63 ? ix('catchup401kAge60to63') : (a >= 50 ? ix('catchup401kAge50') : 0));
    var ira = ix('ira') + (a >= 50 ? ix('iraCatchupAge50') : 0);
    var hsa = (family ? ix('hsaFamily') : ix('hsaSelfOnly')) + (a >= 55 ? ix('hsaCatchupAge55', L.hsaCatchupIndexed) : 0);
    return { k401: k401, ira: ira, hsa: hsa, annualAdditions: ix('annualAdditions415c') };
  }

  /** How much of a full Roth IRA limit survives the MAGI phase-out. */
  function rothRoom(tax, factor, status, magiCents, fullCents) {
    var range = tax.federal.limits.rothIraPhaseOut[status] || tax.federal.limits.rothIraPhaseOut.single;
    var lo = Tables.cents(Tables.indexDollars(range[0], factor, true)), hi = Tables.cents(Tables.indexDollars(range[1], factor, true));
    if (magiCents <= lo) return fullCents;
    if (magiCents >= hi) return 0;
    return Math.round(fullCents * (hi - magiCents) / (hi - lo));
  }

  /**
   * allocate(input, A, tax, factor)
   *   input: { surplusCents, people: [{ index, age, working, wagesCents, seProfitCents, match }],
   *            retirement: { contributionPercent, has401k, onHdhp, hsaFamilyPlan },
   *            filingStatus, magiCents, cashCents, cashFloorCents, hsaOrderAllowed }
   */
  function allocate(input, A, tax, factor) {
    var people = input.people, n = people.length, r = input.retirement || {};
    var out = { k401Pretax: zeros(n), k401Roth: zeros(n), match: zeros(n), hsa: zeros(n), rothIra: zeros(n), tradIra: zeros(n),
      taxableCents: 0, cashTopUpCents: 0, shortfallCents: 0, warnings: [], explain: [], limits: [] };
    var lim = people.map(function (p) { return limits(tax, factor, p.age, r.hsaFamilyPlan); });
    out.limits = lim;
    var deferral = zeros(n);
    var remaining = input.surplusCents;

    /* 1. The stated workplace contribution, always. */
    people.forEach(function (p, i) {
      if (!p.working || !p.wagesCents || !r.has401k) return;
      var want = Math.round(p.wagesCents * (r.contributionPercent || 0));
      deferral[i] = Math.min(want, lim[i].k401, p.wagesCents);
      remaining -= deferral[i];
      if (deferral[i]) out.explain.push(p.label + ': ' + dollars(deferral[i]) + ' into the workplace plan, the ' + Math.round((r.contributionPercent || 0) * 100) + '% already set.');
    });
    if (remaining < 0) { out.shortfallCents = -remaining; remaining = 0; }

    /* 2. The cash floor. */
    if (remaining > 0 && input.cashCents < input.cashFloorCents) {
      out.cashTopUpCents = Math.min(remaining, input.cashFloorCents - input.cashCents);
      remaining -= out.cashTopUpCents;
      if (out.cashTopUpCents) out.explain.push(dollars(out.cashTopUpCents) + ' tops the emergency fund up toward ' + dollars(input.cashFloorCents) + '.');
    }

    /* 3. The order of operations. */
    var earned = sum(people.map(function (p) { return p.working ? p.wagesCents + p.seProfitCents : 0; }));
    var iraUsed = 0;
    (A.contributionOrder || []).forEach(function (step) {
      if (remaining <= 0) return;
      if (step === 'match') {
        people.forEach(function (p, i) {
          if (remaining <= 0 || !p.working || !p.match || !r.has401k) return;
          var target = Math.min(Math.round(p.wagesCents * p.match.capPercent), lim[i].k401);
          var add = Math.min(remaining, Math.max(0, target - deferral[i]));
          if (add) { deferral[i] += add; remaining -= add; out.explain.push(p.label + ': ' + dollars(add) + ' more into the plan to capture the full employer match.'); }
        });
      } else if (step === 'hsa') {
        if (!r.onHdhp) return;
        var hi = 0, cap = lim[0].hsa;
        var addH = Math.min(remaining, cap);
        if (addH > 0) { out.hsa[hi] += addH; remaining -= addH; out.explain.push(dollars(addH) + ' into the HSA (limit ' + dollars(cap) + ').'); }
      } else if (step === 'rothIra') {
        people.forEach(function (p, i) {
          if (remaining <= 0) return;
          var full = lim[i].ira;
          var room = A.exceptions.backdoorRoth ? full : rothRoom(tax, factor, input.filingStatus, input.magiCents || 0, full);
          /* An IRA needs earned income in the household (a spouse's counts). */
          room = Math.min(room, Math.max(0, earned - iraUsed));
          var add = Math.min(remaining, room);
          if (add > 0) { out.rothIra[i] += add; iraUsed += add; remaining -= add; out.explain.push(p.label + ': ' + dollars(add) + ' into a Roth IRA' + (room < full ? ' (reduced by the income phase-out)' : '') + '.'); }
          else if (full && room === 0 && earned > 0 && !A.exceptions.backdoorRoth) out.warnings.push(p.label + ' is over the Roth IRA income limit this year; a backdoor Roth is a setting.');
        });
      } else if (step === 'tradIra') {
        people.forEach(function (p, i) {
          if (remaining <= 0) return;
          var room = Math.min(lim[i].ira, Math.max(0, earned - iraUsed));
          var add = Math.min(remaining, room);
          if (add > 0) { out.tradIra[i] += add; iraUsed += add; remaining -= add; out.explain.push(p.label + ': ' + dollars(add) + ' into a traditional IRA.'); }
        });
      } else if (step === 'k401') {
        people.forEach(function (p, i) {
          if (remaining <= 0 || !p.working || !p.wagesCents || !r.has401k) return;
          var add = Math.min(remaining, Math.max(0, Math.min(lim[i].k401, p.wagesCents) - deferral[i]));
          if (add) { deferral[i] += add; remaining -= add; out.explain.push(p.label + ': ' + dollars(add) + ' more into the plan, toward the ' + dollars(lim[i].k401) + ' limit.'); }
        });
      } else if (step === 'taxable') {
        out.taxableCents += remaining; out.explain.push(dollars(remaining) + ' into the taxable account.'); remaining = 0;
      } else if (step === 'cash') {
        out.cashTopUpCents += remaining; remaining = 0;
      }
    });
    if (remaining > 0) { out.cashTopUpCents += remaining; remaining = 0; }

    /* The employer's money, and the split of the deferral. */
    people.forEach(function (p, i) {
      var roth = Math.round(deferral[i] * A.workplaceRothShare);
      out.k401Roth[i] = roth; out.k401Pretax[i] = deferral[i] - roth;
      if (p.working && p.match && deferral[i]) {
        out.match[i] = Math.round(Math.min(deferral[i], p.wagesCents * p.match.capPercent) * p.match.matchPercent);
        out.match[i] = Math.min(out.match[i], Math.max(0, lim[i].annualAdditions - deferral[i]));
      }
    });
    out.deferralCents = sum(deferral);
    out.employeeCents = sum(deferral) + sum(out.hsa) + sum(out.rothIra) + sum(out.tradIra) + out.taxableCents + out.cashTopUpCents;
    out.investedCents = out.employeeCents - out.cashTopUpCents;
    out.matchCents = sum(out.match);
    out.deductions = { deferral401kCents: sum(out.k401Pretax), hsaCents: sum(out.hsa), iraCents: sum(out.tradIra) };
    return out;
  }

  return { allocate: allocate, limits: limits, rothRoom: rothRoom };
});
