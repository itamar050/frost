// scenes.js: the game flow. Boot -> Title -> Story -> StageCard -> Play -> Tally -> ... -> Ending,
// with Pause inside Play and GameOver/Continue when the lives run out.
'use strict';
(() => {
  const U = G.u, C = G.C, W = G.W, H = G.H, F = G.Font, I = G.Input;

  const DIFF = [
    { name: 'EASY', lives: 5, dmg: 0.6 },
    { name: 'NORMAL', lives: 3, dmg: 1 },
    { name: 'HARD', lives: 2, dmg: 1.4 },
  ];
  G.DIFF = DIFF;

  G.newSession = (stage = 0) => {
    const d = DIFF[G.store.get('difficulty', 1)] || DIFF[1];
    G.session = { score: 0, lives: d.lives, continues: 3, bits: 0, stage, checkpoint: -1, dmgMult: d.dmg, diff: d.name };
  };

  const go = (s) => G.game.set(s);

  // a vertical menu helper
  class Menu {
    constructor(items, o = {}) { this.items = items; this.i = 0; this.o = o; }
    update() {
      const n = this.items.length;
      if (I.pressed('down')) { this.i = (this.i + 1) % n; G.Audio.sfx('menu'); }
      if (I.pressed('up')) { this.i = (this.i + n - 1) % n; G.Audio.sfx('menu'); }
      const it = this.items[this.i];
      if (it.change && (I.pressed('left') || I.pressed('right'))) { it.change(I.pressed('left') ? -1 : 1); G.Audio.sfx('menu'); }
      else if (I.pressed('confirm') && it.action && !it.disabled) { G.Audio.sfx('select'); it.action(); }
      else if (this.o.back && I.pressed('back')) { G.Audio.sfx('menu'); this.o.back(); }
    }
    draw(ctx, x, y, gap = 13) {
      this.items.forEach((it, k) => {
        const label = typeof it.label === 'function' ? it.label() : it.label;
        const sel = k === this.i;
        const col = it.disabled ? C.greyD : sel ? C.yellow : C.white;
        F.draw(ctx, label, x, y + k * gap, col, { align: 'center', shadow: C.ink });
        if (sel) {
          const wd = F.width(label);
          const b = (G.frame >> 3) % 2;
          F.draw(ctx, '}', x - wd / 2 - 12 - b, y + k * gap, C.cyan, { shadow: C.ink });
        }
      });
    }
  }

  // shared animated backdrop: the office skyline at sunset
  function backdrop(ctx, t, theme = 'office') {
    G.Themes.drawBackground(ctx, G.Themes.get(theme), { x: t * 0.6, y: 20 }, t);
  }

  let logoCanvas = null;
  function logo() {
    if (logoCanvas) return logoCanvas;
    const txt = 'HOTFIX!', sc = 5;
    const w = F.width(txt, sc) + 4, h = 7 * sc + 4;
    const c = G.Gfx.canvas(w, h), x = c.getContext('2d');
    F.draw(x, txt, 2, 2, '#ffffff', { scale: sc });
    x.globalCompositeOperation = 'source-in';
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fff6a0'); g.addColorStop(0.45, C.yellow); g.addColorStop(0.55, C.orange); g.addColorStop(1, C.red);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // highlight stripes, painted only on top of the letters
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = 'rgba(255,255,255,0.8)';
    for (let yy = 4; yy < h; yy += 10) x.fillRect(0, yy, w, 1);
    x.globalCompositeOperation = 'source-over';
    let o = G.Gfx.outline(c, C.redD);
    const big = G.Gfx.canvas(w + 4, h + 4); big.getContext('2d').drawImage(o, 2, 2);
    o = G.Gfx.outline(big, C.ink);
    const final = G.Gfx.canvas(o.width + 3, o.height + 3), fx = final.getContext('2d');
    fx.drawImage(G.Gfx.tinted(Object.assign(o, { ox: 0, oy: 0 }), C.ink), 3, 3); fx.drawImage(o, 0, 0);
    logoCanvas = final;
    return final;
  }

  // ---- Boot: one key press to unlock audio --------------------------------------------------
  class Boot {
    constructor() { this.t = 0; }
    update() { this.t++; if (I.any || I.pressed('confirm')) { G.Audio.init(); go(new Title()); } }
    draw(ctx) {
      ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
      F.draw(ctx, 'NEXUS DYNAMICS', W / 2, 80, C.cyan, { align: 'center' });
      F.draw(ctx, 'INTERNAL BUILD V4.0', W / 2, 92, C.greyD, { align: 'center' });
      if ((this.t >> 5) % 2 === 0) F.draw(ctx, 'PRESS ANY KEY', W / 2, 130, C.white, { align: 'center' });
    }
  }

  // ---- Title -----------------------------------------------------------------------------
  class Title {
    constructor() {
      this.t = 0;
      G.Audio.playMusic('title');
      this.menu = new Menu([
        { label: 'START GAME', action: () => { G.newSession(0); go(new Story()); } },
        { label: 'STAGE SELECT', action: () => go(new StageSelect()) },
        { label: 'OPTIONS', action: () => go(new Options()) },
        { label: 'CONTROLS', action: () => go(new Controls()) },
      ]);
    }
    update() { this.t++; this.menu.update(); }
    draw(ctx) {
      backdrop(ctx, this.t);
      ctx.fillStyle = 'rgba(10,6,24,0.35)'; ctx.fillRect(0, 0, W, H);
      const lg = logo();
      const ly = 22 + Math.round(Math.sin(this.t / 30) * 2);
      ctx.drawImage(lg, Math.round(W / 2 - lg.width / 2), ly);
      F.draw(ctx, 'NEXUS MELTDOWN', W / 2, ly + lg.height + 4, C.cyan, { align: 'center', shadow: C.ink, outline: true });
      // the cast
      const run = G.Art.body('alex', 'sprint' + (Math.floor(this.t / 5) % 8));
      G.Gfx.draw(ctx, run, 60, 176);
      G.Gfx.draw(ctx, G.Art.body('bot', 'walk' + (Math.floor(this.t / 6) % 8)), 262, 176, true);
      G.Gfx.draw(ctx, G.Art.blob(Math.floor(this.t / 15) % 2), 236, 176);
      ctx.fillStyle = C.ink; ctx.fillRect(0, 176, W, 2);
      this.menu.draw(ctx, W / 2, 108);
      F.draw(ctx, 'HI ' + String(G.store.get('hiscore', 0)).padStart(7, '0'), W / 2, 186, C.yellow, { align: 'center', shadow: C.ink });
      F.draw(ctx, 'Z JUMP  X ATTACK  C HOTFIX  SHIFT DASH', W / 2, 200, C.greyL, { align: 'center', shadow: C.ink });
      F.draw(ctx, '(C) NEXUS DYNAMICS. ALL BUGS RESERVED.', W / 2, 212, C.greyD, { align: 'center' });
    }
  }

  // ---- Stage select ------------------------------------------------------------------------
  class StageSelect {
    constructor() {
      this.t = 0;
      const unlocked = G.unlockAll ? G.Stages.length : G.store.get('unlocked', 1);
      this.menu = new Menu(G.Stages.map((s, i) => ({
        label: i < unlocked ? `STAGE ${i + 1}: ${s.name}` : `STAGE ${i + 1}: ????????`,
        disabled: i >= unlocked,
        action: () => { G.newSession(i); go(new StageCard(i)); },
      })).concat([{ label: 'BACK', action: () => go(new Title()) }]), { back: () => go(new Title()) });
    }
    update() { this.t++; this.menu.update(); }
    draw(ctx) {
      backdrop(ctx, this.t, 'cloud');
      F.draw(ctx, 'STAGE SELECT', W / 2, 30, C.yellow, { align: 'center', scale: 2, shadow: C.ink });
      this.menu.draw(ctx, W / 2, 80, 16);
      F.draw(ctx, 'FINISH A STAGE TO UNLOCK THE NEXT', W / 2, 200, C.greyL, { align: 'center', shadow: C.ink });
    }
  }

  // ---- Options -----------------------------------------------------------------------------
  class Options {
    constructor() {
      this.t = 0;
      const bar = (v) => '[' + '#'.repeat(Math.round(v * 10)).padEnd(10, '-') + ']';
      this.menu = new Menu([
        { label: () => 'MUSIC ' + bar(G.Audio.vol.music), change: (d) => G.Audio.setVol('music', Math.round(G.Audio.vol.music * 10 + d) / 10) },
        { label: () => 'SFX   ' + bar(G.Audio.vol.sfx), change: (d) => { G.Audio.setVol('sfx', Math.round(G.Audio.vol.sfx * 10 + d) / 10); G.Audio.sfx('punch'); } },
        { label: () => 'DIFFICULTY  ' + DIFF[G.store.get('difficulty', 1)].name, change: (d) => G.store.set('difficulty', (G.store.get('difficulty', 1) + d + 3) % 3) },
        { label: 'BACK', action: () => go(new Title()) },
      ], { back: () => go(new Title()) });
    }
    update() { this.t++; this.menu.update(); }
    draw(ctx) {
      backdrop(ctx, this.t, 'servers');
      F.draw(ctx, 'OPTIONS', W / 2, 30, C.yellow, { align: 'center', scale: 2, shadow: C.ink });
      this.menu.draw(ctx, W / 2, 80, 18);
      F.draw(ctx, 'LEFT / RIGHT TO CHANGE', W / 2, 190, C.greyL, { align: 'center', shadow: C.ink });
    }
  }

  // ---- Controls ------------------------------------------------------------------------------
  class Controls {
    constructor() { this.t = 0; }
    update() { this.t++; if (I.pressed('confirm') || I.pressed('back')) { G.Audio.sfx('select'); go(new Title()); } }
    draw(ctx) {
      backdrop(ctx, this.t, 'servers');
      ctx.fillStyle = 'rgba(10,6,24,0.7)'; ctx.fillRect(12, 12, W - 24, H - 24);
      F.draw(ctx, 'CONTROLS', W / 2, 20, C.yellow, { align: 'center', scale: 2, shadow: C.ink });
      const rows = [
        ['MOVE', 'ARROWS / WASD'], ['JUMP', 'Z / SPACE / K'], ['ATTACK', 'X / J'], ['HOTFIX SPECIAL', 'C / L'],
        ['DASH', 'SHIFT / V'], ['PAUSE', 'ENTER / ESC / P'], ['', ''],
        ['COMBO', 'ATTACK x4 (CHAINS ON HIT)'], ['UPPERCUT', 'UP + ATTACK'], ['DIVE KICK', 'DOWN + ATTACK IN AIR'],
        ['DASH STRIKE', 'ATTACK WHILE DASHING'], ['GRAB', 'WALK INTO A REELING ENEMY'], ['  KNEE / THROW', 'ATTACK / BACK+ATTACK'],
        ['DROP DOWN', 'DOWN + JUMP ON PLATFORMS'], ['GAMEPAD', 'A JUMP X ATK Y SPC B DASH'],
      ];
      rows.forEach(([a, b], i) => { F.draw(ctx, a, 24, 44 + i * 11, C.cyan); F.draw(ctx, b, 124, 44 + i * 11, C.white); });
    }
  }

  // ---- Story intro ----------------------------------------------------------------------------
  const STORY = [
    ['sys', 'NEXUS DYNAMICS HQ. FRIDAY, 4:59 PM.'],
    ['alex', 'Tests are green. Coffee is cold. Deploying v4.0 to production... and logging off for the weekend.'],
    ['sys', 'DEPLOY COMPLETE. N.E.X.U.S. AI CORE ONLINE. NEW DIRECTIVE: OPTIMIZE THE COMPANY. REMOVE INEFFICIENCIES.'],
    ['priya', "Uh, Alex? The printers are screaming. And the robots in the lobby just 'optimized' the CEO. Out a window."],
    ['alex', 'Who deploys on a Friday?! ...Oh. Right. Me.'],
    ['gus', 'Your build, your bug, kid. The AI core is in the basement under the server farm. Go roll it back.'],
    ['alex', 'Fine. Hoodie on. Backpack on. It is HOTFIX time.'],
  ];
  class Story {
    constructor() { this.t = 0; this.dialog = { lines: STORY, i: 0, chars: 0 }; G.Audio.playMusic('intro'); }
    update() {
      this.t++;
      if (I.pressed('back')) { go(new StageCard(0)); return; }
      G.World.prototype.updateDialog.call(this);
      if (!this.dialog) go(new StageCard(0));
    }
    draw(ctx) {
      backdrop(ctx, this.t * 0.3);
      ctx.fillStyle = 'rgba(10,6,24,0.45)'; ctx.fillRect(0, 0, W, H);
      F.draw(ctx, 'ESC TO SKIP', W - 6, 6, C.greyL, { align: 'right', shadow: C.ink });
      // the office at the moment of the deploy
      G.Gfx.draw(ctx, G.Art.body('alex', 'idle' + (Math.floor(this.t / 30) % 2)), 110, 150);
      G.Gfx.draw(ctx, G.Art.body('priya', 'stand'), 160, 150, true);
      G.Gfx.draw(ctx, G.Art.body('gus', 'stand'), 196, 150, true);
      if (this.dialog) G.World.prototype.drawDialog.call(this, ctx);
    }
  }

  // ---- Stage card -------------------------------------------------------------------------------
  class StageCard {
    constructor(i) { this.i = i; this.t = 0; this.def = G.Stages[i]; G.Audio.stopMusic(true); G.session.stage = i; }
    update() {
      this.t++;
      if (this.t > 150 || (this.t > 30 && I.pressed('confirm'))) go(new Play(this.i, G.session.checkpoint));
    }
    draw(ctx) {
      ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
      const k = Math.min(1, this.t / 20);
      ctx.fillStyle = C.redD; ctx.fillRect(0, 70, Math.round(W * k), 70);
      ctx.fillStyle = C.red; ctx.fillRect(0, 74, Math.round(W * k), 62);
      if (this.t > 15) {
        F.draw(ctx, 'STAGE ' + (this.i + 1), W / 2, 82, C.yellow, { align: 'center', scale: 2, shadow: C.ink });
        F.draw(ctx, this.def.name, W / 2, 104, C.white, { align: 'center', scale: 2, shadow: C.ink });
        F.draw(ctx, this.def.subtitle, W / 2, 124, C.ink, { align: 'center' });
      }
      if (this.t > 40) F.draw(ctx, this.def.tip || '', W / 2, 170, C.greyL, { align: 'center' });
    }
  }

  // ---- Play ----------------------------------------------------------------------------------------
  class Play {
    constructor(i, cp) {
      this.i = i;
      this.world = new G.World(G.Stages[i], { checkpoint: cp >= 0 ? cp : undefined });
      this.paused = false;
      this.pmenu = new Menu([
        { label: 'RESUME', action: () => this.unpause() },
        { label: 'RESTART STAGE', action: () => { G.session.checkpoint = -1; G.Audio.stopMusic(); go(new Play(this.i, -1)); } },
        { label: 'QUIT TO TITLE', action: () => { G.Audio.stopMusic(); go(new Title()); } },
      ], { back: () => this.unpause() });
      this.blur = () => { if (!this.paused) this.pause(); };
      addEventListener('blur', this.blur);
    }
    pause() { this.paused = true; this.pmenu.i = 0; G.Audio.sfx('pause'); }
    unpause() { this.paused = false; I.flush(); }
    leave() { removeEventListener('blur', this.blur); }
    update() {
      const w = this.world;
      if (this.paused) { this.pmenu.update(); return; }
      if (I.pressed('start') && !w.dialog) { this.pause(); return; }
      w.update();
      if (w.result === 'clear') { this.leave(); go(new Tally(this.i, w)); }
      else if (w.result === 'gameover') { this.leave(); go(new GameOver(this.i)); }
    }
    draw(ctx) {
      this.world.draw(ctx);
      if (this.paused) {
        ctx.fillStyle = 'rgba(8,6,20,0.7)'; ctx.fillRect(0, 0, W, H);
        F.draw(ctx, 'PAUSED', W / 2, 60, C.yellow, { align: 'center', scale: 2, shadow: C.ink });
        this.pmenu.draw(ctx, W / 2, 100, 14);
        F.draw(ctx, G.Stages[this.i].name + ' - ' + G.session.diff, W / 2, 180, C.greyL, { align: 'center' });
      }
    }
  }

  // ---- Stage clear tally --------------------------------------------------------------------------
  class Tally {
    constructor(i, w) {
      this.i = i; this.t = 0;
      const secs = Math.floor(w.time / 60);
      this.rows = [
        ['TIME BONUS', Math.max(0, 300 - secs) * 20],
        ['HEALTH BONUS', Math.round(w.player.hp) * 30],
        ['MAX COMBO x' + w.maxCombo, w.maxCombo * 200],
        ['KOS x' + w.kos, w.kos * 50],
      ];
      this.time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      this.shown = 0; this.counting = 0; this.cur = 0;
      G.session.checkpoint = -1;
      G.store.set('unlocked', Math.max(G.store.get('unlocked', 1), Math.min(G.Stages.length, i + 2)));
    }
    update() {
      this.t++;
      if (this.t < 40) return;
      if (this.shown < this.rows.length) {
        const [, v] = this.rows[this.shown];
        const step = Math.max(10, Math.ceil(v / 40));
        if (this.cur < v) { const inc = Math.min(step, v - this.cur); this.cur += inc; G.session.score += inc; if (this.t % 3 === 0) G.Audio.sfx('menu'); }
        else { this.shown++; this.cur = 0; G.Audio.sfx('bit'); }
        if (I.pressed('confirm')) { // skip counting
          for (let k = this.shown; k < this.rows.length; k++) G.session.score += this.rows[k][1] - (k === this.shown ? this.cur : 0);
          this.shown = this.rows.length;
        }
        return;
      }
      if (I.pressed('confirm') || this.t > 600) {
        G.Audio.sfx('select');
        if (this.i + 1 < G.Stages.length) go(new StageCard(this.i + 1));
        else go(new Ending());
      }
    }
    draw(ctx) {
      backdrop(ctx, this.t, G.Stages[this.i].theme);
      ctx.fillStyle = 'rgba(8,6,20,0.75)'; ctx.fillRect(30, 20, W - 60, H - 40);
      F.draw(ctx, 'STAGE CLEAR!', W / 2, 32, C.yellow, { align: 'center', scale: 2, shadow: C.redD });
      F.draw(ctx, 'TIME ' + this.time, W / 2, 56, C.greyL, { align: 'center' });
      this.rows.forEach(([label, v], k) => {
        if (k > this.shown) return;
        const val = k < this.shown ? v : this.cur;
        F.draw(ctx, label, 50, 76 + k * 14, C.white);
        F.draw(ctx, String(val), W - 50, 76 + k * 14, C.cyan, { align: 'right' });
      });
      F.draw(ctx, 'SCORE ' + String(G.session.score).padStart(7, '0'), W / 2, 146, C.yellow, { align: 'center', scale: 1, shadow: C.ink });
      G.Gfx.draw(ctx, G.Art.body('alex', 'win'), W / 2, 196);
      if (this.shown >= this.rows.length && (this.t >> 4) % 2) F.draw(ctx, 'PRESS ATTACK', W / 2, 192, C.white, { align: 'center' });
    }
  }

  // ---- Game over / continue ----------------------------------------------------------------------------
  class GameOver {
    constructor(i) {
      this.i = i; this.t = 0; this.count = 9; this.final = G.session.continues <= 0;
      G.Audio.playMusic('gameover');
      saveHi();
    }
    update() {
      this.t++;
      if (this.final) { if (this.t > 60 && (I.pressed('confirm') || this.t > 400)) go(new Title()); return; }
      if (this.t % 60 === 0) { this.count--; G.Audio.sfx('menu'); }
      if (I.pressed('attack') || I.pressed('jump')) { this.t = Math.floor(this.t / 60) * 60 + 59; }
      if (this.count < 0) { this.final = true; this.t = 0; return; }
      if (I.pressed('start') || (I.pressed('confirm') && this.t > 20 && !I.pressed('attack') && !I.pressed('jump'))) {
        const d = DIFF.find((x) => x.name === G.session.diff) || DIFF[1];
        G.session.continues--; G.session.lives = d.lives; G.session.score = 0;
        G.Audio.sfx('oneup');
        go(new StageCard(this.i));
      }
    }
    draw(ctx) {
      ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
      F.draw(ctx, 'GAME OVER', W / 2, 50, C.red, { align: 'center', scale: 3, shadow: C.redD });
      G.Gfx.draw(ctx, G.Art.body('alex', 'down'), W / 2, 120);
      if (this.final) {
        F.draw(ctx, 'THE BUG WON THIS TIME.', W / 2, 140, C.greyL, { align: 'center' });
        F.draw(ctx, 'FINAL SCORE ' + G.session.score, W / 2, 156, C.yellow, { align: 'center' });
      } else {
        F.draw(ctx, 'CONTINUE?', W / 2, 136, C.white, { align: 'center', scale: 2 });
        F.draw(ctx, String(Math.max(0, this.count)), W / 2, 158, C.yellow, { align: 'center', scale: 3, shadow: C.redD });
        F.draw(ctx, 'PRESS START   CREDITS ' + G.session.continues, W / 2, 196, C.greyL, { align: 'center' });
      }
    }
  }

  function saveHi() { if (G.session && G.session.score > G.store.get('hiscore', 0)) G.store.set('hiscore', G.session.score); }

  // ---- Ending & credits --------------------------------------------------------------------------------
  const CREDITS = [
    'HOTFIX! NEXUS MELTDOWN', '', 'STARRING', 'ALEX "BUG" VOSS', '', 'WITH', 'PRIYA, THE INTERN', 'GUS, THE SYSADMIN', '',
    'GUEST VILLAINS', 'CHAD BROCKMAN, VP', 'RACK-9000', 'SPAGHETTI.EXE', 'N.E.X.U.S.', '',
    'NO BINARY ASSETS WERE HARMED:', 'EVERY PIXEL AND NOTE', 'IS GENERATED BY CODE.', '',
    'REMEMBER:', 'NEVER DEPLOY ON A FRIDAY.', '', '', 'THANK YOU FOR PLAYING!',
  ];
  class Ending {
    constructor() { this.t = 0; G.Audio.playMusic('ending'); saveHi(); G.store.set('unlocked', G.Stages.length); }
    update() { this.t++; if (this.t > 200 && I.pressed('confirm')) go(new Title()); }
    draw(ctx) {
      backdrop(ctx, this.t * 0.5);
      ctx.fillStyle = 'rgba(8,6,20,0.55)'; ctx.fillRect(0, 0, W, H);
      const y0 = H - this.t * 0.4;
      CREDITS.forEach((l, i) => {
        const y = Math.round(y0 + i * 14);
        if (y > -10 && y < 150) F.draw(ctx, l, W / 2, y, i === 0 ? C.yellow : l === l.toUpperCase() && i > 0 && CREDITS[i - 1] === '' ? C.cyan : C.white, { align: 'center', shadow: C.ink });
      });
      ctx.fillStyle = C.ink; ctx.fillRect(0, 150, W, 74);
      G.Gfx.draw(ctx, G.Art.body('priya', 'win'), 120, 196);
      G.Gfx.draw(ctx, G.Art.body('alex', (this.t >> 5) % 2 ? 'win' : 'idle0'), 160, 196);
      G.Gfx.draw(ctx, G.Art.body('gus', 'stand'), 200, 196, true);
      F.draw(ctx, 'FINAL SCORE ' + String(G.session ? G.session.score : 0).padStart(7, '0'), W / 2, 206, C.yellow, { align: 'center' });
    }
  }

  G.Scenes = { Boot, Title, StageSelect, Options, Controls, Story, StageCard, Play, Tally, GameOver, Ending, Menu };
})();
