const crypto = require('crypto');
const fs = require('fs');

/**
 * Calculates the SHA-256 hash of a file on disk using streaming to avoid memory overhead.
 * @param {string} filePath - Absolute or relative path to the file.
 * @returns {Promise<string>} Hexadecimal SHA-256 hash.
 */
function calculateFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
    stream.on('error', err => reject(err));
  });
}

/**
 * Calculates the SHA-256 hash from a Buffer.
 * @param {Buffer} buffer - Buffer to hash.
 * @returns {string} Hexadecimal SHA-256 hash.
 */
function calculateBufferSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
}

module.exports = {
  calculateFileSha256,
  calculateBufferSha256
};

