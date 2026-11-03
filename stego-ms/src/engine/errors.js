/**
 * @file errors.js
 * @description Domain errors of the steganography analysis engine (Persona 2).
 * They are internal: the engine translates them into a contract result
 * ('no_concluyente' or 'con_error') instead of exposing them as HTTP errors.
 */

/**
 * The image is valid but cannot be analyzed reliably with the LSB technique
 * (palette images, 16-bit PNG, unsupported BMP layouts, etc.).
 * Maps to the 'no_concluyente' status.
 */
class AnalysisNotApplicableError extends Error {
  constructor(message, code = 'ANALYSIS_NOT_APPLICABLE') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

/**
 * The image could not be decoded into pixels (truncated or inconsistent data).
 * Maps to the 'con_error' status.
 */
class ImageDecodeError extends Error {
  constructor(message, code = 'IMAGE_DECODE_FAILED') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

module.exports = {
  AnalysisNotApplicableError,
  ImageDecodeError
};
