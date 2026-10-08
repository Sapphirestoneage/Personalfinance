/* Loads the data libraries once and gives the shell its compute function.
   Kept apart from app.js so the shell has no idea how math happens. */
import { loadAllData } from './data-loader.js';
import { compute } from '../engine/compute.js';

export function attach(app) {
  app.loadData = async function () {
    app.data = await loadAllData();
  };
  app.compute = function (record, data, opts) { return compute(record, data, opts); };
}
