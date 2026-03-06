// ============================================================================
// RagRush - levels.js (v5 — Expert-Crafted Level Design)
// Curated obstacle patterns, themed terrain, progressive difficulty,
// collectible coins, environmental variety, rhythmic challenge design
// ============================================================================
'use strict';

class Obstacle {
    constructor(type, x, y, w, h, cfg) {
        this.type = type; this.x = x; this.y = y; this.w = w; this.h = h; this.config = cfg || {};
        this.active = true; this.time = Math.random() * 5; this.startX = x; this.startY = y; this.angle = 0;
        this.triggered = false; this.triggerTimer = 0; this.vy = 0; this.exploded = false;
        this.headX = null; this.headY = null;
        this.collected = false; // For coins
        this._laserOn = true;
    }

    update(dt, player, particles, audio, camera, screenFX) {
        if (!this.active) return; this.time += dt;
        switch (this.type) {
            case 'saw': this._saw(dt); break;
            case 'hammer': this._hammer(); break;
            case 'platform': this._platform(dt, player); break;
            case 'fallingTrap': this._trap(dt, player); break;
            case 'laser': this._laser(); break;
            case 'crusher': this._crusher(); break;
            case 'pendulum': this._pendulum(); break;
            case 'coin': this._coin(player, particles, audio); return; // no hit needed
        }
        if (player.alive && this.active) this._hit(player, particles, audio, camera, screenFX);
    }

    _saw(dt) {
        this.angle += (this.config.speed || 5) * dt;
        if (this.config.pathX) this.x = this.startX + Math.sin(this.time * (this.config.ms || 1.2)) * this.config.pathX;
        if (this.config.pathY) this.y = this.startY + Math.sin(this.time * (this.config.ms || 1.2)) * this.config.pathY;
    }
    _hammer() {
        const spd = this.config.speed || 2, rng = this.config.range || 50;
        this.angle = Math.sin(this.time * spd) * rng * Math.PI / 180;
        const len = this.config.length || 75;
        this.headX = this.x + Math.sin(this.angle) * len;
        this.headY = this.y + Math.cos(this.angle) * len;
    }
    _pendulum() {
        const spd = this.config.speed || 1.8, rng = this.config.range || 60;
        this.angle = Math.sin(this.time * spd) * rng * Math.PI / 180;
        const len = this.config.length || 90;
        this.headX = this.x + Math.sin(this.angle) * len;
        this.headY = this.y + Math.cos(this.angle) * len;
    }
    _platform(dt, player) {
        const pts = this.config.points; if (!pts || pts.length < 2) return;
        const spd = this.config.speed || 1, total = this._pLen(pts), period = total / (spd * 50);
        const t = ((this.time / period) % 2), frac = t > 1 ? 2 - t : t;
        const ox = this.x, oy = this.y, pos = this._pInterp(pts, frac);
        this.x = pos.x; this.y = pos.y;
        const pb = player.body;
        if (pb.grounded && pb.bottom >= this.y - 3 && pb.bottom <= this.y + 8 && pb.right > this.x && pb.left < this.x + this.w) {
            pb.x += this.x - ox; pb.y += this.y - oy;
        }
    }
    _trap(dt, player) {
        if (!this.triggered) {
            const pb = player.body;
            if (Math.abs(pb.cx - (this.x + this.w / 2)) < this.w * 1.2 && pb.top > this.y + this.h && pb.top < this.y + this.h + 100) {
                this.triggered = true; this.triggerTimer = 0.45;
            }
            return;
        }
        if (this.triggerTimer > 0) { this.triggerTimer -= dt; this.x = this.startX + (Math.random() - 0.5) * 4; return; }
        this.vy += G.GRAVITY * dt; this.y += this.vy * dt;
        if (this.y > this.startY + 500) this.active = false;
    }
    _laser() {
        const cycle = this.config.cycle || 2;
        const duty = this.config.duty || 0.6;
        this._laserOn = (this.time % cycle) < cycle * duty;
    }
    _crusher() {
        const range = this.config.range || 80;
        const spd = this.config.speed || 1.5;
        // Slam down fast, rise slowly (more dramatic)
        const t = (this.time * spd) % 2;
        if (t < 0.3) {
            this.y = this.startY + (t / 0.3) * range; // Fast slam
        } else {
            this.y = this.startY + range * Math.max(0, 1 - (t - 0.3) / 1.7); // Slow rise
        }
    }
    _coin(player, particles, audio) {
        if (this.collected) return;
        const pb = player.body;
        if (pb.overlapsTrigger(this.x - 8, this.y - 8, 16, 16)) {
            this.collected = true;
            audio.play('win');
            particles.emit(this.x, this.y, 10, '#e8b830', 120, 0.4, 3, 100);
        }
    }

    _hit(player, particles, audio, camera, screenFX) {
        const pb = player.body;
        switch (this.type) {
            case 'spike':
                if (pb.overlapsTrigger(this.x + 2, this.y + 4, this.w - 4, this.h - 4)) {
                    player.takeDamage(this._limb(pb), particles, audio, screenFX);
                    if (camera && window.save && window.save.data.shake !== false) camera.shake(0.2, 7);
                }
                break;
            case 'saw': {
                const cx = this.x + this.w / 2, cy = this.y + this.h / 2, r = this.w / 2;
                const dx = pb.cx - cx, dy = pb.cy - cy;
                if (dx * dx + dy * dy < (r + 10) * (r + 10)) {
                    player.takeDamage(this._limb(pb), particles, audio, screenFX);
                    if (camera && window.save && window.save.data.shake !== false) camera.shake(0.25, 8);
                }
                break;
            }
            case 'hammer':
            case 'pendulum':
                if (this.headX != null) {
                    const hr = this.type === 'pendulum' ? 18 : 14;
                    const dx = pb.cx - this.headX, dy = pb.cy - this.headY;
                    if (dx * dx + dy * dy < (hr + 8) * (hr + 8)) {
                        player.takeDamage(this._limb(pb), particles, audio, screenFX);
                        if (camera && window.save && window.save.data.shake !== false) camera.shake(0.3, 12);
                    }
                }
                break;
            case 'barrel':
                if (!this.exploded && pb.overlapsTrigger(this.x, this.y, this.w, this.h))
                    this._explode(player, particles, audio, camera, screenFX);
                break;
            case 'fallingTrap':
                if (this.triggered && this.triggerTimer <= 0 && pb.overlapsTrigger(this.x, this.y, this.w, this.h)) {
                    player.takeDamage('torso', particles, audio, screenFX);
                    if (camera && window.save && window.save.data.shake !== false) camera.shake(0.35, 10);
                }
                break;
            case 'laser':
                if (this._laserOn && pb.overlapsTrigger(this.x, this.y, this.w, this.h)) {
                    player.takeDamage(this._limb(pb), particles, audio, screenFX);
                    if (camera && window.save && window.save.data.shake !== false) camera.shake(0.15, 5);
                }
                break;
            case 'crusher':
                if (pb.overlapsTrigger(this.x, this.y, this.w, this.h)) {
                    player.takeDamage('torso', particles, audio, screenFX);
                    if (camera && window.save && window.save.data.shake !== false) camera.shake(0.4, 15);
                }
                break;
        }
    }

    _explode(player, particles, audio, camera, screenFX) {
        this.exploded = true; this.active = false;
        const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
        audio.play('explode');
        if (camera && window.save && window.save.data.shake !== false) camera.shake(0.5, 18);
        if (screenFX) screenFX.flash('#ff4400', 0.35);
        particles.emit(cx, cy, 30, '#ff6633', 300, 0.6, 6, 200);
        particles.emit(cx, cy, 20, '#ffaa22', 200, 0.4, 4, 100);
        particles.emit(cx, cy, 12, '#555555', 150, 0.9, 8, 50);
        const dist = Math.hypot(player.body.cx - cx, player.body.cy - cy);
        if (dist < 100) player.takeDamage('torso', particles, audio, screenFX);
        else if (dist < 180) player.takeDamage('leftLeg', particles, audio, screenFX);
    }

    _limb(pb) {
        const r = (this.y + this.h / 2 - pb.y) / pb.h;
        if (r < 0.15) return 'head';
        if (r < 0.45) return Math.random() > 0.5 ? 'leftArm' : 'rightArm';
        if (r > 0.75) return Math.random() > 0.5 ? 'leftLeg' : 'rightLeg';
        return 'torso';
    }
    _pLen(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return d; }
    _pInterp(pts, frac) {
        const total = this._pLen(pts); let tgt = frac * total, acc = 0;
        for (let i = 1; i < pts.length; i++) {
            const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            if (acc + seg >= tgt) { const t = (tgt - acc) / seg; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }; }
            acc += seg;
        }
        return pts[pts.length - 1];
    }

    draw(ctx) {
        if (!this.active) return; const C = G.COLORS;
        switch (this.type) {
            case 'spike':
                ctx.fillStyle = C.spike;
                ctx.beginPath(); ctx.moveTo(this.x, this.y + this.h); ctx.lineTo(this.x + this.w / 2, this.y); ctx.lineTo(this.x + this.w, this.y + this.h); ctx.fill();
                ctx.strokeStyle = C.spikeOutline; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(this.x, this.y + this.h); ctx.lineTo(this.x + this.w / 2, this.y); ctx.lineTo(this.x + this.w, this.y + this.h); ctx.stroke();
                break;
            case 'saw':
                ctx.save(); ctx.translate(this.x + this.w / 2, this.y + this.h / 2); ctx.rotate(this.angle);
                const r = this.w / 2;
                ctx.fillStyle = C.saw; ctx.beginPath();
                for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, rr = i % 2 === 0 ? r : r * 0.7; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = C.sawTeeth; ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = C.sawCenter; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
                ctx.restore(); break;
            case 'hammer':
                ctx.strokeStyle = C.hammer; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(this.x, this.y);
                if (this.headX != null) {
                    ctx.lineTo(this.headX, this.headY); ctx.stroke();
                    ctx.save(); ctx.translate(this.headX, this.headY); ctx.rotate(this.angle);
                    ctx.fillStyle = C.hammerHead; ctx.fillRect(-14, -8, 28, 16);
                    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.strokeRect(-14, -8, 28, 16);
                    ctx.restore();
                }
                ctx.fillStyle = C.hammerPivot; ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, Math.PI * 2); ctx.fill();
                break;
            case 'pendulum':
                // Similar to hammer but with a heavy wrecking ball
                ctx.strokeStyle = '#5566aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(this.x, this.y);
                if (this.headX != null) {
                    ctx.lineTo(this.headX, this.headY); ctx.stroke();
                    ctx.fillStyle = '#334477';
                    ctx.beginPath(); ctx.arc(this.headX, this.headY, 18, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#4466aa'; ctx.lineWidth = 1.5; ctx.stroke();
                    // Highlight
                    ctx.fillStyle = 'rgba(100,150,255,0.15)';
                    ctx.beginPath(); ctx.arc(this.headX - 5, this.headY - 5, 8, 0, Math.PI * 2); ctx.fill();
                }
                ctx.fillStyle = '#667799'; ctx.beginPath(); ctx.arc(this.x, this.y, 5, 0, Math.PI * 2); ctx.fill();
                break;
            case 'barrel':
                ctx.fillStyle = C.barrel; ctx.fillRect(this.x, this.y, this.w, this.h);
                ctx.fillStyle = C.barrelBand; ctx.fillRect(this.x, this.y + 4, this.w, 3); ctx.fillRect(this.x, this.y + this.h - 7, this.w, 3);
                ctx.strokeStyle = C.barrelWarn; ctx.lineWidth = 1.5;
                const bx = this.x + this.w / 2, by = this.y + this.h / 2;
                ctx.beginPath(); ctx.moveTo(bx, by - 6); ctx.lineTo(bx + 5, by + 4); ctx.lineTo(bx - 5, by + 4); ctx.closePath(); ctx.stroke();
                break;
            case 'platform':
                ctx.fillStyle = C.platform; ctx.fillRect(this.x, this.y, this.w, this.h);
                ctx.fillStyle = C.platformTop; ctx.fillRect(this.x, this.y, this.w, 3);
                ctx.fillStyle = C.platformEdge; ctx.fillRect(this.x, this.y + this.h - 2, this.w, 2);
                // Arrow indicators showing movement direction
                ctx.fillStyle = 'rgba(68,136,187,0.3)';
                const arrowX = this.x + this.w / 2;
                ctx.beginPath(); ctx.moveTo(arrowX - 6, this.y + this.h / 2); ctx.lineTo(arrowX, this.y + 4); ctx.lineTo(arrowX + 6, this.y + this.h / 2); ctx.fill();
                break;
            case 'fallingTrap':
                const shk = this.triggered && this.triggerTimer > 0 ? (Math.random() - 0.5) * 3 : 0;
                ctx.fillStyle = this.triggered ? C.trapWarn : C.trap;
                ctx.fillRect(this.x + shk, this.y, this.w, this.h);
                // Crack pattern when triggered
                if (this.triggered && this.triggerTimer > 0) {
                    ctx.strokeStyle = '#ff8844'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(this.x + this.w * 0.3, this.y); ctx.lineTo(this.x + this.w * 0.5, this.y + this.h); ctx.stroke();
                }
                ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.strokeRect(this.x + shk + 2, this.y + 2, this.w - 4, this.h - 4);
                break;
            case 'laser': {
                const on = this._laserOn;
                // Warning glow when about to turn on
                if (!on && (this.time % (this.config.cycle || 2)) > (this.config.cycle || 2) * (this.config.duty || 0.6) * 0.85) {
                    ctx.fillStyle = 'rgba(255,0,60,0.08)';
                    ctx.fillRect(this.x - 3, this.y, this.w + 6, this.h);
                }
                ctx.fillStyle = on ? 'rgba(255,0,60,0.7)' : 'rgba(255,0,60,0.06)';
                ctx.fillRect(this.x, this.y, this.w, this.h);
                if (on) {
                    ctx.fillStyle = 'rgba(255,100,100,0.25)';
                    ctx.fillRect(this.x - 3, this.y - 3, this.w + 6, this.h + 6);
                    // Core bright line
                    ctx.fillStyle = 'rgba(255,200,200,0.5)';
                    ctx.fillRect(this.x + this.w / 2 - 0.5, this.y, 1, this.h);
                }
                // Emitters
                ctx.fillStyle = '#444466';
                ctx.fillRect(this.x - 3, this.y - 5, this.w + 6, 5);
                ctx.fillRect(this.x - 3, this.y + this.h, this.w + 6, 5);
                // Red indicator lights
                ctx.fillStyle = on ? '#ff0044' : '#331122';
                ctx.beginPath(); ctx.arc(this.x + this.w / 2, this.y - 3, 2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(this.x + this.w / 2, this.y + this.h + 3, 2, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case 'crusher': {
                // Main block
                ctx.fillStyle = '#4a5a6a';
                ctx.fillRect(this.x, this.y, this.w, this.h);
                // Metallic highlight
                ctx.fillStyle = '#5a6a7a';
                ctx.fillRect(this.x + 2, this.y + 2, this.w - 4, 4);
                // Teeth at bottom
                ctx.fillStyle = '#3a4a5a';
                const toothW = 8;
                for (let t = this.x; t < this.x + this.w - toothW / 2; t += toothW) {
                    ctx.beginPath(); ctx.moveTo(t, this.y + this.h); ctx.lineTo(t + toothW / 2, this.y + this.h + 7); ctx.lineTo(t + toothW, this.y + this.h); ctx.fill();
                }
                // Warning stripes
                ctx.fillStyle = 'rgba(255,200,0,0.15)';
                for (let st = this.x; st < this.x + this.w; st += 12) {
                    ctx.fillRect(st, this.y, 6, this.h);
                }
                break;
            }
            case 'coin': {
                if (this.collected) return;
                const pulse = 0.7 + Math.sin(this.time * 4) * 0.3;
                const cx = this.x, cy = this.y;
                // Glow
                ctx.fillStyle = `rgba(232,184,48,${0.08 * pulse})`;
                ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
                // Coin body
                ctx.fillStyle = `rgba(232,184,48,${pulse})`;
                ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
                break;
            }
        }
    }
}

// ============================================================================
// LEVEL GENERATOR v5 — Expert-Crafted with Curated Patterns
// ============================================================================

// Each trial (10 trials × 6 levels) has a THEME that affects what obstacles appear
const TRIAL_THEMES = [
    { name: 'AWAKENING', hue: 0, terrain: 'gentle', intro: ['spike'] },
    { name: 'GAUNTLET', hue: 30, terrain: 'mixed', intro: ['saw_static', 'spike_row'] },
    { name: 'INFERNO', hue: 15, terrain: 'hilly', intro: ['saw_moving', 'barrel'] },
    { name: 'TEMPEST', hue: 200, terrain: 'gappy', intro: ['hammer', 'falling_trap'] },
    { name: 'ABYSS', hue: 260, terrain: 'deep', intro: ['pendulum', 'laser'] },
    { name: 'VOID', hue: 280, terrain: 'floating', intro: ['crusher', 'saw_vertical'] },
    { name: 'CRUCIBLE', hue: 0, terrain: 'gauntlet', intro: ['spike_gauntlet'] },
    { name: 'OBLIVION', hue: 210, terrain: 'extreme', intro: ['laser_corridor'] },
    { name: 'RAGNAROK', hue: 350, terrain: 'chaos', intro: ['everything'] },
    { name: 'ASCENSION', hue: 50, terrain: 'finale', intro: ['everything'] },
];

function generateLevel(levelId) {
    const trialIdx = Math.floor((levelId - 1) / 6);
    const localLvl = ((levelId - 1) % 6); // 0-5 within the trial
    const diff = Math.min(10, trialIdx + 1); // 1-10 based on trial
    const theme = TRIAL_THEMES[trialIdx] || TRIAL_THEMES[0];
    const solids = [];
    const obstacles = [];

    // Seeded random for consistent, reproducible levels
    let seed = levelId * 7919 + 1337;
    function srand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 1000) / 1000; }

    const BASE_Y = 380;
    let curX = 0;
    let curY = BASE_Y;

    // ===== SPAWN ZONE (always safe) =====
    solids.push(new PhysicsBody(0, curY, 180, 120, true));
    curX = 180;

    // Each level within a trial has slightly more segments and density
    // Level 1 of a trial = introduction, Level 6 = boss gauntlet
    const segBase = 4 + trialIdx + localLvl;
    const segCount = Math.min(20, segBase);

    // Create a plan for the level: ordered list of segment types
    const plan = createLevelPlan(trialIdx, localLvl, diff, srand, segCount, theme);

    for (let si = 0; si < plan.length; si++) {
        const seg = plan[si];
        const progress = si / plan.length;

        switch (seg.type) {
            case 'flat':
                curX = buildFlat(solids, obstacles, curX, curY, seg, diff, progress, srand);
                break;
            case 'climb':
                ({ curX, curY } = buildClimb(solids, obstacles, curX, curY, seg, diff, progress, srand));
                break;
            case 'drop':
                ({ curX, curY } = buildDrop(solids, obstacles, curX, curY, seg, diff, progress, srand));
                break;
            case 'gap':
                ({ curX, curY } = buildGap(solids, obstacles, curX, curY, seg, diff, progress, srand, BASE_Y));
                break;
            case 'valley':
                ({ curX, curY } = buildValley(solids, obstacles, curX, curY, seg, diff, progress, srand, BASE_Y));
                break;
            case 'stairUp':
                ({ curX, curY } = buildStairUp(solids, obstacles, curX, curY, seg, diff, progress, srand, BASE_Y));
                break;
            case 'stairDown':
                ({ curX, curY } = buildStairDown(solids, obstacles, curX, curY, seg, diff, progress, srand, BASE_Y));
                break;
            case 'islands':
                ({ curX, curY } = buildIslands(solids, obstacles, curX, curY, seg, diff, progress, srand, BASE_Y));
                break;
            case 'movingBridge':
                ({ curX, curY } = buildMovingBridge(solids, obstacles, curX, curY, seg, diff, progress, srand, BASE_Y));
                break;
            case 'spikeGauntlet':
                curX = buildSpikeGauntlet(solids, obstacles, curX, curY, seg, diff, progress, srand);
                break;
            case 'laserCorridor':
                curX = buildLaserCorridor(solids, obstacles, curX, curY, seg, diff, progress, srand);
                break;
            case 'rest':
                curX = buildRest(solids, obstacles, curX, curY, srand, diff);
                break;
        }

        // Slowly drift curY back toward BASE_Y to prevent extreme heights
        if (curY < BASE_Y - 180) curY = BASE_Y - 180;
        if (curY > BASE_Y + 140) curY = BASE_Y + 140;
    }

    // ===== END ZONE =====
    if (Math.abs(curY - BASE_Y) > 20) {
        const transW = 80;
        solids.push(new PhysicsBody(curX, BASE_Y, transW, 120, true));
        curX += transW; curY = BASE_Y;
    }
    solids.push(new PhysicsBody(curX, curY, 160, 120, true));
    const finishX = curX + 100;
    const totalW = curX + 160;

    // Time limit: tighter at higher difficulties to create urgency
    const baseTime = 20 + (totalW / 100);
    const timeLimit = Math.max(15, baseTime - diff * 1.2 + localLvl * 0.5);

    return {
        id: levelId, solids, obstacles,
        spawnX: 60, spawnY: BASE_Y - 50,
        finishX, finishY: curY - 40,
        timeLimit, width: totalW,
        theme: theme.name
    };
}

// ============================================================================
// LEVEL PLAN GENERATOR
// Creates a deliberate, curated sequence of terrain segments
// ============================================================================
function createLevelPlan(trialIdx, localLvl, diff, srand, segCount, theme) {
    const plan = [];

    // Ensure the first segment of each trial's first level is gentle
    if (localLvl === 0) {
        plan.push({ type: 'flat', obstacles: 'few' });
        plan.push({ type: 'flat', obstacles: 'intro' });
    }

    for (let i = plan.length; i < segCount; i++) {
        const progress = i / segCount;
        const roll = srand();

        // REST segments every 4-5 obstacles to give the player breathing room
        if (i > 0 && i % (5 - Math.min(3, Math.floor(diff / 3))) === 0 && progress < 0.85) {
            plan.push({ type: 'rest' });
            continue;
        }

        // Last 20% of level should be intense
        const isClimax = progress > 0.8;

        // Theme-based terrain selection
        switch (theme.terrain) {
            case 'gentle':
                if (roll < 0.55) plan.push({ type: 'flat', obstacles: isClimax ? 'moderate' : 'few' });
                else if (roll < 0.75) plan.push({ type: 'climb', height: 'low' });
                else plan.push({ type: 'drop', height: 'low' });
                break;

            case 'mixed':
                if (roll < 0.35) plan.push({ type: 'flat', obstacles: isClimax ? 'heavy' : 'moderate' });
                else if (roll < 0.50) plan.push({ type: 'climb', height: 'medium' });
                else if (roll < 0.65) plan.push({ type: 'drop', height: 'medium' });
                else if (roll < 0.80) plan.push({ type: 'gap', width: 'short' });
                else plan.push({ type: 'stairUp', steps: 3 });
                break;

            case 'hilly':
                if (roll < 0.25) plan.push({ type: 'flat', obstacles: 'moderate' });
                else if (roll < 0.45) plan.push({ type: 'climb', height: 'high' });
                else if (roll < 0.60) plan.push({ type: 'valley' });
                else if (roll < 0.75) plan.push({ type: 'drop', height: 'high' });
                else plan.push({ type: isClimax ? 'spikeGauntlet' : 'stairUp', steps: 3 });
                break;

            case 'gappy':
                if (roll < 0.20) plan.push({ type: 'flat', obstacles: 'moderate' });
                else if (roll < 0.45) plan.push({ type: 'gap', width: isClimax ? 'long' : 'medium' });
                else if (roll < 0.60) plan.push({ type: 'islands' });
                else if (roll < 0.75) plan.push({ type: 'movingBridge' });
                else plan.push({ type: 'climb', height: 'medium' });
                break;

            case 'deep':
                if (roll < 0.20) plan.push({ type: 'flat', obstacles: 'heavy' });
                else if (roll < 0.40) plan.push({ type: 'valley' });
                else if (roll < 0.55) plan.push({ type: 'stairDown', steps: 4 });
                else if (roll < 0.70) plan.push({ type: 'gap', width: 'medium' });
                else if (roll < 0.85) plan.push({ type: 'islands' });
                else plan.push({ type: 'movingBridge' });
                break;

            case 'floating':
                if (roll < 0.15) plan.push({ type: 'flat', obstacles: 'heavy' });
                else if (roll < 0.35) plan.push({ type: 'islands' });
                else if (roll < 0.55) plan.push({ type: 'movingBridge' });
                else if (roll < 0.70) plan.push({ type: 'gap', width: 'long' });
                else plan.push({ type: 'stairUp', steps: 4 });
                break;

            case 'gauntlet':
                if (roll < 0.30) plan.push({ type: 'spikeGauntlet' });
                else if (roll < 0.50) plan.push({ type: 'flat', obstacles: 'extreme' });
                else if (roll < 0.65) plan.push({ type: 'valley' });
                else if (roll < 0.80) plan.push({ type: 'gap', width: 'medium' });
                else plan.push({ type: 'movingBridge' });
                break;

            case 'extreme':
                if (roll < 0.25) plan.push({ type: 'laserCorridor' });
                else if (roll < 0.40) plan.push({ type: 'islands' });
                else if (roll < 0.55) plan.push({ type: 'spikeGauntlet' });
                else if (roll < 0.70) plan.push({ type: 'gap', width: 'long' });
                else if (roll < 0.85) plan.push({ type: 'movingBridge' });
                else plan.push({ type: 'valley' });
                break;

            case 'chaos':
            case 'finale':
            default: {
                const types = ['flat', 'climb', 'drop', 'gap', 'valley', 'stairUp', 'islands', 'movingBridge', 'spikeGauntlet', 'laserCorridor'];
                const pick = types[Math.floor(srand() * types.length)];
                plan.push({ type: pick, obstacles: isClimax ? 'extreme' : 'heavy' });
                break;
            }
        }
    }

    return plan;
}

// ============================================================================
// TERRAIN BUILDERS — Each creates a specific, polished terrain piece
// ============================================================================

function buildFlat(solids, obstacles, curX, curY, seg, diff, progress, srand) {
    const w = 120 + Math.floor(srand() * 100);
    solids.push(new PhysicsBody(curX, curY, w, 120, true));

    const density = seg.obstacles || 'moderate';
    const count = density === 'few' ? (srand() < 0.5 ? 0 : 1)
        : density === 'intro' ? 1
            : density === 'moderate' ? 1 + Math.floor(srand() * 2)
                : density === 'heavy' ? 2 + Math.floor(srand() * 2)
                    : 3 + Math.floor(srand() * 2); // extreme

    for (let i = 0; i < count; i++) {
        const ox = curX + 20 + Math.floor(srand() * Math.max(10, w - 50));
        placeObstacle(obstacles, pickObsType(srand, diff, progress), ox, curY, diff, srand);
    }

    // Sometimes add an elevated mini-platform with a coin
    if (srand() < 0.25 && diff >= 2) {
        const px = curX + 20 + Math.floor(srand() * (w - 60));
        const pw = 50 + Math.floor(srand() * 25);
        const py = curY - 55 - Math.floor(srand() * 30);
        solids.push(new PhysicsBody(px, py, pw, 14, true));
        obstacles.push(new Obstacle('coin', px + pw / 2, py - 10, 0, 0));
    }

    return curX + w;
}

function buildClimb(solids, obstacles, curX, curY, seg, diff, progress, srand) {
    const heightMod = seg.height === 'low' ? 0.6 : seg.height === 'high' ? 1.4 : 1;
    const stepH = Math.floor((20 + diff * 5) * heightMod);
    const w = 100 + Math.floor(srand() * 60);
    curY -= stepH;
    solids.push(new PhysicsBody(curX, curY, w, stepH + 120, true));

    if (diff >= 2 && srand() < 0.5 + diff * 0.05) {
        const ox = curX + 15 + Math.floor(srand() * Math.max(10, w - 35));
        placeObstacle(obstacles, pickObsType(srand, diff, progress), ox, curY, diff, srand);
    }

    return { curX: curX + w, curY };
}

function buildDrop(solids, obstacles, curX, curY, seg, diff, progress, srand) {
    const heightMod = seg.height === 'low' ? 0.6 : seg.height === 'high' ? 1.4 : 1;
    const dropH = Math.floor((20 + diff * 5) * heightMod);
    const w = 100 + Math.floor(srand() * 60);
    curY += dropH;
    if (curY > 500) curY = 500;
    solids.push(new PhysicsBody(curX, curY, w, 120, true));

    // Drops often have obstacles at the landing (surprise!)
    if (diff >= 2 && srand() < 0.4 + diff * 0.04) {
        // Place obstacle slightly past the center so player lands into it
        const ox = curX + w * 0.4 + Math.floor(srand() * (w * 0.4));
        placeObstacle(obstacles, pickObsType(srand, diff, progress), ox, curY, diff, srand);
    }

    return { curX: curX + w, curY };
}

function buildGap(solids, obstacles, curX, curY, seg, diff, progress, srand, BASE_Y) {
    const widthMod = seg.width === 'short' ? 0.6 : seg.width === 'long' ? 1.5 : 1;
    const gapW = Math.floor((40 + diff * 5) * widthMod);
    const heightChange = Math.floor((srand() - 0.4) * 50);
    curX += gapW;
    curY += heightChange;
    if (curY < BASE_Y - 180) curY = BASE_Y - 180;
    if (curY > BASE_Y + 100) curY = BASE_Y + 100;
    const landW = 80 + Math.floor(srand() * 50);
    solids.push(new PhysicsBody(curX, curY, landW, 120, true));

    // Obstacle on landing platform for harder levels
    if (diff >= 3 && srand() < 0.4) {
        const ox = curX + 15 + Math.floor(srand() * Math.max(10, landW - 35));
        placeObstacle(obstacles, pickObsType(srand, diff, progress), ox, curY, diff, srand);
    }

    // Sometimes add a saw hovering over the gap
    if (diff >= 4 && srand() < 0.35) {
        const sawR = 12 + diff;
        obstacles.push(new Obstacle('saw', curX - gapW / 2 - sawR, curY - 35 - diff * 2, sawR * 2, sawR * 2, {
            speed: 3 + diff * 0.3, pathY: 15 + diff * 3, ms: 1.0 + srand() * 0.5
        }));
    }

    return { curX: curX + landW, curY };
}

function buildValley(solids, obstacles, curX, curY, seg, diff, progress, srand, BASE_Y) {
    const depth = 50 + diff * 8;
    const w = 130 + Math.floor(srand() * 60);
    // Down into valley
    curY += depth;
    if (curY > BASE_Y + 150) curY = BASE_Y + 150;
    solids.push(new PhysicsBody(curX, curY, w, 120, true));

    // Valley bottom is dangerous
    const obsCount = 1 + Math.floor(diff / 4);
    for (let i = 0; i < obsCount; i++) {
        const ox = curX + 20 + Math.floor(srand() * Math.max(10, w - 45));
        placeObstacle(obstacles, pickObsType(srand, diff, progress), ox, curY, diff, srand);
    }
    curX += w;

    // Rise out
    const riseW = 80 + Math.floor(srand() * 40);
    curY -= depth + 10;
    if (curY < BASE_Y - 150) curY = BASE_Y - 150;
    solids.push(new PhysicsBody(curX, curY, riseW, depth + 130, true));

    // Coin reward at top of rise
    if (srand() < 0.5) {
        obstacles.push(new Obstacle('coin', curX + riseW / 2, curY - 15, 0, 0));
    }

    return { curX: curX + riseW, curY };
}

function buildStairUp(solids, obstacles, curX, curY, seg, diff, progress, srand, BASE_Y) {
    const steps = (seg.steps || 3) + (diff >= 7 ? 1 : 0);
    for (let st = 0; st < steps; st++) {
        const sw = 55 + Math.floor(srand() * 25);
        curY -= 32 + Math.floor(srand() * 12);
        if (curY < BASE_Y - 200) curY = BASE_Y - 200;
        solids.push(new PhysicsBody(curX, curY, sw, 16, true));

        // Alternate steps get obstacles for rhythm
        if (st % 2 === 1 && diff >= 3 && srand() < 0.45) {
            obstacles.push(new Obstacle('spike', curX + sw / 2 - 8, curY - 16, 16, 16));
        }

        // Coin on some steps
        if (st === steps - 1 && srand() < 0.4) {
            obstacles.push(new Obstacle('coin', curX + sw / 2, curY - 15, 0, 0));
        }

        curX += sw + 12;
    }
    return { curX, curY };
}

function buildStairDown(solids, obstacles, curX, curY, seg, diff, progress, srand, BASE_Y) {
    const steps = (seg.steps || 3) + (diff >= 8 ? 1 : 0);
    for (let st = 0; st < steps; st++) {
        const sw = 55 + Math.floor(srand() * 25);
        curY += 28 + Math.floor(srand() * 12);
        if (curY > BASE_Y + 120) curY = BASE_Y + 120;
        solids.push(new PhysicsBody(curX, curY, sw, 16, true));

        // Saws hovering between steps make jumping down dangerous
        if (st > 0 && diff >= 4 && srand() < 0.35) {
            const sawR = 10 + diff;
            obstacles.push(new Obstacle('saw', curX - 15, curY - 25, sawR * 2, sawR * 2, { speed: 3 + diff * 0.3 }));
        }

        curX += sw + 12;
    }
    // Bridge back to stable
    solids.push(new PhysicsBody(curX, curY, 70, 120, true));
    return { curX: curX + 70, curY };
}

function buildIslands(solids, obstacles, curX, curY, seg, diff, progress, srand, BASE_Y) {
    const gapBefore = 50 + diff * 4;
    curX += gapBefore;
    const numIslands = 2 + (diff >= 5 ? 1 : 0) + (diff >= 8 ? 1 : 0);

    for (let fi = 0; fi < numIslands; fi++) {
        const fy = curY - 20 - Math.floor(srand() * 50) - fi * 15;
        const fw = 50 + Math.floor(srand() * 30);
        solids.push(new PhysicsBody(curX, fy, fw, 16, true));

        // Alternate islands get spikes or coins
        if (fi % 2 === 0 && srand() < 0.3 && diff >= 3) {
            obstacles.push(new Obstacle('spike', curX + fw / 2 - 8, fy - 16, 16, 16));
        } else if (srand() < 0.35) {
            obstacles.push(new Obstacle('coin', curX + fw / 2, fy - 12, 0, 0));
        }

        curX += fw + 25 + Math.floor(srand() * 20);
    }

    // Landing platform
    curY = BASE_Y - Math.floor(srand() * 40);
    solids.push(new PhysicsBody(curX, curY, 90, 120, true));
    return { curX: curX + 90, curY };
}

function buildMovingBridge(solids, obstacles, curX, curY, seg, diff, progress, srand, BASE_Y) {
    const bridgeGap = 90 + diff * 10;
    const py = curY - 10;

    // Create a moving platform that crosses the gap
    const platW = 60 + Math.floor(srand() * 15);
    const endY = py - 20 - Math.floor(srand() * 30);
    obstacles.push(new Obstacle('platform', curX + 10, py, platW, 14, {
        speed: 0.3 + diff * 0.04,
        points: [{ x: curX + 10, y: py }, { x: curX + bridgeGap - platW - 10, y: endY }]
    }));

    // For harder levels, add a second platform or obstacle over the gap
    if (diff >= 6 && srand() < 0.4) {
        const sawR = 10 + diff;
        obstacles.push(new Obstacle('saw', curX + bridgeGap / 2 - sawR, py - 30, sawR * 2, sawR * 2, {
            speed: 3, pathY: 15 + diff * 2, ms: 0.8
        }));
    }

    curX += bridgeGap;
    curY = BASE_Y - Math.floor(srand() * 30);
    solids.push(new PhysicsBody(curX, curY, 80, 120, true));
    return { curX: curX + 80, curY };
}

function buildSpikeGauntlet(solids, obstacles, curX, curY, seg, diff, progress, srand) {
    // A long gauntlet of spikes with precise gaps to run through
    const w = 200 + diff * 15;
    solids.push(new PhysicsBody(curX, curY, w, 120, true));

    // Place spike clusters with deliberate safe zones
    const spikeSize = 14 + Math.floor(diff * 0.5);
    const spacing = Math.max(35, 60 - diff * 3);

    for (let sx = curX + 25; sx < curX + w - 30; sx += spacing) {
        if (srand() < 0.7) { // 30% chance of safe gap = rhythm
            obstacles.push(new Obstacle('spike', sx, curY - spikeSize, spikeSize, spikeSize));
            // Sometimes double spike
            if (diff >= 5 && srand() < 0.3) {
                obstacles.push(new Obstacle('spike', sx + spikeSize + 2, curY - spikeSize, spikeSize, spikeSize));
            }
        }
    }

    // Add an overhead saw for extra pressure
    if (diff >= 4 && srand() < 0.5) {
        const sawR = 14 + diff;
        obstacles.push(new Obstacle('saw', curX + w / 2 - sawR, curY - 55, sawR * 2, sawR * 2, {
            speed: 3, pathX: w / 3, ms: 0.6 + srand() * 0.4
        }));
    }

    return curX + w;
}

function buildLaserCorridor(solids, obstacles, curX, curY, seg, diff, progress, srand) {
    // Alternating lasers that the player must time their run through
    const w = 180 + diff * 10;
    solids.push(new PhysicsBody(curX, curY, w, 120, true));

    const laserCount = 2 + Math.floor(diff / 3);
    const spacing = w / (laserCount + 1);

    for (let i = 0; i < laserCount; i++) {
        const lx = curX + spacing * (i + 1);
        const laserH = 45 + diff * 3;
        const cycle = 2.0 + srand() * 1.5;
        // Alternate phase so adjacent lasers are off when the other is on
        const phase = i % 2 === 0 ? 0 : cycle * 0.5;
        obstacles.push(new Obstacle('laser', lx - 2, curY - laserH, 4, laserH, {
            cycle, duty: 0.55 + diff * 0.02
        }));
        // Offset time to create alternating pattern
        obstacles[obstacles.length - 1].time = phase;
    }

    return curX + w;
}

function buildRest(solids, obstacles, curX, curY, srand, diff) {
    // A deliberately safe, flat segment for the player to breathe
    const w = 80 + Math.floor(srand() * 40);
    solids.push(new PhysicsBody(curX, curY, w, 120, true));

    // Place a coin as reward for surviving
    if (srand() < 0.6) {
        obstacles.push(new Obstacle('coin', curX + w / 2, curY - 15, 0, 0));
    }

    return curX + w;
}

// ============================================================================
// OBSTACLE PLACEMENT — Precisely positioned relative to terrain surface
// ============================================================================
function placeObstacle(obstacles, type, ox, surfaceY, diff, srand) {
    switch (type) {
        case 'spike': {
            const s = 14 + Math.floor(diff * 0.6);
            obstacles.push(new Obstacle('spike', ox - s / 2, surfaceY - s, s, s));
            break;
        }
        case 'spike_row': {
            const cnt = 2 + (diff >= 7 ? 1 : 0);
            const s = 13 + Math.floor(diff * 0.5);
            for (let j = 0; j < cnt; j++) {
                obstacles.push(new Obstacle('spike', ox + j * (s + 3) - (cnt * s) / 2, surfaceY - s, s, s));
            }
            break;
        }
        case 'saw_static': {
            const r = 12 + Math.floor(diff * 0.8);
            obstacles.push(new Obstacle('saw', ox - r, surfaceY - r * 2 - 10, r * 2, r * 2, {
                speed: 3 + diff * 0.4
            }));
            break;
        }
        case 'saw_moving': {
            const r = 12 + Math.floor(diff * 0.8);
            const range = 25 + diff * 6;
            obstacles.push(new Obstacle('saw', ox - r, surfaceY - r * 2 - 12, r * 2, r * 2, {
                speed: 3 + diff * 0.4,
                pathX: range,
                pathY: diff >= 6 ? 12 + diff * 2 : 0,
                ms: 0.7 + srand() * 0.5
            }));
            break;
        }
        case 'saw_vertical': {
            const r = 11 + Math.floor(diff * 0.6);
            obstacles.push(new Obstacle('saw', ox - r, surfaceY - 50, r * 2, r * 2, {
                speed: 3 + diff * 0.3,
                pathX: 0, pathY: 25 + diff * 4, ms: 0.9 + srand() * 0.4
            }));
            break;
        }
        case 'hammer': {
            obstacles.push(new Obstacle('hammer', ox, surfaceY - 100 - diff * 4, 10, 10, {
                speed: 1.4 + diff * 0.12,
                range: 35 + diff * 3,
                length: 55 + diff * 4
            }));
            break;
        }
        case 'pendulum': {
            obstacles.push(new Obstacle('pendulum', ox, surfaceY - 120 - diff * 3, 10, 10, {
                speed: 1.2 + diff * 0.08,
                range: 45 + diff * 3,
                length: 80 + diff * 3
            }));
            break;
        }
        case 'barrel': {
            obstacles.push(new Obstacle('barrel', ox - 12, surfaceY - 28, 24, 28));
            break;
        }
        case 'falling_trap': {
            const tw = 34 + diff * 2;
            obstacles.push(new Obstacle('fallingTrap', ox - tw / 2, surfaceY - 100 - diff * 4, tw, 14));
            break;
        }
        case 'laser': {
            const laserH = 40 + diff * 3;
            obstacles.push(new Obstacle('laser', ox - 2, surfaceY - laserH, 4, laserH, {
                cycle: 1.8 + srand() * 1.2,
                duty: 0.5 + diff * 0.02
            }));
            break;
        }
        case 'crusher': {
            obstacles.push(new Obstacle('crusher', ox - 18, surfaceY - 70, 36, 22, {
                speed: 1.0 + diff * 0.12,
                range: 40 + diff * 3
            }));
            break;
        }
    }
}

// ============================================================================
// OBSTACLE TYPE SELECTION — Weighted by difficulty with smooth introduction
// ============================================================================
function pickObsType(srand, diff, progress) {
    const w = [];

    // Core obstacles (always available, weighted down as new ones unlock)
    w.push({ t: 'spike', wt: diff <= 2 ? 5 : diff <= 5 ? 3 : 2 });

    // Gradually unlock obstacle types
    if (diff >= 2) w.push({ t: 'spike_row', wt: 2 });
    if (diff >= 2) w.push({ t: 'saw_static', wt: 2 });
    if (diff >= 3) w.push({ t: 'saw_moving', wt: 2.5 });
    if (diff >= 3) w.push({ t: 'hammer', wt: 1.5 });
    if (diff >= 4) w.push({ t: 'barrel', wt: 1.5 });
    if (diff >= 4) w.push({ t: 'saw_vertical', wt: 1.5 });
    if (diff >= 5) w.push({ t: 'falling_trap', wt: 2 });
    if (diff >= 5) w.push({ t: 'pendulum', wt: 2 });
    if (diff >= 6) w.push({ t: 'laser', wt: 2.5 });
    if (diff >= 7) w.push({ t: 'crusher', wt: 2 });

    // Climax of level gets more dangerous obstacles
    if (progress > 0.7) {
        if (diff >= 3) w.push({ t: 'saw_moving', wt: 1.5 });
        if (diff >= 5) w.push({ t: 'pendulum', wt: 1 });
        if (diff >= 6) w.push({ t: 'crusher', wt: 1 });
    }

    const total = w.reduce((s, e) => s + e.wt, 0);
    let r = srand() * total;
    for (const e of w) { r -= e.wt; if (r <= 0) return e.t; }
    return 'spike';
}

// ============================================================================
const TRIAL_NAMES = TRIAL_THEMES.map(t => t.name);
window.Obstacle = Obstacle;
window.generateLevel = generateLevel;
window.TRIAL_NAMES = TRIAL_NAMES;
