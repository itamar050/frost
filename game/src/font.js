// font.js: a 5x7 bitmap font (uppercase; lowercase is drawn as uppercase), cached per color.
'use strict';
G.Font = (() => {
  // each glyph: 7 rows of 5 bits (MSB = leftmost pixel)
  const GLYPHS = {
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
    D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
    G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
    J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
    S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
    V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
    3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
    6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
    9: [14, 17, 17, 15, 1, 2, 12],
    ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8],
    '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4], ':': [0, 12, 12, 0, 12, 12, 0],
    ';': [0, 12, 12, 0, 12, 4, 8], '-': [0, 0, 0, 31, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0],
    '/': [0, 1, 2, 4, 8, 16, 0], "'": [4, 4, 8, 0, 0, 0, 0], '"': [10, 10, 10, 0, 0, 0, 0],
    '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '<': [2, 4, 8, 16, 8, 4, 2],
    '>': [8, 4, 2, 1, 2, 4, 8], '=': [0, 0, 31, 0, 31, 0, 0], '*': [0, 4, 21, 14, 21, 4, 0],
    '%': [24, 25, 2, 4, 8, 19, 3], '#': [10, 10, 31, 10, 31, 10, 10], '_': [0, 0, 0, 0, 0, 0, 31],
    '@': [14, 17, 1, 13, 21, 21, 14], '&': [12, 18, 20, 8, 21, 18, 13], '$': [4, 15, 20, 14, 5, 30, 4],
    '[': [14, 8, 8, 8, 8, 8, 14], ']': [14, 2, 2, 2, 2, 2, 14], '|': [4, 4, 4, 4, 4, 4, 4],
    '^': [4, 10, 17, 0, 0, 0, 0], '~': [0, 0, 8, 21, 2, 0, 0],
    // icons: { = heart, } = arrow right, ` = note
    '{': [0, 10, 31, 31, 14, 4, 0], '}': [8, 12, 30, 31, 30, 12, 8], '`': [6, 5, 4, 4, 12, 28, 24],
  };
  const CHARS = Object.keys(GLYPHS);
  const INDEX = {};
  CHARS.forEach((c, i) => (INDEX[c] = i));
  const atlases = new Map();

  function atlas(color) {
    let a = atlases.get(color);
    if (a) return a;
    a = document.createElement('canvas');
    a.width = CHARS.length * 6; a.height = 7;
    const x = a.getContext('2d');
    x.fillStyle = color;
    CHARS.forEach((c, i) => {
      GLYPHS[c].forEach((row, y) => {
        for (let b = 0; b < 5; b++) if (row & (16 >> b)) x.fillRect(i * 6 + b, y, 1, 1);
      });
    });
    atlases.set(color, a);
    return a;
  }

  const width = (s, scale = 1) => String(s).length * 6 * scale - scale;

  // draw(ctx, text, x, y, color, {align: 'left'|'center'|'right', scale, shadow: color})
  function draw(ctx, str, x, y, color = G.C.white, o = {}) {
    str = String(str).toUpperCase();
    const sc = o.scale || 1;
    const w = width(str, sc);
    if (o.align === 'center') x -= Math.floor(w / 2);
    else if (o.align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    if (o.shadow) {
      draw(ctx, str, x + sc, y + sc, o.shadow, { scale: sc });
      if (o.outline) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) draw(ctx, str, x + dx * sc, y + dy * sc, o.shadow, { scale: sc });
    }
    const a = atlas(color);
    for (let i = 0; i < str.length; i++) {
      const k = INDEX[str[i]];
      if (k === undefined || str[i] === ' ') continue;
      ctx.drawImage(a, k * 6, 0, 5, 7, x + i * 6 * sc, y, 5 * sc, 7 * sc);
    }
  }

  // word-wrap to a maximum number of characters per line
  function wrap(str, max) {
    const out = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const w of para.split(' ')) {
        if ((line + (line ? ' ' : '') + w).length > max) { out.push(line); line = w; }
        else line += (line ? ' ' : '') + w;
      }
      out.push(line);
    }
    return out;
  }

  return { draw, width, wrap };
})();
