// House style for Phase 1 files: no em dashes in code, comments, UI copy or docs,
// and no real household data committed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { SLAM } from './spine-helpers.js';

// Built from the char code so this file holds none.
const EM = String.fromCharCode(0x2014);

const files = [
  // engine/vendor/ holds byte copies of another app's files (S-203), checked for drift, not style.
  ...['engine', 'ui'].flatMap((d) => readdirSync(SLAM + d).filter((f) => f.endsWith('.js') || f.endsWith('.css')).map((f) => d + '/' + f)),
  ...readdirSync(SLAM + 'test').filter((f) => /^(spine-|rules\.|schema\.|eli\.golden|demo\.golden)/.test(f)).map((f) => 'test/' + f),
  'ledger.html', 'dashboard.html', 'plan.html', 'onepager.html', 'spending.html', 'calendar.html', 'windfall.html', 'data/rules-2026.json', 'fixtures/demo.json',
  'CONTRACTS.md', 'BOARD.md', 'QUESTIONS.md', 'DECISIONS.md', 'README.md'
];

test('no em dashes in Phase 1 files', () => {
  for (const f of files) assert.ok(!readFileSync(SLAM + f, 'utf8').includes(EM), f + ' has an em dash');
});

test('the demo household is marked made up', () => {
  const demo = JSON.parse(readFileSync(SLAM + 'fixtures/demo.json', 'utf8'));
  assert.equal(demo.meta.demo, true);
});

// Affordances (CLAUDE.md, S-188): the reference page shows every component, and no button is under 44px.
test('affordances: the reference page shows every component; tap targets are 44px', () => {
  const page = readFileSync(SLAM + 'affordances.html', 'utf8');
  for (const c of ['btn primary', 'btn ghost', 'btn danger', 'btn small', 'is-pressed', 'is-focus', 'disabled', 'row-main', 'edit-hint', 'choice-card', 'check-row', 'switch', 'seg-btn', 'filter-chip', 'chip-missing', 'stage-chip', 'file-banner', 'later-tag', 'month-nav', 'ev-tag', 'wf-step', 'tab-btn', 'window-bar', 'grip', 'pill-locked', 'ev-tap', 'tray-item', 'bonus-chip', 'ms-line', 'pay-fold', 'data-table', 'year-strip', 'clear-tile', 'gantt-bar', 'stack-col', 'card-tile', 'deadline-chip', 'tool-form', 'tool-result', 'missing-row', 'stale-banner', 'safe-big', 'amount-box', 'tag-chip', 'merchant-hint', 'log-list', 'budget-bar', 'hot-chip', 'tiers', 'donut', 'cut-row', 'verdict', 'checkin-grid', 'skip', 'error-banner', 'build-stamp', 'hours-tag', 'ladder', 'letters', 'restore-list', 'diff-list', 'file-row', 'ev-foo', 'happened', 'pill-logged', 'paylater', 'cash-chart', 'cl-legend', 'waiting-list', 'pill-waiting'])
    assert.ok(page.includes(c), 'affordances.html shows ' + c);
  const css = readFileSync(SLAM + 'ui/spine.css', 'utf8');
  assert.match(css, /--tap: 44px/);
  for (const m of css.matchAll(/min-height: (\d+)px/g)) assert.ok(+m[1] >= 44 || /switch-track|knob/.test(css.slice(Math.max(0, m.index - 120), m.index)), 'a min-height of ' + m[1] + 'px: tap targets are 44px');
});
