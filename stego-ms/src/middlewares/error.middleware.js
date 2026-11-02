const fileStorageService = require('../services/fileStorage.service');
const { AppError } = require('../utils/errors');

/**
 * Centralized error-handling middleware.
 * 
 * Guarantees:
 * 1. Automatic cleanup of temporary files if an upload or processing error occurred.
 * 2. Mapping of known AppErrors to corresponding HTTP status codes:
 *    - 400: Bad Request
 *    - 401: Unauthorized (missing, invalid, expired JWT)
 *    - 403: Forbidden (AUTH denied permission)
 *    - 413: Payload Too Large (exceeds file size limit)
 *    - 415: Unsupported Media Type (invalid extension, MIME or magic bytes)
 *    - 422: Unprocessable Entity (corrupt image, unreadable, dimensions exceeded)
 *    - 500: Internal Server Error
 *    - 503: Service Unavailable (AUTH service offline or response unverifiable)
 * 3. Never leaks internal file paths, stack traces, database details, or credentials to the client.
 */
// eslint-disable-next-line no-unused-vars
async function errorHandler(err, req, res, next) {
  // 1. Safe cleanup of any temporary file generated during this request
  if (req.file && req.file.path) {
    try {
      await fileStorageService.cleanupTemporaryFile(req.file.path);
    } catch (cleanupErr) {
      console.error('[ErrorHandler] Error during temp file cleanup:', cleanupErr.message);
    }
  }

  // 2. Identify status code and error details
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An internal server error occurred while processing the request';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
  } else if (err.type === 'entity.parse.failed') {
    // Malformed JSON payload
    statusCode = 400;
    errorCode = 'MALFORMED_JSON';
    message = 'Request body contains invalid JSON';
  } else {
    // Log unexpected internal errors securely (sanitized on server logs)
    console.error('[ErrorHandler] Unhandled Exception:', err);
  }

  // 3. Send sanitized response to client
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: message
    }
  });
}

module.exports = errorHandler;

