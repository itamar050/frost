# Echo Mini Bluetooth (stock HIFIEC40.IMG V4.0)
- No HCI host stack in stock (no RTL8761 patch, no L2CAP/A2DP code): BT is a self-contained module.
- Power: GPIO2_A7 output, 1 = on (ovl84 0x307b490 / 0x307b4d4). Off: A7=0, C0/C1 driven low.
- UART: driver ch 3 = UART1 @0x400b0000, pins GPIO2_C0/C1 iomux func 1 (GRF sel 0x3052f4e(0)),
  115200 baud, 8 data, args (r3=0,[sp]=2), 24 MHz clock. RX ISR 0x305180e fills 0x30054a0 (msg 0x1c5).
- Boot handshake: after power-up wait up to 5 s for "CV1x" in RX (x=='5' -> variant 5).
- Host->module: 'C' op '0' arg [payload], len byte at 0x3004116 (5, or 10 with 6-byte BD_ADDR).
  CL06+addr6 connect last device; CQ00 status poll (100 ms idle / 500 ms connected); CS00 stop/off;
  CT00, CP00 (arg 3000?), CQ.. , CH00, CY0n (n=0/30, volume?), C\x86 / C\x87 play/pause (variant 5 only).
- Module->host 'C'+type: P, C (connect events), A/B (AVRCP next/prev -> msgs 0x1b6/0x1b5), T,
  Q+'O' connected: [3..4]=name len ascii, [5..10]=BD_ADDR, [11..]=name; Q+'S'/'L'/'I' not connected.
- Connected flag: byte 0x301c0d0+0x34a. Last addr: +0x23e. Name: +0x328.
- Audio: music overlay 33 uses only I2S1 (same as DACs). Module presumably taps I2S1; unverified.
