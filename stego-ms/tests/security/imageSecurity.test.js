const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../../src/app');
const config = require('../../src/config');
const authClientService = require('../../src/services/authClient.service');
const {
  createValidTestToken,
  createCorruptPngBuffer,
  createCorruptBmpBuffer
} = require('../fixtures/testHelper');

describe('Security: Image Processing, Sanitization & Temporary Cleanup', () => {
  let validToken;

  beforeAll(() => {
    validToken = createValidTestToken({ sub: 'user-uuid-sec-img' });
  });

  beforeEach(() => {
    // Mock AUTH approval for analyze action
    jest.spyOn(authClientService.client, 'post').mockResolvedValue({
      status: 200,
      data: {
        subject_id: 'user-uuid-sec-img',
        action: 'steganography.analyze',
        allowed: true,
        reason: 'active_role_grants_permission'
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should detect and reject extension spoofing (executable/script disguised as .png)', async () => {
    const maliciousScript = Buffer.from('<?php echo "evil_payload"; ?>');

    const res = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('image', maliciousScript, 'exploit.png');

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('should reject a corrupted PNG with HTTP 422 Unprocessable Entity', async () => {
    const corruptPng = createCorruptPngBuffer();

    const res = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('image', corruptPng, 'corrupt.png');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IMAGE_CORRUPTED');
  });

  it('should reject a corrupted BMP with HTTP 422 Unprocessable Entity', async () => {
    const corruptBmp = createCorruptBmpBuffer();

    const res = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('image', corruptBmp, 'corrupt.bmp');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IMAGE_CORRUPTED');
  });

  it('should verify that temporary files are deleted after a failed validation', async () => {
    // Count files in temporary storage before upload
    const tempDir = config.storage.tempDir;
    const initialFiles = fs.readdirSync(tempDir).filter(f => f !== '.gitkeep');

    const corruptPng = createCorruptPngBuffer();

    const res = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('image', corruptPng, 'corrupt_test_cleanup.png');

    expect(res.status).toBe(422);

    // Count files after rejection - should not have left any orphaned file!
    const filesAfter = fs.readdirSync(tempDir).filter(f => f !== '.gitkeep');
    expect(filesAfter.length).toBe(initialFiles.length);
  });
});

