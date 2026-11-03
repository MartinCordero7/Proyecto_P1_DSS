/**
 * Reproducible sample generator (T09 evidence).
 *
 * From each cover photo in --covers it writes, into --out:
 *   - originals (no known hidden data), as PNG and BMP;
 *   - copies with a real LSB payload (random / plain text, several fill ratios), as PNG and BMP;
 *   - manifest.json describing every file, with its SHA-256 and the expected outcome.
 * Every modified file is read back from disk and its payload extracted, proving that it really
 * carries the hidden data.
 *
 * Usage: npm run samples:generate -- [--covers samples/covers] [--out samples/generated] [--width 640]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const pixelReader = require('../src/engine/pixelReader');
const { capacityBytes, embed, extract, makePayload } = require('./lib/lsbEmbedder');
const { encodeBmp24 } = require('./lib/bmpWriter');

const COVER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp']);

/**
 * expected:
 *  - 'sin_indicios': original image, must not be flagged.
 *  - 'sospechoso': the detector is expected to flag it.
 *  - 'no_garantizado': documented limitation (small payload or plain-text payload): it may go unnoticed.
 */
const VARIANTS = [
  { name: 'original', formats: ['png', 'bmp'], payload: null, expected: 'sin_indicios' },
  { name: 'lsb_aleatorio_100', formats: ['png'], payload: { kind: 'random', ratio: 1 }, expected: 'sospechoso' },
  { name: 'lsb_aleatorio_50', formats: ['png', 'bmp'], payload: { kind: 'random', ratio: 0.5 }, expected: 'sospechoso' },
  { name: 'lsb_aleatorio_10', formats: ['png'], payload: { kind: 'random', ratio: 0.1 }, expected: 'no_garantizado' },
  { name: 'lsb_texto_100', formats: ['png'], payload: { kind: 'text', ratio: 1 }, expected: 'no_garantizado' }
];

async function loadCover(file, width) {
  const { data, info } = await sharp(file)
    .resize({ width, withoutEnlargement: true })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 3) {
    throw new Error(`Cover ${file} could not be converted to RGB`);
  }
  return { width: info.width, height: info.height, channels: 3, data };
}

async function encode(pixels, format) {
  if (format === 'bmp') {
    return encodeBmp24(pixels);
  }
  return sharp(pixels.data, { raw: { width: pixels.width, height: pixels.height, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * @param {Object} options
 * @param {string} options.coversDir
 * @param {string} options.outDir
 * @param {number} [options.width]
 * @returns {Promise<Object[]>} Manifest entries.
 */
async function generateSamples({ coversDir, outDir, width = 640 }) {
  const covers = fs
    .readdirSync(coversDir)
    .filter((file) => COVER_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort();

  if (covers.length === 0) {
    throw new Error(`No cover images (.png/.jpg/.bmp) found in ${coversDir}`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const manifest = [];

  for (const coverFile of covers) {
    const coverName = path.basename(coverFile, path.extname(coverFile)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const cover = await loadCover(path.join(coversDir, coverFile), width);

    for (const variant of VARIANTS) {
      let pixels = cover;
      let payload = null;

      if (variant.payload) {
        const length = Math.floor(capacityBytes(cover) * variant.payload.ratio);
        payload = makePayload(variant.payload.kind, length, `${coverName}:${variant.name}`);
        pixels = embed(cover, payload);
      }

      for (const format of variant.formats) {
        const fileName = `${coverName}_${variant.name}.${format}`;
        const filePath = path.join(outDir, fileName);
        const bytes = await encode(pixels, format);
        fs.writeFileSync(filePath, bytes);

        // Proof of content: read the file back and recover the payload.
        if (payload) {
          const mime = format === 'bmp' ? 'image/bmp' : 'image/png';
          const reread = await pixelReader.readPixels(filePath, mime);
          if (!extract(reread).equals(payload)) {
            throw new Error(`Payload verification failed for ${fileName}`);
          }
        }

        manifest.push({
          file: fileName,
          cover: coverFile,
          format,
          width: pixels.width,
          height: pixels.height,
          hidden_data: payload
            ? { technique: 'lsb_replacement', payload_kind: variant.payload.kind, fill_ratio: variant.payload.ratio, payload_bytes: payload.length }
            : null,
          expected: variant.expected,
          sha256: crypto.createHash('sha256').update(bytes).digest('hex')
        });
      }
    }
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function parseArgs(argv) {
  const args = { covers: 'samples/covers', out: 'samples/generated', width: 640 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in args) || argv[i + 1] === undefined) {
      throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    }
    args[key] = key === 'width' ? parseInt(argv[i + 1], 10) : argv[i + 1];
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  generateSamples({ coversDir: path.resolve(args.covers), outDir: path.resolve(args.out), width: args.width })
    .then((manifest) => {
      console.log(`[samples] ${manifest.length} files written to ${args.out} (payloads verified by extraction)`);
    })
    .catch((err) => {
      console.error('[samples] ERROR:', err.message);
      process.exit(1);
    });
}

module.exports = { generateSamples, VARIANTS };
