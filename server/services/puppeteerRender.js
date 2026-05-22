import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PuppeteerRenderService {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isInitialized = false;
  }

  /**
   * 生成 @font-face CSS（服务端渲染时保证字体一致性）
   * @param {string} baseUrl - 资源基地址，如 http://localhost:3001
   * @returns {string}
   */
  generateFontFaceCSS(baseUrl) {
    const fonts = [
      {
        family: 'DIN Pro',
        weights: {
          '300': 'DINPro-Light.otf',
          '400': 'DINPro-Regular.otf',
          '500': 'DINPro-Medium.otf',
          '700': 'DINPro-Bold.otf',
          '900': 'DINPro-Black.otf',
        },
      },
      {
        family: 'DIN',
        weights: {
          '300': 'DIN-Light.otf',
          '400': 'DIN-Regular.otf',
          '500': 'DIN-Medium.otf',
          '700': 'DIN-Bold.otf',
          '900': 'DIN-Black.otf',
        },
      },
      {
        family: 'HYQiHei',
        weights: {
          '45': 'HYQiHei_45J.ttf',
          '55': 'HYQiHei_55J.ttf',
          '75': 'HYQiHei_75S.ttf',
        },
      },
      {
        family: 'Trade Gothic LT Std',
        weights: {
          '700': 'TradeGothicLTStd-BoldExt.otf',
          '400': 'TradeGothicLTStd-Extended.otf',
        },
      },
    ];

    const rules = [];
    const safeBaseUrl = baseUrl.replace(/\/$/, '');

    for (const font of fonts) {
      for (const [weight, relPath] of Object.entries(font.weights)) {
        const url = `${safeBaseUrl}/3-字体/${encodeURI(relPath)}`;
        rules.push(
          `@font-face{font-family:"${font.family}";src:url("${url}") format("opentype");font-weight:${weight};font-style:normal;font-display:block;}`,
        );
      }
    }

    return rules.join('\n');
  }

  /**
   * 构建服务端渲染用 HTML 文档
   * @param {object} params - 参数
   * @param {string} params.dom - 画板 DOM（通常是 exportRoot.outerHTML）
   * @param {number} params.width - 画布宽度
   * @param {number} params.height - 画布高度
   * @param {string} params.baseUrl - 资源基地址（用于字体/资源加载）
   * @param {string} params.backgroundColor - 背景色
   * @returns {string}
   */
  buildExportHtml({ dom, width, height, baseUrl, backgroundColor }) {
    const fontCss = this.generateFontFaceCSS(baseUrl);
    const bg = backgroundColor || '#ffffff';

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; background: ${bg}; }
      body { overflow: hidden; }
      ${fontCss}
    </style>
  </head>
  <body>
    <div id="__artboard__" style="position:relative;width:${width}px;height:${height}px;background:${bg};overflow:hidden;">
      ${dom}
    </div>
  </body>
</html>`;
  }

  async initialize() {
    if (this.isInitialized) return;

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--enable-webgl',
        '--use-gl=swiftshader',
        '--font-render-hinting=medium',
        '--LCD subpixel',
        '--high-dpi-support=1',
      ],
      defaultViewport: {
        width: 2000,
        height: 2000,
        deviceScaleFactor: 2,
      },
    });

    this.page = await this.browser.newPage();
    await this.page.setCacheEnabled(true);

    this.isInitialized = true;
    console.log('Puppeteer 渲染服务已初始化');
  }

  /**
   * 将 DOM 渲染为多张切片图片（一次 setContent，多次截图）
   * @param {object} params - 参数
   * @param {string} params.dom - 导出节点 outerHTML
   * @param {number} params.width - 画布宽度
   * @param {number} params.height - 画布高度
   * @param {number[]} params.sliceLines - 切片线 y 坐标（升序或乱序均可）
   * @param {string} params.baseUrl - 资源基地址（用于字体/资源加载）
   * @param {string} params.format - png/jpeg/webp
   * @param {number} params.quality - jpeg/webp 质量
   * @param {number} params.deviceScaleFactor - DPR
   * @param {string} params.backgroundColor - 背景色
   * @returns {Promise<{format:string,slices:{index:number,y0:number,y1:number,data:Buffer}[]}>}
   */
  async renderDomToSlices({
    dom,
    width,
    height,
    sliceLines,
    baseUrl,
    format = 'png',
    quality = 95,
    deviceScaleFactor = 2,
    backgroundColor = '#ffffff',
  }) {
    await this.initialize();

    const w = Math.ceil(width);
    const h = Math.ceil(height);
    const htmlContent = this.buildExportHtml({ dom, width: w, height: h, baseUrl, backgroundColor });

    await this.page.setViewport({
      width: w,
      height: h,
      deviceScaleFactor,
    });

    await this.page.setContent(htmlContent, {
      waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
    });
    await this.waitForFonts(8000);

    const sorted = (Array.isArray(sliceLines) ? sliceLines : [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    const boundaries = [0, ...sorted, h].filter((n, i, arr) => i === 0 || n > arr[i - 1]);
    const slices = [];

    for (let i = 0; i < boundaries.length - 1; i += 1) {
      const y0 = boundaries[i];
      const y1 = boundaries[i + 1];
      const sliceH = Math.max(0, y1 - y0);
      if (sliceH <= 0) continue;

      const screenshotOptions = {
        type: format,
        clip: { x: 0, y: y0, width: w, height: sliceH },
        omitBackground: false,
      };
      if (format === 'jpeg' || format === 'webp') screenshotOptions.quality = quality;

      const buf = await this.page.screenshot(screenshotOptions);
      slices.push({ index: i + 1, y0, y1, data: buf });
    }

    return { format, slices };
  }

  async renderToImage(htmlContent, options = {}) {
    await this.initialize();

    const {
      width = 790,
      height = 1200,
      format = 'png',
      quality = 100,
      waitForFonts = true,
      fontTimeout = 5000,
    } = options;

    await this.page.setViewport({
      width: Math.ceil(width),
      height: Math.ceil(height),
      deviceScaleFactor: 2,
    });

    await this.page.setContent(htmlContent, {
      waitUntil: waitForFonts ? ['load', 'domcontentloaded', 'networkidle0'] : 'domcontentloaded',
    });

    if (waitForFonts) {
      await this.waitForFonts(fontTimeout);
    }

    const screenshotOptions = {
      type: format,
      clip: {
        x: 0,
        y: 0,
        width: width,
        height: height,
      },
      omitBackground: false,
    };

    if (format === 'jpeg' || format === 'webp') {
      screenshotOptions.quality = quality;
    }

    const screenshot = await this.page.screenshot(screenshotOptions);

    return {
      data: screenshot,
      width,
      height,
      format,
    };
  }

  async renderToPDF(htmlContent, options = {}) {
    await this.initialize();

    const {
      width = 790,
      height = 1200,
      scale = 1,
      margin = { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground = true,
    } = options;

    await this.page.setViewport({
      width: Math.ceil(width),
      height: Math.ceil(height),
      deviceScaleFactor: 2,
    });

    await this.page.setContent(htmlContent, {
      waitUntil: 'networkidle0',
    });

    const pdfOptions = {
      format: 'a4',
      scale,
      margin,
      printBackground,
      preferCSSPageSize: false,
    };

    const pdf = await this.page.pdf(pdfOptions);

    return {
      data: pdf,
      width,
      height,
    };
  }

  async renderMultiple(layers, options = {}) {
    await this.initialize();

    const {
      outputDir = './output',
      format = 'png',
      quality = 100,
      prefix = 'layer',
    } = options;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const results = [];

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const htmlContent = this.generateLayerHTML(layer);

      const result = await this.renderToImage(htmlContent, {
        width: layer.width,
        height: layer.height,
        format,
        quality,
      });

      const filename = `${prefix}_${layer.name || i}_${Date.now()}.${format}`;
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, result.data);

      results.push({
        layerId: layer.id,
        layerName: layer.name,
        filename,
        filepath,
        width: result.width,
        height: result.height,
      });
    }

    return results;
  }

  generateLayerHTML(layer) {
    const styles = this.generateLayerStyles(layer);

    const contentHTML = this.generateLayerContent(layer);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          .layer-container {
            position: relative;
            width: ${layer.width}px;
            height: ${layer.height}px;
            overflow: hidden;
          }
          ${styles}
        </style>
      </head>
      <body>
        <div class="layer-container">
          ${contentHTML}
        </div>
      </body>
      </html>
    `;
  }

  generateLayerStyles(layer) {
    let css = `
      .layer {
        position: absolute;
        left: ${layer.x}px;
        top: ${layer.y}px;
        width: ${layer.width}px;
        height: ${layer.height}px;
        opacity: ${layer.opacity || 1};
        mix-blend-mode: ${layer.blendMode || 'normal'};
      }
    `;

    if (layer.type === 'text' && layer.textData) {
      css += `
        .layer.text {
          font-family: "${layer.textData.fontFamily}", Arial, sans-serif;
          font-size: ${layer.textData.fontSize}px;
          font-weight: ${layer.textData.fontWeight};
          font-style: ${layer.textData.fontStyle};
          color: ${layer.textData.color};
          letter-spacing: ${layer.textData.letterSpacing}em;
          line-height: ${layer.textData.lineHeight}px;
          text-align: ${layer.textData.textAlign};
          text-transform: ${layer.textData.textTransform};
          white-space: pre-wrap;
          word-break: break-word;
        }
      `;
    }

    if (layer.type === 'image' && layer.imageData) {
      css += `
        .layer.image {
          background-image: url('${layer.imageData}');
          background-size: cover;
          background-position: top left;
          background-repeat: no-repeat;
        }
      `;
    }

    if (layer.effects) {
      const effectsCSS = this.generateEffectsCSS(layer.effects);
      if (effectsCSS) {
        css += effectsCSS;
      }
    }

    return css;
  }

  generateEffectsCSS(effects) {
    let css = '';

    if (effects.dropShadow) {
      const { color, offsetX, offsetY, blur } = effects.dropShadow;
      css += `.layer { box-shadow: ${offsetX}px ${offsetY}px ${blur}px ${color}; }\n`;
    }

    if (effects.innerShadow) {
      const { color, offsetX, offsetY, blur } = effects.innerShadow;
      css += `.layer { box-shadow: inset ${offsetX}px ${offsetY}px ${blur}px ${color}; }\n`;
    }

    if (effects.stroke) {
      const { color, size, position } = effects.stroke;
      if (position === 'outside') {
        css += `.layer { border: ${size}px solid ${color}; }\n`;
      } else if (position === 'center') {
        css += `.layer { -webkit-text-stroke: ${size}px ${color}; }\n`;
      }
    }

    return css;
  }

  generateLayerContent(layer) {
    if (layer.type === 'text' && layer.textData) {
      return `<div class="layer text">${layer.textData.content}</div>`;
    }

    if (layer.type === 'image' && layer.imageData) {
      return `<div class="layer image"></div>`;
    }

    return `<div class="layer"></div>`;
  }

  async waitForFonts(timeout = 5000) {
    try {
      await this.page.waitForFunction(
        () => document.fonts.ready.then(() => true),
        { timeout }
      );
    } catch {
      console.warn('字体加载超时，继续渲染...');
    }
  }

  async getPerformanceMetrics() {
    return await this.page.metrics();
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isInitialized = false;
      console.log('Puppeteer 渲染服务已关闭');
    }
  }
}

export default PuppeteerRenderService;
