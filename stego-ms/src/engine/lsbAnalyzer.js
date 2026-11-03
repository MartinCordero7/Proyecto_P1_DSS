const { chiSquareSurvival } = require('./statistics');

/**
 * Initial analysis parameters. They are documented in docs/teoria-esteganografia.md (§4 and §5)
 * and are calibrated against real samples in the testing stage.
 */
const DEFAULT_PARAMS = Object.freeze({
  // Prefixes of the pixel sequence analyzed progressively (detects partial sequential embedding).
  windowFractions: Object.freeze([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]),
  // Pairs of values with an expected frequency below this are excluded from chi-square.
  minExpectedFrequency: 5,
  // Minimum degrees of freedom for a chi-square window to be considered reliable.
  minDegreesOfFreedom: 20,
  // Minimum samples per channel to emit any chi-square verdict.
  minSamplesPerChannel: 10000
});

class LsbAnalyzer {
  /**
   * Computes the LSB statistical indicators of a decoded image.
   *
   * @param {{ width: number, height: number, channels: number, data: Buffer }} pixels
   *   Output of PixelReader: 8-bit samples, interleaved, rows top to bottom.
   * @param {Object} [overrides] - Partial override of DEFAULT_PARAMS (used by tests).
   * @returns {Object} Indicators:
   *   - sufficientData: false when there are not enough samples / value pairs for a chi-square verdict.
   *   - chiSquare.maxP: highest "pairs of values equalized" probability over windows and channels
   *     (close to 1 => consistent with LSB replacement). null when sufficientData is false.
   *   - lsbRatio: proportion of LSBs set to 1 and its z-score against 0.5.
   *   - serialCorrelation: correlation between the LSBs of horizontally adjacent pixels.
   */
  analyze(pixels, overrides = {}) {
    const params = { ...DEFAULT_PARAMS, ...overrides };
    this.assertValidPixels(pixels);

    const { width, height, channels, data } = pixels;
    const samplesPerChannel = width * height;
    const boundaries = this.windowBoundaries(samplesPerChannel, params.windowFractions);

    const perChannel = [];
    for (let channel = 0; channel < channels; channel++) {
      perChannel.push(this.analyzeChannel(data, channel, channels, width, height, boundaries, params));
    }

    return this.summarize(perChannel, samplesPerChannel, channels, params);
  }

  assertValidPixels(pixels) {
    if (
      !pixels ||
      !Buffer.isBuffer(pixels.data) ||
      !Number.isInteger(pixels.width) ||
      !Number.isInteger(pixels.height) ||
      pixels.width <= 0 ||
      pixels.height <= 0 ||
      ![1, 3].includes(pixels.channels) ||
      pixels.data.length !== pixels.width * pixels.height * pixels.channels
    ) {
      throw new Error('LSB analyzer received an invalid pixel buffer');
    }
  }

  /**
   * Sample counts at which the progressive chi-square is evaluated (unique, ascending, last = all).
   */
  windowBoundaries(totalSamples, fractions) {
    const set = new Set();
    for (const fraction of fractions) {
      const boundary = Math.min(totalSamples, Math.floor(totalSamples * fraction));
      if (boundary > 0) set.add(boundary);
    }
    set.add(totalSamples);
    return [...set].sort((a, b) => a - b);
  }

  /**
   * Chi-square of pairs of values (Westfeld & Pfitzmann) over a histogram of 8-bit samples.
   * @returns {{ chi2: number, df: number }}
   */
  chiSquareOfPairs(histogram, minExpectedFrequency) {
    let chi2 = 0;
    let usedPairs = 0;
    for (let k = 0; k < 128; k++) {
      const even = histogram[2 * k];
      const expected = (even + histogram[2 * k + 1]) / 2;
      if (expected < minExpectedFrequency) continue;
      const diff = even - expected;
      chi2 += (diff * diff) / expected;
      usedPairs++;
    }
    return { chi2, df: usedPairs - 1 };
  }

  analyzeChannel(data, channel, stride, width, height, boundaries, params) {
    const totalSamples = width * height;
    const histogram = new Uint32Array(256);
    const windows = [];
    let ones = 0;
    let boundaryIndex = 0;

    for (let i = 0; i < totalSamples; i++) {
      const value = data[i * stride + channel];
      histogram[value]++;
      ones += value & 1;

      if (i + 1 === boundaries[boundaryIndex]) {
        const { chi2, df } = this.chiSquareOfPairs(histogram, params.minExpectedFrequency);
        const reliable = df >= params.minDegreesOfFreedom && totalSamples >= params.minSamplesPerChannel;
        windows.push({
          fraction: (i + 1) / totalSamples,
          samples: i + 1,
          chi2,
          df,
          p: reliable ? chiSquareSurvival(chi2, df) : null
        });
        boundaryIndex++;
      }
    }

    let best = null;
    for (const window of windows) {
      if (window.p !== null && (best === null || window.p > best.p)) {
        best = window;
      }
    }

    return {
      channel,
      windows,
      maxP: best ? best.p : null,
      bestFraction: best ? best.fraction : null,
      ones,
      samples: totalSamples,
      serialCorrelation: this.serialCorrelation(data, channel, stride, width, height)
    };
  }

  /**
   * Pearson correlation between the LSB of each pixel and the LSB of its right-hand neighbour
   * (pairs never cross a row boundary). Returns null when it is undefined (zero variance / width 1).
   */
  serialCorrelation(data, channel, stride, width, height) {
    let n = 0;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;

    for (let y = 0; y < height; y++) {
      let index = y * width * stride + channel;
      let current = data[index] & 1;
      for (let x = 1; x < width; x++) {
        index += stride;
        const next = data[index] & 1;
        n++;
        sumX += current;
        sumY += next;
        sumXY += current & next;
        current = next;
      }
    }

    if (n === 0) return null;
    // For bits, E[X²] = E[X], so the variances reduce to nΣx - (Σx)².
    const varX = n * sumX - sumX * sumX;
    const varY = n * sumY - sumY * sumY;
    if (varX === 0 || varY === 0) return null;
    return (n * sumXY - sumX * sumY) / Math.sqrt(varX * varY);
  }

  summarize(perChannel, samplesPerChannel, channels, params) {
    let best = null;
    for (const entry of perChannel) {
      if (entry.maxP !== null && (best === null || entry.maxP > best.maxP)) {
        best = entry;
      }
    }

    const totalOnes = perChannel.reduce((acc, entry) => acc + entry.ones, 0);
    const totalSamples = samplesPerChannel * channels;
    const ratio = totalOnes / totalSamples;
    const correlations = perChannel
      .map((entry) => entry.serialCorrelation)
      .filter((value) => value !== null);

    return {
      samplesPerChannel,
      channelCount: channels,
      sufficientData: best !== null,
      chiSquare: {
        maxP: best ? best.maxP : null,
        channel: best ? best.channel : null,
        fraction: best ? best.bestFraction : null,
        perChannel: perChannel.map(({ channel, maxP, bestFraction, windows }) => ({
          channel,
          maxP,
          bestFraction,
          windows
        }))
      },
      lsbRatio: {
        ratio,
        zScore: Math.abs(ratio - 0.5) * 2 * Math.sqrt(totalSamples)
      },
      serialCorrelation: {
        mean: correlations.length
          ? correlations.reduce((acc, value) => acc + value, 0) / correlations.length
          : null,
        perChannel: perChannel.map((entry) => entry.serialCorrelation)
      },
      parameters: {
        minExpectedFrequency: params.minExpectedFrequency,
        minDegreesOfFreedom: params.minDegreesOfFreedom,
        minSamplesPerChannel: params.minSamplesPerChannel
      }
    };
  }
}

module.exports = new LsbAnalyzer();
module.exports.LsbAnalyzer = LsbAnalyzer;
module.exports.DEFAULT_PARAMS = DEFAULT_PARAMS;
