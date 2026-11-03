const { AnalysisClassifier, ANALYSIS_ACTIONS } = require('../../src/engine/classifier');
const { ANALYSIS_STATUSES } = require('../../src/contracts/analysisEngine.contract');

function analysisWithScore(maxP) {
  return { sufficientData: maxP !== null, chiSquare: { maxP } };
}

describe('AnalysisClassifier', () => {
  const classifier = new AnalysisClassifier({ suspiciousThreshold: 0.75, cleanThreshold: 0.4 });

  describe('classify', () => {
    it('flags a score above the suspicious threshold for quarantine', () => {
      const verdict = classifier.classify(analysisWithScore(0.93));

      expect(verdict.status).toBe(ANALYSIS_STATUSES.SOSPECHOSO);
      expect(verdict.action).toBe(ANALYSIS_ACTIONS.CUARENTENA);
      expect(verdict.anomalyScore).toBe(0.93);
      expect(verdict.limitations).toMatch(/no concluyente/i);
    });

    it('treats a score exactly at the suspicious threshold as suspicious', () => {
      expect(classifier.classify(analysisWithScore(0.75)).status).toBe('sospechoso');
    });

    it('approves a score below the clean threshold', () => {
      const verdict = classifier.classify(analysisWithScore(0.02));

      expect(verdict.status).toBe(ANALYSIS_STATUSES.SIN_INDICIOS);
      expect(verdict.action).toBe(ANALYSIS_ACTIONS.APROBADO);
    });

    it('treats a score exactly at the clean threshold as intermediate (not clean)', () => {
      expect(classifier.classify(analysisWithScore(0.4)).status).toBe('no_concluyente');
    });

    it('warns for a score in the intermediate zone', () => {
      const verdict = classifier.classify(analysisWithScore(0.6));

      expect(verdict.status).toBe(ANALYSIS_STATUSES.NO_CONCLUYENTE);
      expect(verdict.action).toBe(ANALYSIS_ACTIONS.ADVERTENCIA);
      expect(verdict.reason).toBe('score_in_intermediate_zone');
    });

    it('is not conclusive (with a warning) when there is not enough data', () => {
      const verdict = classifier.classify(analysisWithScore(null));

      expect(verdict.status).toBe(ANALYSIS_STATUSES.NO_CONCLUYENTE);
      expect(verdict.action).toBe(ANALYSIS_ACTIONS.ADVERTENCIA);
      expect(verdict.anomalyScore).toBeNull();
      expect(verdict.reason).toBe('insufficient_data');
    });

    it('is not conclusive when the analysis is missing', () => {
      expect(classifier.classify(null).status).toBe('no_concluyente');
    });

    it('uses the configured thresholds', () => {
      const strict = new AnalysisClassifier({ suspiciousThreshold: 0.9, cleanThreshold: 0.1 });

      expect(strict.classify(analysisWithScore(0.8)).status).toBe('no_concluyente');
      expect(strict.classify(analysisWithScore(0.95)).status).toBe('sospechoso');
      expect(strict.classify(analysisWithScore(0.05)).status).toBe('sin_indicios');
    });
  });

  describe('classifyNotApplicable', () => {
    it('maps to no_concluyente with a warning and a lowercase reason', () => {
      const verdict = classifier.classifyNotApplicable('PALETTE_IMAGE');

      expect(verdict).toMatchObject({
        status: 'no_concluyente',
        action: 'advertencia',
        anomalyScore: null,
        reason: 'palette_image'
      });
    });
  });

  describe('classifyError', () => {
    it('maps to con_error with rejection (fail secure)', () => {
      const verdict = classifier.classifyError('IMAGE_DECODE_FAILED');

      expect(verdict).toMatchObject({
        status: 'con_error',
        action: 'rechazo',
        anomalyScore: null,
        reason: 'image_decode_failed'
      });
    });

    it('falls back to a generic reason', () => {
      expect(classifier.classifyError().reason).toBe('analysis_failed');
    });
  });
});

describe('analysisConfig', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function load() {
    jest.resetModules();
    return require('../../src/engine/analysisConfig');
  }

  it('uses the documented defaults', () => {
    delete process.env.STEGO_SUSPICIOUS_THRESHOLD;
    delete process.env.STEGO_CLEAN_THRESHOLD;

    expect(load()).toMatchObject({ suspiciousThreshold: 0.75, cleanThreshold: 0.4, technique: 'lsb_statistical_analysis' });
  });

  it('reads thresholds from the environment', () => {
    process.env.STEGO_SUSPICIOUS_THRESHOLD = '0.9';
    process.env.STEGO_CLEAN_THRESHOLD = '0.3';

    expect(load()).toMatchObject({ suspiciousThreshold: 0.9, cleanThreshold: 0.3 });
  });

  it.each([
    ['clean >= suspicious', { STEGO_SUSPICIOUS_THRESHOLD: '0.5', STEGO_CLEAN_THRESHOLD: '0.6' }],
    ['suspicious above 1', { STEGO_SUSPICIOUS_THRESHOLD: '1.5' }],
    ['clean not positive', { STEGO_CLEAN_THRESHOLD: '0' }],
    ['non-numeric value', { STEGO_SUSPICIOUS_THRESHOLD: 'abc' }]
  ])('rejects invalid thresholds (%s)', (_label, env) => {
    Object.assign(process.env, env);

    expect(load).toThrow();
  });
});
