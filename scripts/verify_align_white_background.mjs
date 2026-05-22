import sharp from 'sharp';
import SharpImageProcessor from '../server/services/sharpProcessor.js';

const processor = new SharpImageProcessor();

const targetWidth = 200;
const targetHeight = 120;

const black = await sharp({
  create: { width: 120, height: 60, channels: 3, background: { r: 0, g: 0, b: 0 } },
})
  .png()
  .toBuffer();

const input = await sharp({
  create: { width: 300, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } },
})
  .composite([{ input: black, left: 90, top: 70 }])
  .png()
  .toBuffer();

const out = await processor.alignWhiteBackgroundImage({
  imageBuffer: input,
  targetWidth,
  targetHeight,
  referenceRect: { left: 100, top: 0, width: targetWidth, height: targetHeight },
  manualGuides: { leftX: 120, rightX: 220 },
});

const meta = await sharp(out.buffer).metadata();
if (meta.width !== targetWidth || meta.height !== targetHeight) {
  throw new Error(`bad output size: ${meta.width}x${meta.height}`);
}

console.log('PASS');

