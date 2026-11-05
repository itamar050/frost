// world.js: one playable stage. Owns the level, the entities, the camera, beat 'em up
// arenas (camera locks + enemy waves), the boss fight flow, dialog, combo/score and HUD.
'use strict';
(() => {
  const U = G.u, C = G.C, W = G.W, H = G.H;

  const SPEAKERS = {
    alex: { name: 'ALEX', pitch: 330 }, priya: { name: 'PRIYA (INTERN)', pitch: 560 }, gus: { name: 'GUS (SYSADMIN)', pitch: 150 },
    chad: { name: 'CHAD, VP OF SYNERGY', pitch: 250 }, rack: { name: 'RACK-9000', pitch: 110 }, spag: { name: 'SPAGHETTI.EXE', pitch: 440 },
    nexus: { name: 'N.E.X.U.S.', pitch: 85 }, sys: { name: 'SYSTEM', pitch: 700 }, bot: { name: 'GLITCHBOT', pitch: 600 },
  };
  const RANKS = [[40, 'LEGENDARY!'], [25, '10X ENGINEER!'], [15, 'CLEAN CODE!'], [8, 'NICE!'], [4, 'GOOD']];

  class World {
    constructor(def, opts = {}) {
      G.instance = this;
      this.def = def;
      this.level = new G.Level.Level(def);
      this.theme = G.Themes.get(def.theme);
      this.level.render(this.theme);
      this.fx = new G.FX();
      this.ents = []; this.enemies = []; this.plats = [];
      this.cam = { x: 0, y: 0 }; this.look = 0; this.camTy = 0;
      this.shakeT = 0; this.shakeMag = 0; this.freeze = 0; this.flash = 0; this.time = 0;
      this.combo = 0; this.comboT = 0; this.maxCombo = 0; this.comboShow = 0;
      this.lock = null; this.arena = null; this.arenas = []; this.goT = 0;
      this.dialog = null; this.boss = null; this.bossArena = null; this.cutscene = false;
      this.lastEnemy = null; this.lastEnemyT = 0; this.checkpoints = []; this.result = null;
      this.readyT = 90; this.kos = 0;
      const styles = new Set(['alex', 'bot', 'manager']);
      for (const sp of this.level.spawns) if (sp.ch === 'f') styles.add('brute');
      for (const a of def.arenas || []) for (const wv of a.waves) for (const s of wv) if (s.startsWith('brute')) styles.add('brute');
      for (const n of def.npcs || []) styles.add(n.who);
      if (def.boss && G.Art.STYLES[def.boss.type]) styles.add(def.boss.type);
      G.Art.prewarm([...styles]);
      this.build(opts.checkpoint ?? -1);
      this.snapCamera();
      G.Audio.playMusic(def.music);
      if (opts.checkpoint == null && def.intro) this.pendingDialog = def.intro;
    }

    // ---- spawning from the map ---------------------------------------------------------
    build(cpIndex) {
      const L = this.level, def = this.def;
      let start = null, arenaN = 0, npcN = 0, cpN = 0;
      const cps = L.spawns.filter((s) => s.ch === 'K');
      const cp = cpIndex >= 0 ? cps[cpIndex] : null;
      const skipX = cp ? cp.x : -1;
      for (const s of L.spawns) {
        const { x, y } = s;
        const E = G.EnemyTypes;
        switch (s.ch) {
          case '@': start = { x, y }; break;
          case 'g': case 'b': case 'm': case 'd': case 'f': {
            if (x < skipX) break;
            const type = { g: 'bot', b: 'blob', m: 'manager', d: 'drone', f: 'brute' }[s.ch];
            const e = new E[type](x, y); e.type = type; this.addEnemy(e);
            break;
          }
          case 'C': this.add(new G.Pickup(x, y, 'coffee')); break;
          case 'E': this.add(new G.Pickup(x, y, 'energy')); break;
          case 'P': this.add(new G.Pickup(x, y, 'patch')); break;
          case 'U': this.add(new G.Pickup(x, y, 'oneup')); break;
          case 'o': this.add(new G.Pickup(x, y - 2, 'bit')); break;
          case 'B': this.add(new G.Breakable(x, y, def.theme)); break;
          case 'S': this.add(new G.Spring(x, y)); break;
          case '>': this.add(new G.Boost(x, y, 1)); break;
          case '<': this.add(new G.Boost(x, y, -1)); break;
          case 'H': case 'V': this.add(new G.MovingPlatform(x, y, s.ch, def.theme)); break;
          case 'L': this.add(new G.Crumble(x, y)); break;
          case 'F': this.add(new G.Fan(x, y)); break;
          case 'K': { const k = new G.Checkpoint(x, y, cpN++); if (cp && k.index <= cpIndex) k.on = true; this.checkpoints.push(k); this.add(k); break; }
          case 'N': { const d = def.npcs && def.npcs[npcN++]; if (d) { const n = new G.NPC(x, y, d); if (x < skipX) n.talked = true; this.add(n); } break; }
          case 'A': {
            const a = def.arenas && def.arenas[arenaN++];
            if (!a) break;
            this.arenas.push({ x0: s.c * G.TS, x1: (s.c + (a.w || 20)) * G.TS, waves: a.waves.map((wv) => wv.map(parseSpawn)), done: s.x < skipX, wave: -1 });
            break;
          }
          case 'Z': this.bossArena = { x0: s.c * G.TS, x1: (s.c + (def.boss.w || 20)) * G.TS, started: false }; break;
        }
      }
      const at = cp || start || { x: 48, y: 200 };
      this.player = new G.Player(at.x + (cp ? 12 : 0), at.y);
      this.checkpointPos = { x: this.player.x, y: this.player.y };
      this.lastSafe = { x: this.player.x, y: this.player.y };
    }

    add(o) { this.ents.push(o); return o; }
    addEnemy(e) { this.ents.push(e); this.enemies.push(e); return e; }

    // materialize an enemy inside the locked arena (side L/R, or T = drop from the top)
    spawnArena(type, side, arena) {
      const E = G.EnemyTypes[type];
      const x0 = this.cam.x, x1 = this.cam.x + W;
      let x = side === 'L' ? x0 + 14 : side === 'R' ? x1 - 14 : U.rand(x0 + 40, x1 - 40);
      if (type === 'drone') { const d = new E(x, this.cam.y + 40); d.y = this.cam.y + 60; d.type = type; d.inArena = true; d.active = true; d.arena = arena; this.addEnemy(d); this.fx.bits(x, d.y, 8, C.cyan); return d; }
      const gy = this.level.groundAt(x, this.cam.y + 8, 300) ?? (this.cam.y + H - 40);
      const e = new E(x, side === 'T' ? this.cam.y - 10 : gy - 30);
      e.type = type; e.inArena = true; e.active = true; e.entered = true; e.arena = arena;
      e.face = side === 'R' ? -1 : 1; e.atkCd = 50;
      this.addEnemy(e);
      this.fx.bits(x, gy - 20, 10, C.cyan); G.Audio.sfx('glitch');
      return e;
    }

    // ---- services used by entities --------------------------------------------------------
    shake(n) { this.shakeMag = Math.max(this.shakeMag, n); this.shakeT = Math.max(this.shakeT, 8 + n); }
    hitstop(n) { this.freeze = Math.max(this.freeze, n); }
    targets() {
      const out = [];
      for (const e of this.ents) if (!e.dead && (e.isEnemy ? e.active : (e.breakable || e.hittable))) out.push(e);
      return out;
    }
    findStomp(p) {
      for (const e of this.enemies) {
        if (e.dead || !e.active || !e.stompable || e.dying) continue;
        const hb = e.hurtbox();
        if (!hb) continue;
        if (p.y >= hb.y - 2 && p.y <= hb.y + 10 && Math.abs(p.x - (hb.x + hb.w / 2)) < hb.w / 2 + 5) return e;
      }
      return null;
    }
    findGrab(p, dx) {
      for (const e of this.enemies) {
        if (e.dead || !e.active || !e.onGround || !e.canGrab()) continue;
        const d = (e.x - p.x) * dx;
        if (d > 0 && d < e.w / 2 + p.w / 2 + 4 && Math.abs(e.y - p.y) < 8) return e;
      }
      return null;
    }
    registerHit(dmg) {
      this.combo++; this.comboT = 110; this.comboShow = 8;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      G.session.score += dmg * 10;
      if (this.combo > 2) G.Audio.sfx('combo');
      if (this.combo % 10 === 0) { this.player.say('combo', true); this.fx.text(this.player.x, this.player.y - 56, this.combo + ' HIT COMBO!', C.yellow, 60); this.player.meter = Math.min(100, this.player.meter + 15); }
    }
    comboBreak() { this.combo = 0; this.comboT = 0; }
    comboMult() { return 1 + Math.min(this.combo, 30) / 10; }
    addScore(n, x, y) {
      const before = G.session.score;
      const v = x !== undefined ? Math.round(n * this.comboMult() / 10) * 10 : n;
      G.session.score += v;
      if (x !== undefined) this.fx.text(x, y, '+' + v, v >= 300 ? C.yellow : C.white, 40);
      if (Math.floor(G.session.score / 50000) > Math.floor(before / 50000)) { G.session.lives++; G.Audio.sfx('oneup'); this.fx.text(this.player.x, this.player.y - 60, 'EXTRA LIFE!', C.gold, 70); }
    }
    showEnemy(e) { if (!e.isBoss) { this.lastEnemy = e; this.lastEnemyT = 120; } }
    onEnemyKO(e) {
      this.kos++;
      if (e.arena && e.arena.wave === e.arena.waves.length - 1 && this.enemies.filter((o) => o.arena === e.arena && !o.dying && !o.dead).length === 0) this.hitstop(10);
    }
    onEnemyGone(e) {
      if (e.type === 'brute' || (e.type === 'manager' && Math.random() < 0.4)) G.dropAt(this, e.x, e.y, e.type === 'brute' ? 'coffee' : undefined);
    }
    setCheckpoint(k) { this.checkpointPos = { x: k.x + 12, y: k.y }; G.session.checkpoint = k.index; }

    startDialog(lines, onDone) {
      this.dialog = { lines, i: 0, chars: 0, onDone };
      G.Input.flush();
    }

    // ---- player death and respawn -----------------------------------------------------------
    playerDied() {
      G.session.lives--;
      if (G.session.lives <= 0) { this.result = 'gameover'; return; }
      const p = this.player, pit = p.pit;
      let x = pit ? this.lastSafe.x : p.x;
      if (this.lock) x = U.clamp(x, this.cam.x + 30, this.cam.x + W - 30);
      const np = new G.Player(x, pit ? this.lastSafe.y : this.cam.y - 10);
      np.meter = p.meter; np.inv = 150; np.face = p.face;
      if (!pit) { np.y = this.cam.y - 10; np.vy = 1; }
      this.player = np;
      this.fx.bits(x, np.y, 14, C.cyan); G.Audio.sfx('checkpoint');
      this.comboBreak();
    }

    // ---- boss flow ----------------------------------------------------------------------
    startBoss() {
      const A = this.bossArena, def = this.def.boss;
      A.started = true;
      this.lock = { x0: A.x0, x1: A.x1 };
      G.Audio.stopMusic(true);
      const gy = this.level.groundAt((A.x0 + A.x1) / 2, this.cam.y + 8, 300) ?? (this.cam.y + H - 40);
      const B = G.BossTypes[def.type];
      const flying = def.type === 'spag' || def.type === 'nexus';
      const b = new B(flying ? (A.x0 + A.x1) / 2 + 40 : A.x1 - 30, flying ? this.cam.y - 40 : gy);
      b.arena = { x0: A.x0, x1: A.x1, gy }; b.type = def.type;
      this.boss = b; this.addEnemy(b);
      this.bossIntroT = 80;
    }
    bossDefeated(b) {
      this.cutscene = true; this.player.inv = 999;
      G.Audio.stopMusic(true);
      for (const e of this.enemies) if (e !== b && !e.dead && !e.dying) { e.hp = 0; e.dying = true; e.setState('downAir'); e.vy = -3; e.gravity = true; }
      for (const o of this.ents) if (o instanceof G.Projectile || o instanceof G.Beam || o instanceof G.Tentacle || o instanceof G.FallingHazard || o instanceof G.Shockwave) o.dead = true;
      this.clearT = 0;
      G.session.score += b.score;
    }

    // ---- update ---------------------------------------------------------------------------
    update() {
      G.frame++;
      if (this.dialog) { this.updateDialog(); return; }
      if (this.pendingDialog) { const d = this.pendingDialog; this.pendingDialog = null; this.startDialog(d); return; }
      if (this.freeze > 0) { this.freeze--; return; }
      this.time++;
      if (this.readyT > 0 && --this.readyT === 1) this.player.say('start', true);

      for (const e of this.ents) if (e.isPlat && !e.dead) e.update(this);
      this.plats = this.ents.filter((e) => e.isPlat && !e.off && !e.dead);
      const p = this.player;
      p.update(this);
      for (const e of this.ents) if (!e.isPlat && !e.dead) e.update(this);
      if (this.ents.some((e) => e.dead)) {
        this.ents = this.ents.filter((e) => !e.dead);
        this.enemies = this.enemies.filter((e) => !e.dead);
      }
      // remember a safe spot for pit respawns
      if (p.onGround && p.state === 'normal' && p.ground === 'solid' && this.time % 15 === 0 &&
        this.level.groundAt(p.x - 24, p.y - 1, 2) !== null && this.level.groundAt(p.x + 24, p.y - 1, 2) !== null && !this.level.hazard(p.x - 32, p.y - 20, 64, 20)) {
        this.lastSafe = { x: p.x, y: p.y };
      }

      this.updateArenas();
      this.updateCamera();
      this.fx.update();
      if (this.comboT > 0 && --this.comboT === 0) this.combo = 0;
      if (this.comboShow > 0) this.comboShow--;
      if (this.lastEnemyT > 0) this.lastEnemyT--;
      if (this.shakeT > 0) this.shakeT--; else this.shakeMag = 0;
      if (this.flash > 0) this.flash--;
      if (this.goT > 0) this.goT--;

      // boss intro: wait, then dialog, then fight
      if (this.bossIntroT > 0 && --this.bossIntroT === 0) {
        const lines = this.def.boss.intro || [];
        const begin = () => { this.boss.begin(); G.Audio.playMusic(this.def.bossMusic || 'boss'); G.Audio.sfx('roar'); this.shake(6); };
        if (lines.length) this.startDialog(lines, begin); else begin();
      }
      // stage clear sequence
      if (this.clearT !== undefined) {
        this.clearT++;
        if (this.clearT === 150) { p.setState('win'); p.control = false; G.Audio.playMusic('clear'); p.say(this.def.winQuip || 'Bug squashed.', true); }
        if (this.clearT === 280) {
          const lines = this.def.boss.outro || [];
          if (lines.length) this.startDialog(lines, () => { this.result = 'clear'; }); else this.result = 'clear';
        }
      }
    }

    updateArenas() {
      const p = this.player;
      if (!this.arena) {
        for (const a of this.arenas) {
          if (!a.done && p.x >= a.x0 + W / 2 - 24 && p.x < a.x1) { this.arena = a; this.lock = { x0: a.x0, x1: a.x1 }; a.wave = -1; this.nextWave(); break; }
        }
        const B = this.bossArena;
        if (B && !B.started && p.x >= B.x0 + W / 2 - 24) this.startBoss();
        return;
      }
      const a = this.arena;
      // pending spawns of the current wave
      for (const s of a.queue) if (!s.done && (s.at -= 1) <= 0) { s.done = true; this.spawnArena(s.type, s.side, a); }
      const alive = this.enemies.some((e) => e.arena === a && !e.dead);
      if (!alive && a.queue.every((s) => s.done)) {
        a.gap = (a.gap || 0) + 1;
        if (a.gap > 45) { a.gap = 0; this.nextWave(); }
      }
    }
    nextWave() {
      const a = this.arena;
      a.wave++;
      if (a.wave >= a.waves.length) {
        a.done = true; this.arena = null; this.lock = null; this.goT = 150; G.Audio.sfx('go');
        return;
      }
      a.queue = a.waves[a.wave].map((s, i) => ({ type: s.type, side: s.side, at: 10 + s.delay + i * 12, done: false }));
    }

    snapCamera() {
      const p = this.player;
      this.cam.x = U.clamp(p.x - W / 2, 0, this.level.w - W);
      this.cam.y = U.clamp(p.y - 150, 0, this.level.h - H);
      this.camTy = this.cam.y;
    }
    updateCamera() {
      const p = this.player;
      const moving = Math.abs(p.vx) > 1;
      this.look = U.approach(this.look, moving ? p.face * (p.sprint ? 56 : 32) : p.face * 16, moving ? 1.2 : 0.4);
      let tx = p.x + this.look - W / 2;
      let lo = 0, hi = this.level.w - W;
      if (this.lock) { lo = Math.max(lo, this.lock.x0); hi = Math.min(hi, this.lock.x1 - W); }
      tx = U.clamp(tx, lo, Math.max(lo, hi));
      const k = this.lock ? 0.1 : 0.2;
      this.cam.x += (tx - this.cam.x) * k;
      if (Math.abs(p.vx) > 4) this.cam.x += (tx - this.cam.x) * 0.2;
      // vertical: follow the ground the player stands on; in the air only when near the edges
      const sy = p.y - this.cam.y;
      if (p.onGround || p.state === 'dead') this.camTy = p.y - 150;
      else if (sy < 70) this.camTy = p.y - 70;
      else if (sy > 190) this.camTy = p.y - 190;
      if (p.state === 'dead' && p.pit) this.camTy = this.cam.y;
      this.camTy = U.clamp(this.camTy, 0, Math.max(0, this.level.h - H));
      this.cam.y += (this.camTy - this.cam.y) * (p.onGround ? 0.12 : 0.2);
      this.cam.y = U.clamp(this.cam.y, 0, Math.max(0, this.level.h - H));
      if (this.lock) this.cam.x = U.clamp(this.cam.x, this.lock.x0 - 200, this.lock.x1);
    }

    updateDialog() {
      const d = this.dialog, line = d.lines[d.i], text = line[1];
      const I = G.Input;
      if (d.chars < text.length) {
        d.chars = Math.min(text.length, d.chars + 0.75);
        const ch = text[Math.floor(d.chars)];
        if (Math.floor(d.chars * 4) % 6 === 0 && ch && ch !== ' ') G.Audio.blip((SPEAKERS[line[0]] || SPEAKERS.sys).pitch);
      }
      if (I.pressed('confirm') || I.pressed('attack') || I.pressed('jump')) {
        if (d.chars < text.length) d.chars = text.length;
        else if (++d.i >= d.lines.length) {
          this.dialog = null; G.Input.flush();
          if (d.onDone) d.onDone();
        } else { d.chars = 0; G.Audio.sfx('menu'); }
      }
    }

    // ---- drawing --------------------------------------------------------------------------
    draw(ctx) {
      let sx = 0, sy = 0;
      if (this.shakeT > 0) { sx = Math.round(U.rand(-1, 1) * this.shakeMag * 0.5); sy = Math.round(U.rand(-1, 1) * this.shakeMag * 0.5); }
      const cx = Math.round(this.cam.x) + sx, cy = Math.round(this.cam.y) + sy;
      G.Themes.drawBackground(ctx, this.theme, { x: cx, y: cy }, this.time);
      const lc = this.level.canvas;
      const vx = U.clamp(cx, 0, lc.width - W), vy = U.clamp(cy, 0, lc.height - H);
      ctx.drawImage(lc, vx, vy, W, H, vx - cx, vy - cy, W, H);
      ctx.save();
      ctx.translate(-cx, -cy);
      const list = this.ents.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
      let playerDrawn = false;
      for (const e of list) {
        if (!playerDrawn && (e.z || 0) > 3) { this.player.draw(ctx); playerDrawn = true; }
        if (e.x < cx - 120 || e.x > cx + W + 120) continue;
        e.draw(ctx, this);
      }
      if (!playerDrawn) this.player.draw(ctx);
      this.fx.draw(ctx);
      this.player.drawQuip(ctx);
      ctx.restore();
      if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash / 10})`; ctx.fillRect(0, 0, W, H); }
      this.drawHUD(ctx);
      if (this.dialog) this.drawDialog(ctx);
    }

    drawBar(ctx, x, y, w, h, frac, col, back = '#3a1020') {
      ctx.fillStyle = C.ink; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * U.clamp(frac, 0, 1)), h);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, Math.round(w * U.clamp(frac, 0, 1)), 1);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = x + 4; i < x + w; i += 5) ctx.fillRect(i, y, 1, h);
    }

    drawHUD(ctx) {
      const p = this.player, s = G.session, F = G.Font;
      // player panel
      ctx.fillStyle = C.ink; ctx.fillRect(3, 3, 17, 17); ctx.fillStyle = C.hoodD; ctx.fillRect(4, 4, 15, 15);
      G.Gfx.draw(ctx, G.Art.headSprite('alex'), 11, 19);
      F.draw(ctx, 'ALEX', 24, 3, C.white, { shadow: C.ink });
      F.draw(ctx, 'x' + Math.max(0, s.lives), 52, 3, C.yellow, { shadow: C.ink });
      const hf = p.hp / p.maxHp;
      const hc = hf > 0.5 ? C.green : hf > 0.25 ? C.yellow : (G.frame >> 3) % 2 ? C.red : '#ff9a9a';
      this.drawBar(ctx, 24, 12, 84, 5, hf, hc);
      const full = p.meter >= 100;
      this.drawBar(ctx, 24, 20, 60, 2, p.meter / 100, full ? ((G.frame >> 2) % 2 ? C.cyan : '#ffffff') : C.hood, '#10203a');
      if (full) F.draw(ctx, 'HOTFIX!', 88, 17, (G.frame >> 3) % 2 ? C.cyan : C.white, { shadow: C.ink });
      if (p.overclock > 0) F.draw(ctx, 'OC', 112, 11, (G.frame >> 2) % 2 ? C.lime : C.yellow, { shadow: C.ink });
      // score & bits
      F.draw(ctx, 'SCORE ' + String(s.score).padStart(7, '0'), W - 4, 3, C.white, { align: 'right', shadow: C.ink });
      G.Gfx.draw(ctx, G.Art.items.bit(Math.floor(G.frame / 6) % 4), W - 44, 24);
      F.draw(ctx, String(s.bits).padStart(3, '0'), W - 4, 13, C.yellow, { align: 'right', shadow: C.ink });
      // combo counter
      if (this.combo >= 2) {
        const sc = this.comboShow > 0 ? 3 : 2;
        F.draw(ctx, String(this.combo), W - 8, 32, C.yellow, { align: 'right', scale: sc, shadow: C.redD });
        F.draw(ctx, 'HITS', W - 8, 32 + sc * 7 + 2, C.white, { align: 'right', shadow: C.ink });
        const r = RANKS.find(([n]) => this.combo >= n);
        if (r) F.draw(ctx, r[1], W - 8, 32 + sc * 7 + 12, (G.frame >> 2) % 2 ? C.cyan : C.white, { align: 'right', shadow: C.ink });
      }
      // last enemy hit
      const e = this.lastEnemy;
      if (this.lastEnemyT > 0 && e) {
        F.draw(ctx, e.name, 132, 3, C.white, { shadow: C.ink });
        this.drawBar(ctx, 132, 12, 60, 4, e.hp / e.maxHp, C.orange);
      }
      // boss bar
      if (this.boss && this.boss.state !== 'intro' && !this.boss.gone) {
        const b = this.boss;
        F.draw(ctx, b.name, 60, H - 20, C.white, { shadow: C.ink });
        this.drawBar(ctx, 60, H - 11, 200, 6, b.hp / b.maxHp, (G.frame >> 4) % 2 && b.hp < b.maxHp / 4 ? C.orange : C.red);
      }
      // GO arrow
      if (this.goT > 0 && (this.goT >> 3) % 2) {
        F.draw(ctx, 'GO!', W - 40, H / 2 - 8, C.yellow, { scale: 2, shadow: C.redD });
        F.draw(ctx, '}', W - 14, H / 2 - 6, C.yellow, { shadow: C.redD });
      }
      // READY / GO
      if (this.readyT > 0 && !this.pendingDialog && !this.dialog) {
        const t = this.readyT;
        const txt = t > 30 ? 'READY?' : 'GO!';
        F.draw(ctx, txt, W / 2, H / 2 - 30, t > 30 ? C.white : C.yellow, { align: 'center', scale: 3, shadow: C.ink, outline: true });
      }
    }

    drawDialog(ctx) {
      const d = this.dialog, [who, text] = d.lines[d.i];
      const sp = SPEAKERS[who] || SPEAKERS.sys;
      const x = 6, y = H - 62, w = W - 12, h = 56;
      ctx.fillStyle = C.white; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = C.ink; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = '#1a1840'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.drawImage(G.Art.portrait(who), x + 6, y + 6);
      G.Font.draw(ctx, sp.name, x + 56, y + 6, C.yellow);
      const shown = text.slice(0, Math.floor(d.chars));
      const fullLines = G.Font.wrap(text, 41);
      // wrap the full text so words do not jump between lines while typing
      let n = 0;
      fullLines.forEach((fl, i) => {
        const part = shown.slice(n, n + fl.length);
        G.Font.draw(ctx, part, x + 56, y + 18 + i * 10, C.white);
        n += fl.length + 1;
      });
      if (d.chars >= text.length && (G.frame >> 4) % 2) G.Font.draw(ctx, d.i < d.lines.length - 1 ? 'v' : '}', x + w - 12, y + h - 11, C.cyan);
    }
  }

  function parseSpawn(str) {
    const [type, side = 'R', delay = '0'] = str.split(':');
    return { type, side, delay: +delay };
  }

  G.World = World;
  G.SPEAKERS = SPEAKERS;
})();
