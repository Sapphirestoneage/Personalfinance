/* The household (Level 8, MR-047 and MR-050): who lives here and whose money
   the picture counts. Roommates share bills; a partner shares bills and
   income. With a partner the picture counts the two of them together by
   default (basis "together"); "mine" counts the client's own income rows and
   their typed share of each shared bill. Pure helpers; nothing here writes. */
export function peopleOf(hh) { const h = hh || {}; return 1 + (h.roommates || []).length + (h.partner ? 1 : 0); }
export function hasPartner(hh) { return !!(hh && hh.partner); }
export function countsTogether(hh) { return hasPartner(hh) && (hh.basis || 'together') === 'together'; }
export function partnerName(hh) { return hh && hh.partner && hh.partner.nickname ? hh.partner.nickname : 'your partner'; }
/* The share of a shared bill the picture counts: under "together" the roommates' equal slices come off and the rest is the household's; otherwise the typed share, or one over the number of people. */
export function shareOf(hh, myShare) {
  const people = peopleOf(hh);
  if (countsTogether(hh)) return Math.round((1 - (hh.roommates || []).length / people) * 10000) / 10000;
  return typeof myShare === 'number' ? myShare : Math.round(10000 / people) / 10000;
}
