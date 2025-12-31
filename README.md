# M5Stack Unit RFID2 MakeCode Extension

Minimal MFRC522 (I2C) driver to read card UIDs with namespace `m5rfid`. Supports both 4-byte (MIFARE Classic) and 7-byte (NTAG) UIDs.

## Blocks

- **init RFID**: initialize the reader (uses default I2C address `0x28`)
- **is new RFID card present**: checks for a new card in the field
- **read RFID UID**: reads the UID via anti-collision and select (supports cascade levels for 7-byte UIDs)
- **RFID UID (hex)**: returns the UID as a colon-separated hex string (e.g., "04:A1:B2:C3:D4:E5:F6")
- **RFID UID bytes**: returns the UID as byte array (advanced)
- **type name**: returns a simple card type name based on SAK (supports MIFARE and NTAG types) (advanced)
- **get antenna gain**: returns the current receiver gain value (0-7) (advanced)
- **set antenna gain to**: sets the receiver gain value (0-7) (advanced)

## Example

```typescript
m5rfid.init()

basic.forever(function () {
    if (m5rfid.isNewCardPresent() && m5rfid.readUid()) {
        const uid = m5rfid.getUidHex()
        const typ = m5rfid.typeName()
        serial.writeLine("PICC type: " + typ)
        serial.writeLine("UID: " + uid)
        basic.showString("OK")
        basic.pause(500)
    }
})
```

## Antenna Gain

The antenna gain can be adjusted to improve reading performance at different distances. Valid values are 0-7:

- 0 = 18dB
- 1 = 23dB
- 2 = 18dB
- 3 = 23dB
- 4 = 33dB (default)
- 5 = 38dB
- 6 = 43dB
- 7 = 48dB (maximum)

## Notes

- This driver supports 4-byte UIDs (MIFARE Classic) and 7-byte UIDs (NTAG).
- Implements proper cascade level handling for multi-level UIDs.
- I2C address defaults to `0x28` per M5Stack Unit RFID2.
