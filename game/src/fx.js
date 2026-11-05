// fx.js: particles, hit sparks, afterimages, rings and floating text.
'use strict';
G.FX = class {
  constructor() { this.list = []; }

  add(p) { this.list.push(p); return p; }

  // pixel debris with gravity
  burst(x, y, n, colors, speed = 2.5, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = o.angle !== undefined ? o.angle + G.u.rand(-o.spread, o.spread) : G.u.rand(0, Math.PI * 2);
      const s = G.u.rand(speed * 0.3, speed);
      this.add({ k: 'px', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up || 0), g: o.g ?? 0.15,
        life: G.u.randi(14, 30), col: G.u.pick(colors), size: o.size || (Math.random() < 0.3 ? 2 : 1) });
    }
  }
  spark(x, y, big) {
    this.add({ k: 'spark', x, y, life: big ? 10 : 7, max: big ? 10 : 7, big });
    this.burst(x, y, big ? 10 : 5, ['#ffffff', G.C.yellow, G.C.orange], big ? 3.5 : 2.5, { g: 0.05 });
  }
  dust(x, y, dir = 0, n = 3) {
    for (let i = 0; i < n; i++) {
      this.add({ k: 'dust', x: x + G.u.rand(-3, 3), y: y - 2, vx: -dir * G.u.rand(0.2, 1) + G.u.rand(-0.3, 0.3), vy: -G.u.rand(0.1, 0.5),
        life: G.u.randi(12, 20), max: 20, r: G.u.rand(1.5, 3) });
    }
  }
  // dying code: 0/1 glyphs flying up
  bits(x, y, n = 10, col = G.C.green) {
    for (let i = 0; i < n; i++) {
      this.add({ k: 'glyph', x: x + G.u.rand(-8, 8), y: y + G.u.rand(-16, 4), vx: G.u.rand(-1, 1), vy: -G.u.rand(0.5, 2),
        g: 0.02, life: G.u.randi(25, 45), ch: Math.random() < 0.5 ? '0' : '1', col });
    }
  }
  ring(x, y, r, col, life = 18) { this.add({ k: 'ring', x, y, r0: 2, r, life, max: life, col }); }
  text(x, y, str, col = G.C.white, life = 50) { this.add({ k: 'text', x, y, vy: -0.6, str, col, life, max: life }); }
  ghost(spr, x, y, flip, col = G.C.cyan, life = 12) { this.add({ k: 'ghost', spr: G.Gfx.tinted(spr, col), x, y, flip, life, max: life }); }
  shock(x, y, dir) { // ground shockwave puff
    for (let i = 0; i < 6; i++) this.add({ k: 'dust', x, y: y - 2, vx: dir * G.u.rand(1, 3), vy: -G.u.rand(0.2, 1), life: 20, max: 20, r: 3 });
  }

  update() {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      if (--p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      if (p.vx !== undefined) { p.x += p.vx; p.y += p.vy || 0; }
      if (p.g) p.vy += p.g;
      if (p.k === 'dust') { p.vx *= 0.9; }
      if (p.k === 'text') { p.vy *= 0.95; }
    }
  }

  draw(ctx) {
    for (const p of this.list) {
      const x = Math.round(p.x), y = Math.round(p.y);
      switch (p.k) {
        case 'px': ctx.fillStyle = p.col; ctx.fillRect(x, y, p.size, p.size); break;
        case 'dust': {
          const t = p.life / p.max, r = Math.max(1, Math.round(p.r * (1.4 - t * 0.6)));
          ctx.fillStyle = t > 0.5 ? '#e8e8f0' : '#a0a4b8';
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
          break;
        }
        case 'spark': {
          const t = 1 - p.life / p.max, s = Math.round((p.big ? 14 : 9) * (0.4 + t));
          ctx.fillStyle = t < 0.5 ? '#ffffff' : G.C.yellow;
          ctx.fillRect(x - s, y - 1, s * 2, 2); ctx.fillRect(x - 1, y - s, 2, s * 2);
          const d = Math.round(s * 0.6);
          for (let k = -d; k <= d; k += 2) { ctx.fillRect(x + k, y + k, 1, 1); ctx.fillRect(x + k, y - k, 1, 1); }
          break;
        }
        case 'glyph': G.Font.draw(ctx, p.ch, x, y, p.life > 10 ? p.col : '#145a3a'); break;
        case 'ring': {
          const t = 1 - p.life / p.max, r = p.r0 + (p.r - p.r0) * t;
          const pen = new G.Gfx.Pen(ctx);
          pen.ring(x, y, r, p.col, t < 0.6 ? 2 : 1);
          break;
        }
        case 'text': G.Font.draw(ctx, p.str, x, y, (p.life < 10 && p.life % 2) ? G.C.ink : p.col, { align: 'center', shadow: G.C.ink }); break;
        case 'ghost': G.Gfx.draw(ctx, p.spr, x, y, p.flip, 0.5 * (p.life / p.max)); break;
      }
    }
  }
};
