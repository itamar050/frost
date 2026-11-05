// art.js: all character and item art, drawn by code and cached as sprites.
//  - HEADS:  pixel grids (also used, scaled up, as dialog portraits)
//  - STYLES: how a rig body is drawn for each character (bone lengths, colors, parts)
//  - POSES:  the animation poses shared by every rigged character
//  - items, props and projectiles
'use strict';
(() => {
  const C = G.C;
  const P = G.Gfx.Pen;

  // ---- head grids (facing right) -------------------------------------------------------
  const HEADS = {
    alex: {
      pal: { h: C.hair, H: C.hairD, s: C.skin, S: C.skinD, k: C.ink, w: '#ffffff', l: '#9fe4ff', m: '#b0303a' },
      rows: [
        '...hhhhh...',
        '..hhhhhhhh.',
        '.hhhhhhhhhh',
        'hhHhhhhhhhh',
        'hHhhhhsshh.',
        'hHhhssssss.',
        'hHSsskkkkk.',
        'hHSSsskwlk.',
        'hHSssskkkks',
        '.HSssssssss',
        '..Sssssssm.',
        '...SSssss..',
      ],
    },
    bot: {
      pal: { g: '#a3abc4', G: '#5d657e', n: '#1a1b3a', r: C.magenta, m: '#c01fa0', a: '#ff4f4f', k: C.ink },
      rows: [
        '......a.....',
        '......k.....',
        '..ggggggggg.',
        '.gGggggggggg',
        '.gGnnnnnnnng',
        '.gGnrnnnnrng',
        '.gGnnrrnrrng',
        '.gGnnnnnnnng',
        '.gGnnmmmmnng',
        '.gGggggggggg',
        '..GGGGGGGGG.',
      ],
    },
    manager: {
      pal: { s: '#f4b08a', S: '#c97c58', h: '#8a8f9e', k: C.ink, w: '#ffffff', m: '#8a2a2a', c: '#ffffff', r: '#ff6a6a' },
      rows: [
        '...sssss...',
        '..sssssss..',
        '.hhhhhhsss.',
        '.hSsssssss.',
        '.SSsskkkkks',
        '.SSsskwwkks',
        '.SSssskkkks',
        '.Sssssssrss',
        '..Ssshhhhs.',
        '..Ssssmmss.',
        '...SSsss...',
        '....ccc....',
      ],
    },
    chad: {
      pal: { y: C.blond, Y: C.blondD, s: '#f2b48a', S: '#c47a50', k: C.ink, w: '#ffffff', r: C.red, t: '#ffffff', g: '#2a2a3a' },
      rows: [
        '....yyyyyy...',
        '..yyyyyyyyyy.',
        '.yYYyyyyyyyyy',
        '.yYyyyyyyyyy.',
        '.yYyysssssss.',
        '.YYsssssssss.',
        '.YggsskkkkkkS',
        '.YggSskwkkkss',
        '..ggSssssssss',
        '..gSsssssss..',
        '..gSssstttts.',
        '...gSssssss..',
        '...rSSSSSS...',
      ],
    },
    brute: {
      pal: { o: C.orange, O: '#b0480e', k: C.ink, y: C.yellow, g: '#3a3a4a' },
      rows: [
        '...oooooo...',
        '..oooooooo..',
        '.oOoooooooo.',
        '.oOooooooooo',
        '.oOookkkkkkk',
        '.oOookyykyyk',
        '.oOookkkkkkk',
        '.oOoooooooo.',
        '.oOggggggg..',
        '..OOgggggg..',
        '...OOOOOO...',
      ],
    },
    priya: {
      pal: { h: '#2a1630', H: '#160a1c', s: '#c98a5e', S: '#9c623c', k: C.ink, w: '#ffffff', m: '#c0304a', e: C.gold },
      rows: [
        '....hhhhh..',
        '..hhhhhhhh.',
        '.hhhhhhhhhh',
        'hhHhhhhhhh.',
        'hhHhhhsshh.',
        '.hHhsssssss',
        '.hHSssskkss',
        '.hHSessskss',
        '.hHSssssssS',
        '..hSssssms.',
        '...SSssss..',
      ],
    },
    gus: {
      pal: { b: '#3c8a3a', B: '#24572a', s: '#efb48c', S: '#c27c56', r: '#8a6a52', R: '#5e4636', k: C.ink, w: '#ffffff', n: '#e08a6a' },
      rows: [
        '...bbbbbb..',
        '..bbbbbbbb.',
        '.bBbbbbbbbb',
        '.BBBBBBBBB.',
        '.SSsskksss.',
        '.SSsssksnn.',
        '.SRssssssn.',
        '.RRrrrrrrs.',
        '.RRrrrkkrr.',
        '..RRrrrrrr.',
        '...RRrrrr..',
        '....RRrr...',
      ],
    },
    rack: {
      pal: { g: '#7d86a0', G: '#4a5068', n: '#0a1830', c: C.cyan, r: C.red, k: C.ink },
      rows: [
        'gggggggggggg',
        'gGGGGGGGGGGg',
        'gGnnnnnnnnGg',
        'gGnccnnccnGg',
        'gGnccnnccnGg',
        'gGnnnnnnnnGg',
        'gGnrrrrrrnGg',
        'gGnnnnnnnnGg',
        'gGGGGGGGGGGg',
        'gggggggggggg',
      ],
    },
    spag: {
      pal: { y: '#ffd24a', Y: '#d8901a', r: '#e8342c', w: '#ffffff', k: C.ink },
      rows: [
        '.yyYyyyYyy..',
        'yYyyYyyyYyy.',
        'yyYwwyywwYyy',
        'yYywkyywkyYy',
        'yyYwwyywwyYy',
        'yYyyyyyyyyyy',
        'yyYrrrrrrYy.',
        '.yYrwrwrrYyy',
        'yyyYrrrrYyy.',
        '.yYyyYyyYy..',
      ],
    },
    nexus: {
      pal: { r: C.red, R: '#7a0a1a', w: '#ffffff', p: C.purple, P: C.purpleD, k: C.ink },
      rows: [
        '...PPPPPP...',
        '..PppppppP..',
        '.PpRRRRRRpP.',
        'PpRrrrrrrRpP',
        'PpRrrwwrrRpP',
        'PpRrwkkwrRpP',
        'PpRrrwwrrRpP',
        'PpRrrrrrrRpP',
        '.PpRRRRRRpP.',
        '..PppppppP..',
        '...PPPPPP...',
      ],
    },
    sys: {
      pal: { g: C.green, k: C.ink, n: '#062016' },
      rows: [
        'gggggggggggg',
        'gnnnnnnnnnng',
        'gngnnnnnnnng',
        'gnngnnnnnnng',
        'gngnnggggnng',
        'gnnnnnnnnnng',
        'gnnnnnnnnnng',
        'gggggggggggg',
        '....gggg....',
        '..gggggggg..',
      ],
    },
  };
  // expression variants (grid edits)
  function headRows(name, face) {
    const h = HEADS[name];
    if (name !== 'alex' || face === 'normal') return h.rows;
    const r = h.rows.slice();
    if (face === 'hurt') { r[7] = 'hHSSsskkkk.'; r[10] = '..Sssssmmm.'; }
    if (face === 'shout') { r[10] = '..Sssssmm..'; r[11] = '...SSssmm..'; }
    return r;
  }

  // ---- body styles ---------------------------------------------------------------------
  const darker = (c) => c; // styles pass explicit dark colors; kept for readability
  function stdLeg(colors, w = 4, shoe = true) {
    return (p, a, k, e, back) => {
      const c = back ? colors.legD : colors.leg;
      G.Rig.limb(p, a, k, e, c, w);
      if (shoe) {
        p.rect(e[0] - 1, e[1] - 1, 5, 3, back ? colors.shoeD : colors.shoe);
        if (colors.sole) p.rect(e[0] - 1, e[1] + 1, 5, 1, colors.sole);
      }
    };
  }
  function stdArm(colors, w = 3, hand = 3) {
    return (p, a, k, e, back) => {
      G.Rig.limb(p, a, k, e, back ? colors.armD : colors.arm, w);
      const o = Math.floor(hand / 2);
      p.rect(e[0] - o, e[1] - o, hand, hand, back ? colors.handD : colors.hand);
    };
  }
  const along = (J, t, off = 0) => [J.hip[0] + J.dir[0] * t + J.back[0] * off, J.hip[1] + J.dir[1] * t + J.back[1] * off];

  const STYLES = {};

  STYLES.alex = {
    thigh: 8, shin: 8, upper: 6, fore: 6, torso: 12, footH: 2, headUp: 6,
    leg: stdLeg({ leg: C.jeans, legD: C.jeansD, shoe: C.shoe, shoeD: C.shoeD, sole: '#ffffff' }),
    arm: stdArm({ arm: C.hood, armD: C.hoodD, hand: C.skin, handD: C.skinD }),
    behind(p, J) { // backpack
      const a = along(J, 3, 6), b = along(J, 11, 6);
      p.line(a[0], a[1], b[0], b[1], C.pack, 6);
      const c = along(J, 4, 8), d = along(J, 10, 8);
      p.line(c[0], c[1], d[0], d[1], C.packD, 2);
      const t = along(J, 12, 5);
      p.rect(t[0] - 2, t[1] - 1, 4, 2, C.packD);
    },
    torsoDraw(p, J) {
      const T = 12;
      const n = along(J, T, 0);
      p.line(J.hip[0], J.hip[1], n[0], n[1], C.hood, 9);
      const s0 = along(J, 1, 3), s1 = along(J, T, 3);
      p.line(s0[0], s0[1], s1[0], s1[1], C.hoodD, 3);
      const f0 = along(J, 3, -3), f1 = along(J, T - 1, -3);
      p.line(f0[0], f0[1], f1[0], f1[1], C.hoodL, 1);
      // jeans waist and hoodie pocket
      const w = along(J, 0, 0);
      p.line(w[0] - J.dir[0], w[1] - J.dir[1], w[0], w[1], C.jeans, 9);
      // strap and drawstrings
      const st0 = along(J, T - 1, 1), st1 = along(J, 3, -1);
      p.line(st0[0], st0[1], st1[0], st1[1], C.packD, 1);
      const ds = along(J, T - 3, -2);
      p.px(ds[0], ds[1], '#ffffff'); p.px(ds[0], ds[1] + 2, '#ffffff');
      // hood behind the neck
      const hd = along(J, T, 3);
      p.circle(hd[0], hd[1], 3, C.hoodD);
    },
    head(p, hc, q, face) { G.Rig.headGrid(p, headRows('alex', face), HEADS.alex.pal, hc, q); },
  };

  STYLES.bot = {
    thigh: 8, shin: 8, upper: 7, fore: 6, torso: 11, footH: 2, headUp: 6,
    leg: stdLeg({ leg: '#8d96b0', legD: '#5d657e', shoe: '#3a3f55', shoeD: '#2a2e40' }, 3),
    arm: (p, a, k, e, back) => {
      G.Rig.limb(p, a, k, e, back ? '#5d657e' : '#8d96b0', 3);
      p.rect(e[0] - 2, e[1] - 2, 4, 4, back ? '#3a3f55' : '#c4cbe0');
    },
    torsoDraw(p, J) {
      const a = along(J, 0), b = along(J, 11);
      p.line(a[0], a[1], b[0], b[1], '#7d86a0', 10);
      const c = along(J, 3, -1), d = along(J, 8, -1);
      p.line(c[0], c[1], d[0], d[1], '#1a1b3a', 5);
      const m = along(J, 6, -1);
      p.rect(m[0] - 1, m[1] - 1, 2, 2, C.magenta);
      const s = along(J, 1, 4), t = along(J, 10, 4);
      p.line(s[0], s[1], t[0], t[1], '#4a5068', 2);
    },
    head(p, hc, q) { G.Rig.headGrid(p, HEADS.bot.rows, HEADS.bot.pal, hc, q); },
  };

  STYLES.manager = {
    thigh: 8, shin: 8, upper: 6, fore: 6, torso: 13, footH: 2, headUp: 6,
    leg: stdLeg({ leg: C.suitD, legD: '#1e2840', shoe: '#2a1a14', shoeD: '#1a100c' }),
    arm: stdArm({ arm: C.suit, armD: C.suitD, hand: '#f4b08a', handD: '#c97c58' }),
    torsoDraw(p, J) {
      const a = along(J, 0), b = along(J, 13);
      p.line(a[0], a[1], b[0], b[1], C.suit, 11); // belly
      const c = along(J, 5, -2), d = along(J, 12, -2);
      p.line(c[0], c[1], d[0], d[1], '#ffffff', 3);
      const e = along(J, 6, -3), f = along(J, 12, -3);
      p.line(e[0], e[1], f[0], f[1], C.red, 1);
      const s0 = along(J, 1, 4), s1 = along(J, 12, 4);
      p.line(s0[0], s0[1], s1[0], s1[1], C.suitD, 3);
    },
    head(p, hc, q) { G.Rig.headGrid(p, HEADS.manager.rows, HEADS.manager.pal, hc, q); },
    front(p, J, arm) { // clipboard in the front hand
      if (J.pose.noItem) return;
      p.rect(arm.e[0] - 1, arm.e[1] - 6, 6, 8, '#a87040');
      p.rect(arm.e[0], arm.e[1] - 5, 4, 6, '#ffffff');
      p.rect(arm.e[0] + 1, arm.e[1] - 7, 2, 2, '#c0c0c0');
    },
  };

  STYLES.chad = {
    scale: 1.3, thigh: 8, shin: 8, upper: 6, fore: 6, torso: 13, footH: 3, headUp: 6,
    leg: stdLeg({ leg: C.navy, legD: '#10163a', shoe: '#120c0c', shoeD: '#0a0606' }, 5),
    arm: stdArm({ arm: '#26346e', armD: C.navy, hand: '#f2b48a', handD: '#c47a50' }, 5, 4),
    torsoDraw(p, J) {
      const a = along(J, 0), b = along(J, 17);
      p.line(a[0], a[1], b[0], b[1], '#26346e', 14);
      const c = along(J, 7, -3), d = along(J, 16, -3);
      p.line(c[0], c[1], d[0], d[1], '#ffffff', 4);
      const e = along(J, 6, -4), f = along(J, 16, -4);
      p.line(e[0], e[1], f[0], f[1], C.gold, 2);
      const s0 = along(J, 1, 5), s1 = along(J, 16, 5);
      p.line(s0[0], s0[1], s1[0], s1[1], C.navy, 4);
      const pin = along(J, 13, -1);
      p.rect(pin[0] - 1, pin[1] - 1, 2, 2, C.red);
    },
    head(p, hc, q) { G.Rig.headGrid(p, HEADS.chad.rows, HEADS.chad.pal, hc, q); },
  };

  STYLES.brute = {
    scale: 1.2, thigh: 8, shin: 8, upper: 7, fore: 6, torso: 13, footH: 3, headUp: 6,
    leg: stdLeg({ leg: '#3a3a4a', legD: '#24242e', shoe: C.orange, shoeD: '#b0480e' }, 6),
    arm: stdArm({ arm: '#4a4a5c', armD: '#2a2a36', hand: C.orange, handD: '#b0480e' }, 5, 5),
    torsoDraw(p, J) {
      const a = along(J, 0), b = along(J, 16);
      p.line(a[0], a[1], b[0], b[1], '#4a4a5c', 15);
      const c = along(J, 4, -1), d = along(J, 14, -1);
      p.line(c[0], c[1], d[0], d[1], C.orange, 7);
      const e = along(J, 6, -1), f = along(J, 12, -1);
      p.line(e[0], e[1], f[0], f[1], C.yellow, 2);
    },
    head(p, hc, q) { G.Rig.headGrid(p, HEADS.brute.rows, HEADS.brute.pal, hc, q); },
    front(p, J, arm) { // the firewall shield
      if (J.pose.noItem) return;
      const x = arm.e[0] + 1, y = arm.e[1] - 16;
      p.rect(x, y, 7, 30, '#b0480e');
      p.rect(x + 1, y + 1, 5, 28, C.orange);
      for (let i = 0; i < 5; i++) p.rect(x + 1, y + 3 + i * 6, 5, 1, C.yellow);
      p.rect(x + 3, y + 1, 1, 28, C.yellow);
    },
  };

  STYLES.priya = {
    thigh: 7, shin: 7, upper: 6, fore: 5, torso: 11, footH: 2, headUp: 6,
    leg: stdLeg({ leg: C.tealD, legD: '#0c5f53', shoe: '#ffffff', shoeD: '#c8c8d8' }, 3),
    arm: stdArm({ arm: C.yellow, armD: C.yellowD, hand: '#c98a5e', handD: '#9c623c' }),
    torsoDraw(p, J) {
      const a = along(J, 0), b = along(J, 11);
      p.line(a[0], a[1], b[0], b[1], C.yellow, 9);
      const c = along(J, 2, -2), d = along(J, 10, -2);
      p.line(c[0], c[1], d[0], d[1], '#ffffff', 2);
      const badge = along(J, 7, -3);
      p.rect(badge[0] - 1, badge[1], 3, 3, C.blue);
    },
    head(p, hc, q) { G.Rig.headGrid(p, HEADS.priya.rows, HEADS.priya.pal, hc, q); },
    behind(p, J) { const t = along(J, 15, 5); p.rect(t[0] - 2, t[1], 3, 7, '#2a1630'); },
  };

  STYLES.gus = {
    thigh: 8, shin: 8, upper: 7, fore: 6, torso: 13, footH: 2, headUp: 6,
    leg: stdLeg({ leg: C.jeans, legD: C.jeansD, shoe: '#5e3a20', shoeD: '#3e2614' }, 5),
    arm: stdArm({ arm: '#c0302c', armD: '#801c1c', hand: '#efb48c', handD: '#c27c56' }, 4),
    torsoDraw(p, J) {
      const a = along(J, 0), b = along(J, 13);
      p.line(a[0], a[1], b[0], b[1], '#c0302c', 13);
      for (let i = 1; i < 13; i += 4) { const c = along(J, i, 6), d = along(J, i, -6); p.line(c[0], c[1], d[0], d[1], '#801c1c', 1); }
      const c = along(J, 0, 6), d = along(J, 13, 6);
      p.line(c[0], c[1], d[0], d[1], '#801c1c', 1);
    },
    head(p, hc, q) { G.Rig.headGrid(p, HEADS.gus.rows, HEADS.gus.pal, hc, q); },
    front(p, J, arm) { // coffee mug
      p.rect(arm.e[0], arm.e[1] - 4, 5, 5, '#ffffff');
      p.rect(arm.e[0] + 5, arm.e[1] - 3, 1, 3, '#ffffff');
      p.rect(arm.e[0] + 1, arm.e[1] - 4, 3, 1, '#5e3a20');
    },
  };

  // ---- poses ---------------------------------------------------------------------------
  const GUARD = { ba: [25, 150], fa: [45, 160] };
  const POSES = {
    idle0: { lean: 4, bl: [-10, -4], fl: [14, 4], ...GUARD },
    idle1: { lean: 4, dy: 1, bl: [-10, -4], fl: [14, 4], ba: [25, 145], fa: [45, 155] },
    stand: { lean: 0, bl: [-4, -2], fl: [5, 2], ba: [-6, -2], fa: [8, 12] },
    stand1: { lean: 0, dy: 1, bl: [-4, -2], fl: [5, 2], ba: [-6, -2], fa: [8, 14] },
    talk: { lean: 2, bl: [-4, -2], fl: [5, 2], ba: [-6, -2], fa: [60, 120] },
    jump: { air: true, hy: 16, lean: 6, bl: [-20, -70], fl: [55, 5], ba: [-40, 20], fa: [130, 165] },
    fall: { air: true, hy: 17, lean: 0, bl: [-12, -30], fl: [22, 0], ba: [100, 130], fa: [110, 140] },
    crouch: { lean: 25, bl: [40, -40], fl: [75, -10], ba: [40, 150], fa: [60, 165] },
    skid: { lean: -18, bl: [-20, -10], fl: [45, 30], ba: [-60, -40], fa: [-40, -20] },
    jab1: { lean: 12, bl: [-14, -6], fl: [18, 6], ba: [25, 150], fa: [88, 90] },
    jab2: { lean: 16, bl: [-14, -6], fl: [18, 6], ba: [88, 90], fa: [40, 160] },
    hookW: { lean: -4, bl: [-14, -6], fl: [18, 6], ba: [25, 150], fa: [30, 120] },
    hook: { lean: 20, bl: [-16, -6], fl: [20, 6], ba: [10, 140], fa: [100, 125], face: 'shout' },
    kickW: { lean: -8, bl: [-6, -4], fl: [75, 5], ba: [20, 150], fa: [40, 160] },
    kick: { lean: -22, bl: [-4, -6], fl: [96, 96], ba: [-40, -10], fa: [40, 150], face: 'shout' },
    upW: { lean: 22, bl: [40, -30], fl: [70, -10], ba: [30, 140], fa: [15, 10] },
    up: { lean: -6, dy: -3, bl: [-10, -20], fl: [30, -10], ba: [20, 140], fa: [165, 178], face: 'shout' },
    air: { air: true, hy: 16, lean: -25, bl: [-30, -95], fl: [96, 96], ba: [-60, -20], fa: [140, 170], face: 'shout' },
    dive: { air: true, hy: 18, lean: 25, bl: [-30, -100], fl: [42, 42], ba: [-120, -150], fa: [-100, -130] },
    dash: { lean: 35, bl: [-55, -70], fl: [45, 10], ba: [-75, -65], fa: [-60, -45] },
    dashAtk: { lean: 32, bl: [-55, -70], fl: [45, 10], ba: [-70, -60], fa: [95, 95], face: 'shout' },
    hurt: { lean: -20, bl: [-10, 0], fl: [15, 5], ba: [-40, -10], fa: [-20, 20], face: 'hurt' },
    downAir: { air: true, hy: 12, lean: -65, bl: [55, 60], fl: [40, 30], ba: [-150, -170], fa: [-120, -150], face: 'hurt' },
    down: { lean: -90, dy: -1, bl: [82, 92], fl: [86, 96], ba: [-150, -170], fa: [-110, -95], face: 'hurt' },
    getup: { lean: 20, bl: [35, -80], fl: [85, 0], ba: [40, 0], fa: [60, 10] },
    grab: { lean: 10, bl: [-14, -6], fl: [18, 6], ba: [75, 95], fa: [80, 100] },
    knee: { lean: -8, bl: [-6, -4], fl: [105, 20], ba: [75, 95], fa: [80, 100], face: 'shout' },
    throw: { lean: -30, bl: [-20, -10], fl: [30, 20], ba: [160, 195], fa: [150, 190], face: 'shout' },
    special0: { lean: 18, bl: [40, -30], fl: [70, -10], ba: [20, -30], fa: [-20, 40], face: 'shout' },
    special1: { lean: -8, dy: -2, bl: [-20, -10], fl: [25, 10], ba: [-140, -160], fa: [140, 160], face: 'shout' },
    win: { lean: -4, bl: [-8, -4], fl: [10, 4], ba: [20, 150], fa: [170, 180], face: 'shout' },
    // enemy-flavored poses
    windup: { lean: -12, bl: [-14, -6], fl: [18, 6], ba: [30, 150], fa: [-70, -30] },
    punch: { lean: 18, bl: [-18, -6], fl: [22, 6], ba: [25, 150], fa: [92, 92] },
    throwW: { lean: -15, bl: [-14, -6], fl: [18, 6], ba: [20, 60], fa: [175, 210], noItem: true },
    throwR: { lean: 15, bl: [-14, -6], fl: [22, 6], ba: [20, 60], fa: [80, 70], noItem: true },
    stun: { lean: -6, bl: [-6, -2], fl: [8, 2], ba: [-4, 2], fa: [4, 6], face: 'hurt' },
    held: { lean: 20, bl: [-6, -2], fl: [8, 2], ba: [-10, 10], fa: [10, 20], face: 'hurt', noItem: true },
    point: { lean: -4, bl: [-8, -4], fl: [10, 4], ba: [-6, -2], fa: [90, 95] },
    shield: { lean: 6, bl: [-14, -6], fl: [18, 6], ba: [25, 150], fa: [60, 100] },
    bash: { lean: 25, bl: [-30, -20], fl: [30, 6], ba: [25, 150], fa: [80, 95] },
    slam: { air: true, hy: 18, lean: 10, bl: [-10, -20], fl: [20, 10], ba: [170, 190], fa: [165, 185] },
  };
  // generated cycles: run0..7, sprint0..7, walk0..7
  function cycle(i, amp, lean, armAmp) {
    const q = (i / 8) * Math.PI * 2;
    const leg = (ph) => { const t = 32 * amp * Math.sin(ph); return [t, t - (12 + 55 * amp * Math.max(0, Math.cos(ph)))]; };
    const arm = (ph) => { const u = armAmp * Math.sin(ph); return [u, u + 70]; };
    return { lean, fl: leg(q), bl: leg(q + Math.PI), fa: arm(q + Math.PI), ba: arm(q) };
  }
  function pose(name) {
    if (POSES[name]) return POSES[name];
    const m = /^(run|sprint|walk|march)(\d)$/.exec(name);
    if (m) {
      const i = +m[2];
      const p = m[1] === 'run' ? cycle(i, 1, 9, 45)
        : m[1] === 'sprint' ? cycle(i, 1.25, 20, 65)
        : m[1] === 'walk' ? cycle(i, 0.55, 3, 20) : cycle(i, 0.45, 2, 8);
      POSES[name] = p;
      return p;
    }
    return POSES.idle0;
  }

  // ---- sprite builders -----------------------------------------------------------------
  function body(style, poseName) {
    const st = STYLES[style];
    const big = (st.scale || 1) > 1.1;
    const S = big ? 96 : 64;
    return G.Gfx.sprite(style + ':' + poseName, S, S, S / 2, S - 4, (p) => G.Rig.draw(p, pose(poseName), st, S / 2, S - 4));
  }

  function headSprite(name, scale = 1) {
    const h = HEADS[name];
    const w = h.rows[0].length * scale, ht = h.rows.length * scale;
    return G.Gfx.sprite('head:' + name + scale, w + 2, ht + 2, (w + 2) / 2, ht + 1, (p) => p.grid(h.rows, h.pal, 1, 1, 0, false, scale));
  }

  // dialog portrait: framed, 3x head
  const PORTRAIT_BG = { alex: C.hoodD, priya: C.tealD, gus: '#3c6a2a', chad: C.navy, rack: '#1a2a4a', spag: '#5a1a1a', nexus: '#2a0a2a', sys: '#062016', bot: '#2a2a4a' };
  function portrait(who) {
    return G.Gfx.sprite('portrait:' + who, 44, 44, 0, 0, (p) => {
      p.rect(0, 0, 44, 44, '#fff8ee');
      p.rect(1, 1, 42, 42, PORTRAIT_BG[who] || '#222');
      for (let y = 3; y < 42; y += 4) p.rect(1, y, 42, 1, 'rgba(255,255,255,0.06)');
      const h = HEADS[who] || HEADS.sys;
      const w = h.rows[0].length * 3, ht = h.rows.length * 3;
      p.grid(h.rows, h.pal, Math.round(22 - w / 2), Math.min(42 - ht, Math.round(22 - ht / 2) + 2), 0, false, 3);
    }, null);
  }

  // ---- items & props -------------------------------------------------------------------
  const items = {
    coffee: () => G.Gfx.sprite('coffee', 14, 16, 7, 15, (p) => {
      p.rect(3, 4, 8, 11, '#ffffff'); p.rect(4, 14, 6, 1, '#d8d8e0');
      p.rect(3, 7, 8, 4, '#8a5a32'); p.rect(5, 8, 4, 2, C.cyan);
      p.rect(2, 2, 10, 2, '#3a2a2a'); p.rect(4, 1, 6, 1, '#3a2a2a');
    }),
    energy: () => G.Gfx.sprite('energy', 12, 16, 6, 15, (p) => {
      p.rect(2, 2, 8, 13, C.lime); p.rect(2, 2, 2, 13, '#7ad020');
      p.rect(3, 1, 6, 1, '#c8c8d0'); p.rect(3, 15, 6, 1, '#c8c8d0');
      p.grid(['..k', '.k.', 'kkk', '.k.', 'k..'], { k: C.ink }, 5, 6);
    }),
    patch: () => G.Gfx.sprite('patch', 16, 16, 8, 15, (p) => {
      p.rect(1, 1, 14, 14, C.blue); p.rect(1, 1, 14, 2, C.blueD);
      p.rect(4, 1, 7, 5, '#c8ccd8'); p.rect(8, 2, 2, 3, C.blueD);
      p.rect(3, 8, 10, 6, '#ffffff');
      p.rect(7, 9, 2, 4, C.green); p.rect(6, 10, 4, 2, C.green);
    }),
    oneup: () => G.Gfx.sprite('oneup', 18, 18, 9, 17, (p) => {
      p.circle(9, 9, 8, C.gold); p.circle(9, 9, 6, '#fff0a0');
      p.grid(HEADS.alex.rows, HEADS.alex.pal, 4, 3);
    }),
    bit: (f) => G.Gfx.sprite('bit' + f, 14, 14, 7, 13, (p) => {
      const w = [6, 4, 1, 4][f];
      p.ellipse(7, 7, w, 6, C.gold);
      if (w > 2) { p.ellipse(7, 7, Math.max(1, w - 2), 4, '#fff0a0'); p.rect(7 - (w > 4 ? 1 : 0), 5, w > 4 ? 2 : 1, 5, C.yellowD); }
    }),
    crate: () => G.Gfx.sprite('crate', 18, 18, 9, 17, (p) => {
      p.rect(1, 2, 16, 15, '#c8904a'); p.rect(1, 2, 16, 3, '#e0a860'); p.rect(1, 14, 16, 3, '#9a6a32');
      p.rect(8, 2, 2, 15, '#e8d098');
      p.grid(['k.kkk', 'k..k.', 'k..k.'], { k: '#6a4420' }, 3, 8);
    }),
    cooler: () => G.Gfx.sprite('cooler', 16, 28, 8, 27, (p) => {
      p.rect(3, 1, 10, 10, '#7ad0ff'); p.rect(4, 2, 3, 8, '#c8f0ff');
      p.rect(2, 11, 12, 16, '#e8e8f0'); p.rect(2, 11, 12, 2, '#c8c8d8');
      p.rect(5, 15, 2, 2, C.red); p.rect(9, 15, 2, 2, C.blue);
    }),
    server: () => G.Gfx.sprite('serverbox', 18, 22, 9, 21, (p) => {
      p.rect(1, 1, 16, 20, '#3a4058'); p.rect(2, 2, 14, 18, '#262b40');
      for (let i = 0; i < 4; i++) { p.rect(3, 4 + i * 4, 12, 2, '#4a5070'); p.px(13, 4 + i * 4, C.green); }
    }),
    cube: () => G.Gfx.sprite('datacube', 18, 18, 9, 17, (p) => {
      p.rect(1, 1, 16, 16, C.purpleD); p.rect(2, 2, 14, 14, C.purple);
      p.rect(4, 4, 10, 10, '#c89aff'); p.rect(6, 6, 6, 6, '#ffffff');
    }),
    spring: (f) => G.Gfx.sprite('spring' + f, 18, 14, 9, 13, (p) => {
      const h = f ? 4 : 9;
      p.rect(1, 13 - 3, 16, 3, '#5a6078');
      for (let y = 13 - 3 - h; y < 13 - 3; y += 2) p.rect(4, y, 10, 1, '#c8ccd8');
      p.rect(1, 13 - 3 - h - 3, 16, 3, C.red); p.rect(2, 13 - 3 - h - 3, 14, 1, '#ff8a8a');
    }),
    boost: (f) => G.Gfx.sprite('boost' + f, 18, 8, 9, 7, (p) => {
      p.rect(1, 2, 16, 5, '#2a2e40');
      for (let i = 0; i < 3; i++) {
        const c = (i + f) % 3 === 0 ? C.yellow : (i + f) % 3 === 1 ? C.orange : '#8a4a10';
        p.grid(['k..', '.k.', 'k..'], { k: c }, 3 + i * 4, 3);
        p.grid(['k..', '.k.', 'k..'], { k: c }, 4 + i * 4, 3);
      }
    }),
    terminal: (on) => G.Gfx.sprite('terminal' + on, 18, 30, 9, 29, (p) => {
      p.rect(7, 14, 4, 15, '#5a6078'); p.rect(3, 26, 12, 3, '#5a6078');
      p.rect(1, 1, 16, 14, '#3a4058');
      p.rect(3, 3, 12, 9, on ? '#0a3a1a' : '#3a0a0a');
      p.grid(on ? ['....k', '...k.', 'k.k..', '.k...'] : ['k...k', '.k.k.', '..k..', '.k.k.', 'k...k'], { k: on ? C.green : C.red }, 6, 4);
    }),
    crumble: (f) => G.Gfx.sprite('crumble' + f, 16, 16, 8, 16, (p) => {
      p.rect(0, 0, 16, 16, C.purpleD); p.rect(1, 1, 14, 14, '#7a3ad0');
      p.rect(2, 2, 5, 5, '#a36aff'); p.rect(9, 9, 5, 5, '#a36aff');
      if (f) { p.line(3, 0, 8, 8, C.ink); p.line(8, 8, 6, 15, C.ink); p.line(8, 8, 15, 5, C.ink); }
      p.rect(f ? 11 : 4, 3, 3, 1, C.magenta);
    }, null),
    platform: (theme) => G.Gfx.sprite('platform' + theme, 48, 10, 24, 0, (p) => {
      const c = theme === 'cloud' ? C.cyan : theme === 'core' ? C.red : C.yellow;
      p.rect(0, 0, 48, 8, '#3a4058'); p.rect(1, 1, 46, 3, '#8a90a8');
      for (let i = 4; i < 48; i += 10) p.rect(i, 5, 4, 2, c);
      p.rect(8, 8, 32, 2, '#262b40');
    }),
    fan: () => G.Gfx.sprite('fan', 34, 8, 17, 7, (p) => {
      p.rect(1, 1, 32, 6, '#3a4058');
      for (let i = 3; i < 32; i += 3) p.rect(i, 2, 1, 4, '#8a90a8');
    }),
    door: () => G.Gfx.sprite('door', 34, 50, 17, 49, (p) => {
      p.rect(1, 1, 32, 48, '#3a4058'); p.rect(4, 6, 26, 43, '#1a1e30');
      p.rect(4, 6, 12, 43, '#2a3048'); p.rect(18, 6, 12, 43, '#2a3048');
      p.rect(5, 1, 24, 4, C.green);
    }),
  };

  // ---- creatures drawn without the rig ------------------------------------------------
  function blob(frame, mini) {
    const s = mini ? 0.6 : 1;
    return G.Gfx.sprite('blob' + frame + (mini ? 'm' : ''), 32, 28, 16, 26, (p) => {
      // frame 0/1 idle squish, 2 stretched (jump), 3 squashed (land)
      const rx = [10, 11, 7, 13][frame] * s, ry = [8, 7, 11, 5][frame] * s;
      const cy = 26 - ry - 1;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        p.circle(16 + Math.cos(a) * (rx + 1), cy + Math.sin(a) * (ry + 1), Math.max(1, 1.5 * s), C.greenD);
      }
      p.ellipse(16, cy, rx, ry, C.greenD);
      p.ellipse(16, cy - 1, rx - 1, ry - 1, C.green);
      p.ellipse(16 - rx * 0.35, cy - ry * 0.45, Math.max(1, rx * 0.25), Math.max(1, ry * 0.2), '#c8ffb0');
      const ex = 16 + rx * 0.35, ey = cy - ry * 0.15;
      p.rect(ex - 2, ey - 2, 3, 4, '#ffffff'); p.rect(ex + 2, ey - 2, 3, 4, '#ffffff');
      p.rect(ex - 1, ey - 1, 2, 2, C.ink); p.rect(ex + 3, ey - 1, 2, 2, C.ink);
      p.rect(ex - 2, ey - 3, 3, 1, C.ink); p.rect(ex + 2, ey - 3, 3, 1, C.ink);
    });
  }

  function drone(frame, alert) {
    return G.Gfx.sprite('drone' + frame + (alert ? 'a' : ''), 30, 22, 15, 16, (p) => {
      p.rect(14, 2, 2, 4, '#5a6078');
      const w = frame ? 6 : 12;
      p.rect(15 - w, 1, w * 2, 2, '#c8ccd8');
      p.ellipse(15, 11, 10, 6, '#5a6078');
      p.ellipse(15, 10, 9, 5, '#a3abc4');
      p.rect(6, 12, 18, 2, '#5a6078');
      p.circle(19, 10, 3, C.ink);
      p.circle(19, 10, 2, alert ? C.yellow : C.red);
      p.px(18, 9, '#ffffff');
      p.rect(12, 16, 6, 3, '#3a4058'); p.rect(17, 17, 4, 1, '#3a4058');
    });
  }

  const proj = {
    memo: () => G.Gfx.sprite('memo', 12, 10, 6, 5, (p) => {
      p.rect(1, 1, 10, 8, '#ffffff'); for (let i = 0; i < 3; i++) p.rect(3, 3 + i * 2, 6, 1, '#6a7aa8');
      p.rect(1, 1, 3, 2, C.yellow);
    }),
    mug: () => G.Gfx.sprite('mug', 10, 10, 5, 5, (p) => { p.rect(1, 2, 6, 7, '#ffffff'); p.rect(7, 4, 2, 3, '#ffffff'); p.rect(2, 3, 4, 1, '#5e3a20'); }),
    laser: () => G.Gfx.sprite('laser', 12, 6, 6, 3, (p) => { p.rect(0, 1, 12, 4, C.red); p.rect(1, 2, 10, 2, '#ffd0d0'); }, null),
    packet: () => G.Gfx.sprite('packet', 10, 10, 5, 5, (p) => { p.rect(1, 1, 8, 8, C.cyan); p.rect(3, 3, 4, 4, '#ffffff'); }),
    orb: () => G.Gfx.sprite('orb', 12, 12, 6, 6, (p) => { p.circle(6, 6, 5, C.magenta); p.circle(6, 6, 3, '#ffb0f0'); p.px(5, 4, '#ffffff'); }),
    drive: () => G.Gfx.sprite('drive', 16, 12, 8, 11, (p) => {
      p.rect(1, 1, 14, 10, '#8a90a8'); p.rect(2, 2, 12, 8, '#c8ccd8'); p.circle(8, 6, 3, '#8a90a8'); p.rect(12, 8, 2, 1, C.green);
    }),
    byte: () => G.Gfx.sprite('byte', 10, 10, 5, 5, (p) => { p.rect(1, 1, 8, 8, C.red); p.rect(3, 3, 4, 4, C.yellow); }),
  };

  // a buzzword projectile: text in a speech-bubble block
  function word(text) {
    const w = G.Font.width(text) + 6;
    return G.Gfx.sprite('word:' + text, w + 2, 13, (w + 2) / 2, 6, (p, ctx) => {
      p.rect(1, 1, w, 11, C.gold); p.rect(2, 2, w - 2, 9, '#fff6c0');
      G.Font.draw(ctx, text, 4, 3, C.redD);
    });
  }

  // build every pose of the given rig styles up front, so no sprite is generated mid-fight
  function prewarm(styles) {
    const names = Object.keys(POSES).filter((n) => !/\d$/.test(n) || /^idle|^stand/.test(n));
    for (const c of ['run', 'sprint', 'walk', 'march']) for (let i = 0; i < 8; i++) names.push(c + i);
    for (const st of styles) for (const n of names) body(st, n);
    for (let f = 0; f < 4; f++) { blob(f, false); blob(f, true); items.bit(f); }
    for (let f = 0; f < 2; f++) for (const a of [false, true]) drone(f, a);
  }

  G.Art = { HEADS, STYLES, POSES, pose, body, headSprite, portrait, items, blob, drone, proj, word, prewarm };
})();
