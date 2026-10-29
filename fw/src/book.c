/* FROST: audiobooks (book.h) */
#include "ui_priv.h"

static struct books {
    char magic[8];                              /* "FROSTBK1" */
    uint32_t seq, sum;
    struct book b[BOOK_MAX];
} bk __attribute__((section(".dirbuf"), aligned(4)));     /* (not cleared: loaded at boot) */
_Static_assert(sizeof(struct books) <= LOG_BOOK_SECTORS * 512, "bookmarks larger than 4 sectors");
static uint32_t bk_buf[LOG_BOOK_SECTORS * 128] __attribute__((section(".dirbuf")));
static uint32_t bk_saved;
int q_book, book_skip_s = 30;
static int music_mode;                          /* the play mode outside the books */

static uint32_t bk_sum(void)                    /* seq and the books (not magic, sum) */
{
    const uint32_t *w = (const uint32_t *)bk.b;
    uint32_t s = 0x424f4f4b ^ bk.seq;
    for (unsigned i = 0; i < sizeof bk.b / 4; i++)
        s = (s << 5 | s >> 27) ^ w[i];
    return s;
}

void books_load(void)
{
    __builtin_memset(&bk, 0, sizeof bk);
    if (log_books_read(bk_buf) == 0) {
        const struct books *r = (const struct books *)bk_buf;
        if (!__builtin_memcmp(r->magic, "FROSTBK1", 8)) {
            __builtin_memcpy(&bk, r, sizeof bk);
            if (bk.sum != bk_sum())
                __builtin_memset(&bk, 0, sizeof bk);
        }
    }
    __builtin_memcpy(bk.magic, "FROSTBK1", 8);
    bk_saved = bk.sum = bk_sum();
    log_printf("book: %d bookmarks", book_count());
}

void books_save(void)
{
    bk.sum = bk_sum();
    if (bk.sum == bk_saved)
        return;
    for (unsigned i = 0; i < LOG_BOOK_SECTORS * 128; i++)
        bk_buf[i] = 0x20202020;                 /* the log reader skips it anyway */
    __builtin_memcpy(bk_buf, &bk, sizeof bk);
    if (log_books_write(bk_buf) == 0)
        bk_saved = bk.sum;
}

/* ---- is it a book? ---- */
static int has(const char *s, const char *w)    /* w in s, ASCII case ignored */
{
    for (; *s; s++) {
        int i = 0;
        while (w[i]) {
            char c = s[i];
            if (c >= 'A' && c <= 'Z')
                c = (char)(c + 32);
            if (c != w[i])
                break;
            i++;
        }
        if (!w[i])
            return 1;
    }
    return 0;
}

static int bookish(const char *s)
{
    static const char *const w[] = {
        "audiobook", "audio book", "audio-book", "book", "podcast", "hörbuch",
        "ספרי שמע", "ספר שמע", "ספרים", "פודקאסט",
    };
    for (unsigned i = 0; i < sizeof w / sizeof *w; i++)
        if (has(s, w[i]))
            return 1;
    return 0;
}

int book_detect(const char *extra)
{
    for (int i = 1; i <= depth; i++)
        if (bookish(path[i].name))
            return 1;
    if (extra && bookish(extra))
        return 1;
    const char *n = q_n ? q_name(q_cur) : "";   /* an .m4b: a book wherever it is */
    int l = 0;
    while (n[l])
        l++;
    return l > 4 && has(n + l - 4, ".m4b");
}

void book_set(int on)
{
    if (on && !q_book) {
        music_mode = play_mode;
        play_mode = MODE_ORDER;                 /* a book plays in order */
    } else if (!on && q_book)
        play_mode = music_mode;
    q_book = on;
}

/* ---- bookmarks ---- */
static int same_dir(const struct book *b, const struct fat_dir *d)
{
    return b->used && b->dir_cluster == d->cluster && b->vol == d->vol;
}

const struct book *book_of(const struct fat_dir *d)
{
    for (int i = 0; i < BOOK_MAX; i++)
        if (same_dir(&bk.b[i], d))
            return &bk.b[i];
    return 0;
}

void book_note(void)
{
    if (!q_book || !q_n || q_cur < 0 || q_cur >= q_n)
        return;
    const struct entry *e = q_ent(q_cur);
    if (!e)
        return;
    struct book *b = 0;
    for (int i = 0; i < BOOK_MAX && !b; i++)
        if (same_dir(&bk.b[i], &q_root))
            b = &bk.b[i];
    if (!b) {                                   /* a new one: a free place, or the oldest */
        b = &bk.b[0];
        for (int i = 0; i < BOOK_MAX; i++) {
            if (!bk.b[i].used) {
                b = &bk.b[i];
                break;
            }
            if (bk.b[i].seq < b->seq)
                b = &bk.b[i];
        }
        __builtin_memset(b, 0, sizeof *b);
        b->used = 1;
        log_printf("book: new bookmark for %s", q_folder);
    }
    b->dir_cluster = q_root.cluster;
    b->dir_size = q_root.size;
    b->vol = q_root.vol;
    b->contig = q_root.contig;
    b->flags = (uint8_t)(q_tree ? BOOK_TREE : 0);
    b->track_cluster = e->cluster;
    b->track = (uint32_t)q_cur;
    b->tracks = (uint32_t)q_n;
    b->pos_ms = now_ms();
    b->len_ms = player_heard.length_ms;
    if (b->seq != bk.seq)
        b->seq = ++bk.seq;
    copy_name(b->name, q_folder, sizeof b->name);
    books_save();
}

int book_count(void)
{
    int n = 0;
    for (int i = 0; i < BOOK_MAX; i++)
        n += bk.b[i].used;
    return n;
}

const struct book *book_nth(int k)              /* by seq, the highest first */
{
    uint32_t below = 0xffffffffu;
    const struct book *b = 0;
    for (int r = 0; r <= k; r++) {
        b = 0;
        for (int i = 0; i < BOOK_MAX; i++)
            if (bk.b[i].used && bk.b[i].seq < below && (!b || bk.b[i].seq > b->seq))
                b = &bk.b[i];
        if (!b)
            return 0;
        below = b->seq;
    }
    return b;
}

void book_forget(const struct book *b)
{
    for (int i = 0; i < BOOK_MAX; i++)
        if (&bk.b[i] == b) {
            log_printf("book: %s forgotten", bk.b[i].name);
            __builtin_memset(&bk.b[i], 0, sizeof bk.b[i]);
        }
    books_save();
}

/* Back into a book: its queue built again, the chapter, 5 s before the place */
int book_play(const struct book *b)
{
    struct book c = *b;                         /* (the table may change meanwhile) */
    struct fat_dir d = { c.dir_cluster, c.dir_size, c.vol, c.contig };
    if (d.vol == FAT_VOL_SD && sd_open())
        return -1;
    if (c.flags & BOOK_TREE) {
        q_from_tree(&d, c.name);
        if (c.track < (uint32_t)q_n && q_ent((int)c.track) &&
            q_ent((int)c.track)->cluster == c.track_cluster)
            q_cur = (int)c.track;
    } else
        q_from_folder(&d, c.name, c.track_cluster);
    if (!q_n)
        return -1;
    book_set(1);
    if (q_ent(q_cur) && q_ent(q_cur)->cluster == c.track_cluster && c.pos_ms)
        player_seek_hint(c.pos_ms > 5000 ? c.pos_ms - 5000 : 0);
    play_index(q_cur);
    log_printf("book: back into %s, chapter %d at %u ms", c.name, q_cur + 1, c.pos_ms);
    return 0;
}

int chapter_at(const struct chapters *c, uint32_t ms)
{
    if (!c || c->n < 2)
        return -1;
    int k = 0;
    for (uint32_t i = 0; i < c->n; i++)
        if (c->ms[i] <= ms)
            k = (int)i;
    return k;
}
