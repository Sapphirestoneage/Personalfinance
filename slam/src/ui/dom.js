// h(): a tiny helper to build DOM elements without a framework.
// h('button', { class: 'btn', onclick: fn }, 'Save') -> <button class="btn">Save</button>
// Imports nothing; every screen and component builds its markup with it.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    // null, undefined and false mean "leave this attribute off", so callers can write class: on ? 'x' : null.
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    // value, checked, selected and disabled are set as properties, which is what the browser reads for a
    // live control; everything else is an attribute, and true becomes a bare boolean attribute.
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function options(list, selected) {
  return list.map(([value, label]) => h('option', { value, selected: value === selected }, label));
}

// For SVG markup built as strings.
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
