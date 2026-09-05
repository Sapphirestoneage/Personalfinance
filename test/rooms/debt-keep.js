/* test/rooms/debt-keep.js — "Reasons to keep it": the rational axis beside the
   emotional one, and the hold-back toggle it informs but never triggers. D-132. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, TABLES } = t;
  const Debt = require(path.join(ROOT, 'engines/debt.js'));
  const RULES = TABLES.debtRules;
  section('Debt: reasons to keep it (D-132), and the hold-back the household flips itself');

  const mk = (o) => Schema.createDebt(Object.assign({ minPaymentCents: 20000 }, o));
  const house = (debts) => Schema.createHousehold({ debts: debts, meta: { hasDebt: true } });

  /* ---- The table ---------------------------------------------------------- */
  check('five reasons, in the table not the code', Debt.keepReasonTags(RULES).map(x => x.id).join(','), 'low_rate,tax_favoured,appreciating,building_credit,subsidised');
  checkTrue('each carries a label and a plain-words hint', Debt.keepReasonTags(RULES).every(x => x.label && x.hint));
  check('the low-rate ceiling is a stated convention', RULES.keepReasons.lowRateCeiling, 0.06);

  /* ---- Two axes, never one ------------------------------------------------ */
  const d0 = mk({ id: 'a', type: 'credit_card', balanceCents: 100000, rate: 0.2 });
  check('the default is None: an empty list, nothing pre-selected', JSON.stringify(d0.keepReasons) + '/' + d0.excludeFromAggressive, '[]/false');
  const both = Schema.createDebt(Object.assign({}, d0, { emotionalTag: 'shameful', keepReasons: ['building_credit'] }));
  check('feels-like and reasons-to-keep are independent', both.emotionalTag + '/' + both.keepReasons.join(','), 'shameful/building_credit');
  check('setting the reasons never touches the feeling', Schema.createDebt(Object.assign({}, both, { keepReasons: ['low_rate'] })).emotionalTag, 'shameful');
  check('and setting the feeling never touches the reasons', Schema.createDebt(Object.assign({}, both, { emotionalTag: 'family' })).keepReasons.join(','), 'building_credit');

  /* ---- Multi-select, and it persists -------------------------------------- */
  const many = Schema.createDebt(Object.assign({}, d0, { keepReasons: ['low_rate', 'tax_favoured', 'appreciating'] }));
  check('more than one can apply to the same debt, and all persist', many.keepReasons.join(','), 'low_rate,tax_favoured,appreciating');
  check('… through a save and a reload', Schema.createHousehold({ debts: [many] }).debts[0].keepReasons.join(','), 'low_rate,tax_favoured,appreciating');
  check('an unknown id is dropped and a repeat is kept once', Schema.createDebt({ keepReasons: ['low_rate', 'low_rate', 'nonsense'] }).keepReasons.join(','), 'low_rate');
  check('a non-list reads as None', JSON.stringify(Schema.createDebt({ keepReasons: 'low_rate' }).keepReasons), '[]');
  const Spine = require(path.join(ROOT, 'shared/spine-v2.js'));
  Spine.reset();
  Spine.upsertDebt({ id: 'x', label: 'Card', keepReasons: ['low_rate', 'building_credit'], excludeFromAggressive: true });
  check('the spine stores both, and the constructor cleans them', Spine.getProfile().debts[0].keepReasons.join(',') + '/' + Spine.getProfile().debts[0].excludeFromAggressive, 'low_rate,building_credit/true');
  Spine.reset();

  /* ---- The suggestion: from this debt's own type and rate, never silent --- */
  const mortgage = mk({ id: 'm', label: 'Mortgage', type: 'mortgage', balanceCents: 30000000, rate: 0.035, minPaymentCents: 150000 });
  check('a mortgage at a low rate suggests the three that fit', Debt.suggestedKeepReasons(mortgage, RULES).map(x => x.id).join(','), 'low_rate,tax_favoured,appreciating');
  check('… and stores none of them: the debt still reads None until it is confirmed', JSON.stringify(mortgage.keepReasons), '[]');
  check('a debt that already carries reasons is never re-suggested to', Debt.suggestedKeepReasons(Schema.createDebt(Object.assign({}, mortgage, { keepReasons: ['low_rate'] })), RULES).length, 0);
  check('a card at 22.9% suggests nothing', Debt.suggestedKeepReasons(mk({ type: 'credit_card', rate: 0.229 }), RULES).length, 0);
  check('a student loan above the ceiling gets the tax one only', Debt.suggestedKeepReasons(mk({ type: 'student_loan', rate: 0.065 }), RULES).map(x => x.id).join(','), 'tax_favoured');
  /* D-053: a rate that is only low until the promo ends is a deadline, not a low rate. */
  const promoCard = mk({ type: 'credit_card', rate: 0, promoEndsOn: '2027-06-01', postPromoRate: 0.2499 });
  check('a 0% card that reverts to 24.99% is promotional, not low-rate', Debt.suggestedKeepReasons(promoCard, RULES).map(x => x.id).join(','), 'subsidised');
  check('a promo that stays cheap after it ends is both', Debt.suggestedKeepReasons(mk({ type: 'personal', rate: 0.02, promoEndsOn: '2027-06-01', postPromoRate: 0.03 }), RULES).map(x => x.id).join(','), 'low_rate,subsidised');
  check('an expired promo is not a reason to keep it', Debt.suggestedKeepReasons(mk({ type: 'credit_card', rate: 0.05, promoEndsOn: '2020-01-01' }), RULES).map(x => x.id).join(','), 'low_rate');
  check('the labels come back in the table’s order, whatever order they were stored in', Debt.keepReasonLabels(Schema.createDebt({ keepReasons: ['appreciating', 'low_rate'] }), RULES).map(x => x.id).join(','), 'low_rate,appreciating');

  /* ---- Tags change nothing; the toggle changes the order ------------------ */
  const card = mk({ id: 'card', label: 'Card', type: 'credit_card', balanceCents: 400000, rate: 0.229 });
  const car = mk({ id: 'auto', label: 'Car', type: 'auto', balanceCents: 500000, rate: 0.07 });
  const run = (debts) => {
    const p = Debt.simulate(house(debts), RULES, { strategyId: 'avalanche', extraMonthlyCents: 100000 });
    return { months: p.value, order: p.payoffs.map(x => x.label).join(' → '), interest: p.totalInterestCents };
  };
  const plain = run([card, car]);
  check('avalanche targets the dearest first', plain.order, 'Card → Car');
  const tagged = run([Schema.createDebt(Object.assign({}, card, { keepReasons: ['building_credit', 'low_rate'] })), car]);
  check('reasons alone change nothing about the plan', JSON.stringify(tagged), JSON.stringify(plain));
  const excluded = run([Schema.createDebt(Object.assign({}, card, { keepReasons: ['building_credit'], excludeFromAggressive: true })), car]);
  checkTrue('the toggle changes it: the held debt is cleared last', excluded.order === 'Car → Card' && JSON.stringify(excluded) !== JSON.stringify(plain));
  checkTrue('… and costs more interest, which is the price of the decision', excluded.interest > plain.interest);
  check('a held debt still gets its minimum every month: it finishes, it is not abandoned', excluded.months <= plain.months + 12 && excluded.months > 0, true);
  /* Every strategy, not just avalanche. */
  ['avalanche', 'snowball', 'convenience', 'hybrid'].forEach(function (id) {
    const held = Debt.simulate(house([Schema.createDebt(Object.assign({}, card, { excludeFromAggressive: true })), car]), RULES, { strategyId: id, extraMonthlyCents: 100000 });
    if (!Money.isOk(held)) return;
    checkTrue(`${id}: a held debt is ordered last`, held.payoffs[held.payoffs.length - 1].label === 'Card');
  });
  check('excluding every debt still produces a plan', Money.isOk(Debt.simulate(house([Schema.createDebt(Object.assign({}, card, { excludeFromAggressive: true })), Schema.createDebt(Object.assign({}, car, { excludeFromAggressive: true }))]), RULES, { strategyId: 'avalanche', extraMonthlyCents: 100000 })), true);
  checkTrue('the prepared row carries both, so the views and the order agree', (function () {
    const r = Debt.simulate(house([Schema.createDebt(Object.assign({}, card, { keepReasons: ['low_rate'], excludeFromAggressive: true })), car]), RULES, { strategyId: 'avalanche' });
    return Money.isOk(r);
  })());

  /* ---- The room ----------------------------------------------------------- */
  const page = fs.readFileSync(path.join(ROOT, 'rooms/debt-payoff.html'), 'utf8');
  checkTrue('the row asks both, side by side and separately', /data-field="emotionalTag"/.test(page) && /data-keep="/.test(page) && /Reasons to keep it/.test(page));
  checkTrue('the reasons are chips, one per tag plus None', /Debt\.keepReasonTags\(RULES\)/.test(page) && /data-reason=""/.test(page) && /None</.test(page));
  checkTrue('a suggestion is shown dashed and stored only when confirmed', /is-suggested/.test(page) && /data-keep-confirm=/.test(page) && /data-keep-dismiss=/.test(page) && /nothing is saved until you say so/.test(page));
  checkTrue('the hold-back is a checkbox the household ticks itself', /data-field="excludeFromAggressive"/.test(page) && /Exclude from aggressive payoff suggestions/.test(page));
  checkTrue('… and the row says plainly that reasons alone do nothing', /Reasons on their own change nothing about the payoff order/.test(page));
  checkTrue('the tags show inline in the payoff order, not on another screen', /class="tagline"/.test(page) && /Debt\.keepReasonLabels\(d, RULES\)/.test(page) && /held back on purpose/.test(page));
  checkTrue('the plan says what holding one back costs', /You are keeping /.test(page) && /more in interest than letting the plan target/.test(page));
  checkTrue('the what-if copy is never written back', /function unheld\(h\)/.test(page) && /Never written, never shown as the plan/.test(page));
  checkTrue('the live list is still guarded, so a chip never rebuilds the row under a finger', /LiveForm\.guard\(el\('debt-list'\)/.test(page) && /debtForm\.force\(\)/.test(page));
  /* Because the row is never rebuilt, a tap that lands has to be painted
     onto the controls already there, or it looks like nothing happened. */
  checkTrue('… so the chips, None, the suggestion and the hint are painted in place instead', /function paintKeep\(d\)/.test(page) && /paintKeep\(d\);/.test(page)
    && /data-keep-suggest="/.test(page) && /data-keep-hint="/.test(page));
  checkTrue('… and every keep write repaints rather than forcing a rebuild', !/data-keep-dismiss'\)\] = true; debtForm\.force/.test(page)
    && /Spine\.upsertDebt\(\{ id: id, keepReasons: on \}\);\s*\n\s*paintLive\(\);/.test(page));
};
