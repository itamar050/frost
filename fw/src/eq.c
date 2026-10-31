/* FROST 1.2c: the equalizer's setting (eq.h) */
#include "eq.h"
#include "hifi_proto.h"

int eq_on, eq_preset;
int8_t eq_custom[EQ_BANDS];

const char *const eq_band_name[EQ_BANDS] = { "31", "62", "125", "250", "500", "1k", "2k", "4k",
                                             "8k", "16k" };
static const char *const names[EQ_PRESETS] = { "Flat", "Rock", "Pop", "Jazz", "Classical",
                                               "Bass boost", "Vocal", "Treble", "Custom" };
static const int8_t presets[EQ_PRESETS - 1][EQ_BANDS] = {
    { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },           /* Flat */
    { 5, 4, 3, 1, -1, -1, 1, 3, 4, 5 },         /* Rock */
    { -1, 1, 3, 4, 3, 0, -1, -1, 0, 1 },        /* Pop */
    { 3, 2, 1, 2, -1, -1, 0, 1, 2, 3 },         /* Jazz */
    { 0, 0, 0, 0, 0, 0, -2, -3, -3, -4 },       /* Classical */
    { 6, 5, 4, 2, 0, 0, 0, 0, 0, 0 },           /* Bass boost */
    { -2, -2, -1, 1, 3, 4, 3, 1, 0, -1 },       /* Vocal */
    { 0, 0, 0, 0, 0, 1, 2, 4, 5, 6 },           /* Treble */
};

const int8_t *eq_gains(void)
{
    return eq_preset >= 0 && eq_preset < EQ_CUSTOM ? presets[eq_preset] : eq_custom;
}

const char *eq_preset_name(void)
{
    return names[eq_preset >= 0 && eq_preset < EQ_PRESETS ? eq_preset : EQ_CUSTOM];
}

int eq_active(void)
{
    const int8_t *g = eq_gains();
    for (int i = 0; eq_on && i < EQ_BANDS; i++)
        if (g[i])
            return 1;
    return 0;
}

void eq_to_ctl(void)
{
    volatile struct hp_ctl *c = HP_CTL;
    const int8_t *g = eq_gains();
    int on = eq_active();
    for (int i = 0; i < EQ_BANDS; i++)
        c->eq_gain[i] = on ? g[i] : 0;
    c->eq_seq++;
}
