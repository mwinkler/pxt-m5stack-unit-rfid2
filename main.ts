// Minimal MFRC522 (I2C) MakeCode driver for reading UID
// Namespace: m5rfid

//% color=#0079B9 icon="\uf2c2" block="M5 RFID2"
namespace m5rfid {
    const DEFAULT_ADDR = 0x28;

    // Registers
    const CommandReg = 0x01;
    const ComIrqReg = 0x04;
    const FIFODataReg = 0x09;
    const FIFOLevelReg = 0x0A;
    const ControlReg = 0x0C;
    const BitFramingReg = 0x0D;
    const ModeReg = 0x11;
    const TxModeReg = 0x12;
    const RxModeReg = 0x13;
    const TxControlReg = 0x14;
    const TxASKReg = 0x15;
    const TModeReg = 0x2A;
    const TPrescalerReg = 0x2B;
    const TReloadRegH = 0x2C;
    const TReloadRegL = 0x2D;
    const CRCResultRegH = 0x21;
    const CRCResultRegL = 0x22;
    const RFCfgReg = 0x26;
    const VersionReg = 0x37;

    // Commands
    const PCD_Idle = 0x00;
    const PCD_CalcCRC = 0x03;
    const PCD_Transceive = 0x0C;
    const PCD_SoftReset = 0x0F;

    // PICC commands
    const PICC_CMD_REQA = 0x26;
    const PICC_CMD_WUPA = 0x52;
    const PICC_CMD_SEL_CL1 = 0x93;
    const PICC_CMD_SEL_CL2 = 0x95;
    const PICC_CMD_SEL_CL3 = 0x97;

    let addr = DEFAULT_ADDR;
    let uidBytes: number[] = [];
    let uidSize = 0;
    let sak = 0;
    let tagDetectedHandlers: ((uid: string) => void)[] = [];
    let scanning = false;

    const HEX = ["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F"];

    function hexByte(v: number): string {
        const hi = (v >> 4) & 0xF;
        const lo = v & 0xF;
        return HEX[hi] + HEX[lo];
    }

    function writeReg(reg: number, value: number) {
        const buf = pins.createBuffer(2);
        buf[0] = reg;
        buf[1] = value & 0xFF;
        pins.i2cWriteBuffer(addr, buf, false);
    }

    function readReg(reg: number): number {
        pins.i2cWriteNumber(addr, reg, NumberFormat.Int8LE, true);
        return pins.i2cReadNumber(addr, NumberFormat.Int8LE);
    }

    function setBitMask(reg: number, mask: number) {
        writeReg(reg, readReg(reg) | mask);
    }

    function clearBitMask(reg: number, mask: number) {
        writeReg(reg, readReg(reg) & (~mask));
    }

    function flushFIFO() {
        // Write 0x80 to FIFOLevelReg to flush
        writeReg(FIFOLevelReg, 0x80);
    }

    function writeFIFO(data: number[]) {
        for (let i = 0; i < data.length; i++) {
            const buf = pins.createBuffer(2);
            buf[0] = FIFODataReg;
            buf[1] = data[i] & 0xFF;
            pins.i2cWriteBuffer(addr, buf, false);
        }
    }

    function readFIFO(len: number): number[] {
        const out: number[] = [];
        for (let i = 0; i < len; i++) {
            pins.i2cWriteNumber(addr, FIFODataReg, NumberFormat.Int8LE, true);
            out.push(pins.i2cReadNumber(addr, NumberFormat.Int8LE));
        }
        return out;
    }

    function calculateCRC(data: number[]): number[] {
        flushFIFO();
        writeFIFO(data);
        writeReg(CommandReg, PCD_CalcCRC);
        // Wait for CRC completion
        let i = 500;
        while (i-- > 0) {
            const n = readReg(ComIrqReg);
            if (n & 0x04) break;
        }
        const h = readReg(CRCResultRegH);
        const l = readReg(CRCResultRegL);
        return [l, h];
    }

    function transceiveData(send: number[], txLastBits: number = 0): { back: number[], validBits: number, status: boolean } {
        // Clear pending IRQ flags to avoid stale signals from previous commands
        writeReg(ComIrqReg, 0x7F);
        writeReg(CommandReg, PCD_Idle);

        flushFIFO();
        writeFIFO(send);
        writeReg(BitFramingReg, (txLastBits & 0x07));
        writeReg(CommandReg, PCD_Transceive);
        setBitMask(BitFramingReg, 0x80); // StartSend

        let i = 2000;
        let status = false;
        while (i-- > 0) {
            const n = readReg(ComIrqReg);
            if (n & 0x30) { // RxIRq or IdleIRq
                status = true;
                break;
            }
            if (n & 0x01) { // TimerIRq
                break;
            }
        }
        clearBitMask(BitFramingReg, 0x80);

        const errorReg = readReg(0x06); // ErrorReg
        if (!status || (errorReg & 0x13)) {
            return { back: [], validBits: 0, status: false };
        }

        const length = readReg(FIFOLevelReg);
        const result = readFIFO(length);
        const control = readReg(ControlReg);
        const lastBits = control & 0x07;
        return { back: result, validBits: lastBits, status: true };
    }

    function softReset() {
        writeReg(CommandReg, PCD_SoftReset);
        pause(50);
    }

    function antennaOn() {
        const val = readReg(TxControlReg);
        if ((val & 0x03) === 0) {
            writeReg(TxControlReg, val | 0x03);
        }
    }

    function _init() {
        softReset();
        writeReg(TModeReg, 0x8D);
        writeReg(TPrescalerReg, 0x3E);
        writeReg(TReloadRegH, 0x03);
        writeReg(TReloadRegL, 0xE8);
        writeReg(TxASKReg, 0x40);
        writeReg(ModeReg, 0x3D);
        antennaOn();
    }

    /**
     * Initialize the M5Stack RFID2 unit using the default I2C address (0x28).
     * Call this once before reading cards.
     * @returns nothing
     */
    //% blockId="m5rfid_init" block="init RFID"
    export function init() {
        addr = DEFAULT_ADDR & 0x7F;
        _init();
    }

    /**
     * Check if a new RFID card is present in the reader field.
     * Uses the REQA 7-bit request.
     * @returns true if a card responded, false otherwise
     */
    //% blockId="m5rfid_is_new_card_present" block="is new RFID card present"
    export function isNewCardPresent(): boolean {
        const res = transceiveData([PICC_CMD_REQA], 7);
        return res.status && (res.back.length > 0);
    }

    /**
     * Read the card UID via anticollision and select.
     * Stores the UID and SAK internally for later retrieval.
     * Supports both 4-byte UIDs (MIFARE) and 7-byte UIDs (NTAG).
     * @returns true if the UID was read successfully, false otherwise
     */
    //% blockId="m5rfid_read_uid" block="read RFID UID"
    export function readUid(): boolean {
        uidBytes = [];
        uidSize = 0;
        sak = 0;

        let cascadeLevel = 0;
        let uidComplete = false;

        while (!uidComplete && cascadeLevel < 3) {
            cascadeLevel++;
            let cmd: number[] = [];

            // Select cascade level command
            if (cascadeLevel === 1) {
                cmd = [PICC_CMD_SEL_CL1, 0x20];
            } else if (cascadeLevel === 2) {
                cmd = [PICC_CMD_SEL_CL2, 0x20];
            } else if (cascadeLevel === 3) {
                cmd = [PICC_CMD_SEL_CL3, 0x20];
            }

            // Anticollision
            let r = transceiveData(cmd);
            if (!r.status || r.back.length < 5) {
                return false;
            }

            let u = r.back;
            let cl_uid: number[] = [];
            for (let i = 0; i < 4; i++) {
                cl_uid.push(u[i] & 0xFF);
            }
            let bcc = (cl_uid[0] ^ cl_uid[1] ^ cl_uid[2] ^ cl_uid[3]) & 0xFF;
            if ((u[4] & 0xFF) !== bcc) {
                return false;
            }

            // SELECT command
            let sel_cmd: number[] = [];
            if (cascadeLevel === 1) {
                sel_cmd = [PICC_CMD_SEL_CL1, 0x70];
            } else if (cascadeLevel === 2) {
                sel_cmd = [PICC_CMD_SEL_CL2, 0x70];
            } else if (cascadeLevel === 3) {
                sel_cmd = [PICC_CMD_SEL_CL3, 0x70];
            }

            sel_cmd = sel_cmd.concat(cl_uid);
            sel_cmd.push(bcc);
            let crc = calculateCRC(sel_cmd);
            let full_cmd = sel_cmd.concat(crc);

            let r2 = transceiveData(full_cmd);
            if (!r2.status || r2.back.length < 1) {
                return false;
            }

            sak = r2.back[0] & 0xFF;

            // Add UID bytes from this cascade level to the array
            // Skip cascade tag (0x88) if present, otherwise add all 4 bytes
            for (let i = 0; i < 4; i++) {
                let byte = cl_uid[i] & 0xFF;
                // Skip the first byte if it's a cascade tag (0x88) at CL1 or CL2
                if (i === 0 && byte === 0x88 && cascadeLevel < 3) {
                    continue; // Skip cascade tag byte
                }
                uidBytes.push(byte);
            }

            // Check cascade bit in SAK (bit 2) - if not set, UID is complete
            if ((sak & 0x04) === 0) {
                uidComplete = true;
            }
        }

        uidSize = uidBytes.length;
        
        return uidSize > 0;
    }

    /**
     * Get the last read UID as a colon-separated uppercase hex string.
     * Example: "DE:AD:BE:EF"
     * @returns UID string or empty string if no UID is available
     */
    //% blockId="m5rfid_uid_hex" block="RFID UID (hex)"
    export function getUidHex(): string {
        if (!uidBytes || uidBytes.length === 0) return "";
        let s = "";
        for (let i = 0; i < uidBytes.length; i++) {
            const h = hexByte(uidBytes[i]);
            s += h;
            if (i < uidBytes.length - 1) s += ":";
        }
        return s;
    }

    /**
     * Get the last read UID as an array of bytes.
     * @returns UID byte array
     */
    //% blockId="m5rfid_uid_bytes" block="RFID UID bytes" advanced=true
    export function getUidBytes(): number[] {
        return uidBytes.slice(0, uidSize);
    }

    /**
     * Get a human-readable card type name from the last read SAK.
     * Supports MIFARE and NTAG types.
     * @returns card type name string
     */
    //% blockId="m5rfid_type_name" block="type name" advanced=true
    export function typeName(): string {
        switch (sak) {
            case 0x01: return "MIFARE Ultralight";
            case 0x08: return "MIFARE 1K";
            case 0x18: return "MIFARE 4K";
            case 0x09: return "MIFARE Mini";
            case 0x00:
                // SAK 0x00 typically indicates NTAG or Type 2 tag
                if (uidSize === 7) {
                    return "NTAG (7-byte UID)";
                }
                return "Type 2 Tag";
            default: return "Unknown";
        }
    }

    /**
     * Get the current MFRC522 receiver gain (RxGain).
     * Returns the 3-bit gain value (0-7) corresponding to gain settings from 18dB to 48dB.
     * See MFRC522 datasheet section 9.3.3.6 for gain values.
     * @returns gain value (0-7)
     */
    //% blockId="m5rfid_get_antenna_gain" block="get antenna gain" advanced=true
    export function getAntennaGain(): number {
        return (readReg(RFCfgReg) >> 4) & 0x07;
    }

    /**
     * Set the MFRC522 receiver gain (RxGain).
     * Valid gain values are 0-7, corresponding to gain settings from 18dB to 48dB:
     * 0 = 18dB, 1 = 23dB, 2 = 18dB, 3 = 23dB, 4 = 33dB, 5 = 38dB, 6 = 43dB, 7 = 48dB (max)
     * @param gain the gain value (0-7)
     */
    //% blockId="m5rfid_set_antenna_gain" block="set antenna gain to %gain" advanced=true
    //% gain.min=0 gain.max=7 gain.defl=4
    export function setAntennaGain(gain: number) {
        gain = Math.max(0, Math.min(7, gain)); // Clamp to 0-7
        const mask = (gain & 0x07) << 4;
        if (getAntennaGain() !== (gain & 0x07)) {
            clearBitMask(RFCfgReg, 0x70); // Clear RxGain bits (bits 6:4)
            setBitMask(RFCfgReg, mask);   // Set new gain value
        }
    }

    /**
     * Register code to run when an RFID tag is detected.
     * Starts background scanning if not already active.
     * Multiple handlers can be registered and will all be called when a tag is detected.
     * @param handler the callback function that receives the UID as a hex string
     */
    //% blockId="m5rfid_on_tag_detected" block="on RFID tag detected"
    //% draggableParameters="reporter"
    //% weight=100
    export function onTagDetected(handler: (uid: string) => void) {
        tagDetectedHandlers.push(handler);
        if (!scanning) {
            scanning = true;
            control.inBackground(() => {
                while (scanning) {
                    if (isNewCardPresent() && readUid()) {
                        const uid = getUidHex();
                        for (let i = 0; i < tagDetectedHandlers.length; i++) {
                            tagDetectedHandlers[i](uid);
                        }
                        // Wait to avoid repeated detections of the same card
                        basic.pause(500);
                    }
                    basic.pause(100);
                }
            });
        }
    }
}
