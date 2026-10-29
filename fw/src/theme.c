/* FROST: colour themes (theme.h) */
#include "theme.h"
#include "lcd.h"
#include "hifi_proto.h"

const struct theme themes[THEME_COUNT] = {
    {   /* the original look of newfw */
        "Classic",
        RGB(0, 0, 0), RGB(230, 230, 230), RGB(120, 120, 120), RGB(255, 200, 0), RGB(255, 80, 60),
        RGB(40, 70, 140), RGB(90, 160, 255),
        RGB(255, 210, 90), RGB(140, 200, 255), RGB(90, 160, 255), RGB(40, 40, 50),
        RGB(255, 150, 60), RGB(240, 200, 0),
        RGB(60, 200, 90), RGB(240, 200, 0), RGB(255, 70, 50),
        RGB(92, 58, 34),
    }, {    /* light: white snow, deep blue ink */
        "Snow",
        RGB(236, 241, 247), RGB(18, 24, 36), RGB(118, 128, 144), RGB(0, 92, 176), RGB(206, 40, 30),
        RGB(186, 214, 246), RGB(0, 110, 230),
        RGB(0, 92, 176), RGB(0, 120, 150), RGB(0, 120, 230), RGB(200, 208, 220),
        RGB(230, 110, 0), RGB(250, 205, 40),
        RGB(0, 170, 110), RGB(230, 160, 0), RGB(220, 40, 40),
        RGB(92, 58, 34),
    }, {    /* synthwave night */
        "Neon",
        RGB(14, 4, 30), RGB(244, 232, 255), RGB(140, 106, 180), RGB(255, 60, 200), RGB(255, 70, 90),
        RGB(80, 20, 120), RGB(0, 235, 255),
        RGB(255, 70, 210), RGB(0, 225, 255), RGB(255, 60, 200), RGB(50, 20, 74),
        RGB(0, 235, 255), RGB(255, 230, 0),
        RGB(0, 235, 255), RGB(255, 60, 200), RGB(255, 240, 80),
        RGB(120, 40, 140),
    }, {    /* warm tape deck */
        "Cassette",
        RGB(30, 22, 14), RGB(250, 232, 204), RGB(156, 126, 94), RGB(255, 170, 40), RGB(255, 90, 60),
        RGB(112, 62, 22), RGB(255, 140, 30),
        RGB(255, 176, 60), RGB(240, 204, 130), RGB(255, 140, 30), RGB(72, 52, 32),
        RGB(255, 220, 120), RGB(250, 200, 60),
        RGB(160, 200, 60), RGB(255, 170, 40), RGB(255, 80, 40),
        RGB(18, 10, 4),
    }, {    /* green phosphor */
        "Matrix",
        RGB(0, 0, 0), RGB(170, 255, 170), RGB(40, 140, 60), RGB(80, 255, 120), RGB(255, 80, 60),
        RGB(0, 72, 24), RGB(0, 255, 90),
        RGB(80, 255, 120), RGB(130, 230, 150), RGB(0, 220, 80), RGB(0, 40, 12),
        RGB(200, 255, 120), RGB(160, 255, 0),
        RGB(0, 200, 70), RGB(160, 255, 0), RGB(255, 255, 255),
        RGB(0, 96, 32),
    }, {    /* cherry blossom */
        "Sakura",
        RGB(40, 18, 30), RGB(255, 236, 242), RGB(176, 128, 150), RGB(255, 150, 190), RGB(255, 90, 90),
        RGB(122, 46, 82), RGB(255, 170, 205),
        RGB(255, 160, 200), RGB(255, 206, 222), RGB(255, 120, 170), RGB(76, 36, 56),
        RGB(255, 230, 140), RGB(250, 200, 80),
        RGB(140, 220, 160), RGB(255, 170, 205), RGB(255, 90, 120),
        RGB(130, 60, 86),
    },
};

int theme_index;
const struct theme *th = &themes[0];

void theme_set(int i)
{
    if (i < 0 || i >= THEME_COUNT)
        i = 0;
    theme_index = i;
    th = &themes[i];
}

uint16_t theme_codec_color(uint32_t codec)
{
    switch (codec) {
    case HP_CODEC_FLAC: case HP_CODEC_ALAC: case HP_CODEC_APE:
        return RGB(80, 200, 255);                   /* lossless: blue */
    case HP_CODEC_WAV: case HP_CODEC_AIFF:
        return RGB(150, 150, 255);                  /* uncompressed: violet */
    case HP_CODEC_DSD:
        return RGB(255, 215, 0);                    /* DSD: gold */
    case HP_CODEC_MP3:
        return RGB(255, 140, 60);
    case HP_CODEC_AAC:
        return RGB(255, 90, 140);
    case HP_CODEC_VORBIS: case HP_CODEC_OPUS:
        return RGB(110, 220, 110);
    default:
        return th->dim;
    }
}
