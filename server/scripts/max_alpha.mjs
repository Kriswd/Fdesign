import sharp from 'sharp';

const img = process.argv[2];
if (!img) {
  process.stderr.write('usage: node server/scripts/max_alpha.mjs <image>\n');
  process.exit(2);
}

const { data, info } = await sharp(img, { failOnError: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let maxA = 0;
let countNonZero = 0;
for (let i = 3; i < data.length; i += 4) {
  const a = data[i];
  if (a > maxA) maxA = a;
  if (a > 0) countNonZero += 1;
}

process.stdout.write(`${JSON.stringify({ img, size: { w: info.width, h: info.height }, maxA, countNonZero }, null, 2)}\n`);

