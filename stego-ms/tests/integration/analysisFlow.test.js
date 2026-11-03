/**
 * End-to-end flow of the API with Persona 2's REAL engine (LSB analysis) and an in-memory
 * repository standing in for PostgreSQL: upload -> analysis -> persistence -> file policy -> retrieval.
 * AUTH is simulated (it is a separate microservice); everything else is the real application.
 */
const request = require('supertest');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const app = require('../../src/app');
const config = require('../../src/config');
const audit = require('../../src/utils/audit');
const authClientService = require('../../src/services/authClient.service');
const steganographyEngineService = require('../../src/services/steganographyEngine.service');
const resultsService = require('../../src/services/results.service');
const lsbEngine = require('../../src/engine/lsbEngine');
const { createValidTestToken } = require('../fixtures/testHelper');
const { createCover, embedRandomBits } = require('../fixtures/syntheticImages');

const OWNER_ID = crypto.randomUUID();
const OTHER_USER_ID = crypto.randomUUID();
const SIZE = 200;

const listFiles = (dir) => new Set(fs.readdirSync(dir).filter((f) => f !== '.gitkeep'));

describe('Integration: analysis flow with the real engine', () => {
  let ownerToken;
  let otherToken;
  let coverPng;
  let stegoPng;
  let store;
  let failSaving;
  let auditLines;
  const quarantineBefore = listFiles(config.storage.quarantineDir);

  const toPng = (image) =>
    sharp(image.data, { raw: { width: image.width, height: image.height, channels: image.channels } })
      .png()
      .toBuffer();

  beforeAll(async () => {
    ownerToken = createValidTestToken({ sub: OWNER_ID });
    otherToken = createValidTestToken({ sub: OTHER_USER_ID });

    const cover = createCover({ width: SIZE, height: SIZE });
    coverPng = await toPng(cover);
    stegoPng = await toPng(embedRandomBits(cover, cover.data.length));

    steganographyEngineService.registerEngine(lsbEngine);
    resultsService.registerRepository({
      save: async (record) => {
        if (failSaving) throw new Error('db down: password authentication failed for user "stego_app"');
        store.set(record.analysis_id, record);
        return record;
      },
      findById: async (id) => store.get(id) || null
    });
  });

  beforeEach(() => {
    store = new Map();
    failSaving = false;
    auditLines = [];
    audit.setSink((line) => auditLines.push(line));
    jest.spyOn(authClientService.client, 'post').mockResolvedValue({
      status: 200,
      data: { subject_id: OWNER_ID, action: 'steganography.analyze', allowed: true }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    audit.setSink(() => {});
  });

  afterAll(() => {
    // Remove only the quarantined files created by this suite.
    for (const file of listFiles(config.storage.quarantineDir)) {
      if (!quarantineBefore.has(file)) {
        fs.unlinkSync(`${config.storage.quarantineDir}/${file}`);
      }
    }
  });

  const analyze = (token, buffer, name) =>
    request(app)
      .post('/api/steganography/analyze')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', buffer, name);

  it('flags an image with an LSB payload, stores the record, quarantines the file and cleans the temp folder', async () => {
    const tempBefore = listFiles(config.storage.tempDir);
    const quarantineCount = listFiles(config.storage.quarantineDir).size;

    const res = await analyze(ownerToken, stegoPng, 'carga.png');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      user_id: OWNER_ID,
      filename: 'carga.png',
      technique: 'lsb_statistical_analysis',
      status: 'sospechoso',
      action: 'cuarentena'
    });
    expect(res.body.sha256).toBe(crypto.createHash('sha256').update(stegoPng).digest('hex'));
    expect(store.get(res.body.analysis_id)).toEqual(res.body);
    expect(listFiles(config.storage.quarantineDir).size).toBe(quarantineCount + 1);
    expect(listFiles(config.storage.tempDir)).toEqual(tempBefore);
  });

  it('approves an original image, keeps nothing on disk and still stores the record', async () => {
    const tempBefore = listFiles(config.storage.tempDir);
    const quarantineCount = listFiles(config.storage.quarantineDir).size;

    const res = await analyze(ownerToken, coverPng, 'original.png');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'sin_indicios', action: 'aprobado' });
    expect(store.has(res.body.analysis_id)).toBe(true);
    expect(listFiles(config.storage.quarantineDir).size).toBe(quarantineCount);
    expect(listFiles(config.storage.tempDir)).toEqual(tempBefore);
  });

  it('lets the owner retrieve the stored result', async () => {
    const created = await analyze(ownerToken, stegoPng, 'carga.png');

    const res = await request(app)
      .get(`/api/steganography/results/${created.body.analysis_id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
  });

  it('T11: denies another user the result of someone else with HTTP 403 and reveals nothing', async () => {
    const created = await analyze(ownerToken, stegoPng, 'carga.png');

    const res = await request(app)
      .get(`/api/steganography/results/${created.body.analysis_id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('RESULT_ACCESS_DENIED');
    expect(JSON.stringify(res.body)).not.toContain(created.body.sha256);
    expect(JSON.stringify(res.body)).not.toContain('carga.png');
  });

  it('returns 404 for unknown and malformed result ids', async () => {
    const unknown = await request(app)
      .get(`/api/steganography/results/${crypto.randomUUID()}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const malformed = await request(app)
      .get('/api/steganography/results/not-a-uuid')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
  });

  it('fails secure with 503 when the result cannot be stored, still quarantining the file and hiding internals', async () => {
    failSaving = true;
    const tempBefore = listFiles(config.storage.tempDir);
    const quarantineCount = listFiles(config.storage.quarantineDir).size;
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await analyze(ownerToken, stegoPng, 'carga.png');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('RESULT_STORAGE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toMatch(/password|stego_app|db down/i);
    expect(listFiles(config.storage.quarantineDir).size).toBe(quarantineCount + 1);
    expect(listFiles(config.storage.tempDir)).toEqual(tempBefore);
    expect(auditLines.some((line) => line.includes('analysis.persist_failed'))).toBe(true);
  });

  it('T12: writes traceable audit lines without ever exposing the JWT', async () => {
    const created = await analyze(ownerToken, coverPng, 'original.png');
    await request(app)
      .get(`/api/steganography/results/${created.body.analysis_id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    const log = auditLines.join('\n');
    expect(log).toContain('"event":"analysis.completed"');
    expect(log).toContain(`"analysis_id":"${created.body.analysis_id}"`);
    expect(log).toContain(`"user_id":"${OWNER_ID}"`);
    expect(log).toContain('"event":"result.denied"');
    expect(log).toContain('"reason":"not_owner"');
    expect(log).toContain('"event":"http.request"');
    expect(log).toContain('"path":"/api/steganography/analyze"');
    expect(log).not.toContain(ownerToken);
    expect(log).not.toContain(otherToken);
    expect(log).not.toMatch(/bearer/i);
  });
});
