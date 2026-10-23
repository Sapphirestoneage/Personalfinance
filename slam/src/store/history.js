// Undo and redo. Keeps whole-document copies (households are small), so any
// change of any kind can be undone, including imports and month close. Copies
// are JSON strings, so a later edit of the live document cannot reach into a
// saved step. Used only by store.js; no imports.

// How many steps back undo goes; the oldest fall off the front.
const LIMIT = 200;

export function createHistory() {
  let past = [];
  let future = [];
  return {
    record(beforeDoc, label) {
      past.push({ doc: JSON.stringify(beforeDoc), label });
      if (past.length > LIMIT) past.shift();
      // A new change after an undo drops the redo branch, as in any editor.
      future = [];
    },
    undo(currentDoc) {
      const step = past.pop();
      if (!step) return null;
      // The label travels with the step both ways, so Undo and Redo name the same change.
      future.push({ doc: JSON.stringify(currentDoc), label: step.label });
      return { doc: JSON.parse(step.doc), label: step.label };
    },
    redo(currentDoc) {
      const step = future.pop();
      if (!step) return null;
      past.push({ doc: JSON.stringify(currentDoc), label: step.label });
      return { doc: JSON.parse(step.doc), label: step.label };
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    undoLabel: () => (past.length ? past[past.length - 1].label : null),
    redoLabel: () => (future.length ? future[future.length - 1].label : null),
    clear() { past = []; future = []; }
  };
}
