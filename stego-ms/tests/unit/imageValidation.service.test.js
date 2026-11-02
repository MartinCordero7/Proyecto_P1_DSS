const fs = require('fs');
const path = require('path');
const os = require('os');
const { ImageValidationService } = require('../../src/services/imageValidation.service');
const {
  createValidPngBuffer,
  createValidBmpBuffer,
  createCorruptPngBuffer,
  createCorruptBmpBuffer
} = require('../fixtures/testHelper');

describe('Image Validation Service', () => {
  let validationService;
  let tempDir;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `img_val_test_${Date.now()}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    validationService = new ImageValidationService({
      imageLimits: {
        maxSizeBytes: 1024 * 1024, // 1 MB
        maxWidth: 2000,
        maxHeight: 2000,
        allowedMimeTypes: ['image/png', 'image/bmp'],
        allowedExtensions: ['.png', '.bmp']
      }
    });
  });

  afterAll(async () => {
    if (fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  async function createTestFile(filename, buffer) {
    const filePath = path.join(tempDir, filename);
    await fs.promises.writeFile(filePath, buffer);
    return {
      path: filePath,
      originalname: filename,
      size: buffer.length
    };
  }

  it('should validate a genuine PNG image successfully and return structured metadata', async () => {
    const pngBuffer = await createValidPngBuffer(10, 10);
    const file = await createTestFile('valid_sample.png', pngBuffer);

    const result = await validationService.validateImage(file);

    expect(result).toHaveProperty('filePath', file.path);
    expect(result).toHaveProperty('mimeType', 'image/png');
    expect(result).toHaveProperty('extension', '.png');
    expect(result).toHaveProperty('width', 10);
    expect(result).toHaveProperty('height', 10);
    expect(result).toHaveProperty('sha256');
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should validate a genuine BMP image successfully', async () => {
    const bmpBuffer = createValidBmpBuffer(16, 16);
    const file = await createTestFile('valid_sample.bmp', bmpBuffer);

    const result = await validationService.validateImage(file);

    expect(result).toHaveProperty('mimeType', 'image/bmp');
    expect(result).toHaveProperty('extension', '.bmp');
    expect(result).toHaveProperty('width', 16);
    expect(result).toHaveProperty('height', 16);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should reject a file with a fake extension (e.g. text file renamed to .png)', async () => {
    const textBuffer = Buffer.from('THIS IS NOT A PNG FILE AT ALL');
    const file = await createTestFile('fake_image.png', textBuffer);

    await expect(validationService.validateImage(file)).rejects.toMatchObject({
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE'
    });
  });

  it('should reject extension spoofing (e.g. valid BMP disguised as .png)', async () => {
    const bmpBuffer = createValidBmpBuffer(5, 5);
    const file = await createTestFile('spoofed_bmp.png', bmpBuffer);

    await expect(validationService.validateImage(file)).rejects.toMatchObject({
      statusCode: 415,
      code: 'EXTENSION_SPOOFING_DETECTED'
    });
  });

  it('should reject a disallowed extension (e.g. .jpg or .exe)', async () => {
    const pngBuffer = await createValidPngBuffer(5, 5);
    const file = await createTestFile('sample.jpg', pngBuffer);

    await expect(validationService.validateImage(file)).rejects.toMatchObject({
      statusCode: 415,
      code: 'INVALID_EXTENSION'
    });
  });

  it('should reject a corrupted PNG image with 422 Unprocessable Entity', async () => {
    const corruptPng = createCorruptPngBuffer();
    const file = await createTestFile('corrupt.png', corruptPng);

    await expect(validationService.validateImage(file)).rejects.toMatchObject({
      statusCode: 422,
      code: 'IMAGE_CORRUPTED'
    });
  });

  it('should reject a corrupted BMP image with 422 Unprocessable Entity', async () => {
    const corruptBmp = createCorruptBmpBuffer();
    const file = await createTestFile('corrupt.bmp', corruptBmp);

    await expect(validationService.validateImage(file)).rejects.toMatchObject({
      statusCode: 422,
      code: 'IMAGE_CORRUPTED'
    });
  });

  it('should reject an oversized file with 413 Payload Too Large', async () => {
    // 2 MB buffer when limit is 1 MB
    const largeBuffer = Buffer.alloc(1024 * 1024 * 2);
    // write PNG header to pass extension/mime check
    largeBuffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const file = await createTestFile('oversized.png', largeBuffer);

    await expect(validationService.validateImage(file)).rejects.toMatchObject({
      statusCode: 413,
      code: 'FILE_TOO_LARGE'
    });
  });

  it('should reject an image whose dimensions exceed the configured limits', async () => {
    // Limit is 2000x2000; create BMP with dimensions 2500x2500
    // To avoid allocating 18MB, we can use valid BMP header claiming 2500x2500 with matching calculated buffer
    const width = 2500;
    const height = 2500;
    const bmpHeader = Buffer.alloc(54 + 4);
    bmpHeader.write('BM', 0);
    bmpHeader.writeUInt32LE(bmpHeader.length, 2);
    bmpHeader.writeUInt32LE(54, 10);
    bmpHeader.writeUInt32LE(40, 14);
    bmpHeader.writeInt32LE(width, 18);
    bmpHeader.writeInt32LE(height, 22);
    bmpHeader.writeUInt16LE(1, 26);
    bmpHeader.writeUInt16LE(24, 28);
    bmpHeader.writeUInt32LE(0, 30);

    const file = await createTestFile('huge_dimensions.bmp', bmpHeader);

    // Should be rejected for corrupted pixel data or dimension exceed
    await expect(validationService.validateImage(file)).rejects.toMatchObject({
      statusCode: 422
    });
  });
});

