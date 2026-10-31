# FROST — install and quick-start guide

Version 1.2d · SNOWSKY Echo Mini (8 GB). A printable version: [install-guide.pdf](docs/promo/install-guide.pdf).

## 1. Install

1. Charge the player and back up anything important on it.
2. Connect it to your computer by USB. It shows up as a disk.
3. Copy `HIFIEC70.IMG` to the top folder of the player's disk, then eject it safely and unplug.
4. On the player, hold **MENU** to open the main menu and choose **Install a firmware (.IMG)**.
5. Wait for the player to finish and restart. Do not unplug or power off while it writes.

Coming from stock firmware, or something went wrong? Follow the loader route in
[FROST.md](FROST.md#installing) (USB loader mode). Your music and settings stay on the disk.

## 2. Buttons

| In the file browser | |
|---|---|
| PLAY | Open |
| PLAY (hold) | Play everything in the folder |
| BACK | Up one folder |
| VOL− / VOL+ | Move up / down |
| MENU (hold) | Main menu |

| On the play screen | |
|---|---|
| PLAY | Play / pause |
| PLAY (hold) | Next track |
| BACK | Previous track |
| BACK (hold) | Change play mode |
| VOL− / VOL+ | Volume |
| MENU | Switch screens |

**POWER**: a short press turns the screen on or off; hold 2–3 seconds to power off.
Every button can be remapped in **Main menu › Buttons** or with a `KEYMAP.TXT` file.

## 3. Make it yours

- **Theme**: 24 looks, from Classic and Cassette to Neon, Matrix, Sakura and Green Hill.
- **Equalizer**: 10 bands, ±12 dB. Presets: Flat, Rock, Pop, Jazz, Classical, Bass boost,
  Vocal, Treble, Custom. Off means untouched audio.
- **Shuffle all music**: every song on the card in a random order.
- **Play modes** (hold BACK): in order, repeat all, repeat one, shuffle, folders.
- **Audiobooks**: bookmarks, m4b chapters and 30-second skips.
- **Sleep timer**, **Brightness** (10 levels), **Sort files**, **Date and time**, **ReplayGain**.

## 4. Your music

Put files on the internal disk or a microSD card (FAT32 or exFAT). Folders of any size work.

- FLAC · WAV · AIFF · ALAC · APE — up to 192 kHz, bit-perfect
- DSF / DFF up to DSD256 — played as 88.2 kHz / 24-bit
- MP3 · AAC / M4A · Ogg Vorbis · Opus · Musepack · WMA 1/2

Tags are read from ID3, Vorbis, APE, MP4 and ASF, including Hebrew and other right-to-left
text. Albums sort by track number. FROST remembers where you stopped and picks up there.

## 5. Good to know

- **USB disk read/write** in the main menu lets your computer copy files while the player stays on.
- Both outputs work: 3.5 mm and 4.4 mm balanced.
- Bluetooth is back in 1.2d as a test: pair from **Main menu › Bluetooth**.
- Stuck? Press the reset pin, then power on again. **Debug info** in the main menu shows
  details to share.

---
FROST is community firmware, not made by or affiliated with SNOWSKY. Install at your own risk.
