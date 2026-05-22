import fs from 'node:fs';
import path from 'node:path';
import PhotoshopIngestService from '../services/photoshopIngest.js';
import SharpImageProcessor from '../services/sharpProcessor.js';

const templateId = process.argv[2];
const imagePath = process.argv[3];
const format = (process.argv[4] || 'jpeg').toLowerCase();

if (!templateId || !imagePath) {
  process.stderr.write('usage: node server/scripts/debug_export_one.mjs <templateId> <imagePath> [jpeg|psd]\n');
  process.exit(2);
}

const outputRoot = path.resolve('./output');
const svc = new PhotoshopIngestService({ outputRoot });

const psId = 783;
const label = `debug_${Date.now()}`;
const task = {
  label,
  updates: [
    {
      varType: 'img',
      psId,
      imagePath: path.resolve(imagePath),
      sourceName: path.basename(imagePath),
    },
  ],
};

const res = await svc.exportTemplateBatch({
  templateId,
  variables: [],
  tasks: [task],
  format,
  quality: 95,
  dryRun: false,
});

process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);

const out0 = Array.isArray(res?.results) ? res.results[0] : null;
const outPath = out0?.outputPath ? String(out0.outputPath) : '';
if (outPath && fs.existsSync(outPath) && (format === 'jpg' || format === 'jpeg')) {
  const buf = fs.readFileSync(outPath);
  const proc = new SharpImageProcessor();
  const boundsAuto = await proc.getNonWhiteBounds(buf, { alphaThreshold: 10 });
  process.stdout.write(`${JSON.stringify({ outputPath: outPath, boundsAuto }, null, 2)}\n`);
}

