// Quick lines (S-122): several sub-categories typed at once, each a name and an amount a month. No imports.
//   "claude 216 spotify 21 youtube 27"  ->  Claude 216, Spotify 21, Youtube 27
//   "Netflix $15.49, gym 40 split"      ->  Netflix 15.49, Gym 40 (split with someone)
// A name is the words before a number; the number is its amount a month (dollars, as typed). "split" or "shared"
// right after an amount marks that line as split with someone. Commas, semicolons, and new lines are optional.
// Words with no number after them are named and left blank (empty is not zero).

// An amount: an optional $, digits (thousands commas allowed), up to two decimals.
const NUM = /^\$?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;
// The split mark after an amount, with or without parentheses.
const MARK = /^\(?(split|shared)\)?$/i;

const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Parses one box of quick lines into names and amounts.
 * @param {?string} text what the coach typed; null or blank gives [].
 * @returns {Array<{name: string, amount: ?number, shared: boolean}>} amount in dollars a month as typed (up to two
 *   decimals), null when no number followed the name; the name is capitalized.
 */
export function parseQuickLines(text) {
  // 1,200 is one number: join thousands before commas split the list.
  const tokens = String(text || '')
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
    .replace(/[;,\n]+/g, ' , ')
    .split(/\s+/)
    .filter(Boolean);
  const out = [];
  let words = [];
  const flush = (amount) => {
    if (!words.length) return;
    out.push({ name: title(words.join(' ')), amount, shared: false });
    words = [];
  };
  for (const t of tokens) {
    if (t === ',') {
      flush(null);
      continue;
    }
    // A number with no name before it is a word, so a name may start with digits (24 Hour Fitness).
    if (NUM.test(t) && words.length) {
      flush(Number(t.replace(/[$,]/g, '')));
      continue;
    }
    if (MARK.test(t) && !words.length && out.length) {
      out[out.length - 1].shared = true;
      continue;
    }
    words.push(t);
  }
  flush(null);
  return out;
}
