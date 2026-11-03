const crypto = require('crypto');
const analysisConfig = require('./analysisConfig');
const pixelReader = require('./pixelReader');
const lsbAnalyzer = require('./lsbAnalyzer');
const classifier = require('./classifier');
const { AnalysisNotApplicableError, ImageDecodeError } = require('./errors');

const round = (value, decimals = 6) =>
  value === null || value === undefined ? null : Number(value.toFixed(decimals));

/**
 * Steganography analysis engine (Persona 2). Implements the integration contract expected by
 * SteganographyEngineService: `analyze(context)` receives the validated image description and
 * returns the analysis record (see src/contracts/analysisEngine.contract.js).
 *
 * Connect it with: steganographyEngineService.registerEngine(lsbEngine)
 */
class LsbEngine {
  /**
   * @param {Object} context
   * @param {string} context.filePath - Internal storage path of the validated image.
   * @param {string} context.originalName - Sanitized client filename.
   * @param {string} context.mimeType - Real MIME type ('image/png' | 'image/bmp').
   * @param {string} context.sha256 - SHA-256 of the original bytes.
   * @param {string} context.userId - Authenticated user UUID.
   * @returns {Promise<Object>} Analysis record. Never throws for image-related problems: they are
   *   expressed as 'no_concluyente' or 'con_error' results.
   */
  async analyze(context) {
    try {
      const pixels = await pixelReader.readPixels(context.filePath, context.mimeType);
      const analysis = lsbAnalyzer.analyze(pixels);
      const verdict = classifier.classify(analysis);
      return this.buildResult(context, verdict, this.buildIndicators(verdict, pixels, analysis));
    } catch (err) {
      return this.buildFailureResult(context, err);
    }
  }

  buildFailureResult(context, err) {
    let verdict;
    if (err instanceof AnalysisNotApplicableError) {
      verdict = classifier.classifyNotApplicable(err.code);
    } else if (err instanceof ImageDecodeError) {
      verdict = classifier.classifyError(err.code);
    } else {
      // Unexpected failure: log server-side only, never expose internals to the client.
      console.error('[LsbEngine] Unexpected analysis failure:', err.message);
      verdict = classifier.classifyError('analysis_failed');
    }
    return this.buildResult(context, verdict, this.buildIndicators(verdict));
  }

  buildIndicators(verdict, pixels = null, analysis = null) {
    const indicators = {
      anomaly_score: round(verdict.anomalyScore),
      threshold: analysisConfig.suspiciousThreshold,
      clean_threshold: analysisConfig.cleanThreshold,
      reason: verdict.reason
    };

    if (pixels) {
      indicators.format = pixels.format;
      indicators.width = pixels.width;
      indicators.height = pixels.height;
      indicators.channels_analyzed = pixels.channels;
    }

    if (analysis) {
      indicators.samples_per_channel = analysis.samplesPerChannel;
      indicators.chi_square_p_max = round(analysis.chiSquare.maxP);
      indicators.chi_square_window_fraction = round(analysis.chiSquare.fraction, 2);
      indicators.chi_square_channel = analysis.chiSquare.channel;
      indicators.lsb_ratio = round(analysis.lsbRatio.ratio);
      indicators.lsb_ratio_zscore = round(analysis.lsbRatio.zScore, 3);
      indicators.serial_correlation = round(analysis.serialCorrelation.mean);
    }

    return indicators;
  }

  buildResult(context, verdict, indicators) {
    return {
      analysis_id: crypto.randomUUID(),
      user_id: context.userId,
      filename: context.originalName,
      sha256: context.sha256,
      technique: analysisConfig.technique,
      status: verdict.status,
      indicators,
      action: verdict.action,
      limitations: verdict.limitations,
      analyzed_at: new Date().toISOString()
    };
  }
}

module.exports = new LsbEngine();
module.exports.LsbEngine = LsbEngine;
