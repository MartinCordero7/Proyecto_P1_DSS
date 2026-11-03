/**
 * Runs the REAL analysis engine over a sample set produced by generate-samples.js and reports
 * the actual results (T09 evidence): status, action, score and indicators per file, compared with
 * the expected outcome recorded in manifest.json.
 *
 * Usage: npm run samples:analyze -- [--dir samples/generated] [--report samples/resultados.md]
 * Exit code 1 if an original image is flagged or an image that must be detected is not.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lsbEngine = require('../src/engine/lsbEngine');

const ANALYST_ID = '00000000-0000-4000-8000-000000000000';

function verdictOf(entry, result) {
  if (entry.expected === 'sin_indicios') {
    return result.status === 'sin_indicios' ? 'OK' : 'FALLO (falso positivo)';
  }
  if (entry.expected === 'sospechoso') {
    return result.status === 'sospechoso' ? 'OK' : 'FALLO (no detectado)';
  }
  // Documented limitation: report what happened without failing.
  return result.status === 'sospechoso' ? 'detectado' : 'no detectado (limitacion documentada)';
}

async function analyzeSamples({ dir }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const rows = [];

  for (const entry of manifest) {
    const filePath = path.join(dir, entry.file);
    const bytes = fs.readFileSync(filePath);
    const result = await lsbEngine.analyze({
      filePath,
      originalName: entry.file,
      mimeType: entry.format === 'bmp' ? 'image/bmp' : 'image/png',
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      userId: ANALYST_ID
    });
    rows.push({ entry, result, verdict: verdictOf(entry, result) });
  }

  return rows;
}

function describeHidden(entry) {
  if (!entry.hidden_data) return 'ninguno';
  const { payload_kind: kind, fill_ratio: ratio } = entry.hidden_data;
  return `LSB ${kind === 'text' ? 'texto' : 'aleatorio'} ${Math.round(ratio * 100)} %`;
}

const fmt = (value, decimals = 4) => (value === null || value === undefined ? 'n/a' : value.toFixed(decimals));

function toMarkdown(rows) {
  const lines = [
    '# Resultados reales del analisis de muestras (T09)',
    '',
    `Generado con \`npm run samples:analyze\` el ${new Date().toISOString()}.`,
    'Tecnica: `lsb_statistical_analysis` (chi-cuadrado de pares de valores, progresivo).',
    '',
    '| Archivo | Dato oculto | Esperado | Estado | Accion | anomaly_score | Proporcion LSB=1 | Correlacion serial | Resultado |',
    '|---|---|---|---|---|---|---|---|---|'
  ];

  for (const { entry, result, verdict } of rows) {
    const ind = result.indicators;
    lines.push(
      `| ${entry.file} | ${describeHidden(entry)} | ${entry.expected} | ${result.status} | ${result.action} | ` +
        `${fmt(ind.anomaly_score)} | ${fmt(ind.lsb_ratio)} | ${fmt(ind.serial_correlation)} | ${verdict} |`
    );
  }

  lines.push('', '`no_garantizado`: caso con limitacion documentada (carga pequena o de texto plano); puede no detectarse.', '');
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { dir: 'samples/generated', report: null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in args) || argv[i + 1] === undefined) {
      throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    }
    args[key] = argv[i + 1];
  }
  return args;
}

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const rows = await analyzeSamples({ dir: path.resolve(args.dir) });

    console.log('archivo'.padEnd(40), 'estado'.padEnd(15), 'accion'.padEnd(12), 'score'.padEnd(8), 'resultado');
    for (const { entry, result, verdict } of rows) {
      console.log(
        entry.file.padEnd(40),
        result.status.padEnd(15),
        result.action.padEnd(12),
        fmt(result.indicators.anomaly_score).padEnd(8),
        verdict
      );
    }

    if (args.report) {
      fs.writeFileSync(path.resolve(args.report), toMarkdown(rows));
      console.log(`\n[samples] report written to ${args.report}`);
    }

    process.exit(rows.some((row) => row.verdict.startsWith('FALLO')) ? 1 : 0);
  })().catch((err) => {
    console.error('[samples] ERROR:', err.message);
    process.exit(1);
  });
}

module.exports = { analyzeSamples, toMarkdown };
