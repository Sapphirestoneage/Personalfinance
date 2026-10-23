// Quick lines (S-122): several sub-categories typed at once, each a name and an amount.
//   "claude 216 spotify 21 youtube 27"  ->  Claude 216, Spotify 21, Youtube 27
//   "Netflix $15.49, gym 40 split"      ->  Netflix 15.49, Gym 40 (split with someone)
// A name is the words before a number; the number is its amount a month. "split" or "shared" right
// after an amount marks that line as split with someone. Commas, semicolons, and new lines are optional.
// Words with no number after them are named and left blank (empty is not zero).

const NUM = /^\$?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;
const MARK = /^\(?(split|shared)\)?$/i;

const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function parseQuickLines(text) {
  // 1,200 is one number: join thousands before commas split the list.
  const tokens = String(text || '').replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/[;,\n]+/g, ' , ').split(/\s+/).filter(Boolean);
  const out = [];
  let words = [];
  const flush = (amount) => {
    if (!words.length) return;
    out.push({ name: title(words.join(' ')), amount, shared: false });
    words = [];
  };
  for (const t of tokens) {
    if (t === ',') { flush(null); continue; }
    if (NUM.test(t) && words.length) { flush(Number(t.replace(/[$,]/g, ''))); continue; }
    if (MARK.test(t) && !words.length && out.length) { out[out.length - 1].shared = true; continue; }
    words.push(t);
  }
  flush(null);
  return out;
}
