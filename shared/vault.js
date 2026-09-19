/* ==========================================================================
   shared/vault.js — a backup file nobody else can open.
   DECISIONS.md D-305.
   --------------------------------------------------------------------------
   Every figure in the app leaves the device only as a file the person
   makes. Until now that file was plain JSON: anyone who found it in a
   Downloads folder, a mail attachment or a shared drive could read every
   balance. This seals it behind a passphrase, using the browser's own
   crypto and nothing else:

     PBKDF2-SHA256, 310,000 rounds, a fresh 16-byte salt  -> a 256-bit key
     AES-256-GCM, a fresh 12-byte nonce                     -> the sealed bytes

   GCM is authenticated: a wrong passphrase, a cut-off file or a changed
   byte does not produce garbage, it produces a refusal. There is no
   recovery: the passphrase is never stored, and a forgotten one means the
   file cannot be opened by anyone, this app included. The UI says exactly
   that before the first sealed save.

     available()               true where crypto.subtle exists (https, or
                               localhost; a file:// page has none)
     strength(passphrase)      { ok, why }: at least 8 characters, not one
                               repeated character; nothing cleverer, on
                               purpose - a long plain phrase is the advice
     seal(text, passphrase)    Promise<string>: the envelope, as JSON text
     open(text, passphrase)    Promise<string>: the plaintext, or a rejection
                               with a plain sentence
     looksSealed(text)         a cheap check on the first bytes, no parse
     inspect(text)             { ok, savedAt, appVersion, hint } without a
                               passphrase: what the envelope says about itself
     fingerprint(text)         Promise<string>: "A7F3-9C21", the first 32
                               bits of SHA-256 in four-hex pairs, so a person
                               can read the same code on both devices

   THE ENVELOPE. { format: 'money-rooms-sealed', sealedVersion: 1,
     kdf: 'PBKDF2-SHA256', iterations, salt, cipher: 'AES-256-GCM', iv,
     data, hint, savedAt, appVersion }, every byte field as base64. The
   inner text is whatever was sealed: a backup (shared/backup.js) or a
   household file (spine exportJSON); the reader that takes the plaintext
   decides, this module does not look inside.

   Dependency-free UMD, so a Node test can run the round trip through
   globalThis.crypto.subtle exactly as the browser does.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Vault = api; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';
  var FORMAT = 'money-rooms-sealed';
  var VERSION = 1;
  var ITERATIONS = 310000;
  var MIN_LENGTH = 8;

  function cryptoOf() {
    var g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null);
    return g && g.crypto ? g.crypto : null;
  }
  function available() { var c = cryptoOf(); return !!(c && c.subtle && typeof c.subtle.encrypt === 'function' && typeof c.getRandomValues === 'function'); }

  /* ---- bytes <-> text ---------------------------------------------------- */
  function utf8(s) { return new TextEncoder().encode(String(s)); }
  function text(b) { return new TextDecoder().decode(b); }
  function toB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    var g = typeof globalThis !== 'undefined' ? globalThis : self;
    if (typeof g.btoa === 'function') return g.btoa(s);
    return Buffer.from(bytes).toString('base64');
  }
  function fromB64(str) {
    var g = typeof globalThis !== 'undefined' ? globalThis : self;
    var s = typeof g.atob === 'function' ? g.atob(String(str)) : Buffer.from(String(str), 'base64').toString('binary');
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function random(n) { var b = new Uint8Array(n); cryptoOf().getRandomValues(b); return b; }

  /* ---- the passphrase --------------------------------------------------- */
  function strength(p) {
    var s = String(p || '');
    if (!s) return { ok: false, why: 'Type a passphrase.' };
    if (s.length < MIN_LENGTH) return { ok: false, why: 'At least ' + MIN_LENGTH + ' characters. A few plain words is easiest to remember and hardest to guess.' };
    if (/^(.)\1+$/.test(s)) return { ok: false, why: 'One character repeated is not a passphrase.' };
    return { ok: true, why: s.length >= 16 ? 'Good.' : 'Fine. Longer is stronger.' };
  }
  function deriveKey(passphrase, salt, iterations) {
    var c = cryptoOf().subtle;
    return c.importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return c.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' }, base,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }

  /* ---- seal / open ------------------------------------------------------ */
  function seal(plain, passphrase, meta) {
    if (!available()) return Promise.reject(new Error('This browser cannot protect a file here. Protection needs a secure page (https, or localhost); the plain file still works.'));
    var st = strength(passphrase);
    if (!st.ok) return Promise.reject(new Error(st.why));
    var salt = random(16), iv = random(12);
    return deriveKey(passphrase, salt, ITERATIONS).then(function (key) {
      return cryptoOf().subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, utf8(plain));
    }).then(function (buf) {
      var m = meta || {};
      var env = {
        format: FORMAT, sealedVersion: VERSION,
        kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toB64(salt),
        cipher: 'AES-256-GCM', iv: toB64(iv),
        data: toB64(new Uint8Array(buf)),
        hint: m.hint ? String(m.hint).slice(0, 80) : null,
        savedAt: m.savedAt || new Date().toISOString(),
        appVersion: m.appVersion || null
      };
      return JSON.stringify(env, null, 2);
    });
  }
  function parse(t) {
    var obj;
    try { obj = JSON.parse(String(t)); } catch (e) { return null; }
    if (!obj || typeof obj !== 'object' || obj.format !== FORMAT) return null;
    return obj;
  }
  function looksSealed(t) {
    if (typeof t !== 'string') return false;
    var head = t.slice(0, 200);
    return head.indexOf('"' + FORMAT + '"') !== -1 && parse(t) !== null;
  }
  function inspect(t) {
    var obj = parse(t);
    if (!obj) return { ok: false, reason: 'Not a protected file.' };
    if (typeof obj.sealedVersion !== 'number' || obj.sealedVersion > VERSION) return { ok: false, reason: 'That protected file was made by a newer build than this one. Update this device first. Nothing was changed.' };
    return { ok: true, savedAt: obj.savedAt || null, appVersion: obj.appVersion || null, hint: obj.hint || null, iterations: obj.iterations };
  }
  function open(t, passphrase) {
    if (!available()) return Promise.reject(new Error('This browser cannot open a protected file here. It needs a secure page (https, or localhost).'));
    var obj = parse(t);
    if (!obj) return Promise.reject(new Error('That is not a protected file from this app.'));
    var i = inspect(t);
    if (!i.ok) return Promise.reject(new Error(i.reason));
    if (obj.kdf !== 'PBKDF2-SHA256' || obj.cipher !== 'AES-256-GCM') return Promise.reject(new Error('That protected file uses a method this build does not know. Nothing was changed.'));
    if (!String(passphrase || '')) return Promise.reject(new Error('Type the passphrase.'));
    var salt, iv, data;
    try { salt = fromB64(obj.salt); iv = fromB64(obj.iv); data = fromB64(obj.data); }
    catch (e) { return Promise.reject(new Error('That protected file is damaged: its contents do not read. Nothing was changed.')); }
    return deriveKey(passphrase, salt, Number(obj.iterations) || ITERATIONS).then(function (key) {
      return cryptoOf().subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
    }).then(function (buf) { return text(new Uint8Array(buf)); }, function () {
      /* GCM does not say which: a wrong passphrase and a changed byte look
         the same from here, and both are a refusal, never garbage. */
      throw new Error('That passphrase does not open this file, or the file has been changed since it was saved. Nothing was changed.');
    });
  }

  /* ---- the fingerprint -------------------------------------------------- */
  function fingerprint(t) {
    if (!available()) return Promise.resolve(null);
    return cryptoOf().subtle.digest('SHA-256', utf8(t)).then(function (buf) {
      var b = new Uint8Array(buf), hex = '';
      for (var i = 0; i < 4; i++) hex += (b[i] < 16 ? '0' : '') + b[i].toString(16).toUpperCase();
      return hex.slice(0, 4) + '-' + hex.slice(4, 8);
    });
  }

  return { FORMAT: FORMAT, VERSION: VERSION, ITERATIONS: ITERATIONS, MIN_LENGTH: MIN_LENGTH,
    available: available, strength: strength, seal: seal, open: open, looksSealed: looksSealed, inspect: inspect, fingerprint: fingerprint };
});
