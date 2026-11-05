// input.js: keyboard + gamepad mapped to abstract actions, sampled once per fixed step.
// Presses are latched from the key events, so a tap shorter than one frame is never lost.
'use strict';
G.Input = (() => {
  const binds = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['KeyZ', 'Space', 'KeyK'],
    attack: ['KeyX', 'KeyJ'],
    special: ['KeyC', 'KeyL'],
    dash: ['ShiftLeft', 'ShiftRight', 'KeyV', 'Semicolon'],
    start: ['Enter', 'Escape', 'KeyP'],
    confirm: ['Enter', 'KeyZ', 'Space', 'KeyX', 'KeyJ', 'KeyK'],
    back: ['Escape', 'Backspace'],
  };
  // standard gamepad mapping
  const padBinds = {
    left: [14], right: [15], up: [12], down: [13],
    jump: [0], attack: [2], special: [3], dash: [1, 5, 7],
    start: [9], confirm: [0, 9], back: [1, 8],
  };
  const held = new Set();
  const hits = new Set();
  let anyHit = false;
  const state = {}, prev = {}, pressed = {};
  for (const a in binds) { state[a] = prev[a] = pressed[a] = false; }

  const block = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Backspace']);
  addEventListener('keydown', (e) => {
    if (block.has(e.code)) e.preventDefault();
    if (!e.repeat) { hits.add(e.code); anyHit = true; }
    held.add(e.code);
    if (e.code === 'F2') G.DEBUG = !G.DEBUG;
    if (G.Audio) G.Audio.init();
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());
  addEventListener('pointerdown', () => { anyHit = true; if (G.Audio) G.Audio.init(); });

  let padPrev = [];
  function padState() {
    const out = {};
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let padAny = false;
    for (const p of pads) {
      if (!p) continue;
      for (const a in padBinds) {
        for (const b of padBinds[a]) if (p.buttons[b] && p.buttons[b].pressed) out[a] = true;
      }
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (ax < -0.4) out.left = true;
      if (ax > 0.4) out.right = true;
      if (ay < -0.5) out.up = true;
      if (ay > 0.5) out.down = true;
      p.buttons.forEach((b, i) => { if (b.pressed && !padPrev[i]) padAny = true; padPrev[i] = b.pressed; });
    }
    return { out, padAny };
  }

  return {
    update() {
      const { out, padAny } = padState();
      for (const a in binds) {
        prev[a] = state[a];
        let d = !!out[a], hit = false;
        for (const k of binds[a]) { if (held.has(k)) d = true; if (hits.has(k)) hit = true; }
        state[a] = d;
        pressed[a] = (d && !prev[a]) || hit;
      }
      this.any = anyHit || padAny;
      anyHit = false;
      hits.clear();
    },
    down: (a) => state[a],
    pressed: (a) => pressed[a],
    any: false,
    // horizontal axis -1 / 0 / 1
    dirX: () => (state.right ? 1 : 0) - (state.left ? 1 : 0),
    // swallow presses (e.g. when a menu closes, so the confirm does not also attack)
    flush() { for (const a in pressed) pressed[a] = false; },
  };
})();
