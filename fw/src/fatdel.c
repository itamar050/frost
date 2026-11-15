/* FROST 1.2i (overlay): deletes one 8.3 file of the internal volume's root (FAT32 only), for the
 * installer at start-up. The order keeps the volume consistent if the power goes meanwhile:
 *   1. its directory entries marked deleted (0xe5): its long-name entries, then its own;
 *   2. its clusters freed in every FAT copy;
 *   3. the free count of FSInfo raised, when it holds one.
 * Cut after 1, its clusters are only lost space (a disk check gives them back); never a file
 * pointing at freed clusters. Writes go through emmc_write_user's fence, set to this volume and
 * closed again. Returns 0, or < 0 (nothing written when the file is not found). */
#include <stdint.h>
#include "emmc.h"
#include "fat.h"
#include "log.h"
#include "fatdel.h"

#define DEL_MAX_LFN 20                          /* 255 characters: 20 entries */

static uint32_t buf[128];

static uint32_t le32p(const uint8_t *p)
{
    return p[0] | p[1] << 8 | p[2] << 16 | (uint32_t)p[3] << 24;
}

static uint32_t fat_next(uint32_t c)
{
    if (emmc_read(vol.fat + c / 128, 1, buf))
        return 0;
    return buf[c % 128] & 0x0fffffff;
}

static int cluster_ok(uint32_t c)
{
    return c >= 2 && c < vol.clusters + 2;
}

static uint8_t sfn_sum(const uint8_t *e)        /* the checksum long-name entries carry */
{
    uint8_t s = 0;
    for (int i = 0; i < 11; i++)
        s = (uint8_t)(((s & 1) << 7) + (s >> 1) + e[i]);
    return s;
}

/* "NAME.EXT" as the 11 bytes of a directory entry */
static void to_83(const char *name, uint8_t *out)
{
    for (int i = 0; i < 11; i++)
        out[i] = ' ';
    int i = 0, k = 0;
    for (; name[i] && name[i] != '.' && k < 8; i++)
        out[k++] = (uint8_t)name[i];
    while (name[i] && name[i] != '.')
        i++;
    if (name[i] == '.')
        for (i++, k = 8; name[i] && k < 11; i++)
            out[k++] = (uint8_t)name[i];
}

static int mark(uint32_t lba, int idx)          /* one directory entry: deleted */
{
    if (emmc_read(lba, 1, buf))
        return -1;
    ((uint8_t *)buf)[32 * idx] = 0xe5;
    return emmc_write_user(lba, 1, buf) ? -2 : 0;
}

int fat_delete_root(const char *name)
{
    uint8_t want[11];
    struct { uint32_t lba; int idx; } run[DEL_MAX_LFN];
    int nrun = 0;
    uint32_t start = 0, size = 0;
    int found = 0, r = 0;

    if (vol.exfat || !vol.mounted)
        return -1;
    to_83(name, want);
    /* the boot sector: FAT copies, their size, FSInfo */
    if (emmc_read(vol.part, 1, buf))
        return -1;
    const uint8_t *b = (const uint8_t *)buf;
    uint32_t nfats = b[16], fatsz = le32p(b + 36), fsinfo = b[48] | b[49] << 8;
    if (!nfats || nfats > 2 || !fatsz)
        return -1;
    /* the entry, and the long-name run just before it */
    for (uint32_t c = vol.root, guard = 0; !found && cluster_ok(c) && guard < 4096;
         c = fat_next(c), guard++) {
        for (uint32_t s = 0; !found && s < vol.spc; s++) {
            uint32_t lba = vol.data + (c - 2) * vol.spc + s;
            if (emmc_read(lba, 1, buf))
                return -1;
            for (int i = 0; i < 16; i++) {
                const uint8_t *e = (const uint8_t *)buf + 32 * i;
                if (e[0] == 0)
                    return -1;                  /* the end: not there */
                if (e[0] == 0xe5) {
                    nrun = 0;
                    continue;
                }
                if (e[11] == 0x0f) {            /* a long-name piece: kept with its place */
                    if (nrun < DEL_MAX_LFN) {
                        run[nrun].lba = lba;
                        run[nrun++].idx = i;
                    }
                    continue;
                }
                int same = !(e[11] & 0x18);     /* a file (not a folder nor the label) */
                for (int k = 0; same && k < 11; k++)
                    same = e[k] == want[k];
                if (!same) {
                    nrun = 0;
                    continue;
                }
                start = (uint32_t)(e[20] | e[21] << 8) << 16 | (uint32_t)(e[26] | e[27] << 8);
                size = le32p(e + 28);
                uint8_t sum = sfn_sum(e);
                if (emmc_user_area(vol.part, vol.data + vol.clusters * vol.spc - vol.part))
                    return -2;
                /* 1. the long-name entries (with this entry's checksum), then the entry */
                for (int k = 0; k < nrun; k++) {
                    if (emmc_read(run[k].lba, 1, buf))
                        return -1;
                    if (((uint8_t *)buf)[32 * run[k].idx + 13] == sum && mark(run[k].lba, run[k].idx))
                        r = -2;
                }
                if (mark(lba, i)) {
                    emmc_user_area(0, 0);
                    return -2;
                }
                found = 1;
                break;
            }
        }
    }
    if (!found)
        return -1;
    /* 2. its clusters, free in each FAT copy, one FAT sector at a time */
    uint32_t freed = 0;
    for (uint32_t c = start, guard = 0; cluster_ok(c) && guard < vol.clusters; guard++) {
        uint32_t sec = c / 128;
        if (emmc_read(vol.fat + sec, 1, buf)) {
            r = -1;
            break;
        }
        uint32_t next = 0;
        while (cluster_ok(c) && c / 128 == sec && guard < vol.clusters) {
            next = buf[c % 128] & 0x0fffffff;
            buf[c % 128] &= 0xf0000000;         /* free; the top 4 bits are reserved */
            freed++;
            guard++;
            c = next;
        }
        for (uint32_t k = 0; k < nfats; k++)
            if (emmc_write_user(vol.fat + k * fatsz + sec, 1, buf))
                r = -2;
        if (r)
            break;
    }
    /* 3. FSInfo's free count, when it is known */
    if (!r && fsinfo && !emmc_read(vol.part + fsinfo, 1, buf) && buf[0] == 0x41615252 &&
        buf[121] == 0x61417272 && buf[122] != 0xffffffffu) {
        buf[122] += freed;
        if (buf[122] > vol.clusters)
            buf[122] = 0xffffffffu;             /* not believable: unknown, the PC counts */
        if (emmc_write_user(vol.part + fsinfo, 1, buf))
            r = -2;
    }
    emmc_user_area(0, 0);                       /* the fence closed again */
    log_printf("fat: %s deleted (%u bytes, %u clusters freed), result %d", name, size, freed, r);
    return r;
}
