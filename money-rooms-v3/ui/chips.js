/* State and source chips: text in their own column, never colour alone, one
   keystroke to change. A chip is a <select> you can type into, dressed as a chip. */
import { h } from './dom.js';
import { STATES, SOURCES, STATE_ORDER, SOURCE_ORDER, stateByKey, sourceByKey } from '../engine/states.js';

export function stateChip(fieldObj, onChange, opts) {
  const o = opts || {};
  const st = STATES[(fieldObj && fieldObj.state) || 'unknown'];
  const sel = h('select', { 'aria-label': (o.label || 'Answer state'), onChange: e => onChange(e.target.value) },
    STATE_ORDER.filter(id => !(o.exclude || []).includes(id)).map(id => h('option', { value: id, selected: id === st.id }, STATES[id].label + ' (' + STATES[id].key + ')')));
  sel.addEventListener('keydown', e => {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const s = stateByKey(e.key.toLowerCase());
      if (s && !(o.exclude || []).includes(s.id)) { e.preventDefault(); sel.value = s.id; onChange(s.id); }
    }
  });
  return h('span', { class: 'chipselect' }, h('span', { class: 'chip state-' + st.id, 'aria-hidden': 'true' }, o.short ? st.short : st.label), sel);
}

export function sourceChip(fieldObj, onChange, opts) {
  const o = opts || {};
  const src = SOURCES[(fieldObj && fieldObj.source) || 'client'];
  const choices = SOURCE_ORDER.filter(id => id !== 'computed' && id !== 'inferred');
  const sel = h('select', { 'aria-label': (o.label || 'Source'), onChange: e => onChange(e.target.value) },
    choices.map(id => h('option', { value: id, selected: id === src.id }, SOURCES[id].long + ' (' + SOURCES[id].key + ')')));
  sel.addEventListener('keydown', e => {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const s = sourceByKey(e.key.toLowerCase());
      if (s && choices.includes(s.id)) { e.preventDefault(); sel.value = s.id; onChange(s.id); }
    }
  });
  return h('span', { class: 'chipselect' }, h('span', { class: 'chip src src-' + src.id, 'aria-hidden': 'true' }, src.label), sel);
}

/* Read-only chips for Client view and tables. */
export function stateChipStatic(stateId) {
  const st = STATES[stateId || 'unknown'];
  return h('span', { class: 'chip state-' + st.id }, st.label);
}
export function sourceChipStatic(sourceId) {
  const s = SOURCES[sourceId || 'client'];
  return h('span', { class: 'chip src src-' + s.id }, s.label);
}
export function needsChip(text) { return h('span', { class: 'chip needs' }, text); }
