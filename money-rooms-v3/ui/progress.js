/* Progress (Level 14, MR-072): the Scoreboard, the charts and numbers
   (Measure), the Map and the one page are one place with four tabs. Every
   old route still works; this bar sits above each of them and names the
   place. */
import { h } from './dom.js';

export const PROGRESS_TABS = [
  ['scoreboard', 'Scoreboard', 'Your scoreboard'],
  ['measure', 'Charts and numbers', 'Charts and numbers'],
  ['map', 'Map', 'How it connects'],
  ['onepager', 'One page', 'Your one page'],
];

export function progressTabs(app, current) {
  const client = app.view === 'client';
  const nav = h('nav', { class: 'progress-tabs', 'aria-label': 'Progress' },
    h('span', { class: 'progress-name' }, client ? 'Your progress' : 'Progress'),
    PROGRESS_TABS.map(([id, coach, who]) => h('a', { href: '#/' + id, 'aria-current': id === current ? 'page' : null }, client ? who : coach)));
  return nav;
}
