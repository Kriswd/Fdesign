import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function clampInt(n, min, max) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return null;
  return Math.max(min, Math.min(max, v));
}

function computeDetailScale({
  boundsWidth,
  boundsHeight,
  span,
  targetHeight,
  preserveDetail,
  maxDetailScale,
  maxCanvasPixels,
}) {
  if (preserveDetail !== true) return { scale: 1, reason: 'disabled' };
  const bw = Number(boundsWidth) || 0;
  const bh = Number(boundsHeight) || 0;
  const sw = Number(span) || 0;
  const th = Number(targetHeight) || 0;
  if (!(bw > 0 && bh > 0 && sw > 0 && th > 0)) return { scale: 1, reason: 'invalid_input' };
  const cap = Math.max(1, Math.min(8, Math.floor(Number(maxDetailScale) || 4)));
  const byWidth = bw / sw;
  const byHeight = bh / th;
  const raw = Math.max(1, Math.floor(Math.max(byWidth, byHeight)));
  let scale = Math.max(1, Math.min(cap, raw));
  const maxPx = Math.max(1, Math.floor(Number(maxCanvasPixels) || 128000000));
  while (scale > 1 && sw * th * scale * scale > maxPx) scale -= 1;
  return { scale, reason: scale > 1 ? 'preserve_detail' : 'keep_base' };
}

async function applyDownscaleSharpenIfNeeded({
  imageBuffer,
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
}) {
  const sw = Number(sourceWidth) || 0;
  const sh = Number(sourceHeight) || 0;
  const tw = Number(targetWidth) || 0;
  const th = Number(targetHeight) || 0;
  if (!(sw > 0 && sh > 0 && tw > 0 && th > 0)) {
    return { buffer: imageBuffer, applied: false, ratio: null };
  }
  const ratio = Math.max(sw / tw, sh / th);
  if (!(ratio > 1.2)) {
    return { buffer: imageBuffer, applied: false, ratio };
  }
  const sharpened = await sharp(imageBuffer, { failOnError: false })
    .sharpen({ sigma: 0.9 })
    .toBuffer();
  return { buffer: sharpened, applied: true, ratio };
}

function scanNonWhiteBounds(data, width, height, whiteThreshold, alphaThreshold) {
  const w = Math.floor(Number(width) || 0);
  const h = Math.floor(Number(height) || 0);
  if (!data || w <= 0 || h <= 0) return null;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const expected = w * h * 4;
  if (bytes.length < expected) return null;

  const wThr = Math.max(0, Math.min(255, Math.floor(Number(whiteThreshold) || 0)));
  const aThr = Math.max(0, Math.min(255, Math.floor(Number(alphaThreshold) || 0)));

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const a = bytes[i + 3];
      if (a <= aThr) continue;
      const r = bytes[i];
      const g = bytes[i + 1];
      const b = bytes[i + 2];
      if (r >= wThr && g >= wThr && b >= wThr) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  const left = minX;
  const top = minY;
  const right = maxX + 1;
  const bottom = maxY + 1;
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    right,
    bottom,
  };
}

function scanNonTransparentBounds(data, width, height, alphaThreshold) {
  const w = Math.floor(Number(width) || 0);
  const h = Math.floor(Number(height) || 0);
  if (!data || w <= 0 || h <= 0) return null;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const expected = w * h * 4;
  if (bytes.length < expected) return null;

  const aThr = Math.max(0, Math.min(255, Math.floor(Number(alphaThreshold) || 0)));

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const a = bytes[i + 3];
      if (a <= aThr) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  const left = minX;
  const top = minY;
  const right = maxX + 1;
  const bottom = maxY + 1;
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    right,
    bottom,
  };
}

function computeAutoWhiteThresholdFromBorder(data, width, height, alphaThreshold) {
  const w = Math.floor(Number(width) || 0);
  const h = Math.floor(Number(height) || 0);
  if (!data || w <= 0 || h <= 0) return 250;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const expected = w * h * 4;
  if (bytes.length < expected) return 250;
  const aThr = Math.max(0, Math.min(255, Math.floor(Number(alphaThreshold) || 0)));
  const edge = Math.max(2, Math.min(24, Math.floor(Math.min(w, h) / 12)));
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let n = 0;

  const sample = (x, y) => {
    const i = (y * w + x) * 4;
    const a = bytes[i + 3];
    if (a <= aThr) return;
    rSum += bytes[i];
    gSum += bytes[i + 1];
    bSum += bytes[i + 2];
    n += 1;
  };

  for (let y = 0; y < edge; y += 1) {
    for (let x = 0; x < w; x += 1) sample(x, y);
  }
  for (let y = Math.max(0, h - edge); y < h; y += 1) {
    for (let x = 0; x < w; x += 1) sample(x, y);
  }
  for (let y = edge; y < Math.max(edge, h - edge); y += 1) {
    for (let x = 0; x < edge; x += 1) sample(x, y);
    for (let x = Math.max(edge, w - edge); x < w; x += 1) sample(x, y);
  }

  if (n <= 0) return 250;
  const rMean = rSum / n;
  const gMean = gSum / n;
  const bMean = bSum / n;
  const bgMin = Math.min(rMean, gMean, bMean);
  const thr = Math.floor(Math.max(200, Math.min(254, bgMin - 1)));
  return thr;
}

class SharpImageProcessor {
  constructor() {
    this.defaultOptions = {
      quality: 90,
      progressive: true,
      compressionLevel: 6,
    };
  }

  async processImage(imageBuffer, options = {}) {
    const {
      width,
      height,
      fit = 'cover',
      position = 'center',
      format = 'png',
      quality = 90,
      background = { r: 255, g: 255, b: 255, alpha: 1 },
      flatten = false,
      sharpen = false,
      blur = 0,
      rotate = 0,
      flip = false,
      flop = false,
      negate = false,
      grayscale = false,
      tint = null,
      brightness = 0,
      saturation = 0,
      contrast = 0,
    } = options;

    let pipeline = sharp(imageBuffer);

    if (flatten) {
      pipeline = pipeline.flatten({ background });
    }

    if (flip) {
      pipeline = pipeline.flip();
    }

    if (flop) {
      pipeline = pipeline.flop();
    }

    if (rotate !== 0) {
      pipeline = pipeline.rotate(rotate, { background });
    }

    if (negate) {
      pipeline = pipeline.negate();
    }

    if (grayscale) {
      pipeline = pipeline.grayscale();
    }

    if (tint) {
      pipeline = pipeline.tint(tint);
    }

    if (brightness !== 0) {
      pipeline = pipeline.modulate({
        brightness: 1 + brightness / 100,
      });
    }

    if (saturation !== 0) {
      pipeline = pipeline.modulate({
        saturation: 1 + saturation / 100,
      });
    }

    if (contrast !== 0) {
      pipeline = pipeline.linear(contrast / 100 + 1, -(128 * contrast / 100) + 128);
    }

    if (blur > 0) {
      pipeline = pipeline.blur(blur);
    }

    if (sharpen) {
      pipeline = pipeline.sharpen();
    }

    if (width || height) {
      pipeline = pipeline.resize(width, height, {
        fit,
        position,
        background,
      });
    }

    switch (format) {
      case 'jpeg':
      case 'jpg':
        pipeline = pipeline.jpeg({
          quality,
          progressive: this.defaultOptions.progressive,
          mozjpeg: true,
        });
        break;
      case 'png':
        pipeline = pipeline.png({
          compressionLevel: this.defaultOptions.compressionLevel,
          progressive: this.defaultOptions.progressive,
        });
        break;
      case 'webp':
        pipeline = pipeline.webp({
          quality,
          effort: 6,
        });
        break;
      case 'avif':
        pipeline = pipeline.avif({
          quality,
          effort: 6,
        });
        break;
      case 'tiff':
        pipeline = pipeline.tiff({
          quality,
          compression: 'lzw',
        });
        break;
      default:
        pipeline = pipeline.png({
          compressionLevel: this.defaultOptions.compressionLevel,
        });
    }

    const result = await pipeline.toBuffer({
      resolveWithObject: true,
    });

    return {
      data: result.data,
      info: result.info,
    };
  }

  async cropImage(imageBuffer, cropOptions) {
    const { left, top, width, height } = cropOptions;

    return await sharp(imageBuffer)
      .extract({ left, top, width, height })
      .toBuffer();
  }

  async resizeImage(imageBuffer, width, height, options = {}) {
    const { fit = 'cover', position = 'center', background = { r: 255, g: 255, b: 255, alpha: 1 } } = options;

    return await sharp(imageBuffer)
      .resize(width, height, {
        fit,
        position,
        background,
      })
      .toBuffer();
  }

  async convertFormat(imageBuffer, targetFormat, options = {}) {
    const { quality = 90 } = options;

    return await this.processImage(imageBuffer, { format: targetFormat, quality });
  }

  async optimizeImage(imageBuffer, options = {}) {
    const { maxWidth, maxHeight, maxSize, quality = 85 } = options;

    let pipeline = sharp(imageBuffer);

    if (maxWidth || maxHeight) {
      pipeline = pipeline.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    pipeline = pipeline.jpeg({ quality, mozjpeg: true });

    let result = await pipeline.toBuffer();

    if (maxSize && result.length > maxSize) {
      let currentQuality = quality;
      let currentSize = result.length;

      while (currentSize > maxSize && currentQuality > 10) {
        currentQuality -= 5;
        result = await sharp(imageBuffer)
          .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: currentQuality, mozjpeg: true })
          .toBuffer();
        currentSize = result.length;
      }
    }

    return result;
  }

  async createThumbnail(imageBuffer, size, options = {}) {
    const { format: _format = 'webp', quality = 80 } = options;

    return await sharp(imageBuffer)
      .resize(size, size, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality })
      .toBuffer();
  }

  async extractFrame(imageBuffer, frameNumber, options = {}) {
    const { fps: _fps = 30, width, height } = options;

    return await this.resizeImage(imageBuffer, width, height, options);
  }

  async createSpriteSheet(images, options = {}) {
    const {
      maxWidth: _maxWidth = 2048,
      columns = 4,
      padding = 10,
      background = { r: 0, g: 0, b: 0, alpha: 0 },
    } = options;

    const imageObjects = await Promise.all(
      images.map(async (img, index) => {
        const buffer = typeof img === 'string' ? fs.readFileSync(img) : img;
        const metadata = await sharp(buffer).metadata();
        return {
          buffer,
          index,
          width: metadata.width,
          height: metadata.height,
        };
      })
    );

    const rows = Math.ceil(imageObjects.length / columns);
    const maxHeight = Math.max(...imageObjects.map(img => img.height));
    const totalWidth = Math.max(...imageObjects.map(img => img.width * columns));

    const spriteSheet = sharp({
      create: {
        width: totalWidth + padding * (columns - 1),
        height: maxHeight * rows + padding * (rows - 1),
        channels: 4,
        background,
      },
    });

    const composite = [];

    for (let i = 0; i < imageObjects.length; i++) {
      const img = imageObjects[i];
      const col = i % columns;
      const row = Math.floor(i / columns);

      composite.push({
        input: img.buffer,
        left: col * (img.width + padding),
        top: row * (maxHeight + padding),
      });
    }

    return await spriteSheet.composite(composite).png().toBuffer();
  }

  async sliceImage(imageBuffer, slices, options = {}) {
    const { format = 'png', quality: _quality = 90, outputDir = './slices' } = options;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const results = [];

    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      const { left, top, width, height, name } = slice;

      const sliceBuffer = await sharp(imageBuffer)
        .extract({ left, top, width, height })
        .toBuffer();

      const filename = `${name || `slice_${i}`}.${format}`;
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, sliceBuffer);

      results.push({
        id: slice.id || i,
        name,
        filename,
        filepath,
        width,
        height,
      });
    }

    return results;
  }

  async createResponsiveImages(imageBuffer, breakpoints, options = {}) {
    const { formats = ['webp', 'jpeg'], quality = 85 } = options;

    const results = {};

    for (const breakpoint of breakpoints) {
      const { width, suffix } = breakpoint;

      const resizedBuffer = await sharp(imageBuffer)
        .resize(width, null, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();

      results[`${suffix}`] = {};

      for (const format of formats) {
        const formatBuffer = await this.convertFormat(resizedBuffer, format, { quality });
        results[`${suffix}`][format] = formatBuffer;
      }
    }

    return results;
  }

  async addWatermark(imageBuffer, watermarkBuffer, options = {}) {
    const {
      position = 'southeast',
      opacity = 0.5,
      margin = 10,
      scale = 0.2,
    } = options;

    const imageMetadata = await sharp(imageBuffer).metadata();
    const watermarkMetadata = await sharp(watermarkBuffer).metadata();

    const maxWatermarkWidth = imageMetadata.width * scale;
    const scaleFactor = maxWatermarkWidth / watermarkMetadata.width;

    const resizedWatermark = await sharp(watermarkBuffer)
      .resize(Math.round(watermarkMetadata.width * scaleFactor), null, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .ensureAlpha(opacity)
      .toBuffer();

    let left, top;

    switch (position) {
      case 'northwest':
        left = margin;
        top = margin;
        break;
      case 'northeast':
        left = imageMetadata.width - watermarkMetadata.width * scaleFactor - margin;
        top = margin;
        break;
      case 'southwest':
        left = margin;
        top = imageMetadata.height - watermarkMetadata.height * scaleFactor - margin;
        break;
      case 'southeast':
      default:
        left = imageMetadata.width - watermarkMetadata.width * scaleFactor - margin;
        top = imageMetadata.height - watermarkMetadata.height * scaleFactor - margin;
        break;
      case 'center':
        left = (imageMetadata.width - watermarkMetadata.width * scaleFactor) / 2;
        top = (imageMetadata.height - watermarkMetadata.height * scaleFactor) / 2;
        break;
    }

    return await sharp(imageBuffer)
      .composite([
        {
          input: resizedWatermark,
          left: Math.round(left),
          top: Math.round(top),
        },
      ])
      .toBuffer();
  }

  async getImageInfo(imageBuffer) {
    const metadata = await sharp(imageBuffer).metadata();
    const stats = await sharp(imageBuffer).stats();

    return {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      space: metadata.space,
      channels: metadata.channels,
      depth: metadata.depth,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation,
      exif: metadata.exif,
      icc: metadata.icc,
      iptc: metadata.iptc,
      xmp: metadata.xmp,
      tiff: metadata.tiff,
      stats: {
        isOpaque: stats.isOpaque,
        entropy: stats.entropy,
        mean: stats.mean,
        min: stats.min,
        max: stats.max,
      },
      size: imageBuffer.length,
    };
  }

  async getNonWhiteBounds(imageBuffer, options = {}) {
    const alphaThreshold = Number.isFinite(Number(options.alphaThreshold)) ? Number(options.alphaThreshold) : 10;
    const raw = await sharp(imageBuffer, { failOnError: false })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const hasWhite = Number.isFinite(Number(options.whiteThreshold));
    const whiteThreshold = hasWhite
      ? Number(options.whiteThreshold)
      : computeAutoWhiteThresholdFromBorder(raw.data, raw.info.width, raw.info.height, alphaThreshold);
    const bounds = scanNonWhiteBounds(raw.data, raw.info.width, raw.info.height, whiteThreshold, alphaThreshold);
    if (!bounds) return null;
    return {
      ...bounds,
      imageWidth: raw.info.width,
      imageHeight: raw.info.height,
      whiteThreshold,
      alphaThreshold,
    };
  }

  async getNonTransparentBounds(imageBuffer, options = {}) {
    const alphaThreshold = Number.isFinite(Number(options.alphaThreshold)) ? Number(options.alphaThreshold) : 10;
    const raw = await sharp(imageBuffer, { failOnError: false })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const bounds = scanNonTransparentBounds(raw.data, raw.info.width, raw.info.height, alphaThreshold);
    if (!bounds) return null;
    return {
      ...bounds,
      imageWidth: raw.info.width,
      imageHeight: raw.info.height,
      alphaThreshold,
    };
  }

  async alignCutoutAlphaImage({
    imageBuffer,
    targetWidth,
    targetHeight,
    referenceRect,
    manualGuides,
    alphaThreshold,
    preserveDetail,
    maxDetailScale,
    maxCanvasPixels,
  } = {}) {
    const tw = Math.round(Number(targetWidth) || 0);
    const th = Math.round(Number(targetHeight) || 0);
    if (tw <= 0 || th <= 0) {
      return { buffer: imageBuffer, applied: false };
    }

    const bounds = await this.getNonTransparentBounds(imageBuffer, { alphaThreshold });
    const rectLeftAbs = Number(referenceRect?.left);
    const hasRectLeftAbs = Number.isFinite(rectLeftAbs);
    const guideLeftAbs = Number(manualGuides?.leftX);
    const guideRightAbs = Number(manualGuides?.rightX);
    const hasGuides = hasRectLeftAbs && Number.isFinite(guideLeftAbs) && Number.isFinite(guideRightAbs) && guideRightAbs > guideLeftAbs;
    const relLeft = hasGuides ? guideLeftAbs - rectLeftAbs : 0;
    const relRight = hasGuides ? guideRightAbs - rectLeftAbs : tw;
    const targetLeft = clampInt(relLeft, 0, tw) ?? 0;
    const targetRight = clampInt(relRight, 0, tw) ?? tw;
    const span = Math.max(1, targetRight - targetLeft);
    const detail = computeDetailScale({
      boundsWidth: bounds ? bounds.width : 0,
      boundsHeight: bounds ? bounds.height : 0,
      span,
      targetHeight: th,
      preserveDetail,
      maxDetailScale,
      maxCanvasPixels,
    });
    const detailScale = detail.scale;
    const canvasW = Math.max(1, tw * detailScale);
    const canvasH = Math.max(1, th * detailScale);
    const spanScaled = Math.max(1, span * detailScale);
    const targetLeftScaled = Math.max(0, Math.min(canvasW - 1, targetLeft * detailScale));

    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      const out = await sharp({
        create: {
          width: canvasW,
          height: canvasH,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
      return { buffer: out, applied: true, debug: { reason: 'no_bounds', targetLeft, targetRight, span } };
    }

    const cropped = sharp(imageBuffer, { failOnError: false })
      .extract({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height })
      .ensureAlpha();

    const resizedRaw = await cropped.resize({ width: spanScaled, height: null, fit: 'inside', withoutEnlargement: false }).toBuffer();
    const meta = await sharp(resizedRaw, { failOnError: false }).metadata();
    const rw = Math.round(Number(meta?.width) || 0);
    const rh = Math.round(Number(meta?.height) || 0);
    if (rw <= 0 || rh <= 0) {
      const out = await sharp({
        create: {
          width: canvasW,
          height: canvasH,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
      return { buffer: out, applied: true, debug: { reason: 'invalid_resized', bounds, targetLeft, targetRight, span } };
    }

    const sharpened = await applyDownscaleSharpenIfNeeded({
      imageBuffer: resizedRaw,
      sourceWidth: bounds.width,
      sourceHeight: bounds.height,
      targetWidth: rw,
      targetHeight: rh,
    });
    let placedBuf = sharpened.buffer;
    let placedW = rw;
    let placedH = rh;
    if (placedH > canvasH) {
      const cropTop = Math.max(0, Math.round((placedH - canvasH) / 2));
      const extracted = await sharp(placedBuf, { failOnError: false })
        .extract({ left: 0, top: cropTop, width: placedW, height: canvasH })
        .toBuffer();
      placedBuf = extracted;
      placedH = canvasH;
    }

    const top = Math.max(0, Math.round((canvasH - placedH) / 2));

    const out = await sharp({
      create: {
        width: canvasW,
        height: canvasH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: placedBuf, left: targetLeftScaled, top }])
      .png()
      .toBuffer();

    return {
      buffer: out,
      applied: true,
      debug: {
        bounds,
        targetLeft,
        targetRight,
        span,
        detailScale,
        canvasW,
        canvasH,
        detailReason: detail.reason,
        sharpenApplied: sharpened.applied === true,
        downscaleRatio: sharpened.ratio != null ? Number(sharpened.ratio) : null,
        placedW,
        placedH,
        top,
      },
    };
  }

  async alignWhiteBackgroundImage({
    imageBuffer,
    targetWidth,
    targetHeight,
    referenceRect,
    manualGuides,
    whiteThreshold,
    alphaThreshold,
    preserveDetail,
    maxDetailScale,
    maxCanvasPixels,
  } = {}) {
    const tw = Math.round(Number(targetWidth) || 0);
    const th = Math.round(Number(targetHeight) || 0);
    if (tw <= 0 || th <= 0) {
      return { buffer: imageBuffer, applied: false };
    }

    const bounds = await this.getNonWhiteBounds(imageBuffer, { whiteThreshold, alphaThreshold });
    const rectLeftAbs = Number(referenceRect?.left);
    const hasRectLeftAbs = Number.isFinite(rectLeftAbs);
    const guideLeftAbs = Number(manualGuides?.leftX);
    const guideRightAbs = Number(manualGuides?.rightX);
    const hasGuides = hasRectLeftAbs && Number.isFinite(guideLeftAbs) && Number.isFinite(guideRightAbs) && guideRightAbs > guideLeftAbs;
    const relLeft = hasGuides ? guideLeftAbs - rectLeftAbs : 0;
    const relRight = hasGuides ? guideRightAbs - rectLeftAbs : tw;
    const targetLeft = clampInt(relLeft, 0, tw) ?? 0;
    const targetRight = clampInt(relRight, 0, tw) ?? tw;
    const span = Math.max(1, targetRight - targetLeft);
    const detail = computeDetailScale({
      boundsWidth: bounds ? bounds.width : 0,
      boundsHeight: bounds ? bounds.height : 0,
      span,
      targetHeight: th,
      preserveDetail,
      maxDetailScale,
      maxCanvasPixels,
    });
    const detailScale = detail.scale;
    const canvasW = Math.max(1, tw * detailScale);
    const canvasH = Math.max(1, th * detailScale);
    const spanScaled = Math.max(1, span * detailScale);
    const targetLeftScaled = Math.max(0, Math.min(canvasW - 1, targetLeft * detailScale));

    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      const buf = await sharp(imageBuffer, { failOnError: false })
        .resize({ width: canvasW, height: canvasH, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();
      return { buffer: buf, applied: true, debug: { reason: 'no_bounds' } };
    }

    const cropped = sharp(imageBuffer, { failOnError: false })
      .extract({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height })
      .ensureAlpha()
      .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } });

    const resizedRaw = await cropped.resize({ width: spanScaled, height: null, fit: 'inside', withoutEnlargement: false }).toBuffer();
    const meta = await sharp(resizedRaw, { failOnError: false }).metadata();
    const rw = Math.round(Number(meta?.width) || 0);
    const rh = Math.round(Number(meta?.height) || 0);
    if (rw <= 0 || rh <= 0) {
      const buf = await sharp(imageBuffer, { failOnError: false })
        .resize({ width: canvasW, height: canvasH, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();
      return { buffer: buf, applied: true, debug: { reason: 'invalid_resized' } };
    }

    const sharpened = await applyDownscaleSharpenIfNeeded({
      imageBuffer: resizedRaw,
      sourceWidth: bounds.width,
      sourceHeight: bounds.height,
      targetWidth: rw,
      targetHeight: rh,
    });
    let placedBuf = sharpened.buffer;
    let placedW = rw;
    let placedH = rh;
    if (placedH > canvasH) {
      const cropTop = Math.max(0, Math.round((placedH - canvasH) / 2));
      const extracted = await sharp(placedBuf, { failOnError: false })
        .extract({ left: 0, top: cropTop, width: placedW, height: canvasH })
        .toBuffer();
      placedBuf = extracted;
      placedH = canvasH;
    }

    const top = Math.max(0, Math.round((canvasH - placedH) / 2));

    const out = await sharp({
      create: {
        width: canvasW,
        height: canvasH,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([{ input: placedBuf, left: targetLeftScaled, top }])
      .png()
      .toBuffer();

    return {
      buffer: out,
      applied: true,
      debug: {
        bounds,
        targetLeft,
        targetRight,
        span,
        detailScale,
        canvasW,
        canvasH,
        detailReason: detail.reason,
        sharpenApplied: sharpened.applied === true,
        downscaleRatio: sharpened.ratio != null ? Number(sharpened.ratio) : null,
        placedW,
        placedH,
        top,
      },
    };
  }

  async alignToRefContent(args = {}) {
    return this.alignWhiteBackgroundImage(args);
  }

  async compareImages(imageBuffer1, imageBuffer2, options = {}) {
    const { threshold = 0.1 } = options;

    const info1 = await this.getImageInfo(imageBuffer1);
    const info2 = await this.getImageInfo(imageBuffer2);

    const resized1 = await sharp(imageBuffer1)
      .resize(100, 100, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const resized2 = await sharp(imageBuffer2)
      .resize(100, 100, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let diffCount = 0;
    const totalPixels = resized1.data.length;

    for (let i = 0; i < resized1.data.length; i++) {
      const diff = Math.abs(resized1.data[i] - resized2.data[i]);
      if (diff > 0) {
        diffCount++;
      }
    }

    const similarity = 1 - diffCount / totalPixels;
    const isIdentical = similarity >= 1 - threshold;

    return {
      identical: isIdentical,
      similarity: similarity * 100,
      sizeDifference: info2.size - info1.size,
      dimensionDifference: {
        width: info2.width - info1.width,
        height: info2.height - info1.height,
      },
    };
  }
}

export default SharpImageProcessor;
