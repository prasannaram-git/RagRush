// ============================================================================
// RagRush - player.js  (v3 — Bug-fixed + Polished)
// Fixed: takeDamage freeze when all limbs detached, better hit detection
// ============================================================================
'use strict';

class Limb {
    constructor(name, offX, offY, w, h, color) {
        this.name = name; this.offX = offX; this.offY = offY; this.w = w; this.h = h; this.color = color;
        this.attached = true; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.angle = 0; this.va = 0; this.life = 3;
    }
    reset() { this.attached = true; this.life = 3; this.angle = 0; }
}

class Player {
    constructor(x, y) {
        this.spawn = { x, y };
        this.body = new PhysicsBody(x, y, 22, 40);
        this.health = G.MAX_HEALTH; this.alive = true; this.invTimer = 0;
        this.isCrawling = false; this.isCrouching = false; this.facingRight = true;
        this.speedMod = 1; this.coyoteTimer = 0; this.jumpBuffer = 0; this.limbsLost = 0;
        this.charData = null; this.squash = 1; this.stretch = 1;
        this.limbs = {
            head: new Limb('head', 3, -8, 16, 16, G.COLORS.head),
            torso: new Limb('torso', 1, 8, 20, 22, G.COLORS.torso),
            leftArm: new Limb('leftArm', -7, 10, 8, 18, G.COLORS.arm),
            rightArm: new Limb('rightArm', 21, 10, 8, 18, G.COLORS.arm),
            leftLeg: new Limb('leftLeg', 1, 30, 9, 14, G.COLORS.leg),
            rightLeg: new Limb('rightLeg', 12, 30, 9, 14, G.COLORS.leg),
        };
    }

    applyCharacter(c) { this.charData = c; this.speedMod = c ? c.speed : 1; }

    reset(x, y) {
        this.body.x = x || this.spawn.x; this.body.y = y || this.spawn.y; this.body.vx = 0; this.body.vy = 0; this.body.grounded = false;
        this.health = G.MAX_HEALTH; this.alive = true; this.invTimer = 0; this.isCrawling = false; this.isCrouching = false;
        this.facingRight = true; this.limbsLost = 0; this.coyoteTimer = 0; this.jumpBuffer = 0;
        this.speedMod = this.charData ? this.charData.speed : 1; this.squash = 1; this.stretch = 1;
        for (const k in this.limbs) this.limbs[k].reset();
    }

    update(dt, input, solids, particles, audio, trail) {
        if (!this.alive) return;
        const b = this.body;
        if (this.invTimer > 0) this.invTimer -= dt;

        // Safety: if health is 0 or below, force death
        if (this.health <= 0) { this.die(particles, audio, null); return; }

        if (b.grounded) this.coyoteTimer = G.COYOTE_TIME; else this.coyoteTimer -= dt;
        if (input.jumpPressed) this.jumpBuffer = G.JUMP_BUFFER; else this.jumpBuffer -= dt;

        let speed = G.PLAYER_SPEED * this.speedMod;
        if (this.isCrawling) speed *= G.CRAWL_MULT; else if (this.isCrouching) speed *= G.CROUCH_MULT;
        const accel = b.grounded ? 1 : G.AIR_CONTROL;
        b.vx += input.moveX * speed * accel * dt * 12;
        if (input.moveX > 0) this.facingRight = true; else if (input.moveX < 0) this.facingRight = false;

        if (this.jumpBuffer > 0 && this.coyoteTimer > 0 && !this.isCrouching) {
            const jf = G.JUMP_FORCE * (this.charData ? this.charData.jump : 1);
            b.vy = jf; this.jumpBuffer = 0; this.coyoteTimer = 0;
            this.stretch = 1.2; this.squash = 0.8;
            audio.play('jump'); particles.emit(b.cx, b.bottom, 5, '#555577', 80, 0.25, 2, 150);
        }
        if (!input.jumpHeld && b.vy < 0) b.vy *= (1 - G.JUMP_CUT * dt * 10);
        if (!this.isCrawling) this.isCrouching = input.crouchHeld && b.grounded;

        b.vy += G.GRAVITY * b.gravityScale * dt;
        b.vx *= b.grounded ? G.FRICTION : G.AIR_FRICTION;
        if (Math.abs(b.vx) < 0.5) b.vx = 0; if (b.vy > 1200) b.vy = 1200;

        b.x += b.vx * dt; this._resolveX(solids);
        b.y += b.vy * dt;
        const wasG = b.grounded; b.grounded = false; this._resolveY(solids);

        if (!wasG && b.grounded) { audio.play('land'); particles.emit(b.cx, b.bottom, 4, '#555566', 60, 0.2, 2, 80); this.squash = 1.15; this.stretch = 0.85; }
        this.squash += (1 - this.squash) * 8 * dt; this.stretch += (1 - this.stretch) * 8 * dt;

        if (trail) { const spd = Math.abs(b.vx) + Math.abs(b.vy) * 0.3; if (spd > 30) trail.add(b.cx, b.cy, spd); }
        this._updateDetached(dt);
    }

    _resolveX(solids) { const b = this.body; for (let i = 0; i < solids.length; i++) { const s = solids[i]; if (!b.overlaps(s)) continue; if (b.vx > 0) b.x = s.left - b.w; else if (b.vx < 0) b.x = s.right; b.vx = 0; } }
    _resolveY(solids) { const b = this.body; for (let i = 0; i < solids.length; i++) { const s = solids[i]; if (!b.overlaps(s)) continue; if (b.vy > 0) { b.y = s.top - b.h; b.vy = 0; b.grounded = true; } else if (b.vy < 0) { b.y = s.bottom; b.vy = 0; } } }

    // ==========================================
    // FIXED: takeDamage — no more freeze bug
    // If target limb is already gone, find another or kill
    // ==========================================
    takeDamage(limbName, particles, audio, screenFX) {
        if (!this.alive || this.invTimer > 0) return;

        // Torso hit = instant death always
        if (limbName === 'torso') { this.die(particles, audio, screenFX); return; }

        // Find the target limb
        let limb = this.limbs[limbName];

        // KEY FIX: If this limb is already detached, find another attached one
        if (!limb || !limb.attached) {
            // Try to find ANY attached non-torso limb
            const candidates = ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
            let found = false;
            for (let i = 0; i < candidates.length; i++) {
                if (this.limbs[candidates[i]] && this.limbs[candidates[i]].attached) {
                    limbName = candidates[i];
                    limb = this.limbs[limbName];
                    found = true;
                    break;
                }
            }
            // If NO limbs left at all, direct torso hit = death
            if (!found) {
                this.die(particles, audio, screenFX);
                return;
            }
        }

        // Apply damage
        const resist = this.charData ? this.charData.resist : 1;
        this.health = Math.max(0, this.health - Math.ceil(G.LIMB_DMG / resist));

        // Detach the limb
        limb.attached = false;
        limb.x = this.body.x + limb.offX; limb.y = this.body.y + limb.offY;
        limb.vx = (Math.random() - 0.5) * 300; limb.vy = -200 - Math.random() * 200; limb.va = (Math.random() - 0.5) * 15;
        this.limbsLost++; this.invTimer = 1.2;
        audio.play('detach');
        if (screenFX) screenFX.flash('#ff2244', 0.25);
        particles.emit(limb.x + limb.w / 2, limb.y + limb.h / 2, 15, G.COLORS.blood, 200, 0.5, 4, 400);
        particles.emit(limb.x + limb.w / 2, limb.y + limb.h / 2, 8, G.COLORS.bloodDark, 150, 0.7, 3, 300);

        // Check legs for crawl mode
        if (!this.limbs.leftLeg.attached && !this.limbs.rightLeg.attached) { this.isCrawling = true; this.body.h = 24; }

        // Recalculate speed
        let mod = 1;
        if (!this.limbs.leftArm.attached) mod -= 0.05; if (!this.limbs.rightArm.attached) mod -= 0.05;
        if (!this.limbs.leftLeg.attached && this.limbs.rightLeg.attached) mod -= 0.3;
        if (this.limbs.leftLeg.attached && !this.limbs.rightLeg.attached) mod -= 0.3;
        if (!this.limbs.head.attached) mod -= 0.2;
        this.speedMod = Math.max(0.2, mod) * (this.charData ? this.charData.speed : 1);

        // Check death
        if (this.health <= 0) this.die(particles, audio, screenFX);
    }

    die(particles, audio, screenFX) {
        if (!this.alive) return; this.alive = false; audio.play('hit');
        if (screenFX) screenFX.flash('#ff0000', 0.4);
        particles.emit(this.body.cx, this.body.cy, 25, G.COLORS.blood, 280, 0.6, 5, 300);
        particles.emit(this.body.cx, this.body.cy, 15, '#ff5533', 200, 0.4, 3, 200);
    }

    _updateDetached(dt) { for (const k in this.limbs) { const l = this.limbs[k]; if (l.attached || l.life <= 0) continue; l.life -= dt; l.vy += G.GRAVITY * dt; l.x += l.vx * dt; l.y += l.vy * dt; l.angle += l.va * dt; } }

    draw(ctx) {
        const b = this.body;
        const flash = this.invTimer > 0 && Math.floor(this.invTimer * 10) % 2 === 0;
        if (flash) ctx.globalAlpha = 0.35;

        ctx.save();
        ctx.translate(b.cx, b.cy);
        ctx.scale(this.facingRight ? this.squash : -this.squash, this.stretch);
        ctx.translate(-b.cx, -b.cy);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath(); ctx.ellipse(b.cx, b.bottom + 2, b.w / 2, 3, 0, 0, Math.PI * 2); ctx.fill();

        for (const k in this.limbs) {
            const l = this.limbs[k]; if (!l.attached) continue;
            const lx = b.x + l.offX, ly = b.y + l.offY;
            if (k === 'head') {
                ctx.fillStyle = l.color;
                ctx.beginPath(); ctx.arc(lx + l.w / 2, ly + l.h / 2, l.w / 2, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = '#1a1a2e';
                const eyeY = ly + l.h * 0.4;
                ctx.fillRect(lx + 4, eyeY, 3, 2); ctx.fillRect(lx + 9, eyeY, 3, 2);
            } else {
                ctx.fillStyle = l.color;
                const r = k === 'torso' ? 3 : 2;
                ctx.beginPath();
                ctx.moveTo(lx + r, ly); ctx.lineTo(lx + l.w - r, ly); ctx.quadraticCurveTo(lx + l.w, ly, lx + l.w, ly + r);
                ctx.lineTo(lx + l.w, ly + l.h - r); ctx.quadraticCurveTo(lx + l.w, ly + l.h, lx + l.w - r, ly + l.h);
                ctx.lineTo(lx + r, ly + l.h); ctx.quadraticCurveTo(lx, ly + l.h, lx, ly + l.h - r);
                ctx.lineTo(lx, ly + r); ctx.quadraticCurveTo(lx, ly, lx + r, ly);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
            }
        }
        ctx.restore();
        ctx.globalAlpha = 1;

        for (const k in this.limbs) {
            const l = this.limbs[k]; if (l.attached || l.life <= 0) continue;
            ctx.save(); ctx.translate(l.x + l.w / 2, l.y + l.h / 2); ctx.rotate(l.angle);
            ctx.globalAlpha = Math.max(0, l.life / 3) * 0.7;
            ctx.fillStyle = G.COLORS.detached;
            ctx.fillRect(-l.w / 2, -l.h / 2, l.w, l.h);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }
}

const CHARACTERS = [
    { id: 0, name: 'RUNNER', desc: 'Balanced all-rounder. Reliable speed, solid jump, decent resilience.', speed: 1, jump: 1, resist: 1, letter: 'R', color: '#3366cc', stars: 0, default: true },
    { id: 1, name: 'PHANTOM', desc: 'Lightning reflexes and blistering speed. Fragile under pressure.', speed: 1.4, jump: 0.9, resist: 0.7, letter: 'P', color: '#cc9900', stars: 15 },
    { id: 2, name: 'FORTRESS', desc: 'Built like a wall. Absorbs punishment but moves deliberately.', speed: 0.7, jump: 0.85, resist: 1.8, letter: 'F', color: '#339933', stars: 30 },
    { id: 3, name: 'VAULTER', desc: 'Defies gravity with extraordinary vertical reach.', speed: 0.9, jump: 1.5, resist: 0.9, letter: 'V', color: '#cc5522', stars: 50 },
    { id: 4, name: 'WRAITH', desc: 'Ethereal and elusive. Paper-thin but untouchable.', speed: 1.2, jump: 1.1, resist: 0.5, letter: 'W', color: '#8833cc', stars: 80 },
    { id: 5, name: 'TITAN', desc: 'The apex predator. Mastery in every discipline.', speed: 1.1, jump: 1.2, resist: 1.5, letter: 'T', color: '#0099cc', stars: 120 },
];

window.Player = Player; window.CHARACTERS = CHARACTERS;
