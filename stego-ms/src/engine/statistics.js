/**
 * @file statistics.js
 * @description Small numerical helpers for the LSB analyzer, implemented without external
 * dependencies: log-gamma (Lanczos), regularized incomplete gamma, chi-square survival function.
 */

const EPSILON = 1e-14;
const FLOAT_MIN = 1e-300;
const MAX_ITERATIONS = 2000;

const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7
];

/**
 * Natural logarithm of the gamma function (Lanczos approximation, valid for x > 0).
 * @param {number} x
 * @returns {number}
 */
function logGamma(x) {
  if (x < 0.5) {
    // Reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let sum = LANCZOS_COEFFICIENTS[0];
  for (let i = 1; i < LANCZOS_G + 2; i++) {
    sum += LANCZOS_COEFFICIENTS[i] / (z + i);
  }
  const t = z + LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

/**
 * Regularized lower incomplete gamma P(a, x) through its power series (best for x < a + 1).
 */
function gammaPSeries(a, x) {
  let term = 1 / a;
  let sum = term;
  for (let n = 1; n < MAX_ITERATIONS; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * EPSILON) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/**
 * Regularized upper incomplete gamma Q(a, x) through a continued fraction (best for x >= a + 1).
 * Modified Lentz algorithm.
 */
function gammaQContinuedFraction(a, x) {
  let b = x + 1 - a;
  let c = 1 / FLOAT_MIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < MAX_ITERATIONS; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FLOAT_MIN) d = FLOAT_MIN;
    c = b + an / c;
    if (Math.abs(c) < FLOAT_MIN) c = FLOAT_MIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPSILON) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/**
 * Regularized upper incomplete gamma function Q(a, x) = Γ(a, x) / Γ(a).
 * @param {number} a - Shape, a > 0.
 * @param {number} x - Argument, x >= 0.
 * @returns {number} Value in [0, 1].
 */
function regularizedGammaQ(a, x) {
  if (!(a > 0) || Number.isNaN(x)) {
    return NaN;
  }
  if (x <= 0) {
    return 1;
  }
  const q = x < a + 1 ? 1 - gammaPSeries(a, x) : gammaQContinuedFraction(a, x);
  return Math.min(1, Math.max(0, q));
}

/**
 * Survival function (upper tail) of the chi-square distribution: P(X >= chi2) for X ~ χ²(df).
 * @param {number} chi2 - Observed statistic.
 * @param {number} df - Degrees of freedom (> 0).
 * @returns {number} p in [0, 1].
 */
function chiSquareSurvival(chi2, df) {
  return regularizedGammaQ(df / 2, chi2 / 2);
}

module.exports = {
  logGamma,
  regularizedGammaQ,
  chiSquareSurvival
};
