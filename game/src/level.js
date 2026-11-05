// level.js: tile maps built from ASCII chunks, tile collision (solid, one-way, 45° slopes),
// hazards and the pre-rendered static tile layer.
//
// Map legend (see README.md for the full list):
//   #  solid      =  one-way platform     /  slope rising right     \  slope rising left
//   ^  hazard (exposed wires / glitch spikes)      1-9  theme props (decoration only)
//   any other character is an entity spawn, read by world.js
'use strict';
G.Level = (() => {
  const TS = G.TS;
  const T = { EMPTY: 0, SOLID: 1, ONEWAY: 2, SLOPE_R: 3, SLOPE_L: 4, SPIKE: 5 };
  const TILE_CH = { '#': T.SOLID, '=': T.ONEWAY, '/': T.SLOPE_R, '\\': T.SLOPE_L, '^': T.SPIKE };

  // chunks are template strings; they are joined left to right, aligned at the bottom
  function joinChunks(chunks, minRows = 16) {
    const parsed = chunks.map((s) => {
      const lines = s.split('\n');
      while (lines.length && !lines[0].trim()) lines.shift();
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      const w = Math.max(...lines.map((l) => l.length));
      return { lines: lines.map((l) => l.padEnd(w, ' ')), w };
    });
    const rows = Math.max(minRows, ...parsed.map((p) => p.lines.length));
    const out = new Array(rows).fill('');
    for (const p of parsed) {
      const pad = rows - p.lines.length;
      for (let r = 0; r < rows; r++) out[r] += r < pad ? ' '.repeat(p.w) : p.lines[r - pad];
    }
    return out;
  }

  class Level {
    constructor(def) {
      this.def = def;
      const rows = joinChunks(def.chunks, def.minRows);
      this.rows = rows.length;
      this.cols = rows[0].length;
      this.w = this.cols * TS;
      this.h = this.rows * TS;
      this.tiles = new Uint8Array(this.cols * this.rows);
      this.spawns = [];
      this.props = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const ch = rows[r][c];
          if (ch === ' ' || ch === '.') continue;
          if (TILE_CH[ch] !== undefined) this.tiles[r * this.cols + c] = TILE_CH[ch];
          else if (ch >= '1' && ch <= '9') this.props.push({ ch, c, r });
          else this.spawns.push({ ch, c, r, x: c * TS + TS / 2, y: (r + 1) * TS });
        }
      }
      this.spawns.sort((a, b) => a.c - b.c || a.r - b.r);
    }

    get(c, r) {
      if (c < 0 || c >= this.cols) return T.SOLID;
      if (r < 0 || r >= this.rows) return T.EMPTY;
      return this.tiles[r * this.cols + c];
    }
    solid(c, r) { return this.get(c, r) === T.SOLID; }

    slopeY(t, c, r, x) {
      const lx = G.u.clamp(x - c * TS, 0, TS);
      return r * TS + (t === T.SLOPE_R ? TS - lx : lx);
    }

    // highest walkable surface under body b between yMin and yMax
    surface(b, yMin, yMax, oldBot, plats) {
      const r0 = Math.floor(yMin / TS), r1 = Math.floor(yMax / TS);
      let best = null;
      const cx = Math.floor(b.x / TS);
      for (let r = r0; r <= r1; r++) {
        const t = this.get(cx, r);
        if (t === T.SLOPE_R || t === T.SLOPE_L) {
          const sy = this.slopeY(t, cx, r, b.x);
          if (sy >= yMin && sy <= yMax && (!best || sy < best.y)) best = { y: sy, type: 'slope' };
        }
      }
      if (!best) {
        const c0 = Math.floor((b.x - b.w / 2 + 1) / TS), c1 = Math.floor((b.x + b.w / 2 - 1) / TS);
        for (let c = c0; c <= c1; c++) {
          for (let r = r0; r <= r1; r++) {
            const t = this.get(c, r), sy = r * TS;
            if (sy < yMin || sy > yMax) continue;
            if (t === T.SOLID) {
              const above = this.get(c, r - 1);
              if (above === T.SOLID || above === T.SLOPE_R || above === T.SLOPE_L) continue;
              if (!best || sy < best.y) best = { y: sy, type: 'solid' };
            } else if (t === T.ONEWAY && sy >= oldBot - 0.01 && !(b.dropT > 0)) {
              if (!best || sy < best.y) best = { y: sy, type: 'oneway' };
            }
          }
        }
      }
      if (plats) {
        for (const p of plats) {
          if (p.dead || b.x + b.w / 2 <= p.x - p.w / 2 || b.x - b.w / 2 >= p.x + p.w / 2) continue;
          const sy = p.y, tol = b.platform === p ? 1 : Math.abs(p.dy || 0) + 1;
          if (sy >= oldBot - tol && sy <= yMax && (!best || sy < best.y)) best = { y: sy, type: 'plat', plat: p };
        }
      }
      return best;
    }

    // move a body with tile collision. Body: x = center, y = feet; w, h, vx, vy, onGround
    move(b, plats) {
      b.hitWall = 0; b.hitCeil = false;
      if (b.platform && !b.platform.dead) { b.x += b.platform.dx || 0; b.y += b.platform.dy || 0; }
      // horizontal
      if (b.vx !== 0) {
        b.x += b.vx;
        const top = b.y - b.h + 1, bot = b.y - (b.onGround ? 8 : 1);
        const r0 = Math.floor(top / TS), r1 = Math.floor(bot / TS);
        if (b.vx > 0) {
          const c = Math.floor((b.x + b.w / 2 - 0.01) / TS);
          for (let r = r0; r <= r1; r++) if (this.solid(c, r)) { b.x = c * TS - b.w / 2; b.hitWall = 1; break; }
        } else {
          const c = Math.floor((b.x - b.w / 2) / TS);
          for (let r = r0; r <= r1; r++) if (this.solid(c, r)) { b.x = (c + 1) * TS + b.w / 2; b.hitWall = -1; break; }
        }
      }
      // vertical
      if (b.vy < 0) {
        b.y += b.vy;
        const r = Math.floor((b.y - b.h) / TS);
        const c0 = Math.floor((b.x - b.w / 2 + 1) / TS), c1 = Math.floor((b.x + b.w / 2 - 1) / TS);
        for (let c = c0; c <= c1; c++) if (this.solid(c, r)) { b.y = (r + 1) * TS + b.h; b.vy = 0; b.hitCeil = true; break; }
        b.onGround = false; b.platform = null;
      } else {
        const oldBot = b.y;
        b.y += b.vy;
        const av = Math.abs(b.vx);
        const yMin = oldBot - (b.onGround ? 8 + av : 2 + av);
        const yMax = b.y + (b.onGround ? 6 + av : 0);
        const s = this.surface(b, yMin, yMax, oldBot, plats);
        const was = b.onGround;
        if (s) { b.y = s.y; b.landV = b.vy; b.vy = 0; b.onGround = true; b.platform = s.plat || null; b.ground = s.type; b.justLanded = !was; }
        else { b.onGround = false; b.platform = null; b.justLanded = false; }
      }
    }

    // does a rectangle touch a hazard tile?
    hazard(x, y, w, h) {
      const c0 = Math.floor(x / TS), c1 = Math.floor((x + w - 1) / TS);
      const r0 = Math.floor(y / TS), r1 = Math.floor((y + h - 1) / TS);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (this.get(c, r) === T.SPIKE && y + h > r * TS + 6) return true;
      }
      return false;
    }

    // first walkable surface at x at or below y0 (within maxD), or null
    groundAt(x, y0, maxD = 400) {
      const c = Math.floor(x / TS);
      for (let r = Math.max(0, Math.floor(y0 / TS)); r < this.rows && r * TS <= y0 + maxD; r++) {
        const t = this.get(c, r);
        if (t === T.SLOPE_R || t === T.SLOPE_L) { const sy = this.slopeY(t, c, r, x); if (sy >= y0 - 1) return sy; }
        if ((t === T.SOLID || t === T.ONEWAY) && r * TS >= y0 - 1) return r * TS;
      }
      return null;
    }

    // pre-render the static tile + prop layer
    render(theme) {
      const cv = G.Gfx.canvas(this.w, this.h);
      const p = new G.Gfx.Pen(cv.getContext('2d'));
      for (const pr of this.props) {
        const f = theme.props[pr.ch];
        if (f) f(p, pr.c * TS, (pr.r + 1) * TS);
      }
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const t = this.get(c, r);
          if (!t) continue;
          let kind;
          if (t === T.SOLID) {
            const a = r > 0 ? this.get(c, r - 1) : T.EMPTY;
            kind = a === T.SOLID || a === T.SLOPE_R || a === T.SLOPE_L ? 'fill' : 'top';
          } else kind = { 2: 'oneway', 3: 'slopeR', 4: 'slopeL', 5: 'spike' }[t];
          theme.tile(p, kind, c * TS, r * TS, c, r);
        }
      }
      this.canvas = cv;
      return cv;
    }
  }

  return { Level, T, joinChunks };
})();
