/* ==========================================================================
   shared/spine-v2.js — the storage spine every room shares.
   --------------------------------------------------------------------------
   API surface (stable, per SPEC.md §1):
       getProfile()            -> the household object
       updateProfile(patch)    -> merge a partial household, notify listeners
       onChange(fn)            -> subscribe; returns an unsubscribe function
       registerRoom(id)        -> mark a room visited
       getVisitedRooms()       -> array of room ids

   WHAT CHANGED, AND WHAT A NEW ROOM MUST KNOW
   -------------------------------------------
   getProfile() returns a HOUSEHOLD (SPEC.md §3), not a flat profile object.
   There are no flat keys. `annualSalary` does not exist; income lives at
   household.people[i].incomeSources[j].grossAnnualIncomeCents. `studentLoan-
   Balance` does not exist; debts live in household.debts[] as itemised
   entries carrying ownerIds.

   Do not hand updateProfile() flat keys. Use the shaped helpers below
   (upsertPerson, upsertIncomeSource, upsertAsset, upsertDebt,
   setMonthlyExpenses, setAssumptionOverride) — they write to the one
   canonical location for each field, which is what keeps rooms from
   drifting apart.

   Any pre-schema-v2 blob already sitting in a visitor's localStorage is
   migrated forward on first read by migrateLegacy() below, so an existing
   bookmark does not lose its data.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Spine = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  var STORAGE_KEY = 'slaf.household.v2';
  var SNAPSHOT_KEY = 'slaf.snapshots.v1';
  var LEGACY_KEYS = ['slaf.profile', 'slaf.profile.v1', 'sparks.profile'];

  /* ---- Storage adapter --------------------------------------------------
     localStorage throws in some privacy modes. Fall back to memory so a
     room still works — it just won't persist across a reload.           */

  var memoryStore = {};

  function hasLocalStorage() {
    try {
      if (typeof localStorage === 'undefined') return false;
      var probe = '__slaf_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch (e) { return false; }
  }

  var useLocal = hasLocalStorage();

  function readRaw(key) {
    if (!useLocal) return memoryStore[key] === undefined ? null : memoryStore[key];
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function writeRaw(key, value) {
    if (!useLocal) { memoryStore[key] = value; return; }
    try { localStorage.setItem(key, value); }
    catch (e) { memoryStore[key] = value; }   /* quota exceeded — degrade, don't throw */
  }

  function removeRaw(key) {
    if (!useLocal) { delete memoryStore[key]; return; }
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* ---- Legacy migration -------------------------------------------------
     The pre-v2 spine shallow-merged flat keys into one object:
         { annualSalary, hoursPerWeek, studentLoanBalance, studentLoanRate }
     Those dollar figures were plain floats, not cents. Map them onto the
     household model. Runs once; the legacy key is left in place (read-only)
     rather than deleted, so a bad migration is recoverable.            */

  function migrateLegacy(legacy) {
    var household = Schema.createHousehold();
    var person = Schema.createPerson({ label: 'You', role: 'adult' });

    if (Money.isEntered(legacy.annualSalary)) {
      person.incomeSources.push(Schema.createIncomeSource({
        personId: person.id,
        source: 'Primary job',
        grossAnnualIncomeCents: Money.toCents(legacy.annualSalary),
        type: 'w2'
      }));
    }
    household.people.push(person);

    if (Money.isEntered(legacy.studentLoanBalance)) {
      household.debts.push(Schema.createDebt({
        label: 'Student loan',
        balanceCents: Money.toCents(legacy.studentLoanBalance),
        rate: Money.isEntered(legacy.studentLoanRate)
          ? (legacy.studentLoanRate > 1 ? legacy.studentLoanRate / 100 : legacy.studentLoanRate)
          : null,
        minPaymentCents: null,
        type: 'student_loan',
        ownerIds: [person.id]
      }));
    }

    /* hoursPerWeek was a Real Hourly Wage local input, not a household-level
       fact. It is intentionally dropped here rather than given a home it
       does not have in the schema; the room re-asks for it. */

    household.meta.visitedRooms = Array.isArray(legacy.visitedRooms) ? legacy.visitedRooms : [];
    household.meta.migratedFrom = 'flat-profile-v1';
    return household;
  }

  function loadLegacy() {
    for (var i = 0; i < LEGACY_KEYS.length; i++) {
      var raw = readRaw(LEGACY_KEYS[i]);
      if (!raw) continue;
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.schemaVersion === undefined) {
          return migrateLegacy(parsed);
        }
      } catch (e) { /* unparseable legacy blob — ignore it */ }
    }
    return null;
  }

  /* ---- Load / save ------------------------------------------------------ */

  var cache = null;

  function load() {
    if (cache) return cache;
    var raw = readRaw(STORAGE_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.schemaVersion === Schema.SCHEMA_VERSION) {
          cache = Schema.createHousehold(parsed);
          return cache;
        }
      } catch (e) { /* corrupt blob — fall through to a fresh household */ }
    }
    var migrated = loadLegacy();
    if (migrated) {
      cache = migrated;
      save();
      return cache;
    }
    cache = Schema.createHousehold({ meta: { createdAt: new Date().toISOString() } });
    return cache;
  }

  function save() {
    if (!cache) return;
    cache.meta.updatedAt = new Date().toISOString();
    writeRaw(STORAGE_KEY, JSON.stringify(cache));
  }

  /* ---- Change notification ---------------------------------------------- */

  var listeners = [];

  function notify() {
    var snapshot = getProfile();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](snapshot); }
      catch (e) { if (typeof console !== 'undefined') console.error('[spine] listener threw', e); }
    }
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function unsubscribe() {
      var idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  /* Another tab wrote — drop the cache so the next read is fresh, then tell
     this tab's listeners. Keeps two open rooms from diverging. */
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', function (evt) {
      if (evt.key === STORAGE_KEY) { cache = null; notify(); }
    });
  }

  /* ---- Public read ------------------------------------------------------
     Returns a deep copy. A room cannot mutate shared state by holding onto
     the returned object — SPEC.md §5 rule 4, "no local state that can drift
     from the registry."                                                  */

  function getProfile() {
    return JSON.parse(JSON.stringify(load()));
  }

  /* ---- Public write ----------------------------------------------------- */

  var COMPUTED_GUARD = ['netWorth', 'netWorthCents', 'savingsRate', 'fireNumber',
    'fireNumberCents', 'debtToIncomeRatio', 'emergencyFundMonths', 'fooPlacement'];

  function warnOnComputed(patch) {
    if (typeof console === 'undefined') return;
    for (var i = 0; i < COMPUTED_GUARD.length; i++) {
      if (Object.prototype.hasOwnProperty.call(patch, COMPUTED_GUARD[i])) {
        console.warn('[spine] "' + COMPUTED_GUARD[i] + '" is a Computed field (SPEC.md §3). ' +
          'It is derived from raw inputs and must not be stored. Ignoring it.');
        delete patch[COMPUTED_GUARD[i]];
      }
    }
  }

  /**
   * Merge a partial household. Top-level scalars overwrite; `expenses`,
   * `assumptions`, `assumptionOverrides` and `meta` merge one level deep;
   * arrays (people/assets/debts) REPLACE wholesale — element-wise merging
   * of an array of records is ambiguous, so use the upsert helpers instead.
   */
  function updateProfile(patch) {
    if (!patch || typeof patch !== 'object') return getProfile();
    var next = load();
    var p = JSON.parse(JSON.stringify(patch));
    warnOnComputed(p);

    Object.keys(p).forEach(function (key) {
      if (key === 'schemaVersion') return;
      if (key === 'expenses') {
        next.expenses.monthlyEssential = Object.assign({}, next.expenses.monthlyEssential,
          (p.expenses && p.expenses.monthlyEssential) || {});
        if (p.expenses && p.expenses.entries) next.expenses.entries = p.expenses.entries;
        return;
      }
      if (key === 'goals') { next.goals = p.goals; return; }
      if (key === 'assumptions' || key === 'assumptionOverrides' || key === 'meta') {
        next[key] = Object.assign({}, next[key], p[key]);
        return;
      }
      next[key] = p[key];
    });

    save();
    notify();
    return getProfile();
  }

  /* ---- Shaped helpers — the call sites rooms should actually use --------- */

  function upsertIn(list, record) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === record.id) { list[i] = Object.assign({}, list[i], record); return list[i]; }
    }
    list.push(record);
    return record;
  }

  function upsertPerson(person) {
    var h = load();
    var result = upsertIn(h.people, person);
    save(); notify();
    return result;
  }

  /** Ensure a primary adult exists; used by rooms that ask for one person's
   *  numbers without making the visitor name a household first. */
  function ensurePrimaryPerson(label) {
    var h = load();
    var existing = Schema.primaryPerson(h);
    if (existing) return JSON.parse(JSON.stringify(existing));
    var person = Schema.createPerson({ label: label || 'You', role: 'adult' });
    h.people.push(person);
    save(); notify();
    return JSON.parse(JSON.stringify(person));
  }

  function upsertIncomeSource(personId, source) {
    var h = load();
    var person = Schema.personById(h, personId);
    if (!person) return null;
    person.incomeSources = person.incomeSources || [];
    var record = Object.assign({}, source, { personId: personId });
    var result = upsertIn(person.incomeSources, record);
    save(); notify();
    return result;
  }

  function upsertAsset(asset) {
    var h = load();
    var result = upsertIn(h.assets, asset);
    save(); notify();
    return result;
  }

  function upsertDebt(debt) {
    var h = load();
    var result = upsertIn(h.debts, debt);
    save(); notify();
    return result;
  }

  function removeById(collection, id) {
    var h = load();
    var list = h[collection];
    if (!Array.isArray(list)) return false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { list.splice(i, 1); save(); notify(); return true; }
    }
    return false;
  }

  /**
   * Write monthly essential expenses.
   * SPEC.md §12.3 — a tracked figure NEVER overwrites the estimate. Both are
   * stored; `source` records which one is current.
   */
  function setMonthlyExpenses(cents, kind) {
    var h = load();
    var pair = h.expenses.monthlyEssential;
    if (kind === 'tracked') {
      pair.trackedValueCents = cents;
      pair.source = 'tracked';
    } else {
      pair.estimatedValueCents = cents;
      if (!Money.isEntered(pair.trackedValueCents)) pair.source = 'estimated';
    }
    save(); notify();
    return JSON.parse(JSON.stringify(pair));
  }

  /* ---- Goals ------------------------------------------------------------ */

  function upsertGoal(goal) {
    var h = load();
    h.goals = h.goals || [];
    var result = upsertIn(h.goals, goal);
    save(); notify();
    return result;
  }

  function removeGoal(id) {
    var h = load();
    var list = h.goals || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { list.splice(i, 1); save(); notify(); return true; }
    }
    return false;
  }

  /* ---- Expense entries -------------------------------------------------
     The Cash Flow store. Same helpers serve a hand-typed monthly total and
     an imported transaction, because they are the same record shape.     */

  function upsertExpenseEntry(entry) {
    var h = load();
    h.expenses.entries = h.expenses.entries || [];
    var result = upsertIn(h.expenses.entries, entry);
    save(); notify();
    return result;
  }

  function removeExpenseEntry(id) {
    var h = load();
    var list = h.expenses.entries || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { list.splice(i, 1); save(); notify(); return true; }
    }
    return false;
  }

  /** A persisted user override of an Assumption-class field. A "what if"
   *  a room is only previewing must NOT come through here — pass it as a
   *  local override to the calculator instead. SPEC.md §12.2. */
  function setAssumptionOverride(name, value) {
    var h = load();
    if (value === null || value === undefined) delete h.assumptionOverrides[name];
    else h.assumptionOverrides[name] = value;
    save(); notify();
    return Schema.resolveAssumptions(h);
  }

  /* ---- Rooms ------------------------------------------------------------ */

  function registerRoom(roomId) {
    if (!roomId) return getVisitedRooms();
    var h = load();
    h.meta.visitedRooms = h.meta.visitedRooms || [];
    if (h.meta.visitedRooms.indexOf(roomId) === -1) {
      h.meta.visitedRooms.push(roomId);
      save();
      notify();
    }
    return getVisitedRooms();
  }

  function getVisitedRooms() {
    var h = load();
    return (h.meta.visitedRooms || []).slice();
  }

  /* ---- Snapshots --------------------------------------------------------
     Append-only. Each entry freezes the assumptions and reference-table
     versions used AT THAT MOMENT, so a later change to a default (e.g. SWR)
     cannot silently reshape history. SPEC.md §6, §10.                    */

  function listSnapshots() {
    var raw = readRaw(SNAPSHOT_KEY);
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function appendSnapshot(entry) {
    var all = listSnapshots();
    var record = {
      id: Schema.newId('snap'),
      timestamp: new Date().toISOString(),
      rawInputs: (entry && entry.rawInputs) || null,
      assumptionsUsed: (entry && entry.assumptionsUsed) || null,
      referenceVersions: (entry && entry.referenceVersions) || null,
      computedOutputs: (entry && entry.computedOutputs) || null
    };
    all.push(record);
    writeRaw(SNAPSHOT_KEY, JSON.stringify(all));
    return record;
  }

  /* ---- Reset ------------------------------------------------------------ */

  function reset() {
    removeRaw(STORAGE_KEY);
    cache = null;
    load();
    notify();
    return getProfile();
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    SNAPSHOT_KEY: SNAPSHOT_KEY,
    getProfile: getProfile,
    updateProfile: updateProfile,
    onChange: onChange,
    registerRoom: registerRoom,
    getVisitedRooms: getVisitedRooms,
    ensurePrimaryPerson: ensurePrimaryPerson,
    upsertPerson: upsertPerson,
    upsertIncomeSource: upsertIncomeSource,
    upsertAsset: upsertAsset,
    upsertDebt: upsertDebt,
    removeById: removeById,
    setMonthlyExpenses: setMonthlyExpenses,
    upsertGoal: upsertGoal,
    removeGoal: removeGoal,
    upsertExpenseEntry: upsertExpenseEntry,
    removeExpenseEntry: removeExpenseEntry,
    setAssumptionOverride: setAssumptionOverride,
    listSnapshots: listSnapshots,
    appendSnapshot: appendSnapshot,
    reset: reset,
    _migrateLegacy: migrateLegacy
  };
});
