const steganographyEngineService = require('../services/steganographyEngine.service');
const resultsService = require('../services/results.service');
const lsbEngine = require('../engine/lsbEngine');
const analysisRepository = require('../repositories/analysisRepository');

/**
 * Connects Persona 2's modules to the integration points left by Persona 1:
 * - the LSB analysis engine  -> steganographyEngineService
 * - the PostgreSQL repository -> resultsService
 *
 * Called once from server.js. app.js stays untouched so tests keep full control of both services.
 */
function registerAnalysisModules({
  engineService = steganographyEngineService,
  results = resultsService,
  engine = lsbEngine,
  repository = analysisRepository
} = {}) {
  engineService.registerEngine(engine);
  results.registerRepository(repository);
}

module.exports = { registerAnalysisModules };
