const fs = require('fs');
const path = require('path');
const os = require('os');
const { FileStorageService } = require('../../src/services/fileStorage.service');

describe('File Storage Service', () => {
  let storageService;
  let testTempDir;
  let testQuarantineDir;

  beforeEach(() => {
    testTempDir = path.join(os.tmpdir(), `stego_test_temp_${Date.now()}_${Math.random()}`);
    testQuarantineDir = path.join(os.tmpdir(), `stego_test_quarantine_${Date.now()}_${Math.random()}`);
    
    storageService = new FileStorageService({
      tempDir: testTempDir,
      quarantineDir: testQuarantineDir
    });
  });

  afterEach(async () => {
    if (fs.existsSync(testTempDir)) {
      await fs.promises.rm(testTempDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testQuarantineDir)) {
      await fs.promises.rm(testQuarantineDir, { recursive: true, force: true });
    }
  });

  it('should create storage directories during initialization', () => {
    expect(fs.existsSync(testTempDir)).toBe(true);
    expect(fs.existsSync(testQuarantineDir)).toBe(true);
  });

  it('should generate a randomized UUID internal filename with extension', () => {
    const filename1 = storageService.generateInternalFilename('.png');
    const filename2 = storageService.generateInternalFilename('bmp');

    expect(filename1).toMatch(/^[a-f0-9-]{36}\.png$/);
    expect(filename2).toMatch(/^[a-f0-9-]{36}\.bmp$/);
    expect(filename1).not.toBe(filename2);
  });

  it('should resolve safe internal paths and prevent directory traversal', () => {
    const safePath = storageService.resolvePath('sample.png', 'temporary');
    expect(safePath.startsWith(path.resolve(testTempDir))).toBe(true);

    // Path traversal attempt
    const traversalAttempt = '../../../../etc/passwd';
    const sanitizedPath = storageService.resolvePath(traversalAttempt, 'temporary');
    // Takes strictly basename 'passwd' within temp directory
    expect(sanitizedPath).toBe(path.resolve(testTempDir, 'passwd'));
  });

  it('should move a file to quarantine correctly', async () => {
    const testFile = path.join(testTempDir, 'suspicious.png');
    await fs.promises.writeFile(testFile, 'SUSPICIOUS_PAYLOAD_BYTES');

    const quarantinedPath = await storageService.moveToQuarantine(testFile, 'quarantine-1.png');

    expect(fs.existsSync(testFile)).toBe(false);
    expect(fs.existsSync(quarantinedPath)).toBe(true);
    expect(quarantinedPath.startsWith(path.resolve(testQuarantineDir))).toBe(true);
  });

  it('should delete a temporary file safely', async () => {
    const testFile = path.join(testTempDir, 'temp.png');
    await fs.promises.writeFile(testFile, 'TEMPORARY_DATA');

    const result = await storageService.cleanupTemporaryFile(testFile);
    expect(result).toBe(true);
    expect(fs.existsSync(testFile)).toBe(false);
  });
});

