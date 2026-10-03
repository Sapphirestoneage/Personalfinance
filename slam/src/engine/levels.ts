/* ==========================================================================
   Level status, rounds and readings. Pure: takes the business and the
   profile facts, returns what is done, what is open, and what to do next.
   ========================================================================== */
import type { ClientRecord, Profile, WeekLog } from '@/data/schemas';
import { BANDS, levelsFor, PLANETS, READINGS, type Band, type FieldRef, type Level, type PlanetId, type Reading } from '@/content/levels';
import { stepKey } from '@/content/stages';
import { funnelFromLog, LOG_MIN_CONTACTS } from './reality';
import type { BusinessModel } from './model';
import type { Book } from './reader';

export type LevelStatus = 'done' | 'partly' | 'open' | 'absent';

export interface LevelState {
  level: Level;
  status: LevelStatus;
  /** fields still an estimate, for a fields level */
  remaining: number;
  total: number;
}

export interface Facts {
  profile: Profile;
  business: BusinessModel;
  shared: Book;
  clients: ClientRecord[];
  weekLogs: WeekLog[];
}

function bookFor(ref: FieldRef, f: Facts): Book | undefined {
  if (ref.where === 'inputs') return f.business.inputs;
  if (ref.where === 'shared') return f.shared;
  return f.business.offers[ref.where];
}

export function levelState(level: Level, f: Facts): LevelState {
  const w = level.what;
  if (w.kind === 'fields') {
    const present = w.fields.filter((r) => bookFor(r, f)?.[r.key] !== undefined);
    if (present.length === 0) return { level, status: 'absent', remaining: 0, total: 0 };
    const done = present.filter((r) => bookFor(r, f)![r.key]!.label === 'Yours').length;
    return { level, status: done === present.length ? 'done' : done > 0 ? 'partly' : 'open', remaining: present.length - done, total: present.length };
  }
  if (w.kind === 'sources') {
    const n = f.business.sources?.length ?? 0;
    return { level, status: n > 0 ? 'done' : 'open', remaining: n > 0 ? 0 : 1, total: 1 };
  }
  if (w.kind === 'log') {
    const usedLog = Object.values(f.business.inputs).some((a) => a.source === 'from your client log');
    const enough = funnelFromLog(f.clients, f.business.id).contacts >= LOG_MIN_CONTACTS;
    return { level, status: usedLog ? 'done' : enough ? 'partly' : 'open', remaining: usedLog ? 0 : 1, total: 1 };
  }
  if (w.kind === 'checkins') {
    const n = f.profile.checkInCount;
    return { level, status: n >= 4 ? 'done' : n > 0 ? 'partly' : 'open', remaining: Math.max(0, 4 - n), total: 4 };
  }
  const done = f.profile.pathway.completedSteps.includes(stepKey(f.business.id, w.stage));
  return { level, status: done ? 'done' : 'open', remaining: done ? 0 : 1, total: 1 };
}

export interface PlanetBand {
  planet: PlanetId;
  band: Band;
  levels: LevelState[];
  /** every applicable level done (a band with no level counts as complete) */
  complete: boolean;
}

export interface RoundState {
  band: Band;
  name: string;
  /** planets that finished this band */
  planetsDone: number;
  planetsTotal: number;
  complete: boolean;
}

export interface ReadingState {
  reading: Reading;
  status: 'yours' | 'estimate';
  waitingOn: Level[];
}

export interface LevelsOverview {
  levels: LevelState[];
  grid: PlanetBand[];
  rounds: RoundState[];
  readings: ReadingState[];
  /** open levels, band first then planet order; never past band 2 until round 1 is complete */
  next: LevelState[];
  doneCount: number;
  total: number;
}

export function levelsOverview(f: Facts): LevelsOverview {
  const levels = levelsFor(f.business.type).map((l) => levelState(l, f));
  const grid: PlanetBand[] = [];
  for (const b of BANDS) {
    for (const p of PLANETS) {
      const mine = levels.filter((l) => l.level.band === b.band && l.level.planet === p.id && l.status !== 'absent');
      grid.push({ planet: p.id, band: b.band, levels: mine, complete: mine.every((l) => l.status === 'done') });
    }
  }
  const rounds: RoundState[] = BANDS.map((b) => {
    /* a planet with no level in this band is not counted (it shrinks the round, it does not pad it) */
    const cells = grid.filter((g) => g.band === b.band && g.levels.length > 0);
    const planetsDone = cells.filter((c) => c.complete).length;
    return { band: b.band, name: b.name, planetsDone, planetsTotal: cells.length, complete: planetsDone === cells.length };
  });
  const byId = new Map(levels.map((l) => [l.level.id, l]));
  const readings: ReadingState[] = READINGS.map((r) => {
    const waitingOn = r.needs.map((id) => byId.get(id)).filter((l): l is LevelState => !!l && l.status !== 'absent' && l.status !== 'done').map((l) => l.level);
    return { reading: r, status: waitingOn.length ? 'estimate' : 'yours', waitingOn };
  });
  const round1 = rounds[0]!.complete;
  const open = levels.filter((l) => l.status !== 'done' && l.status !== 'absent');
  const order = (l: LevelState) => l.level.band * 10 + PLANETS.findIndex((p) => p.id === l.level.planet);
  const next = open.filter((l) => round1 || l.level.band <= 2).sort((a, b) => order(a) - order(b));
  const counted = levels.filter((l) => l.status !== 'absent');
  return { levels, grid, rounds, readings, next, doneCount: counted.filter((l) => l.status === 'done').length, total: counted.length };
}
