// ============================================================================
// RagRush - engine.js  (v2 — Premium)
// Core engine: physics, camera, particles, trails, screen FX, audio, save
// ============================================================================
'use strict';

const G = {
  GRAVITY: 1800, FRICTION: 0.85, AIR_FRICTION: 0.95,
  PLAYER_SPEED: 350, JUMP_FORCE: -620, AIR_CONTROL: 0.6,
  COYOTE_TIME: 0.1, JUMP_BUFFER: 0.12, JUMP_CUT: 0.45,
  CROUCH_MULT: 0.45, CRAWL_MULT: 0.2,
  MAX_HEALTH: 100, LIMB_DMG: 25, TORSO_DMG: 100,
  TILE: 40, CAM_SPEED: 6, CAM_LOOKAHEAD: 80,
  SHAKE_DUR: 0.2, SHAKE_MAG: 6,
  LEVELS_PER_TRIAL: 6, TOTAL_TRIALS: 10, MAX_STARS: 3, TOTAL_LEVELS: 60,
  COLORS: {
    bg: '#0e0e20', bgGrad1: '#0a0a18', bgGrad2: '#141428',
    ground: '#22223a', groundTop: '#33335a', groundGrid: '#ffffff06',
    spike: '#cc2244', spikeOutline: '#ff3366',
    saw: '#dd5522', sawCenter: '#332211', sawTeeth: '#ff7744',
    hammer: '#7777aa', hammerHead: '#555577', hammerPivot: '#aaaacc',
    barrel: '#993322', barrelBand: '#661a11', barrelWarn: '#ff4422',
    platform: '#336699', platformTop: '#4488bb', platformEdge: '#224466',
    trap: '#886633', trapWarn: '#cc8822',
    finish: '#22dd66', finishGlow: 'rgba(34,221,102,0.08)',
    player: '#ccccdd', head: '#eeddcc', torso: '#3355aa', arm: '#4466bb', leg: '#2244aa',
    detached: '#773333', blood: '#bb2244', bloodDark: '#881133',
    trail: 'rgba(255,34,68,0.12)', trailFast: 'rgba(255,107,53,0.15)',
    starOn: '#e8b830', starOff: '#333355',
    vignette: 'rgba(0,0,0,0.6)'
  }
};

// ===== INPUT =====
class InputSystem {
  constructor() {
    this.keys = {}; this.prev = {};
    this.moveX = 0; this.jumpPressed = false; this.jumpHeld = false;
    this.crouchHeld = false; this.pausePressed = false;
    this.touch = { left: false, right: false, jump: false, crouch: false };
    window.addEventListener('keydown', e => { this.keys[e.code] = true; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    const mb = (id, prop) => { const el = document.getElementById(id); if (!el) return; el.addEventListener('touchstart', e => { e.preventDefault(); this.touch[prop] = true; }); el.addEventListener('touchend', e => { e.preventDefault(); this.touch[prop] = false; }); };
    mb('m-left', 'left'); mb('m-right', 'right'); mb('m-jump', 'jump'); mb('m-crouch', 'crouch');
  }
  update() {
    const kl = this.keys['ArrowLeft'] || this.keys['KeyA'] || this.touch.left;
    const kr = this.keys['ArrowRight'] || this.keys['KeyD'] || this.touch.right;
    this.moveX = (kr ? 1 : 0) - (kl ? 1 : 0);
    const jNow = this.keys['Space'] || this.keys['ArrowUp'] || this.keys['KeyW'] || this.touch.jump;
    this.jumpPressed = jNow && !this.prev.jump; this.jumpHeld = jNow; this.prev.jump = jNow;
    this.crouchHeld = this.keys['ControlLeft'] || this.keys['KeyC'] || this.keys['ArrowDown'] || this.keys['KeyS'] || this.touch.crouch;
    const pNow = this.keys['Escape'] || this.keys['KeyP'];
    this.pausePressed = pNow && !this.prev.pause; this.prev.pause = pNow;
  }
}

// ===== PHYSICS =====
class PhysicsBody {
  constructor(x, y, w, h, isStatic = false) { this.x = x; this.y = y; this.w = w; this.h = h; this.vx = 0; this.vy = 0; this.isStatic = isStatic; this.grounded = false; this.gravityScale = 1; this.friction = G.FRICTION; }
  get left() { return this.x } get right() { return this.x + this.w } get top() { return this.y } get bottom() { return this.y + this.h }
  get cx() { return this.x + this.w / 2 } get cy() { return this.y + this.h / 2 }
  overlaps(b) { return this.left < b.right && this.right > b.left && this.top < b.bottom && this.bottom > b.top }
  overlapsTrigger(tx, ty, tw, th) { return this.left < tx + tw && this.right > tx && this.top < ty + th && this.bottom > ty }
}

// ===== CAMERA =====
class Camera {
  constructor(canvas) { this.canvas = canvas; this.x = 0; this.y = 0; this.shakeTimer = 0; this.shakeMag = 0; this.shakeX = 0; this.shakeY = 0; this.lookahead = 0; }
  follow(target, dt) {
    const dir = target.vx > 15 ? 1 : target.vx < -15 ? -1 : 0;
    this.lookahead += (dir * G.CAM_LOOKAHEAD - this.lookahead) * 3 * dt;
    const tx = target.cx - this.canvas.width / 2 + this.lookahead;
    const ty = target.cy - this.canvas.height / 2 - 50;
    this.x += (tx - this.x) * G.CAM_SPEED * dt;
    this.y += (ty - this.y) * G.CAM_SPEED * dt;
    if (this.shakeTimer > 0) { this.shakeTimer -= dt; const i = this.shakeTimer * this.shakeMag; this.shakeX = (Math.random() * 2 - 1) * i; this.shakeY = (Math.random() * 2 - 1) * i; } else { this.shakeX = 0; this.shakeY = 0; }
  }
  shake(d, m) { this.shakeTimer = d || G.SHAKE_DUR; this.shakeMag = m || G.SHAKE_MAG; }
  apply(ctx) { ctx.setTransform(1, 0, 0, 1, -this.x + this.shakeX, -this.y + this.shakeY) }
  reset(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0) }
  snap(t) { this.x = t.cx - this.canvas.width / 2; this.y = t.cy - this.canvas.height / 2 - 50; }
}

// ===== PARTICLES (Pooled) =====
class ParticlePool {
  constructor(max) {
    this.pool = []; for (let i = 0; i < (max || 300); i++) this.pool.push({ a: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, ml: 1, sz: 3, c: '#fff', g: 1 });
  }
  emit(x, y, count, color, speed, life, size, grav) {
    let s = 0; for (let i = 0; i < this.pool.length && s < count; i++) { const p = this.pool[i]; if (!p.a) { p.a = true; p.x = x; p.y = y; const a = Math.random() * Math.PI * 2, sp = speed * (.3 + Math.random() * .7); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - speed * .3; p.life = life * (.5 + Math.random() * .5); p.ml = p.life; p.sz = size * (.5 + Math.random() * .5); p.c = color; p.g = grav != null ? grav : 400; s++; } }
  }
  update(dt) { for (let i = 0; i < this.pool.length; i++) { const p = this.pool[i]; if (!p.a) continue; p.life -= dt; if (p.life <= 0) { p.a = false; continue; } p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; } }
  draw(ctx) { for (let i = 0; i < this.pool.length; i++) { const p = this.pool[i]; if (!p.a) continue; ctx.globalAlpha = Math.max(0, p.life / p.ml); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); } ctx.globalAlpha = 1; }
}

// ===== TRAIL SYSTEM =====
class TrailSystem {
  constructor(max) { this.points = []; this.max = max || 60; }
  add(x, y, speed) { this.points.push({ x, y, life: 1, speed: Math.min(1, speed / 400) }); if (this.points.length > this.max) this.points.shift(); }
  update(dt) { for (let i = this.points.length - 1; i >= 0; i--) { this.points[i].life -= dt * 3; if (this.points[i].life <= 0) this.points.splice(i, 1); } }
  draw(ctx) {
    if (this.points.length < 2) return;
    for (let i = 1; i < this.points.length; i++) {
      const p = this.points[i], pp = this.points[i - 1];
      const alpha = p.life * 0.3 * p.speed; if (alpha < 0.01) continue;
      ctx.strokeStyle = p.speed > 0.5 ? G.COLORS.trailFast : G.COLORS.trail;
      ctx.globalAlpha = alpha; ctx.lineWidth = 2 + p.speed * 3;
      ctx.beginPath(); ctx.moveTo(pp.x, pp.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// ===== SCREEN FX =====
class ScreenFX {
  constructor(canvas) { this.canvas = canvas; this.flashAlpha = 0; this.flashColor = '#ff2244'; this.vignetteEnabled = true; this._vigGrad = null; }
  flash(color, intensity) { this.flashColor = color || '#ff2244'; this.flashAlpha = intensity || 0.3; }
  update(dt) { if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 3); }
  draw(ctx) {
    const w = this.canvas.width, h = this.canvas.height;
    // Vignette
    if (this.vignetteEnabled) {
      if (!this._vigGrad || this._vigW !== w || this._vigH !== h) {
        this._vigGrad = ctx.createRadialGradient(w / 2, h / 2, w * .25, w / 2, h / 2, w * .75);
        this._vigGrad.addColorStop(0, 'transparent'); this._vigGrad.addColorStop(1, G.COLORS.vignette);
        this._vigW = w; this._vigH = h;
      }
      ctx.fillStyle = this._vigGrad; ctx.fillRect(0, 0, w, h);
    }
    // Flash
    if (this.flashAlpha > 0.01) { ctx.globalAlpha = this.flashAlpha; ctx.fillStyle = this.flashColor; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
    // Speed lines (when flash active = damage)
    if (this.flashAlpha > 0.05) {
      ctx.globalAlpha = this.flashAlpha * 0.5; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) { const a = Math.random() * Math.PI * 2, r1 = w * .3, r2 = w * .7; ctx.beginPath(); ctx.moveTo(w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1); ctx.lineTo(w / 2 + Math.cos(a) * r2, h / 2 + Math.sin(a) * r2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  }
}

// ===== AUDIO =====
class AudioMgr {
  constructor() { this.ctx = null; this.sfxVol = 0.8; this.musicVol = 0.6; this._init = false; }
  init() { if (this._init) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this._init = true; } catch (e) { } }
  play(name, vol) {
    if (!this.ctx) this.init(); if (!this.ctx) return; const v = (vol || 1) * this.sfxVol;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.connect(gain); gain.connect(this.ctx.destination);
    gain.gain.setValueAtTime(v * 0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    const tones = { jump: [440, 660], hit: [120, 60], land: [180, 90], explode: [60, 30], win: [600, 900, 1200], click: [900, 700], detach: [180, 80] };
    const f = tones[name] || [440, 220]; osc.frequency.setValueAtTime(f[0], this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(f[1], this.ctx.currentTime + 0.15);
    osc.type = name === 'jump' ? 'square' : name === 'explode' ? 'sawtooth' : 'triangle';
    osc.start(); osc.stop(this.ctx.currentTime + 0.25);
  }
}

// ===== SAVE =====
class SaveSystem {
  constructor() { this.data = this._load(); }
  _load() { try { const d = JSON.parse(localStorage.getItem('ragrush_save')); if (d && d.v === 2) return d; } catch (e) { } return { v: 2, stars: {}, times: {}, chars: [0], selChar: 0, sfxVol: 80, musicVol: 60, shake: true, showFps: false }; }
  save() { try { localStorage.setItem('ragrush_save', JSON.stringify(this.data)); } catch (e) { } }
  getStars(l) { return this.data.stars[l] || 0 }
  setStars(l, s) { if (s > this.getStars(l)) { this.data.stars[l] = s; this.save(); } }
  getTime(l) { return this.data.times[l] || Infinity }
  setTime(l, t) { if (t < this.getTime(l)) { this.data.times[l] = t; this.save(); } }
  totalStars() { let t = 0; for (let k in this.data.stars) t += this.data.stars[k]; return t; }
  isUnlocked(l) { return l === 1 || this.getStars(l - 1) > 0 }
  reset() { localStorage.removeItem('ragrush_save'); this.data = this._load(); }
}

window.G = G; window.InputSystem = InputSystem; window.PhysicsBody = PhysicsBody; window.Camera = Camera;
window.ParticlePool = ParticlePool; window.TrailSystem = TrailSystem; window.ScreenFX = ScreenFX;
window.AudioMgr = AudioMgr; window.SaveSystem = SaveSystem;
