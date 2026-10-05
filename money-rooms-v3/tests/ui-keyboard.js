/* Keyboard-only entry of a household (QUALITY CONTROL F). Drives the app
   with page.keyboard only: Tab, Enter, Alt shortcuts and typing. Reads the
   household spec and types exactly what it says, then compares the stored
   record to the fixture and round-trips it through export and import. */
import fs from 'node:fs';
import path from 'node:path';
import { specs } from './households/specs.mjs';

const fields = JSON.parse(fs.readFileSync(new URL('../data/fields.json', import.meta.url), 'utf8'));
const usStates = JSON.parse(fs.readFileSync(new URL('../data/us-states.json', import.meta.url), 'utf8')).states;

async function active(page) {
  return page.evaluate(() => {
    const a = document.activeElement; if (!a) return null;
    const tr = a.closest('tr');
    return { tag: a.tagName, col: a.dataset.col || null, aria: a.getAttribute('aria-label'), row: tr ? tr.dataset.row : null, field: a.closest('.fieldrow') ? a.closest('.fieldrow').dataset.field : null, id: a.id || null, dataId: a.getAttribute('data-id') };
  });
}
async function tabTo(page, pred, max) {
  let a = null;
  for (let i = 0; i < (max || 80); i++) {
    a = await active(page);
    if (a && pred(a)) return a;
    await page.keyboard.press('Tab');
  }
  throw new Error('could not Tab to the target (' + pred.toString().slice(0, 80) + '); last focus ' + JSON.stringify(a) + ' at ' + await page.evaluate(() => location.hash));
}

function typedText(d, spec) {
  const [v, state] = Array.isArray(spec) ? spec : [spec, 'known'];
  if (state === 'unknown') return null;
  if (state === 'not-applicable') return 'n/a';
  if (state === 'not-for-me') return 'x';
  if (state === 'will-send') return 'send';
  if (state === 'none') return '0';
  const pre = state === 'verified' ? 'v' : state === 'rough' ? '~' : '';
  switch (d.kind) {
    case 'money': return typeof v === 'object' ? (v.low / 100) + '-' + (v.high / 100) : pre + (v / 100);
    case 'percent': return pre + (Math.round(v * 10000) / 100);
    case 'int': case 'hours': return pre + String(v);
    case 'month': return v;
    case 'text': return String(v);
    default: return String(v);
  }
}
function optionLabel(d, v) { const o = (d.options || []).find(x => x[0] === v); return o ? o[1] : null; }

export async function enterHousehold(page, spec, check) {
  let keys = 0;
  const press = async k => { keys++; await page.keyboard.press(k); };
  const type = async t => { keys += t.length; await page.keyboard.type(t); };

  /* Sun facts */
  await tabTo(page, a => a.aria === 'New client name');
  await type(spec.sun.name[0]); await press('Enter');
  await page.waitForSelector('.fieldrow[data-field="birthDate"]');
  const SUN_TYPES = { birthDate: 'text', state: 'select', city: 'text', workSituation: 'select', dependents: 'int', filingStatus: 'select', bigGoal: 'text' };
  const SUN_OPTIONS = { state: { NY: 'New York' }, workSituation: { employed: 'Employed', 'self-employed': 'Self-employed' }, filingStatus: { single: 'Single', mfj: 'Married', hoh: 'Head' } };
  for (const id of Object.keys(spec.sun)) {
    const [v, state] = spec.sun[id];
    if (id !== 'name') {
      await tabTo(page, a => a.field === id && (a.tag === 'INPUT' || a.tag === 'SELECT') && a.aria !== 'Answer state' && a.aria !== 'Source');
      if (SUN_TYPES[id] === 'select') {
        const lists = { state: usStates.map(x => x[0]), workSituation: ['employed', 'self-employed', 'between-jobs', 'student', 'retired', 'mixed'], filingStatus: ['single', 'mfj', 'hoh'] };
        const idx = lists[id].indexOf(v);
        for (let i = 0; i <= idx; i++) await press('ArrowDown');
      }
      else { await type(String(v)); }
      await press('Tab');
    }
    if (state && state !== 'known') {
      await tabTo(page, a => a.field === id && a.aria === 'Answer state');
      await press(state === 'verified' ? 'v' : state === 'none' ? 'n' : state === 'rough' ? 'r' : 'k');
    }
  }

  /* Planets */
  const PLANET_KEY = { income: 'Alt+2', spending: 'Alt+3', debt: 'Alt+4', safety: 'Alt+5', invest: 'Alt+6', taxes: 'Alt+7', life: 'Alt+8' };
  const rowIds = {};
  const byType = {};
  spec.rows.forEach(r => { (byType[r.planet + '/' + r.type] = byType[r.planet + '/' + r.type] || []).push(r); });
  for (const key of Object.keys(byType)) {
    const [planet, typeId] = key.split('/');
    const tdef = fields.planets[planet].types[typeId];
    await press(PLANET_KEY[planet]);
    await page.waitForSelector('.orbit');
    await tabTo(page, a => a.dataId === typeId);
    await press('Enter');
    await page.waitForSelector('.ledger[data-type="' + typeId + '"]');
    for (const r of byType[key]) {
      if (!tdef.single) { await press('Alt+n'); }
      else { await tabTo(page, a => a.col === 'nickname'); }
      let a0 = null;
      for (let i = 0; i < 40; i++) { a0 = await active(page); if (a0 && a0.col === 'nickname') break; await page.waitForTimeout(50); }
      if (!a0 || a0.col !== 'nickname') throw new Error('after Alt+N the focus is on ' + JSON.stringify(a0) + ' at ' + await page.evaluate(() => location.hash + ' rows=' + mr3.record.planets[location.hash.split('/')[2]].rows.map(x => x.type).join(',') + ' mounted=' + Object.keys(mr3.mounted || {}).join('/') + ' ledgers=' + document.querySelectorAll('.ledger').length + ' overlay=' + document.querySelector('#overlay').children.length) + ' for ' + key + ' row ' + r.id);
      const rowId = a0.row;
      rowIds[r.id] = rowId;
      if (r.nickname) { await type(r.nickname); }
      await press('Tab');
      /* fields in table order: primary, per, state, source, institution, rest */
      const prim = tdef.fields.find(f => fields.fields[f].primary) || tdef.fields.find(f => fields.fields[f].kind === 'money') || tdef.fields[0];
      const order = [prim, 'institution'].concat(tdef.fields.filter(f => f !== prim));
      for (const fid of order) {
        if (fid === 'institution') {
          if (r.institution) { await tabTo(page, a => a.row === rowId && a.col === 'institution'); await type(r.institution); await press('Tab'); }
          continue;
        }
        const d = fields.fields[fid];
        const sp = r.f && r.f[fid];
        if (sp === undefined) continue;
        const arr = Array.isArray(sp) ? sp : [sp, 'known', 'client'];
        const [v, state, source, cad] = arr;
        if (d.kind === 'credits') continue;
        const hasLibrary = tdef.fields.some(f => fields.fields[f].library);
        if (hasLibrary && d.defaultSource === 'lookup-verify') continue; /* the library prefill fills these */
        await tabTo(page, a => a.row === rowId && a.col === fid);
        if (d.kind === 'choice' || d.kind === 'bool') {
          /* selects: Home, then ArrowDown to the option (typeahead is ambiguous: "No" also matches "Not entered") */
          const ids = d.kind === 'bool' ? ['yes', 'no'] : d.options.map(o => o[0]);
          const target = state === 'not-applicable' || state === 'unknown' || state === 'not-for-me' ? -1 : ids.indexOf(d.kind === 'bool' ? (v ? 'yes' : 'no') : v);
          const current = tdef.defaults && tdef.defaults[fid] !== undefined ? ids.indexOf(String(tdef.defaults[fid])) : -1;
          if (target !== current) {
            const steps = target - current;
            for (let i = 0; i < Math.abs(steps); i++) await press(steps > 0 ? 'ArrowDown' : 'ArrowUp');
          }
          if (state === 'not-applicable' || state === 'not-for-me') {
            await press('Alt+s');
            await press(state === 'not-applicable' ? 'a' : 'x');
          }
        } else {
          const t = typedText(d, arr);
          if (t !== null) { await type(t); }
        }
        await press('Tab');
        if (d.cadence && cad && cad !== d.defaultCadence) {
          const a = await active(page);
          if (a.col !== fid + ':cad') await tabTo(page, x => x.row === rowId && x.col === fid + ':cad');
          const order2 = ['paycheck', 'month', 'year', 'oneoff'];
          const from = order2.indexOf(d.defaultCadence), to = order2.indexOf(cad);
          for (let i = 0; i < Math.abs(to - from); i++) await press(to > from ? 'ArrowDown' : 'ArrowUp');
        }
        if (source && source !== 'client' && source !== (d.defaultSource || 'client') && !(d.library || fid === 'annualFee' || fid === 'creditsUsed' || fid === 'fundName' || fid === 'expenseRatio' || fid === 'assetClass')) {
          await tabTo(page, x => x.row === rowId && x.col === fid, 200);
          await press('Alt+o');
          await press(source === 'estimated' ? 'e' : source === 'lookup-verify' ? 'y' : source === 'lookup-confirmed' ? 'l' : 'c');
        }
      }
      if (r.asOf) { await tabTo(page, a => a.row === rowId && a.col === 'asOf'); await type(r.asOf); await press('Tab'); }
      if (r.stress !== undefined && r.stress !== null) { await tabTo(page, a => a.row === rowId && a.col === 'stress'); await type(String(r.stress)); }
      /* credits drawer */
      const creditsField = tdef.fields.find(f => fields.fields[f].kind === 'credits');
      if (creditsField && r.f[creditsField] && Array.isArray(r.f[creditsField]) && r.f[creditsField][0] && typeof r.f[creditsField][0] === 'object') {
        await tabTo(page, a => a.row === rowId && a.col === creditsField);
        await press('Enter');
        await page.waitForSelector('.drawer select');
        const names = Object.keys(r.f[creditsField][0]);
        for (const n of names) { await tabTo(page, a => a.aria === 'Uses ' + n, 40); const want = ['no', 'partly', 'yes'].indexOf(r.f[creditsField][0][n]); for (let i = 0; i < want; i++) await press('ArrowDown'); }
        await press('Escape');
        /* confirming the prefilled list makes it the client's known answer */
        await tabTo(page, a => a.row === rowId && a.col === creditsField, 200);
        await press('Alt+s'); await press(r.f[creditsField][1] === 'known' ? 'k' : 'r');
        await press('Alt+o'); await press('c');
      }
    }
  }
  await page.waitForTimeout(600);
  return { keys, rowIds };
}

/* Compare the stored record against the spec: every typed fact must match value, state, source and cadence. */
export function compareToSpec(record, spec, rowIds, check, label) {
  Object.keys(spec.sun).forEach(id => {
    const [v, state] = spec.sun[id];
    const f = record.sun.f[id];
    check(label + ' sun.' + id, f && JSON.stringify(f.v) === JSON.stringify(v) && f.state === (state || 'known'), f ? JSON.stringify(f.v) + '/' + f.state : 'missing');
  });
  let mismatches = 0, compared = 0;
  spec.rows.forEach(r => {
    const row = Object.values(record.planets).flatMap(p => p.rows).find(x => x.id === rowIds[r.id]);
    if (!row) { check(label + ' row ' + r.id + ' exists', false); return; }
    check(label + ' row ' + r.id + ' columns', row.nickname === (r.nickname || '') && row.institution === (r.institution || '') && (row.asOf || null) === (r.asOf || null) && (row.stress === undefined ? null : row.stress) === (r.stress === undefined ? null : r.stress), JSON.stringify([row.nickname, row.institution, row.asOf, row.stress]));
    Object.keys(r.f || {}).forEach(fid => {
      const arr = Array.isArray(r.f[fid]) ? r.f[fid] : [r.f[fid], 'known', 'client'];
      const [v, state, source, cad] = arr;
      const d = fields.fields[fid];
      const f = row.f[fid];
      compared++;
      const expectedSource = source || d.defaultSource || 'client';
      const expectedCad = d.cadence ? (cad || d.defaultCadence) : undefined;
      const expectedV = state === 'none' ? 0 : (state === 'unknown' || state === 'not-applicable' || state === 'not-for-me' || state === 'will-send') ? null : v;
      const ok = f && JSON.stringify(f.v) === JSON.stringify(expectedV) && f.state === (state || 'known') && f.source === expectedSource && (expectedCad === undefined || f.cad === expectedCad);
      if (!ok) { mismatches++; check(label + ' ' + r.id + '.' + fid, false, 'got ' + (f ? JSON.stringify([f.v, f.state, f.source, f.cad]) : 'nothing') + ' wanted ' + JSON.stringify([expectedV, state || 'known', expectedSource, expectedCad])); }
    });
  });
  check(label + ': every typed fact matches (' + compared + ' facts)', mismatches === 0, mismatches + ' mismatches');
}
