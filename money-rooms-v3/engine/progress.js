/* Progress versus paperwork (Level 8, MR-048). Since the last closed session:
   how many journal lines were corrections (we learned the truth), moves (real
   life changed) and paperwork (confidence only); the FI date change from
   corrections alone, with guesses replaced shown separately, from done moves
   and from planned moves (targets). Moves are tagged Forward or Backward by
   their FI date effect. Pure; the view only renders. */
import { fiEffect } from './variance.js';

const num = x => typeof x === 'number' ? x : (x && typeof x === 'object' && 'low' in x ? Math.round((x.low + x.high) / 2) : null);

export function sinceLines(record) {
  const sessions = record.sessions || []; const last = sessions.length ? sessions[sessions.length - 1].at : null;
  return { since: last, lines: record.journal.filter(l => (l.kind === 'set' || l.kind === 'household') && (!last || l.ts > last)) };
}

/* monthlyDeltaOf(line, fields, record): the monthly spending change a set line carries, signed, for spending amounts only */
function monthlyDeltaOf(l, record) {
  if (l.kind !== 'set' || l.column || l.planet !== 'spending' || l.field !== 'amount') return 0;
  const row = record.planets.spending.rows.find(r => r.id === l.rowId);
  if (!row) return 0;
  const o = l.old ? num(l.old.v) : null, n = l.new ? num(l.new.v) : null;
  if (o === null || n === null) return 0;
  const share = row.f.shared && row.f.shared.v && row.f.myShare && typeof row.f.myShare.v === 'number' ? row.f.myShare.v : 1;
  return Math.round((n - o) * share);
}

export function progress(record, result, fields) {
  const { since, lines } = sinceLines(record);
  const counts = { correction: 0, move: 0, paperwork: 0, guessReplaced: 0 };
  let corrDelta = 0, guessDelta = 0, moveDelta = 0;
  const moves = [];
  lines.forEach(l => {
    const why = l.why || null;
    if (why === 'correction') { counts.correction++; const d = monthlyDeltaOf(l, record); if (l.old && l.old.source === 'estimated') { counts.guessReplaced++; guessDelta += d; } else corrDelta += d; }
    else if (why === 'move') { counts.move++; const d = monthlyDeltaOf(l, record); moveDelta += d; moves.push({ line: l, deltaMonthly: d }); }
    else counts.paperwork++;
  });
  const eff = d => result && result.projectionInputs ? fiEffect(result, d) : { months: null, fiNumberDelta: null };
  const planned = Object.keys(record.targets || {}).reduce((s, k) => { const t = record.targets[k]; return s + (typeof t.cents === 'number' && typeof t.actualAt === 'number' ? t.cents - t.actualAt : 0); }, 0);
  const tagged = moves.map(m => { const e = eff(m.deltaMonthly); return Object.assign({}, m, { months: e.months, direction: e.months === null ? 'none' : e.months < 0 ? 'Forward' : e.months > 0 ? 'Backward' : 'Flat', rowId: m.line.rowId, field: m.line.field }); });
  return { since, counts, corrections: eff(corrDelta), guessesReplaced: eff(guessDelta), moves: eff(moveDelta), planned: eff(planned), plannedMonthly: planned, moveList: tagged, correctionMonthly: corrDelta, guessMonthly: guessDelta, moveMonthly: moveDelta };
}

/* Goal progress (MR-048): invested over the FI number, the monthly gap, the FI date, and how many guesses it still includes. Moves independently of completeness. */
export function goalProgress(result) {
  const M = result.metrics; if (!M) return null;
  const inv = result.sun.outputs.invest.investedAssets; const fi = M.fiNumber;
  const req = M.requiredMonthly && M.requiredMonthly.status === 'ok' ? M.requiredMonthly.value.cents : null;
  const contrib = result.projectionInputs ? Math.round((result.projectionInputs.employeeAnnual + result.projectionInputs.employerAnnual) / 12) : null;
  return {
    share: inv && inv.status === 'ok' && fi.status === 'ok' && fi.value.cents > 0 ? Math.round(inv.cents / fi.value.cents * 1000) / 1000 : null,
    invested: inv && inv.status === 'ok' ? inv.cents : null, fiNumber: fi.status === 'ok' ? fi.value.cents : null,
    monthlyGap: req !== null && contrib !== null ? Math.max(0, req - contrib) : null, requiredMonthly: req, contributing: contrib,
    fiDate: M.fiDate.status === 'ok' ? M.fiDate.value.value : null, fiAge: M.fiDate.status === 'ok' && M.fiDate.ages ? M.fiDate.ages.likely : null,
    guesses: result.guesses ? result.guesses.count : 0,
  };
}
