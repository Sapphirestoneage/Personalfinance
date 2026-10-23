// Screen 1, Clients: list, new client, open, export, import, demo households. Import also handles a file that
// was changed on both copies: the merge card lets the coach pick a side per record (S-096). Everything stored
// goes through ctx.store (store/store.js: list, create, open, importText, backups). The demos are the made-up
// files in src/data/households/ (ui/refs.js); a demo's sample CSVs are read with engines/tx-import.js importCSV,
// matched against the log with engines/log.js matchImport, and merged with store/log.js mergeImport.

import { h } from '../dom.js';
import { money } from '../format.js';
import { DEMO_HOUSEHOLDS, DEMO_CSVS, loadDemo, loadDemoCSV } from '../refs.js';
import { importCSV } from '../../engines/tx-import.js';
import { addAccount } from '../../store/accounts.js';
import { mergeImport } from '../../store/log.js';
import { matchImport } from '../../engines/log.js';

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client';
}

export function exportClient(ctx) {
  const doc = ctx.store.doc;
  download('slam-' + slug(doc.profile.name) + '-' + new Date().toISOString().slice(0, 10) + '.json', ctx.store.exportCurrent());
}

// A record in a few words, for the merge screen.
// One side of a conflict: the record's name and date, then each field that differs from the other side.
// Bookkeeping fields and nested lists are left out of the differences; they are not what the coach picks between.
const SKIP = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'version', 'deleted', 'deletedAt', 'deletedBy', 'lines', 'deductions'];
function shown(v) {
  if (typeof v === 'number') return money(Math.abs(v), true);
  if (v && typeof v === 'object' && 'amount' in v) return v.amount === null ? 'blank' : money(v.amount, true);
  if (v === null || v === undefined || v === '') return 'blank';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
function brief(rec, other) {
  if (rec.deleted) return 'deleted';
  const parts = [];
  if (rec.date) parts.push(rec.date);
  if (rec.name || rec.label || rec.description) parts.push(rec.name || rec.label || rec.description);
  const diff = Object.keys({ ...rec, ...other }).filter((k) => !SKIP.includes(k) && JSON.stringify(rec[k]) !== JSON.stringify(other[k]));
  // Against a deleted other side every field differs, so list none; "deleted" on that side says enough.
  for (const k of other.deleted ? [] : diff) parts.push(k + ' ' + shown(rec[k]));
  return parts.join(', ') || 'changed';
}
const stampOf = (side) => (side.by || 'coach') + ', ' + (side.at ? new Date(side.at).toLocaleString() : 'unknown time');

// Changes made on both copies since they last matched: the coach picks one for each (S-096).
function mergeCard(ctx) {
  const r = ctx.store.pendingImport();
  if (!r) return null;
  // Picks live in ui state until Finish merge; a conflict left unpicked keeps this copy (local).
  const picks = ctx.ui.mergePicks = ctx.ui.mergePicks || {};
  return h('div', { class: 'card flag', id: 'merge-conflicts' },
    h('h2', {}, 'Merging ' + r.doc.profile.name + ': ' + r.conflicts.length + ' to pick'),
    h('p', { class: 'small' }, 'Added from the file: ' + r.added.length + '. Taken from the file: ' + r.fromIncoming.length + '. Kept from here: ' + r.fromLocal.length + '. These were changed on both copies:'),
    h('ul', { class: 'plain' }, r.conflicts.map((c) => h('li', { 'data-key': 'conflict:' + c.key },
      h('div', { style: 'flex:1 1 100%' }, h('b', {}, c.what)),
      ['local', 'incoming'].map((side) => h('label', { class: 'check', style: 'flex:1 1 240px' },
        h('input', { type: 'radio', name: 'pick-' + c.key, 'data-key': 'pick:' + side + ':' + c.key, checked: (picks[c.key] || 'local') === side, onchange: () => { picks[c.key] = side; } }),
        h('span', { 'data-key': 'side:' + side + ':' + c.key }, (side === 'local' ? 'This copy: ' : 'The file: ') + brief(c[side].rec, c[side === 'local' ? 'incoming' : 'local'].rec) + ' (' + stampOf(c[side]) + ')')))))),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', 'data-key': 'finish-merge', onclick: () => ctx.store.resolveImport(picks).then(() => { ctx.ui.mergePicks = null; ctx.toast('Merged'); ctx.go('today'); }) }, 'Finish merge'),
      h('button', { class: 'btn', onclick: () => { ctx.store.cancelImport(); ctx.rerender(); } }, 'Cancel')));
}

export function renderClients(ctx) {
  const { store } = ctx;
  const list = store.list();
  const nameBox = h('input', { type: 'text', placeholder: 'Client name', 'aria-label': 'New client name', 'data-key': 'new-client' });
  const create = () => {
    const name = nameBox.value.trim();
    if (!name) return ctx.toast('Type a name first');
    store.create(name);
    ctx.go('today');
  };
  nameBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const res = await store.importText(await file.text());
        // Conflicts keep the coach on this screen, where mergeCard shows them; otherwise straight to Today.
        if (res.merged && res.conflicts.length) { ctx.ui.mergePicks = {}; ctx.toast(res.conflicts.length + ' change' + (res.conflicts.length === 1 ? '' : 's') + ' made on both copies: pick which to keep.'); ctx.rerender(); return; }
        ctx.toast(res.merged ? 'Merged: ' + res.added + ' added, ' + res.fromIncoming + ' taken from the file, ' + res.fromLocal + ' kept from here. Backup ' + res.backupId + '.' : 'Imported. A backup of everything was saved first (' + res.backupId + ').');
        ctx.go('today');
      } catch (err) { ctx.toast(err.message); }
    }
  });

  const backups = store.listBackups().slice().reverse();

  return h('div', {},
    h('h1', {}, 'Clients'),
    mergeCard(ctx),
    h('div', { class: 'card' },
      h('h3', {}, 'New client'),
      h('div', { class: 'row' }, nameBox, h('button', { class: 'btn primary', onclick: create }, 'Start'))),
    h('div', { class: 'card' },
      h('div', { class: 'spread' }, h('h3', {}, 'Client list'), h('span', { class: 'muted small' }, list.length + ' saved in this browser')),
      list.length ? h('ul', { class: 'plain' }, list.map((c) => h('li', {},
        h('span', {}, h('b', {}, c.name), ' ', h('span', { class: 'muted xs' }, 'updated ' + new Date(c.updatedAt).toLocaleDateString())),
        h('span', { class: 'row' },
          h('button', { class: 'btn small primary', onclick: () => store.open(c.id).then(() => ctx.go('today')) }, store.doc && store.doc.id === c.id ? 'Open (current)' : 'Open'),
          h('button', { class: 'btn small', onclick: () => store.open(c.id).then(() => exportClient(ctx)) }, 'Export'),
          h('button', { class: 'btn small danger', onclick: () => {
            if (confirm('Remove ' + c.name + ' from the list? The file is kept, marked deleted, and a backup is taken first.')) store.backupAll('Before deleting ' + c.name).then(() => store.remove(c.id)).then(() => ctx.rerender());
          } }, 'Delete')))))
        : h('p', { class: 'muted' }, 'No clients yet. Start one above, or try a demo below.')),
    h('div', { class: 'card' },
      h('h3', {}, 'Import'),
      h('p', { class: 'muted small' }, 'Open a SLAM .json export. Every client in this browser is backed up automatically before the import.'),
      fileInput, h('label', { for: 'import-file', class: 'btn' }, 'Choose file to import'),
      backups.length ? h('details', {}, h('summary', { class: 'small' }, 'Backups (' + backups.length + ')'),
        h('ul', { class: 'plain' }, backups.map((b) => h('li', {},
          h('span', { class: 'small' }, new Date(b.takenAt).toLocaleString() + ': ' + b.reason + ' (' + b.count + ' clients)'),
          h('button', { class: 'btn small', onclick: () => {
            if (confirm('Restore this backup? Current versions of those clients will be replaced.')) store.restoreBackup(b.id).then(() => { ctx.toast('Backup restored'); ctx.rerender(); });
          } }, 'Restore'))))) : null),
    h('div', { class: 'card' },
      h('h3', {}, 'Try with example numbers'),
      h('p', { class: 'muted small' }, 'Made-up households for practice and demos. No real data.'),
      h('div', { class: 'row' }, DEMO_HOUSEHOLDS.map(([id, label]) => h('button', { class: 'btn small', onclick: async () => {
        try {
          store.add(await loadDemo(id));
          // A demo with sample bank files is imported the way a coach would: the account is found by name or made first,
          // then each CSV goes through importCSV, matchImport (already imported or matched entries), and mergeImport.
          for (const [file, name, type] of DEMO_CSVS[id] || []) {
            let account = (store.doc.accounts.find((a) => a.name === name) || {}).id;
            if (!account) store.update('Add account', (d) => { account = addAccount(d, { name, type }).id; });
            const res = importCSV(await loadDemoCSV(file), { account, rulesData: ctx.refs.merchantRules, memory: store.doc.merchantMemory });
            store.update('Import ' + file, (d) => mergeImport(d, matchImport(d.transactions, res.transactions)));
          }
          ctx.go('today');
        } catch (e) { ctx.toast(e.message); }
      } }, label)))));
}
