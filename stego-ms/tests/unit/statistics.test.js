const { logGamma, regularizedGammaQ, chiSquareSurvival } = require('../../src/engine/statistics');

describe('statistics helpers', () => {
  describe('logGamma', () => {
    it('matches known values', () => {
      expect(logGamma(1)).toBeCloseTo(0, 10); // Γ(1) = 1
      expect(logGamma(5)).toBeCloseTo(Math.log(24), 10); // Γ(5) = 4!
      expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
      expect(logGamma(50)).toBeCloseTo(144.56574394634487, 8);
    });
  });

  describe('regularizedGammaQ', () => {
    it('returns 1 for x <= 0 and NaN for invalid shape', () => {
      expect(regularizedGammaQ(3, 0)).toBe(1);
      expect(regularizedGammaQ(3, -2)).toBe(1);
      expect(regularizedGammaQ(0, 1)).toBeNaN();
    });

    it('is Q(1, x) = exp(-x)', () => {
      expect(regularizedGammaQ(1, 2)).toBeCloseTo(Math.exp(-2), 10);
      expect(regularizedGammaQ(1, 0.3)).toBeCloseTo(Math.exp(-0.3), 10);
    });
  });

  describe('chiSquareSurvival', () => {
    // Critical values from standard chi-square tables.
    it.each([
      [3.841459, 1, 0.05],
      [6.634897, 1, 0.01],
      [18.307038, 10, 0.05],
      [23.209251, 10, 0.01],
      [124.342113, 100, 0.05],
      [135.806723, 100, 0.01]
    ])('chi2=%f df=%i -> p≈%f', (chi2, df, expected) => {
      expect(chiSquareSurvival(chi2, df)).toBeCloseTo(expected, 4);
    });

    it('is 1 at chi2=0 and tends to 0 for very large statistics', () => {
      expect(chiSquareSurvival(0, 50)).toBe(1);
      expect(chiSquareSurvival(100000, 50)).toBeLessThan(1e-100);
    });

    it('is monotonically decreasing in the statistic', () => {
      let previous = 1;
      for (let chi2 = 5; chi2 <= 200; chi2 += 5) {
        const p = chiSquareSurvival(chi2, 60);
        expect(p).toBeLessThanOrEqual(previous);
        previous = p;
      }
    });
  });
});
