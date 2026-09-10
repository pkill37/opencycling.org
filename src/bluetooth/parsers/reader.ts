export class PacketReader {
  offset = 0;
  constructor(private data: DataView) {}
  skip(n: number) {
    if (this.offset + n > this.data.byteLength)
      throw new Error(
        "Truncated Bluetooth packet. Waiting for a valid notification.",
      );
    this.offset += n;
  }
  u8() {
    this.skip(1);
    return this.data.getUint8(this.offset - 1);
  }
  u16() {
    this.skip(2);
    return this.data.getUint16(this.offset - 2, true);
  }
  i16() {
    this.skip(2);
    return this.data.getInt16(this.offset - 2, true);
  }
}
