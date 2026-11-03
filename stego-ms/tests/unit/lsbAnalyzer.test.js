const lsbAnalyzer = require('../../src/engine/lsbAnalyzer');

const { createRandom, createCover, embedRandomBits } = require('../fixtures/syntheticImages');

function fromBits(bits, width, height) {
  return { width, height, channels: 1, data: Buffer.from(bits) };
}

describe('LsbAnalyzer', () => {
  const width = 200;
  const height = 200;
  const cover = createCover({ width, height });

  describe('chi-square of pairs of values', () => {
    it('gives a negligible probability for a cover with non-equalized pairs', () => {
      const result = lsbAnalyzer.analyze(cover);

      expect(result.sufficientData).toBe(true);
      expect(result.chiSquare.maxP).toBeLessThan(1e-6);
    });

    it('gives a high probability when the whole LSB plane is overwritten with random bits', () => {
      const stego = embedRandomBits(cover, cover.data.length);

      const result = lsbAnalyzer.analyze(stego);

      expect(result.sufficientData).toBe(true);
      expect(result.chiSquare.maxP).toBeGreaterThan(0.5);
    });

    it('detects partial sequential embedding that the full-image test dilutes', () => {
      // Overwrite only the first 30 % of every channel (interleaved order -> 30 % of all samples).
      const partial = embedRandomBits(cover, Math.floor(cover.data.length * 0.3));

      const result = lsbAnalyzer.analyze(partial);

      const fullImageWindow = result.chiSquare.perChannel[0].windows.at(-1);
      expect(fullImageWindow.fraction).toBe(1);
      expect(fullImageWindow.p).toBeLessThan(1e-6); // diluted over the whole image
      expect(result.chiSquare.maxP).toBeGreaterThan(0.5); // visible in an early window
      expect(result.chiSquare.fraction).toBeLessThanOrEqual(0.3);
    });

    it('reports per-channel windows ending exactly at the full sample count', () => {
      const result = lsbAnalyzer.analyze(cover);

      for (const entry of result.chiSquare.perChannel) {
        expect(entry.windows.at(-1).samples).toBe(width * height);
        expect(entry.windows).toHaveLength(15);
      }
    });

    it('is not conclusive for tiny images (not enough samples)', () => {
      const tiny = createCover({ width: 10, height: 10 });

      const result = lsbAnalyzer.analyze(tiny);

      expect(result.sufficientData).toBe(false);
      expect(result.chiSquare.maxP).toBeNull();
    });

    it('is not conclusive for large images with almost no distinct values (flat image)', () => {
      const flat = { width, height, channels: 3, data: Buffer.alloc(width * height * 3, 128) };

      const result = lsbAnalyzer.analyze(flat);

      expect(result.sufficientData).toBe(false);
      expect(result.chiSquare.maxP).toBeNull();
    });

    it('analyzes grayscale (single channel) images', () => {
      const gray = createCover({ width, height, channels: 1 });

      const result = lsbAnalyzer.analyze(gray);

      expect(result.channelCount).toBe(1);
      expect(result.chiSquare.perChannel).toHaveLength(1);
      expect(result.chiSquare.maxP).toBeLessThan(1e-6);
    });
  });

  describe('LSB ratio', () => {
    it('is close to 0.5 with a small z-score for random bits', () => {
      const random = createRandom(5);
      const bits = Array.from({ length: 100 * 100 }, () => (random() < 0.5 ? 0 : 1));

      const { lsbRatio } = lsbAnalyzer.analyze(fromBits(bits, 100, 100));

      expect(lsbRatio.ratio).toBeGreaterThan(0.47);
      expect(lsbRatio.ratio).toBeLessThan(0.53);
      expect(lsbRatio.zScore).toBeLessThan(4);
    });

    it('is 0 with a very large z-score when every LSB is 0', () => {
      const { lsbRatio } = lsbAnalyzer.analyze(fromBits(new Array(100 * 100).fill(0), 100, 100));

      expect(lsbRatio.ratio).toBe(0);
      expect(lsbRatio.zScore).toBeCloseTo(100, 5); // |0 - 0.5| * 2 * sqrt(10000)
    });
  });

  describe('serial correlation of the LSB plane', () => {
    it('is -1 for a perfectly alternating pattern', () => {
      const bits = Array.from({ length: 100 * 100 }, (_, i) => (i % 100) % 2);

      const { serialCorrelation } = lsbAnalyzer.analyze(fromBits(bits, 100, 100));

      expect(serialCorrelation.mean).toBeCloseTo(-1, 10);
    });

    it('is +1 for horizontal runs (each row constant, rows alternate)', () => {
      const bits = Array.from({ length: 100 * 100 }, (_, i) => Math.floor(i / 100) % 2);

      const { serialCorrelation } = lsbAnalyzer.analyze(fromBits(bits, 100, 100));

      expect(serialCorrelation.mean).toBeCloseTo(1, 10);
    });

    it('is undefined (null) when the LSB plane has zero variance', () => {
      const { serialCorrelation } = lsbAnalyzer.analyze(fromBits(new Array(100 * 100).fill(1), 100, 100));

      expect(serialCorrelation.mean).toBeNull();
    });

    it('is close to 0 for random bits', () => {
      const random = createRandom(11);
      const bits = Array.from({ length: 200 * 200 }, () => (random() < 0.5 ? 0 : 1));

      const { serialCorrelation } = lsbAnalyzer.analyze(fromBits(bits, 200, 200));

      expect(Math.abs(serialCorrelation.mean)).toBeLessThan(0.03);
    });

    it('does not pair the last pixel of a row with the first of the next row', () => {
      // Width 2: rows are [0,1],[0,1]... within-row pairs are always (0,1) -> correlation -1.
      const bits = Array.from({ length: 2 * 5000 }, (_, i) => i % 2);

      const { serialCorrelation } = lsbAnalyzer.analyze(fromBits(bits, 2, 5000));

      expect(serialCorrelation.mean).toBeNull(); // X is always 0 -> zero variance, never mixed across rows
    });
  });

  describe('input validation', () => {
    it.each([
      ['null input', null],
      ['missing buffer', { width: 2, height: 2, channels: 3 }],
      ['wrong length', { width: 4, height: 4, channels: 3, data: Buffer.alloc(10) }],
      ['unsupported channel count', { width: 2, height: 2, channels: 4, data: Buffer.alloc(16) }]
    ])('throws for %s', (_label, input) => {
      expect(() => lsbAnalyzer.analyze(input)).toThrow('invalid pixel buffer');
    });
  });
});
