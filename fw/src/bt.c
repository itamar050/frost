/* FROST: Bluetooth (bt.h) */
#include "bt.h"
#include "audio.h"
#include "board.h"
#include "log.h"
#include "regs.h"

#define U        0x400b0000u                    /* UART1 (DesignWare) */
#define U_DATA   (U + 0x00)                     /* RBR / THR / DLL */
#define U_IER    (U + 0x04)                     /* IER / DLH */
#define U_IIR    (U + 0x08)
#define U_LCR    (U + 0x0c)
#define U_USR    (U + 0x7c)                     /* 1: TX FIFO not full, 3: RX FIFO not empty */
#define U_SRR    (U + 0x88)
#define GRF_UART (0x50010000u + 0xbc)
#define CRU_UART1 (0x40180000u + 0x38)
#define NVIC_ISER 0xe000e100u
#define UART1_IRQ 25

int bt_on, bt_state, bt_save_due;
uint8_t bt_addr[6];
char bt_name[33];
struct bt_dev bt_found[BT_FOUND_MAX];
int bt_nfound;
uint32_t bt_rev;
char bt_last[24];
const char *bt_error;

static int variant, key, dropped, playing_sent = -1, want_scan;
static uint32_t t_state, t_poll, t_try;
static int tries;
static char connect_op;                         /* H: a device found, L: the one remembered */

/* ---- the UART: bytes in by interrupt, a frame burst taken after 4 ms of silence ---- */
static volatile uint8_t bt_rx[512];
static volatile uint32_t bt_rx_w, bt_rx_t;
static uint32_t bt_rx_r;

void BT_UART_IRQHandler(void)
{
    (void)REG(U_IIR);
    while (REG(U_USR) & 8)
        bt_rx[bt_rx_w++ & 511] = (uint8_t)REG(U_DATA);
    bt_rx_t = ticks();
}

static void uart_init(void)
{
    REG(GRF_UART) = 0x02000000;                 /* UART1 on its A pins: GPIO2_C0/C1 */
    iomux(2, 16, 1);
    iomux(2, 17, 1);
    soft_reset(8, 1);
    udelay(1000);
    soft_reset(8, 0);
    clk_gate(0x1d, 1);
    clk_gate(0x89, 1);
    REG(CRU_UART1) = 0x00c00040;                /* from the 24 MHz crystal, divided by 1 */
    REG(CRU_UART1) = 0x003f0000;
    REG(U_SRR) = 7;
    REG(U_IER) = 0;
    REG(U + 0x10) = 0;                          /* MCR */
    REG(U + 0x98) = 1;                          /* FIFOs on */
    REG(U + 0x9c) = 0;
    REG(U + 0xa0) = 0;
    REG(U_LCR) = 0x83;                          /* 8N1, the divisor: 24 MHz / 16 / 13 */
    REG(U_DATA) = 13;
    REG(U_IER) = 0;
    REG(U_LCR) = 3;
    REG(U_SRR) = 6;
    bt_rx_r = bt_rx_w;
    REG(U_IER) = 1;                             /* RX interrupt */
    REG(NVIC_ISER) = 1u << UART1_IRQ;
}

static void send(char op, char a, char b, const uint8_t *data, int n)
{
    uint8_t f[10] = { 'C', (uint8_t)op, (uint8_t)a, (uint8_t)b };
    for (int i = 0; i < n; i++)
        f[4 + i] = data[i];
    for (int i = 0; i < 4 + n; i++) {
        uint32_t t = ticks();
        while (!(REG(U_USR) & 2) && ticks() - t < 2000)
            ;
        REG(U_DATA) = f[i];
    }
    if (op != 'Q')
        log_printf("bt: sent C %02x %02x %02x%s", (uint8_t)op, (uint8_t)a, (uint8_t)b,
                   n ? " +addr" : "");
}

static void set_state(int s)
{
    if (s == bt_state)
        return;
    int was = bt_state;
    bt_state = s;
    t_state = millis();
    bt_rev++;
    log_printf("bt: state %s", bt_state_name());
    if (s == BT_LINKED) {                       /* the music to the module: the amplifier off */
        bt_route_apply();
        playing_sent = -1;
    } else if (was == BT_LINKED) {
        gpio_set(2, 14, 1);
        bt_name[0] = 0;
        dropped = 1;                            /* the UI stops the music (the DACs are cold) */
    }
}

static void power(int on)
{
    iomux(2, 7, 0);
    gpio_dir(2, 7, 1);
    gpio_set(2, 7, on);
    if (!on) {                                  /* the UART pins low with it, as the stock */
        REG(U_IER) = 0;
        for (int p = 16; p <= 17; p++) {
            iomux(2, p, 0);
            gpio_dir(2, p, 1);
            gpio_set(2, p, 0);
        }
    }
}

/* FROST 1.1w: the two output pins while connected, four ways to try on the device (the stock
 * firmware's is 0); the Bluetooth screen cycles them */
int bt_route;

int bt_pin_mute(void)                           /* GPIO2_0 (1: muted) while playing */
{
    return bt_linked() ? bt_route == 0 || bt_route == 3 : 0;
}

int bt_pin_amp(void)                            /* GPIO2_14 */
{
    return bt_linked() ? bt_route >= 2 : 1;
}

void bt_route_apply(void)
{
    gpio_set(2, 0, audio.on && !audio_paused ? bt_pin_mute() : 1);
    gpio_set(2, 14, bt_pin_amp());
    log_printf("bt: route %d: GPIO2_0 %d, GPIO2_14 %d", bt_route, bt_pin_mute(), bt_pin_amp());
}

/* The player switches off: the module first (powered, it could hold the rails up through its
 * UART pins); the setting is kept */
void bt_shutdown(void)
{
    if (bt_state == BT_OFF)
        return;
    power(0);
    bt_state = BT_OFF;
}

void bt_enable(int on)
{
    bt_on = on;
    bt_error = 0;
    want_scan = 0;
    bt_nfound = 0;
    power(0);
    set_state(BT_OFF);
    if (!on)
        return;
    mdelay(100);
    uart_init();
    power(1);
    set_state(BT_BOOT);
}

void bt_scan(void)
{
    if (bt_state == BT_BOOT)
        want_scan = 1;                          /* once the module is up */
    if (bt_state < BT_READY)
        return;
    bt_nfound = 0;
    bt_error = 0;
    send('S', '0', '0', 0, 0);
    set_state(BT_SCAN);
}

void bt_connect(int i)
{
    if (i < 0 || i >= bt_nfound || bt_state < BT_READY)
        return;
    send('P', '0', '0', 0, 0);                  /* the search stopped first, always */
    for (int k = 0; k < 6; k++)
        bt_addr[k] = bt_found[i].addr[k];
    bt_error = 0;
    tries = 0;
    connect_op = 'H';
    t_try = millis() - 5500;                    /* CH06 in 500 ms, then again every 6 s */
    set_state(BT_CONNECT);
}

void bt_forget(void)
{
    for (int k = 0; k < 6; k++)
        bt_addr[k] = 0;
    if (bt_state >= BT_READY)
        bt_enable(1);                           /* the module restarted: nothing connected */
}

static int remembered(void)
{
    return bt_addr[0] | bt_addr[1] | bt_addr[2] | bt_addr[3] | bt_addr[4] | bt_addr[5];
}

int bt_take_key(void)
{
    int k = key;
    key = BTK_NONE;
    return k;
}

int bt_dropped(void)
{
    int d = dropped;
    dropped = 0;
    return d;
}

const char *bt_state_name(void)
{
    static const char *const n[] = { "off", "starting", "no answer", "on", "searching",
                                     "connecting", "connected" };
    return n[bt_state];
}

static int digits(const uint8_t *p)
{
    if (p[0] < '0' || p[0] > '9' || p[1] < '0' || p[1] > '9')
        return -1;
    return (p[0] - '0') * 10 + p[1] - '0';
}

static void copy_name(char *d, const uint8_t *s, int n)
{
    if (n > 32)
        n = 32;
    int i = 0;
    for (; i < n && s[i]; i++)
        d[i] = (char)s[i];
    d[i] = 0;
}

/* One frame at f (n bytes from it in the burst); returns its length */
static int frame(const uint8_t *f, int n)
{
    uint8_t op = f[1], a = n > 2 ? f[2] : 0, b = n > 3 ? f[3] : 0;
    int ok = a == 'O' && b == 'K', er = a == 'E' && b == 'R';
    if (op == 'V' && a == '1') {                /* CV1x: the module is up */
        variant = b;
        bt_error = 0;
        set_state(BT_READY);
        if (remembered() && !want_scan) {
            send('L', '0', '6', bt_addr, 6);
            connect_op = 'L';
            tries = 1;
            t_try = millis();
            set_state(BT_CONNECT);
        } else if (want_scan)
            bt_scan();
        want_scan = 0;
        return 4;
    }
    if (op == 'Q' && a == 'O' && n >= 5) {      /* CQO nn addr name: connected */
        int len = digits(f + 3);
        if (len < 6 || 5 + len > n)
            return 3;
        if (__builtin_memcmp(bt_addr, f + 5, 6))
            bt_save_due = 1;                    /* a new device: remembered */
        for (int k = 0; k < 6; k++)
            bt_addr[k] = f[5 + k];
        copy_name(bt_name, f + 11, len - 6);
        if (bt_state != BT_LINKED)
            log_printf("bt: connected to %s", bt_name);
        set_state(BT_LINKED);
        bt_rev++;
        return 5 + len;
    }
    if (op == 'Q' && (a == 'S' || a == 'L' || a == 'I')) {
        if (bt_state == BT_LINKED)
            set_state(BT_READY);
        return 3;
    }
    if (op == 'S' && a == 'E' && b == 'N') {    /* the search is over */
        if (bt_state == BT_SCAN)
            set_state(BT_READY);
        return 4;
    }
    if (op == 'S' && digits(f + 2) >= 6) {      /* CSnn addr name: a device found */
        int len = digits(f + 2);
        if (4 + len > n)
            return 2;
        const uint8_t *ad = f + 4;
        int i = 0;
        while (i < bt_nfound && __builtin_memcmp(bt_found[i].addr, ad, 6))
            i++;
        if (i == bt_nfound && i < BT_FOUND_MAX)
            bt_nfound++;
        if (i < BT_FOUND_MAX) {
            for (int k = 0; k < 6; k++)
                bt_found[i].addr[k] = ad[k];
            copy_name(bt_found[i].name, f + 10, len - 6);
            log_printf("bt: found %s", bt_found[i].name);
            bt_rev++;
        }
        return 4 + len;
    }
    if ((op == 'H' || op == 'L') && er) {
        bt_error = "the headphones did not accept";
        set_state(BT_READY);
        return 4;
    }
    if (op == 'H' || (op == 'L' && ok)) {       /* connected: the status gives the name */
        set_state(BT_LINKED);
        t_poll = 0;
        return ok ? 4 : 2;
    }
    if (op == 'T' && ok) {
        set_state(BT_READY);
        return 4;
    }
    if (bt_state == BT_LINKED && !ok && !er) {  /* the headphones' buttons */
        key = op == 'P' ? BTK_PLAY : op == 'C' ? BTK_PAUSE : op == 'A' ? BTK_NEXT :
              op == 'B' ? BTK_PREV : key;
    }
    return ok || er ? 4 : 2;
}

static void take_burst(void)
{
    static uint8_t buf[256];
    int n = 0;
    while (bt_rx_r != bt_rx_w && n < (int)sizeof buf)
        buf[n++] = bt_rx[bt_rx_r++ & 511];
    char *p = bt_last;                          /* shown on the Bluetooth screen */
    for (int i = 0; i < n && p < bt_last + sizeof bt_last - 1; i++)
        *p++ = buf[i] >= ' ' && buf[i] < 127 ? (char)buf[i] : '.';
    *p = 0;
    log_printf("bt: got %u bytes: %s", n, bt_last);
    for (int i = 0; i + 1 < n;) {
        if (buf[i] != 'C') {
            i++;
            continue;
        }
        i += frame(buf + i, n - i);
    }
    bt_rev++;
}

void bt_service(void)
{
    if (bt_state == BT_OFF)
        return;
    if (bt_rx_r != bt_rx_w && ticks() - bt_rx_t > 4000)
        take_burst();
    uint32_t now = millis();
    if (bt_state == BT_BOOT && now - t_state > 6000) {
        bt_error = "the module does not answer";
        set_state(BT_MUTE);
    }
    if ((bt_state == BT_SCAN && now - t_state > 30000) ||
        (bt_state == BT_CONNECT && now - t_state > 30000)) {
        send(bt_state == BT_SCAN ? 'P' : 'T', '0', '0', 0, 0);
        if (bt_state == BT_CONNECT)
            bt_error = "no connection";
        set_state(BT_READY);
    }
    if (bt_state == BT_CONNECT && remembered() && tries < 4 && now - t_try > 6000) {
        t_try = now;                            /* (1.1v: the first one was not always taken) */
        tries++;
        send(connect_op, '0', '6', bt_addr, 6);
    }
    if (bt_state >= BT_READY && bt_state != BT_SCAN &&
        now - t_poll > (bt_state == BT_CONNECT ? 3000u : 1000u)) {
        t_poll = now;
        send('Q', '0', '0', 0, 0);
    }
    if (bt_state == BT_LINKED) {                /* the music state, to the module */
        int playing = audio.on && !audio_paused;
        if (playing != playing_sent) {
            playing_sent = playing;
            send('Y', '0', playing ? 30 : 0, 0, 0);
            if (variant == '5')
                send((char)(playing ? 0x87 : 0x86), '0', '0', 0, 0);
        }
    }
}
