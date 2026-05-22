import sharp from 'sharp';

const img = process.argv[2];
if (!img) {
  process.stderr.write('usage: node server/scripts/inspect_rgba.mjs <image>\n');
  process.exit(2);
}

const { data, info } = await sharp(img, { failOnError: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

const w = info.width;
const h = info.height;
const cx = Number.isFinite(Number(process.argv[3])) ? Math.max(0, Math.min(w - 1, Math.floor(Number(process.argv[3])))) : Math.floor(w / 2);
const cy = Number.isFinite(Number(process.argv[4])) ? Math.max(0, Math.min(h - 1, Math.floor(Number(process.argv[4])))) : Math.floor(h / 2);
const r = 20;

let minA = 255;
let maxA = 0;
let minRGB = [255, 255, 255];
let maxRGB = [0, 0, 0];
let n = 0;
let sum = [0, 0, 0, 0];

for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y += 1) {
  for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x += 1) {
    const i = (y * w + x) * 4;
    const rr = data[i];
    const gg = data[i + 1];
    const bb = data[i + 2];
    const aa = data[i + 3];
    minA = Math.min(minA, aa);
    maxA = Math.max(maxA, aa);
    minRGB[0] = Math.min(minRGB[0], rr);
    minRGB[1] = Math.min(minRGB[1], gg);
    minRGB[2] = Math.min(minRGB[2], bb);
    maxRGB[0] = Math.max(maxRGB[0], rr);
    maxRGB[1] = Math.max(maxRGB[1], gg);
    maxRGB[2] = Math.max(maxRGB[2], bb);
    sum[0] += rr;
    sum[1] += gg;
    sum[2] += bb;
    sum[3] += aa;
    n += 1;
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      img,
      size: { w, h },
      sampleBox: { cx, cy, r },
      minA,
      maxA,
      minRGB,
      maxRGB,
      mean: sum.map((v) => v / n),
    },
    null,
    2,
  )}\n`,
);
