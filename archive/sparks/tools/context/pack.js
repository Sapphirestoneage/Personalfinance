#!/usr/bin/env node
/* ==========================================================================
   tools/context/pack.js — only what a session needs, printed.
   --------------------------------------------------------------------------
     pack.js <room-id or alias>   the room's card, its blurb, older related
                                  decisions as titles, the latest 3 in full
                                  (--all: every one in full; --max=N: line cap,
                                  default 60; the sed command prints the rest)
     pack.js D-193                that decision in full
     pack.js <fieldId>            owner, who reads it, its ledger row, the
                                  decisions that mention it
     pack.js "search words"       rooms, fields and decisions that match
   ========================================================================== */
'use strict';
const path = require('path');
const L = require('./lib.js');

const args = process.argv.slice(2);
const flags = { all: args.indexOf('--all') >= 0, max: 60 };
args.forEach(a => { const m = /^--max=(\d+)$/.exec(a); if (m) flags.max = +m[1]; });
const query = args.filter(a => !/^--/.test(a)).join(' ').trim();
if (!query) { console.log('usage: node tools/context/pack.js <room-id | D-123 | fieldId | "search words"> [--all] [--max=N]'); process.exit(1); }

const R = L.rooms();
const roomList = R.list;
const decs = L.decisionIndex(roomList);
const out = [];
const say = s => out.push(s === undefined ? '' : s);

function printDecision(d, cap) {
  const body = d.body.split('\n');
  if (!cap || body.length <= cap) { say(d.body); return; }
  say(body.slice(0, cap).join('\n'));
  say('… ' + (body.length - cap) + ' more lines: sed -n ' + (d.start + cap) + ',' + d.end + 'p DECISIONS.md');
}

/* ---- A decision ---------------------------------------------------------- */
const decId = /^(DD?)-?(\d{1,3})$/i.exec(query);
if (decId) {
  const id = decId[1].toUpperCase() + '-' + String(decId[2]).padStart(3, '0');
  const d = decs.find(x => x.id === id);
  if (!d) { console.log('No entry ' + id + ' in DECISIONS.md.'); process.exit(1); }
  say('DECISIONS.md lines ' + d.start + '-' + d.end + (d.superseded ? ' · superseded by a later entry' : '') + (d.rooms.length ? ' · rooms: ' + d.rooms.join(', ') : ''));
  say();
  printDecision(d, 0);
  console.log(out.join('\n'));
  process.exit(0);
}

/* ---- A room -------------------------------------------------------------- */
const room = L.roomById(roomList, query);
if (room) {
  const card = L.read('.claude/rules/rooms/' + room.id + '.md');
  if (card) say(card.replace(/^---[\s\S]*?---\n/, '').trim());
  else say('# ' + room.title + ' (`' + room.id + '`) — no card yet: run node tools/context/build.js');
  say();
  say('Registry: ' + room.blurb + (room.aliases.length ? ' (aliases: ' + room.aliases.join(', ') + ')' : ''));
  const related = L.decisionsForRoom(decs, room.id);
  const live = related.filter(d => !d.superseded);
  const full = flags.all ? related : live.slice(-3);
  const older = related.filter(d => full.indexOf(d) < 0);
  if (older.length) {
    say();
    say('## Earlier decisions (titles; pack.js D-### for one)');
    older.forEach(d => say('- ' + (d.superseded ? '~' : '') + d.id + ' — ' + d.title + ' [' + d.start + '-' + d.end + ']'));
  }
  if (full.length) {
    say();
    say('## ' + (flags.all ? 'Every related decision' : 'Latest ' + full.length + ' decision' + (full.length === 1 ? '' : 's')) + ' in full');
    full.forEach(d => { say(); printDecision(d, flags.max); });
  } else { say(); say('No decision links to this room yet.'); }
  console.log(out.join('\n'));
  process.exit(0);
}

/* ---- A field ------------------------------------------------------------- */
const F = L.Ownership.FIELDS;
if (F[query]) {
  const f = L.fields(roomList).find(x => x.id === query);
  say('# `' + f.id + '` — ' + f.label);
  say('Owner: ' + f.owner + ' (rooms/' + f.owner + '.html' + (F[query].anchor ? '#' + F[query].anchor : '') + ')');
  say('Read by: ' + (f.generic ? 'not traced (too generic a word)' : f.users.length ? f.users.join(', ') : 'no other room mentions it'));
  let rows = [];
  try { rows = require(path.join(L.ROOT, 'data/ledger-rows.json')).rows || []; } catch (e) { rows = []; }
  const row = rows.find(r => r.id === f.id);
  say('Ledger row: ' + (row ? 'path ' + row.path + ' · kind ' + row.kind + ' · pass ' + row.pass + ' · family ' + row.family : 'none in data/ledger-rows.json'));
  const re = new RegExp('(`' + L.esc(f.id) + '`|\\b' + L.esc(f.id) + '\\b)');
  const mentioned = decs.filter(d => re.test(d.body)).map(d => (d.superseded ? '~' : '') + d.id);
  say('Decisions that mention it: ' + (mentioned.length ? mentioned.join(', ') : 'none'));
  console.log(out.join('\n'));
  process.exit(0);
}

/* ---- Search -------------------------------------------------------------- */
const words = query.toLowerCase().split(/\s+/).filter(Boolean);
const hit = text => { const t = String(text || '').toLowerCase(); return words.every(w => t.indexOf(w) >= 0); };
const rooms = roomList.filter(r => hit([r.id, r.title, r.aliases.join(' '), r.blurb].join(' ')));
const fieldHits = Object.keys(F).filter(id => hit(id + ' ' + F[id].label));
const decHits = decs.filter(d => hit(d.title));
say('# Matches for "' + query + '"');
say();
say('## Rooms (' + rooms.length + ')');
rooms.forEach(r => say('- ' + r.id + ' — ' + r.title + ': ' + r.blurb.slice(0, 90) + (r.blurb.length > 90 ? '…' : '')));
say();
say('## Fields (' + fieldHits.length + ')');
fieldHits.forEach(id => say('- ' + id + ' — ' + F[id].label + ' (owner ' + F[id].owner + ')'));
say();
say('## Decisions (' + decHits.length + ')');
decHits.forEach(d => say('- ' + (d.superseded ? '~' : '') + d.id + ' — ' + d.title + ' [' + d.start + '-' + d.end + ']'));
if (!rooms.length && !fieldHits.length && !decHits.length) { say(); say('Nothing matched. Try one word, or a room id from docs/context/ROOMS.md.'); }
console.log(out.join('\n'));
