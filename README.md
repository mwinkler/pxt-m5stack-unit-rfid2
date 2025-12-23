# M5Stack Unit RFID2 MakeCode Extension (Work in progress)

Minimal MFRC522 (I2C) driver to read a card UID with namespace `m5rfid`.

## Blocks

- init(): initialize the reader (uses default `0x28`)
- isNewCardPresent(): checks for a new card
- readCardSerial(): reads the UID via anti-collision and select
- uidHex(): returns the UID as a space-separated hex string
- typeName(): returns a simple card type name based on SAK

## Example

```typescript
m5rfid.init()

basic.forever(function () {
    if (m5rfid.isNewCardPresent() && m5rfid.readCardSerial()) {
        const uid = m5rfid.uidHex()
        const typ = m5rfid.typeName()
        serial.writeLine("PICC type: " + typ)
        serial.writeLine("UID: " + uid)
        basic.showString("OK")
        basic.pause(500)
    }
})
```

## Notes

- This driver implements only the subset needed to read a 4-byte UID (MIFARE Classic-style). It may not handle 7/10 byte UIDs.
- I2C address defaults to `0x28` per M5Stack Unit RFID2.
