/* The general ledger: an append-only list of lines. Every change to a fact
   is one line { seq, ts, planet, rowId, field, owner, old, new, source, state,
   kind, session }. Undo and redo append lines too; nothing is ever deleted.
   History and "since last session" read from here. */

export const KINDS = Object.freeze(['set', 'add-row', 'remove-row', 'undo', 'redo', 'session', 'import', 'note', 'anchor', 'household', 'goals', 'program']);

export function createJournal() { return []; }

export function nextSeq(journal) {
  return journal.length ? journal[journal.length - 1].seq + 1 : 1;
}

export function append(journal, line, now) {
  if (KINDS.indexOf(line.kind) === -1) throw new Error('unknown journal kind ' + line.kind);
  const full = Object.assign({ seq: nextSeq(journal), ts: now || new Date().toISOString() }, line);
  journal.push(full);
  return full;
}

/* Which data lines are currently reverted. An undo line reverts `of`; a redo
   line re-applies it. Walk forward so the latest word wins. */
export function revertedSet(journal) {
  const reverted = new Set();
  journal.forEach(l => {
    if (l.kind === 'undo') reverted.add(l.of);
    if (l.kind === 'redo') reverted.delete(l.of);
  });
  return reverted;
}

export function isDataLine(l) { return l.kind === 'set' || l.kind === 'add-row' || l.kind === 'remove-row'; }

/* The data line that an undo would revert next: the newest data line that is
   not reverted, and that is newer than nothing that supersedes it. */
export function undoTarget(journal) {
  const reverted = revertedSet(journal);
  for (let i = journal.length - 1; i >= 0; i--) {
    const l = journal[i];
    if (isDataLine(l) && !reverted.has(l.seq)) return l;
    if (l.kind === 'import' || l.kind === 'session') return null;
  }
  return null;
}

/* The line a redo would re-apply: the most recent undo whose target is still
   reverted, as long as no new data line came after that undo. */
export function redoTarget(journal) {
  const reverted = revertedSet(journal);
  for (let i = journal.length - 1; i >= 0; i--) {
    const l = journal[i];
    if (isDataLine(l)) return null;
    if (l.kind === 'undo' && reverted.has(l.of)) return journal.find(x => x.seq === l.of) || null;
  }
  return null;
}

/* Lines since a timestamp, data lines only, newest first. */
export function since(journal, ts) {
  return journal.filter(l => isDataLine(l) && l.ts > ts).slice().reverse();
}

/* Collapse a run of lines into one change per (rowId, field): first old, last new. */
export function collapse(lines) {
  const byKey = new Map();
  lines.slice().reverse().forEach(l => {
    const key = l.rowId + '\u0000' + (l.field || '');
    if (!byKey.has(key)) byKey.set(key, { planet: l.planet, rowId: l.rowId, field: l.field, old: l.old, new: l.new, kind: l.kind, ts: l.ts });
    else byKey.get(key).new = l.new;
  });
  return Array.from(byKey.values()).reverse();
}
