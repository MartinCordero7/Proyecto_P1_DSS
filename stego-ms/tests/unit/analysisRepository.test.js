const { AnalysisRepository } = require('../../src/repositories/analysisRepository');

const ANALYSIS_ID = '7f4c51e0-639a-4c22-b5e1-0c4a45719e71';
const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function sampleResult(overrides = {}) {
  return {
    analysis_id: ANALYSIS_ID,
    user_id: USER_ID,
    filename: 'muestra.png',
    sha256: SHA256,
    technique: 'lsb_statistical_analysis',
    status: 'sospechoso',
    indicators: { anomaly_score: 0.82, threshold: 0.75 },
    action: 'cuarentena',
    limitations: 'Resultado indicativo, no concluyente',
    analyzed_at: '2026-11-04T15:00:00.000Z',
    ...overrides
  };
}

function rowFrom(result) {
  return { ...result, analyzed_at: new Date(result.analyzed_at) };
}

describe('AnalysisRepository', () => {
  let db;
  let repository;

  beforeEach(() => {
    db = { query: jest.fn() };
    repository = new AnalysisRepository(db);
  });

  describe('save', () => {
    it('inserts every field with parameters and returns the stored record', async () => {
      const result = sampleResult();
      db.query.mockResolvedValue({ rows: [rowFrom(result)] });

      const stored = await repository.save(result);

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO analysis_results/);
      expect(params).toEqual([
        ANALYSIS_ID,
        USER_ID,
        'muestra.png',
        SHA256,
        'lsb_statistical_analysis',
        'sospechoso',
        'cuarentena',
        JSON.stringify({ anomaly_score: 0.82, threshold: 0.75 }),
        'Resultado indicativo, no concluyente',
        '2026-11-04T15:00:00.000Z'
      ]);
      expect(stored).toEqual(result);
    });

    it('normalizes the SHA-256 to lowercase', async () => {
      const result = sampleResult({ sha256: SHA256.toUpperCase() });
      db.query.mockResolvedValue({ rows: [rowFrom(sampleResult())] });

      await repository.save(result);

      expect(db.query.mock.calls[0][1][3]).toBe(SHA256);
    });

    it('never places client-controlled values inside the SQL text (SQL injection safe)', async () => {
      const hostile = sampleResult({ filename: "x'); DROP TABLE analysis_results;--" });
      db.query.mockResolvedValue({ rows: [rowFrom(hostile)] });

      await repository.save(hostile);

      const [sql, params] = db.query.mock.calls[0];
      expect(sql).not.toContain('DROP TABLE');
      expect(params[2]).toBe("x'); DROP TABLE analysis_results;--");
    });

    it('propagates database errors', async () => {
      db.query.mockRejectedValue(new Error('connection refused'));

      await expect(repository.save(sampleResult())).rejects.toThrow('connection refused');
    });
  });

  describe('findById', () => {
    it('returns the record in API shape when it exists', async () => {
      const result = sampleResult();
      db.query.mockResolvedValue({ rows: [rowFrom(result)] });

      const found = await repository.findById(ANALYSIS_ID);

      expect(db.query).toHaveBeenCalledWith(expect.stringMatching(/WHERE analysis_id = \$1/), [ANALYSIS_ID]);
      expect(found).toEqual(result);
    });

    it('returns null when there is no such record', async () => {
      db.query.mockResolvedValue({ rows: [] });

      await expect(repository.findById(ANALYSIS_ID)).resolves.toBeNull();
    });

    it.each([
      ['a non-UUID string', 'not-a-uuid'],
      ['a SQL injection attempt', "' OR '1'='1"],
      ['a path traversal attempt', '../../etc/passwd'],
      ['an empty string', ''],
      ['undefined', undefined],
      ['an object', { id: ANALYSIS_ID }]
    ])('returns null without querying the database for %s', async (_label, value) => {
      await expect(repository.findById(value)).resolves.toBeNull();
      expect(db.query).not.toHaveBeenCalled();
    });

    it('accepts uppercase UUIDs', async () => {
      db.query.mockResolvedValue({ rows: [] });

      await repository.findById(ANALYSIS_ID.toUpperCase());

      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });
});

describe('getDatabaseConfig', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function load() {
    jest.resetModules();
    // Hermetic: do not let the developer's real .env (loaded by src/config via dotenv) leak into the test.
    jest.doMock('../../src/config', () => ({}));
    return require('../../src/database/databaseConfig').getDatabaseConfig;
  }

  it('refuses to build a configuration without a password', () => {
    delete process.env.STEGO_DB_PASSWORD;

    expect(() => load()()).toThrow('STEGO_DB_PASSWORD is not set');
  });

  it('applies the documented defaults', () => {
    process.env.STEGO_DB_PASSWORD = 'unit-test-password';
    delete process.env.STEGO_DB_HOST;
    delete process.env.STEGO_DB_PORT;
    delete process.env.STEGO_DB_USER;
    delete process.env.STEGO_DB_NAME;

    expect(load()()).toMatchObject({
      host: 'localhost',
      port: 5433,
      user: 'stego_app',
      database: 'stego_db',
      ssl: false
    });
  });

  it('reads overrides from the environment', () => {
    Object.assign(process.env, {
      STEGO_DB_PASSWORD: 'unit-test-password',
      STEGO_DB_HOST: 'stego-db',
      STEGO_DB_PORT: '5432',
      STEGO_DB_SSL: 'true'
    });

    expect(load()()).toMatchObject({ host: 'stego-db', port: 5432, ssl: { rejectUnauthorized: true } });
  });
});
