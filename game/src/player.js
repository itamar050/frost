// player.js: Alex "Bug" Voss. Platforming (coyote time, jump buffer, variable jump,
// momentum sprint, dash, drop-through) and beat 'em up combat (4-hit chain, uppercut,
// air kick, dive kick, dash attack, stomp, grab/knee/throw, HOTFIX special).
'use strict';
(() => {
  // Attack table. Frames at 60 Hz. box = [forward offset, top (from feet, negative = up), w, h]
  // act = active frames [from, to], cancel = first frame the next chain hit may start
  const ATK = {
    jab1: { dur: 15, act: [3, 6], cancel: 6, box: [4, -30, 18, 10], dmg: 3, kb: 1.2, stun: 18, next: 'jab2', lunge: 1, pose: ['idle0', 'jab1'], sfx: 'punch' },
    jab2: { dur: 15, act: [3, 6], cancel: 6, box: [4, -30, 18, 10], dmg: 3, kb: 1.2, stun: 18, next: 'hook', lunge: 1, pose: ['idle0', 'jab2'], sfx: 'punch' },
    hook: { dur: 18, act: [4, 7], cancel: 8, box: [4, -32, 20, 12], dmg: 4, kb: 1.6, stun: 22, next: 'kick', lunge: 1.5, pose: ['hookW', 'hook'], sfx: 'punch' },
    kick: { dur: 26, act: [6, 10], box: [2, -24, 24, 12], dmg: 7, kb: 3.6, kby: -3, knock: true, stun: 30, lunge: 2, hitstop: 6, heavy: true, pose: ['kickW', 'kick'], sfx: 'heavy' },
    upper: { dur: 26, act: [4, 11], box: [0, -48, 18, 34], dmg: 7, kb: 1, kby: -7, knock: true, breakGuard: true, stun: 30, lunge: 1, hitstop: 6, heavy: true, pose: ['upW', 'up'], sfx: 'heavy' },
    air: { dur: 32, act: [3, 28], box: [2, -22, 20, 14], dmg: 6, kb: 3, kby: -2, knock: true, stun: 26, air: true, pose: ['jump', 'air'], sfx: 'heavy' },
    dive: { dur: 60, act: [2, 60], box: [0, -14, 18, 16], dmg: 7, kb: 2.5, kby: -2.5, knock: true, breakGuard: true, stun: 26, air: true, pose: ['dive', 'dive'], sfx: 'heavy' },
    dashAtk: { dur: 28, act: [2, 16], box: [0, -32, 22, 26], dmg: 8, kb: 4.2, kby: -3, knock: true, stun: 30, hitstop: 5, heavy: true, pose: ['dashAtk', 'dashAtk'], sfx: 'heavy' },
  };

  const QUIPS = {
    start: ['Works on my machine.', "Let's squash some bugs.", 'Who deploys on a Friday?!', 'Time to roll back... with my fists.'],
    combo: ['Clean code!', 'O(1) beatdown!', 'Refactored!', 'Ship it!', '10x engineer!'],
    coffee: ['Ahh, caffeine.', 'Java: the drinkable kind.', 'Productivity +10.'],
    hurt: ['Ow! Not in prod!', 'That was not in the spec.', 'Ugh, a regression.'],
    lowhp: ['I need a coffee break...', 'Stack overflow imminent.'],
    special: ['HOTFIX!', 'sudo rm -rf bugs!', 'Ctrl+Alt+DEFEAT!'],
  };

  class Player {
    constructor(x, y) {
      this.x = x; this.y = y; this.w = 12; this.h = 36; this.baseH = 36;
      this.vx = 0; this.vy = 0; this.onGround = false; this.face = 1;
      this.hp = 100; this.maxHp = 100; this.meter = 0;
      this.state = 'normal'; this.t = 0;
      this.inv = 0; this.flash = 0;
      this.coyote = 0; this.jumpBuf = 0; this.atkBuf = 0; this.dashBuf = 0; this.specBuf = 0;
      this.runT = 0; this.sprint = false; this.dashCd = 0; this.airDash = true; this.airAtk = true;
      this.atk = null; this.atkName = ''; this.hitList = new Set(); this.connected = false; this.chainT = 0;
      this.grabbed = null; this.knees = 0; this.pushT = 0;
      this.overclock = 0; this.animDist = 0; this.control = true; this.jumping = false; this.skid = 0;
      this.dropT = 0; this.quip = null; this.quipT = 0; this.team = 'player'; this.isPlayer = true; this.z = 3;
    }

    say(cat, force) {
      if (!force && this.quipT > -120) return; // throttle
      const list = QUIPS[cat] || [cat];
      this.quip = G.u.pick(list); this.quipT = 110;
      G.Audio.sfx('voice');
    }

    hurtbox() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

    setState(s) { this.state = s; this.t = 0; }

    update(w) {
      const I = G.Input;
      this.t++;
      this.quipT--;
      if (this.inv > 0) this.inv--;
      if (this.flash > 0) this.flash--;
      if (this.dashCd > 0) this.dashCd--;
      if (this.chainT > 0) this.chainT--;
      if (this.dropT > 0) this.dropT--;
      if (this.overclock > 0) this.overclock--;
      for (const k of ['jumpBuf', 'atkBuf', 'dashBuf', 'specBuf']) if (this[k] > 0) this[k]--;
      const ctl = this.control && !w.dialog;
      if (ctl) {
        if (I.pressed('jump')) this.jumpBuf = 6;
        if (I.pressed('attack')) this.atkBuf = 8;
        if (I.pressed('dash')) this.dashBuf = 6;
        if (I.pressed('special')) this.specBuf = 5;
      }
      const dx = ctl ? I.dirX() : 0;
      if (this.onGround) { this.coyote = 6; this.airDash = true; this.airAtk = true; } else if (this.coyote > 0) this.coyote--;
      this.h = this.crouching ? 24 : this.baseH;

      const fn = this['st_' + this.state];
      if (fn) fn.call(this, w, dx, I, ctl);

      // physics
      if (this.state !== 'grab' || !this.onGround) {
        const g = this.state === 'special' ? G.GRAV * 0.3 : G.GRAV;
        if (!(this.state === 'dash' && this.t < 10 && !this.onGround)) this.vy = Math.min(this.vy + g, G.MAXFALL);
      }
      const wasGround = this.onGround;
      w.level.move(this, w.plats);
      if (this.onGround && !wasGround) this.land(w);
      if (this.jumping && this.vy >= 0) this.jumping = false;

      // camera lock walls
      if (w.lock) this.x = G.u.clamp(this.x, w.cam.x + 8, w.cam.x + G.W - 8);
      this.x = G.u.clamp(this.x, 8, w.level.w - 8);

      if (this.state !== 'dead') {
        if (this.y > w.level.h + 48) { this.die(w, true); return; }
        if (w.level.hazard(this.x - 4, this.y - this.h + 4, 8, this.h - 4))
          this.takeHit({ dmg: 12, kb: 2.5, kby: -5, dir: -this.face || 1, hazard: true }, w);
      }
      if (this.overclock > 0 && G.frame % 4 === 0 && Math.abs(this.vx) > 1) w.fx.ghost(this.sprite(), this.x, this.y, this.face < 0, G.C.yellow, 10);
    }

    land(w) {
      if (this.landV > 5) { G.Audio.sfx('land'); w.fx.dust(this.x, this.y, 0, 4); }
      if (this.state === 'attack' && this.atk.air) {
        if (this.atkName === 'dive') { w.fx.shock(this.x, this.y, -1); w.fx.shock(this.x, this.y, 1); w.shake(2); }
        this.setState('normal'); this.atkBuf = 0;
      }
    }

    // ---- states --------------------------------------------------------------------------
    st_normal(w, dx, I) {
      const down = I.down('down') && this.control && !w.dialog;
      this.crouching = this.onGround && down && Math.abs(this.vx) < 2;
      const sprintMax = this.overclock > 0 ? 5 : 4.3, runMax = this.overclock > 0 ? 3 : 2.6;
      this.sprint = this.onGround ? (this.runT > 50 || Math.abs(this.vx) > 3.3) : this.sprint;
      const max = this.sprint ? sprintMax : runMax;
      if (this.skid > 0) this.skid--;
      if (dx && !this.crouching) {
        if (this.onGround && Math.sign(this.vx) === -dx && Math.abs(this.vx) > 2.4 && !this.skid) {
          this.skid = 12; G.Audio.sfx('step'); w.fx.dust(this.x, this.y, -dx, 4);
        }
        this.face = dx;
        const acc = this.onGround ? (this.skid ? 0.5 : 0.3) : 0.22;
        if (Math.abs(this.vx) <= max || Math.sign(this.vx) !== dx) this.vx = G.u.approach(this.vx, dx * max, acc);
        else this.vx = G.u.approach(this.vx, dx * max, this.onGround ? 0.06 : 0.02);
        if (this.onGround) this.runT++;
      } else {
        this.vx = G.u.approach(this.vx, 0, this.onGround ? (this.crouching ? 0.25 : 0.45) : 0.06);
        if (this.onGround) this.runT = 0;
      }
      // running footsteps and dust
      if (this.onGround && Math.abs(this.vx) > 1) {
        const before = Math.floor(this.animDist / 20);
        this.animDist += Math.abs(this.vx);
        if (Math.floor(this.animDist / 20) !== before) { G.Audio.sfx('step'); if (this.sprint) w.fx.dust(this.x - this.face * 4, this.y, this.face, 1); }
      }
      // jump / drop through
      if (this.jumpBuf > 0 && this.coyote > 0) {
        if (down && this.onGround && (this.ground === 'oneway' || this.ground === 'plat')) {
          this.dropT = 14; this.onGround = false; this.platform = null; this.y += 2; this.jumpBuf = 0; this.coyote = 0;
        } else this.jump(w);
      }
      if (this.jumping && !I.down('jump') && this.vy < -2.6) this.vy = -2.6;

      // stomp enemies by landing on them
      if (this.vy > 1.5) {
        const e = w.findStomp(this);
        if (e) {
          e.takeHit({ dmg: 5, kb: 0.5, kby: 0, dir: this.face, stun: 30, type: 'stomp', breakGuard: true, from: this }, w);
          this.vy = I.down('jump') ? -7.4 : -5.5; this.jumping = I.down('jump'); this.airDash = true; this.airAtk = true;
          G.Audio.sfx('stomp'); w.fx.spark(this.x, this.y, false); w.registerHit(5);
        }
      }

      // grab: walk into a reeling enemy (or keep pushing into one)
      if (this.onGround && dx && !this.crouching) {
        const e = w.findGrab(this, dx);
        if (e && (e.state === 'hurt' || this.pushT > 10)) { this.startGrab(w, e); return; }
        this.pushT = e ? this.pushT + 1 : 0;
      } else this.pushT = 0;

      if (this.specBuf > 0) { this.trySpecial(w); return; }
      if (this.dashBuf > 0 && this.dashCd <= 0 && (this.onGround || this.airDash)) { this.startDash(w, dx); return; }
      if (this.atkBuf > 0) this.startAttack(w, I);
    }

    jump(w) {
      this.vy = -6.7 - Math.min(Math.abs(this.vx), 4.5) * 0.1;
      this.onGround = false; this.platform = null; this.coyote = 0; this.jumpBuf = 0; this.jumping = true;
      G.Audio.sfx('jump'); w.fx.dust(this.x, this.y, this.face, 2);
    }

    startAttack(w, I) {
      this.atkBuf = 0;
      let name;
      if (!this.onGround) {
        if (!this.airAtk) return;
        name = I.down('down') ? 'dive' : 'air';
        this.airAtk = false;
      } else if (this.state === 'dash' || (this.sprint && Math.abs(this.vx) > 3.2)) name = 'dashAtk';
      else if (I.down('up')) name = 'upper';
      else name = this.chainT > 0 && this.connected && ATK[this.atkName] && ATK[this.atkName].next ? ATK[this.atkName].next : 'jab1';
      this.doAttack(w, name);
    }

    doAttack(w, name) {
      this.atk = ATK[name]; this.atkName = name;
      this.setState('attack'); this.hitList.clear(); this.connected = false; this.crouching = false;
      if (name === 'dive') { this.vx = this.face * 4.2; this.vy = 4.5; }
      if (name === 'upper') this.vy = this.onGround ? -2.5 : this.vy;
      if (name === 'dashAtk') this.vx = this.face * Math.max(Math.abs(this.vx), 4.5);
      if (!this.atk.air && name !== 'dashAtk' && name !== 'upper') this.vx *= 0.3;
      G.Audio.sfx('whiff');
    }

    st_attack(w, dx, I) {
      const A = this.atk;
      if (this.t === A.act[0] && A.lunge && this.onGround) this.vx += this.face * A.lunge;
      if (!A.air) this.vx = G.u.approach(this.vx, 0, this.atkName === 'dashAtk' ? 0.18 : 0.3);
      if (this.atkName === 'dive') { this.vx = this.face * 4.2; this.vy = Math.max(this.vy, 4.5); }
      if (A.air && this.atkName === 'air' && dx) this.vx = G.u.approach(this.vx, dx * 2.6, 0.1);
      if (this.t >= A.act[0] && this.t <= A.act[1]) this.doHits(w, A);
      // chain into the next attack on hit; uppercut can be jump-cancelled for juggles
      if (A.next && this.t >= A.cancel && this.atkBuf > 0 && this.connected) { this.atkBuf = 0; this.doAttack(w, A.next); return; }
      if (this.atkName === 'upper' && this.connected && this.t > 8 && this.jumpBuf > 0) { this.setState('normal'); this.jump(w); this.airAtk = true; return; }
      if (this.t >= A.dur && !(A.air && !this.onGround)) { this.setState('normal'); this.chainT = 22; }
      if (A.air && this.t >= A.dur) { this.state = 'normal'; this.chainT = 0; }
    }

    hitbox(A) {
      const [ox, oy, bw, bh] = A.box;
      const x = this.face > 0 ? this.x + ox : this.x - ox - bw;
      return { x, y: this.y + oy, w: bw, h: bh };
    }

    doHits(w, A) {
      const box = this.hitbox(A);
      const mult = this.overclock > 0 ? 1.25 : 1;
      for (const e of w.targets()) {
        if (this.hitList.has(e)) continue;
        const hb = e.hurtbox && e.hurtbox();
        if (!hb || !G.u.overlap(box, hb)) continue;
        this.hitList.add(e);
        const res = e.takeHit({ dmg: Math.round(A.dmg * mult), kb: A.kb, kby: A.kby || 0, dir: this.face, stun: A.stun, knock: A.knock,
          breakGuard: A.breakGuard, heavy: A.heavy, type: this.atkName, from: this }, w);
        if (!res) continue;
        const sx = (Math.max(box.x, hb.x) + Math.min(box.x + box.w, hb.x + hb.w)) / 2;
        const sy = (Math.max(box.y, hb.y) + Math.min(box.y + box.h, hb.y + hb.h)) / 2;
        if (res === 'block') {
          w.fx.spark(sx, sy, false); G.Audio.sfx('block'); this.vx = -this.face * 2; w.fx.text(sx, sy - 10, 'BLOCKED', G.C.orange, 30);
          continue;
        }
        this.connected = true;
        if (e.isEnemy) {
          w.fx.spark(sx, sy, A.heavy); G.Audio.sfx(A.sfx);
          w.hitstop(A.hitstop || 3); if (A.heavy) w.shake(3);
          w.registerHit(A.dmg);
          this.meter = Math.min(100, this.meter + A.dmg * 1.4);
        }
        if (this.atkName === 'dive') { this.vy = -5.6; this.setState('normal'); this.airAtk = true; this.airDash = true; this.jumping = false; return; }
      }
    }

    startDash(w, dx) {
      this.dashBuf = 0; this.dashCd = 34;
      if (dx) this.face = dx;
      if (!this.onGround) { this.airDash = false; this.vy = 0; }
      this.vx = this.face * 7;
      this.setState('dash'); this.inv = Math.max(this.inv, 10); this.crouching = false;
      G.Audio.sfx('dash'); w.fx.dust(this.x, this.y, this.face, 4);
    }

    st_dash(w, dx) {
      this.vx = G.u.approach(this.vx, this.face * 4.3, 0.2);
      if (this.t % 3 === 0) w.fx.ghost(this.sprite(), this.x, this.y, this.face < 0, G.C.cyan, 12);
      if (this.atkBuf > 0) { this.atkBuf = 0; this.doAttack(w, 'dashAtk'); return; }
      if (this.jumpBuf > 0 && this.coyote > 0) { this.setState('normal'); this.runT = 99; this.jump(w); return; }
      if (this.t >= 15) { this.setState('normal'); this.runT = dx === this.face ? 99 : 0; this.sprint = dx === this.face; }
    }

    trySpecial(w) {
      this.specBuf = 0;
      if (this.meter >= 100) this.meter = 0;
      else if (this.hp > 15) { this.hp -= 10; }
      else { w.fx.text(this.x, this.y - 48, 'LOW HP!', G.C.red, 40); return; }
      this.setState('special'); this.inv = Math.max(this.inv, 50); this.vx = 0; this.crouching = false;
      if (!this.onGround) this.vy = -2;
      G.Audio.sfx('special'); this.say('special', true);
    }

    st_special(w) {
      this.vx = 0;
      if (this.t === 14) {
        w.flash = 6; w.shake(8);
        w.fx.ring(this.x, this.y - 18, 110, G.C.cyan, 22); w.fx.ring(this.x, this.y - 18, 80, '#ffffff', 16);
        w.fx.bits(this.x, this.y, 20, G.C.cyan);
        for (const e of w.targets()) {
          const hb = e.hurtbox && e.hurtbox();
          if (!hb || !e.isEnemy && !e.breakable) continue;
          const cx = hb.x + hb.w / 2, cy = hb.y + hb.h / 2;
          if (G.u.dist(cx, cy, this.x, this.y - 18) < 110) {
            const r = e.takeHit({ dmg: 16, kb: 4, kby: -5, dir: cx < this.x ? -1 : 1, knock: true, breakGuard: true, stun: 40, type: 'special', from: this }, w);
            if (r && e.isEnemy) { w.fx.spark(cx, cy, true); w.registerHit(16); }
          }
        }
        w.hitstop(6);
      }
      if (this.t >= 38) this.setState('normal');
    }

    // ---- grab, knee, throw -------------------------------------------------------------
    startGrab(w, e) {
      this.grabbed = e; e.setHeld(this, w);
      this.setState('grab'); this.knees = 0; this.vx = 0; this.kneeT = 0; this.pushT = 0;
      G.Audio.sfx('step');
    }
    releaseGrab() {
      if (this.grabbed && this.grabbed.state === 'held') this.grabbed.release();
      this.grabbed = null;
    }
    st_grab(w, dx, I) {
      const e = this.grabbed;
      if (!e || e.dead || e.state !== 'held') { this.grabbed = null; this.setState('normal'); return; }
      this.vx = 0;
      e.x = this.x + this.face * 13; e.y = this.y; e.face = -this.face;
      if (this.kneeT > 0) {
        this.kneeT--;
        if (this.kneeT === 8) {
          this.knees++;
          const last = this.knees >= 3;
          e.takeHit({ dmg: last ? 7 : 4, kb: last ? 3.5 : 0, kby: last ? -3.5 : 0, dir: this.face, knock: last, stun: 30, type: 'knee', from: this, grabHit: !last }, w);
          w.fx.spark(e.x - this.face * 3, this.y - 20, last); G.Audio.sfx(last ? 'heavy' : 'punch');
          w.hitstop(last ? 6 : 3); w.registerHit(4); this.meter = Math.min(100, this.meter + 5);
          if (last) { this.grabbed = null; this.kneeT = 0; this.setState('normal'); this.chainT = 0; return; }
        }
        return;
      }
      if (this.atkBuf > 0 || this.jumpBuf > 0) {
        const backThrow = (dx === -this.face) || this.jumpBuf > 0;
        this.atkBuf = 0; this.jumpBuf = 0;
        if (backThrow) { this.setState('throw'); return; }
        this.kneeT = 14;
        return;
      }
      if (this.t > 100) { this.releaseGrab(); this.vx = -this.face * 2; this.setState('normal'); }
    }
    st_throw(w) {
      const e = this.grabbed;
      if (this.t < 8 && e && e.state === 'held') { e.x = this.x + this.face * (13 - this.t * 3); e.y = this.y - this.t * 3; }
      if (this.t === 8 && e) {
        this.face = -this.face;
        e.thrown(this.face, w);
        this.grabbed = null; G.Audio.sfx('throw'); w.registerHit(2);
      }
      if (this.t >= 20) this.setState('normal');
    }

    // ---- getting hurt ------------------------------------------------------------------
    takeHit(hit, w) {
      if (this.inv > 0 || this.state === 'dead' || w.cutscene) return false;
      const mult = G.session ? G.session.dmgMult : 1;
      this.hp -= Math.max(1, Math.round(hit.dmg * mult));
      this.flash = 8; this.releaseGrab(); this.crouching = false;
      w.comboBreak();
      G.Audio.sfx('hurt'); w.shake(4); w.hitstop(4);
      const dir = hit.dir || (hit.from ? Math.sign(this.x - hit.from.x) || 1 : 1);
      if (this.hp <= 0) { this.hp = 0; this.die(w, false, dir); return true; }
      if (hit.knock || hit.dmg >= 11 || hit.hazard) {
        this.setState('downAir'); this.vx = dir * 2.4; this.vy = hit.kby || -4.2; this.onGround = false; this.inv = 999;
      } else {
        this.setState('hurt'); this.vx = dir * 2.2; this.inv = 999;
      }
      if (this.hp < 30) this.say('lowhp'); else if (Math.random() < 0.3) this.say('hurt');
      return true;
    }
    st_hurt() {
      this.vx = G.u.approach(this.vx, 0, 0.2);
      if (this.t >= 16) { this.setState('normal'); this.inv = 45; }
    }
    st_downAir() {
      if (this.onGround && this.t > 3) { this.setState('down'); this.vx = 0; }
    }
    st_down(w) {
      this.vx = G.u.approach(this.vx, 0, 0.3);
      if (this.t === 1) { w.fx.dust(this.x, this.y, 0, 5); G.Audio.sfx('land'); }
      if (this.t >= 34) this.setState('getup');
    }
    st_getup() { if (this.t >= 12) { this.setState('normal'); this.inv = 60; } }

    die(w, pit, dir = 1) {
      this.releaseGrab();
      this.setState('dead'); this.inv = 999; this.pit = pit;
      if (pit) { this.vx = 0; this.vy = 0; }
      else { this.vx = dir * 2; this.vy = -5; }
      G.Audio.sfx(pit ? 'hurt' : 'enemyDie');
    }
    st_dead(w) {
      if (this.onGround) this.vx = G.u.approach(this.vx, 0, 0.3);
      if (this.t === 100) w.playerDied();
    }

    st_cutscene() { this.vx = G.u.approach(this.vx, 0, 0.3); }
    st_win() { this.vx = 0; }

    // ---- drawing -----------------------------------------------------------------------
    anim() {
      const s = this.state;
      if (s === 'attack') {
        const A = this.atk;
        return this.t < A.act[0] ? A.pose[0] : A.pose[1];
      }
      if (s === 'dash') return 'dash';
      if (s === 'hurt') return 'hurt';
      if (s === 'downAir') return 'downAir';
      if (s === 'down') return 'down';
      if (s === 'getup') return 'getup';
      if (s === 'dead') return this.onGround && this.t > 10 ? 'down' : 'downAir';
      if (s === 'special') return this.t < 14 ? 'special0' : 'special1';
      if (s === 'grab') return this.kneeT > 0 && this.kneeT < 11 ? 'knee' : 'grab';
      if (s === 'throw') return 'throw';
      if (s === 'win') return 'win';
      if (s === 'cutscene') return this.pose || (Math.abs(this.vx) > 0.3 ? 'run' + (Math.floor(this.animDist / 5) % 8) : 'idle' + (Math.floor(G.frame / 30) % 2));
      if (!this.onGround) return this.vy < 0 ? 'jump' : 'fall';
      if (this.crouching) return 'crouch';
      if (this.skid > 0) return 'skid';
      if (Math.abs(this.vx) > 0.3) {
        if (this.sprint) return 'sprint' + (Math.floor(this.animDist / 6) % 8);
        return 'run' + (Math.floor(this.animDist / 5) % 8);
      }
      return 'idle' + (Math.floor(G.frame / 30) % 2);
    }
    sprite() { return G.Art.body('alex', this.anim()); }

    draw(ctx) {
      if (this.state === 'cutscene' && Math.abs(this.vx) > 0.3) this.animDist += Math.abs(this.vx);
      const blink = this.inv > 0 && this.inv < 999 && this.state !== 'special' && this.state !== 'dash' && (G.frame >> 2) % 2;
      if (blink) return;
      let spr = this.sprite();
      if (this.flash > 0) spr = G.Gfx.tinted(spr, '#ffffff');
      // HOTFIX aura
      if (this.state === 'special') {
        const r = this.t < 14 ? 6 + this.t : 20;
        const pen = new G.Gfx.Pen(ctx);
        pen.ring(this.x, this.y - 18, r + (G.frame % 3), G.C.cyan, 2);
      }
      G.Gfx.draw(ctx, spr, this.x, this.y + 1, this.face < 0);
      if (G.DEBUG) {
        const hb = this.hurtbox(); ctx.strokeStyle = '#0f0'; ctx.strokeRect(hb.x + 0.5, hb.y + 0.5, hb.w, hb.h);
        if (this.state === 'attack' && this.t >= this.atk.act[0] && this.t <= this.atk.act[1]) {
          const b = this.hitbox(this.atk); ctx.strokeStyle = '#f00'; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
        }
      }
    }

    drawQuip(ctx) {
      if (this.quipT <= 0 || !this.quip) return;
      const txt = this.quip.toUpperCase();
      const wdt = G.Font.width(txt) + 8;
      let x = Math.round(this.x - wdt / 2), y = Math.round(this.y - 66);
      ctx.fillStyle = G.C.ink; ctx.fillRect(x - 1, y - 1, wdt + 2, 13);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, wdt, 11);
      ctx.fillStyle = G.C.ink; ctx.fillRect(Math.round(this.x) - 2, y + 11, 5, 2); ctx.fillRect(Math.round(this.x) - 1, y + 13, 3, 2);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(this.x) - 1, y + 11, 3, 1); ctx.fillRect(Math.round(this.x), y + 12, 1, 2);
      G.Font.draw(ctx, txt, x + 4, y + 2, G.C.ink);
    }
  }

  G.Player = Player;
  G.Player.ATK = ATK;
  G.Player.QUIPS = QUIPS;
})();
