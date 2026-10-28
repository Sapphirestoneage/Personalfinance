// Every institution profile (S-243). Adding one is a new file beside generic.js and one line here; the readers,
// the classifier and the review screen need no change. The generic profile is last and always matches a little.
import { generic } from './generic.js';

export const PROFILES = [generic];

// The profile whose match score on the text is highest.
export function pickProfile(text, profiles = PROFILES) {
  let best = generic, score = -1;
  for (const p of profiles) { const s = p.match(text) || 0; if (s > score) { best = p; score = s; } }
  return best;
}
