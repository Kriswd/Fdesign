import sharp from 'sharp';

const src = process.argv[2];
const dst = process.argv[3];
const q = Number(process.argv[4] || 100);

if (!src || !dst) {
  process.stderr.write('usage: node server/scripts/convert_png_to_jpg.mjs <src.png> <dst.jpg> [quality]\n');
  process.exit(2);
}

await sharp(src, { failOnError: false })
  .flatten({ background: { r: 255, g: 255, b: 255 } })
  .jpeg({ quality: Math.max(1, Math.min(100, q)), chromaSubsampling: '4:4:4', mozjpeg: true })
  .toFile(dst);

process.stdout.write('ok\n');

