/* The main menu (MENU held) and the date and time screen */
#include "ui_priv.h"
#include "version.h"
#include "bt.h"

/* ---- main menu ---- */
static const char *const m_names[M_COUNT] = {
    "Files", "Now playing", "Audiobooks", "Bluetooth: ", "Sleep timer: ", "Theme: ", "Brightness: ", "Buttons",
    "Sort files: ",
    "Tag text: ", "Date and time", "ReplayGain: ",
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
                if (i == M_BRIGHT) {            /* a bar of ten, and the level */
                    for (int lv = 1; lv <= 10; lv++)
                        p = put_str(p, lv <= lcd_level ? "\xe2\x96\xae" : "\xe2\x96\xaf");
                    *p++ = ' ';
                    p = put_dec(p, (uint32_t)lcd_level);
                }
                if (i == M_SLEEP) {
                    if (sleep_set == SLEEP_CHAPTER)
                        p = put_str(p, "end of chapter");
                    else if (sleep_set) {
                        p = put_dec(p, sleep_left_min());
                        p = put_str(p, " min left");
                    } else
                        p = put_str(p, "off");
                }
                if (i == M_BOOKS) {
                    p = put_str(p, " (");
                    p = put_dec(p, (uint32_t)book_count());
                    p = put_str(p, ")");
                }
                if (i == M_BT)
                    p = put_str(p, bt_linked() ? bt_name : bt_state_name());
                if (i == M_SORT)
                    p = put_str(p, sort_by_tag ? "by track number" : "by name");
                if (i == M_TAGCP)
                    p = put_str(p, tag_cp == TAG_CP_AUTO ? "auto (Hebrew or Latin)" :
                                   tag_cp == TAG_CP_HEBREW ? "Hebrew (Windows-1255)" : "Latin-1");
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
        if (k == KEY_PLAY && (ev == EV_PRESS || ev == EV_LONG) && sel == M_BRIGHT) {
            int lv = lcd_level + (ev == EV_PRESS ? 1 : -1);  /* PLAY brighter (wraps), held dimmer */
            lcd_set_level(lv > 10 ? 1 : lv < 1 ? 1 : lv);
            resume_save();
            dirty = 1;
        } else if (k == KEY_PLAY && ev == EV_PRESS && sel == M_SLEEP) {
            sleep_cycle();
            dirty = 1;
        } else if (k == KEY_PLAY && ev == EV_PRESS && sel == M_SORT) {
            sort_by_tag = !sort_by_tag;         /* the folder shown, and the queue's, again */
            dir_load(&path[depth].dir);
            if (path[depth].sel >= dir_n)
                path[depth].sel = path[depth].top = 0;
            q_resort();
            resume_save();
            dirty = 1;
        } else if (k == KEY_PLAY && ev == EV_PRESS && sel == M_TAGCP) {
            tag_cp = (tag_cp + 1) % TAG_CP_COUNT;   /* the next track read with it */
            resume_save();
            dirty = 1;
        } else if (k == KEY_PLAY && ev == EV_PRESS && sel == M_THEME) {
            theme_set((theme_index + 1) % THEME_COUNT);     /* seen at once */
            resume_save();
            dirty = 1;
        } else if (k == KEY_PLAY && ev == EV_PRESS && sel == M_RG) {
            rg_mode = (rg_mode + 1) % RG_MODES; /* album, track, off: changed in place */
            rg_apply();
            resume_save();
            dirty = 1;
        } else if (key_list_dir(k) && ev != EV_LONG && ev != EV_CHORD) {
            list_move(&sel, &top, M_COUNT, ROWS, key_list_dir(k));
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
            lcd_text(4, 0, scr == KM_BROWSER ? "Buttons: browser" : scr == KM_PLAYING ?
                     "Buttons: play screen" : "Buttons: audiobook", TITLE_FG, BG);
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
        if (key_list_dir(k) && ev != EV_CHORD)
            list_move(&sel, &top, S_COUNT, 8, key_list_dir(k));
        else if (k == KEY_MENU && ev == EV_PRESS)
            scr = (scr + 1) % KM_SCREENS;
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
    if (!state_saved_anywhere())                /* no state can be kept without it */
        lcd_text(8, 136, "no NEWFWLOG.TXT: copy it to the root to resume", WARN, BG);
}

void about_screen(void)
{
    splash();
    if (!state_saved_anywhere())
        mdelay(1500);
    lcd_fill(0, 136, LCD_W, 16, BG);
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

/* ---- FROST: the audiobooks, the most recent first: PLAY goes back into one, BACK held
 * forgets it, BACK leaves. Returns 1 when a book plays. ---- */
int books_screen(void)
{
    int sel = 0, top = 0, dirty = 1;
    for (;;) {
        int n = book_count();
        if (sel >= n)
            sel = n ? n - 1 : 0;
        if (dirty) {
            lcd_fill(0, 0, LCD_W, LCD_H, BG);
            lcd_text(4, 0, "Audiobooks", TITLE_FG, BG);
            if (!n) {
                lcd_text(8, 40, "no audiobook yet", DIM, BG);
                lcd_text(8, 64, "Books are folders named like", DIM, BG);
                lcd_text(8, 80, "Audiobooks, Books, Podcasts,", DIM, BG);
                lcd_text(8, 96, "\xd7\xa1\xd7\xa4\xd7\xa8\xd7\x99 \xd7\xa9\xd7\x9e\xd7\xa2, or .m4b files", DIM, BG);
            }
            for (int i = top; i < n && i < top + 8; i++) {
                const struct book *b = book_nth(i);
                int y = ROW_Y0 + 16 * (i - top);
                uint16_t bg = i == sel ? SEL_BG : BG;
                lcd_fill(0, y, LCD_W, 16, bg);
                if (i == sel)
                    lcd_fill(0, y, 3, 16, ACCENT);
                char r[32], *p = put_str(r, "ch ");
                p = put_dec(p, b->track + 1);
                p = put_str(p, "/");
                p = put_dec(p, b->tracks);
                p = put_str(p, " ");
                p = fmt_time(p, b->pos_ms);
                *p = 0;
                int rw = lcd_text_width(r);
                lcd_text_clip(8, y, b->name, LCD_W - rw - 12, FG, bg);
                lcd_text(LCD_W - rw - 4, y, r, DIM, bg);
            }
            lcd_text(4, 154, "PLAY: continue  BACK held: forget", DIM, BG);
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
        if (key_list_dir(k) && ev != EV_CHORD)
            list_move(&sel, &top, n, 8, key_list_dir(k));
        else if (k == KEY_PLAY && ev == EV_PRESS && n) {
            if (q_playing)
                play_stop(STOP_NOW);
            parked = 0;
            if (!book_play(book_nth(sel)))
                return 1;
            lcd_fill(0, 60, LCD_W, 30, SEL_BG);
            lcd_text(40, 66, "the book is not there any more", FG, SEL_BG);
            mdelay(1200);
        } else if (k == KEY_BACK && ev == EV_LONG && n) {
            book_forget(book_nth(sel));
        } else if ((k == KEY_BACK || k == KEY_MENU) && ev == EV_PRESS)
            return 0;
    }
}

/* ---- FROST: Bluetooth: on/off, search, the devices found (PLAY connects one), the state.
 * The bottom line shows what the module said last (to see it work, or not). ---- */
void bt_screen(void)
{
    int sel = 0, top = 0, dirty = 1;
    uint32_t rev = bt_rev - 1;
    for (;;) {
        int n = 2 + (bt_linked() ? 1 : bt_nfound);
        if (sel >= n)
            sel = n - 1;
        if (rev != bt_rev) {
            rev = bt_rev;
            dirty = 1;
        }
        if (dirty) {
            lcd_fill(0, 0, LCD_W, LCD_H, BG);
            lcd_text(4, 0, "Bluetooth", TITLE_FG, BG);
            for (int i = top; i < n && i < top + 7; i++) {
                int y = ROW_Y0 + 16 * (i - top);
                uint16_t bg = i == sel ? SEL_BG : BG;
                char b[48], *p = b;
                lcd_fill(0, y, LCD_W, 16, bg);
                if (i == sel)
                    lcd_fill(0, y, 3, 16, ACCENT);
                if (i == 0)
                    p = put_str(put_str(p, "Bluetooth: "), bt_on ? "on" : "off");
                else if (i == 1 && bt_linked())
                    p = put_str(put_str(p, "Forget "), bt_name[0] ? bt_name : "the headphones");
                else if (i == 1)
                    p = put_str(p, bt_state == BT_SCAN ? "Searching..." : "Search for headphones");
                else if (bt_linked()) {         /* 1.1w: the output pins, to try (no sound?) */
                    p = put_str(p, "Sound route test: ");
                    p = put_dec(p, (uint32_t)bt_route + 1);
                    p = put_str(p, bt_route ? " of 4" : " of 4 (as stock)");
                }
                else
                    p = put_str(put_str(p, "  "), bt_found[i - 2].name[0] ? bt_found[i - 2].name
                                                                          : "(no name)");
                *p = 0;
                lcd_text_clip(12, y, b, LCD_W - 8, i >= 2 && !bt_linked() ? DIR_FG : FG, bg);
            }
            char s[64], *p = put_str(s, bt_state_name());
            if (bt_linked())
                p = put_str(put_str(p, ": "), bt_name);
            else if (bt_error)
                p = put_str(put_str(p, ", "), bt_error);
            *p = 0;
            lcd_text_clip(4, 138, s, LCD_W - 4, bt_linked() ? ACCENT : bt_error ? WARN : FG, BG);
            lcd_text_clip(4, 154, bt_last, LCD_W - 4, DIM, BG);
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
        if (key_list_dir(k) && ev != EV_LONG && ev != EV_CHORD)
            list_move(&sel, &top, n, 7, key_list_dir(k));
        else if (k == KEY_PLAY && ev == EV_PRESS) {
            if (sel == 0) {
                bt_enable(!bt_on);
                resume_save();
            } else if (sel == 1 && bt_linked()) {
                bt_forget();
                resume_save();
            } else if (sel == 1) {
                if (!bt_on)
                    bt_enable(1);
                bt_scan();
            } else if (bt_linked()) {
                bt_route = (bt_route + 1) % 4;
                bt_route_apply();
            } else
                bt_connect(sel - 2);
        } else if ((k == KEY_BACK || k == KEY_MENU) && ev == EV_PRESS)
            return;
    }
}

/* FROST: the power-off screen, in the theme: a snowflake, "Power off", the place kept */
void ui_power_splash(void)
{
    lcd_fill(0, 0, LCD_W, LCD_H, BG);
    snowflake(160, 58, 30, ACCENT);
    snowflake(160, 58, 12, TITLE_FG);
    int w = lcd_text_width_x("Power off", 2);
    lcd_text_clip_x((LCD_W - w) / 2, 98, "Power off", (LCD_W + w) / 2, FG, BG, 2);
    const char *m = state_saved_anywhere() ? "your place is kept" : "no place to keep your state";
    int w2 = lcd_text_width(m);
    lcd_text((LCD_W - w2) / 2, 140, m, DIM, BG);
}
