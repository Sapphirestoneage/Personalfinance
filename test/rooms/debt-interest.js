/* test/rooms/debt-interest.js — "How interest works": one question with three
   answers, replacing a Rate box, a no-interest tick and a promo pair that used
   to sit in three different places. D-133. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path } = t;
  section('Debt: how interest works, asked once (D-133)');

  const page = fs.readFileSync(path.join(ROOT, 'rooms/debt-payoff.html'), 'utf8');

  /* ---- One question, three answers -------------------------------------- */
  checkTrue('the row asks how interest works, once', /How interest works/.test(page) && /function interestBlock\(d\)/.test(page));
  checkTrue('… with exactly three answers', /A rate that stays/.test(page) && /0% or a promo rate/.test(page) && /No interest, ever/.test(page));
  /* Match what the row emits, not what the comments explain. */
  const emitted = page.replace(/\/\*[\s\S]*?\*\//g, '');
  checkTrue('the old scattered controls are gone from the row', !/No interest charged/.test(emitted)
    && !/0% \/ promo ends/.test(emitted) && !/Then the rate becomes/.test(emitted));
  checkTrue('the promo pair is no longer buried in the cards-only block', !/data-cardonly[\s\S]{0,400}promoEndsOn/.test(page));

  /* ---- The mode is derived, never stored -------------------------------- */
  checkTrue('the mode is read off what is already stored, so nothing migrates', /function interestMode\(d\)/.test(page)
    && /d\.interestFree === true\) return 'never'/.test(page) && /d\.promoEndsOn\) return 'promo'/.test(page));
  checkTrue('no interest-mode field is ever written to a debt', !/interestMode:/.test(page) && !/patch\.interestMode/.test(page));
  /* The deadlock: promo mode needs a date, the date box only shows in promo
     mode. The tap is remembered for the visit so the box can be reached. */
  checkTrue('a tapped promo shows its fields before a date exists', /var interestIntent = \{\}/.test(page)
    && /interestIntent\[d\.id\] === 'promo'\) return 'promo'/.test(page));
  checkTrue('… and that intent is never stored', !/upsertDebt\([^)]*interestIntent/.test(page));

  /* ---- Every field built once, shown by mode ---------------------------- */
  /* Two inputs for one field would give paintInterest() and the change
     handler two nodes to disagree about, so each is built exactly once. */
  check('the rate input is built exactly once, so paint and write agree', (emitted.match(/field\(d, 'rate'/g) || []).length, 1);
  check('… and so is the go-to rate', (emitted.match(/field\(d, 'postPromoRate'/g) || []).length, 1);
  check('… and so is the promo end date', (emitted.match(/data-field="promoEndsOn"/g) || []).length, 1);
  checkTrue('the fields are hidden by mode, never rebuilt under a finger', /data-ipart="rate"/.test(page)
    && /function paintInterest\(d\)/.test(page) && /paintInterest\(d\);/.test(page));
  checkTrue('the live list is still guarded', /LiveForm\.guard\(el\('debt-list'\)/.test(page));

  /* ---- Switching modes never leaves a contradiction --------------------- */
  checkTrue('choosing "no interest" clears any promo behind it', /patch\.interestFree = true; patch\.rate = 0; patch\.promoEndsOn = null; patch\.postPromoRate = null;/.test(page));
  checkTrue('choosing a plain rate clears any promo behind it', /mode === 'stays'[\s\S]{0,200}patch\.promoEndsOn = null; patch\.postPromoRate = null;/.test(page));
  checkTrue('… and puts the rate back to unanswered when the 0 only came from "no interest"', /d\.interestFree === true && d\.rate === 0\) patch\.rate = null;/.test(page));

  /* ---- It says what the plan will do ------------------------------------ */
  checkTrue('each mode says in one line what the plan does with it', /function interestSentence\(d, mode\)/.test(page));
  checkTrue('… a promo with no end date says the plan would treat it as permanent (D-053)', /Add the date it ends, or the plan treats today’s rate as permanent\./.test(page));
  checkTrue('… a promo with no go-to rate says the same', /Add the rate it becomes/.test(page));
  checkTrue('… interest-free says nothing is added', /Nothing is added to this balance/.test(page));
  checkTrue('a date is read without a timezone shifting it', /function isoMonth\(iso\)/.test(page) && !/new Date\(iso\)/.test(page));

  /* ---- The figures, on one rail, with their meaning --------------------- */
  checkTrue('every figure carries what it means', /class="dl-why"/.test(page)
    && /The cost of borrowing, on top of what you actually owe\./.test(page)
    && /Every payment added up, balances and interest together\./.test(page));
  checkTrue('… on a fixed column so the digits line up', /grid-template-columns: minmax\(0, auto\) 9\.5ch 1fr/.test(page));
  checkTrue('the four orderings read as a table with the captions said once', /class="strategy-cols"/.test(page)
    && /grid-template-columns: minmax\(0, 1fr\) 8\.5ch 8ch/.test(page));
  checkTrue('a tie badges nothing: four identical figures under a "cheapest" flag reads as a bug', /if \(allTie\) badge = '';/.test(page)
    && /var allTie = totals\.length > 1/.test(page));
};
