/* FROST: Monkey's Audio (.ape) for our core B runtime, with libdemac (Rockbox, GPL v2 or later,
 * third_party/libdemac, unmodified): file versions 3.97 to 3.99 (every compression level, Fast
 * to Insane), 8, 16 or 24 bits, mono or stereo. A leading ID3v2 tag is skipped. Seeking goes to
 * the start of the APE frame holding the target (frames are 73,728 x 4 samples: up to ~6.7 s
 * at 44.1 kHz before it), through the seek table. */
#include "rt.h"
#include "demac.h"
#include "../src/bytes.h"

const uint32_t codec_id = HP_CODEC_APE;

#define BLOCKS  1024                            /* samples per channel decoded at a time */
#define INBUF   16384                           /* compressed bytes held (> 1024 x 2 x 3) */

static struct ape_ctx_t ape;
static uint8_t inb[INBUF] __attribute__((aligned(4)));
static int inb_n, firstbyte, consumed;
static int32_t d0[BLOCKS], d1[BLOCKS];
static uint32_t frame, frame_left, in_frame;

static void shift(int n)                        /* the bytes the decoder used dropped */
{
    if (n <= 0)
        return;
    if (n > inb_n)
        n = inb_n;
    for (int i = n; i < inb_n; i++)
        inb[i - n] = inb[i];
    inb_n -= n;
}

static void refill(void)
{
    uint32_t n = in_avail();
    if (n > (uint32_t)(INBUF - inb_n))
        n = (uint32_t)(INBUF - inb_n);
    if (n)
        inb_n += (int)in_read(inb + inb_n, n);
}

int codec_open(void)
{
    uint8_t h[96];
    uint32_t junk = 0;
    if (in_peek_ahead(0, h, 10) < 10)
        return -HP_ERR_FORMAT;
    if (h[0] == 'I' && h[1] == 'D' && h[2] == '3')     /* ID3v2 before the stream */
        junk = 10 + ((uint32_t)(h[6] & 0x7f) << 21 | (uint32_t)(h[7] & 0x7f) << 14 |
                     (uint32_t)(h[8] & 0x7f) << 7 | (h[9] & 0x7f)) + (h[5] & 0x10 ? 10 : 0);
    if (junk && in_seek(junk))
        return -HP_ERR_FORMAT;
    if (in_peek_ahead(0, h, sizeof h) < 76)
        return -HP_ERR_FORMAT;
    if (ape_parseheaderbuf(h, &ape) < 0)
        return -HP_ERR_FORMAT;
    if (ape.fileversion < APE_MIN_VERSION || ape.fileversion > APE_MAX_VERSION)
        return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_COMPRESSED);
    if (ape.channels < 1 || ape.channels > 2)
        return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_CHANNELS);
    if (ape.bps != 8 && ape.bps != 16 && ape.bps != 24)
        return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_BITS);
    if (!ape.samplerate || !ape.totalframes || !ape.blocksperframe)
        return -HP_ERR_FORMAT;
    ape.junklength = junk;
    ape.firstframe += junk;
    ape.seektablefilepos += (int)junk;
    ctl->rate = ape.samplerate;
    ctl->channels = ape.channels;
    ctl->bits = ape.bps;
    ctl->frame_bytes = ape.bps == 16 ? 4 : 8;
    ctl->total_frames = ape.totalsamples;
    uint32_t start = ape.firstframe;
    frame = 0;
    firstbyte = 3;                              /* the frames are read as 32-bit words */
    if (ctl->seek_ms) {
        uint64_t b = (uint64_t)ctl->seek_ms * ape.samplerate / 1000;
        uint32_t f = (uint32_t)(b / ape.blocksperframe);
        uint8_t e[4];
        if (f < ape.totalframes && f &&
            in_peek_ahead((uint32_t)ape.seektablefilepos + 4 * f - ctl->in_rd, e, 4) == 4) {
            uint32_t off = le32(e) + junk;      /* (the table counts from the stream start) */
            uint32_t skip = (off - ape.firstframe) & 3;
            if (off > ape.firstframe) {
                start = off - skip;
                firstbyte = 3 - (int)skip;
                frame = f;
                ctl->start_frame = f * ape.blocksperframe;
            }
        }
    }
    if (in_seek(start))
        return -HP_ERR_FORMAT;
    inb_n = 0;
    in_frame = 0;
    return 0;
}

int codec_run(void)
{
    refill();
    if (inb_n < INBUF && !in_ended())
        return 0;                               /* the decoder wants its buffer full */
    if (!in_frame) {
        if (frame >= ape.totalframes)
            return 2;
        uint32_t n = frame == ape.totalframes - 1 ? ape.finalframeblocks : ape.blocksperframe;
        ape.currentframeblocks = (int)n;
        init_frame_decoder(&ape, inb, &firstbyte, &consumed);
        shift(consumed);
        frame_left = n;
        in_frame = 1;
        return 1;
    }
    uint32_t n = frame_left < BLOCKS ? frame_left : BLOCKS, fb = ctl->frame_bytes;
    if (out_space() < n * fb)
        return 0;
    int r = decode_chunk(&ape, inb, &firstbyte, &consumed, d0, d1, (int)n);
    if (r < 0)
        return -HP_ERR_DECODE;
    shift(consumed);
    int st = ape.channels == 2;
    for (uint32_t i = 0; i < n; i++) {
        int32_t l = d0[i], rr = st ? d1[i] : l;
        if (ape.bps == 16)
            out_word((uint32_t)(l & 0xffff) | (uint32_t)rr << 16);
        else {
            int sh = ape.bps == 24 ? 8 : 24;
            out_word((uint32_t)l << sh);
            out_word((uint32_t)rr << sh);
        }
    }
    out_done(n);
    frame_left -= n;
    if (!frame_left) {
        in_frame = 0;
        frame++;
    }
    return 1;
}
