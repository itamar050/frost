/* FROST: Windows Media Audio (.wma, WMA 1 and 2) for our core B runtime, with Rockbox's
 * fixed-point libwma (third_party/libwma, GPL v2 or later; its noise table made const, see
 * BUILD notes there). The ASF container is read here: the header objects (file properties:
 * packet size and duration; the first audio stream's WAVEFORMATEX), then the data packets one
 * at a time, their payloads of the audio stream gathered (as Rockbox's libasf does). WMA Pro,
 * Lossless and Voice, and DRM-protected files are refused. Seeking: the packet at the same
 * fraction of the data (packets have a fixed size). */
#include "rt.h"
#include "codecs/libasf/asf.h"
#include "wmadec.h"

const uint32_t codec_id = HP_CODEC_WMA;

#define PKT_MAX 12288                           /* larger ASF packets are refused */

static WMADecodeContext wma;
static asf_waveformatex_t wfx;
static uint8_t pkt[PKT_MAX] __attribute__((aligned(4)));
static uint32_t data_start, packets, pkt_done;
static uint8_t *pay;                            /* the audio of the current packet */
static int pay_n, pay_off, sf_size, frame_i;    /* superframe at pay_off, its frame */
static int errors;

static const uint8_t G_HEADER[16] = { 0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11,
                                      0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c };
static const uint8_t G_FILEPROP[16] = { 0xa1, 0xdc, 0xab, 0x8c, 0x47, 0xa9, 0xcf, 0x11,
                                        0x8e, 0xe4, 0x00, 0xc0, 0x0c, 0x20, 0x53, 0x65 };
static const uint8_t G_STREAM[16] = { 0x91, 0x07, 0xdc, 0xb7, 0xb7, 0xa9, 0xcf, 0x11,
                                      0x8e, 0xe6, 0x00, 0xc0, 0x0c, 0x20, 0x53, 0x65 };
static const uint8_t G_AUDIO[16] = { 0x40, 0x9e, 0x69, 0xf8, 0x4d, 0x5b, 0xcf, 0x11,
                                     0xa8, 0xfd, 0x00, 0x80, 0x5f, 0x5c, 0x44, 0x2b };
static const uint8_t G_DATA[16] = { 0x36, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11,
                                    0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c };
static const uint8_t G_DRM1[16] = { 0xfb, 0xb3, 0x11, 0x22, 0x23, 0xbd, 0xd2, 0x11,
                                    0xb4, 0xb7, 0x00, 0xa0, 0xc9, 0x55, 0xfc, 0x6e };
static const uint8_t G_DRM2[16] = { 0x14, 0xe6, 0x8a, 0x29, 0x22, 0x26, 0x17, 0x4c,
                                    0xb9, 0x35, 0xda, 0xe0, 0x7e, 0xe9, 0x28, 0x9c };

static uint32_t le16(const uint8_t *p) { return (uint32_t)p[0] | (uint32_t)p[1] << 8; }
static uint32_t le32(const uint8_t *p) { return le16(p) | le16(p + 2) << 16; }
static uint64_t le64(const uint8_t *p) { return le32(p) | (uint64_t)le32(p + 4) << 32; }
static int same(const uint8_t *a, const uint8_t *b)
{
    for (int i = 0; i < 16; i++)
        if (a[i] != b[i])
            return 0;
    return 1;
}

/* The header objects one by one (each read at the stream position, then skipped: cover art may
 * be large), then the Data Object */
static int read_header(uint64_t *dur_100ns, uint32_t *preroll)
{
    uint8_t h[30], o[128];
    if (in_peek_ahead(0, h, 30) < 30 || !same(h, G_HEADER))
        return -HP_ERR_FORMAT;
    uint32_t hsize = (uint32_t)le64(h + 16), pos = 30, nobj = le32(h + 24), have = 0;
    for (uint32_t k = 0; k < nobj && pos + 24 <= hsize; k++) {
        if (in_seek(pos))
            return -HP_ERR_FORMAT;
        uint32_t got = in_peek_ahead(0, o, sizeof o);
        if (got < 24)
            return -HP_ERR_FORMAT;
        uint64_t sz = le64(o + 16);
        if (sz < 24 || sz > hsize)
            return -HP_ERR_FORMAT;
        if (same(o, G_DRM1) || same(o, G_DRM2))
            return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_COMPRESSED);    /* DRM */
        if (same(o, G_FILEPROP) && got >= 104) {
            *dur_100ns = le64(o + 64);
            *preroll = le32(o + 80);
            wfx.packet_size = le32(o + 92);
            packets = le32(o + 56);
            if (le32(o + 96) != wfx.packet_size)
                return -HP_ERR_FORMAT;          /* variable packets: not ASF as we know it */
        } else if (same(o, G_STREAM) && got >= 78 + 18 && same(o + 24, G_AUDIO) && !have) {
            const uint8_t *w = o + 78;
            wfx.audiostream = o[72] & 0x7f;
            wfx.codec_id = (uint16_t)le16(w);
            wfx.channels = (uint16_t)le16(w + 2);
            wfx.rate = le32(w + 4);
            wfx.bitrate = le32(w + 8) * 8;
            wfx.blockalign = (uint16_t)le16(w + 12);
            wfx.bitspersample = (uint16_t)le16(w + 14);
            uint32_t ext = le16(w + 16);
            if (ext > sizeof wfx.data)
                ext = sizeof wfx.data;
            if (78 + 18 + ext > got)
                ext = got - 78 - 18;
            wfx.datalen = (uint16_t)ext;
            for (uint32_t i = 0; i < ext; i++)
                wfx.data[i] = w[18 + i];
            have = 1;
        }
        pos += (uint32_t)sz;
    }
    if (!have || !wfx.packet_size)
        return -HP_ERR_FORMAT;
    if (wfx.codec_id != ASF_CODEC_ID_WMAV1 && wfx.codec_id != ASF_CODEC_ID_WMAV2)
        return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_COMPRESSED);   /* Pro, Lossless, Voice */
    if (wfx.packet_size > PKT_MAX || wfx.channels < 1 || wfx.channels > 2)
        return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_CHANNELS);
    if (in_seek(hsize) || in_peek_ahead(0, o, 50) < 50 || !same(o, G_DATA))
        return -HP_ERR_FORMAT;
    if (!packets)
        packets = le32(o + 40);
    data_start = hsize + 50;
    return 0;
}

int codec_open(void)
{
    uint64_t dur = 0;
    uint32_t preroll = 0;
    __builtin_memset(&wfx, 0, sizeof wfx);
    __builtin_memset(&wma, 0, sizeof wma);
    packets = 0;
    int r = read_header(&dur, &preroll);
    if (r)
        return r;
    if (wma_decode_init(&wma, &wfx) < 0)
        return REFUSE(HP_ERR_UNSUPPORTED, HP_WHY_COMPRESSED);
    ctl->rate = wfx.rate;
    ctl->channels = wfx.channels;
    ctl->bits = 16;
    ctl->frame_bytes = 4;
    uint64_t ms = dur / 10000;
    ms = ms > preroll ? ms - preroll : ms;
    ctl->total_frames = (uint32_t)(ms * wfx.rate / 1000);
    uint32_t start = data_start;
    pkt_done = 0;
    if (ctl->seek_ms && ms && packets) {
        uint32_t p = (uint32_t)((uint64_t)ctl->seek_ms * packets / ms);
        if (p < packets) {
            start += p * wfx.packet_size;
            pkt_done = p;
            ctl->start_frame = (uint32_t)((uint64_t)ctl->seek_ms * wfx.rate / 1000);
        }
    }
    if (in_seek(start))
        return -HP_ERR_FORMAT;
    pay = 0;
    pay_n = pay_off = 0;
    errors = 0;
    return 0;
}

#define LEN2(b) ((b) == 3 ? 4 : (b))
static uint32_t val2(int bits, const uint8_t *p)
{
    return bits == 1 ? p[0] : bits == 2 ? le16(p) : bits == 3 ? le32(p) : 0;
}

/* One packet in pkt[]: the payloads of our stream moved together to pay[], pay_n bytes */
static int parse_packet(void)
{
    const uint32_t size = wfx.packet_size;
    uint8_t *p = pkt, *end = pkt + size;
    pay = 0;
    pay_n = 0;
    if (p[0] & 0x80) {                          /* error correction data */
        if ((p[0] & 0x7f) != 0x02)
            return -1;
        p += 1 + 2;
    }
    uint8_t flags = p[0], prop = p[1];
    p += 2;
    int lt = (flags >> 5) & 3, st = (flags >> 1) & 3, pt = (flags >> 3) & 3;
    uint32_t length = val2(lt, p);
    p += LEN2(lt);
    p += LEN2(st);
    uint32_t padding = val2(pt, p);
    p += LEN2(pt);
    p += 6;                                     /* send time, duration */
    if (!lt || length < size) {
        padding += size - (lt ? length : size);
        length = size;
    }
    if (length > size || padding > size)
        return -1;
    int multiple = flags & 1, count = 1, plt = 2;
    if (multiple) {
        count = p[0] & 0x3f;
        plt = (p[0] >> 6) & 3;
        p++;
    }
    for (int i = 0; i < count && p < end; i++) {
        int stream = p[0] & 0x7f;
        p++;
        p += LEN2((prop >> 4) & 3);             /* media object number */
        p += LEN2((prop >> 2) & 3);             /* offset into it */
        uint32_t repl = val2(prop & 3, p);
        p += LEN2(prop & 3);
        p += repl;
        int32_t n;
        if (multiple) {
            n = (int32_t)val2(plt, p);
            p += LEN2(plt);
        } else
            n = (int32_t)(end - p) - (int32_t)padding;
        if (repl == 1)
            p++;                                /* compressed payloads: a size byte */
        if (n < 0 || p + n > end)
            return -1;
        if (stream == wfx.audiostream) {
            if (!pay)
                pay = p;
            else
                __builtin_memmove(pay + pay_n, p, (uint32_t)n);
            pay_n += n;
        }
        p += n;
    }
    return 0;
}

static void next_superframe(void)
{
    sf_size = pay_n;
    if (wfx.blockalign && pay_n % wfx.blockalign == 0)
        sf_size = wfx.blockalign;
    wma_decode_superframe_init(&wma, pay + pay_off, sf_size);
    frame_i = 0;
}

static int16_t clip(int32_t v)
{
    v = (v + (1 << 13)) >> 14;                  /* 1.0 = 2^29 (measured against ffmpeg) */
    return (int16_t)(v > 32767 ? 32767 : v < -32768 ? -32768 : v);
}

int codec_run(void)
{
    if (!pay || pay_off >= pay_n) {             /* the next packet of our stream */
        if (packets && pkt_done >= packets)
            return 2;
        if (in_avail() < wfx.packet_size && !in_ended())
            return 0;
        if (in_read(pkt, wfx.packet_size) < wfx.packet_size)
            return 2;
        pkt_done++;
        pay_off = 0;
        if (parse_packet() < 0) {
            if (++errors > 20)
                return -HP_ERR_DECODE;
            pay = 0;
            return 1;
        }
        if (pay && pay_n)
            next_superframe();
        else
            pay = 0;
        return 1;
    }
    if (frame_i >= wma.nb_frames) {             /* the next superframe of the payload */
        pay_off += sf_size;
        if (pay_off < pay_n)
            next_superframe();
        return 1;
    }
    if (out_space() < BLOCK_MAX_SIZE * 2 * 4)
        return 0;
    int n = wma_decode_superframe_frame(&wma, pay + pay_off, sf_size);
    frame_i++;
    if (n < 0) {
        if (++errors > 20)
            return -HP_ERR_DECODE;
        pay_off = pay_n;                        /* the rest of this packet dropped */
        return 1;
    }
    errors = 0;
    const fixed32 *l = (*wma.frame_out)[0], *r = (*wma.frame_out)[wfx.channels == 2];
    for (int i = 0; i < n; i++)
        out_word((uint16_t)clip(l[i]) | (uint32_t)(uint16_t)clip(r[i]) << 16);
    if (n)
        out_done((uint32_t)n);
    return 1;
}

/* What libwma takes from Rockbox's codec library */
const uint8_t bs_log2_tab[256] = {
    0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
    5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
};

uint32_t swap32(uint32_t x)
{
    return __builtin_bswap32(x);
}

/* init_vlc sorts its codes: a plain insertion sort (a few hundred entries, at open only) */
void qsort(void *base, size_t n, size_t size, int (*cmp)(const void *, const void *))
{
    uint8_t *b = base, tmp[16];
    if (size > sizeof tmp)
        return;
    for (size_t i = 1; i < n; i++) {
        __builtin_memcpy(tmp, b + i * size, size);
        size_t j = i;
        while (j > 0 && cmp(b + (j - 1) * size, tmp) > 0) {
            __builtin_memcpy(b + j * size, b + (j - 1) * size, size);
            j--;
        }
        __builtin_memcpy(b + j * size, tmp, size);
    }
}
