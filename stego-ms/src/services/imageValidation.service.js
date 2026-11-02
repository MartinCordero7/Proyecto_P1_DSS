const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const FileType = require('file-type');
const config = require('../config');
const { calculateFileSha256 } = require('../utils/hash.utils');
const { checkMagicBytes, sanitizeFilename } = require('../utils/file.utils');
const {
  BadRequestError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  UnprocessableEntityError
} = require('../utils/errors');

class ImageValidationService {
  constructor(customConfig = null) {
    this.limits = (customConfig && customConfig.imageLimits) || config.imageLimits;
  }

  /**
   * Validates a BMP binary buffer header and structure.
   * @param {Buffer} buffer - Binary content of BMP file.
   * @returns {{ width: number, height: number, channels: number }}
   */
  validateBmpStructure(buffer) {
    if (!buffer || buffer.length < 54) {
      throw new UnprocessableEntityError(
        'BMP file is too small or header is truncated',
        'IMAGE_CORRUPTED'
      );
    }

    if (buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
      throw new UnsupportedMediaTypeError(
        'Invalid BMP signature',
        'INVALID_BINARY_SIGNATURE'
      );
    }

    const dataOffset = buffer.readUInt32LE(10);
    const dibHeaderSize = buffer.readUInt32LE(14);

    if (dibHeaderSize < 40) {
      throw new UnprocessableEntityError(
        'Unsupported or corrupt BMP DIB header',
        'IMAGE_CORRUPTED'
      );
    }

    const width = buffer.readInt32LE(18);
    const height = Math.abs(buffer.readInt32LE(22));
    const planes = buffer.readUInt16LE(26);
    const bpp = buffer.readUInt16LE(28);

    if (planes !== 1) {
      throw new UnprocessableEntityError('Invalid BMP planes', 'IMAGE_CORRUPTED');
    }

    if (width <= 0 || height <= 0) {
      throw new UnprocessableEntityError(
        'Invalid BMP dimensions in header',
        'IMAGE_CORRUPTED'
      );
    }

    if (![1, 4, 8, 16, 24, 32].includes(bpp)) {
      throw new UnsupportedMediaTypeError(
        `Unsupported BMP bit depth: ${bpp}`,
        'UNSUPPORTED_BIT_DEPTH'
      );
    }

    // Calculate minimum required row size with 4-byte padding alignment
    const rowStride = Math.floor((bpp * width + 31) / 32) * 4;
    const minPixelDataSize = rowStride * height;

    if (buffer.length < dataOffset + minPixelDataSize) {
      throw new UnprocessableEntityError(
        'BMP pixel data is truncated or corrupt',
        'IMAGE_CORRUPTED'
      );
    }

    const channels = bpp >= 24 ? (bpp === 32 ? 4 : 3) : 1;
    return { width, height, channels };
  }

  /**
   * Validates an uploaded image comprehensively:
   * - File presence & size
   * - Client extension
   * - Magic bytes / real MIME (FileType + raw header verification)
   * - Extension spoofing & MIME tampering detection
   * - Image decoding & corruption checks (Sharp for PNG, strict parser for BMP)
   * - Maximum dimension limits
   * - SHA-256 integrity digest over original raw bytes
   *
   * @param {Object} file - Multer file object ({ path, originalname, size, mimetype })
   * @returns {Promise<Object>} Structured validated metadata ready for analysis engine
   */
  async validateImage(file) {
    if (!file || !file.path) {
      throw new BadRequestError('No image file was provided in the request', 'FILE_REQUIRED');
    }

    // 1. Check physical existence and file size
    let stats;
    try {
      stats = await fs.promises.stat(file.path);
    } catch (err) {
      throw new BadRequestError('Uploaded file could not be accessed on disk', 'FILE_NOT_FOUND');
    }

    if (stats.size === 0) {
      throw new UnprocessableEntityError('The uploaded file is empty (0 bytes)', 'FILE_EMPTY');
    }

    if (stats.size > this.limits.maxSizeBytes) {
      throw new PayloadTooLargeError(
        `File size (${stats.size} bytes) exceeds maximum limit of ${this.limits.maxSizeBytes} bytes`,
        'FILE_TOO_LARGE'
      );
    }

    // 2. Extension check from original client filename
    const clientExt = path.extname(file.originalname || '').toLowerCase();
    if (!this.limits.allowedExtensions.includes(clientExt)) {
      throw new UnsupportedMediaTypeError(
        `Invalid file extension '${clientExt}'. Allowed extensions: ${this.limits.allowedExtensions.join(', ')}`,
        'INVALID_EXTENSION'
      );
    }

    // 3. Binary signature (Magic bytes) & real MIME detection
    const bufferSlice = Buffer.alloc(Math.min(stats.size, 64 * 1024));
    const fd = await fs.promises.open(file.path, 'r');
    try {
      await fd.read(bufferSlice, 0, bufferSlice.length, 0);
    } finally {
      await fd.close();
    }

    // File-type library check
    const detectedType = await FileType.fromBuffer(bufferSlice);
    // Defense-in-depth raw header magic bytes check
    const rawMagic = checkMagicBytes(bufferSlice);

    const detectedMime = (detectedType && detectedType.mime) || (rawMagic && rawMagic.mime);
    const detectedExt = (detectedType && `.${detectedType.ext}`) || (rawMagic && `.${rawMagic.ext}`);

    if (!detectedMime || !this.limits.allowedMimeTypes.includes(detectedMime.toLowerCase())) {
      throw new UnsupportedMediaTypeError(
        'File binary signature does not correspond to an allowed image format (only PNG and BMP are accepted)',
        'UNSUPPORTED_MEDIA_TYPE'
      );
    }

    // 4. Extension and MIME spoofing detection
    // Client extension must match the real binary format detected
    if (clientExt !== detectedExt.toLowerCase()) {
      throw new UnsupportedMediaTypeError(
        `Extension spoofing detected: file claims extension '${clientExt}' but real format is '${detectedExt}'`,
        'EXTENSION_SPOOFING_DETECTED'
      );
    }

    // 5. Deep structural decoding and dimensions verification
    let dimensions = { width: 0, height: 0, channels: 3 };

    if (detectedMime === 'image/png') {
      try {
        const metadata = await sharp(file.path, { failOnError: true }).metadata();
        if (!metadata || !metadata.width || !metadata.height) {
          throw new Error('Missing image metadata from decoder');
        }
        dimensions = {
          width: metadata.width,
          height: metadata.height,
          channels: metadata.channels || 3
        };
      } catch (sharpErr) {
        throw new UnprocessableEntityError(
          'Image file is corrupted or could not be decoded',
          'IMAGE_CORRUPTED'
        );
      }
    } else if (detectedMime === 'image/bmp') {
      // Validate complete BMP binary structure
      const fullBuffer = await fs.promises.readFile(file.path);
      dimensions = this.validateBmpStructure(fullBuffer);
    }

    // Dimension bounds check
    if (
      dimensions.width > this.limits.maxWidth ||
      dimensions.height > this.limits.maxHeight
    ) {
      throw new UnprocessableEntityError(
        `Image dimensions (${dimensions.width}x${dimensions.height}) exceed maximum allowed (${this.limits.maxWidth}x${this.limits.maxHeight})`,
        'DIMENSIONS_EXCEEDED'
      );
    }

    // 6. Cryptographic SHA-256 calculation over raw original bytes
    const sha256 = await calculateFileSha256(file.path);

    // Return structured validated data for Persona 2 analysis engine
    return {
      filePath: file.path,
      internalFilename: path.basename(file.path),
      originalName: sanitizeFilename(file.originalname),
      mimeType: detectedMime,
      extension: detectedExt,
      size: stats.size,
      width: dimensions.width,
      height: dimensions.height,
      channels: dimensions.channels,
      sha256: sha256
    };
  }
}

module.exports = new ImageValidationService();
module.exports.ImageValidationService = ImageValidationService;

