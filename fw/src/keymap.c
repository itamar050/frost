/* FROST: button mapping (keymap.h) */
#include "keymap.h"
#include "board.h"
#include "fat.h"
#include "log.h"

uint8_t keymap[KM_SCREENS][S_COUNT];

static const uint8_t defaults[KM_SCREENS][S_COUNT] = {
    /* FROST 1.0b: VOL- moves up the list, VOL+ down (the user's choice; the menus follow) */
    [KM_BROWSER] = { A_OPEN, A_PLAY_ALL, A_PARENT, A_HOME, A_SWITCH, A_MENU, A_DOWN, A_UP, A_JUMP },
    [KM_PLAYING] = { A_PLAYPAUSE, A_NEXT, A_PREV, A_MODE, A_SWITCH, A_MENU, A_VOL_UP, A_VOL_DOWN,
                     A_SEEK },
    /* an audiobook: PLAY held 30 s on, BACK held 30 s back, BACK the chapter's start or the one
     * before, VOL+ then VOL- the next chapter */
    [KM_BOOK]    = { A_PLAYPAUSE, A_FWD, A_PREV, A_REW, A_SWITCH, A_MENU, A_VOL_UP, A_VOL_DOWN,
                     A_NEXT },
};

static const char *const names[A_COUNT] = {
    "nothing",
    "move up", "move down", "page up", "page down", "open / play", "play all under",
    "folder up", "home (top)", "quick jump",
    "play / pause", "next track", "previous track", "volume up", "volume down", "seek mode",
    "forward (10 s, book 30 s)", "back (10 s, book 30 s)", "play mode", "shuffle on/off",
    "browser <-> playing", "main menu", "next theme", "screen off",
};

static const char *const words[A_COUNT] = {
    "none",
    "up", "down", "page_up", "page_down", "open", "play_all", "parent", "home", "jump",
    "play_pause", "next", "prev", "vol_up", "vol_down", "seek", "forward", "rewind", "mode",
    "shuffle",
    "switch", "menu", "theme", "screen_off",
};

static const char *const snames[S_COUNT] = {
    "PLAY", "PLAY held", "BACK", "BACK held", "MENU", "MENU held", "VOL+", "VOL-",
    "VOL+ then VOL-",
};

static const char *const swords[S_COUNT] = {
    "play", "play_hold", "back", "back_hold", "menu", "menu_hold", "vol_up", "vol_down", "chord",
};

const char *action_name(int a)
{
    return a >= 0 && a < A_COUNT ? names[a] : "?";
}

const char *slot_name(int s)
{
    return s >= 0 && s < S_COUNT ? snames[s] : "?";
}

void keymap_defaults(void)
{
    for (int m = 0; m < KM_SCREENS; m++)
        for (int s = 0; s < S_COUNT; s++)
            keymap[m][s] = defaults[m][s];
}

/* Whatever the map, the main menu stays reachable (and with it this editor): when no slot of a
 * screen opens it, MENU held does */
void keymap_fix(void)
{
    for (int m = 0; m < KM_SCREENS; m++) {
        int ok = 0;
        for (int s = 0; s < S_COUNT; s++) {
            if (keymap[m][s] >= A_COUNT)
                keymap[m][s] = A_NONE;
            ok |= keymap[m][s] == A_MENU;
        }
        if (!ok)
            keymap[m][S_MENU_HOLD] = A_MENU;
    }
}

static int repeats(int a)
{
    return a == A_UP || a == A_DOWN || a == A_PAGE_UP || a == A_PAGE_DOWN || a == A_VOL_UP ||
           a == A_VOL_DOWN || a == A_FWD || a == A_REW;
}

int keymap_action(int screen, const struct key_ev *e, int *repeat)
{
    static int fired;                           /* a VOL key held: its one-shot action given */
    int s = -1;
    *repeat = 0;
    switch (e->type) {
    case EV_PRESS:
        fired = 0;
        s = e->key == KEY_PLAY ? S_PLAY : e->key == KEY_BACK ? S_BACK : e->key == KEY_MENU ? S_MENU :
            e->key == KEY_VOLUP ? S_VOLUP : e->key == KEY_VOLDOWN ? S_VOLDOWN : -1;
        break;
    case EV_LONG:
        s = e->key == KEY_PLAY ? S_PLAY_HOLD : e->key == KEY_BACK ? S_BACK_HOLD :
            e->key == KEY_MENU ? S_MENU_HOLD : -1;
        break;
    case EV_REPEAT: {
        s = e->key == KEY_VOLUP ? S_VOLUP : e->key == KEY_VOLDOWN ? S_VOLDOWN : -1;
        if (s < 0)
            return A_NONE;
        int a = keymap[screen][s];
        if (repeats(a)) {
            *repeat = 1;
            return a;
        }
        if (fired)
            return A_NONE;
        fired = 1;
        return a;
    }
    case EV_CHORD:
        fired = 1;                              /* no one-shot after it */
        s = e->key == KEY_VOLUP ? S_CHORD : -1;
        break;
    default:
        break;
    }
    if (!key_held())
        fired = 0;
    return s < 0 ? A_NONE : keymap[screen][s];
}

/* ---- KEYMAP.TXT ----
 *   # a comment
 *   [browser]            or [playing]
 *   play_hold = play_all
 *   vol_up = page_up
 * Unknown lines are skipped (logged). */
static int word_eq(const char *a, int n, const char *w)
{
    int i = 0;
    for (; i < n && w[i]; i++) {
        char c = a[i];
        if (c >= 'A' && c <= 'Z')
            c = (char)(c + 32);
        if (c == '-')
            c = '_';
        if (c != w[i])
            return 0;
    }
    return i == n && !w[i];
}

static int find_word(const char *s, int n, const char *const *list, int count)
{
    for (int i = 0; i < count; i++)
        if (word_eq(s, n, list[i]))
            return i;
    return -1;
}

static void parse_line(const char *l, int n, int *screen, int line)
{
    int i = 0;
    while (i < n && (l[i] == ' ' || l[i] == '\t'))
        i++;
    if (i >= n || l[i] == '#' || l[i] == ';')
        return;
    if (l[i] == '[') {
        int j = ++i;
        while (j < n && l[j] != ']')
            j++;
        *screen = word_eq(l + i, j - i, "browser") ? KM_BROWSER :
                  word_eq(l + i, j - i, "playing") || word_eq(l + i, j - i, "play") ? KM_PLAYING :
                  word_eq(l + i, j - i, "audiobook") || word_eq(l + i, j - i, "book") ? KM_BOOK : -1;
        if (*screen < 0)
            log_printf("keymap: line %d: unknown screen", line);
        return;
    }
    int k0 = i;
    while (i < n && l[i] != '=' && l[i] != ' ' && l[i] != '\t')
        i++;
    int k1 = i;
    while (i < n && (l[i] == ' ' || l[i] == '\t' || l[i] == '='))
        i++;
    int v0 = i;
    while (i < n && l[i] != ' ' && l[i] != '\t' && l[i] != '#')
        i++;
    int s = find_word(l + k0, k1 - k0, swords, S_COUNT);
    int a = find_word(l + v0, i - v0, words, A_COUNT);
    if (*screen < 0 || s < 0 || a < 0) {
        log_printf("keymap: line %d skipped", line);
        return;
    }
    keymap[*screen][s] = (uint8_t)a;
}

int keymap_load_file(void)
{
    static uint32_t buf[1024];                  /* 4 KiB at most */
    struct fat_file f;
    if (fat_find_root("KEYMAP.TXT", &f))
        return 0;
    fat_open(&f);
    uint32_t want = f.size < sizeof buf ? (f.size + 511) & ~511u : sizeof buf;
    int got = fat_read(&f, buf, want);
    if (got < 0)
        return -1;
    uint32_t len = f.size < (uint32_t)got ? f.size : (uint32_t)got;
    const char *t = (const char *)buf;
    int screen = KM_BROWSER, line = 1;
    keymap_defaults();                          /* the file says what changes from them */
    for (uint32_t i = 0, b = 0; i <= len; i++)
        if (i == len || t[i] == '\n' || t[i] == '\r') {
            if (i > b)
                parse_line(t + b, (int)(i - b), &screen, line);
            if (i < len && t[i] == '\n')
                line++;
            b = i + 1;
        }
    keymap_fix();
    log_printf("keymap: KEYMAP.TXT applied (%u bytes)", len);
    return 1;
}

/* The direction a VOL key moves the lists (menus, editors) the same way as the browser's map:
 * -1 up, 1 down, 0 not a VOL key */
int key_list_dir(int key)
{
    if (key != KEY_VOLUP && key != KEY_VOLDOWN)
        return 0;
    int a = keymap[KM_BROWSER][S_VOLUP];
    int up_is_down = a == A_DOWN || a == A_PAGE_DOWN;
    return (key == KEY_VOLUP) == up_is_down ? 1 : -1;
}
