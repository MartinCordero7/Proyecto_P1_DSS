const app = require('./app');
const config = require('./config');
const fileStorageService = require('./services/fileStorage.service');
const database = require('./database/pool');
const { registerAnalysisModules } = require('./bootstrap/registerModules');

// Ensure storage directories are initialized
fileStorageService.ensureDirectories();

// Connect the analysis engine and the results repository (Persona 2) to the API
registerAnalysisModules();

const server = app.listen(config.port, () => {
  console.log(`[STEGO-MS] Microservice running in ${config.nodeEnv} mode on port ${config.port}`);
  console.log(`[STEGO-MS] Temporary storage: ${config.storage.tempDir}`);
  console.log(`[STEGO-MS] Quarantine storage: ${config.storage.quarantineDir}`);

  // Early warning only: while the database is down the API still fails secure (503) on /analyze.
  (async () => {
    try {
      await database.query('SELECT 1');
      console.log('[STEGO-MS] Database connection OK');
    } catch (err) {
      console.error(`[STEGO-MS] WARNING: database not reachable (${err.message}). Analyses will be refused until it is.`);
    }
  })();
});

// Graceful shutdown
const handleTermination = (signal) => {
  console.log(`[STEGO-MS] Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    await database.close();
    console.log('[STEGO-MS] Server stopped cleanly.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleTermination('SIGTERM'));
process.on('SIGINT', () => handleTermination('SIGINT'));

module.exports = server;

