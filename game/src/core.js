// core.js: the global namespace, constants, small helpers and the master palette.
'use strict';
const G = (window.G = window.G || {});

G.W = 320;          // internal resolution (Mega Drive-style 320x224)
G.H = 224;
G.TS = 16;          // tile size in pixels
G.GRAV = 0.38;      // gravity, px/frame^2 (all physics runs at a fixed 60 Hz)
G.MAXFALL = 7;
G.frame = 0;        // global frame counter (for blinking etc.)
G.DEBUG = false;    // F2 toggles hitbox drawing

G.u = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  approach: (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t)),
  rand: (a, b) => a + Math.random() * (b - a),
  randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  sign: (v) => (v < 0 ? -1 : v > 0 ? 1 : 0),
  // axis-aligned rectangles {x, y, w, h} (x, y = top-left)
  overlap: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
  dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
  // deterministic hash of integers -> [0, 1): used for decor placement and LEDs
  hash(a, b = 0) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  },
};

// localStorage wrapper that never throws (private windows, blocked storage)
G.store = {
  get(k, d) {
    try { const v = localStorage.getItem('hotfix.' + k); return v == null ? d : JSON.parse(v); }
    catch (e) { return d; }
  },
  set(k, v) { try { localStorage.setItem('hotfix.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

// Master palette: bright, saturated 16-bit colors. Art code refers to these by name.
G.C = {
  ink: '#120c1c', black: '#0d0b14', white: '#fff8ee', grey: '#9aa0b4', greyD: '#5d6278', greyL: '#d3d7e6',
  skin: '#f6c08f', skinD: '#d08a5c', skin2: '#b8774d', skin2D: '#8a5233',
  hair: '#5b3120', hairD: '#36190e', blond: '#ffd65a', blondD: '#d39a26',
  hood: '#1ea7e1', hoodD: '#126fa6', hoodL: '#86e3ff',
  jeans: '#2f3f80', jeansD: '#1d2655',
  shoe: '#f0383b', shoeD: '#a8191f',
  pack: '#f58c25', packD: '#b05a10',
  red: '#ef3b3b', redD: '#a01b28', orange: '#ff8a1e', yellow: '#ffe14d', yellowD: '#d8a420',
  green: '#4be05a', greenD: '#1f9a3a', lime: '#b8ff4a', teal: '#2fe0c0', tealD: '#13917f',
  blue: '#3a6cff', blueD: '#2238a8', navy: '#1b2350', purple: '#9b4dff', purpleD: '#5a23a8',
  pink: '#ff4fb8', pinkD: '#b0257a', magenta: '#ff2bd6', cyan: '#3ff2ff',
  suit: '#47587e', suitD: '#2d3a58', gold: '#ffc83a',
};
