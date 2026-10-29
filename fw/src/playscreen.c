/* The play screen (ETUDE §25, §39; FROST: drawn as a cassette, below) and its keys. */
#include "ui_priv.h"

static const char *codec_name(uint32_t c)
{
    static const char *const n[] = { "", "WAV", "FLAC", "MP3", "Vorbis", "Opus", "AIFF", "AAC", "ALAC", "MPC", "DSD", "APE" };
    return c < sizeof n / sizeof *n ? n[c] : "";
}

/* ---- FROST: the play screen is a cassette. The shell fills the screen; on its label, the
 * status line, the window with the two reels, and between the reels what plays (title,
 * artist, album, time); under the window the tape's progress and the format; in the shell's
 * bottom (where the heads go) the level meters and the next track.
 *
 *   0..170  the shell (SEL_BG), screws in the corners
 *   4..126  the label (BG), x 8..312
 *     6     status line
 *     24    two stripes
 *     30..100 the window: reels at x 50 and 270, the text between x 86..234
 *     104   the tape's progress
 *     110   format, volume, ReplayGain
 *   130..170 the bottom of the shell, a trapezoid (BG): meters, next track ---- */
#define LB_X0  8                                /* the label */
#define LB_X1  312
#define LB_Y0  4
#define LB_Y1  127
#define WN_Y0  30                               /* the window */
#define WN_Y1  101
#define RY     64                               /* the reels' centre */
#define RL     50
#define RR     270
#define RMAX   30
#define TX0    86                               /* the text between the reels */
#define TX1    234
#define TZ_Y   131
#define TAPE_Y (WN_Y1 - 2)                      /* the tape runs along the window's foot */

/* ---- level meters, in the trapezoid ---- */
#define VU_X0   (TX0 - 4)
#define VU_SEG  26
#define VU_SW   5                               /* segment width, then 1 px of gap */
#define VU_Y    135
static int vu_lit[2] = { -1, -1 }, vu_pk[2], vu_drawn[2] = { -1, -1 }, vu_pkd[2] = { -1, -1 };
static uint32_t vu_t, vu_pk_t[2];

static void vu_reset(void)
{
    vu_drawn[0] = vu_drawn[1] = vu_pkd[0] = vu_pkd[1] = -1;
}

static int vu_segments(uint32_t peak)
{
    if (peak < 16)
        return 0;
    int msb = 31 - __builtin_clz(peak);
    int lg4 = msb * 4 + (int)((peak >> (msb - 2)) & 3);   /* log2 in quarter steps: 1.5 dB */
    int n = (lg4 - 32) * VU_SEG / 31;
    return n < 0 ? 0 : n > VU_SEG ? VU_SEG : n;
}

static uint16_t vu_color(int i)
{
    return i >= VU_SEG * 9 / 10 ? th->vu_hi : i >= VU_SEG * 7 / 10 ? th->vu_mid : th->vu_lo;
}

static void vu_meters(void)
{
    if (ticks() - vu_t < 40000)
        return;
    vu_t = ticks();
    if (!q_playing && !q_n)
        return;
    uint32_t lv[2];
    audio_levels(512, &lv[0], &lv[1]);
    for (int c = 0; c < 2; c++) {
        int n = vu_segments(lv[c]);
        if (n >= vu_lit[c])
            vu_lit[c] = n;
        else if (vu_lit[c] > 0)
            vu_lit[c]--;                        /* falls one segment a tick */
        if (n >= vu_pk[c]) {
            vu_pk[c] = n;
            vu_pk_t[c] = millis();
        } else if (millis() - vu_pk_t[c] > 1000 && vu_pk[c] > 0)
            vu_pk[c]--;
        if (vu_lit[c] == vu_drawn[c] && vu_pk[c] == vu_pkd[c])
            continue;
        int y = VU_Y + c * 7;
        for (int i = 0; i < VU_SEG; i++) {
            int on = i < vu_lit[c], was = i < vu_drawn[c];
            int pk = i == vu_pk[c] - 1 && vu_pk[c] > vu_lit[c];
            int pkw = i == vu_pkd[c] - 1 && vu_pkd[c] > vu_drawn[c];
            if (vu_drawn[c] >= 0 && on == was && pk == pkw)
                continue;
            int x = VU_X0 + 8 + i * (VU_SW + 1);
            lcd_fill(x, y, VU_SW, 5, on || pk ? vu_color(i) : BAR_BG);
        }
        vu_drawn[c] = vu_lit[c];
        vu_pkd[c] = vu_pk[c];
    }
}

/* Lines too long for the window (title, artist, album) scroll left: 1.5 s still at the start,
 * then 1 pixel every 33 ms (30 px/s), round and round with a gap of 32 pixels. A line that
 * fits is centred between the reels. */
#define MQ_GAP   32
#define MQ_PAUSE 1500000u
#define MQ_STEP  33000u
#define MQ_N     3
static struct marquee {
    const char *s;
    int x, xmax, y, w, off;
    uint16_t fg;
    uint32_t t;                                 /* start of the pause, then of the last step */
} mq[MQ_N];

static void marquee_set(struct marquee *m, int x, int xmax, int y, const char *s, uint16_t fg)
{
    m->s = s;
    m->x = x;
    m->xmax = xmax;
    m->y = y;
    m->fg = fg;
    m->off = 0;
    m->t = ticks();
    m->w = lcd_text_width(s);
    if (m->w <= xmax - x) {                     /* it fits: centred, drawn once */
        int x0 = x + (xmax - x - m->w) / 2;
        lcd_fill(x, y, x0 - x, 16, BG);
        lcd_text_clip(x0, y, s, xmax, fg, BG);
        m->w = 0;
        return;
    }
    lcd_text_clip(x, y, s, xmax, fg, BG);
}

void marquee_tick(void)
{
    uint32_t now = ticks();
    for (int i = 0; i < MQ_N; i++) {
        struct marquee *m = &mq[i];
        if (!m->w || now - m->t < (m->off ? MQ_STEP : MQ_PAUSE))
            continue;
        m->off += m->off ? (int)((now - m->t) / MQ_STEP) : 1;
        m->t = now;
        if (m->off >= m->w + MQ_GAP)
            m->off = 0;                         /* back at the start: still again */
        lcd_text_scroll(m->x, m->y, m->s, m->xmax, m->off, MQ_GAP, m->fg, BG);
    }
}

/* ---- the status line, on the top of the label: state, place in the queue, play mode on the
 * left; date and time, the output jack, the battery (an icon and its percentage) on the right */
#define SL_Y  6
static int battery_low;                         /* under 3,425 mV without USB: shown in red */
static uint32_t bat_t, bat_mv;
int jack_out;                                   /* 0 none, 1: 3.5 mm, 2: 4.4 mm (ui.c) */

static void battery_icon(int x, int y, unsigned pct)
{
    uint16_t c = battery_low ? WARN : pct < 30 ? th->vu_mid : th->vu_lo;
    lcd_fill(x, y + 3, 1, 9, DIM);              /* the outline, the tip at the right */
    lcd_fill(x + 18, y + 3, 1, 9, DIM);
    lcd_fill(x, y + 3, 19, 1, DIM);
    lcd_fill(x, y + 11, 19, 1, DIM);
    lcd_fill(x + 19, y + 5, 2, 5, DIM);
    int w = (int)(pct * 15 / 100);
    lcd_fill(x + 2, y + 5, w, 5, c);
    lcd_fill(x + 2 + w, y + 5, 15 - w, 5, BG);
    lcd_fill(x + 1, y + 4, 1, 7, BG);
    lcd_fill(x + 17, y + 4, 1, 7, BG);
    lcd_fill(x + 1, y + 4, 17, 1, BG);
    lcd_fill(x + 1, y + 10, 17, 1, BG);
}

static void status_line(void)
{
    char b[64], *p;
    static const uint32_t mode_glyph[MODE_COUNT] = { 0, 0x21bb, 0x2460, 0x21c4 };
    uint32_t st = !q_playing || audio_paused ? (parked || audio_paused ? 0x2016 : 0x25a0) : 0x25b6;
    int x = LB_X0 + 4;
    x += lcd_glyph(x, SL_Y, st, TITLE_FG, BG);
    p = put_str(b, " ");
    if (q_n) {
        p = put_dec(p, (uint32_t)q_cur + 1);
        p = put_str(p, "/");
        p = put_dec(p, (uint32_t)q_n);
        p = put_str(p, " ");
    }
    *p = 0;
    x = lcd_text(x, SL_Y, b, FG, BG);
    if (q_book) {                               /* FROST: a book, in a badge */
        int bw = lcd_text_width("BOOK") + 6;
        lcd_fill(x, SL_Y + 2, bw, 12, TITLE_FG);
        lcd_text_clip(x + 3, SL_Y, "BOOK", x + bw - 3, BG, TITLE_FG);
        lcd_fill(x, SL_Y, bw, 2, BG);
        lcd_fill(x, SL_Y + 14, bw, 2, BG);
        x += bw + 4;
    } else if (play_mode)
        x += lcd_glyph(x, SL_Y, mode_glyph[play_mode], ACCENT, BG);
    if (sleep_set) {                            /* the sleep timer: a moon, the minutes left */
        x += lcd_glyph(x, SL_Y, 0x263e, ACCENT, BG);
        p = b;
        if (sleep_set == SLEEP_CHAPTER)
            p = put_str(p, "ch");
        else
            p = put_dec(p, sleep_left_min());
        p = put_str(p, " ");
        *p = 0;
        x = lcd_text(x, SL_Y, b, DIM, BG);
    }
    if (!bat_mv || ticks() - bat_t > 5000000) {
        bat_t = ticks();
        bat_mv = battery_mv();
        battery_low = !vbus() && bat_mv < 3425;     /* = BAT_WARN_MV (ui.c) */
    }
    unsigned pct = battery_pct(bat_mv);
    p = b;
    if (vbus())
        p = put_str(p, charging() ? "CHG " : "USB ");
    p = put_dec(p, pct);
    p = put_str(p, "%");
    *p = 0;
    int xr = LB_X1 - 4 - 22;
    battery_icon(xr, SL_Y, pct);
    lcd_fill(xr + 21, SL_Y, LB_X1 - xr - 21, 16, BG);
    int tw = lcd_text_width(b);
    lcd_text(xr - 2 - tw, SL_Y, b, battery_low ? WARN : FG, BG);
    lcd_fill(xr - 2, SL_Y, 2, 16, BG);
    xr -= 2 + tw + 6;
    const char *jk = jack_out == 2 ? "4.4" : jack_out == 1 ? "3.5" : "";
    if (*jk) {
        int jw = lcd_text_width(jk) + 6;
        lcd_fill(xr - jw, SL_Y + 2, jw, 12, ACCENT);
        lcd_text_clip(xr - jw + 3, SL_Y, jk, xr - 3, BG, ACCENT);
        lcd_fill(xr - jw, SL_Y, jw, 2, BG);
        lcd_fill(xr - jw, SL_Y + 14, jw, 2, BG);
        lcd_fill(xr, SL_Y, 6, 16, BG);
        xr -= jw + 6;
    }
    struct rtc_tm t;
    p = b;
    if (rtc_get(&t) == 1) {
        *p++ = (char)('0' + t.day / 10);
        *p++ = (char)('0' + t.day % 10);
        *p++ = '/';
        *p++ = (char)('0' + t.mon / 10);
        *p++ = (char)('0' + t.mon % 10);
        *p++ = ' ';
        *p++ = (char)('0' + t.hour / 10);
        *p++ = (char)('0' + t.hour % 10);
        *p++ = ':';
        *p++ = (char)('0' + t.min / 10);
        *p++ = (char)('0' + t.min % 10);
    }
    *p = 0;
    text_right(x, xr, SL_Y, b, DIM, BG);
}

/* ---- the cassette, drawn with anti-aliased edges (FROST): every pixel of the reels, the
 * screws, the holes and the slanted edges is computed (coverage of the shape blended with what
 * is under it), then sent as a block. The tape is wound from the left reel onto the right one:
 * the left pack empties down to its hub as the track goes on, the right one fills, their area
 * kept (as on a real tape). ---- */
#define HUB_R   11                              /* the white hub; the pack around it */
#define HOLE_R  7
#define REEL_T  (2 * RMAX + 4)                  /* a reel's tile */
static int cs_angle, cs_r16[2] = { -1, -1 }, cs_hub[2] = { -1, -1 };
static uint32_t cs_t;
static uint16_t tile[REEL_T * REEL_T] __attribute__((section(".dirbuf")));

static uint16_t tape_color(void)
{
    return th->tape;
}

/* RGB565: a toward b by k / 256 */
static uint16_t mix(uint16_t a, uint16_t b, int k)
{
    if (k <= 0)
        return a;
    if (k >= 256)
        return b;
    int ar = a >> 11, ag = a >> 5 & 63, ab = a & 31, br = b >> 11, bg = b >> 5 & 63, bb = b & 31;
    return (uint16_t)((ar + ((br - ar) * k >> 8)) << 11 | (ag + ((bg - ag) * k >> 8)) << 5 |
                      (ab + ((bb - ab) * k >> 8)));
}

static uint32_t isqrt(uint32_t v)
{
    uint32_t r = 0, b = 1u << 30;
    while (b > v)
        b >>= 2;
    while (b) {
        if (v >= r + b) {
            v -= r + b;
            r = (r >> 1) + b;
        } else
            r >>= 1;
        b >>= 2;
    }
    return r;
}

/* Coverage (0-256) of a disc of radius r16 (1/16 px) at distance d16 of its centre */
static int cover(int r16, int d16)
{
    int c = (r16 + 8 - d16) * 16;
    return c < 0 ? 0 : c > 256 ? 256 : c;
}

/* The glass of the window: its colour, a little lighter in a diagonal reflection */
static uint16_t glass(int x, int y)
{
    int band = (x + (y >> 1)) % 56;
    return band < 7 ? mix(BAR_BG, FG, 22) : band < 9 ? mix(BAR_BG, FG, 10) : BAR_BG;
}

/* sin, cos of 10-degree steps, Q12 */
static const int16_t sn[36] = {
    0, 711, 1401, 2048, 2633, 3138, 3547, 3849, 4034, 4096, 4034, 3849, 3547, 3138, 2633,
    2048, 1401, 711, 0, -711, -1401, -2048, -2633, -3138, -3547, -3849, -4034, -4096, -4034,
    -3849, -3547, -3138, -2633, -2048, -1401, -711,
};
#define CS(a) sn[((a) + 9) % 36]

/* One pixel of a reel at (dx16, dy16) from its centre: glass g, the pack to r16, the hub */
static uint16_t reel_px(int dx16, int dy16, uint16_t g, int r16, int ang)
{
    int d = (int)isqrt((uint32_t)(dx16 * dx16 + dy16 * dy16));
    uint16_t c = g;
    if (r16 > HUB_R * 16 && d < r16 + 16) {     /* the pack, in bands, lit from the top left */
        uint16_t t = tape_color();
        if ((d >> 4) % 3 == 0)
            t = mix(t, 0, 40);
        int lit = (-dx16 - dy16) * 24 / (r16 + 1);
        t = lit > 0 ? mix(t, FG, lit) : mix(t, 0, -lit);
        c = mix(c, t, cover(r16, d));
    }
    if (d < HUB_R * 16 + 16) {
        uint16_t w = mix(FG, 0xffff, 120);
        c = mix(c, w, cover(HUB_R * 16, d));                /* the white wheel */
        if (d < HOLE_R * 16 + 16) {
            c = mix(c, mix(BG, SEL_BG, 60), cover(HOLE_R * 16, d));   /* its hole */
            for (int k = 0; k < 6; k++) {       /* six teeth into the hole, turning */
                int a = (ang + 6 * k) % 36;
                int u = (dx16 * CS(a) + dy16 * sn[a]) >> 12, v = (-dx16 * sn[a] + dy16 * CS(a)) >> 12;
                if (u > 3 * 16 && u < HOLE_R * 16 + 8) {
                    int cv = (22 - (v < 0 ? -v : v)) * 16;
                    c = mix(c, w, cv < 0 ? 0 : cv);
                }
            }
            c = mix(c, DIM, cover(16, d));      /* the spindle */
        }
    }
    return c;
}

/* A rectangle of a reel (screen x, y, w, h), drawn from the model */
static void reel_draw(int cx, int x, int y, int w, int h, int r16)
{
    uint16_t *p = tile;
    for (int j = 0; j < h; j++)
        for (int i = 0; i < w; i++)
            *p++ = reel_px((x + i - cx) * 16, (y + j - RY) * 16, glass(x + i, y + j), r16, cs_angle);
    lcd_blit(x, y, w, h, tile);
}

static void reels(int force)
{
    uint32_t len = player_heard.length_ms, pos = now_ms();
    uint32_t done = len ? (uint32_t)((uint64_t)(pos > len ? len : pos) * 4096 / len) : 0;  /* of 4096 */
    const uint32_t h2 = HUB_R * HUB_R * 256, m2 = RMAX * RMAX * 256;   /* in (1/16 px)^2 */
    int r16[2] = { (int)isqrt(h2 + (uint32_t)((uint64_t)(m2 - h2) * (4096 - done) / 4096)),
                   (int)isqrt(h2 + (uint32_t)((uint64_t)(m2 - h2) * done / 4096)) };
    const int cx[2] = { RL, RR };
    for (int i = 0; i < 2; i++) {
        if (force || (r16[i] >> 2) != (cs_r16[i] >> 2)) {      /* the pack: a quarter pixel */
            int x0 = cx[i] - RMAX - 2;
            reel_draw(cx[i], x0, RY - RMAX - 2, REEL_T, REEL_T, r16[i]);
            /* below the tile, then the tape: down from the side of the pack, then along the
             * window's foot to its guide */
            int tx = cx[i] + (i ? -(r16[i] + 8) / 16 : (r16[i] + 8) / 16);
            int gx = i ? RR - RMAX - 4 : RL + RMAX + 4;
            uint16_t row[REEL_T + 8];
            for (int y = RY + RMAX + 2; y <= TAPE_Y; y++) {
                int xa = i ? gx + 3 : x0, xb = i ? x0 + REEL_T : gx - 3;   /* (the guide kept) */
                for (int x = xa; x < xb; x++)
                    row[x - xa] = glass(x, y);
                lcd_blit(xa, y, xb - xa, 1, row);
            }
            for (int y = RY; y < TAPE_Y; y++)
                if ((tx - cx[i]) * (tx - cx[i]) * 256 + (y - RY) * (y - RY) * 256 > r16[i] * r16[i])
                    lcd_fill(tx, y, 1, 1, tape_color());
            lcd_fill(i ? gx + 3 : tx, TAPE_Y, i ? tx - gx - 2 : gx - 3 - tx, 1, tape_color());
            cs_r16[i] = r16[i];
            cs_hub[i] = cs_angle;
        }
        if (cs_hub[i] != cs_angle) {            /* only the hub, turning */
            reel_draw(cx[i], cx[i] - HUB_R - 1, RY - HUB_R - 1, 2 * HUB_R + 3, 2 * HUB_R + 3, r16[i]);
            cs_hub[i] = cs_angle;
        }
    }
}

static void cassette_tick(void)
{
    if (ticks() - cs_t < 80000)
        return;
    cs_t = ticks();
    if (q_playing && !audio_paused)
        cs_angle = (cs_angle + 35) % 36;        /* 10 degrees a step, turning left */
    reels(0);
}

void vu_tick(void)                              /* the reels and the meters */
{
    cassette_tick();
    vu_meters();
}

/* ---- the shell, the label, the window, the bottom ---- */
static void aa_disc(int cx, int cy, int r16, uint16_t c, uint16_t (*under)(int, int))
{
    int r = (r16 >> 4) + 2, w = 2 * r + 1;
    uint16_t *p = tile;
    for (int j = 0; j < w; j++)
        for (int i = 0; i < w; i++) {
            int dx = (i - r) * 16, dy = (j - r) * 16;
            int d = (int)isqrt((uint32_t)(dx * dx + dy * dy));
            *p++ = mix(under(cx - r + i, cy - r + j), c, cover(r16, d));
        }
    lcd_blit(cx - r, cy - r, w, w, tile);
}

static uint16_t shell_at(int x, int y)          /* the shell: lit from the top */
{
    (void)x;
    return mix(SEL_BG, y < LCD_H / 2 ? FG : BG, y < LCD_H / 2 ? (LCD_H / 2 - y) / 3 : (y - LCD_H / 2) / 2);
}

static uint16_t tz_at(int x, int y)             /* in the trapezoid */
{
    (void)x;
    (void)y;
    return BG;
}

static void screw(int x, int y)
{
    aa_disc(x, y, 3 * 16 + 8, mix(DIM, FG, 60), shell_at);
    lcd_fill(x - 2, y, 5, 1, mix(DIM, BG, 120));             /* its slot */
    lcd_fill(x, y - 2, 1, 5, mix(DIM, BG, 120));
}

static void cassette(void)
{
    uint16_t row[LCD_W];
    for (int y = 0; y < LCD_H; y++) {           /* the shell, shaded */
        uint16_t c = shell_at(0, y);
        lcd_fill(0, y, LCD_W, 1, c);
    }
    lcd_fill(0, 0, LCD_W, 1, mix(SEL_BG, FG, 90));         /* its edge catching the light */
    lcd_fill(0, 0, 2, 2, BG);                   /* rounded corners: the screen's own black */
    lcd_fill(LCD_W - 2, 0, 2, 2, BG);
    lcd_fill(0, LCD_H - 2, 2, 2, BG);
    lcd_fill(LCD_W - 2, LCD_H - 2, 2, 2, BG);
    screw(5, 5);
    screw(LCD_W - 6, 5);
    screw(5, LCD_H - 6);
    screw(LCD_W - 6, LCD_H - 6);
    /* the label: rounded, a side letter, two coloured stripes */
    lcd_fill(LB_X0 + 2, LB_Y0, LB_X1 - LB_X0 - 4, LB_Y1 - LB_Y0, BG);
    lcd_fill(LB_X0, LB_Y0 + 2, 2, LB_Y1 - LB_Y0 - 4, BG);
    lcd_fill(LB_X1 - 2, LB_Y0 + 2, 2, LB_Y1 - LB_Y0 - 4, BG);
    lcd_fill(LB_X0 + 1, LB_Y0 + 1, 1, 1, mix(SEL_BG, BG, 160));
    lcd_fill(LB_X1 - 2, LB_Y0 + 1, 1, 1, mix(SEL_BG, BG, 160));
    lcd_fill(LB_X0 + 1, LB_Y1 - 2, 1, 1, mix(SEL_BG, BG, 160));
    lcd_fill(LB_X1 - 2, LB_Y1 - 2, 1, 1, mix(SEL_BG, BG, 160));
    lcd_fill(LB_X0 + 4, 23, LB_X1 - LB_X0 - 8, 2, ACCENT);
    lcd_fill(LB_X0 + 4, 25, LB_X1 - LB_X0 - 8, 1, mix(ACCENT, BG, 128));
    lcd_fill(LB_X0 + 4, 27, LB_X1 - LB_X0 - 8, 1, TITLE_FG);
    /* the window: a frame with a soft inner edge, the glass with its reflection */
    lcd_fill(LB_X0 + 4, WN_Y0, LB_X1 - LB_X0 - 8, WN_Y1 - WN_Y0, mix(DIM, BG, 60));
    lcd_fill(LB_X0 + 5, WN_Y0 + 1, LB_X1 - LB_X0 - 10, 1, mix(DIM, FG, 60));
    for (int y = WN_Y0 + 1; y < WN_Y1 - 1; y++) {
        int x0 = LB_X0 + 5, x1 = TX0 - 2, x2 = TX1 + 2, x3 = LB_X1 - 5;
        for (int x = x0; x < x1; x++)
            row[x - x0] = glass(x, y);
        lcd_blit(x0, y, x1 - x0, 1, row);
        for (int x = x2; x < x3; x++)
            row[x - x2] = glass(x, y);
        lcd_blit(x2, y, x3 - x2, 1, row);
    }
    lcd_fill(TX0 - 2, WN_Y0 + 1, TX1 - TX0 + 4, WN_Y1 - WN_Y0 - 2, BG);
    /* the guides at the window's foot, the tape run between them */
    aa_disc(RL + RMAX + 4, TAPE_Y, 2 * 16, DIM, glass);
    aa_disc(RR - RMAX - 4, TAPE_Y, 2 * 16, DIM, glass);
    lcd_fill(RL + RMAX + 4, TAPE_Y, RR - RL - 2 * RMAX - 8, 1, tape_color());
    /* the bottom of the shell: a trapezoid, its slanted edges smoothed, two holes */
    for (int y = TZ_Y; y < LCD_H; y++) {
        int e16 = 56 * 16 - (y - TZ_Y) * 8;     /* the left edge, 1/16 px */
        int xl = e16 >> 4, f = e16 & 15, xr = LCD_W - 1 - xl;
        lcd_fill(xl + 1, y, xr - xl - 1, 1, BG);
        lcd_fill(xl, y, 1, 1, mix(shell_at(xl, y), BG, 256 - f * 16));
        lcd_fill(xr, y, 1, 1, mix(shell_at(xr, y), BG, 256 - f * 16));
    }
    aa_disc(66, 160, 4 * 16 + 8, mix(SEL_BG, BG, 90), tz_at);
    aa_disc(LCD_W - 67, 160, 4 * 16 + 8, mix(SEL_BG, BG, 90), tz_at);
    cs_r16[0] = cs_r16[1] = cs_hub[0] = cs_hub[1] = -1;
    reels(1);
    vu_reset();
}

/* The tape's progress under the window: wound part in the tape's colour, the rest dim; in the
 * seek mode, the target as a mark */
#define BAR_Y   104
static void tape_bar(uint32_t pos, uint32_t len, int target)
{
    int x0 = LB_X0 + 6, w = LB_X1 - LB_X0 - 12;
    int f = len ? (int)((uint64_t)(pos > len ? len : pos) * (uint32_t)w / len) : 0;
    lcd_fill(x0, BAR_Y - 2, w, 2, BG);
    lcd_fill(x0, BAR_Y + 4, w, 3, BG);
    lcd_fill(x0, BAR_Y, f, 4, BAR_FG);
    lcd_fill(x0 + f, BAR_Y, w - f, 4, BAR_BG);
    if (target >= 0) {
        int t = x0 + (len ? (int)((uint64_t)((uint32_t)target > len ? len : (uint32_t)target) *
                                 (uint32_t)w / len) : 0);
        if (t > x0 + w - 2)
            t = x0 + w - 2;
        lcd_fill(t - 1, BAR_Y - 2, 3, 9, SK_FG);
    }
}

/* FROST: a sample rate in kHz as it is written: 44.1, 22.05, 11.025, 48, 88.2 */
static char *put_khz(char *p, uint32_t hz)
{
    p = put_dec(p, hz / 1000);
    uint32_t f = hz % 1000;
    if (f) {
        *p++ = '.';
        *p++ = (char)('0' + f / 100);
        if (f % 100) {
            *p++ = (char)('0' + f / 10 % 10);
            if (f % 10)
                *p++ = (char)('0' + f % 10);
        }
    }
    return p;
}

/* The format line: lossless files their rate and bit depth; lossy ones (MP3, AAC, Vorbis,
 * Opus, Musepack) their rate and mean bitrate (the decoder's 16 bits say nothing about them);
 * DSD its own rate and what it is converted to */
static void format_line(char *b)
{
    const struct entry *e = q_ent(q_cur);
    uint32_t c = e ? e->flags & F_CODEC : 0, len = player_heard.length_ms;
    uint32_t kbps = e && len > 1000 ? (uint32_t)((uint64_t)e->size * 8 / len) : 0;
    char *p = b;
    if (c == HP_CODEC_DSD) {
        uint32_t per = kbps / (player.channels ? player.channels : 2);   /* kbit/s a channel */
        uint32_t m = per > 8000 ? 256 : per > 4000 ? 128 : 64;
        p = put_str(p, "DSD");
        p = put_dec(p, m);
        p = put_str(p, m == 64 ? " 2.8 MHz" : m == 128 ? " 5.6 MHz" : " 11.3 MHz");
        p = put_str(p, " \xe2\x86\x92 ");
        p = put_khz(p, player_heard.rate);
        p = put_str(p, " kHz");
    } else {
        p = put_str(p, codec_name(c));
        p = put_str(p, "  ");
        p = put_khz(p, player_heard.rate);
        p = put_str(p, " kHz  ");
        int lossy = c == HP_CODEC_MP3 || c == HP_CODEC_AAC || c == HP_CODEC_VORBIS ||
                    c == HP_CODEC_OPUS || c == HP_CODEC_MPC;
        if (lossy && kbps) {
            p = put_dec(p, kbps);
            p = put_str(p, " kbps");
        } else {
            p = put_dec(p, player_heard.bps);
            p = put_str(p, " bit");
        }
    }
    *p = 0;
}

/* A book's third line: "chapter 3/12" (its files), or inside an .m4b its chapter, number and
 * title; drawn again when the chapter changes */
static void book_line(int force)
{
    static char line[64];
    static int shown = -2;
    int c = chapter_at(tg.ch, now_ms());
    if (!force && c == shown)
        return;
    shown = c;
    char *p = line;
    if (c >= 0) {
        p = put_str(p, "ch ");
        p = put_dec(p, (uint32_t)c + 1);
        p = put_str(p, "/");
        p = put_dec(p, tg.ch->n);
        if (tg.ch->title[c][0]) {
            p = put_str(p, " \xc2\xb7 ");
            p = put_str(p, tg.ch->title[c]);
        }
    } else {
        p = put_str(p, "chapter ");
        p = put_dec(p, (uint32_t)q_cur + 1);
        p = put_str(p, " of ");
        p = put_dec(p, (uint32_t)q_n);
    }
    *p = 0;
    marquee_set(&mq[2], TX0, TX1, 64, line, DIR_FG);
}

/* The play screen (FROST): everything framed in the cassette */
void draw_playing(int full)
{
    char b[96], *p;
    if (full) {
        mq[0].w = mq[1].w = mq[2].w = 0;
        cassette();
    }
    status_line();
    if (!q_playing && !q_n) {
        if (full) {
            marquee_set(&mq[0], TX0, TX1, 34, "FROST", TITLE_FG);
            marquee_set(&mq[1], TX0, TX1, 52, "nothing plays", DIM);
            marquee_set(&mq[2], TX0, TX1, 68, "PLAY on a file", DIM);
        }
        return;
    }
    if (full) {
        const char *nm = tg.title[0] ? tg.title : q_name(q_cur);
        marquee_set(&mq[0], TX0, TX1, 32, nm, FG);
        marquee_set(&mq[1], TX0, TX1, 48, tg.artist[0] ? tg.artist : "unknown artist", TITLE_FG);
        if (q_book) {
            book_line(1);
        } else
            marquee_set(&mq[2], TX0, TX1, 64, tg.album[0] ? tg.album : q_folder, DIR_FG);
        /* the format, on the label under the tape (FROST: as the file is) */
        format_line(b);
        lcd_text_clip(LB_X0 + 6, 110, b, 200, DIM, BG);
        /* the next track, in the bottom of the shell */
        int nx = q_next_index(q_cur, 0);
        if (nx >= 0 && nx != q_cur) {
            int x = lcd_glyph(80, 150, 0x2192, ACCENT, BG) + 82;
            lcd_text_clip(x, 150, q_name(nx), LCD_W - 80, DIM, BG);
        }
    }
    if (sk_on) {                                /* the target, how far */
        p = put_str(b, sk_ms >= sk_from ? "+" : "-");
        p = fmt_time(p, sk_ms >= sk_from ? sk_ms - sk_from : sk_from - sk_ms);
        p = put_str(p, " ");
        *p = 0;
        int w = lcd_text_width(b);
        char t[24];
        fmt_time(t, sk_ms);
        int w2 = lcd_text_width(t), x = TX0 + (TX1 - TX0 - w - w2) / 2;
        lcd_fill(TX0, 82, x - TX0, 16, BG);
        x = lcd_text(x, 82, b, SK_FG, BG);
        x = lcd_text(x, 82, t, FG, BG);
        lcd_fill(x, 82, TX1 - x, 16, BG);
        tape_bar(now_ms(), player_heard.length_ms, (int)sk_ms);
        lcd_text_clip(200, 110, "PLAY go  BACK no", LB_X1 - 6, SK_FG, BG);
        return;
    }
    if (q_book)
        book_line(0);                           /* a new chapter inside the .m4b: said */
    p = fmt_time(b, now_ms());
    p = put_str(p, " / ");
    p = fmt_time(p, player_heard.length_ms);
    *p = 0;
    int w = lcd_text_width(b), x = TX0 + (TX1 - TX0 - w) / 2;
    lcd_fill(TX0, 82, x - TX0, 16, BG);
    x = lcd_text(x, 82, b, FG, BG);
    lcd_fill(x, 82, TX1 - x, 16, BG);
    tape_bar(now_ms(), player_heard.length_ms, -1);
    /* the volume and the ReplayGain, right of the format */
    p = put_str(b, "-");
    p = put_dec(p, (uint32_t)play_level / 2);
    p = put_str(p, " dB");
    if (rg_mode != RG_MODE_OFF && rg_tag != RG_NONE) {
        unsigned a = (unsigned)(rg_steps < 0 ? -rg_steps : rg_steps);
        p = put_str(p, "  RG");
        *p++ = rg_steps < 0 ? '-' : '+';
        p = put_dec(p, a / 2);
        *p++ = '.';
        *p++ = a % 2 ? '5' : '0';
    }
    *p = 0;
    int track = rg_mode != RG_MODE_OFF && rg_tag != RG_NONE && rg_src == RG_TRACK;
    text_right(200, LB_X1 - 6, 110, b, track ? RG_TRACK_BG : FG, BG);
}

/* An action on the play screen (keymap.h), or a playback action given on the browser: VOL+/VOL-
 * volume, PLAY pause / play, PLAY held next track (stop past the last), BACK start of the track
 * or the one before, BACK held the play mode (the defaults). Returns UI_*. */
/* FROST: a chapter of the .m4b heard (book.h): from its start */
static void chapter_go(uint32_t ms)
{
    if (parked) {
        parked_ms = ms;
        resume_save();
        return;
    }
    player_seek_hint(ms ? ms : 1);
    play_index(q_cur);
}

int play_action(int a, int repeat)
{
    (void)repeat;
    int ch = q_book ? chapter_at(tg.ch, now_ms()) : -1;     /* FROST: inside an .m4b */
    if (ch >= 0 && (q_playing || parked) && (a == A_NEXT || a == A_PREV)) {
        if (a == A_NEXT && ch + 1 < (int)tg.ch->n) {
            chapter_go(tg.ch->ms[ch + 1]);
            return UI_QUICK | UI_FULL;
        }
        if (a == A_PREV && (now_ms() - tg.ch->ms[ch] > 3000 || ch > 0)) {
            chapter_go(now_ms() - tg.ch->ms[ch] > 3000 ? tg.ch->ms[ch] : tg.ch->ms[ch - 1]);
            return UI_QUICK | UI_FULL;
        }
    }
    if (a == A_VOL_UP)
        volume(-2);
    else if (a == A_VOL_DOWN)
        volume(2);
    else if (a == A_PLAYPAUSE) {
        if (q_playing) {
            audio_pause(!audio_paused);
            resume_save();
        }
        else if (q_n) {
            if (parked)                         /* FROST: a book goes 5 s back after a pause */
                player_seek_hint(q_book ? (parked_ms > 5000 ? parked_ms - 5000 : 1) : parked_ms);
            play_index(q_cur);
        }
    } else if (a == A_NEXT) {
        int n = q_next_index(q_cur, 1);
        if (n >= 0)
            play_index(n);
        else if (q_n && (q_playing || parked)) {
            play_stop(STOP_NOW);                /* past the end of the queue: stopped there, */
            parked = 0;                         /* PLAY plays the last track from its start */
            player_heard.time_ms = 0;
            log_printf("ui: end of the queue (next on the last track)");
            resume_save();
        }
    } else if (a == A_PREV) {
        if (q_n) {
            int prev = q_prev_index(q_cur);     /* shuffle: the one played before */
            if (player_heard.time_ms > 3000 || prev < 0)
                play_index(q_cur);              /* back to the start of the track */
            else
                play_step(prev, -1);
        }
    } else if ((a == A_MODE || a == A_SHUFFLE) && !q_book) {     /* a book stays in order */
        if (a == A_MODE)
            play_mode = (play_mode + 1) % MODE_COUNT;
        else
            play_mode = play_mode == MODE_SHUFFLE ? MODE_ORDER : MODE_SHUFFLE;
        rnd ^= ticks();
        if (play_mode == MODE_SHUFFLE)
            q_shuffle_new();
        resume_save();
    } else if ((a == A_FWD || a == A_REW) && (q_playing || parked) && player_heard.length_ms) {
        seek_begin();                           /* 10 s at once (a book: 30 s) */
        for (int k = 0; k < (q_book ? book_skip_s / 10 : 1); k++)
            seek_move(a == A_FWD ? 1 : -1, 0);
        seek_end(1);
        return UI_QUICK | UI_FULL;
    }
    return UI_QUICK;                            /* the bands redrawn, not the title: a new track */
}                                               /* sets a full drawing (ui_main) */

/* A key while seeking: VOL+/VOL- move the target, PLAY or MENU go there, BACK cancels */
int seek_key(const struct key_ev *e)
{
    if (key_is_vol(e->key)) {
        seek_move(e->key == KEY_VOLUP ? 1 : -1, e->type == EV_REPEAT);
        return UI_QUICK;
    }
    if (e->type != EV_PRESS)
        return UI_QUICK;
    seek_end(e->key != KEY_BACK);               /* PLAY, MENU: go there; BACK: cancel */
    return UI_QUICK | UI_FULL;
}
