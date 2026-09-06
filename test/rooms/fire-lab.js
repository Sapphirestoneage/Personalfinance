/* test/rooms/fire-lab.js — the FIRE Lab: every FIRE calculation on one screen
   and drawn, reading the engines that already own each formula. D-138. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Registry, Money, Schema, Demo } = t;
  section('The FIRE Lab (D-138): every calculation, drawn');

  const page = fs.readFileSync(path.join(ROOT, 'rooms/fire-lab.html'), 'utf8');
  const code = page.replace(/<!--[\s\S]*?-->/g, '');

  /* ---- It is a room, in the right place --------------------------------- */
  const room = Registry.byId('fire-lab');
  checkTrue('registered as a room', !!room);
  check('… that reads and never writes', (room.needs || []).join(','), 'monthlyExpenses,investments');
  checkTrue('… next to the FIRE Number it expands on', room.order > Registry.byId('fire').order && room.order < 9);
  checkTrue('… with every panel deep-linkable', (room.subsections || []).length >= 7);

  /* ---- It owns no formula ----------------------------------------------- */
  /* One formula, one function: this room draws what the engines return. */
  checkTrue('the number comes from the fire engine', /Fire\.calculateFIRE\(h, TABLES, opts\(\)\)/.test(code));
  checkTrue('progress too', /Fire\.progressToward\(h, TABLES, opts\(\)\)/.test(code));
  checkTrue('the flavours are the engine’s, not a second list', /Fire\.allVariants\(h, TABLES, opts\(\)\)/.test(code));
  checkTrue('the path compounds through the projection engine’s assumptions', /a\.expectedReturnRate/.test(code));
  checkTrue('the savings rate comes from Tier 0', /Tier0\.savingsRate\(h, TABLES\)/.test(code));

  /* ---- Nothing is stored ------------------------------------------------- */
  /* SPEC.md §12.2: a tool that lets you test a different withdrawal rate does
     it as a local override for the view, never a write to the assumptions. */
  checkTrue('the withdrawal rate is a local preview', /var swrPreview = null;/.test(code)
    && /localOverrides: \{ swrRate: swrPreview \}/.test(code));
  checkTrue('… and the room writes nothing at all', !/Spine\.update|Spine\.upsert|Spine\.set\(/.test(code));

  /* ---- Missing figures stay missing -------------------------------------- */
  checkTrue('an incomplete panel names its field and links to the owner', /function waiting\(result\)/.test(code)
    && /Ownership\.linkTo/.test(code));
  /* A donut of one 100% slice is not a chart. */
  checkTrue('the spending donut needs more than one slice before it is drawn', /if \(cats\.length > 1\)/.test(code));
  checkTrue('… and says what to categorise when it cannot be', /to see which slices it is made of/.test(code));

  /* ---- The charts are the shared ones ------------------------------------ */
  checkTrue('donut, bars and area all come from shared/charts.js',
    /Charts\.donut\(/.test(code) && /Charts\.bars\(/.test(code) && /Charts\.area\(/.test(code));
  /* Charts.area takes [x, y] pairs; objects render as NaN and the SVG throws. */
  checkTrue('the path feeds area the pair format it expects', /pts\.push\(\[i, Math\.round\(bal\)\]\)/.test(code));
  checkTrue('… and formats its x axis through x.format', /x: \{ format: function/.test(code));

  /* ---- The maths it draws ------------------------------------------------ */
  const Fire = require(path.join(ROOT, 'engines/fire.js'));
  const h = Demo.build();
  const T = t.TABLES;
  const base = Fire.calculateFIRE(h, T, {});
  const cautious = Fire.calculateFIRE(h, T, { localOverrides: { swrRate: 0.03 } });
  checkTrue('a lower withdrawal rate is a bigger number, which is the whole point of the slider',
    Money.isOk(base) && Money.isOk(cautious) && cautious.value > base.value);
  const lean = Fire.calculateFIRE(h, T, { expenseFactor: 0.7 });
  checkTrue('spending less needs less', Money.isOk(lean) && lean.value < base.value);
  checkTrue('the grid’s corners bracket the base', Money.isOk(base)
    && Fire.calculateFIRE(h, T, { expenseFactor: 0.7, localOverrides: { swrRate: 0.045 } }).value < base.value
    && Fire.calculateFIRE(h, T, { expenseFactor: 1.3, localOverrides: { swrRate: 0.03 } }).value > base.value);

  /* ---- The live-form rule ------------------------------------------------ */
  checkTrue('the room declares how it treats its one input', /LIVE-FORM: built once/.test(page));
};
