// Shared loaders for the Phase 1 spine tests (Node only).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeRules } from '../engine/rules.js';

export const SLAM = fileURLToPath(new URL('..', import.meta.url));
export const readJson = (rel) => JSON.parse(readFileSync(SLAM + rel, 'utf8'));
export const exists = (rel) => existsSync(SLAM + rel);
export const loadRules = () => makeRules(readJson('data/rules-2026.json'));
