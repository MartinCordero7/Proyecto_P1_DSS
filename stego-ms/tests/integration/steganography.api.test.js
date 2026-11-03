const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../../src/app');
const config = require('../../src/config');
const authClientService = require('../../src/services/authClient.service');
const steganographyEngineService = require('../../src/services/steganographyEngine.service');
const resultsService = require('../../src/services/results.service');
const {
  createValidTestToken,
  createExpiredTestToken,
  createValidPngBuffer,
  createValidBmpBuffer,
  createCorruptPngBuffer
} = require('../fixtures/testHelper');

describe('Integration: Steganography API Endpoints', () => {
  let validToken;
  let validPngBuffer;
  let validBmpBuffer;

  beforeAll(async () => {
    validToken = createValidTestToken({ sub: 'user-uuid-integration' });
    validPngBuffer = await createValidPngBuffer(20, 20);
    validBmpBuffer = createValidBmpBuffer(20, 20);

    // Register a mock implementation of Persona 2's engine to verify complete pipeline
    steganographyEngineService.registerEngine({
      analyze: async (context) => {
        return {
          analysis_id: '7f4c51e0-639a-4c22-b5e1-0c4a45719e71',
          user_id: context.userId,
          filename: context.originalName,
          sha256: context.sha256,
          technique: 'lsb_statistical_analysis',
          status: 'sin_indicios',
          indicators: { chi_square: 0.12, p_value: 0.95 },
          action: 'aprobado',
          limitations: 'Resultado indicativo, no concluyente'
        };
      }
    });

    // Register a mock repository for Persona 2's results persistence
    resultsService.registerRepository({
      save: async (record) => record,
      findById: async (id) => {
        if (id === 'existing-analysis-uuid') {
          return {
            analysis_id: 'existing-analysis-uuid',
            user_id: 'user-uuid-integration',
            filename: 'test.png',
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            technique: 'lsb_statistical_analysis',
            status: 'sin_indicios',
            indicators: { chi_square: 0.05 },
            action: 'aprobado'
          };
        }
        return null;
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/steganography/analyze', () => {
    it('Scenario 1: should successfully process a valid PNG image with JWT and active AUTH authorization', async () => {
      // Mock AUTH granting permission
      jest.spyOn(authClientService.client, 'post').mockResolvedValue({
        status: 200,
        data: {
          subject_id: 'user-uuid-integration',
          action: 'steganography.analyze',
          allowed: true,
          reason: 'active_role_grants_permission'
        }
      });

      const res = await request(app)
        .post('/api/steganography/analyze')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('image', validPngBuffer, 'photo.png');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('analysis_id');
      expect(res.body).toHaveProperty('status', 'sin_indicios');
      expect(res.body).toHaveProperty('action', 'aprobado');
      expect(res.body).toHaveProperty('sha256');
    });

    it('Scenario 2: should successfully process a valid BMP image', async () => {
      jest.spyOn(authClientService.client, 'post').mockResolvedValue({
        status: 200,
        data: {
          subject_id: 'user-uuid-integration',
          action: 'steganography.analyze',
          allowed: true
        }
      });

      const res = await request(app)
        .post('/api/steganography/analyze')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('image', validBmpBuffer, 'photo.bmp');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('analysis_id');
      expect(res.body.filename).toBe('photo.bmp');
    });

    it('Scenario 3: should reject a file with a fake extension with HTTP 415', async () => {
      jest.spyOn(authClientService.client, 'post').mockResolvedValue({
        status: 200,
        data: { allowed: true }
      });

      const fakeImage = Buffer.from('NOT_AN_IMAGE_FAKE_EXTENSION');

      const res = await request(app)
        .post('/api/steganography/analyze')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('image', fakeImage, 'fake.png');

      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('Scenario 4: should reject a disallowed format (e.g. .jpg or .txt) with HTTP 415', async () => {
      jest.spyOn(authClientService.client, 'post').mockResolvedValue({
        status: 200,
        data: { allowed: true }
      });

      const res = await request(app)
        .post('/api/steganography/analyze')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('image', Buffer.from('hello world'), 'document.txt');

      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('DISALLOWED_EXTENSION');
    });

    it('Scenario 5: should reject a corrupted image with HTTP 422', async () => {
      jest.spyOn(authClientService.client, 'post').mockResolvedValue({
        status: 200,
        data: { allowed: true }
      });

      const corruptPng = createCorruptPngBuffer();

      const res = await request(app)
        .post('/api/steganography/analyze')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('image', corruptPng, 'corrupt.png');

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('IMAGE_CORRUPTED');
    });

    it('Scenario 6: should reject an oversized image exceeding limits with HTTP 413', async () => {
      jest.spyOn(authClientService.client, 'post').mockResolvedValue({
        status: 200,
        data: { allowed: true }
      });

      // Max size is 5MB. Send 6MB buffer.
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024);

      const res = await request(app)
        .post('/api/steganography/analyze')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('image', largeBuffer, 'huge.png');

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('FILE_SIZE_LIMIT_EXCEEDED');
    });

    it('Scenario 7: should reject request without JWT with HTTP 401', async () => {
      const res = await request(app)
        .post('/api/steganography/analyze')
        .attach('image', validPngBuffer, 'photo.png');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_HEADER_MISSING');
    });

    it('Scenario 8: should reject request with tampered JWT with HTTP 401', async () => {
      const tampered = validToken + 'BADSIGNATURE';

      const res = await request(app)
        .post('/api/steganography/analyze')
        .set('Authorization', `Bearer ${tampered}`)
        .attach('image', validPngBuffer, 'photo.png');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_INVALID');
    });

    it('Scenario 9: should reject request with expired JWT with HTTP 401', async () => {
      const expired = createExpiredTestToken();

      const res = await request(app)
        .post('/api/steganography/analyze')
        .set('Authorization', `Bearer ${expired}`)
        .attach('image', validPngBuffer, 'photo.png');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('Scenario 10: should reject request when AUTH denies active permissions with HTTP 403', async () => {
      jest.spyOn(authClientService.client, 'post').mockResolvedValue({
        status: 200,
        data: {
          subject_id: 'user-uuid-integration',
          action: 'steganography.analyze',
          allowed: false,
          reason: 'role_user_insufficient_privileges'
        }
      });

      const res = await request(app)
        .post('/api/steganography/analyze')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('image', validPngBuffer, 'photo.png');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTHORIZATION_DENIED');
    });

    it('Scenario 11: should reject request with HTTP 503 when AUTH is unavailable', async () => {
      jest.spyOn(authClientService.client, 'post').mockRejectedValue(
        new Error('connect ECONNREFUSED 127.0.0.1:3000')
      );

      const res = await request(app)
        .post('/api/steganography/analyze')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('image', validPngBuffer, 'photo.png');

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AUTH_SERVICE_UNAVAILABLE');
    });

    it('Scenario 12: should clean up temporary files automatically when an error occurs', async () => {
      jest.spyOn(authClientService.client, 'post').mockResolvedValue({
        status: 200,
        data: { allowed: true }
      });

      const initialCount = fs.readdirSync(config.storage.tempDir).filter(f => f !== '.gitkeep').length;

      // Upload corrupt file causing 422
      await request(app)
        .post('/api/steganography/analyze')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('image', createCorruptPngBuffer(), 'corrupt.png');

      const countAfter = fs.readdirSync(config.storage.tempDir).filter(f => f !== '.gitkeep').length;
      expect(countAfter).toBe(initialCount);
    });
  });

  describe('GET /api/steganography/results/:id', () => {
    it('should retrieve existing analysis result after verifying authorization with AUTH', async () => {
      jest.spyOn(authClientService.client, 'post').mockResolvedValue({
        status: 200,
        data: {
          subject_id: 'user-uuid-integration',
          action: 'steganography.view_result',
          allowed: true
        }
      });

      const res = await request(app)
        .get('/api/steganography/results/existing-analysis-uuid')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('analysis_id', 'existing-analysis-uuid');
      expect(res.body).toHaveProperty('status', 'sin_indicios');
    });

    it('should return 404 when analysis result does not exist', async () => {
      jest.spyOn(authClientService.client, 'post').mockResolvedValue({
        status: 200,
        data: {
          subject_id: 'user-uuid-integration',
          action: 'steganography.view_result',
          allowed: true
        }
      });

      const res = await request(app)
        .get('/api/steganography/results/non-existent-id')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when AUTH denies viewing the resource', async () => {
      jest.spyOn(authClientService.client, 'post').mockResolvedValue({
        status: 200,
        data: {
          subject_id: 'user-uuid-integration',
          action: 'steganography.view_result',
          allowed: false,
          reason: 'not_owner_or_admin'
        }
      });

      const res = await request(app)
        .get('/api/steganography/results/existing-analysis-uuid')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTHORIZATION_DENIED');
    });
  });

  describe('GET /health', () => {
    it('should return 200 OK without requiring authentication', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('stego-ms');
    });
  });
});

