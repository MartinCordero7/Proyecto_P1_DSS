/**
 * @file analysisConfig.js
 * @description Classification thresholds of the steganography engine.
 * Initial values come from docs/teoria-esteganografia.md (§5) and are calibrated with real samples.
 * They can be overridden through environment variables without touching the code.
 */

// Loads .env (dotenv) before the variables below are read.
require('../config');

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

const suspiciousThreshold = readNumber('STEGO_SUSPICIOUS_THRESHOLD', 0.75);
const cleanThreshold = readNumber('STEGO_CLEAN_THRESHOLD', 0.4);

if (!(cleanThreshold > 0 && cleanThreshold < suspiciousThreshold && suspiciousThreshold <= 1)) {
  throw new Error(
    'Invalid thresholds: expected 0 < STEGO_CLEAN_THRESHOLD < STEGO_SUSPICIOUS_THRESHOLD <= 1'
  );
}

module.exports = Object.freeze({
  technique: 'lsb_statistical_analysis',
  suspiciousThreshold,
  cleanThreshold
});
