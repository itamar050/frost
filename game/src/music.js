// music.js: the soundtrack, written in a compact tracker notation and compiled for audio.js.
//
// A song is a tempo plus named sections played in `order`. Each section has:
//   chords: one chord per bar, e.g. "Am7 D7 Fmaj7 E7"
//   lead:   melody tokens, `res` steps (16th notes) each (default 2 = eighth notes):
//           note "c#5" / "eb4", "-" = hold the previous note, "." = rest
//   bass:   a style generated from the chord roots (octave, funk, drive, walk, gallop, sixteen, hold)
//   arp:    chord arpeggio style for the second pulse channel (up, updown, none)
//   drums:  a pattern name from DRUMS (one per bar, or an array with one entry per bar)
//   fill:   true = the last bar of the section uses the "fill" drum pattern
'use strict';
G.Songs = (() => {
  const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const QUAL = {
    '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
    sus: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], 5: [0, 7], add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14],
  };
  const DRUMS = {
    rock: 'k.h.s.h.k.khs.h.',
    disco: 'khohshohkhohshoh',
    break: 'k.h.s.hkk.hks.hs',
    boss: 'k.kks.k.k.kks.ss',
    half: 'k.......s.......',
    four: 'k.h.k.h.k.h.k.h.',
    fill: 's.s.s.sss.s.ssss',
    crash: 'c...............',
    none: '................',
  };
  const BASS = {
    octave: (r) => rep4([r, null, r + 12, null]),
    drive: (r) => rep4([r, 'h', r, null]),
    funk: (r) => [r, 'h', null, r, r + 12, null, r, null, r, 'h', null, r + 7, r + 12, null, r + 10, null],
    walk: (r) => [r, 'h', 'h', null, r + 7, 'h', 'h', null, r + 12, 'h', 'h', null, r + 7, 'h', 'h', null],
    gallop: (r) => rep4([r, null, r, r]),
    sixteen: (r) => rep4([r, r, r + 12, r]),
    hold: (r) => [r, 'h', 'h', 'h', 'h', 'h', 'h', 'h', 'h', 'h', 'h', 'h', 'h', 'h', null, null],
  };
  function rep4(a) { return a.concat(a, a, a); }

  function noteToMidi(tok) {
    const m = /^([a-g])(#|b)?(\d)$/.exec(tok);
    if (!m) throw new Error('bad note ' + tok);
    return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  function parseChord(c) {
    const m = /^([A-G])(#|b)?(.*)$/.exec(c);
    const root = NOTE[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return { root: (root + 12) % 12, tones: QUAL[m[3]] || QUAL[''] };
  }

  const data = {
    title: {
      bpm: 144, order: ['A', 'B'],
      sections: {
        A: { chords: 'C G Am F C G F G', bass: 'octave', arp: 'up', drums: 'rock', fill: true,
          lead: 'c5 . e5 g5 - - e5 g5  d6 - - b5 g5 - d5 -  c6 - b5 a5 - e5 a5 b5  c6 - - a5 f5 - c5 - ' +
                'e5 - g5 - c6 - d6 -  b5 - - g5 d6 - b5 -  a5 - c6 - f6 - e6 d6  d6 - - - b5 - g5 -' },
        B: { chords: 'Am F C G Am F G G', bass: 'octave', arp: 'updown', drums: 'disco', fill: true,
          lead: 'a5 - - e5 a5 - b5 c6  c6 - a5 - f5 - a5 -  g5 - - e5 c5 - e5 g5  b5 - - - g5 - d5 - ' +
                'a5 - c6 - e6 - d6 c6  c6 - - a5 f5 a5 c6 f6  e6 - d6 - b5 - g5 -  d6 - - - - - . .' },
      },
    },
    intro: {
      bpm: 96, order: ['A'],
      sections: {
        A: { chords: 'Am F C G', bass: 'walk', arp: 'up', drums: 'half',
          lead: 'e5 - - - - - d5 c5  c5 - - - - - a4 -  g4 - - - c5 - e5 -  d5 - - - - - . .' },
      },
    },
    stage1: {
      bpm: 122, order: ['A', 'A', 'B'],
      sections: {
        A: { chords: 'Am7 D7 Am7 D7 Fmaj7 Em7 Dm7 E7', bass: 'funk', arp: 'up', drums: 'disco', fill: true,
          lead: 'a4 . c5 d5 . e5 . g5  f#5 - e5 d5 - . a4 .  a4 . c5 d5 . e5 g5 a5  g5 - f#5 - e5 - d5 . ' +
                'c5 - e5 - a5 - g5 e5  g5 - - e5 d5 - b4 -  a4 - c5 - d5 - f5 -  e5 - - - g#5 - b5 -' },
        B: { chords: 'Fmaj7 G Em7 Am7 Fmaj7 G E7 E7', bass: 'funk', arp: 'updown', drums: 'disco', fill: true,
          lead: 'c6 - - a5 - g5 a5 -  b5 - - g5 - d5 - .  g5 - e5 - b5 - g5 -  a5 - - - e5 . a5 . ' +
                'c6 - a5 - f5 - a5 c6  d6 - b5 - g5 - b5 d6  e6 - - - d6 - b5 -  g#5 - - - e5 - - .' },
      },
    },
    stage2: {
      bpm: 150, order: ['A', 'B'],
      sections: {
        A: { chords: 'Em C D Em Em C D B7', bass: 'drive', arp: 'up', drums: 'rock', fill: true,
          lead: 'e5 . e5 g5 . e5 b5 a5  g5 - e5 - c5 - e5 g5  f#5 . f#5 a5 . f#5 d6 c6  b5 - - - . . e5 g5 ' +
                'e5 . e5 g5 . e5 b5 a5  g5 - e5 - g5 - c6 -  b5 - a5 - f#5 - d5 -  d#5 - f#5 - a5 - b5 -' },
        B: { chords: 'C D Bm Em C D B7 B7', bass: 'drive', arp: 'updown', drums: 'break', fill: true,
          lead: 'e6 - - c6 - - g5 -  f#6 - - d6 - - a5 -  d6 - - b5 - f#5 b5 d6  e6 - - - b5 - g5 - ' +
                'e6 - g6 - e6 - c6 -  d6 - f#6 - d6 - a5 -  b5 - d#6 - f#6 - b6 -  a6 - f#6 - d#6 - b5 -' },
      },
    },
    stage3: {
      bpm: 164, order: ['A', 'B'],
      sections: {
        A: { chords: 'D Bm G A D Bm Em A', bass: 'octave', arp: 'up', drums: 'break', fill: true,
          lead: 'f#5 - a5 - d6 - c#6 d6  b5 - - f#5 - - d5 -  g5 - b5 - d6 - e6 d6  c#6 - - - a5 - e5 - ' +
                'f#5 - a5 - d6 - e6 f#6  f#6 - e6 d6 - b5 - d6  e6 - d6 - b5 - g5 b5  a5 - - - - - . .' },
        B: { chords: 'G A F#m Bm G A D D', bass: 'octave', arp: 'updown', drums: 'disco', fill: true,
          lead: 'd6 - b5 - g5 - b5 d6  e6 - c#6 - a5 - c#6 e6  f#6 - - c#6 - a5 - f#5  f#5 - b5 - d6 - f#6 - ' +
                'g6 - f#6 - e6 - d6 -  e6 - d6 - c#6 - a5 -  d6 - - - f#6 - - -  a6 - - - - - . .' },
      },
    },
    stage4: {
      bpm: 140, order: ['A', 'A'],
      sections: {
        A: { chords: 'Cm Ab Bb Cm Cm Ab Fm G', bass: 'gallop', arp: 'up', drums: 'rock', fill: true,
          lead: 'c5 - eb5 - g5 - f5 eb5  eb5 - c5 - ab4 - c5 -  d5 - f5 - bb5 - ab5 g5  g5 - - - . . c5 d5 ' +
                'eb5 - g5 - c6 - bb5 ab5  ab5 - g5 - eb5 - c5 -  f5 - ab5 - c6 - d6 -  b5 - - - g5 - - .' },
      },
    },
    boss: {
      bpm: 158, order: ['A', 'A'],
      sections: {
        A: { chords: 'Em F Em F Am G F E', bass: 'gallop', arp: 'up', drums: 'boss', fill: true,
          lead: 'e5 e5 . e5 f5 - e5 -  f5 f5 . f5 g5 - f5 -  e5 e5 . e5 g5 - b5 -  c6 - b5 - a5 - f5 - ' +
                'a5 - c6 - e6 - d6 c6  b5 - d6 - g6 - f6 e6  f6 - e6 - c6 - a5 -  g#5 - - - b5 - - -' },
      },
    },
    final: {
      bpm: 172, order: ['A', 'A'],
      sections: {
        A: { chords: 'Dm Bb C A Dm Bb Gm A', bass: 'sixteen', arp: 'up', drums: 'boss', fill: true,
          lead: 'd5 - a5 - d6 - c6 a5  bb5 - f5 - d5 - f5 bb5  c6 - g5 - e5 - g5 c6  c#6 - - - e6 - a5 - ' +
                'd6 - f6 - a6 - g6 f6  f6 - d6 - bb5 - d6 f6  g6 - f6 - d6 - bb5 g5  a5 - c#6 - e6 - a6 -' },
      },
    },
    clear: {
      bpm: 150, loop: false, order: ['A'],
      sections: {
        A: { chords: 'C G C', bass: 'octave', arp: 'up', drums: ['crash', 'rock', 'crash'],
          lead: 'c5 e5 g5 c6 - g5 c6 -  b5 - d6 - g6 - - -  c6 - - - - - - .' },
      },
    },
    gameover: {
      bpm: 92, loop: false, order: ['A'],
      sections: {
        A: { chords: 'Am F E Am', bass: 'hold', arp: 'none', drums: 'half',
          lead: 'e5 - - c5 - - a4 -  c5 - - a4 - - f4 -  g#4 - - - b4 - - -  a4 - - - - - - .' },
      },
    },
  };
  // the ending plays the main theme a little slower
  data.ending = Object.assign({}, data.title, { bpm: 124 });

  function compile(id) {
    const s = data[id];
    if (!s) return null;
    const out = { bpm: s.bpm, loop: s.loop !== false, lead: [], arp: [], bass: [], drums: [], specs: s.specs || {} };
    for (const secName of s.order) {
      const sec = s.sections[secName];
      const chords = sec.chords.split(/\s+/).filter(Boolean).map(parseChord);
      const res = sec.res || 2;
      // lead
      const toks = sec.lead.split(/\s+/).filter(Boolean);
      const lead = [];
      for (const t of toks) {
        const first = t === '-' ? 'h' : t === '.' ? null : noteToMidi(t);
        lead.push(first);
        for (let i = 1; i < res; i++) lead.push(first === null ? null : 'h');
      }
      const bars = chords.length;
      while (lead.length < bars * 16) lead.push(null);
      out.lead.push(...lead.slice(0, bars * 16));
      chords.forEach((ch, b) => {
        const root = 36 + ch.root;
        out.bass.push(...(BASS[sec.bass] || BASS.octave)(root < 40 ? root + 12 : root));
        // arpeggio over the chord tones plus the octave
        const tones = ch.tones.concat([12]).map((t) => 60 + ch.root + t);
        for (let i = 0; i < 16; i++) {
          if (sec.arp === 'none') { out.arp.push(null); continue; }
          let k = i % tones.length;
          if (sec.arp === 'updown') { const p = tones.length * 2 - 2; const j = i % p; k = j < tones.length ? j : p - j; }
          out.arp.push(tones[k]);
        }
        let pat = Array.isArray(sec.drums) ? sec.drums[b] : sec.drums;
        if (sec.fill && b === bars - 1) pat = 'fill';
        const str = DRUMS[pat] || DRUMS.none;
        for (let i = 0; i < 16; i++) out.drums.push(str[i] === '.' ? '' : str[i]);
      });
    }
    out.len = out.lead.length;
    return out;
  }

  return { data, compile };
})();
