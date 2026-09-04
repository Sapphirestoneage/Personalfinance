/* ==========================================================================
   shared/liveform.js — never rebuild a form under the user's finger.
   --------------------------------------------------------------------------
   THE BUG THIS EXISTS TO PREVENT (found on a real phone, invisible on a
   desktop browser):

   Every room that renders a list of inputs did it by rebuilding the
   container's innerHTML whenever anything changed. Editing a field writes to
   the spine, the spine notifies, the room re-renders, and the list's DOM
   nodes are all destroyed and recreated.

   On a desktop that is merely wasteful. On a phone it breaks typing outright:

     1. You tap the next field. The browser blurs the field you were in.
     2. The blur handler writes the value, which triggers a re-render.
     3. The re-render replaces every node in the list — INCLUDING the node
        you just tapped, before the tap has finished resolving into focus.
     4. The room notices focus was lost and calls .focus() on the fresh
        replacement node. But a PROGRAMMATIC focus does not raise the soft
        keyboard on Android or iOS — only a real user gesture does.

   The keyboard closes, the caret is somewhere you cannot see, and what you
   type next goes nowhere. Which is exactly what it looks like from the
   outside: "the keypad doesn't pop up and my typing doesn't enter".

   THE RULE, enforced here rather than remembered in seven rooms:

       A container of live inputs is NEVER re-rendered while the user is
       working inside it. Renders requested during that time are held and
       run once — after focus has genuinely left and no tap is in flight.

   The outputs of a room are not affected: they keep updating live, because
   they hold no inputs. Only the container handed to guard() is deferred.

   Structural changes the user explicitly asked for — adding a row, removing
   one — call force(), because there the rebuild IS the response to the
   gesture and the focus that follows is part of the same gesture.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.LiveForm = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  /**
   * The scheduling rule on its own, with no DOM in it, so test/run.js can
   * check the logic outside a browser.
   *
   *   opts.isBusy  — () => true while the user is working in the form
   *   opts.render  — () => void, the actual re-render
   *
   * request() renders now if idle, otherwise remembers that a render is owed.
   * flush()   runs an owed render, but only if the form is idle again.
   * force()   renders regardless — for a rebuild the user just asked for.
   */
  function createScheduler(opts) {
    var o = opts || {};
    var isBusy = o.isBusy || function () { return false; };
    var render = o.render || function () {};
    var pending = false;
    var renderCount = 0;

    function run() {
      pending = false;
      renderCount++;
      render();
    }

    return {
      request: function () {
        if (isBusy()) { pending = true; return false; }
        run();
        return true;
      },
      flush: function () {
        if (!pending || isBusy()) return false;
        run();
        return true;
      },
      force: function () { run(); return true; },
      isPending: function () { return pending; },
      renderCount: function () { return renderCount; }
    };
  }

  /**
   * Wire the rule to a real container.
   *
   *   var form = LiveForm.guard(el('debt-list'), renderDebts);
   *   form.request();   // from anywhere a re-render might be wanted
   *   form.force();     // after add/remove, where the rebuild IS the answer
   *
   * "Busy" is deliberately wider than "has focus". A tap on a phone spans
   * three events — pointerdown on the new field, focusout on the old one,
   * then the click that finally moves focus — and a rebuild anywhere in that
   * window destroys the node the tap was headed for. So a pointer press
   * inside the container keeps the form busy until the press ends, and the
   * flush after it is deferred a task so focus has somewhere to land.
   */
  /* How long a form stays busy after the last sign of life in it.
     Focus is not enough on its own: a <select> can fire its change with
     focus already gone while the finger is still on the widget, and a
     rebuild in that gap eats the next tap exactly like the original bug.
     Long enough to cover a tap resolving, short enough that nobody sees
     the row redraw late. */
  var SETTLE_MS = 350;

  function guard(container, render, opts) {
    if (!container) return createScheduler({ render: render });
    var settleMs = (opts && typeof opts.settleMs === 'number') ? opts.settleMs : SETTLE_MS;

    var pointerHeld = false;
    var composing = false;
    var lastActivity = 0;
    var timer = null;

    function now() { return Date.now(); }
    function settling() { return (now() - lastActivity) < settleMs; }

    function holdsFocus() {
      var active = typeof document !== 'undefined' ? document.activeElement : null;
      if (!active || active === document.body) return false;
      return container.contains(active);
    }

    var scheduler = createScheduler({
      isBusy: function () { return pointerHeld || composing || holdsFocus() || settling(); },
      render: render
    });

    /* Always flush on a timer rather than immediately. focusout fires
       BEFORE the next element is focused and a pointer release resolves
       into focus a beat later, so checking early would see an idle form and
       rebuild straight into the gap. A flush that finds the form still busy
       does nothing and waits for the next signal. */
    function flushLater() {
      if (timer) clearTimeout(timer);
      var wait = Math.max(0, settleMs - (now() - lastActivity));
      timer = setTimeout(function () {
        timer = null;
        scheduler.flush();
      }, wait);
    }

    function stir() { lastActivity = now(); flushLater(); }

    function press() { pointerHeld = true; stir(); }
    function release() { pointerHeld = false; stir(); }

    /* Pointer events cover mouse, touch and pen in every browser this runs
       in; the touch pair is a belt-and-braces fallback for anything that
       reports touches without pointers. Releases are listened for on the
       document because a finger can start inside the form and lift outside
       it, which must not leave the form busy forever. */
    container.addEventListener('pointerdown', press, true);
    container.addEventListener('touchstart', press, { capture: true, passive: true });
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    document.addEventListener('touchend', release, true);
    document.addEventListener('touchcancel', release, true);

    /* Anything that means "the user is working in here". */
    ['focusin', 'focusout', 'input', 'change', 'keydown'].forEach(function (type) {
      container.addEventListener(type, stir, true);
    });
    container.addEventListener('compositionstart', function () { composing = true; stir(); }, true);
    container.addEventListener('compositionend', function () { composing = false; stir(); }, true);

    return scheduler;
  }

  return {
    SETTLE_MS: SETTLE_MS,
    createScheduler: createScheduler,
    guard: guard
  };
});
