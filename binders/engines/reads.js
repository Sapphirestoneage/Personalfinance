/* ==========================================================================
   binders/engines/reads.js, every figure the Binders show. PB-001.
   --------------------------------------------------------------------------
   Pure: the answers map in (raw stored values, money in cents), an array of
   reads out. A read is { id, label, status, value, unit, text, missing,
   chart }. status is ok or incomplete; incomplete names what is missing and
   carries no number. Nothing here writes, rounds early, or invents a figure.

     Reads.evaluate(answers)          -> { readId: read } for every read
     Reads.forPlaybook(id, answers)   -> [read] in the playbook's order
     Reads.LABELS                     -> what each answer key is called

   Units: n (a count), pct (0 to 100), money (cents), min (minutes),
   months, hours, ratio (a plain multiple).
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.BINDERS = root.BINDERS || {}; root.BINDERS.Reads = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var TABLE = null;
  var LABELS = {};
  function use(table) {
    TABLE = table || null; LABELS = {};
    if (!TABLE) return;
    TABLE.playbooks.forEach(function (p) { p.levels.forEach(function (l) { l.exercises.forEach(function (e) { if (e.key) LABELS[e.key] = e.label; }); }); });
  }
  function label(k) { return LABELS[k] || k; }

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function list(v) { return Array.isArray(v) ? v : []; }
  function pctOf(a, b) { return (a === null || b === null || b === 0) ? null : a / b * 100; }
  function ratio(a, b) { return (a === null || b === null || b === 0) ? null : a / b; }

  /* A reading either has every input or says which it lacks. */
  function need(answers, keys) {
    var missing = [];
    keys.forEach(function (k) { if (num(answers[k]) === null) missing.push(label(k)); });
    return missing;
  }
  function incomplete(id, lab, missing, chart) { return { id: id, label: lab, status: 'incomplete', value: null, unit: null, text: null, missing: missing, chart: chart || null }; }
  function ok(id, lab, value, unit, text, chart) { return { id: id, label: lab, status: 'ok', value: value, unit: unit, text: text || null, missing: [], chart: chart || null }; }

  /* "a | 12" -> { label: 'a', value: 12 }; a line without a number keeps value null. */
  function parsePairs(lines) {
    return list(lines).map(function (line) {
      var parts = String(line).split('|');
      var lab = parts[0].trim();
      var v = parts.length > 1 ? parseFloat(String(parts[parts.length - 1]).replace(/[^0-9.\-]/g, '')) : NaN;
      return { label: lab, value: isFinite(v) ? v : null };
    }).filter(function (p) { return p.label; });
  }
  function logRows(v, cols) {
    return list(v).map(function (row) {
      var r = {};
      cols.forEach(function (c, i) { var cell = Array.isArray(row) ? row[i] : (row && row[c]); var n = parseFloat(cell); r[c] = isFinite(n) ? n : (cell === undefined || cell === null ? null : String(cell)); });
      return r;
    });
  }

  function beforeAfter(id, lab, before, after, unit, text) {
    var items = [];
    if (before !== null) items.push({ label: 'Before', value: before });
    if (after !== null) items.push({ label: 'After the run', value: after });
    if (!items.length) return null;
    return { type: 'bars', unit: unit, items: items, title: lab, text: text };
  }

  function evaluate(a) {
    a = a || {};
    var R = {};

    /* ---------------- Closing: the rates other planets read ---------------- */
    (function () {
      var booked = num(a.calls_booked_month), shown = num(a.calls_shown_month), closed = num(a.closed_month), cash = num(a.cash_collected_month);
      var m = need(a, ['calls_booked_month', 'calls_shown_month', 'closed_month']);
      R.salesFunnel = m.length ? incomplete('salesFunnel', 'The funnel, last month', m)
        : ok('salesFunnel', 'The funnel, last month', closed, 'n', closed + ' of ' + booked + ' booked became customers.',
          { type: 'funnel', unit: 'n', steps: [{ label: 'Booked', value: booked }, { label: 'Showed', value: shown }, { label: 'Bought', value: closed }], title: 'The funnel, last month' });
      var show = pctOf(shown, booked);
      R.showRate = (show === null) ? incomplete('showRate', 'Show rate', need(a, ['calls_booked_month', 'calls_shown_month']))
        : ok('showRate', 'Show rate', show, 'pct', 'Of every ten booked, ' + Math.round(show / 10) + ' show up. Seven is the rule of thumb to beat.',
          { type: 'meter', unit: 'pct', value: show, min: 0, max: 100, bands: [{ to: 50, status: 'out' }, { to: 70, status: 'watch' }, { to: 100, status: 'good' }], title: 'Show rate' });
      var close = pctOf(closed, shown), closeAfter = pctOf(num(a.run_closed), num(a.run_calls));
      R.closeRate = (close === null && closeAfter === null) ? incomplete('closeRate', 'Close rate', need(a, ['calls_shown_month', 'closed_month']))
        : ok('closeRate', 'Close rate', closeAfter !== null ? closeAfter : close, 'pct', closeAfter !== null && close !== null ? 'From ' + close.toFixed(0) + ' to ' + closeAfter.toFixed(0) + ' of every hundred who showed.' : null,
          beforeAfter('closeRate', 'Close rate', close, closeAfter, 'pct'));
      var perSale = ratio(cash, closed), price = num(a.price);
      var cps = [];
      if (perSale !== null) cps.push({ label: 'Cash at the close', value: perSale });
      if (price !== null) cps.push({ label: 'The price', value: price });
      R.cashPerSale = perSale === null ? incomplete('cashPerSale', 'Cash collected per sale', need(a, ['cash_collected_month', 'closed_month']))
        : ok('cashPerSale', 'Cash collected per sale', perSale, 'money', price !== null ? 'Against a price of ' + fmtMoney(price) + ': ' + Math.round(perSale / price * 100) + ' percent collected at the close.' : 'Enter the price in Lifetime Value to compare.',
          { type: 'bars', unit: 'money', items: cps, title: 'Cash per sale against the price' });
      var obj = logRows(a.objections_log, ['objection', 'times heard', 'answered well']).filter(function (r) { return r.objection && r['times heard'] !== null; });
      R.objectionBars = obj.length === 0 ? incomplete('objectionBars', 'Objections heard', ['The objections log'])
        : ok('objectionBars', 'Objections heard', obj.length, 'n', obj.length + ' objections logged. The tallest bar is the next answer to write.',
          { type: 'bars', unit: 'n', items: obj.map(function (r) { return { label: String(r.objection), value: r['times heard'], note: r['answered well'] !== null ? 'answered well ' + r['answered well'] : null }; }), title: 'Objections heard' });
    })();

    /* ---------------- Lead Nurture ---------------- */
    (function () {
      var mins = num(a.reply_minutes), after = num(a.run_reply_minutes);
      R.replySpeed = mins === null && after === null ? incomplete('replySpeed', 'Reply speed', need(a, ['reply_minutes']))
        : ok('replySpeed', 'Reply speed', after !== null ? after : mins, 'min', 'Five minutes is the rule of thumb; an hour later most of the lead is gone.',
          mins !== null && after === null
            ? { type: 'meter', unit: 'min', value: Math.min(mins, 240), min: 0, max: 240, bands: [{ to: 5, status: 'good' }, { to: 60, status: 'watch' }, { to: 240, status: 'out' }], title: 'Minutes to first reply' }
            : beforeAfter('replySpeed', 'Minutes to first reply', mins, after, 'min'));
      var before = num(a.call_rate), aft = pctOf(num(a.run_booked), num(a.run_leads_n));
      R.callRate = before === null && aft === null ? incomplete('callRate', 'Leads who book', need(a, ['call_rate']))
        : ok('callRate', 'Leads who book', aft !== null ? aft : before, 'pct', null, beforeAfter('callRate', 'Leads who book a conversation', before, aft, 'pct'));
      var rows = logRows(a.touch_log, ['touch', 'sent', 'replied']).filter(function (r) { return r.sent !== null && r.replied !== null && r.sent > 0; });
      R.touchCurve = rows.length === 0 ? incomplete('touchCurve', 'Replies by touch', ['The touch log'])
        : ok('touchCurve', 'Replies by touch', rows.length, 'n', 'A late touch that still gets replies is the argument for one more.',
          { type: 'bars', unit: 'pct', items: rows.map(function (r, i) { return { label: 'Touch ' + (r.touch !== null ? r.touch : i + 1), value: r.replied / r.sent * 100 }; }), title: 'Share who replied, by touch' });
    })();

    /* ---------------- Marketing Machine ---------------- */
    (function () {
      var warm = num(a.warm_week), content = num(a.content_week), cold = num(a.cold_week), ads = num(a.ads_week);
      var m = need(a, ['warm_week', 'content_week', 'cold_week']);
      R.machineMix = m.length ? incomplete('machineMix', 'The four ways, per week', m)
        : ok('machineMix', 'The four ways, per week', warm + content + cold, 'n', 'Contacts a week across the four ways. The biggest cell is your machine today.',
          { type: 'grid4', title: 'The four ways, per week', cells: [
            { label: 'Warm outreach', value: warm, unit: 'n', sub: 'one to one, people who know you' },
            { label: 'Content', value: content, unit: 'n', sub: 'one to many, people who do not yet' },
            { label: 'Cold outreach', value: cold, unit: 'n', sub: 'one to one, strangers' },
            { label: 'Paid ads', value: ads, unit: 'money', sub: 'one to many, strangers' }] });
      var wanted = num(a.customers_wanted), closeR = R.closeRate.status === 'ok' ? R.closeRate.value : null, callR = num(a.call_rate);
      var miss = need(a, ['customers_wanted']);
      if (closeR === null) miss.push('Close rate (Closing Handbook, band 2)');
      if (callR === null) miss.push('Leads who book (Lead Nurture, band 2)');
      if (miss.length) R.leadsNeeded = incomplete('leadsNeeded', 'Leads needed per month', miss);
      else {
        var needed = (closeR > 0 && callR > 0) ? wanted / (closeR / 100) / (callR / 100) : null;
        var have = num(a.leads_month);
        var items = needed === null ? [] : [{ label: 'Needed', value: needed }];
        if (have !== null) items.push({ label: 'Have now', value: have });
        R.leadsNeeded = needed === null ? incomplete('leadsNeeded', 'Leads needed per month', ['A close rate and a booking rate above zero'])
          : ok('leadsNeeded', 'Leads needed per month', needed, 'n', Math.round(needed) + ' engaged leads a month for ' + wanted + ' customers, at your rates.' + (have !== null ? ' You have ' + have + '.' : ''),
            { type: 'bars', unit: 'n', items: items, title: 'Leads needed against leads you have' });
      }
      var reachWeek = (warm !== null && content !== null && cold !== null) ? (warm + content + cold) : null;
      var before = (num(a.leads_month) !== null && reachWeek) ? num(a.leads_month) / (reachWeek * 4.33) * 100 : null;
      var after = pctOf(num(a.run_leads), num(a.run_reach));
      R.leadRate = before === null && after === null ? incomplete('leadRate', 'Leads per hundred contacts', need(a, ['warm_week', 'content_week', 'cold_week', 'leads_month']))
        : ok('leadRate', 'Leads per hundred contacts', after !== null ? after : before, 'pct', 'Engaged leads for every hundred contacts made.', beforeAfter('leadRate', 'Leads per hundred contacts', before, after, 'pct'));
    })();

    /* ---------------- Hooks ---------------- */
    (function () {
      var before = pctOf(num(a.engaged_week), num(a.views_week)), after = pctOf(num(a.hook_wins), num(a.hook_runs));
      R.hookRate = before === null && after === null ? incomplete('hookRate', 'Hook rate', need(a, ['views_week', 'engaged_week']))
        : ok('hookRate', 'Hook rate', after !== null ? after : before, 'pct', 'Replies, clicks or saves for every hundred who saw the first line.', beforeAfter('hookRate', 'Hook rate', before, after, 'pct'));
      var pairs = parsePairs(a.hook_results).filter(function (p) { return p.value !== null; });
      R.hookResults = pairs.length === 0 ? incomplete('hookResults', 'The three hooks, ranked', ['Each hook with its count (hook | count)'])
        : ok('hookResults', 'The three hooks, ranked', pairs.length, 'n', 'The tallest bar goes in the bank.',
          { type: 'bars', unit: 'n', items: pairs.sort(function (x, y) { return y.value - x.value; }).map(function (p) { return { label: p.label.slice(0, 48), value: p.value }; }), title: 'Replies, clicks or saves by hook' });
    })();

    /* ---------------- Proof ---------------- */
    (function () {
      var kinds = [['proof_results', 'Results with a number'], ['proof_stories', 'Named testimonials'], ['proof_before_after', 'Before and after'], ['proof_third', 'Third-party marks'], ['proof_demos', 'Demonstrations']];
      var m = need(a, kinds.map(function (k) { return k[0]; }));
      var total = kinds.reduce(function (s, k) { return s + (num(a[k[0]]) || 0); }, 0);
      R.proofInventory = m.length === kinds.length ? incomplete('proofInventory', 'Proof by kind', m)
        : ok('proofInventory', 'Proof by kind', total, 'n', m.length ? 'Blank kinds are not counted: ' + m.join(', ') + '.' : 'The shortest bar is the next kind to collect.',
          { type: 'bars', unit: 'n', items: kinds.filter(function (k) { return num(a[k[0]]) !== null; }).map(function (k) { return { label: k[1], value: num(a[k[0]]) }; }), title: 'Proof by kind' });
      var claims = list(a.claims).length, mapped = parsePairs(a.proof_map).filter(function (p) { return !/\|\s*cut\s*$/i.test('|' + p.label) && !/\bcut\b/i.test(String(p.label).split('|').slice(1).join('|')); });
      var withProof = list(a.proof_map).filter(function (line) { var parts = String(line).split('|'); return parts.length > 1 && parts[1].trim() && !/^cut$/i.test(parts[1].trim()); }).length;
      var cov = claims > 0 ? Math.min(100, withProof / claims * 100) : null;
      R.proofCoverage = cov === null ? incomplete('proofCoverage', 'Claims with a proof beside them', ['The list of claims'])
        : ok('proofCoverage', 'Claims with a proof beside them', cov, 'pct', withProof + ' of ' + claims + ' claims have a proof mapped.',
          { type: 'meter', unit: 'pct', value: cov, min: 0, max: 100, bands: [{ to: 60, status: 'out' }, { to: 99, status: 'watch' }, { to: 100, status: 'good' }], title: 'Claims with a proof beside them' });
      var asked = num(a.run_asked), got = num(a.run_got), served = num(a.customers_served), stories = num(a.proof_stories);
      var rate = pctOf(got, asked), per = served ? pctOf(stories, served) : null;
      var items = [];
      if (per !== null) items.push({ label: 'Testimonials per 100 customers', value: per });
      if (rate !== null) items.push({ label: 'Asks that came back', value: rate });
      R.askRate = items.length === 0 ? incomplete('askRate', 'The ask rate', need(a, ['run_asked', 'run_got']))
        : ok('askRate', 'The ask rate', rate !== null ? rate : per, 'pct', null, { type: 'bars', unit: 'pct', items: items, title: 'Asking for proof' });
    })();

    /* ---------------- Lifetime Value (before Ads, which reads it) ---------------- */
    (function () {
      var price = num(a.price), margin = num(a.gross_margin), buys = num(a.purchases_per_customer), cac = num(a.cac);
      var m = need(a, ['price', 'gross_margin', 'purchases_per_customer']);
      var ltgp = m.length ? null : price * margin / 100 * buys;
      var ltgpAfter = (num(a.run_price) !== null && num(a.run_margin) !== null && num(a.run_purchases) !== null) ? num(a.run_price) * num(a.run_margin) / 100 * num(a.run_purchases) : null;
      R.ltgp = ltgp === null ? incomplete('ltgp', 'Lifetime gross profit per customer', m)
        : ok('ltgp', 'Lifetime gross profit per customer', ltgpAfter !== null ? ltgpAfter : ltgp, 'money', fmtMoney(price) + ' at ' + margin + ' percent margin, ' + buys + ' purchases.', beforeAfter('ltgp', 'Lifetime gross profit per customer', ltgp, ltgpAfter, 'money'));
      var r = ratio(ltgp, cac), rAfter = ratio(ltgpAfter, num(a.run_cac));
      var miss = m.slice(); if (cac === null) miss.push(label('cac'));
      R.ltgpToCac = r === null ? incomplete('ltgpToCac', 'Lifetime gross profit to cost of a customer', miss)
        : ok('ltgpToCac', 'Lifetime gross profit to cost of a customer', rAfter !== null ? rAfter : r, 'ratio', 'Three to one is the rule of thumb. Below one, every customer loses money.',
          { type: 'meter', unit: 'ratio', value: Math.min(rAfter !== null ? rAfter : r, 6), min: 0, max: 6, bands: [{ to: 1, status: 'out' }, { to: 3, status: 'watch' }, { to: 6, status: 'good' }], title: 'Lifetime gross profit to cost, as a multiple', marker: 3 });
      R.fourLevers = ltgp === null ? incomplete('fourLevers', 'The four levers, at ten percent each', m)
        : ok('fourLevers', 'The four levers, at ten percent each', ltgp * Math.pow(1.1, 4) * 100, 'money', 'Gross profit from a hundred customers. Ten percent on one lever is ten percent; on all four it is forty-six, because they multiply.',
          { type: 'bars', unit: 'money', items: [0, 1, 2, 3, 4].map(function (k) { return { label: k === 0 ? 'Today' : k + (k === 1 ? ' lever' : ' levers'), value: ltgp * 100 * Math.pow(1.1, k) }; }), title: 'A hundred customers, levers pulled at ten percent' });
    })();

    /* ---------------- GOATed Ads ---------------- */
    (function () {
      var spend = num(a.ad_spend_month), impr = num(a.ad_impressions), clicks = num(a.ad_clicks), leads = num(a.ad_leads), booked = num(a.ad_booked), sales = num(a.ad_sales);
      var m = need(a, ['ad_impressions', 'ad_clicks', 'ad_leads', 'ad_booked', 'ad_sales']);
      R.adChain = m.length ? incomplete('adChain', 'The chain, last month', m)
        : ok('adChain', 'The chain, last month', sales, 'n', 'Each step is its own rate and its own fix.',
          { type: 'funnel', unit: 'n', steps: [{ label: 'Shown', value: impr }, { label: 'Clicked', value: clicks }, { label: 'Leads', value: leads }, { label: 'Booked', value: booked }, { label: 'Bought', value: sales }], title: 'The ad chain, last month' });
      var cpl = ratio(spend, leads), cac = ratio(spend, sales), cplA = ratio(num(a.run_spend), num(a.run_leads_ads)), cacA = ratio(num(a.run_spend), num(a.run_sales_ads));
      var items = [];
      if (cpl !== null) items.push({ label: 'Per lead, before', value: cpl });
      if (cplA !== null) items.push({ label: 'Per lead, after', value: cplA });
      if (cac !== null) items.push({ label: 'Per customer, before', value: cac });
      if (cacA !== null) items.push({ label: 'Per customer, after', value: cacA });
      var ctr = pctOf(clicks, impr), cpm = (spend !== null && impr) ? spend / impr * 1000 : null;
      R.adCosts = items.length === 0 ? incomplete('adCosts', 'What a lead and a customer cost', need(a, ['ad_spend_month', 'ad_leads', 'ad_sales']))
        : ok('adCosts', 'What a lead and a customer cost', cacA !== null ? cacA : cac, 'money', (cpm !== null ? 'Cost per thousand shown ' + fmtMoney(cpm) + '. ' : '') + (ctr !== null ? 'Click rate ' + ctr.toFixed(1) + ' percent.' : ''),
          { type: 'bars', unit: 'money', items: items, title: 'Cost per lead and per customer' });
    })();

    /* ---------------- Retention ---------------- */
    (function () {
      var churn = pctOf(num(a.customers_left), num(a.customers_start)), after = pctOf(num(a.run_left), num(a.run_start));
      R.churn = churn === null && after === null ? incomplete('churn', 'Monthly churn', need(a, ['customers_start', 'customers_left']))
        : ok('churn', 'Monthly churn', after !== null ? after : churn, 'pct', 'Of every hundred customers, this many leave in a month.', beforeAfter('churn', 'Monthly churn', churn, after, 'pct'));
      var c = after !== null ? after : churn;
      var life = (c !== null && c > 0) ? 100 / c : (c === 0 ? null : null);
      R.lifetime = c === null ? incomplete('lifetime', 'Expected stay', need(a, ['customers_start', 'customers_left']))
        : (c === 0 ? ok('lifetime', 'Expected stay', null, 'months', 'Nobody left last month, so the stay cannot be measured yet. A longer month will say.')
          : ok('lifetime', 'Expected stay', life, 'months', 'One divided by the churn: the months an average customer stays.'));
      R.retentionCurve = c === null ? incomplete('retentionCurve', 'Who is still here, month by month', need(a, ['customers_start', 'customers_left']))
        : ok('retentionCurve', 'Who is still here, month by month', Math.pow(1 - c / 100, 12) * 100, 'pct', 'Of a hundred who start, this many are still here after a year at today\'s churn.',
          { type: 'line', unit: 'pct', x: Array.apply(null, Array(13)).map(function (_, i) { return String(i); }), xLabel: 'Months', series: [{ label: 'Still here', values: Array.apply(null, Array(13)).map(function (_, i) { return Math.pow(1 - c / 100, i) * 100; }) }], title: 'Of a hundred who start, who is still here' });
      var rows = logRows(a.cohort_log, ['month', 'started', 'still here']).filter(function (r) { return r.started !== null && r['still here'] !== null && r.started > 0; });
      R.cohorts = rows.length === 0 ? incomplete('cohorts', 'Cohorts', ['The cohort log'])
        : ok('cohorts', 'Cohorts', rows.length, 'n', 'Each bar is one month\'s starters and how many stayed.',
          { type: 'bars', unit: 'pct', items: rows.map(function (r) { return { label: String(r.month), value: r['still here'] / r.started * 100 }; }), title: 'Share of each month\'s starters still here' });
    })();

    /* ---------------- Branding ---------------- */
    (function () {
      var before = pctOf(num(a.brand_consistent), num(a.brand_touches_week)), after = pctOf(num(a.run_on_brand), num(a.run_touches));
      R.consistency = before === null && after === null ? incomplete('consistency', 'Touches that look like the same brand', need(a, ['brand_touches_week', 'brand_consistent']))
        : ok('consistency', 'Touches that look like the same brand', after !== null ? after : before, 'pct', null,
          after === null ? { type: 'meter', unit: 'pct', value: before, min: 0, max: 100, bands: [{ to: 60, status: 'out' }, { to: 90, status: 'watch' }, { to: 100, status: 'good' }], title: 'Touches that matched the brand' } : beforeAfter('consistency', 'Touches that matched the brand', before, after, 'pct'));
      var want = list(a.assoc_want).length, never = list(a.assoc_never).length, look = list(a.brand_look).length;
      R.associations = (want + never + look) === 0 ? incomplete('associations', 'The lists', ['Ten to stand beside, five nevers, five fixed elements'])
        : ok('associations', 'The lists', want + never + look, 'n', 'Ten, five and five are the targets.',
          { type: 'progress', items: [{ label: 'Stand beside', value: want, target: 10 }, { label: 'Never', value: never, target: 5 }, { label: 'Fixed elements', value: look, target: 5 }], title: 'The brand lists against their targets' });
    })();

    /* ---------------- Price Raise ---------------- */
    (function () {
      var price = num(a.price), margin = num(a.gross_margin), custs = num(a.customers_month), raise = num(a.raise_pct);
      var m = need(a, ['gross_margin', 'raise_pct']);
      var be = m.length ? null : (margin + raise) > 0 ? raise / (margin + raise) * 100 : null;
      R.breakevenLoss = be === null ? incomplete('breakevenLoss', 'Customers you can lose and break even', m)
        : ok('breakevenLoss', 'Customers you can lose and break even', be, 'pct', 'Lose fewer than this share on a ' + raise + ' percent raise at a ' + margin + ' percent margin and profit goes up.',
          { type: 'meter', unit: 'pct', value: be, min: 0, max: 100, bands: [{ to: 100, status: 'none' }], title: 'Breakeven loss of customers', marker: be });
      var m2 = need(a, ['price', 'gross_margin', 'customers_month', 'raise_pct']);
      if (m2.length) { R.profitCurve = incomplete('profitCurve', 'Profit against customers kept', m2); }
      else {
        var xs = [], oldS = [], newS = [];
        for (var k = 50; k <= 100; k += 5) {
          xs.push(String(k));
          oldS.push(custs * price * margin / 100);
          newS.push(custs * (k / 100) * price * ((margin + raise) / 100));
        }
        R.profitCurve = ok('profitCurve', 'Profit against customers kept', custs * price * ((margin + raise) / 100) * (1 - be / 100), 'money', 'Monthly gross profit at the new price as customers fall away, against today\'s flat line. They cross at the breakeven loss.',
          { type: 'line', unit: 'money', x: xs, xLabel: 'Share of customers kept', series: [{ label: 'New price', values: newS }, { label: 'Today', values: oldS }], title: 'Monthly gross profit against customers kept', marker: String(Math.round((100 - be) / 5) * 5) });
      }
      var before = (price !== null && margin !== null && custs !== null) ? custs * price * margin / 100 : null;
      var realised = num(a.run_price_realised), after = (realised !== null && num(a.run_customers_after) !== null && price !== null && margin !== null) ? num(a.run_customers_after) * (realised - price * (1 - margin / 100)) : null;
      R.profitBeforeAfter = before === null ? incomplete('profitBeforeAfter', 'Monthly gross profit, before and after', need(a, ['price', 'gross_margin', 'customers_month']))
        : ok('profitBeforeAfter', 'Monthly gross profit, before and after', after !== null ? after : before, 'money', after === null ? 'The after bar appears once the first month at the new price is logged.' : null, beforeAfter('profitBeforeAfter', 'Monthly gross profit', before, after, 'money'));
    })();

    /* ---------------- Promo Cash ---------------- */
    (function () {
      var cac = num(a.cac), first = num(a.first_cash), cost30 = num(a.deliver_cost_30);
      var take = num(a.upsell_take_target) !== null ? num(a.upsell_take_target) : num(a.upsell_take), up = num(a.upsell_price);
      var upsellCash = (take !== null && up !== null) ? take / 100 * up : 0;
      var m = need(a, ['first_cash', 'deliver_cost_30']); if (cac === null) m.push(label('cac') + ' (Lifetime Value, band 2)');
      var cashIn = m.length ? null : first + upsellCash, cost = m.length ? null : cac + cost30;
      R.thirtyDayCash = m.length ? incomplete('thirtyDayCash', 'Thirty-day cash against cost', m)
        : ok('thirtyDayCash', 'Thirty-day cash against cost', cashIn - cost, 'money', cashIn >= cost ? 'A new customer pays for themselves inside thirty days.' : 'A new customer costs ' + fmtMoney(cost - cashIn) + ' more than they pay in thirty days.',
          { type: 'stackbars', unit: 'money', bars: [
            { label: 'Cash in 30 days', segments: [{ label: 'First purchase', value: first }].concat(upsellCash > 0 ? [{ label: 'Upsell, at the take rate', value: upsellCash }] : []) },
            { label: 'Cost in 30 days', segments: [{ label: 'To acquire', value: cac }, { label: 'To deliver', value: cost30 }] }], title: 'Thirty-day cash against cost' });
      var r = ratio(cashIn, cost), rAfter = ratio(num(a.run_cash_30), num(a.run_cost_30));
      R.thirtyDayRatio = r === null && rAfter === null ? incomplete('thirtyDayRatio', 'Thirty-day ratio', m)
        : ok('thirtyDayRatio', 'Thirty-day ratio', rAfter !== null ? rAfter : r, 'ratio', 'Cash in the first thirty days divided by the cost to get and serve. Above one, growth pays for itself.',
          rAfter === null ? { type: 'meter', unit: 'ratio', value: Math.min(r, 3), min: 0, max: 3, bands: [{ to: 1, status: 'out' }, { to: 1.5, status: 'watch' }, { to: 3, status: 'good' }], title: 'Thirty-day ratio', marker: 1 } : beforeAfter('thirtyDayRatio', 'Thirty-day ratio', r, rAfter, 'ratio'));
    })();

    /* ---------------- Implementation SOPs ---------------- */
    (function () {
      var written = num(a.sops_written), others = num(a.sops_others_run);
      var h = pctOf(others, written);
      R.handoff = written === null ? incomplete('handoff', 'Procedures someone else runs', need(a, ['sops_written', 'sops_others_run']))
        : (written === 0 ? ok('handoff', 'Procedures someone else runs', 0, 'pct', 'Nothing is written yet, so nothing can be handed off. Band 3 writes the first one.')
          : ok('handoff', 'Procedures someone else runs', h, 'pct', others + ' of ' + written + ' written procedures run without you.',
            { type: 'meter', unit: 'pct', value: h, min: 0, max: 100, bands: [{ to: 30, status: 'out' }, { to: 70, status: 'watch' }, { to: 100, status: 'good' }], title: 'Share of procedures someone else runs' }));
      var before = num(a.hours_week_owner), after = num(a.run_hours_owner);
      R.ownerHours = before === null ? incomplete('ownerHours', 'Hours a week on work someone else could do', need(a, ['hours_week_owner']))
        : ok('ownerHours', 'Hours a week on work someone else could do', after !== null ? after : before, 'hours', null, beforeAfter('ownerHours', 'Owner hours on work someone else could do', before, after, 'hours'));
      var rows = logRows(a.scorecard_log, ['week', 'leads', 'sales', 'kept', 'cash']);
      var cols = [['leads', 'Leads', 'n'], ['sales', 'Sales', 'n'], ['kept', 'Customers kept', 'n'], ['cash', 'Cash collected', 'money']];
      var have = rows.filter(function (r) { return cols.some(function (c) { return r[c[0]] !== null; }); });
      R.scorecard = have.length === 0 ? incomplete('scorecard', 'The scorecard', ['At least one week of the scorecard'])
        : ok('scorecard', 'The scorecard', have.length, 'n', have.length + ' weeks logged. Four in a row is the habit.',
          { type: 'multiples', title: 'The scorecard, week by week', charts: cols.map(function (c) {
            return { type: 'line', unit: c[2], x: have.map(function (r, i) { return String(r.week !== null ? r.week : i + 1); }), xLabel: 'Week', series: [{ label: c[1], values: have.map(function (r) { return typeof r[c[0]] === 'number' ? (c[2] === 'money' ? r[c[0]] * 100 : r[c[0]]) : null; }) }], title: c[1] };
          }) });
    })();

    return R;
  }

  function forPlaybook(id, answers) {
    var p = null;
    (TABLE ? TABLE.playbooks : []).forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return [];
    var all = evaluate(answers);
    return p.reads.map(function (r) { return all[r]; }).filter(Boolean);
  }

  function fmtMoney(cents, short) {
    if (cents === null || cents === undefined || !isFinite(cents)) return 'not yet';
    var neg = cents < 0, d = Math.abs(cents) / 100;
    var s;
    if (short && d >= 1000000) s = (d / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    else if (short && d >= 10000) s = Math.round(d / 1000) + 'k';
    else s = Math.round(d).toLocaleString('en-US');
    return (neg ? '-$' : '$') + s;
  }
  function fmt(value, unit, short) {
    if (value === null || value === undefined || !isFinite(value)) return 'not yet';
    switch (unit) {
      case 'money': return fmtMoney(value, short);
      case 'pct': return (Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10) + '%';
      case 'min': return Math.round(value) + ' min';
      case 'months': return (Math.round(value * 10) / 10) + ' months';
      case 'hours': return (Math.round(value * 10) / 10) + ' h';
      case 'ratio': return (Math.round(value * 10) / 10) + 'x';
      default: return (Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10).toLocaleString('en-US');
    }
  }

  return { use: use, evaluate: evaluate, forPlaybook: forPlaybook, fmt: fmt, fmtMoney: fmtMoney, LABELS: LABELS, label: label, parsePairs: parsePairs, logRows: logRows };
});
