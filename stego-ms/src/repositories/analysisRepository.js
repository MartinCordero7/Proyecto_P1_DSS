const database = require('../database/pool');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS = `
  analysis_id, user_id, filename, sha256, technique,
  status, action, indicators, limitations, analyzed_at
`;

/**
 * Persistence of analysis records in STEGO's own PostgreSQL database.
 * Only parameterized queries are used: no value coming from a request is ever concatenated into SQL.
 *
 * Connect it with: resultsService.registerRepository(analysisRepository)
 */
class AnalysisRepository {
  constructor(db = database) {
    this.db = db;
  }

  /**
   * Stores an analysis record produced by the engine.
   * @param {Object} result - Engine output (see lsbEngine.buildResult).
   * @returns {Promise<Object>} The stored record in API shape.
   */
  async save(result) {
    const params = [
      result.analysis_id,
      result.user_id,
      result.filename,
      String(result.sha256).toLowerCase(),
      result.technique,
      result.status,
      result.action,
      JSON.stringify(result.indicators),
      result.limitations,
      result.analyzed_at
    ];

    const { rows } = await this.db.query(
      `INSERT INTO analysis_results (${COLUMNS})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
       RETURNING ${COLUMNS}`,
      params
    );

    return this.toRecord(rows[0]);
  }

  /**
   * @param {string} analysisId
   * @returns {Promise<Object|null>} The record, or null if it does not exist (or the id is not a UUID).
   */
  async findById(analysisId) {
    // A malformed id can never match; avoid sending it to PostgreSQL (which would raise a cast error).
    if (typeof analysisId !== 'string' || !UUID_PATTERN.test(analysisId)) {
      return null;
    }

    const { rows } = await this.db.query(
      `SELECT ${COLUMNS} FROM analysis_results WHERE analysis_id = $1`,
      [analysisId]
    );

    return rows.length ? this.toRecord(rows[0]) : null;
  }

  /** Maps a database row to the API / contract shape. */
  toRecord(row) {
    return {
      analysis_id: row.analysis_id,
      user_id: row.user_id,
      filename: row.filename,
      sha256: row.sha256,
      technique: row.technique,
      status: row.status,
      indicators: row.indicators,
      action: row.action,
      limitations: row.limitations,
      analyzed_at: new Date(row.analyzed_at).toISOString()
    };
  }
}

module.exports = new AnalysisRepository();
module.exports.AnalysisRepository = AnalysisRepository;
