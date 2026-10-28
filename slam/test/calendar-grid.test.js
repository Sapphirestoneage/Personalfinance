// The Calendar as a calendar (overnight Track A): Month first, a Week view, and "Add to my calendar" (an .ics file of
// the bills, paydays and deadlines for 12 months). The household is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { icsEvents, icsText } from '../engine/ics.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const code = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('the .ics file: bills, paydays and deadlines for the next 12 months, one all-day event each', () => {
  const ev = icsEvents(demo(), R, { months: 12 });
  assert.ok(ev.some((e) => e.date === '2026-10-01' && /^Rent -\$1,800$/.test(e.title)));
  assert.ok(ev.some((e) => e.date === '2026-10-15' && /^Salary at Hudson Valley Health \+\$4,211$/.test(e.title)));
  assert.ok(ev.some((e) => /Ask Theo/.test(e.title)), 'the ask to be paid back is a date too');
  assert.ok(ev.every((e) => e.date >= '2026-10-01' && e.date <= '2027-09-30'), 'twelve months from October');
  const text = icsText(ev, { stamp: '20261027T000000Z' });
  assert.match(text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(text, /BEGIN:VEVENT\r\nUID:bill:rent-2026-10-01@slam\r\nDTSTAMP:20261027T000000Z\r\nDTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261002\r\nSUMMARY:Rent -\$1\\,800\r\n/);
  assert.ok(text.split('\r\n').every((l) => l.length <= 75), 'long lines fold');
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, ev.length);
});

test('the Calendar opens on the month grid: chips on a computer, dots on a phone, a tap opens the day, a week view', () => {
  const src = code('ui/calendar.js');
  assert.match(src, /view: VIEWS\.some\(\(\[id\]\) => id === s\.view\) \? s\.view : 'month'/);
  assert.match(src, /function dayChip\(e\)/);
  assert.match(src, /'\+' \+ \(its\.length - CHIPS\) \+ ' more'/);
  assert.match(src, /function weekView\(/);
  // Tapping a day opens its own screen (owner's ask, 2026-10-27); no panel and no Open the day button.
  assert.match(src, /const open = \(\) => \{ setRoot\(\{ day: date \}\); location\.hash = dayHref\(date\); \};/);
  assert.doesNotMatch(src, /Open the day|function dayPanel/);
  assert.match(src, /'Download for your calendar app'/);
  assert.match(src, /const grip = e\.target\.closest\('\.grip, \.chip-grip'\)/, 'a chip drags like a row\'s grip');
});
