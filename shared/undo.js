/* ==========================================================================
   shared/undo.js — two buttons, top right, on every page.
   BRIEF "Undo / Redo", DECISIONS.md D-094.
   --------------------------------------------------------------------------
   Include the script and the buttons appear. Each says what it will do
   ("Undo: cash & savings $9,500 → $12,000") and why it cannot when it
   cannot. Cmd/Ctrl-Z and Cmd/Ctrl-Shift-Z do the same, except inside a box
   being typed in, where the browser's own undo keeps its meaning. Every
   page already re-renders on the spine's change notification, so undoing
   redraws the dashboard and any open room without a load.
   ========================================================================== */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var S = (typeof self !== 'undefined' ? self : window).SLAF || {};
  var Spine = S.Spine;
  if (!Spine || !Spine.undo) return;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  var box = document.createElement('div');
  box.className = 'slaf-undo';
  box.innerHTML = '<button type="button" class="slaf-undo-btn" data-undo aria-label="Undo">↶<span>Undo</span></button>'
    + '<button type="button" class="slaf-undo-btn" data-redo aria-label="Redo">↷<span>Redo</span></button>';
  var undoBtn = box.querySelector('[data-undo]'), redoBtn = box.querySelector('[data-redo]');

  function paint() {
    var u = Spine.peekUndo(), r = Spine.peekRedo();
    undoBtn.disabled = !u;
    redoBtn.disabled = !r;
    /* With nothing to undo the bar is a floating shape on top of whatever it
       covers, and it covered a figure. It appears with the first change. */
    box.hidden = !u && !r;
    undoBtn.title = u ? 'Undo: ' + u.label : 'Nothing to undo yet — every change you make lands here.';
    redoBtn.title = r ? 'Redo: ' + r.label : 'Nothing to redo — undo something first.';
    undoBtn.setAttribute('aria-label', undoBtn.title);
    redoBtn.setAttribute('aria-label', redoBtn.title);
  }
  function typing() {
    var a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }
  undoBtn.addEventListener('click', function () { Spine.undo(); paint(); });
  redoBtn.addEventListener('click', function () { Spine.redo(); paint(); });
  document.addEventListener('keydown', function (evt) {
    if (!(evt.metaKey || evt.ctrlKey) || evt.key.toLowerCase() !== 'z' || typing()) return;
    evt.preventDefault();
    if (evt.shiftKey) Spine.redo(); else Spine.undo();
    paint();
  });
  /* ---- Saying that it saved (D-165) ---------------------------------------
     Nothing in this app ever confirmed anything. You typed a number, tapped
     away, and the only signal it had stuck was a 33px button in the corner
     changing opacity. On a phone that button is an unlabelled glyph, because
     the words are hidden under 640px and the explanation lives in `title`,
     which a touch device never shows. So the person who most needed to know
     what undo would do was the one who could not find out.

     One widget answers both. The toast appears where the eye already is,
     says what just happened in the same words the undo button uses, and
     carries the Undo with it. The corner buttons stay for the keyboard
     shortcut and for undoing something from two rooms ago.

     It is an aria-live region, the first in the app, so a screen reader hears
     the change rather than only seeing a button become enabled. */
  var toast = document.createElement('div');
  toast.className = 'slaf-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;
  var toastTimer = null;

  function hideToast() { toast.hidden = true; if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; } }

  function showToast(text, offerUndo) {
    toast.innerHTML = '<span class="slaf-toast-text">' + esc(text) + '</span>'
      + (offerUndo ? '<button type="button" class="slaf-toast-undo">Undo</button>' : '')
      + '<button type="button" class="slaf-toast-x" aria-label="Dismiss">\u00D7</button>';
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    /* Long enough to read a sentence and reach for Undo, short enough not to
       sit over the next thing being typed. */
    toastTimer = setTimeout(hideToast, 7000);
  }

  toast.addEventListener('click', function (evt) {
    if (evt.target.closest('.slaf-toast-undo')) { Spine.undo(); paint(); return; }
    if (evt.target.closest('.slaf-toast-x')) hideToast();
  });

  /* Depth tells a new action from an undo of one: the stack grows when
     something happened, and shrinks when it was taken back. Anything else
     (a load, a room repainting) leaves it alone and says nothing. */
  var lastDepth = null;
  function announce() {
    var size = Spine.historySize ? Spine.historySize() : null;
    if (!size) return;
    if (lastDepth === null) { lastDepth = size.undo; return; }   /* first paint is not news */
    if (size.undo > lastDepth) {
      var u = Spine.peekUndo();
      if (u && u.label) showToast(u.label, true);
    } else if (size.undo < lastDepth) {
      showToast('Undone', false);
    }
    lastDepth = size.undo;
  }

  Spine.onChange(function () { paint(); announce(); });
  function mount() { document.body.appendChild(box); document.body.appendChild(toast);
    /* The room keeps the space the bar will use, whether or not it shows yet,
       so the page never shifts under a finger when the first change lands. */
    document.documentElement.classList.add('has-undo'); paint(); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
