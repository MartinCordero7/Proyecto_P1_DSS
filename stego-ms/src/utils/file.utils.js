const path = require('path');
const fs = require('fs');

/**
 * Sanitizes an original filename to prevent path traversal or special character injection in logs.
 * @param {string} originalName - Original filename from client.
 * @returns {string} Sanitized base filename.
 */
function sanitizeFilename(originalName) {
  if (!originalName || typeof originalName !== 'string') {
    return 'unnamed_file';
  }
  // Strip paths, null bytes, and keep only safe characters
  const base = path.basename(originalName).replace(/\0/g, '');
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Checks magic bytes in binary buffer as defense-in-depth.
 * @param {Buffer} buffer - Buffer slice of at least 8 bytes.
 * @returns {{ ext: string, mime: string } | null}
 */
function checkMagicBytes(buffer) {
  if (!buffer || buffer.length < 2) {
    return null;
  }

  // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }

  // BMP magic number: 42 4D ('BM')
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return { ext: 'bmp', mime: 'image/bmp' };
  }

  return null;
}

/**
 * Safely unlinks a file if it exists, without throwing if it was already deleted.
 * @param {string} filePath - Path to file to delete.
 * @returns {Promise<boolean>} True if file was deleted, false if did not exist.
 */
async function safeUnlink(filePath) {
  if (!filePath) return false;
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

module.exports = {
  sanitizeFilename,
  checkMagicBytes,
  safeUnlink
};

