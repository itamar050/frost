/* FROST: Bluetooth. The ECHO MINI's radio is a module with its own stack (A2DP source, SBC):
 * the player powers it (GPIO2_A7), talks to it over UART1 (GPIO2_C0/C1, 115200 8N1) in short
 * frames 'C' + letter + two characters (+ data), and the music reaches it on the I2S of the
 * DACs, whose headphone amplifier is switched off while a device is connected. All of it read
 * from the stock firmware V4.0 (its Bluetooth overlay and resident service); see BT.md.
 *
 *   to the module    CS00 search, CP00 end the search, CH06+addr connect (pair) a device found,
 *                    CL06+addr reconnect the one remembered, CT00 cancel, CQ00 status,
 *                    CY0 + 30 / 0 music playing / stopped
 *   from the module  CV1x ready (at power-up), CSnn + addr + name a device found, CSEN search
 *                    over, CQO + nn + addr + name connected, CQS/CQL/CQI not connected,
 *                    CHOK / CH / CLOK connected, CHER / CLER failed, CTOK disconnected,
 *                    CP CC CA CB the headphones' play, pause, next, previous */
#ifndef BT_H
#define BT_H

#include <stdint.h>

#ifdef FROST_BT

enum { BT_OFF, BT_BOOT, BT_MUTE, BT_READY, BT_SCAN, BT_CONNECT, BT_LINKED };
enum { BTK_NONE, BTK_PLAY, BTK_PAUSE, BTK_NEXT, BTK_PREV };

#define BT_FOUND_MAX 6
struct bt_dev {
    uint8_t addr[6];
    char name[33];
};

extern int bt_on;                       /* the setting (kept with the resume state) */
extern int bt_state;
extern int bt_save_due;                 /* the UI saves the resume state */
extern uint8_t bt_addr[6];              /* the device remembered: reconnected at power-up */
extern char bt_name[33];                /* the device connected */
extern struct bt_dev bt_found[BT_FOUND_MAX];
extern int bt_nfound;
extern uint32_t bt_rev;                 /* changes with anything shown */
extern char bt_last[24];                /* the last frame received, printable (the screen) */
extern const char *bt_error;            /* the last failure, or 0 */

void bt_enable(int on);
void bt_shutdown(void);                 /* the module off before the player (bt_on kept) */
extern int bt_route;                    /* 0..3: the output pins while connected (a test) */
int bt_pin_mute(void);
int bt_pin_amp(void);
void bt_route_apply(void);
void bt_service(void);                  /* from the idle loop */
void bt_scan(void);
void bt_connect(int i);                 /* bt_found[i] */
void bt_forget(void);                   /* disconnected, nothing remembered */
int bt_take_key(void);                  /* BTK_*: a button of the headphones */
int bt_dropped(void);                   /* 1 once when the connection was lost */
static inline int bt_linked(void)
{
    return bt_state == BT_LINKED;
}
const char *bt_state_name(void);

void BT_UART_IRQHandler(void);

#else   /* 1.2c: Bluetooth hidden (FROST_BT not defined): the module never powered */
#define bt_on 0
static inline int bt_linked(void) { return 0; }
static inline void bt_service(void) { }
static inline void bt_shutdown(void) { }
static inline int bt_pin_mute(void) { return 0; }
static inline int bt_pin_amp(void) { return 1; }
#endif

#endif
