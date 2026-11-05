// audio.js: WebAudio synthesizer. Two parts:
//  - SFX: short synthesized effects (oscillator sweeps + filtered noise), G.Audio.sfx(name)
//  - Music: a small tracker/sequencer that plays the song data of music.js on four
//    chiptune channels (pulse lead, pulse arpeggio, filtered-saw bass, noise drums).
'use strict';
G.Audio = (() => {
  let ctx = null, master, musicBus, sfxBus, noiseBuf, echoIn;
  const waves = {};
  const vol = { music: G.store.get('musicVol', 0.7), sfx: G.store.get('sfxVol', 0.8) };
  let pending = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0.55;
    master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = vol.music; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
    // echo send for the lead channel (that Streets-of-Rage FM sheen)
    echoIn = ctx.createGain(); echoIn.gain.value = 0.22;
    const dl = ctx.createDelay(1); dl.delayTime.value = 0.27;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(musicBus);
    // white noise buffer
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // pulse waves with NES-like duty cycles
    for (const duty of [0.125, 0.25, 0.5]) {
      const n = 40, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      waves[duty] = ctx.createPeriodicWave(re, im);
    }
    if (pending) { const p = pending; pending = null; playMusic(p); }
  }

  const now = () => ctx.currentTime;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function setWave(o, w) {
    if (typeof w === 'number') o.setPeriodicWave(waves[w]); else o.type = w;
  }

  // one oscillator voice with a pitch sweep and an exponential decay
  function tone(o) {
    if (!ctx) return;
    const t = (o.at || now()) + (o.delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    setWave(osc, o.wave ?? 0.5);
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + (o.slide || o.dur));
    const v = o.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.setTargetAtTime(0, t + (o.hold || 0) + 0.004, o.dur / 3);
    osc.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + (o.hold || 0) + o.dur * 1.6 + 0.05);
  }

  function noise(o) {
    if (!ctx) return;
    const t = (o.at || now()) + (o.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter(); f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.f0 || 1000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain(), v = o.vol ?? 0.3;
    g.gain.setValueAtTime(v, t);
    g.gain.setTargetAtTime(0, t + 0.002, o.dur / 3);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur * 1.6 + 0.05);
  }

  const arp = (notes, step, o = {}) => notes.forEach((f, i) =>
    tone({ wave: o.wave ?? 0.25, f0: f, dur: o.dur || step * 1.5, vol: o.vol ?? 0.18, delay: i * step }));

  // ---- the sound effect library -------------------------------------------------------
  const SFX = {
    jump: () => tone({ wave: 0.25, f0: 280, f1: 720, dur: 0.12, vol: 0.18, slide: 0.1 }),
    land: () => noise({ filter: 'lowpass', f0: 500, dur: 0.07, vol: 0.25 }),
    step: () => noise({ filter: 'lowpass', f0: 300, dur: 0.03, vol: 0.08 }),
    whiff: () => noise({ filter: 'highpass', f0: 2600, f1: 900, dur: 0.07, vol: 0.12 }),
    punch: () => { noise({ f0: 1300, dur: 0.06, vol: 0.45, q: 0.8 }); tone({ wave: 'sine', f0: 180, f1: 60, dur: 0.08, vol: 0.5 }); },
    heavy: () => { noise({ f0: 900, dur: 0.12, vol: 0.55, q: 0.6 }); tone({ wave: 'sine', f0: 140, f1: 40, dur: 0.16, vol: 0.6 }); tone({ wave: 0.5, f0: 90, f1: 50, dur: 0.1, vol: 0.12 }); },
    hurt: () => { tone({ wave: 0.5, f0: 420, f1: 140, dur: 0.22, vol: 0.22 }); noise({ f0: 700, dur: 0.1, vol: 0.3 }); },
    enemyHurt: () => tone({ wave: 0.125, f0: 700, f1: 280, dur: 0.08, vol: 0.12 }),
    enemyDie: () => { tone({ wave: 0.5, f0: 900, f1: 70, dur: 0.4, vol: 0.18 }); noise({ filter: 'lowpass', f0: 3000, f1: 200, dur: 0.35, vol: 0.25 }); },
    explode: () => { noise({ filter: 'lowpass', f0: 1800, f1: 80, dur: 0.6, vol: 0.6 }); tone({ wave: 'sine', f0: 110, f1: 30, dur: 0.4, vol: 0.5 }); },
    bit: () => { tone({ wave: 0.25, f0: 988, dur: 0.05, vol: 0.13 }); tone({ wave: 0.25, f0: 1480, dur: 0.18, vol: 0.13, delay: 0.05 }); },
    pickup: () => arp([523, 659, 784, 1047], 0.05),
    heal: () => arp([392, 523, 659, 784, 1047], 0.06, { wave: 0.5, vol: 0.14 }),
    oneup: () => arp([659, 784, 1319, 1047, 1175, 1568], 0.08, { vol: 0.16 }),
    special: () => { tone({ wave: 'sawtooth', f0: 90, f1: 1400, dur: 0.45, vol: 0.18, slide: 0.4 }); noise({ filter: 'highpass', f0: 400, f1: 6000, dur: 0.5, vol: 0.3 }); },
    dash: () => noise({ f0: 500, f1: 3200, dur: 0.2, vol: 0.28, q: 1.5 }),
    spring: () => { tone({ wave: 0.25, f0: 180, f1: 900, dur: 0.3, vol: 0.2, slide: 0.25 }); tone({ wave: 0.5, f0: 360, f1: 1400, dur: 0.2, vol: 0.06 }); },
    boost: () => { tone({ wave: 0.125, f0: 400, f1: 1800, dur: 0.18, vol: 0.18 }); noise({ f0: 1500, f1: 5000, dur: 0.2, vol: 0.2 }); },
    menu: () => tone({ wave: 0.125, f0: 660, dur: 0.04, vol: 0.14 }),
    select: () => { tone({ wave: 0.5, f0: 880, dur: 0.05, vol: 0.14 }); tone({ wave: 0.5, f0: 1320, dur: 0.1, vol: 0.14, delay: 0.05 }); },
    pause: () => { tone({ wave: 0.25, f0: 1047, dur: 0.06, vol: 0.14 }); tone({ wave: 0.25, f0: 784, dur: 0.08, vol: 0.14, delay: 0.07 }); },
    block: () => { tone({ wave: 'triangle', f0: 2200, f1: 1400, dur: 0.1, vol: 0.3 }); noise({ filter: 'highpass', f0: 3000, dur: 0.06, vol: 0.2 }); },
    crate: () => { noise({ f0: 600, dur: 0.22, vol: 0.4, q: 0.5 }); tone({ wave: 0.5, f0: 260, f1: 90, dur: 0.15, vol: 0.12 }); },
    laser: () => tone({ wave: 0.125, f0: 1600, f1: 300, dur: 0.18, vol: 0.14 }),
    shoot: () => tone({ wave: 0.25, f0: 900, f1: 500, dur: 0.08, vol: 0.12 }),
    throw: () => noise({ f0: 400, f1: 1600, dur: 0.18, vol: 0.25 }),
    stomp: () => { tone({ wave: 0.5, f0: 240, f1: 70, dur: 0.12, vol: 0.2 }); noise({ filter: 'lowpass', f0: 900, dur: 0.08, vol: 0.3 }); },
    roar: () => { tone({ wave: 'sawtooth', f0: 140, f1: 55, dur: 0.9, vol: 0.25, slide: 0.8 }); noise({ filter: 'lowpass', f0: 900, f1: 120, dur: 0.9, vol: 0.35 }); },
    warn: () => { for (let i = 0; i < 3; i++) { tone({ wave: 0.5, f0: 880, dur: 0.07, vol: 0.12, delay: i * 0.2 }); tone({ wave: 0.5, f0: 660, dur: 0.07, vol: 0.12, delay: i * 0.2 + 0.1 }); } },
    checkpoint: () => arp([523, 784, 1047, 1568], 0.07, { wave: 0.125, vol: 0.15 }),
    glitch: () => { for (let i = 0; i < 5; i++) tone({ wave: 0.125, f0: 200 + Math.random() * 1800, dur: 0.03, vol: 0.08, delay: i * 0.03 }); },
    crumble: () => noise({ filter: 'lowpass', f0: 1200, f1: 200, dur: 0.25, vol: 0.25 }),
    zap: () => { tone({ wave: 0.125, f0: 2400, f1: 600, dur: 0.12, vol: 0.12 }); noise({ filter: 'highpass', f0: 4000, dur: 0.1, vol: 0.18 }); },
    go: () => arp([784, 988, 1175], 0.06, { wave: 0.5, vol: 0.12 }),
    combo: () => tone({ wave: 0.25, f0: 1200, f1: 1800, dur: 0.06, vol: 0.08 }),
    // Alex's 'voice': a quick chirpy babble under each quip
    voice: () => { for (let i = 0; i < 4; i++) tone({ wave: 0.125, f0: 300 + Math.random() * 160, f1: 260 + Math.random() * 200, dur: 0.05, vol: 0.08, delay: i * 0.06 }); },
  };

  function sfx(name) {
    if (!ctx || !SFX[name]) return;
    SFX[name]();
  }

  // dialog "voice": a pitched pulse blip per letter
  function blip(pitch) {
    if (!ctx) return;
    tone({ wave: 0.125, f0: pitch * (0.92 + Math.random() * 0.16), dur: 0.035, vol: 0.07 });
  }

  // ---- music sequencer ------------------------------------------------------------------
  let song = null, songId = null, step = 0, nextT = 0, timer = null, songGain = null;
  const chan = {};   // active voice per melodic channel

  function release(name, t) {
    const v = chan[name];
    if (!v) return;
    v.g.gain.setTargetAtTime(0, t, v.rel);
    v.o.stop(t + v.rel * 8);
    chan[name] = null;
  }

  function startVoice(name, midi, t, spec) {
    release(name, t);
    const o = ctx.createOscillator(), g = ctx.createGain();
    setWave(o, spec.wave);
    o.frequency.setValueAtTime(mtof(midi), t);
    let out = g;
    if (spec.lp) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = spec.lp; f.Q.value = 3;
      g.connect(f); out = f;
    }
    if (spec.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 5.5; lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(mtof(midi) * 0.012, t + 0.25);
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 4);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(spec.vol, t + 0.006);
    g.gain.setTargetAtTime(spec.vol * spec.sus, t + 0.006, spec.dec);
    o.connect(g); out.connect(songGain);
    if (spec.echo) out.connect(echoIn);
    o.start(t);
    o.stop(t + 6); // safety stop; normally released earlier
    chan[name] = { o, g, rel: spec.rel };
  }

  function drum(ch, t) {
    const bus = songGain;
    if (ch === 'k') { tone({ at: t, wave: 'sine', f0: 170, f1: 42, dur: 0.14, vol: 0.75, slide: 0.12, bus }); noise({ at: t, filter: 'lowpass', f0: 2000, dur: 0.02, vol: 0.15, bus }); }
    else if (ch === 's') { noise({ at: t, f0: 1800, q: 0.7, dur: 0.14, vol: 0.42, bus }); tone({ at: t, wave: 'triangle', f0: 220, f1: 140, dur: 0.06, vol: 0.3, bus }); }
    else if (ch === 'h') noise({ at: t, filter: 'highpass', f0: 7500, dur: 0.03, vol: 0.13, bus });
    else if (ch === 'o') noise({ at: t, filter: 'highpass', f0: 6500, dur: 0.14, vol: 0.12, bus });
    else if (ch === 't') tone({ at: t, wave: 'sine', f0: 220, f1: 110, dur: 0.15, vol: 0.45, bus });
    else if (ch === 'c') noise({ at: t, filter: 'highpass', f0: 4000, dur: 0.6, vol: 0.16, bus });
  }

  const SPECS = {
    lead: { wave: 0.25, vol: 0.13, sus: 0.7, dec: 0.25, rel: 0.03, vib: true, echo: true },
    arp: { wave: 0.125, vol: 0.055, sus: 0.4, dec: 0.06, rel: 0.02 },
    bass: { wave: 'sawtooth', vol: 0.16, sus: 0.55, dec: 0.12, rel: 0.02, lp: 950 },
  };

  function tick() {
    if (!song) return;
    const sd = 60 / song.bpm / 4;
    while (nextT < now() + 0.15) {
      if (step >= song.len) {
        if (!song.loop) { stopMusic(); return; }
        step = song.loopStep || 0;
      }
      for (const name of ['lead', 'arp', 'bass']) {
        const ev = song[name][step];
        if (ev === undefined || ev === 'h') continue;          // hold
        if (ev === null) release(name, nextT);                  // rest
        else startVoice(name, ev, nextT, song.specs[name] || SPECS[name]);
      }
      const dr = song.drums[step];
      if (dr) for (const c of dr) drum(c, nextT);
      step++;
      nextT += sd;
    }
  }

  function playMusic(id) {
    if (!ctx) { pending = id; return; }
    if (songId === id && song) return;
    stopMusic();
    const s = G.Songs.compile(id);
    if (!s) return;
    song = s; songId = id; step = 0; nextT = now() + 0.06;
    songGain = ctx.createGain(); songGain.gain.value = 1; songGain.connect(musicBus);
    timer = setInterval(tick, 25);
    tick();
  }

  function stopMusic(fade) {
    if (timer) clearInterval(timer);
    timer = null;
    if (ctx) for (const n in chan) release(n, now());
    if (songGain && ctx) {
      const g = songGain;
      g.gain.setTargetAtTime(0, now(), fade ? 0.4 : 0.02);
      setTimeout(() => g.disconnect(), fade ? 2500 : 300);
    }
    song = null; songId = null; songGain = null; pending = null;
  }

  function setVol(kind, v) {
    vol[kind] = G.u.clamp(v, 0, 1);
    G.store.set(kind + 'Vol', vol[kind]);
    if (ctx) (kind === 'music' ? musicBus : sfxBus).gain.value = vol[kind];
  }

  return {
    init, sfx, blip, playMusic, stopMusic, setVol, vol,
    get current() { return songId || pending; },
    get ready() { return !!ctx; },
  };
})();
