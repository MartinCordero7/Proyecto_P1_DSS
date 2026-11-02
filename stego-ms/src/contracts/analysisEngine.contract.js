/**
 * @file analysisEngine.contract.js
 * @description Integration Contract Definition between Persona 1 (Validation & Ingestion)
 * and Persona 2 (Steganography Analysis Engine & Result Persistence).
 * 
 * Conforms to Project Guidelines:
 * - The input receives strictly validated and sanitized image data with cryptographic SHA-256.
 * - Allowed statuses are defined as: 'sin_indicios', 'sospechoso', 'no_concluyente', 'con_error'.
 */

const ANALYSIS_STATUSES = Object.freeze({
  SIN_INDICIOS: 'sin_indicios',
  SOSPECHOSO: 'sospechoso',
  NO_CONCLUYENTE: 'no_concluyente',
  CON_ERROR: 'con_error'
});

const ALLOWED_STATUS_LIST = Object.values(ANALYSIS_STATUSES);

/**
 * Validates that the input payload sent from Persona 1 to Persona 2 conforms to the contract.
 * @param {Object} input
 * @property {string} input.filePath - Internal secure disk path where the image is stored.
 * @property {string} input.originalName - Original filename sent by the client.
 * @property {string} input.mimeType - Validated real MIME type ('image/png' or 'image/bmp').
 * @property {number} input.size - Exact file size in bytes.
 * @property {string} input.sha256 - Lowercase hex SHA-256 of the original received bytes.
 * @property {string} input.userId - UUID of the authenticated user requesting the analysis.
 * @returns {boolean} True if payload matches contract.
 */
function validateEngineInput(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Analysis engine input must be a non-null object');
  }

  const requiredFields = ['filePath', 'originalName', 'mimeType', 'size', 'sha256', 'userId'];
  for (const field of requiredFields) {
    if (!input[field]) {
      throw new Error(`Analysis engine input missing required field: '${field}'`);
    }
  }

  if (typeof input.size !== 'number' || input.size <= 0) {
    throw new Error('Analysis engine input size must be a positive number');
  }

  if (!/^[a-f0-9]{64}$/i.test(input.sha256)) {
    throw new Error('Analysis engine input sha256 must be a valid 64-character hex string');
  }

  return true;
}

/**
 * Validates that the output returned by Persona 2 conforms to the expected project contract.
 * @param {Object} result
 * @returns {boolean}
 */
function validateEngineOutput(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('Analysis engine output must be a non-null object');
  }

  const requiredFields = ['status'];
  for (const field of requiredFields) {
    if (!result[field]) {
      throw new Error(`Analysis engine output missing required field: '${field}'`);
    }
  }

  if (!ALLOWED_STATUS_LIST.includes(result.status)) {
    throw new Error(
      `Analysis engine output status '${result.status}' is invalid. Allowed: ${ALLOWED_STATUS_LIST.join(', ')}`
    );
  }

  return true;
}

module.exports = {
  ANALYSIS_STATUSES,
  ALLOWED_STATUS_LIST,
  validateEngineInput,
  validateEngineOutput
};

