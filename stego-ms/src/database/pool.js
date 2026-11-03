const { Pool } = require('pg');
const { getDatabaseConfig } = require('./databaseConfig');

let pool = null;

/**
 * Lazily creates the shared connection pool, so importing this module never opens a connection
 * (and never requires database credentials) until a query is actually made.
 */
function getPool() {
  if (!pool) {
    pool = new Pool(getDatabaseConfig());
    // An error on an idle client must not crash the process.
    pool.on('error', (err) => {
      console.error('[Database] Unexpected error on idle client:', err.message);
    });
  }
  return pool;
}

async function close() {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}

module.exports = {
  getPool,
  close,
  query: (text, params) => getPool().query(text, params)
};
