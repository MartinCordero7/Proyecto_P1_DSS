/**
 * @file lsbEmbedder.js
 * @description Reference LSB *replacement* embedder/extractor used ONLY to build test samples
 * (images "with hidden data") and to validate the detector. It is not part of the service.
 *
 * Layout: a 4-byte big-endian payload length followed by the payload bytes, written MSB first
 * into the least significant bit of consecutive samples (R, G, B, R, G, B, ...) starting at the
 * first pixel (top-left, row by row) -- the behavior of the simplest and most common tools.
 */
const crypto = require('crypto');

const HEADER_BYTES = 4;

/** Maximum payload size (bytes) that fits in the image. */
function capacityBytes(pixels) {
  return Math.max(0, Math.floor(pixels.data.length / 8) - HEADER_BYTES);
}

/**
 * @param {{ width: number, height: number, channels: number, data: Buffer }} pixels
 * @param {Buffer} payload
 * @returns {{ width: number, height: number, channels: number, data: Buffer }} New pixel buffer.
 */
function embed(pixels, payload) {
  if (payload.length > capacityBytes(pixels)) {
    throw new Error(`Payload (${payload.length} B) exceeds image capacity (${capacityBytes(pixels)} B)`);
  }

  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt32BE(payload.length, 0);
  const message = Buffer.concat([header, payload]);

  const data = Buffer.from(pixels.data);
  for (let bit = 0; bit < message.length * 8; bit++) {
    const value = (message[bit >> 3] >> (7 - (bit & 7))) & 1;
    data[bit] = (data[bit] & 0xfe) | value;
  }

  return { ...pixels, data };
}

/**
 * Recovers the payload written by embed(). Proves that a sample really carries hidden data.
 * @returns {Buffer}
 */
function extract(pixels) {
  const readBytes = (offsetBits, count) => {
    const out = Buffer.alloc(count);
    for (let i = 0; i < count * 8; i++) {
      out[i >> 3] |= (pixels.data[offsetBits + i] & 1) << (7 - (i & 7));
    }
    return out;
  };

  const length = readBytes(0, HEADER_BYTES).readUInt32BE(0);
  if (length > capacityBytes(pixels)) {
    throw new Error('No valid payload header found');
  }
  return readBytes(HEADER_BYTES * 8, length);
}

const SPANISH_TEXT =
  'Mensaje secreto de prueba para el Proyecto Integrador de Desarrollo de Software Seguro. ' +
  'Esta cadena de texto plano se oculta en el bit menos significativo de los pixeles. ';

/**
 * Deterministic payloads.
 * - 'random': incompressible bytes (what an encrypted or compressed payload looks like).
 * - 'text': plain Spanish ASCII text (low-entropy payload, harder to detect).
 */
function makePayload(kind, length, seed = 'stego') {
  if (kind === 'text') {
    return Buffer.from(SPANISH_TEXT.repeat(Math.ceil(length / SPANISH_TEXT.length)).slice(0, length), 'ascii');
  }
  if (kind === 'random') {
    const chunks = [];
    for (let counter = 0, size = 0; size < length; counter++) {
      const block = crypto.createHash('sha256').update(`${seed}:${counter}`).digest();
      chunks.push(block);
      size += block.length;
    }
    return Buffer.concat(chunks).subarray(0, length);
  }
  throw new Error(`Unknown payload kind: ${kind}`);
}

module.exports = { HEADER_BYTES, capacityBytes, embed, extract, makePayload };
