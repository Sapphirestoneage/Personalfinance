/* Cost of living (Level 8, MR-045): the tier and the price parities for a
   place, from data/col-tiers.json. City first (metro lookup), then the state,
   then MCOL. A metro's own RPP is used when it exists; the tier is the label
   and the fallback. Pure. */

export function normCity(city) { return String(city || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/,.*$/, ''); }

export function tierOfRpp(all, tiers) {
  const c = tiers.cutPoints;
  if (all >= c.hcolAtOrAbove) return 'HCOL';
  if (all >= c.mcolAtOrAbove) return 'MCOL';
  return 'LCOL';
}

/* tierFor(city, state, tiers) -> { tier, allItems, housing, basis: 'metro' | 'state-nonmetro' | 'state' | 'default', metro, metroLabel, outsideMetro } */
export function tierFor(city, state, tiers) {
  const c = normCity(city);
  const metroId = c ? tiers.cityToMetro[c] : null;
  if (metroId) {
    const m = tiers.metros.find(x => x.id === metroId);
    return { tier: tierOfRpp(m.allItems, tiers), allItems: m.allItems, housing: m.housing, basis: 'metro', metro: m.id, metroLabel: m.label, outsideMetro: false, state: (tiers.cityState && tiers.cityState[c]) || m.state };
  }
  const st = state && tiers.states[state] ? tiers.states[state] : null;
  if (st) {
    /* a named city outside every listed metro reads the state's non-metro parity when there is one */
    if (c && st.nonMetroAllItems) return { tier: tierOfRpp(st.nonMetroAllItems, tiers), allItems: st.nonMetroAllItems, housing: Math.round(st.housing * st.nonMetroAllItems / st.allItems), basis: 'state-nonmetro', metro: null, metroLabel: null, outsideMetro: true };
    return { tier: tierOfRpp(st.allItems, tiers), allItems: st.allItems, housing: st.housing, basis: 'state', metro: null, metroLabel: null, outsideMetro: !!c };
  }
  const avg = tiers.tierAverages.MCOL;
  return { tier: 'MCOL', allItems: avg.allItems, housing: avg.housing, basis: 'default', metro: null, metroLabel: null, outsideMetro: false };
}

/* The multiplier for a spending category at a place: its component parity over 100. */
export function multiplierFor(info, category, tiers) {
  const comp = tiers.componentByCategory[category] || 'allItems';
  const v = info && typeof info[comp] === 'number' ? info[comp] : tiers.tierAverages[(info && info.tier) || 'MCOL'][comp];
  return v / 100;
}

/* The record's tier: an override is the coach's word and stops auto-updates; otherwise inferred from the Sun. */
export function colTierOf(record, tiers) {
  const t = record.colTier;
  if (t && t.source === 'client' && t.tier) return Object.assign({ basis: 'override', outsideMetro: false, allItems: tiers.tierAverages[t.tier].allItems, housing: tiers.tierAverages[t.tier].housing, metro: null, metroLabel: null }, t);
  const city = record.sun.f.city && record.sun.f.city.v; const state = record.sun.f.state && record.sun.f.state.v;
  return Object.assign(tierFor(city, state, tiers), { source: 'inferred' });
}
export function tierLabel(tier, view, tiers) { return (tiers.labels[view === 'client' ? 'client' : 'coach'] || {})[tier] || tier; }
