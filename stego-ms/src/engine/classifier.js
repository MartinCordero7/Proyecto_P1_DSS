const analysisConfig = require('./analysisConfig');
const { ANALYSIS_STATUSES } = require('../contracts/analysisEngine.contract');

const ANALYSIS_ACTIONS = Object.freeze({
  APROBADO: 'aprobado',
  ADVERTENCIA: 'advertencia',
  CUARENTENA: 'cuarentena',
  RECHAZO: 'rechazo'
});

const LIMITATIONS = Object.freeze({
  sospechoso:
    'Resultado indicativo, no concluyente: un puntaje alto sugiere una posible incrustación LSB, ' +
    'pero puede ser un falso positivo y no prueba la existencia de datos ocultos.',
  sin_indicios:
    'No se detectaron indicios con el análisis estadístico LSB. Esto no descarta datos ocultos con ' +
    'otras técnicas (LSB matching, cargas pequeñas o aleatorias, canal alfa, datos fuera de los píxeles).',
  zona_intermedia:
    'Resultado no concluyente: la evidencia está en una zona intermedia y no permite descartar ni ' +
    'sugerir datos ocultos con suficiente confianza.',
  datos_insuficientes:
    'Resultado no concluyente: la imagen no tiene muestras o pares de valores suficientes para un ' +
    'análisis estadístico fiable (imagen pequeña o con pocos colores distintos).',
  no_aplicable:
    'Resultado no concluyente: el formato o la codificación de esta imagen no es compatible con el ' +
    'análisis LSB de píxeles implementado (por ejemplo, paleta de colores o profundidad distinta de 8 bits).',
  con_error: 'No fue posible decodificar o analizar la imagen; el archivo se rechaza.'
});

class AnalysisClassifier {
  constructor(thresholds = analysisConfig) {
    this.suspiciousThreshold = thresholds.suspiciousThreshold;
    this.cleanThreshold = thresholds.cleanThreshold;
  }

  /**
   * Classifies the indicators produced by the LSB analyzer.
   *
   * The anomaly score is the highest chi-square "pairs of values equalized" probability found
   * (see docs/teoria-esteganografia.md §4.1). The ratio and serial-correlation indicators are
   * reported next to it but do not change the verdict until they are calibrated with real samples.
   *
   * @param {Object} analysis - Output of LsbAnalyzer.analyze().
   * @returns {{ status: string, action: string, anomalyScore: number|null, reason: string, limitations: string }}
   */
  classify(analysis) {
    if (!analysis || !analysis.sufficientData || analysis.chiSquare.maxP === null) {
      return {
        status: ANALYSIS_STATUSES.NO_CONCLUYENTE,
        action: ANALYSIS_ACTIONS.ADVERTENCIA,
        anomalyScore: null,
        reason: 'insufficient_data',
        limitations: LIMITATIONS.datos_insuficientes
      };
    }

    const score = analysis.chiSquare.maxP;

    if (score >= this.suspiciousThreshold) {
      return {
        status: ANALYSIS_STATUSES.SOSPECHOSO,
        action: ANALYSIS_ACTIONS.CUARENTENA,
        anomalyScore: score,
        reason: 'score_above_suspicious_threshold',
        limitations: LIMITATIONS.sospechoso
      };
    }

    if (score < this.cleanThreshold) {
      return {
        status: ANALYSIS_STATUSES.SIN_INDICIOS,
        action: ANALYSIS_ACTIONS.APROBADO,
        anomalyScore: score,
        reason: 'score_below_clean_threshold',
        limitations: LIMITATIONS.sin_indicios
      };
    }

    return {
      status: ANALYSIS_STATUSES.NO_CONCLUYENTE,
      action: ANALYSIS_ACTIONS.ADVERTENCIA,
      anomalyScore: score,
      reason: 'score_in_intermediate_zone',
      limitations: LIMITATIONS.zona_intermedia
    };
  }

  /**
   * Valid image that cannot be analyzed reliably with LSB (palette, 16-bit, ...).
   * @param {string} code - Code of the AnalysisNotApplicableError.
   */
  classifyNotApplicable(code) {
    return {
      status: ANALYSIS_STATUSES.NO_CONCLUYENTE,
      action: ANALYSIS_ACTIONS.ADVERTENCIA,
      anomalyScore: null,
      reason: String(code || 'analysis_not_applicable').toLowerCase(),
      limitations: LIMITATIONS.no_aplicable
    };
  }

  /**
   * Image that could not be decoded or analyzed: fail secure, the file is rejected.
   * @param {string} code
   */
  classifyError(code) {
    return {
      status: ANALYSIS_STATUSES.CON_ERROR,
      action: ANALYSIS_ACTIONS.RECHAZO,
      anomalyScore: null,
      reason: String(code || 'analysis_failed').toLowerCase(),
      limitations: LIMITATIONS.con_error
    };
  }
}

module.exports = new AnalysisClassifier();
module.exports.AnalysisClassifier = AnalysisClassifier;
module.exports.ANALYSIS_ACTIONS = ANALYSIS_ACTIONS;
