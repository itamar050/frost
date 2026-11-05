// enemies.js: the Enemy base class (shared hit reactions, knockdown, grab, throw, death)
// and the regular enemy types. Register new types in G.EnemyTypes (see README.md).
'use strict';
(() => {
  const U = G.u;

  class Enemy {
    constructor(x, y, o = {}) {
      this.x = x; this.y = y; this.w = o.w || 14; this.h = o.h || 36;
      this.vx = 0; this.vy = 0; this.face = -1; this.onGround = false;
      this.hp = this.maxHp = o.hp || 10;
      this.name = o.name || 'BUG';
      this.state = 'idle'; this.t = 0; this.flash = 0; this.inv = 0; this.atkCd = 40 + Math.random() * 40;
      this.isEnemy = true; this.team = 'enemy'; this.z = 2; this.active = false;
      this.score = o.score || 100; this.style = o.style;
      this.grabbable = o.grabbable !== false; this.stompable = o.stompable !== false;
      this.gravity = true; this.kbMul = o.kbMul || 1; this.dying = false; this.speed = o.speed || 1;
      this.contact = 0; // contact damage (blobs)
      this.poses = {};
    }

    setState(s) { this.state = s; this.t = 0; }
    hurtbox() {
      if (this.state === 'dead' || this.state === 'down' || this.state === 'getup' || !this.active) return null;
      return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }

    // wakes up when it comes near the screen
    wake(w) {
      if (this.active) return true;
      if (this.inArena || Math.abs(this.x - (w.cam.x + G.W / 2)) < G.W / 2 + 24) { this.active = true; if (this.onWake) this.onWake(w); }
      return this.active;
    }

    update(w) {
      if (!this.wake(w)) return;
      this.t++;
      if (this.flash > 0) this.flash--;
      if (this.inv > 0) this.inv--;
      if (this.atkCd > 0) this.atkCd--;
      const common = this['c_' + this.state];
      if (common) common.call(this, w); else this.ai(w);
      if (this.state !== 'held') {
        if (this.gravity) this.vy = Math.min(this.vy + G.GRAV, G.MAXFALL);
        if (this.noClip) { this.x += this.vx; this.y += this.vy; } else w.level.move(this, w.plats);
      }
      if (this.inArena) {
        if (this.x > w.cam.x + 12 && this.x < w.cam.x + G.W - 12) this.entered = true;
        if (this.entered) this.x = U.clamp(this.x, w.cam.x + 10, w.cam.x + G.W - 10);
      }
      if (this.y > w.level.h + 64) { this.dead = true; if (this.hp > 0) w.onEnemyGone(this); }
      // contact damage
      if (this.contact && !this.dying && this.state !== 'hurt' && this.state !== 'downAir' && this.state !== 'held' && this.state !== 'thrown') {
        const p = w.player, hb = this.hurtbox();
        if (hb && U.overlap(hb, p.hurtbox())) p.takeHit({ dmg: this.contact, kb: 2, dir: Math.sign(p.x - this.x) || 1, from: this }, w);
      }
    }

    ai() {}

    // helpers for AI
    dist(w) { return w.player.x - this.x; }
    ledge(w, dir) {
      if (this.inArena) return false;
      return w.level.groundAt(this.x + dir * (this.w / 2 + 3), this.y - 6, 30) === null;
    }
    // how many allies are between me and the player on my side (for spacing)
    crowd(w) {
      const p = w.player, side = Math.sign(this.x - p.x) || 1, my = Math.abs(this.x - p.x);
      let n = 0;
      for (const e of w.enemies) {
        if (e === this || !e.active || e.dying || e.isBoss || e.flying) continue;
        if (Math.sign(e.x - p.x) === side && Math.abs(e.x - p.x) < my && Math.abs(e.y - this.y) < 24) n++;
      }
      return n;
    }
    hitPlayer(w, box, hit) {
      const p = w.player;
      if (U.overlap(box, p.hurtbox())) return p.takeHit(Object.assign({ from: this, dir: this.face }, hit), w);
      return false;
    }
    front(ox, oy, bw, bh) {
      return { x: this.face > 0 ? this.x + ox : this.x - ox - bw, y: this.y + oy, w: bw, h: bh };
    }

    // ---- shared reactions ----------------------------------------------------------------
    takeHit(hit, w) {
      if (!this.active || this.state === 'dead' || this.state === 'down' || this.state === 'getup' || this.inv > 0) return false;
      if (this.dying && this.state !== 'downAir' && this.state !== 'thrown') return false;
      if (this.guard && this.guard(hit, w)) return 'block';
      this.hp -= hit.dmg; this.flash = 6;
      w.showEnemy(this);
      if (this.state === 'held' && hit.grabHit && this.hp > 0) return true;
      if (this.state === 'held') this.holder = null;
      if (hit.dir) this.face = -hit.dir;
      const kb = (hit.kb || 1) * this.kbMul;
      if (this.hp <= 0) {
        this.hp = 0; this.dying = true; this.bounced = false;
        this.setState('downAir'); this.onGround = false; this.gravity = true;
        this.vx = (hit.dir || 1) * Math.max(2.5, kb); this.vy = Math.min(hit.kby || 0, -3.5);
        w.onEnemyKO(this);
        return true;
      }
      if (this.onHurt && this.onHurt(hit, w)) return true;
      if (hit.knock || this.state === 'downAir' || this.state === 'thrown' || !this.onGround) {
        this.setState('downAir'); this.bounced = false; this.onGround = false;
        this.vx = (hit.dir || 1) * kb; this.vy = Math.min(hit.kby || -2.4, -2);
      } else {
        this.setState('hurt'); this.stunT = hit.stun || 16; this.vx = (hit.dir || 1) * kb;
      }
      return true;
    }

    c_hurt() { this.vx = U.approach(this.vx, 0, 0.2); if (this.t >= this.stunT) { this.setState('idle'); this.atkCd = Math.max(this.atkCd, 16); } }
    c_downAir(w) {
      if (this.onGround && this.t > 2) {
        if ((this.landV || 0) > 3 && !this.bounced) {
          this.bounced = true; this.vy = -2.2; this.onGround = false; this.vx *= 0.6;
          w.fx.dust(this.x, this.y, 0, 4); G.Audio.sfx('land'); w.shake(1);
        } else { this.vx = 0; this.setState(this.dying ? 'dead' : 'down'); }
      }
    }
    c_down() { this.vx = U.approach(this.vx, 0, 0.3); if (this.t >= 40) this.setState('getup'); }
    c_getup() { if (this.t >= 16) { this.setState('idle'); this.atkCd = 30; } }
    c_held(w) { this.vx = 0; this.vy = 0; if (this.t > 110 || !this.holder || this.holder.grabbed !== this) this.release(); }
    c_thrown(w) {
      for (const e of w.enemies) {
        if (e === this || this.hitSet.has(e) || !e.active || e.isBoss && e.state !== 'idle') continue;
        const hb = e.hurtbox(), mb = this.hurtbox();
        if (hb && mb && U.overlap(hb, mb)) {
          this.hitSet.add(e);
          if (e.takeHit({ dmg: 8, kb: 3, kby: -3, dir: Math.sign(this.vx) || 1, knock: true, stun: 30, from: this }, w)) {
            w.fx.spark(e.x, e.y - 20, true); G.Audio.sfx('heavy'); w.registerHit(8);
          }
        }
      }
      if (this.onGround && this.t > 3) {
        this.hp -= 10; this.flash = 6; w.shake(4); G.Audio.sfx('heavy'); w.fx.dust(this.x, this.y, 0, 6);
        w.registerHit(10); w.showEnemy(this);
        if (this.hp <= 0) { this.hp = 0; this.dying = true; w.onEnemyKO(this); }
        this.setState('downAir'); this.bounced = false; this.vy = -2.5; this.onGround = false; this.vx *= 0.5;
      }
    }
    c_dead(w) {
      this.vx = 0;
      if (this.t === 1) G.Audio.sfx('enemyDie');
      if (this.t >= 36) {
        this.dead = true;
        w.fx.bits(this.x, this.y - this.h / 2, 12, this.bitColor || G.C.green);
        w.fx.burst(this.x, this.y - this.h / 2, 10, this.debris || ['#a3abc4', '#5d657e', G.C.magenta], 2.5);
        w.addScore(this.score, this.x, this.y - this.h - 6);
        if (this.onDeath) this.onDeath(w);
        w.onEnemyGone(this);
      }
    }

    setHeld(holder) { this.holder = holder; this.setState('held'); this.vx = 0; this.vy = 0; }
    release() { this.holder = null; this.setState('hurt'); this.stunT = 8; }
    thrown(dir, w) {
      this.holder = null; this.setState('thrown'); this.hitSet = new Set();
      this.vx = dir * 4.6; this.vy = -4.6; this.onGround = false; this.face = -dir;
    }

    // ---- drawing -------------------------------------------------------------------------
    anim() {
      const s = this.state;
      if (this.poses[s]) return typeof this.poses[s] === 'function' ? this.poses[s].call(this) : this.poses[s];
      if (s === 'walk') return 'walk' + (Math.floor(G.frame / 6) % 8);
      if (s === 'hurt') return 'hurt';
      if (s === 'downAir' || s === 'thrown') return 'downAir';
      if (s === 'down' || s === 'dead') return 'down';
      if (s === 'getup') return 'getup';
      if (s === 'held') return 'held';
      return 'idle' + (Math.floor((G.frame + this.x) / 30) % 2);
    }
    sprite() { return G.Art.body(this.style, this.anim()); }
    draw(ctx) {
      if (!this.active) return;
      if (this.state === 'dead' && (this.t >> 1) % 2) return;
      let spr = this.sprite();
      if (this.flash > 0) spr = G.Gfx.tinted(spr, '#ffffff');
      else if (this.telegraph && (G.frame >> 1) % 2) spr = G.Gfx.tinted(spr, '#ff5050');
      G.Gfx.draw(ctx, spr, this.x, this.y + 1, this.face < 0);
      if (G.DEBUG) { const hb = this.hurtbox(); if (hb) { ctx.strokeStyle = '#ff0'; ctx.strokeRect(hb.x + 0.5, hb.y + 0.5, hb.w, hb.h); } }
    }
  }

  // ---- GLITCHBOT: basic brawler -------------------------------------------------------------
  class Bot extends Enemy {
    constructor(x, y) {
      super(x, y, { hp: 16, name: 'GLITCHBOT', style: 'bot', score: 100, speed: 0.95 });
      this.poses = { windup: 'windup', attack: 'punch', recover: 'punch' };
      this.debris = ['#a3abc4', '#5d657e', G.C.magenta]; this.bitColor = G.C.magenta;
    }
    ai(w) {
      const p = w.player, d = this.dist(w), ad = Math.abs(d);
      this.telegraph = false;
      switch (this.state) {
        case 'idle': case 'walk': {
          if (p.state === 'dead') { this.vx = U.approach(this.vx, 0, 0.2); this.state = 'idle'; break; }
          this.face = Math.sign(d) || this.face;
          const crowd = this.crowd(w), want = 22 + crowd * 28;
          if (ad > want + 4) {
            if (this.ledge(w, this.face)) { this.vx = 0; this.state = 'idle'; }
            else { this.vx = U.approach(this.vx, this.face * this.speed, 0.15); this.state = 'walk'; }
          } else if (ad < want - 12) { this.vx = U.approach(this.vx, -this.face * this.speed * 0.6, 0.15); this.state = 'walk'; }
          else { this.vx = U.approach(this.vx, 0, 0.3); this.state = 'idle'; }
          if (ad < 32 && Math.abs(p.y - this.y) < 18 && this.atkCd <= 0 && crowd === 0) { this.setState('windup'); this.vx = 0; }
          break;
        }
        case 'windup': this.vx = 0; this.telegraph = this.t > 12; if (this.t >= 20) { this.setState('attack'); this.vx = this.face * 1.5; } break;
        case 'attack':
          this.vx = U.approach(this.vx, 0, 0.2);
          if (this.t <= 6 && !this.hitDone) { if (this.hitPlayer(w, this.front(2, -32, 20, 12), { dmg: 7, kb: 2 })) this.hitDone = true; }
          if (this.t >= 8) { this.setState('recover'); this.hitDone = false; }
          break;
        case 'recover': if (this.t >= 26) { this.setState('idle'); this.atkCd = U.randi(40, 90); } break;
      }
    }
    draw(ctx) {
      super.draw(ctx);
      // occasional glitch flicker
      if (this.active && !this.dying && (Math.floor(G.frame / 4) + Math.floor(this.x)) % 23 === 0) {
        G.Gfx.draw(ctx, G.Gfx.tinted(this.sprite(), G.C.magenta), this.x + 3, this.y + 1, this.face < 0, 0.5);
      }
    }
  }

  // ---- VIRUS BLOB: hopping contact damage, splits in two ------------------------------------
  class Blob extends Enemy {
    constructor(x, y, mini) {
      super(x, y, { hp: mini ? 4 : 9, name: mini ? 'MINI VIRUS' : 'VIRUS BLOB', score: mini ? 50 : 120, w: mini ? 10 : 18, h: mini ? 10 : 16, grabbable: false, kbMul: 1.2 });
      this.mini = mini; this.contact = mini ? 4 : 6; this.hopT = U.randi(20, 60); this.squash = 0;
      this.debris = [G.C.green, G.C.greenD, G.C.lime]; this.bitColor = G.C.lime;
    }
    ai(w) {
      const d = this.dist(w);
      if (this.onGround) {
        this.vx = U.approach(this.vx, 0, 0.3);
        if (this.squash > 0) this.squash--;
        if (--this.hopT <= 0 && w.player.state !== 'dead') {
          this.face = Math.sign(d) || this.face;
          if (!this.ledge(w, this.face) || Math.abs(d) < 40) {
            this.vx = this.face * (this.mini ? 1.8 : 1.5) * U.rand(0.8, 1.2);
            this.vy = this.mini ? -3.8 : -4.6; this.onGround = false;
          }
          this.hopT = U.randi(this.mini ? 25 : 40, this.mini ? 45 : 75);
        }
      }
      if (this.justLanded) this.squash = 6;
    }
    onDeath(w) {
      if (this.mini) return;
      for (const s of [-1, 1]) {
        const b = new Blob(this.x + s * 6, this.y - 2, true);
        b.active = true; b.inArena = this.inArena; b.entered = true; b.vx = s * 1.5; b.vy = -3; b.arena = this.arena;
        w.addEnemy(b);
      }
    }
    sprite() {
      let f = Math.floor((G.frame + this.x) / 15) % 2;
      if (!this.onGround) f = 2; else if (this.squash > 0) f = 3;
      if (this.state === 'down' || this.state === 'dead') f = 3;
      return G.Art.blob(f, this.mini);
    }
  }

  // ---- MIDDLE MANAGER: keeps distance, throws memos, shoves --------------------------------
  const MANAGER_LINES = ['PER MY LAST EMAIL!', "LET'S TAKE THIS OFFLINE!", 'NEW PRIORITIES!', 'QUICK SYNC?', 'IS THIS BILLABLE?'];
  class Manager extends Enemy {
    constructor(x, y) {
      super(x, y, { hp: 26, name: 'MIDDLE MANAGER', style: 'manager', score: 200, speed: 0.75 });
      this.poses = { throwW: 'throwW', throwR: 'throwR', windup: 'windup', charge: 'bash', recover: 'stand', walkback: () => 'march' + (Math.floor(G.frame / 7) % 8) };
      this.debris = ['#ffffff', G.C.suit, '#f4b08a']; this.bitColor = '#ffffff';
    }
    onWake(w) { if (Math.random() < 0.6) w.fx.text(this.x, this.y - 50, U.pick(MANAGER_LINES), G.C.yellow, 70); }
    ai(w) {
      const p = w.player, d = this.dist(w), ad = Math.abs(d);
      this.telegraph = false;
      switch (this.state) {
        case 'idle': case 'walk': case 'walkback':
          if (p.state === 'dead') { this.vx = 0; this.state = 'idle'; break; }
          this.face = Math.sign(d) || this.face;
          if (ad < 34 && this.atkCd <= 0) { this.setState('windup'); this.vx = 0; break; }
          if (ad > 120) {
            if (this.ledge(w, this.face)) { this.vx = 0; this.state = 'idle'; }
            else { this.vx = U.approach(this.vx, this.face * this.speed, 0.1); this.state = 'walk'; }
          } else if (ad < 70 && !this.ledge(w, -this.face)) { this.vx = U.approach(this.vx, -this.face * this.speed * 0.8, 0.1); this.state = 'walkback'; }
          else { this.vx = U.approach(this.vx, 0, 0.2); this.state = 'idle'; }
          if (this.atkCd <= 0 && ad < 200 && ad >= 34) { this.setState('throwW'); this.vx = 0; }
          break;
        case 'throwW':
          if (this.t >= 18) {
            const proj = new G.Projectile(this.x + this.face * 8, this.y - 34, { spr: G.Art.proj.memo(), vx: this.face * U.rand(2.4, 3.4), vy: -3.2, g: 0.15, dmg: 6, spin: true, hittable: true });
            w.add(proj); G.Audio.sfx('throw'); this.setState('throwR');
          }
          break;
        case 'throwR': if (this.t >= 14) { this.setState('idle'); this.atkCd = U.randi(70, 120); } break;
        case 'windup': this.telegraph = true; if (this.t >= 18) { this.setState('charge'); this.vx = this.face * 4; } break;
        case 'charge':
          this.vx = U.approach(this.vx, 0, 0.12);
          if (!this.hitDone && this.hitPlayer(w, this.front(0, -34, 18, 30), { dmg: 9, kb: 3, kby: -3, knock: true })) this.hitDone = true;
          if (this.t >= 24) { this.setState('recover'); this.hitDone = false; }
          break;
        case 'recover': this.vx = 0; if (this.t >= 30) { this.setState('idle'); this.atkCd = U.randi(60, 100); } break;
      }
    }
  }

  // ---- SECURITY DRONE: flies, aims, fires lasers ---------------------------------------------
  class Drone extends Enemy {
    constructor(x, y) {
      super(x, y - 40, { hp: 10, name: 'SEC-DRONE', score: 150, w: 18, h: 14, grabbable: false, kbMul: 1.2 });
      this.gravity = false; this.flying = true; this.fireT = U.randi(60, 120); this.side = Math.random() < 0.5 ? -1 : 1; this.noClip = true;
      this.debris = ['#a3abc4', '#5a6078', G.C.red]; this.bitColor = G.C.red;
    }
    ai(w) {
      const p = w.player;
      if (this.state === 'hurt') return;
      if (Math.abs(p.x - this.x) > 110) this.side = Math.sign(this.x - p.x) || 1;
      if (p.onGround || this.pgy === undefined) this.pgy = p.y;
      const tx = p.x + this.side * 56, ty = Math.min(this.pgy - 58, w.level.h - 80) + Math.sin(this.t / 22) * 6;
      const close = Math.abs(p.x - this.x) < 36;
      this.vx = U.approach(this.vx, close ? 0 : U.clamp((tx - this.x) * 0.03, -1.1, 1.1), 0.06);
      this.vy = U.approach(this.vy, U.clamp((ty - (this.y - 7)) * 0.05, -1.4, 1.4), 0.08);
      this.face = Math.sign(p.x - this.x) || 1;
      if (p.state !== 'dead' && --this.fireT <= 0) {
        if (this.fireT === -1) G.Audio.sfx('warn');
        this.aiming = true;
        if (this.fireT <= -36) {
          const ang = Math.atan2((p.y - 18) - (this.y - 2), p.x - this.x);
          w.add(new G.Projectile(this.x, this.y - 2, { spr: G.Art.proj.laser(), vx: Math.cos(ang) * 3.4, vy: Math.sin(ang) * 3.4, dmg: 7, rot: ang }));
          G.Audio.sfx('laser'); this.fireT = U.randi(90, 140); this.aiming = false;
        }
      }
    }
    c_hurt() { this.vx *= 0.9; this.vy *= 0.9; if (this.t >= 14) this.setState('idle'); }
    onHurt(hit) { this.setState('hurt'); this.vx = (hit.dir || 1) * 3; this.vy = hit.kby ? -2 : -0.5; return true; }
    c_downAir(w) {
      this.noClip = false; this.gravity = true;
      if (this.onGround || this.t > 90) {
        this.dead = true; G.Audio.sfx('explode'); w.shake(4);
        w.fx.burst(this.x, this.y - 6, 18, [G.C.orange, G.C.yellow, '#ffffff', '#5a6078'], 3.5);
        w.fx.ring(this.x, this.y - 6, 22, G.C.orange, 14);
        w.addScore(this.score, this.x, this.y - 24); w.onEnemyGone(this);
      }
    }
    hurtbox() { if (!this.active || this.dead) return null; return { x: this.x - 9, y: this.y - 16, w: 18, h: 16 }; }
    sprite() { return G.Art.drone(G.frame % 4 < 2 ? 0 : 1, this.aiming && (G.frame >> 2) % 2); }
    draw(ctx) {
      if (!this.active) return;
      let spr = this.sprite();
      if (this.flash > 0) spr = G.Gfx.tinted(spr, '#ffffff');
      if (this.dying) { ctx.save(); ctx.translate(Math.round(this.x), Math.round(this.y - 6)); ctx.rotate(this.t * 0.3); G.Gfx.draw(ctx, spr, 0, 6, false); ctx.restore(); return; }
      G.Gfx.draw(ctx, spr, this.x, this.y, this.face < 0);
    }
  }

  // ---- FIREWALL BRUTE: shield blocks frontal attacks ------------------------------------------
  class Brute extends Enemy {
    constructor(x, y) {
      super(x, y, { hp: 42, name: 'FIREWALL', style: 'brute', score: 400, speed: 0.55, w: 18, h: 44, kbMul: 0.5 });
      this.poses = { idle: 'shield', walk: () => 'march' + (Math.floor(G.frame / 8) % 8), windup: 'shield', bash: 'bash', recover: 'stun' };
      this.debris = [G.C.orange, '#4a4a5c', G.C.yellow]; this.bitColor = G.C.orange;
    }
    guard(hit) {
      if (hit.breakGuard || !['idle', 'walk', 'windup'].includes(this.state)) return false;
      return hit.dir === -this.face;
    }
    grabbableNow() { return this.state === 'hurt' || this.state === 'recover'; }
    ai(w) {
      const p = w.player, d = this.dist(w), ad = Math.abs(d);
      this.telegraph = false;
      switch (this.state) {
        case 'idle': case 'walk':
          if (p.state === 'dead') { this.vx = 0; this.state = 'idle'; break; }
          if (this.t % 20 === 0) this.face = Math.sign(d) || this.face;
          if (ad > 36) {
            if (this.ledge(w, this.face)) { this.vx = 0; this.state = 'idle'; }
            else { this.vx = U.approach(this.vx, this.face * this.speed, 0.1); this.state = 'walk'; }
          } else { this.vx = 0; this.state = 'idle'; }
          if (ad < 60 && this.atkCd <= 0 && Math.abs(p.y - this.y) < 24) { this.setState('windup'); this.vx = 0; }
          break;
        case 'windup': this.telegraph = this.t > 16; if (this.t >= 30) { this.setState('bash'); this.vx = this.face * 4; G.Audio.sfx('dash'); } break;
        case 'bash':
          this.vx = U.approach(this.vx, 0, 0.1);
          if (!this.hitDone && this.hitPlayer(w, this.front(0, -44, 22, 40), { dmg: 12, kb: 3.5, kby: -4, knock: true })) this.hitDone = true;
          if (this.t >= 26) { this.setState('recover'); this.hitDone = false; }
          break;
        case 'recover': this.vx = 0; if (this.t >= 55) { this.setState('idle'); this.atkCd = U.randi(60, 100); } break;
      }
    }
    draw(ctx) {
      super.draw(ctx);
      if (this.state === 'recover' && this.t < 50) {
        const a = G.frame / 6;
        for (let i = 0; i < 3; i++) { ctx.fillStyle = G.C.yellow; ctx.fillRect(Math.round(this.x + Math.cos(a + i * 2.1) * 10), Math.round(this.y - 58 + Math.sin(a + i * 2.1) * 3), 2, 2); }
      }
    }
  }

  // grab rules shared by every enemy
  Enemy.prototype.canGrab = function () {
    if (!this.grabbable || this.dying || this.isBoss) return false;
    if (this.grabbableNow) return this.grabbableNow();
    return ['idle', 'walk', 'hurt', 'recover', 'walkback'].includes(this.state);
  };

  G.Enemy = Enemy;
  G.EnemyTypes = { bot: Bot, blob: Blob, manager: Manager, drone: Drone, brute: Brute };
})();
