const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { safeUnlink } = require('../utils/file.utils');

class FileStorageService {
  constructor(customConfig = null) {
    this.config = customConfig || config.storage;
    this.tempDir = this.config.tempDir;
    this.quarantineDir = this.config.quarantineDir;
    this.ensureDirectories();
  }

  /**
   * Ensures storage directories exist on disk.
   */
  ensureDirectories() {
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true, mode: 0o700 });
      }
      if (!fs.existsSync(this.quarantineDir)) {
        fs.mkdirSync(this.quarantineDir, { recursive: true, mode: 0o700 });
      }
    } catch (err) {
      console.error('[FileStorageService] Failed to create storage directories:', err.message);
      throw new Error(`Storage initialization failed: ${err.message}`);
    }
  }

  /**
   * Generates a cryptographically random internal filename.
   * Never relies on client-supplied names to prevent path traversal or collision attacks.
   * @param {string} ext - Extension including leading dot, e.g. '.png'.
   * @returns {string} Random filename, e.g. 'f47ac10b-58cc-4372-a567-0e02b2c3d479.png'.
   */
  generateInternalFilename(ext = '') {
    const cleanExt = ext ? (ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`) : '';
    const randomId = crypto.randomUUID();
    return `${randomId}${cleanExt}`;
  }

  /**
   * Resolves the safe path for a file inside temporary or quarantine directories.
   * Prevents directory traversal attacks by validating against base directory.
   * @param {string} filename - Internal filename.
   * @param {'temporary'|'quarantine'} location
   * @returns {string} Absolute file path.
   */
  resolvePath(filename, location = 'temporary') {
    if (!filename || typeof filename !== 'string') {
      throw new Error('Invalid filename specified for path resolution');
    }

    // Sanitize: take only the basename to strictly prevent any path traversal attempt
    const safeName = path.basename(filename);
    const targetDir = location === 'quarantine' ? this.quarantineDir : this.tempDir;
    const resolvedPath = path.resolve(targetDir, safeName);

    // Verify resolved path stays strictly within target directory
    if (!resolvedPath.startsWith(path.resolve(targetDir))) {
      throw new Error('Access denied: directory traversal detected');
    }

    return resolvedPath;
  }

  /**
   * Moves a file from temporary storage to quarantine.
   * @param {string} currentPath - Current path of the file.
   * @param {string} internalFilename - Target internal filename for quarantine.
   * @param {string} [reason] - Optional reason for audit records.
   * @returns {Promise<string>} Destination path in quarantine.
   */
  async moveToQuarantine(currentPath, internalFilename, reason = 'suspicious_payload') {
    if (!currentPath || !fs.existsSync(currentPath)) {
      throw new Error(`Source file does not exist for quarantine: ${currentPath}`);
    }

    const safeName = path.basename(internalFilename || path.basename(currentPath));
    const destPath = path.resolve(this.quarantineDir, safeName);

    try {
      await fs.promises.rename(currentPath, destPath);
      return destPath;
    } catch (err) {
      // In case rename fails across mount points, fallback to copy + unlink
      try {
        await fs.promises.copyFile(currentPath, destPath);
        await safeUnlink(currentPath);
        return destPath;
      } catch (fallbackErr) {
        throw new Error(`Failed to move file to quarantine: ${fallbackErr.message}`);
      }
    }
  }

  /**
   * Safely deletes a file from temporary storage.
   * @param {string} filePath - Absolute or relative path to delete.
   * @returns {Promise<boolean>}
   */
  async cleanupTemporaryFile(filePath) {
    if (!filePath) return false;
    return await safeUnlink(filePath);
  }

  /**
   * Checks if a file exists.
   * @param {string} filePath
   * @returns {boolean}
   */
  fileExists(filePath) {
    if (!filePath) return false;
    return fs.existsSync(filePath);
  }
}

module.exports = new FileStorageService();
module.exports.FileStorageService = FileStorageService;

