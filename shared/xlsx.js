/* ==========================================================================
   shared/xlsx.js — a real spreadsheet out, and a real spreadsheet back in.
   DECISIONS.md D-222.
   --------------------------------------------------------------------------
   A CSV is a text file: tapped on a phone it opens as code, and the owner
   should never see code. An .xlsx opens in Excel, Numbers, Google Sheets and
   the phone's own viewer as what it is — a sheet, with money as money, a
   percent as a percent, a date as a date, a bold heading that stays put.

     Xlsx.build(sheets, opts)   → Uint8Array, a workbook
        sheets: [{ name, columns: [{ header, width, kind }], rows: [[cell]] }]
        a cell is a value, or { v, kind }: text | money | percent | date |
        number | note. Money is given in dollars (from integer cents at the
        call site), a percent as its fraction (0.2499 shows as 24.99%).
     Xlsx.read(bytes)           → Promise of [{ name, rows: [[text]] }]
        every cell as the text a person sees, so a percent cell comes back
        "24.99%" and a date cell "2026-06-03" whatever the sheet stored.
     Xlsx.isXlsx(bytes)         a zip whose first entry names the format

   One zip writer and reader for the app: shared/zipfile.js.
   ========================================================================== */
(function (root, factory) {
  var Zip;
  if (typeof module === 'object' && module.exports) { Zip = require('./zipfile.js'); }
  else { Zip = (root.SLAF || {}).Zipfile; }
  var api = factory(Zip);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Xlsx = api; }
})(typeof self !== 'undefined' ? self : null, function (Zip) {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  /* A1, B1, ... Z1, AA1 */
  function colName(n) {
    var s = '';
    n = n + 1;
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  /* Excel counts days from 1899-12-30. */
  function serialOf(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30);
    return Math.round(ms / 86400000);
  }
  function dateOfSerial(n) {
    var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
    if (isNaN(d.getTime())) return null;
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  /* Styles, in the order cellXfs lists them. */
  var STYLE = { plain: 0, head: 1, text: 2, money: 3, percent: 4, date: 5, number: 6, note: 7 };
  var STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="3">'
    + '<numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/>'
    + '<numFmt numFmtId="165" formatCode="0.00%"/>'
    + '<numFmt numFmtId="166" formatCode="yyyy\\-mm\\-dd"/>'
    + '</numFmts>'
    + '<fonts count="3">'
    + '<font><sz val="11"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
    + '<font><sz val="10"/><color rgb="FF8A8A8A"/><name val="Calibri"/></font>'
    + '</fonts>'
    + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF2F5D50"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="8">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="49" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';

  function cellXml(ref, cell) {
    var kind = cell && typeof cell === 'object' && cell.kind ? cell.kind : 'text';
    var v = cell && typeof cell === 'object' && 'v' in cell ? cell.v : cell;
    if (v === null || v === undefined || v === '') return '';
    if (kind === 'money' || kind === 'percent' || kind === 'number') {
      var n = Number(v);
      if (!isFinite(n)) return '<c r="' + ref + '" s="' + STYLE.text + '" t="inlineStr"><is><t>' + esc(v) + '</t></is></c>';
      return '<c r="' + ref + '" s="' + STYLE[kind] + '"><v>' + n + '</v></c>';
    }
    if (kind === 'date') {
      var s = serialOf(v);
      if (s === null) return '<c r="' + ref + '" s="' + STYLE.text + '" t="inlineStr"><is><t>' + esc(v) + '</t></is></c>';
      return '<c r="' + ref + '" s="' + STYLE.date + '"><v>' + s + '</v></c>';
    }
    var style = kind === 'head' ? STYLE.head : kind === 'note' ? STYLE.note : STYLE.text;
    return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  function sheetXml(sheet) {
    var cols = sheet.columns || [];
    var colsXml = cols.length
      ? '<cols>' + cols.map(function (c, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || 14) + '" customWidth="1"' + (c.hidden ? ' hidden="1"' : '') + '/>'; }).join('') + '</cols>'
      : '';
    var rows = [];
    rows.push('<row r="1" ht="26" customHeight="1">' + cols.map(function (c, i) { return cellXml(colName(i) + '1', { v: c.header, kind: 'head' }); }).join('') + '</row>');
    (sheet.rows || []).forEach(function (r, ri) {
      var n = ri + 2;
      var cells = r.map(function (cell, ci) { return cellXml(colName(ci) + n, cell); }).join('');
      rows.push('<row r="' + n + '">' + cells + '</row>');
    });
    var last = colName(Math.max(0, cols.length - 1)) + Math.max(1, (sheet.rows || []).length + 1);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>'
      + '<dimension ref="A1:' + last + '"/>'
      + '<sheetViews><sheetView' + (sheet.first ? ' tabSelected="1"' : '') + ' workbookViewId="0">'
      + '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
      + '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="15"/>'
      + colsXml
      + '<sheetData>' + rows.join('') + '</sheetData>'
      + (cols.length ? '<autoFilter ref="A1:' + last + '"/>' : '')
      + '</worksheet>';
  }

  /** A workbook: one file, every sheet, ready to open. */
  function build(sheets, opts) {
    var o = opts || {};
    var list = (sheets || []).filter(Boolean);
    if (!list.length) list = [{ name: 'Sheet1', columns: [], rows: [] }];
    var names = {};
    list.forEach(function (s, i) {
      /* Excel refuses : \ / ? * [ ] in a tab name, and 31 characters is its limit. */
      var nm = String(s.name || ('Sheet' + (i + 1))).replace(/[:\\\/?*\[\]]/g, ' ').slice(0, 31) || ('Sheet' + (i + 1));
      while (names[nm.toLowerCase()]) nm = (nm.slice(0, 28) + ' ' + (i + 1)).slice(0, 31);
      names[nm.toLowerCase()] = true;
      s.name = nm;
      s.first = i === 0;
    });
    var files = {};
    files['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + list.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('')
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '</Types>';
    files['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '</Relationships>';
    files['docProps/core.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + '<dc:title>' + esc(o.title || 'Money Rooms') + '</dc:title>'
      + '<dc:creator>' + esc(o.creator || 'Money Rooms') + '</dc:creator>'
      + '<cp:lastModifiedBy>' + esc(o.creator || 'Money Rooms') + '</cp:lastModifiedBy>'
      + (o.day ? '<dcterms:created xsi:type="dcterms:W3CDTF">' + esc(o.day) + 'T00:00:00Z</dcterms:created>' : '')
      + '</cp:coreProperties>';
    files['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>'
      + list.map(function (s, i) { return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('')
      + '</sheets></workbook>';
    files['xl/_rels/workbook.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + list.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('')
      + '<Relationship Id="rId' + (list.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>';
    files['xl/styles.xml'] = STYLES_XML;
    list.forEach(function (s, i) { files['xl/worksheets/sheet' + (i + 1) + '.xml'] = sheetXml(s); });
    return Zip.write(files, o.now);
  }

  /* ---- Reading a workbook back --------------------------------------------- */
  function unesc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&amp;/g, '&');
  }
  function allText(xml) {
    var out = '', re = /<t[^>]*>([\s\S]*?)<\/t>/g, m;
    while ((m = re.exec(xml))) out += unesc(m[1]);
    return out;
  }
  function sharedStrings(xml) {
    if (!xml) return [];
    var out = [], re = /<si\b[^>]*>([\s\S]*?)<\/si>/g, m;
    while ((m = re.exec(xml))) out.push(allText(m[1]));
    return out;
  }
  /* Which style index means a date, and which a percent. The built-in codes
     are fixed; a custom one is read from its format string. */
  var BUILT_IN_DATE = [14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57];
  var BUILT_IN_PERCENT = [9, 10];
  function styleKinds(xml) {
    if (!xml) return [];
    var custom = {};
    var fmts = /<numFmts[\s\S]*?<\/numFmts>/.exec(xml);
    if (fmts) {
      var re = /<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g, m;
      while ((m = re.exec(fmts[0]))) custom[+m[1]] = unesc(m[2]);
    }
    var block = /<cellXfs[\s\S]*?<\/cellXfs>/.exec(xml);
    if (!block) return [];
    var kinds = [], xf = /<xf\b[^>]*>/g, x;
    while ((x = xf.exec(block[0]))) {
      var id = /numFmtId="(\d+)"/.exec(x[0]);
      var n = id ? +id[1] : 0;
      var code = custom[n];
      if (code) {
        var bare = code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '').replace(/\\./g, '');
        if (bare.indexOf('%') > -1) kinds.push('percent');
        else if (/[ymd]/i.test(bare) && !/[eE]\+/.test(bare)) kinds.push('date');
        else kinds.push('number');
      } else if (BUILT_IN_PERCENT.indexOf(n) > -1) kinds.push('percent');
      else if (BUILT_IN_DATE.indexOf(n) > -1) kinds.push('date');
      else kinds.push('number');
    }
    return kinds;
  }
  function numberText(n) {
    if (!isFinite(n)) return '';
    var s = String(n);
    /* A float that is really a round cent: 12.340000000000002 → 12.34 */
    if (/\.\d{10,}/.test(s)) s = String(Math.round(n * 1e6) / 1e6);
    return s;
  }
  function cellsOf(rowXml, strings, kinds) {
    var out = [], re = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g, m;
    while ((m = re.exec(rowXml))) {
      var attrs = m[1] || '', body = m[2] || '';
      var ref = /r="([A-Z]+)\d+"/.exec(attrs);
      var at = 0;
      if (ref) { var letters = ref[1]; for (var i = 0; i < letters.length; i++) at = at * 26 + (letters.charCodeAt(i) - 64); at -= 1; }
      else at = out.length;
      var t = /t="([^"]*)"/.exec(attrs), type = t ? t[1] : 'n';
      var sIdx = /s="(\d+)"/.exec(attrs);
      var text = '';
      if (type === 'inlineStr') text = allText(body);
      else if (type === 's') { var iv = /<v>([\s\S]*?)<\/v>/.exec(body); text = iv ? (strings[+unesc(iv[1])] || '') : ''; }
      else if (type === 'str' || type === 'e') { var sv = /<v>([\s\S]*?)<\/v>/.exec(body); text = sv ? unesc(sv[1]) : ''; }
      else if (type === 'b') { var bv = /<v>([\s\S]*?)<\/v>/.exec(body); text = bv && unesc(bv[1]) === '1' ? 'yes' : 'no'; }
      else {
        var nv = /<v>([\s\S]*?)<\/v>/.exec(body);
        if (nv) {
          var n = Number(unesc(nv[1]));
          var kind = sIdx ? kinds[+sIdx[1]] : 'number';
          /* The sheet's own format says what the number means, so a percent
             cell comes back as a percent and a date cell as a date: no guess. */
          if (kind === 'percent') text = numberText(Math.round(n * 1e8) / 1e6) + '%';
          else if (kind === 'date') text = dateOfSerial(n) || numberText(n);
          else text = numberText(n);
        }
      }
      while (out.length < at) out.push('');
      out[at] = text;
    }
    return out;
  }
  function isXlsx(bytes) { return Zip.isZip(bytes); }
  /** read(bytes) → Promise of [{ name, rows: [[text]] }] */
  function read(bytes) {
    return Zip.read(bytes).then(function (files) {
      var wb = files['xl/workbook.xml'];
      if (!wb) throw new Error('that zip is not a spreadsheet');
      var wbXml = Zip.text(wb);
      var rels = files['xl/_rels/workbook.xml.rels'] ? Zip.text(files['xl/_rels/workbook.xml.rels']) : '';
      var target = {};
      var rre = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g, rm;
      while ((rm = rre.exec(rels))) target[rm[1]] = unesc(rm[2]).replace(/^\/?xl\//, '').replace(/^\//, '');
      var strings = sharedStrings(files['xl/sharedStrings.xml'] ? Zip.text(files['xl/sharedStrings.xml']) : '');
      var kinds = styleKinds(files['xl/styles.xml'] ? Zip.text(files['xl/styles.xml']) : '');
      var out = [], sre = /<sheet\b([^>]*)\/?>/g, sm, n = 0;
      while ((sm = sre.exec(wbXml))) {
        n++;
        var nameM = /name="([^"]*)"/.exec(sm[1]);
        var idM = /r:id="([^"]+)"/.exec(sm[1]);
        var path = (idM && target[idM[1]]) || ('worksheets/sheet' + n + '.xml');
        var part = files['xl/' + path] || files[path];
        if (!part) continue;
        var xml = Zip.text(part);
        var rows = [], rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g, rw;
        while ((rw = rowRe.exec(xml))) rows.push(cellsOf(rw[1], strings, kinds));
        out.push({ name: nameM ? unesc(nameM[1]) : 'Sheet' + n, rows: rows });
      }
      if (!out.length) throw new Error('that spreadsheet has no sheets');
      return out;
    });
  }

  return { build: build, read: read, isXlsx: isXlsx, colName: colName, serialOf: serialOf, dateOfSerial: dateOfSerial, STYLE: STYLE };
});
