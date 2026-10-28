// The progress tracker (S-265): Plan and Session steps show where you are, what is done, and each step a tap away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('the Plan\'s step screens and the Session\'s steps lead with the stepper', () => {
  assert.match(src('ui/plan.js'), /return \[stepper\(steps, f\.rungs\.indexOf\(r\)\), stepBody\(m, r\)\];/);
  assert.match(src('ui/guide.js'), /stepper\(STEPS\.map\(/);
  const s = src('ui/stepper.js');
  assert.match(s, /'aria-current': i === at \? 'step' : null/);
  assert.match(s, /done: 'done', current: 'you are here', question: 'waiting on an answer', todo: 'not started'/, 'each state in words, not only color');
  assert.match(src('ui/spine.css'), /\.stepper-seg a \{[^}]*min-height: 44px/, 'each segment is a full tap target');
});
