#!/bin/sh
# fatdel_test.sh: src/fatdel.c (deleting HIFIEC70.IMG after an install at start-up) on real FAT32
# volumes made by mkfs.fat and mtools, each then checked by fsck.fat: the file gone, its clusters
# free, FSInfo right, no lost or orphan entry, the other files intact. Cases: plain, in pieces,
# with a long name. Needs dosfstools and mtools (skipped without them). Run by tools/check.sh.
set -e
cd "$(dirname "$0")/.."
T=build/check/fatdel
mkdir -p $T
for t in mkfs.fat fsck.fat mcopy mdel mdir mtype; do
    command -v $t > /dev/null || [ -x /usr/sbin/$t ] || { echo "skip  fatdel_test ($t missing)"; exit 0; }
done
PATH=$PATH:/usr/sbin
cc -std=gnu99 -Wall -Wextra -Wno-unused-parameter -Isrc -o $T/fatdel_test tools/fatdel_test.c src/fatdel.c
head -c 300000 /dev/urandom > $T/a.bin
head -c 700000 /dev/urandom > $T/b.bin
head -c 2097156 /dev/urandom > $T/fw.bin
one() {                                         # $1: name as copied, $2: 1 = in pieces
    V=$T/v.img
    rm -f $V
    truncate -s 300M $V
    mkfs.fat -F 32 -s 8 -S 512 -n FATDEL $V > /dev/null
    mcopy -i $V $T/a.bin "::01 First song.flac"
    if [ "$2" = 1 ]; then
        for k in 1 2 3 4 5 6; do mcopy -i $V $T/b.bin "::gap$k.bin"; done
        for k in 2 4 6; do mdel -i $V "::gap$k.bin"; done
    fi
    mcopy -i $V $T/fw.bin "::$1"
    mcopy -i $V $T/a.bin "::02 After it.flac"
    before=$(fsck.fat -n $V | tail -1 | sed 's/.* \([0-9]*\)\/.*/\1/')
    $T/fatdel_test $V HIFIEC70.IMG > $T/out.txt || { cat $T/out.txt; return 1; }
    fsck.fat -n $V > $T/fsck.txt 2>&1 || { cat $T/fsck.txt; return 1; }
    ! grep -qiE "orphan|lost|differ|wrong|free cluster summary (un)?correct" $T/fsck.txt || { cat $T/fsck.txt; return 1; }
    after=$(tail -1 $T/fsck.txt | sed 's/.* \([0-9]*\)\/.*/\1/')
    [ $((before - after)) -eq 513 ] || { echo "clusters $before -> $after"; return 1; }
    ! mdir -i $V :: | grep -qi hifiec70 || { echo "still listed"; return 1; }
    mtype -i $V "::01 First song.flac" | cmp -s - $T/a.bin || return 1
    mtype -i $V "::02 After it.flac" | cmp -s - $T/a.bin || return 1
    # the free count in FSInfo, as the PC reads it, against fsck's own count
    free_fsinfo=$(mdir -i $V :: | awk '/bytes free/ { gsub(/ /, ""); sub(/bytesfree/, ""); print }')
    total=$(fsck.fat -n $V | tail -1 | sed 's/.*\/\([0-9]*\) clusters/\1/')
    [ "$free_fsinfo" -eq $(((total - after) * 4096)) ] || { echo "FSInfo $free_fsinfo"; return 1; }
}
one HIFIEC70.IMG 0 && one HIFIEC70.IMG 1 && one HifiEc70.Img 1 && \
    { $T/fatdel_test $T/v.img HIFIEC70.IMG > /dev/null; [ $? -eq 1 ]; } && \
    echo "ok    fatdel_test (plain, in pieces, long name, absent)" && exit 0
echo "FAIL: fatdel_test"
exit 1
