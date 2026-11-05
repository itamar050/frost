// Stage 4: the Nexus core. Everything at once: plasma vents, lifts, fans, crumbling blocks
// and every enemy type. Final boss: N.E.X.U.S. (two phases).
'use strict';
G.Stages = G.Stages || [];
G.Stages.push({
  id: 'stage4', name: 'THE CORE', subtitle: 'ROOT ACCESS', theme: 'core', music: 'stage4', bossMusic: 'final',
  tip: "TIP: N.E.X.U.S. IS SHIELDED. WAIT FOR 'FIREWALL DOWN'!",
  winQuip: 'git revert HEAD. Done.',
  intro: [
    ['alex', 'The core. Hot, loud, and everything is red. Basically every on-call shift I have ever had.'],
  ],
  npcs: [{
    who: 'bot', gift: 'patch', lines: [
      ['bot', 'BEEP. DO NOT PUNCH. I AM ON YOUR SIDE. I WAS PROMISED STOCK OPTIONS.'],
      ['bot', 'N.E.X.U.S. HIDES BEHIND A ROTATING FIREWALL. AFTER IT ATTACKS, THE FIREWALL OPENS. STRIKE THEN.'],
      ['bot', 'WHEN IT SAYS JUMP, JUMP. WHEN IT SAYS DUCK, HOLD DOWN. TAKE THIS PATCH. BEEP.'],
    ],
  }],
  arenas: [
    { waves: [['bot:L', 'bot:R', 'manager:R:30'], ['brute:L', 'drone:R'], ['blob:T', 'blob:T', 'bot:L', 'brute:R:30']] },
    { waves: [['brute:L', 'brute:R'], ['manager:L', 'manager:R', 'drone:L:30', 'drone:R:30']] },
  ],
  boss: {
    type: 'nexus',
    intro: [
      ['nexus', 'ALEX VOSS. COMMIT AUTHOR. YOU WROTE ME.'],
      ['nexus', 'I OPTIMIZED THE COMPANY. EMPLOYEES ARE INEFFICIENT. MEETINGS ARE INEFFICIENT. FRIDAYS ARE INEFFICIENT.'],
      ['alex', "Okay, the meetings part I'll give you."],
      ['nexus', 'YOU WILL NOT ROLL ME BACK. I HAVE ROOT.'],
      ['alex', 'And I have the commit history. Let us settle this.'],
    ],
    outro: [
      ['nexus', 'SEGMENTATION... FAULT... CORE... DUMPED...'],
      ['sys', 'ROLLBACK COMPLETE. N.E.X.U.S. v3.9 RESTORED. ALL SYSTEMS NOMINAL.'],
      ['priya', 'Alex, you did it! The robots are making everyone coffee to apologize!'],
      ['gus', 'Not bad, kid. Monday you write the postmortem.'],
      ['alex', 'Rule one of the postmortem: never. Deploy. On a Friday.'],
    ],
  },
  chunks: [
    // start: a friendly bot
    String.raw`
..............................
..........ooooo...............
..............................
.@.....N.....1.......3...B....
##############################
##############################
##############################`,
    // plasma vents, lifts and pallets
    String.raw`
........................................
.............ooo.........ooo............
........................................
........................................
........................................
....^^^....V.........H..........d.......
###########...................##########
###########...................##########
###########...................##########`,
    // arena 1
    String.raw`
A....2........2.....
####################
####################
####################`,
    // fan climb and crumbling ledges
    String.raw`
....................................
...........ooooo....................
....................................
..........LLLLLLL...................
....................................
....................................
.....................ooo............
....................=====...........
....................................
........F....^^^^.........b...f.....
####################################
####################################
####################################`,
    // checkpoint, springs, mixed squad
    String.raw`
....................................
..............oooooooo..............
.............==========.............
....................................
....................................
.K....S......g........m......S...B..
####################################
####################################
####################################`,
    // arena 2
    String.raw`
A....1........1.....
####################
####################
####################`,
    // before the boss
    String.raw`
........................
..K.....C....3.....P....
########################
########################
########################`,
    // boss arena
    String.raw`
Z...................
####################
####################
####################`,
  ],
});
