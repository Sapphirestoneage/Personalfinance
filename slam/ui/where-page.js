// Builder: where to find each kind of number and about how long it takes (data/where-to-find.json). Still guessing
// sorts and groups by these. A change is kept in this browser; "Download" saves the table as a file to keep.
// LIVE-FORM: built once per screen; Save writes the change, then the shell redraws.

import { saveFile } from './save-file.js';
import { startPage, refresh, say } from './shell.js';
import { whereTable, whereFile, whereChanges, keepWhereChanges } from './where-data.js';
import { h } from './view.js';

function kindRow(k, file) {
  const mine = whereChanges()[k.id] || null;
  const where = h('input', { type: 'text', id: 'w-' + k.id, value: k.where, maxlength: '80' });
  const short = h('input', { type: 'text', id: 's-' + k.id, value: k.short, maxlength: '24' });
  const minutes = h('input', { type: 'number', id: 'm-' + k.id, value: String(k.minutes), min: '1', max: '120', inputmode: 'numeric' });
  const save = () => {
    const m = Math.round(+minutes.value);
    if (!where.value.trim() || !short.value.trim() || !(m >= 1 && m <= 120)) { say('Not saved: each kind needs words and 1 to 120 minutes'); return; }
    const all = whereChanges(), next = { where: where.value.trim(), short: short.value.trim(), minutes: m };
    const orig = file.kinds.find((x) => x.id === k.id);
    if (orig.where === next.where && orig.short === next.short && orig.minutes === next.minutes) delete all[k.id]; else all[k.id] = next;
    keepWhereChanges(all); say(k.short + ' saved'); refresh();
  };
  const field = (label, input, cls) => h('div', { class: 'where-field ' + cls }, h('label', { for: input.id }, label), input);
  return h('li', { class: 'where-kind' },
    h('h3', {}, KIND_WORDS[k.id] || k.id, mine ? [' ', h('span', { class: 'chip chip-default' }, 'changed')] : null),
    h('div', { class: 'where-fields' }, field('Where', where, 'wide'), field('Short words', short, 'short'), field('Minutes', minutes, 'mins'),
      h('div', { class: 'where-save' }, h('button', { type: 'button', class: 'btn small', onclick: save }, 'Save'))));
}
const KIND_WORDS = { choice: 'Choices only you know', dueDay: 'Due days', cardRate: 'Card rates and minimums', loan: 'Loans', value: 'A car or home value', balance: 'Balances', k401: '401(k) match and contribution', pay: 'Pay and withholding', insurance: 'Insurance', tax: 'Last year\'s tax numbers', subscription: 'Subscriptions', housing: 'Rent and utilities', spending: 'Spending by category', other: 'Anything else' };
function download() {
  if (saveFile('where-to-find.json', JSON.stringify(whereTable(), null, 2) + '\n') !== 'saved') say('This window can\'t save files; open SLAM in its own tab to download it');
}
startPage({
  tab: null, title: 'Where to find', parent: ['Builder', 'builder.html'], household: false,
  actions: () => [
    h('button', { type: 'button', class: 'btn', onclick: download }, 'Download'),
    Object.keys(whereChanges()).length ? h('button', { type: 'button', class: 'btn danger', onclick: () => { const was = whereChanges(); keepWhereChanges({}); say('Back to the file\'s table', () => { keepWhereChanges(was); refresh(); }); refresh(); } }, 'Use the file\'s table') : null
  ],
  render: () => {
    const t = whereTable(), file = whereFile();
    if (!t) return h('p', { class: 'card', role: 'alert' }, 'The where-to-find file could not be read.');
    return h('section', { class: 'card' }, h('ul', { class: 'where-list' }, t.kinds.map((k) => kindRow(k, file))));
  }
});
