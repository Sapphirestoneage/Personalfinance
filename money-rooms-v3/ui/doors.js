/* Every number is a door (MR-076). A view marks what a thing is and this
   module makes it go somewhere: data-metric opens that number's drawer,
   data-go jumps to a screen, data-cell ("rowId|field|href") opens the room
   with the cursor in that cell. linkify() gives each marked element a role,
   a tab stop and the pointer; one delegated handler on #main and #overlay
   does the rest, so a tap or Enter anywhere on the value works. Things that
   are already buttons or links are left alone. */
import { openMetric } from './metricdrawer.js';

const MARK = '[data-metric], [data-go], [data-cell]';
const CONTROL = 'a, button, input, select, textarea, label, summary, [role="button"], [role="tab"]';

/* The address of a cell: the room and type its row lives in. The household facts live on the Plan. */
export function cellDoor(app, rowId, field) {
  if (!app.record) return null;
  if (rowId === 'sun') return 'sun|' + field + '|#/ledger';
  for (const p of Object.keys(app.record.planets)) { const r = app.record.planets[p].rows.find(x => x.id === rowId); if (r) return rowId + '|' + field + '|#/ledger/' + p + '/' + r.type; }
  return null;
}
export function linkify(root) {
  if (!root) return;
  root.querySelectorAll(MARK).forEach(el => {
    if (el.matches(CONTROL) || el.closest(CONTROL)) return;
    el.classList.add('door');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'link');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.title) el.title = el.dataset.metric ? 'Open this number' : el.dataset.cell ? 'Open where this lives' : 'Open';
  });
}
function go(app, el) {
  if (el.dataset.cell) { const [rowId, field, href] = el.dataset.cell.split('|'); app.focusAfterRender = { rowId, field, details: rowId !== 'sun' }; if (location.hash === href) app.render(); else location.hash = href; return; }
  if (el.dataset.go) { if (location.hash === el.dataset.go) app.render(); else location.hash = el.dataset.go; return; }
  if (el.dataset.metric) openMetric(app, el.dataset.metric);
}
export function installDoors(app) {
  const handler = e => {
    const el = e.target.closest(MARK); if (!el || !el.classList.contains('door')) return;
    const control = e.target.closest(CONTROL); if (control && el.contains(control) && control !== el) return; /* a button inside the door keeps its own job */
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); go(app, el);
  };
  ['#main', '#overlay'].forEach(sel => { const n = document.querySelector(sel); if (!n) return; n.addEventListener('click', handler); n.addEventListener('keydown', handler); });
}
