/* The overlay (src/ovl.h): run from the DAC ring's RAM, linked against the main firmware's
 * symbols (--just-symbols=fw.elf); the main firmware keeps what it uses (ovl_keep.ld, Makefile).
 * .ovl is the image's copy (head first); its BSS follows and is cleared by the loader. */
ENTRY(ovl_head)

MEMORY
{
    OVL (rwx) : ORIGIN = 0x03020000, LENGTH = 0x30000
}

SECTIONS
{
    .ovl : {
        KEEP(*(.ovl_head))
        *(.text*)
        *(.rodata*)
        *(.data*)
        . = ALIGN(4);
    } > OVL
    .ovlbss (NOLOAD) : {
        _ovl_bss = .;
        *(.bss*)
        *(COMMON)
        . = ALIGN(4);
        _ovl_end = .;
    } > OVL
    /DISCARD/ : {
        *(.ARM.exidx*)
        *(.ARM.extab*)
    }
    ASSERT(SIZEOF(.ovl) <= 0x30000 - 512, "overlay larger than the DAC ring")
}
