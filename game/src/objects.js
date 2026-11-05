// objects.js: everything in a level that is not the player or an enemy.
'use strict';
(() => {
  const U = G.u, C = G.C;

  // ---- projectiles (enemy shots; some can be punched out of the air) ------------------------
  class Projectile {
    constructor(x, y, o) {
      Object.assign(this, { x, y, vx: 0, vy: 0, g: 0, dmg: 6, life: 300, bounce: 0, hittable: false, knock: false, z: 4 }, o);
      this.w = this.w || Math.max(6, Math.round(this.spr.width * 0.6));
      this.h = this.h || Math.max(6, Math.round(this.spr.height * 0.6));
      this.t = 0;
    }
    hurtbox() { return this.hittable ? { x: this.x - this.w / 2 - 2, y: this.y - this.h / 2 - 2, w: this.w + 4, h: this.h + 4 } : null; }
    takeHit(hit, w) {
      this.dead = true; w.fx.spark(this.x, this.y, false); w.fx.burst(this.x, this.y, 6, ['#ffffff', C.yellow], 2);
      G.Audio.sfx('punch'); w.addScore(10, this.x, this.y - 8);
      return true;
    }
    update(w) {
      this.t++;
      this.x += this.vx; this.y += this.vy; this.vy += this.g;
      if (--this.life <= 0) { this.dead = true; return; }
      const p = w.player;
      if (U.overlap({ x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }, p.hurtbox())) {
        if (p.takeHit({ dmg: this.dmg, kb: 2, kby: -3, knock: this.knock, dir: Math.sign(this.vx) || 1, from: this }, w)) {
          this.dead = true; w.fx.spark(this.x, this.y, false); return;
        }
      }
      const L = w.level, c = Math.floor(this.x / G.TS), r = Math.floor((this.y + this.h / 2) / G.TS);
      const t = L.get(c, r);
      if (t === 1 || (t === 2 && this.vy > 0) || ((t === 3 || t === 4) && this.y + this.h / 2 > L.slopeY(t, c, r, this.x))) {
        if (this.bounce > 0 && this.vy > 0) { this.vy = -Math.abs(this.vy) * 0.75; this.bounce--; this.y -= 2; }
        else if (!this.noWall) { this.dead = true; w.fx.burst(this.x, this.y, 5, ['#ffffff', '#a0a0b0'], 1.5); }
      }
      if (this.y > L.h + 40 || this.x < w.cam.x - 80 || this.x > w.cam.x + G.W + 80) this.dead = true;
    }
    draw(ctx) {
      if (this.spin || this.rot !== undefined) {
        ctx.save(); ctx.translate(Math.round(this.x), Math.round(this.y));
        ctx.rotate(this.spin ? Math.floor(this.t / 4) * (Math.PI / 2) : this.rot);
        ctx.drawImage(this.spr, -this.spr.ox, -this.spr.oy); ctx.restore();
      } else G.Gfx.draw(ctx, this.spr, this.x, this.y);
    }
  }

  // ---- pickups ---------------------------------------------------------------------------
  const PICKUP = {
    coffee: (w, p) => { p.hp = Math.min(p.maxHp, p.hp + 25); G.Audio.sfx('heal'); w.fx.text(p.x, p.y - 50, '+25 HP', C.green); p.say('coffee'); },
    energy: (w, p) => { p.hp = Math.min(p.maxHp, p.hp + 15); p.overclock = 600; p.meter = Math.min(100, p.meter + 30); G.Audio.sfx('pickup'); w.fx.text(p.x, p.y - 50, 'OVERCLOCK!', C.lime); },
    patch: (w, p) => { p.hp = p.maxHp; G.Audio.sfx('heal'); w.fx.text(p.x, p.y - 50, 'PATCHED! HP FULL', C.cyan); },
    oneup: (w, p) => { G.session.lives++; G.Audio.sfx('oneup'); w.fx.text(p.x, p.y - 50, '1UP!', C.gold); },
    bit: (w, p) => {
      G.Audio.sfx('bit'); G.session.bits++; w.addScore(10);
      if (G.session.bits % 100 === 0) { G.session.lives++; G.Audio.sfx('oneup'); w.fx.text(p.x, p.y - 50, '100 BITS! 1UP!', C.gold); }
    },
  };
  class Pickup {
    constructor(x, y, kind, o = {}) {
      this.x = x; this.y = y; this.kind = kind; this.z = 1; this.t = U.randi(0, 60);
      this.vx = o.vx || 0; this.vy = o.vy || 0; this.dropped = !!o.dropped; this.life = o.dropped ? 600 : Infinity;
      this.w = 12; this.h = 12; this.onGround = !o.dropped; this.float = !o.dropped && kind === 'bit';
    }
    update(w) {
      this.t++;
      if (--this.life <= 0) { this.dead = true; return; }
      if (!this.onGround && !this.float) { this.vy = Math.min(this.vy + G.GRAV * 0.8, 6); w.level.move(this, w.plats); this.vx *= 0.97; }
      if (this.onGround) this.vx = 0;
      if (this.y > w.level.h + 40) this.dead = true;
      const p = w.player;
      if (p.state === 'dead' || this.t < 10 && this.dropped) return;
      const hb = p.hurtbox();
      if (U.overlap({ x: this.x - 7, y: this.y - 13, w: 14, h: 14 }, hb)) {
        this.dead = true; PICKUP[this.kind](w, p);
        if (this.kind !== 'bit') w.addScore(100);
        w.fx.burst(this.x, this.y - 6, this.kind === 'bit' ? 4 : 10, ['#ffffff', C.yellow, C.cyan], 1.8, { g: 0 });
      }
    }
    draw(ctx) {
      if (this.life < 120 && (this.t >> 2) % 2) return;
      const bob = this.onGround || this.float ? Math.round(Math.sin(this.t / 12) * 1.5) : 0;
      const spr = this.kind === 'bit' ? G.Art.items.bit(Math.floor(this.t / 6) % 4) : G.Art.items[this.kind]();
      G.Gfx.draw(ctx, spr, this.x, this.y - 1 + bob);
      if (this.kind === 'coffee' && this.t % 20 < 10) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(Math.round(this.x) - 1 + ((this.t / 10) % 2 | 0), Math.round(this.y) - 20 + bob, 1, 3); }
    }
  }
  // random drop table for breakables and some enemies
  function randomDrop() {
    const r = Math.random();
    return r < 0.36 ? 'coffee' : r < 0.46 ? 'energy' : r < 0.5 ? 'patch' : 'bits';
  }
  function dropAt(w, x, y, kind) {
    kind = kind || randomDrop();
    if (kind === 'bits') { for (let i = 0; i < 5; i++) w.add(new Pickup(x, y - 6, 'bit', { dropped: true, vx: U.rand(-1.6, 1.6), vy: U.rand(-4, -2) })); }
    else w.add(new Pickup(x, y - 6, kind, { dropped: true, vy: -3.5 }));
  }

  // ---- breakable props ---------------------------------------------------------------------
  const BREAK_SPR = { office: ['crate', 'cooler'], servers: ['server', 'crate'], cloud: ['cube'], core: ['server'] };
  class Breakable {
    constructor(x, y, theme, drop) {
      const list = BREAK_SPR[theme] || ['crate'];
      this.sprName = list[Math.floor(U.hash(x, y) * list.length)];
      this.x = x; this.y = y; this.z = 1; this.breakable = true; this.drop = drop;
      const s = G.Art.items[this.sprName]();
      this.w = s.width - 4; this.h = s.height - 2;
    }
    hurtbox() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
    takeHit(hit, w) {
      this.dead = true; G.Audio.sfx('crate');
      w.fx.burst(this.x, this.y - this.h / 2, 16, this.sprName === 'crate' ? ['#c8904a', '#9a6a32', '#e8d098'] : ['#e8e8f0', '#7ad0ff', '#5a6078', C.purple], 3);
      w.addScore(50, this.x, this.y - this.h - 4);
      dropAt(w, this.x, this.y - 4, this.drop);
      return true;
    }
    update() {}
    draw(ctx) { G.Gfx.draw(ctx, G.Art.items[this.sprName](), this.x, this.y); }
  }

  // ---- traversal gadgets ---------------------------------------------------------------------
  class Spring {
    constructor(x, y) { this.x = x; this.y = y; this.z = 1; this.t = 99; }
    update(w) {
      this.t++;
      const p = w.player;
      if (p.vy >= 0 && Math.abs(p.x - this.x) < 11 && p.y >= this.y - 14 && p.y <= this.y + 2 && p.state !== 'dead' && this.t > 10) {
        p.vy = -11.5; p.y = this.y - 12; p.onGround = false; p.platform = null; p.jumping = false; p.airDash = true; p.airAtk = true;
        if (p.state === 'attack' || p.state === 'dash') p.setState('normal');
        this.t = 0; G.Audio.sfx('spring'); w.fx.dust(this.x, this.y - 8, 0, 4);
      }
    }
    draw(ctx) { G.Gfx.draw(ctx, G.Art.items.spring(this.t < 8 ? 1 : 0), this.x, this.y); }
  }

  class Boost {
    constructor(x, y, dir) { this.x = x; this.y = y; this.dir = dir; this.z = 0; this.cd = 0; }
    update(w) {
      if (this.cd > 0) this.cd--;
      const p = w.player;
      if (p.onGround && Math.abs(p.x - this.x) < 10 && Math.abs(p.y - this.y) < 4 && p.state !== 'dead') {
        p.vx = this.dir * 7.6; p.face = this.dir; p.runT = 99; p.sprint = true;
        if (p.state === 'attack') p.setState('normal');
        if (!this.cd) { G.Audio.sfx('boost'); this.cd = 20; w.fx.dust(p.x, p.y, this.dir, 4); }
      }
    }
    draw(ctx) { G.Gfx.draw(ctx, G.Art.items.boost(Math.floor(G.frame / 5) % 3), this.x, this.y, this.dir < 0); }
  }

  class MovingPlatform {
    constructor(x, y, mode, theme) {
      this.bx = x; this.by = y - 12; this.x = x; this.y = this.by; this.mode = mode; this.theme = theme;
      this.w = 48; this.isPlat = true; this.z = 1; this.dx = 0; this.dy = 0;
      this.range = mode === 'V' ? 56 : 64; this.period = 260; this.phase = U.hash(x, y) * 6;
    }
    update(w) {
      const t = (w.time / this.period) * Math.PI * 2 + this.phase;
      const nx = this.mode === 'H' ? this.bx + Math.sin(t) * this.range : this.bx;
      const ny = this.mode === 'V' ? this.by - (Math.sin(t) * 0.5 + 0.5) * this.range * 1.6 : this.by;
      this.dx = nx - this.x; this.dy = ny - this.y; this.x = nx; this.y = ny;
    }
    draw(ctx) { G.Gfx.draw(ctx, G.Art.items.platform(this.theme), this.x, this.y); }
  }

  class Crumble {
    constructor(x, y) { this.x = x; this.y = y - 16; this.w = 16; this.isPlat = true; this.z = 1; this.state = 'idle'; this.t = 0; this.dx = 0; this.dy = 0; this.by = this.y; }
    update(w) {
      this.t++;
      const p = w.player;
      if (this.state === 'idle' && p.platform === this) { this.state = 'shake'; this.t = 0; G.Audio.sfx('crumble'); }
      else if (this.state === 'shake' && this.t > 26) { this.state = 'fall'; this.t = 0; this.off = true; w.fx.burst(this.x, this.y + 8, 8, [C.purple, C.purpleD, C.magenta], 2); }
      else if (this.state === 'fall' && this.t > 200) { this.state = 'idle'; this.off = false; this.y = this.by; }
      if (this.state === 'fall') this.y = this.by + this.t * this.t * 0.05;
    }
    draw(ctx) {
      if (this.state === 'fall' && this.t > 40) return;
      const sx = this.state === 'shake' ? (G.frame % 2 ? 1 : -1) : 0;
      G.Gfx.draw(ctx, G.Art.items.crumble(this.state === 'idle' ? 0 : 1), this.x + sx, this.y + 16);
    }
  }

  class Fan {
    constructor(x, y) { this.x = x; this.y = y; this.z = 0; }
    update(w) {
      const p = w.player;
      if (Math.abs(p.x - this.x) < 18 && p.y <= this.y + 2 && p.y > this.y - 150 && p.state !== 'dead') {
        p.vy = Math.max(p.vy - 0.78, -4.8);
        if (p.vy < 0) { p.onGround = false; p.platform = null; }
        p.airDash = true;
      }
    }
    draw(ctx) {
      ctx.fillStyle = 'rgba(200,240,255,0.5)';
      for (let i = 0; i < 6; i++) {
        const yy = this.y - ((G.frame * 3 + i * 27) % 150);
        ctx.fillRect(Math.round(this.x - 14 + ((i * 11) % 28)), Math.round(yy), 1, 8);
      }
      G.Gfx.draw(ctx, G.Art.items.fan(), this.x, this.y);
    }
  }

  class Checkpoint {
    constructor(x, y, index) { this.x = x; this.y = y; this.index = index; this.on = false; this.z = 0; }
    update(w) {
      if (!this.on && w.player.x > this.x - 6 && w.player.state !== 'dead') {
        this.on = true; G.Audio.sfx('checkpoint'); w.fx.text(this.x, this.y - 40, 'AUTOSAVED', C.green, 70);
        w.setCheckpoint(this);
      }
    }
    draw(ctx) { G.Gfx.draw(ctx, G.Art.items.terminal(this.on ? 1 : 0), this.x, this.y); }
  }

  // ---- friendly NPCs ---------------------------------------------------------------------
  class NPC {
    constructor(x, y, def) { this.x = x; this.y = y; this.def = def; this.z = 0; this.face = -1; this.talked = false; }
    update(w) {
      const p = w.player;
      this.face = Math.sign(p.x - this.x) || this.face;
      if (!this.talked && Math.abs(p.x - this.x) < 46 && p.onGround && p.state === 'normal' && !w.lock) {
        this.talked = true;
        w.startDialog(this.def.lines, () => {
          if (this.def.gift) { dropAt(w, this.x + this.face * 10, this.y - 10, this.def.gift); }
        });
      }
    }
    draw(ctx) {
      const pose = Math.floor(G.frame / 40) % 2 ? 'stand1' : 'stand';
      G.Gfx.draw(ctx, G.Art.body(this.def.who, pose), this.x, this.y + 1, this.face < 0);
      if (!this.talked) {
        const by = Math.round(this.y - 58 + Math.sin(G.frame / 8) * 2);
        ctx.fillStyle = G.C.ink; ctx.fillRect(Math.round(this.x) - 5, by - 1, 11, 13);
        ctx.fillStyle = G.C.yellow; ctx.fillRect(Math.round(this.x) - 4, by, 9, 11);
        G.Font.draw(ctx, '!', this.x - 2, by + 2, G.C.ink);
      }
    }
  }

  // ---- boss hazards -------------------------------------------------------------------------
  // a wave that runs along the floor (jump over it)
  class Shockwave {
    constructor(x, y, dir, o = {}) { this.x = x; this.y = y; this.dir = dir; this.life = o.life || 80; this.speed = o.speed || 3.4; this.dmg = o.dmg || 10; this.col = o.col || C.orange; this.z = 4; this.t = 0; }
    update(w) {
      this.t++; this.x += this.dir * this.speed;
      if (--this.life <= 0 || w.level.solid(Math.floor(this.x / G.TS), Math.floor((this.y - 4) / G.TS))) { this.dead = true; return; }
      const gy = w.level.groundAt(this.x, this.y - 20, 40);
      if (gy !== null) this.y = gy;
      if (U.overlap({ x: this.x - 6, y: this.y - 14, w: 12, h: 14 }, w.player.hurtbox()))
        w.player.takeHit({ dmg: this.dmg, kb: 2.5, kby: -4, knock: true, dir: this.dir, from: this }, w);
      if (this.t % 3 === 0) w.fx.dust(this.x, this.y, this.dir, 1);
    }
    draw(ctx) {
      const x = Math.round(this.x), y = Math.round(this.y);
      for (let i = 0; i < 4; i++) {
        const hh = 14 - i * 3 + (G.frame % 3);
        ctx.fillStyle = i % 2 ? '#ffffff' : this.col;
        ctx.fillRect(x - this.dir * i * 3 - 2, y - hh, 4, hh);
      }
    }
  }

  // something that falls from the top of the screen after a warning marker
  class FallingHazard {
    constructor(x, w, o = {}) {
      this.x = x; this.gy = w.level.groundAt(x, w.cam.y + 20, 400) ?? (w.cam.y + G.H - 32);
      this.y = w.cam.y - 20; this.vy = 0; this.t = 0; this.warn = o.warn || 45; this.dmg = o.dmg || 10; this.spr = o.spr || G.Art.proj.drive(); this.z = 4;
    }
    update(w) {
      this.t++;
      if (this.t < this.warn) return;
      this.vy = Math.min(this.vy + 0.45, 9); this.y += this.vy;
      if (U.overlap({ x: this.x - 7, y: this.y - 12, w: 14, h: 12 }, w.player.hurtbox()))
        w.player.takeHit({ dmg: this.dmg, kb: 2, kby: -3, dir: Math.sign(w.player.x - this.x) || 1, from: this }, w);
      if (this.y >= this.gy) {
        this.dead = true; G.Audio.sfx('crate'); w.shake(2);
        w.fx.burst(this.x, this.gy - 4, 12, ['#c8ccd8', '#8a90a8', C.green], 3);
      }
    }
    draw(ctx) {
      if (this.t < this.warn) {
        if ((this.t >> 2) % 2) { ctx.fillStyle = C.red; ctx.fillRect(Math.round(this.x) - 8, Math.round(this.gy) - 2, 16, 2); ctx.fillRect(Math.round(this.x) - 1, Math.round(this.gy) - 10, 2, 6); }
        return;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(Math.round(this.x) - 7, Math.round(this.gy) - 2, 14, 2);
      G.Gfx.draw(ctx, this.spr, this.x, this.y);
    }
  }

  // a beam: warning line, then a damaging bar (horizontal: y = center line; vertical: x)
  class Beam {
    constructor(o) { Object.assign(this, { warn: 40, on: 40, dmg: 12, thick: 10, col: C.red, z: 4, t: 0 }, o); }
    update(w) {
      this.t++;
      if (this.t > this.warn + this.on) { this.dead = true; return; }
      if (this.t === this.warn) { G.Audio.sfx('laser'); w.shake(3); }
      if (this.t >= this.warn) {
        const box = this.vertical ? { x: this.x - this.thick / 2, y: this.y0, w: this.thick, h: this.y1 - this.y0 }
          : { x: this.x0, y: this.y - this.thick / 2, w: this.x1 - this.x0, h: this.thick };
        if (U.overlap(box, w.player.hurtbox())) w.player.takeHit({ dmg: this.dmg, kb: 2.5, kby: -4, knock: true, dir: Math.sign(w.player.x - (this.srcX ?? w.player.x - 1)) || 1, from: this }, w);
      }
    }
    draw(ctx) {
      const active = this.t >= this.warn;
      const th = active ? this.thick + ((G.frame % 2) ? 2 : 0) : 1;
      if (!active && (this.t >> 2) % 2) return;
      ctx.fillStyle = active ? this.col : 'rgba(255,80,80,0.8)';
      if (this.vertical) ctx.fillRect(Math.round(this.x - th / 2), this.y0, th, this.y1 - this.y0);
      else ctx.fillRect(this.x0, Math.round(this.y - th / 2), this.x1 - this.x0, th);
      if (active) {
        ctx.fillStyle = '#ffffff';
        if (this.vertical) ctx.fillRect(Math.round(this.x - th / 4), this.y0, Math.max(1, th / 2 | 0), this.y1 - this.y0);
        else ctx.fillRect(this.x0, Math.round(this.y - th / 4), this.x1 - this.x0, Math.max(1, th / 2 | 0));
      }
    }
  }

  // a noodle/code tentacle that bursts out of the floor
  class Tentacle {
    constructor(x, y, o = {}) { this.x = x; this.y = y; this.t = 0; this.warn = o.warn || 40; this.dmg = o.dmg || 11; this.hmax = o.h || 70; this.z = 4; this.col = o.col || '#ffd24a'; }
    update(w) {
      this.t++;
      const up = this.t - this.warn;
      if (up > 50) { this.dead = true; return; }
      if (up === 0) { G.Audio.sfx('crumble'); w.shake(2); }
      this.hh = up < 0 ? 0 : up < 8 ? this.hmax * up / 8 : up < 36 ? this.hmax : this.hmax * (50 - up) / 14;
      if (this.hh > 10 && U.overlap({ x: this.x - 6, y: this.y - this.hh, w: 12, h: this.hh }, w.player.hurtbox()))
        w.player.takeHit({ dmg: this.dmg, kb: 2, kby: -5, knock: true, dir: Math.sign(w.player.x - this.x) || 1, from: this }, w);
    }
    draw(ctx) {
      const x = Math.round(this.x), y = Math.round(this.y);
      if (this.t < this.warn) {
        if ((this.t >> 1) % 2) { ctx.fillStyle = C.magenta; for (let i = -8; i < 8; i += 3) ctx.fillRect(x + i, y - 2 - ((i * 7 + G.frame) % 4), 2, 2); }
        return;
      }
      for (let i = 0; i < this.hh; i += 2) {
        const off = Math.round(Math.sin(i / 6 + G.frame / 4) * 3);
        ctx.fillStyle = C.ink; ctx.fillRect(x - 5 + off, y - i - 2, 10, 2);
        ctx.fillStyle = i % 6 < 2 ? '#d8901a' : this.col; ctx.fillRect(x - 4 + off, y - i - 2, 8, 2);
      }
    }
  }

  Object.assign(G, { Projectile, Pickup, Breakable, Spring, Boost, MovingPlatform, Crumble, Fan, Checkpoint, NPC, Shockwave, FallingHazard, Beam, Tentacle, dropAt });
})();
