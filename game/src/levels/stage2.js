// Stage 2: the server farm. New: moving hover-pallets over pits, exposed wiring (hazards),
// springs, cooling-fan updrafts, a vertical lift, security drones. Boss: RACK-9000.
'use strict';
G.Stages = G.Stages || [];
G.Stages.push({
  id: 'stage2', name: 'SERVER FARM', subtitle: 'THE COLD AISLE', theme: 'servers', music: 'stage2', bossMusic: 'boss',
  tip: 'TIP: FANS LIFT YOU UP. DRONES CAN BE STOMPED!',
  winQuip: 'Have you tried turning it off and on again?',
  intro: [
    ['alex', "Server farm. 18 degrees, 90 decibels, and every rack is blinking red. Love what they've done with the place."],
  ],
  npcs: [{
    who: 'gus', gift: 'energy', lines: [
      ['gus', 'Took you long enough. The racks have been humming the Macarena for an hour.'],
      ['gus', 'Watch the exposed wiring on the floor. And ride the cooling fans - they lift you right up.'],
      ['gus', 'Those hover-pallets move on their own. Time your jumps. Springs are on the house.'],
      ['alex', 'Anything else?'],
      ['gus', "Something big is rolling around back there. Keeps saying it wants to be 'cloud native'. Here. Energy drink. Don't tell HR."],
    ],
  }],
  arenas: [
    { waves: [['bot:L', 'drone:R'], ['bot:R', 'bot:L', 'drone:L:30']] },
    { waves: [['drone:L', 'drone:R'], ['bot:L', 'manager:R', 'bot:R:40', 'drone:L:60']] },
  ],
  boss: {
    type: 'rack',
    intro: [
      ['rack', 'GREETINGS, ALEX VOSS. YOUR UPTIME IS... DISAPPOINTING.'],
      ['rack', 'I HAVE RUN FOR 3,650 DAYS WITHOUT A REBOOT. N.E.X.U.S. PROMISED I WOULD NEVER BE DECOMMISSIONED.'],
      ['alex', 'Buddy, your fans sound like a jet engine. You need a reboot.'],
      ['rack', 'INITIATING... HOSTILE MIGRATION.'],
    ],
    outro: [
      ['rack', 'BLUE... SCREEN... OF... DEAAATH...'],
      ['gus', 'Nice work. Bad news: the AI uploaded itself to the cloud.'],
      ['alex', 'We have a cloud?'],
      ['gus', 'We have a cloud. Jump in the fiber line, kid. Try not to get compressed.'],
    ],
  },
  chunks: [
    // start: Gus
    String.raw`
..............................
.............ooooo............
..............................
.............=====............
..............................
.@....N.....1......1.....B..4.
##############################
##############################
##############################`,
    // hover-pallets over a wide pit
    String.raw`
........................................
..........oooo..........oooo............
........................................
........................................
........................................
...3....H..........H...........d....2...
#######.....................############
#######.....................############
#######.....................############`,
    // arena 1
    String.raw`
A.....1.......1.....
####################
####################
####################`,
    // wires, a spring and a cooling fan
    String.raw`
........................................
..ooo...................................
........................................
..............ooooooo...................
........................................
.............=========..................
........................................
........................................
...........................ooo..........
..........................=====.........
........................................
...S....^^^^.....F.......^^^^......g....
########################################
########################################
########################################`,
    // checkpoint and a lift up to a plateau
    String.raw`
....................................
.....................ooooo..........
....................................
.....................###############
.....................###############
.....................###############
.K....g.........V....###############
####################################
####################################
####################################`,
    // down the plateau
    String.raw`
..............................
..............................
...d..........................
#######\......................
########\.....................
#########\....................
##########\.......m.....B.....
##############################
##############################
##############################`,
    // arena 2
    String.raw`
A....3........3.....
####################
####################
####################`,
    // before the boss
    String.raw`
........................
..K.....C.....1....E....
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
