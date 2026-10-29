/* The play screen (ETUDE §25, §39): status, title at twice the size, artist and album (scrolled
 * when too long), time and bar (or the seek target), format, volume and ReplayGain; its keys. */
#include "ui_priv.h"

/* The bar in the seek mode: the position dimmed, the target as a mark above and below it */
static void seek_bar(int y, int h, uint32_t pos, uint32_t target, uint32_t len)
{
    int w = bar_x(pos, len), t = 4 + bar_x(target, len);
    lcd_fill(0, y - 2, LCD_W, 2, BG);
    lcd_fill(0, y + h, LCD_W, 3, BG);
    lcd_fill(4, y, w, h, DIM);
    lcd_fill(4 + w, y, LCD_W - 8 - w, h, BAR_BG);
    if (t > LCD_W - 6)
        t = LCD_W - 6;
    lcd_fill(t - 1, y - 2, 3, h + 5, SK_FG);
}

static const char *codec_name(uint32_t c)
{
    static const char *const n[] = { "", "WAV", "FLAC", "MP3", "Vorbis", "Opus", "AIFF", "AAC", "ALAC", "MPC", "DSD", "APE" };
    return c < sizeof n / sizeof *n ? n[c] : "";
}

/* ---- FROST: level meters, two rows of lit segments right of the time (the peak of what the DAC
 * plays now, -42 to 0 dB), falling slowly, with a peak mark held 1 s ---- */
#define VU_X0   150
#define VU_SEG  28
#define VU_SW   5                               /* segment width, then 1 px of gap */
static int vu_lit[2] = { -1, -1 }, vu_pk[2], vu_drawn[2] = { -1, -1 }, vu_pkd[2] = { -1, -1 };
static uint32_t vu_t, vu_pk_t[2];

static void vu_reset(void)
{
    vu_drawn[0] = vu_drawn[1] = vu_pkd[0] = vu_pkd[1] = -1;
    lcd_fill(VU_X0, 112, LCD_W - VU_X0, 16, BG);
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
        int y = 114 + c * 7;
        for (int i = 0; i < VU_SEG; i++) {
            int on = i < vu_lit[c], was = i < vu_drawn[c];
            int pk = i == vu_pk[c] - 1 && vu_pk[c] > vu_lit[c];
            int pkw = i == vu_pkd[c] - 1 && vu_pkd[c] > vu_drawn[c];
            if (vu_drawn[c] >= 0 && on == was && pk == pkw)
                continue;
            int x = VU_X0 + 8 + i * (VU_SW + 1);
            lcd_fill(x, y, VU_SW, 5, on || pk ? vu_color(i) : BAR_BG);
            if (vu_drawn[c] < 0 && i + 1 < VU_SEG)
                lcd_fill(x + VU_SW, y, 1, 5, BG);
        }
        vu_drawn[c] = vu_lit[c];
        vu_pkd[c] = vu_pk[c];
    }
}

/* Lines of the play screen too long for it (artist, album) scroll left: 1.5 s still at the
 * start, then 1 pixel every 33 ms (30 px/s), round and round with a gap of 32 pixels */
#define MQ_GAP   32
#define MQ_PAUSE 1500000u
#define MQ_STEP  33000u
static struct marquee {
    const char *s;
    int x, xmax, y, w, off;
    uint16_t fg;
    uint32_t t;                                 /* start of the pause, then of the last step */
} mq[2];

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
    if (m->w <= xmax - x)
        m->w = 0;                               /* it fits: drawn once, never scrolled */
    lcd_text_clip(x, y, s, xmax, fg, BG);
}

void marquee_tick(void)
{
    uint32_t now = ticks();
    for (int i = 0; i < 2; i++) {
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

/* ---- FROST: the status line: state, place in the queue, play mode on the left; date and time,
 * the output jack, the battery (an icon in colour and its percentage) on the right ---- */
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
    int x = 4;
    x += lcd_glyph(x, 0, st, TITLE_FG, BG);
    p = put_str(b, " ");
    p = put_dec(p, (uint32_t)q_cur + 1);
    p = put_str(p, "/");
    p = put_dec(p, (uint32_t)q_n);
    p = put_str(p, " ");
    *p = 0;
    x = lcd_text(x, 0, b, FG, BG);
    if (play_mode)
        x += lcd_glyph(x, 0, mode_glyph[play_mode], ACCENT, BG);
    /* right side, from the right: battery, jack, date and time */
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
    int xr = LCD_W - 2 - 22;
    battery_icon(xr, 0, pct);
    int tw = lcd_text_width(b);
    lcd_text(xr - 2 - tw, 0, b, battery_low ? WARN : FG, BG);
    xr -= 2 + tw + 6;
    const char *jk = jack_out == 2 ? "4.4" : jack_out == 1 ? "3.5" : "";
    if (*jk) {
        int jw = lcd_text_width(jk) + 6;
        lcd_fill(xr - jw, 2, jw, 12, ACCENT);
        lcd_text_clip(xr - jw + 3, 0, jk, xr - 3, BG, ACCENT);
        lcd_fill(xr - jw, 0, jw, 2, BG);
        lcd_fill(xr - jw, 14, jw, 2, BG);
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
    text_right(x, xr, 0, b, DIM, BG);
}

/* ---- FROST: the cassette. Two reels turn while the music plays; the tape goes from the left
 * one to the right one as the track goes on. ---- */
#define CS_X   4
#define CS_Y   54
#define CS_W   138
#define CS_H   56
#define CS_RY  (CS_Y + 37)                      /* the reels' centre */
#define CS_RL  (CS_X + 34)
#define CS_RR  (CS_X + CS_W - 34)
#define CS_RMIN 7
#define CS_RMAX 14
static int cs_angle, cs_r[2] = { -1, -1 }, cs_hub[2] = { -1, -1 };
static uint32_t cs_t;

static uint16_t tape_color(void)
{
    return RGB(92, 58, 34);
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

static void hub(int cx, int cy, int a)
{
    static const int8_t nx[12] = { 3, 3, 2, 0, -2, -3, -3, -3, -2, 0, 2, 3 };
    static const int8_t ny[12] = { 0, 2, 3, 3, 3, 2, 0, -2, -3, -3, -3, -2 };
    disc(cx, cy, 5, FG);
    for (int k = 0; k < 3; k++) {               /* three teeth, 120 degrees apart */
        int i = (a + 4 * k) % 12;
        lcd_fill(cx + nx[i] - 1, cy + ny[i] - 1, 2, 2, BG);
    }
    lcd_fill(cx - 1, cy - 1, 2, 2, SEL_BG);
}

static void cassette_body(void)
{
    uint16_t body = SEL_BG;
    lcd_fill(CS_X + 2, CS_Y, CS_W - 4, CS_H, body);   /* corners cut: a rounded shell */
    lcd_fill(CS_X, CS_Y + 2, 2, CS_H - 4, body);
    lcd_fill(CS_X + CS_W - 2, CS_Y + 2, 2, CS_H - 4, body);
    lcd_fill(CS_X, CS_Y, 2, 2, BG);
    lcd_fill(CS_X + CS_W - 2, CS_Y, 2, 2, BG);
    lcd_fill(CS_X, CS_Y + CS_H - 2, 2, 2, BG);
    lcd_fill(CS_X + CS_W - 2, CS_Y + CS_H - 2, 2, 2, BG);
    for (int i = 0; i < 4; i++)                 /* screws */
        lcd_fill((i & 1) ? CS_X + CS_W - 7 : CS_X + 5, (i & 2) ? CS_Y + CS_H - 7 : CS_Y + 4, 2, 2,
                 DIM);
    /* the label, in the theme's colour, with the format on it */
    lcd_fill(CS_X + 10, CS_Y + 4, CS_W - 20, 16, TITLE_FG);
    lcd_fill(CS_X + 10, CS_Y + 19, CS_W - 20, 1, ACCENT);
    /* the window over the reels, and the tape between them */
    lcd_fill(CS_RL - CS_RMAX - 2, CS_RY - CS_RMAX - 1, CS_RR - CS_RL + 2 * CS_RMAX + 5, 2 * CS_RMAX + 3,
             BG);
    lcd_fill(CS_X + 44, CS_Y + CS_H - 6, CS_W - 88, 6, DIM);      /* the head opening */
    cs_r[0] = cs_r[1] = cs_hub[0] = cs_hub[1] = -1;
}

static void cassette_label(const char *s)
{
    lcd_fill(CS_X + 10, CS_Y + 4, CS_W - 20, 16, TITLE_FG);
    int w = lcd_text_width(s), x = CS_X + (CS_W - w) / 2;
    if (x < CS_X + 12)
        x = CS_X + 12;
    lcd_text_clip(x, CS_Y + 4, s, CS_X + CS_W - 12, BG, TITLE_FG);
}

static void cassette_reels(int force)
{
    uint32_t len = player_heard.length_ms, pos = now_ms();
    int done = len ? (int)((uint64_t)(pos > len ? len : pos) * 64 / len) : 0;    /* of 64 */
    int r[2] = { CS_RMAX - (CS_RMAX - CS_RMIN) * done / 64, CS_RMIN + (CS_RMAX - CS_RMIN) * done / 64 };
    const int cx[2] = { CS_RL, CS_RR };
    for (int i = 0; i < 2; i++) {
        if (force || r[i] != cs_r[i]) {
            if (r[i] < cs_r[i])
                disc(cx[i], CS_RY, cs_r[i], BG);
            disc(cx[i], CS_RY, r[i], tape_color());
            cs_r[i] = r[i];
            cs_hub[i] = -1;
        }
        if (cs_hub[i] != cs_angle) {
            hub(cx[i], CS_RY, cs_angle);
            cs_hub[i] = cs_angle;
        }
    }
    /* the tape running from one reel to the other along the bottom */
    lcd_fill(CS_RL, CS_RY + CS_RMAX + 1, CS_RR - CS_RL, 1, BG);
    lcd_fill(CS_RL - 2, CS_RY + r[0], 1, 1, tape_color());
    lcd_fill(CS_RL, CS_RY + CS_RMAX + 1, CS_RR - CS_RL, 1, tape_color());
}

static void cassette_tick(void)
{
    if (ticks() - cs_t < 90000)
        return;
    cs_t = ticks();
    if (q_playing && !audio_paused)
        cs_angle = (cs_angle + 11) % 12;        /* turning left, as a tape plays */
    cassette_reels(0);
}

void vu_tick(void)                              /* the meters, and the cassette */
{
    cassette_tick();
    vu_meters();
}

/* The play screen (FROST layout):
 *   0   status line
 *   18  title, twice the size, on one line
 *   54  the cassette (left); artist, album, format (right)
 *   112 time, level meters
 *   130 progress bar
 *   138 volume, ReplayGain
 *   154 the next track */
#define PS_INFO_X (CS_X + CS_W + 8)
void draw_playing(int full)
{
    char b[96], *p;
    if (!q_playing && !q_n) {
        if (full) {
            lcd_fill(0, 0, LCD_W, LCD_H, BG);
            cassette_body();
            cassette_label("FROST");
            cassette_reels(1);
            lcd_text(PS_INFO_X, 66, "nothing plays:", DIM, BG);
            lcd_text(PS_INFO_X, 84, "PLAY on a file", DIM, BG);
        }
        return;
    }
    if (full) {
        lcd_fill(0, 0, LCD_W, LCD_H, BG);       /* a new track: one clear, then the bands */
        mq[0].w = mq[1].w = 0;
        const char *nm = tg.title[0] ? tg.title : q_name(q_cur);
        lcd_text_clip_x(4, 18, nm, LCD_W - 4, FG, BG, 2);
        cassette_body();
        p = put_str(b, codec_name(q_ent(q_cur) ? q_ent(q_cur)->flags & F_CODEC : 0));
        p = put_str(p, " ");
        p = put_dec(p, player_heard.rate / 1000);
        if (player_heard.rate % 1000) {
            *p++ = '.';
            p = put_dec(p, player_heard.rate % 1000 / 100);
        }
        p = put_str(p, "k");
        *p = 0;
        cassette_label(b);
        cassette_reels(1);
        marquee_set(&mq[0], PS_INFO_X, LCD_W - 4, 58, tg.artist[0] ? tg.artist : "unknown artist", TITLE_FG);
        marquee_set(&mq[1], PS_INFO_X, LCD_W - 4, 76, tg.album[0] ? tg.album : q_folder, DIR_FG);
        p = put_dec(b, player_heard.bps);
        p = put_str(p, " bit  ");
        p = put_str(p, codec_name(q_ent(q_cur) ? q_ent(q_cur)->flags & F_CODEC : 0));
        *p = 0;
        lcd_text_clip(PS_INFO_X, 94, b, LCD_W - 4, DIM, BG);
        int nx = q_next_index(q_cur, 0);        /* what comes next */
        if (nx >= 0 && nx != q_cur) {
            int x = lcd_text(4, 154, "next ", DIM, BG);
            lcd_glyph(x, 154, 0x2192, ACCENT, BG);
            lcd_text_clip(x + 14, 154, q_name(nx), LCD_W - 4, DIM, BG);
        }
        vu_reset();
    }
    status_line();
    if (sk_on) {                                /* the target, how far, what the keys do */
        p = put_str(b, "go to ");
        p = fmt_time(p, sk_ms);
        p = put_str(p, " / ");
        p = fmt_time(p, player_heard.length_ms);
        p = put_str(p, sk_ms >= sk_from ? "   +" : "   -");
        p = fmt_time(p, sk_ms >= sk_from ? sk_ms - sk_from : sk_from - sk_ms);
        lcd_text_clip(4, 112, b, LCD_W, SK_FG, BG);
        seek_bar(130, 5, now_ms(), sk_ms, player_heard.length_ms);
        lcd_text_clip(4, 138, "VOL+/- move  PLAY go  BACK cancel", LCD_W, DIM, BG);
        return;
    }
    p = fmt_time(b, now_ms());
    p = put_str(p, " / ");
    p = fmt_time(p, player_heard.length_ms);
    *p = 0;
    lcd_text_clip(4, 112, b, VU_X0, FG, BG);    /* the meters right of it */
    progress_bar(130, 5, now_ms(), player_heard.length_ms);
    p = put_str(b, "VOL -");
    p = put_dec(p, (uint32_t)play_level / 2);
    p = put_str(p, " dB  ");
    *p = 0;
    /* left to right, each pixel once: the text, the ReplayGain box (on yellow when the gain is
     * the track's), then the rest of the line */
    int x = lcd_text(4, 138, b, FG, BG);
    if (rg_mode != RG_MODE_OFF) {
        p = put_str(b, " RG ");
        if (rg_tag == RG_NONE)
            p = put_str(p, "none");
        else {
            unsigned a = (unsigned)(rg_steps < 0 ? -rg_steps : rg_steps);
            *p++ = rg_steps < 0 ? '-' : '+';
            p = put_dec(p, a / 2);
            *p++ = '.';
            *p++ = a % 2 ? '5' : '0';
        }
        p = put_str(p, " ");
        *p = 0;
        int track = rg_tag != RG_NONE && rg_src == RG_TRACK;
        x = lcd_text(x, 138, b, track ? BG : FG, track ? RG_TRACK_BG : BG);
    }
    if (x < LCD_W)
        lcd_fill(x, 138, LCD_W - x, 16, BG);
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
