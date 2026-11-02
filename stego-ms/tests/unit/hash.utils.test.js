const fs = require('fs');
const path = require('path');
const os = require('os');
const { calculateFileSha256, calculateBufferSha256 } = require('../../src/utils/hash.utils');

describe('Hash Utils (SHA-256)', () => {
  let tempFilePath;

  beforeAll(async () => {
    tempFilePath = path.join(os.tmpdir(), `test_hash_${Date.now()}.txt`);
    await fs.promises.writeFile(tempFilePath, 'HELLO_STEGO_SECURITY_2026', 'utf8');
  });

  afterAll(async () => {
    if (fs.existsSync(tempFilePath)) {
      await fs.promises.unlink(tempFilePath);
    }
  });

  it('should compute the correct SHA-256 for a buffer', () => {
    const buffer = Buffer.from('HELLO_STEGO_SECURITY_2026', 'utf8');
    const hash = calculateBufferSha256(buffer);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should compute matching SHA-256 between file streaming and buffer hashing', async () => {
    const fileHash = await calculateFileSha256(tempFilePath);
    const buffer = await fs.promises.readFile(tempFilePath);
    const bufferHash = calculateBufferSha256(buffer);

    expect(fileHash).toBe(bufferHash);
  });

  it('should throw an error if the file does not exist', async () => {
    const nonExistentPath = path.join(os.tmpdir(), 'non_existent_hash_file.txt');
    await expect(calculateFileSha256(nonExistentPath)).rejects.toThrow();
  });
});

