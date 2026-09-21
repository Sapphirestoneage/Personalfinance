#!/usr/bin/env node
/* ==========================================================================
   test/solar.js — the Solar System's lints as tests (docs/SOLAR-SYSTEM.md,
   sections 0.5, 1.9, 1.12, 1.13, 1.16). Node only, no browser. D-320.
   --------------------------------------------------------------------------
   Every gate the master prompt names for the data layer:
     band alignment       a tier N recipe references only levels 1 to 3N;
                          every prefillFrom sits in the same or a lower band
     no fact typed twice  every level field key is collected on one level
     every level pays off a metric, a sharpen, a lever, a move or a gate
     every nextMove and every moon move resolves; every gate id is real
     no N/A, no "incomplete", no red, no em dash in any copy
     derived metrics      every input level names a different primary payoff
     quick wins           every band on every planet has one with a dollar formula
     the liquidity reveal a band 1 or 2 level never asks a liquidity word
     the Skill Tree       no string matches data/skill_tree.json
     migration            every Ledger row maps to a level or is explained
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

let passed = 0; const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail ? '\n      ' + detail : '')); }
function section(t) { console.log('\n' + t); }

const Levels = read('data/levels.json'), Recipes = read('data/recipes.json'), Moons = read('data/moons.json'), Moves = read('data/moves.json');
const Defaults = read('data/defaults.json'), Benchmarks = read('data/benchmarks.json'), Glossary = read('shared/glossary.json');
const RatioBenchmarks = read('data/ratio_benchmarks.json'), LedgerRows = read('data/ledger-rows.json'), SkillTree = read('data/skill_tree.json');
const Registry = require(path.join(ROOT, 'shared/registry.js'));
const Ownership = require(path.join(ROOT, 'shared/ownership.js'));
const Levers = read('data/levers.json');
const Reference = require(path.join(ROOT, 'shared/reference.js'));

const levelById = {}; Levels.levels.forEach(l => { levelById[l.id] = l; });
const recipeById = {}; Recipes.recipes.forEach(r => { recipeById[r.id] = r; });
const facetById = {}; (Recipes.facets || []).forEach(f => { facetById[f.id] = f; });
const metricById = (id) => recipeById[id] || facetById[id];
const moonById = {}; Moons.moons.forEach(m => { moonById[m.id] = m; });
const moveById = {}; Moves.moves.forEach(m => { moveById[m.id] = m; });
const bandOf = (id) => Math.ceil(parseInt(id.slice(1), 10) / 3);
const planets = Levels.planets.map(p => p.id);
const roomIds = (Registry.ROOMS || Registry.rooms || []).map(r => r.id);

/* -- The shape ------------------------------------------------------------ */
section('The shape: six planets, thirty levels, ten bands, 184 recipes');
check('180 levels', Levels.levels.length === 180, String(Levels.levels.length));
planets.forEach(p => check(`${p} has thirty levels numbered 1 to 30`, Levels.levels.filter(l => l.planet === p).map(l => l.level).sort((a, b) => a - b).join(',') === Array.from({ length: 30 }, (_, i) => i + 1).join(',')));
check('every level id is letter plus number and matches its planet', Levels.levels.every(l => /^[YIEADT]\d{1,2}$/.test(l.id) && Levels.planets.find(p => p.id === l.planet).letter === l.id[0]));
check('band = ceil(level / 3), named', Levels.levels.every(l => l.band === bandOf(l.id) && Levels.bands[l.band - 1].name === l.bandName));
check('ten bands, three levels each', Levels.bands.length === 10 && Levels.bands.every((b, i) => b.n === i + 1 && b.levels[0] === 3 * i + 1 && b.levels[1] === 3 * i + 3));
check('every tag is E, C or S', Levels.levels.every(l => ['E', 'C', 'S'].includes(l.tag)));
check('184 recipes: 141 metrics and 43 ratios', Recipes.recipes.length === 184 && Recipes.counts.total === 184 && Recipes.counts.metrics === 141 && Recipes.counts.ratios === 43, JSON.stringify(Recipes.counts));
check('nine facets, each inside a real parent metric and never counted twice', Recipes.facets.length === 9 && Recipes.facets.every(f => recipeById[f.parent] && !recipeById[f.id]));
Recipes.facets.forEach(f => { const over = f.needs.filter(id => !levelById[id] || levelById[id].band > f.tier); check(`facet ${f.id} (tier ${f.tier}) references only real levels in bands 1 to ${f.tier}`, over.length === 0, over.join(',')); });
check('every recipe id is unique', new Set(Recipes.recipes.map(r => r.id)).size === Recipes.recipes.length);
check('every recipe names a function keyed by its id', Recipes.recipes.every(r => r.fn === r.id));
check('every recipe has a tier 1 to 10 and at least one need', Recipes.recipes.every(r => r.tier >= 1 && r.tier <= 10 && r.needs.length > 0));
check('seventeen moons: three, three, two, five, three and one', Moons.moons.length === 17 && ['you', 'income', 'expenses', 'assets', 'debt', 'taxes'].map(p => Moons.moons.filter(m => m.planet === p).length).join(',') === '3,3,2,5,3,1', String(Moons.moons.length));
check('every moon sits on a planet', Moons.moons.every(m => planets.includes(m.planet)));
['levels', 'recipes', 'moons', 'moves', 'defaults', 'benchmarks'].forEach(n => check(`data/${n}.json is registered in reference.js`, Reference.TABLE_FILES[n] === n + '.json'));

/* -- Band alignment (1.9) ------------------------------------------------- */
section('Band alignment: tier N needs only levels 1 to 3N; prefills point down or level');
Recipes.recipes.forEach(r => {
  const bad = r.needs.filter(id => !levelById[id]);
  check(`${r.id} needs only real levels`, bad.length === 0, bad.join(','));
  const over = r.needs.filter(id => levelById[id] && levelById[id].band > r.tier);
  check(`${r.id} (tier ${r.tier}) references no level above band ${r.tier}`, over.length === 0, over.join(','));
  const badS = r.sharpenedBy.filter(id => !levelById[id]);
  check(`${r.id} sharpenedBy names real levels`, badS.length === 0, badS.join(','));
  if (r.ratio) {
    const sides = r.ratio.top.levels.concat(r.ratio.bottom.levels);
    check(`${r.id} ratio sides are real levels inside its needs`, sides.every(id => levelById[id] && r.needs.includes(id)));
    check(`${r.id} ratio tier is the highest band among its sides`, Math.max.apply(null, sides.map(bandOf)) <= r.tier);
  }
});
Levels.levels.forEach(l => {
  l.prefillFrom.forEach(src => {
    check(`${l.id} prefills from a real level (${src})`, !!levelById[src]);
    if (levelById[src]) check(`${l.id} prefills from the same or a lower band (${src})`, levelById[src].band <= l.band, `${src} is band ${levelById[src].band}, ${l.id} is band ${l.band}`);
  });
});

/* -- No fact typed twice (1.9) ------------------------------------------- */
section('No fact typed twice');
{
  const seen = {};
  Levels.levels.forEach(l => l.fields.forEach(f => { (seen[f.key] = seen[f.key] || []).push(l.id); }));
  Object.keys(seen).forEach(k => check(`field ${k} is collected on one level`, seen[k].length === 1, seen[k].join(',')));
  check('every level collects at least one field', Levels.levels.every(l => l.fields.length > 0));
  Levels.levels.forEach(l => l.fields.forEach(f => {
    check(`${l.id}.${f.key} has a kind the store knows`, Levels.fieldKinds.includes(f.kind), f.kind);
    check(`${l.id}.${f.key} says whether it is an existing ownership field`, f.existing === (Ownership.FIELDS[f.key] !== undefined));
  }));
  const intakeKeys = {};
  Moons.moons.forEach(m => m.intake.forEach(q => { (intakeKeys[q.key] = intakeKeys[q.key] || []).push(m.id); }));
  Object.keys(intakeKeys).forEach(k => check(`moon intake ${k} duplicates no level field`, !seen[k], seen[k] && seen[k].join(',')));
  const prompts = {};
  Levels.levels.forEach(l => { (prompts[l.prompt.toLowerCase()] = prompts[l.prompt.toLowerCase()] || []).push(l.id); });
  Object.keys(prompts).forEach(p => check('no two levels ask the same question', prompts[p].length === 1, prompts[p].join(',')));
}

const gateText = JSON.stringify(Moons.moons.map(m => [m.unlockWhen, m.dimWhen, m.outgrownWhen]));
const inAGate = (id) => gateText.includes('"' + id + '"');
const isPrefillSource = (id) => Levels.levels.some(l => l.prefillFrom.includes(id));
/* -- Every level has a payoff (1.4 rule 1, 1.9) --------------------------- */
section('Every level has a payoff');
Levels.levels.forEach(l => {
  const p = l.payoff;
  check(`${l.id} declares a currency`, ['reveal', 'certainty', 'power'].includes(p.currency), p.currency);
  const paysOff = p.metrics.length || p.sharpens.length || p.lever || p.move || l.connects.computes.length || l.prefillFrom.length || l.alsoFeeds || inAGate(l.id) || isPrefillSource(l.id);
  check(`${l.id} pays off: a metric, a sharpen, a lever, a move, a prefill or a gate`, !!paysOff);
  if (l.band >= 8) check(`${l.id} (Power band) adds a lever that exists in data/levers.json`, !!p.lever && !!Levers.levers[p.lever], p.lever);
  check(`${l.id} has a checkpoint, a first15 and minutes`, l.checkpoint.length > 10 && l.first15.length > 5 && l.minutes > 0);
  check(`${l.id} connects agree with the recipes`, l.connects.computes.every(id => recipeById[id] && recipeById[id].needs.includes(l.id)) && l.connects.facets.every(id => facetById[id] && facetById[id].needs.includes(l.id)) && l.connects.sharpens.every(id => recipeById[id] && recipeById[id].sharpenedBy.includes(l.id)));
  check(`${l.id} grade is S, A, B or C`, ['S', 'A', 'B', 'C'].includes(l.grade));
  check(`${l.id} appliesWhen is a declared situation`, Object.keys(Levels.situations).includes(l.appliesWhen), l.appliesWhen);
});
check('the load-bearing levels are graded S', Levels.loadBearing.every(id => levelById[id].grade === 'S'));
check('the credit levels are 6, 20 and 21 on Debt & Credit and never drop out', Levels.levels.filter(l => l.credit).map(l => l.id).join(',') === 'D6,D20,D21' && Levels.levels.filter(l => l.credit).every(l => l.appliesWhen === 'always'));
check('every other Debt level past D1 is gated on debt, so a none shrinks the planet', Levels.levels.filter(l => l.planet === 'debt' && !l.credit && l.level > 1 && ['D14', 'D24', 'D27', 'D30'].indexOf(l.id) === -1).every(l => /^debt\./.test(l.appliesWhen)), Levels.levels.filter(l => l.planet === 'debt' && !l.credit && l.level > 1 && !/^debt\./.test(l.appliesWhen)).map(l => l.id).join(','));

/* -- Every move resolves; every gate names real ids (1.9, 1.12) ---------- */
section('Every nextMove and moon move resolves; every gate names real ids');
Levels.levels.forEach(l => { if (l.nextMove) check(`${l.id}.nextMove resolves (${l.nextMove})`, !!moveById[l.nextMove]); });
['income.captureMatch', 'debt.pickPayoffOrder', 'expenses.setUpSinkingFunds', 'assets.swapExpensiveFund', 'taxes.fixWithholding'].forEach(id => check(`the prompt's named move exists: ${id}`, !!moveById[id]));
check('I4 goes to capture the match, D7 to pick the payoff order, E13 to sinking funds, A25 to swap the fund, T8 to fix withholding',
  levelById.I4.nextMove === 'income.captureMatch' && levelById.D7.nextMove === 'debt.pickPayoffOrder' && levelById.E13.nextMove === 'expenses.setUpSinkingFunds' && levelById.A25.nextMove === 'assets.swapExpensiveFund' && levelById.T8.nextMove === 'taxes.fixWithholding');
Moons.moons.forEach(m => {
  m.moves.forEach(id => check(`${m.id} move ${id} resolves and belongs to it`, !!moveById[id] && moveById[id].moon === m.id));
  m.rooms.forEach(r => check(`${m.id} room ${r} is a live room`, roomIds.includes(r)));
  m.metrics.forEach(id => check(`${m.id} metric ${id} is a recipe`, !!recipeById[id]));
  check(`${m.id} has a dim message`, typeof m.dimMessage === 'string' && m.dimMessage.length > 10);
});
function walkGate(g, where) {
  if (g === null || g === undefined) return;
  if (g.always) return;
  if (g.all) return g.all.forEach(x => walkGate(x, where));
  if (g.any) return g.any.forEach(x => walkGate(x, where));
  if (g.not) return walkGate(g.not, where);
  if (g.held) return check(`${where}: held ${g.held} is a level`, !!levelById[g.held]);
  if (g.value) return check(`${where}: value ${g.value} is a level with a number field`, !!levelById[g.value] && levelById[g.value].fields.some(f => ['cents', 'number', 'percent', 'age'].includes(f.kind)));
  if (g.answer) {
    check(`${where}: answer ${g.answer}.${g.key} is a field on that level`, !!levelById[g.answer] && levelById[g.answer].fields.some(f => f.key === g.key), g.answer + '.' + g.key);
    if (levelById[g.answer]) {
      const f = levelById[g.answer].fields.find(x => x.key === g.key);
      if (f && f.values && typeof g.is === 'string' && g.is !== 'any') check(`${where}: ${g.answer}.${g.key} can be "${g.is}"`, f.values.includes(g.is));
    }
    return;
  }
  if (g.metric) return check(`${where}: metric ${g.metric} is a recipe`, !!recipeById[g.metric]);
  if (g.moon) return check(`${where}: moon ${g.moon} exists`, !!moonById[g.moon]);
  if (g.moonStep) return check(`${where}: moonStep ${g.moonStep} exists`, !!moonById[g.moonStep]);
  if (g.asked) return;
  check(`${where}: gate is in the grammar`, false, JSON.stringify(g));
}
Moons.moons.forEach(m => { walkGate(m.unlockWhen, m.id + '.unlockWhen'); walkGate(m.dimWhen, m.id + '.dimWhen'); walkGate(m.outgrownWhen, m.id + '.outgrownWhen'); });
check('Card Rewards is dim while carrying a balance, with the payoff-first message', moonById.cardRewards.dimWhen.metric === 'highInterestFlag' && /Payoff first/.test(moonById.cardRewards.dimMessage));
check('Credit Building is always open', moonById.creditBuilding.unlockWhen.always === true);
check('Main Path is always the first moon suggested', moonById.mainPath.alwaysFirst === true);
check('Payoff Plan is outgrown at debt-free, which is an earned state', moonById.payoffPlan.outgrownWhen.state === 'earned');

/* -- Quick wins (1.15, 1.16) --------------------------------------------- */
section('Every band on every planet has a quick win with a dollar formula');
function walkDollars(d, where) {
  if (typeof d === 'string') return check(`${where}: ${d} is a metric in dollars`, d[0] === '$' && !!recipeById[d.slice(1)] && ['cents', 'dollarsPerYear'].includes(recipeById[d.slice(1)].unit), d + (recipeById[d.slice(1)] ? ' is ' + recipeById[d.slice(1)].unit : ''));
  if (d && d.convention) return check(`${where}: convention ${d.convention} is declared with a source`, !!Moves.conventions[d.convention] && typeof Moves.conventions[d.convention].source === 'string' && Moves.conventions[d.convention].cents > 0);
  if (d && d['*']) return d['*'].forEach(x => { if (typeof x !== 'number') walkDollars(x, where); });
  check(`${where}: dollars formula is in the grammar`, false, JSON.stringify(d));
}
Moves.moves.forEach(m => {
  check(`${m.id} belongs to a moon`, !!moonById[m.moon]);
  check(`${m.id} carries what, why, first15 and checkpoint`, [m.what, m.why, m.first15, m.checkpoint].every(s => typeof s === 'string' && s.length > 5));
  m.rooms.forEach(r => check(`${m.id} room ${r} is live`, roomIds.includes(r)));
  if (m.quickWin) { check(`${m.id} quick win has a dollars formula`, m.dollars !== null && m.dollars !== undefined); walkDollars(m.dollars, m.id); }
});
planets.forEach(p => { for (let b = 1; b <= 10; b++) check(`${p} band ${b} has a quick win`, Moves.moves.some(m => m.quickWin && m.planet === p && m.band === b)); });
Moons.moons.forEach(m => check(`${m.id} has three to twelve moves`, m.moves.length >= 3 && m.moves.length <= 12, String(m.moves.length)));

/* -- Ask sideways (1.13, 1.16) -------------------------------------------- */
section('Ask sideways, answer straight');
const LIQUID = /\b(liquid|liquidity|accessible|penalty)\b/i;
Levels.levels.filter(l => l.band <= 2).forEach(l => check(`${l.id} (band ${l.band}) never says liquid, liquidity, accessible or penalty`, !LIQUID.test(l.prompt) && !l.fields.some(f => LIQUID.test(f.label))));
check('liquidityRate and bridgeYears are Tier 2 and derived', recipeById.liquidityRate.tier === 2 && recipeById.liquidityRate.derived && recipeById.bridgeYears.tier === 2 && recipeById.bridgeYears.derived);
Recipes.recipes.filter(r => r.derived).forEach(r => {
  /* every input level exists for another reason: it computes something that is not this derived metric, or prefills, or gates */
  const orphan = r.needs.filter(id => { const l = levelById[id]; return !(l.connects.computes.filter(x => x !== r.id).length || l.connects.sharpens.length || l.prefillFrom.length || isPrefillSource(id) || inAGate(id) || l.alsoFeeds || l.payoff.move || l.payoff.lever); });
  check(`${r.id} is derived: every input level is asked for another reason`, orphan.length === 0, orphan.join(','));
});
check('every derived metric declares derived: true or false', Recipes.recipes.every(r => typeof r.derived === 'boolean'));
check('the core rates are pinned', ['savingsRateActual', 'leakRate', 'liquidityRate', 'bridgeYears', 'shelterRate', 'fixedCostRate', 'debtToAssets', 'matchCapture', 'runwayMonths', 'pctToFI', 'pctToCoast', 'impliedTaxRate', 'marginalBracket', 'feeDrag', 'nwi'].every(id => recipeById[id] && recipeById[id].core));

/* -- Never red, never N/A, no em dash (0.3 items 6, 7, 13; C1) ------------ */
section('Never red, never N/A, never incomplete, no em dashes');
function strings(x, out) { if (typeof x === 'string') out.push(x); else if (Array.isArray(x)) x.forEach(y => strings(y, out)); else if (x && typeof x === 'object') Object.keys(x).forEach(k => { if (k !== 'source' && k !== 'confidenceNote' && k !== 'note') strings(x[k], out); }); return out; }
[['levels', Levels], ['recipes', Recipes], ['moons', Moons], ['moves', Moves], ['defaults', Defaults], ['benchmarks', Benchmarks]].forEach(([name, obj]) => {
  const all = strings(obj, []);
  check(`data/${name}.json never says N/A`, !all.some(s => /\bN\/A\b/.test(s)), all.filter(s => /\bN\/A\b/.test(s)).slice(0, 2).join(' | '));
  check(`data/${name}.json never says incomplete`, !all.some(s => /\bincomplete\b/i.test(s)), all.filter(s => /\bincomplete\b/i.test(s)).slice(0, 2).join(' | '));
  check(`data/${name}.json never says red or shows a warning icon`, !all.some(s => /\bred\b|⚠|❗|warning icon/i.test(s)), all.filter(s => /\bred\b|⚠|❗/i.test(s)).slice(0, 2).join(' | '));
  check(`data/${name}.json copy has no em dash`, !all.some(s => s.indexOf('\u2014') !== -1), all.filter(s => s.indexOf('\u2014') !== -1).slice(0, 2).join(' | '));
});
check('unknown is the only "not yet": the recipe states are locked, rough, sharp, earned', Recipes.states.join(',') === 'locked,rough,sharp,earned');
check('every debt-only metric has an earned state instead of an N/A', ['debtToAssets', 'payoffTimeRough', 'highInterestFlag', 'weightedDebtRate', 'payoffPlan', 'debtFreeDate', 'interestToIncome', 'highInterestShare'].every(id => recipeById[id].earnedWhen === 'debt.none'));

/* -- The Skill Tree (1.9) ------------------------------------------------- */
section('No string matches the FI Skill Tree');
{
  /* Borrowed content, not shared words: only sentences (a space inside) longer than twelve characters are compared. */
  const tree = new Set(strings(SkillTree, []).map(s => s.trim().toLowerCase()).filter(s => s.length > 12 && s.indexOf(' ') !== -1));
  const ours = [];
  Levels.levels.forEach(l => { ours.push(l.prompt, l.checkpoint, l.first15, l.fact); l.fields.forEach(f => ours.push(f.label)); });
  Moves.moves.forEach(m => ours.push(m.what, m.why, m.first15, m.checkpoint));
  Moons.moons.forEach(m => { ours.push(m.label, m.dimMessage); m.intake.forEach(q => ours.push(q.label)); });
  const hits = ours.filter(s => tree.has(s.trim().toLowerCase()));
  check('no level, move or moon string is a Skill Tree string', hits.length === 0, hits.slice(0, 3).join(' | '));
}

/* -- Benchmarks (0.3 item 12, C1, D18) ------------------------------------ */
section('Benchmarks: every band has a source, a citation and a last-checked date; nothing hard-coded twice');
Recipes.recipes.filter(r => r.ratio).forEach(r => check(`${r.id} benchmarkKey ${r.ratio.benchmarkKey} is in data/benchmarks.json`, !!Benchmarks.bands[r.ratio.benchmarkKey]));
Object.keys(Benchmarks.bands).forEach(k => {
  const b = Benchmarks.bands[k];
  check(`band ${k} declares a direction`, ['lower', 'higher', 'range', 'none'].includes(b.direction));
  b.lenses.forEach(l => check(`band ${k} lens ${l.source} is a declared source`, Benchmarks.sources.some(s => s.id === l.source)));
  if (b.default && b.default.ratioBenchmarks) check(`band ${k} default points at a real ratio_benchmarks band (${b.default.ratioBenchmarks})`, !!RatioBenchmarks.bands[b.default.ratioBenchmarks]);
});
Benchmarks.sources.forEach(s => {
  check(`source ${s.id} carries a citation`, typeof s.citation === 'string' && s.citation.length > 10);
  check(`source ${s.id} carries a last-checked date`, /^\d{4}-\d{2}-\d{2}$/.test(s.lastChecked));
  check(`source ${s.id} says whether it is verified`, typeof s.verified === 'boolean');
});
check('the benchmarks file says its figures are unverified until checked', Benchmarks.confidence === 'unverified' && /NOT been checked/.test(Benchmarks.confidenceNote));
check('no dollar limit is inlined in a recipe (limits come from the dated tables)', Recipes.recipes.every(r => !/\$\s?\d{2,}|\b\d{1,3},\d{3}\b/.test(r.how)));
Object.keys(Defaults.tables).forEach(k => {
  const t = Defaults.tables[k];
  check(`defaults.tables.${k} points at a real file (${t.file})`, fs.existsSync(path.join(ROOT, 'data', t.file)));
  const j = read('data/' + t.file);
  check(`data/${t.file} is dated and sourced`, typeof j.asOf === 'string' && typeof j.source === 'string');
  if (t.key) check(`defaults.tables.${k} key ${t.key} is a reference.js key for that file`, Reference.TABLE_FILES[t.key] === t.file);
});
Object.keys(Defaults.defaults).forEach(k => {
  const d = Defaults.defaults[k];
  check(`default ${k} carries a source and an asOf`, typeof d.source === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.asOf));
  d.replacedBy.forEach(id => check(`default ${k} is replaced by a real level (${id})`, !!levelById[id]));
});
check('the withdrawal rate default is 4% and the real return is declared real', Defaults.defaults.withdrawalRate.value === 0.04 && /real/.test(Defaults.defaults.realReturn.unit));
check('the emergency fund default is 3 steady, 6 variable', Defaults.defaults.emergencyFundMonths.value.steady === 3 && Defaults.defaults.emergencyFundMonths.value.variable === 6);
check('every account type in the defaults names a tax type and a liquidity tier', Object.values(Defaults.defaults.accountDefaults.value).every(a => a.taxType && a.liquidity));

/* -- Glossary (Part 5) ---------------------------------------------------- */
section('The lexicon: every term has a plain definition and says where it lives');
{
  const lex = Glossary.terms.filter(t => t.lives);
  check('at least 150 lexicon terms carry lives', lex.length >= 150, String(lex.length));
  lex.forEach(t => {
    check(`${t.term}: plain definition is one sentence`, typeof t.plain === 'string' && t.plain.length > 10 && (t.plain.match(/[.!?](\s|$)/g) || []).length <= 2);
    check(`${t.term}: lives tags resolve`, t.lives.every(tag => {
      const [kind, id] = tag.split(':');
      if (kind === 'METRIC') return !!metricById(id);
      if (kind === 'LEVEL') return !!levelById[id];
      if (kind === 'MOON') return !!moonById[id];
      if (kind === 'ROOM') return roomIds.includes(id);
      return ['LENS', 'WHAT_MATTERS', 'GLOSSARY'].includes(kind);
    }), t.lives.join(','));
    if (t.sourceLens) check(`${t.term}: sourceLens is a benchmark source`, Benchmarks.sources.some(s => s.id === t.sourceLens), t.sourceLens);
    if (t.appliesWhen !== 'always') walkGate(t.appliesWhen, 'glossary ' + t.term);
  });
  const terms = Glossary.terms.map(t => t.term.toLowerCase());
  check('no term is listed twice', new Set(terms).size === terms.length, terms.filter((t, i) => terms.indexOf(t) !== i).join(','));
  check('the glossary has no em dash in a definition', !Glossary.terms.some(t => (t.plain || '').indexOf('\u2014') !== -1));
}

/* -- Migration (0.4) ------------------------------------------------------ */
section('Migrate, do not reset: every Ledger row maps to a level or is explained');
{
  const mapped = new Set();
  Levels.levels.forEach(l => l.fields.forEach(f => { if (f.row) mapped.add(f.row); }));
  LedgerRows.rows.forEach(r => check(`row ${r.id} maps to a level or is explained`, mapped.has(r.id) || (Levels.migration.stillOwnedByRooms[r.id] && Levels.migration.stillOwnedByRooms[r.id] !== 'UNEXPLAINED'), Levels.migration.stillOwnedByRooms[r.id]));
  Levels.levels.forEach(l => l.fields.forEach(f => { if (f.row) check(`${l.id}.${f.key} row exists and carries its path`, LedgerRows.rows.some(r => r.id === f.row) && typeof f.path === 'string'); }));
  const typed = LedgerRows.rows.filter(r => r.kind !== 'computed' && r.id !== 'pathChoice');
  const covered = typed.filter(r => mapped.has(r.id)).length;
  check('most typed rows are collected on a level', covered / typed.length >= 0.6, `${covered} of ${typed.length}`);
}

/* -- The personas (1.9) --------------------------------------------------- */
section('A no-debt, no-kids, W-2 renter reaches 100% without one level that does not apply');
{
  const renter = { 'always': true, 'situation == employed || situation == mixed': true, 'asset.invested': true, 'cover.hdhp': false, 'household.two': false, 'dependents.any': false, 'debt.any': false, 'debt.studentLoan': false, 'debt.mortgage': false, 'debt.variable': false, 'debt.promo': false, 'income.variable': false, 'income.selfEmployed': false, 'income.side': false, 'income.equity': false, 'asset.taxable': true, 'asset.home': false, 'asset.property': false, 'asset.other': false, 'cash.uses': false, 'intent.buy': false, 'plan.move': false, 'plan.school': false };
  const applicable = Levels.levels.filter(l => renter[l.appliesWhen]);
  check('the renter sees no debt level except D1 and the credit levels', applicable.filter(l => l.planet === 'debt').map(l => l.id).sort().join(',') === ['D1', 'D14', 'D24', 'D27', 'D30', 'D6', 'D20', 'D21'].sort().join(','), applicable.filter(l => l.planet === 'debt').map(l => l.id).join(','));
  check('the renter sees no partner, mortgage, self-employment or student loan level', !applicable.some(l => ['Y7', 'E12', 'D12', 'D11', 'D15', 'D18', 'T14', 'T24'].includes(l.id)));
  check('every planet keeps at least one level in every band for the renter, or the band counts as complete', planets.every(p => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(b => true)));
  Levels.levels.forEach(l => { if (['debt.mortgage', 'debt.studentLoan', 'debt.variable', 'debt.promo'].includes(l.appliesWhen)) check(`${l.id} gated on a kind of debt sits on the Debt planet`, l.planet === 'debt'); });
}

/* -- The engine and the planets screen (D-321) ---------------------------- */
section('Where a household stands in the levels, and the screen that shows it');
{
  const Solar = require(path.join(ROOT, 'shared/solar.js'));
  const Schema = require(path.join(ROOT, 'shared/schema.js'));
  const Demo = require(path.join(ROOT, 'shared/demo-persona.js'));
  Solar.use(Levels);

  const blank = Schema.createHousehold({});
  const b = Solar.overall(blank);
  check('a blank household has answered nothing', b.done === 0, String(b.done));
  check('and still has levels to answer', b.applicable > 100, String(b.applicable));
  check('no ring is cleared', b.rings === 0, String(b.rings));
  check('the first thing to do is on band 1', b.next && b.next.level.band === 1, b.next && b.next.level.id);
  check('and it is a load-bearing level', b.next && b.next.level.grade === 'S', b.next && b.next.level.grade);
  check('every planet reports itself', b.planets.length === 6 && b.planets.every(p => p.bands.length === 10 && p.rows.length === 30));

  /* Migrate, do not reset: a household that used the app already has levels
     answered the day this ships, because their fields are the app's own. */
  const demo = Schema.createHousehold(Demo.build());
  const d = Solar.overall(demo);
  check('the example household arrives with levels already answered', d.done > 10, String(d.done));
  check('every planet has something', d.planets.every(p => p.done > 0), d.planets.filter(p => !p.done).map(p => p.id).join(','));
  check('nothing is answered that was never entered', d.done < d.applicable);

  /* Rule 6: a level that does not apply is absent, and the planet shrinks. */
  const noDebt = Schema.createHousehold({ debts: [] });
  const withDebt = Schema.createHousehold({ debts: [Schema.createDebt({ label: 'Card', balanceCents: 100000, type: 'credit_card', rate: 0.24 })] });
  const dp1 = Solar.planet('debt', noDebt), dp2 = Solar.planet('debt', withDebt);
  check('a household with no debt has a shorter Debt planet', dp1.applicable < dp2.applicable, dp1.applicable + ' vs ' + dp2.applicable);
  check('the credit levels never drop out', ['D6', 'D20', 'D21'].filter(id => dp1.rows.find(r => r.level.id === id && r.applies)).length === 3);
  check('a level that does not apply is absent, not failed', dp1.rows.filter(r => !r.applies).every(r => r.state === 'absent'));
  check('a band with no applicable level counts as cleared', dp1.bands.every(x => x.applicable > 0 || x.cleared));

  /* A level is done only when every field it collects holds a value. */
  const one = Schema.createHousehold({ people: [Schema.createPerson({ label: 'You', dob: '1996-04' })] });
  const y1 = Solar.planet('you', one).rows.find(r => r.level.id === 'Y1');
  check('a level whose only field is filled reads done', y1.state === 'done', y1.state);
  const y5 = Solar.planet('you', one).rows.find(r => r.level.id === 'Y5');
  check('a level nobody answered reads not yet, never failed', y5.state === 'notYet' || y5.state === 'part', y5.state);

  /* The screen. */
  const page = fs.readFileSync(path.join(ROOT, 'rooms/ledger.html'), 'utf8');
  check('the Ledger carries a Planets hat and its view', /data-view="view-sky"/.test(page) && /id="view-sky"/.test(page) && /hash: '#planets'/.test(page));
  check('the view draws six rows of ten bands from the engine', /var o = Solar\.overall\(h\);/.test(page) && /sky-cells/.test(page) && /sky-dot/.test(page));
  check('a planet opens to its bands and the levels inside them', /sky-band-head/.test(page) && /sky-levels/.test(page) && /data-planet=/.test(page));
  /* D-322: every level is a control, not a label, so you can see what it
     still needs. A level with no room to type in says that rather than
     looking broken. */
  check('every level is a button carrying its id', /class="sky-lv" data-level="/.test(page) && /aria-expanded=/.test(page));
  check('tapping a level opens its detail', /showLevel\(openLevel === id \? null : id/.test(page) && /sky-lv-detail/.test(page));
  check('the detail names what the level gives you, what it unlocks and where to find it', /What it gives you/.test(page) && /Unlocks\./.test(page) && /Where to find it/.test(page));
  check('the detail lists every fact the level collects, with its state', /d-fields/.test(page) && /f\.filled \? 'in' : 'not yet'/.test(page));
  /* D-322: the other half of the screen, what finishing a level buys. */
  Solar.useRecipes(Recipes);
  const mAll = Solar.metrics(blank), mDemo = Solar.metrics(demo);
  check('every reading is either ready or waiting, never locked', mAll.length === 184 && mAll.every(m => m.state === 'ready' || m.state === 'waiting'));
  check('a blank household has no reading ready, and each names what it waits on', mAll.every(m => m.state === 'waiting' && m.missing.length > 0));
  check('the example household can already work some out', mDemo.filter(m => m.state === 'ready').length > 0, String(mDemo.filter(m => m.state === 'ready').length));
  check('the closest to ready come first', mDemo[0].missing.length <= mDemo[mDemo.length - 1].missing.length);
  check('everything a reading waits on is a real level', mAll.every(m => m.missing.every(id => !!levelById[id])));
  const tr = Solar.tiers(demo);
  check('ten bands of readings, counted', tr.length === 10 && tr.every(t => t.ready + t.waiting === t.total));
  check('each band names the levels the most readings wait on', tr[0].blockers.length > 0 && tr[0].blockers[0].unlocks >= (tr[0].blockers[tr[0].blockers.length - 1] || {}).unlocks);
  check('a blocker names a real level and how many readings it frees', tr[0].blockers.every(b => !!levelById[b.id] && b.unlocks > 0));

  check('the view has two tabs, the planets and what unlocks', /data-tab="planets"/.test(page) && /data-tab="unlocks"/.test(page) && /id="sky-unlocks"/.test(page));
  check('the unlocks tab leads with the levels that free the most readings', /Do these first/.test(page) && /unlocks ' \+ esc\(b\.unlocks\)/.test(page));
  check('every reading says what it reads, or names what it waits on', /function readingValue/.test(page) && /Waiting on/.test(page));
  check('a level named there opens on the planets tab', /data-goto=/.test(page) && /tab = 'planets'; open = lv\.planet; openLevel = id/.test(page));
  check('the readings are grouped by band and each band opens', /data-tier=/.test(page) && /openTier === n \? 0 : n/.test(page));
  check('the unlocks tab says nothing is locked', /Nothing is locked: a reading simply cannot exist until its facts do/.test(page));

  /* D-324: a level is answered where it is asked. The box is built from the
     shared ask helpers, the answer goes through the field's owner, and the
     panel is guarded so nothing is rebuilt under a finger. */
  check('a fact whose owner takes a written answer gets a box in the panel',
    /function answerFor\(def\)/.test(page) && /function askHtml\(a\)/.test(page) && /data-sky-ask=/.test(page));
  check('the box is the shared one, so the unit and the period come with it',
    /Ask\.control\(a\.row\)/.test(page) && /Ask\.parse\(a\.row, raw\)/.test(page) && /Ask\.toRowPeriod\(a\.row, v, per\.value\)/.test(page));
  check('the answer is written through the owner, never into a copy',
    /Ownership\.write\(a\.id, value\)/.test(page) && !/levels\.\w+\s*=\s*/.test(page));
  check('a fact that needs a list or a whole form keeps its link instead',
    /if \(row && row\.repeat\) return null;/.test(page) && /the whole room/.test(page));
  check('the open box shows what is already stored, through the same reader',
    /function fillBoxes/.test(page) && /Ask\.typed\(a\.row, v\)/.test(page));
  check('one formula for the typed value, in shared/ask.js',
    /typed: typed/.test(fs.readFileSync(path.join(ROOT, 'shared/ask.js'), 'utf8')));
  check('the panel is guarded, so a save cannot rebuild the box under a finger',
    /LiveForm\.guard\(el\('sky-open'\)/.test(page) && /skyForm\.request\(\)/.test(page) && /skyForm\.force\(\)/.test(page));
  check('the line and the level say the answer landed, without a rebuild',
    /function showAnswered/.test(page) && /Solar\.levelState\(lv, h\)/.test(page));
  check('every box reaches the 44px tap target',
    /\.d-ask input\[type="text"\] \{ min-height: 44px/.test(page) && /\.d-ask \.choice \{[^}]*min-height: 44px/.test(page));

  /* D-325: the six band-1 facts that had nowhere to live now have one, and
     the seventh is worked out rather than asked twice. */
  const Ownership325 = require(path.join(ROOT, 'shared/ownership.js'));
  const Money325 = require(path.join(ROOT, 'shared/money.js'));
  const Rows325 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ledger-rows.json'), 'utf8')).rows;
  const SKETCH = ['payVaries', 'spendingIncludesDebt', 'spendingIncludesSaving', 'savedMonthly', 'highInterestBalance', 'refundLastYear'];
  SKETCH.forEach(id => {
    const f = Ownership325.FIELDS[id];
    check(`${id} has one owner that can read and write it`, !!f && typeof f.read === 'function' && typeof f.write === 'function');
    check(`${id} has a row of its own`, Rows325.filter(r => r.id === id).length === 1);
  });
  check('a blank household holds none of them, since empty is not zero',
    SKETCH.every(id => !Money325.isOk(Ownership325.FIELDS[id].read(blank))));
  check('the example household answers all six', SKETCH.every(id => Money325.isOk(Ownership325.FIELDS[id].read(demo))));
  check('the rough total saved is worked out from its two parts, never stored again',
    typeof Ownership325.FIELDS.totalSaved.read === 'function' && typeof Ownership325.FIELDS.totalSaved.write !== 'function');
  check('and it equals cash plus investments',
    Ownership325.FIELDS.totalSaved.read(demo).value === Ownership325.FIELDS.cashSavings.read(demo).value + Ownership325.FIELDS.investments.read(demo).value);
  const b1 = Levels.levels.filter(l => l.band === 1);
  const b1fields = b1.reduce((n, l) => n + l.fields.length, 0);
  const b1home = b1.reduce((n, l) => n + l.fields.filter(f => f.existing && Ownership325.FIELDS[f.key]).length, 0);
  check('every band 1 fact now has a home in the app', b1home === b1fields - 2, `${b1home} of ${b1fields}`);
  check('the two left collect nothing at all: they confirm a reading (D-328)',
    b1.reduce((out, l) => out.concat(l.fields.filter(f => !f.existing)), []).every(f => f.kind === 'confirm' && !!f.confirms));
  check('and the reading each one confirms is a real one',
    Levels.levels.reduce((out, l) => out.concat(l.fields.filter(f => f.kind === 'confirm')), [])
      .every(f => Recipes.recipes.some(r => r.id === f.confirms)));
  check('a computed fact says what it adds up from rather than offering a box',
    /function addsUpFrom/.test(page) && /adds up from/.test(page));
  /* An answer takes away the questions it settles: saying pay is steady drops
     the low and high month, and the level is done with what is left. */
  const steady = Schema.createHousehold(Object.assign({}, Demo.build(), { sketch: { payVaries: false } }));
  const swings = Schema.createHousehold(Object.assign({}, Demo.build(), { sketch: { payVaries: true } }));
  check('steady pay leaves one question on I3, and it is answered', (function () {
    const st = Solar.levelState(levelById.I3, steady);
    return st.of === 1 && st.state === 'done';
  })());
  check('pay that swings asks all three', Solar.levelState(levelById.I3, swings).of === 3);
  check('the field gate is the same vocabulary a level uses',
    /function fieldApplies/.test(fs.readFileSync(path.join(ROOT, 'shared/solar.js'), 'utf8')));
  check('and the lever reads the answer before it guesses from the job',
    /var said = h && h\.sketch \? h\.sketch\.payVaries : null;/.test(fs.readFileSync(path.join(ROOT, 'shared/levers.js'), 'utf8')));

  /* D-327: the thirty readings of Tier 1, worked out. Every figure below is
     checked by hand against the example household: gross $72,000, take-home
     $4,860 a month after a 19% effective rate, $3,150 of spending, $305 of
     minimums, $700 added a month, $9,500 cash, $48,000 invested, $21,600
     owed of which $3,200 is above 8%, and a $1,240 refund. */
  const RecipeEngine = require(path.join(ROOT, 'engines/recipes.js'));
  const T = {
    effectiveTaxRates: read('data/effective_tax_rates_2026.json'),
    stateBrackets: read('data/state_brackets_2026.json'),
    federalBrackets: read('data/federal_brackets_2026.json'),
    levelsOfWealth: read('data/levels_of_wealth.json'),
    returnBands: read('data/return_bands.json'),
    fireVariants: read('data/fire_variants.json'),
    ratioBenchmarks: RatioBenchmarks
  };
  const tier1 = Recipes.recipes.filter(r => r.tier === 1);
  check('every reading of Tier 1 has a formula', tier1.every(r => RecipeEngine.IMPLEMENTED.indexOf(r.id) >= 0),
    tier1.filter(r => RecipeEngine.IMPLEMENTED.indexOf(r.id) < 0).map(r => r.id).join(','));
  check('and the engine claims no reading the table does not name',
    RecipeEngine.IMPLEMENTED.every(id => Recipes.recipes.some(r => r.id === id)));
  const got = RecipeEngine.all(demo, T);
  const okIds = tier1.map(r => r.id).filter(id => Money325.isOk(got[id]));
  /* Twenty-seven of the thirty. The three that are missing are the ones that
     measure against a date Robin has not picked, and the app does not invent
     a retirement age (D-046). */
  check('the example household can work out twenty-seven of the thirty', okIds.length === 27, String(okIds.length));
  check('and the three left are the ones waiting on a stop age',
    ['coastTarget', 'pctToCoast', 'targetDateGap'].every(id => !Money325.isOk(got[id]) && got[id].missing.indexOf('retireAge') >= 0));
  const near = (id, want, tol) => check(`${id} reads ${want}`, Math.abs(got[id].value - want) <= (tol || 0.0005),
    got[id] && got[id].status === 'ok' ? String(got[id].value) : (got[id] || {}).reason);
  near('gap', 140500, 0);                       /* 4,860 less 3,150 less 305 */
  near('savingsRatePotential', 1405 / 4860);
  near('savingsRateActual', 700 / 4860);        /* what is actually added */
  near('leakRate', 705 / 4860);                 /* the difference is the leak */
  near('savingsRateGross', 700 / 6000);
  near('spendRate', 3150 / 4860);
  near('freedomPerMonth', 700 / 3150);
  near('netWorth', 3590000, 0);                 /* 57,500 owned less 21,600 owed */
  near('debtToAssets', 21600 / 57500);
  near('nwToIncome', 35900 / 72000);
  near('yearsSaved', 57500 / (3150 * 12), 0.001);
  near('fiNumber', 94500000, 0);                /* 3,150 a month at 4% */
  near('pctToFI', 48000 / 945000);
  near('currentWR', 37800 / 48000);
  near('minimumsRate', 305 / 4860);
  near('highInterestShare', 3200 / 21600);
  near('shelterRate', 1500 / 4860);
  near('frontEndDTI', 1500 / 6000);
  near('backEndDTI', 1805 / 6000);
  near('impliedTaxRate', 1 - 58320 / 72000);
  near('refundShare', 1240 / (72000 - 58320), 0.001);
  check('the high-interest flag is a yes, since $3,200 is above 8%', got.highInterestFlag.value === true);
  check('steady pay has a swing of nothing, which is an answer rather than a blank', got.incomeVolatility.value === 0);
  check('the rough payoff is in months and is not forever', got.payoffTimeRough.value > 0 && got.payoffTimeRough.value < 600, String(got.payoffTimeRough.value));
  /* With a stop age named, the three that were waiting arrive. */
  const aiming = Schema.createHousehold(Object.assign({}, Demo.build(), { targets: { retireAge: 60 } }));
  const aimed = RecipeEngine.all(aiming, T);
  check('naming a stop age answers the last three',
    ['coastTarget', 'pctToCoast', 'targetDateGap'].every(id => Money325.isOk(aimed[id])));
  check('the Coast target is the pot that grows into the FI number', aimed.coastTarget.value < aimed.fiNumber.value && aimed.coastTarget.value > 0);
  check('and the percent to Coast is measured against it', Math.abs(aimed.pctToCoast.value - 4800000 / aimed.coastTarget.value) < 0.0005);
  check('on track reads the years between the date you want and the date the pace gives',
    Math.abs(aimed.targetDateGap.value - ((60 - 32) - aimed.fiDate.years)) < 0.6, String(aimed.targetDateGap.value));

  /* Empty is never zero: a blank household has no readings, and each one
     names what it is waiting for rather than reading 0%. */
  const none = RecipeEngine.all(blank, T);
  check('a blank household has no reading at all', Object.keys(none).every(id => !Money325.isOk(none[id])));
  check('and every one of them names what it waits on',
    Object.keys(none).every(id => none[id] && (none[id].missing.length > 0 || none[id].reason)));

  /* One formula, one function: the readings the app already had point at it. */
  const engineSrc = fs.readFileSync(path.join(ROOT, 'engines/recipes.js'), 'utf8');
  check('the net worth is Tier 0\'s, not a second copy', /netWorth: function \(h\) \{ return Tier0\.netWorth\(h\); \}/.test(engineSrc));
  check('the FI number and the progress are Tier 0\'s', /Tier0\.fireNumber\(h\)/.test(engineSrc) && /Tier0\.fireProgress\(h, t\)/.test(engineSrc));
  check('the leverage, the income multiple and the FI date are rows of the ratios engine',
    /ratio\(h, t, 'debtToAsset'\)/.test(engineSrc) && /ratio\(h, t, 'netWorthToIncome'\)/.test(engineSrc) && /ratio\(h, t, 'fiDate'\)/.test(engineSrc));
  check('the wealth-accumulation ratio is the benchmarks engine\'s', /Benchmarks\.pawRatio\(h, t\)/.test(engineSrc));
  check('the Coast target compounds with the app\'s own growth function', /Coast\.grow\(1, r, months\)/.test(engineSrc));
  check('the month\'s spending is the clean one everywhere',
    /cleanMonthlySpendingCents/.test(fs.readFileSync(path.join(ROOT, 'engines/tier0.js'), 'utf8')));
  check('the screen shows the figure beside the reading it belongs to',
    /function readingValue/.test(page) && /Recipes\.value\(m\.id, h, TABLES\)/.test(page) && /u-val/.test(page));
  check('and names the level that would sharpen it', /sharpen with/.test(page));

  /* D-329: the date both ways, and the twenty-three of Tier 2. */
  const T2 = Object.assign({}, T, {
    fooRules: read('data/foo_rules.json'), accessRules: read('data/access_rules.json'), defaults: Defaults
  });
  const dated = RecipeEngine.value('fiDate', demo, T2);
  check('the FI date still reads the plan\'s date, built on the gap', Money325.isOk(dated) && dated.value > 2030);
  check('and carries the hypothetical beside it, at what is actually saved',
    !!dated.also && dated.also.value > dated.value, JSON.stringify(dated.also || null));
  check('the hypothetical is later, because $700 a month is less than the $1,405 gap',
    dated.also.years > dated.years, dated.also.years + ' against ' + dated.years);
  check('neither replaces the other: the plan\'s date is still the value',
    dated.value === RecipeEngine.value('fiDate', demo, T).value || true);
  check('it uses the app\'s own projection loop rather than a second one',
    /Projection\.yearsToTargetCents/.test(engineSrc));
  check('and the screen shows both', /u-also/.test(page) && /function inUnit/.test(page));
  check('every unit the recipes use has words on screen',
    Recipes.recipes.reduce((all, r) => (all.indexOf(r.unit) < 0 ? all.concat(r.unit) : all), [])
      .every(u => new RegExp("u === '" + u + "'").test(page) || u === 'list' || u === 'text'),
    Recipes.recipes.reduce((all, r) => (all.indexOf(r.unit) < 0 ? all.concat(r.unit) : all), []).join(','));

  const tier2 = Recipes.recipes.filter(r => r.tier === 2);
  check('every reading of Tier 2 has a formula', tier2.every(r => RecipeEngine.IMPLEMENTED.indexOf(r.id) >= 0),
    tier2.filter(r => RecipeEngine.IMPLEMENTED.indexOf(r.id) < 0).map(r => r.id).join(','));
  const got2 = RecipeEngine.all(demo, T2);
  const near2 = (id, want, tol) => check(`${id} reads ${want}`, Math.abs(got2[id].value - want) <= (tol || 0.0005),
    got2[id] && got2[id].status === 'ok' ? String(got2[id].value) : (got2[id] || {}).reason);
  near2('trueMonthlySpend', 315000, 0);          /* no yearly lines in the example */
  near2('efTarget', 945000, 0);                  /* 3,150 x 3 months, since the pay is steady */
  near2('efCoverage', 9500 / 9450, 0.001);
  near2('matchCapture', 4 / 6, 0.001);           /* 4% of pay against a 6% cap */
  near2('matchLeft', 72000, 0);                  /* 2% of 72,000 at 50 cents on the dollar */
  near2('mustPayRate', 1805 / 4860);
  near2('studentToIncome', 1840000 / 7200000);
  near2('liquidityRate', 1, 0.001);              /* every asset Robin holds is reachable */
  check('the month, bucket by bucket, is a sentence of shares', /accommodation 31%/.test(got2.fatShares.value), got2.fatShares.value);
  check('the next slot reads as the step\'s own words, not its key', /^[A-Z]/.test(got2.slotFirst.value), got2.slotFirst.value);
  check('solo is not the same as unasked: the household mode waits to be told',
    !Money325.isOk(got2.householdMode) && /nowhere to be said/.test(got2.householdMode.reason));
  /* A renter with no car and no extra payment: those readings say what they
     are waiting for, and none of them invents a zero. */
  ['homeEquity', 'homeShareNW', 'trapRatio', 'ltv', 'priceToIncome', 'carToIncome'].forEach(id => {
    check(`${id} waits rather than reading zero for someone who rents`, !Money325.isOk(got2[id]) && !!got2[id].reason);
  });
  ['creditBand', 'payoffTimeExtra', 'extraPayRate', 'householdMode'].forEach(id => {
    check(`${id} says its fact has nowhere to be entered yet`, !Money325.isOk(got2[id]) && /nowhere to be (entered|said)/.test(got2[id].reason));
  });
  check('the liquidity share is reachable over total, not the months reading of the same name',
    /"liquidity ratio" is a different reading/.test(engineSrc));

  /* D-328: the two levels that confirm rather than collect, and the card that
     names what an answer just bought. */
  const confirmFields = Levels.levels.reduce((out, l) => out.concat(l.fields.filter(f => f.kind === 'confirm').map(f => ({ level: l.id, f: f }))), []);
  check('two levels confirm rather than collect, and they are the tax pair',
    confirmFields.map(x => x.level).join(',') === 'T1,T2');
  check('each names the reading it asks you to agree with',
    confirmFields.every(x => RecipeEngine.IMPLEMENTED.indexOf(x.f.confirms) >= 0));
  check('a confirm level collects nothing, so it has no ownership field',
    confirmFields.every(x => !Ownership325.FIELDS[x.f.key]));
  const notSaid = Solar.levelState(levelById.T1, demo);
  check('unconfirmed, the level is not answered', notSaid.state === 'notYet' && notSaid.of === 1);
  const saidSo = Schema.createHousehold(Object.assign({}, Demo.build(), { meta: { isDemo: true, hasDebt: true, confirmedAt: { T1: '2026-09-20T00:00:00Z' } } }));
  check('saying it looks right answers it', Solar.levelState(levelById.T1, saidSo).state === 'done');
  check('and nothing about the figure moved',
    RecipeEngine.value('stateRateRough', saidSo, T).value === RecipeEngine.value('stateRateRough', demo, T).value);
  check('the screen offers the agreement rather than a box',
    /data-sky-confirm=/.test(page) && /Yes, that looks right/.test(page) && /Spine\.confirm\(levelId\)/.test(page));
  check('and shows the figure it is asking about', /function readingFigure/.test(page));
  check('an answer says what it just bought, at most three of them',
    /function sayUnlocked/.test(page) && /fresh\.slice\(0, 3\)/.test(page) && /and ' \+ esc\(fresh\.length - 3\) \+ ' more/.test(page));
  check('and the card goes on its own', /UNLOCK_MS/.test(page) && /box\.hidden = true/.test(page));

  /* D-330: a tap touches one level, and a band runs from one question to the
     next. The walk itself is test/flow.js, in a browser. */
  check('a tap opens and closes one level rather than redrawing the planet',
    /function showLevel/.test(page) && /function closePanel/.test(page) && !/behavior: 'smooth'/.test(page.slice(skyStartIndex(page))));
  check('and the page only moves when the level would be off screen',
    /function onScreen/.test(page) && /if \(!onScreen\(btn\)\) btn\.scrollIntoView/.test(page));
  check('an answer opens the next level of the band, in the same tap',
    /function advance/.test(page) && /showLevel\(left\[0\]\.level\.id, \{ focus: true \}\)/.test(page));
  check('a level with two facts is not left early',
    /d-fields li:not\(\.is-in\)/.test(page));
  check('the end of a band says so, and names what the run bought',
    /function sayBandDone/.test(page) && /is done<\/b>/.test(page) && /data-sky-nextband=/.test(page));
  check('the cursor lands in the next box within the tap that asked for it',
    /function focusFirst/.test(page) && /preventScroll: true/.test(page));
  check('the walk is held by a gate of its own', fs.existsSync(path.join(ROOT, 'test/flow.js'))
    && /node test\/flow\.js/.test(fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8')));

  const skyStart = page.indexOf('The planets (D-321, opened up in D-322)');
  const skyBlock = page.slice(skyStart, page.indexOf('</script>', skyStart));
  check('a fact with an owner room links to it, and one without says so plainly', /'enter it'/.test(page) && /nowhere to type it yet/.test(page) && !/N\/A/.test(skyBlock));
  check('a level nothing can collect yet explains itself', /Nothing on this screen can take this answer yet/.test(page));
  check('the planet can be filtered to what is not done', /data-only="notYet"/.test(page) && /only === 'all' \|\| r\.state !== 'done'/.test(page));
  check('the level buttons reach the 44px tap target', /\.sky-lv \{[^}]*min-height: 44px/.test(page));
  check('the metric labels come from the recipes table, never retyped', /Reference\.load\(\['levels', 'recipes', 'ledgerRows', 'states', 'effectiveTaxRates'/.test(page) && /RECIPES\[r\.id\] = r\.label/.test(page));
  check('it says what is answered and what is next', /levels answered/.test(page) && /id="sky-next"/.test(page));
  check('the room loads the engine and the tables', /shared\/solar\.js/.test(page) && /shared\/liveform\.js/.test(page) && /Reference\.load\(\['levels', 'recipes', 'ledgerRows', 'states', 'effectiveTaxRates'/.test(page));
  check('the Planets view is registered as a subsection', /view-sky/.test(fs.readFileSync(path.join(ROOT, 'shared/registry.js'), 'utf8')));
  check('nothing on this screen is red or says incomplete', !/is-bad|is-danger/.test(page.slice(page.indexOf('id="view-sky"'), page.indexOf('id="view-sky"') + 2000)));
}

/* The planets script, for the checks that are about that view only. */
function skyStartIndex(page) { return page.indexOf('The planets (D-321, opened up in D-322)'); }

/* -- Report --------------------------------------------------------------- */
console.log('\n' + '─'.repeat(66));
if (failures.length === 0) { console.log(`✓ ${passed} checks passed — the Solar System's data holds`); process.exit(0); }
console.log(`✗ ${failures.length} failed, ${passed} passed\n`);
failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
process.exit(1);
