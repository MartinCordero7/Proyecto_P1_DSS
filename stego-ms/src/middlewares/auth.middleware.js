const jwt = require('jsonwebtoken');
const config = require('../config');
const authClientService = require('../services/authClient.service');
const {
  UnauthorizedError,
  ServiceUnavailableError
} = require('../utils/errors');

/**
 * Middleware: Cryptographic JWT Authentication.
 * 
 * Responsibilities:
 * - Extracts Bearer token from 'Authorization' header.
 * - Cryptographically verifies the signature using AUTH's public key (asymmetric RS256).
 * - Enforces allowed algorithm (RS256 - strictly disallows 'none' or symmetric confusion attacks).
 * - Verifies expiration (exp), issuer (iss), and audience (aud) claims.
 * - Extracts subject (sub) claim as the authenticated user identifier.
 * - Attaches req.user = { id: decoded.sub, ... } and req.token = token.
 */
function authenticateJwt(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedError(
        'Authorization header is required (Format: Bearer <token>)',
        'AUTH_HEADER_MISSING'
      );
    }

    const parts = authHeader.trim().split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedError(
        'Invalid authorization header format. Expected "Bearer <token>"',
        'AUTH_HEADER_INVALID'
      );
    }

    const token = parts[1];
    const publicKey = config.getAuthPublicKey();

    if (!publicKey) {
      throw new ServiceUnavailableError(
        'AUTH public key is not available on the server',
        'PUBLIC_KEY_UNAVAILABLE'
      );
    }

    // Strict cryptographic verification options
    const verifyOptions = {
      algorithms: [config.jwt.algorithm || 'RS256'],
      issuer: config.jwt.issuer || undefined,
      audience: config.jwt.audience || undefined,
      complete: false
    };

    let decoded;
    try {
      decoded = jwt.verify(token, publicKey, verifyOptions);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Authentication token has expired', 'TOKEN_EXPIRED');
      }
      if (jwtErr.name === 'JsonWebTokenError') {
        throw new UnauthorizedError('Authentication token is invalid or signature is tampered', 'TOKEN_INVALID');
      }
      throw new UnauthorizedError('Token verification failed', 'TOKEN_VERIFICATION_FAILED');
    }

    if (!decoded || !decoded.sub) {
      throw new UnauthorizedError(
        'Authentication token lacks a valid subject (sub) claim',
        'TOKEN_MISSING_SUBJECT'
      );
    }

    // Attach validated claims to request
    req.user = {
      id: decoded.sub,
      roles: decoded.roles || [],
      ...decoded
    };
    req.token = token;

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware Factory: Dynamic Authorization Check against AUTH microservice.
 * 
 * Enforces Zero Trust:
 * - A valid JWT identifies identity, but does NOT grant access by itself.
 * - Calls AUTH `POST /internal/authorization/check` to verify active permissions.
 * - Revoked or altered roles take immediate effect even if token is unexpired.
 * - No caching of authorization decisions.
 * - Defaults to DENY if AUTH is unreachable or returns error.
 * 
 * @param {string} action - Action name (e.g. 'steganography.analyze', 'steganography.view_result')
 * @param {Function} [resourceIdResolver] - Optional callback (req) => string to resolve resource ID
 */
function requireAuthorization(action, resourceIdResolver = null) {
  return async (req, res, next) => {
    try {
      if (!req.token) {
        throw new UnauthorizedError('Authentication token missing from request context', 'TOKEN_REQUIRED');
      }

      const resourceId = typeof resourceIdResolver === 'function' ? resourceIdResolver(req) : null;

      // Invoke AUTH microservice internal endpoint
      const decision = await authClientService.checkAuthorization(req.token, action, resourceId);

      if (decision.allowed) {
        req.authDecision = decision;
        return next();
      }

      // Should be caught inside authClientService, but ensure fallback
      next(new ForbiddenError('Operation not authorized by security authority', 'AUTHORIZATION_DENIED'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  authenticateJwt,
  requireAuthorization
};

