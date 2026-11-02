const axios = require('axios');
const config = require('../config');
const {
  AppError,
  ForbiddenError,
  UnauthorizedError,
  ServiceUnavailableError
} = require('../utils/errors');

class AuthClientService {
  constructor(customConfig = null) {
    this.config = customConfig || config.auth;
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeoutMs || 5000,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Credential': this.config.serviceCredential
      }
    });
  }

  /**
   * Requests real-time authorization check from AUTH microservice.
   * NO decision caching is implemented: every protected operation verifies active permissions
   * against AUTH to adhere strictly to Zero Trust and immediate role revocation requirements.
   *
   * @param {string} subjectToken - The user's JWT received in the request.
   * @param {string} action - Action requested (e.g., 'steganography.analyze', 'steganography.view_result').
   * @param {string|null} resourceId - Optional resource ID if checking specific resource ownership.
   * @returns {Promise<{ allowed: boolean, subjectId: string, reason: string }>}
   */
  async checkAuthorization(subjectToken, action, resourceId = null) {
    if (!subjectToken) {
      throw new UnauthorizedError('Missing subject token for authorization check', 'TOKEN_REQUIRED');
    }

    const payload = {
      subject_token: subjectToken,
      action: action,
      resource_id: resourceId
    };

    try {
      const response = await this.client.post('/internal/authorization/check', payload);

      if (response.status === 200 && response.data) {
        const { allowed, subject_id, reason } = response.data;

        if (typeof allowed !== 'boolean') {
          // Unverifiable decision -> Fail secure
          throw new ServiceUnavailableError(
            'Authorization service returned an unverifiable response structure',
            'AUTH_DECISION_UNVERIFIABLE'
          );
        }

        if (allowed === true) {
          return {
            allowed: true,
            subjectId: subject_id,
            reason: reason || 'active_role_grants_permission'
          };
        } else {
          // Explicit denial from AUTH
          throw new ForbiddenError(
            reason || 'Access denied: Active roles do not grant permission for this operation',
            'AUTHORIZATION_DENIED'
          );
        }
      }

      // Any unexpected 2xx status without expected payload
      throw new ServiceUnavailableError(
        'Unexpected response from authorization service',
        'AUTH_RESPONSE_INVALID'
      );
    } catch (err) {
      // Re-throw our explicit domain AppErrors
      if (err instanceof AppError) {
        throw err;
      }

      // Check HTTP error status from Axios
      if (err.response) {
        const status = err.response.status;
        const responseData = err.response.data || {};

        if (status === 401) {
          throw new UnauthorizedError(
            responseData.message || 'Token was rejected by authorization authority',
            'AUTHENTICATION_REJECTED'
          );
        }
        if (status === 403) {
          throw new ForbiddenError(
            responseData.message || responseData.reason || 'Forbidden by authorization authority',
            'AUTHORIZATION_DENIED'
          );
        }

        // 5xx from AUTH or any other code -> Fail secure with 503
        throw new ServiceUnavailableError(
          'Authorization service returned an error status',
          'AUTH_SERVICE_ERROR'
        );
      }

      // Network errors, connection refusal, DNS failure, timeout
      throw new ServiceUnavailableError(
        'Authorization service (AUTH) is unavailable or unreachable',
        'AUTH_SERVICE_UNAVAILABLE'
      );
    }
  }
}

module.exports = new AuthClientService();
module.exports.AuthClientService = AuthClientService;
