// Month close. A closed month is a locked snapshot of estimate and actual per
// line and category. The snapshot is never edited; late entries go into a
// separate "revised" record next to it.

export function nextMonthKey(key) {
  let [y, m] = key.split('-').map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return y + '-' + String(m).padStart(2, '0');
}

// snapshot comes from calc (monthSnapshot) so the store never does math.
export function closeMonth(doc, snapshot, nowIso) {
  const key = doc.currentMonth;
  if (doc.months.some((m) => m.key === key)) throw new Error('Month ' + key + ' is already closed');
  doc.months.push({ key, closedAt: nowIso, snapshot: deepFreezeCopy(snapshot), revised: { lines: {} } });
  doc.months.sort((a, b) => (a.key < b.key ? -1 : 1));
  doc.currentMonth = nextMonthKey(key);
  return key;
}

// Record a late actual for one line of a closed month. The original stays as it was.
export function reviseMonth(doc, key, lineId, amount, nowIso) {
  const rec = doc.months.find((m) => m.key === key);
  if (!rec) throw new Error('Month ' + key + ' is not closed');
  if (!rec.snapshot.lines[lineId]) throw new Error('Line ' + lineId + ' was not in month ' + key);
  rec.revised.lines[lineId] = { amount, at: nowIso };
}

function deepFreezeCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}
