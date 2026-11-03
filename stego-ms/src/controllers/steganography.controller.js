const imageValidationService = require('../services/imageValidation.service');
const steganographyEngineService = require('../services/steganographyEngine.service');
const resultsService = require('../services/results.service');
const fileStorageService = require('../services/fileStorage.service');
const {
  AppError,
  BadRequestError,
  ForbiddenError,
  ServiceUnavailableError
} = require('../utils/errors');
const audit = require('../utils/audit');

class SteganographyController {
  /**
   * Endpoint: POST /api/steganography/analyze
   * Receives multipart/form-data image, validates security attributes, verifies JWT & AUTH RBAC,
   * calculates SHA-256, and submits to Persona 2's analysis engine according to contract.
   */
  async analyze(req, res, next) {
    try {
      if (!req.file) {
        throw new BadRequestError('No image file provided. Field "image" is required.', 'IMAGE_REQUIRED');
      }

      // 1. Deep security validation of uploaded image
      // Verifies extension, magic bytes, real MIME, dimension limits, corruption, and SHA-256
      const validatedData = await imageValidationService.validateImage(req.file);

      // 2. Prepare standardized integration payload for Persona 2's engine
      const engineInput = {
        filePath: validatedData.filePath,
        originalName: validatedData.originalName,
        mimeType: validatedData.mimeType,
        size: validatedData.size,
        sha256: validatedData.sha256,
        userId: req.user.id
      };

      // 3. Delegate execution to Persona 2 analysis engine contract
      const analysisResult = await steganographyEngineService.executeAnalysis(engineInput);

      // 4. Persist the analysis record (traceability). A storage failure must not skip the file
      // policy below, so the error is kept and raised after the file has been handled.
      let persistenceError = null;
      try {
        await resultsService.saveResult(analysisResult);
      } catch (err) {
        persistenceError = err;
        console.error('[StegoController] Failed to store analysis result:', err.message);
      }

      // 5. Handle quarantine policy if analysis flags payload
      if (analysisResult.action === 'cuarentena' || analysisResult.status === 'sospechoso') {
        try {
          await fileStorageService.moveToQuarantine(
            validatedData.filePath,
            validatedData.internalFilename,
            analysisResult.status
          );
        } catch (quarantineErr) {
          console.error('[StegoController] Failed to move file to quarantine:', quarantineErr.message);
        }
      } else {
        // Clean up temporary file if not quarantined
        await fileStorageService.cleanupTemporaryFile(validatedData.filePath);
      }

      // 6. Fail secure: without a stored record the analysis cannot be audited or retrieved later.
      if (persistenceError) {
        audit.log('analysis.persist_failed', {
          user_id: req.user.id,
          sha256: validatedData.sha256,
          status: analysisResult.status,
          action: analysisResult.action
        });
        throw persistenceError instanceof AppError
          ? persistenceError
          : new ServiceUnavailableError(
              'The analysis result could not be stored',
              'RESULT_STORAGE_UNAVAILABLE'
            );
      }

      audit.log('analysis.completed', {
        user_id: req.user.id,
        analysis_id: analysisResult.analysis_id,
        sha256: validatedData.sha256,
        status: analysisResult.status,
        action: analysisResult.action
      });

      // 7. Return structured result
      res.status(200).json(analysisResult);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Endpoint: GET /api/steganography/results/:id
   * Queries stored analysis result after verifying JWT and active RBAC/resource ownership via AUTH.
   */
  async getResult(req, res, next) {
    try {
      const { id } = req.params;
      if (!id || typeof id !== 'string') {
        throw new BadRequestError('Missing or invalid analysis result ID', 'INVALID_RESULT_ID');
      }

      // Delegate query to results service repository (Persona 2 integration contract)
      const result = await resultsService.getResultById(id);

      if (!result) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `Analysis result with ID '${id}' was not found`
          }
        });
      }

      // Resource ownership: AUTH decides by role, but only STEGO knows who owns each analysis.
      // The owner is compared with the identity proven by the verified JWT (never client input).
      if (result.user_id !== req.user.id) {
        audit.log('result.denied', {
          user_id: req.user.id,
          analysis_id: id,
          reason: 'not_owner'
        });
        throw new ForbiddenError(
          'You are not authorized to view this analysis result',
          'RESULT_ACCESS_DENIED'
        );
      }

      audit.log('result.viewed', { user_id: req.user.id, analysis_id: id });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SteganographyController();
module.exports.SteganographyController = SteganographyController;

