/* ==========================================================================
   F11 applied to a list of possible moves, ranked best first. A move with
   no cost has no score (null) and sorts last rather than infinite.
   ========================================================================== */
import { leverageScore, type LeverageInput } from './formulas';

export interface Move extends LeverageInput {
  id: string;
  name: string;
}

export interface RankedMove extends Move {
  score: number | null;
}

export function rankMoves(moves: Move[]): RankedMove[] {
  return moves
    .map((m) => ({ ...m, score: leverageScore(m) }))
    .sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    });
}
