const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const {
  privateKey,
  createValidTestToken,
  createExpiredTestToken,
  createValidPngBuffer
} = require('../fixtures/testHelper');

describe('Security: JWT Verification & Attack Resistance', () => {
  let validPngBuffer;

  beforeAll(async () => {
    validPngBuffer = await createValidPngBuffer(1, 1);
  });

  it('should reject request without Authorization header with HTTP 401', async () => {
    const res = await request(app)
      .post('/api/steganography/analyze')
      .attach('image', validPngBuffer, 'sample.png');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_HEADER_MISSING');
  });

  it('should reject request with malformed Authorization header with HTTP 401', async () => {
    const res = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', 'InvalidFormatWithoutBearer')
      .attach('image', validPngBuffer, 'sample.png');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_HEADER_INVALID');
  });

  it('should reject an expired JWT with HTTP 401', async () => {
    const expiredToken = createExpiredTestToken();

    const res = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${expiredToken}`)
      .attach('image', validPngBuffer, 'sample.png');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('should reject a tampered JWT (modified payload or forged signature) with HTTP 401', async () => {
    const validToken = createValidTestToken();
    // Tamper with the token signature by modifying the last characters
    const tamperedToken = validToken.substring(0, validToken.length - 10) + 'TAMPERED99';

    const res = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${tamperedToken}`)
      .attach('image', validPngBuffer, 'sample.png');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('should reject an "alg: none" bypass attack with HTTP 401', async () => {
    // Construct an unsigned token with alg: none
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'admin-user', iss: 'auth-ms', aud: 'stego-ms' })
    ).toString('base64url');
    const noneToken = `${header}.${payload}.`;

    const res = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${noneToken}`)
      .attach('image', validPngBuffer, 'sample.png');

    expect(res.status).toBe(401);
  });

  it('should reject a JWT that lacks the subject (sub) claim with HTTP 401', async () => {
    const tokenNoSub = jwt.sign(
      { username: 'anonymous_user', iss: 'auth-ms', aud: 'stego-ms' },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );

    const res = await request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${tokenNoSub}`)
      .attach('image', validPngBuffer, 'sample.png');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_MISSING_SUBJECT');
  });
});

