const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const lsbEngine = require('../../src/engine/lsbEngine');
const { SteganographyEngineService } = require('../../src/services/steganographyEngine.service');
const { validateEngineOutput } = require('../../src/contracts/analysisEngine.contract');
const { createCover, embedRandomBits } = require('../fixtures/syntheticImages');
const { createCorruptPngBuffer } = require('../fixtures/testHelper');

const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const WIDTH = 200;
const HEIGHT = 200;

function buildBmp({ rgb, width, height }) {
  const rowStride = Math.floor((24 * width + 31) / 32) * 4;
  const buf = Buffer.alloc(54 + rowStride * height);
  buf.write('BM', 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22); // top-down
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 3;
      const d = 54 + y * rowStride + x * 3;
      buf[d] = rgb[s + 2];
      buf[d + 1] = rgb[s + 1];
      buf[d + 2] = rgb[s];
    }
  }
  return buf;
}

describe('LsbEngine', () => {
  let tempDir;
  const cover = createCover({ width: WIDTH, height: HEIGHT });
  const stego = embedRandomBits(cover, cover.data.length);

  const toPng = (image) =>
    sharp(image.data, { raw: { width: image.width, height: image.height, channels: image.channels } })
      .png()
      .toBuffer();

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `lsb_engine_test_${Date.now()}`);
    await fs.promises.mkdir(tempDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  async function analyzeFile(name, buffer, mimeType) {
    const filePath = path.join(tempDir, name);
    await fs.promises.writeFile(filePath, buffer);
    return lsbEngine.analyze({
      filePath,
      originalName: name,
      mimeType,
      size: buffer.length,
      sha256: SHA256,
      userId: USER_ID
    });
  }

  it('reports "sin_indicios" and approves an original PNG', async () => {
    const result = await analyzeFile('original.png', await toPng(cover), 'image/png');

    expect(result.status).toBe('sin_indicios');
    expect(result.action).toBe('aprobado');
    expect(result.indicators.anomaly_score).toBeLessThan(0.4);
  });

  it('reports "sospechoso" and quarantines a PNG with a full LSB payload', async () => {
    const result = await analyzeFile('stego.png', await toPng(stego), 'image/png');

    expect(result.status).toBe('sospechoso');
    expect(result.action).toBe('cuarentena');
    expect(result.indicators.anomaly_score).toBeGreaterThanOrEqual(0.75);
    expect(result.limitations).toMatch(/no concluyente/i);
  });

  it('detects the same payload in a BMP', async () => {
    const bmp = buildBmp({ rgb: stego.data, width: WIDTH, height: HEIGHT });

    const result = await analyzeFile('stego.bmp', bmp, 'image/bmp');

    expect(result.status).toBe('sospechoso');
    expect(result.indicators.format).toBe('bmp');
  });

  it('returns the record fields required by the project (Annex C + date)', async () => {
    const result = await analyzeFile('fields.png', await toPng(stego), 'image/png');

    expect(result).toMatchObject({
      user_id: USER_ID,
      filename: 'fields.png',
      sha256: SHA256,
      technique: 'lsb_statistical_analysis'
    });
    expect(result.analysis_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(result.analyzed_at).toString()).not.toBe('Invalid Date');
    expect(result.indicators).toEqual(
      expect.objectContaining({
        anomaly_score: expect.any(Number),
        threshold: 0.75,
        format: 'png',
        width: WIDTH,
        height: HEIGHT,
        channels_analyzed: 3
      })
    );
  });

  it('generates a different analysis_id for every analysis', async () => {
    const png = await toPng(cover);

    const first = await analyzeFile('a.png', png, 'image/png');
    const second = await analyzeFile('b.png', png, 'image/png');

    expect(first.analysis_id).not.toBe(second.analysis_id);
  });

  it('is not conclusive (warning) for a palette PNG', async () => {
    const png = await sharp(cover.data, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
      .png({ palette: true, colours: 16 })
      .toBuffer();

    const result = await analyzeFile('palette.png', png, 'image/png');

    expect(result.status).toBe('no_concluyente');
    expect(result.action).toBe('advertencia');
    expect(result.indicators.reason).toBe('palette_image');
    expect(result.indicators.anomaly_score).toBeNull();
  });

  it('is not conclusive for a tiny image', async () => {
    const tiny = createCover({ width: 8, height: 8 });

    const result = await analyzeFile('tiny.png', await toPng(tiny), 'image/png');

    expect(result.status).toBe('no_concluyente');
    expect(result.indicators.reason).toBe('insufficient_data');
  });

  it('reports "con_error" and rejects an undecodable PNG', async () => {
    const result = await analyzeFile('corrupt.png', createCorruptPngBuffer(), 'image/png');

    expect(result.status).toBe('con_error');
    expect(result.action).toBe('rechazo');
  });

  it('fails secure with "con_error" when the file no longer exists, without leaking paths', async () => {
    const result = await lsbEngine.analyze({
      filePath: path.join(tempDir, 'missing.png'),
      originalName: 'missing.png',
      mimeType: 'image/png',
      size: 10,
      sha256: SHA256,
      userId: USER_ID
    });

    expect(result.status).toBe('con_error');
    expect(result.action).toBe('rechazo');
    expect(JSON.stringify(result)).not.toContain(tempDir);
  });

  it('satisfies the integration contract through SteganographyEngineService', async () => {
    const service = new SteganographyEngineService();
    service.registerEngine(lsbEngine);
    const filePath = path.join(tempDir, 'contract.png');
    await fs.promises.writeFile(filePath, await toPng(stego));

    const result = await service.executeAnalysis({
      filePath,
      originalName: 'contract.png',
      mimeType: 'image/png',
      size: 1000,
      sha256: SHA256,
      userId: USER_ID
    });

    expect(validateEngineOutput(result)).toBe(true);
    expect(result.status).toBe('sospechoso');
  });
});
