# M5Stack Unit RFID2 MakeCode Extension

Minimal MFRC522 (I2C) driver to read card UIDs with namespace `m5rfid`. Supports both 4-byte (MIFARE Classic) and 7-byte (NTAG) UIDs.

## Blocks

- init(): initialize the reader (uses default `0x28`)
- isNewCardPresent(): checks for a new card
- readUid(): reads the UID via anti-collision and select (supports cascade levels for 7-byte UIDs)
- uidHex(): returns the UID as a colon-separated hex string (e.g., "04:A1:B2:C3:D4:E5:F6")
- typeName(): returns a simple card type name based on SAK (supports MIFARE and NTAG types)

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

## Notes

- This driver supports 4-byte UIDs (MIFARE Classic) and 7-byte UIDs (NTAG).
- Implements proper cascade level handling for multi-level UIDs.
- I2C address defaults to `0x28` per M5Stack Unit RFID2.
