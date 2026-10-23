/* Runs the sensitivity engine off the main thread (Level 9, MR-042). The
   data libraries arrive once; each later message carries a record and a key. */
import { sensitivity } from '../engine/sensitivity.js';
let data = null;
self.onmessage = e => {
  const msg = e.data;
  if (msg.type === 'data') { data = msg.data; return; }
  if (msg.type === 'run' && data) {
    try { const r = sensitivity({ record: msg.record, data, today: msg.today, maxRoots: msg.maxRoots }); self.postMessage({ key: msg.key, result: r }); }
    catch (err) { self.postMessage({ key: msg.key, error: String(err && err.message || err) }); }
  }
};
