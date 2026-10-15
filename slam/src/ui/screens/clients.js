// Screen 1, Clients: list, new client, open, export, import, demo households.

import { h } from '../dom.js';
import { DEMO_HOUSEHOLDS, loadDemo } from '../refs.js';

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

export function renderClients(ctx) {
  const { store } = ctx;
  const list = store.list();
  const nameBox = h('input', { type: 'text', placeholder: 'Client name', 'aria-label': 'New client name', 'data-key': 'new-client' });
  const create = () => {
    const name = nameBox.value.trim();
    if (!name) return ctx.toast('Type a name first');
    store.create(name);
    ctx.go('fill', { pass: 'gut' });
  };
  nameBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const res = store.importText(await file.text());
        ctx.toast('Imported. A backup of everything was saved first (' + res.backupId + ').');
        ctx.go('budget');
      } catch (err) { ctx.toast(err.message); }
    }
  });

  const backups = store.listBackups().slice().reverse();

  return h('div', {},
    h('h1', {}, 'Clients'),
    h('div', { class: 'card' },
      h('h3', {}, 'New client'),
      h('div', { class: 'row' }, nameBox, h('button', { class: 'btn primary', onclick: create }, 'Start'))),
    h('div', { class: 'card' },
      h('div', { class: 'spread' }, h('h3', {}, 'Client list'), h('span', { class: 'muted small' }, list.length + ' saved in this browser')),
      list.length ? h('ul', { class: 'plain' }, list.map((c) => h('li', {},
        h('span', {}, h('b', {}, c.name), ' ', h('span', { class: 'muted xs' }, 'updated ' + new Date(c.updatedAt).toLocaleDateString())),
        h('span', { class: 'row' },
          h('button', { class: 'btn small primary', onclick: () => { store.open(c.id); ctx.go('budget'); } }, store.doc && store.doc.id === c.id ? 'Open (current)' : 'Open'),
          h('button', { class: 'btn small', onclick: () => { store.open(c.id); exportClient(ctx); } }, 'Export'),
          h('button', { class: 'btn small danger', onclick: () => {
            if (confirm('Delete ' + c.name + ' from this browser? Export first if you want a copy.')) { store.backupAll('Before deleting ' + c.name); store.remove(c.id); ctx.rerender(); }
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
            if (confirm('Restore this backup? Current versions of those clients will be replaced.')) { store.restoreBackup(b.id); ctx.toast('Backup restored'); ctx.rerender(); }
          } }, 'Restore'))))) : null),
    h('div', { class: 'card' },
      h('h3', {}, 'Try with example numbers'),
      h('p', { class: 'muted small' }, 'Made-up households for practice and demos. No real data.'),
      h('div', { class: 'row' }, DEMO_HOUSEHOLDS.map(([id, label]) => h('button', { class: 'btn small', onclick: async () => {
        try { store.add(await loadDemo(id)); ctx.go('budget'); } catch (e) { ctx.toast(e.message); }
      } }, label)))));
}
