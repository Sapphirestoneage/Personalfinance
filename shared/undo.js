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
  Spine.onChange(paint);
  function mount() { document.body.appendChild(box); document.documentElement.classList.add('has-undo'); paint(); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
