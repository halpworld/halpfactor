// Procedural Web Audio synthesiser. Zero dependencies, no audio files.
//
// Graph:   sfxBus ─┐
//                  ├─> DynamicsCompressor (limiter) -> masterGain -> destination
//          ambBus ─┘
//
// Rules: every public method is a safe no-op before unlock()/while muted and never throws.
// Voices are capped (MAX_VOICES) and the high-frequency sounds (coin, deliver) are rate-limited.
// Sounds are deliberately soft: sines/triangles, filtered noise, short envelopes, no harsh buzz.

const MAX_VOICES = 28;
const AMB_LEVEL = 0.5; // ambient bus gain when on (pads are already quiet)
const hz = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12);

export class Synth {
  constructor() {
    this._ctx = null;
    this._sfxOn = true;
    this._ambOn = true;
    this._master = null;
    this._comp = null;
    this._sfxBus = null;
    this._ambBus = null;
    this._noise = null;
    this._active = 0;
    this._last = Object.create(null);
    this._amb = null;
    this._ambStopTimer = 0;
    this._primed = false;
    this._coinStep = 0;
  }

  // ---------------------------------------------------------------- lifecycle

  /** Call from inside a user gesture. Idempotent. */
  unlock() {
    try {
      if (!this._ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return;
        let ctx;
        try {
          ctx = new AC({ latencyHint: 'interactive' });
        } catch (_) {
          ctx = new AC();
        }
        this._ctx = ctx;
        this._build();
      }
      const ctx = this._ctx;
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      if (!this._primed) {
        // iOS: a started silent buffer inside the gesture fully unlocks output.
        this._primed = true;
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
      }
      this._syncAmbient();
    } catch (_) {
      /* never throw */
    }
  }

  /** Page hidden. */
  suspend() {
    try {
      const ctx = this._ctx;
      if (ctx && ctx.state === 'running') {
        const p = ctx.suspend();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (_) {
      /* ignore */
    }
  }

  get sfxOn() {
    return this._sfxOn;
  }

  setSfx(on) {
    this._sfxOn = !!on;
    try {
      if (this._ctx && this._sfxBus) {
        const g = this._sfxBus.gain;
        const now = this._ctx.currentTime;
        g.cancelScheduledValues(now);
        g.setTargetAtTime(this._sfxOn ? 1 : 0, now, 0.03);
      }
    } catch (_) {
      /* ignore */
    }
  }

  get ambientOn() {
    return this._ambOn;
  }

  setAmbient(on) {
    this._ambOn = !!on;
    this._syncAmbient();
  }

  // ---------------------------------------------------------------- graph

  _build() {
    const ctx = this._ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 20;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = 0.85;
    comp.connect(master);
    master.connect(ctx.destination);

    const sfx = ctx.createGain();
    sfx.gain.value = this._sfxOn ? 1 : 0;
    sfx.connect(comp);
    const amb = ctx.createGain();
    amb.gain.value = 0;
    amb.connect(comp);

    // One shared noise buffer (2 s of white noise), created once.
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this._comp = comp;
    this._master = master;
    this._sfxBus = sfx;
    this._ambBus = amb;
    this._noise = buf;
  }

  _running() {
    return !!(this._ctx && this._sfxBus && this._ctx.state === 'running');
  }

  /** Run a sound-scheduling function if audio is live. fn receives the start time. */
  _play(fn) {
    if (!this._sfxOn || !this._running() || this._active >= MAX_VOICES) return;
    try {
      fn(this._ctx.currentTime + 0.005);
    } catch (_) {
      /* never throw */
    }
  }

  _rate(name, minGapSec) {
    const now = this._ctx ? this._ctx.currentTime : 0;
    const last = this._last[name];
    if (last !== undefined && now - last < minGapSec) return false;
    this._last[name] = now;
    return true;
  }

  /** Oscillator voice with an attack/exp-decay envelope. */
  _tone(o) {
    const ctx = this._ctx;
    if (!ctx || this._active >= MAX_VOICES) return;
    const t = o.t;
    const dur = o.dur;
    const a = Math.min(o.a === undefined ? 0.006 : o.a, dur * 0.5);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let filt = null;
    if (o.lp) {
      filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(o.lp, t);
      if (o.lp2) filt.frequency.exponentialRampToValueAtTime(o.lp2, t + dur);
      filt.Q.value = o.q || 0.7;
      osc.connect(filt);
      filt.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(o.dest || this._sfxBus);
    let lfo = null;
    let lfoGain = null;
    if (o.vib) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = o.vib;
      lfoGain = ctx.createGain();
      lfoGain.gain.value = o.vibDepth || 10;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.03);
    }
    osc.start(t);
    osc.stop(t + dur + 0.03);
    this._active++;
    osc.onended = () => {
      this._active = Math.max(0, this._active - 1);
      try {
        osc.disconnect();
        g.disconnect();
        if (filt) filt.disconnect();
        if (lfo) {
          lfo.disconnect();
          lfoGain.disconnect();
        }
      } catch (_) {
        /* ignore */
      }
    };
  }

  /** Filtered-noise voice (shared noise buffer, random start offset). */
  _hiss(o) {
    const ctx = this._ctx;
    if (!ctx || !this._noise || this._active >= MAX_VOICES) return;
    const t = o.t;
    const dur = o.dur;
    const a = Math.min(o.a === undefined ? 0.004 : o.a, dur * 0.5);
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = o.type || 'bandpass';
    filt.frequency.setValueAtTime(o.f, t);
    if (o.f2) filt.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    filt.Q.value = o.q || 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + a);
    if (o.swell) {
      // build up, then release (whoosh)
      g.gain.linearRampToValueAtTime(o.vol, t + dur * 0.7);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(o.dest || this._sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.03);
    this._active++;
    src.onended = () => {
      this._active = Math.max(0, this._active - 1);
      try {
        src.disconnect();
        filt.disconnect();
        g.disconnect();
      } catch (_) {
        /* ignore */
      }
    };
  }

  // ---------------------------------------------------------------- ambient

  _syncAmbient() {
    try {
      if (!this._ctx || !this._ambBus) return;
      if (this._ambOn) this._ambStart();
      else this._ambStop();
    } catch (_) {
      /* ignore */
    }
  }

  _ambStart() {
    const ctx = this._ctx;
    clearTimeout(this._ambStopTimer);
    this._ambStopTimer = 0;
    if (!this._amb) this._amb = this._buildAmbient();
    const g = this._ambBus.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(AMB_LEVEL, now, 0.7);
  }

  _ambStop() {
    const ctx = this._ctx;
    const g = this._ambBus.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(0, now, 0.4);
    clearTimeout(this._ambStopTimer);
    this._ambStopTimer = setTimeout(() => {
      this._ambStopTimer = 0;
      if (this._ambOn || !this._amb) return;
      try {
        for (const n of this._amb.sources) {
          try {
            n.stop();
          } catch (_) {
            /* already stopped */
          }
        }
        for (const n of this._amb.nodes) {
          try {
            n.disconnect();
          } catch (_) {
            /* ignore */
          }
        }
      } catch (_) {
        /* ignore */
      }
      this._amb = null;
    }, 2600);
  }

  /** Detuned pad chord + slow filter LFO + slow tremolo + soft low pulse. */
  _buildAmbient() {
    const ctx = this._ctx;
    const sources = [];
    const nodes = [];
    const t = ctx.currentTime;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.8;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 650;
    filt.Q.value = 2.2;
    filt.connect(padGain);
    padGain.connect(this._ambBus);
    nodes.push(padGain, filt);

    // Am9-ish chord, two detuned saws per note (soft once lowpassed).
    const chord = [110, 164.81, 220, 261.63, 329.63];
    for (const f of chord) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = 0.032;
        o.connect(og);
        og.connect(filt);
        o.start(t);
        sources.push(o);
        nodes.push(o, og);
      }
    }

    // Slow filter sweep.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.065;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 320;
    lfo.connect(lfoG);
    lfoG.connect(filt.frequency);
    lfo.start(t);
    sources.push(lfo);
    nodes.push(lfo, lfoG);

    // Slow tremolo on the pad.
    const trem = ctx.createOscillator();
    trem.frequency.value = 0.11;
    const tremG = ctx.createGain();
    tremG.gain.value = 0.2;
    trem.connect(tremG);
    tremG.connect(padGain.gain);
    trem.start(t);
    sources.push(trem);
    nodes.push(trem, tremG);

    // Soft low pulse (machinery heartbeat).
    const pulse = ctx.createOscillator();
    pulse.type = 'triangle';
    pulse.frequency.value = 55;
    const pulseG = ctx.createGain();
    pulseG.gain.value = 0.07;
    const pulseLfo = ctx.createOscillator();
    pulseLfo.frequency.value = 1.6;
    const pulseLfoG = ctx.createGain();
    pulseLfoG.gain.value = 0.07;
    pulseLfo.connect(pulseLfoG);
    pulseLfoG.connect(pulseG.gain);
    pulse.connect(pulseG);
    pulseG.connect(this._ambBus);
    pulse.start(t);
    pulseLfo.start(t);
    sources.push(pulse, pulseLfo);
    nodes.push(pulse, pulseG, pulseLfo, pulseLfoG);

    return { sources, nodes };
  }

  // ---------------------------------------------------------------- UI sounds

  click() {
    this._play((t) => {
      this._tone({ type: 'sine', f: 1300, f2: 700, t, dur: 0.05, vol: 0.12, a: 0.002 });
      this._hiss({ type: 'highpass', f: 4500, t, dur: 0.018, vol: 0.05, a: 0.001 });
    });
  }

  keyTap(digit) {
    this._play((t) => {
      const d = Math.max(0, Math.min(9, Math.floor(Number(digit)) || 0));
      const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
      const f = hz(steps[d] - 9) * (1 + (Math.random() - 0.5) * 0.008); // G4 upward, pentatonic
      this._tone({ type: 'triangle', f, t, dur: 0.07, vol: 0.14, a: 0.002, lp: 3500 });
      this._hiss({ type: 'highpass', f: 5000, t, dur: 0.014, vol: 0.04, a: 0.001 });
    });
  }

  backspace() {
    this._play((t) => {
      this._tone({ type: 'triangle', f: 620, f2: 330, t, dur: 0.07, vol: 0.12, a: 0.002, lp: 3000 });
    });
  }

  uiOpen() {
    this._play((t) => {
      this._tone({ type: 'sine', f: 440, f2: 880, t, dur: 0.14, vol: 0.09, a: 0.01 });
      this._hiss({ type: 'bandpass', f: 600, f2: 2400, q: 1.2, t, dur: 0.16, vol: 0.06, a: 0.02 });
    });
  }

  uiClose() {
    this._play((t) => {
      this._tone({ type: 'sine', f: 800, f2: 400, t, dur: 0.12, vol: 0.09, a: 0.006 });
      this._hiss({ type: 'bandpass', f: 2200, f2: 500, q: 1.2, t, dur: 0.13, vol: 0.05, a: 0.01 });
    });
  }

  // ---------------------------------------------------------------- machines

  /** Hydraulic hiss: belt wired / machine placed. */
  hiss() {
    this._play((t) => {
      this._hiss({ type: 'bandpass', f: 6500, f2: 2800, q: 0.9, t, dur: 0.36, vol: 0.11, a: 0.03 });
      this._hiss({ type: 'highpass', f: 3500, t, dur: 0.25, vol: 0.04, a: 0.02 });
      this._tone({ type: 'sine', f: 110, f2: 60, t, dur: 0.1, vol: 0.2, a: 0.004 });
    });
  }

  /** Steam-vent burst + low buzz (kept soft: lowpassed triangle). */
  jam() {
    this._play((t) => {
      this._hiss({ type: 'bandpass', f: 2600, f2: 800, q: 0.7, t, dur: 0.55, vol: 0.16, a: 0.015 });
      this._tone({ type: 'triangle', f: 75, f2: 62, t, dur: 0.45, vol: 0.16, a: 0.02, lp: 260, vib: 14, vibDepth: 6 });
      this._tone({ type: 'triangle', f: 150, f2: 120, t: t + 0.05, dur: 0.3, vol: 0.06, a: 0.02, lp: 400 });
    });
  }

  /** Comical sputter / pop. */
  smoke() {
    this._play((t) => {
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.085;
        this._hiss({ type: 'lowpass', f: 900 - i * 200, t: tt, dur: 0.07, vol: 0.14 - i * 0.03, a: 0.002 });
        this._tone({ type: 'sine', f: 240 - i * 40, f2: 120 - i * 20, t: tt, dur: 0.08, vol: 0.12 - i * 0.02, a: 0.003 });
      }
      // sad slide-whistle puff
      this._tone({ type: 'sine', f: 420, f2: 130, t: t + 0.26, dur: 0.32, vol: 0.09, a: 0.02, vib: 9, vibDepth: 12 });
    });
  }

  surgeStart() {
    this._play((t) => {
      this._hiss({ type: 'bandpass', f: 400, f2: 5200, q: 1.1, t, dur: 0.55, vol: 0.14, a: 0.1, swell: true });
      this._tone({ type: 'sawtooth', f: 180, f2: 760, t, dur: 0.55, vol: 0.05, a: 0.1, lp: 1200 });
      const sp = [1568, 1976, 2349, 3136];
      sp.forEach((f, i) => {
        this._tone({ type: 'sine', f, t: t + 0.32 + i * 0.07, dur: 0.14, vol: 0.06, a: 0.003 });
      });
    });
  }

  surgeEnd() {
    this._play((t) => {
      this._hiss({ type: 'bandpass', f: 3500, f2: 350, q: 1.0, t, dur: 0.42, vol: 0.1, a: 0.02 });
      this._tone({ type: 'triangle', f: hz(10), t, dur: 0.14, vol: 0.1, a: 0.004, lp: 3000 });
      this._tone({ type: 'triangle', f: hz(3), t: t + 0.12, dur: 0.22, vol: 0.1, a: 0.004, lp: 2500 });
    });
  }

  tick(urgent = false) {
    this._play((t) => {
      const f = urgent ? 1500 : 1000;
      this._tone({ type: 'sine', f, f2: f * 0.8, t, dur: 0.04, vol: urgent ? 0.17 : 0.1, a: 0.001 });
      this._hiss({ type: 'highpass', f: 5500, t, dur: 0.012, vol: urgent ? 0.06 : 0.035, a: 0.001 });
      if (urgent) this._tone({ type: 'sine', f: f * 1.5, t: t + 0.06, dur: 0.03, vol: 0.08, a: 0.001 });
    });
  }

  // ---------------------------------------------------------------- feedback

  /** Ascending major-pentatonic arpeggio; longer + brighter with streak (0..5). */
  correct(streak = 0) {
    this._play((t) => {
      const s = Math.max(0, Math.min(5, Math.floor(Number(streak)) || 0));
      const scale = [0, 4, 7, 12, 16, 19, 24];
      const count = Math.min(scale.length, 3 + Math.min(s, 3));
      const root = 3 + s; // C5 and up (semitones from A4)
      const bright = 3000 + s * 1200;
      for (let i = 0; i < count; i++) {
        const f = hz(root + scale[i]);
        const last = i === count - 1;
        const tt = t + i * 0.066;
        this._tone({ type: 'triangle', f, t: tt, dur: last ? 0.34 : 0.16, vol: 0.13, a: 0.004, lp: bright });
        this._tone({ type: 'sine', f: f * 2, t: tt, dur: last ? 0.28 : 0.1, vol: 0.03 + s * 0.008, a: 0.003 });
      }
      if (s >= 3) {
        this._hiss({ type: 'highpass', f: 7000, t: t + count * 0.05, dur: 0.22, vol: 0.03, a: 0.01 });
      }
    });
  }

  /** Gentle two-note "bo-bonk". Soft triangle, falling. Never harsh. */
  wrong() {
    this._play((t) => {
      this._tone({ type: 'triangle', f: 294, f2: 270, t, dur: 0.14, vol: 0.17, a: 0.005, lp: 1200 });
      this._tone({ type: 'triangle', f: 247, f2: 196, t: t + 0.13, dur: 0.26, vol: 0.17, a: 0.005, lp: 900 });
      this._hiss({ type: 'lowpass', f: 500, t: t + 0.13, dur: 0.05, vol: 0.05, a: 0.002 });
    });
  }

  /** Single gold-bolt blip (rate-limited). Pitch steps up through a small run. */
  coin() {
    if (!this._running() || !this._sfxOn) return;
    if (!this._rate('coin', 0.045)) return;
    this._play((t) => {
      this._coinStep = (this._coinStep + 1) % 4;
      const lift = [0, 2, 4, 7][this._coinStep];
      const f1 = hz(14 + lift); // ~B5 and up
      this._tone({ type: 'sine', f: f1, t, dur: 0.07, vol: 0.12, a: 0.002 });
      this._tone({ type: 'sine', f: f1 * 1.335, t: t + 0.055, dur: 0.18, vol: 0.12, a: 0.002 });
      this._tone({ type: 'sine', f: f1 * 2.67, t: t + 0.055, dur: 0.1, vol: 0.03, a: 0.002 });
    });
  }

  /** Item thunks into the cargo hatch (rate-limited). */
  deliver() {
    if (!this._running() || !this._sfxOn) return;
    if (!this._rate('deliver', 0.07)) return;
    this._play((t) => {
      this._tone({ type: 'sine', f: 170, f2: 62, t, dur: 0.13, vol: 0.3, a: 0.002 });
      this._hiss({ type: 'lowpass', f: 450, t, dur: 0.05, vol: 0.1, a: 0.002 });
      this._tone({ type: 'triangle', f: 820, f2: 420, t, dur: 0.03, vol: 0.05, a: 0.001 });
    });
  }

  // ---------------------------------------------------------------- characters

  /** Servo/robot motif: two rising whirrs + a clunk. */
  bossArrive() {
    this._play((t) => {
      const whirr = (tt, f1, f2, d) => {
        this._tone({ type: 'sawtooth', f: f1, f2, t: tt, dur: d, vol: 0.06, a: 0.03, lp: 900, lp2: 1800, q: 3, vib: 26, vibDepth: f1 * 0.04 });
        this._hiss({ type: 'bandpass', f: f2 * 3, q: 4, t: tt, dur: d, vol: 0.025, a: 0.03 });
      };
      whirr(t, 160, 320, 0.22);
      whirr(t + 0.26, 220, 440, 0.22);
      this._tone({ type: 'sine', f: 90, f2: 45, t: t + 0.52, dur: 0.2, vol: 0.28, a: 0.003 });
      this._hiss({ type: 'lowpass', f: 700, t: t + 0.52, dur: 0.08, vol: 0.1, a: 0.002 });
      this._tone({ type: 'triangle', f: hz(3), t: t + 0.6, dur: 0.18, vol: 0.07, a: 0.004, lp: 2500 });
    });
  }

  /** Happy R2-style chirp. */
  bossHappy() {
    this._play((t) => {
      const seq = [
        [600, 1200, 0],
        [900, 1500, 0.08],
        [1400, 900, 0.16],
        [1100, 1900, 0.24],
      ];
      for (const [a, b, off] of seq) {
        this._tone({ type: 'triangle', f: a, f2: b, t: t + off, dur: 0.075, vol: 0.12, a: 0.004, lp: 4000, vib: 30, vibDepth: 25 });
      }
      this._tone({ type: 'sine', f: 1900, t: t + 0.33, dur: 0.18, vol: 0.06, a: 0.004 });
    });
  }

  levelUp() {
    this._play((t) => {
      const notes = [3, 7, 10, 15, 19, 22]; // C5 E5 G5 C6 E6 G6
      notes.forEach((n, i) => {
        this._tone({ type: 'triangle', f: hz(n), t: t + i * 0.085, dur: 0.2, vol: 0.12, a: 0.004, lp: 5000 });
        this._tone({ type: 'sine', f: hz(n + 12), t: t + i * 0.085, dur: 0.14, vol: 0.035, a: 0.004 });
      });
      const ct = t + notes.length * 0.085;
      for (const n of [15, 19, 22]) {
        this._tone({ type: 'triangle', f: hz(n), t: ct, dur: 0.75, vol: 0.09, a: 0.01, lp: 4500 });
      }
      this._hiss({ type: 'highpass', f: 7500, t: ct, dur: 0.6, vol: 0.035, a: 0.02 });
    });
  }

  /** Ka-ching. */
  purchase() {
    this._play((t) => {
      this._hiss({ type: 'highpass', f: 6000, t, dur: 0.04, vol: 0.07, a: 0.001 });
      this._tone({ type: 'sine', f: 1318.5, t: t + 0.03, dur: 0.12, vol: 0.12, a: 0.002 });
      this._tone({ type: 'sine', f: 1760, t: t + 0.1, dur: 0.5, vol: 0.12, a: 0.002 });
      this._tone({ type: 'sine', f: 1760 * 2.76, t: t + 0.1, dur: 0.25, vol: 0.035, a: 0.002 });
      this._tone({ type: 'sine', f: 2349, t: t + 0.18, dur: 0.35, vol: 0.06, a: 0.002 });
    });
  }

  /** Robo-cat electronic "mee-ow". */
  meow() {
    this._play((t) => {
      const dur = 0.5;
      const ctx = this._ctx;
      if (this._active >= MAX_VOICES - 2) return;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.linearRampToValueAtTime(900, t + 0.14);
      osc.frequency.linearRampToValueAtTime(560, t + dur);
      const vib = ctx.createOscillator();
      vib.frequency.value = 22;
      const vibG = ctx.createGain();
      vibG.gain.value = 14;
      vib.connect(vibG);
      vibG.connect(osc.frequency);
      const formant = ctx.createBiquadFilter(); // "ee" -> "ow" sweep
      formant.type = 'bandpass';
      formant.Q.value = 3.5;
      formant.frequency.setValueAtTime(2300, t);
      formant.frequency.exponentialRampToValueAtTime(950, t + dur);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.32, t + 0.05);
      g.gain.setValueAtTime(0.32, t + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(formant);
      formant.connect(lp);
      lp.connect(g);
      g.connect(this._sfxBus);
      osc.start(t);
      vib.start(t);
      osc.stop(t + dur + 0.03);
      vib.stop(t + dur + 0.03);
      this._active++;
      osc.onended = () => {
        this._active = Math.max(0, this._active - 1);
        try {
          osc.disconnect();
          vib.disconnect();
          vibG.disconnect();
          formant.disconnect();
          lp.disconnect();
          g.disconnect();
        } catch (_) {
          /* ignore */
        }
      };
    });
  }
}
