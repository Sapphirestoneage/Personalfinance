/* Typed entry: what a coach types in a cell becomes a value and a state.
   Prefixes (MR-007): ~ Rough, ? Unknown, v Verified, "send" Will send,
   "none" None, "n/a" Not applicable, "x" Not for me, a range "1500-2000" Rough.
   Plain input is Known. Returns { v, state } or null for empty. */
import { parseMoney, parsePercent } from '../engine/format.js';

const WORDS = { '?': 'unknown', 'send': 'will-send', 'none': 'none', 'n/a': 'not-applicable', 'na': 'not-applicable', 'x': 'not-for-me' };

export function parseTyped(kind, text) {
  if (text === null || text === undefined) return null;
  let t = String(text).trim();
  if (t === '') return null;
  const lower = t.toLowerCase();
  if (WORDS[lower]) return { v: WORDS[lower] === 'none' ? 0 : null, state: WORDS[lower] };
  let state = 'known';
  if (t[0] === '~') { state = 'rough'; t = t.slice(1).trim(); }
  else if (/^v\s*[\d$]/i.test(t)) { state = 'verified'; t = t.slice(1).trim(); }
  if (t === '') return null;
  let v;
  switch (kind) {
    case 'money': {
      v = parseMoney(t);
      if (v && typeof v === 'object') state = 'rough';
      break;
    }
    case 'percent': {
      const n = parsePercent(t);
      v = n === null ? null : Math.round(n * 1e6) / 1e6;
      break;
    }
    case 'int': case 'hours': {
      const n = Number(t.replace(/,/g, ''));
      if (!Number.isFinite(n)) throw new Error('not a number: ' + t);
      v = kind === 'int' ? Math.round(n) : Math.round(n * 10) / 10;
      break;
    }
    case 'month': {
      v = parseMonth(t);
      if (!v) throw new Error('month as YYYY-MM');
      break;
    }
    case 'date': {
      v = parseDate(t);
      if (!v) throw new Error('date as YYYY-MM-DD');
      break;
    }
    default: v = t;
  }
  if (v === null) return null;
  if (v === 0 && state === 'known' && (kind === 'money' || kind === 'percent' || kind === 'int' || kind === 'hours')) state = 'none';
  return { v, state };
}

export function parseMonth(t) {
  let m = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (m) return m[1] + '-' + m[2].padStart(2, '0');
  m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return m[2] + '-' + m[1].padStart(2, '0');
  m = /^([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(t);
  if (m) {
    const i = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase());
    if (i !== -1) return m[2] + '-' + String(i + 1).padStart(2, '0');
  }
  m = /^(\d{4})-(\d{2})-\d{2}$/.exec(t);
  if (m) return m[1] + '-' + m[2];
  return null;
}
export function parseDate(t) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return null;
}

/* The raw text to show while a cell is being edited. */
export function rawOf(kind, f) {
  if (!f || f.v === null || f.v === undefined) {
    if (f && f.state === 'will-send') return 'send';
    if (f && f.state === 'not-applicable') return 'n/a';
    if (f && f.state === 'not-for-me') return 'x';
    if (f && f.state === 'unknown') return '';
    return '';
  }
  const pre = f.state === 'rough' ? '~' : f.state === 'verified' ? 'v' : '';
  if (f.state === 'none') return '0';
  switch (kind) {
    case 'money': {
      if (typeof f.v === 'object') return (f.v.low / 100) + '-' + (f.v.high / 100);
      return pre + (f.v / 100);
    }
    case 'percent': return pre + (Math.round(f.v * 10000) / 100);
    default: return pre + String(f.v);
  }
}
