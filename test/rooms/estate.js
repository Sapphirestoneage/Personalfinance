/* test/rooms/estate.js — Estate Basics (D-098). Run by test/run.js. */
module.exports = function (t) {
  var check = t.check, checkTrue = t.checkTrue, Money = t.Money, Schema = t.Schema, Demo = t.Demo;
  var Estate = require(t.path.join(t.ROOT, 'engines/estate.js'));
  var T = t.TABLES;
  var table = T.estateBasics;

  t.section('Estate Basics');

  /* -- The table ------------------------------------------------------------ */
  checkTrue('the table is filled, not a placeholder', !!table && !/PLACEHOLDER/.test(table.source) && table.confidence === 'convention');
  checkTrue('… and says it is a general pattern, not legal advice', /[Nn]ot legal advice/.test(table.source));
  var schemaCats = ['cash', 'investment', 'retirement', 'real_estate', 'vehicle', 'other'];
  check('one row per schema asset category', table.categories.map(function (c) { return c.category; }).sort().join(','), schemaCats.slice().sort().join(','));
  checkTrue('every row passes by beneficiary, title or will', table.categories.every(function (c) { return ['beneficiary', 'title', 'will'].indexOf(c.passesBy) !== -1 && typeof c.note === 'string' && c.note.length > 0; }));
  check('retirement accounts pass by beneficiary', Estate.routeOf('retirement', table), 'beneficiary');
  check('cash passes by beneficiary (payable-on-death)', Estate.routeOf('cash', table), 'beneficiary');
  check('a brokerage account passes by will', Estate.routeOf('investment', table), 'will');
  check('an unknown category takes the default road, the will', Estate.routeOf('mystery', table), 'will');
  checkTrue('three one-liners: a will, beneficiaries, a POA', ['will', 'beneficiaries', 'poa'].every(function (k) { return typeof table.documents[k] === 'string' && table.documents[k].length > 20; }));
  checkTrue('and the guardian line', /guardian/.test(table.guardian));

  /* -- Hand-derived: the demo persona's assets ------------------------------
     cash $9,500 → passes by beneficiary (POD); investment $48,000 → passes
     by will; no retirement row. Nothing answered: both roads lead to the
     state, so at risk = 9,500 + 48,000 = $57,500. */
  var CASH = 950000, INV = 4800000;
  var h = Demo.build();
  check('the demo persona owns what the hand sum expects', Schema.totalAssetsCents(h).value, CASH + INV);
  var r = Estate.review(h, T);
  checkTrue('review is ok on the demo persona', Money.isOk(r));
  check('0 of 3 in place when nothing is answered', r.value + ' of ' + r.total, '0 of 3');
  check('three unanswered', r.unanswered, 3);
  checkTrue('… said as "not answered", never as "no"', r.facts.every(function (f) { return f.said === 'not answered' && f.state === 'unanswered'; }));
  check('by the table alone: $9,500 by beneficiary, $48,000 by will, $0 by title', [r.passesBy.beneficiary, r.passesBy.will, r.passesBy.title].join('/'), [CASH, INV, 0].join('/'));
  check('at risk with nothing answered = 9,500 + 48,000', r.atRiskCents, CASH + INV);
  check('nothing passes the chosen way', r.chosenCents, 0);
  check('the routes as drawn: everything by the state', JSON.stringify(r.routes), JSON.stringify({ beneficiary: 0, title: 0, will: 0, state: CASH + INV }));
  check('zone: out — nothing in place, with assets', r.zone, 'out');
  check('Robin lives alone: no guardian line', r.guardianLine, null);

  /* Say yes to the will: the $48,000 leaves the at-risk pile; $9,500 stays. */
  var willYes = Demo.build(); willYes.estate.willExists = true;
  var r2 = Estate.review(willYes, T);
  check('a will: 1 of 3', r2.inPlace, 1);
  check('… and only the cash is still at risk ($9,500)', r2.atRiskCents, CASH);
  check('… the investments pass by will', r2.routes.will, INV);
  check('… zone watch', r2.zone, 'watch');
  checkTrue('… the will is in place, the other two still not answered', r2.facts[1].said === 'in place' && r2.facts[0].said === 'not answered' && r2.facts[2].said === 'not answered');

  /* Beneficiaries named, will not: the cash is chosen, the brokerage is not. */
  var benYes = Demo.build(); benYes.estate.beneficiariesSet = true; benYes.estate.willExists = false;
  var r3 = Estate.review(benYes, T);
  check('beneficiaries named: at risk is the brokerage only ($48,000)', r3.atRiskCents, INV);
  check('… by beneficiary $9,500', r3.routes.beneficiary, CASH);
  check('… an explicit no is said as "not yet", not "not answered"', r3.facts[1].said, 'not yet');
  check('… one unanswered (the POA)', r3.unanswered, 1);

  /* -- All three yes: good, $0 at risk ------------------------------------ */
  var all = Demo.build(); all.estate = { beneficiariesSet: true, willExists: true, poaExists: true };
  var r4 = Estate.review(all, T);
  check('all three: 3 of 3, zone good', r4.inPlace + '/' + r4.zone, '3/good');
  check('… nothing at risk', r4.atRiskCents, 0);
  check('… everything passes the chosen way', r4.chosenCents, CASH + INV);
  check('… routes: cash by beneficiary, brokerage by will', JSON.stringify(r4.routes), JSON.stringify({ beneficiary: CASH, title: 0, will: INV, state: 0 }));

  /* -- No assets: 0 at risk, the facts still count ------------------------ */
  var bare = Schema.createHousehold({ estate: { willExists: true } });
  var r5 = Estate.review(bare, T);
  checkTrue('no assets: review is still ok', Money.isOk(r5));
  check('… counts the facts (1 of 3)', r5.inPlace, 1);
  check('… $0 at risk', r5.atRiskCents, 0);
  checkTrue('… and says the assets are not entered, with a reason', !Money.isOk(r5.assets) && /Start Here/.test(r5.assets.reason));
  check('… zone watch (one in place)', r5.zone, 'watch');
  var none = Schema.createHousehold({});
  var r6 = Estate.review(none, T);
  check('nothing answered, nothing owned: 0 of 3, no zone', r6.inPlace + '/' + String(r6.zone), '0/null');
  check('… chosen is $0, not negative', r6.chosenCents, 0);

  /* -- Empty household, no tables: says why, does not throw ---------------- */
  var threw = false, r7 = null;
  try { r7 = Estate.review(Schema.createHousehold({}), {}); } catch (e) { threw = true; }
  checkTrue('an empty household with no table does not throw', !threw);
  checkTrue('… and says why', !!r7 && r7.status === 'incomplete' && /table/.test(r7.reason));
  var threw2 = false;
  try { Estate.review(undefined, T); Estate.review(null, T); } catch (e) { threw2 = true; }
  checkTrue('no household at all does not throw', !threw2);

  /* -- Dependents and the guardian line ------------------------------------ */
  var kids = Demo.build(); kids.dependents = [{ age: 6 }];
  check('someone depends on you and no will: the guardian line', Estate.review(kids, T).guardianLine, table.guardian);
  var legacy = Demo.build(); legacy.dependents = true;
  check('legacy dependents: true still gets the guardian line', Estate.review(legacy, T).guardianLine, table.guardian);
  var kidsWill = Demo.build(); kidsWill.dependents = [{ age: 6 }]; kidsWill.estate.willExists = true;
  check('… gone once there is a will', Estate.review(kidsWill, T).guardianLine, null);
  var nobody = Demo.build(); nobody.dependents = [];
  check('… absent when nobody depends on you', Estate.review(nobody, T).guardianLine, null);

  /* -- A retirement account and a house, by the table ---------------------- */
  var rich = Demo.build();
  rich.assets.push(Schema.createAsset({ id: 'k', category: 'retirement', valueCents: 1000000 }));
  rich.assets.push(Schema.createAsset({ id: 'h', category: 'real_estate', valueCents: 20000000 }));
  rich.estate = { beneficiariesSet: true, willExists: null, poaExists: null };
  var r8 = Estate.review(rich, T);
  check('retirement joins the cash by beneficiary: 9,500 + 10,000', r8.routes.beneficiary, CASH + 1000000);
  check('the house joins the brokerage on the will road, and no will means the state: 48,000 + 200,000', r8.atRiskCents, INV + 20000000);
  checkTrue('an asset with no amount is skipped, not counted as zero', (function () {
    var x = Demo.build(); x.assets.push(Schema.createAsset({ id: 'n', category: 'other', valueCents: null }));
    return Estate.review(x, T).atRiskCents === CASH + INV;
  })());

  /* -- Ownership: the three facts are this room's ---------------------------- */
  ['beneficiariesSet', 'willExists', 'poaExists'].forEach(function (f) {
    var d = t.Ownership.field(f);
    check('ownership: ' + f + ' is owned by estate at #inputs', d && (d.owner + '/' + d.anchor), 'estate/inputs');
  });
  checkTrue('the schema starts the three as null, never false', (function () { var e = Schema.createHousehold({}).estate; return e.beneficiariesSet === null && e.willExists === null && e.poaExists === null; })());

  /* -- The page ----------------------------------------------------------- */
  var html = t.fs.readFileSync(t.path.join(t.ROOT, 'rooms/estate.html'), 'utf8');
  checkTrue('the page mounts the template', /Room\.mount\(\{/.test(html) && /id: 'estate'/.test(html));
  t.Room.IDS.concat(['room-standalone', 'load-notice', 'number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading']).forEach(function (id) {
    checkTrue('the page has #' + id, new RegExp('id="' + id + '"').test(html));
  });
  checkTrue('the page is marked built once', /LIVE-FORM: built once/.test(html));
  var tags = (html.match(/<script src="[^"]+"><\/script>/g) || []).map(function (s) { return s.replace(/<script src="\.\.\//, '').replace(/"><\/script>/, ''); });
  checkTrue('it loads its engine after tier0 and before the lens and the template', tags.indexOf('engines/estate.js') > tags.indexOf('engines/tier0.js') && tags.indexOf('engines/estate.js') < tags.indexOf('shared/lens.js') && tags.indexOf('shared/lens.js') < tags.indexOf('shared/room.js'));
  checkTrue('it writes only estate.* through Spine.set', (html.match(/Spine\.set\('([^']+)'/g) || []).every(function (m) { return /Spine\.set\('estate\./.test(m); }) && /Spine\.set\('estate\./.test(html));
  checkTrue('it never touches another owner\'s field', !/upsertAsset|upsertPerson|upsertDebt/.test(html));
  checkTrue('three choice inputs, yes / not yet', (html.match(/factInput\('/g) || []).length === 3 && /\[\['yes', 'Yes'\], \['no', 'Not yet'\]\]/.test(html));
  checkTrue('one donut', (html.match(/Charts\.donut\(/g) || []).length === 2 && !/Charts\.(area|bars|stacked)\(/.test(html));
  checkTrue('it says what it does not do', /scope: 'This room does not write a will/.test(html));
  checkTrue('it asks for its table', /tables: \['estateBasics'/.test(html));
  var Gate = t.Gate;
  checkTrue('why: a paragraph for each situation', Gate.SITUATIONS.every(function (s) { return new RegExp('\\n\\s+' + s.id + ": '").test(html); }));
  var reg = t.Registry.byId('estate');
  check('the registry row appears for everyone', reg && reg.needs.length, 0);
  check('… at rooms/estate.html', reg && reg.href, 'rooms/estate.html');
};
