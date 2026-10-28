// The Builder (S-230): the pages for the person who builds the app, out of the tabs, under the gear in every header
// (S-280). One list, in the gear's order, then the pages the gear does not hold (the old client list stays here only
// until Phase 3). Clients never need these. Open file and the example household are in the client menu of every
// header, so this page carries no copy of them.

import { startPage } from './shell.js';
import { h } from './view.js';

const PAGES = [
  ['Rules', 'rules.html', 'Every limit, rate and date the law sets, its source, and changes made in this browser.'],
  ['House defaults', 'house.html', 'Eli\'s method for every client, as the file has it; the Assumptions page shows the same in plain words.'],
  ['Assumptions', 'assumptions.html', 'Every number the app assumes, for everyone or for one client, with what it means and where it is used.'],
  ['All formulas', 'math.html', 'How every number is figured, with today\'s numbers plugged in, and the assumptions each one reads.'],
  ['Where each number came from', 'plan.html#/sources', 'Every number behind the headlines, sortable and printable.'],
  ['Design kit', 'affordances.html', 'Every button, row, bar and chart piece in every state.'],
  ['Where to find each number', 'where.html', 'Where each kind of number is found and about how long it takes; Still guessing sorts by it.'],
  ['Client list (old)', 'clients.html', 'The old Budget app and its client list, until Phase 3 replaces it.']
];
const rows = (list) => h('ul', { class: 'go-list' }, list.map(([name, href, sub]) => h('li', {}, h('a', { class: 'go-row plain', href }, h('span', { class: 'go-name' }, name), h('span', { class: 'go-sub' }, sub)))));

startPage({
  tab: null, title: 'Builder',
  render: () => [
    h('p', { class: 'lede' }, 'How the app is built: what it assumes, its formulas and its rules.'),
    h('section', { class: 'card', 'aria-labelledby': 'b-pages' }, h('h2', { id: 'b-pages' }, 'Pages'), rows(PAGES))
  ]
});
