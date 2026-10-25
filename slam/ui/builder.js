// The Builder (S-230): the pages for the person who builds the app, out of the tabs, under one small link at the
// bottom of every page. A plain list of the three. Clients never need these.

import { startPage } from './shell.js';
import { h } from './view.js';

const PAGES = [
  ['Design kit', 'affordances.html', 'Every button, row, bar and chart piece in every state.'],
  ['All formulas', 'math.html', 'How every number is figured, with today\'s numbers plugged in.'],
  ['Rules', 'rules.html', 'Every limit, rate and date, its source, and changes made in this browser.']
];

startPage({
  tab: null, title: 'Builder', household: false,
  render: () => [
    h('p', { class: 'lede' }, 'How the app is built: its parts, its formulas and its rules.'),
    h('ul', { class: 'go-list' }, PAGES.map(([name, href, sub]) => h('li', {}, h('a', { class: 'go-row plain', href }, h('span', { class: 'go-name' }, name), h('span', { class: 'go-sub' }, sub)))))
  ]
});
