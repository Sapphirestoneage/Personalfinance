/* ==========================================================================
   shared/zipfile.js — the one zip writer and reader. DECISIONS.md D-222.
   --------------------------------------------------------------------------
   A spreadsheet zip (D-210) and an Excel workbook (D-222) are both zips, so
   there is one of these, not two.

     Zipfile.write(files)     { 'name.txt': text | Uint8Array } → Uint8Array
                              store-only (no compression), CRC-32, in the
                              order the keys were added
     Zipfile.read(bytes)      → Promise of { 'name': Uint8Array }
                              reads the central directory, so a zip written
                              by Excel (deflated, with data descriptors)
                              reads as well as one written here
     Zipfile.text(bytes)      UTF-8 bytes → string
     Zipfile.utf8(string)     string → UTF-8 bytes
     Zipfile.crc32(bytes)     the checksum a zip carries
     Zipfile.isZip(bytes)     the two letters every zip starts with

   Inflating uses the browser's own DecompressionStream, or node's zlib:
   nothing is carried for it.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Zipfile = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var CRC_TABLE = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function utf8(s) {
    if (s instanceof Uint8Array) return s;
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(s));
    return new Uint8Array(Buffer.from(String(s), 'utf8'));
  }
  function text(bytes) {
    if (typeof bytes === 'string') return bytes;
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    return Buffer.from(bytes).toString('utf8');
  }
  function isZip(bytes) {
    if (typeof bytes === 'string') return bytes.slice(0, 2) === 'PK';
    return !!bytes && bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4B;
  }

  function le16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function le32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
  function dosTime(d) { return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF; }
  function dosDate(d) { return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF; }

  /** Every file stored whole, in the order given. */
  function write(fileMap, now) {
    var d = now || new Date();
    var parts = [], central = [], offset = 0, count = 0;
    Object.keys(fileMap).forEach(function (name) {
      var data = utf8(fileMap[name]), nm = utf8(name), crc = crc32(data);
      var head = [].concat([0x50, 0x4B, 0x03, 0x04], le16(20), le16(0x0800), le16(0), le16(dosTime(d)), le16(dosDate(d)), le32(crc), le32(data.length), le32(data.length), le16(nm.length), le16(0));
      parts.push(new Uint8Array(head), nm, data);
      central.push(new Uint8Array([].concat([0x50, 0x4B, 0x01, 0x02], le16(20), le16(20), le16(0x0800), le16(0), le16(dosTime(d)), le16(dosDate(d)), le32(crc), le32(data.length), le32(data.length), le16(nm.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset))), nm);
      offset += head.length + nm.length + data.length;
      count++;
    });
    var cdSize = central.reduce(function (n, p) { return n + p.length; }, 0);
    var end = new Uint8Array([].concat([0x50, 0x4B, 0x05, 0x06], le16(0), le16(0), le16(count), le16(count), le32(cdSize), le32(offset), le16(0)));
    var total = offset + cdSize + end.length, out = new Uint8Array(total), pos = 0;
    parts.concat(central, [end]).forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  /* ---- Reading ------------------------------------------------------------- */
  function u16(b, i) { return b[i] | (b[i + 1] << 8); }
  function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }
  function nameOf(b, i, len) {
    var s = '';
    for (var k = 0; k < len; k++) s += String.fromCharCode(b[i + k]);
    /* Names in a zip are ASCII in practice; UTF-8 ones decode properly. */
    return /[\x80-\xff]/.test(s) ? text(b.subarray(i, i + len)) : s;
  }
  function inflateRaw(bytes) {
    if (typeof module === 'object' && module.exports) {
      var zlib = require('zlib');
      return Promise.resolve(new Uint8Array(zlib.inflateRawSync(Buffer.from(bytes))));
    }
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('this browser cannot unzip a compressed file'));
    var ds = new DecompressionStream('deflate-raw');
    var writer = ds.writable.getWriter();
    writer.write(bytes); writer.close();
    return new Response(ds.readable).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }
  /**
   * read(bytes) → Promise of { name: Uint8Array }
   * The central directory is the index: it holds the real sizes even when the
   * local header does not (Excel writes them after the data).
   */
  function read(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (!isZip(b)) return Promise.reject(new Error('not a zip file'));
    var eocd = -1;
    for (var i = b.length - 22; i >= 0 && i >= b.length - 66000; i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4B && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('the zip has no index: it may have been cut short'));
    var count = u16(b, eocd + 10), start = u32(b, eocd + 16), p = start, jobs = [], out = {};
    for (var n = 0; n < count && p + 46 <= b.length; n++) {
      if (u32(b, p) !== 0x02014b50) break;
      var nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32);
      var method = u16(b, p + 10), compSize = u32(b, p + 20), localAt = u32(b, p + 42);
      var name = nameOf(b, p + 46, nameLen);
      p += 46 + nameLen + extraLen + commentLen;
      if (/\/$/.test(name)) continue;                                  /* a folder entry holds nothing */
      if (localAt + 30 > b.length || u32(b, localAt) !== 0x04034b50) continue;
      var dataAt = localAt + 30 + u16(b, localAt + 26) + u16(b, localAt + 28);
      var raw = b.subarray(dataAt, dataAt + compSize);
      if (method === 0) out[name] = raw;
      else if (method === 8) jobs.push(inflateRaw(raw).then((function (nm) { return function (data) { out[nm] = data; }; })(name)));
      /* Any other method is a zip we cannot read; it is simply not in the result. */
    }
    return Promise.all(jobs).then(function () { return out; });
  }

  return { write: write, read: read, crc32: crc32, utf8: utf8, text: text, isZip: isZip };
});
