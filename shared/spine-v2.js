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
    lastSaved = clone(cache);
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

  /* The room this page registered as (registerRoom): stamped on every
     field it changes, so the one-pager can say "from The Statement" beside
     a number it did not enter. D-095. */
  var currentRoom = null;
  function stampChanged(now) {
    if (!cache) return;
    cache.meta.confirmedAt = cache.meta.confirmedAt || {};
    cache.meta.source = cache.meta.source || {};
    var current = readings();
    if (lastReadings !== null) {
      Object.keys(current).forEach(function (id) {
        if (!same(current[id], lastReadings[id])) {
          cache.meta.confirmedAt[id] = now;
          if (currentRoom) cache.meta.source[id] = currentRoom;
          /* A real number replaced a guess: it is no longer one. D-094. */
          if (cache.meta.guessed && cache.meta.guessed[id]) delete cache.meta.guessed[id];
        }
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

  /* ---- The command log (D-094) ----------------------------------------------
     Every save diffs the household against the last one saved and records
     what changed — path, before, after — as one undo entry (or one grouped
     entry for a batch). Undo applies the befores, redo the afters. The
     stacks live in meta so they survive a reload and go with a reset. */
  var HISTORY_CAP = 100;
  var HISTORY_SKIP = { 'meta.updatedAt': true, 'meta.confirmedAt': true, 'meta.source': true, 'meta.undoStack': true, 'meta.redoStack': true, 'meta.visitedRooms': true, 'meta.createdAt': true };
  var lastSaved = null;
  var applyingHistory = false;
  var batchDepth = 0, batchChanges = null, batchLabel = null;
  var pendingLabel = null;
  var fieldLabels = null;

  function registerFieldLabels(fn) { fieldLabels = fn; }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function isPlain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /** Every leaf that differs between a and b, as { path, before, after }. */
  function diff(a, b, prefix, out) {
    var keys = {};
    if (isPlain(a)) Object.keys(a).forEach(function (k) { keys[k] = true; });
    if (isPlain(b)) Object.keys(b).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).forEach(function (k) {
      var p = prefix ? prefix + '.' + k : k;
      if (HISTORY_SKIP[p]) return;
      var va = isPlain(a) ? a[k] : undefined, vb = isPlain(b) ? b[k] : undefined;
      if (isPlain(va) && isPlain(vb)) { diff(va, vb, p, out); return; }
      if (!same(va, vb)) out.push({ path: p, before: clone(va), after: clone(vb) });
    });
    return out;
  }
  function getPath(obj, path) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) { if (cur === null || cur === undefined) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function setPath(obj, path, value) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (cur[k] === null || typeof cur[k] !== 'object') cur[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cur = cur[k];
    }
    var last = parts[parts.length - 1];
    if (value === undefined) { if (Array.isArray(cur)) cur.splice(Number(last), 1); else delete cur[last]; }
    else cur[last] = value;
  }
  /* "cash & savings $9,500 → $12,000": the first owned field that moved,
     else the first path. */
  function describeChanges(changes, beforeReadings, afterReadings) {
    if (fieldLabels && beforeReadings && afterReadings) {
      var labels = fieldLabels();
      var ids = Object.keys(labels);
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        if (!same(beforeReadings[id], afterReadings[id])) {
          var f = labels[id];
          var fmt = function (v) { return v === null || v === undefined ? '—' : (f.format ? f.format(v) : String(v)); };
          return f.label + ' ' + fmt(beforeReadings[id]) + ' → ' + fmt(afterReadings[id]);
        }
      }
    }
    if (!changes.length) return '';
    /* No owned field moved: name the part of the household that did, in
       words — "an asset", "a debt" — rather than a dot path. D-100. */
    var tops = {};
    changes.forEach(function (c) { tops[String(c.path).split('.')[0]] = true; });
    var keys = Object.keys(tops);
    if (keys.length === 1) {
      var word = PART_WORDS[keys[0]] || keys[0];
      return (changes.length === 1 ? 'Changed ' : 'Changed ') + word + (changes.length > 1 ? ' (' + changes.length + ' fields)' : '');
    }
    return changes.length + ' changes across ' + keys.map(function (k) { return PART_WORDS[k] || k; }).join(', ');
  }
  var PART_WORDS = { people: 'a person', assets: 'an asset', debts: 'a debt', goals: 'a goal', expenses: 'spending', insurance: 'insurance',
    retirement: 'the retirement plan', targets: 'a target', meta: 'a setting', oneOffs: 'a one-off', ratings: 'a rating', rerank: 'the rerank',
    skills: 'a skill', scenarios: 'a scenario', properties: 'a property', futureIncome: 'future income', values: 'your values', community: 'community',
    estate: 'estate basics', giving: 'giving', decumulation: 'the drawdown', tax: 'tax facts', career: 'the offer', partner: 'the split', kids: 'the kids',
    housing: 'the place', purchase: 'the purchase', variableIncome: 'the buffer', dependents: 'who depends on you', assumptions: 'an assumption', assumptionOverrides: 'an assumption',
    ledger: 'the ledger', budget: 'the budget' };
  function record(changes, label) {
    if (!changes.length) return;
    cache.meta.undoStack = cache.meta.undoStack || [];
    if (batchDepth > 0) {
      changes.forEach(function (c) {
        var seen = batchChanges.filter(function (x) { return x.path === c.path; })[0];
        if (seen) seen.after = c.after; else batchChanges.push(c);
      });
      if (!batchLabel && label) batchLabel = label;
      return;
    }
    cache.meta.undoStack.push({ label: label, ts: new Date().toISOString(), changes: changes });
    while (cache.meta.undoStack.length > HISTORY_CAP) cache.meta.undoStack.shift();
    cache.meta.redoStack = [];
  }

  function save(opts) {
    if (!cache) return;
    var now = new Date().toISOString();
    cache.meta.updatedAt = now;
    var beforeReadings = lastReadings;
    stampChanged(now);
    if (!applyingHistory && !(opts && opts.record === false)) {
      var changes = lastSaved ? diff(lastSaved, cache, '', []) : [];
      if (changes.length) {
        var label = pendingLabel || describeChanges(changes, beforeReadings, lastReadings);
        record(changes, label);
        pendingLabel = null;
      }
    }
    lastSaved = clone(cache);
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
      if (evt.key !== STORAGE_KEY) return;
      /* Reload rather than just drop: the command log diffs against the
         last thing SAVED, and that is now the other tab's. Both tabs read
         one stack, so an undo here takes back the other tab's write too —
         one log, whichever tab holds the button. D-100. */
      cache = null; lastSaved = null; lastReadings = null;
      load();
      notify();
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
          || key === 'targets' || key === 'allocation' || key === 'insurance' || key === 'retirement'
          || key === 'skills') {
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

  /* ---- set / get / batch / undo / redo (D-094) ------------------------------ */

  /** One write to a dot path, labelled for the undo button. */
  function set(path, value, label) {
    var h = load();
    pendingLabel = label || null;
    setPath(h, path, value);
    save(); notify();
    return getPath(getProfile(), path);
  }
  function get(path) { return getPath(getProfile(), path); }

  /** Several writes as one undo entry. */
  function batch(label, fn) {
    load();
    if (batchDepth === 0) { batchChanges = []; batchLabel = label || null; }
    batchDepth++;
    try { fn(); }
    finally {
      batchDepth--;
      if (batchDepth === 0) {
        var changes = batchChanges; batchChanges = null;
        var lbl = batchLabel; batchLabel = null;
        if (changes.length) {
          cache.meta.undoStack = cache.meta.undoStack || [];
          cache.meta.undoStack.push({ label: lbl || describeChanges(changes, null, null), ts: new Date().toISOString(), changes: changes });
          while (cache.meta.undoStack.length > HISTORY_CAP) cache.meta.undoStack.shift();
          cache.meta.redoStack = [];
          save({ record: false }); notify();
        }
      }
    }
  }
  function applyEntry(entry, direction) {
    applyingHistory = true;
    try {
      entry.changes.forEach(function (c) { setPath(cache, c.path, clone(direction === 'undo' ? c.before : c.after)); });
      save({ record: false });
    } finally { applyingHistory = false; }
    notify();
  }
  function undo() {
    var h = load();
    var stack = h.meta.undoStack || [];
    if (!stack.length) return null;
    var entry = stack.pop();
    h.meta.redoStack = h.meta.redoStack || [];
    h.meta.redoStack.push(entry);
    applyEntry(entry, 'undo');
    return entry;
  }
  function redo() {
    var h = load();
    var stack = h.meta.redoStack || [];
    if (!stack.length) return null;
    var entry = stack.pop();
    h.meta.undoStack = h.meta.undoStack || [];
    h.meta.undoStack.push(entry);
    applyEntry(entry, 'redo');
    return entry;
  }
  function peekUndo() { var s = load().meta.undoStack || []; return s.length ? clone(s[s.length - 1]) : null; }
  function peekRedo() { var s = load().meta.redoStack || []; return s.length ? clone(s[s.length - 1]) : null; }
  function canUndo() { return !!peekUndo(); }
  function canRedo() { return !!peekRedo(); }
  function historySize() { var m = load().meta; return { undo: (m.undoStack || []).length, redo: (m.redoStack || []).length, cap: HISTORY_CAP }; }

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
    /* The merged record goes back through the constructor, so the rule
       "deductible only when linked to an income entry" holds whatever a
       form sends (D-128). */
    /* A patch that adds a link, or a payer, is a change of path: the
       stored `produced` must not pin the old one (D-129). */
    var e = entry || {};
    if (e.produced === undefined) {
      if (typeof e.linkedIncomeId === 'string' && e.linkedIncomeId) e = Object.assign({}, e, { produced: 'linked' });
      else if (e.reimbursableFrom || e.reimbursable === true) e = Object.assign({}, e, { produced: 'reimbursable' });
    }
    var merged = upsertIn(h.expenses.entries, e);
    var normalised = Schema.createExpenseEntry(merged);
    Object.keys(merged).forEach(function (k) { delete merged[k]; });
    Object.keys(normalised).forEach(function (k) { merged[k] = normalised[k]; });
    save(); notify();
    return merged;
  }

  /** A reimbursable expense paid back: the credit lands on the day it came,
   *  never in the original month. D-129. */
  function markReimbursed(id, when) {
    var w = when || {};
    var h = load();
    var e = (h.expenses.entries || []).filter(function (x) { return x.id === id; })[0];
    if (!e || e.produced !== 'reimbursable') return null;
    var today = new Date();
    var iso = today.getFullYear() + '-' + (today.getMonth() + 1 < 10 ? '0' : '') + (today.getMonth() + 1) + '-' + (today.getDate() < 10 ? '0' : '') + today.getDate();
    pendingLabel = 'Paid back: ' + (e.descriptor || e.categoryId);
    return upsertExpenseEntry({ id: id, reimbursementStatus: 'received', dateReceived: typeof w.dateReceived === 'string' && w.dateReceived ? w.dateReceived : iso,
      receivedAmountCents: Money.isEntered(w.receivedAmountCents) ? w.receivedAmountCents : (Money.isEntered(e.expectedAmountCents) ? e.expectedAmountCents : e.amountCents) });
  }

  /* ---- The ledger (D-128) ------------------------------------------------ */

  function upsertIncomeEntry(entry) {
    var h = load();
    h.ledger = h.ledger || Schema.createLedger({});
    var merged = upsertIn(h.ledger.income, entry);
    var normalised = Schema.createIncomeEntry(merged);
    Object.keys(merged).forEach(function (k) { delete merged[k]; });
    Object.keys(normalised).forEach(function (k) { merged[k] = normalised[k]; });
    save(); notify();
    return merged;
  }
  function removeIncomeEntry(id) {
    var h = load();
    var list = (h.ledger && h.ledger.income) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { list.splice(i, 1); save(); notify(); return true; }
    }
    return false;
  }
  function upsertIncomeCost(entryId, cost) {
    var h = load();
    var entry = ((h.ledger && h.ledger.income) || []).filter(function (e) { return e.id === entryId; })[0];
    if (!entry || !Schema.costsAllowed(entry.kind)) return null;
    entry.costs = entry.costs || [];
    var merged = upsertIn(entry.costs, cost);
    var normalised = Schema.createIncomeCost(merged);
    Object.keys(merged).forEach(function (k) { delete merged[k]; });
    Object.keys(normalised).forEach(function (k) { merged[k] = normalised[k]; });
    save(); notify();
    return merged;
  }
  function removeIncomeCost(entryId, costId) {
    var h = load();
    var entry = ((h.ledger && h.ledger.income) || []).filter(function (e) { return e.id === entryId; })[0];
    if (!entry) return false;
    for (var i = 0; i < (entry.costs || []).length; i++) {
      if (entry.costs[i].id === costId) { entry.costs.splice(i, 1); save(); notify(); return true; }
    }
    return false;
  }
  /** Close a month: append its record once. A second close is refused. */
  function closeMonth(record) {
    var h = load();
    h.ledger = h.ledger || Schema.createLedger({});
    var r = Schema.createMonthRecord(record);
    if (!r.id) return { ok: false, reason: 'A month record needs a YYYY-MM month.' };
    if (h.ledger.months.some(function (m) { return m.id === r.id; })) return { ok: false, reason: r.label + ' is already closed.' };
    if (!r.closedAt) r.closedAt = new Date().toISOString();
    h.ledger.months.push(r);
    h.ledger.months.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    pendingLabel = 'Closed ' + r.label;
    save(); notify();
    return { ok: true, reason: null, record: JSON.parse(JSON.stringify(r)) };
  }
  /** A late entry against a closed month: only actualRevised moves. */
  function reviseMonth(monthId, actualRevised) {
    var h = load();
    var m = ((h.ledger && h.ledger.months) || []).filter(function (x) { return x.id === monthId; })[0];
    if (!m) return { ok: false, reason: 'No closed month ' + monthId + '.' };
    var next = {};
    Schema.BUDGET_BUCKETS.forEach(function (b) { next[b] = actualRevised && Money.isEntered(actualRevised[b]) ? actualRevised[b] : m.actual[b]; });
    m.actualRevised = next;
    save({ record: false }); notify();
    return { ok: true, reason: null };
  }
  function setBudgetEstimate(month, bucket, cents, label) {
    var h = load();
    h.budget = h.budget || Schema.createBudget({});
    h.budget.estimated = h.budget.estimated || {};
    h.budget.estimated[month] = h.budget.estimated[month] || {};
    if (Money.isEntered(cents)) h.budget.estimated[month][bucket] = cents; else delete h.budget.estimated[month][bucket];
    if (!Object.keys(h.budget.estimated[month]).length) delete h.budget.estimated[month];
    pendingLabel = label || ('Expected ' + bucket + ' for ' + Schema.monthLabel(month));
    save(); notify();
    return h.budget.estimated[month] ? h.budget.estimated[month][bucket] : null;
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
    currentRoom = roomId;
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
      household: withoutHistory(getProfile()),
      snapshots: listSnapshots()
    };
  }
  /* The command log is this browser's, not the household's: a share code
     carries the numbers, never a hundred undo entries. D-094. */
  function withoutHistory(h) {
    if (h && h.meta) { delete h.meta.undoStack; delete h.meta.redoStack; }
    return h;
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
  /**
   * mergeImport(text) — ADDS a file to the household here instead of
   * replacing it: records the lists lack, blank scalars, snapshots not
   * already held. shared/importer.js decides what "adds" means; this is
   * the write. One command-log entry, so one undo takes it back. D-125.
   */
  function mergeImport(text, Importer) {
    var check = inspectImport(text);
    if (!check.ok) return check;
    if (!Importer || typeof Importer.merge !== 'function') return { ok: false, reason: 'The importer is not loaded.' };
    var merged = Importer.merge(getProfile(), Schema.createHousehold(check.household));
    var h = load();
    var keep = { undoStack: h.meta.undoStack || [], redoStack: h.meta.redoStack || [], visitedRooms: h.meta.visitedRooms || [] };
    var next = Schema.createHousehold(merged.household);
    Object.keys(h).forEach(function (k) { delete h[k]; });
    Object.keys(next).forEach(function (k) { h[k] = next[k]; });
    h.meta = h.meta || {};
    h.meta.undoStack = keep.undoStack; h.meta.redoStack = keep.redoStack; h.meta.visitedRooms = keep.visitedRooms;
    pendingLabel = 'Added ' + merged.added.total + (merged.added.total === 1 ? ' thing' : ' things') + ' from a file';
    save(); notify();
    var have = {};
    listSnapshots().forEach(function (s) { have[s.id] = true; });
    var newSnaps = (check.snapshots || []).filter(function (s) { return s && s.id && !have[s.id]; });
    if (newSnaps.length) writeRaw(SNAPSHOT_KEY, JSON.stringify(listSnapshots().concat(newSnaps).sort(function (a, b) { return String(a.timestamp).localeCompare(String(b.timestamp)); })));
    return { ok: true, reason: null, added: merged.added, snapshotsAdded: newSnaps.length, household: getProfile() };
  }

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
    lastSaved = null;
    load();
    notify();
    return getProfile();
  }

  /** Drop the cache and read storage again — what a page load does. The
   *  tests use it to prove the command log survives one. */
  function _reload() {
    cache = null;
    lastReadings = null;
    lastSaved = null;
    return load();
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
    markReimbursed: markReimbursed,
    upsertIncomeEntry: upsertIncomeEntry,
    removeIncomeEntry: removeIncomeEntry,
    upsertIncomeCost: upsertIncomeCost,
    removeIncomeCost: removeIncomeCost,
    closeMonth: closeMonth,
    reviseMonth: reviseMonth,
    setBudgetEstimate: setBudgetEstimate,
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
    registerFieldLabels: registerFieldLabels,
    set: set,
    get: get,
    batch: batch,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    peekUndo: peekUndo,
    peekRedo: peekRedo,
    historySize: historySize,
    HISTORY_CAP: HISTORY_CAP,
    confirm: confirm,
    confirmedAt: confirmedAt,
    exportObject: exportObject,
    exportJSON: exportJSON,
    exportFilename: exportFilename,
    inspectImport: inspectImport,
    importJSON: importJSON,
    mergeImport: mergeImport,
    toShareCode: toShareCode,
    fromShareCode: fromShareCode,
    shareFragment: shareFragment,
    codeFromFragment: codeFromFragment,
    reset: reset,
    _reload: _reload,
    _migrateLegacy: migrateLegacy
  };
});
