/* FROST 1.2i (overlay): deleting a file of the internal volume's root (fatdel.c) */
#ifndef FATDEL_H
#define FATDEL_H

int fat_delete_root(const char *name);  /* 8.3 name; 0, or < 0 */

#endif
