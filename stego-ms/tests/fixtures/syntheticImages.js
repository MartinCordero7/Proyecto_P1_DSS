/**
 * Deterministic synthetic images used to verify the steganography engine.
 * They are controlled stand-ins for the math; real-image behavior is covered by the sample tests.
 */

/** Deterministic generator in [0, 1) so every run produces the same images. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Synthetic "cover" whose pairs of values are clearly NOT equalized: even values are
 * about 70 % more frequent than their odd partner (as happens in images with a combed histogram).
 */
function createCover({ width, height, channels = 3, seed = 1 }) {
  const random = createRandom(seed);
  const data = Buffer.alloc(width * height * channels);
  for (let i = 0; i < data.length; i++) {
    const pairIndex = 10 + Math.floor(random() * 100);
    data[i] = 2 * pairIndex + (random() < 0.7 ? 0 : 1);
  }
  return { width, height, channels, data };
}

/** Replaces the LSB of the first `count` samples (in interleaved order) with random bits. */
function embedRandomBits(image, count, seed = 99) {
  const random = createRandom(seed);
  const data = Buffer.from(image.data);
  for (let i = 0; i < Math.min(count, data.length); i++) {
    data[i] = (data[i] & 0xfe) | (random() < 0.5 ? 0 : 1);
  }
  return { ...image, data };
}

module.exports = {
  createRandom,
  createCover,
  embedRandomBits
};
