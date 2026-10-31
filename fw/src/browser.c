/* Browser (ETUDE §25, §38): the top level (internal memory, microSD card), folder listings
 * sorted folders first then files in natural order, the path from the top, the card set up on
 * first use and followed by its detect switch, the browser screen and its keys. */
#include "ui_priv.h"

/* ---- names ---- */
static int lower(int c)
{
    return c >= 'A' && c <= 'Z' ? c + 32 : c;
}

/* Natural order, ignoring ASCII case: digit runs compare as numbers ("2" before "10") */
static int name_cmp(const char *a, const char *b)
{
    for (;;) {
        unsigned ca = (uint8_t)*a, cb = (uint8_t)*b;
        if (ca >= '0' && ca <= '9' && cb >= '0' && cb <= '9') {
            while (*a == '0')
                a++;
            while (*b == '0')
                b++;
            const char *ea = a, *eb = b;
            while (*ea >= '0' && *ea <= '9')
                ea++;
            while (*eb >= '0' && *eb <= '9')
                eb++;
            if (ea - a != eb - b)
                return (int)(ea - a) - (int)(eb - b);
            for (; a < ea; a++, b++)
                if (*a != *b)
                    return *a - *b;
            continue;
        }
        if (!ca || !cb)
            return (int)ca - (int)cb;
        int la = lower((int)ca), lb = lower((int)cb);
        if (la != lb)
            return la - lb;
        a++;
        b++;
    }
}

/* Our codec for a file name (by its extension), 0 when we do not play it */
static uint32_t codec_of(const char *name)
{
    static const struct { const char *ext; uint32_t codec; } t[] = {
        { "wav", HP_CODEC_WAV }, { "flac", HP_CODEC_FLAC }, { "fla", HP_CODEC_FLAC },
        { "mp3", HP_CODEC_MP3 }, { "ogg", HP_CODEC_VORBIS }, { "oga", HP_CODEC_VORBIS },
        { "opus", HP_CODEC_OPUS }, { "opu", HP_CODEC_OPUS }, { "aiff", HP_CODEC_AIFF },
        { "aif", HP_CODEC_AIFF }, { "aifc", HP_CODEC_AIFF }, { "m4a", HP_CODEC_AAC },
        { "m4b", HP_CODEC_AAC }, { "mp4", HP_CODEC_AAC }, { "mpc", HP_CODEC_MPC },
        { "mp+", HP_CODEC_MPC }, { "mpp", HP_CODEC_MPC },
        { "dsf", HP_CODEC_DSD }, { "dff", HP_CODEC_DSD },             /* FROST */
        { "ape", HP_CODEC_APE }, { "wma", HP_CODEC_WMA },
    };
    const char *dot = 0;
    for (const char *p = name; *p; p++)
        if (*p == '.')
            dot = p;
    if (!dot)
        return 0;
    for (unsigned i = 0; i < sizeof t / sizeof *t; i++) {
        const char *e = t[i].ext, *p = dot + 1;
        while (*e && lower(*p) == *e) {
            e++;
            p++;
        }
        if (!*e && !*p)
            return t[i].codec;
    }
    return 0;
}

/* ---- directory listings: the folder shown (in .dirbuf), and the queue's (queue.c) ---- */
static struct dir_buf dir __attribute__((section(".dirbuf")));
struct listing dir_l = { .e = dir.e, .order = dir.order, .pool = dir.pool, .max = DIR_MAX,
                         .pool_size = sizeof dir.pool, .name_keep = NAME_KEEP, .key = dir.key };
int sort_by_tag;
int dir_n;

static const struct entry no_entry;             /* an entry that could not be read */

const char *ent_name(int i)
{
    int k = list_index(&dir_l, (uint32_t)i);
    return k < 0 ? "" : dir.pool + dir.e[k].name;
}

const struct entry *ent(int i)
{
    int k = list_index(&dir_l, (uint32_t)i);
    return k < 0 ? &no_entry : &dir.e[k];
}

/* An entry at the end of the listing, its name (len bytes) into the pool; 0 when it is full */
static int list_add(struct listing *l, const char *name, uint32_t len, uint32_t cluster,
                    uint32_t size, uint16_t flags)
{
    if (l->n >= (int)l->max || l->used + len + 1 > l->pool_size || l->used + len + 1 > 0xffff) {
        l->full = 1;
        return 0;
    }
    struct entry *e = &l->e[l->n];
    e->cluster = cluster;
    e->size = size;
    e->name = (uint16_t)l->used;
    e->flags = flags;
    for (uint32_t i = 0; i < len; i++)
        l->pool[l->used + i] = name[i];
    l->pool[l->used + len] = 0;
    l->used += len + 1;
    l->order[l->n] = (uint16_t)l->n;
    l->n++;
    return 1;
}

/* The walk of a folder: pass 1 counts everything and keeps what fits (to be sorted); pass 2
 * (windowed) keeps the entries [base, base + max) of the order on the disk, folders first */
struct walk {                                   /* one per walk: a walk may run within another */
    struct listing *l;                          /* (the queue's, from the playback, while the */
    int pass;                                   /* browser reads) */
    uint32_t dirs, files, fdirs, ffiles;        /* pass 1: counted; pass 2: seen so far */
};

static int add_dirent(struct listing *l, const struct fat_dirent *d, uint32_t codec)
{
    uint32_t len = 0, keep = (uint32_t)l->name_keep;
    while (d->name[len])
        len++;
    if (len > keep) {                           /* more than the screen shows: cut on a */
        len = keep;                             /* character boundary */
        while (len && ((uint8_t)d->name[len] & 0xc0) == 0x80)
            len--;
    }
    return list_add(l, d->name, len, d->cluster, d->size,
                    (uint16_t)((d->attr & FAT_ATTR_DIR ? F_DIR : codec) |
                               (d->vol == FAT_VOL_SD ? F_SD : 0) | (d->contig ? F_CONTIG : 0)));
}

static int collect(const struct fat_dirent *d, void *ctx)
{
    struct walk *w = ctx;
    struct listing *l = w->l;
    int isdir = (d->attr & FAT_ATTR_DIR) != 0;
    uint32_t codec = isdir ? 0 : codec_of(d->name);
    if (!isdir && !codec)
        return 0;                               /* not something we play */
    if (w->pass == 1) {
        if (isdir)
            w->dirs++;
        else
            w->files++;
        if (!l->full && !(!isdir && l->skip_empty && !d->size))
            add_dirent(l, d, codec);            /* (the queue: empty files left out) */
    } else {
        uint32_t ord = isdir ? w->fdirs++ : w->dirs + w->ffiles++;
        if (ord >= l->base && ord < l->base + l->max) {
            int at = l->n;
            if (add_dirent(l, d, codec))
                l->order[ord - l->base] = (uint16_t)at;
        }
    }
    if (!((w->dirs + w->files + w->fdirs + w->ffiles) & 31) && !l->quiet)
        ui_background();                        /* keep the music going while we read */
    return 0;
}

static int before(const struct listing *l, int a, int b)     /* entries a, b by index in l->e */
{
    int da = l->e[a].flags & F_DIR, db = l->e[b].flags & F_DIR;
    if (da != db)
        return da > db;
    if (l->by_tag && !da && l->key[a] != l->key[b])
        return l->key[a] < l->key[b];           /* FROST: disc and track, untagged after */
    return name_cmp(l->pool + l->e[a].name, l->pool + l->e[b].name) < 0;
}

static void list_sort(struct listing *l)
{
    static const int gaps[] = { 701, 301, 132, 57, 23, 10, 4, 1 };  /* Ciura */
    for (unsigned g = 0; g < sizeof gaps / sizeof *gaps; g++) {
        int gap = gaps[g];
        for (int i = gap; i < l->n; i++) {
            uint16_t t = l->order[i];
            int j = i;
            for (; j >= gap && before(l, t, l->order[j - gap]); j -= gap)
                l->order[j] = l->order[j - gap];
            l->order[j] = t;
        }
        if (!l->quiet)
            ui_background();
    }
}

/* The window of a big folder from 'base' (pass 2 only: the counts are known) */
static int list_window(struct listing *l, uint32_t base)
{
    uint32_t t0 = ticks();
    if (l->total > l->max && base > l->total - l->max)
        base = l->total - l->max;
    l->base = base;
    l->n = l->full = 0;
    l->used = 0;
    for (uint32_t i = 0; i < l->max; i++)
        l->order[i] = 0xffff;
    if (l->dir.vol == FAT_VOL_SD && sd_open())
        return -1;
    struct walk wk = { l, 2, l->dirs, 0, 0, 0 };
    int r = fat_list(&l->dir, collect, &wk);
    int n = 0;                                  /* what follows the base without a gap (the */
    while (n < (int)l->max && l->order[n] != 0xffff)    /* folder may have changed) */
        n++;
    l->n = n;
    log_printf("ui: window %u..%u of %u in %u ms", base, base + (uint32_t)n, l->total,
               (ticks() - t0) / 1000);
    return r;
}

/* A folder of a volume into l: < 0 on a read error. Up to max entries: all, sorted (folders
 * first, then natural order); more: windowed, the first window */
int list_load(struct listing *l, const struct fat_dir *d)
{
    l->n = l->full = 0;
    l->used = 0;
    l->base = 0;
    l->windowed = 0;
    l->by_tag = 0;
    l->dir = *d;
    if (d->vol == FAT_VOL_SD && sd_open())
        return -1;
    struct walk wk = { l, 1, 0, 0, 0, 0 };
    int r = fat_list(d, collect, &wk);
    if (!l->full && wk.dirs + wk.files <= l->max) {
        l->by_tag = 0;
        if (sort_by_tag && l->key && wk.files && wk.files <= TAG_SORT_MAX) {
            uint32_t t0 = ticks();              /* FROST: the files' tags read for the order */
            for (int k = 0; k < l->n; k++) {
                const struct entry *e = &l->e[k];
                l->key[k] = TAGS_NO_ORDER;
                if ((e->flags & F_DIR) || !e->size)
                    continue;
                struct fat_file f;
                f.name[0] = 0;
                f.vol = e->flags & F_SD ? FAT_VOL_SD : FAT_VOL_INT;
                f.contig = (e->flags & F_CONTIG) != 0;
                f.cluster = e->cluster;
                f.size = e->size;
                fat_open(&f);
                l->key[k] = tags_order(&f, e->flags & F_CODEC);
                if (!(k & 7) && !l->quiet)
                    ui_background();
            }
            l->by_tag = 1;
            log_printf("ui: %u files ordered by their tags in %u ms", wk.files,
                       (ticks() - t0) / 1000);
        }
        list_sort(l);
        l->dirs = wk.dirs;
        l->total = (uint32_t)l->n;
        return r;
    }
    l->windowed = 1;                            /* a big folder: the order on the disk */
    l->dirs = wk.dirs;
    l->total = wk.dirs + wk.files;
    int r2 = list_window(l, 0);
    return r < 0 ? r : r2;
}

/* (both return an index in l->e) */
int list_cached(const struct listing *l, uint32_t ord)
{
    if (ord < l->base || ord >= l->base + (uint32_t)l->n)
        return -1;
    return l->order[ord - l->base];
}

int list_index(struct listing *l, uint32_t ord)
{
    if (ord >= l->total)
        return -1;
    int k = list_cached(l, ord);
    if (k >= 0 || !l->windowed)
        return k;
    list_window(l, ord > l->max / 2 ? ord - l->max / 2 : 0);    /* centred on it */
    return list_cached(l, ord);
}

/* The top level (ETUDE §38): the internal volume, then the card when one is in */
static int sd_bad;                              /* the card in did not mount */

static void top_entry(const char *name, uint16_t flags)
{
    uint32_t len = 0;
    while (name[len])
        len++;
    list_add(&dir_l, name, len, 0, 0, (uint16_t)(F_DIR | F_VOLROOT | flags));
    dir_l.total = dir_l.dirs = (uint32_t)dir_l.n;
}

int dir_load(const struct fat_dir *d)
{
    uint32_t t0 = ticks();
    int r = 0;
    if (d->vol == VOL_TOP) {
        dir_l.n = dir_l.full = 0;
        dir_l.used = 0;
        dir_l.base = 0;
        dir_l.windowed = 0;
        dir_l.dir = *d;
        top_entry("Internal", 0);
        if (sd_present())
            top_entry(sd_bad ? "SD card (not readable)" : "SD card", F_SD);
    } else {
        r = list_load(&dir_l, d);
        if (r < 0 && d->vol == FAT_VOL_SD) {    /* a read error: mounted again at the next */
            log_printf("ui: card read failed"); /* access, "not readable" meanwhile */
            sd_forget();
            sd_bad = 1;
        }
    }
    dir_n = (int)dir_l.total;
    if (d->vol != VOL_TOP)
        log_printf("ui: folder %s%x: %d entries%s in %u ms", d->vol == FAT_VOL_SD ? "sd:" : "",
                   d->cluster, dir_n, dir_l.windowed ? " (big: windowed)" : "", (ticks() - t0) / 1000);
    return r;
}

/* The directory an entry of the listing designates */
void dir_of_entry(const struct entry *e, struct fat_dir *d)
{
    d->vol = e->flags & F_SD ? FAT_VOL_SD : FAT_VOL_INT;
    d->contig = (e->flags & F_CONTIG) != 0;
    d->cluster = e->flags & F_VOLROOT ? 0 : e->cluster;
    d->size = e->flags & F_VOLROOT ? 0 : e->size;
}

static int same_file(const struct entry *a, const struct entry *b)
{
    return a->cluster == b->cluster && (a->flags & F_SD) == (b->flags & F_SD);
}

/* ---- browser state: the path from the root ---- */
struct path_level path[DEPTH_MAX];
int depth;                                      /* path[depth] is the folder shown */

void copy_name(char *d, const char *s, int max)
{
    int i = 0;
    while (s[i] && i < max - 1) {
        d[i] = s[i];
        i++;
    }
    while (i > 0 && ((uint8_t)s[i] & 0xc0) == 0x80)
        i--;                                    /* cut before a character, not inside it */
    d[i] = 0;
}

int b_dirty = 1;
static int b_sel = -1, b_top = -1, b_mark = -1;

static int playing_index(void)                  /* the row of the track that plays, or -1 */
{
    const struct entry *qe = q_playing && q_cur < q_n ? q_ent(q_cur) : 0;
    if (!qe)
        return -1;
    for (int k = 0; k < dir_l.n; k++) {         /* in what is read (a big folder: its window) */
        const struct entry *e = &dir.e[dir.order[k]];
        if (!(e->flags & F_DIR) && same_file(e, qe))
            return (int)dir_l.base + k;
    }
    return -1;
}

static void draw_row(int r, int sel, int mark)
{
    int i = path[depth].top + r, y = ROW_Y0 + 16 * r;
    if (i >= dir_n) {
        lcd_fill(0, y, LCD_W, 16, BG);
        if (!dir_n && !r)
            lcd_text(8, y, "no folder or playable file here", DIM, BG);
        return;
    }
    const struct entry *e = ent(i);
    uint16_t bg = i == sel ? SEL_BG : BG;
    int dirent = e->flags & F_DIR;
    /* a fixed column for the mark: » folder, ♪ the track that plays */
    lcd_fill(0, y, 22, 16, bg);
    if (i == sel)
        lcd_fill(0, y, 3, 16, ACCENT);          /* FROST: the edge of the selection */
    if (dirent || i == mark)
        lcd_glyph(dirent ? 6 : 3, y, dirent ? 0xbb : 0x266a, dirent ? DIR_FG : TITLE_FG, bg);
    else if (e->size)                           /* FROST: a dot in the colour of the format */
        lcd_fill(9, y + 6, 5, 5, theme_codec_color(e->flags & F_CODEC));
    lcd_text_clip(22, y, ent_name(i), list_text_end(dir_n, ROWS), dirent ? DIR_FG : e->size ? FG : DIM,
                  bg);
}

/* "selected/count" right-aligned on the first line */
static void draw_count(int sel)
{
    char b[24], *p = b;
    if (dir_n) {
        p = put_dec(p, (uint32_t)sel + 1);
        *p++ = '/';
    }
    p = put_dec(p, (uint32_t)dir_n);
    *p = 0;
    text_right(LCD_W - 70, LCD_W - 4, 0, b, DIM, BG);
}

void draw_browser(void)
{
    int sel = path[depth].sel, top = path[depth].top, mark = playing_index();
    if (!b_dirty && top == b_top) {
        /* the same page: only the rows whose look changed (selection, playing mark) */
        for (int r = 0; r < ROWS; r++) {
            int i = top + r;
            if (i == sel || i == b_sel || i == mark || i == b_mark)
                if ((i == sel) != (i == b_sel) || (i == mark) != (i == b_mark))
                    draw_row(r, sel, mark);
        }
        if (sel != b_sel)
            draw_count(sel);
        b_sel = sel;
        b_mark = mark;
        if (q_playing && player_heard.length_ms)
            progress_bar(ROW_Y0 + 16 * ROWS + 3, 4, player_heard.time_ms, player_heard.length_ms);
        draw_clock(LCD_W - 114, LCD_W - 70, 0);
        return;
    }
    if (b_dirty) {                              /* every band once, nothing cleared first */
        lcd_fill(0, 0, 4, 16, BG);
        lcd_text_clip(4, 0, depth ? path[depth].name : "Storage", LCD_W - 114, TITLE_FG, BG);
        draw_clock(LCD_W - 114, LCD_W - 70, 1);
        lcd_fill(LCD_W - 4, 0, 4, 16, BG);
        lcd_fill(0, 16, LCD_W, ROW_Y0 - 16, BG);
    }
    for (int r = 0; r < ROWS; r++)
        draw_row(r, sel, mark);
    list_scrollbar(ROW_Y0, ROWS, top, dir_n);
    if (b_dirty || sel != b_sel)
        draw_count(sel);
    b_sel = sel;
    b_top = top;
    b_mark = mark;
    /* bottom strip: the progress of what plays (around the bar: background, drawn once) */
    int yb = ROW_Y0 + 16 * ROWS;
    if (q_playing && player_heard.length_ms) {
        if (b_dirty) {
            lcd_fill(0, yb, LCD_W, 3, BG);
            lcd_fill(0, yb + 3, 4, 4, BG);
            lcd_fill(LCD_W - 4, yb + 3, 4, 4, BG);
            lcd_fill(0, yb + 7, LCD_W, LCD_H - yb - 7, BG);
        }
        progress_bar(yb + 3, 4, player_heard.time_ms, player_heard.length_ms);
    } else
        lcd_fill(0, yb, LCD_W, LCD_H - yb, BG);
    b_dirty = 0;
}

/* path[1]: the root of a volume */
void path_root(int v)
{
    depth = 1;
    path[0].sel = v == FAT_VOL_SD;
    path[0].top = 0;
    fat_root(v, &path[1].dir);
    copy_name(path[1].name, v == FAT_VOL_SD ? "SD card" : "Internal", sizeof path[1].name);
    path[1].sel = path[1].top = 0;
}

/* The card, set up and mounted on first use (about 40 to 220 ms) */
/* The card set up again at the next access: after a time without the detect switch watched
 * (USB, installer, system screens), the card in may be another one, or taken out and back */
void sd_forget(void)
{
    sdvol.mounted = 0;
    sd.ready = 0;
}

int sd_open(void)
{
    if (sdvol.mounted)
        return 0;
    if (!sd_present())
        return -1;
    uint32_t t0 = ticks();
    if (sd_init() || fat_mount_sd()) {
        sd_bad = 1;
        log_printf("ui: card not readable");
        return -1;
    }
    sd_bad = 0;
    log_printf("ui: card mounted in %u ms: %s, %u MiB, %u clusters of %u sectors",
               (ticks() - t0) / 1000, sdvol.exfat ? "exFAT" : "FAT32", sd.sectors / 2048,
               sdvol.clusters, sdvol.spc);
    return 0;
}

/* A folder of the card could not be read: the top level, "SD card (not readable)" */
static void card_failed(void)
{
    if (!sd_bad || !depth || path[depth].dir.vol != FAT_VOL_SD)
        return;
    depth = 0;
    path[0].sel = 1;
    path[0].top = 0;
    dir_load(&path[0].dir);
}

static void enter(int i)
{
    const struct entry *e = ent(i);
    struct fat_dir d;
    if (depth + 1 >= DEPTH_MAX)
        return;
    dir_of_entry(e, &d);
    b_dirty = 1;
    if (d.vol == FAT_VOL_SD && sd_open()) {
        dir_load(&path[depth].dir);             /* "SD card (not readable)" */
        return;
    }
    depth++;
    path[depth].dir = d;
    path[depth].sel = path[depth].top = 0;
    copy_name(path[depth].name, ent_name(i), sizeof path[depth].name);
    dir_load(&d);
    card_failed();
    const struct book *bm = book_of(&d);        /* FROST: a book: on its bookmarked chapter */
    if (bm && !(bm->flags & BOOK_TREE))
        for (int k = 0; k < dir_l.n; k++)
            if (dir.e[dir.order[k]].cluster == bm->track_cluster) {
                path[depth].sel = (int)dir_l.base + k;
                path[depth].top = path[depth].sel > ROWS / 2 ? path[depth].sel - ROWS / 2 : 0;
                break;
            }
    resume_save();
}

static void leave(void)
{
    if (!depth)
        return;
    depth--;
    dir_load(&path[depth].dir);
    card_failed();
    b_dirty = 1;
    resume_save();
}

/* The card-detect switch, every 250 ms, a change taken after two equal reads. Removed: what
 * plays from it stops, the browser leaves it. Returns 1 when the screen must be drawn again, 2
 * when what played stopped (the browser is shown). */
int sd_watch(void)
{
    static int seen = -1, count;
    static uint32_t t;
    if (millis() - t < 250)
        return 0;
    t = millis();
    int in = sd_present();
    if (seen < 0 || in == seen) {
        seen = in;
        count = 0;
        return 0;
    }
    if (++count < 2)
        return 0;
    seen = in;
    count = 0;
    log_printf("ui: card %s", in ? "inserted" : "removed");
    sd_forget();
    sd_bad = 0;
    int stopped = 0;
    if (!in && q_on_sd()) {
        if (q_playing || player_is_open())
            play_stop(STOP_NOW);
        parked = 0;
        q_clear();
        stopped = 1;
    }
    if (!in && depth && path[1].dir.vol == FAT_VOL_SD)
        depth = 0;
    if (!depth)
        dir_load(&path[0].dir);
    if (path[depth].sel >= dir_n)
        path[depth].sel = path[depth].top = 0;
    b_dirty = 1;
    resume_save();
    return 1 + stopped;
}

/* FROST: fast moves. One row a press; held, faster the longer: rows, then 4 at a time, then
 * pages, then 1/40 of a big folder. Held moves stop at the ends; a single press wraps around. */
static void move(int d, int repeat)
{
    int n = dir_n, *sel = &path[depth].sel, *top = &path[depth].top;
    if (n <= 0)
        return;
    if (!repeat) {
        list_move(sel, top, n, ROWS, d);
        return;
    }
    uint32_t held = key_held_us();
    int step = held < 1500000u ? 1 : held < 3000000u ? 4 : held < 5000000u ? ROWS : n / 40;
    if (step < ROWS && held >= 3000000u)
        step = ROWS;
    int s = *sel + d * step;
    if (s < 0)
        s = 0;
    if (s >= n)
        s = n - 1;
    *sel = s;
    if (*sel < *top)
        *top = *sel;
    if (*sel >= *top + ROWS)
        *top = *sel - ROWS + 1;
}

static void page(int d)
{
    int n = dir_n, *sel = &path[depth].sel, *top = &path[depth].top;
    if (n <= 0)
        return;
    int s = *sel + d * ROWS;
    s = s < 0 ? (*sel == 0 ? n - 1 : 0) : s >= n ? (*sel == n - 1 ? 0 : n - 1) : s;
    *sel = s;
    *top = s - (*sel - *top);
    if (*top > s)
        *top = s;
    if (*top < 0 || s < ROWS)
        *top = 0;
    if (s >= *top + ROWS)
        *top = s - ROWS + 1;
    if (*top > n - ROWS)
        *top = n > ROWS ? n - ROWS : 0;
}

/* Home: the root of the volume shown, or from there the top level */
void browser_home(void)
{
    if (depth <= 1) {
        depth = 0;
        dir_load(&path[0].dir);
    } else {
        depth = 1;
        dir_load(&path[1].dir);
    }
    card_failed();
    if (path[depth].sel >= dir_n)
        path[depth].sel = path[depth].top = 0;
    b_dirty = 1;
    resume_save();
}

/* ---- quick jump (VOL+ then VOL-): a sorted folder by its first letters, a big one by tenths ---- */
#define JUMP_MAX 64
static struct { int at; uint32_t cp; } jt[JUMP_MAX];
static int jt_n;

static uint32_t initial(const char *s)
{
    uint32_t c = utf8_next(&s);
    if (c >= 'a' && c <= 'z')
        c -= 32;
    if (c >= '0' && c <= '9')
        c = '#';
    return c;
}

static void jump_targets(void)
{
    jt_n = 0;
    if (dir_l.windowed) {                       /* not sorted: 0 %, 10 %, ... 90 % */
        for (int i = 0; i < 10; i++) {
            jt[jt_n].at = (int)((int64_t)dir_n * i / 10);
            jt[jt_n++].cp = '0' + (uint32_t)i;
        }
        return;
    }
    uint32_t last = 0;
    int last_dir = -1;
    for (int i = 0; i < dir_n && jt_n < JUMP_MAX; i++) {
        int isdir = (ent(i)->flags & F_DIR) != 0;
        uint32_t c = initial(ent_name(i));
        if (c != last || isdir != last_dir) {
            jt[jt_n].at = i;
            jt[jt_n++].cp = c | (isdir ? 0x80000000u : 0);
            last = c;
            last_dir = isdir;
        }
    }
}

static void jump_draw(int j)
{
    int x0 = 70, y0 = 30, w = LCD_W - 140, h = 110;
    lcd_fill(x0, y0, w, h, SEL_BG);
    lcd_fill(x0, y0, w, 3, ACCENT);
    lcd_fill(x0, y0 + h - 3, w, 3, ACCENT);
    char b[24], *p = b;
    uint32_t c = jt[j].cp & 0x7fffffffu;
    if (dir_l.windowed) {
        p = put_dec(p, (c - '0') * 10);
        *p++ = '%';
    } else {                                    /* the letter, as UTF-8 */
        if (c < 0x80)
            *p++ = (char)c;
        else if (c < 0x800) {
            *p++ = (char)(0xc0 | c >> 6);
            *p++ = (char)(0x80 | (c & 0x3f));
        } else if (c < 0x10000) {
            *p++ = (char)(0xe0 | c >> 12);
            *p++ = (char)(0x80 | (c >> 6 & 0x3f));
            *p++ = (char)(0x80 | (c & 0x3f));
        }
    }
    *p = 0;
    int bw = lcd_text_width_x(b, 4);
    lcd_text_clip_x(x0 + (w - bw) / 2, y0 + 12, b, x0 + (w + bw) / 2, FG, SEL_BG, 4);
    const char *hint = dir_l.windowed ? "of the folder" : jt[j].cp >> 31 ? "folders" : "files";
    int hw = lcd_text_width(hint);
    lcd_text_clip(x0 + (w - hw) / 2, y0 + 80, hint, x0 + (w + hw) / 2, DIM, SEL_BG);
}

static void jump_mode(void)
{
    jump_targets();
    if (jt_n < 2)
        return;
    int j = 0;
    for (int i = 0; i < jt_n; i++)              /* start at the place shown */
        if (jt[i].at <= path[depth].sel)
            j = i;
    jump_draw(j);
    uint32_t t = millis();
    for (;;) {
        sys_idle();
        ui_background();
        struct key_ev e;
        int ev = key_poll(&e);
        if (ev == EV_NONE) {
            if (millis() - t > 1500)            /* no key: go there */
                break;
            cpu_wait();
            continue;
        }
        t = millis();
        if (key_list_dir(e.key) < 0 && ev != EV_CHORD)
            j = j ? j - 1 : jt_n - 1;
        else if (key_list_dir(e.key) > 0 && ev != EV_CHORD)
            j = j + 1 < jt_n ? j + 1 : 0;
        else if (e.key == KEY_BACK && ev == EV_PRESS) {
            b_dirty = 1;
            return;
        } else if ((e.key == KEY_PLAY || e.key == KEY_MENU) && ev == EV_PRESS)
            break;
        else
            continue;
        jump_draw(j);
    }
    path[depth].sel = jt[j].at;
    path[depth].top = jt[j].at;
    if (path[depth].top > dir_n - ROWS)
        path[depth].top = dir_n > ROWS ? dir_n - ROWS : 0;
    b_dirty = 1;
}

/* An action on the browser (FROST, keymap.h). The defaults: VOL+/VOL- move, BACK goes up, BACK
 * held home, PLAY opens a folder or plays the file and those after it, PLAY held on a folder
 * plays all that is under it, VOL+ then VOL- the quick jump. Playback actions go to the play
 * screen's handler. Returns UI_* (ui_priv.h). */
int browser_action(int a, int repeat)
{
    if (a == A_UP || a == A_DOWN)
        move(a == A_UP ? -1 : 1, repeat);
    else if (a == A_PAGE_UP || a == A_PAGE_DOWN)
        page(a == A_PAGE_UP ? -1 : 1);
    else if (a == A_PARENT)
        leave();
    else if (a == A_HOME)
        browser_home();
    else if (a == A_JUMP)
        jump_mode();
    else if ((a == A_OPEN || a == A_PLAY_ALL) && dir_n) {
        int sel = path[depth].sel;
        if ((ent(sel)->flags & F_DIR) && a == A_OPEN)
            enter(sel);
        else if (ent(sel)->flags & F_DIR) {
            char nm[64];                        /* held on a folder: all that is under it */
            copy_name(nm, ent_name(sel), sizeof nm);
            struct fat_dir d;
            dir_of_entry(ent(sel), &d);
            b_dirty = 1;
            if (d.vol != FAT_VOL_SD || !sd_open()) {
                const struct book *bm = book_of(&d);
                if (bm && (bm->flags & BOOK_TREE) && !book_play(bm))
                    return UI_FULL | UI_TO_PLAYING;     /* FROST: back into the book */
                q_from_tree(&d, nm);
                book_set(book_detect(nm));
                if (q_n) {
                    play_index(0);
                    return UI_FULL | UI_TO_PLAYING;
                }
            } else
                dir_load(&path[depth].dir);     /* "SD card (not readable)" */
        } else if (!ent(sel)->size) {
            play_failed(ent_name(sel), Q_EEMPTY); /* empty (grey): not played, the queue kept */
        } else {
            if (parked && q_cur < q_n && q_ent(q_cur) && same_file(ent(sel), q_ent(q_cur)))
                player_seek_hint(parked_ms);    /* the parked track: where it was */
            q_from_dir(sel);
            book_set(book_detect(0));           /* FROST: a book: its bookmark */
            const struct book *bm = q_book ? book_of(&q_root) : 0;
            if (bm && q_ent(q_cur) && q_ent(q_cur)->cluster == bm->track_cluster && bm->pos_ms)
                player_seek_hint(bm->pos_ms > 5000 ? bm->pos_ms - 5000 : 0);
            play_index(q_cur);
            return UI_FULL | UI_TO_PLAYING;
        }
    } else if (a >= A_PLAYPAUSE && a <= A_SHUFFLE && a != A_SEEK) {
        play_action(a, repeat);
        b_dirty = 1;
    }
    return UI_FULL;
}
