// Who is working (S-096). Today everyone is the coach; a future sign-in sets
// the role here, and nothing else in the app decides it. The display role is
// separate: "View as client" shows what the client would see, but edits are
// still made (and stamped) by the signed-in role.
// No imports. store.js reads currentRole() when it stamps a record; app.js sets the display role.

export const ROLES = ['coach', 'client'];

let role = 'coach';
let display = 'coach';

export function currentRole() { return role; }
export function setRole(r) {
  if (!ROLES.includes(r)) throw new Error('Unknown role ' + r);
  role = r;
}

export function displayRole() { return display; }
export function setDisplayRole(r) {
  if (!ROLES.includes(r)) throw new Error('Unknown role ' + r);
  display = r;
}
