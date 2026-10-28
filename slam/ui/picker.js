// One picker (S-284): a type-ahead box for every field with a known set of answers. Typing filters to five matches at
// most, this client's own first, then recently used (across clients, in this browser), then the library; the top one
// is highlighted and Tab or Enter takes it; the last row is always "Use what I typed". Short forms work (amex, boa,
// 401k, hysa). Picking fills what comes with the choice, as guesses, through the page's one change (one Undo).
// Any choice list over three options gets it too (enhanceSelects): the list stays as it was underneath, so every page
// reads it the same way.

import { h } from './view.js';
import { matchPicks } from '../engine/library.js';

const RECENT = 'slam-picks:v1';
const recentOf = (source) => { try { return (JSON.parse(localStorage.getItem(RECENT) || '{}')[source] || []).map((words) => ({ words, from: 'recent' })); } catch { return []; } };
export function rememberPick(source, words) {
  if (!source || !words) return;
  try { const all = JSON.parse(localStorage.getItem(RECENT) || '{}'); all[source] = [words, ...(all[source] || []).filter((x) => x !== words)].slice(0, 20); localStorage.setItem(RECENT, JSON.stringify(all)); } catch { /* lasts until the page closes */ }
}

let seq = 0;
// attachPicker(input, { entries: () => [{ words, aliases, hint, from: 'mine' | 'library', value }], onPick(entry), onFree(text), source })
export function attachPicker(input, { entries, onPick, onFree = null, source = null, max = 5 }) {
  const id = 'pick-' + (++seq);
  const list = h('ul', { class: 'picker-list', role: 'listbox', id, hidden: true });
  const wrap = h('div', { class: 'picker' });
  input.parentNode ? input.parentNode.insertBefore(wrap, input) : null;
  wrap.append(input, list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', id);
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');
  let shown = [], at = 0;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  const take = (i) => {
    const e = shown[i];
    close();
    if (!e) return;
    if (e.free) { if (onFree) onFree(input.value.trim()); return; }
    input.value = e.words;
    rememberPick(source, e.words);
    onPick(e);
  };
  const draw = () => {
    const q = input.value.trim();
    const all = [...entries(), ...(source ? recentOf(source) : [])];
    shown = q ? matchPicks(all, q, max) : [];
    if (q) shown.push({ words: 'Use what I typed: "' + q + '"', free: true });
    at = 0;
    list.replaceChildren(...shown.map((e, i) => h('li', { role: 'option', id: id + '-' + i, class: 'picker-opt' + (e.free ? ' is-free' : ''), 'aria-selected': String(i === at),
      onpointerdown: (ev) => { ev.preventDefault(); take(i); } },
      h('span', { class: 'picker-words' }, e.words), e.hint ? h('span', { class: 'picker-hint' }, e.hint) : null, e.from === 'mine' ? h('span', { class: 'pill' }, 'yours') : e.from === 'recent' ? h('span', { class: 'pill' }, 'recent') : null)));
    list.hidden = !shown.length;
    input.setAttribute('aria-expanded', String(!list.hidden));
    if (shown.length) input.setAttribute('aria-activedescendant', id + '-0');
  };
  const move = (d) => { if (list.hidden) return; at = (at + d + shown.length) % shown.length; [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === at))); input.setAttribute('aria-activedescendant', id + '-' + at); };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) draw(); else move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && !list.hidden && shown.length) { if (e.key === 'Enter') e.preventDefault(); take(at); }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  return wrap;
}

// Every choice list over three options on the screen gets the picker: a box above the list (kept underneath, so the
// page's own code reads it as before). Short forms for kinds: ALIASES by option value.
const ALIASES = {
  k401: ['401k', '401 k'], roth_k401: ['roth 401k'], k403b: ['403b'], k457b: ['457', '457b'], traditional_ira: ['ira', 'trad ira'], roth_ira: ['roth'], rollover_ira: ['rollover'], sep_ira: ['sep'], simple_ira: ['simple'],
  hysa: ['high yield', 'hysa'], checking: ['checking'], savings: ['savings'], money_market: ['mmf', 'money market'], hsa: ['hsa'], brokerage: ['taxable', 'investing'], k529: ['529', 'college'], cd: ['cd'], i_bond: ['ibond', 'i bond'],
  credit_card: ['card', 'cc'], student_loan: ['student loan', 'federal loan'], private_student_loan: ['private loan'], auto_loan: ['car loan', 'auto'], mortgage: ['home loan'], heloc: ['heloc', 'home equity'], personal_loan: ['personal'], bnpl: ['afterpay', 'klarna', 'affirm'],
  w2: ['paycheck', 'salary', 'job', 'w2'], '1099': ['freelance', 'contract', 'self employed', '1099'], side: ['side gig', 'side hustle'], unemployment: ['ui', 'unemployment'], rental: ['rent income', 'rental'], pension: ['pension'], ss: ['social security', 'ssa'], person: ['family', 'gift'],
  mfj: ['married', 'jointly'], mfs: ['separately'], hoh: ['head of household'], nyc: ['new york city', 'nyc'], yonkers: ['yonkers']
};
export function enhanceSelects(root) {
  for (const sel of root.querySelectorAll('select:not([data-native]):not([data-picked])')) {
    const opts = [...sel.options].filter((o) => o.value !== '');
    if (opts.length <= 3 || sel.multiple || !sel.id) continue;
    sel.dataset.picked = '1';
    const now = sel.options[sel.selectedIndex];
    const box = h('input', { type: 'text', id: sel.id + '-pick', class: 'picker-box', placeholder: 'Type to pick', 'aria-label': sel.getAttribute('aria-label') || null });
    box.value = now && now.value !== '' ? now.textContent : '';
    const group = (o) => (o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : null);
    const entries = () => opts.map((o) => ({ words: o.textContent, aliases: ALIASES[o.value] || [], hint: group(o), value: o.value, from: 'library' }));
    for (const l of root.querySelectorAll('label[for="' + CSS.escape(sel.id) + '"]')) l.htmlFor = box.id;
    sel.classList.add('picked-select');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    sel.parentNode.insertBefore(box, sel);
    attachPicker(box, { entries, max: 5, onPick: (e) => { sel.value = e.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }, onFree: () => { box.value = now ? now.textContent : ''; } });
    // A wide list shows them all on an empty box: arrow down opens the full list, a click too.
    box.addEventListener('focus', () => { if (!box.value) box.dispatchEvent(new Event('input')); });
  }
}
