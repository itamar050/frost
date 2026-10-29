/* FROST: DSD for our core B runtime: DSF (Sony) and DSDIFF (.dff, Philips; uncompressed only, not
 * DST), DSD64, DSD128 and DSD256, mono or stereo, converted to PCM at 88.2 kHz, 24 bits.
 *
 * Stage 1: the 1-bit stream through a low-pass FIR of 64/128/256 taps, computed a byte at a time
 * from tables (for each byte of the history, the sum of the taps under its 8 bits, for its 256
 * values), one output every 1/2/4 bytes: 352.8 kHz. Stage 2: a 96-tap FIR, one output every 4:
 * 88.2 kHz. Both filters: tools/mkdsdfir.py (hifi/dsd_fir.h), over 90 dB against aliasing. The
 * level is raised 6 dB (the SACD reference: 50 % modulation is full scale).
 *
 * DSF: "DSD " (28 bytes), "fmt " (52), "data" (12 + samples), the samples in blocks of
 * block_size bytes per channel, one channel after the other, LSB first (bits per sample 1) or
 * MSB first (8). DSDIFF: "FRM8" <u64 BE size> "DSD ", chunks with u64 BE sizes, padded to even:
 * "PROP" "SND " holding "FS  " (rate), "CHNL" (channels), "CMPR" ("DSD "), then "DSD " with the
 * samples, a byte per channel in turn, MSB first. */
#include "rt.h"
#include "dsd_fir.h"

const uint32_t codec_id = HP_CODEC_DSD;

#define OUT_RATE  88200u
#define S1_RATE   352800u
#define S2_TAPS   96
#define L_MAX     32                            /* bytes of stage 1 history (DSD256) */

static uint32_t rate, ch, lsb_first, block, step;   /* step: bytes per stage 1 output */
static uint32_t L;                                  /* bytes of stage 1 history */
static uint32_t data_left;                          /* bytes of samples left (all channels) */
static uint32_t frame_bytes_ch;                     /* DSF: block per channel; DFF: 1 */
static int dff;

static int32_t lut[L_MAX][256];
static uint8_t rev[256];

static struct chan {
    uint8_t h1[2 * L_MAX];                      /* the bytes, twice (no wrapping in the sum) */
    uint32_t i1, n1;                            /* write place, bytes since the last output */
    int32_t h2[2 * S2_TAPS];
    uint32_t i2, n2;
} cs[2];

static uint32_t be32p(const uint8_t *p)
{
    return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3];
}

static uint32_t le32p(const uint8_t *p)
{
    return (uint32_t)p[3] << 24 | (uint32_t)p[2] << 16 | (uint32_t)p[1] << 8 | p[0];
}

/* The sum tables of stage 1. Tap m applies to the bit m steps before the newest; byte k of the
 * history (0 the oldest) holds the bits 8k (its MSB, the earliest) to 8k + 7. */
static void tables(const int32_t *h)
{
    for (uint32_t k = 0; k < L; k++)
        for (uint32_t v = 0; v < 256; v++) {
            int32_t s = 0;
            for (uint32_t j = 0; j < 8; j++) {
                int32_t t = h[8 * L - 1 - (8 * k + j)];
                s += v & (0x80u >> j) ? t : -t;
            }
            lut[k][v] = s;
        }
    for (uint32_t v = 0; v < 256; v++) {
        uint32_t r = 0;
        for (uint32_t j = 0; j < 8; j++)
            if (v & 1u << j)
                r |= 0x80u >> j;
        rev[v] = (uint8_t)r;
    }
}

static int setup(uint32_t r, uint32_t c, uint64_t bytes_per_ch)
{
    if (c < 1 || c > 2)
        return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_CHANNELS);
    rate = r;
    ch = c;
    if (r == 2822400u) {
        L = 8;
        tables(s1_64);
    } else if (r == 5644800u) {
        L = 16;
        tables(s1_128);
    } else if (r == 11289600u) {
        L = 32;
        tables(s1_256);
    } else
        return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_RATE);
    step = r / 8 / S1_RATE;                     /* 1, 2 or 4 bytes */
    for (uint32_t i = 0; i < 2; i++) {
        for (uint32_t k = 0; k < 2 * L_MAX; k++)
            cs[i].h1[k] = 0x69;                 /* DSD silence: alternating bits */
        for (uint32_t k = 0; k < 2 * S2_TAPS; k++)
            cs[i].h2[k] = 0;
        cs[i].i1 = cs[i].n1 = cs[i].i2 = cs[i].n2 = 0;
    }
    ctl->rate = OUT_RATE;
    ctl->channels = 2;
    ctl->bits = 24;
    ctl->frame_bytes = 8;
    uint64_t frames = bytes_per_ch * 8 / (r / OUT_RATE);
    ctl->total_frames = frames > 0xffffffffu ? 0xffffffffu : (uint32_t)frames;
    return 0;
}

/* A seek: the stream moved to the block (DSF) or byte (DFF) holding the target */
static void seek_to(uint32_t data_off)
{
    if (!ctl->seek_ms)
        return;
    uint64_t f = (uint64_t)ctl->seek_ms * OUT_RATE / 1000;
    if (f >= ctl->total_frames)
        f = ctl->total_frames ? ctl->total_frames - 1 : 0;
    uint64_t byte = f * (rate / OUT_RATE) / 8;  /* per channel */
    byte -= byte % frame_bytes_ch;
    uint64_t off = byte * ch;
    if (byte && off < data_left && in_seek(data_off + (uint32_t)off) == 0) {
        data_left -= (uint32_t)off;
        ctl->start_frame = (uint32_t)(byte * 8 / (rate / OUT_RATE));
    }
}

static int open_dsf(void)
{
    uint8_t h[92];
    if (in_peek_ahead(0, h, sizeof h) < sizeof h)
        return -HP_ERR_FORMAT;
    if (le32p(h + 28) != 0x20746d66u || le32p(h + 80) != 0x61746164u)   /* "fmt ", "data" */
        return -HP_ERR_FORMAT;
    uint32_t fmt_id = le32p(h + 44), chans = le32p(h + 52), r = le32p(h + 56);
    uint32_t bits = le32p(h + 60), bs = le32p(h + 72);
    uint64_t samples = (uint64_t)le32p(h + 64) | (uint64_t)le32p(h + 68) << 32;
    uint64_t dsize = ((uint64_t)le32p(h + 84) | (uint64_t)le32p(h + 88) << 32) - 12;
    if (fmt_id != 0)
        return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_COMPRESSED);
    if (bits != 1 && bits != 8)
        return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_BITS);
    if (!bs || bs > 8192 || bs % 4)
        return -HP_ERR_FORMAT;
    lsb_first = bits == 1;
    block = bs;
    frame_bytes_ch = bs;
    int e = setup(r, chans, (samples + 7) / 8);
    if (e)
        return e;
    uint64_t need = (samples + 7) / 8;          /* the samples, without the padding of the */
    need = (need + bs - 1) / bs * bs * chans;   /* last block (it is cut at the output) */
    data_left = (uint32_t)(dsize < need ? dsize : need);
    in_skip(92);
    seek_to(92);
    return 0;
}

static int open_dff(void)
{
    uint8_t h[16];
    uint32_t pos = 16, fs = 0, chans = 0, cmpr_ok = 0;
    for (;;) {
        if (pos - ctl->in_rd > 8192 && in_seek(pos))   /* a big chunk skipped (comments) */
            return -HP_ERR_FORMAT;
        if (in_peek_ahead(pos - ctl->in_rd, h, 12) < 12)
            return -HP_ERR_FORMAT;
        uint32_t id = be32p(h);
        uint64_t size = (uint64_t)be32p(h + 4) << 32 | be32p(h + 8);
        if (id == 0x50524f50u) {                /* "PROP": its own chunks, after "SND " */
            uint32_t p = pos + 16, end = pos + 12 + (uint32_t)size;
            while (p + 12 <= end) {
                uint8_t c[18];
                if (in_peek_ahead(p - ctl->in_rd, c, sizeof c) < 12)
                    return -HP_ERR_FORMAT;
                uint32_t cid = be32p(c);
                uint32_t csz = be32p(c + 8);
                if (cid == 0x46532020u)         /* "FS  " */
                    fs = be32p(c + 12);
                else if (cid == 0x43484e4cu)    /* "CHNL" */
                    chans = (uint32_t)c[12] << 8 | c[13];
                else if (cid == 0x434d5052u)    /* "CMPR" */
                    cmpr_ok = be32p(c + 12) == 0x44534420u;   /* "DSD " */
                p += 12 + csz + (csz & 1);
            }
        } else if (id == 0x44534420u) {         /* "DSD ": the samples */
            if (!cmpr_ok)
                return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_COMPRESSED);   /* DST */
            lsb_first = 0;
            frame_bytes_ch = 1;
            block = 4096;
            int e = setup(fs, chans, chans ? size / chans : 0);
            if (e)
                return e;
            data_left = (uint32_t)(size > 0xffffffffu ? 0xffffffffu : size);
            data_left -= data_left % ch;
            if (in_seek(pos + 12))
                return -HP_ERR_FORMAT;
            seek_to(pos + 12);
            return 0;
        } else if (id == 0x44535420u)           /* "DST ": compressed */
            return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_COMPRESSED);
        pos += 12 + (uint32_t)size + (uint32_t)(size & 1);
    }
}

int codec_open(void)
{
    uint8_t h[16];
    if (in_peek_ahead(0, h, 16) < 16)
        return -HP_ERR_FORMAT;
    if (le32p(h) == 0x20445344u)                /* "DSD " */
        return open_dsf();
    if (be32p(h) == 0x46524d38u && be32p(h + 12) == 0x44534420u) {     /* "FRM8" ... "DSD " */
        dff = 1;
        return open_dff();
    }
    return -HP_ERR_FORMAT;
}

/* One byte of channel c in; a stage 2 sample out when one is due (*out), 1 then */
static inline int feed(struct chan *s, uint8_t b, int32_t *out)
{
    s->h1[s->i1] = b;
    s->h1[s->i1 + L] = b;
    if (++s->i1 == L)
        s->i1 = 0;
    if (++s->n1 < step)
        return 0;
    s->n1 = 0;
    const uint8_t *hb = s->h1 + s->i1;          /* the L bytes, the oldest first */
    int32_t y = 0;
    for (uint32_t k = 0; k < L; k++)
        y += lut[k][hb[k]];
    s->h2[s->i2] = y;
    s->h2[s->i2 + S2_TAPS] = y;
    if (++s->i2 == S2_TAPS)
        s->i2 = 0;
    if (++s->n2 < 4)
        return 0;
    s->n2 = 0;
    const int32_t *x = s->h2 + s->i2;           /* oldest first; s2 is symmetric */
    int64_t acc = 0;
    for (uint32_t k = 0; k < S2_TAPS; k++)
        acc += (int64_t)x[k] * s2[k];
    *out = (int32_t)(acc >> 15);
    return 1;
}

/* Q24 (1.0: all ones in the stream) to the ring's 32 bits. Full scale is 0.5 of the stream
 * (the SACD reference): +6 dB, clipped. */
static int32_t pcm(int32_t v)
{
    if (v > 0x7fffff)
        v = 0x7fffff;
    if (v < -0x800000)
        v = -0x800000;
    return (int32_t)((uint32_t)v << 8);
}

static uint8_t buf[8192 * 2];

int codec_run(void)
{
    uint32_t group = dff ? 4096u * ch : block * ch;     /* bytes taken at once */
    uint32_t frames_max = group / ch * 8 / (rate / OUT_RATE);
    if (!data_left || (in_avail() == 0 && in_ended()))
        return 2;
    if (out_space() < frames_max * 8 + 8)
        return 0;
    uint32_t n = group < data_left ? group : data_left;
    if (in_avail() < n && !in_ended())
        return 0;
    n = in_read(buf, n);
    if (!n)
        return 2;
    data_left -= n;
    uint32_t frames = 0;
    int32_t o[2] = { 0, 0 };
    if (dff) {                                  /* a byte per channel in turn */
        for (uint32_t i = 0; i + ch <= n; i += ch) {
            int got = feed(&cs[0], buf[i], &o[0]);
            if (ch == 2)
                feed(&cs[1], buf[i + 1], &o[1]);
            else
                o[1] = o[0];
            if (got) {
                out_word((uint32_t)pcm(o[0]));
                out_word((uint32_t)pcm(o[1]));
                frames++;
            }
        }
    } else {                                    /* DSF: a block of each channel */
        uint32_t per = n / ch;
        for (uint32_t i = 0; i < per; i++) {
            uint8_t a = buf[i], b = ch == 2 ? buf[per + i] : a;
            if (lsb_first) {
                a = rev[a];
                b = rev[b];
            }
            int got = feed(&cs[0], a, &o[0]);
            if (ch == 2)
                feed(&cs[1], b, &o[1]);
            else
                o[1] = o[0];
            if (got) {
                out_word((uint32_t)pcm(o[0]));
                out_word((uint32_t)pcm(o[1]));
                frames++;
            }
        }
    }
    out_done(frames);
    return 1;
}
