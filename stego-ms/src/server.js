const app = require('./app');
const config = require('./config');
const fileStorageService = require('./services/fileStorage.service');

// Ensure storage directories are initialized
fileStorageService.ensureDirectories();

const server = app.listen(config.port, () => {
  console.log(`[STEGO-MS] Microservice running in ${config.nodeEnv} mode on port ${config.port}`);
  console.log(`[STEGO-MS] Temporary storage: ${config.storage.tempDir}`);
  console.log(`[STEGO-MS] Quarantine storage: ${config.storage.quarantineDir}`);
});

// Graceful shutdown
const handleTermination = (signal) => {
  console.log(`[STEGO-MS] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[STEGO-MS] Server stopped cleanly.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleTermination('SIGTERM'));
process.on('SIGINT', () => handleTermination('SIGINT'));

module.exports = server;

