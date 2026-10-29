/* FROST: audiobooks. A queue is a book when its folder (or one above it) is named like one
 * ("audiobook", "book", "podcast", "ספרי שמע", "ספר שמע", "ספרים", "פודקאסט") or its files are
 * .m4b. A book:
 *  - keeps a bookmark (its chapter and the place in it), up to BOOK_MAX books, in the 4 sectors
 *    of the log file before the resume state; opening the book again goes back there;
 *  - plays in order (no shuffle, no repeat), 30 s skips, 5 s back after a long pause;
 *  - has chapters: its files, and inside an .m4b the chapters of its "chpl" box;
 *  - is listed in Main menu -> Audiobooks, the most recent first. */
#ifndef BOOK_H
#define BOOK_H

#include <stdint.h>
#include "fat.h"

#define BOOK_MAX  31
#define BOOK_NAME 28
#define BOOK_TREE 1                             /* the book is a tree (CD1, CD2 ...) */

struct book {
    uint32_t dir_cluster, dir_size;             /* the book's folder */
    uint8_t vol, contig, used, flags;
    uint32_t track_cluster;                     /* the file heard */
    uint32_t track, tracks;                     /* its place in the queue, of how many */
    uint32_t pos_ms, len_ms;                    /* where in it, its length */
    uint32_t seq;                               /* last use (higher: more recent) */
    char name[BOOK_NAME];
};

extern int q_book;                              /* the queue is a book */
extern int book_skip_s;                         /* the skip of forward / back (s) */

void books_load(void);
void books_save(void);                          /* written when changed */
int book_detect(const char *extra);             /* the path (and the folder 'extra') says book */
void book_note(void);                           /* the queue's place into its bookmark */
const struct book *book_of(const struct fat_dir *d);   /* the bookmark of folder d, or 0 */
int book_count(void);
const struct book *book_nth(int i);             /* the i-th most recent */
void book_forget(const struct book *b);
int book_play(const struct book *b);            /* back into a book: 0, or < 0 */
void book_set(int on);                          /* the queue is (not) a book: the play mode */

/* Chapters of an .m4b (Nero "chpl" box), read with the tags (tags.c) */
#define CH_MAX   32
#define CH_TITLE 24
struct chapters {
    uint32_t n;
    uint32_t ms[CH_MAX];
    char title[CH_MAX][CH_TITLE];
};
int chapter_at(const struct chapters *c, uint32_t ms);   /* the chapter playing at ms, -1 */

#endif
