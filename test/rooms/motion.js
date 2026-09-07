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
  /* This used to assert the MECHANISM — that the fill was --sapphire-300 —
     which is how D-137 happened to solve it. D-154 solves the same problem
     the other way (a deep fill with a white label) and the old assertion
     failed even though contrast went UP. Measure the property instead: read
     whatever the rule actually sets, resolve the tokens, and check the ratio.
     Now it holds whichever direction a future pass goes. */
  (function () {
    function tok(name) {
      const m = new RegExp('\\' + '-\\-' + name.replace(/^--/, '') + ':\\s*(#[0-9A-Fa-f]{3,8})').exec(css);
      return m ? m[1] : null;
    }
    function resolve(v) {
      const m = /var\((--[a-z0-9-]+)\)/i.exec(v);
      return m ? tok(m[1]) : (/^#/.test(v.trim()) ? v.trim() : null);
    }
    function lum(hex) {
      const h = hex.replace('#', '');
      const p = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
        .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    }
    function ratio(a, b) {
      const l1 = lum(a), l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    const rule = /\.slaf-btn--primary \{([\s\S]*?)\}/.exec(css);
    const bg = rule && resolve((/background:\s*([^;]+);/.exec(rule[1]) || [])[1] || '');
    const fg = rule && resolve((/(?:^|\s)color:\s*([^;]+);/.exec(rule[1]) || [])[1] || '');
    checkTrue('the primary button names both a fill and a label colour', !!(bg && fg),
      'bg=' + bg + ' fg=' + fg);
    if (bg && fg) {
      const r = ratio(bg, fg);
      checkTrue('the primary button label clears AA 4.5:1 on its own fill (' + r.toFixed(2) + ':1)',
        r >= 4.5, fg + ' on ' + bg);
    }
    const hover = /\.slaf-btn--primary:hover \{([\s\S]*?)\}/.exec(css);
    const hbg = hover && resolve((/background:\s*([^;]+);/.exec(hover[1]) || [])[1] || '');
    if (hbg && fg) {
      const r = ratio(hbg, fg);
      checkTrue('...and still clears it on the hover fill (' + r.toFixed(2) + ':1)', r >= 4.5);
    }
  })();
  /* A `.slaf-btn { color }` rule at the end of the file ties on specificity
     with the primary variant and wins on order — it silently repainted the
     label near-white on light blue and took it to 2.34:1. */
  checkTrue('… and no later blanket rule repaints that label', !/\n\.slaf-btn \{ color:/.test(rules));
};
