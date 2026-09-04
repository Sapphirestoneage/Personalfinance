/* ==========================================================================
   shared/export.js — the character export, and the only thing another tool
   is asked to understand about this one.
   --------------------------------------------------------------------------
   See FORMAT.md for the contract this file produces. That document is the
   spec; this is the implementation, and if the two ever disagree the document
   is what an importer was written against.

   Three decisions worth stating, because each is a trap avoided rather than a
   preference:

   1. IT IS A PARTIAL HOUSEHOLD, NOT A WHOLE ONE.
      The obvious export is JSON.stringify(household). It is wrong. A SPARKS
      household also carries goals, ratings, worthChecks, a values profile and
      a SWAN target — none of which this tool can produce, all of which would
      be present and EMPTY in a whole-household dump. An importer that applied
      that would silently wipe goals someone spent an hour entering. So the
      envelope carries only the keys this tool genuinely owns, and `contains`
      names them explicitly, so the receiving side can merge key-by-key and
      never has to infer what was meant by an absent field.

   2. EVERY KEY IS PRESENT-OR-ABSENT, NEVER PRESENT-AND-EMPTY.
      A sheet with no debts omits `debts` rather than sending []. The two mean
      different things — "I have no debts" versus "this tool has nothing to
      say about debts" — and only the first should ever overwrite anything.
      This is the same empty-is-not-zero rule the engine runs on, applied at
      the boundary between two programs.

   3. THE SUMMARY IS FOR HUMANS AND IS NOT AUTHORITATIVE.
      `summary` exists so an importer can show "you are about to import The
      Earner, Level 3" before someone commits to it. It is derived, it is a
      snapshot, and an importer must recompute rather than trust it — which
      it can, because the household inside is the real shape.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('./money.js'),
      Schema: require('./schema.js'),
      Character: require('../engines/character.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Character: root.SLAF && root.SLAF.Character
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Character);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.DND = root.DND || {}; root.DND.Export = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Character) {
  'use strict';

  var FORMAT = 'dungeons-and-dividends/character';
  var FORMAT_VERSION = 1;
  var TOOL_URL = 'https://github.com/Sapphirestoneage/dungeons-and-dividends';

  /* The household keys this tool is allowed to speak about. Anything not on
     this list is not its business and never appears in an export. */
  var OWNED_KEYS = ['people', 'filingStatus', 'assets', 'debts', 'expenses', 'dndProfile'];

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function isEmptyObject(o) {
    if (!o || typeof o !== 'object') return true;
    return Object.keys(o).length === 0;
  }

  /** Does this key carry anything a receiving tool could act on? */
  function hasContent(key, value) {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (key === 'expenses') {
      var m = value.monthlyEssential || {};
      var hasTotal = Money.isEntered(m.estimatedValueCents) || Money.isEntered(m.trackedValueCents);
      return hasTotal || (value.entries || []).length > 0;
    }
    if (typeof value === 'object') return !isEmptyObject(value);
    return true;
  }

  /**
   * A short, human-readable read of the character — for a confirmation screen
   * on the far side. Derived and non-authoritative; see the header note.
   * Anything that has not been answered is simply absent rather than nulled.
   */
  function summarise(household, tables) {
    var out = {};
    if (!tables) return out;
    var sheet = Character.sheet(household, tables);
    if (!sheet.ready) return out;

    if (sheet.klass) {
      out.className = sheet.klass.name;
      out.classId = sheet.klass.id;
    }
    if (Money.isOk(sheet.level)) {
      out.level = sheet.level.value;
      out.percentOfFiNumber = Math.round(sheet.level.pct * 1000) / 10;
    }
    if (sheet.maxHp) out.maxHpWeeks = sheet.maxHp.weeks;
    if (Money.isOk(sheet.currentHp)) out.currentHpWeeks = sheet.currentHp.value;
    if (Money.isOk(sheet.armorClass)) out.armorClass = sheet.armorClass.value;
    if (Money.isOk(sheet.debtBurden)) out.debtBurden = sheet.debtBurden.value;

    var stats = {};
    Character.STAT_IDS.forEach(function (id) {
      if (Money.isOk(sheet.stats[id])) stats[id] = sheet.stats[id].value;
    });
    if (!isEmptyObject(stats)) out.abilityScores = stats;
    return out;
  }

  /**
   * Build the export envelope.
   * `tables` is optional — without it the summary is omitted, and the payload
   * (the part that matters) is unaffected.
   */
  function build(household, tables) {
    var h = household || {};
    var payload = {};
    var contains = [];

    OWNED_KEYS.forEach(function (key) {
      if (!hasContent(key, h[key])) return;
      payload[key] = clone(h[key]);
      contains.push(key);
    });

    var envelope = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      /* The household's own version if it has one, otherwise whatever Schema
         currently mints — never a literal, so this cannot drift from the
         model it describes. */
      schemaVersion: Money.isEntered(h.schemaVersion)
        ? h.schemaVersion : Schema.createHousehold().schemaVersion,
      exportedAt: new Date().toISOString(),
      source: { tool: 'Dungeons & Dividends', url: TOOL_URL },
      /* Name the keys present, so a reader never has to infer intent from an
         absent field. Merge these and only these. */
      contains: contains,
      partial: true,
      household: payload
    };
    /* Only describe a character when there is actually a payload to describe.
       Without this an empty sheet still reports "Debt Burden 0", because no
       debt records reads as no debt — true of a real sheet, meaningless on an
       empty one. Tying the summary to `contains` keeps the two honest. */
    if (contains.length) {
      var summary = summarise(h, tables);
      if (!isEmptyObject(summary)) envelope.summary = summary;
    }
    return envelope;
  }

  function toJSON(household, tables) {
    return JSON.stringify(build(household, tables), null, 2);
  }

  function filename() {
    return 'dungeons-and-dividends-character-'
      + new Date().toISOString().slice(0, 10) + '.json';
  }

  /**
   * The same validation an importer should run, shipped here so both sides
   * agree on what "valid" means and the exporter can prove its own output
   * passes. Returns { ok, errors[], warnings[], envelope }.
   */
  function validate(input, opts) {
    var o = opts || {};
    var errors = [], warnings = [], envelope = input;

    if (typeof input === 'string') {
      try { envelope = JSON.parse(input); }
      catch (e) { return { ok: false, errors: ['Not valid JSON: ' + e.message], warnings: warnings, envelope: null }; }
    }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      return { ok: false, errors: ['Expected a JSON object.'], warnings: warnings, envelope: null };
    }
    if (envelope.format !== FORMAT) {
      errors.push('Not a Dungeons & Dividends character file (format was '
        + JSON.stringify(envelope.format) + ').');
    }
    if (envelope.formatVersion !== FORMAT_VERSION) {
      /* A newer file may carry keys this reader does not know. That is a
         warning, not a failure: unknown keys are ignorable by design. */
      if (typeof envelope.formatVersion === 'number' && envelope.formatVersion > FORMAT_VERSION) {
        warnings.push('This file is format version ' + envelope.formatVersion
          + '; this reader understands ' + FORMAT_VERSION + '. Unknown keys will be ignored.');
      } else {
        errors.push('Unsupported format version: ' + JSON.stringify(envelope.formatVersion) + '.');
      }
    }
    if (Money.isEntered(o.expectSchemaVersion) && envelope.schemaVersion !== o.expectSchemaVersion) {
      errors.push('Household schema version ' + JSON.stringify(envelope.schemaVersion)
        + ' does not match the ' + o.expectSchemaVersion + ' this tool expects.');
    }
    if (!envelope.household || typeof envelope.household !== 'object') {
      errors.push('No household in the file.');
    } else {
      var listed = envelope.contains;
      if (!Array.isArray(listed)) {
        warnings.push('No "contains" list — fall back to the keys actually present.');
      } else {
        listed.forEach(function (k) {
          if (!(k in envelope.household)) {
            errors.push('"contains" names ' + k + ' but the household has no such key.');
          }
        });
        Object.keys(envelope.household).forEach(function (k) {
          if (listed.indexOf(k) === -1) {
            warnings.push('Household carries ' + k + ', which "contains" does not name.');
          }
          if (OWNED_KEYS.indexOf(k) === -1) {
            warnings.push(k + ' is outside what this format is meant to carry.');
          }
        });
      }
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings, envelope: envelope };
  }

  return {
    FORMAT: FORMAT,
    FORMAT_VERSION: FORMAT_VERSION,
    OWNED_KEYS: OWNED_KEYS,
    build: build,
    toJSON: toJSON,
    filename: filename,
    validate: validate,
    summarise: summarise
  };
});
