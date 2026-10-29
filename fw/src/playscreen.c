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
#define RMIN   11
#define RMAX   30
#define TX0    86                               /* the text between the reels */
#define TX1    234
#define TZ_Y   131
#define TAPE_Y (WN_Y1 - 2)                      /* the tape runs along the window's foot */                              /* the trapezoid */

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
    if (play_mode)
        x += lcd_glyph(x, SL_Y, mode_glyph[play_mode], ACCENT, BG);
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

/* ---- the reels: the tape goes from the left one to the right one as the track goes on; they
 * turn while the music plays ---- */
static int cs_angle, cs_r[2] = { -1, -1 }, cs_hub[2] = { -1, -1 };
static uint32_t cs_t;

static uint16_t tape_color(void)
{
    return th->tape;
}

static void disc(int cx, int cy, int r, uint16_t c)
{
    for (int dy = -r; dy <= r; dy++) {
        int dx = 0;
        while ((dx + 1) * (dx + 1) + dy * dy <= r * r)
            dx++;
        lcd_fill(cx - dx, cy + dy, 2 * dx + 1, 1, c);
    }
}

/* The hub: a white wheel with six teeth inside, turning by steps of 30 degrees */
static void hub(int cx, int cy, int a)
{
    static const int8_t nx[12] = { 6, 5, 3, 0, -3, -5, -6, -5, -3, 0, 3, 5 };
    static const int8_t ny[12] = { 0, 3, 5, 6, 5, 3, 0, -3, -5, -6, -5, -3 };
    disc(cx, cy, 9, FG);
    disc(cx, cy, 4, BG);
    for (int k = 0; k < 6; k++) {               /* six teeth, 60 degrees apart */
        int i = (a + 2 * k) % 12;
        lcd_fill(cx + nx[i] - 1, cy + ny[i] - 1, 3, 3, BG);
    }
    lcd_fill(cx - 1, cy - 1, 3, 3, SEL_BG);
}

static void reels(int force)
{
    uint32_t len = player_heard.length_ms, pos = now_ms();
    int done = len ? (int)((uint64_t)(pos > len ? len : pos) * 64 / len) : 0;    /* of 64 */
    int r[2] = { RMAX - (RMAX - RMIN) * done / 64, RMIN + (RMAX - RMIN) * done / 64 };
    const int cx[2] = { RL, RR };
    for (int i = 0; i < 2; i++) {
        if (force || r[i] != cs_r[i]) {
            /* the reel's corner of the window cleared, the pack, the tape from its side down
             * to the run along the window's foot */
            lcd_fill(cx[i] - RMAX - 1, RY - RMAX - 1, 2 * RMAX + 3, TAPE_Y - RY + RMAX + 1, BAR_BG);
            disc(cx[i], RY, r[i], tape_color());
            lcd_fill(cx[i] + (i ? -r[i] : r[i]), RY, 1, TAPE_Y - RY, tape_color());
            cs_r[i] = r[i];
            cs_hub[i] = -1;
        }
        if (cs_hub[i] != cs_angle) {
            hub(cx[i], RY, cs_angle);
            cs_hub[i] = cs_angle;
        }
    }
}

static void cassette_tick(void)
{
    if (ticks() - cs_t < 90000)
        return;
    cs_t = ticks();
    if (q_playing && !audio_paused)
        cs_angle = (cs_angle + 11) % 12;        /* turning left, as a tape plays */
    reels(0);
}

void vu_tick(void)                              /* the reels and the meters */
{
    cassette_tick();
    vu_meters();
}

/* ---- the shell, the label, the window, the bottom ---- */
static void screw(int x, int y)
{
    disc(x, y, 3, DIM);
    lcd_fill(x - 2, y, 5, 1, SEL_BG);
}

static void cassette(void)
{
    uint16_t sh = SEL_BG;
    lcd_fill(0, 0, LCD_W, LCD_H, sh);
    lcd_fill(0, 0, 3, 3, BG);                   /* rounded corners: the screen's own black */
    lcd_fill(LCD_W - 3, 0, 3, 3, BG);
    lcd_fill(0, LCD_H - 3, 3, 3, BG);
    lcd_fill(LCD_W - 3, LCD_H - 3, 3, 3, BG);
    screw(4, 4);
    screw(LCD_W - 5, 4);
    screw(4, LCD_H - 5);
    screw(LCD_W - 5, LCD_H - 5);
    /* the label, with its two coloured stripes */
    lcd_fill(LB_X0, LB_Y0, LB_X1 - LB_X0, LB_Y1 - LB_Y0, BG);
    lcd_fill(LB_X0, LB_Y0, LB_X1 - LB_X0, 1, ACCENT);
    lcd_fill(LB_X0 + 4, 24, LB_X1 - LB_X0 - 8, 2, ACCENT);
    lcd_fill(LB_X0 + 4, 27, LB_X1 - LB_X0 - 8, 1, TITLE_FG);
    /* the window: its frame, the glass behind the reels, the text between them */
    lcd_fill(LB_X0 + 4, WN_Y0, LB_X1 - LB_X0 - 8, WN_Y1 - WN_Y0, DIM);
    lcd_fill(LB_X0 + 5, WN_Y0 + 1, TX0 - LB_X0 - 7, WN_Y1 - WN_Y0 - 2, BAR_BG);
    lcd_fill(TX1 + 2, WN_Y0 + 1, LB_X1 - TX1 - 7, WN_Y1 - WN_Y0 - 2, BAR_BG);
    lcd_fill(TX0 - 2, WN_Y0 + 1, TX1 - TX0 + 4, WN_Y1 - WN_Y0 - 2, BG);
    /* the bottom of the shell: a trapezoid with its two holes */
    for (int y = TZ_Y; y < LCD_H; y++) {
        int in = (y - TZ_Y) / 2;
        lcd_fill(56 - in, y, LCD_W - 112 + 2 * in, 1, BG);
    }
    disc(66, 160, 4, sh);
    disc(LCD_W - 67, 160, 4, sh);
    cs_r[0] = cs_r[1] = cs_hub[0] = cs_hub[1] = -1;
    lcd_fill(RL, TAPE_Y, RR - RL + 1, 1, tape_color());   /* the tape past the heads */
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
        marquee_set(&mq[2], TX0, TX1, 64, tg.album[0] ? tg.album : q_folder, DIR_FG);
        /* the format, on the label under the tape */
        p = put_str(b, codec_name(q_ent(q_cur) ? q_ent(q_cur)->flags & F_CODEC : 0));
        p = put_str(p, "  ");
        p = put_dec(p, player_heard.rate / 1000);
        if (player_heard.rate % 1000) {
            *p++ = '.';
            p = put_dec(p, player_heard.rate % 1000 / 100);
        }
        p = put_str(p, " kHz  ");
        p = put_dec(p, player_heard.bps);
        p = put_str(p, " bit");
        *p = 0;
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
int play_action(int a, int repeat)
{
    (void)repeat;
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
            if (parked)
                player_seek_hint(parked_ms);
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
    } else if (a == A_MODE || a == A_SHUFFLE) {
        if (a == A_MODE)
            play_mode = (play_mode + 1) % MODE_COUNT;
        else
            play_mode = play_mode == MODE_SHUFFLE ? MODE_ORDER : MODE_SHUFFLE;
        rnd ^= ticks();
        if (play_mode == MODE_SHUFFLE)
            q_shuffle_new();
        resume_save();
    } else if ((a == A_FWD || a == A_REW) && (q_playing || parked) && player_heard.length_ms) {
        seek_begin();                           /* 10 s, at once */
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
