// ============================================================================
// RagRush - levels.js (v4 — Dynamic Terrain + Rich Obstacles)
// Multi-height terrain, valleys, hills, floating islands, obstacle gauntlets
// ============================================================================
'use strict';

class Obstacle {
    constructor(type, x, y, w, h, cfg) {
        this.type = type; this.x = x; this.y = y; this.w = w; this.h = h; this.config = cfg || {};
        this.active = true; this.time = Math.random() * 5; this.startX = x; this.startY = y; this.angle = 0;
        this.triggered = false; this.triggerTimer = 0; this.vy = 0; this.exploded = false;
        this.headX = null; this.headY = null;
    }

    update(dt, player, particles, audio, camera, screenFX) {
        if (!this.active) return; this.time += dt;
        switch (this.type) {
            case 'saw': this._saw(dt); break; case 'hammer': this._hammer(); break;
            case 'platform': this._platform(dt, player); break; case 'fallingTrap': this._trap(dt, player); break;
            case 'laser': this._laser(); break; case 'crusher': this._crusher(); break;
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
        this.headX = this.x + Math.sin(this.angle) * len; this.headY = this.y + Math.cos(this.angle) * len;
    }
    _platform(dt, player) {
        const pts = this.config.points; if (!pts || pts.length < 2) return;
        const spd = this.config.speed || 1, total = this._pLen(pts), period = total / (spd * 50);
        const t = ((this.time / period) % 2), frac = t > 1 ? 2 - t : t;
        const ox = this.x, oy = this.y, pos = this._pInterp(pts, frac); this.x = pos.x; this.y = pos.y;
        const pb = player.body;
        if (pb.grounded && pb.bottom >= this.y - 3 && pb.bottom <= this.y + 8 && pb.right > this.x && pb.left < this.x + this.w) { pb.x += this.x - ox; pb.y += this.y - oy; }
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
        // Laser toggles on/off
        const cycle = this.config.cycle || 2;
        this._laserOn = (this.time % cycle) < cycle * 0.6;
    }
    _crusher() {
        // Crusher moves up/down
        const range = this.config.range || 80;
        const spd = this.config.speed || 1.5;
        this.y = this.startY + Math.abs(Math.sin(this.time * spd)) * range;
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
                if (this.headX != null) {
                    const dx = pb.cx - this.headX, dy = pb.cy - this.headY;
                    if (dx * dx + dy * dy < 22 * 22) {
                        player.takeDamage(this._limb(pb), particles, audio, screenFX);
                        if (camera && window.save && window.save.data.shake !== false) camera.shake(0.3, 12);
                    }
                }
                break;
            case 'barrel':
                if (!this.exploded && pb.overlapsTrigger(this.x, this.y, this.w, this.h)) this._explode(player, particles, audio, camera, screenFX);
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
    _pLen(pts) { let d = 0; for (let i = 1; i < pts.length; i++)d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return d; }
    _pInterp(pts, frac) { const total = this._pLen(pts); let tgt = frac * total, acc = 0; for (let i = 1; i < pts.length; i++) { const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); if (acc + seg >= tgt) { const t = (tgt - acc) / seg; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }; } acc += seg; } return pts[pts.length - 1]; }

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
                break;
            case 'fallingTrap':
                const shk = this.triggered && this.triggerTimer > 0 ? (Math.random() - 0.5) * 3 : 0;
                ctx.fillStyle = this.triggered ? C.trapWarn : C.trap; ctx.fillRect(this.x + shk, this.y, this.w, this.h);
                ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.strokeRect(this.x + shk + 2, this.y + 2, this.w - 4, this.h - 4);
                break;
            case 'laser': {
                // Draw laser beam
                const on = this._laserOn;
                ctx.fillStyle = on ? 'rgba(255,0,60,0.7)' : 'rgba(255,0,60,0.1)';
                ctx.fillRect(this.x, this.y, this.w, this.h);
                if (on) {
                    ctx.fillStyle = 'rgba(255,100,100,0.25)';
                    ctx.fillRect(this.x - 2, this.y - 2, this.w + 4, this.h + 4);
                }
                // Emitters at top and bottom
                ctx.fillStyle = '#555566';
                ctx.fillRect(this.x - 2, this.y - 4, this.w + 4, 4);
                ctx.fillRect(this.x - 2, this.y + this.h, this.w + 4, 4);
                break;
            }
            case 'crusher': {
                ctx.fillStyle = '#556677';
                ctx.fillRect(this.x, this.y, this.w, this.h);
                ctx.fillStyle = '#3a4a5a';
                ctx.fillRect(this.x + 4, this.y + this.h - 6, this.w - 8, 6);
                // Teeth at bottom
                for (let t = this.x; t < this.x + this.w; t += 10) {
                    ctx.fillStyle = '#445566';
                    ctx.beginPath(); ctx.moveTo(t, this.y + this.h); ctx.lineTo(t + 5, this.y + this.h + 8); ctx.lineTo(t + 10, this.y + this.h); ctx.fill();
                }
                break;
            }
        }
    }
}

// ============================================================================
// LEVEL GENERATOR v4 — Dynamic terrain with elevation changes
// ============================================================================

function generateLevel(levelId) {
    const diff = Math.min(10, Math.ceil(levelId / 6));
    const localLvl = ((levelId - 1) % 6);
    const solids = [];
    const obstacles = [];

    // Seeded random for consistent levels
    let seed = levelId * 7919 + 1337;
    function srand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 1000) / 1000; }

    // Base ground Y
    const BASE_Y = 380;
    let curX = 0;
    let curY = BASE_Y;

    // ===== SPAWN ZONE (safe) =====
    solids.push(new PhysicsBody(0, curY, 160, 120, true));
    curX = 160;

    // Number of terrain segments — fewer for easy levels
    const segCount = 5 + Math.floor(diff * 1.5) + localLvl;

    for (let si = 0; si < segCount; si++) {
        const progress = si / segCount;
        const roll = srand();

        // ===== TERRAIN TYPE SELECTION =====
        if (roll < 0.18 && si > 0 && diff >= 1) {
            // --- CLIMB UP ---
            const stepH = 15 + Math.floor(srand() * 20) + diff * 4;
            const stepW = 100 + Math.floor(srand() * 60);
            curY -= stepH;
            solids.push(new PhysicsBody(curX, curY, stepW, stepH + 120, true));
            if (diff >= 2) addObsToSurface(obstacles, srand, curX, curY, stepW, diff, progress);
            curX += stepW;

        } else if (roll < 0.32 && si > 0 && diff >= 1) {
            // --- DROP DOWN ---
            const dropH = 15 + Math.floor(srand() * 20) + diff * 4;
            const dropW = 100 + Math.floor(srand() * 60);
            curY += dropH;
            if (curY > BASE_Y + 120) curY = BASE_Y + 120;
            solids.push(new PhysicsBody(curX, curY, dropW, 120, true));
            if (diff >= 2) addObsToSurface(obstacles, srand, curX, curY, dropW, diff, progress);
            curX += dropW;

        } else if (roll < 0.42 && si > 1 && diff >= 3) {
            // --- GAP (must jump) --- only from diff 3+
            const gapW = 35 + diff * 4 + Math.floor(srand() * 15);
            // Landing platform on other side (can be different height)
            const heightChange = Math.floor((srand() - 0.4) * 60);
            curX += gapW;
            curY += heightChange;
            if (curY < BASE_Y - 180) curY = BASE_Y - 180;
            if (curY > BASE_Y + 100) curY = BASE_Y + 100;
            const landW = 70 + Math.floor(srand() * 50);
            solids.push(new PhysicsBody(curX, curY, landW, 120, true));
            if (diff >= 3) addObsToSurface(obstacles, srand, curX, curY, landW, diff, progress);
            curX += landW;

        } else if (roll < 0.50 && si > 1 && diff >= 3) {
            // --- FLOATING ISLANDS ---
            const gapW = 55 + diff * 5;
            curX += gapW;
            // 2-3 small floating platforms at different heights
            const numIslands = 2 + (diff >= 6 ? 1 : 0);
            for (let fi = 0; fi < numIslands; fi++) {
                const fy = curY - 30 - Math.floor(srand() * 60) - fi * 20;
                const fw = 50 + Math.floor(srand() * 30);
                solids.push(new PhysicsBody(curX, fy, fw, 16, true));
                if (srand() < 0.4 && diff >= 4) {
                    obstacles.push(new Obstacle('spike', curX + fw / 2 - 9, fy - 18, 18, 18));
                }
                curX += fw + 25 + Math.floor(srand() * 15);
            }
            // Landing after islands
            curY = BASE_Y - Math.floor(srand() * 40);
            solids.push(new PhysicsBody(curX, curY, 80, 120, true));
            curX += 80;

        } else if (roll < 0.57 && diff >= 4) {
            // --- VALLEY (go down then up) ---
            const valleyDepth = 50 + diff * 8;
            const valleyW = 120 + Math.floor(srand() * 60);
            // Down slope
            curY += valleyDepth;
            if (curY > BASE_Y + 150) curY = BASE_Y + 150;
            solids.push(new PhysicsBody(curX, curY, valleyW, 120, true));
            addObsToSurface(obstacles, srand, curX, curY, valleyW, diff, progress);
            curX += valleyW;
            // Up slope
            const riseW = 80 + Math.floor(srand() * 40);
            curY -= valleyDepth + 10;
            if (curY < BASE_Y - 150) curY = BASE_Y - 150;
            solids.push(new PhysicsBody(curX, curY, riseW, valleyDepth + 130, true));
            curX += riseW;

        } else if (roll < 0.63 && diff >= 5) {
            // --- MOVING PLATFORM BRIDGE ---
            const bridgeGap = 100 + diff * 10;
            const py = curY - 10;
            obstacles.push(new Obstacle('platform', curX + 10, py, 65, 14, {
                speed: 0.35 + diff * 0.04,
                points: [{ x: curX + 10, y: py }, { x: curX + bridgeGap - 75, y: py - 30 - srand() * 30 }]
            }));
            curX += bridgeGap;
            // Landing
            curY = BASE_Y - Math.floor(srand() * 30);
            solids.push(new PhysicsBody(curX, curY, 80, 120, true));
            curX += 80;

        } else if (roll < 0.68 && diff >= 5) {
            // --- STAIRCASE UP ---
            const steps = 3 + (diff >= 7 ? 1 : 0);
            for (let st = 0; st < steps; st++) {
                const sw = 55 + Math.floor(srand() * 25);
                curY -= 35 + Math.floor(srand() * 15);
                if (curY < BASE_Y - 200) curY = BASE_Y - 200;
                solids.push(new PhysicsBody(curX, curY, sw, 16, true));
                if (srand() < 0.35 && diff >= 4) {
                    obstacles.push(new Obstacle('spike', curX + sw / 2 - 8, curY - 16, 16, 16));
                }
                curX += sw + 10;
            }

        } else if (roll < 0.73 && diff >= 6) {
            // --- STAIRCASE DOWN ---
            const steps = 3 + (diff >= 8 ? 1 : 0);
            for (let st = 0; st < steps; st++) {
                const sw = 55 + Math.floor(srand() * 25);
                curY += 30 + Math.floor(srand() * 15);
                if (curY > BASE_Y + 120) curY = BASE_Y + 120;
                solids.push(new PhysicsBody(curX, curY, sw, 16, true));
                curX += sw + 10;
            }
            // Bridge back to base
            solids.push(new PhysicsBody(curX, curY, 60, 120, true));
            curX += 60;

        } else {
            // --- FLAT SEGMENT WITH OBSTACLES ---
            const segW = 110 + Math.floor(srand() * 80);
            // Gently drift back toward BASE_Y
            if (curY < BASE_Y - 20) curY += 15;
            else if (curY > BASE_Y + 20) curY -= 15;
            solids.push(new PhysicsBody(curX, curY, segW, 120, true));
            // For diff 1, only place obstacles on ~40% of flat segments
            if (diff >= 2 || srand() < 0.4)
                addObsToSurface(obstacles, srand, curX, curY, segW, diff, progress);

            // Maybe add an elevated mini-platform above
            if (srand() < 0.3 && diff >= 2) {
                const px = curX + 20 + Math.floor(srand() * (segW - 60));
                const pw = 45 + Math.floor(srand() * 30);
                const ph = curY - 60 - Math.floor(srand() * 40);
                solids.push(new PhysicsBody(px, ph, pw, 14, true));
                // Reward on elevated platform: no obstacles, alternate path
            }
            curX += segW;
        }
    }

    // ===== END ZONE =====
    // Flatten back to near base
    if (curY !== BASE_Y) {
        const transW = 80;
        solids.push(new PhysicsBody(curX, BASE_Y, transW, 120, true));
        curX += transW;
        curY = BASE_Y;
    }
    solids.push(new PhysicsBody(curX, curY, 160, 120, true));
    const finishX = curX + 100;
    const totalW = curX + 160;

    const timeLimit = Math.max(15, 25 + (totalW / 120) - diff * 1.5);

    return {
        id: levelId, solids, obstacles,
        spawnX: 60, spawnY: BASE_Y - 50,
        finishX, finishY: curY - 40,
        timeLimit, width: totalW
    };
}

// ============================================================================
// Place obstacles smartly on a ground surface
// ============================================================================
function addObsToSurface(obstacles, srand, sx, sy, sw, diff, progress) {
    // How many obstacles on this segment? Scale gently
    // diff 1: 0-1, diff 3: 1-2, diff 6: 1-3, diff 10: 2-4
    const density = (diff <= 1 ? 0.2 : 0.3) + diff * 0.12 + progress * 0.2;
    const count = Math.max(diff <= 1 ? 0 : 1, Math.floor(density + srand() * 1.2));
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
        const ox = sx + 20 + srand() * Math.max(10, sw - 40);
        const type = pickObsType(srand, diff, progress);

        switch (type) {
            case 'spike': {
                const sw2 = 16 + diff;
                obstacles.push(new Obstacle('spike', ox - sw2 / 2, sy - sw2, sw2, sw2));
                break;
            }
            case 'spike_row': {
                const cnt = 2 + (diff >= 7 ? 1 : 0);
                const s = 15 + diff;
                for (let j = 0; j < cnt; j++) {
                    obstacles.push(new Obstacle('spike', ox + j * (s + 2) - (cnt * s) / 2, sy - s, s, s));
                }
                break;
            }
            case 'saw_static': {
                const r = 13 + diff;
                obstacles.push(new Obstacle('saw', ox - r, sy - 45 - diff * 3, r * 2, r * 2, {
                    speed: 3 + diff * 0.4
                }));
                break;
            }
            case 'saw_moving': {
                const r = 13 + diff;
                const range = 25 + diff * 7;
                obstacles.push(new Obstacle('saw', ox - r, sy - 50 - diff * 3, r * 2, r * 2, {
                    speed: 3 + diff * 0.5,
                    pathX: range,
                    pathY: diff >= 6 ? 15 + diff * 2 : 0,
                    ms: 0.7 + srand() * 0.6
                }));
                break;
            }
            case 'saw_vertical': {
                // Saw moves up and down
                const r = 12 + diff;
                obstacles.push(new Obstacle('saw', ox - r, sy - 60, r * 2, r * 2, {
                    speed: 4 + diff * 0.3,
                    pathX: 0,
                    pathY: 30 + diff * 5,
                    ms: 1 + srand() * 0.5
                }));
                break;
            }
            case 'hammer': {
                obstacles.push(new Obstacle('hammer', ox, sy - 110 - diff * 5, 10, 10, {
                    speed: 1.5 + diff * 0.15,
                    range: 35 + diff * 3,
                    length: 60 + diff * 4
                }));
                break;
            }
            case 'barrel': {
                obstacles.push(new Obstacle('barrel', ox - 12, sy - 28, 24, 28));
                break;
            }
            case 'falling_trap': {
                const tw = 36 + diff * 2;
                obstacles.push(new Obstacle('fallingTrap', ox - tw / 2, sy - 120 - diff * 5, tw, 14));
                break;
            }
            case 'laser': {
                obstacles.push(new Obstacle('laser', ox - 2, sy - 50 - diff * 3, 4, 50 + diff * 3, {
                    cycle: 1.5 + srand() * 1.5
                }));
                break;
            }
            case 'crusher': {
                obstacles.push(new Obstacle('crusher', ox - 16, sy - 80, 32, 20, {
                    speed: 1.2 + diff * 0.15,
                    range: 50 + diff * 3
                }));
                break;
            }
        }
    }
}

function pickObsType(srand, diff, progress) {
    const w = [];
    // Always available
    w.push({ t: 'spike', wt: diff <= 3 ? 4 : 2 });
    w.push({ t: 'spike_row', wt: diff >= 2 ? 2 : 0 });
    // Difficulty gates
    if (diff >= 2) w.push({ t: 'saw_static', wt: 2 });
    if (diff >= 3) w.push({ t: 'saw_moving', wt: 2 });
    if (diff >= 3) w.push({ t: 'hammer', wt: 1.5 });
    if (diff >= 4) w.push({ t: 'barrel', wt: 1.5 });
    if (diff >= 4) w.push({ t: 'saw_vertical', wt: 1.5 });
    if (diff >= 5) w.push({ t: 'falling_trap', wt: 2 });
    if (diff >= 6) w.push({ t: 'laser', wt: 2 });
    if (diff >= 7) w.push({ t: 'crusher', wt: 1.5 });
    // Extra density at end of level
    if (progress > 0.7) { w.push({ t: 'spike_row', wt: 1 }); if (diff >= 4) w.push({ t: 'saw_moving', wt: 1 }); }

    const total = w.reduce((s, e) => s + e.wt, 0);
    let r = srand() * total;
    for (const e of w) { r -= e.wt; if (r <= 0) return e.t; }
    return 'spike';
}

const TRIAL_NAMES = ['AWAKENING', 'GAUNTLET', 'INFERNO', 'TEMPEST', 'ABYSS', 'VOID', 'CRUCIBLE', 'OBLIVION', 'RAGNAROK', 'ASCENSION'];
window.Obstacle = Obstacle;
window.generateLevel = generateLevel;
window.TRIAL_NAMES = TRIAL_NAMES;
