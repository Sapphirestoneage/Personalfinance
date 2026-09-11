/* ==========================================================================
   tools/context/lib.js — what build.js and pack.js both need to know.
   --------------------------------------------------------------------------
   Reads the real code, never a cached copy: the registry for the rooms,
   ownership for the fields, each room's HTML for its engines and data, and
   DECISIONS.md for the log. Nothing here writes a file.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const Registry = require(path.join(ROOT, 'shared/registry.js'));
const Ownership = require(path.join(ROOT, 'shared/ownership.js'));

function read(rel) { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; } }
function lines(text) { return text ? text.split('\n') : []; }
function esc(re) { return re.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function uniq(arr) { return Array.from(new Set(arr)); }

/* Field ids whose name is an ordinary word: a word-boundary match in prose
   says nothing about a room reading the field. */
const GENERIC = ['age', 'zip', 'state', 'hours', 'dob', 'withheld', 'dependents', 'umbrella', 'investments', 'unemployment'];

/* ---- Reference tables: key → data file ------------------------------------ */
function referenceMap() {
  const src = read('shared/reference.js') || '';
  const map = {};
  const re = /^\s+([A-Za-z0-9_]+):\s*'([^']+\.json)'/gm;
  let m;
  while ((m = re.exec(src))) map[m[1]] = m[2];
  return map;
}

/* ---- Rooms -------------------------------------------------------------- */
function rooms() {
  const refMap = referenceMap();
  const engineSrc = {};
  const list = Registry.inOrder().map(r => {
    const html = read(r.href) || '';
    const engines = uniq((html.match(/<script src="\.\.\/engines\/([a-z0-9_-]+)\.js">/g) || [])
      .map(s => /engines\/([a-z0-9_-]+)\.js/.exec(s)[1]));
    engines.forEach(e => { if (!(e in engineSrc)) engineSrc[e] = read('engines/' + e + '.js') || ''; });
    const sources = [html].concat(engines.map(e => engineSrc[e]));
    const data = [];
    sources.forEach(src => {
      (src.match(/data\/[A-Za-z0-9_\/-]+\.json/g) || []).forEach(d => data.push(d.replace(/^data\//, '')));
      (src.match(/Reference\.load\(\[[^\]]*\]/g) || []).forEach(call => {
        (call.match(/'([A-Za-z0-9_]+)'/g) || []).forEach(k => { const key = k.slice(1, -1); if (refMap[key]) data.push(refMap[key]); });
      });
    });
    const owns = Object.keys(Ownership.FIELDS).filter(f => Ownership.FIELDS[f].owner === r.id);
    return {
      id: r.id, title: r.title, href: r.href, group: r.group, subgroup: r.subgroup || null,
      blurb: r.blurb || '', aliases: r.aliases || [], utility: !!r.utility,
      exists: html.length > 0, lines: html ? html.split('\n').length : 0,
      html, engines, data: uniq(data).sort(), owns
    };
  });
  const engineRooms = {};
  list.forEach(r => r.engines.forEach(e => { engineRooms[e] = (engineRooms[e] || []).concat([r.id]); }));
  list.forEach(r => {
    r.rareEngines = r.engines.filter(e => engineRooms[e].length <= 2);
    r.searchText = r.html + '\n' + r.rareEngines.map(e => engineSrc[e]).join('\n');
  });
  return { list, engineRooms, engineSrc };
}

function roomById(list, key) {
  const k = String(key || '').toLowerCase();
  return list.find(r => r.id === k) || list.find(r => r.aliases.map(a => a.toLowerCase()).indexOf(k) >= 0)
    || list.find(r => r.title.toLowerCase() === k) || null;
}

/* Files under rooms/ the registry does not know. */
function orphanRoomFiles(list) {
  const known = new Set(list.map(r => r.href));
  return fs.readdirSync(path.join(ROOT, 'rooms')).filter(f => /\.html$/.test(f)).map(f => 'rooms/' + f).filter(f => !known.has(f)).sort();
}

/* ---- Fields ------------------------------------------------------------- */
function fields(roomList) {
  return Object.keys(Ownership.FIELDS).map(id => {
    const f = Ownership.FIELDS[id];
    const generic = GENERIC.indexOf(id) >= 0;
    const re = new RegExp('\\b' + esc(id) + '(Cents)?\\b');
    const users = generic ? null : roomList.filter(r => r.id !== f.owner && re.test(r.searchText)).map(r => r.id);
    return { id, label: f.label, owner: f.owner, generic, users };
  });
}

/* ---- Decisions ---------------------------------------------------------- */
const HEAD = /^## (DD?-\d{3})\s*(?:—|–|-)\s*(.+?)\s*$/;
function decisions() {
  const all = lines(read('DECISIONS.md'));
  const out = [];
  for (let i = 0; i < all.length; i++) {
    const m = HEAD.exec(all[i]);
    if (!m) continue;
    out.push({ id: m[1], title: m[2], start: i + 1, headingLine: all[i] });
  }
  out.forEach((d, k) => {
    let end = k + 1 < out.length ? out[k + 1].start - 1 : all.length;
    /* A level-1 heading (the divider) ends the body too. */
    for (let j = d.start; j < end; j++) { if (/^# /.test(all[j])) { end = j; break; } }
    while (end > d.start && !all[end - 1].trim()) end--;
    d.end = end;
    d.body = all.slice(d.start - 1, end).join('\n');
    d.num = parseInt(d.id.replace(/^DD?-/, ''), 10);
    d.dnd = /^DD-/.test(d.id);
  });
  const superseded = new Set();
  out.forEach(d => { (d.body.match(/supersedes (DD?-\d{3})/gi) || []).forEach(s => superseded.add(s.replace(/^supersedes /i, ''))); });
  out.forEach(d => { d.superseded = superseded.has(d.id); });
  return out;
}

/* Which rooms a decision touches. The file path rule is the only one a
   DD- entry gets: those entries name SPARKS rooms only by their files. */
function linkRooms(decision, roomList) {
  const body = decision.body;
  const title = decision.title;
  return roomList.filter(r => {
    const byFile = body.indexOf(r.href) >= 0 || new RegExp('(^|[^A-Za-z0-9_-])' + esc(r.id) + '\\.html').test(body);
    if (decision.dnd) return byFile;
    if (byFile) return true;
    if (body.indexOf('`' + r.id + '`') >= 0) return true;
    const t = esc(r.title);
    if (new RegExp(t + ' room\\b').test(body) || new RegExp(t + ':').test(body)) return true;
    if (new RegExp('^' + t + '([^A-Za-z0-9]|$)').test(title)) return true;
    return false;
  }).map(r => r.id);
}

function decisionIndex(roomList) {
  const decs = decisions();
  decs.forEach(d => { d.rooms = linkRooms(d, roomList); });
  return decs;
}

function decisionsForRoom(decs, id) { return decs.filter(d => d.rooms.indexOf(id) >= 0); }

/* ---- Docs --------------------------------------------------------------- */
function docHeadings(rel) {
  const all = lines(read(rel));
  const heads = [];
  let inFence = false;
  all.forEach((l, i) => {
    if (/^```/.test(l)) inFence = !inFence;
    if (inFence) return;
    const m = /^(#{1,2}) (.+?)\s*$/.exec(l);
    if (m) heads.push({ level: m[1].length, title: m[2], start: i + 1 });
  });
  heads.forEach((h, k) => { h.end = k + 1 < heads.length ? heads[k + 1].start - 1 : all.length; });
  return { heads, total: all.length };
}

module.exports = { ROOT, read, lines, esc, uniq, GENERIC, Registry, Ownership, referenceMap, rooms, roomById, orphanRoomFiles, fields, decisions, decisionIndex, decisionsForRoom, linkRooms, docHeadings };
