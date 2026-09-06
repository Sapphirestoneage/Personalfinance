/* test/rooms/debt-fold.js — a debt row that fits on a phone: four facts always
   visible, everything set-once folded behind a caret that says what it holds.
   D-134. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Schema } = t;
  section('Debt: one row, one screen (D-134)');

  const page = fs.readFileSync(path.join(ROOT, 'rooms/debt-payoff.html'), 'utf8');
  const emitted = page.replace(/\/\*[\s\S]*?\*\//g, '');

  /* ---- What stays visible: exactly what it takes to plan a debt --------- */
  checkTrue('balance, minimum and type are always visible', /debt-grid debt-grid--3">[\s\S]{0,400}balanceCents[\s\S]{0,300}minPaymentCents[\s\S]{0,300}data-field="type"/.test(emitted));
  checkTrue('… and so is how interest works, because it changes the answer', /\+ interestBlock\(d\)/.test(emitted));

  /* ---- What folds ------------------------------------------------------- */
  checkTrue('the feeling and the reasons fold together, under one caret', /drawer\(d, 'why', 'Why you’re keeping it'/.test(emitted)
    && /emotionalTag/.test(emitted) && /keepBlock\(d\)/.test(emitted));
  checkTrue('the dates and the credit limit fold together', /drawer\(d, 'extras', 'Dates & limit'/.test(emitted)
    && /borrowedOn/.test(emitted) && /creditLimitCents/.test(emitted));
  checkTrue('a caret, not a button: native details/summary so it works with no JS', /<details class="fold"/.test(emitted)
    && /summary>/.test(emitted) && /\.fold > summary::before \{ content: '▸'/.test(page));

  /* ---- A closed drawer is never a black box ----------------------------- */
  checkTrue('each summary says what is inside it', /function whySummary\(d\)/.test(page) && /function extrasSummary\(d\)/.test(page));
  checkTrue('… counting the reasons, naming the feeling, flagging a held debt', /' reason' : ' reasons'/.test(page)
    && /Debt\.isExcluded\(d\)\) bits\.push\('held back'\)/.test(page));
  checkTrue('… saying so plainly when nothing is set', /'nothing set'/.test(page));
  checkTrue('… and repainted on every write, like everything else in the guarded list', /function paintFoldSummary\(d\)/.test(page)
    && /paintFoldSummary\(d\);/.test(page));

  /* ---- Open state survives a rebuild ------------------------------------ */
  /* Without this a drawer snaps shut the moment anything re-renders the
     list, which on a phone means it shuts while a finger is inside it. */
  checkTrue('open or closed is remembered across a rebuild', /var openDrawers = \{\}/.test(page)
    && /openDrawers\[drawerKey\(d\.id, name\)\] === true/.test(page));
  checkTrue('… recorded from the toggle event, captured because toggle does not bubble', /addEventListener\('toggle'[\s\S]{0,320}\}, true\);/.test(page));
  checkTrue('… and never stored on the household', !/upsertDebt\([^)]*openDrawers/.test(page) && !/openDrawers:/.test(page));

  /* ---- Wider, because this room is an editor ---------------------------- */
  checkTrue('the room widens past the shared measure on a big screen', /@media \(min-width: 760px\)[\s\S]{0,120}max-width: 720px/.test(page)
    && /@media \(min-width: 1040px\)[\s\S]{0,120}max-width: 980px/.test(page));
  checkTrue('… and the three facts drop to two columns on a small one', /@media \(max-width: 560px\)[\s\S]{0,200}debt-grid--3 \{ grid-template-columns: 1fr 1fr; \}/.test(page));

  /* ---- The folded fields still work ------------------------------------- */
  /* Folding is presentation: every field inside a drawer is the same input
     writing the same key it wrote before. */
  const d = Schema.createDebt({ id: 'z', emotionalTag: 'family', keepReasons: ['low_rate'], dueOn: '2029-04-01', creditLimitCents: 500000 });
  check('a folded field is still a plain stored field', [d.emotionalTag, d.keepReasons.join(','), d.dueOn, d.creditLimitCents].join('|'), 'family|low_rate|2029-04-01|500000');
  checkTrue('the live list is still guarded', /LiveForm\.guard\(el\('debt-list'\)/.test(page));
};
