// Preferences (layer 13): how this browser shows the app. Saved per browser, read by every page.
// Step 5 fills in the full list (data/preferences.json); this module is the one place that reads and keeps them.

const KEY = 'slam-prefs:v1';
export function prefs() {
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
export function keepPref(id, value) {
  try { const o = { ...prefs(), [id]: value }; localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch { return false; }
}
