/**
 * Minimal SQL migration runner: applies db/migrations/*.sql in file-name order, once each,
 * and records them in the schema_migrations table. Usage: npm run db:migrate
 */
const fs = require('fs');
const path = require('path');
const database = require('./pool');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function migrate() {
  const client = await database.getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        VARCHAR(255) PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    let appliedNow = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] already applied: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        appliedNow++;
        console.log(`[migrate] applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }

    console.log(`[migrate] done (${appliedNow} new, ${files.length} total).`);
  } finally {
    client.release();
  }
}

migrate()
  .then(() => database.close())
  .catch(async (err) => {
    console.error('[migrate] ERROR:', err.message);
    await database.close();
    process.exit(1);
  });
