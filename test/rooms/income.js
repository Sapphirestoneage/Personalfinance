/* test/rooms/income.js — the Income room: every kind, the costs on the entry, the list. D-128. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Registry, Ownership } = t;
  section('Income room (D-128): the page, the registry, the owned number');
  const page = fs.readFileSync(path.join(ROOT, 'rooms/income.html'), 'utf8');
  const room = Registry.byId('income');
  checkTrue('Income is registered, an about-you room so the four-room core stays four (D-051)', !!room && room.kind === 'about-you' && !room.utility);
  check('it follows Cash Flow on the path', Registry.byId('cash-flow').order < room.order && room.order < Registry.byId('financial-snapshot').order, true);
  checkTrue('the page builds its kinds from the schema, so all eight are selectable', /Schema\.INCOME_KINDS\.map/.test(page));
  checkTrue('a gift hides the tax row', /kind === 'gift'/.test(page) && /data-for="taxable"/.test(page));
  checkTrue('costs are offered only where the schema allows them', /Schema\.costsAllowed\(/.test(page));
  checkTrue('the list shows a net-of-costs figure', /netOfCostsCents/.test(page));
  checkTrue('the detail shows expenses linked to the entry', /linkedExpenses/.test(page) && /linked-list/.test(page));
  checkTrue('every net comes from the ledger engine', /Ledger\.netOf\(/.test(page) && !/effectiveRate\s*\*/.test(page));
  checkTrue('the room re-renders on every spine change, so a saved entry appears with no reload', /Spine\.onChange\(render\)/.test(page));
  checkTrue('the room declares its form pattern', /LIVE-FORM: built once/.test(page));
  const h = Schema.createHousehold({});
  check('the owned number is incomplete with nothing logged', Ownership.field('ledgerIncome').read(h).status, 'incomplete');
  h.ledger.income = [Schema.createIncomeEntry({ kind: 'w2', amountCents: 240000, frequency: 'fortnightly' }), Schema.createIncomeEntry({ kind: 'gift', amountCents: 50000, frequency: 'once' }), Schema.createIncomeEntry({ kind: 'se', amountCents: 100000, frequency: 'monthly', active: false })];
  check('… and is the recurring active entries a month', Ownership.field('ledgerIncome').read(h).value, Math.round(240000 * 26 / 12));
  check('… owned by Income', Ownership.field('ledgerIncome').owner, 'income');
  const pageK = fs.readFileSync(path.join(ROOT, 'rooms/income.html'), 'utf8');
  checkTrue('the Income form asks how sure the date is, three ways (D-130)', /id="f-datekind"/.test(pageK) && /value="potential"/.test(pageK) && /dateKind: el\('f-datekind'\)\.value/.test(pageK));
};
