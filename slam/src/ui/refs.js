// Loads the reference tables from data/ once, for the browser.

const FILES = {
  tax: 'src/data/tax-constants.json',
  benchmarks: 'src/data/benchmarks.json',
  averages: 'src/data/spending-averages.json',
  merchantRules: 'src/data/merchant-rules.json',
  subcategoryIdeas: 'src/data/subcategory-ideas.json',
  eraTemplates: 'src/data/era-templates.json'
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
  ['jordan', 'Jordan, 31, with two imported CSV files'],
  ['riley', 'Riley, 31, a year of the monthly loop'],
  ['dana', 'Dana, 34, owns a condo']
];

// Demo households that come with sample bank files to import.
// [file, account name, account type]: the account is made first, and the file goes into it (S-085).
export const DEMO_CSVS = { jordan: [['jordan-chase.csv', 'Chase card', 'credit-card'], ['jordan-checking.csv', 'Checking', 'checking']] };

export async function loadDemoCSV(file) {
  const res = await fetch('src/data/households/' + file);
  if (!res.ok) throw new Error('Could not load ' + file);
  return res.text();
}

export async function loadDemo(name) {
  const res = await fetch('src/data/households/' + name + '.json');
  if (!res.ok) throw new Error('Could not load demo ' + name);
  return res.json();
}
