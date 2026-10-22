// House defaults: values filled in when a field is blank, stored in the spine
// as rough Facts so they show yellow and land in the still-guessing list.
// Run after loading a household and after every Ledger edit (S-160).

import { fact, setAt } from './spine.js';

// A credit card with no APR gets DEFAULT_CARD_APR. That covers an intro rate
// with no rate after it too: the APR is the rate after the intro.
export function applyDefaults(spine, rules) {
  const asOf = spine.meta.asOf;
  const year = +asOf.slice(0, 4);
  let out = spine;
  for (const d of spine.debts || []) {
    if (d.type !== 'credit_card' || (d.apr && d.apr.kind !== 'missing')) continue;
    out = setAt(out, 'debts.' + d.id + '.apr', fact(rules.get('DEFAULT_CARD_APR', year), { kind: 'rough', asOf, source: 'DEFAULT_CARD_APR', note: 'house assumption until the real rate is entered' }));
  }
  return out;
}
