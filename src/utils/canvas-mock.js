/**
 * 浏览器环境下的 Node canvas 兼容层：
 * 用于让 require('canvas') 的调用在 Vite/浏览器中不报错，并返回 HTMLCanvasElement。
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {HTMLCanvasElement}
 */
export function createCanvas(width, height) {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  // Fallback for non-browser environments (though we are in browser)
  throw new Error('Canvas creation not supported in this environment');
}

/**
 * 浏览器 Image 的轻量兼容导出，满足部分库对 canvas.Image 的访问。
 */
export class Image {
  constructor() {
    if (typeof document !== 'undefined') {
      return new window.Image();
    }
  }
}

// CommonJS compatibility for require('canvas')
export default {
  createCanvas,
  Image
};
