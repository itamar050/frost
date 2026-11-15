/* FROST 1.2i: the resident side of the overlay (ovl.h): sys_install, sys_usb and charge_screen
 * load the overlay into the DAC ring's RAM and call it. The rest of the firmware calls them as
 * before. */
#include <stdint.h>
#include "audio.h"
#include "board.h"
#include "emmc.h"
#include "fat.h"
#include "lcd.h"
#include "log.h"
#include "ovl.h"
#include "sys.h"
#include "sys_priv.h"

void *memset(void *d, int c, unsigned n);       /* board.c */

int sys_power_mine, boot_by_power;              /* (were in charge.c) */

extern char _sidata[], _sdata[], _edata[];      /* link.ld: the end of the main code's image */

static uint32_t own_sum(void)                   /* the main code as loaded: text, data copy */
{
    static uint32_t sum;
    if (!sum) {
        uint32_t end = ((uint32_t)_sidata + (uint32_t)(_edata - _sdata) + 3) & ~3u;
        sum = ovl_sum((const uint32_t *)0x03050000u, (end - 0x03050000u) / 4);
    }
    return sum;
}

/* The overlay of this build, loaded and checked, or 0 (logged) */
static const struct ovl_head *ovl_load(void)
{
    if (audio.on)                               /* the ring is about to hold code: the DMA off */
        audio_stop();
    uint32_t me = own_sum();
    uint32_t h[128];
    for (int k = 0; k < 2; k++) {
        uint32_t img = EMMC_FW1 + (k ? emmc.r : 0);     /* FW1, then FW2 */
        const uint8_t *hb = (const uint8_t *)h;
        if (emmc_read(img, 1, h) || hb[0x1f8] != 'R' || hb[0x1ff] != 'W')
            continue;
        const uint32_t *s = &h[OVL_SLOT / 4];
        uint32_t off = s[1], len = s[2], ovl = s[4];
        if (s[0] != OVL_MAGIC || s[3] != me || off % 512 || len < sizeof(struct ovl_head) ||
            len > OVL_MAX - 512 || len % 4)
            continue;                           /* none, or another build's */
        if (emmc_read(img + off / 512, (len + 511) / 512, (void *)OVL_BASE) ||
            ovl_sum((const uint32_t *)OVL_BASE, len / 4) != ovl)
            continue;
        const struct ovl_head *o = (const struct ovl_head *)OVL_BASE;
        if (o->magic != OVL_MAGIC || o->bss_start < OVL_BASE + len || o->bss_end < o->bss_start ||
            o->bss_end > OVL_BASE + OVL_MAX)
            continue;
        memset((void *)o->bss_start, 0, o->bss_end - o->bss_start);
        log_printf("ovl: from %s, %u bytes, %u of BSS", k ? "FW2" : "FW1", len,
                   o->bss_end - o->bss_start);
        return o;
    }
    log_printf("ovl: missing from the image, or not this build's");
    return 0;
}

static void ovl_done(const struct ovl_head *o)  /* the ring's RAM as audio_start() expects it */
{
    memset((void *)OVL_BASE, 0, o->bss_end - OVL_BASE);
}

static void ovl_missing(void)
{
    lcd_fill(0, 0, LCD_W, LCD_H, BG);
    sys_line(40, "This part of the firmware", WARN);
    sys_line(58, "could not be read.", WARN);
    sys_line(84, "Install HIFIEC70.IMG again", FG);
    sys_line(102, "(USB loader mode if needed).", FG);
    mdelay(4000);
}

void sys_install(void)
{
    const struct ovl_head *o = ovl_load();
    if (!o) {
        ovl_missing();
        return;
    }
    o->install();                               /* restarts the player after an installation */
    ovl_done(o);
}

void sys_usb(int writable)
{
    const struct ovl_head *o = ovl_load();
    if (!o) {
        ovl_missing();
        return;
    }
    o->usb(writable);
    ovl_done(o);
}

/* At start-up: HIFIEC70.IMG in the internal root is installed, then deleted (install.c); the
 * overlay is read only when the file is there */
void boot_install(void)
{
    static const char name[] = "HIFIEC70.IMG";
    struct fat_file f;
    if (storage_err || volume_err || vol.exfat || fat_find_root(name, &f))
        return;
    log_printf("ovl: %s in the root: installing at start-up", name);
    const struct ovl_head *o = ovl_load();
    if (!o)
        return;                                 /* the file stays; the player starts as usual */
    o->boot_install(name);                      /* restarts the player after an installation */
    ovl_done(o);
}

void charge_screen(int at_boot)
{
    if (at_boot && (log_boot_note_take() == BOOT_NOTE_START || !vbus() || power_key() ||
                    boot_by_power))
        return;                                 /* switched on by Power, or restarted from here */
    const struct ovl_head *o = ovl_load();
    if (!o) {                                   /* no charging screen: */
        if (!at_boot)
            reboot();                           /* after Power held, start again (as usual) */
        return;                                 /* at boot: the player as usual */
    }
    int rot = lcd_rot;
    if (rot)
        lcd_rotate(LCD_LANDSCAPE);              /* 1.2j: drawn for landscape */
    o->charge(at_boot);
    ovl_done(o);
    if (rot)
        lcd_rotate(rot);
}
