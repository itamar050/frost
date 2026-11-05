// themes.js: tilesets, props and parallax backgrounds for each stage theme.
// A theme has: sky (gradient stops), tile(pen, kind, x, y, tx, ty), props {digit: draw},
// layers [{speed, vy, build() -> canvas, anim?}], and optional overlay(ctx, cam, t).
'use strict';
G.Themes = (() => {
  const C = G.C, H = G.u.hash;

  function layerCanvas(w, h, draw) {
    const c = G.Gfx.canvas(w, h), x = c.getContext('2d');
    draw(new G.Gfx.Pen(x), x, w, h);
    return c;
  }

  // shared tile shapes -----------------------------------------------------------------
  function slope(p, x, y, dir, fill, edge, edge2) {
    for (let i = 0; i < 16; i++) {
      const top = dir > 0 ? 15 - i : i; // '/' rises to the right
      p.rect(x + i, y + top, 1, 16 - top, fill);
      p.rect(x + i, y + top, 1, 2, edge);
      p.rect(x + i, y + top + 2, 1, 1, edge2);
    }
  }
  function wires(p, x, y, col, col2) {
    p.rect(x, y + 12, 16, 4, '#2a2e40');
    for (let i = 0; i < 4; i++) {
      p.line(x + 2 + i * 4, y + 12, x + i * 4, y + 6, col);
      p.line(x + i * 4, y + 6, x + 3 + i * 4, y + 2, col2);
    }
  }

  const themes = {};

  // ---- Stage 1: Nexus Dynamics HQ, open office at sunset ---------------------------------
  themes.office = {
    sky: [[0, '#2a1a5a'], [0.45, '#b0408a'], [0.8, '#ff9a4a'], [1, '#ffd27a']],
    tile(p, kind, x, y, tx, ty) {
      if (kind === 'top') {
        p.rect(x, y, 16, 16, '#3a4064');
        p.rect(x, y, 16, 3, '#d8dcef'); p.rect(x, y + 3, 16, 5, '#5a6aa8');
        if ((tx + ty) % 2) p.rect(x + 3, y + 5, 2, 1, '#7a8ac8'); else p.rect(x + 10, y + 4, 2, 1, '#7a8ac8');
        p.rect(x, y + 8, 16, 1, '#262a48');
      } else if (kind === 'fill') {
        p.rect(x, y, 16, 16, '#3a4064');
        p.rect(x, y + 7, 16, 1, '#2c3152'); p.rect(x + ((ty % 2) ? 8 : 0), y, 1, 7, '#2c3152');
        p.rect(x + ((ty % 2) ? 0 : 8), y + 8, 1, 8, '#2c3152');
      } else if (kind === 'oneway') { // office desk
        p.rect(x, y, 16, 4, '#d89a50'); p.rect(x, y, 16, 1, '#ffd08a'); p.rect(x, y + 4, 16, 1, '#8a5a2a');
        if (tx % 3 === 0) p.rect(x + 2, y + 5, 2, 11, '#5a5f78');
        if (tx % 3 === 2) p.rect(x + 12, y + 5, 2, 11, '#5a5f78');
      } else if (kind === 'slopeR' || kind === 'slopeL') slope(p, x, y, kind === 'slopeR' ? 1 : -1, '#3a4064', '#d8dcef', '#5a6aa8');
      else if (kind === 'spike') wires(p, x, y, C.yellow, '#ffffff');
    },
    props: {
      1: (p, x, y) => { // potted plant
        p.rect(x + 4, y - 9, 9, 9, '#c8643a'); p.rect(x + 4, y - 9, 9, 2, '#e88a5a');
        for (let i = 0; i < 6; i++) p.line(x + 8, y - 9, x + 2 + i * 2.5, y - 22 + Math.abs(i - 2.5) * 2, i % 2 ? C.greenD : C.green, 2);
      },
      2: (p, x, y) => { // desk with a monitor
        p.rect(x, y - 13, 30, 3, '#d89a50'); p.rect(x + 2, y - 10, 2, 10, '#5a5f78'); p.rect(x + 26, y - 10, 2, 10, '#5a5f78');
        p.rect(x + 8, y - 27, 16, 12, '#262a3a'); p.rect(x + 9, y - 26, 14, 9, '#3a8ad8');
        p.rect(x + 10, y - 25, 6, 1, '#c8f0ff'); p.rect(x + 10, y - 23, 9, 1, '#c8f0ff');
        p.rect(x + 15, y - 15, 2, 2, '#262a3a');
      },
      3: (p, x, y) => { // water cooler
        p.rect(x + 3, y - 26, 10, 10, '#7ad0ff'); p.rect(x + 2, y - 16, 12, 16, '#e8e8f0'); p.rect(x + 5, y - 12, 2, 2, C.red);
      },
      4: (p, x, y) => { // "SHIP IT" poster on the wall
        p.rect(x, y - 60, 30, 20, '#ffffff'); p.rect(x + 1, y - 59, 28, 18, C.red);
        G.Font.draw(p.c, 'SHIP', x + 4, y - 58, '#ffffff'); G.Font.draw(p.c, ' IT!', x + 3, y - 50, C.yellow);
      },
      5: (p, x, y) => { // office chair
        p.rect(x + 4, y - 22, 4, 12, '#2a2e40'); p.rect(x + 4, y - 11, 12, 3, '#2a2e40'); p.rect(x + 9, y - 8, 2, 6, '#5a5f78');
        p.rect(x + 4, y - 2, 12, 2, '#5a5f78');
      },
      6: (p, x, y) => { // filing cabinet
        p.rect(x + 1, y - 28, 14, 28, '#8a90a8'); for (let i = 0; i < 3; i++) { p.rect(x + 2, y - 27 + i * 9, 12, 8, '#a3abc4'); p.rect(x + 6, y - 24 + i * 9, 4, 1, '#3a4058'); }
      },
      7: (p, x, y) => { // motivational banner
        p.rect(x, y - 76, 64, 14, C.navy); p.rect(x + 1, y - 75, 62, 12, '#ffffff');
        G.Font.draw(p.c, 'MOVE FAST', x + 5, y - 72, C.blue);
      },
    },
    layers: [
      { speed: 0.08, vy: 0.04, y: -10, build: () => layerCanvas(320, 240, (p) => {
        p.circle(230, 120, 34, '#ffe08a');
        for (let i = 0; i < 6; i++) p.rect(190, 118 + i * 7, 80, 2 + i * 0.6, '#ff9a4a');
        for (let i = 0; i < 26; i++) {
          const w = 18 + H(i, 1) * 26, h = 50 + H(i, 2) * 110, x = i * 13 - 10;
          const col = H(i, 3) > 0.5 ? '#3a2266' : '#4a2c7a';
          p.rect(x, 240 - h, w, h, col);
          for (let wy = 240 - h + 6; wy < 236; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 5)
            if (H(wx, wy) > 0.55) p.rect(wx, wy, 2, 3, H(wx + 1, wy) > 0.5 ? '#ffd86a' : '#ff9ad8');
        }
      }) },
      { speed: 0.45, vy: 0.3, y: -24, build: () => layerCanvas(256, 300, (p, x) => {
        p.rect(0, 0, 256, 300, '#2a2f4a');
        x.clearRect(22, 50, 96, 130); x.clearRect(150, 50, 96, 130);
        for (const wx of [22, 150]) {
          p.rect(wx - 3, 47, 102, 3, '#8a90a8'); p.rect(wx - 3, 180, 102, 4, '#8a90a8');
          p.rect(wx - 3, 47, 3, 137, '#8a90a8'); p.rect(wx + 96, 47, 3, 137, '#8a90a8');
          p.rect(wx + 47, 50, 2, 130, '#8a90a8'); p.rect(wx, 112, 96, 2, '#8a90a8');
        }
        p.rect(0, 0, 256, 30, '#1a1d30');
        for (const lx of [40, 168]) { p.rect(lx, 22, 48, 4, '#f0f8ff'); p.rect(lx - 2, 26, 52, 2, '#8a9ab8'); }
        p.rect(0, 184, 256, 116, '#23273e');
        for (let i = 0; i < 256; i += 32) p.rect(i, 184, 1, 116, '#1a1d30');
      }) },
    ],
  };

  // ---- Stage 2: the server farm -----------------------------------------------------------
  function racks(p, w, h, ledState, big) {
    const rw = big ? 44 : 26, gap = big ? 20 : 8;
    for (let x = 4; x < w; x += rw + gap) {
      const top = big ? 40 : 70;
      p.rect(x, top, rw, h - top, big ? '#1c2440' : '#121a30');
      p.rect(x + 2, top + 2, rw - 4, h - top, big ? '#141a30' : '#0c1224');
      for (let y = top + 6; y < h - 4; y += big ? 8 : 6) {
        p.rect(x + 3, y, rw - 6, big ? 5 : 3, big ? '#26304e' : '#182040');
        const r = H(x, y + ledState * 977);
        if (r > 0.35) p.rect(x + rw - 7, y + 1, 2, 2, r > 0.8 ? C.yellow : r > 0.55 ? C.green : '#3ab0ff');
        if (big && H(y, x) > 0.6) p.rect(x + 5, y + 2, 3, 1, C.cyan);
      }
    }
  }
  themes.servers = {
    sky: [[0, '#05060f'], [0.6, '#0c1430'], [1, '#14204a']],
    tile(p, kind, x, y, tx, ty) {
      if (kind === 'top') {
        p.rect(x, y, 16, 16, '#262b40');
        p.rect(x, y, 16, 4, '#9aa3bb'); p.rect(x, y, 16, 1, '#d8dcef');
        for (let i = 0; i < 16; i += 4) p.rect(x + i + ((tx % 2) ? 2 : 0), y + 1, 2, 1, '#6a7290');
        p.rect(x, y + 4, 16, 2, (tx % 2) ? C.yellow : '#262b40');
        p.rect(x + 2, y + 9, 1, 1, '#4a5070'); p.rect(x + 13, y + 9, 1, 1, '#4a5070');
      } else if (kind === 'fill') {
        p.rect(x, y, 16, 16, '#262b40'); p.rect(x, y, 16, 1, '#1a1e30'); p.rect(x, y, 1, 16, '#1a1e30');
        p.rect(x + 2, y + 2, 1, 1, '#4a5070'); p.rect(x + 13, y + 13, 1, 1, '#4a5070');
      } else if (kind === 'oneway') {
        p.rect(x, y, 16, 3, '#9aa3bb'); p.rect(x, y, 16, 1, '#d8dcef');
        for (let i = 1; i < 16; i += 3) p.rect(x + i, y + 3, 1, 3, '#5a6078');
        p.rect(x, y + 5, 16, 1, '#5a6078');
      } else if (kind === 'slopeR' || kind === 'slopeL') slope(p, x, y, kind === 'slopeR' ? 1 : -1, '#262b40', '#9aa3bb', '#5a6078');
      else if (kind === 'spike') wires(p, x, y, C.cyan, '#ffffff');
    },
    props: {
      1: (p, x, y) => { // tall rack
        p.rect(x, y - 48, 30, 48, '#1c2440'); p.rect(x + 2, y - 46, 26, 45, '#0c1224');
        for (let i = 0; i < 9; i++) { p.rect(x + 3, y - 44 + i * 5, 24, 3, '#26304e'); if (H(x, i) > 0.4) p.rect(x + 23, y - 43 + i * 5, 2, 1, C.green); }
      },
      2: (p, x, y) => { // cable bundle
        for (let i = 0; i < 4; i++) p.line(x + i * 3, y, x + 6 + i * 3, y - 40, ['#ff4f4f', '#3a6cff', C.yellow, C.green][i], 1);
      },
      3: (p, x, y) => { // warning sign
        p.rect(x + 7, y - 16, 2, 16, '#5a6078');
        p.rect(x + 1, y - 30, 14, 14, C.yellow); p.rect(x + 3, y - 28, 10, 10, C.ink);
        p.rect(x + 7, y - 27, 2, 5, C.yellow); p.rect(x + 7, y - 21, 2, 2, C.yellow);
      },
      4: (p, x, y) => { // cooling unit
        p.rect(x, y - 24, 32, 24, '#8a90a8'); p.rect(x + 2, y - 22, 28, 20, '#5a6078');
        p.ring(x + 9, y - 12, 6, '#262b40', 2); p.ring(x + 23, y - 12, 6, '#262b40', 2);
      },
    },
    layers: [
      { speed: 0.15, vy: 0.05, y: 0, frames: 2, build: (f) => layerCanvas(240, 240, (p) => racks(p, 240, 240, f, false)) },
      { speed: 0.5, vy: 0.25, y: -20, frames: 2, build: (f) => layerCanvas(256, 280, (p) => {
        p.rect(0, 0, 256, 18, '#0a0e1c');
        for (let i = 0; i < 256; i += 16) p.rect(i, 18, 2, 14, '#2a3048');
        p.rect(0, 28, 256, 4, '#2a3048');
        racks(p, 256, 280, f, true);
      }) },
    ],
  };

  // ---- Stage 3: The Cloud (a digital realm) ------------------------------------------------
  themes.cloud = {
    sky: [[0, '#0a0420'], [0.5, '#2a0a50'], [1, '#5a1a7a']],
    tile(p, kind, x, y, tx, ty) {
      if (kind === 'top' || kind === 'fill') {
        p.rect(x, y, 16, 16, '#160a30');
        p.rect(x, y, 16, 1, '#3a1a6a'); p.rect(x, y, 1, 16, '#3a1a6a');
        if (H(tx, ty) > 0.8) p.rect(x + 6, y + 6, 4, 4, '#2a1050');
        if (kind === 'top') { p.rect(x, y, 16, 3, C.cyan); p.rect(x, y + 3, 16, 1, '#1a8ac0'); p.rect(x, y, 16, 1, '#e0ffff'); }
      } else if (kind === 'oneway') {
        p.rect(x, y, 16, 4, 'rgba(63,242,255,0.55)'); p.rect(x, y, 16, 1, '#e0ffff'); p.rect(x, y + 4, 16, 1, '#1a8ac0');
      } else if (kind === 'slopeR' || kind === 'slopeL') slope(p, x, y, kind === 'slopeR' ? 1 : -1, '#160a30', C.cyan, '#1a8ac0');
      else if (kind === 'spike') {
        for (let i = 0; i < 4; i++) { p.line(x + i * 4, y + 15, x + i * 4 + 2, y + 4, C.red, 2); p.line(x + i * 4 + 2, y + 4, x + i * 4 + 4, y + 15, C.magenta, 1); }
        p.rect(x, y + 14, 16, 2, '#5a0a3a');
      }
    },
    props: {
      1: (p, x, y) => { // floating cube
        p.rect(x + 2, y - 36, 12, 12, C.purpleD); p.rect(x + 3, y - 35, 10, 10, C.purple); p.rect(x + 5, y - 33, 4, 4, '#e0c8ff');
      },
      2: (p, x, y) => { // neon "</>" sign
        p.rect(x, y - 40, 32, 16, '#1a0a3a'); p.rect(x, y - 40, 32, 1, C.pink); p.rect(x, y - 25, 32, 1, C.pink);
        G.Font.draw(p.c, '</>', x + 7, y - 36, C.cyan);
      },
      3: (p, x, y) => { // antenna mast
        p.rect(x + 7, y - 40, 2, 40, '#8a90a8'); p.ring(x + 8, y - 42, 4, C.cyan, 1); p.rect(x + 7, y - 43, 2, 2, C.pink);
      },
    },
    layers: [
      { speed: 0.1, vy: 0.03, y: 0, build: () => layerCanvas(320, 240, (p) => {
        for (let i = 0; i < 90; i++) p.px(H(i, 7) * 320, H(i, 8) * 200, H(i, 9) > 0.7 ? '#ffffff' : '#9a7aff');
        for (let i = 0; i < 5; i++) {
          const cx = 30 + i * 66, cy = 60 + H(i, 4) * 70, col = i % 2 ? C.pink : C.cyan;
          for (let k = 0; k < 3; k++) p.ring(cx + (k - 1) * 12, cy - (k === 1 ? 6 : 0), 10 + (k === 1 ? 4 : 0), col, 1);
        }
        for (let i = 0; i < 320; i += 20) p.line(i, 240, 160 + (i - 160) * 0.3, 160, '#4a1a7a', 1);
        for (let j = 0; j < 5; j++) p.rect(0, 170 + j * j * 3, 320, 1, '#4a1a7a');
      }) },
      { speed: 0.4, vy: 0.2, y: 0, scrollY: 0.4, build: () => layerCanvas(256, 256, (p, x) => {
        for (let col = 0; col < 16; col++) {
          if (H(col, 11) < 0.45) continue;
          for (let r = 0; r < 18; r++) {
            const ch = H(col, r) > 0.5 ? '1' : '0';
            const bright = (r % 9) === 8;
            G.Font.draw(x, ch, col * 16 + 4, r * 14 + Math.floor(H(col, 2) * 14), bright ? '#d0fff0' : (r % 9) > 5 ? '#2ad08a' : '#146a4a');
          }
        }
      }) },
    ],
  };

  // ---- Stage 4: the Nexus core ---------------------------------------------------------------
  themes.core = {
    sky: [[0, '#0a0206'], [0.6, '#2a0612'], [1, '#5a0a1a']],
    tile(p, kind, x, y, tx, ty) {
      if (kind === 'top' || kind === 'fill') {
        p.rect(x, y, 16, 16, '#22121c'); p.rect(x, y, 16, 1, '#3a1a28'); p.rect(x, y, 1, 16, '#3a1a28');
        p.rect(x + 3, y + 3, 1, 1, '#5a2a3a'); p.rect(x + 12, y + 12, 1, 1, '#5a2a3a');
        if (kind === 'top') { p.rect(x, y, 16, 4, '#5a5f78'); p.rect(x, y, 16, 1, '#c8ccd8'); p.rect(x, y + 4, 16, 1, C.red); }
      } else if (kind === 'oneway') {
        p.rect(x, y, 16, 4, '#5a5f78'); p.rect(x, y, 16, 1, '#c8ccd8'); p.rect(x + 2, y + 4, 12, 1, C.red);
      } else if (kind === 'slopeR' || kind === 'slopeL') slope(p, x, y, kind === 'slopeR' ? 1 : -1, '#22121c', '#c8ccd8', C.red);
      else if (kind === 'spike') {
        p.rect(x, y + 10, 16, 6, '#5a0a1a');
        for (let i = 0; i < 16; i += 2) p.rect(x + i, y + 6 + (H(tx * 16 + i, 1) * 5 | 0), 2, 6, i % 4 ? C.orange : C.yellow);
      }
    },
    props: {
      1: (p, x, y) => { p.rect(x + 4, y - 44, 8, 44, '#3a2a34'); p.rect(x + 6, y - 44, 4, 44, '#5a3a4a'); for (let i = 0; i < 5; i++) p.rect(x + 6, y - 40 + i * 8, 4, 2, C.red); },
      2: (p, x, y) => { p.rect(x + 7, y - 16, 2, 16, '#5a6078'); p.rect(x + 1, y - 30, 14, 14, C.red); G.Font.draw(p.c, '!', x + 5, y - 27, '#ffffff'); },
      3: (p, x, y) => { p.rect(x + 2, y - 30, 12, 30, '#3a2a34'); p.ring(x + 8, y - 20, 4, C.orange, 1); },
    },
    layers: [
      { speed: 0.08, vy: 0.03, y: 0, build: () => layerCanvas(240, 240, (p) => {
        for (let r = 0; r < 12; r++) for (let c = 0; c < 10; c++) {
          const cx = c * 26 + (r % 2) * 13, cy = r * 22;
          p.ring(cx, cy, 11, H(c, r) > 0.85 ? '#7a1a2a' : '#3a0a16', 1);
        }
      }) },
      { speed: 0.45, vy: 0.2, y: -10, build: () => layerCanvas(256, 280, (p) => {
        for (let x = 10; x < 256; x += 64) {
          p.rect(x, 0, 20, 280, '#2a1620'); p.rect(x + 3, 0, 14, 280, '#3a2030');
          for (let y = 10; y < 280; y += 24) { p.rect(x + 7, y, 6, 10, C.redD); p.rect(x + 8, y + 2, 4, 6, C.orange); }
        }
        p.rect(0, 200, 256, 6, '#3a2030'); p.rect(0, 40, 256, 4, '#3a2030');
      }) },
    ],
    overlay(ctx, cam, t) {
      // pulsing core glow in the far distance
      const a = 0.12 + Math.sin(t * 0.05) * 0.06;
      const g = ctx.createRadialGradient(G.W / 2, 60, 4, G.W / 2, 60, 120);
      g.addColorStop(0, `rgba(255,60,60,${a * 2})`); g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, G.W, G.H);
    },
  };

  // build (and cache) the layer canvases of a theme
  function prepare(name) {
    const th = themes[name];
    if (th.ready) return th;
    for (const L of th.layers) {
      const n = L.frames || 1;
      L.canvases = [];
      for (let f = 0; f < n; f++) L.canvases.push(L.build(f));
    }
    th.ready = true;
    return th;
  }

  // draw sky + parallax layers for a camera position
  function drawBackground(ctx, th, cam, t) {
    if (!th.grad) {
      th.grad = ctx.createLinearGradient(0, 0, 0, G.H);
      for (const [s, c] of th.sky) th.grad.addColorStop(s, c);
    }
    ctx.fillStyle = th.grad; ctx.fillRect(0, 0, G.W, G.H);
    if (th.overlay) th.overlay(ctx, cam, t);
    for (const L of th.layers) {
      const c = L.canvases[L.canvases.length > 1 ? Math.floor(t / 20) % L.canvases.length : 0];
      const w = c.width;
      let ox = -Math.floor((cam.x * L.speed) % w);
      if (ox > 0) ox -= w;
      const y = Math.round(L.y - cam.y * L.vy);
      if (L.scrollY) {
        const h = c.height, sy = Math.floor((t * L.scrollY) % h);
        for (let x = ox; x < G.W; x += w) { ctx.drawImage(c, x, y + sy - h); ctx.drawImage(c, x, y + sy); }
      } else for (let x = ox; x < G.W; x += w) ctx.drawImage(c, x, y);
    }
  }

  return { themes, prepare, drawBackground, get: (n) => prepare(n) };
})();
