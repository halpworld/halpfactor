// Egg hatch overlay: wobble -> crack -> reveal. Tap to continue.
import { el, svg, safe, reducedMotion } from './dom.js';
import { formatBoost } from '../core/format.js';
import { petCanvas, rarityInfo } from './petart.js';

const CONFETTI = ['#ffd34d', '#fff3b0', '#ff3df2', '#22f0ff', '#39ff88'];

export class HatchOverlay {
  constructor(root, { synth } = {}) {
    this.root = root;
    this.synth = synth || {};
    this.cur = null;
  }

  get isOpen() { return !!this.cur; }

  /** pet: {id,name,rarity,golden,boost,isNew}; opts: {egg:'basic'|'neon'|'galaxy'}. Resolves after the tap. */
  play(pet, opts = {}) {
    if (this.cur) this.cur.finish();
    return new Promise((resolve) => {
      const info = rarityInfo(pet.rarity);
      const legendary = pet.rarity === 'legendary';
      const quick = reducedMotion();
      const timers = [];
      const later = (fn, ms) => timers.push(setTimeout(fn, quick ? Math.min(ms, 250) : ms));
      let revealed = false, ready = false, done = false;

      const ov = el('div', 'sx-hatch' + (legendary ? ' legendary' : '') + (pet.rarity ? ' r-' + pet.rarity : ''), null, { role: 'dialog', 'aria-label': 'Egg hatching' });
      ov.style.setProperty('--rc', pet.golden ? '#ffd34d' : info.color);
      ov.style.setProperty('--rg', pet.golden ? 'rgba(255,211,77,.75)' : info.glow);
      const rays = el('div', 'sx-hatch-rays');
      const stage = el('div', 'sx-hatch-stage');
      const egg = el('div', 'sx-egg big egg-' + (opts.egg || 'basic') + ' wobble');
      egg.appendChild(el('i', 'sx-egg-spot a'));
      egg.appendChild(el('i', 'sx-egg-spot b'));
      egg.appendChild(el('i', 'sx-egg-spot c'));
      const crack = svg('svg', { viewBox: '0 0 100 140', class: 'sx-crack' });
      crack.appendChild(svg('path', { d: 'M50 10 L42 40 L58 58 L40 84 L56 104 L48 130', class: 'sx-crack-line' }));
      crack.appendChild(svg('path', { d: 'M42 40 L24 50 M58 58 L78 66 M40 84 L22 96', class: 'sx-crack-line thin' }));
      egg.appendChild(crack);
      stage.appendChild(egg);
      const shards = el('div', 'sx-shards');
      for (let i = 0; i < 9; i++) {
        const s = el('i', 'sx-shard');
        const ang = (i / 9) * Math.PI * 2 + 0.3;
        s.style.setProperty('--dx', Math.round(Math.cos(ang) * (150 + (i % 3) * 40)) + 'px');
        s.style.setProperty('--dy', Math.round(Math.sin(ang) * (110 + (i % 2) * 50) - 40) + 'px');
        s.style.setProperty('--r', Math.round((i - 4) * 70) + 'deg');
        shards.appendChild(s);
      }
      stage.appendChild(shards);
      const flash = el('div', 'sx-hatch-flash');
      const petWrap = el('div', 'sx-hatch-pet');
      stage.appendChild(petWrap);

      const infoBox = el('div', 'sx-hatch-info');
      infoBox.appendChild(el('div', 'sx-hatch-rarity', info.name));
      infoBox.appendChild(el('div', 'sx-hatch-name', (pet.golden ? 'Golden ' : '') + pet.name));
      infoBox.appendChild(el('div', 'sx-hatch-boost', formatBoost(pet.boost) + ' bolts'));
      if (pet.isNew) infoBox.appendChild(el('div', 'sx-new-tag', 'NEW!'));
      const tap = el('div', 'sx-hatch-tap', 'TAP TO CONTINUE');
      ov.append(rays, stage, flash, infoBox, tap);

      if (legendary && !quick) {
        const fx = el('div', 'sx-hatch-confetti');
        for (let i = 0; i < 60; i++) {
          const c = el('i', 'sx-conf');
          c.style.setProperty('--x', (Math.random() * 100).toFixed(1) + '%');
          c.style.setProperty('--dx', Math.round((Math.random() - 0.5) * 220) + 'px');
          c.style.setProperty('--rot', Math.round(360 + Math.random() * 720) + 'deg');
          c.style.setProperty('--d', (Math.random() * 1.2).toFixed(2) + 's');
          c.style.setProperty('--t', (2 + Math.random() * 1.6).toFixed(2) + 's');
          c.style.background = CONFETTI[i % CONFETTI.length];
          fx.appendChild(c);
        }
        ov.appendChild(fx);
      }

      const reveal = () => {
        if (revealed) return;
        revealed = true;
        egg.classList.remove('wobble', 'cracking');
        egg.classList.add('gone');
        shards.classList.add('go');
        flash.classList.add('go');
        ov.classList.add('revealed');
        petWrap.appendChild(petCanvas(260, { id: pet.id, rarity: pet.rarity, golden: pet.golden, animate: true }));
        safe(this.synth, 'correct', Math.min(5, (info.rank || 0) + 1));
        safe(this.synth, 'coin');
        if (info.rank >= 3) later(() => safe(this.synth, 'bossHappy'), 250);
        if (legendary) {
          later(() => safe(this.synth, 'levelUp'), 150);
          later(() => safe(this.synth, 'coin'), 500);
          later(() => safe(this.synth, 'meow'), 800);
          later(() => safe(this.synth, 'coin'), 1000);
        }
        if (pet.isNew) later(() => safe(this.synth, 'coin'), 600);
        later(() => { ready = true; tap.classList.add('show'); }, legendary ? 1200 : 700);
      };

      const finish = () => {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout);
        ov.classList.add('leaving');
        safe(this.synth, 'uiClose');
        setTimeout(() => ov.remove(), 260);
        if (this.cur && this.cur.ov === ov) this.cur = null;
        resolve(pet);
      };
      this.cur = { ov, finish };

      ov.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!revealed) { reveal(); return; }
        if (ready) finish();
      });

      this.root.appendChild(ov);
      safe(this.synth, 'uiOpen');

      // wobble (growing) -> crack -> reveal
      [200, 650, 1050, 1350].forEach((ms, i) => later(() => safe(this.synth, 'keyTap', 2 + i * 2), ms));
      later(() => { egg.classList.remove('wobble'); egg.classList.add('cracking'); safe(this.synth, 'hiss'); }, 1550);
      later(() => safe(this.synth, 'smoke'), 2050);
      later(reveal, legendary ? 2500 : 2250);
    });
  }
}
