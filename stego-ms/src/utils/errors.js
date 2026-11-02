class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad Request', code = 'BAD_REQUEST', details = null) {
    super(message, 400, code, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED', details = null) {
    super(message, 401, code, details);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden: Access denied', code = 'FORBIDDEN', details = null) {
    super(message, 403, code, details);
  }
}

class PayloadTooLargeError extends AppError {
  constructor(message = 'File size exceeds maximum allowed limit', code = 'PAYLOAD_TOO_LARGE') {
    super(message, 413, code);
  }
}

class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'Unsupported file format or invalid media type', code = 'UNSUPPORTED_MEDIA_TYPE') {
    super(message, 415, code);
  }
}

class UnprocessableEntityError extends AppError {
  constructor(message = 'File is corrupted or cannot be processed', code = 'UNPROCESSABLE_ENTITY') {
    super(message, 422, code);
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Authentication or authorization service is unavailable', code = 'SERVICE_UNAVAILABLE') {
    super(message, 503, code);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  UnprocessableEntityError,
  ServiceUnavailableError
};

