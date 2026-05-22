import sharp from 'sharp';

const img = process.argv[2];
const x0 = Number(process.argv[3] || 390);
const x1 = Number(process.argv[4] || 410);
if (!img) {
  process.stderr.write('usage: node server/scripts/alpha_strip.mjs <image> [x0] [x1]\n');
  process.exit(2);
}

const { data, info } = await sharp(img, { failOnError: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const a = data;
const xx0 = Math.max(0, Math.min(w - 1, Math.floor(x0)));
const xx1 = Math.max(0, Math.min(w - 1, Math.floor(x1)));
let count = 0;
let maxA = 0;
let minRGB = [255, 255, 255];
let minRGBAny = [255, 255, 255];
for (let y = 0; y < h; y += 1) {
  for (let x = xx0; x <= xx1; x += 1) {
    const p = (y * w + x) * 4;
    const rr = a[p];
    const gg = a[p + 1];
    const bb = a[p + 2];
    const aa = a[p + 3];
    minRGBAny[0] = Math.min(minRGBAny[0], rr);
    minRGBAny[1] = Math.min(minRGBAny[1], gg);
    minRGBAny[2] = Math.min(minRGBAny[2], bb);
    if (aa > 0) count += 1;
    if (aa > maxA) maxA = aa;
    if (aa > 0) {
      minRGB[0] = Math.min(minRGB[0], rr);
      minRGB[1] = Math.min(minRGB[1], gg);
      minRGB[2] = Math.min(minRGB[2], bb);
    }
  }
}

process.stdout.write(
  `${JSON.stringify(
    { img, size: { w, h }, x0: xx0, x1: xx1, countNonZeroAlpha: count, maxA, minRGBAny, minRGBAlpha: minRGB },
    null,
    2,
  )}\n`,
);
