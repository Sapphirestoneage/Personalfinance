/* test/rooms/skill-tree.js — the Skill Tree engine: four states and not-yours, every
   lock says why, boosts open and never award, warps reveal and never award, fog. D-131. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Demo, TABLES } = t;
  const ST = require(path.join(ROOT, 'engines/skilltree.js'));
  const Spine = require(path.join(ROOT, 'shared/spine-v2.js'));
  section('The Skill Tree (D-131): household in, per-skill state and reason out');

  const T = TABLES;
  const tree = T.skillTree, links = T.skillLinks, ex = T.exercises;
  checkTrue('the three tables are loaded and stamped', tree && links && ex && tree.version && tree.confidence && links.version && ex.version);
  check('five bands in order', tree.bands.map(b => b.id).join(','), 'foundation,optimization,advanced,expert,endgame');
  checkTrue('the seed holds the skills the spec names for the cross links', ['read-plan-summary', 'tax-loss-harvesting', 'close-a-month'].every(id => ST.byId(T, id)));
  const ids = new Set(tree.skills.map(s => s.id));
  checkTrue('every prerequisite names a skill that exists', tree.skills.every(s => (s.prereqs || []).every(p => ids.has(p))));
  checkTrue('every skill has an unlock row: a node with an empty one fails the build', tree.skills.every(s => (s.unlocks || []).length > 0));
  checkTrue('every exercise advances a skill that exists, and every micro has a room', ex.exercises.every(e => e.advances.length && e.advances.every(id => ids.has(id))) && ex.exercises.filter(e => e.kind === 'micro').every(e => e.room));
  checkTrue('every canon exercise credits a work and an author', ex.exercises.filter(e => e.kind === 'canon').every(e => e.origin && e.origin.work && e.origin.author));
  check('the twelve runs and the thirteen canon exercises are there', ex.exercises.filter(e => e.kind === 'run').length + '/' + ex.exercises.filter(e => e.kind === 'canon').length, '12/13');

  /* A bare employed household: nothing done, some open, the rest locked with a reason. */
  const employed = () => Schema.createHousehold({ filingStatus: 'single', state: 'NC',
    people: [Schema.createPerson({ id: 'P', role: 'adult', employmentStatus: 'employed', incomeSources: [Schema.createIncomeSource({ id: 'i', personId: 'P', grossAnnualIncomeCents: 7200000 })] })],
    assets: [Schema.createAsset({ id: 'a', category: 'cash', valueCents: 400000 })], expenses: { monthlyEssential: { estimatedValueCents: 250000 } } });
  const r = ST.evaluate(employed(), T, { snapshots: 0 });
  checkTrue('the tree always evaluates', Money.isOk(r));
  check('a W-2 household never sees the self-employment skill, in any count', r.byId['quarterly-estimates'] + '/' + r.counts.notYours, 'undefined/1');
  checkTrue('a self-employed household does', !!ST.evaluate(Schema.createHousehold({ people: [Schema.createPerson({ id: 'P', role: 'adult', employmentStatus: 'selfEmployed' })] }), T).byId['quarterly-estimates']);
  checkTrue('nothing is done on a fresh household', r.counts.done === 0);
  checkTrue('some skills are open from the start', r.counts.open > 0 && r.byId['enter-the-facts'].state === 'open');
  const locked = r.skills.filter(s => s.state === 'locked');
  checkTrue('every locked skill says why, with a link', locked.length > 0 && locked.every(s => s.reasons.length > 0 && s.reasons.every(x => /^Locked\./.test(x.text) && x.href)));
  check('a skill prerequisite reads as one', r.byId['capture-the-match'].reasons.map(x => x.kind).join(','), 'skill,ladder');
  checkTrue('… naming the skill and linking to it', /Needs: Enter the facts\./.test(r.byId['capture-the-match'].reasons[0].text) && r.byId['capture-the-match'].reasons[0].href === '#skill-enter-the-facts');
  const ladderReason = r.byId['know-your-number'].reasons.filter(x => x.kind === 'ladder')[0];
  checkTrue('a ladder gate says the step, and that you are not placed yet', !!ladderReason && /Opens at FOO step 1\. You are not placed on the ladder yet\./.test(ladderReason.text) && ladderReason.href === 'foo-ladder.html');
  check('a household threshold says what you have', r.byId['close-a-month'].reasons.filter(x => x.kind === 'household')[0].text, 'Locked. Needs one closed month in the ledger. You have 0.');
  checkTrue('… and links to the room that unlocks it', r.byId['close-a-month'].reasons.filter(x => x.kind === 'household')[0].href === 'budget.html#close');
  /* No locked skill is unreachable: every reason is a skill that is yours, a ladder step, or a threshold. */
  checkTrue('no locked skill is unreachable', locked.every(s => s.reasons.every(x => x.kind !== 'skill' || r.byId[x.skill])));

  /* Fog. */
  check('Foundation is in full, Optimization half lit, the rest fogged', r.bands.map(b => b.visibility).join(','), 'full,dim,fogged,fogged,fogged');
  checkTrue('a fogged skill carries no name, no proof, no chips', r.skills.filter(s => s.state === 'fogged').every(s => s.name === null && s.proof === null && s.unlocks.length === 0));
  checkTrue('a half-lit skill has its name but no chips', r.skills.filter(s => s.dim).every(s => s.name && s.unlocks.length === 0));
  checkTrue('a full-band skill has chips with hrefs', r.skills.filter(s => s.band === 'foundation').every(s => s.unlocks.length > 0 && s.unlocks.every(c => c.href)));
  checkTrue('… and its first fifteen minutes', r.byId['enter-the-facts'].firstAction && r.byId['enter-the-facts'].firstAction.minutes === 15);

  /* Boosts: something the household did moves a skill to open, never to done. */
  const hb = employed();
  hb.ledger.months = [Schema.createMonthRecord({ month: '2026-08', estimated: {}, actual: { expenses: 100000 } })];
  const rb = ST.evaluate(hb, T);
  check('closing a month moves the ledger skill from locked to open, by boost', rb.byId['close-a-month'].state + '/' + rb.byId['close-a-month'].provenance, 'open/boost');
  checkTrue('… and it is still not done', rb.byId['close-a-month'].state !== 'done' && rb.counts.done === 0);
  checkTrue('… the boost bar is partly filled: one of the two things that boost it', rb.byId['close-a-month'].boost.fraction > 0 && rb.byId['close-a-month'].boost.fraction < 1 && rb.byId['close-a-month'].boost.met.join(',') === 'monthClosed');
  const hl = employed();
  for (let i = 0; i < 30; i++) hl.expenses.entries.push(Schema.createExpenseEntry({ id: 'l' + i, categoryId: 'groceries', amountCents: 100, period: 'once', date: '2026-09-0' + ((i % 9) + 1), source: 'log' }));
  check('thirty dated expenses boost the tracking skill open', ST.evaluate(hl, T).byId['log-thirty'].state, 'open');
  check('… twenty-nine do not', (function () { const h = employed(); for (let i = 0; i < 29; i++) h.expenses.entries.push(Schema.createExpenseEntry({ id: 'l' + i, categoryId: 'groceries', amountCents: 100, period: 'once', date: '2026-09-01', source: 'log' })); return ST.evaluate(h, T).byId['log-thirty'].state; })(), 'locked');
  const hx = employed(); hx.exercises = { done: { 'mx-know-your-number': '2026-09-01' }, results: {} };
  checkTrue('a completed exercise counts as an event', ST.evaluate(hx, T).events.exercisesDone === 1);

  /* Done is stored, and only done. */
  const hd = employed(); hd.skillTree = { state: { 'enter-the-facts': { state: 'done', on: '2026-09-01', by: 'self' }, 'track-a-month': { state: 'open' } } };
  const rd = ST.evaluate(hd, T);
  check('a stored done is done, with its day', rd.byId['enter-the-facts'].state + '/' + rd.byId['enter-the-facts'].doneOn, 'done/2026-09-01');
  check('a stored non-done is dropped by the constructor', Object.keys(Schema.createSkillTree(hd.skillTree).state).join(','), 'enter-the-facts');
  check('… and a prerequisite met opens what it gated', rd.byId['read-plan-summary'].state, 'open');

  /* Warps: a proof reveals a skip; it never awards. */
  const hw = employed(); hw.assets = [Schema.createAsset({ id: 'a', category: 'cash', valueCents: 2500000 })];
  const rw = ST.evaluate(hw, T);
  const cushion = rw.warps.filter(w => w.id === 'warp-cushion')[0];
  check('ten months of spending in cash activates the cushion warp', cushion.active, true);
  check('… the branch reads as bypassed, not done', rw.byId['starter-fund'].state + '/' + rw.byId['starter-fund'].provenance + '/' + rw.counts.done, 'bypassed/warp/0');
  checkTrue('… a bypassed skill satisfies what it gated', rw.byId['cover-checkup'].state === 'bypassed' && rw.byId['term-life'].reasons.every(x => x.skill !== 'cover-checkup'));
  checkTrue('… and stays reopenable: a stored done still wins', (function () { hw.skillTree = { state: { 'starter-fund': { state: 'done', on: '2026-09-02', by: 'self' } } }; return ST.evaluate(hw, T).byId['starter-fund'].state === 'done'; })());
  check('four months of spending in cash does not', ST.evaluate(employed(), T).warps.filter(w => w.id === 'warp-cushion')[0].active, false);
  const hm = employed(); hm.ledger.months = []; for (let i = 1; i <= 12; i++) hm.ledger.months.push(Schema.createMonthRecord({ month: '2025-' + (i < 10 ? '0' : '') + i, estimated: {}, actual: { expenses: 100000 } }));
  check('twelve closed months warp past the tracking branch', ST.evaluate(hm, T).byId['read-the-variance'].state, 'bypassed');

  /* The ladder both ways. */
  const hdone = employed(); hdone.skillTree = { state: { 'read-plan-summary': { state: 'done', on: '2026-09-01', by: 'self' } } };
  checkTrue('the ladder’s needs are listed by step, and only the unmet ones', r.ladderNeeds['3'] && r.ladderNeeds['3'].indexOf('read-plan-summary') >= 0 && !ST.evaluate(hdone, T).ladderNeeds['3']);
  checkTrue('a skill the ladder opens is gated on the step', links.fooUnlocks['8'].indexOf('tax-loss-harvesting') >= 0 && ST.byId(T, 'tax-loss-harvesting').gate.foo === 8);
  const demo = Demo.build();
  const rdemo = ST.evaluate(demo, T);
  checkTrue('the demo household is placed on the ladder, so a ladder gate compares steps', Money.isEntered(rdemo.fooStep) && rdemo.skills.filter(s => s.state === 'locked').some(s => s.reasons.some(x => /You are on step \d/.test(x.text))));

  /* What opens next: at most three, open, from the lowest band first. */
  checkTrue('next-open is three open skills from the band you are in', r.nextOpen.length === 3 && r.nextOpen.every(s => s.state === 'open' && s.band === 'foundation'));

  /* The spine's one write. */
  Spine.reset();
  Spine.setSkillDone('enter-the-facts', '2026-09-03', 'self');
  check('done is stored with the day and how', JSON.stringify(Spine.getProfile().skillTree.state['enter-the-facts']), '{"state":"done","on":"2026-09-03","by":"self"}');
  Spine.setSkillDone('enter-the-facts', false);
  check('… and reopened', Spine.getProfile().skillTree.state['enter-the-facts'], undefined);
  Spine.markExercise('run-fire-number', '2026-09-03', { fireNumberCents: 100 });
  check('an exercise done keeps its result', Spine.getProfile().exercises.done['run-fire-number'] + '/' + Spine.getProfile().exercises.results['run-fire-number'].fireNumberCents, '2026-09-03/100');
  Spine.markExercise('run-fire-number', false);
  check('… and can be undone', Object.keys(Spine.getProfile().exercises.done).length, 0);
  Spine.reset();

  /* ---- Acceptance checks (the spec's §11), the ones a static read can hold ---- */
  section('The Skill Tree rooms, the wiring and the version (D-131)');
  const page = fs.readFileSync(path.join(ROOT, 'rooms/skill-tree.html'), 'utf8');
  checkTrue('the board declares its live-form policy', /LIVE-FORM: built once/.test(page));
  checkTrue('every node carries its reason in its title, and a fogged node renders no name', /title="' \+ esc\(title\)/.test(page) && /s\.state === 'fogged' \? '' : '<span class="n-name">/.test(page));
  checkTrue('the fortress line renders above the board', page.indexOf('id="ladder"') < page.indexOf('id="board"') && /id="rungs"/.test(page));
  checkTrue('the card is the only way to mark done, through the spine', (page.match(/Spine\.setSkillDone\(/g) || []).length === 2 && !/skillTree\.state\[[^\]]*\] *=/.test(page));
  checkTrue('a bypassed branch stays reopenable: the card offers mark done for it', /s\.state === 'done' \? '<button[^']*data-reopen/.test(page));
  checkTrue('the phone gets the serpentine, one tree at a time', /class="serp"/.test(page) && /window\.innerWidth <= 700/.test(page));
  checkTrue('no band beyond the next one prints a name: the engine blanks it and the room draws a silhouette', /s\.name = null|name: fog && !o\.reveal \? null/.test(fs.readFileSync(path.join(ROOT, 'engines/skilltree.js'), 'utf8')));
  const exPage = fs.readFileSync(path.join(ROOT, 'rooms/exercises.html'), 'utf8');
  checkTrue('the exercises room completes and runs through the spine, nothing else', (exPage.match(/Spine\.markExercise\(/g) || []).length === 3 && /Exercises\.compute\(/.test(exPage));
  const stacker = fs.readFileSync(path.join(ROOT, 'rooms/stacker.html'), 'utf8');
  const skillsEngine = fs.readFileSync(path.join(ROOT, 'engines/skills.js'), 'utf8');
  checkTrue('the Stacker reads done from the tree and writes it there, no second copy', /treeDone\(household, skill\.id\)/.test(skillsEngine) && /skillTree: treePatch\(/.test(skillsEngine) && /skillTree: v\.skillTree/.test(stacker));
  const dash = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  checkTrue('dashboard block 3 reads the next skill from the tree engine, beside learn and unlearn', /SLAF\.SkillTree\.evaluate\(/.test(dash) && /id="learn-skill"/.test(dash) && /engines\/skilltree\.js/.test(dash));
  /* Versioning: one string, everywhere. */
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
  check('version.json is major.minor', /^\d+\.\d+$/.test(version.version), true);
  check('… and matches the schema constant every footer and export prints', version.version, Schema.APP_VERSION);
  checkTrue('every room footer prints it through the progress strip', /Money Rooms v' \+ g\.SLAF\.Schema\.APP_VERSION/.test(fs.readFileSync(path.join(ROOT, 'shared/progress.js'), 'utf8')));
  checkTrue('every export and share code is stamped with it', /appVersion: Schema\.APP_VERSION/.test(fs.readFileSync(path.join(ROOT, 'shared/spine-v2.js'), 'utf8')));
  Spine.reset();
  check('… as the export object shows', Spine.exportObject ? Spine.exportObject().appVersion : Schema.APP_VERSION, Schema.APP_VERSION);
  /* The Stacker's mark-done writes the tree. */
  const Skills = require(path.join(ROOT, 'engines/skills.js'));
  const hs = Demo.build();
  const md = Skills.markDone(hs, 'know-your-number', T, '2026-09-05');
  checkTrue('a once-skill marked done in the Stacker lands in the tree, by self', Money.isOk(md) && md.value.skillTree.state['know-your-number'].state === 'done' && md.value.skillTree.state['know-your-number'].by === 'self');
  checkTrue('… and the Stacker record keeps only its provenance', md.value.skills['know-your-number'].state !== 'done' && md.value.skills['know-your-number'].verifiedBy === 'self');
  hs.skillTree = md.value.skillTree; hs.skills = md.value.skills;
  check('the tree reads it as done', ST.evaluate(hs, T).byId['know-your-number'].state + '/' + ST.evaluate(hs, T).byId['know-your-number'].provenance, 'done/self');
  const hl2 = Demo.build(); hl2.skills = { 'starter-fund': { state: 'done', kind: 'once', verifiedBy: 'household', verifiedOn: '2026-08-01' } };
  check('a household saved before D-131 still reads its Stacker done, by proof', ST.evaluate(hl2, T).byId['starter-fund'].state + '/' + ST.evaluate(hl2, T).byId['starter-fund'].provenance, 'done/proof');
};
