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
    uint16_t deco;                                      /* THEME_JEWELS, THEME_BULBS */
    uint16_t shell;                                     /* 1.2h: the cassette's body, 0: sel_bg */
};
#define THEME_JEWELS 1      /* gold piping, red / blue / gold stones beside the trapezoid */
#define THEME_BULBS  2      /* marquee bulbs on the shell, stitched leather */
#define THEME_GRID   4      /* 1.2j: the window a starry sky over a laser grid, chrome stripes */

#define THEME_COUNT 26
extern const struct theme themes[THEME_COUNT];
extern const struct theme *th;
extern int theme_index;
void theme_set(int i);

/* A colour per format, for the dot before each file of the browser */
uint16_t theme_codec_color(uint32_t codec);

#endif
