#!/usr/bin/env node
/* Builds the Level 8 discovery household (maya-discovery.json) through the
   real discovery API, so the fixture carries guesses, anchors and a household.
   Run: node money-rooms-v3/tests/households/build-discovery.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecord } from '../../engine/record.js';
import { applyDiscovery } from '../../engine/discovery.js';
import { loadData } from '../engine/load-data.js';
import { MAYA_DISCOVERY } from './discovery-specs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = loadData();
const rec = createRecord({ id: 'maya-discovery', now: '2026-10-01T15:00:00.000Z' });
applyDiscovery(rec, JSON.parse(JSON.stringify(MAYA_DISCOVERY)), data, { now: '2026-10-01T15:05:00.000Z', today: '2026-10-07', session: 'discovery' });
fs.writeFileSync(path.join(here, 'maya-discovery.json'), JSON.stringify({ app: 'money-rooms-v3', exportedAt: '2026-10-01T15:06:00.000Z', record: rec }, null, 1));
console.error('wrote maya-discovery.json: ' + rec.planets.spending.rows.length + ' spending rows, ' + rec.journal.length + ' journal lines');
