/* shared/qr.js — a QR code, drawn here, no library (D-201).

   Byte mode, error-correction level L, versions 1 to 40, the mask picked
   by the standard's four penalty rules. One entry point matters to a room:
   QR.svg(text) returns an SVG string or throws when the text will not
   fit one code (2,953 bytes at most). QR.encode(text) returns the module
   grid for anyone who wants to draw it differently.

   The two tables are the standard's own figures (ISO/IEC 18004): the
   Reed-Solomon block structure at level L per version, as [total, data]
   codewords per block, and the alignment-pattern centres per version. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SLAF = root.SLAF || {}; root.SLAF.QR = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RS_L = [[[26,19]],[[44,34]],[[70,55]],[[100,80]],[[134,108]],[[86,68],[86,68]],[[98,78],[98,78]],[[121,97],[121,97]],[[146,116],[146,116]],[[86,68],[86,68],[87,69],[87,69]],[[101,81],[101,81],[101,81],[101,81]],[[116,92],[116,92],[117,93],[117,93]],[[133,107],[133,107],[133,107],[133,107]],[[145,115],[145,115],[145,115],[146,116]],[[109,87],[109,87],[109,87],[109,87],[109,87],[110,88]],[[122,98],[122,98],[122,98],[122,98],[122,98],[123,99]],[[135,107],[136,108],[136,108],[136,108],[136,108],[136,108]],[[150,120],[150,120],[150,120],[150,120],[150,120],[151,121]],[[141,113],[141,113],[141,113],[142,114],[142,114],[142,114],[142,114]],[[135,107],[135,107],[135,107],[136,108],[136,108],[136,108],[136,108],[136,108]],[[144,116],[144,116],[144,116],[144,116],[145,117],[145,117],[145,117],[145,117]],[[139,111],[139,111],[140,112],[140,112],[140,112],[140,112],[140,112],[140,112],[140,112]],[[151,121],[151,121],[151,121],[151,121],[152,122],[152,122],[152,122],[152,122],[152,122]],[[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[148,118],[148,118],[148,118],[148,118]],[[132,106],[132,106],[132,106],[132,106],[132,106],[132,106],[132,106],[132,106],[133,107],[133,107],[133,107],[133,107]],[[142,114],[142,114],[142,114],[142,114],[142,114],[142,114],[142,114],[142,114],[142,114],[142,114],[143,115],[143,115]],[[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[153,123],[153,123],[153,123],[153,123]],[[147,117],[147,117],[147,117],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118]],[[146,116],[146,116],[146,116],[146,116],[146,116],[146,116],[146,116],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117]],[[145,115],[145,115],[145,115],[145,115],[145,115],[146,116],[146,116],[146,116],[146,116],[146,116],[146,116],[146,116],[146,116],[146,116],[146,116]],[[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[146,116],[146,116],[146,116]],[[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115]],[[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[146,116]],[[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[145,115],[146,116],[146,116],[146,116],[146,116],[146,116],[146,116]],[[151,121],[151,121],[151,121],[151,121],[151,121],[151,121],[151,121],[151,121],[151,121],[151,121],[151,121],[151,121],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122]],[[151,121],[151,121],[151,121],[151,121],[151,121],[151,121],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122]],[[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[152,122],[153,123],[153,123],[153,123],[153,123]],[[152,122],[152,122],[152,122],[152,122],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123],[153,123]],[[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[147,117],[148,118],[148,118],[148,118],[148,118]],[[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[148,118],[149,119],[149,119],[149,119],[149,119],[149,119],[149,119]]];
  var ALIGN = [[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]];

  /* ---- GF(256), the field the error correction lives in ---------------- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }
  var GEN = {};
  function generator(n) {
    if (GEN[n]) return GEN[n];
    var g = [1];
    for (var i = 0; i < n; i++) {
      var next = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); }
      g = next;
    }
    return (GEN[n] = g);
  }
  function rsEncode(data, n) {
    var g = generator(n), rem = new Array(n).fill(0);
    for (var i = 0; i < data.length; i++) {
      var f = data[i] ^ rem[0];
      rem.shift(); rem.push(0);
      if (f === 0) continue;
      for (var j = 0; j < n; j++) rem[j] ^= gmul(g[j + 1], f);
    }
    return rem;
  }

  /* ---- The bits ----------------------------------------------------------- */
  function utf8(text) {
    if (typeof TextEncoder === 'function') return Array.prototype.slice.call(new TextEncoder().encode(text));
    var out = [], s = unescape(encodeURIComponent(text));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }
  function dataCodewords(v) { return RS_L[v - 1].reduce(function (t, b) { return t + b[1]; }, 0); }
  function chooseVersion(n) {
    for (var v = 1; v <= 40; v++) {
      var bits = 4 + (v < 10 ? 8 : 16) + 8 * n;
      if (bits <= dataCodewords(v) * 8) return v;
    }
    return null;
  }
  function dataBits(bytes, v) {
    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    push(4, 4);
    push(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach(function (b) { push(b, 8); });
    var cap = dataCodewords(v) * 8;
    for (var t = 0; t < 4 && bits.length < cap; t++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    var words = [];
    for (var i = 0; i < bits.length; i += 8) {
      var w = 0; for (var j = 0; j < 8; j++) w = (w << 1) | bits[i + j];
      words.push(w);
    }
    var pad = [0xEC, 0x11], k = 0;
    while (words.length < dataCodewords(v)) words.push(pad[k++ % 2]);
    return words;
  }
  function codewords(v, data) {
    var blocks = RS_L[v - 1], off = 0, dataBlocks = [], ecBlocks = [], maxData = 0;
    blocks.forEach(function (b) {
      var d = data.slice(off, off + b[1]); off += b[1];
      dataBlocks.push(d); ecBlocks.push(rsEncode(d, b[0] - b[1]));
      if (d.length > maxData) maxData = d.length;
    });
    var out = [];
    for (var i = 0; i < maxData; i++) dataBlocks.forEach(function (d) { if (i < d.length) out.push(d[i]); });
    var ecLen = ecBlocks[0].length;
    for (var j = 0; j < ecLen; j++) ecBlocks.forEach(function (e) { out.push(e[j]); });
    return out;
  }

  /* ---- The grid ----------------------------------------------------------- */
  function bchDigit(d) { var n = 0; while (d !== 0) { n++; d >>>= 1; } return n; }
  function bch(data, poly, shift, mask) {
    var d = data << shift;
    while (bchDigit(d) - bchDigit(poly) >= 0) d ^= poly << (bchDigit(d) - bchDigit(poly));
    return ((data << shift) | d) ^ mask;
  }
  var G15 = 0x537, G18 = 0x1F25, G15_MASK = 0x5412;
  var MASKS = [
    function (i, j) { return (i + j) % 2 === 0; },
    function (i) { return i % 2 === 0; },
    function (i, j) { return j % 3 === 0; },
    function (i, j) { return (i + j) % 3 === 0; },
    function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0; },
    function (i, j) { return (i * j) % 2 + (i * j) % 3 === 0; },
    function (i, j) { return ((i * j) % 2 + (i * j) % 3) % 2 === 0; },
    function (i, j) { return ((i * j) % 3 + (i + j) % 2) % 2 === 0; }
  ];

  function build(v, words, maskId) {
    var size = 17 + 4 * v, m = [];
    for (var r = 0; r < size; r++) m.push(new Array(size).fill(null));
    function finder(row, col) {
      for (var r = -1; r <= 7; r++) {
        if (row + r < 0 || size <= row + r) continue;
        for (var c = -1; c <= 7; c++) {
          if (col + c < 0 || size <= col + c) continue;
          m[row + r][col + c] = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6)) || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        }
      }
    }
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
    var pos = ALIGN[v - 1];
    for (var a = 0; a < pos.length; a++) for (var b = 0; b < pos.length; b++) {
      var row = pos[a], col = pos[b];
      if (m[row][col] !== null) continue;
      for (var r = -2; r <= 2; r++) for (var c = -2; c <= 2; c++) m[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
    }
    for (var t = 8; t < size - 8; t++) { if (m[t][6] === null) m[t][6] = t % 2 === 0; if (m[6][t] === null) m[6][t] = t % 2 === 0; }
    /* Format information: level L is 01, then the mask. */
    var bits = bch((1 << 3) | maskId, G15, 10, G15_MASK);
    for (var i = 0; i < 15; i++) {
      var mod = ((bits >> i) & 1) === 1;
      if (i < 6) m[i][8] = mod; else if (i < 8) m[i + 1][8] = mod; else m[size - 15 + i][8] = mod;
      if (i < 8) m[8][size - i - 1] = mod; else if (i < 9) m[8][15 - i] = mod; else m[8][15 - i - 1] = mod;
    }
    m[size - 8][8] = true;
    if (v >= 7) {
      var vb = bch(v, G18, 12, 0);
      for (var k = 0; k < 18; k++) {
        var vm = ((vb >> k) & 1) === 1;
        m[Math.floor(k / 3)][k % 3 + size - 8 - 3] = vm;
        m[k % 3 + size - 8 - 3][Math.floor(k / 3)] = vm;
      }
    }
    /* The data, snaking up and down two columns at a time, masked. */
    var inc = -1, rr = size - 1, bitIndex = 7, byteIndex = 0, mask = MASKS[maskId];
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (;;) {
        for (var cc = 0; cc < 2; cc++) {
          if (m[rr][col - cc] === null) {
            var dark = false;
            if (byteIndex < words.length) dark = ((words[byteIndex] >>> bitIndex) & 1) === 1;
            if (mask(rr, col - cc)) dark = !dark;
            m[rr][col - cc] = dark;
            bitIndex--; if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        rr += inc;
        if (rr < 0 || size <= rr) { rr -= inc; inc = -inc; break; }
      }
    }
    return m;
  }

  /* The four penalty rules, so the busiest-looking mask loses. */
  function penalty(m) {
    var size = m.length, score = 0, r, c;
    function runs(get) {
      for (var a = 0; a < size; a++) {
        var run = 1;
        for (var b = 1; b < size; b++) {
          if (get(a, b) === get(a, b - 1)) { run++; if (b === size - 1 && run >= 5) score += 3 + run - 5; }
          else { if (run >= 5) score += 3 + run - 5; run = 1; }
        }
      }
    }
    runs(function (a, b) { return m[a][b]; });
    runs(function (a, b) { return m[b][a]; });
    for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) {
      var d = m[r][c];
      if (m[r][c + 1] === d && m[r + 1][c] === d && m[r + 1][c + 1] === d) score += 3;
    }
    var P1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], P2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function finderLike(get) {
      for (var a = 0; a < size; a++) for (var b = 0; b <= size - 11; b++) {
        var ok1 = true, ok2 = true;
        for (var k = 0; k < 11; k++) { var v = get(a, b + k) ? 1 : 0; if (v !== P1[k]) ok1 = false; if (v !== P2[k]) ok2 = false; if (!ok1 && !ok2) break; }
        if (ok1) score += 40; if (ok2) score += 40;
      }
    }
    finderLike(function (a, b) { return m[a][b]; });
    finderLike(function (a, b) { return m[b][a]; });
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (m[r][c]) dark++;
    var pct = dark * 100 / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  var MAX_BYTES = 2953;
  function encode(text, opts) {
    var o = opts || {};
    var bytes = utf8(String(text === undefined || text === null ? '' : text));
    var v = chooseVersion(bytes.length);
    if (!v) throw new Error('Too much for one QR code: ' + bytes.length + ' bytes, and one code holds ' + MAX_BYTES + '.');
    var words = codewords(v, dataBits(bytes, v));
    var best = null, bestScore = Infinity, bestMask = 0;
    for (var k = 0; k < 8; k++) {
      if (o.mask !== undefined && k !== o.mask) continue;   /* the tests pin one */
      var m = build(v, words, k), s = penalty(m);
      if (s < bestScore) { bestScore = s; best = m; bestMask = k; }
    }
    return { version: v, size: best.length, mask: bestMask, modules: best, bytes: bytes.length };
  }

  /** An SVG string: black modules on white, a four-module quiet zone. */
  function svg(text, opts) {
    var o = opts || {}, q = o.quiet === undefined ? 4 : o.quiet;
    var code = encode(text), n = code.size, side = n + 2 * q;
    var d = '';
    for (var r = 0; r < n; r++) {
      var run = 0;
      for (var c = 0; c <= n; c++) {
        var dark = c < n && code.modules[r][c];
        if (dark) run++;
        else if (run) { d += 'M' + (c - run + q) + ' ' + (r + q) + 'h' + run + 'v1h-' + run + 'z'; run = 0; }
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + side + ' ' + side + '" shape-rendering="crispEdges" role="img" aria-label="' + (o.label || 'QR code') + '">'
      + '<rect width="' + side + '" height="' + side + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  return { encode: encode, svg: svg, MAX_BYTES: MAX_BYTES, capacityBytes: function (v) { return dataCodewords(v) - (v < 10 ? 2 : 3); } };
});
