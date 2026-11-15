#!/bin/sh
# audioguard.sh [TAG]: builds the last release (or TAG) and the current tree with the same
# compiler, then compares their audio chain (tools/audioguard.py). make audioguard; the CI runs it
# on every push and before a release. Needs the release tags (git fetch --tags).
set -e
cd "$(dirname "$0")/.."
TAG=${1:-$(git describe --tags --abbrev=0 --match 'v*' HEAD 2>/dev/null || true)}
if [ -z "$TAG" ]; then
    echo "audioguard: no release tag (v*) to compare with; skipped"
    exit 0
fi
J="-j$(nproc 2>/dev/null || echo 4)"
G=build/guard
rm -rf $G
mkdir -p $G
git worktree prune
git worktree add --detach -f $G/src "$TAG" > /dev/null 2>&1
trap 'git worktree remove --force $G/src > /dev/null 2>&1 || true' EXIT
echo "audioguard: $TAG against the current tree ($(arm-none-eabi-gcc -dumpversion))"
make -s $J -C $G/src/fw BUILD="$PWD/$G/base" "$PWD/$G/base/fw.elf" "$PWD/$G/base/codecs.bin" > $G/base.log 2>&1 \
    || { echo "audioguard: the build of $TAG failed (see fw/$G/base.log)"; exit 1; }
make -s $J BUILD=$G/new $G/new/fw.elf $G/new/codecs.bin > $G/new.log 2>&1 \
    || { echo "audioguard: the build failed (see fw/$G/new.log)"; exit 1; }
python3 tools/audioguard.py $G/base $G/new --allow tools/audioguard-allow.txt --base-tag "$TAG"
