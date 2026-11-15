/* Host test of src/fatdel.c (tools/fatdel_test.sh): a raw FAT32 volume image stands for the
 * eMMC, the volume at sector 0; writes outside the fence fail the test.
 *   fatdel_test VOLUME.img NAME.EXT */
#include <stdarg.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include "fat.h"
#include "emmc.h"
#include "fatdel.h"

struct fat_vol vol;
static FILE *img;
static uint32_t lo, hi;
static unsigned writes;
static int fenced;

int emmc_read(uint32_t s, uint32_t n, void *b)
{
    fseek(img, (long)s * 512, SEEK_SET);
    return fread(b, 512, n, img) == n ? 0 : -1;
}
int emmc_user_area(uint32_t base, uint32_t count)
{
    lo = hi = 0;
    if (!count) return -1;
    lo = base; hi = base + count;
    return 0;
}
int emmc_write_user(uint32_t s, uint32_t n, const void *b)
{
    if (s < lo || s + n > hi) {
        printf("FENCE: write %u outside [%u,%u)\n", s, lo, hi);
        fenced = 1;
        return -9;
    }
    writes += n;
    fseek(img, (long)s * 512, SEEK_SET);
    return fwrite(b, 512, n, img) == n ? 0 : -1;
}
void log_printf(const char *f, ...)
{
    va_list a; va_start(a, f); vprintf(f, a); va_end(a); printf("\n");
}

int main(int argc, char **argv)
{
    uint8_t b[512];
    if (argc != 3 || !(img = fopen(argv[1], "r+b")))
        return 2;
    emmc_read(0, 1, b);
    uint32_t res = b[14] | b[15] << 8, nf = b[16], fsz = b[36] | b[37] << 8 | b[38] << 16 | (uint32_t)b[39] << 24;
    uint32_t tot = b[32] | b[33] << 8 | b[34] << 16 | (uint32_t)b[35] << 24;
    vol.part = 0; vol.spc = b[13]; vol.fat = res; vol.data = res + nf * fsz;
    vol.clusters = (tot - vol.data) / vol.spc;
    vol.root = b[44] | b[45] << 8 | b[46] << 16 | (uint32_t)b[47] << 24;
    vol.exfat = 0; vol.mounted = 1;
    int r = fat_delete_root(argv[2]);
    printf("result %d, %u sectors written, fence closed: %s\n", r, writes, hi == 0 ? "yes" : "NO");
    fclose(img);
    return r || fenced || hi ? 1 : 0;
}
