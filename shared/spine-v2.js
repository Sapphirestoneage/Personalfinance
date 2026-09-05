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
    loadUncached();
    /* First reading of every owned field, so the first save() has
       something to compare against. See registerFieldReaders(). */
    if (lastReadings === null) lastReadings = readings();
    return cache;
  }

  function loadUncached() {
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

  /* ---- The clock ----------------------------------------------------------
     Every owned field carries the moment its value was last set or
     re-confirmed, in meta.confirmedAt[fieldId]. The spine cannot know what
     the fields ARE — that map lives in shared/ownership.js, which loads
     after this file — so ownership registers a reader here, and save()
     diffs the readings before and after each write. A room never stamps
     anything itself; it just writes, as before. DECISIONS.md D-056.      */

  var fieldReaders = null;     /* fn(household) -> { fieldId: value | null } */
  var lastReadings = null;     /* readings as of the last load or save */

  function registerFieldReaders(fn) {
    fieldReaders = typeof fn === 'function' ? fn : null;
    /* Registered after the first load: prime from the current state so the
       next save compares against something real rather than stamping
       every field at once. */
    if (cache && fieldReaders) lastReadings = readings();
  }

  function readings() {
    if (!fieldReaders || !cache) return {};
    try { return fieldReaders(cache) || {}; } catch (e) { return {}; }
  }

  function same(a, b) {
    return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  }

  function stampChanged(now) {
    if (!cache) return;
    cache.meta.confirmedAt = cache.meta.confirmedAt || {};
    var current = readings();
    if (lastReadings !== null) {
      Object.keys(current).forEach(function (id) {
        if (!same(current[id], lastReadings[id])) cache.meta.confirmedAt[id] = now;
      });
    }
    lastReadings = current;
  }

  /** "Yes, still $9,500" — re-stamp a field without changing its value. */
  function confirm(fieldId) {
    var h = load();
    h.meta.confirmedAt = h.meta.confirmedAt || {};
    h.meta.confirmedAt[fieldId] = new Date().toISOString();
    save(); notify();
    return h.meta.confirmedAt[fieldId];
  }

  /** ISO timestamp of the last set/confirm, or null when never stamped —
   *  which every household saved before D-056 is, for every field. */
  function confirmedAt(fieldId) {
    var h = load();
    var m = h.meta.confirmedAt || {};
    return m[fieldId] || null;
  }

  function save() {
    if (!cache) return;
    var now = new Date().toISOString();
    cache.meta.updatedAt = now;
    stampChanged(now);
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
      if (key === 'assumptions' || key === 'assumptionOverrides' || key === 'meta'
          || key === 'targets' || key === 'allocation' || key === 'insurance' || key === 'retirement') {
        /* Small fact objects merge, so a room writing one field cannot
           wipe another room's. D-066. */
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

  /* The 10x Statement's lists (D-066): same shape as the others. */
  function upsertFutureIncome(record) {
    var h = load();
    h.futureIncome = h.futureIncome || [];
    var result = upsertIn(h.futureIncome, record);
    save(); notify();
    return result;
  }

  function upsertProperty(record) {
    var h = load();
    h.property = h.property || [];
    var result = upsertIn(h.property, record);
    save(); notify();
    return result;
  }

  function upsertScenario(record) {
    var h = load();
    h.scenarios = h.scenarios || [];
    var result = upsertIn(h.scenarios, record);
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
      /* Every owned field's value at this moment, by field id, so a later
         delta never has to re-derive an old input from an old shape. */
      fields: (entry && entry.fields) || (function () { load(); return readings(); })(),
      assumptionsUsed: (entry && entry.assumptionsUsed) || null,
      referenceVersions: (entry && entry.referenceVersions) || null,
      computedOutputs: (entry && entry.computedOutputs) || null
    };
    all.push(record);
    writeRaw(SNAPSHOT_KEY, JSON.stringify(all));
    return record;
  }

  /* Snapshots are READ BACK now, not just written. Two reads:
       latestSnapshot()            the most recent record, or null
       snapshotDelta(id, current)  how `id` has moved since it
     `id` may be a field id (compared against `fields`) or a computed-output
     id (compared against `computedOutputs`). A stored output may be a bare
     number or a {status, value} Result — both are read. DECISIONS.md D-056. */

  function latestSnapshot() {
    var all = listSnapshots();
    return all.length ? all[all.length - 1] : null;
  }

  function storedValue(bucket, id) {
    if (!bucket || !Object.prototype.hasOwnProperty.call(bucket, id)) return undefined;
    var v = bucket[id];
    if (v && typeof v === 'object' && 'status' in v) return v.status === 'ok' ? v.value : null;
    return v;
  }

  function snapshotDelta(id, currentValue) {
    var snap = latestSnapshot();
    if (!snap) return null;
    var before = storedValue(snap.computedOutputs, id);
    if (before === undefined) before = storedValue(snap.fields, id);
    if (before === undefined) return null;                 /* never recorded */
    var after = (currentValue && typeof currentValue === 'object' && 'status' in currentValue)
      ? (currentValue.status === 'ok' ? currentValue.value : null)
      : (currentValue === undefined ? null : currentValue);
    var numeric = typeof before === 'number' && typeof after === 'number';
    return {
      id: id,
      since: snap.timestamp,
      snapshotId: snap.id,
      before: before,
      after: after,
      delta: numeric ? after - before : null,
      changed: !same(before, after)
    };
  }

  /* ---- Export / import / share ---------------------------------------------
     Nothing leaves the browser unless the person carries it out by hand: a
     file they download, or a link whose fragment (#h=…) never reaches a
     server. BRIEF §1.6, DECISIONS.md D-059.                              */

  var EXPORT_FORMAT = 'slaf-export';
  var EXPORT_VERSION = 1;

  /** The whole state as one JSON string: household + snapshots. */
  function exportObject() {
    return {
      format: EXPORT_FORMAT,
      exportVersion: EXPORT_VERSION,
      schemaVersion: Schema.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      household: getProfile(),
      snapshots: listSnapshots()
    };
  }
  function exportJSON() { return JSON.stringify(exportObject(), null, 2); }

  function exportFilename(now) {
    var d = now ? new Date(now) : new Date();
    var iso = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    return 'slaf-household-' + iso.slice(0, 10) + '.json';
  }

  /**
   * Check a payload without touching storage. Returns
   *   { ok, reason, household, snapshots, schemaVersion, exportedAt }
   * A payload from a NEWER schema is refused: the migrations only run
   * forward, and guessing at a shape this build has never seen is how a
   * blob gets quarantined.
   */
  function inspectImport(text) {
    var parsed;
    try { parsed = typeof text === 'string' ? JSON.parse(text) : text; }
    catch (e) { return { ok: false, reason: 'That is not a JSON file.' }; }
    if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'That is not a household export.' };
    /* A bare household (the shape this app stores) is accepted too. */
    var household = parsed.format === EXPORT_FORMAT ? parsed.household : parsed;
    var snapshots = parsed.format === EXPORT_FORMAT ? (parsed.snapshots || []) : [];
    if (!household || typeof household !== 'object' || !('schemaVersion' in household)) {
      return { ok: false, reason: 'That file has no household in it.' };
    }
    if (household.schemaVersion > Schema.SCHEMA_VERSION) {
      return { ok: false, reason: 'That file was saved by a newer version of this app (schema '
        + household.schemaVersion + '; this one reads up to ' + Schema.SCHEMA_VERSION + ').' };
    }
    if (!Array.isArray(snapshots)) return { ok: false, reason: 'The snapshots in that file are not a list.' };
    return {
      ok: true, reason: null, household: household, snapshots: snapshots,
      schemaVersion: household.schemaVersion,
      exportedAt: parsed.exportedAt || null
    };
  }

  /**
   * importJSON(text) — REPLACES the stored household and snapshots. The
   * caller shows the confirm; this does the write. Older schemas migrate
   * on the reload that follows, through the same path a stored blob takes.
   */
  function importJSON(text) {
    var check = inspectImport(text);
    if (!check.ok) return check;
    writeRaw(STORAGE_KEY, JSON.stringify(check.household));
    writeRaw(SNAPSHOT_KEY, JSON.stringify(check.snapshots));
    cache = null;
    lastReadings = null;
    load();
    notify();
    return { ok: true, reason: null, household: getProfile(), snapshots: listSnapshots() };
  }

  /* ---- Share code: the export, deflated and base64url'd into a fragment.
     'z' prefix = deflate-raw (CompressionStream), 'j' = plain JSON, so a
     browser without CompressionStream can still read a code it did not
     make. Both directions are async because the streams are.             */

  function bytesToBase64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    var b64 = (typeof btoa === 'function') ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function base64urlToBytes(str) {
    var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = (typeof atob === 'function') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function utf8Encode(str) { return new TextEncoder().encode(str); }
  function utf8Decode(bytes) { return new TextDecoder().decode(bytes); }

  function pipeThrough(bytes, stream) {
    var writer = stream.writable.getWriter();
    writer.write(bytes); writer.close();
    var reader = stream.readable.getReader();
    var chunks = [], total = 0;
    return (function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          var out = new Uint8Array(total), off = 0;
          chunks.forEach(function (c) { out.set(c, off); off += c.length; });
          return out;
        }
        chunks.push(r.value); total += r.value.length;
        return pump();
      });
    })();
  }

  function hasCompression() {
    return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  }

  /** Promise<string>. Small: the export without pretty-printing, deflated. */
  function toShareCode(obj) {
    var json = JSON.stringify(obj || exportObject());
    var bytes = utf8Encode(json);
    if (!hasCompression()) return Promise.resolve('j' + bytesToBase64url(bytes));
    return pipeThrough(bytes, new CompressionStream('deflate-raw')).then(function (z) {
      return 'z' + bytesToBase64url(z);
    });
  }

  /** Promise<object> — the export object the code carries, or a rejection. */
  function fromShareCode(code) {
    var c = String(code || '').trim();
    if (!c) return Promise.reject(new Error('Empty share code.'));
    var kind = c.charAt(0), body = c.slice(1);
    var bytes;
    try { bytes = base64urlToBytes(body); }
    catch (e) { return Promise.reject(new Error('That share code is not readable.')); }
    var text = kind === 'z'
      ? (hasCompression()
          ? pipeThrough(bytes, new DecompressionStream('deflate-raw')).then(utf8Decode)
          : Promise.reject(new Error('This browser cannot open a compressed share code.')))
      : kind === 'j' ? Promise.resolve(utf8Decode(bytes))
      : Promise.reject(new Error('That share code is not one this app made.'));
    return text.then(function (json) {
      var check = inspectImport(json);
      if (!check.ok) throw new Error(check.reason);
      return JSON.parse(json);
    });
  }

  /** The fragment for a URL: '#h=' + code. */
  function shareFragment(obj) {
    return toShareCode(obj).then(function (code) { return '#h=' + code; });
  }
  function codeFromFragment(hash) {
    var m = /(?:^|[#&])h=([^&]+)/.exec(String(hash || ''));
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* ---- Reset ------------------------------------------------------------ */

  function reset() {
    removeRaw(STORAGE_KEY);
    cache = null;
    lastReadings = null;
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
    upsertFutureIncome: upsertFutureIncome,
    upsertProperty: upsertProperty,
    upsertScenario: upsertScenario,
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
    latestSnapshot: latestSnapshot,
    snapshotDelta: snapshotDelta,
    registerFieldReaders: registerFieldReaders,
    confirm: confirm,
    confirmedAt: confirmedAt,
    exportObject: exportObject,
    exportJSON: exportJSON,
    exportFilename: exportFilename,
    inspectImport: inspectImport,
    importJSON: importJSON,
    toShareCode: toShareCode,
    fromShareCode: fromShareCode,
    shareFragment: shareFragment,
    codeFromFragment: codeFromFragment,
    reset: reset,
    _migrateLegacy: migrateLegacy
  };
});
