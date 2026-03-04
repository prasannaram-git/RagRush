// ============================================================================
// RagRush - game.js (v4 — Premium HUD + Body Silhouette + Fullscreen)
// ============================================================================
(function () {
    'use strict';

    let canvas, ctx, input, camera, particles, audio, save, trail, screenFX, menuCanvas, menuCtx, bodyCanvas, bodyCtx;
    let state = 'boot', currentLevel = null, player = null, levelTimer = 0, selectedCharIdx = 0, currentTrialIdx = 0;
    let fpsFrames = 0, fpsTime = 0, fpsCurrent = 60, lastTime = 0;
    let menuParticles = [];

    function boot() {
        canvas = document.getElementById('game-canvas'); ctx = canvas.getContext('2d');
        menuCanvas = document.getElementById('menu-bg-canvas'); menuCtx = menuCanvas ? menuCanvas.getContext('2d') : null;
        bodyCanvas = document.getElementById('hud-body-canvas'); bodyCtx = bodyCanvas ? bodyCanvas.getContext('2d') : null;
        input = new InputSystem(); camera = new Camera(canvas); particles = new ParticlePool(300);
        audio = new AudioMgr(); save = new SaveSystem(); trail = new TrailSystem(); screenFX = new ScreenFX(canvas);
        window.save = save;
        resizeCanvas(); window.addEventListener('resize', resizeCanvas);
        document.addEventListener('click', () => audio.init(), { once: true });
        const sv = save.data;
        document.getElementById('sfx-vol').value = sv.sfxVol; document.getElementById('music-vol').value = sv.musicVol;
        document.getElementById('sfx-val').textContent = sv.sfxVol + '%'; document.getElementById('music-val').textContent = sv.musicVol + '%';
        audio.sfxVol = sv.sfxVol / 100; audio.musicVol = sv.musicVol / 100;
        if (sv.shake === false) document.getElementById('shake-toggle').checked = false;
        if (sv.showFps) { document.getElementById('fps-toggle').checked = true; document.getElementById('fps-counter').classList.remove('hidden'); }
        selectedCharIdx = sv.selChar || 0;
        for (let i = 0; i < 60; i++)menuParticles.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.5, sp: 0.1 + Math.random() * 0.3 });
        let prog = 0; const bi = setInterval(() => {
            prog += 4 + Math.random() * 8; if (prog >= 100) { prog = 100; clearInterval(bi); setTimeout(() => showScreen('menu'), 400); }
            document.getElementById('boot-progress').style.width = prog + '%';
            document.getElementById('boot-text').textContent = prog >= 100 ? 'READY' : 'LOADING SYSTEMS';
        }, 80);
        if ('ontouchstart' in window) document.getElementById('mobile-controls').classList.remove('hidden');
        bindUI(); lastTime = performance.now(); requestAnimationFrame(gameLoop);
    }

    function resizeCanvas() {
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
        if (menuCanvas) { menuCanvas.width = window.innerWidth; menuCanvas.height = window.innerHeight; }
        screenFX._vigGrad = null;
    }

    function showScreen(name) {
        const ids = { boot: 'boot-screen', menu: 'main-menu', levelSelect: 'level-select', charSelect: 'char-select', settings: 'settings-screen', playing: 'gameplay-screen', paused: 'gameplay-screen', complete: 'gameplay-screen', failed: 'gameplay-screen' };
        ['boot-screen', 'main-menu', 'level-select', 'char-select', 'settings-screen', 'gameplay-screen'].forEach(s => document.getElementById(s).classList.remove('active'));
        if (ids[name]) document.getElementById(ids[name]).classList.add('active');
        state = name;
        if (name === 'menu') { document.getElementById('total-stars').textContent = save.totalStars(); let u = 0; for (let i = 1; i <= G.TOTAL_LEVELS; i++)if (save.isUnlocked(i)) u++; document.getElementById('levels-unlocked').textContent = u; }
        if (name === 'levelSelect') { buildLevelSelect(); document.getElementById('ls-stars').textContent = save.totalStars(); }
        if (name === 'charSelect') buildCharSelect();
        document.getElementById('game-hud').style.display = (name === 'playing' || name === 'paused' || name === 'complete' || name === 'failed') ? '' : 'none';
        if (name === 'playing') hideOverlays();
    }

    function hideOverlays() { ['pause-overlay', 'complete-overlay', 'failed-overlay'].forEach(id => document.getElementById(id).classList.add('hidden')); }

    // ===== FULLSCREEN =====
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen().catch(() => { });
        }
    }

    function bindUI() {
        const $ = id => document.getElementById(id);
        $('btn-play').onclick = () => { audio.play('click'); showScreen('levelSelect'); };
        $('btn-trials').onclick = () => { audio.play('click'); showScreen('levelSelect'); };
        $('btn-characters').onclick = () => { audio.play('click'); showScreen('charSelect'); };
        $('btn-settings').onclick = () => { audio.play('click'); showScreen('settings'); };
        $('ls-back').onclick = () => { audio.play('click'); showScreen('menu'); };
        $('cs-back').onclick = () => { audio.play('click'); showScreen('menu'); };
        $('btn-select-char').onclick = () => { audio.play('click'); save.data.selChar = selectedCharIdx; save.save(); showScreen('menu'); };
        $('set-back').onclick = () => { audio.play('click'); showScreen('menu'); };
        $('sfx-vol').oninput = e => { save.data.sfxVol = +e.target.value; audio.sfxVol = save.data.sfxVol / 100; $('sfx-val').textContent = save.data.sfxVol + '%'; save.save(); };
        $('music-vol').oninput = e => { save.data.musicVol = +e.target.value; audio.musicVol = save.data.musicVol / 100; $('music-val').textContent = save.data.musicVol + '%'; save.save(); };
        $('shake-toggle').addEventListener('change', e => { save.data.shake = e.target.checked; save.save(); });
        $('fps-toggle').addEventListener('change', e => { save.data.showFps = e.target.checked; save.save(); $('fps-counter').classList.toggle('hidden', !e.target.checked); });
        $('btn-reset-save').onclick = () => { if (confirm('Delete ALL progress? This cannot be undone.')) { save.reset(); showScreen('menu'); } };
        $('btn-fullscreen').onclick = () => { toggleFullscreen(); };
        $('btn-pause').onclick = () => { if (state === 'playing') pauseGame(); };
        $('btn-resume').onclick = () => resumeGame();
        $('btn-restart').onclick = () => { audio.play('click'); startLevel(currentLevel.id); };
        $('btn-quit').onclick = () => { audio.play('click'); showScreen('menu'); };
        $('btn-next').onclick = () => { audio.play('click'); if (currentLevel.id < G.TOTAL_LEVELS) startLevel(currentLevel.id + 1); else showScreen('levelSelect'); };
        $('btn-replay').onclick = () => { audio.play('click'); startLevel(currentLevel.id); };
        $('btn-retry').onclick = () => { audio.play('click'); startLevel(currentLevel.id); };
        $('btn-fail-quit').onclick = () => { audio.play('click'); showScreen('menu'); };
    }

    function buildLevelSelect() {
        const tabs = document.getElementById('trial-tabs'), grid = document.getElementById('level-grid');
        tabs.innerHTML = '';
        for (let t = 0; t < G.TOTAL_TRIALS; t++) {
            const tab = document.createElement('div'); tab.className = 'trial-tab' + (t === currentTrialIdx ? ' active' : '');
            const need = t * 8, unlocked = save.totalStars() >= need; if (!unlocked) tab.classList.add('locked');
            tab.textContent = (TRIAL_NAMES[t] || 'TRIAL ' + (t + 1)).toUpperCase();
            if (unlocked) tab.onclick = () => { currentTrialIdx = t; buildLevelSelect(); audio.play('click'); };
            tabs.appendChild(tab);
        }
        grid.innerHTML = ''; const start = currentTrialIdx * G.LEVELS_PER_TRIAL + 1;
        for (let i = 0; i < G.LEVELS_PER_TRIAL; i++) {
            const lid = start + i, card = document.createElement('div'); card.className = 'level-card';
            const stars = save.getStars(lid), unlocked = save.isUnlocked(lid);
            if (!unlocked) card.classList.add('locked'); if (stars > 0) card.classList.add('completed');
            let starsHtml = '<div class="level-stars">';
            for (let s = 0; s < 3; s++)starsHtml += `<svg viewBox="0 0 24 24" width="14" height="14" class="${s < stars ? 'star-earned' : 'star-empty'}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
            starsHtml += '</div>';
            card.innerHTML = `<div class="level-num">${lid}</div>${starsHtml}` + (!unlocked ? '<div class="level-lock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>' : '');
            if (unlocked) card.onclick = () => { audio.play('click'); startLevel(lid); };
            grid.appendChild(card);
        }
    }

    function buildCharSelect() {
        const list = document.getElementById('char-list'); list.innerHTML = '';
        CHARACTERS.forEach((ch, idx) => {
            const card = document.createElement('div'), unlocked = ch.default || save.totalStars() >= ch.stars;
            card.className = 'char-card' + (idx === selectedCharIdx ? ' active' : '') + (!unlocked ? ' locked' : '');
            card.innerHTML = `<div class="char-card-icon" style="background:${ch.color}22;border-color:${ch.color}">${ch.letter}</div><div class="char-card-name">${ch.name}${!unlocked ? ' [LOCKED]' : ''}</div>`;
            if (unlocked) card.onclick = () => { selectedCharIdx = idx; buildCharSelect(); updateCharPreview(); audio.play('click'); };
            list.appendChild(card);
        });
        updateCharPreview();
    }

    function updateCharPreview() {
        const ch = CHARACTERS[selectedCharIdx], unlocked = ch.default || save.totalStars() >= ch.stars;
        document.getElementById('char-name').textContent = ch.name;
        document.getElementById('char-desc').textContent = ch.desc;
        document.getElementById('stat-speed').style.width = (ch.speed / 1.5 * 100) + '%';
        document.getElementById('stat-jump').style.width = (ch.jump / 1.5 * 100) + '%';
        document.getElementById('stat-resist').style.width = (ch.resist / 2 * 100) + '%';
        document.getElementById('char-unlock-info').textContent = unlocked ? 'UNLOCKED' : `REQUIRES ${ch.stars} STARS (${save.totalStars()}/${ch.stars})`;
        const btn = document.getElementById('btn-select-char'); btn.disabled = !unlocked; btn.textContent = unlocked ? 'SELECT' : 'LOCKED';
        const c = document.getElementById('char-canvas'), cx = c.getContext('2d');
        cx.clearRect(0, 0, c.width, c.height); cx.save(); cx.translate(c.width / 2, c.height / 2 + 20); cx.scale(3, 3);
        cx.fillStyle = ch.color; cx.fillRect(-11, -14, 22, 24);
        cx.fillStyle = G.COLORS.head; cx.beginPath(); cx.arc(0, -22, 9, 0, Math.PI * 2); cx.fill();
        cx.fillStyle = '#1a1a2e'; cx.fillRect(-4, -25, 3, 2); cx.fillRect(2, -25, 3, 2);
        cx.fillStyle = ch.color + 'bb'; cx.fillRect(-16, -11, 6, 18); cx.fillRect(10, -11, 6, 18);
        cx.fillRect(-9, 10, 8, 14); cx.fillRect(1, 10, 8, 14);
        cx.restore();
    }

    // ===== GAMEPLAY =====
    function startLevel(lid) {
        currentLevel = generateLevel(lid); player = new Player(currentLevel.spawnX, currentLevel.spawnY);
        player.applyCharacter(CHARACTERS[selectedCharIdx]); levelTimer = 0; trail = new TrailSystem();
        camera.snap(player.body); hideOverlays(); showScreen('playing');
        document.getElementById('hud-level-num').textContent = lid;
        document.getElementById('hud-health-fill').style.width = '100%';
        document.getElementById('hud-health-text').textContent = '100';
    }

    function pauseGame() { state = 'paused'; document.getElementById('pause-overlay').classList.remove('hidden'); }
    function resumeGame() { state = 'playing'; document.getElementById('pause-overlay').classList.add('hidden'); }

    function completeLevel() {
        state = 'complete'; audio.play('win');
        const stars = evaluateStars(); save.setStars(currentLevel.id, stars); save.setTime(currentLevel.id, levelTimer); save.save();
        document.getElementById('complete-overlay').classList.remove('hidden');
        document.querySelectorAll('#stars-display .star-slot').forEach((el, i) => {
            setTimeout(() => { if (i < stars) el.classList.add('earned'); else el.classList.remove('earned'); }, 300 + i * 400);
        });
        const fmt = t => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
        document.getElementById('comp-time').textContent = fmt(levelTimer);
        const best = save.getTime(currentLevel.id);
        document.getElementById('comp-best').textContent = best < Infinity ? fmt(best) : '--:--';
        document.getElementById('comp-limbs').textContent = player.limbsLost;
    }

    function evaluateStars() { let s = 1; if (levelTimer <= currentLevel.timeLimit) s++; if (player.limbsLost === 0) s++; return s; }
    function failLevel(reason) { state = 'failed'; document.getElementById('failed-overlay').classList.remove('hidden'); document.getElementById('fail-reason').textContent = reason || 'Torso destroyed'; }

    // ===== PREMIUM BODY SILHOUETTE RENDERER =====
    function drawBodyIndicator() {
        if (!bodyCtx || !player) return;
        const c = bodyCanvas, cx = bodyCtx, w = c.width, h = c.height;
        cx.clearRect(0, 0, w, h);

        const midX = w / 2, midY = h / 2 + 2;
        const limbs = player.limbs;
        const CON = '#2ee866', DOFF = '#44111a', DETACH = '#cc2244';

        // Draw body parts as proper silhouette shapes
        // Head
        const headC = limbs.head.attached ? CON : DETACH;
        cx.fillStyle = headC; cx.globalAlpha = limbs.head.attached ? 1 : 0.3;
        cx.beginPath(); cx.arc(midX, midY - 15, 6, 0, Math.PI * 2); cx.fill();
        cx.globalAlpha = 1;

        // Torso
        cx.fillStyle = CON;
        cx.fillRect(midX - 5, midY - 9, 10, 14);

        // Left Arm
        const laC = limbs.leftArm.attached ? CON : DETACH;
        cx.fillStyle = laC; cx.globalAlpha = limbs.leftArm.attached ? 1 : 0.3;
        cx.beginPath(); cx.moveTo(midX - 5, midY - 8); cx.lineTo(midX - 14, midY - 2); cx.lineTo(midX - 16, midY + 6);
        cx.lineTo(midX - 13, midY + 7); cx.lineTo(midX - 11, midY - 1); cx.lineTo(midX - 5, midY - 5); cx.fill();
        cx.globalAlpha = 1;

        // Right Arm
        const raC = limbs.rightArm.attached ? CON : DETACH;
        cx.fillStyle = raC; cx.globalAlpha = limbs.rightArm.attached ? 1 : 0.3;
        cx.beginPath(); cx.moveTo(midX + 5, midY - 8); cx.lineTo(midX + 14, midY - 2); cx.lineTo(midX + 16, midY + 6);
        cx.lineTo(midX + 13, midY + 7); cx.lineTo(midX + 11, midY - 1); cx.lineTo(midX + 5, midY - 5); cx.fill();
        cx.globalAlpha = 1;

        // Left Leg
        const llC = limbs.leftLeg.attached ? CON : DETACH;
        cx.fillStyle = llC; cx.globalAlpha = limbs.leftLeg.attached ? 1 : 0.3;
        cx.beginPath(); cx.moveTo(midX - 4, midY + 5); cx.lineTo(midX - 7, midY + 20); cx.lineTo(midX - 3, midY + 20); cx.lineTo(midX - 1, midY + 5); cx.fill();
        cx.globalAlpha = 1;

        // Right Leg
        const rlC = limbs.rightLeg.attached ? CON : DETACH;
        cx.fillStyle = rlC; cx.globalAlpha = limbs.rightLeg.attached ? 1 : 0.3;
        cx.beginPath(); cx.moveTo(midX + 1, midY + 5); cx.lineTo(midX + 3, midY + 20); cx.lineTo(midX + 7, midY + 20); cx.lineTo(midX + 4, midY + 5); cx.fill();
        cx.globalAlpha = 1;

        // Glow for attached parts
        cx.shadowBlur = 0;
    }

    function updateHUD() {
        if (!player) return;
        const m = Math.floor(levelTimer / 60), s = Math.floor(levelTimer % 60), cs = Math.floor((levelTimer * 100) % 100);
        document.getElementById('hud-timer').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
        document.getElementById('hud-health-fill').style.width = (player.health / G.MAX_HEALTH * 100) + '%';
        document.getElementById('hud-health-text').textContent = player.health;
        drawBodyIndicator();
    }

    // ===== GAME LOOP =====
    function gameLoop(ts) {
        const dt = Math.min((ts - lastTime) / 1000, 0.05); lastTime = ts;
        fpsFrames++; fpsTime += dt; if (fpsTime >= 0.5) { fpsCurrent = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; document.getElementById('fps-counter').textContent = fpsCurrent + ' FPS'; }
        input.update();

        if (state === 'menu' && menuCtx) {
            const w = menuCanvas.width, h = menuCanvas.height; menuCtx.clearRect(0, 0, w, h);
            menuCtx.fillStyle = 'rgba(255,255,255,0.25)';
            for (let i = 0; i < menuParticles.length; i++) { const p = menuParticles[i]; p.y -= p.sp * dt * 0.03; if (p.y < 0) p.y = 1; menuCtx.fillRect(p.x * w, p.y * h, p.s, p.s); }
        }

        if (state === 'playing' && currentLevel && player) {
            levelTimer += dt;
            player.update(dt, input, currentLevel.solids, particles, audio, trail);
            for (let i = 0; i < currentLevel.obstacles.length; i++) {
                const o = currentLevel.obstacles[i];
                if (o.type === 'platform' && o.active) { const pb = player.body; if (pb.vy >= 0 && pb.bottom <= o.y + 8 && pb.bottom >= o.y - 15 && pb.right > o.x && pb.left < o.x + o.w) { pb.y = o.y - pb.h; pb.vy = 0; pb.grounded = true; } }
                o.update(dt, player, particles, audio, camera, screenFX);
            }
            camera.follow(player.body, dt); trail.update(dt); particles.update(dt); screenFX.update(dt);
            if (player.body.overlapsTrigger(currentLevel.finishX - 15, currentLevel.finishY - 40, 30, 80)) completeLevel();
            if (!player.alive && state === 'playing') failLevel('Torso destroyed');
            if (player.body.y > 1000) { player.alive = false; failLevel('Fell into the void'); }
            if (input.pausePressed) pauseGame();
            updateHUD(); render();
        } else if (state === 'paused') { if (input.pausePressed) resumeGame(); render(); }
        else if (state === 'complete' || state === 'failed') { render(); }
        requestAnimationFrame(gameLoop);
    }

    // ===== RENDER =====
    function render() {
        if (!currentLevel) return; const C = G.COLORS, w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h); bgGrad.addColorStop(0, C.bgGrad1); bgGrad.addColorStop(1, C.bgGrad2);
        ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        for (let i = 0; i < 50; i++) { const sx = ((i * 137 + 50) % w + camera.x * 0.02) % w, sy = ((i * 89 + 30) % h + camera.y * 0.015) % h; ctx.fillRect(sx, sy, 1.5, 1.5); }
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        for (let i = 0; i < 30; i++) { const sx = ((i * 193 + 80) % w + camera.x * 0.04) % w, sy = ((i * 127 + 60) % h + camera.y * 0.03) % h; ctx.fillRect(sx, sy, 2.5, 2.5); }

        camera.apply(ctx);

        for (let i = 0; i < currentLevel.solids.length; i++) {
            const s = currentLevel.solids[i];
            ctx.fillStyle = C.ground; ctx.fillRect(s.x, s.y, s.w, s.h);
            ctx.fillStyle = C.groundTop; ctx.fillRect(s.x, s.y, s.w, 2);
            ctx.strokeStyle = C.groundGrid; ctx.lineWidth = 1;
            for (let gx = s.x; gx < s.x + s.w; gx += G.TILE) { ctx.beginPath(); ctx.moveTo(gx, s.y); ctx.lineTo(gx, s.y + s.h); ctx.stroke(); }
            for (let gy = s.y + G.TILE; gy < s.y + s.h; gy += G.TILE) { ctx.beginPath(); ctx.moveTo(s.x, gy); ctx.lineTo(s.x + s.w, gy); ctx.stroke(); }
        }

        ctx.fillStyle = C.finish; ctx.fillRect(currentLevel.finishX - 2, currentLevel.finishY - 60, 3, 60);
        ctx.fillStyle = C.finish; ctx.fillRect(currentLevel.finishX + 1, currentLevel.finishY - 60, 16, 10);
        ctx.fillStyle = C.finishGlow; ctx.fillRect(currentLevel.finishX - 20, currentLevel.finishY - 70, 40, 80);
        const pulse = 0.5 + Math.sin(performance.now() / 400) * 0.5;
        ctx.strokeStyle = `rgba(34,221,102,${0.1 + pulse * 0.15})`; ctx.lineWidth = 1;
        ctx.strokeRect(currentLevel.finishX - 18, currentLevel.finishY - 68, 36, 76);

        trail.draw(ctx);
        for (let i = 0; i < currentLevel.obstacles.length; i++)currentLevel.obstacles[i].draw(ctx);
        if (player) player.draw(ctx);
        particles.draw(ctx);
        camera.reset(ctx);
        screenFX.vignetteEnabled = save.data.shake !== false;
        screenFX.draw(ctx);
    }

    window.addEventListener('DOMContentLoaded', boot);
})();
