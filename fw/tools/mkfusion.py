#!/usr/bin/env python3
"""Convert a Fusion Pixel 12px proportional BDF (OFL-1.1, font/fusion-pixel-12px) into the font
blob of our firmware image and the built-in ASCII glyphs.

  mkfusion.py FONT.bdf build/font.bin build/font_ascii.c

Blob (little-endian), read from the eMMC copy of the firmware by src/font.c:
  0x00 "FPXF", u32 version 1, u32 glyph count, u32 range count
  0x10 u8 ascent, u8 descent, u16 0
  0x14 u32 offset of first[ranges]   (u32: first code point of each run of consecutive codes)
  0x18 u32 offset of index[ranges+1] (u16: index of its first glyph; the last = glyph count)
  0x1c u32 offset of group[groups]   (u32: offset of glyph 16*i from the start of the records)
  0x20 u32 offset of the records, u32 their length, u32 group count
Records, in code point order: u8 advance, u8 w, u8 h, s8 x offset, s8 y offset (of the bottom
row above the baseline, as in BDF), then h rows of (w+7)/8 bytes, leftmost pixel in bit 7.
"""
import struct
import sys

GROUP = 16


def parse(path):
    glyphs, asc, desc, cur = {}, None, None, None
    for line in open(path, encoding="latin-1"):
        p = line.split()
        if not p:
            continue
        k = p[0]
        if k == "FONT_ASCENT":
            asc = int(p[1])
        elif k == "FONT_DESCENT":
            desc = int(p[1])
        elif k == "STARTCHAR":
            cur = {"rows": None}
        elif k == "ENCODING":
            cur["cp"] = int(p[1])
        elif k == "DWIDTH":
            cur["adv"] = int(p[1])
        elif k == "BBX":
            cur["bbx"] = tuple(int(v) for v in p[1:5])
        elif k == "BITMAP":
            cur["rows"] = []
        elif k == "ENDCHAR":
            if cur.get("cp", -1) >= 0:
                glyphs[cur["cp"]] = cur
            cur = None
        elif cur is not None and cur["rows"] is not None:
            cur["rows"].append(bytes.fromhex(p[0]))
    return glyphs, asc, desc


def extra_glyphs(path):  # noqa: C901
    """FROST: glyphs drawn as text (font/frost-hebrew.txt): "U+XXXX yoff", then rows of '#'/'.'"""
    out, cur = {}, None

    def done():
        if cur and cur["art"]:
            w = max(len(r) for r in cur["art"])
            h = len(cur["art"])
            rows = []
            for r in cur["art"]:
                v = 0
                for i, ch in enumerate(r.ljust(w, ".")):
                    if ch == "#":
                        v |= 0x80 >> (i % 8) << (8 * ((w + 7) // 8 - 1 - i // 8))
                rows.append(v.to_bytes((w + 7) // 8, "big"))
            out[cur["cp"]] = {"cp": cur["cp"], "adv": w + 2, "bbx": (w, h, 1, cur["yoff"]), "rows": rows}
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if line.startswith("#") and not set(line) <= set("#."):
            continue
        if line.startswith("U+"):
            done()
            cp, yoff = line.split()
            cur = {"cp": int(cp[2:], 16), "yoff": int(yoff), "art": []}
        elif cur is not None and line and set(line) <= set("#."):
            cur["art"].append(line)
    done()
    return out


def record(g):
    w, h, xo, yo = g["bbx"]
    bpr = (w + 7) // 8
    if w == 0 or h == 0:
        w = h = 0
    if not (0 <= g["adv"] < 256 and w < 256 and h < 256 and -128 <= xo < 128 and -128 <= yo < 128):
        sys.exit(f"glyph U+{g['cp']:04X} out of the record limits")
    bits = b"".join(r[:bpr].ljust(bpr, b"\0") for r in g["rows"][:h]) if w else b""
    return struct.pack("<BBBbb", g["adv"], w, h, xo, yo) + bits


def main():
    args = sys.argv[1:]
    extra = None
    if "--extra" in args:
        i = args.index("--extra")
        extra = args[i + 1]
        del args[i:i + 2]
    sys.argv[1:] = args
    glyphs, asc, desc = parse(sys.argv[1])
    if extra:
        glyphs.update(extra_glyphs(extra))
    cps = sorted(glyphs)
    recs, offs = bytearray(), []
    for c in cps:
        offs.append(len(recs))
        recs += record(glyphs[c])
    first, index = [], []
    for i, c in enumerate(cps):
        if not first or c != cps[i - 1] + 1:
            first.append(c)
            index.append(i)
    index.append(len(cps))
    if len(cps) > 0xffff:
        sys.exit("more than 65535 glyphs: index entries are 16 bits")
    groups = [offs[i] for i in range(0, len(cps), GROUP)]
    hdr_len = 0x2c
    o_first = hdr_len
    o_index = o_first + 4 * len(first)
    o_group = (o_index + 2 * len(index) + 3) & ~3
    o_recs = o_group + 4 * len(groups)
    blob = bytearray(o_recs)
    struct.pack_into("<4sIII", blob, 0, b"FPXF", 1, len(cps), len(first))
    struct.pack_into("<BBH", blob, 0x10, asc, desc, 0)
    struct.pack_into("<IIIIII", blob, 0x14, o_first, o_index, o_group, o_recs, len(recs), len(groups))
    struct.pack_into(f"<{len(first)}I", blob, o_first, *first)
    struct.pack_into(f"<{len(index)}H", blob, o_index, *index)
    struct.pack_into(f"<{len(groups)}I", blob, o_group, *groups)
    blob += recs
    open(sys.argv[2], "wb").write(blob)

    # built-in: printable ASCII, used before the blob is read and on the fault screen
    out = ["/* Generated by tools/mkfusion.py from Fusion Pixel 12px (SIL OFL 1.1, font/). */",
           '#include "font.h"', "", "const uint8_t font_ascii[] = {"]
    aoffs, n = [], 0
    for c in range(0x20, 0x7f):
        r = record(glyphs[c])
        aoffs.append(n)
        n += len(r)
        out.append("    " + ", ".join(f"0x{b:02x}" for b in r) + ",")
    out += ["};", "", "const uint16_t font_ascii_off[95] = {"]
    out += ["    " + ", ".join(str(v) for v in aoffs[i:i + 12]) + "," for i in range(0, 95, 12)]
    out += ["};", f"const uint8_t font_ascent = {asc};", ""]
    open(sys.argv[3], "w").write("\n".join(out))
    rec_max = max(len(record(glyphs[c])) for c in cps)
    print(f"font: {len(cps)} glyphs, {len(first)} ranges, {len(groups)} groups, records "
          f"{len(recs)} bytes (largest {rec_max}), blob {len(blob)} bytes; ascent {asc}, "
          f"descent {desc}; built-in ASCII {n} bytes")


if __name__ == "__main__":
    main()
