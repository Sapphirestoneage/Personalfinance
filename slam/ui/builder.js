// The Builder (S-230): the pages for the person who builds the app, out of the tabs, under one small link at the
// bottom of every page. A plain list of the five (the old client list stays here only until Phase 3). Clients never need these.

import { startPage } from './shell.js';
import { h } from './view.js';

const PAGES = [
  ['Design kit', 'affordances.html', 'Every button, row, bar and chart piece in every state.'],
  ['All formulas', 'math.html', 'How every number is figured, with today\'s numbers plugged in.'],
  ['Rules', 'rules.html', 'Every limit, rate and date the law sets, its source, and changes made in this browser.'],
  ['House defaults', 'house.html', 'Eli\'s method for every client: a card\'s rate when unknown, the due day, the Rule of 5, the housing reference, the FOO order, what is too small to matter.'],
  ['Client list (old)', 'clients.html', 'The old Budget app and its client list, until Phase 3 replaces it.']
];

startPage({
  tab: null, title: 'Builder', household: false,
  render: () => [
    h('p', { class: 'lede' }, 'How the app is built: its parts, its formulas and its rules.'),
    h('ul', { class: 'go-list' }, PAGES.map(([name, href, sub]) => h('li', {}, h('a', { class: 'go-row plain', href }, h('span', { class: 'go-name' }, name), h('span', { class: 'go-sub' }, sub)))))
  ]
});
