const { AuthClientService } = require('../../src/services/authClient.service');

describe('Auth Client Service (Zero Trust Authorization)', () => {
  let authClient;
  let mockAxios;

  beforeEach(() => {
    authClient = new AuthClientService({
      baseUrl: 'http://auth-ms.internal',
      serviceCredential: 'secret-s2s-token-test',
      timeoutMs: 3000
    });
  });

  it('should return allowed: true when AUTH approves the request', async () => {
    // Mock successful post response
    authClient.client.post = jest.fn().mockResolvedValue({
      status: 200,
      data: {
        subject_id: 'user-uuid-1234',
        action: 'steganography.analyze',
        allowed: true,
        reason: 'active_role_grants_permission'
      }
    });

    const result = await authClient.checkAuthorization('valid-jwt-token', 'steganography.analyze');

    expect(result.allowed).toBe(true);
    expect(result.subjectId).toBe('user-uuid-1234');
    expect(authClient.client.post).toHaveBeenCalledWith('/internal/authorization/check', {
      subject_token: 'valid-jwt-token',
      action: 'steganography.analyze',
      resource_id: null
    });
  });

  it('should throw 403 Forbidden when AUTH explicitly denies the authorization', async () => {
    authClient.client.post = jest.fn().mockResolvedValue({
      status: 200,
      data: {
        subject_id: 'user-uuid-1234',
        action: 'steganography.analyze',
        allowed: false,
        reason: 'user_role_lacks_permission'
      }
    });

    await expect(
      authClient.checkAuthorization('valid-jwt-token', 'steganography.analyze')
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'AUTHORIZATION_DENIED'
    });
  });

  it('should throw 503 when AUTH response is malformed or lacks allowed boolean', async () => {
    authClient.client.post = jest.fn().mockResolvedValue({
      status: 200,
      data: {
        // Missing 'allowed' field
        something_else: true
      }
    });

    await expect(
      authClient.checkAuthorization('valid-jwt-token', 'steganography.analyze')
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'AUTH_DECISION_UNVERIFIABLE'
    });
  });

  it('should throw 503 Service Unavailable when AUTH server is unreachable (fail secure)', async () => {
    authClient.client.post = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3000'));

    await expect(
      authClient.checkAuthorization('valid-jwt-token', 'steganography.analyze')
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'AUTH_SERVICE_UNAVAILABLE'
    });
  });

  it('should throw 503 when AUTH request times out (fail secure)', async () => {
    const timeoutErr = new Error('timeout of 3000ms exceeded');
    timeoutErr.code = 'ECONNABORTED';
    authClient.client.post = jest.fn().mockRejectedValue(timeoutErr);

    await expect(
      authClient.checkAuthorization('valid-jwt-token', 'steganography.analyze')
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'AUTH_SERVICE_UNAVAILABLE'
    });
  });
});

