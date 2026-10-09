/* The household (Level 8, MR-047 and MR-050): who lives here and whose money
   the picture counts. Roommates share bills; a partner shares bills and
   income. With a partner the picture counts the two of them together by
   default (basis "together"); "mine" counts the client's own income rows and
   their typed share of each shared bill. Pure helpers; nothing here writes. */
/* MR-073: partners is a list (one, two or more); partner stays the first of them for older readers */
export function partnersOf(hh) { const h = hh || {}; return Array.isArray(h.partners) ? h.partners : (h.partner ? [h.partner] : []); }
export function peopleOf(hh) { const h = hh || {}; return 1 + (h.roommates || []).length + partnersOf(h).length; }
export function hasPartner(hh) { return partnersOf(hh).length > 0; }
export function countsTogether(hh) { return hasPartner(hh) && (hh.basis || 'together') === 'together'; }
export function partnerName(hh) { const ps = partnersOf(hh); const names = ps.map(p => p.nickname).filter(Boolean); if (ps.length > 1) return names.length === ps.length ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : 'your partners'; return names[0] || 'your partner'; }
/* The share of a shared bill the picture counts: under "together" the roommates' equal slices come off and the rest is the household's; otherwise the typed share, or one over the number of people. */
export function shareOf(hh, myShare) {
  const people = peopleOf(hh);
  if (countsTogether(hh)) return Math.round((1 - (hh.roommates || []).length / people) * 10000) / 10000;
  return typeof myShare === 'number' ? myShare : Math.round(10000 / people) / 10000;
}
