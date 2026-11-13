// Calibration Lock + Overclock Surge prompts.
import { el, svg, button, onPress, safe, clamp } from './dom.js';
import { icon } from './icons.js';
import { createKeypad, createReadout } from './keypad.js';
import { createBlueprint } from './blueprint.js';

const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Opens a prompt. kind: 'calibration' | 'surge'.
 * Returns { promise, forceClose() }.
 */
export function openPrompt(host, { synth, bus, hudHeight, isCovered }, kind, opts) {
  const { a, b } = opts;
  const target = a * b;
  const surge = kind === 'surge';
  const limit = opts.timeLimitMs || 4000;
  const auto = !!opts.autoSolve && !surge;
  const validAnchor = (p) => (p && isFinite(p.x) && isFinite(p.y) ? p : null);
  // getAnchor (optional) lets the game re-project its world anchor after a resize.
  const getAnchor = typeof opts.getAnchor === 'function' ? opts.getAnchor : null;
  let anchor = validAnchor(opts.anchor);
  const t0 = performance.now();
  // Time spent hidden (tab backgrounded), in portrait, or under a drawer does not count against
  // the surge clock or toward either prompt's responseTimeMs.
  let pausedMs = 0, pauseStart = 0;
  const covered = () => { try { return !!(isCovered && isCovered()); } catch (_) { return false; } };
  const isPaused = () => document.hidden || document.documentElement.classList.contains('rf-portrait') || covered();
  const elapsed = () => performance.now() - t0 - pausedMs - (pauseStart ? performance.now() - pauseStart : 0);
  const cancelResult = () => ({ cancelled: true, answered: firstDone, firstTryCorrect: firstDone && firstTry, responseTimeMs: firstDone ? firstMs : 0 });

  let digits = '';
  let firstDone = false, firstTry = false, firstMs = 0;
  let closed = false, late = false, bp = null;
  const timers = [];
  let raf = 0;
  let resolveFn;
  const promise = new Promise((r) => { resolveFn = r; });

  // ---- DOM ----
  const scrim = el('div', 'rf-scrim ' + kind);
  const pos = el('div', 'rf-prompt-pos');
  const panel = el('section', 'rf-prompt ' + kind + (auto ? ' autosolve' : ''), null, { role: 'dialog', 'aria-label': surge ? 'Overclock Surge' : 'Calibration Lock' });
  pos.appendChild(panel);

  const head = el('div', 'rf-prompt-head');
  head.appendChild(el('span', 'rf-prompt-tag', surge ? 'OVERCLOCK SURGE!' : 'CALIBRATION LOCK'));
  let ringArc = null, ringNum = null;
  if (surge) {
    const ring = svg('svg', { viewBox: '0 0 80 80', class: 'rf-surge-ring' });
    ring.appendChild(svg('circle', { cx: 40, cy: 40, r: RING_R, class: 'rf-ring-bg' }));
    ringArc = svg('circle', { cx: 40, cy: 40, r: RING_R, class: 'rf-ring-arc', 'stroke-dasharray': RING_C, 'stroke-dashoffset': 0, transform: 'rotate(-90 40 40)' });
    ring.appendChild(ringArc);
    ringNum = svg('text', { x: 40, y: 40, class: 'rf-ring-num', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    ringNum.textContent = String(Math.ceil(limit / 1000));
    ring.appendChild(ringNum);
    head.appendChild(ring);
  } else {
    const cancel = button('rf-cancel', 'Cancel', icon('close'));
    onPress(cancel, () => { safe(synth, 'click'); finish(cancelResult()); });
    head.appendChild(cancel);
  }
  panel.appendChild(head);

  const body = el('div', 'rf-prompt-body');
  const bpHost = el('div', 'rf-bp-host');
  const main = el('div', 'rf-prompt-main');
  const readout = createReadout(a, b);
  const msg = el('div', 'rf-prompt-msg', auto ? 'AUTO-DRONE ON IT...' : surge ? 'Quick! Beat the clock!' : 'Punch in the answer!');
  const keypad = createKeypad({
    synth,
    onDigit: (d) => typeDigit(d),
    onBack: () => backspace(),
    onEnter: () => enter(),
  });
  main.appendChild(readout.el);
  main.appendChild(msg);
  main.appendChild(keypad.el);
  body.appendChild(bpHost);
  body.appendChild(main);
  panel.appendChild(body);

  if (auto) {
    keypad.setDisabled(true);
    const drone = el('div', 'rf-drone-fly');
    drone.appendChild(icon('drone'));
    panel.appendChild(drone);
  }
  scrim.appendChild(pos);
  host.appendChild(scrim);

  // ---- logic ----
  function render() { readout.set(digits); }
  function typeDigit(d) {
    if (closed || auto) return;
    if (digits.length >= 3) { readout.state('bad'); return; }
    digits += d;
    readout.state('');
    render();
  }
  function backspace() {
    if (closed || auto) return;
    digits = digits.slice(0, -1);
    readout.state('');
    render();
  }
  function enter() {
    if (closed || auto) return;
    if (!digits) { readout.state('bad'); return; }
    submit(parseInt(digits, 10));
  }
  function submit(v) {
    if (!firstDone) {
      firstDone = true;
      firstTry = v === target;
      syncPause();
      firstMs = Math.max(1, Math.round(elapsed()));
    }
    if (v === target) {
      readout.state('good');
      finish({ cancelled: false, firstTryCorrect: firstTry, inTime: firstTry && !late && elapsed() <= limit, responseTimeMs: firstMs });
    } else {
      safe(synth, 'wrong');
      bus && bus.emit(surge ? 'ui:surgeWrong' : 'ui:calibrationWrong', { a, b });
      digits = '';
      render();
      readout.state('bad');
      panel.classList.remove('shake'); void panel.offsetWidth; panel.classList.add('shake');
      msg.textContent = 'Not quite! Count the blocks, then type the total.';
      msg.classList.add('hint');
      showBlueprint();
    }
  }
  function showBlueprint() {
    if (bp) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const u = clamp(Math.min(vw * 0.000732, vh * 0.000977), 0.6, 1);
    bp = createBlueprint(a, b, {
      synth,
      maxW: Math.min(640, vw - (360 * u + 110)),
      maxH: Math.min(520, vh - hudHeight() - 170 * u),
    });
    bpHost.appendChild(bp.el);
    panel.classList.add('with-bp');
    bp.play();
    layout();
  }

  function finish(result) {
    if (closed) return;
    closed = true;
    cleanup();
    scrim.classList.add('leaving');
    setTimeout(() => scrim.remove(), 240);
    if (surge) {
      resolveFn({ firstTryCorrect: !!result.firstTryCorrect, inTime: !!result.inTime, responseTimeMs: result.responseTimeMs });
    } else {
      resolveFn({ cancelled: !!result.cancelled, answered: result.answered !== undefined ? !!result.answered : !result.cancelled, firstTryCorrect: !!result.firstTryCorrect, responseTimeMs: result.responseTimeMs });
    }
  }
  function cleanup() {
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    if (classObs) classObs.disconnect();
    clearInterval(pausePoll);
    if (bp) bp.destroy();
  }

  function onKey(e) {
    if (closed || auto || e.metaKey || e.ctrlKey || e.altKey) return;
    let id = null;
    if (/^[0-9]$/.test(e.key)) id = e.key;
    else if (e.key === 'Backspace') id = 'back';
    else if (e.key === 'Enter') id = 'enter';
    else if (e.key === 'Escape' && !surge) {
      e.preventDefault();
      finish(cancelResult());
      return;
    }
    if (!id) return;
    e.preventDefault();
    if (e.repeat && id !== 'back') return;
    keypad.flash(id);
    if (id === 'back') { safe(synth, 'backspace'); backspace(); }
    else if (id === 'enter') { safe(synth, 'click'); enter(); }
    else { safe(synth, 'keyTap', Number(id)); typeDigit(id); }
  }
  window.addEventListener('keydown', onKey, true);
  // Re-anchor (or re-centre when the game gave no live anchor) after resize/rotate.
  function onResize() {
    if (closed) return;
    syncPause();
    anchor = getAnchor ? validAnchor(safeCall(getAnchor)) : null;
    layout();
    requestAnimationFrame(layout);
  }
  function safeCall(fn) { try { return fn(); } catch (_) { return null; } }
  function onVis() { syncPause(); }
  function syncPause() {
    const p = isPaused();
    if (p && !pauseStart) pauseStart = performance.now();
    else if (!p && pauseStart) { pausedMs += performance.now() - pauseStart; pauseStart = 0; }
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  // Portrait is a class on <html> toggled by the game on resize; follow it directly so the
  // calibration prompt (which has no per-frame loop) pauses too.
  let classObs = null;
  if (typeof MutationObserver !== 'undefined') {
    classObs = new MutationObserver(syncPause);
    classObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  // Cheap poll so pause state is tracked even when rAF is throttled and for causes with
  // no event (a drawer opening).
  const pausePoll = setInterval(syncPause, 100);
  syncPause();

  // ---- positioning ----
  function layout() {
    if (closed) return;
    const vw = window.innerWidth, vh = window.innerHeight, m = 10;
    const top = Math.max(m, hudHeight() + 4);
    const w = pos.offsetWidth, h = pos.offsetHeight;
    const s = Math.min(1, (vw - 2 * m) / w, (vh - top - m) / h);
    const sw = w * s, sh = h * s;
    const cx = (vw - sw) / 2;
    const cy = clamp((vh + top - sh) / 2, top, Math.max(top, vh - sh - m));
    let x = cx, y = cy;
    if (anchor && !bp) {
      const gap = 56;
      let px = anchor.x + gap;
      if (px + sw > vw - m) px = anchor.x - gap - sw;
      if (px >= m && px + sw <= vw - m) {
        x = px;
        y = clamp(anchor.y - sh / 2, top, Math.max(top, vh - sh - m));
      }
    }
    x = clamp(x, m, Math.max(m, vw - sw - m));
    pos.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) scale(${s})`;
  }
  layout();
  requestAnimationFrame(layout);

  // ---- surge countdown ----
  if (surge) {
    let lastSec = 0, lastHalf = false;
    const loop = () => {
      if (closed) return;
      syncPause();
      if (pauseStart) { raf = requestAnimationFrame(loop); return; }
      const el_ = elapsed();
      const p = clamp(el_ / limit, 0, 1);
      ringArc.setAttribute('stroke-dashoffset', String(RING_C * p));
      if (!late) {
        ringNum.textContent = String(Math.max(1, Math.ceil((limit - el_) / 1000)));
        const sec = Math.floor(el_ / 1000);
        if (sec > lastSec && el_ < limit) {
          lastSec = sec;
          safe(synth, 'tick', sec >= Math.floor(limit / 1000) - 1);
        }
        if (!lastHalf && el_ >= limit - 500 && el_ < limit) { lastHalf = true; safe(synth, 'tick', true); }
        if (p >= 1) {
          late = true;
          panel.classList.add('late');
          ringNum.textContent = '!';
          msg.textContent = 'Clear the jam!';
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  // ---- auto-solve flourish ----
  if (auto) {
    const str = String(target);
    const start = 380, step = 230;
    str.split('').forEach((ch, i) => {
      timers.push(setTimeout(() => {
        keypad.flash(ch); safe(synth, 'keyTap', Number(ch));
        digits += ch; render();
      }, start + i * step));
    });
    const enterAt = start + str.length * step + 80;
    timers.push(setTimeout(() => { keypad.flash('enter'); safe(synth, 'click'); readout.state('good'); }, enterAt));
    timers.push(setTimeout(() => {
      firstMs = Math.round(performance.now() - t0);
      finish({ cancelled: false, answered: true, firstTryCorrect: true, responseTimeMs: firstMs });
    }, Math.max(1200, enterAt + 260)));
  }

  return {
    promise,
    forceClose() {
      if (surge) finish({ firstTryCorrect: false, inTime: false, responseTimeMs: Math.round(elapsed()) });
      else finish(cancelResult());
    },
  };
}
