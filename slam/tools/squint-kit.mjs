// The squint test kit (S-288): six screens picked at random (at least two at level 3 or 4), photographed at computer
// width on the made-up example household, blurred on one printable page with the instructions: docs/squint-test.html.
//   cd slam && python3 -m http.server 8766 &   then   SLAM_URL=http://localhost:8766/ node tools/squint-kit.mjs
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { SCREENS } from './trunk-test-screens.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.SLAM_URL || 'http://localhost:8766/';
const shuffle = (xs) => xs.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const deep = shuffle(SCREENS.filter(([lv]) => lv >= 3)).slice(0, 2);
const rest = shuffle(SCREENS.filter((x) => !deep.includes(x))).slice(0, 4);
const picked = shuffle([...deep, ...rest]);
const out = new URL('../docs/squint/', import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
for (const [i, [, url]] of picked.entries()) { await page.goto(BASE + url); await page.waitForTimeout(1300); await page.screenshot({ path: new URL('screen-' + (i + 1) + '.jpg', out).pathname, type: 'jpeg', quality: 60 }); }
await browser.close();
const cards = picked.map(([lv], i) => `<figure><img src="squint/screen-${i + 1}.jpg" alt="Screen ${i + 1}, blurred"><figcaption>Screen ${i + 1} (level ${lv})</figcaption></figure>`).join('\n');
writeFileSync(new URL('../docs/squint-test.html', import.meta.url), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SLAM squint test</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; color: #182134; background: #fff; max-width: 60rem; margin: 0 auto; padding: 16px; }
  h1 { font-size: 1.6rem; } ol li { margin-bottom: 4px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(26rem, 1fr)); gap: 16px; }
  figure { margin: 0; border: 1px solid #c9d2e3; border-radius: 8px; padding: 8px; break-inside: avoid; }
  img { width: 100%; filter: blur(2.5px); display: block; }
  figcaption { font-weight: 600; margin-top: 6px; }
  @media print { .grid { grid-template-columns: 1fr 1fr; } figure { page-break-inside: avoid; } }
</style></head><body>
<h1>Squint test: can a stranger find their way?</h1>
<p>Six SLAM screens, picked at random (at least two deep inside), blurred so the words cannot be read closely. Every number on them is made up.</p>
<ol>
  <li>Print this page, or show it on a screen.</li>
  <li>Give a friend two minutes. On each screen, ask them to circle and label: <strong>site ID</strong> (the name of the site), <strong>page name</strong>, <strong>sections</strong> (the main tabs), <strong>local options</strong> (the choices on this page), <strong>you are here</strong> (which tab is chosen), and <strong>search</strong>.</li>
  <li>Anything they cannot find, or circle in the wrong place, is a fix. Note it on BOARD.md.</li>
</ol>
<p>Made by <code>tools/squint-kit.mjs</code>; run it again for six new screens.</p>
<div class="grid">
${cards}
</div>
</body></html>
`);
console.log('squint kit: ' + picked.map(([lv, u]) => lv + ' ' + u).join(', '));
