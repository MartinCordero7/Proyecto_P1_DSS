const {
  validateEngineInput,
  validateEngineOutput
} = require('../contracts/analysisEngine.contract');
const { AppError } = require('../utils/errors');

class SteganographyEngineService {
  constructor() {
    this.engineImplementation = null;
  }

  /**
   * Registers Persona 2's steganography detection engine implementation.
   * Persona 2 simply connects their analysis module by calling:
   * steganographyEngineService.registerEngine(myAnalysisEngine);
   * 
   * @param {Object} engine - Object with an analyze(context) method returning a Promise.
   */
  registerEngine(engine) {
    if (!engine || typeof engine.analyze !== 'function') {
      throw new Error('Analysis engine implementation must provide an "analyze(context)" method');
    }
    this.engineImplementation = engine;
  }

  /**
   * Dispatches the validated image payload to the analysis engine according to the contract.
   * 
   * @param {Object} context
   * @param {string} context.filePath - Safe internal storage path.
   * @param {string} context.originalName - Client's original filename.
   * @param {string} context.mimeType - Validated real MIME type.
   * @param {number} context.size - File size in bytes.
   * @param {string} context.sha256 - Lowercase hex SHA-256 hash.
   * @param {string} context.userId - Authenticated user UUID.
   * @returns {Promise<Object>} Analysis result matching the project contract.
   */
  async executeAnalysis(context) {
    // 1. Enforce strict input validation per integration contract
    validateEngineInput(context);

    // 2. Check if Persona 2's engine is registered
    if (!this.engineImplementation) {
      throw new AppError(
        'Steganography analysis engine is not yet connected (Persona 2 module pending)',
        501,
        'ENGINE_NOT_IMPLEMENTED',
        { contractStatus: 'ready_for_persona_2' }
      );
    }

    // 3. Execute analysis
    const result = await this.engineImplementation.analyze(context);

    // 4. Validate output schema to guarantee contract compliance
    validateEngineOutput(result);

    return result;
  }
}

module.exports = new SteganographyEngineService();
module.exports.SteganographyEngineService = SteganographyEngineService;

