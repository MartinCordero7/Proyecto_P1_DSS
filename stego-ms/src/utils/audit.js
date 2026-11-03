/**
 * @file audit.js
 * @description Structured audit log (one JSON line per event) for access and analysis traceability.
 *
 * Secrets cannot leak through it: only an explicit allow-list of fields is ever written, so a
 * JWT, an Authorization header, a password or a file content passed by mistake is dropped.
 */

const ALLOWED_FIELDS = Object.freeze([
  'user_id',
  'analysis_id',
  'sha256',
  'status',
  'action',
  'reason',
  'method',
  'path',
  'http_status',
  'duration_ms'
]);

const MAX_STRING_LENGTH = 200;

class AuditLogger {
  constructor(sink = (line) => console.log(line)) {
    this.sink = sink;
  }

  /** Replaces the output sink (used by tests to capture or silence the log). */
  setSink(sink) {
    this.sink = sink;
  }

  /**
   * @param {string} event - Dotted event name, e.g. 'analysis.completed'.
   * @param {Object} [fields] - Only keys in ALLOWED_FIELDS are written.
   */
  log(event, fields = {}) {
    const entry = { ts: new Date().toISOString(), event };

    for (const key of ALLOWED_FIELDS) {
      const value = fields[key];
      if (value === undefined || value === null) continue;
      entry[key] = typeof value === 'string' ? value.slice(0, MAX_STRING_LENGTH) : value;
    }

    try {
      this.sink(`[AUDIT] ${JSON.stringify(entry)}`);
    } catch (err) {
      // Auditing must never break the request being audited.
    }
  }
}

module.exports = new AuditLogger();
module.exports.AuditLogger = AuditLogger;
module.exports.ALLOWED_FIELDS = ALLOWED_FIELDS;
