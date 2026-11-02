const {
  validateEngineInput,
  validateEngineOutput,
  ANALYSIS_STATUSES
} = require('../../src/contracts/analysisEngine.contract');

describe('Analysis Engine Integration Contract (Persona 2)', () => {
  const validSha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  describe('validateEngineInput', () => {
    it('should accept a compliant input payload', () => {
      const validPayload = {
        filePath: '/safe/storage/temporary/uuid.png',
        originalName: 'test.png',
        mimeType: 'image/png',
        size: 2048,
        sha256: validSha256,
        userId: 'user-uuid-1234'
      };
      expect(validateEngineInput(validPayload)).toBe(true);
    });

    it('should reject payload missing required fields', () => {
      const missingSha = {
        filePath: '/safe/storage/temporary/uuid.png',
        originalName: 'test.png',
        mimeType: 'image/png',
        size: 2048,
        userId: 'user-uuid-1234'
      };
      expect(() => validateEngineInput(missingSha)).toThrow(/missing required field: 'sha256'/i);
    });

    it('should reject invalid SHA-256 format', () => {
      const invalidSha = {
        filePath: '/safe/storage/temporary/uuid.png',
        originalName: 'test.png',
        mimeType: 'image/png',
        size: 2048,
        sha256: 'NOT_A_VALID_HEX_64',
        userId: 'user-uuid-1234'
      };
      expect(() => validateEngineInput(invalidSha)).toThrow(/valid 64-character hex string/i);
    });
  });

  describe('validateEngineOutput', () => {
    it('should accept valid status values according to project requirements', () => {
      for (const status of Object.values(ANALYSIS_STATUSES)) {
        expect(validateEngineOutput({ status, analysis_id: 'test-id' })).toBe(true);
      }
    });

    it('should reject unauthorized or unknown status values', () => {
      expect(() => validateEngineOutput({ status: 'malicious_detected' })).toThrow(/status 'malicious_detected' is invalid/i);
      expect(() => validateEngineOutput({ status: 'clean' })).toThrow(/status 'clean' is invalid/i);
    });
  });
});

