// Loads the reference tables from data/ once, for the browser.

const FILES = {
  tax: 'data/tax-constants.json',
  benchmarks: 'data/benchmarks.json',
  averages: 'data/spending-averages.json',
  merchantRules: 'data/merchant-rules.json',
  subcategoryIdeas: 'data/subcategory-ideas.json',
  eraTemplates: 'data/era-templates.json'
};

export async function loadRefs() {
  const entries = await Promise.all(Object.entries(FILES).map(async ([k, path]) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Could not load ' + path);
    return [k, await res.json()];
  }));
  return Object.fromEntries(entries);
}

export const DEMO_HOUSEHOLDS = [
  ['maya', 'Maya, 26, NYC renter with a roommate'],
  ['luis', 'Luis, 33, Ohio, W-2 plus side hustle'],
  ['tasha', 'Tasha, 29, Texas, gross pay only'],
  ['sam', 'Sam, 24, between jobs, one total'],
  ['jordan', 'Jordan, 31, with two imported CSV files']
];

// Demo households that come with sample bank files to import.
export const DEMO_CSVS = { jordan: [['jordan-chase.csv', 'Chase card'], ['jordan-checking.csv', 'Checking']] };

export async function loadDemoCSV(file) {
  const res = await fetch('test/households/' + file);
  if (!res.ok) throw new Error('Could not load ' + file);
  return res.text();
}

export async function loadDemo(name) {
  const res = await fetch('test/households/' + name + '.json');
  if (!res.ok) throw new Error('Could not load demo ' + name);
  return res.json();
}
