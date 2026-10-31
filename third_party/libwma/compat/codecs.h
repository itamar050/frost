/* FROST: the little of Rockbox's codec environment libwma needs, for our core B runtime */
#ifndef FROST_WMA_CODECS_H
#define FROST_WMA_CODECS_H
#include <stdint.h>
#include <stddef.h>
#define IBSS_ATTR
#define ICODE_ATTR
#define ICONST_ATTR
#define IDATA_ATTR
#define MEM_ALIGN_ATTR __attribute__((aligned(16)))
#define ICODE_ATTR_TREMOR_NOT_MDCT
#define ICODE_ATTR_FFT
#define DEBUGF(...) do { } while (0)
#define LOGF(...) do { } while (0)
#define ROCKBOX_LITTLE_ENDIAN 1
#ifndef MIN
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#endif
#define ARRAYLEN(a) (sizeof(a) / sizeof((a)[0]))
#ifndef INT32_MAX
#define INT32_MAX 0x7fffffff
#endif
void *memcpy(void *d, const void *s, size_t n);
void *memset(void *d, int c, size_t n);
void *memmove(void *d, const void *s, size_t n);
#define likely(x) __builtin_expect(!!(x), 1)
#define unlikely(x) __builtin_expect(!!(x), 0)
#define LIKELY(x) __builtin_expect(!!(x), 1)
#define UNLIKELY(x) __builtin_expect(!!(x), 0)
#define CONFIG_CPU 0
#define PP5022 1
#define S5L8702 2
#define PP5024 3
#define PP5020 4
#define MCF5250 5
#define MCF5249 6
struct mp3entry;
uint32_t swap32(uint32_t x);
void qsort(void *base, size_t n, size_t size, int (*cmp)(const void *, const void *));
#endif
