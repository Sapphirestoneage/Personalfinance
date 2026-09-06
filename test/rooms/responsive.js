/* test/rooms/responsive.js — measured fixes for a finger and for a monitor.
   Each of these came from auditing every room at 412px and 1440px. D-136. */
module.exports = function (t) {
  const { section, checkTrue, ROOT, fs, path } = t;
  section('Phone and desktop, measured (D-136)');

  const css = fs.readFileSync(path.join(ROOT, 'shared/theme.css'), 'utf8');
  const map = fs.readFileSync(path.join(ROOT, 'map.html'), 'utf8');
  const ex  = fs.readFileSync(path.join(ROOT, 'rooms/exercises.html'), 'utf8');

  /* ---- The overflow ----------------------------------------------------- */
  /* A bar row's third cell holds a figure and never wraps. When the row has
     no figure it holds a reason instead, and nowrap pushed that 69px past
     the right edge of a phone, scrolling the whole page sideways. */
  checkTrue('a reason in a bar row wraps; a figure still does not',
    /\.slaf-bars \.row\.is-empty \.val \{[^}]*white-space: normal/.test(css)
    && /\.slaf-bars \.val \{[^}]*white-space: nowrap/.test(css));
  checkTrue('… and the row can shrink to fit at all', /\.slaf-bars \.row > \* \{ min-width: 0; \}/.test(css));

  /* ---- Touch targets, only where a finger is ---------------------------- */
  checkTrue('the touch rules are scoped to a coarse pointer, so a mouse keeps the compact controls',
    /@media \(pointer: coarse\)/.test(css));
  checkTrue('the suggestion chip is tappable', /\.slaf-use-this,[\s\S]{0,120}min-height: 32px/.test(css));
  checkTrue('a tick is 20px, not 16px', /input\[type="checkbox"\], input\[type="radio"\],[\s\S]{0,140}width: 20px; height: 20px;/.test(css));
  /* Rooms style their ticks as `.flag input`, which ties on specificity with
     a bare element selector and wins on source order. */
  checkTrue('… named through the label so it beats a room’s own rule',
    /label input\[type="checkbox"\], label input\[type="radio"\]/.test(css));
  checkTrue('the ⓘ grows on a phone, since the room tells you to tap it 45 times',
    /\.slaf-info \{ width: 30px; height: 30px;/.test(css));
  checkTrue('the exercise chips grow too', /@media \(pointer: coarse\) \{ \.pill \{ min-height: 32px;/.test(ex));

  /* An inline link inside a sentence is deliberately NOT padded out: doing
     that tears paragraphs apart, and it is never the primary control. */
  checkTrue('inline links in prose are left alone', !/\ba \{[^}]*min-height: 3[0-9]px/.test(css));

  /* ---- Desktop ---------------------------------------------------------- */
  checkTrue('the column grows with the screen, in steps', /--measure: 620px/.test(css)
    && /--measure: 680px/.test(css) && /--measure: 720px/.test(css));
  /* Past roughly 75 characters a line is harder to read, so the answer to a
     big monitor is not an ever-wider paragraph. */
  checkTrue('… and stops growing before the line gets unreadable', !/--measure: (8|9)\d\dpx/.test(css));
  checkTrue('the map flows two-up where there is room', /#room-list \{ display: grid; grid-template-columns: 1fr 1fr;/.test(map));
};
