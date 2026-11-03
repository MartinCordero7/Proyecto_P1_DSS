/**
 * Writes an uncompressed 24-bit BMP (bottom-up rows, BGR order, 4-byte aligned rows).
 * Used only by the sample generator.
 * @param {{ width: number, height: number, channels: number, data: Buffer }} pixels RGB, rows top to bottom.
 * @returns {Buffer}
 */
function encodeBmp24(pixels) {
  if (pixels.channels !== 3) {
    throw new Error('encodeBmp24 expects 3-channel RGB pixels');
  }

  const { width, height, data } = pixels;
  const rowStride = Math.floor((24 * width + 31) / 32) * 4;
  const buffer = Buffer.alloc(54 + rowStride * height);

  buffer.write('BM', 0);
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(rowStride * height, 34);

  for (let y = 0; y < height; y++) {
    const fileRow = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 3;
      const dst = 54 + fileRow * rowStride + x * 3;
      buffer[dst] = data[src + 2];
      buffer[dst + 1] = data[src + 1];
      buffer[dst + 2] = data[src];
    }
  }

  return buffer;
}

module.exports = { encodeBmp24 };
