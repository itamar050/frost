/* Firmware installer: the *.IMG files of the internal root, checked then written by update.c */
#include <stdint.h>
#include "board.h"
#include "fat.h"
#include "keys.h"
#include "lcd.h"
#include "log.h"
#include "sys.h"
#include "sys_priv.h"
#include "ui.h"
#include "update.h"
#include "keymap.h"
#include "ovl.h"
#include "fatdel.h"

#define MAX_IMG 32
#define IMG_ROWS 8                              /* rows of 16 px from y = 18, above the help line */

struct img_list {
    struct fat_file f[MAX_IMG];
    int n;
};

static int is_img(const char *name)
{
    int n = 0;
    while (name[n])
        n++;
    return n > 4 && name[n - 4] == '.' && name[n - 3] == 'I' && name[n - 2] == 'M' && name[n - 1] == 'G';
}

static int collect(const struct fat_file *f, void *ctx)
{
    struct img_list *l = ctx;
    if (is_img(f->name) && f->size >= 0x200)
        l->f[l->n++] = *f;
    return l->n == MAX_IMG;
}

static void progress(int stage, uint32_t done, uint32_t total)
{
    static const char *const what[] = { "checking CRC", "writing FW2", "writing FW1" };
    char b[48], *p = put_str(b, what[stage]);
    p = put_str(p, " ");
    p = put_dec(p, (uint32_t)((uint64_t)done * 100 / total));
    p = put_str(p, " %");
    *p = 0;
    sys_line(112, b, FG);
    int w = (int)((uint64_t)done * (LCD_W - 8) / total);
    lcd_fill(4, 130, w, 6, stage ? WARN : TITLE);
}

static char *put_date(char *p, const struct fw_info *in)
{
    p = put_hex(p, in->year, 4);
    *p++ = '-';
    p = put_hex(p, in->month, 2);
    *p++ = '-';
    return put_hex(p, in->day, 2);
}

/* Returns when the user goes back; reboots after a successful install */
static void firmware_menu(void)
{
    static struct img_list l;
    struct fw_info info;
    char b[64], *p;
    int sel = 0, top = 0;

    l.n = 0;
    if (!storage_err && !volume_err)
        fat_list_root(collect, &l);
    for (;;) {
        lcd_fill(0, 0, LCD_W, LCD_H, BG);
        sys_line(0, "Install firmware (*.IMG, internal root)", TITLE);
        if (storage_err || volume_err)
            sys_line(32, "internal volume not available", WARN);
        else if (!l.n)
            sys_line(32, "no .IMG file in the root folder", WARN);
        if (l.n) {                              /* "selected/count" right-aligned */
            p = put_dec(b, (uint32_t)sel + 1);
            *p++ = '/';
            p = put_dec(p, (uint32_t)l.n);
            *p = 0;
            lcd_text(LCD_W - 4 - lcd_text_width(b), 0, b, DIM, BG);
        }
        for (int i = top; i < l.n && i < top + IMG_ROWS; i++) {
            uint16_t bg = i == sel ? SEL_BG : BG;
            int y = 18 + 16 * (i - top);
            p = put_str(b, l.f[i].name);
            p = put_str(p, "  ");
            p = put_dec(p, l.f[i].size >> 10);
            p = put_str(p, " KiB");
            *p = 0;
            lcd_fill(0, y, 4, 16, bg);
            lcd_text_clip(4, y, b, list_text_end(l.n, IMG_ROWS), FG, bg);
        }
        list_scrollbar(18, IMG_ROWS, top, l.n);
        sys_line(154, "VOL+/VOL-: choose  PLAY: check  BACK", DIM);

        int k;
        while (!(k = key_edge()))
            wdt_kick();
        if (k == KEY_BACK)
            return;
        if (key_list_dir(k))                    /* the list wraps around (FROST: VOL keys */
            list_move(&sel, &top, l.n, IMG_ROWS, key_list_dir(k));   /* as the browser's) */
        if (k != KEY_PLAY || !l.n)
            continue;

        lcd_fill(0, 18, LCD_W, 152, BG);
        p = put_str(b, l.f[sel].name);
        *p = 0;
        sys_line(18, b, FG);
        int r = fw_check(&l.f[sel], &info, progress);
        log_printf("install: %s, %u bytes: check %d (%s)", l.f[sel].name, l.f[sel].size, r,
                   r ? upd_error(r) : "valid");
        if (r) {
            sys_line(112, upd_error(r), WARN);
            sys_line(154, "BACK: return", DIM);
            while (key_edge() != KEY_BACK)
                wdt_kick();
            continue;
        }
        p = put_str(b, "valid image, ");
        p = put_date(p, &info);
        p = put_str(p, ", ");
        p = put_dec(p, info.fw_size >> 20);
        p = put_str(p, " MiB");
        *p = 0;
        sys_line(36, b, FG);
        sys_line(54, info.two_copies ? "writes FW2, then FW1" : "too big for FW2: writes FW1 only", FG);
        unsigned mv = battery_mv();
        if (!vbus() && mv < 3600) {
            sys_line(80, "battery too low: plug the USB cable", WARN);
            sys_line(154, "BACK: return", DIM);
            while (key_edge() != KEY_BACK)
                wdt_kick();
            continue;
        }
        sys_line(80, "do not power off during the install", WARN);
        sys_line(154, "PLAY: install   BACK: cancel", DIM);
        while ((k = key_edge()) != KEY_PLAY && k != KEY_BACK)
            wdt_kick();
        if (k == KEY_BACK)
            continue;
        sys_line(154, "", DIM);
        log_printf("install: writing %s: fw_end %x, %u bytes, %s", l.f[sel].name, info.fw_end,
                   info.fw_size, info.two_copies ? "FW2 then FW1" : "FW1 only");
        log_flush();
        uint32_t t0 = millis();
        r = fw_install(&l.f[sel], &info, progress);
        log_printf("install: result %d (%s) in %u ms", r, r ? upd_error(r) : "ok", millis() - t0);
        log_flush();
        if (r) {
            sys_line(112, upd_error(r), WARN);
            sys_line(130, "restart, then install again", WARN);
            sys_line(154, "BACK: return", DIM);
            while (key_edge() != KEY_BACK)
                wdt_kick();
            continue;
        }
        sys_line(112, "installed: restarting", TITLE);
        mdelay(1500);
        clock_fast_ok();                        /* this loop skips sys_idle(): a restart on */
        reboot();                               /* purpose is not a failed 200 MHz attempt */
    }
}

void ovl_install(void)                          /* (1.2i: in the overlay, ovl.h) */
{
    firmware_menu();
}

/* ---- FROST 1.2i: installing at start-up ----
 * HIFIEC70.IMG in the internal root (the name the stock firmware installs too): checked, then
 * installed after 3 s (BACK: not now), then deleted and the player restarted. When FW1 already
 * holds it: only deleted. Not a valid image, or the battery too low without the cable: a
 * message, the file left alone, the player starts as usual. */
static void boot_wait(int ms)
{
    uint32_t t0 = millis();
    while (millis() - t0 < (uint32_t)ms)
        wdt_kick();
}

static void boot_delete(const char *name)
{
    int r = fat_delete_root(name);
    if (r)
        sys_line(130, "could not delete it: please do", WARN);
}

void ovl_boot_install(const char *name)
{
    struct fat_file f;
    struct fw_info info;
    char b[64], *p;

    if (fat_find_root(name, &f))
        return;
    lcd_fill(0, 0, LCD_W, LCD_H, BG);
    p = put_str(b, "Firmware update: ");
    p = put_str(p, name);
    *p = 0;
    sys_line(0, b, TITLE);
    int r = fw_check(&f, &info, progress);
    log_printf("install at start-up: %s, %u bytes: check %d (%s)", name, f.size, r,
               r ? upd_error(r) : "valid");
    if (r) {
        sys_line(36, "not a valid firmware image:", WARN);
        sys_line(54, upd_error(r), WARN);
        sys_line(80, "left as it is; starting as usual", FG);
        boot_wait(4000);
        return;
    }
    p = put_str(b, "valid image, ");
    p = put_date(p, &info);
    *p = 0;
    sys_line(36, b, FG);
    if (fw_installed(&info)) {
        log_printf("install at start-up: already installed: deleting %s", name);
        sys_line(54, "already installed: deleting the file", FG);
        boot_delete(name);
        boot_wait(2000);
        return;
    }
    if (!vbus() && battery_mv() < 3600) {
        sys_line(54, "battery too low: plug the USB cable", WARN);
        sys_line(72, "and restart; starting as usual", FG);
        boot_wait(4000);
        return;
    }
    sys_line(54, info.two_copies ? "writes FW2, then FW1" : "too big for FW2: writes FW1 only", FG);
    sys_line(80, "do not power off during the install", WARN);
    for (int s = 3; s > 0; s--) {               /* BACK: not now (the file stays) */
        p = put_str(b, "installing in ");
        p = put_dec(p, (uint32_t)s);
        p = put_str(p, " s   BACK: not now");
        *p = 0;
        sys_line(154, b, DIM);
        uint32_t t0 = millis();
        while (millis() - t0 < 1000) {
            wdt_kick();
            if (key_edge() == KEY_BACK) {
                log_printf("install at start-up: skipped (BACK)");
                return;
            }
        }
    }
    sys_line(154, "", DIM);
    log_printf("install at start-up: writing %s: fw_end %x, %u bytes", name, info.fw_end,
               info.fw_size);
    log_flush();
    uint32_t t0 = millis();
    r = fw_install(&f, &info, progress);
    log_printf("install at start-up: result %d (%s) in %u ms", r, r ? upd_error(r) : "ok",
               millis() - t0);
    log_flush();
    if (r) {
        sys_line(112, upd_error(r), WARN);
        sys_line(130, "the file stays: restart to try again", WARN);
        boot_wait(5000);
        return;
    }
    boot_delete(name);
    log_flush();
    sys_line(112, "installed: restarting", TITLE);
    boot_wait(1500);
    clock_fast_ok();
    reboot();
}
