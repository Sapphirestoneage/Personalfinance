#!/usr/bin/env node
/* ==========================================================================
   tests/tools/build-data-tables.js - writes the lane 2 sourced data tables.
   --------------------------------------------------------------------------
   Lane 2, section 3 (DECISIONS.md L-3). Every cell in the files this
   writes is an object { value, asOf, source, confidence [, note] }: no
   source, no cell. The compact tables below are the hand-kept input; the
   script expands them so a reader of the JSON never has to guess where a
   number came from.

   HOW THE NUMBERS WERE OBTAINED. This session could search the web but
   could not open a page (the egress proxy blocks every fetch), so:
     confidence "sourced"   the figure was read from a search result that
                            quoted the primary source named in `source`
     confidence "recalled"  the figure is from memory of the named source's
                            latest edition, rounded, and carries
                            `verify: true`; the refresh calendar says when
                            and against what to check it
   Nothing here is a product decision: every band is a citation of someone
   else's rule, and every place a choice would be needed says DECIDE:.

   Run:  node tests/tools/build-data-tables.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const TODAY = '2026-09-10';

function cell(value, asOf, source, confidence, extra) {
  const c = { value, asOf, source, confidence };
  if (confidence === 'recalled') c.verify = true;
  return Object.assign(c, extra || {});
}
/* A closed year's figures are settled facts: they cannot go stale, so they
   are marked and tests/data.test.js leaves them out of the 18-month rule. */
function markHistorical(v) {
  if (!v || typeof v !== 'object') return v;
  if (Object.prototype.hasOwnProperty.call(v, 'value') && 'asOf' in v) v.historical = true;
  Object.keys(v).forEach((k) => { if (k !== 'value') markHistorical(v[k]); });
  return v;
}
/* The five new files live under data/lane2/ until shared/reference.js
   registers them (docs/lane2-proposals.md P-5): test/run.js requires every
   data/*.json to be in Reference.TABLE_FILES, and that file is outside
   this lane. states.json is already registered and stays where it is. */
const LANE2 = path.join(DATA, 'lane2');
const IN_ROOT = { 'states.json': true, 'return_bands.json': true, 'bands.json': true, 'tax_brackets.json': true };
function write(name, obj) {
  const dir = IN_ROOT[name] ? DATA : LANE2;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(obj, null, 2) + '\n');
  console.log('wrote ' + path.relative(ROOT, path.join(dir, name)));
}
const SRC = {
  irs2026: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill',
  rp2532: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
  rp2432: 'https://www.irs.gov/pub/irs-drop/rp-24-40.pdf',
  n2567: 'https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500',
  n2480: 'https://www.irs.gov/newsroom/401k-limit-increases-to-23500-for-2025-ira-limit-remains-7000',
  rp2519: 'https://www.irs.gov/pub/irs-drop/rp-25-19.pdf',
  rp2425: 'https://www.irs.gov/pub/irs-drop/rp-24-25.pdf',
  ssaCola2026: 'https://www.ssa.gov/news/press/releases/2025/#10-2025-2',
  ssaWageBase: 'https://www.ssa.gov/oact/cola/cbb.html',
  ssaFra: 'https://www.ssa.gov/benefits/retirement/planner/agereduction.html',
  ssaDelayed: 'https://www.ssa.gov/benefits/retirement/planner/delayret.html',
  irc72t: 'https://www.law.cornell.edu/uscode/text/26/72',
  irc414v: 'https://www.law.cornell.edu/uscode/text/26/414',
  irsRmd: 'https://www.irs.gov/retirement-plans/retirement-plan-and-ira-required-minimum-distributions-faqs',
  secure2: 'https://www.congress.gov/bill/117th-congress/house-bill/2617',
  medicare: 'https://www.medicare.gov/basics/get-started-with-medicare/sign-up/when-does-medicare-coverage-start',
  irsHsaCatchup: 'https://www.irs.gov/publications/p969',
  hhsFpl2026: 'https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines',
  hhsFpl2025: 'https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines/prior-hhs-poverty-guidelines-federal-register-references/2025-poverty-guidelines',
  rp2525: 'https://www.irs.gov/pub/irs-drop/rp-25-25.pdf',
  rp2435: 'https://www.irs.gov/pub/irs-drop/rp-24-35.pdf',
  crsPtc: 'https://www.congress.gov/crs-product/R48290',
  fsaPlans: 'https://studentaid.gov/manage-loans/repayment/plans',
  fsaIdr: 'https://studentaid.gov/manage-loans/repayment/plans/income-driven',
  fsaPslf: 'https://studentaid.gov/manage-loans/forgiveness-cancellation/public-service',
  crsRap: 'https://www.congress.gov/crs-product/IF13075',
  edRap: 'https://edfinancial.studentaid.gov/income-driven-repaymentinformation-center/rap',
  arpa9675: 'https://www.congress.gov/bill/117th-congress/house-bill/1319/text',
  irs529: 'https://www.irs.gov/businesses/small-businesses-self-employed/frequently-asked-questions-on-gift-taxes',
  tfState2026: 'https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/',
  tfPropTax: 'https://taxfoundation.org/data/all/state/property-taxes-by-state-county/',
  ccaPrice: 'https://www.childcareaware.org/price-of-care/',
  bankrateAuto: 'https://www.bankrate.com/insurance/car/states/',
  meric: 'https://meric.mo.gov/data/cost-living-data-series',
  dolSigpros: 'https://oui.doleta.gov/unemploy/statelaws.asp',
  dolSigprosJan2025: 'https://oui.doleta.gov/unemploy/content/sigpros/2020-2029/January2025.pdf',
  dolSigprosJul2025: 'https://oui.doleta.gov/unemploy/content/sigpros/2020-2029/July2025.pdf',
  kffBenchmark: 'https://www.kff.org/affordable-care-act/state-indicator/marketplace-average-benchmark-premiums/',
  dms: 'https://www.ubs.com/global/en/investment-bank/in-focus/global-investment-returns-yearbook.html',
  shiller: 'http://www.econ.yale.edu/~shiller/data.htm',
  damodaran: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html'
};

/* ============================================================================
   1. states.json
   ============================================================================ */
const STATE_NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
const CODES = Object.keys(STATE_NAMES);

/* Income tax: type and top marginal rate for 2026 (Tax Foundation, 2026
   edition, as of 2026-02-11). Brackets themselves live in
   data/state_brackets_2026.json (read by engines/tax.js); this table says
   the type and the top rate and points there, so there is one copy. */
const INCOME_TAX = {
  none: ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'],
  flat: { AZ: 0.025, CO: 0.044, GA: 0.0519, ID: 0.053, IL: 0.0495, IN: 0.0295, IA: 0.038, KY: 0.035, LA: 0.03, MA: 0.05, MI: 0.0425, MS: 0.04, NC: 0.0399, OH: 0.0275, PA: 0.0307, UT: 0.045 },
  brackets: { AL: 0.05, AR: 0.039, CA: 0.133, CT: 0.0699, DE: 0.066, DC: 0.1075, HI: 0.11, KS: 0.0558, ME: 0.0715, MD: 0.0575, MN: 0.0985, MO: 0.047, MT: 0.0565, NE: 0.052, NJ: 0.1075, NM: 0.059, NY: 0.109, ND: 0.025, OK: 0.0475, OR: 0.099, RI: 0.0599, SC: 0.062, VT: 0.0875, VA: 0.0575, WV: 0.0482, WI: 0.0765 }
};
const INCOME_TAX_NOTES = { WA: 'No tax on wages; a 7% tax on long-term capital gains above an indexed threshold (about $270,000) since 2022.', NH: 'The interest and dividends tax ended 2025-01-01.', MA: 'Plus a 4% surtax on income over about $1 million (indexed).', CA: 'Top rate is 12.3% plus the 1% mental health services tax above $1 million.', TN: 'No wage tax; the Hall tax on interest and dividends ended in 2021.' };

/* Effective property tax rate on owner-occupied housing, share of home
   value (Tax Foundation from Census ACS 2023 five-year). */
const PROP_TAX = { AL: 0.0036, AK: 0.0107, AZ: 0.0045, AR: 0.0053, CA: 0.0068, CO: 0.0045, CT: 0.0178, DE: 0.0048, DC: 0.0055, FL: 0.0071, GA: 0.0072, HI: 0.0027, ID: 0.0047, IL: 0.0195, IN: 0.0071, IA: 0.014, KS: 0.0126, KY: 0.0074, LA: 0.0051, ME: 0.0109, MD: 0.0095, MA: 0.0104, MI: 0.0124, MN: 0.01, MS: 0.0067, MO: 0.0088, MT: 0.0069, NE: 0.0144, NV: 0.0044, NH: 0.0161, NJ: 0.0223, NM: 0.0067, NY: 0.014, NC: 0.0063, ND: 0.0097, OH: 0.013, OK: 0.0076, OR: 0.0077, PA: 0.0126, RI: 0.0123, SC: 0.0046, SD: 0.0101, TN: 0.0048, TX: 0.0147, UT: 0.0047, VT: 0.0156, VA: 0.0072, WA: 0.0076, WV: 0.0049, WI: 0.0138, WY: 0.0055 };

/* Average full-coverage auto insurance premium, dollars a year (Bankrate,
   2025 study). */
const AUTO = { AL: 2150, AK: 2400, AZ: 2500, AR: 2300, CA: 2700, CO: 2900, CT: 2100, DE: 2600, DC: 2700, FL: 3900, GA: 2700, HI: 1500, ID: 1300, IL: 2200, IN: 1700, IA: 1600, KS: 2100, KY: 2600, LA: 3400, ME: 1200, MD: 2900, MA: 1900, MI: 3000, MN: 2200, MS: 1900, MO: 2600, MT: 2400, NE: 2000, NV: 3100, NH: 1500, NJ: 2600, NM: 2200, NY: 3900, NC: 1800, ND: 1600, OH: 1400, OK: 2600, OR: 2000, PA: 2300, RI: 2600, SC: 2200, SD: 2100, TN: 1900, TX: 2700, UT: 2200, VT: 1400, VA: 1900, WA: 1900, WV: 2000, WI: 1600, WY: 1700 };

/* Cost of living index, US = 100 (MERIC, 2025 annual average). */
const COL = { AL: 88, AK: 125, AZ: 111, AR: 89, CA: 145, CO: 105, CT: 113, DE: 101, DC: 141, FL: 103, GA: 91, HI: 186, ID: 106, IL: 92, IN: 91, IA: 90, KS: 87, KY: 93, LA: 91, ME: 112, MD: 116, MA: 146, MI: 91, MN: 95, MS: 87, MO: 89, MT: 104, NE: 93, NV: 101, NH: 113, NJ: 114, NM: 94, NY: 123, NC: 96, ND: 92, OH: 94, OK: 86, OR: 115, PA: 96, RI: 112, SC: 95, SD: 93, TN: 90, TX: 93, UT: 104, VT: 115, VA: 101, WA: 116, WV: 87, WI: 96, WY: 96 };

/* State unemployment insurance: maximum weekly benefit (dollars, without
   dependants' allowances) and maximum weeks of regular benefits. DOL
   "Significant Provisions of State UI Laws", January 2025, with the 2025
   changes that were reported since (NY, MI, RI, MA). Variable-duration
   states carry the CURRENT (low-unemployment) maximum and a note. */
const UI = { AL: [275, 14, 'Variable 14 to 20 weeks by state unemployment rate'], AK: [370, 26], AZ: [320, 24, '24 weeks while the state rate is under 5%, else 26'], AR: [451, 12, 'Cut to 12 weeks from 2024'], CA: [450, 26], CO: [812, 26], CT: [780, 26], DE: [450, 26], DC: [444, 26], FL: [275, 12, 'Variable 12 to 23 weeks by state unemployment rate'], GA: [365, 14, 'Variable 14 to 26 weeks by state unemployment rate'], HI: [796, 26], ID: [573, 20, 'Variable 10 to 26 weeks by state unemployment rate'], IL: [605, 26, 'Up to about $826 with dependants'], IN: [390, 26], IA: [651, 16, 'Cut to 16 weeks from 2022'], KS: [640, 16, 'Variable 16 to 26 weeks by state unemployment rate'], KY: [665, 12, 'Variable 12 to 24 weeks by state unemployment rate since 2023'], LA: [275, 12, 'Variable 12 to 20 weeks by state unemployment rate since 2025'], ME: [640, 26], MD: [430, 26], MA: [1105, 30, 'Up to 30 weeks; 26 when a federal extension is on'], MI: [614, 26, 'Raised from $362 and 20 weeks in 2025'], MN: [914, 26], MS: [235, 26], MO: [320, 20], MT: [728, 28], NE: [546, 26], NV: [583, 26], NH: [427, 26], NJ: [875, 26], NM: [653, 26], NY: [869, 26, 'Raised from $504 in October 2025'], NC: [350, 12, 'Variable 12 to 20 weeks by state unemployment rate'], ND: [748, 26], OH: [619, 26, 'Up to about $836 with dependants'], OK: [561, 16], OR: [836, 26], PA: [605, 26], RI: [745, 26, 'From July 2025'], SC: [326, 20], SD: [546, 26], TN: [275, 12, 'Variable 12 to 20 weeks by state unemployment rate since 2023'], TX: [591, 26], UT: [777, 26], VT: [748, 26], VA: [378, 26, 'Variable 12 to 26 weeks by state unemployment rate'], WA: [1079, 26], WV: [662, 26], WI: [370, 26], WY: [595, 26] };

/* ACA benchmark (second-lowest-cost silver) premium for a 40-year-old,
   dollars a month, 2026 plan year (KFF State Health Facts, weighted by
   county plan selections). */
const ACA40 = { AL: 620, AK: 1050, AZ: 560, AR: 550, CA: 590, CO: 560, CT: 720, DE: 610, DC: 560, FL: 620, GA: 590, HI: 590, ID: 540, IL: 620, IN: 480, IA: 640, KS: 640, KY: 620, LA: 700, ME: 620, MD: 460, MA: 560, MI: 500, MN: 460, MS: 650, MO: 640, MT: 640, NE: 720, NV: 560, NH: 325, NJ: 620, NM: 640, NY: 950, NC: 620, ND: 560, OH: 600, OK: 690, OR: 620, PA: 620, RI: 560, SC: 650, SD: 740, TN: 620, TX: 580, UT: 560, VT: 1277, VA: 480, WA: 560, WV: 1100, WI: 680, WY: 1080 };
const ACA_SOURCED = { NH: true, VT: true };
const ACA_NOTES = { NY: 'New York and Vermont community-rate: the premium does not vary by age, so the 40-year-old figure is the adult figure.', VT: 'Community-rated; the highest benchmark in 2026.', NH: 'The lowest benchmark in 2026.' };

function buildStates() {
  const existing = JSON.parse(fs.readFileSync(path.join(DATA, 'states.json'), 'utf8'));
  if (!(existing.states || []).some((s) => /^other$/i.test(s.code))) existing.states = (existing.states || []).concat([{ code: 'OTHER', name: 'Outside the US / other' }]);
  const childcare = JSON.parse(fs.readFileSync(path.join(DATA, 'childcare_by_state.json'), 'utf8'));
  const columns = {
    incomeTax: { label: 'State individual income tax', unit: 'type and top marginal rate as a decimal fraction', source: SRC.tfState2026, asOf: '2026-02-11', note: 'The schedule itself (flat rate or brackets, single filer) is in data/state_brackets_2026.json, the one copy engines/tax.js reads. DECIDE: that file is transcribed from the 2025 edition and says so; the 2026 rate changes this column names (IN, KY, MS, MT, NE, NC, OH, OK) are not yet in it.' },
    propertyTaxEffectiveRate: { label: 'Effective property tax rate on owner-occupied housing', unit: 'share of home value a year', source: SRC.tfPropTax, asOf: '2025-08-01', note: 'Tax Foundation 2025 edition, from the Census ACS 2023 five-year estimates (the newest at that date).' },
    childcareInfantCenterMonthlyCents: { label: 'Median monthly price of centre-based infant care', unit: 'cents a month', source: SRC.ccaPrice, asOf: '2023-12-31', stale: true, note: 'Copied from data/childcare_by_state.json (Child Care Aware, Price of Care 2023 edition), the copy engines/kids.js reads; the two are asserted equal by tests/data.test.js. STALE: the 2024 edition (published 2025) exists and this session could not open it, so the column is older than 18 months and says so. DECIDE: refresh both copies from the 2024 report, and retire that file in favour of this column or keep both in sync.' },
    autoInsuranceFullCoverageAnnualCents: { label: 'Average full-coverage auto insurance premium', unit: 'cents a year', source: SRC.bankrateAuto, asOf: '2025-06-01', note: 'Bankrate 2025 state study, rounded to $100.' },
    costOfLivingIndex: { label: 'Cost of living index', unit: 'US average = 100', source: SRC.meric, asOf: '2025-12-31', note: 'MERIC (Missouri Economic Research and Information Center) 2025 annual average.' },
    uiWeeklyMaxCents: { label: 'State unemployment insurance maximum weekly benefit', unit: 'cents a week, before dependants allowances', source: SRC.dolSigprosJul2025, asOf: '2025-07-01', note: 'DOL Significant Provisions of State UI Laws, July 2025 edition, with the later 2025 increases reported since (MA October, NY October). Benefit formulas differ; this is the cap.' },
    uiMaxWeeks: { label: 'Maximum weeks of regular unemployment benefits', unit: 'weeks', source: SRC.dolSigprosJul2025, asOf: '2025-07-01', note: 'Variable-duration states carry the current low-unemployment maximum and a note with the range.' },
    acaBenchmarkSilver40MonthlyCents: { label: 'ACA benchmark silver premium for a 40-year-old', unit: 'cents a month, before any premium tax credit', source: SRC.kffBenchmark, asOf: '2026-01-01', note: 'KFF State Health Facts, 2026 plan year, county figures weighted by plan selections. National average $625.' }
  };
  const states = CODES.map((code) => {
    const type = INCOME_TAX.none.indexOf(code) >= 0 ? 'none' : (code in INCOME_TAX.flat ? 'flat' : 'brackets');
    const top = type === 'none' ? 0 : (type === 'flat' ? INCOME_TAX.flat[code] : INCOME_TAX.brackets[code]);
    const cc = childcare.states[code];
    const ui = UI[code];
    const row = {
      code, name: STATE_NAMES[code],
      incomeTax: cell({ type, topRate: top, bracketsFile: 'state_brackets_2026.json' }, columns.incomeTax.asOf, SRC.tfState2026, 'recalled', INCOME_TAX_NOTES[code] ? { note: INCOME_TAX_NOTES[code] } : null),
      propertyTaxEffectiveRate: cell(PROP_TAX[code], columns.propertyTaxEffectiveRate.asOf, SRC.tfPropTax, 'recalled'),
      childcareInfantCenterMonthlyCents: cell(cc.monthlyCents, columns.childcareInfantCenterMonthlyCents.asOf, SRC.ccaPrice, 'recalled', { stale: true, note: 'Older than 18 months: 2023 edition, see the column note. DECIDE: refresh from the 2024 report.' }),
      autoInsuranceFullCoverageAnnualCents: cell(AUTO[code] * 100, columns.autoInsuranceFullCoverageAnnualCents.asOf, SRC.bankrateAuto, 'recalled'),
      costOfLivingIndex: cell(COL[code], columns.costOfLivingIndex.asOf, SRC.meric, 'recalled'),
      uiWeeklyMaxCents: cell(ui[0] * 100, columns.uiWeeklyMaxCents.asOf, SRC.dolSigprosJul2025, ['MA', 'MI', 'NY', 'RI', 'WA'].indexOf(code) >= 0 ? 'sourced' : 'recalled', ui[2] ? { note: ui[2] } : null),
      uiMaxWeeks: cell(ui[1], columns.uiMaxWeeks.asOf, SRC.dolSigprosJul2025, ['MA', 'MT', 'NC'].indexOf(code) >= 0 ? 'sourced' : 'recalled', ui[2] ? { note: ui[2] } : null),
      acaBenchmarkSilver40MonthlyCents: cell(ACA40[code] * 100, columns.acaBenchmarkSilver40MonthlyCents.asOf, SRC.kffBenchmark, ACA_SOURCED[code] ? 'sourced' : 'recalled', ACA_NOTES[code] ? { note: ACA_NOTES[code] } : null)
    };
    return row;
  });
  /* Keep the trailing `other` row Start Here renders, if the file has one. */
  const other = (existing.states || []).filter((s) => /^other$/i.test(s.code));
  write('states.json', {
    id: 'states', version: '2.0', asOf: TODAY,
    source: 'USPS two-letter codes for the fifty states and DC; seven data columns per state, each cell carrying its own source and asOf (see `columns`). Lane 2, section 3 (L-3).',
    confidence: 'unverified',
    confidenceNote: 'Most cells are recalled, so the file as a whole is unverified. Each cell says: `sourced` when read from a search result quoting the named primary source, `recalled` (with `verify: true`) when carried from memory of the named source, rounded. The session that wrote this could search but not open pages, so most state cells are recalled. The refresh calendar (docs/data-refresh-calendar.md) says which month to check each column and against what.',
    note: 'Rendered as a select in Start Here (code and name only). Rooms that key on state read a column cell as `states[i].<column>.value`; `other` is for anyone outside the fifty-one and carries no columns.',
    refresh: { month: 'February', against: 'Tax Foundation 2026 state rates (incomeTax), Tax Foundation property tax data (propertyTaxEffectiveRate), Child Care Aware Price of Care (childcare), Bankrate auto study (autoInsurance), MERIC annual index (costOfLivingIndex), DOL Significant Provisions January edition (ui*), KFF benchmark premiums for the new plan year (aca*).' },
    columns,
    states: states.concat(other)
  });
}

/* ============================================================================
   2. milestones.json: the ages
   ============================================================================ */
function buildMilestones() {
  const fra = [
    { bornFrom: 1943, bornTo: 1954, years: 66, months: 0 }, { bornFrom: 1955, bornTo: 1955, years: 66, months: 2 }, { bornFrom: 1956, bornTo: 1956, years: 66, months: 4 },
    { bornFrom: 1957, bornTo: 1957, years: 66, months: 6 }, { bornFrom: 1958, bornTo: 1958, years: 66, months: 8 }, { bornFrom: 1959, bornTo: 1959, years: 66, months: 10 },
    { bornFrom: 1960, bornTo: null, years: 67, months: 0 }
  ];
  const rmd = [
    { bornFrom: null, bornTo: 1950, age: 72, note: 'Born before 1951: RMDs began at 70 and a half (before 2020) or 72 (2020 to 2022).' },
    { bornFrom: 1951, bornTo: 1959, age: 73, note: 'SECURE 2.0 section 107: age 73 for anyone reaching 72 after 2022.' },
    { bornFrom: 1960, bornTo: null, age: 75, note: 'SECURE 2.0 section 107: age 75 for anyone born in 1960 or later (from 2033).' }
  ];
  write('milestones.json', {
    id: 'milestones', version: '1.0', asOf: TODAY,
    source: 'The ages at which US retirement rules change, each with its rule text and primary source. Lane 2, section 3 (L-3).',
    confidence: 'sourced',
    confidenceNote: 'Statute and agency pages, not opinions. The one thing that moves is the Social Security full retirement age table by birth year and the RMD age by birth year, both transcribed here.',
    note: 'Not the savings-multiple milestones (those are data/retirement_milestones.json). Read by nothing yet; section 15.9 of the master build (milestones on every timeline) is the intended reader. Ages are exact years unless `months` says otherwise; 59.5 is stored as years 59, months 6.',
    refresh: { month: 'January', against: 'SECURE 2.0 follow-on legislation (RMD age), the SSA full retirement age page, Medicare enrollment page; the catch-up amounts live in contribution_limits.json, not here.' },
    milestones: [
      { id: 'catchup50', age: { years: 50, months: 0 }, label: 'Catch-up contributions', rule: cell('From the year you turn 50 you may contribute the catch-up amount above the elective deferral limit (401(k), 403(b), most 457(b)) and above the IRA limit. The dollar amounts are in contribution_limits.json.', '2026-01-01', SRC.irc414v, 'sourced', { citation: 'IRC 414(v); IRC 219(b)(5)(B)' }) },
      { id: 'hsaCatchup55', age: { years: 55, months: 0 }, label: 'HSA catch-up', rule: cell('From the year you turn 55 you may add $1,000 a year to an HSA above the self-only or family limit (not indexed).', '2026-01-01', SRC.irsHsaCatchup, 'sourced', { citation: 'IRC 223(b)(3); IRS Publication 969' }) },
      { id: 'ruleOf55', age: { years: 55, months: 0 }, label: 'Rule of 55', rule: cell('Leave the employer in or after the year you turn 55 (50 for qualified public safety employees) and distributions from THAT employer plan (401(k), 403(b)) escape the 10% early withdrawal penalty; IRAs and earlier employers plans do not qualify.', '2026-01-01', SRC.irc72t, 'sourced', { citation: 'IRC 72(t)(2)(A)(v); 72(t)(10) for public safety' }) },
      { id: 'catchup60to63', age: { years: 60, months: 0 }, label: 'Higher catch-up at 60 to 63', rule: cell('For the years you are 60, 61, 62 or 63 the workplace-plan catch-up is the greater of $10,000 (indexed) or 150% of the regular catch-up; at 64 it drops back to the regular amount. Amount in contribution_limits.json.', '2026-01-01', SRC.secure2, 'sourced', { citation: 'SECURE 2.0 Act section 109 (Pub. L. 117-328, Division T)' }) },
      { id: 'penaltyFree', age: { years: 59, months: 6 }, label: '59 and a half', rule: cell('Distributions from IRAs and workplace plans after 59 and a half are not subject to the 10% additional tax on early distributions. Ordinary income tax still applies to pre-tax money.', '2026-01-01', SRC.irc72t, 'sourced', { citation: 'IRC 72(t)(2)(A)(i)' }) },
      { id: 'ssEarly', age: { years: 62, months: 0 }, label: 'Earliest Social Security retirement benefit', rule: cell('Retirement benefits can start at 62, permanently reduced by five ninths of one percent a month for the first 36 months before full retirement age and five twelfths of one percent for each month beyond that (30% at 62 with a full retirement age of 67).', '2026-01-01', SRC.ssaFra, 'sourced', { citation: 'Social Security Act section 202(q); SSA retirement planner' }) },
      { id: 'medicare', age: { years: 65, months: 0 }, label: 'Medicare', rule: cell('Medicare eligibility begins at 65; the initial enrollment period runs from three months before the birthday month to three months after. HSA contributions must stop once Part A begins (retroactive up to six months at enrollment).', '2026-01-01', SRC.medicare, 'sourced', { citation: 'Social Security Act section 226; medicare.gov' }) },
      { id: 'fullRetirementAge', age: null, label: 'Social Security full retirement age', byBirthYear: fra, rule: cell('The age at which the full (unreduced) retirement benefit is payable: 66 for those born 1943 to 1954, rising two months a birth year to 67 for anyone born in 1960 or later.', '2026-01-01', SRC.ssaFra, 'sourced', { citation: 'Social Security Act section 216(l)' }) },
      { id: 'ssDelayed', age: { years: 70, months: 0 }, label: 'Delayed retirement credits stop', rule: cell('Each month a retirement benefit is delayed past full retirement age adds two thirds of one percent (8% a year) until 70; there is no gain from waiting past 70.', '2026-01-01', SRC.ssaDelayed, 'sourced', { citation: 'Social Security Act section 202(w)' }) },
      { id: 'rmd', age: null, label: 'Required minimum distributions', byBirthYear: rmd, rule: cell('Pre-tax IRAs and workplace plans must begin required minimum distributions by April 1 of the year after the year you reach the RMD age (73 for those born 1951 to 1959, 75 for 1960 and later). Roth IRAs and, from 2024, Roth workplace accounts have no lifetime RMD.', '2026-01-01', SRC.irsRmd, 'sourced', { citation: 'IRC 401(a)(9)(C) as amended by SECURE 2.0 section 107' }) }
    ]
  });
}

/* ============================================================================
   3. aca.json: poverty guidelines and the applicable percentage table
   ============================================================================ */
function buildAca() {
  const fpl = (base, per, asOf, source, conf) => ({ base: cell(base, asOf, source, conf), perAdditionalPerson: cell(per, asOf, source, conf), note: 'Household of one is `base`; each additional person adds `perAdditionalPerson`. Guidelines are published each January and govern marketplace coverage for the FOLLOWING plan year (2025 guidelines price 2026 coverage).' });
  const pct2026 = [
    { fromFpl: 0, toFpl: 1.33, from: 0.021, to: 0.021 }, { fromFpl: 1.33, toFpl: 1.5, from: 0.0314, to: 0.0419 }, { fromFpl: 1.5, toFpl: 2.0, from: 0.0419, to: 0.066 },
    { fromFpl: 2.0, toFpl: 2.5, from: 0.066, to: 0.0844 }, { fromFpl: 2.5, toFpl: 3.0, from: 0.0844, to: 0.0996 }, { fromFpl: 3.0, toFpl: 4.0, from: 0.0996, to: 0.0996 }
  ];
  const pct2025 = [
    { fromFpl: 0, toFpl: 1.5, from: 0, to: 0 }, { fromFpl: 1.5, toFpl: 2.0, from: 0, to: 0.02 }, { fromFpl: 2.0, toFpl: 2.5, from: 0.02, to: 0.04 },
    { fromFpl: 2.5, toFpl: 3.0, from: 0.04, to: 0.06 }, { fromFpl: 3.0, toFpl: 4.0, from: 0.06, to: 0.085 }, { fromFpl: 4.0, toFpl: null, from: 0.085, to: 0.085 }
  ];
  const ACA = {
    id: 'aca', version: '2.0', asOf: TODAY,
    source: 'HHS poverty guidelines (2025 and 2026) and the ACA premium tax credit applicable percentage tables for 2025 (enhanced, ARPA/IRA) and 2026 (current law after the enhancement expired). Lane 2, section 3 (L-3).',
    confidence: 'sourced',
    confidenceNote: 'The 2026 guidelines and the 2026 applicable percentages were read from search results quoting HHS and Rev. Proc. 2025-25; the 2025 rows from memory of the same sources (verify: true). The legislative question, whether Congress restores the enhanced credits for 2026, is a fact that can change under this file: `currentLaw.changeDate` says what changed and when.',
    note: 'The older data/aca_2026.json carries a single FPL row and the 2026 table for engines/tax.js; DECIDE: point the engine here and retire that file, or keep both in sync (tests/data.test.js asserts the 2025 base and the top percentage agree).',
    refresh: { month: 'January (poverty guidelines) and August (applicable percentages, Rev. Proc. for the next plan year)', against: 'aspe.hhs.gov poverty guidelines; the IRS revenue procedure under IRC 36B(b)(3)(A)(ii); Congress.gov for any premium tax credit legislation.' },
    fpl: {
      2026: { contiguous: fpl(15960, 5680, '2026-01-15', SRC.hhsFpl2026, 'sourced'), alaska: fpl(19950, 7100, '2026-01-15', SRC.hhsFpl2026, 'sourced'), hawaii: fpl(18360, 6530, '2026-01-15', SRC.hhsFpl2026, 'sourced') },
      2025: { contiguous: fpl(15650, 5500, '2025-01-17', SRC.hhsFpl2025, 'recalled'), alaska: fpl(19550, 6880, '2025-01-17', SRC.hhsFpl2025, 'recalled'), hawaii: fpl(17990, 6330, '2025-01-17', SRC.hhsFpl2025, 'recalled') }
    },
    applicablePercentage: {
      2026: cell(pct2026, '2025-07-18', SRC.rp2525, 'sourced', { note: 'Rev. Proc. 2025-25. Within a band the percentage rises linearly from `from` at `fromFpl` to `to` at `toFpl`. Above 400% of FPL there is no credit (the cliff).', cliffMultiple: 4.0 }),
      2025: cell(pct2025, '2024-08-01', SRC.rp2435, 'recalled', { note: 'The enhanced table under the American Rescue Plan Act as extended by the Inflation Reduction Act: 0% up to 150% of FPL, 8.5% cap with no 400% cliff.', cliffMultiple: null })
    },
    currentLaw: {
      changeDate: cell('2026-01-01', '2026-01-01', SRC.crsPtc, 'sourced', { note: 'The enhanced premium tax credits of 2021 to 2025 expired on 2025-12-31 under current law: for 2026 the pre-ARPA percentage table applies and the 400% of FPL eligibility ceiling returns. CRS R48290. DECIDE: re-check whether legislation has restored the enhancement before relying on the 2026 table.' })
    }
  };
  markHistorical(ACA.fpl[2025]);
  markHistorical(ACA.applicablePercentage[2025]);
  write('aca.json', ACA);
}

/* ============================================================================
   4. studentloans.json: the federal repayment plans
   ============================================================================ */
function buildStudentLoans() {
  const asOf = '2026-07-01';
  const plan = (id, label, fields) => Object.assign({ id, label }, fields);
  const c = (v, extra) => cell(v, asOf, SRC.fsaPlans, 'sourced', extra);
  write('studentloans.json', {
    id: 'studentloans', version: '1.0', asOf: TODAY,
    source: 'Federal Direct Loan repayment plans as of the 2026-07-01 changes under Pub. L. 119-21 (the FY2025 reconciliation act): each plan\'s share of discretionary income, poverty multiplier, forgiveness horizon, PSLF eligibility, and the tax treatment of forgiven balances, with the plan\'s status. Lane 2, section 3 (L-3).',
    confidence: 'sourced',
    confidenceNote: 'Plan mechanics read from studentaid.gov, the CRS product on RAP, and reporting on the 2026 transition as returned by search; the parameters themselves (10% and 15% shares, 150% of FPL, 20 and 25 years, 120 PSLF payments) are stable statute. Status lines move with litigation and rulemaking: `status.asOf` is the date to beat.',
    note: 'data/student_loan_conventions.json holds the SHAPES engines/studentloans.js runs (a level plan, a share-of-discretionary plan, extra on top) with round-number defaults; this file is the current rules those shapes could be fed from. DECIDE: wire the engine to pick a plan here (RAP for loans disbursed from 2026-07-01, IBR before) and keep the conventions file as the fallback.',
    refresh: { month: 'July', against: 'studentaid.gov repayment plan pages (plans open to new borrowers on July 1), the Federal Register for RAP regulations, and the IRC 108(f)(5) sunset on the tax treatment of forgiveness.' },
    pslf: {
      paymentsRequired: c(120, { citation: 'IRC 108(f)(1); 20 U.S.C. 1087e(m)', note: '120 qualifying monthly payments while employed full time by a qualifying public service employer, on a qualifying plan (any IDR plan, RAP, or the 10-year standard).' }),
      forgivenessTaxable: c(false, { note: 'PSLF forgiveness is excluded from federal income under IRC 108(f)(1) with no sunset.' })
    },
    forgivenessTaxTreatment: {
      federal: c('IDR forgiveness (IBR, PAYE, ICR, SAVE) was excluded from federal income for discharges in 2021 through 2025 under ARPA section 9675 (IRC 108(f)(5)); from 2026-01-01 it is taxable income unless Congress extends the exclusion. RAP forgiveness after 30 years is taxable under current law. PSLF stays tax-free.', { source: SRC.arpa9675, citation: 'IRC 108(f)(5) as added by ARPA section 9675' }),
      state: c('States that do not conform to IRC 108(f)(5) may tax forgiven balances in any year; check the state.', { confidence: 'convention' })
    },
    plans: [
      plan('standard', 'Standard (10-year level)', { status: c('open', { note: 'For loans first disbursed before 2026-07-01. Replaced by the Tiered Standard plan for later loans.' }), discretionaryShare: null, povertyMultiplier: null, termYears: c(10), forgivenessYears: null, pslfQualifying: c(true), source: SRC.fsaPlans }),
      plan('tieredStandard', 'Tiered Standard (10 to 25 years by balance)', { status: c('open from 2026-07-01', { note: 'The default for a borrower with any Direct Loan first disbursed on or after 2026-07-01: 10 years under $25,000, 15 years to $50,000, 20 years to $100,000, 25 years above.' }), discretionaryShare: null, povertyMultiplier: null, termYears: c([10, 15, 20, 25]), forgivenessYears: null, pslfQualifying: c(true), source: SRC.crsRap }),
      plan('ibr2009', 'Income-Based Repayment (borrowers before 2014-07-01)', { status: c('open', { note: 'The one legacy income-driven plan that stays open to borrowers with loans disbursed before 2026-07-01.' }), discretionaryShare: c(0.15), povertyMultiplier: c(1.5), forgivenessYears: c(25), pslfQualifying: c(true), source: SRC.fsaIdr }),
      plan('ibr2014', 'Income-Based Repayment (new borrowers from 2014-07-01)', { status: c('open'), discretionaryShare: c(0.10), povertyMultiplier: c(1.5), forgivenessYears: c(20), pslfQualifying: c(true), source: SRC.fsaIdr }),
      plan('paye', 'Pay As You Earn', { status: c('closed to new borrowers from 2026-07-01; ends by 2028-07-01', { note: 'Enrolled borrowers are moved to RAP (if eligible) or IBR at sunset.' }), discretionaryShare: c(0.10), povertyMultiplier: c(1.5), forgivenessYears: c(20), pslfQualifying: c(true), source: SRC.fsaIdr }),
      plan('icr', 'Income-Contingent Repayment', { status: c('closed to new borrowers from 2026-07-01; ends by 2028-07-01'), discretionaryShare: c(0.20), povertyMultiplier: c(1.0), forgivenessYears: c(25), pslfQualifying: c(true), source: SRC.fsaIdr }),
      plan('save', 'Saving on a Valuable Education', { status: c('ended', { note: 'Vacated by a federal court on 2026-03-10 and ended by statute (Pub. L. 119-21); borrowers are being moved to other plans.' }), discretionaryShare: c(0.10, { note: '5% on undergraduate loans was never implemented.' }), povertyMultiplier: c(2.25), forgivenessYears: c(20), pslfQualifying: c(true), source: SRC.fsaIdr }),
      plan('rap', 'Repayment Assistance Plan', { status: c('open from 2026-07-01', { note: 'The one income-driven plan for loans first disbursed from 2026-07-01; also open to earlier Direct Loans.' }), discretionaryShare: c(null, { note: 'RAP is a share of ADJUSTED GROSS INCOME, not discretionary income: 1% of AGI at $10,001 to $20,000, rising one point per $10,000 of AGI to 10% above $100,000; $10 a month minimum; $50 a month off per dependant. Unpaid interest is waived and up to $50 of principal matched each month.' }), agiShare: c({ min: 0.01, max: 0.10, stepPerAgi: 10000, minimumMonthly: 10, perDependantMonthly: 50 }, { source: SRC.edRap }), povertyMultiplier: null, forgivenessYears: c(30, { note: '360 qualifying payments.' }), pslfQualifying: c(true), source: SRC.crsRap })
    ]
  });
}

/* ============================================================================
   5. contribution_limits.json
   ============================================================================ */
function buildContributionLimits() {
  const y26 = (v, extra) => cell(v, '2025-11-13', SRC.n2567, 'sourced', extra);
  const y25 = (v, extra) => cell(v, '2024-11-01', SRC.n2480, 'recalled', extra);
  const h26 = (v) => cell(v, '2025-05-01', SRC.rp2519, 'sourced');
  const h25 = (v) => cell(v, '2024-05-09', SRC.rp2425, 'recalled');
  const gift26 = (v, extra) => cell(v, '2025-10-09', SRC.rp2532, 'sourced', extra);
  const gift25 = (v, extra) => cell(v, '2024-10-22', SRC.rp2432, 'recalled', extra);
  const CL = {
    id: 'contribution_limits', version: '1.0', asOf: TODAY,
    source: 'IRS annual cost-of-living limits for workplace plans, IRAs, HSAs and the gift tax annual exclusion (which sets 529 gifting), current and prior year. Lane 2, section 3 (L-3).',
    confidence: 'sourced',
    confidenceNote: '2026 figures read from search results quoting IRS Notice 2025-67, Rev. Proc. 2025-19 and Rev. Proc. 2025-32; 2025 figures from memory of Notice 2024-80, Rev. Proc. 2024-25 and Rev. Proc. 2024-40 (verify: true).',
    note: 'data/irs_limits_2026.json is the file engines/presets.js reads today (elective401k, ira, hsa, annualAdditions). DECIDE: point it here and retire that file; tests/data.test.js asserts the shared figures agree.',
    unit: 'US dollars a year',
    refresh: { month: 'November (Notice for the next plan year), May (HSA Rev. Proc.), October (gift exclusion in the inflation Rev. Proc.)', against: 'irs.gov newsroom COLA release; Rev. Proc. for HSA limits under IRC 223(g); the annual inflation adjustment Rev. Proc. for IRC 2503(b).' },
    years: {
      2026: {
        elective401k: y26(24500), catchup50Plus: y26(8000), catchup60to63: y26(11250, { note: 'SECURE 2.0 section 109: the higher catch-up for ages 60 to 63.' }),
        annualAdditions415c: y26(72000), compensationLimit401a17: y26(360000), simpleIra: y26(17000), simpleCatchup50Plus: y26(4000),
        ira: y26(7500), iraCatchup50Plus: y26(1100),
        rothPhaseOut: { single: y26([153000, 168000]), head_of_household: y26([153000, 168000]), married_joint: y26([242000, 252000]), married_separate: y26([0, 10000]) },
        traditionalDeductionPhaseOutCovered: { single: y26([81000, 91000]), head_of_household: y26([81000, 91000]), married_joint: y26([129000, 149000]), married_separate: y26([0, 10000]) },
        traditionalDeductionPhaseOutSpouseCovered: { married_joint: y26([242000, 252000]) },
        hsaSelfOnly: h26(4400), hsaFamily: h26(8750), hsaCatchup55Plus: cell(1000, '2026-01-01', SRC.irsHsaCatchup, 'sourced', { note: 'Fixed by statute, IRC 223(b)(3); not indexed.' }),
        giftAnnualExclusion: gift26(19000, { note: 'IRC 2503(b); a 529 contribution is a completed gift, so this is the per-donor, per-beneficiary amount without a gift tax return.' }),
        gift529FiveYearElection: gift26(95000, { note: 'Five times the annual exclusion, elected on Form 709 (IRC 529(c)(2)(B)).' })
      },
      2025: {
        elective401k: y25(23500), catchup50Plus: y25(7500), catchup60to63: y25(11250),
        annualAdditions415c: y25(70000), compensationLimit401a17: y25(350000), simpleIra: y25(16500), simpleCatchup50Plus: y25(3500),
        ira: y25(7000), iraCatchup50Plus: y25(1000),
        rothPhaseOut: { single: y25([150000, 165000]), head_of_household: y25([150000, 165000]), married_joint: y25([236000, 246000]), married_separate: y25([0, 10000]) },
        traditionalDeductionPhaseOutCovered: { single: y25([79000, 89000]), head_of_household: y25([79000, 89000]), married_joint: y25([126000, 146000]), married_separate: y25([0, 10000]) },
        traditionalDeductionPhaseOutSpouseCovered: { married_joint: y25([236000, 246000]) },
        hsaSelfOnly: h25(4300), hsaFamily: h25(8550), hsaCatchup55Plus: cell(1000, '2025-01-01', SRC.irsHsaCatchup, 'sourced'),
        giftAnnualExclusion: gift25(19000), gift529FiveYearElection: gift25(95000)
      }
    }
  };
  markHistorical(CL.years[2025]);
  write('contribution_limits.json', CL);
}

/* ============================================================================
   6. tax_brackets.json
   ============================================================================ */
function buildTaxBrackets() {
  const b26 = (v, extra) => cell(v, '2025-10-09', SRC.rp2532, 'sourced', extra);
  const b25 = (v, extra) => cell(v, '2024-10-22', SRC.rp2432, 'recalled', extra);
  const rates = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
  const table = (tops) => rates.map((r, i) => ({ rate: r, upTo: tops[i] === undefined ? null : tops[i] }));
  const TB = {
    id: 'tax_brackets', version: '1.1', asOf: TODAY,
    source: 'Federal ordinary income brackets, standard deductions, long-term capital gains thresholds, and the FICA and self-employment tax rates and wage bases, current and prior year. Lane 2, section 3 (L-3).',
    confidence: 'sourced',
    confidenceNote: '2026 brackets, deductions and capital gains thresholds read from search results quoting Rev. Proc. 2025-32; the 2026 wage base from the SSA release; 2025 rows from memory of Rev. Proc. 2024-40 and the 2025 SSA release, with the standard deduction as raised by Pub. L. 119-21 (verify: true). Married filing separately rows are the single rows except the top threshold.',
    note: 'The one federal tax table (D-210). shared/reference.js builds the federalBrackets, seTax and effectiveTaxRates views from it for the year TAX_YEAR; no engine reads this file directly. Brackets are the TOP of taxable income taxed at that rate (null = no ceiling). Taxable income = gross minus the standard deduction, nothing else.',
    unit: 'US dollars; rates as decimal fractions',
    refresh: { month: 'October (inflation Rev. Proc. for the next tax year), October (SSA wage base with the COLA release)', against: 'the IRS annual inflation adjustment revenue procedure; ssa.gov/oact/cola/cbb.html.' },
    years: {
      2026: {
        standardDeduction: { single: b26(16100), married_joint: b26(32200), married_separate: b26(16100), head_of_household: b26(24150) },
        brackets: {
          single: b26(table([12400, 50400, 105700, 201775, 256225, 640600])),
          married_joint: b26(table([24800, 100800, 211400, 403550, 512450, 768700])),
          married_separate: b26(table([12400, 50400, 105700, 201775, 256225, 384350])),
          head_of_household: b26(table([17700, 67450, 105700, 201775, 256200, 640600]))
        },
        capitalGains: {
          note: 'Long-term gains and qualified dividends: 0% up to the first threshold of TAXABLE income, 15% up to the second, 20% above. The 3.8% net investment income tax applies above $200,000 (single) / $250,000 (joint) of MAGI, unindexed.',
          single: b26({ zeroUpTo: 49450, fifteenUpTo: 545500 }), married_joint: b26({ zeroUpTo: 98900, fifteenUpTo: 613700 }),
          married_separate: b26({ zeroUpTo: 49450, fifteenUpTo: 306850 }), head_of_household: b26({ zeroUpTo: 66200, fifteenUpTo: 579600 }),
          niit: cell({ rate: 0.038, thresholdSingle: 200000, thresholdJoint: 250000 }, '2026-01-01', 'https://www.irs.gov/individuals/net-investment-income-tax', 'sourced')
        },
        fica: {
          socialSecurityRate: cell(0.062, '2025-10-24', SRC.ssaWageBase, 'sourced', { note: 'Employee share; the employer pays the same.' }),
          socialSecurityWageBase: cell(184500, '2025-10-24', SRC.ssaWageBase, 'sourced'),
          medicareRate: cell(0.0145, '2026-01-01', SRC.ssaWageBase, 'sourced'),
          additionalMedicareRate: cell(0.009, '2026-01-01', 'https://www.irs.gov/businesses/small-businesses-self-employed/questions-and-answers-for-the-additional-medicare-tax', 'sourced', { note: 'On wages and SE income above $200,000 (single), $250,000 (joint), $125,000 (separate); thresholds unindexed.' }),
          selfEmploymentRate: cell(0.153, '2026-01-01', 'https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes', 'sourced', { note: '12.4% Social Security to the wage base plus 2.9% Medicare, on 92.35% of net earnings; half is deductible.' }),
          selfEmploymentNetEarningsFactor: cell(0.9235, '2026-01-01', 'https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes', 'sourced')
          additionalMedicareThresholds: cell({ single: 200000, married_joint: 250000, married_separate: 125000, head_of_household: 200000 }, '2026-01-01', 'https://www.irs.gov/businesses/small-businesses-self-employed/questions-and-answers-for-the-additional-medicare-tax', 'sourced', { note: 'Unindexed statute; combined wages and self-employment earnings.' }),
        }
      },
      2025: {
        standardDeduction: { single: cell(15750, '2025-07-04', 'https://www.congress.gov/bill/119th-congress/house-bill/1', 'recalled', { note: 'Raised by Pub. L. 119-21 from the $15,000 in Rev. Proc. 2024-40.' }), married_joint: cell(31500, '2025-07-04', 'https://www.congress.gov/bill/119th-congress/house-bill/1', 'recalled'), married_separate: cell(15750, '2025-07-04', 'https://www.congress.gov/bill/119th-congress/house-bill/1', 'recalled'), head_of_household: cell(23625, '2025-07-04', 'https://www.congress.gov/bill/119th-congress/house-bill/1', 'recalled') },
        brackets: {
          single: b25(table([11925, 48475, 103350, 197300, 250525, 626350])),
          married_joint: b25(table([23850, 96950, 206700, 394600, 501050, 751600])),
          married_separate: b25(table([11925, 48475, 103350, 197300, 250525, 375800])),
          head_of_household: b25(table([17000, 64850, 103350, 197300, 250500, 626350]))
        },
        capitalGains: {
          single: b25({ zeroUpTo: 48350, fifteenUpTo: 533400 }), married_joint: b25({ zeroUpTo: 96700, fifteenUpTo: 600050 }),
          married_separate: b25({ zeroUpTo: 48350, fifteenUpTo: 300000 }), head_of_household: b25({ zeroUpTo: 64750, fifteenUpTo: 566700 }),
          niit: cell({ rate: 0.038, thresholdSingle: 200000, thresholdJoint: 250000 }, '2025-01-01', 'https://www.irs.gov/individuals/net-investment-income-tax', 'sourced')
        },
        fica: {
          socialSecurityRate: cell(0.062, '2024-10-10', SRC.ssaWageBase, 'sourced'),
          socialSecurityWageBase: cell(176100, '2024-10-10', SRC.ssaWageBase, 'sourced'),
          medicareRate: cell(0.0145, '2025-01-01', SRC.ssaWageBase, 'sourced'),
          additionalMedicareRate: cell(0.009, '2025-01-01', 'https://www.irs.gov/businesses/small-businesses-self-employed/questions-and-answers-for-the-additional-medicare-tax', 'sourced'),
          selfEmploymentRate: cell(0.153, '2025-01-01', 'https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes', 'sourced'),
          selfEmploymentNetEarningsFactor: cell(0.9235, '2025-01-01', 'https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes', 'sourced')
          additionalMedicareThresholds: cell({ single: 200000, married_joint: 250000, married_separate: 125000, head_of_household: 200000 }, '2025-01-01', 'https://www.irs.gov/businesses/small-businesses-self-employed/questions-and-answers-for-the-additional-medicare-tax', 'sourced')
        }
      }
    }
  };
  TB.selfEmployment = {
    note: 'Not indexed by year: the estimated-payment safe harbour shares and the four due dates. Read by engines/selfemployed.js through the seTax view.',
    safeHarbor: cell({ currentYearShare: 0.9, priorYearShare: 1.0, priorYearShareHighIncome: 1.1, highIncomeAgiThreshold: 150000, highIncomeAgiThresholdMarriedSeparate: 75000 }, '2026-01-01', 'https://www.irs.gov/forms-pubs/about-form-1040-es', 'sourced',
      { note: "Estimated payments avoid an underpayment penalty if they cover the lesser of 90% of this year's liability or 100% of last year's; 110% when last year's AGI exceeded the high-income threshold." }),
    quarterlyDueDates: cell(['April 15', 'June 15', 'September 15', 'January 15'], '2026-01-01', 'https://www.irs.gov/forms-pubs/about-form-1040-es', 'sourced')
  };
  markHistorical(TB.years[2025]);
  write('tax_brackets.json', TB);
}

/* ============================================================================
   7. return_bands.json: add the source, keep the values
   ============================================================================ */
function annotateReturnBands() {
  const f = path.join(DATA, 'return_bands.json');
  const t = JSON.parse(fs.readFileSync(f, 'utf8'));
  t.sourceSeries = {
    named: cell('UBS (formerly Credit Suisse) Global Investment Returns Yearbook, Dimson, Marsh and Staunton: US equities 1900 to 2025, annualised real return about 6.6% a year, US bonds about 1.6% real; a 60/40 mix lands near 4.5% to 5% real. Ten-year rolling real returns on US equities (Shiller data, 1871 on) sit near 2% at the 25th percentile of ten-year windows, 6% to 7% at the median and 10% at the 75th.', '2026-03-01', SRC.dms, 'recalled', { window: '1900 to 2025 (Yearbook 2026 edition); 1871 to 2025 (Shiller)', also: [SRC.shiller, SRC.damodaran] }),
    reading: 'The file\'s p50 of 5% real is a 60/40-ish or lower-than-history equity median, not the all-equity 6.6%; p25 of 2% matches the ten-year equity lower quartile; p75 of 8% is below the ten-year equity upper quartile.',
    decide: 'DECIDE: keep 2 / 5 / 8 as deliberately conservative planning bands (they bracket the household\'s 7% nominal, about 5% real, default), or move the median to 6.5% and the upper band to 10% to match the all-equity series. Values are unchanged here; the choice is Eli\'s.'
  };
  t.refresh = { month: 'March', against: 'the new Global Investment Returns Yearbook edition (published each March) for the long-run series; Shiller data for ten-year window percentiles.' };
  t.asOfSource = TODAY;
  fs.writeFileSync(f, JSON.stringify(t, null, 2) + '\n');
  console.log('annotated data/return_bands.json (values unchanged)');
}

/* ============================================================================
   8. bands.json: citations, and the slaf proposal beside Eli's defaults
   ============================================================================ */
function annotateBands() {
  const f = path.join(DATA, 'bands.json');
  const t = JSON.parse(fs.readFileSync(f, 'utf8'));
  const CITE = {
    trench: { book: 'Scott Trench, Set for Life (BiggerPockets, 2017; 2nd ed. 2023)', where: { debt: 'Part I, chapter 2: clear consumer debt before anything else; no lasting share is stated, 5% is a reading.', retirement: 'Part I, chapters 2 to 3: save half of take-home in the first stage.', accommodation: 'Part I, chapter 3: the house hack; housing at a quarter of take-home or less is a reading of the 50% savings target.', food: 'Part I, chapter 2: food as the second controllable line; 12% is a reading, not a stated figure.', transportation: 'Part I, chapter 2: the paid-off economical car; 10% is a reading.', taxes: 'Not addressed as a share; 30% of gross is the app\'s default and says so.', therapy: 'Not addressed; the app\'s default.' } },
    moneyguy: { book: 'Brian Preston and Bo Hanson, The Money Guy Show; Millionaire Mission (2024); the Financial Order of Operations', where: { debt: 'Financial Order of Operations step 3 and the 20/3/8 car rule; a 35% of gross ceiling on all debt is the Money Guy housing-plus-debt reading.', retirement: 'Millionaire Mission chapter 1 and the show\'s standing rule: 25% of gross to retirement.', accommodation: 'The show\'s housing rule: no more than 25% of gross on housing (payment, taxes, insurance).', food: 'Not a Money Guy rule; the app carries the trench reading.', transportation: 'The 20/3/8 rule: 20% down, three-year loan, payment at most 8% of gross.', taxes: 'Not addressed as a share.', therapy: 'Not addressed.' } },
    fiftythirty: { book: 'Elizabeth Warren and Amelia Warren Tyagi, All Your Worth (Free Press, 2005), the 50/30/20 balanced money formula', where: { debt: 'Chapter 2: must-haves at most 50% of take-home, of which debt minimums are a part; 20% is the whole savings-and-debt-paydown share.', retirement: 'Chapter 2: 20% of take-home to savings.', accommodation: 'Chapter 2: housing inside the 50% must-haves; 30% is the common reading of the housing share.', food: 'Chapter 2: groceries inside the 50%; 15% is a reading.', transportation: 'Chapter 2: inside the 50%; 10% is a reading.', taxes: 'Taxes are taken before the formula (it runs on take-home); 30% of gross is the app\'s default.', therapy: 'Not addressed.' } }
  };
  t.citations = {
    note: 'Lane 2, section 3 (L-3): where each source\'s figure comes from. `where` says the chapter or rule; a `reading` is the app\'s interpretation, not a number the source prints.',
    asOf: TODAY,
    trench: cell(CITE.trench.book, TODAY, 'https://store.biggerpockets.com/products/set-for-life', 'recalled', { where: CITE.trench.where }),
    moneyguy: cell(CITE.moneyguy.book, TODAY, 'https://moneyguy.com/financial-order-of-operations/', 'recalled', { where: CITE.moneyguy.where }),
    fiftythirty: cell(CITE.fiftythirty.book, TODAY, 'https://www.simonandschuster.com/books/All-Your-Worth/Elizabeth-Warren/9780743269889', 'recalled', { where: CITE.fiftythirty.where })
  };
  t.slafProposed = { note: 'DECIDE: Eli to set. The lane prompt says copy the trench figure into slaf; test/run.js pins the current slaf retirement row (15% of gross, not converted), so the copy sits here beside the live `slaf` values instead of over them. Every row below is the trench figure with the trench basis.', asOf: TODAY, letters: {} };
  Object.keys(t.letters).forEach((k) => {
    const tr = t.letters[k].sources.trench;
    t.slafProposed.letters[k] = { low: tr.low, high: tr.high, basis: tr.basis || t.letters[k].measure, note: 'DECIDE: Eli to set. Copied from trench.' };
  });
  t.refresh = { month: 'September', against: 'nothing external: these are opinions and readings of books; re-read the DECIDE: lines with Eli once a year.' };
  fs.writeFileSync(f, JSON.stringify(t, null, 2) + '\n');
  console.log('annotated data/bands.json (slaf values unchanged; slafProposed added)');
}

buildStates();
buildMilestones();
buildAca();
buildStudentLoans();
buildContributionLimits();
buildTaxBrackets();
annotateReturnBands();
annotateBands();
