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
  var QUARANTINE_KEY = 'slaf.household.unreadable';
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

  /* ---- Schema migration -------------------------------------------------
     Keyed by the version being migrated TO. To bump Schema.SCHEMA_VERSION
     from N to N+1, add an entry `N+1` here that takes the old shape and
     returns the new one. Migrations chain: a blob at v2 with a target of v4
     runs 3 then 4.

     test/run.js fails the build if SCHEMA_VERSION is bumped without a
     matching entry, because the alternative is what this code used to do:
     a stored blob whose version did not match exactly fell through to a
     FRESH household, and the next write overwrote the user's real data with
     it. Silently. Bumping the version was a data-loss event.

     Nothing is ever discarded now. A blob that cannot be brought forward is
     copied to QUARANTINE_KEY and left where it is, the session runs in
     memory, and storageState() says why so a room can tell the person
     rather than pretending they are new here.                            */

  var MIGRATIONS = {
    /* 3: function (old) { return Object.assign({}, old, { … }); }, */
  };

  var storage = { status: 'fresh', storedVersion: null, targetVersion: null, writable: true };

  /**
   * Bring a parsed blob up to the current schema version, or refuse.
   * Returns { ok: true, household } or { ok: false, reason, storedVersion }.
   */
  function migrateStored(parsed) {
    var target = Schema.SCHEMA_VERSION;
    var version = parsed.schemaVersion;

    if (typeof version !== 'number') {
      return { ok: false, reason: 'unversioned', storedVersion: null };
    }
    if (version === target) {
      return { ok: true, household: Schema.createHousehold(parsed), migrated: false };
    }
    if (version > target) {
      /* Saved by a newer build than this one. Reading it would mean guessing
         at fields this code has never heard of, and writing would destroy
         them. Neither is acceptable. */
      return { ok: false, reason: 'ahead', storedVersion: version };
    }

    var working = parsed;
    while (version < target) {
      var next = version + 1;
      var step = MIGRATIONS[next];
      if (typeof step !== 'function') {
        return { ok: false, reason: 'no-migration', storedVersion: parsed.schemaVersion,
                 stuckAt: version };
      }
      working = step(working);
      version = next;
    }
    working.schemaVersion = target;
    return { ok: true, household: Schema.createHousehold(working), migrated: true };
  }

  /** Copy a blob we cannot read somewhere it will survive, and say so. */
  function quarantine(raw, reason, storedVersion) {
    var existing = readRaw(QUARANTINE_KEY);
    if (!existing) {
      writeRaw(QUARANTINE_KEY, JSON.stringify({
        quarantinedAt: new Date().toISOString(),
        reason: reason,
        storedVersion: storedVersion,
        readerVersion: Schema.SCHEMA_VERSION,
        blob: raw
      }));
    }
    storage = {
      status: reason,
      storedVersion: storedVersion,
      targetVersion: Schema.SCHEMA_VERSION,
      /* The original key is left exactly as it is. Writing over it is the
         one thing that would make this unrecoverable. */
      writable: false
    };
  }

  /* ---- Load / save ------------------------------------------------------ */

  var cache = null;

  function load() {
    if (cache) return cache;
    var raw = readRaw(STORAGE_KEY);
    if (raw) {
      var parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }

      if (parsed && typeof parsed === 'object') {
        var result = migrateStored(parsed);
        if (result.ok) {
          cache = result.household;
          storage = { status: result.migrated ? 'migrated' : 'ok',
                      storedVersion: parsed.schemaVersion,
                      targetVersion: Schema.SCHEMA_VERSION, writable: true };
          if (result.migrated) save();
          return cache;
        }
        quarantine(raw, result.reason, result.storedVersion);
        cache = Schema.createHousehold({ meta: { createdAt: new Date().toISOString() } });
        return cache;
      }

      /* Unparseable. Keep it — a truncated blob is sometimes recoverable by
         hand, and it is never ours to throw away. */
      quarantine(raw, 'corrupt', null);
      cache = Schema.createHousehold({ meta: { createdAt: new Date().toISOString() } });
      return cache;
    }

    var migrated = loadLegacy();
    if (migrated) {
      cache = migrated;
      storage = { status: 'legacy', storedVersion: null,
                  targetVersion: Schema.SCHEMA_VERSION, writable: true };
      save();
      return cache;
    }
    cache = Schema.createHousehold({ meta: { createdAt: new Date().toISOString() } });
    storage = { status: 'fresh', storedVersion: null,
                targetVersion: Schema.SCHEMA_VERSION, writable: true };
    return cache;
  }

  function save() {
    if (!cache) return;
    cache.meta.updatedAt = new Date().toISOString();
    if (!storage.writable) {
      /* Something we could not read is sitting in that key. The session
         still works — it just does not persist, which is the correct cost
         of not destroying whatever is already there. */
      memoryStore[STORAGE_KEY] = JSON.stringify(cache);
      return;
    }
    writeRaw(STORAGE_KEY, JSON.stringify(cache));
  }

  /**
   * What happened when this session's data was loaded:
   *   ok / fresh / migrated / legacy  — normal, and writable
   *   ahead        — saved by a newer build; left untouched
   *   no-migration — a version bump shipped without a migration step
   *   corrupt      — unparseable blob, kept aside
   *   unversioned  — an object with no schemaVersion at all
   * Everything but the first four is read-only for the session, and the
   * original blob is preserved under the quarantine key.
   */
  function storageState() {
    load();
    return {
      status: storage.status,
      storedVersion: storage.storedVersion,
      targetVersion: storage.targetVersion,
      writable: storage.writable,
      quarantineKey: storage.writable ? null : QUARANTINE_KEY
    };
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

  /**
   * Set (or clear) the SWAN Number. SPEC.md §13 Tier 1.5.
   * Passing a basis clears the other basis's figure, so there is never a
   * stale second target sitting behind the one on screen. Passing null
   * clears the target entirely; the note survives on its own.
   */
  function setSwanTarget(fields) {
    var h = load();
    var f = fields || {};
    var next = Schema.createSwanTarget(h.swan);

    if (Object.prototype.hasOwnProperty.call(f, 'note')) next.note = f.note;

    if (f.basis === 'amount') {
      next.basis = 'amount';
      next.targetCents = f.targetCents === undefined ? next.targetCents : f.targetCents;
      next.targetMonths = null;
      next.setAt = new Date().toISOString();
    } else if (f.basis === 'months') {
      next.basis = 'months';
      next.targetMonths = f.targetMonths === undefined ? next.targetMonths : f.targetMonths;
      next.targetCents = null;
      next.setAt = new Date().toISOString();
    } else if (f.basis === null) {
      next.basis = null;
      next.targetCents = null;
      next.targetMonths = null;
      next.setAt = null;
    }

    h.swan = next;
    save(); notify();
    return getProfile().swan;
  }

  /**
   * The stated values, in the order they were named. Replaces the list
   * wholesale — a ranking is one answer, not a set of independent ones.
   * SPEC.md §13 Tier 2.
   */
  function setStatedValues(ids) {
    var h = load();
    h.valuesProfile = Schema.createValuesProfile(h.valuesProfile);
    h.valuesProfile.stated = (ids || []).slice();
    save(); notify();
    return getProfile().valuesProfile;
  }

  /**
   * Say which value one spending category serves. `valueId` of null is an
   * explicit "nothing I named" — stored, and distinct from a category that
   * has never been looked at. Passing undefined removes the assignment and
   * puts the category back to unlooked-at.
   */
  function assignCategoryToValue(categoryId, valueId) {
    if (!categoryId) return getProfile().valuesProfile;
    var h = load();
    h.valuesProfile = Schema.createValuesProfile(h.valuesProfile);
    if (valueId === undefined) delete h.valuesProfile.assignments[categoryId];
    else h.valuesProfile.assignments[categoryId] = valueId;
    save(); notify();
    return getProfile().valuesProfile;
  }

  /**
   * One 1-10 rating, in the single ratings store. A null value REMOVES the
   * rating rather than storing a zero — there is no zero on this scale, and
   * "not rated" has to stay distinct from "rated low". See
   * shared/rating.js, which owns the scale itself.
   */
  function setRating(scope, itemId, value) {
    if (!scope || !itemId) return getProfile().ratings;
    var h = load();
    h.ratings = Schema.createRatings(h.ratings);
    h.ratings[scope] = h.ratings[scope] || {};
    if (value === null || value === undefined) delete h.ratings[scope][itemId];
    else h.ratings[scope][itemId] = value;
    save(); notify();
    return getProfile().ratings;
  }

  /**
   * Add or update one before/after worth check. Timestamps are stamped here
   * rather than taken from the caller, so "when did I predict this" cannot
   * be back-dated by a room. SPEC.md §13 Tier 1.
   */
  function upsertWorthCheck(entry) {
    var h = load();
    h.worthChecks = (h.worthChecks || []).map(function (w) { return Schema.createWorthCheck(w); });

    /* The two dates are the spine's, not the caller's. A room that could
       write predictedAt could say it predicted something last year, which
       is exactly the claim the before/after pair exists to substantiate.
       Whatever a caller sends for them is dropped on the floor. */
    var patch = Object.assign({}, entry);
    delete patch.predictedAt;
    delete patch.ratedAt;

    var next = Schema.createWorthCheck(patch);
    var found = false;
    h.worthChecks = h.worthChecks.map(function (w) {
      if (w.id !== next.id) return w;
      found = true;
      var merged = Object.assign({}, w, patch);
      merged.predictedAt = w.predictedAt;
      merged.ratedAt = w.ratedAt;
      /* Stamped once, when the rating first appears — a later revision of
         the same rating is a change of mind, not a new prediction. */
      if (Money.isEntered(patch.predictedRating) && !Money.isEntered(w.predictedRating)) {
        merged.predictedAt = new Date().toISOString();
      }
      if (Money.isEntered(patch.actualRating) && !Money.isEntered(w.actualRating)) {
        merged.ratedAt = new Date().toISOString();
      }
      return Schema.createWorthCheck(merged);
    });
    if (!found) {
      if (Money.isEntered(next.predictedRating)) next.predictedAt = new Date().toISOString();
      if (Money.isEntered(next.actualRating)) next.ratedAt = new Date().toISOString();
      h.worthChecks.push(next);
    }
    save(); notify();
    return getProfile().worthChecks;
  }

  function removeWorthCheck(id) {
    var h = load();
    h.worthChecks = (h.worthChecks || []).filter(function (w) { return w.id !== id; });
    save(); notify();
    return getProfile().worthChecks;
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
    setSwanTarget: setSwanTarget,
    storageState: storageState,
    _MIGRATIONS: MIGRATIONS,
    setRating: setRating,
    upsertWorthCheck: upsertWorthCheck,
    removeWorthCheck: removeWorthCheck,
    setStatedValues: setStatedValues,
    assignCategoryToValue: assignCategoryToValue,
    listSnapshots: listSnapshots,
    appendSnapshot: appendSnapshot,
    reset: reset,
    _migrateLegacy: migrateLegacy
  };
});
