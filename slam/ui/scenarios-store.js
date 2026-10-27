// Saved scenarios (copies of the household's numbers kept in this browser under a name) and which one is the Budget's
// target: one store for the Plan's Saved scenarios and the Budget view. A target is never written into My numbers.

const SCEN_KEY = 'slam-scenarios:v1';
const TARGET_KEY = 'slam-target:v1';
export const readScenarios = () => { try { return JSON.parse(localStorage.getItem(SCEN_KEY) || '[]'); } catch { return []; } };
export const keepScenarios = (list) => { try { localStorage.setItem(SCEN_KEY, JSON.stringify(list)); return true; } catch { return false; } };
// The target: a saved scenario's id, or null (also null when that scenario is gone).
export const targetId = () => { try { const id = localStorage.getItem(TARGET_KEY); return id && readScenarios().some((x) => x.id === id) ? id : null; } catch { return null; } };
export const keepTarget = (id) => { try { if (id) localStorage.setItem(TARGET_KEY, id); else localStorage.removeItem(TARGET_KEY); return true; } catch { return false; } };
export const targetScenario = () => { const id = targetId(); return id ? readScenarios().find((x) => x.id === id) || null : null; };
// Save a copy of the numbers as a new scenario; returns it (or null when the browser will not keep it).
export function saveScenario(name, spine) {
  const entry = { id: 's' + Date.now(), name, savedAt: new Date().toISOString(), spine };
  return keepScenarios([...readScenarios(), entry]) ? entry : null;
}
// Change the target's own copy (a line's amount on the target), never the household.
export function updateScenario(id, fn) {
  const list = readScenarios();
  return keepScenarios(list.map((x) => (x.id === id ? { ...x, spine: fn(x.spine) } : x)));
}
