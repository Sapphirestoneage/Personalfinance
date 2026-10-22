// House defaults: values filled in when a field is blank, stored in the spine
// as rough Facts so they show yellow and land in the still-guessing list.
// Run after loading a household and after every Ledger edit (S-160, S-163).

import { fact, setAt, valueOf } from './spine.js';

const blank = (f) => !f || f.kind === 'missing';

// A credit card with no APR gets DEFAULT_CARD_APR. That covers an intro rate
// with no rate after it too: the APR is the rate after the intro.
// Every debt with no due day gets DEFAULT_DUE_DAY (an IOU only when it has a
// payment). A card's statement close day is never filled in.
export function applyDefaults(spine, rules) {
  const asOf = spine.meta.asOf;
  const year = +asOf.slice(0, 4);
  const rough = (value, rule, note) => fact(value, { kind: 'rough', asOf, source: rule, note });
  let out = spine;
  for (const d of spine.debts || []) {
    const base = 'debts.' + d.id;
    if (d.type === 'credit_card' && blank(d.apr)) out = setAt(out, base + '.apr', rough(rules.get('DEFAULT_CARD_APR', year), 'DEFAULT_CARD_APR', 'house assumption until the real rate is entered'));
    const paysSomething = d.type !== 'family_iou' || (valueOf(d.minimum) ?? 0) > 0;
    if (paysSomething && blank(d.dueDay)) out = setAt(out, base + '.dueDay', rough(rules.get('DEFAULT_DUE_DAY', year), 'DEFAULT_DUE_DAY', 'house assumption until the real due day is entered'));
  }
  return out;
}
