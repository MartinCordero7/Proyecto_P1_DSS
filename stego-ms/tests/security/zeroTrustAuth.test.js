const request = require('supertest');
const app = require('../../src/app');
const authClientService = require('../../src/services/authClient.service');
const {
  createValidTestToken,
  createValidPngBuffer
} = require('../fixtures/testHelper');

describe('Security: Zero Trust & RBAC Dynamic Authorization', () => {
  let validToken;
  let validPngBuffer;

  beforeAll(async () => {
    validToken = createValidTestToken({ sub: 'user-uuid-rbac-test' });
    validPngBuffer = await createValidPngBuffer(1, 1);

    // Every successful analysis is persisted, so the API needs a repository to complete.
    require('../../src/services/results.service').registerRepository({
      save: async (record) => record,
      findById: async () => null
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should reject with HTTP 403 when user has a valid JWT but AUTH denies the action (e.g. role USER)', async () => {
    // Mock AUTH responding allowed: false
    jest.spyOn(authClientService.client, 'post').mockResolvedValue({
      status: 200,
      data: {
        subject_id: 'user-uuid-rbac-test',
        action: 'steganography.analyze',
        allowed: false,
        reason: 'user_role_lacks_permission'
      }
    });

    const res = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('image', validPngBuffer, 'valid.png');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTHORIZATION_DENIED');
  });

  it('should enforce immediate role revocation without relying on stale cached decisions', async () => {
    // 1st Call: Role is active -> allowed
    const spy = jest.spyOn(authClientService.client, 'post')
      .mockResolvedValueOnce({
        status: 200,
        data: {
          subject_id: 'user-uuid-rbac-test',
          action: 'steganography.analyze',
          allowed: true,
          reason: 'active_role_grants_permission'
        }
      })
      // 2nd Call: Role was revoked in AUTH -> denied immediately with the same JWT
      .mockResolvedValueOnce({
        status: 200,
        data: {
          subject_id: 'user-uuid-rbac-test',
          action: 'steganography.analyze',
          allowed: false,
          reason: 'role_revoked'
        }
      });

    // We also register a dummy engine so the first call doesn't fail on 501
    const stegoEngine = require('../../src/services/steganographyEngine.service');
    stegoEngine.registerEngine({
      analyze: async () => ({
        status: 'sin_indicios',
        action: 'aprobado'
      })
    });

    const res1 = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('image', validPngBuffer, 'sample1.png');

    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('image', validPngBuffer, 'sample2.png');

    expect(res2.status).toBe(403);
    expect(res2.body.error.code).toBe('AUTHORIZATION_DENIED');
    expect(spy).toHaveBeenCalledTimes(2); // Proves dynamic check on every request, no caching
  });

  it('should fail securely with HTTP 503 when AUTH is inaccessible or down', async () => {
    // Mock network failure to AUTH
    jest.spyOn(authClientService.client, 'post').mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:3000')
    );

    const res = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('image', validPngBuffer, 'valid.png');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AUTH_SERVICE_UNAVAILABLE');
  });
});

