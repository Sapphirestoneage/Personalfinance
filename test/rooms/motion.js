/* test/rooms/motion.js — the interaction layer: one easing, two durations, and
   nothing that snaps. Measured, not eyeballed: 4,558 of 4,844 links and buttons
   had no transition at all before this. D-137. */
module.exports = function (t) {
  const { section, checkTrue, ROOT, fs, path } = t;
  section('The interaction layer (D-137): nothing snaps, every word fits');

  const css = fs.readFileSync(path.join(ROOT, 'shared/theme.css'), 'utf8');

  checkTrue('one easing and two durations for the whole app',
    /--ease: cubic-bezier/.test(css) && /--dur-fast: \d+ms/.test(css) && /--dur: \d+ms/.test(css));
  checkTrue('links, buttons and cards all transition', /^a, button, summary, select, input, textarea,$/m.test(css));
  /* `transition: all` animates layout too and makes a page lurch when
     anything reflows, so the layer names the properties it changes. */
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');   /* match what ships, not the comments */
  checkTrue('… naming the properties, never `all`', !/transition:\s*all\b/.test(rules));
  checkTrue('a press is felt', /\.slaf-btn:active:not\(:disabled\)/.test(css) && /transform: translateY\(1px\)/.test(css));
  checkTrue('a clickable card lifts, and a plain one does not pretend to',
    /a\.slaf-card:hover, button\.slaf-card:hover/.test(css));
  checkTrue('disabled means disabled: no press, no pointer',
    /:disabled, \[aria-disabled="true"\] \{ cursor: not-allowed; \}/.test(css)
    && /:disabled:hover[\s\S]{0,80}transform: none/.test(css));
  /* Motion must be optional. The reduced-motion block cuts every duration,
     so this whole layer costs someone who asked for stillness nothing. */
  checkTrue('someone who asked for stillness gets it', /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,200}transition-duration: 0\.01ms !important/.test(css));

  /* ---- Every word in the box -------------------------------------------- */
  /* Eight rooms were showing "Where It Goes & how it’s" and stopping. A room
     name is the whole point of the link, so it wraps instead of truncating. */
  checkTrue('a room name wraps rather than truncating mid-word',
    /\.slaf-hop \{[^}]*-webkit-line-clamp: 2/.test(css) && !/\.slaf-hop \{[^}]*white-space: nowrap/.test(css));

  /* ---- Contrast ---------------------------------------------------------- */
  /* Measured every text node in every room against WCAG AA. 57 failed and 33
     of those were one bug: no bare `a` rule, so any link a component did not
     style itself fell back to the browser default #0000EE — 1.88:1 on navy,
     which is invisible. */
  checkTrue('a bare link can never fall back to the browser default blue', /^a \{ color: var\(--color-accent-hover\); \}$/m.test(css));
  checkTrue('the primary button clears the 4.5 floor by lightening the fill, not the label',
    /\.slaf-btn--primary \{[\s\S]{0,420}background: var\(--sapphire-300\);/.test(css));
  /* A `.slaf-btn { color }` rule at the end of the file ties on specificity
     with the primary variant and wins on order — it silently repainted the
     label near-white on light blue and took it to 2.34:1. */
  checkTrue('… and no later blanket rule repaints that label', !/\n\.slaf-btn \{ color:/.test(rules));
};
