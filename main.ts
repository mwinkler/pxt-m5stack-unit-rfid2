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
    //% block="init RFID"
    export function init() {
        addr = DEFAULT_ADDR & 0x7F;
        _init();
    }

    /**
     * Check if a new RFID card is present in the reader field.
     * Uses the REQA 7-bit request.
     * @returns true if a card responded, false otherwise
     */
    //% block="is new RFID card present"
    export function isNewCardPresent(): boolean {
        const res = transceiveData([PICC_CMD_REQA], 7);
        return res.status && (res.back.length > 0);
    }

    /**
     * Read the card UID via anticollision and select (cascade level 1).
     * Stores the UID and SAK internally for later retrieval.
     * Note: currently supports 4-byte UIDs (MIFARE Classic style).
     * @returns true if the UID was read successfully, false otherwise
     */
    //% block="read RFID UID"
    export function readCardSerial(): boolean {
        uidBytes = [];
        uidSize = 0;

        // Anticollision CL1: send [SEL, 0x20]
        let r = transceiveData([PICC_CMD_SEL_CL1, 0x20]);
        if (!r.status || r.back.length < 5) return false;

        // First 4 bytes are UID, then BCC
        const u = r.back;
        const uidPart = u.slice(0, 4);
        let bcc = uidPart[0] ^ uidPart[1] ^ uidPart[2] ^ uidPart[3];
        if (u[4] !== bcc) {
            // invalid BCC
            return false;
        }

        uidBytes = uidPart;
        uidSize = 4;

        // SELECT: [SEL, 0x70, UID0..3, BCC, CRC_A]
        const sel = [PICC_CMD_SEL_CL1, 0x70].concat(uidBytes);
        sel.push(bcc);
        const crc = calculateCRC(sel);
        const cmd = sel.concat(crc);
        const r2 = transceiveData(cmd);
        if (!r2.status || r2.back.length < 3) return false;

        // SAK + CRC_A
        sak = r2.back[0];
        return true;
    }

    /**
     * Get the last read UID as a space-separated uppercase hex string.
     * Example: "DE AD BE EF"
     * @returns UID string or empty string if no UID is available
     */
    //% block="UID (hex)"
    export function uidHex(): string {
        if (!uidBytes || uidBytes.length === 0) return "";
        let s = "";
        for (let i = 0; i < uidBytes.length; i++) {
            const v = uidBytes[i] & 0xFF;
            const h = hexByte(v);
            s += h;
            if (i < uidBytes.length - 1) s += " ";
        }
        return s;
    }

    /**
     * Get a human-readable card type name from the last read SAK.
     * Limited mapping: Mini, 1K, 4K, Ultralight; otherwise "Unknown".
     * @returns card type name string
     */
    //% block="type name"
    export function typeName(): string {
        const t = piccTypeFromSAK(sak);
        switch (t) {
            case 0x01: return "MIFARE Ultralight";
            case 0x08: return "MIFARE 1K";
            case 0x18: return "MIFARE 4K";
            case 0x09: return "MIFARE Mini";
            default: return "Unknown";
        }
    }

    function piccTypeFromSAK(s: number): number {
        // Minimal mapping based on common SAK values
        switch (s) {
            case 0x09: return 0x09; // Mini
            case 0x08: return 0x08; // 1K
            case 0x18: return 0x18; // 4K
            case 0x00: return 0x00; // Unknown
            case 0x01: return 0x01; // Ultralight
            default: return 0x00;
        }
    }
}
