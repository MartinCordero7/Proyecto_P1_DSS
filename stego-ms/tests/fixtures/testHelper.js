const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../../src/config');

// Load test RSA keys
const privateKeyPath = path.resolve(__dirname, 'keys/test_private_key.pem');
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
const publicKeyPath = path.resolve(__dirname, 'keys/test_public_key.pem');
const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

/**
 * Generates a valid test JWT signed with RS256.
 */
function createValidTestToken(payload = {}) {
  const defaultPayload = {
    sub: 'user-uuid-1234-5678',
    username: 'analyst_user',
    roles: ['ANALYST'],
    iss: config.jwt.issuer,
    aud: config.jwt.audience
  };
  return jwt.sign({ ...defaultPayload, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '1h'
  });
}

/**
 * Generates an expired test JWT.
 */
function createExpiredTestToken() {
  const payload = {
    sub: 'user-uuid-1234-5678',
    username: 'analyst_user',
    iss: config.jwt.issuer,
    aud: config.jwt.audience
  };
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: -10 // expired 10 seconds ago
  });
}

/**
 * Generates a minimal 1x1 valid PNG image buffer.
 */
async function createValidPngBuffer(width = 1, height = 1) {
  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 255, b: 0 }
    }
  }).png().toBuffer();
}

/**
 * Generates a minimal valid BMP image buffer.
 */
function createValidBmpBuffer(width = 1, height = 1) {
  // Row stride with 4-byte alignment for 24-bit RGB
  const rowStride = Math.floor((24 * width + 31) / 32) * 4;
  const pixelDataSize = rowStride * height;
  const fileSize = 54 + pixelDataSize;

  const buf = Buffer.alloc(fileSize);
  // 'BM' signature
  buf.write('BM', 0);
  // File size
  buf.writeUInt32LE(fileSize, 2);
  // Pixel data offset
  buf.writeUInt32LE(54, 10);
  // DIB Header size (BITMAPINFOHEADER = 40)
  buf.writeUInt32LE(40, 14);
  // Width & Height
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  // Planes
  buf.writeUInt16LE(1, 26);
  // Bits per pixel
  buf.writeUInt16LE(24, 28);
  // Compression: 0 (BI_RGB)
  buf.writeUInt32LE(0, 30);
  // Image size
  buf.writeUInt32LE(pixelDataSize, 34);

  // Fill with dummy pixels
  for (let i = 54; i < fileSize; i++) {
    buf[i] = 128;
  }

  return buf;
}

/**
 * Generates a corrupted PNG buffer (valid magic bytes but truncated/malformed body).
 */
function createCorruptPngBuffer() {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const garbage = Buffer.from('NOT_A_VALID_IHDR_OR_PNG_BODY_COMPLETELY_CORRUPTED');
  return Buffer.concat([pngHeader, garbage]);
}

/**
 * Generates a corrupted BMP buffer.
 */
function createCorruptBmpBuffer() {
  const bmpHeader = Buffer.from([0x42, 0x4d, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  return bmpHeader; // Truncated header (< 54 bytes)
}

module.exports = {
  privateKey,
  publicKey,
  createValidTestToken,
  createExpiredTestToken,
  createValidPngBuffer,
  createValidBmpBuffer,
  createCorruptPngBuffer,
  createCorruptBmpBuffer
};

