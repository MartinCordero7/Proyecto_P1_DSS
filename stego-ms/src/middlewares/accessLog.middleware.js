const audit = require('../utils/audit');

/**
 * Access log: one audit line per finished request (method, path without query string, status,
 * duration and the authenticated user id when the request got that far).
 * Headers and bodies are never logged, so JWTs and file contents cannot leak.
 */
function accessLog(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    audit.log('http.request', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      http_status: res.statusCode,
      duration_ms: Number((process.hrtime.bigint() - startedAt) / 1000000n),
      user_id: req.user && req.user.id
    });
  });

  next();
}

module.exports = accessLog;
