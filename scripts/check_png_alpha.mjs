import sharp from 'sharp';

const fp = process.argv[2];
if (!fp) {
  console.error('missing_file_path');
  process.exit(2);
}

const img = sharp(fp);
const meta = await img.metadata();
const stats = await img.stats();

const alpha = stats.channels && stats.channels.length >= 4 ? stats.channels[3] : null;
const alphaSummary = alpha
  ? { min: alpha.min, max: alpha.max, mean: alpha.mean, stdev: alpha.stdev }
  : null;

process.stdout.write(
  JSON.stringify(
    {
      file: fp,
      width: meta.width,
      height: meta.height,
      format: meta.format,
      channels: meta.channels,
      hasAlpha: meta.hasAlpha === true || meta.channels === 4,
      alpha: alphaSummary,
    },
    null,
    2,
  ),
);

