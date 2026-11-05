// bosses.js: the Boss base class and the four bosses.
//   chad   - Chad Brockman, VP of Synergy (stage 1)
//   rack   - RACK-9000, the server rack that achieved sentience (stage 2)
//   spag   - SPAGHETTI.EXE, twenty years of legacy code (stage 3)
//   nexus  - N.E.X.U.S., the company AI (final boss, two phases)
// Each boss gets this.arena = {x0, x1, gy} from the world (arena bounds and floor height).
'use strict';
(() => {
  const U = G.u, C = G.C;

  class Boss extends G.Enemy {
    constructor(x, y, o) {
      super(x, y, Object.assign({ grabbable: false }, o));
      this.isBoss = true; this.active = true; this.inArena = true; this.entered = true;
      this.state = 'intro'; this.stunBudget = 3; this.noHitT = 0; this.phase = 1; this.kbMul = o.kbMul ?? 0.6;
      this.dmgMul = 1;
    }
    begin() { this.setState('idle'); }
    canStun() { return false; }
    update(w) {
      this.noHitT++;
      if (this.noHitT > 100) this.stunBudget = 3;
      super.update(w);
      if (this.state !== 'defeated' && !this.noClip) this.x = U.clamp(this.x, this.arena.x0 + this.w / 2 + 2, this.arena.x1 - this.w / 2 - 2);
    }
    hurtbox() {
      if (this.state === 'intro' || this.state === 'defeated') return null;
      return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }
    takeHit(hit, w) {
      if (this.state === 'intro' || this.state === 'defeated' || this.inv > 0) return false;
      if (this.shielded && this.shielded(hit)) return 'block';
      this.hp -= Math.round(hit.dmg * this.dmgMul); this.flash = 6; this.noHitT = 0;
      w.showEnemy(this);
      if (this.hp <= 0) { this.hp = 0; this.defeat(w); return true; }
      if (this.canStun()) {
        if (this.stunBudget > 0) { this.stunBudget--; this.setState('hurt'); this.stunT = 14; this.vx = (hit.dir || 1) * 1.6 * this.kbMul; }
        else { this.stunBudget = 3; this.inv = 24; if (this.counter) this.counter(w); }
      }
      if (this.onDamaged) this.onDamaged(w);
      return true;
    }
    c_hurt() { this.vx = U.approach(this.vx, 0, 0.2); if (this.t >= this.stunT) this.setState('idle'); }
    defeat(w) {
      this.setState('defeated'); this.vx = 0; this.telegraph = false;
      w.bossDefeated(this);
      G.Audio.sfx('explode'); w.flash = 8; w.shake(10); w.hitstop(20);
    }
    c_defeated(w) {
      this.vx = U.approach(this.vx, 0, 0.2);
      if (this.t % 9 === 0 && this.t < 110) {
        const ex = this.x + U.rand(-this.w, this.w) * 0.6, ey = this.y - U.rand(0, this.h);
        w.fx.burst(ex, ey, 10, [C.orange, C.yellow, '#ffffff'], 3); w.fx.ring(ex, ey, 16, C.orange, 12);
        G.Audio.sfx('explode'); w.shake(3);
      }
      if (this.t === 120) { w.fx.bits(this.x, this.y - this.h / 2, 30, C.green); if (this.vanish) this.gone = true; }
    }
    walkTo(tx, speed) { const d = tx - this.x; this.vx = Math.abs(d) < 3 ? 0 : Math.sign(d) * speed; return Math.abs(d) < 3; }
    say(w, text, col = C.yellow) { w.fx.text(this.x, this.y - this.h - 14, text, col, 80); }
  }

  // ===================================================================================
  // CHAD BROCKMAN, VP of Synergy
  // ===================================================================================
  const BUZZ = ['SYNERGY', 'PIVOT', 'DISRUPT', 'LEVERAGE', 'ROCKSTAR', 'BANDWIDTH', 'KPI', 'OKR', 'SCALE IT', 'ALIGN'];
  class Chad extends Boss {
    constructor(x, y) {
      super(x, y, { hp: 170, name: 'CHAD BROCKMAN, VP', style: 'chad', w: 20, h: 52, score: 5000, kbMul: 0.5 });
      this.poses = {
        intro: () => 'walk' + (Math.floor(G.frame / 6) % 8), walk: () => 'walk' + (Math.floor(G.frame / 6) % 8),
        jabW: 'windup', jab: 'punch', chargeW: 'point', charge: () => 'sprint' + (Math.floor(G.frame / 4) % 8), dazed: 'stun',
        buzz: function () { return this.t % 24 < 12 ? 'throwW' : 'throwR'; }, slamW: 'crouch', slamAir: 'slam', slamLand: 'crouch',
        summon: 'point', idle: 'idle0', defeated: 'down', hurt: 'hurt', taunt: 'win',
      };
      this.summoned = false;
    }
    canStun() { return ['idle', 'walk', 'dazed', 'jabW', 'slamLand', 'taunt'].includes(this.state); }
    counter(w) { this.setState('slamW'); this.say(w, 'BACK OFF!'); }
    ai(w) {
      const p = w.player, d = p.x - this.x, ad = Math.abs(d), fast = this.hp < this.maxHp / 2;
      this.telegraph = false;
      switch (this.state) {
        case 'intro': this.walkTo(this.arena.x1 - 70, 1.2); this.face = -1; break;
        case 'idle':
          this.vx = U.approach(this.vx, 0, 0.3); this.face = Math.sign(d) || this.face;
          if (p.state === 'dead') break;
          if (this.t > (fast ? 22 : 40)) {
            if (!this.summoned && fast) { this.setState('summon'); break; }
            const r = Math.random();
            if (ad < 44 && r < 0.45) this.setState('jabW');
            else if (r < 0.35) this.setState('chargeW');
            else if (r < 0.6) this.setState('buzz');
            else if (r < 0.8) this.setState('slamW');
            else this.setState('walk');
          }
          break;
        case 'walk':
          this.face = Math.sign(d) || this.face; this.vx = this.face * (fast ? 1.6 : 1.2);
          if (ad < 40) { this.setState('jabW'); this.vx = 0; } else if (this.t > 60) this.setState('idle');
          break;
        case 'jabW': this.vx = 0; this.telegraph = this.t > 8; if (this.t >= 16) { this.setState('jab'); this.vx = this.face * 2; } break;
        case 'jab':
          this.vx = U.approach(this.vx, 0, 0.2);
          if (this.t < 8 && !this.hitDone && this.hitPlayer(w, this.front(4, -48, 28, 16), { dmg: 10, kb: 3, kby: -3, knock: true })) this.hitDone = true;
          if (this.t >= 22) { this.hitDone = false; this.setState('idle'); }
          break;
        case 'chargeW':
          this.vx = 0; this.face = Math.sign(d) || this.face; this.telegraph = true;
          if (this.t === 1) { G.Audio.sfx('warn'); this.say(w, U.pick(['DISRUPTION INCOMING!', 'MOVE FAST!', 'GROWTH MINDSET!'])); }
          if (this.t >= 38) { this.setState('charge'); G.Audio.sfx('dash'); }
          break;
        case 'charge':
          this.vx = this.face * (fast ? 6 : 5.2);
          if (this.t % 3 === 0) w.fx.dust(this.x, this.y, this.face, 1);
          if (!this.hitDone && this.hitPlayer(w, this.front(-6, -50, 24, 46), { dmg: 14, kb: 4, kby: -5, knock: true })) this.hitDone = true;
          if (this.x <= this.arena.x0 + this.w / 2 + 4 || this.x >= this.arena.x1 - this.w / 2 - 4) {
            this.hitDone = false; this.setState('dazed'); this.vx = -this.face * 2;
            w.shake(8); G.Audio.sfx('heavy'); w.fx.burst(this.x + this.face * 10, this.y - 30, 12, ['#ffffff', C.yellow], 3);
          }
          break;
        case 'dazed': this.vx = U.approach(this.vx, 0, 0.15); if (this.t >= (fast ? 70 : 90)) this.setState('idle'); break;
        case 'buzz':
          this.vx = 0; this.face = Math.sign(d) || this.face;
          if (this.t % 24 === 12 && this.t < 24 * (fast ? 4 : 3)) {
            const word = U.pick(BUZZ);
            const sp = U.clamp(ad / 45, 1.6, 4) * U.rand(0.85, 1.15);
            w.add(new G.Projectile(this.x + this.face * 10, this.y - 48, { spr: G.Art.word(word), vx: this.face * sp, vy: -3.6, g: 0.15, dmg: 8, hittable: true, w: 20, h: 9 }));
            G.Audio.sfx('throw');
          }
          if (this.t >= 24 * (fast ? 4 : 3) + 10) this.setState('idle');
          break;
        case 'slamW': this.vx = 0; this.telegraph = true; if (this.t >= 14) { this.setState('slamAir'); this.vy = -9; this.onGround = false; this.vx = U.clamp(d / 48, -3.2, 3.2); G.Audio.sfx('jump'); } break;
        case 'slamAir':
          if (this.onGround && this.t > 5) {
            this.setState('slamLand'); this.vx = 0; w.shake(8); G.Audio.sfx('heavy');
            w.add(new G.Shockwave(this.x - 12, this.y, -1)); w.add(new G.Shockwave(this.x + 12, this.y, 1));
            if (U.overlap(this.front(-20, -20, 40, 20), p.hurtbox())) p.takeHit({ dmg: 12, kb: 3, kby: -4, knock: true, dir: Math.sign(d) || 1, from: this }, w);
          }
          break;
        case 'slamLand': if (this.t >= 34) this.setState('idle'); break;
        case 'summon':
          this.vx = 0;
          if (this.t === 1) { this.summoned = true; this.say(w, "LET'S CIRCLE BACK WITH THE TEAM!"); G.Audio.sfx('roar'); }
          if (this.t === 40) { w.spawnArena('bot', 'L'); w.spawnArena('bot', 'R'); }
          if (this.t >= 60) this.setState('idle');
          break;
      }
    }
    onDamaged(w) { if (Math.random() < 0.08) this.say(w, U.pick(["NOT A TEAM PLAYER!", "I'LL ESCALATE THIS!", 'HR WILL HEAR ABOUT THIS!'])); }
    draw(ctx) {
      super.draw(ctx);
      if (this.state === 'dazed') {
        const a = G.frame / 6;
        for (let i = 0; i < 3; i++) G.Font.draw(ctx, '*', this.x + Math.cos(a + i * 2.1) * 12 - 2, this.y - 66 + Math.sin(a + i * 2.1) * 3, C.yellow);
      }
      if (this.state === 'chargeW') G.Font.draw(ctx, '!', this.x - 2, this.y - 72 - (G.frame % 10 < 5 ? 1 : 0), C.red, { shadow: C.ink });
    }
  }

  // ===================================================================================
  // RACK-9000
  // ===================================================================================
  class Rack extends Boss {
    constructor(x, y) {
      super(x, y, { hp: 230, name: 'RACK-9000', w: 52, h: 74, score: 7000, kbMul: 0 });
      this.cable = 0; this.cableT = 0; this.cycle = 0; this.face = -1; this.vanish = false;
    }
    canStun() { return this.state === 'overheat'; }
    ai(w) {
      const p = w.player, d = p.x - this.x, fast = this.hp < this.maxHp / 2;
      this.telegraph = false;
      this.dmgMul = this.state === 'overheat' ? 2 : 1;
      this.contact = this.state === 'move' ? 8 : 0;
      switch (this.state) {
        case 'intro': this.walkTo(this.arena.x1 - 70, 0.8); break;
        case 'idle': {
          this.vx = 0; this.face = Math.sign(d) || this.face;
          if (p.state === 'dead' || this.t < (fast ? 20 : 35)) break;
          const seq = ['move', 'cableW', 'move', 'drives', 'cableW', 'laserW'];
          this.setState(seq[this.cycle++ % seq.length]);
          break;
        }
        case 'move': {
          const tx = U.clamp(p.x + (p.x < (this.arena.x0 + this.arena.x1) / 2 ? 90 : -90), this.arena.x0 + 40, this.arena.x1 - 40);
          if (this.walkTo(tx, fast ? 1.2 : 0.8) || this.t > 120) this.setState('idle');
          break;
        }
        case 'cableW': this.vx = 0; this.telegraph = this.t > 10; if (this.t === 1) G.Audio.sfx('warn'); if (this.t >= (fast ? 22 : 30)) { this.setState('cable'); G.Audio.sfx('zap'); } break;
        case 'cable': {
          const ext = 150, out = 14, hold = 8;
          this.cable = this.t < out ? ext * this.t / out : this.t < out + hold ? ext : Math.max(0, ext * (1 - (this.t - out - hold) / out));
          const x0 = this.x + this.face * 26, x1 = x0 + this.face * this.cable;
          const box = { x: Math.min(x0, x1), y: this.y - 28, w: Math.abs(x1 - x0), h: 9 };
          if (this.cable > 4) this.hitPlayer(w, box, { dmg: 12, kb: 3, kby: -4, knock: true });
          if (this.t >= out * 2 + hold) { this.cable = 0; this.setState(fast && !this.second ? 'cableW' : 'idle'); this.second = !this.second && fast; }
          break;
        }
        case 'drives':
          this.vx = 0;
          if (this.t === 1) G.Audio.sfx('warn');
          if (this.t % 14 === 0 && this.t <= 14 * (fast ? 6 : 4)) {
            const x = U.clamp(p.x + U.randi(-50, 50), this.arena.x0 + 12, this.arena.x1 - 12);
            w.add(new G.FallingHazard(x, w, { warn: 40, dmg: 10 }));
          }
          if (this.t >= 14 * (fast ? 6 : 4) + 40) this.setState('idle');
          break;
        case 'laserW': this.vx = 0; this.face = Math.sign(d) || this.face; this.telegraph = this.t > 20; if (this.t === 1) G.Audio.sfx('warn');
          if (this.t >= 40) {
            this.setState('laser');
            const x0 = this.face > 0 ? this.x + 20 : this.arena.x0, x1 = this.face > 0 ? this.arena.x1 : this.x - 20;
            w.add(new G.Beam({ x0, x1, y: this.y - 31, thick: 8, warn: 1, on: 56, dmg: 13, col: C.red, srcX: this.x }));
          }
          break;
        case 'laser': if (this.t >= 58) { this.setState('overheat'); G.Audio.sfx('glitch'); w.fx.text(this.x, this.y - 90, 'OVERHEATING!', C.orange, 60); } break;
        case 'overheat':
          if (this.t % 6 === 0) w.fx.dust(this.x + U.rand(-26, 26), this.y - 60, 0, 1);
          if (this.t >= (fast ? 120 : 150)) this.setState('idle');
          break;
        case 'hurt': break;
      }
    }
    c_hurt() { if (this.t >= this.stunT) this.setState('overheat'); }
    draw(ctx) {
      const x = Math.round(this.x), y = Math.round(this.y), p = new G.Gfx.Pen(ctx);
      if (this.state === 'defeated' && this.t > 120) {
        p.rect(x - 28, y - 30, 56, 30, '#2a2e40'); p.rect(x - 26, y - 28, 52, 26, '#1a1e30');
        G.Font.draw(ctx, 'BSOD', x - 11, y - 20, C.blue); return;
      }
      const flash = this.flash > 0, red = this.telegraph && (G.frame >> 1) % 2;
      const body = flash ? '#ffffff' : red ? '#ff7a7a' : '#7d86a0', dark = flash ? '#ffffff' : '#4a5068';
      const shake = this.state === 'overheat' || this.state === 'defeated' ? (G.frame % 2) : 0;
      const bx = x + shake;
      // cable arm
      if (this.cable > 0) {
        const x0 = bx + this.face * 26;
        p.line(x0, y - 24, x0 + this.face * this.cable, y - 24, C.ink, 5);
        p.line(x0, y - 24, x0 + this.face * this.cable, y - 24, G.frame % 4 < 2 ? C.cyan : '#ffffff', 3);
        p.rect(x0 + this.face * this.cable - 4, y - 29, 8, 10, C.ink); p.rect(x0 + this.face * this.cable - 3, y - 28, 6, 8, C.yellow);
      }
      // treads
      p.rect(bx - 30, y - 14, 60, 14, C.ink); p.rect(bx - 29, y - 13, 58, 12, '#2a2e40');
      for (let i = 0; i < 7; i++) p.rect(bx - 27 + ((i * 8 + Math.floor(this.x)) % 56), y - 11, 3, 8, '#5a6078');
      // chassis
      p.rect(bx - 27, y - 76, 54, 64, C.ink); p.rect(bx - 26, y - 75, 52, 62, body);
      p.rect(bx - 23, y - 72, 46, 56, dark);
      // face screen
      p.rect(bx - 19, y - 70, 38, 20, C.ink); p.rect(bx - 18, y - 69, 36, 18, '#0a1830');
      if (this.state === 'laserW' || this.state === 'laser') G.Font.draw(ctx, '404', bx - 8, y - 64, (G.frame >> 2) % 2 ? C.red : C.orange);
      else if (this.state === 'overheat' || this.state === 'hurt') G.Font.draw(ctx, '@_@', bx - 8, y - 64, C.orange);
      else {
        const ex = this.face * 3;
        p.rect(bx - 11 + ex, y - 66, 6, 6, C.cyan); p.rect(bx + 5 + ex, y - 66, 6, 6, C.cyan);
        p.rect(bx - 11 + ex, y - 66, 6, 2, '#0a1830'); p.rect(bx + 5 + ex, y - 66, 6, 2, '#0a1830');
        p.rect(bx - 8, y - 56, 16, 2, C.red);
      }
      // drive bays with LEDs
      for (let i = 0; i < 6; i++) {
        p.rect(bx - 19, y - 47 + i * 6, 38, 4, '#262b40');
        const on = U.hash(i, Math.floor(G.frame / 8)) > 0.4;
        p.rect(bx + 13, y - 46 + i * 6, 3, 2, on ? (this.state === 'overheat' ? C.red : C.green) : '#1a1e30');
      }
      // side vents
      const vent = this.state === 'overheat' || this.state === 'hurt';
      for (const s of [-1, 1]) {
        p.rect(bx + s * 27 - (s > 0 ? 0 : 6), y - 60, 6, 30, C.ink);
        p.rect(bx + s * 27 - (s > 0 ? -1 : 5), y - 59, 4, 28, vent ? ((G.frame >> 2) % 2 ? C.orange : C.red) : '#5a6078');
      }
      if (G.DEBUG) { const hb = this.hurtbox(); if (hb) { ctx.strokeStyle = '#ff0'; ctx.strokeRect(hb.x + 0.5, hb.y + 0.5, hb.w, hb.h); } }
    }
  }

  // ===================================================================================
  // SPAGHETTI.EXE
  // ===================================================================================
  class Spag extends Boss {
    constructor(x, y) {
      super(x, y, { hp: 250, name: 'SPAGHETTI.EXE', w: 44, h: 40, score: 9000, kbMul: 0 });
      this.gravity = false; this.noClip = true; this.flying = true; this.vanish = true;
      this.home = { x, y }; this.summons = 0; this.cycle = 0;
    }
    canStun() { return this.state === 'tangled'; }
    ai(w) {
      const p = w.player, A = this.arena, mid = (A.x0 + A.x1) / 2, fast = this.hp < this.maxHp / 2;
      this.dmgMul = this.state === 'tangled' ? 1.5 : 1;
      this.contact = this.state === 'dip' ? 10 : 0;
      const hover = (tx, ty, k = 0.04) => { this.vx = U.clamp((tx - this.x) * k, -3, 3); this.vy = U.clamp((ty - this.y) * k, -3, 3); };
      const floatY = A.gy - 62 + Math.sin(this.t / 25) * 6;
      switch (this.state) {
        case 'intro': hover(mid + 60, A.gy - 62, 0.03); break;
        case 'idle': {
          hover(mid + Math.sin(this.t / 50) * 90, floatY);
          if (p.state === 'dead' || this.t < (fast ? 50 : 80)) break;
          if ((this.hp < this.maxHp * 0.66 && this.summons < 1) || (this.hp < this.maxHp * 0.33 && this.summons < 2)) { this.setState('summon'); break; }
          const seq = ['orbs', 'stab', 'dipW', 'orbs', 'dipW', 'stab'];
          this.setState(seq[this.cycle++ % seq.length]);
          break;
        }
        case 'orbs':
          hover(this.x, floatY);
          if (this.t === 1) G.Audio.sfx('glitch');
          if (this.t === 24) {
            const n = fast ? 7 : 5;
            for (let i = 0; i < n; i++) {
              const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42;
              w.add(new G.Projectile(this.x, this.y - 20, { spr: G.Art.proj.orb(), vx: Math.cos(a) * 2.6 + (p.x - this.x) / 140, vy: Math.sin(a) * 2.6, g: 0.12, bounce: 2, dmg: 8, hittable: true, life: 400 }));
            }
            G.Audio.sfx('shoot');
          }
          if (this.t >= 60) this.setState('idle');
          break;
        case 'stab':
          hover(this.x, floatY);
          if (this.t === 1) { G.Audio.sfx('warn'); this.say(w, U.pick(['GOTO HELL!', 'UNDEFINED BEHAVIOR!', 'SEGFAULT!'])); }
          if (this.t === 10) {
            const xs = fast ? [-96, -48, 0, 48, 96] : [-50, 0, 50];
            for (const o of xs) { const tx = U.clamp(p.x + o, A.x0 + 10, A.x1 - 10); w.add(new G.Tentacle(tx, A.gy, { warn: 40, dmg: 11 })); }
          }
          if (this.t >= 90) this.setState('idle');
          break;
        case 'dipW':
          hover(this.x < mid ? A.x0 + 40 : A.x1 - 40, A.gy - 90, 0.06);
          this.telegraph = this.t > 30;
          if (this.t >= 50) { this.setState('dip'); this.dipFrom = this.x; this.dipDir = this.x < mid ? 1 : -1; G.Audio.sfx('roar'); }
          break;
        case 'dip': {
          const k = Math.min(1, this.t / 70);
          this.vx = 0; this.vy = 0;
          const nx = this.dipFrom + this.dipDir * (A.x1 - A.x0 - 80) * k;
          const ny = A.gy - 90 + Math.sin(k * Math.PI) * 88;
          this.x = nx; this.y = Math.min(ny, A.gy);
          if (this.t >= 70) { this.setState('tangled'); this.y = A.gy; w.shake(6); G.Audio.sfx('heavy'); w.fx.text(this.x, this.y - 56, 'STACK TRACE!', C.yellow, 60); }
          break;
        }
        case 'tangled': this.vx = 0; this.vy = 0; this.y = A.gy; if (this.t >= (fast ? 110 : 140)) this.setState('rise'); break;
        case 'rise': hover(this.x, floatY, 0.05); if (this.t >= 40) this.setState('idle'); break;
        case 'summon':
          hover(mid, floatY);
          if (this.t === 1) { this.summons++; this.say(w, 'NULL POINTER EXCEPTION!'); G.Audio.sfx('glitch'); }
          if (this.t === 30) { w.spawnArena('blob', 'T'); w.spawnArena('blob', 'T'); if (this.summons > 1) w.spawnArena('bot', 'L'); }
          if (this.t >= 60) this.setState('idle');
          break;
        case 'hurt': break;
      }
    }
    c_hurt() { this.vx = 0; this.vy = 0; if (this.t >= this.stunT) { this.state = 'tangled'; this.t = 40; } }
    c_defeated() { this.vx = 0; this.vy = 0.4; Boss.prototype.c_defeated.apply(this, arguments); }
    draw(ctx) {
      if (this.gone) return;
      const x = Math.round(this.x), cy = Math.round(this.y - 20), p = new G.Gfx.Pen(ctx);
      const t = G.frame / 10, tang = this.state === 'tangled' || this.state === 'hurt';
      const col = this.flash > 0 ? '#ffffff' : this.telegraph && (G.frame >> 1) % 2 ? '#ff7a5a' : '#ffd24a';
      // dangling noodles
      for (let k = 0; k < 5; k++) {
        let px = x - 16 + k * 8, py = cy + 10;
        for (let i = 0; i < 8; i++) {
          const nx = px + Math.sin(t + k + i * 0.7) * 2.5, ny = py + (tang ? 1 : 4);
          p.line(px, py, nx, ny, C.ink, 4); p.line(px, py, nx, ny, i % 3 ? col : '#d8901a', 2);
          px = nx; py = ny;
        }
      }
      // the tangle
      for (let k = 0; k < 9; k++) {
        let prev = null;
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const r = 15 + 6 * Math.sin(3 * a + t * (k % 2 ? 1 : -1) + k * 1.7);
          const pt = [x + Math.cos(a + k) * r, cy + Math.sin(a + k) * r * 0.85];
          if (prev) { p.line(prev[0], prev[1], pt[0], pt[1], C.ink, 4); }
          prev = pt;
        }
      }
      for (let k = 0; k < 9; k++) {
        let prev = null;
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const r = 15 + 6 * Math.sin(3 * a + t * (k % 2 ? 1 : -1) + k * 1.7);
          const pt = [x + Math.cos(a + k) * r, cy + Math.sin(a + k) * r * 0.85];
          if (prev) p.line(prev[0], prev[1], pt[0], pt[1], k % 3 === 0 ? '#d8901a' : col, 2);
          prev = pt;
        }
      }
      p.ellipse(x, cy, 13, 11, col);
      const H = G.Art.HEADS.spag;
      p.grid(tang ? H.rows.map((r) => r.replace(/k/g, 'w')) : H.rows, H.pal, x - 12, cy - 10, 0, false, 2);
      // meatball crown
      p.circle(x - 8, cy - 22, 4, '#8a3a1a'); p.circle(x + 7, cy - 21, 3, '#8a3a1a'); p.px(x - 9, cy - 24, '#c86a3a');
      if (tang) for (let i = 0; i < 3; i++) G.Font.draw(ctx, '?', x + Math.cos(G.frame / 8 + i * 2) * 20 - 2, cy - 34 + Math.sin(G.frame / 8 + i * 2) * 3, C.cyan);
      if (G.DEBUG) { const hb = this.hurtbox(); if (hb) { ctx.strokeStyle = '#ff0'; ctx.strokeRect(hb.x + 0.5, hb.y + 0.5, hb.w, hb.h); } }
    }
  }

  // ===================================================================================
  // N.E.X.U.S. (final boss)
  // ===================================================================================
  class Nexus extends Boss {
    constructor(x, y) {
      super(x, y, { hp: 300, name: 'N.E.X.U.S.', w: 44, h: 44, score: 15000, kbMul: 0 });
      this.gravity = false; this.noClip = true; this.flying = true; this.vanish = true;
      this.attacks = 0; this.cycle = 0; this.spin = 0;
    }
    shielded() { return !(this.state === 'open' || this.state === 'hurt'); }
    canStun() { return this.state === 'open'; }
    ai(w) {
      const p = w.player, A = this.arena, mid = (A.x0 + A.x1) / 2;
      const rage = this.phase === 2;
      this.spin += rage ? 0.08 : 0.04;
      const hover = (tx, ty, k = 0.04) => { this.vx = U.clamp((tx - this.x) * k, -2.5, 2.5); this.vy = U.clamp((ty - this.y) * k, -2.5, 2.5); };
      const floatY = A.gy - 96 + Math.sin(this.t / 30) * 8;
      if (this.phase === 1 && this.hp <= this.maxHp / 2 && this.state !== 'rage') { this.phase = 2; this.setState('rage'); }
      switch (this.state) {
        case 'intro': hover(mid, A.gy - 96, 0.03); break;
        case 'rage':
          hover(mid, A.gy - 100);
          if (this.t === 1) { G.Audio.sfx('roar'); w.flash = 10; w.shake(12); this.say(w, 'ROOT ACCESS DENIED.', C.red); }
          if (this.t >= 90) this.setState('idle');
          break;
        case 'idle':
          hover(mid + Math.sin(this.t / 60) * 100, floatY);
          if (rage && this.t % 50 === 25) w.add(new G.FallingHazard(U.clamp(p.x + U.randi(-30, 30), A.x0 + 10, A.x1 - 10), w, { warn: 36, dmg: 8, spr: G.Art.proj.byte() }));
          if (p.state === 'dead' || this.t < (rage ? 40 : 60)) break;
          if (this.attacks >= 2) { this.attacks = 0; this.setState('openW'); break; }
          this.attacks++;
          this.setState(['ring', 'beams', 'ring', 'minions', 'beams'][this.cycle++ % 5]);
          if (this.state === 'minions' && w.enemies.filter((e) => e.type === 'drone' && !e.dead).length >= 2) this.setState('ring');
          break;
        case 'ring': {
          hover(this.x, floatY);
          const volleys = rage ? 4 : 3, gap = rage ? 22 : 30;
          if (this.t % gap === 10 && this.t < gap * volleys) {
            const n = rage ? 14 : 10, off = this.t / 7;
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2 + off;
              w.add(new G.Projectile(this.x, this.y - 22, { spr: G.Art.proj.packet(), vx: Math.cos(a) * 2.1, vy: Math.sin(a) * 2.1, dmg: 8, noWall: true, life: 260 }));
            }
            G.Audio.sfx('shoot');
          }
          if (this.t >= gap * volleys + 20) this.setState('idle');
          break;
        }
        case 'beams': {
          hover(mid, A.gy - 110);
          const n = rage ? 4 : 3, gap = rage ? 46 : 56;
          if (this.t % gap === 1 && this.t < gap * n) {
            const low = Math.random() < 0.5;
            w.add(new G.Beam({ x0: A.x0, x1: A.x1, y: low ? A.gy - 7 : A.gy - 32, thick: low ? 10 : 8, warn: 34, on: 18, dmg: 12, col: C.magenta, srcX: this.x }));
            w.fx.text(this.x, this.y - 60, low ? 'JUMP!' : 'DUCK!', C.cyan, 30);
            G.Audio.sfx('warn');
          }
          if (this.t >= gap * n + 20) this.setState('idle');
          break;
        }
        case 'minions':
          hover(this.x, floatY);
          if (this.t === 20) { w.spawnArena('drone', 'L'); w.spawnArena('drone', 'R'); G.Audio.sfx('glitch'); }
          if (this.t >= 50) this.setState('idle');
          break;
        case 'openW':
          hover(U.clamp(p.x, A.x0 + 60, A.x1 - 60), A.gy - 28, 0.05);
          if (this.t === 1) { G.Audio.sfx('glitch'); w.fx.text(this.x, this.y - 60, 'FIREWALL DOWN!', C.green, 50); }
          if (this.t >= 40) this.setState('open');
          break;
        case 'open':
          hover(this.x, A.gy - 28 + Math.sin(this.t / 10) * 2, 0.08);
          if (this.t >= (rage ? 150 : 180)) this.setState('idle');
          break;
        case 'hurt': this.vx = 0; this.vy = 0; break;
      }
    }
    c_hurt() { this.vx = 0; this.vy = 0; if (this.t >= this.stunT) { this.state = 'open'; this.t = 60; } }
    c_defeated() { this.vx = 0; this.vy = 0.3; Boss.prototype.c_defeated.apply(this, arguments); }
    draw(ctx) {
      if (this.gone) return;
      const x = Math.round(this.x), cy = Math.round(this.y - 22), p = new G.Gfx.Pen(ctx);
      const rage = this.phase === 2, open = this.state === 'open' || this.state === 'hurt' || this.state === 'openW';
      const white = this.flash > 0;
      // outer glow
      if ((G.frame >> 1) % 2) p.ring(x, cy, 34, rage ? C.red : C.purple, 1);
      // eye
      p.circle(x, cy, 21, C.ink);
      p.circle(x, cy, 20, white ? '#ffffff' : '#e8e0f0');
      const px = U.clamp((G.instance ? G.instance.player.x - x : 0) / 20, -7, 7);
      p.circle(x + px, cy + 1, 11, white ? '#ffffff' : rage ? C.red : C.purple);
      p.circle(x + px, cy + 1, 6, C.ink);
      p.rect(x + px - 4, cy - 4, 3, 3, '#ffffff');
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.4; p.line(x + Math.cos(a) * 14, cy + Math.sin(a) * 14, x + Math.cos(a) * 19, cy + Math.sin(a) * 19, '#c03050', 1); }
      // shield ring: 8 segments, spread apart when open
      const R = open ? 34 + Math.min(10, this.t) : 27;
      for (let i = 0; i < 8; i++) {
        const a = this.spin + (i / 8) * Math.PI * 2;
        const sx = x + Math.cos(a) * R, sy = cy + Math.sin(a) * R;
        p.circle(sx, sy, 5, C.ink); p.circle(sx, sy, 4, open ? '#5a5f78' : rage ? C.orange : C.cyan);
        p.rect(sx - 1, sy - 1, 2, 2, '#ffffff');
      }
      if (G.DEBUG) { const hb = this.hurtbox(); if (hb) { ctx.strokeStyle = '#ff0'; ctx.strokeRect(hb.x + 0.5, hb.y + 0.5, hb.w, hb.h); } }
    }
  }

  G.Boss = Boss;
  G.BossTypes = { chad: Chad, rack: Rack, spag: Spag, nexus: Nexus };
})();
