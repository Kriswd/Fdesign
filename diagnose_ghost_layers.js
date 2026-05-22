
import fs from 'fs';
import { readPsd } from 'ag-psd';
import { Image } from 'canvas';

// 模拟浏览器环境的 Canvas API
global.HTMLCanvasElement = class {};
global.HTMLImageElement = Image;

async function diagnose() {
  const filePath = 'e:\\ProjectX\\Fdesign\\天猫主图APP可选颜色规范.psd';
  console.log(`Reading PSD: ${filePath}`);
  
  const buffer = fs.readFileSync(filePath);
  const psd = readPsd(buffer, {
    skipLayerImageData: false,
    skipThumbnail: true,
    useImageData: true, // 获取原始像素数据
  });

  console.log(`PSD Dimensions: ${psd.width}x${psd.height}`);

  // 递归查找目标图层
  const targetNames = ['COLOR01-正 拷贝 2', 'COLOR03-正 拷贝 2', '矩形 1 拷贝'];
  
  function traverse(children, path = '') {
    for (const child of children) {
      const currentPath = path ? `${path} > ${child.name}` : child.name;
      
      if (targetNames.some(name => child.name === name)) {
        analyzeLayer(child, currentPath, psd);
      }

      if (child.children) {
        traverse(child.children, currentPath);
      }
    }
  }

  traverse(psd.children);
}

function analyzeLayer(layer, fullPath, psd) {
  console.log('\n' + '='.repeat(50));
  console.log(`Analyzing Layer: ${layer.name}`);
  console.log(`Full Path: ${fullPath}`);
  console.log('='.repeat(50));

  // 1. 基础属性
  console.log('Basic Properties:');
  console.log(`- Hidden (PSD): ${layer.hidden}`);
  console.log(`- Visible (Inferred): ${!layer.hidden}`);
  console.log(`- Opacity: ${layer.opacity} (0-255) -> ${(layer.opacity/255).toFixed(2)}`);
  console.log(`- Blend Mode: ${layer.blendMode}`);
  console.log(`- Clipping Mask: ${layer.clipping}`); // 是否是剪切蒙版
  
  // 2. 几何属性
  console.log('\nGeometry:');
  console.log(`- Left: ${layer.left}, Top: ${layer.top}`);
  console.log(`- Right: ${layer.right}, Bottom: ${layer.bottom}`);
  const width = layer.right - layer.left;
  const height = layer.bottom - layer.top;
  console.log(`- Dimensions: ${width}x${height}`);
  console.log(`- Canvas Bounds: 0,0,${psd.width},${psd.height}`);
  
  const isOffCanvas = layer.right <= 0 || layer.bottom <= 0 || layer.left >= psd.width || layer.top >= psd.height;
  console.log(`- Is Off-Canvas: ${isOffCanvas}`);

  // 3. 像素分析
  if (layer.imageData) {
    console.log('\nPixel Analysis:');
    const { width: w, height: h, data } = layer.imageData;
    console.log(`- Image Data Size: ${w}x${h}`);
    
    let totalPixels = w * h;
    let transparentCount = 0;
    let whiteCount = 0;
    let coloredCount = 0;
    let maxAlpha = 0;
    
    // 采样分析颜色分布
    const colorSamples = [];
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const a = data[i+3];

      if (a > maxAlpha) maxAlpha = a;

      if (a < 10) {
        transparentCount++;
        continue;
      }

      // 简单判断白色/灰色
      if (r > 200 && g > 200 && b > 200 && Math.abs(r-g) < 10 && Math.abs(g-b) < 10) {
        whiteCount++;
        continue;
      }

      coloredCount++;
      if (colorSamples.length < 10) {
        const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
        colorSamples.push(`RGBA(${r},${g},${b},${a}) Diff:${maxDiff}`);
      }
    }

    console.log(`- Max Alpha: ${maxAlpha}`);
    console.log(`- Transparent Pixels: ${transparentCount} (${(transparentCount/totalPixels*100).toFixed(1)}%)`);
    console.log(`- White/LightGray Pixels: ${whiteCount} (${(whiteCount/totalPixels*100).toFixed(1)}%)`);
    console.log(`- Colored Pixels: ${coloredCount} (${(coloredCount/totalPixels*100).toFixed(1)}%)`);
    console.log(`- First 10 Colored Samples:\n  ${colorSamples.join('\n  ')}`);
  } else if (layer.canvas) {
      console.log('\nPixel Analysis: Has Canvas but not raw imageData (not analyzed in this script)');
  } else {
    console.log('\nPixel Analysis: No Image Data');
  }
}

diagnose().catch(err => console.error(err));
