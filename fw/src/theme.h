/* FROST: colour themes. Every colour of the interface comes from the theme in use (th), chosen
 * in the main menu and kept with the resume state. */
#ifndef THEME_H
#define THEME_H

#include <stdint.h>

struct theme {
    const char *name;
    uint16_t bg, fg, dim, title, warn, sel_bg, accent;  /* accent: the edge of the selection */
    uint16_t title_fg, dir_fg, bar_fg, bar_bg, sk_fg, rg_bg;
    uint16_t vu_lo, vu_mid, vu_hi;                      /* the level meters */
    uint16_t tape;                                      /* the cassette's tape */
    uint16_t deco;                                      /* THEME_SPARKLE: rhinestones */
};
#define THEME_SPARKLE 1

#define THEME_COUNT 24
extern const struct theme themes[THEME_COUNT];
extern const struct theme *th;
extern int theme_index;
void theme_set(int i);

/* A colour per format, for the dot before each file of the browser */
uint16_t theme_codec_color(uint32_t codec);

#endif
