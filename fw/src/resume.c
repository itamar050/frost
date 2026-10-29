/* Resume state (ETUDE §25, §38): the folder, the selection and the track (where it was), the
 * volume and the modes, kept in the last sector of the log file (log_state_*) */
#include "ui_priv.h"

#define offsetof(t, m) __builtin_offsetof(t, m)

/* ---- resume (the last sector of the log file, log_state_*) ---- */
struct resume {
    char magic[12];                             /* "NEWFWSTATE 2" */
    uint32_t depth;
    uint32_t cluster[DEPTH_MAX];
    uint16_t sel[DEPTH_MAX], top[DEPTH_MAX];
    uint32_t track;                             /* cluster of the track, 0: none */
    uint32_t playing, level, mode, pos_ms, sum;
};
/* FROST: more state in the same sector, from byte 256, with its own sum: the theme, the button
 * map, the settings, the selections in full (32 bits: big folders), and the play queue itself
 * (its folder or tree, the track and its place), which the browser's folder no longer decides */
#define X_OFF 256
#define XS_SORT  0
#define XS_CP    1
#define XS_BOOK  2
#define XS_TREE  3
#define XS_QOK   4
struct resume_x {
    char magic[8];                              /* "FROSTX2" */
    uint32_t theme;
    uint8_t keymap[KM_SCREENS][S_COUNT];
    uint8_t set[32 - KM_SCREENS * S_COUNT];     /* XS_*: settings, the queue's kind */
    uint32_t sel[DEPTH_MAX], top[DEPTH_MAX];
    uint32_t q_cluster, q_size;                 /* the queue's folder (a tree: its top) */
    uint8_t q_vol, q_contig, pad[2];
    uint32_t q_cur, q_track;                    /* the track: its place, its first cluster */
    char q_name[24];                            /* the folder's name (the album line) */
    uint32_t sum;
};
_Static_assert(X_OFF + sizeof(struct resume_x) <= 512, "resume state larger than a sector");
static uint32_t rs_buf[128];
static uint32_t rs_last_sum;

static uint32_t x_sum(const struct resume_x *x)
{
    const uint32_t *w = (const uint32_t *)x;
    uint32_t s = 0x46524f53;
    for (unsigned i = 0; i < offsetof(struct resume_x, sum) / 4; i++)
        s = (s << 5 | s >> 27) ^ w[i];
    return s;
}

static uint32_t rs_sum(const struct resume *r)
{
    const uint32_t *w = (const uint32_t *)r;
    uint32_t s = 0x4e465753;
    for (unsigned i = 0; i < offsetof(struct resume, sum) / 4; i++)
        s = (s << 5 | s >> 27) ^ w[i];
    return s;
}

void resume_save(void)
{
    struct resume *r = (struct resume *)rs_buf;
    for (int i = 0; i < 128; i++)
        rs_buf[i] = 0x20202020;                 /* spaces: the log reader shows nothing */
    __builtin_memcpy(r->magic, "NEWFWSTATE 3", 12);
    r->depth = (uint32_t)depth | (depth ? (uint32_t)path[1].dir.vol << 8 : 0);
    for (int i = 0; i < DEPTH_MAX; i++) {
        r->cluster[i] = i <= depth ? path[i].dir.cluster : 0;
        r->sel[i] = (uint16_t)(i <= depth ? path[i].sel : 0);
        r->top[i] = (uint16_t)(i <= depth ? path[i].top : 0);
    }
    const struct entry *qe = (q_playing || parked) && q_cur < q_n ? q_ent(q_cur) : 0;
    r->track = qe ? qe->cluster : 0;
    r->playing = (uint32_t)(q_playing && !audio_paused);
    r->level = (uint32_t)play_level;
    r->mode = (uint32_t)(play_mode | rg_mode << 8);    /* rg_mode 0 (album) before 0.55 */
    r->pos_ms = parked ? parked_ms : q_playing ? player_heard.time_ms : 0;
    r->sum = rs_sum(r);
    struct resume_x *x = (struct resume_x *)((uint8_t *)rs_buf + X_OFF);
    __builtin_memset(x, 0, sizeof *x);
    __builtin_memcpy(x->magic, "FROSTX2", 8);
    x->theme = (uint32_t)theme_index;
    x->set[XS_SORT] = (uint8_t)sort_by_tag;
    x->set[XS_CP] = (uint8_t)tag_cp;
    x->set[XS_BOOK] = (uint8_t)q_book;
    x->set[XS_TREE] = (uint8_t)q_tree;
    if (qe) {                                   /* the queue, to build it again */
        x->set[XS_QOK] = 1;
        x->q_cluster = q_root.cluster;
        x->q_size = q_root.size;
        x->q_vol = q_root.vol;
        x->q_contig = q_root.contig;
        x->q_cur = (uint32_t)q_cur;
        x->q_track = qe->cluster;
        copy_name(x->q_name, q_folder, sizeof x->q_name);
    }
    for (int m = 0; m < KM_SCREENS; m++)
        for (int k = 0; k < S_COUNT; k++)
            x->keymap[m][k] = keymap[m][k];
    for (int i = 0; i <= depth && i < DEPTH_MAX; i++) {
        x->sel[i] = (uint32_t)path[i].sel;
        x->top[i] = (uint32_t)path[i].top;
    }
    x->sum = x_sum(x);
    book_note();                                /* an audiobook: its bookmark too */
    if ((r->sum ^ x->sum) == rs_last_sum)
        return;                                 /* nothing changed: no write */
    rs_last_sum = r->sum ^ x->sum;
    log_state_write(rs_buf);
}

void ui_power_off(void)
{
    resume_save();
}

static char *find_name;
static uint32_t find_cluster;
static struct fat_dir *find_dir;
static int find_entry(const struct fat_dirent *d, void *ctx)
{
    (void)ctx;
    if ((d->attr & FAT_ATTR_DIR) && d->cluster == find_cluster) {
        copy_name(find_name, d->name, 64);
        fat_dir_of(d, find_dir);
        return 1;
    }
    return 0;
}

/* At boot: back to the last folder, its selection, the track (where it was) */
void resume_load(void)
{
    struct resume *r = (struct resume *)rs_buf;
    struct resume_x *x = (struct resume_x *)((uint8_t *)rs_buf + X_OFF);
    keymap_defaults();
    books_load();
    if (log_state_read(rs_buf)) {
        keymap_load_file();
        return;
    }
    int xok = !__builtin_memcmp(x->magic, "FROSTX2", 8) && x->sum == x_sum(x);
    if (xok) {
        theme_set((int)x->theme);
        sort_by_tag = x->set[XS_SORT] & 1;
        if (x->set[XS_CP] < TAG_CP_COUNT)
            tag_cp = x->set[XS_CP];
        for (int m = 0; m < KM_SCREENS; m++)
            for (int k = 0; k < S_COUNT; k++)
                keymap[m][k] = x->keymap[m][k];
        keymap_fix();
    }
    if (keymap_load_file() == 0)                /* KEYMAP.TXT, when there is one, wins */
        log_printf("keymap: %s", xok ? "the one kept" : "defaults");
    if (r->sum != rs_sum(r) ||
        (__builtin_memcmp(r->magic, "NEWFWSTATE 3", 12) &&
         __builtin_memcmp(r->magic, "NEWFWSTATE 2", 12)) || (r->depth & 0xff) >= DEPTH_MAX - 1)
        return;
    /* state 2 (before 0.58): no top level, index 0 was the internal root */
    int old = r->magic[11] == '2', saved = (int)(r->depth & 0xff) + old, v = (int)(r->depth >> 8);
    rs_last_sum = r->sum ^ (xok ? x->sum : 0);
    int full = xok && !old;                     /* the selections in full (FROST) */
#define SEL(i) (full ? (int)x->sel[i] : (int)r->sel[i])
#define TOP(i) (full ? (int)x->top[i] : (int)r->top[i])
    if (r->level <= 0xfe)
        play_level = (int)r->level;
    if ((r->mode & 0xff) < MODE_COUNT)
        play_mode = (int)(r->mode & 0xff);
    if ((r->mode >> 8) < RG_MODES)
        rg_mode = (int)(r->mode >> 8);
    if (old)
        v = FAT_VOL_INT;
    if (!saved || v > FAT_VOL_SD || (v == FAT_VOL_SD && sd_open())) {
        depth = 0;                              /* the top level (or the card is gone) */
        path[0].sel = old ? 0 : SEL(0);
        dir_load(&path[0].dir);
        if (path[0].sel >= dir_n)
            path[0].sel = 0;
        log_printf("ui: resume: top level (%d saved)", saved);
        goto queue;
    }
    path_root(v);
    path[1].sel = SEL(1 - old);
    path[1].top = TOP(1 - old);
    for (int i = 2; i <= saved; i++) {          /* the folder names, from their parents */
        path[i].name[0] = 0;
        find_name = path[i].name;
        find_dir = &path[i].dir;
        find_cluster = r->cluster[i - old];
        fat_list(&path[i - 1].dir, find_entry, 0);
        if (!path[i].name[0])
            break;                              /* gone: stop at the parent */
        path[i].sel = SEL(i - old);
        path[i].top = TOP(i - old);
        depth = i;
    }
    dir_load(&path[depth].dir);
    if (path[depth].sel >= dir_n)
        path[depth].sel = path[depth].top = 0;
    log_printf("ui: resume: %s, depth %d (%d saved), track %x at %u ms, playing %u, -%u dB",
               v == FAT_VOL_SD ? "card" : "internal", depth, saved, r->track, r->pos_ms,
               r->playing, (uint32_t)play_level / 2);
queue:
    if (!r->track)
        return;
    uint32_t back = 2000;                       /* where it was, a little before */
    if (xok && x->set[XS_QOK] && x->q_track == r->track) {
        /* FROST: the queue built again from its own folder (or tree), wherever the browser is */
        struct fat_dir d = { x->q_cluster, x->q_size, x->q_vol, x->q_contig };
        char nm[24];
        copy_name(nm, x->q_name, sizeof nm);
        if (d.vol == FAT_VOL_SD && sd_open())
            return;
        if (x->set[XS_TREE]) {
            q_from_tree(&d, nm);
            const struct entry *e = (int)x->q_cur < q_n ? q_ent((int)x->q_cur) : 0;
            if (e && e->cluster == r->track)
                q_cur = (int)x->q_cur;
            else                                /* the tree changed: the track looked for */
                for (int i = 0; i < q_n && i < 5000; i++)
                    if (q_ent(i) && q_ent(i)->cluster == r->track) {
                        q_cur = i;
                        break;
                    }
        } else
            q_from_folder(&d, nm, r->track);
        if (!q_n || !q_ent(q_cur) || q_ent(q_cur)->cluster != r->track) {
            log_printf("ui: resume: the track is gone");
            q_clear();
            return;
        }
        if (x->set[XS_BOOK]) {
            book_set(1);
            play_mode = MODE_ORDER;
            back = 5000;                        /* a book: 5 s back */
        }
        log_printf("ui: resume: queue %s, track %d of %d", nm, q_cur + 1, q_n);
    } else {
        if (depth != saved)
            return;
        list_index(&dir_l, (uint32_t)path[depth].sel);     /* a big folder: the window there */
        int found = 0;
        for (int i = (int)dir_l.base; i < (int)dir_l.base + dir_l.n && !found; i++)
            if (!(ent(i)->flags & F_DIR) && ent(i)->cluster == r->track) {
                path[depth].sel = i;
                if (path[depth].sel < path[depth].top || path[depth].sel >= path[depth].top + ROWS)
                    path[depth].top = i > ROWS / 2 ? i - ROWS / 2 : 0;
                q_from_dir(i);
                found = 1;
            }
        if (!found)
            return;
    }
    if (r->playing) {                           /* playing: on again, from a little before */
        player_seek_hint(r->pos_ms > back ? r->pos_ms - back : 0);
        play_index(q_cur);
    } else if (r->pos_ms) {                     /* paused: PLAY goes on from there */
        parked = 1;
        parked_ms = r->pos_ms;
    }
}
