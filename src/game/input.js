// Pointer Events on the canvas → world-space callbacks. Multi-touch safe:
// only one "primary" pointer drives drag interactions at a time; extra fingers
// still produce taps via onDown but never steal an active drag.

export class Input {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../render/renderer.js').Renderer} renderer
   * @param {{down:Function, move:Function, up:Function, cancel:Function}} h  (wx, wy, pointerId)
   */
  constructor(canvas, renderer, h) {
    this.canvas = canvas;
    this.r = renderer;
    this.h = h;
    this._down = (e) => this._on(e, 'down');
    this._move = (e) => this._on(e, 'move');
    this._up = (e) => this._on(e, 'up');
    this._cancel = (e) => this._on(e, 'cancel');
    canvas.addEventListener('pointerdown', this._down, { passive: false });
    canvas.addEventListener('pointermove', this._move, { passive: false });
    canvas.addEventListener('pointerup', this._up, { passive: false });
    canvas.addEventListener('pointercancel', this._cancel, { passive: false });
    canvas.addEventListener('lostpointercapture', this._cancel);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _on(e, kind) {
    if (kind !== 'cancel' && e.cancelable) e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = this.r.screenToWorld(sx, sy);
    if (kind === 'down') {
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch (_) {
        /* not fatal */
      }
    }
    try {
      this.h[kind](w.x, w.y, e.pointerId, e);
    } catch (err) {
      console.error('[input] handler failed', err);
    }
  }
}
