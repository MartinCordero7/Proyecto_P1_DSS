// Loads .env (dotenv) before the variables below are read.
require('../config');

/**
 * Builds the PostgreSQL connection settings from STEGO_DB_* environment variables.
 * The password has no default on purpose: the service must never run with a built-in credential.
 * @returns {Object} node-postgres Pool options.
 */
function getDatabaseConfig() {
  const password = process.env.STEGO_DB_PASSWORD;
  if (!password) {
    throw new Error('STEGO_DB_PASSWORD is not set. Copy .env.example to .env and define it.');
  }

  return {
    host: process.env.STEGO_DB_HOST || 'localhost',
    port: parseInt(process.env.STEGO_DB_PORT, 10) || 5433,
    user: process.env.STEGO_DB_USER || 'stego_app',
    password,
    database: process.env.STEGO_DB_NAME || 'stego_db',
    ssl: process.env.STEGO_DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  };
}

module.exports = { getDatabaseConfig };
