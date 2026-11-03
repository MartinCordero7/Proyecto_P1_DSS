const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const pixelReader = require('../../src/engine/pixelReader');
const { AnalysisNotApplicableError, ImageDecodeError } = require('../../src/engine/errors');
const { createCorruptPngBuffer } = require('../fixtures/testHelper');

// Deterministic pseudo-random bytes so failures are reproducible.
function pseudoRandomBytes(length, seed = 12345) {
  const out = Buffer.alloc(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

/**
 * Builds a BMP file from top-down RGB pixels.
 * @param {Object} opts
 * @param {Buffer} opts.rgb - width*height*3 bytes, rows top to bottom.
 * @param {number} [opts.bpp] - 24 or 32 (other values only produce the header and padding).
 * @param {boolean} [opts.topDown] - Store rows top-down (negative height) instead of bottom-up.
 * @param {number} [opts.compression]
 */
function buildBmp({ rgb, width, height, bpp = 24, topDown = false, compression = 0 }) {
  const bytesPerPixel = Math.max(bpp / 8, 1);
  const rowStride = Math.floor((bpp * width + 31) / 32) * 4;
  const buf = Buffer.alloc(54 + rowStride * height);

  buf.write('BM', 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(topDown ? -height : height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(bpp, 28);
  buf.writeUInt32LE(compression, 30);
  buf.writeUInt32LE(rowStride * height, 34);

  if (bpp === 24 || bpp === 32) {
    for (let y = 0; y < height; y++) {
      const fileRow = topDown ? y : height - 1 - y;
      for (let x = 0; x < width; x++) {
        const s = (y * width + x) * 3;
        const d = 54 + fileRow * rowStride + x * bytesPerPixel;
        buf[d] = rgb[s + 2];
        buf[d + 1] = rgb[s + 1];
        buf[d + 2] = rgb[s];
        if (bpp === 32) buf[d + 3] = 0;
      }
    }
  }
  return buf;
}

describe('PixelReader', () => {
  let tempDir;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `pixel_reader_test_${Date.now()}`);
    await fs.promises.mkdir(tempDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  async function writeTemp(name, buffer) {
    const filePath = path.join(tempDir, name);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  describe('PNG', () => {
    it('reads an 8-bit RGB PNG with the exact original sample values', async () => {
      const width = 17;
      const height = 9;
      const rgb = pseudoRandomBytes(width * height * 3);
      const png = await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer();

      const result = await pixelReader.readPixels(await writeTemp('rgb.png', png), 'image/png');

      expect(result).toMatchObject({ format: 'png', width, height, channels: 3 });
      expect(result.data.equals(rgb)).toBe(true);
    });

    it('discards the alpha channel without altering RGB values (even under transparent pixels)', async () => {
      const width = 8;
      const height = 8;
      const rgba = pseudoRandomBytes(width * height * 4, 777);
      for (let i = 0; i < width * height; i++) {
        rgba[i * 4 + 3] = i % 3 === 0 ? 0 : i % 3 === 1 ? 128 : 255;
      }
      const expectedRgb = Buffer.alloc(width * height * 3);
      for (let i = 0; i < width * height; i++) {
        rgba.copy(expectedRgb, i * 3, i * 4, i * 4 + 3);
      }
      const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();

      const result = await pixelReader.readPixels(await writeTemp('rgba.png', png), 'image/png');

      expect(result.channels).toBe(3);
      expect(result.data.equals(expectedRgb)).toBe(true);
    });

    it('reads a grayscale PNG as a single channel', async () => {
      const width = 12;
      const height = 5;
      const gray = pseudoRandomBytes(width * height, 99);
      const png = await sharp(gray, { raw: { width, height, channels: 1 } })
        .toColourspace('b-w')
        .png()
        .toBuffer();
      expect(png[25]).toBe(0); // fixture sanity: IHDR color type 0 = grayscale

      const result = await pixelReader.readPixels(await writeTemp('gray.png', png), 'image/png');

      expect(result.channels).toBe(1);
      expect(result.data.equals(gray)).toBe(true);
    });

    it('reads a grayscale+alpha PNG as a single channel without the alpha', async () => {
      const width = 10;
      const height = 6;
      const gray = pseudoRandomBytes(width * height, 31);
      const grayAlpha = Buffer.alloc(width * height * 2);
      for (let i = 0; i < width * height; i++) {
        grayAlpha[i * 2] = gray[i];
        grayAlpha[i * 2 + 1] = i % 2 === 0 ? 0 : 200;
      }
      const png = await sharp(grayAlpha, { raw: { width, height, channels: 2 } })
        .toColourspace('b-w')
        .png()
        .toBuffer();
      expect(png[25]).toBe(4); // fixture sanity: IHDR color type 4 = gray + alpha

      const result = await pixelReader.readPixels(await writeTemp('grayalpha.png', png), 'image/png');

      expect(result.channels).toBe(1);
      expect(result.data.equals(gray)).toBe(true);
    });

    it('reports a 16-bit PNG as not applicable', async () => {
      const width = 4;
      const height = 4;
      const png = await sharp(pseudoRandomBytes(width * height * 3), {
        raw: { width, height, channels: 3 }
      })
        .toColourspace('rgb16')
        .png()
        .toBuffer();
      expect(png[24]).toBe(16); // fixture sanity: IHDR bit depth 16

      await expect(
        pixelReader.readPixels(await writeTemp('16bit.png', png), 'image/png')
      ).rejects.toMatchObject({ name: 'AnalysisNotApplicableError', code: 'UNSUPPORTED_BIT_DEPTH' });
    });

    it('reports a palette PNG as not applicable', async () => {
      const png = await sharp(pseudoRandomBytes(16 * 16 * 3), { raw: { width: 16, height: 16, channels: 3 } })
        .png({ palette: true, colours: 16 })
        .toBuffer();

      await expect(
        pixelReader.readPixels(await writeTemp('palette.png', png), 'image/png')
      ).rejects.toMatchObject({ name: 'AnalysisNotApplicableError', code: 'PALETTE_IMAGE' });
    });

    it('fails with a decode error for a corrupted PNG', async () => {
      await expect(
        pixelReader.readPixels(await writeTemp('corrupt.png', createCorruptPngBuffer()), 'image/png')
      ).rejects.toBeInstanceOf(ImageDecodeError);
    });

    it('fails with a decode error for a PNG truncated in its pixel data', async () => {
      const rgb = pseudoRandomBytes(64 * 64 * 3, 5);
      const png = await sharp(rgb, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
      const truncated = png.subarray(0, Math.floor(png.length / 2));

      await expect(
        pixelReader.readPixels(await writeTemp('truncated.png', truncated), 'image/png')
      ).rejects.toBeInstanceOf(ImageDecodeError);
    });
  });

  describe('BMP', () => {
    it('reads a bottom-up 24-bit BMP in top-down RGB order (width with row padding)', async () => {
      const width = 5; // 15 bytes per row -> 1 byte of padding
      const height = 4;
      const rgb = pseudoRandomBytes(width * height * 3, 42);
      const bmp = buildBmp({ rgb, width, height });

      const result = await pixelReader.readPixels(await writeTemp('bottomup.bmp', bmp), 'image/bmp');

      expect(result).toMatchObject({ format: 'bmp', width, height, channels: 3 });
      expect(result.data.equals(rgb)).toBe(true);
    });

    it('reads a top-down 24-bit BMP (negative height)', async () => {
      const width = 7;
      const height = 3;
      const rgb = pseudoRandomBytes(width * height * 3, 1);
      const bmp = buildBmp({ rgb, width, height, topDown: true });

      const result = await pixelReader.readPixels(await writeTemp('topdown.bmp', bmp), 'image/bmp');

      expect(result.data.equals(rgb)).toBe(true);
    });

    it('reads a 32-bit BMP ignoring the fourth byte', async () => {
      const width = 6;
      const height = 6;
      const rgb = pseudoRandomBytes(width * height * 3, 8);
      const bmp = buildBmp({ rgb, width, height, bpp: 32 });

      const result = await pixelReader.readPixels(await writeTemp('32bit.bmp', bmp), 'image/bmp');

      expect(result.channels).toBe(3);
      expect(result.data.equals(rgb)).toBe(true);
    });

    it('produces the same layout for the same image stored as PNG and BMP', async () => {
      const width = 9;
      const height = 7;
      const rgb = pseudoRandomBytes(width * height * 3, 2024);
      const png = await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer();
      const bmp = buildBmp({ rgb, width, height });

      const fromPng = await pixelReader.readPixels(await writeTemp('same.png', png), 'image/png');
      const fromBmp = await pixelReader.readPixels(await writeTemp('same.bmp', bmp), 'image/bmp');

      expect(fromBmp.data.equals(fromPng.data)).toBe(true);
    });

    it('reports palette BMPs (8 bit) as not applicable', async () => {
      const bmp = buildBmp({ rgb: Buffer.alloc(0), width: 4, height: 4, bpp: 8 });

      await expect(
        pixelReader.readPixels(await writeTemp('8bit.bmp', bmp), 'image/bmp')
      ).rejects.toMatchObject({ name: 'AnalysisNotApplicableError', code: 'PALETTE_IMAGE' });
    });

    it('reports 16-bit BMPs as not applicable', async () => {
      const bmp = buildBmp({ rgb: Buffer.alloc(0), width: 4, height: 4, bpp: 16 });

      await expect(
        pixelReader.readPixels(await writeTemp('16bit.bmp', bmp), 'image/bmp')
      ).rejects.toMatchObject({ name: 'AnalysisNotApplicableError', code: 'UNSUPPORTED_BIT_DEPTH' });
    });

    it('reports compressed BMPs as not applicable', async () => {
      const rgb = pseudoRandomBytes(4 * 4 * 3);
      const bmp = buildBmp({ rgb, width: 4, height: 4, compression: 1 });

      await expect(
        pixelReader.readPixels(await writeTemp('rle.bmp', bmp), 'image/bmp')
      ).rejects.toBeInstanceOf(AnalysisNotApplicableError);
    });

    it('fails with a decode error when pixel data is shorter than the header declares', async () => {
      const rgb = pseudoRandomBytes(10 * 10 * 3);
      const bmp = buildBmp({ rgb, width: 10, height: 10 }).subarray(0, 200);

      await expect(
        pixelReader.readPixels(await writeTemp('short.bmp', bmp), 'image/bmp')
      ).rejects.toBeInstanceOf(ImageDecodeError);
    });

    it('does not allocate memory from a header that declares huge dimensions', async () => {
      const bmp = buildBmp({ rgb: pseudoRandomBytes(4 * 4 * 3), width: 4, height: 4 });
      bmp.writeInt32LE(100000, 18);
      bmp.writeInt32LE(100000, 22);

      await expect(
        pixelReader.readPixels(await writeTemp('huge.bmp', bmp), 'image/bmp')
      ).rejects.toBeInstanceOf(ImageDecodeError);
    });
  });

  it('rejects unsupported MIME types as not applicable', async () => {
    await expect(
      pixelReader.readPixels(await writeTemp('x.bin', Buffer.from('abc')), 'image/gif')
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
  });
});
