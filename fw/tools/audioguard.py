#!/usr/bin/env python3
"""audioguard.py BASE_BUILD NEW_BUILD [--allow FILE --base-tag TAG]: proves that a change left
the sound and Bluetooth alone. Compares two builds made with the same compiler (normally the last
release and the current tree, tools/audioguard.sh):

  - the objects of the audio chain (GUARDED below), section by section: every allocated section's
    bytes (its size for BSS) and its relocations by symbol name, so that the result does not
    depend on where the linker puts things;
  - the decoders of core B: codecs.bin, byte for byte;
  - the DAC ring: its address and size in fw.elf.

Any difference fails, unless the allow file has a line "<base tag> <object> <reason>" for that
object (a deliberate change, explained; lines for other base tags are ignored, so the list empties
itself at the next release). Exit status 0: identical (or allowed), 1: changed, 2: usage."""
import hashlib
import os
import struct
import sys

GUARDED = ["audio.o", "player.o", "hifi.o", "bt.o", "i2c.o", "board.o", "mp4.o", "eq.o", "tags.o",
           "playback.o"]
SHF_ALLOC, SHT_NOBITS, SHT_SYMTAB, SHT_REL = 2, 8, 2, 9


def sections(path):
    """{name: canonical description} of an ELF32 little-endian relocatable object"""
    b = open(path, "rb").read()
    if b[:4] != b"\x7fELF" or b[4] != 1 or b[5] != 1:
        raise SystemExit(f"audioguard: {path}: not an ELF32 little-endian object")
    shoff, = struct.unpack_from("<I", b, 0x20)
    shentsize, shnum, shstrndx = struct.unpack_from("<HHH", b, 0x2e)
    sh = [struct.unpack_from("<10I", b, shoff + i * shentsize) for i in range(shnum)]

    def strz(off):
        return b[off:b.index(b"\0", off)].decode("latin-1")

    names = [strz(sh[shstrndx][4] + s[0]) for s in sh]
    syms = []
    for i, s in enumerate(sh):
        if s[1] == SHT_SYMTAB:
            stroff = sh[s[6]][4]
            for k in range(s[5] // 16):
                name, value, size, info, other, shndx = struct.unpack_from("<IIIBBH", b, s[4] + k * 16)
                n = strz(stroff + name)
                if not n and shndx < shnum:              # a section symbol: its section's name
                    n = names[shndx]
                syms.append(n)
    relocs = {}
    for i, s in enumerate(sh):
        if s[1] == SHT_REL:
            out = relocs.setdefault(s[7], [])
            for k in range(s[5] // 8):
                off, info = struct.unpack_from("<II", b, s[4] + k * 8)
                out.append((off, info & 0xff, syms[info >> 8]))
    desc = {}
    for i, s in enumerate(sh):
        if not s[2] & SHF_ALLOC:
            continue                                     # debug information and the like
        h = hashlib.sha256()
        h.update(f"type {s[1]} flags {s[2]} size {s[5]} align {s[8]}\n".encode())
        if s[1] != SHT_NOBITS:
            h.update(b[s[4]:s[4] + s[5]])
        for r in sorted(relocs.get(i, [])):
            h.update(f"\n{r[0]} {r[1]} {r[2]}".encode())
        desc[names[i]] = h.hexdigest()
    return desc


def elf_symbol(path, want):
    b = open(path, "rb").read()
    shoff, = struct.unpack_from("<I", b, 0x20)
    shentsize, shnum, _ = struct.unpack_from("<HHH", b, 0x2e)
    sh = [struct.unpack_from("<10I", b, shoff + i * shentsize) for i in range(shnum)]
    for s in sh:
        if s[1] == SHT_SYMTAB:
            stroff = sh[s[6]][4]
            for k in range(s[5] // 16):
                name, value, size, *_ = struct.unpack_from("<IIIBBH", b, s[4] + k * 16)
                if b[stroff + name:b.index(b"\0", stroff + name)] == want.encode():
                    return value, size
    return None


def main():
    a = sys.argv[1:]
    allow_file = base_tag = None
    if "--allow" in a:
        i = a.index("--allow"); allow_file = a[i + 1]; del a[i:i + 2]
    if "--base-tag" in a:
        i = a.index("--base-tag"); base_tag = a[i + 1]; del a[i:i + 2]
    if len(a) != 2:
        print(__doc__)
        return 2
    base, new = a
    allowed = {}
    if allow_file and base_tag and os.path.exists(allow_file):
        for line in open(allow_file):
            p = line.split(None, 2)
            if len(p) >= 2 and not line.startswith("#") and p[0] == base_tag:
                allowed[p[1]] = p[2].strip() if len(p) > 2 else ""
    changed = 0
    for o in GUARDED:
        x, y = sections(os.path.join(base, o)), sections(os.path.join(new, o))
        diff = sorted(n for n in set(x) | set(y) if x.get(n) != y.get(n))
        if not diff:
            print(f"ok    {o}")
        elif o in allowed:
            print(f"allow {o}: {len(diff)} section(s) changed ({allowed[o]})")
        else:
            changed = 1
            print(f"FAIL  {o}: {len(diff)} section(s) changed:")
            for n in diff[:12]:
                print(f"        {n}: {'added' if n not in x else 'removed' if n not in y else 'differs'}")
    cb = [open(os.path.join(d, "codecs.bin"), "rb").read() for d in (base, new)]
    if cb[0] == cb[1]:
        print(f"ok    codecs.bin (core B decoders, {len(cb[0])} bytes, identical)")
    elif "codecs.bin" in allowed:
        print(f"allow codecs.bin ({allowed['codecs.bin']})")
    else:
        changed = 1
        print("FAIL  codecs.bin: the decoders differ")
    ring = [elf_symbol(os.path.join(d, "fw.elf"), "sysram_ring") for d in (base, new)]
    if ring[0] == ring[1] and ring[0]:
        print(f"ok    DAC ring at {ring[0][0]:#010x}, {ring[0][1]} bytes")
    else:
        changed = 1
        print(f"FAIL  DAC ring: {ring[0]} before, {ring[1]} now")
    print("audioguard: " + ("the audio chain is unchanged" if not changed else
          "the audio chain CHANGED (see above); a deliberate change goes in tools/audioguard-allow.txt"))
    return changed


if __name__ == "__main__":
    sys.exit(main())
