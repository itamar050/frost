/* The main menu (MENU held) and the date and time screen */
#include "ui_priv.h"
#include "version.h"

/* ---- main menu ---- */
static const char *const m_names[M_COUNT] = {
    "Files", "Now playing", "Theme: ", "Buttons", "Date and time", "ReplayGain: ",
    "USB disk, read only", "USB disk, read/write", "Install a firmware (.IMG)", "System screen",
    "USB loader mode (exit: RST)", "About FROST",
};

int main_menu(void)
{
    int sel = 0, top = 0, dirty = 1;
    for (;;) {
        if (dirty) {                            /* ROWS of the M_COUNT entries: scrolled */
            lcd_fill(0, 0, LCD_W, LCD_H, BG);
            lcd_glyph(4, 0, 0x266b, ACCENT, BG);
            lcd_text(18, 0, "FROST", TITLE_FG, BG);
            for (int i = top; i < M_COUNT && i < top + ROWS; i++) {
                uint16_t bg = i == sel ? SEL_BG : BG;
                int y = ROW_Y0 + 16 * (i - top);
                lcd_fill(0, y, LCD_W, 16, bg);
                if (i == sel)
                    lcd_fill(0, y, 3, 16, ACCENT);
                char b[48];
                char *p = put_str(b, m_names[i]);
                if (i == M_RG)
                    p = put_str(p, rg_names[rg_mode]);
                if (i == M_THEME)
                    p = put_str(p, th->name);
                *p = 0;
                lcd_text_clip(12, y, b, list_text_end(M_COUNT, ROWS), FG, bg);
            }
            list_scrollbar(ROW_Y0, ROWS, top, M_COUNT);
            dirty = 0;
        }
        sys_idle();
        ui_background();
        struct key_ev e;
        int ev = key_poll(&e), k = e.key;
        if (ev == EV_NONE) {
            cpu_wait();
            continue;
        }
        if (k == KEY_PLAY && ev == EV_PRESS && sel == M_THEME) {
            theme_set((theme_index + 1) % THEME_COUNT);     /* seen at once */
            resume_save();
            dirty = 1;
        } else if (k == KEY_PLAY && ev == EV_PRESS && sel == M_RG) {
            rg_mode = (rg_mode + 1) % RG_MODES; /* album, track, off: changed in place */
            rg_apply();
            resume_save();
            dirty = 1;
        } else if (k == KEY_VOLUP && ev != EV_LONG) {
            list_move(&sel, &top, M_COUNT, ROWS, -1);
            dirty = 1;
        } else if (k == KEY_VOLDOWN && ev != EV_LONG) {
            list_move(&sel, &top, M_COUNT, ROWS, 1);
            dirty = 1;
        } else if (k == KEY_BACK || (k == KEY_MENU && ev == EV_PRESS))
            return -1;
        else if (k == KEY_PLAY && ev == EV_PRESS)
            return sel;
    }
}

/* ---- date and time: VOL+/VOL- change the field, PLAY the next one (the last one saves), BACK
 * the previous one (the first one cancels), MENU cancels. Playback goes on meanwhile. ---- */
void clock_screen(void)
{
    struct rtc_tm t;
    int ok = rtc_get(&t), f = 0, dirty = 1;
    if (ok < 0) {
        lcd_fill(0, 0, LCD_W, LCD_H, BG);
        lcd_text(8, 60, "no clock found (I2C1, 0xA2)", WARN, BG);
        mdelay(1500);
        return;
    }
    if (!ok)
        t.year = 2026, t.mon = 1, t.day = 1, t.hour = 12, t.min = 0;
    t.sec = 0;
    for (;;) {
        if (dirty) {
            static const uint8_t ml[12] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
            int dmax = ml[t.mon - 1] + (t.mon == 2 && t.year % 4 == 0);
            if (t.day > dmax)
                t.day = (uint8_t)dmax;
            lcd_fill(0, 0, LCD_W, LCD_H, BG);
            lcd_text(4, 0, "Date and time", TITLE_FG, BG);
            unsigned v[5] = { t.year, t.mon, t.day, t.hour, t.min };
            static const uint8_t wd[5] = { 4, 2, 2, 2, 2 };
            static const char *const sep[5] = { "-", "-", "  ", ":", "" };
            int x = 8;
            for (int i = 0; i < 5; i++) {
                char b[6];
                for (int k = wd[i] - 1, n = (int)v[i]; k >= 0; k--, n /= 10)
                    b[k] = (char)('0' + n % 10);
                b[wd[i]] = 0;
                int w = lcd_text_width_x(b, 2);
                lcd_text_clip_x(x, 50, b, x + w, FG, i == f ? SEL_BG : BG, 2);
                x += w;
                if (*sep[i]) {
                    w = lcd_text_width_x(sep[i], 2);
                    lcd_text_clip_x(x, 50, sep[i], x + w, DIM, BG, 2);
                    x += w;
                }
            }
            lcd_text(4, 118, "VOL+/VOL-: change   PLAY: next, save", DIM, BG);
            lcd_text(4, 136, "BACK: previous, cancel   MENU: cancel", DIM, BG);
            if (!ok)
                lcd_text(4, 154, "the clock had stopped: not set", WARN, BG);
            dirty = 0;
        }
        sys_idle();
        ui_background();
        struct key_ev e;
        int ev = key_poll(&e), k = e.key;
        if (ev == EV_NONE) {
            cpu_wait();
            continue;
        }
        if (k == KEY_VOLUP || k == KEY_VOLDOWN) {
            int d = k == KEY_VOLUP ? 1 : -1;
            if (f == 0)
                t.year = (uint16_t)(t.year + d < 2024 ? 2099 : t.year + d > 2099 ? 2024 : t.year + d);
            else if (f == 1)
                t.mon = (uint8_t)((t.mon - 1 + 12 + d) % 12 + 1);
            else if (f == 2)
                t.day = (uint8_t)((t.day - 1 + 31 + d) % 31 + 1);
            else if (f == 3)
                t.hour = (uint8_t)((t.hour + 24 + d) % 24);
            else
                t.min = (uint8_t)((t.min + 60 + d) % 60);
            dirty = 1;
        } else if (k == KEY_PLAY && ev == EV_PRESS) {
            if (++f == 5) {
                int r = rtc_set(&t);
                lcd_fill(0, 0, LCD_W, LCD_H, BG);
                lcd_text(8, 60, r ? "the clock did not answer" : "clock set", r ? WARN : FG, BG);
                mdelay(800);
                clock_min = -1;
                return;
            }
            dirty = 1;
        } else if (k == KEY_BACK && ev == EV_PRESS) {
            if (f-- == 0)
                return;
            dirty = 1;
        } else if (k == KEY_MENU && ev == EV_PRESS)
            return;
    }
}

/* ---- FROST: the button map editor. MENU switches the screen (browser / play screen), VOL+ and
 * VOL- move, PLAY gives the slot the next action (held: the one before), BACK held puts the
 * defaults back, BACK saves and leaves. ---- */
void buttons_screen(void)
{
    int scr = KM_BROWSER, sel = 0, top = 0, dirty = 1;
    for (;;) {
        if (dirty) {
            lcd_fill(0, 0, LCD_W, LCD_H, BG);
            lcd_text(4, 0, scr == KM_BROWSER ? "Buttons: browser" : "Buttons: play screen",
                     TITLE_FG, BG);
            text_right(LCD_W - 120, LCD_W - 4, 0, "MENU: other", DIM, BG);
            for (int i = top; i < S_COUNT && i < top + 8; i++) {
                int y = ROW_Y0 + 16 * (i - top);
                uint16_t bg = i == sel ? SEL_BG : BG;
                lcd_fill(0, y, LCD_W, 16, bg);
                if (i == sel)
                    lcd_fill(0, y, 3, 16, ACCENT);
                lcd_text_clip(8, y, slot_name(i), 120, DIR_FG, bg);
                lcd_text_clip(124, y, action_name(keymap[scr][i]), LCD_W - 4,
                              keymap[scr][i] ? FG : DIM, bg);
            }
            lcd_text(4, 154, "PLAY: change  BACK: done  BACK held: reset", DIM, BG);
            dirty = 0;
        }
        sys_idle();
        ui_background();
        struct key_ev e;
        int ev = key_poll(&e), k = e.key;
        if (ev == EV_NONE) {
            cpu_wait();
            continue;
        }
        dirty = 1;
        if (k == KEY_VOLUP && ev != EV_CHORD)
            list_move(&sel, &top, S_COUNT, 8, -1);
        else if (k == KEY_VOLDOWN && ev != EV_CHORD)
            list_move(&sel, &top, S_COUNT, 8, 1);
        else if (k == KEY_MENU && ev == EV_PRESS)
            scr = scr == KM_BROWSER ? KM_PLAYING : KM_BROWSER;
        else if (k == KEY_PLAY && (ev == EV_PRESS || ev == EV_LONG)) {
            int a = keymap[scr][sel] + (ev == EV_PRESS ? 1 : -1);
            keymap[scr][sel] = (uint8_t)(a < 0 ? A_COUNT - 1 : a >= A_COUNT ? 0 : a);
        } else if (k == KEY_BACK && ev == EV_LONG) {
            keymap_defaults();
            lcd_fill(0, 60, LCD_W, 40, SEL_BG);
            lcd_text(80, 72, "defaults put back", FG, SEL_BG);
            mdelay(700);
        } else if (k == KEY_BACK && ev == EV_PRESS) {
            keymap_fix();
            resume_save();
            log_printf("keymap: saved from the editor");
            return;
        }
    }
}

/* ---- FROST: about, and the boot splash ---- */
static void snowflake(int cx, int cy, int r, uint16_t c)
{
    for (int i = -r; i <= r; i++) {             /* the three axes, and the little branches */
        lcd_fill(cx + i, cy, 1, 1, c);
        lcd_fill(cx, cy + i, 1, 1, c);
        lcd_fill(cx + i, cy + i, 1, 1, c);
        lcd_fill(cx + i, cy - i, 1, 1, c);
    }
    for (int s = -1; s <= 1; s += 2) {
        int a = r * 2 / 3, b = r / 4;
        lcd_fill(cx + s * a - b, cy - b, 1, 2 * b + 1, c);
        lcd_fill(cx - b, cy + s * a - b, 2 * b + 1, 1, c);
    }
}

void splash(void)
{
    lcd_fill(0, 0, LCD_W, LCD_H, BG);
    snowflake(56, 72, 30, ACCENT);
    snowflake(56, 72, 12, TITLE_FG);
    lcd_text_clip_x(104, 40, "FROST", LCD_W, TITLE_FG, BG, 3);
    lcd_text(108, 92, "custom firmware for ECHO MINI", DIM, BG);
    lcd_text(108, 110, "v" FW_VERSION ", on newfw " NEWFW_BASE, DIM, BG);
}

void about_screen(void)
{
    splash();
    lcd_text(4, 136, "PLAY held, BACK held, VOL+ then VOL-:", FG, BG);
    lcd_text(4, 152, "see Buttons. Any key: back", DIM, BG);
    for (;;) {
        sys_idle();
        ui_background();
        struct key_ev e;
        if (key_poll(&e) == EV_PRESS)
            return;
        cpu_wait();
    }
}
