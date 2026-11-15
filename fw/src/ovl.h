/* FROST 1.2i: the code used only when no music plays (installing a firmware, at start-up too,
 * the USB disk, the charging screen) lives in the image, not in the main code, and runs from the
 * DAC ring's RAM: ovl.c loads it there on demand (from FW1, else FW2) after the audio is
 * stopped, checks that it belongs to this very build, runs it and clears the RAM again.
 * audio_start() zeroes the ring before any sound anyway.
 *
 * In the image: header +0x160 = { OVL_MAGIC, offset, length, sum of the main code, sum of the
 * overlay } (tools/mkimg.py --ovl); the overlay starts with struct ovl_head (ovl_head.c), linked
 * at OVL_BASE against the main firmware's symbols (ovl.ld). */
#ifndef OVL_H
#define OVL_H

#include <stdint.h>

#define OVL_BASE   0x03020000u                  /* the DAC ring (link.ld .dacring, 192 KiB) */
#define OVL_MAX    0x30000u
#define OVL_MAGIC  0x4c564f46u                  /* "FOVL" */
#define OVL_SLOT   0x160                        /* in the image header */
#define OVL_SEED   0x46524f53u                  /* ovl_sum's start ("SORF"), as mkimg.py */

#define BOOT_NOTE_START 0x43485247u             /* "GRHC": restart without the charging screen */

struct ovl_head {
    uint32_t magic;
    uint32_t bss_start, bss_end;                /* cleared by the loader */
    void (*install)(void);                      /* the firmware menu (install.c) */
    void (*usb)(int writable);                  /* the USB disk (usbmode.c) */
    void (*charge)(int at_boot);                /* the charging screen (charge.c) */
    void (*boot_install)(const char *name);     /* installing at start-up (install.c) */
};

/* the overlay's entries, in the overlay */
void ovl_install(void);
void ovl_usb(int writable);
void ovl_charge(int at_boot);
void ovl_boot_install(const char *name);

/* "rotate left 5, xor" over n words: the same in mkimg.py */
static inline uint32_t ovl_sum(const uint32_t *p, uint32_t n)
{
    uint32_t s = OVL_SEED;
    while (n--)
        s = (s << 5 | s >> 27) ^ *p++;
    return s;
}

#endif
