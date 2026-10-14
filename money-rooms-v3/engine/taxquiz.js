/* The tax questions (MR-097): the yes-or-no questions a tax-return site asks
   before it asks for figures. Each yes points at the room that already holds
   the fact (a deduction or credit row, a debt row, a pay-row field, a
   Household fact), so nothing is typed twice. The answers live in
   record.tax.answers, set whole and journaled (setSection); whether a yes is
   already counted is read from the record, never stored. Pure. */
import { setSection } from './record.js';
import { hasValue } from './states.js';

export function taxAnswersOf(record) { const t = (record && record.tax) || {}; return Object.assign({}, t.answers || {}); }
export function setTaxAnswer(record, id, answer, meta) {
  const next = { answers: taxAnswersOf(record) };
  if (answer === null || answer === undefined) delete next.answers[id]; else next.answers[id] = !!answer;
  return setSection(record, 'tax', next, meta);
}

function rowsOf(record, planet, type) { return ((record.planets[planet] || {}).rows || []).filter(r => r.type === type); }
function fieldOn(r, fid) { return r.f && r.f[fid] && hasValue(r.f[fid]) ? r.f[fid].v : null; }
/* true when the record already carries what a yes asks for */
function counted(record, y) {
  if (!y) return false;
  if (y.kind === 'any') return y.any.some(x => counted(record, x));
  if (y.kind === 'note') return false;
  if (y.kind === 'fact') { const f = record.sun.f[y.field]; if (!f || !hasValue(f)) return false; return y.value !== undefined ? f.v === y.value : (typeof y.min === 'number' ? Number(f.v) >= y.min : true); }
  const rows = rowsOf(record, y.planet, y.type);
  if (y.kind === 'field') return rows.some(r => { const v = fieldOn(r, y.field); return typeof v === 'number' ? v > 0 : v !== null; });
  if (y.kind === 'row') return rows.some(r => !y.field || (y.value !== undefined ? fieldOn(r, y.field) === y.value : (y.in ? y.in.includes(fieldOn(r, y.field)) : true)));
  return false;
}
/* what a tap on "Add it" should create: the first row-shaped target not yet on the record, or null when the yes points at a fact or a note */
function firstAdd(y) {
  if (!y) return null;
  if (y.kind === 'row') return { planet: y.planet, type: y.type, field: y.field || null, value: y.value !== undefined ? y.value : null };
  if (y.kind === 'field') return { planet: y.planet, type: y.type, field: null, value: null };
  if (y.kind === 'any') { for (const x of y.any) { const a = firstAdd(x); if (a) return a; } }
  return null;
}
/* One line per question: the wording for each view, the answer, whether it is already counted, and the next step for a yes. */
export function taxQuiz(record, data) {
  const qs = (data.taxQuestions && data.taxQuestions.questions) || []; const ans = taxAnswersOf(record);
  return qs.map(qd => {
    const done = counted(record, qd.yes); const said = ans[qd.id] === undefined ? null : ans[qd.id];
    /* a yes the record already carries is the answer until the coach says otherwise */
    const answer = said === null && done ? true : said;
    return { id: qd.id, ask: qd.ask, client: qd.client, why: qd.why, answer, said, done, note: qd.yes.kind === 'note',
      next: answer === true && !done ? { label: qd.yes.label, href: qd.yes.href, add: firstAdd(qd.yes) } : null };
  });
}
export function quizCounts(lines) { return { answered: lines.filter(l => l.answer !== null).length, total: lines.length, open: lines.filter(l => l.next && !l.note).length }; }
