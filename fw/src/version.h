/* Firmware identity, shown on screen and written in the image header */
#ifndef VERSION_H
#define VERSION_H

#define FW_NAME    "ECHO MINI FROST"            /* FROST, on newfw 0.95 */
#define NEWFW_BASE "0.95"
#ifdef ECHO_FFTCMP
#define FW_VERSION "0.95fc"            /* test build: AAC sound from HIFIACC, compared */
#elif defined(ECHO_HWTEST)
#define FW_VERSION "0.95hwt"           /* test build: accelerators against the software */
#else
#define FW_VERSION "1.2g"             /* 4 characters at most: the USB disk's revision */
#endif
#define FW_DATE    "2026-10-31"

#endif
