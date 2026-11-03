const fs = require('fs');
const sharp = require('sharp');
const { AnalysisNotApplicableError, ImageDecodeError } = require('./errors');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// PNG IHDR color types
const PNG_GRAY = 0;
const PNG_RGB = 2;
const PNG_PALETTE = 3;
const PNG_GRAY_ALPHA = 4;
const PNG_RGBA = 6;

const BMP_BI_RGB = 0;
const BMP_BI_BITFIELDS = 3;

class PixelReader {
  /**
   * Reads the raw pixel samples of an already validated PNG or BMP image.
   *
   * Output layout (identical for both formats so the analyzer does not care about the source):
   * - Rows top to bottom, pixels left to right.
   * - Interleaved color channels only: RGB (3 channels) or gray (1 channel).
   * - The alpha channel is discarded. Samples are the original 8-bit values, unmodified.
   *
   * @param {string} filePath - Internal storage path of the image.
   * @param {string} mimeType - Real MIME type detected by Persona 1 ('image/png' | 'image/bmp').
   * @returns {Promise<{ format: string, width: number, height: number, channels: number, data: Buffer }>}
   * @throws {AnalysisNotApplicableError} Valid image that LSB analysis cannot cover reliably.
   * @throws {ImageDecodeError} Image whose pixels cannot be decoded.
   */
  async readPixels(filePath, mimeType) {
    const fileBuffer = await fs.promises.readFile(filePath);

    if (mimeType === 'image/png') {
      return this.readPng(fileBuffer);
    }
    if (mimeType === 'image/bmp') {
      return this.readBmp(fileBuffer);
    }

    throw new AnalysisNotApplicableError(
      `Unsupported image type for LSB analysis: ${mimeType}`,
      'UNSUPPORTED_FORMAT'
    );
  }

  /**
   * Decodes a PNG. Only 8-bit grayscale / RGB (with or without alpha) is analyzable:
   * palette images and sub-8-bit or 16-bit depths do not expose the original LSB plane
   * once decoded, so they are reported as not applicable instead of producing a misleading verdict.
   * @param {Buffer} buffer
   */
  async readPng(buffer) {
    // 8-byte signature + IHDR chunk (length, type, 13 bytes of data)
    if (
      buffer.length < 33 ||
      !buffer.subarray(0, 8).equals(PNG_SIGNATURE) ||
      buffer.toString('ascii', 12, 16) !== 'IHDR'
    ) {
      throw new ImageDecodeError('PNG header is missing or malformed');
    }

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    const bitDepth = buffer[24];
    const colorType = buffer[25];

    if (colorType === PNG_PALETTE) {
      throw new AnalysisNotApplicableError(
        'Palette (indexed) PNG images are not analyzed: the LSB of a palette index is not the LSB of a color',
        'PALETTE_IMAGE'
      );
    }
    if (![PNG_GRAY, PNG_RGB, PNG_GRAY_ALPHA, PNG_RGBA].includes(colorType)) {
      throw new ImageDecodeError(`Unknown PNG color type: ${colorType}`);
    }
    if (bitDepth !== 8) {
      throw new AnalysisNotApplicableError(
        `PNG bit depth ${bitDepth} is not analyzed: decoding would alter the original LSB plane`,
        'UNSUPPORTED_BIT_DEPTH'
      );
    }

    const hasAlpha = colorType === PNG_GRAY_ALPHA || colorType === PNG_RGBA;
    const expectedChannels = colorType === PNG_GRAY || colorType === PNG_GRAY_ALPHA ? 1 : 3;

    let decoded;
    try {
      let pipeline = sharp(buffer);
      if (hasAlpha) {
        pipeline = pipeline.removeAlpha();
      }
      if (expectedChannels === 1) {
        // Without this, sharp expands grayscale to 3 identical channels.
        pipeline = pipeline.toColourspace('b-w');
      }
      decoded = await pipeline.raw().toBuffer({ resolveWithObject: true });
    } catch (err) {
      throw new ImageDecodeError('PNG pixel data could not be decoded');
    }

    const { data, info } = decoded;
    if (
      info.width !== width ||
      info.height !== height ||
      info.channels !== expectedChannels ||
      data.length !== width * height * expectedChannels
    ) {
      throw new ImageDecodeError('Decoded PNG does not match its declared dimensions');
    }

    return { format: 'png', width, height, channels: expectedChannels, data };
  }

  /**
   * Decodes an uncompressed 24-bit or 32-bit BMP (BGR(A) order, 4-byte aligned rows).
   * Palette BMPs (1/4/8 bit), 16-bit and RLE-compressed BMPs are reported as not applicable.
   * @param {Buffer} buffer
   */
  readBmp(buffer) {
    if (buffer.length < 54 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
      throw new ImageDecodeError('BMP header is missing or truncated');
    }

    const dataOffset = buffer.readUInt32LE(10);
    const dibHeaderSize = buffer.readUInt32LE(14);
    const width = buffer.readInt32LE(18);
    const signedHeight = buffer.readInt32LE(22);
    const bitsPerPixel = buffer.readUInt16LE(28);
    const compression = buffer.readUInt32LE(30);

    if (dibHeaderSize < 40 || width <= 0 || signedHeight === 0) {
      throw new ImageDecodeError('BMP DIB header is invalid');
    }

    const height = Math.abs(signedHeight);
    const topDown = signedHeight < 0;

    if (bitsPerPixel <= 8) {
      throw new AnalysisNotApplicableError(
        `BMP with ${bitsPerPixel} bits per pixel uses a color palette and is not analyzed`,
        'PALETTE_IMAGE'
      );
    }
    if (bitsPerPixel !== 24 && bitsPerPixel !== 32) {
      throw new AnalysisNotApplicableError(
        `BMP bit depth ${bitsPerPixel} is not analyzed`,
        'UNSUPPORTED_BIT_DEPTH'
      );
    }
    if (!this.hasSupportedBmpLayout(buffer, bitsPerPixel, compression)) {
      throw new AnalysisNotApplicableError(
        'BMP compression or channel masks are not supported by the LSB analyzer',
        'UNSUPPORTED_COMPRESSION'
      );
    }

    const bytesPerPixel = bitsPerPixel / 8;
    const rowStride = Math.floor((bitsPerPixel * width + 31) / 32) * 4;

    // The declared dimensions must fit in the file before allocating the output buffer.
    if (dataOffset < 14 + dibHeaderSize || dataOffset + rowStride * height > buffer.length) {
      throw new ImageDecodeError('BMP pixel data is truncated or inconsistent with its header');
    }

    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      const sourceRow = topDown ? y : height - 1 - y;
      let src = dataOffset + sourceRow * rowStride;
      let dst = y * width * 3;
      for (let x = 0; x < width; x++) {
        data[dst] = buffer[src + 2]; // R
        data[dst + 1] = buffer[src + 1]; // G
        data[dst + 2] = buffer[src]; // B
        src += bytesPerPixel;
        dst += 3;
      }
    }

    return { format: 'bmp', width, height, channels: 3, data };
  }

  /**
   * 24-bit BMP must be BI_RGB. 32-bit may be BI_RGB or BI_BITFIELDS with the standard
   * BGRA masks (the only layout where byte order is B, G, R, X).
   */
  hasSupportedBmpLayout(buffer, bitsPerPixel, compression) {
    if (compression === BMP_BI_RGB) {
      return true;
    }
    if (compression === BMP_BI_BITFIELDS && bitsPerPixel === 32 && buffer.length >= 66) {
      // Masks start at offset 54 for BITMAPINFOHEADER (40 bytes) and for V4/V5 headers alike.
      return (
        buffer.readUInt32LE(54) === 0x00ff0000 &&
        buffer.readUInt32LE(58) === 0x0000ff00 &&
        buffer.readUInt32LE(62) === 0x000000ff
      );
    }
    return false;
  }
}

module.exports = new PixelReader();
module.exports.PixelReader = PixelReader;
