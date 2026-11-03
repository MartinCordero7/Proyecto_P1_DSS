/**
 * Repository tests against a REAL PostgreSQL (the stego-db container).
 * They are excluded from `npm test`; run them with `npm run test:db` once the database is up
 * and migrated (docker compose up -d stego-db  &&  npm run db:migrate).
 */
const crypto = require('crypto');
const database = require('../../src/database/pool');
const { AnalysisRepository } = require('../../src/repositories/analysisRepository');

const SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function newRecord(overrides = {}) {
  return {
    analysis_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    filename: 'muestra.png',
    sha256: SHA256,
    technique: 'lsb_statistical_analysis',
    status: 'sospechoso',
    indicators: { anomaly_score: 0.82, threshold: 0.75, nested: { ok: true } },
    action: 'cuarentena',
    limitations: 'Resultado indicativo, no concluyente',
    analyzed_at: new Date().toISOString(),
    ...overrides
  };
}

describe('AnalysisRepository (real PostgreSQL)', () => {
  const repository = new AnalysisRepository(database);
  const createdIds = [];

  async function saveTracked(record) {
    createdIds.push(record.analysis_id);
    return repository.save(record);
  }

  afterAll(async () => {
    if (createdIds.length) {
      await database.query('DELETE FROM analysis_results WHERE analysis_id = ANY($1::uuid[])', [createdIds]);
    }
    await database.close();
  });

  it('stores a record and reads it back identical', async () => {
    const record = newRecord();

    const stored = await saveTracked(record);
    const found = await repository.findById(record.analysis_id);

    expect(stored).toEqual(record);
    expect(found).toEqual(record);
  });

  it('keeps nested JSON indicators intact', async () => {
    const record = newRecord({ indicators: { chi_square_p_max: 0.9981, tags: ['a', 'b'], nested: { n: 1 } } });

    await saveTracked(record);

    expect((await repository.findById(record.analysis_id)).indicators).toEqual(record.indicators);
  });

  it('returns null for an unknown id and for a malformed id', async () => {
    await expect(repository.findById(crypto.randomUUID())).resolves.toBeNull();
    await expect(repository.findById("1' OR '1'='1")).resolves.toBeNull();
  });

  it('stores hostile filenames as plain data', async () => {
    const record = newRecord({ filename: "x'); DROP TABLE analysis_results;--" });

    await saveTracked(record);

    expect((await repository.findById(record.analysis_id)).filename).toBe(record.filename);
    await expect(database.query('SELECT 1 FROM analysis_results LIMIT 1')).resolves.toBeDefined();
  });

  it('rejects duplicated analysis ids (primary key)', async () => {
    const record = newRecord();
    await saveTracked(record);

    await expect(repository.save(record)).rejects.toThrow(/duplicate key/);
  });

  it.each([
    ['an invalid status', { status: 'desconocido' }],
    ['an invalid action', { action: 'borrar' }],
    ['a malformed sha256', { sha256: 'abc' }],
    ['a non-UUID user_id', { user_id: 'no-es-uuid' }]
  ])('rejects %s (database constraints)', async (_label, overrides) => {
    await expect(repository.save(newRecord(overrides))).rejects.toThrow();
  });
});
