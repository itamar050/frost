/* FROST 1.2c: the equalizer's setting (core A): on/off, a preset or the user's own 10 bands.
 * Core B does the filtering (hifi/rt.c), from the gains put in the control block. */
#ifndef EQ_H
#define EQ_H

#include <stdint.h>

#define EQ_BANDS   10
#define EQ_PRESETS 9                            /* the last one: Custom */
#define EQ_CUSTOM  (EQ_PRESETS - 1)

extern int eq_on, eq_preset;
extern int8_t eq_custom[EQ_BANDS];
extern const char *const eq_band_name[EQ_BANDS];

const int8_t *eq_gains(void);                   /* of the preset in use */
const char *eq_preset_name(void);
int eq_active(void);                            /* on, and not flat */
void eq_to_ctl(void);                           /* into core B's control block (a new eq_seq) */

#endif
