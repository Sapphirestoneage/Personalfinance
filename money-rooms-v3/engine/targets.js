/* Your words (Level 8, MR-049): per area, the number the client wants to aim
   for: what they said (gut), what they would want (dream), meet in the middle,
   or keep it as is. The default is dream when the dream is below actual, "room
   to spend more" when the dream is above actual, else the middle. A chosen
   target becomes a planned move so the next session can say "you were aiming
   for X, now at Y". Pure. */
import { fiEffect } from './variance.js';

export function defaultChoice(row, fraction) {
  if (row.actual === null) return null;
  if (row.dream !== null && row.dream < row.actual) return 'dream';
  if (row.dream !== null && row.dream > row.actual) return 'room';
  if (row.gut !== null || row.dream !== null) return 'middle';
  return 'keep';
}
export function middleValue(row, fraction) {
  if (row.actual === null) return null;
  const candidates = [row.gut, row.dream].filter(x => x !== null);
  if (!candidates.length) return row.actual;
  const nearer = candidates.sort((a, b) => Math.abs(a - row.actual) - Math.abs(b - row.actual))[0];
  return Math.round(row.actual + (nearer - row.actual) * (fraction === undefined ? 0.5 : fraction));
}
export function targetValue(row, choice, fraction, custom) {
  switch (choice) {
    case 'gut': return row.gut;
    case 'dream': case 'room': return row.dream;
    case 'middle': return custom !== undefined && custom !== null ? custom : middleValue(row, fraction);
    case 'keep': default: return row.actual;
  }
}
/* proposals(varianceRows, record, result, asm) -> one line per area with the default choice, the value, and the FI effects */
export function proposals(rows, record, result) {
  const fraction = result.asm.callTargetRoomFraction === undefined ? 0.5 : result.asm.callTargetRoomFraction;
  const stored = record.targets || {};
  const out = rows.filter(r => r.key !== 'total' && r.actual !== null).map(r => {
    const saved = stored[r.key] || null;
    const choice = saved ? saved.choice : defaultChoice(r, fraction);
    const value = saved && saved.cents !== undefined && saved.cents !== null ? saved.cents : targetValue(r, choice, fraction);
    const delta = value === null ? 0 : value - r.actual;
    const eff = fiEffect(result, delta);
    return { key: r.key, label: r.label, actual: r.actual, gut: r.gut, dream: r.dream, choice, value, deltaMonthly: delta, fiNumberDelta: eff.fiNumberDelta, fiMonths: eff.months, saved: !!saved, options: ['gut', 'dream', 'middle', 'keep'].filter(c => c !== 'gut' || r.gut !== null).filter(c => c !== 'dream' || r.dream !== null).map(c => ({ choice: c, value: targetValue(r, c, fraction) })) };
  });
  const totalDelta = out.reduce((s, t) => s + t.deltaMonthly, 0);
  const totalEff = fiEffect(result, totalDelta);
  return { rows: out, total: { deltaMonthly: totalDelta, fiNumberDelta: totalEff.fiNumberDelta, fiMonths: totalEff.months }, fraction };
}
/* The stored target: { choice, cents, actualAt, at, session } */
export function setTarget(record, key, choice, cents, meta) {
  const m = meta || {};
  record.targets = record.targets || {};
  record.targets[key] = { choice, cents, actualAt: m.actualAt === undefined ? null : m.actualAt, at: m.now || new Date().toISOString(), session: m.session || null };
  /* the to-do for next session (MR-050): one per target, on the one-pager list; Keep it as is takes it off */
  record.sun.onepager = record.sun.onepager || {};
  const todos = (record.sun.onepager.todos || []).filter(t => t.target !== key);
  const dollars = c => '$' + Math.round(c / 100).toLocaleString('en-US');
  if (choice !== 'keep' && typeof cents === 'number') todos.push({ task: 'Aim for ' + dollars(cents) + ' a month on ' + (m.label || key).toLowerCase() + (typeof m.actualAt === 'number' ? ' (now ' + dollars(m.actualAt) + ')' : ''), owner: m.owner || 'Client', due: m.due || '', target: key });
  record.sun.onepager.todos = todos;
  return record.targets[key];
}
