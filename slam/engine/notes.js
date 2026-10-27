// Notes (overnight Track I): a dated note on any number or item, and the Session's notes. One list on the household:
// spine.notes = [{ id, date, path, text, shared }]. path is a field ("expenses.rent.amount"), an item ("expenses.rent")
// or null for a Session note; shared marks a Session note to print on the One-pager for the client.
//
// Compatibility: spine.notes is new and optional; older files have none and load unchanged.

const nextId = (list) => 'n' + (list.reduce((m, n) => Math.max(m, +String(n.id).replace(/\D/g, '') || 0), 0) + 1);

export function addNote(spine, { path = null, text, shared = false }, today) {
  const t = String(text || '').trim();
  if (!t) return spine;
  const list = spine.notes || [];
  return { ...spine, notes: [...list, { id: nextId(list), date: today, path, text: t, shared: !!shared }] };
}
export const removeNote = (spine, id) => ({ ...spine, notes: (spine.notes || []).filter((n) => n.id !== id) });
export const setShared = (spine, id, shared) => ({ ...spine, notes: (spine.notes || []).map((n) => (n.id === id ? { ...n, shared: !!shared } : n)) });
// The notes on a field or an item (a field's own and its item's), newest first.
export function notesFor(spine, path) {
  const item = path.split('.').slice(0, 2).join('.');
  return (spine.notes || []).filter((n) => n.path && (n.path === path || n.path === item)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
export const sessionNotes = (spine) => (spine.notes || []).filter((n) => !n.path).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
export const sharedNotes = (spine) => sessionNotes(spine).filter((n) => n.shared);
