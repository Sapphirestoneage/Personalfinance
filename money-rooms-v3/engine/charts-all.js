/* Every chart in one list (MR-061): the ten from Level 2 and Level 8 in
   chartdata.js and the twenty-two of Part C in chartdata-more.js. The views,
   the unlock loop and the one-pager read this list, never the halves. The
   seven of the Scoreboard (MR-063) sit in chartdata-score.js. */
import { CHARTS } from './chartdata.js';
import { MORE_CHARTS } from './chartdata-more.js';
import { SCORE_CHARTS } from './chartdata-score.js';
import { CALC_CHARTS } from './chartdata-calc.js';

const PLANET_OF = { sankey: 'income', netWorth: 'invest', balanceSheet: 'invest', debtRace: 'debt', runway: 'safety', fiGauge: 'life', draftt: 'spending', waterfall: 'invest', taxes: 'taxes' };
export const ALL_CHARTS = CHARTS.map(c => Object.assign({ planet: PLANET_OF[c.id] || 'life' }, c)).concat(MORE_CHARTS, SCORE_CHARTS, CALC_CHARTS); /* Level 13 (MR-067): the ten calculator charts */
export function chartDef(id) { return ALL_CHARTS.find(c => c.id === id) || null; }
/* the stage and the metrics behind a chart: the registry entry, or the Level 2 map in data/unlocks.json */
export function chartMeta(id, data) { const def = chartDef(id); if (def && def.stage) return { stage: def.stage, metrics: def.metrics || [] }; const m = data && data.unlocks && data.unlocks.charts[id]; return m || { stage: 5, metrics: [] }; }
/* the eight hero charts of the Overview, in order; a locked one gives its place to the next */
export const HERO_ORDER = ['netWorth', 'sankey', 'fiLadderLines', 'milestones', 'spendingTreemap', 'paycheckWaterfall', 'debtCompared', 'runwayStaircase', 'fiGauge', 'netWorthStacked', 'tornado', 'coastCurve'];
