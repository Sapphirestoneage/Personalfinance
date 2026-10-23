// Estimate history (S-090): every time an estimate changes, the store appends
// { lineId or categoryId, from, to, at, month } to doc.estimateLog. The log is
// never edited or deleted; the store refuses a change that would. Only the
// client changes estimates (lesson 17); this only writes down that they did.
// store.update calls both functions on the live view and the draft before a
// change is stamped and saved. No imports.

const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
const blank = (v) => !v || (v.amount === null && v.status === null);
const copy = (v) => (v ? JSON.parse(JSON.stringify(v)) : null);

export function recordEstimates(before, after, nowIso) {
  const was = new Map();
  for (const c of before.categories || []) {
    was.set('cat:' + c.id, c.estimate);
    for (const l of c.lines || []) was.set(l.id, l.estimate);
  }
  const add = (key, to) => {
    const from = was.has(key) ? was.get(key) : null;
    if (same(from, to) || (blank(from) && blank(to))) return;
    const e = key.startsWith('cat:') ? { categoryId: key.slice(4) } : { lineId: key };
    // month is the month being worked on at the time, so a reader knows which budget the change was about.
    after.estimateLog.push({ ...e, from: copy(from), to: copy(to), at: nowIso, month: after.currentMonth });
  };
  for (const c of after.categories || []) {
    add('cat:' + c.id, c.estimate);
    for (const l of c.lines || []) add(l.id, l.estimate);
  }
}

// The log only grows: everything that was there must still be there, unchanged.
export function checkAppendOnly(before, after) {
  const a = before.estimateLog || [];
  const b = after.estimateLog || [];
  if (b.length < a.length || a.some((e, i) => !same(e, b[i])))
    throw new Error('Change refused: estimate history is never edited or deleted');
}
