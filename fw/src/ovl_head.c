/* The overlay's head, first in it (ovl.ld): its entries for ovl.c */
#include "ovl.h"

extern char _ovl_bss[], _ovl_end[];

const struct ovl_head ovl_head __attribute__((section(".ovl_head"), used)) = {
    OVL_MAGIC, (uint32_t)_ovl_bss, (uint32_t)_ovl_end, ovl_install, ovl_usb, ovl_charge,
    ovl_boot_install,
};
