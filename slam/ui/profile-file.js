// The profile file (S-195): save the Ledger to a file you keep, load one
// back, and know when the browser holds edits the file does not. The file is
// the whole household as a slam-spine document (every field with its kind,
// date and source), which the loader reads like a profile, so it can replace
// fixtures/eli.local.json. Never sent anywhere: the browser saves it to disk.

import { readHousehold } from '../engine/normalize.js';

const KEY = 'slam-profile-baseline:v1';
export const FILE_NAME = 'eli.local.json';

// A short fingerprint of the household, to tell whether it changed since the file was saved.
export function fingerprint(spine) {
  const text = JSON.stringify(spine);
  let x = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { x ^= text.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
  return x.toString(16) + ':' + text.length;
}
export function baseline() { try { return localStorage.getItem(KEY); } catch { return null; } }
export function setBaseline(spine) { try { localStorage.setItem(KEY, fingerprint(spine)); } catch { /* storage blocked */ } }
export const matchesFile = (spine) => baseline() === fingerprint(spine);

// The browser saves the file to the person's downloads folder.
export function downloadProfile(spine) {
  const blob = new Blob([JSON.stringify(spine, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = FILE_NAME;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setBaseline(spine);
}

// A chosen file read in this browser as a household (a saved spine, an export or a profile of any version, S-228):
// { spine, problems }, the fields it could not use named in problems. Throws only when it is not a household, with
// words for the person (err.plain); the details go to the console.
export const notOurs = (name) => Object.assign(new Error((name || 'That file') + ' is not a household file from this app.'), { plain: true });
export async function readProfile(file, { today = null } = {}) {
  try {
    return readHousehold(JSON.parse(await file.text()), { today });
  } catch (err) {
    console.warn('Open file: ' + (file && file.name) + ': ' + (err && err.message));
    throw notOurs(file && file.name);
  }
}
// What to say when a file could not be loaded: the plain words, else the file's name; "Nothing changed" either way.
export const loadFailWords = (err, name) => (err && err.plain ? err.message : 'Could not read ' + (name || 'that file') + '.') + ' Nothing changed.';
