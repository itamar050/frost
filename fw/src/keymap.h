/* FROST: button mapping. Each screen (browser, play screen) has nine slots, one per gesture of
 * the keys (PLAY, BACK, MENU pressed or held; VOL+, VOL- pressed, their repeat when held; the
 * VOL+ then VOL- chord); each slot holds an action. The map is edited on the device (main menu,
 * "Buttons") and kept with the resume state; KEYMAP.TXT in the internal root, when present,
 * replaces it at boot. The menus and the seek mode keep their fixed keys. */
#ifndef KEYMAP_H
#define KEYMAP_H

#include <stdint.h>
#include "keys.h"

enum action {
    A_NONE,
    /* browser */
    A_UP, A_DOWN, A_PAGE_UP, A_PAGE_DOWN, A_OPEN, A_PLAY_ALL, A_PARENT, A_HOME, A_JUMP,
    /* playback (both screens) */
    A_PLAYPAUSE, A_NEXT, A_PREV, A_VOL_UP, A_VOL_DOWN, A_SEEK, A_FWD, A_REW, A_MODE,
    A_SHUFFLE,
    /* either screen */
    A_SWITCH, A_MENU, A_THEME, A_SCREEN_OFF,
    A_COUNT
};

enum { KM_BROWSER, KM_PLAYING, KM_SCREENS };
enum { S_PLAY, S_PLAY_HOLD, S_BACK, S_BACK_HOLD, S_MENU, S_MENU_HOLD, S_VOLUP, S_VOLDOWN,
       S_CHORD, S_COUNT };

extern uint8_t keymap[KM_SCREENS][S_COUNT];

void keymap_defaults(void);
void keymap_fix(void);                  /* the main menu always reachable */
/* The action of an event on a screen; *repeat: a VOL key held (an action that does not repeat
 * is given once, at the first repeat). A_NONE: nothing. */
int keymap_action(int screen, const struct key_ev *e, int *repeat);
const char *action_name(int a);         /* on the screen */
const char *slot_name(int s);
int keymap_load_file(void);             /* KEYMAP.TXT: 1 applied, 0 none, < 0 error */

#endif
