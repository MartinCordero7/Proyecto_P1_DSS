const { AppError } = require('../utils/errors');

class ResultsService {
  constructor() {
    this.repository = null;
  }

  /**
   * Registers Persona 2's results persistence repository.
   * Persona 2 simply connects their database repository by calling:
   * resultsService.registerRepository(myResultsRepository);
   * 
   * @param {Object} repo - Repository object with findById(id) and save(result) methods.
   */
  registerRepository(repo) {
    if (!repo || typeof repo.findById !== 'function' || typeof repo.save !== 'function') {
      throw new Error('Results repository must provide "findById(id)" and "save(result)" methods');
    }
    this.repository = repo;
  }

  /**
   * Persists an analysis record produced by the engine.
   *
   * @param {Object} record - Analysis record (see analysisEngine contract).
   * @returns {Promise<Object>} The stored record.
   */
  async saveResult(record) {
    if (!this.repository) {
      throw new AppError(
        'Results persistence repository is not yet connected (Persona 2 module pending)',
        501,
        'REPOSITORY_NOT_IMPLEMENTED',
        { contractStatus: 'ready_for_persona_2' }
      );
    }

    return await this.repository.save(record);
  }

  /**
   * Retrieves an analysis record by its ID.
   * 
   * @param {string} analysisId - Unique identifier of the analysis record.
   * @returns {Promise<Object|null>} Analysis record or null if not found.
   */
  async getResultById(analysisId) {
    if (!this.repository) {
      throw new AppError(
        'Results persistence repository is not yet connected (Persona 2 module pending)',
        501,
        'REPOSITORY_NOT_IMPLEMENTED',
        { contractStatus: 'ready_for_persona_2' }
      );
    }

    return await this.repository.findById(analysisId);
  }
}

module.exports = new ResultsService();
module.exports.ResultsService = ResultsService;

