/* test/rooms/menu.js — the menu: upkeep and every room, one pull from anywhere,
   and a sidebar that simply stays when the screen is wide enough. D-135. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Registry, Progress } = t;
  section('The menu (D-135): Your Data one tap from every room');

  const src = fs.readFileSync(path.join(ROOT, 'shared/progress.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'shared/theme.css'), 'utf8');

  /* ---- Upkeep first, and by id so nothing dead-links ------------------- */
  check('upkeep leads, with the data room first', Progress.UPKEEP[0], 'data');
  checkTrue('… and is written as registry ids, so a moved room is followed',
    Progress.UPKEEP.every(id => typeof id === 'string' && !/[./]/.test(id)));
  const known = Progress.UPKEEP.filter(id => Registry.byId(id));
  checkTrue('… every id in it resolves to a real room', known.length === Progress.UPKEEP.length);

  /* ---- What the menu lists --------------------------------------------- */
  const html = Progress.menuHtml('debt-payoff');
  checkTrue('the data room is in it', /Your Data/.test(html));
  checkTrue('… and the map, so nothing is only reachable one way', /Every room, on one page/.test(html));
  checkTrue('the room you are in is marked', /aria-current="page"[^>]*>Debt Payoff|is-here[^>]*aria-current="page"/.test(html) || /class="slaf-menu-link is-here" href="[^"]*debt-payoff/.test(html));
  const links = (html.match(/class="slaf-menu-link/g) || []).length;
  checkTrue('every room is reachable from it: ' + links + ' links for ' + Registry.inOrder().length + ' rooms',
    links >= Registry.inOrder().length);
  checkTrue('a room is listed once, never twice', (function () {
    const hrefs = (html.match(/href="([^"]+)"/g) || []).map(h => h.slice(6, -1));
    return new Set(hrefs).size === hrefs.length;
  })());
  /* From a room, links climb out of rooms/; from the root they must not. */
  checkTrue('links are relative to where they are used', /href="\.\.\/rooms\/data\.html"/.test(html)
    && /href="\.\.\/map\.html"/.test(html));
  checkTrue('… and from the root they do not climb', (function () {
    const atRoot = Progress.menuHtml('dashboard');
    return !/href="\.\.\//.test(atRoot);
  })());

  /* ---- One mount, no per-room markup ----------------------------------- */
  checkTrue('the menu is mounted by the header, so no room carries markup for it', /mountMenu\(roomId, nav\);/.test(src));
  checkTrue('… into <body>, so nothing clips it and it is never inside a live-input container (D-034)',
    /document\.body\.appendChild\(panel\)/.test(src));
  checkTrue('… once, even if mounted twice', /if \(document\.getElementById\('slaf-menu'\)\) return null;/.test(src));

  /* ---- It closes the ways people expect -------------------------------- */
  checkTrue('the backdrop closes it', /back\.addEventListener\('click', function \(\) \{ setOpen\(false\); \}\)/.test(src));
  checkTrue('Escape closes it', /e\.key === 'Escape' && !panel\.hidden/.test(src));
  checkTrue('the ✕ closes it', /data-menu-close/.test(src));
  checkTrue('focus goes into it on open and back to the button on close', /first\.focus\(\)/.test(src) && /btn\.focus\(\)/.test(src));
  checkTrue('the button says whether it is open', /aria-expanded/.test(src));

  /* ---- Two modes -------------------------------------------------------- */
  checkTrue('wide enough and it pins open as a sidebar instead', /matchMedia\('\(min-width: 1080px\)'\)/.test(src)
    && /function pinned\(\)/.test(src) && /slaf-menu-pinned/.test(src));
  checkTrue('… with no button and no backdrop to dismiss', /btn\.hidden = true;/.test(src) && /back\.hidden = true;/.test(src));
  checkTrue('… and the page beside it, not under it', /html\.slaf-menu-pinned body \{ padding-left: 272px; \}/.test(css));
  checkTrue('… switching live when the window is resized', /wide\.addEventListener\('change', applyMode\)/.test(src));
  checkTrue('opening is a no-op while pinned, so nothing can half-close it', /if \(pinned\(\)\) return;/.test(src));

  /* ---- It has to be readable ------------------------------------------- */
  /* The surface tokens are translucent by design; a drawer using one shows
     the page through itself, which is what the first build did. */
  checkTrue('the panel is opaque, not a translucent surface token', /\.slaf-menu \{[\s\S]{0,400}background: var\(--navy-850\);/.test(css));
  checkTrue('the page behind does not scroll while the drawer is open', /html\.slaf-menu-open, html\.slaf-menu-open body \{ overflow: hidden; \}/.test(css));
  checkTrue('the column grows on a desktop rather than staying a phone ribbon', /@media \(min-width: 1080px\)[\s\S]{0,80}--measure: 620px/.test(css));
};
