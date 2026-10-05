/* Fetches every data/ library by relative path (case-sensitive, works on Pages). */
export const DATA_FILES = ['us-states'];

export async function loadAllData() {
  const out = {};
  await Promise.all(DATA_FILES.map(async name => {
    const res = await fetch('data/' + name + '.json');
    if (!res.ok) throw new Error('could not load data/' + name + '.json');
    out[name.replace(/-(\d+)$/, '$1').replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = await res.json();
  }));
  return out;
}
