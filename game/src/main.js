// main.js: boot, integer scaling and the fixed-timestep loop (logic at exactly 60 Hz,
// rendering once per display frame).
'use strict';
(() => {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const params = new URLSearchParams(location.search);
  G.unlockAll = params.has('debug') || params.has('unlock');
  if (params.has('debug')) G.DEBUG = true;

  function resize() {
    const s = Math.min(innerWidth / G.W, innerHeight / G.H);
    const scale = s >= 1 ? Math.floor(s) : s;
    canvas.style.width = Math.floor(G.W * scale) + 'px';
    canvas.style.height = Math.floor(G.H * scale) + 'px';
  }
  addEventListener('resize', resize);
  resize();

  G.game = {
    scene: null,
    set(s) { this.scene = s; G.Input.flush(); },
  };

  // ?stage=N jumps straight into a stage (handy while building levels)
  if (params.has('stage')) {
    G.newSession(G.u.clamp((+params.get('stage') || 1) - 1, 0, G.Stages.length - 1));
    G.game.set(new G.Scenes.Play(G.session.stage, -1));
  } else G.game.set(new G.Scenes.Boot());

  const STEP = 1000 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(now - last, 100);
    last = now;
    while (acc >= STEP) {
      G.Input.update();
      G.game.scene.update();
      acc -= STEP;
    }
    G.game.scene.draw(ctx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // test hook: advance the simulation without rendering (used by automated checks)
  G.step = (n = 1) => { for (let i = 0; i < n; i++) { G.Input.update(); G.game.scene.update(); } };
})();
