import fs from 'node:fs';
import SharpImageProcessor from '../services/sharpProcessor.js';

const img = process.argv[2];
if (!img) {
  process.stderr.write('missing image path\n');
  process.exit(2);
}

const buf = fs.readFileSync(img);
const p = new SharpImageProcessor();

const bounds250 = await p.getNonWhiteBounds(buf, { whiteThreshold: 250, alphaThreshold: 10 });
const boundsAuto = await p.getNonWhiteBounds(buf, { alphaThreshold: 10 });

process.stdout.write(
  `${JSON.stringify(
    {
      img,
      bounds250,
      boundsAuto,
    },
    null,
    2,
  )}\n`,
);

