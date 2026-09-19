/* ==========================================================================
   shared/intake.js — one look at a file says what it is.
   DECISIONS.md D-224.
   --------------------------------------------------------------------------
   Your Data had three file pickers and the person had to know which door
   their file went through: the backup here, the household file there, the
   spreadsheet in a third box, the bank statement in a fourth. Choose the
   wrong one and the page told you to go and find the right one. This is
   the one sniff every door shares, so there can be one door.

     sniff(text, filename) -> { kind, why }
       kind    'sealed'     a protected backup (shared/vault.js)
               'backup'     every key this browser holds (shared/backup.js)
               'household'  the household and its snapshots (spine exportJSON),
                            or a bare household object
               'sheet'      the Money Rooms CSV (row, value, unit columns)
               'bank'       a CSV with a date-ish and an amount-ish column
               'link'       a share link, or the #h= fragment of one
               'empty'      nothing in it
               'binary'     not text: a PDF, a workbook, a picture
               'unknown'    text, but none of the above
       why     one plain sentence a page can show as it is

   Pure: it reads the text and the name, touches nothing, and needs only
   shared/csv.js for the header words. Tested in Node with one line of each.
   ========================================================================== */
(function (root, factory) {
  var Csv;
  if (typeof module === 'object' && module.exports) { Csv = require('./csv.js'); }
  else { Csv = root.SLAF && root.SLAF.Csv; }
  var api = factory(Csv);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Intake = api; }
})(typeof self !== 'undefined' ? self : null, function (Csv) {
  'use strict';
  var SEALED = 'money-rooms-sealed', BACKUP = 'money-rooms-backup', HOUSEHOLD = 'slaf-export';
  var DATE_WORDS = /^(date|posted|posting_date|transaction_date|trans_date|booking_date|value_date|when)$/;
  var AMOUNT_WORDS = /^(amount|amt|debit|credit|withdrawal|deposit|money_out|money_in|value|sum|total)$/;

  function out(kind, why) { return { kind: kind, why: why }; }

  function sniff(text, filename) {
    var name = String(filename || '').toLowerCase();
    if (typeof text !== 'string' || !text.trim()) return out('empty', 'That file is empty.');
    if (Csv && Csv.looksBinary && Csv.looksBinary(text)) {
      return out('binary', /\.xlsx?$/.test(name) ? 'That is an Excel workbook. Save it as CSV first (File, Save as, CSV) and choose that.' : /\.pdf$/.test(name) ? 'That is a PDF. This app reads CSV files; most bank sites offer CSV beside PDF.' : 'That is not a text file. This app reads its own .json files and .csv files.');
    }
    var t = text.trim();

    /* A share link, pasted as a file or dropped as text. */
    if (/(?:^|[#&])h=[jz][A-Za-z0-9_-]+/.test(t) && t.length < 200000 && !/^[\[{]/.test(t)) return out('link', 'A share link from this app.');

    /* JSON: the three formats this app writes, by their format field. */
    if (/^[\[{]/.test(t)) {
      var obj = null;
      try { obj = JSON.parse(t); } catch (e) { return out('unknown', 'That file is not readable. It may be cut off, or not finished downloading. Nothing was changed.'); }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out('unknown', 'That is a JSON file, but not one this app made. Nothing was changed.');
      if (obj.format === SEALED) return out('sealed', 'A protected backup. It needs its passphrase.');
      if (obj.format === BACKUP) return out('backup', 'A backup of everything this browser holds.');
      if (obj.format === HOUSEHOLD || ('schemaVersion' in obj && ('people' in obj || 'assets' in obj))) return out('household', 'A household file: the numbers and the snapshots.');
      return out('unknown', 'That is a JSON file, but not one this app made. Nothing was changed.');
    }

    /* CSV: the app's own sheet, or a bank's. */
    if (Csv && Csv.parse) {
      var parsed = Csv.parse(text);
      var keys = (parsed.headers || []).map(Csv.headerKey);
      if (keys.indexOf('row') > -1 && keys.indexOf('value') > -1 && keys.indexOf('unit') > -1) return out('sheet', 'A Money Rooms spreadsheet: each line goes back to the row it names.');
      if (keys.length >= 2 && keys.some(function (k) { return DATE_WORDS.test(k); }) && keys.some(function (k) { return AMOUNT_WORDS.test(k); })) return out('bank', 'A bank or card statement: spending lines, dated from the file.');
      if (keys.length >= 2 && parsed.rows && parsed.rows.length) return out('bank', 'A CSV with columns this app does not recognise by name; it will ask which is the date and which the amount.');
    }
    return out('unknown', 'That is text, but not a file this app made and not a CSV. Lines of numbers can be pasted in below.');
  }

  return { sniff: sniff, SEALED: SEALED, BACKUP: BACKUP, HOUSEHOLD: HOUSEHOLD };
});
