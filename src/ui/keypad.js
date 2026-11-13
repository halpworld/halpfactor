// Tactile keypad + hologram readout.
import { el, button, onPress, safe } from './dom.js';
import { icon } from './icons.js';

export function createKeypad({ synth, onDigit, onBack, onEnter }) {
  const root = el('div', 'rf-keypad');
  const keys = {};
  const mk = (id, cls, label, iconNode) => {
    const b = button('rf-key ' + cls, label, iconNode);
    b.dataset.key = id;
    b.setAttribute('aria-label', id === 'back' ? 'Backspace' : id === 'enter' ? 'Ignite' : id);
    keys[id] = b;
    root.appendChild(b);
    return b;
  };
  const layout = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3']];
  // Grid: 3 digit columns + a right column (backspace, tall ENTER).
  mk('7', 'rf-key-d r1 c1', '7'); mk('8', 'rf-key-d r1 c2', '8'); mk('9', 'rf-key-d r1 c3', '9');
  mk('back', 'rf-key-back r1 c4', null, icon('back'));
  mk('4', 'rf-key-d r2 c1', '4'); mk('5', 'rf-key-d r2 c2', '5'); mk('6', 'rf-key-d r2 c3', '6');
  mk('1', 'rf-key-d r3 c1', '1'); mk('2', 'rf-key-d r3 c2', '2'); mk('3', 'rf-key-d r3 c3', '3');
  mk('0', 'rf-key-d r4 c1 zero', '0');
  const enter = mk('enter', 'rf-key-enter r2 c4', null, icon('flash'));
  enter.appendChild(el('span', 'rf-btn-label', 'IGNITE'));
  void layout;

  let disabled = false;
  for (const id in keys) {
    onPress(keys[id], () => {
      if (disabled) return;
      if (id === 'back') { safe(synth, 'backspace'); onBack && onBack(); }
      else if (id === 'enter') { safe(synth, 'click'); onEnter && onEnter(); }
      else { safe(synth, 'keyTap', Number(id)); onDigit && onDigit(id); }
    });
  }

  return {
    el: root,
    setDisabled(v) { disabled = v; root.classList.toggle('auto', v); },
    /** Visual-only press (physical keyboard / auto-solve). */
    flash(id) {
      const b = keys[id];
      if (!b) return;
      b.classList.add('down');
      setTimeout(() => b.classList.remove('down'), 110);
    },
  };
}

export function createReadout(a, b) {
  const root = el('div', 'rf-readout');
  root.appendChild(el('span', 'rf-ro-num', a));
  root.appendChild(el('span', 'rf-ro-op', '×'));
  root.appendChild(el('span', 'rf-ro-num', b));
  root.appendChild(el('span', 'rf-ro-op', '='));
  const slots = el('span', 'rf-ro-slots');
  root.appendChild(slots);
  root.appendChild(el('span', 'rf-ro-scan'));

  function set(str) {
    while (slots.firstChild) slots.removeChild(slots.firstChild);
    const n = Math.max(2, str.length);
    for (let i = 0; i < n; i++) {
      const ch = str[i];
      const s = el('span', 'rf-ro-slot' + (ch === undefined ? ' empty' : '') + (i === str.length ? ' cursor' : ''), ch === undefined ? '_' : ch);
      slots.appendChild(s);
    }
  }
  set('');
  return {
    el: root,
    set,
    state(kind) { // 'bad' | 'good' | ''
      root.classList.remove('bad', 'good');
      void root.offsetWidth;
      if (kind) root.classList.add(kind);
    },
  };
}
