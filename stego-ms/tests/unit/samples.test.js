const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const sharp = require('sharp');
const pixelReader = require('../../src/engine/pixelReader');
const { capacityBytes, embed, extract, makePayload, HEADER_BYTES } = require('../../scripts/lib/lsbEmbedder');
const { encodeBmp24 } = require('../../scripts/lib/bmpWriter');
const { generateSamples } = require('../../scripts/generate-samples');
const { analyzeSamples } = require('../../scripts/analyze-samples');
const { createCover, createRandom } = require('../fixtures/syntheticImages');

describe('lsbEmbedder', () => {
  const cover = createCover({ width: 64, height: 64 });

  it('computes capacity as one bit per sample minus the length header', () => {
    expect(capacityBytes(cover)).toBe(Math.floor((64 * 64 * 3) / 8) - HEADER_BYTES);
  });

  it.each(['random', 'text'])('round-trips a %s payload', (kind) => {
    const payload = makePayload(kind, 300);

    const stego = embed(cover, payload);

    expect(extract(stego).equals(payload)).toBe(true);
  });

  it('only ever changes least significant bits, and does not mutate the cover', () => {
    const original = Buffer.from(cover.data);

    const stego = embed(cover, makePayload('random', 500));

    expect(cover.data.equals(original)).toBe(true);
    for (let i = 0; i < stego.data.length; i++) {
      expect(stego.data[i] >> 1).toBe(cover.data[i] >> 1);
    }
  });

  it('writes sequentially from the first sample (untouched tail keeps the cover bits)', () => {
    const payload = makePayload('random', 100);
    const usedSamples = (HEADER_BYTES + payload.length) * 8;

    const stego = embed(cover, payload);

    for (let i = usedSamples; i < cover.data.length; i++) {
      expect(stego.data[i]).toBe(cover.data[i]);
    }
  });

  it('refuses a payload larger than the capacity', () => {
    expect(() => embed(cover, Buffer.alloc(capacityBytes(cover) + 1))).toThrow(/exceeds image capacity/);
  });

  it('refuses to extract when there is no valid header', () => {
    const blank = { width: 8, height: 8, channels: 3, data: Buffer.alloc(8 * 8 * 3, 0xff) };

    expect(() => extract(blank)).toThrow(/No valid payload header/);
  });

  it('generates deterministic payloads', () => {
    expect(makePayload('random', 64, 'a').equals(makePayload('random', 64, 'a'))).toBe(true);
    expect(makePayload('random', 64, 'a').equals(makePayload('random', 64, 'b'))).toBe(false);
    expect(() => makePayload('unknown', 10)).toThrow();
  });
});

describe('bmpWriter', () => {
  it('produces a BMP that the pixel reader decodes to the same pixels (row padding included)', () => {
    const random = createRandom(7);
    const width = 5;
    const height = 4;
    const data = Buffer.from(Array.from({ length: width * height * 3 }, () => Math.floor(random() * 256)));

    const decoded = pixelReader.readBmp(encodeBmp24({ width, height, channels: 3, data }));

    expect(decoded.data.equals(data)).toBe(true);
  });

  it('only accepts RGB pixels', () => {
    expect(() => encodeBmp24({ width: 1, height: 1, channels: 1, data: Buffer.alloc(1) })).toThrow();
  });
});

describe('sample generation and analysis (T09)', () => {
  let tempDir;
  let coversDir;
  let outDir;
  let manifest;

  beforeAll(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'stego_samples_'));
    coversDir = path.join(tempDir, 'covers');
    outDir = path.join(tempDir, 'out');
    await fs.promises.mkdir(coversDir);

    const cover = createCover({ width: 200, height: 200 });
    await sharp(cover.data, { raw: { width: 200, height: 200, channels: 3 } })
      .png()
      .toFile(path.join(coversDir, 'portada.png'));

    manifest = await generateSamples({ coversDir, outDir });
  });

  afterAll(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('writes originals and modified copies in PNG and BMP plus a manifest', () => {
    const files = manifest.map((entry) => entry.file).sort();

    expect(files).toEqual([
      'portada_lsb_aleatorio_10.png',
      'portada_lsb_aleatorio_100.png',
      'portada_lsb_aleatorio_50.bmp',
      'portada_lsb_aleatorio_50.png',
      'portada_lsb_texto_100.png',
      'portada_original.bmp',
      'portada_original.png'
    ]);
    expect(fs.existsSync(path.join(outDir, 'manifest.json'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'))).toEqual(manifest);
  });

  it('records the real SHA-256 of every file and marks originals as having no hidden data', () => {
    for (const entry of manifest) {
      const bytes = fs.readFileSync(path.join(outDir, entry.file));
      expect(entry.sha256).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
      expect(entry.hidden_data === null).toBe(entry.file.includes('_original'));
    }
  });

  it('really hides the payload: it can be extracted back from the written files', async () => {
    const entry = manifest.find((item) => item.file === 'portada_lsb_aleatorio_50.bmp');
    const pixels = await pixelReader.readPixels(path.join(outDir, entry.file), 'image/bmp');

    expect(extract(pixels).length).toBe(entry.hidden_data.payload_bytes);
  });

  it('analysis meets every hard expectation: originals clean, strong payloads detected', async () => {
    const rows = await analyzeSamples({ dir: outDir });

    for (const { entry, result, verdict } of rows) {
      expect(verdict).not.toMatch(/^FALLO/);
      if (entry.expected === 'sin_indicios') expect(result.status).toBe('sin_indicios');
      if (entry.expected === 'sospechoso') {
        expect(result.status).toBe('sospechoso');
        expect(result.action).toBe('cuarentena');
      }
    }
  });

  it('fails clearly when there are no cover images', async () => {
    const empty = path.join(tempDir, 'empty');
    await fs.promises.mkdir(empty);

    await expect(generateSamples({ coversDir: empty, outDir: path.join(tempDir, 'x') })).rejects.toThrow(
      /No cover images/
    );
  });
});
