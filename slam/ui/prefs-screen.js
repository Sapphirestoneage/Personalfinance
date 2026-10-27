// The Preferences screen in Profile: how this browser shows the app. Filled from data/preferences.json in step 5.

import { h } from './view.js';

export const prefsSummary = () => 'how this browser shows the app';
export const prefsScreen = () => [h('p', { class: 'card' }, 'Preferences arrive with the next step.')];
