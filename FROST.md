# FROST — custom firmware for the SNOWSKY ECHO MINI (8 GB)

FROST is a fork of [echo-mini-newfw](https://github.com/berettavexee/echo-mini-newfw) 0.95 by
berettavexee: a bare-metal firmware written from scratch for the Rockchip RKNanoD inside the
player. FROST keeps all of newfw (its decoders, gapless playback, ReplayGain, resume, USB disk,
installer) and adds what is listed below.

> **Beta, not yet tested on a real player.** Everything below was built and checked in the
> project's emulator (screens, keys, both storages, the audio that reaches the DAC), and the
> new decoders were also tested on a PC. Keep a stock image on the player and know the recovery
> procedure before installing (see "Installing").

## The hardware (8 GB model)

| Part | What it is |
|---|---|
| SoC | Rockchip RKNanoD: two Cortex-M3 cores. Core A runs the UI and storage, up to 200 MHz. Core B ("HiFi") does the decoding. |
| RAM | On-chip SRAM only, a few hundred KiB |
| Storage | 8 GB eMMC (7456 MB usable) plus a microSD slot (FAT32 or exFAT) |
| Screen | 320 × 170 IPS, ST7789-type controller, 8-bit bus |
| DAC / amp | Two Cirrus CS43131 in dual mono |
| Outputs | 3.5 mm single-ended and 4.4 mm balanced |
| Keys | Power, VOL+, VOL-, PLAY, BACK, MENU (a resistor ladder on an ADC) |
| Clock | Real-time clock on I2C |

## What FROST adds

### Fast navigation
- **Hold-to-scroll speeds up.** Holding VOL+ or VOL- moves one row at a time, then 4 rows after
  1.5 s, a page after 3 s, and 1/40 of the folder after 5 s. Held scrolling stops at the ends;
  a single press still wraps around.
- **Quick jump** (VOL+ then VOL-): a large letter appears. VOL+ and VOL- step through the first
  letters in the folder (folders, then files), and PLAY jumps there; with no key for 1.5 s it
  jumps too. In a very large folder it steps through 0 %, 10 % … 90 % of the folder instead.
- **Home** (BACK held): goes to the root of the storage, or from there to Internal / SD card.
- Page up and page down are available as actions you can map to any key.

### Folders and unlimited files
- Folders with up to 1,000 entries are sorted: folders first, then natural order, ignoring
  case.
- **Bigger folders have no limit.** They are read through a window of 1,000 entries that moves
  with you. They are shown in the order they were copied to the card, not sorted, and the
  count at the top is exact. The stock firmware and newfw stop at 1,000 entries.
- Play queue: up to 524,287 tracks per folder (newfw stopped at about 550). "Play all under"
  (PLAY held on a folder) now goes 14 levels deep instead of 7, across up to 4,000 folders
  that contain tracks.

### Formats
| Format | Extension | Notes |
|---|---|---|
| FLAC, WAV, AIFF, ALAC, MP3, AAC (M4A), Ogg Vorbis, Opus, Musepack | many | from newfw, up to 192 kHz |
| **DSD** (new) | .dsf, .dff | DSD64, DSD128 and DSD256, mono or stereo, converted to 88.2 kHz / 24-bit PCM. The two-stage FIR rejects aliasing by more than 90 dB, with +6 dB gain (the SACD reference level). Compressed DST is not supported. |
| **Monkey's Audio** (new) | .ape | File versions 3.97–3.99 at every level, 8, 16 or 24 bits. Output is bit-exact on the PC test. Seeking lands at the start of an APE frame, which can be up to about 7 s early (up to about 27 s at Insane). |

**Not supported:** WMA, DST-compressed DSD, and multichannel files. Formats a dedicated audio
player doesn't use, such as video files and lossy 5.1, are not included either.

### Screen and power
- **Only Power switches the screen on.** With the screen off, the other keys keep working
  (volume, play / pause, next, previous, seek...) and the screen stays off: the player can be
  used blind, and a press doesn't light the screen up. The charging screen is the exception:
  there, only Power wakes it.
- **Brightness** (Main menu → Brightness): 10 levels, from the stock firmware's backlight PWM at
  10 kHz. PLAY makes it brighter (after 10 it wraps to 1); PLAY held makes it dimmer. It is
  kept with the settings.
- **Power off:** hold Power for 2 s. A "Power off" screen shows for one second while the state is
  saved, then the player goes off: about 3 s in all. With the USB cable in, the charging screen
  appears instead.
- **Lists:** VOL- moves up and VOL+ moves down, in the browser and in every menu. Swap
  `vol_up` and `vol_down` in Buttons (browser) to reverse it; the menus follow the browser.
- **Format line:**
  - The sample rate shows as written: 44.1, 22.05, 11.025 kHz.
  - Lossless files show their bit depth.
  - Lossy files (MP3, AAC, Vorbis, Opus, Musepack) show their average bitrate in kbps; the
    "16 bit" newfw showed was only the decoder's output.
  - DSD shows its own rate and what it is converted to ("DSD64 2.8 MHz → 88.2 kHz").

### Fun UI
- **Twelve colour themes**: Classic, Snow (light), Neon, Cassette, Matrix, Sakura, Elvis (black and gold, with rhinestones sparkling on the shell), Sega (90s blue, white and black), Terminator (red and black, a touch of chrome), Virtual Boy (red on black only), Turtles (sewer green with the four bandana colours) and Dark Mode (terminal greys). Change them
  in Main menu → Theme; the change shows at once. The choice is kept when you power off.
- **The play screen is a cassette.** The whole screen is drawn as a tape, with screws in the
  corners and the colours of the theme you picked.
  - **The label** carries the status line: play state, song number (e.g. 6/12), play mode, date
    and time, the jack in use, and the battery icon and percentage.
  - **Anti-aliased drawing:** every edge is smoothed. The tape packs are shaded and banded,
    the white hubs have six teeth that turn smoothly in 10° steps, the glass has a
    reflection, the shell is lit from above, and the screws and bottom holes are rounded.
  - **The window:** two reels turn while music plays. The tape winds from the left reel onto the
    right one with its area kept, so the left reel empties down to its bare hub by the end of
    the song while the right one fills. The tape leaves each reel on its outer side (the left
    reel's left, the right reel's right), goes down to the guides in the window's lower
    corners, and runs along the bottom between them. Their tape packs shrink on the left and
    grow on the right as the track goes on. Between the reels you see the title, artist, album
    (long lines scroll) and the time.
  - **Under the window:** the progress bar, the format and the volume.
  - **The bottom of the shell** shows the level meters and the next track.
- **Level meters**: two LED-style bars (L/R) with a peak hold, taken from the audio the DAC is
  playing at that moment.
- **Status line**: play/pause/stop icon, song number (e.g. 6/12), play-mode icon, date and time
  (once the clock is set), the output jack in use (3.5 / 4.4), a coloured battery icon and the
  battery percentage.
- An "up next" line, a coloured dot for each file showing its format, an accent bar on the
  selected row, and a boot splash.

### Resume where you stopped
- **What is kept at power off:** the track and the exact place in it, the whole play queue
  (one folder, or everything under a folder), volume, play mode, theme and settings. This
  applies however the player goes off: Power held, auto-off, or a flat battery.
- **What happens at power on:** the same queue is rebuilt from its own folder, even if you were
  browsing somewhere else, and the play screen opens. Music starts 2 s before where it stopped
  (5 s for an audiobook). If it was paused, PLAY continues from the exact point.
- **Sudden power loss:** while playing, the place is also saved every 15 s, so at most a few
  seconds are lost if the battery is pulled.
- **Where it's kept:** in a spare area at the end of the firmware's own space on the internal
  memory, after the 2 MB image (on the 8 GB model that space is 27 MB per copy). No file is
  needed, and the state survives firmware updates.
  - If a player ever lacks that room, `NEWFWLOG.TXT` in the root is used instead (included in
    the package), and the boot screen says when neither is available.
  - An older state kept in `NEWFWLOG.TXT` is read once and carried over.

### Audiobooks
- **What counts as a book:** any folder whose name, or the name of a folder above it, contains
  "audiobook", "book", "podcast", "ספרי שמע", "ספר שמע", "ספרים" or "פודקאסט". Any .m4b file
  is also a book. Simplest: put your books in a folder called **Audiobooks**, one folder per
  book.
- **Bookmark per book:** up to 31 books each remember their chapter and the place in it.
  - Opening the book folder puts the cursor on that chapter.
  - Playing it, or PLAY held on the folder, continues 5 s before the bookmark.
  - Main menu → **Audiobooks** lists them, most recent first, with chapter and time. PLAY
    continues one; BACK held forgets it.
- **Chapters:** the files of the book. Inside an .m4b, its own chapters with their titles from
  the "chpl" chapter list (shown as "ch 2/12 · Title").
- **The play screen of a book** has a BOOK badge and the chapter line, plays in order (no
  shuffle or repeat), and has its own keys (Main menu → Buttons → audiobook, or `[audiobook]`
  in KEYMAP.TXT):

  | Key | Audiobook |
  |---|---|
  | PLAY | play / pause (5 s back after a pause over a minute) |
  | PLAY held | forward 30 s |
  | BACK | start of the chapter, or the one before |
  | BACK held | back 30 s |
  | VOL+ then VOL- | next chapter |
  | VOL+ / VOL- | volume |

- **Sleep timer** (Main menu → Sleep timer): 15, 30, 45, 60 or 90 min, or **end of chapter**.
  The music pauses (end of chapter: stopped at the start of the next one) and the screen goes
  off. A moon and the minutes left show in the status line.
- **Not supported:** speed control. That would need a time-stretch on the audio core, which is
  a big job.
- **Not supported:** Audible files (.aa/.aax), which are DRM-protected.
- **Not supported:** chapters stored only as a QuickTime chapter track. Most tools also write
  the "chpl" list.

### Play modes
BACK held on the play screen cycles through the modes. The status line shows each one's sign
and a word:

| Mode | What it does |
|---|---|
| in order | the queue once, then stop |
| ⟳ all | the queue again and again |
| ① one | the same track |
| ⇄ mix | every track once in a random order, then another order |
| ⇉ folders | at the end of the folder, on to the next folder that has tracks, without a gap |

How "folders" picks the next folder:
- the current folder's subfolders come first, then the next folder beside it, then up a level;
- after the last folder of the storage it starts from the top again;
- folders without tracks are skipped;
- PLAY held on the last track jumps to the next folder at once;
- the bottom line shows "⇉ the next folder" when it is about to move on.

### Tags and order
- **Tags read:** title, artist, album, track and disc number, and ReplayGain.
  - MP3: ID3v2.2–2.4, falling back to ID3v1.
  - FLAC, Ogg and Opus: Vorbis comments.
  - M4A: iTunes tags.
  - MPC and APE: APEv2.
  - DSF: its ID3 tag.
- **Hebrew in old tags** (Main menu → Tag text). Many Israeli MP3s store Hebrew in Windows-1255
  while the tag says Latin-1, which shows as "ùéø". On **auto**, an 8-bit text is read as Hebrew
  when it holds at least three Hebrew-range letters, or two with no Latin letters. Accented
  Latin titles such as "Café crème" stay as they are.
  - "Hebrew" or "Latin-1" forces one or the other.
  - Hebrew vowel points (niqqud) are dropped.
- **Sort files** (Main menu → Sort files: by name / by track number). With "by track number",
  the files of a folder of up to 250 files are ordered by disc, then track, from their tags.
  - Files without a track number come after, by name; folders stay first, by name.
  - The play queue follows the same order.
  - Bigger folders keep the name order: reading every tag takes time, and the queue reads
    its folder again while music plays.
- **FAT Sorter:** for folders of up to 1,000 entries, FROST sorts by itself, so FAT Sorter
  changes nothing there. For bigger folders, which are shown in the order on the card, run
  FAT Sorter with natural order and ignore case (`fatsort -n -c`) so the order matches.

### Hebrew and right-to-left text
- Hebrew letters were added to the font (all 22 letters and the 5 final forms, plus geresh,
  gershayim and maqaf).
- Lines with Hebrew are put in visual order before they are drawn. Hebrew runs are reversed,
  numbers and Latin keep their order, and brackets are mirrored. This applies to file names,
  folder names and tags.

### 3.5 mm / 4.4 mm
- Both jacks are driven by the same two CS43131 DACs, which are wired in dual mono, so there is
  nothing to switch. FROST shows which jack is in use in the status line.
- **Unplugging the headphones pauses the music.**
- The 4.4 mm output keeps newfw's DAC settings, which are the same as the stock firmware's.
  newfw lists checking the balanced output by ear on a real player as still to do.

### SD card
microSD with FAT32 or exFAT, cards of any size, mounted on first use, with insertion and
removal detected (from newfw). Everything above works on the card too: big folders, Hebrew
and all formats.

## Button mapping

Each screen (browser and play screen) has nine slots: PLAY, PLAY held, BACK, BACK held, MENU,
MENU held, VOL+, VOL- and "VOL+ then VOL-". Any action can go in any slot.

**On the player:** Main menu → Buttons.
- VOL+ and VOL- choose a slot.
- PLAY gives it the next action (PLAY held gives the previous one).
- MENU switches between the browser and the play screen.
- BACK held restores the defaults.
- BACK saves and leaves.

**With a file:** put `KEYMAP.TXT` in the root of the internal memory (see `KEYMAP.example.txt`).
When this file is present it replaces the map at every boot. Delete it to go back to the map
edited on the player.

If no slot opens the main menu, MENU held always does, so you cannot lock yourself out. The
menus and the seek mode keep their fixed keys.

| Action words for KEYMAP.TXT |
|---|
| `up` `down` `page_up` `page_down` `open` `play_all` `parent` `home` `jump` |
| `play_pause` `next` `prev` `vol_up` `vol_down` `seek` `forward` `rewind` `mode` `shuffle` |
| `switch` `menu` `theme` `screen_off` `none` |

Slot words: `play` `play_hold` `back` `back_hold` `menu` `menu_hold` `vol_up` `vol_down` `chord`.

### Default keys
| Key | Browser | Play screen |
|---|---|---|
| PLAY | open folder / play file | play / pause |
| PLAY held | play everything under the folder | next track |
| BACK | folder up | previous track (or restart) |
| BACK held | home | play mode |
| MENU | to the play screen | to the browser |
| MENU held | main menu | main menu |
| VOL- / VOL+ | up / down (faster when held) | volume |
| VOL+ then VOL- | quick jump | seek mode |

## Installing

1. **Back up first.** Copy the stock firmware image (for example `HIFIEC39.IMG` from FiiO /
   SNOWSKY) to your PC.
2. **From the stock firmware:** copy `HIFIEC70.IMG` alone to the root of the internal memory,
   eject the player, and restart it. The stock updater installs it, the same way newfw is
   installed.
   **From newfw or FROST:** copy the image under any name, for example `FROST10B.IMG`, then go
   to Main menu → Install a firmware.
3. Keep a stock image on the player under a name that neither firmware installs on its own,
   such as `STOCK39.IMG`. Going back to stock is then an install from the menu.
4. **Recovery** if the player doesn't start: hold VOL- while you plug in the USB cable on the
   switched-off player. This enters the loader's USB mode, and `rkdeveloptool` can write the
   stock image (see `fw/README.md` and the SNOWSKY recovery kit).

## Building

    cd fw && make            # arm-none-eabi-gcc, Python 3 (numpy and scipy only to regenerate
                             # the DSD filters: tools/mkdsdfir.py)
    make check               # warnings as errors, memory limits, host tests, lint

## Licences

- newfw's own code has no licence of its own stated in its repository; all rights stay with its
  author. FROST's changes are offered to him and are meant for personal use. **Ask the newfw
  author before redistributing images built from this tree.**
- libdemac (`third_party/libdemac`, from Rockbox) is GPL v2 or later. An image that includes
  the APE decoder is therefore under the GPL as a whole.
- The other third-party parts keep their licences (see README.md).
- The Hebrew glyphs and the DSD converter were written for FROST.
