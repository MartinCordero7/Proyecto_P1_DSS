const path = require('path');
const fs = require('fs');
const os = require('os');
const { sanitizeFilename, checkMagicBytes, safeUnlink } = require('../../src/utils/file.utils');

describe('File Utils', () => {
  describe('sanitizeFilename', () => {
    it('should strip path traversal sequences', () => {
      expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd');
      expect(sanitizeFilename('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
    });

    it('should eliminate dangerous characters and null bytes', () => {
      expect(sanitizeFilename('image\0.png')).toBe('image.png');
      expect(sanitizeFilename('file;rm -rf ;test.png')).toBe('file_rm_-rf__test.png');
    });

    it('should return a safe default if input is empty or invalid', () => {
      expect(sanitizeFilename('')).toBe('unnamed_file');
      expect(sanitizeFilename(null)).toBe('unnamed_file');
    });
  });

  describe('checkMagicBytes', () => {
    it('should recognize PNG magic bytes', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(checkMagicBytes(pngBuffer)).toEqual({ ext: 'png', mime: 'image/png' });
    });

    it('should recognize BMP magic bytes (BM)', () => {
      const bmpBuffer = Buffer.from([0x42, 0x4d, 0x00, 0x00]);
      expect(checkMagicBytes(bmpBuffer)).toEqual({ ext: 'bmp', mime: 'image/bmp' });
    });

    it('should return null for non-matching binary content', () => {
      const textBuffer = Buffer.from('PLAIN TEXT CONTENT');
      expect(checkMagicBytes(textBuffer)).toBeNull();
    });

    it('should return null for short or null buffers', () => {
      expect(checkMagicBytes(Buffer.from([0x89]))).toBeNull();
      expect(checkMagicBytes(null)).toBeNull();
    });
  });

  describe('safeUnlink', () => {
    it('should delete an existing file without error', async () => {
      const tempPath = path.join(os.tmpdir(), `test_unlink_${Date.now()}.tmp`);
      await fs.promises.writeFile(tempPath, 'temp');
      const deleted = await safeUnlink(tempPath);
      expect(deleted).toBe(true);
      expect(fs.existsSync(tempPath)).toBe(false);
    });

    it('should return false gracefully if file does not exist', async () => {
      const nonExistent = path.join(os.tmpdir(), `non_existent_${Date.now()}.tmp`);
      const deleted = await safeUnlink(nonExistent);
      expect(deleted).toBe(false);
    });
  });
});
