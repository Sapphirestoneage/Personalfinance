// The Builder (S-230): the pages for the person who builds the app, out of the tabs, under one small link at the
// bottom of every page. A plain list of the five (the old client list stays here only until Phase 3). Clients never need these.

import { startPage } from './shell.js';
import { h } from './view.js';

// The two pages used most sit on top (owner's ask, 2026-10-27): what the app assumes and how every number is figured.
const TOP = [
  ['Assumptions', 'assumptions.html', 'Every number the app assumes, for everyone or for one client, with what it means and where it is used.'],
  ['All formulas', 'math.html', 'How every number is figured, with today\'s numbers plugged in, and the assumptions each one reads.']
];
const PAGES = [
  ['Design kit', 'affordances.html', 'Every button, row, bar and chart piece in every state.'],
  ['Rules', 'rules.html', 'Every limit, rate and date the law sets, its source, and changes made in this browser.'],
  ['House defaults', 'house.html', 'Eli\'s method for every client, as the file has it; the Assumptions page shows the same in plain words.'],
  ['Client list (old)', 'clients.html', 'The old Budget app and its client list, until Phase 3 replaces it.']
];
const rows = (list) => h('ul', { class: 'go-list' }, list.map(([name, href, sub]) => h('li', {}, h('a', { class: 'go-row plain', href }, h('span', { class: 'go-name' }, name), h('span', { class: 'go-sub' }, sub)))));

startPage({
  tab: null, title: 'Builder', household: false,
  render: () => [
    h('p', { class: 'lede' }, 'How the app is built: what it assumes, its formulas and its rules.'),
    h('section', { class: 'card', 'aria-labelledby': 'b-top' }, h('h2', { id: 'b-top' }, 'Start here'), rows(TOP)),
    h('section', { class: 'card', 'aria-labelledby': 'b-more' }, h('h2', { id: 'b-more' }, 'More'), rows(PAGES))
  ]
});
