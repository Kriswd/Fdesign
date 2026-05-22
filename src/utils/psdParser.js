import * as agPsd from 'ag-psd';
import FontLoader from './fontLoader.js';
import { LAYER_FILTER_RULES } from '../config/layerRules.js';

const { readPsd, initializeCanvas } = agPsd;

// 浏览器环境手动初始化Canvas（官方文档推荐方式）
if (typeof document !== 'undefined') {
  initializeCanvas((width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
}

class PSDParser {
  constructor() {
    this.canvasContext = null;
    this.fontMapping = {};
    this.missingFonts = new Set();
    this.layerIdCounter = 0;
    this.zIndexCounter = 0;
    this.childrenOrder = 'bottom-first';
    this.fontLoader = new FontLoader();
  }

  extractFillColor(layer) {
    // 1. 尝试从 vectorFill (普通形状) 提取
    if (layer.vectorFill?.type === 'color' && layer.vectorFill.color) {
      return this.extractColor(layer.vectorFill.color);
    }
    
    // 2. 尝试从 adjustments (纯色调整图层) 提取
    if (layer.adjustments) {
      const solidFill = layer.adjustments.find(adj => adj.type === 'solidColor');
      if (solidFill && solidFill.color) {
        return this.extractColor(solidFill.color);
      }
    }

    // 3. 尝试从 effects (图层样式叠加) 提取
    if (layer.effects?.solidFill?.[0]?.enabled && layer.effects.solidFill[0].color) {
        return this.extractColor(layer.effects.solidFill[0].color);
    }
    // 兼容 solidFill 不是数组的情况
    if (layer.effects?.solidFill?.enabled && layer.effects.solidFill.color) {
        return this.extractColor(layer.effects.solidFill.color);
    }

    // 4. 尝试从 artboard 背景色提取
    if (layer.artboard && layer.artboard.artboardRect) {
         return layer.artboard.color ? this.extractColor(layer.artboard.color) : 'rgba(255,255,255,1)';
    }
    
    // 5. 检查 fill 属性
    if (layer.fill) {
        return this.extractColor(layer.fill);
    }

    return null;
  }

  setFontMapping(mapping) {
    this.fontMapping = mapping || {};
  }

  async parse(file, onProgress) {
    try {
      const reportProgress = (stage, percent) => {
        if (onProgress) onProgress({ stage, percent });
      };

      reportProgress('正在读取文件...', 5);
      console.log('开始解析PSD文件:', file.name);
      console.log('文件大小:', file.size);
      console.log('文件类型:', file.type);

      this.layerIdCounter = 0;
      this.zIndexCounter = 0;
      this.missingFonts = new Set();
      
      await this.fontLoader.loadAllFonts();
      console.log('字体加载完毕，开始读取 ArrayBuffer');

      let arrayBuffer;
      try {
        arrayBuffer = await file.arrayBuffer();
        console.log('ArrayBuffer 读取成功，长度:', arrayBuffer.byteLength);
      } catch (err) {
        console.error('ArrayBuffer 读取失败:', err);
        throw err;
      }
      
      reportProgress('正在解析文件结构...', 20);
      // Yield to UI to allow render
      await new Promise(resolve => setTimeout(resolve, 50));

      console.log('开始调用 readPsd');
      const psd = readPsd(arrayBuffer, {
        skipThumbnail: true,
        skipCompositeImageData: false,
        skipLayerImageData: false,
        useImageData: true, // 启用像素数据作为备份
        useCanvas: true, // 启用 Canvas 生成
        logMissingFeatures: true,
      });

      if (!psd) {
        throw new Error('PSD解析失败: 无法读取文件');
      }

      // 如果 ag-psd 没有成功生成 canvas，尝试从 imageData 生成
      if (!psd.canvas && psd.imageData) {
        try {
           const canvas = this.pixelDataToCanvas(psd.imageData);
           if (canvas) {
               psd.canvas = canvas;
           }
        } catch (e) {
            console.warn('尝试从 imageData 恢复 canvas 失败', e);
        }
      }

      const layers = [];
      const layerGroups = [];

      this.canvasWidth = psd.width;
      this.canvasHeight = psd.height;
      this.childrenOrder = this.detectChildrenOrder(psd.children, psd.width, psd.height);

      if (psd.children && psd.children.length > 0) {
        reportProgress('正在处理图层...', 50);
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.traverseLayers(psd.children, layers, layerGroups, 0);
      }

      reportProgress('即将完成...', 90);
      console.log(`PSD解析成功:`, {
        文件名: file.name,
        宽度: psd.width,
        高度: psd.height,
        图层数量: layers.length,
        图层组数量: layerGroups.length,
      });
      
      return {
        width: psd.width,
        height: psd.height,
        layers: layers,
        layerGroups: layerGroups,
        fonts: this.extractUsedFonts(layers),
        missingFonts: Array.from(this.missingFonts),
        canvas: psd.canvas || psd.imageData || null,
        version: psd.version,
        colorMode: psd.colorMode,
        depth: psd.depth,
        channels: psd.channels,
      };
    } catch (error) {
      console.error('PSD解析失败:', error);
      console.error('错误类型:', typeof error);
      console.error('错误构造函数:', error && error.constructor ? error.constructor.name : 'Unknown');
      console.error('错误消息:', error.message);
      console.error('错误堆栈:', error.stack);
      console.error('错误详情:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      throw new Error(`PSD解析失败: ${error.message}`);
    }
  }

  async traverseLayers(children, layers, layerGroups, depth) {
    if (!children) return;

    const orderedChildren = this.childrenOrder === 'top-first' ? [...children].reverse() : children;

    for (const child of orderedChildren) {
      // 全局追踪日志
      console.log(`[Layer Trace] Processing: "${child.name}" (ID: ${child.id}), Type: ${child.text ? 'Text' : (child.canvas || child.imageData || child.placedLayer ? 'Image' : 'Shape/Group')}`);

      try {
        // [Critical Rule] 严格过滤隐藏图层
        // 铁律：PSD 中隐藏的图层严禁解析、严禁显示、严禁作为变量。
        const isHidden = child && (child.hidden === true || child.visible === false);
        if (isHidden) {
            console.log(`[Hidden Filter] Skipping hidden layer/group: "${child.name}"`);
            continue;
        }

        // 处理画板 (Artboards)
        if (child.artboard) {
          if (child.children) {
            await this.traverseLayers(child.children, layers, layerGroups, depth);
          }
          continue;
        }

        const layerData = this.extractLayerData(child, depth);
        if (!layerData) continue;

        if (child.children && child.children.length > 0) {
          layerData.type = 'group';
          layerData.children = [];
          layers.push(layerData);
          layerGroups.push(layerData);
          await this.traverseLayers(child.children, layerData.children, layerGroups, depth + 1);
        } else if (child.text) {
          const textData = this.extractTextData(child);
          if (textData) {
            layerData.type = 'text';
            layerData.textData = textData;
            layerData.zIndex = ++this.zIndexCounter;
            layers.push(layerData);
          }
        } else if (child.canvas || child.imageData || child.placedLayer) {
          layerData.type = 'image';
          layerData.isSmartObject = !!child.placedLayer;
          
          try {
            layerData.imageData = this.extractRasterToDataURL(child);
            
            // 如果是 Smart Object 且没有提取到数据，可能是链接文件丢失
            if (layerData.isSmartObject && !layerData.imageData) {
                console.warn(`Smart Object [${child.name}] 图片数据缺失 (可能是链接文件丢失)`);
                layerData.missingLink = true;
                layerData.isWhiteOrTransparent = true; // 标记为无效图层
            }

            // 只要是 Image 类型，无论是否有数据都保留，防止图层丢失
            layerData.zIndex = ++this.zIndexCounter;
            
            // 检查图层透明度 (Opacity / Fill Opacity)
            // ag-psd opacity 是 0-1 之间的浮点数
            if (child.opacity != null && child.opacity < LAYER_FILTER_RULES.THRESHOLDS.MIN_OPACITY) {
                layerData.isWhiteOrTransparent = true;
            }
            if (child.fillOpacity != null && child.fillOpacity < LAYER_FILTER_RULES.THRESHOLDS.MIN_OPACITY) {
                layerData.isWhiteOrTransparent = true;
            }

            // [Ghost Buster v3.7] 针对 Image 类型的嫌疑图层检查
            // 策略：精准打击 + 白名单保护
            const nameLower = (child.name || '').toLowerCase();
            const isSuspect = child.name && LAYER_FILTER_RULES.BANNED_KEYWORDS.some(k => nameLower.includes(k));
            
            // 白名单：防止误杀名为 "sunglasses copy" 的产品图
            // 铁律：如果名字里包含明确的产品词汇，即使它是纯色（可能是解析问题），也强制保留，交给用户处理
            const isWhitelisted = LAYER_FILTER_RULES.WHITELIST_KEYWORDS.some(k => nameLower.includes(k));

            if (isSuspect && !isWhitelisted) {
                // 1. 先做常规的透明/白底检查
                if (this.isLayerWhiteOrTransparent(child)) {
                    layerData.isWhiteOrTransparent = true;
                    console.log(`[Ghost Buster v3.7] "${child.name}" (Suspect) marked as White/Transparent via Pixel Scan -> DROPPED`);
                } 
                // 2. 颜色一致性检查 (Uniformity Check) - RE-ENABLED
                // 恢复 V3.5 逻辑，阈值 TotalMAD < MIN_MAD
                // 只有数学上极度均匀的色块才会被杀掉
                else if (this.isLayerUniform(child)) {
                    layerData.isWhiteOrTransparent = true; // 标记为无效
                    layerData.isGhost = true;
                    console.log(`[Ghost Buster v3.7] "${child.name}" identified as SOLID COLOR (Uniformity High). -> DROPPED as GHOST`);
                } 
                else {
                    console.log(`[Ghost Buster v3.7] "${child.name}" passed uniformity check. -> KEEP`);
                }
            } else {
                // 非嫌疑图层，仅做常规透明/白底检查
                if (this.isLayerWhiteOrTransparent(child)) {
                    layerData.isWhiteOrTransparent = true;
                    console.log(`[Layer Trace] "${child.name}" marked as White/Transparent via Pixel Scan (Image) -> DROPPED`);
                } else {
                    console.log(`[Layer Trace] "${child.name}" passed Pixel Scan (Image)`);
                }
            }

            if (!layerData.isWhiteOrTransparent) {
                layers.push(layerData);
            }
            continue; 
          } catch (error) {
            console.warn(`图层[${child.name}] 图片数据转换失败:`, error);
            // 转换失败但也保留为 Image 类型
            layerData.zIndex = ++this.zIndexCounter;
            
            // [Ghost Buster v3.1] 如果图片数据提取失败，默认标记为无效
            // 特别是对于嫌疑图层，这通常意味着它是不可见的或损坏的
            const isSuspect = child.name && (child.name.toLowerCase().includes('color') || child.name.includes('拷贝') || child.name.includes('copy'));
            if (isSuspect) {
                console.log(`[Ghost Buster] "${child.name}" image extraction failed. Defaulting to DROPPED.`);
                layerData.isWhiteOrTransparent = true;
                layerData.isGhost = true;
            }

            if (!layerData.isWhiteOrTransparent) {
              layers.push(layerData);
            }
            continue;
          }
        } else {
          // Shape / Fallback 处理
          layerData.type = 'shape';
          layerData.fillColor = this.extractFillColor(child);
          const nameLower = (child.name || '').toLowerCase();
          const isSuspect = child.name && LAYER_FILTER_RULES.BANNED_KEYWORDS.some(k => nameLower.includes(k));
          
          // 检查图层透明度 (Shape 也要检查)
          if (child.opacity != null && child.opacity < 0.02) {
              layerData.isWhiteOrTransparent = true;
          }
          if (child.fillOpacity != null && child.fillOpacity < 0.02) {
              layerData.isWhiteOrTransparent = true;
          }
          
          if (child.effects && child.effects.stroke) {
             const stroke = child.effects.stroke[0] || child.effects.stroke;
             if (stroke && stroke.color) {
                 layerData.strokeColor = this.extractColor(stroke.color);
                 layerData.strokeWidth = stroke.size ? stroke.size.value || stroke.size : 1;
                 layerData.isSynthetic = true; // 描边也是合成属性
             }
          }
          
          if (layerData.fillColor) {
              layerData.src = this.createSolidColorDataURL(layerData.fillColor);
              layerData.type = 'image';
              layerData.isSynthetic = true; // 标记为合成图层（纯色/描边）
              if (layerData.width === 0 || layerData.height === 0) {
                   layerData.width = this.canvasWidth || 1440;
                   layerData.height = this.canvasHeight || 1920;
              }
              if (!layerData.imageData) layerData.imageData = layerData.src;

              // 检查纯色是否为白色或透明
              if (this.isColorWhiteOrTransparent(layerData.fillColor)) {
                  layerData.isWhiteOrTransparent = true;
              } else {
                  // [Ghost Buster v3.0] 针对 Shape 类型的嫌疑图层检查
                  // 如果是嫌疑图层，且不是深色，且是纯色（Shape 必定是纯色），则视为占位符丢弃
                  if (isSuspect && !this.isColorDeep(layerData.fillColor)) {
                      console.log(`[Ghost Buster v3.0] "${child.name}" (Shape) identified as SUSPECT SOLID COLOR. -> DROPPED`);
                      layerData.isWhiteOrTransparent = true;
                  }
              }
          } else {
             // 如果没有填充色，也没有描边，那就是纯透明占位符
             if (!layerData.strokeColor) {
                 layerData.isWhiteOrTransparent = true;
             }
          }
          
          // 最终防线：对所有未能识别出内容的图层进行像素扫描
          if (!layerData.isWhiteOrTransparent && this.isLayerWhiteOrTransparent(child)) {
            layerData.isWhiteOrTransparent = true;
          }
          
          if (layerData.isWhiteOrTransparent) {
             console.log(`[Layer Trace] "${child.name}" marked as White/Transparent (Shape) -> DROPPED`);
          } else {
             layerData.zIndex = ++this.zIndexCounter;
             layers.push(layerData);
          }
        }
      } catch (childError) {
        console.error(`解析图层 [${child?.name || '未知'}] 时发生错误:`, childError);
        // 跳过错误图层，继续解析其他图层
      }
    }
  }

  isColorDeep(colorStr) {
    if (!colorStr) return false;
    const s = String(colorStr).replace(/\s/g, '');
    let r, g, b;
    const rgbaMatch = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(s);
    if (rgbaMatch) {
      r = parseInt(rgbaMatch[1]); g = parseInt(rgbaMatch[2]); b = parseInt(rgbaMatch[3]);
    } else {
      const rgbMatch = /rgb\((\d+),(\d+),(\d+)\)/.exec(s);
      if (rgbMatch) {
        r = parseInt(rgbMatch[1]); g = parseInt(rgbMatch[2]); b = parseInt(rgbMatch[3]);
      } else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) {
        if (s.length === 4) {
          r = parseInt(s[1] + s[1], 16); g = parseInt(s[2] + s[2], 16); b = parseInt(s[3] + s[3], 16);
        } else {
          r = parseInt(s.substring(1, 3), 16); g = parseInt(s.substring(3, 5), 16); b = parseInt(s.substring(5, 7), 16);
        }
      } else {
        return false; 
      }
    }
    // 与 isLayerWhiteOrTransparent 中的判定保持一致：三个通道都必须 < 45
    return r < 45 && g < 45 && b < 45;
  }

  isColorWhiteOrTransparent(colorStr) {
    if (!colorStr) return true;
    const s = String(colorStr).replace(/\s/g, '');
    
    // 1. 检查透明
    if (s === 'transparent' || s === 'rgba(0,0,0,0)') return true;
    
    let r, g, b, a = 1;

    // 2. 解析 RGBA / RGB
    const rgbaMatch = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(s);
    if (rgbaMatch) {
      r = parseInt(rgbaMatch[1]);
      g = parseInt(rgbaMatch[2]);
      b = parseInt(rgbaMatch[3]);
      a = parseFloat(rgbaMatch[4]);
    } else {
      const rgbMatch = /rgb\((\d+),(\d+),(\d+)\)/.exec(s);
      if (rgbMatch) {
        r = parseInt(rgbMatch[1]);
        g = parseInt(rgbMatch[2]);
        b = parseInt(rgbMatch[3]);
      } else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) {
        // Hex to RGB
        if (s.length === 4) {
          r = parseInt(s[1] + s[1], 16);
          g = parseInt(s[2] + s[2], 16);
          b = parseInt(s[3] + s[3], 16);
        } else {
          r = parseInt(s.substring(1, 3), 16);
          g = parseInt(s.substring(3, 5), 16);
          b = parseInt(s.substring(5, 7), 16);
        }
      } else {
        return false; // Unknown format, assume content
      }
    }

    // 3. 判定逻辑
    if (a < 0.05) return true; // 几乎透明
    
    // 检查是否是"无色且不够深"的灰色/白色
    // 阈值同步：亮度 > 40 且 色差 <= 20 -> 视为背景/无效
    if (r > 40 && g > 40 && b > 40) {
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      if (maxDiff <= 20) {
        return true; // 浅灰、中灰、白 -> 过滤
      }
    }

    return false;
  }

  isLayerWhiteOrTransparent(layer) {
    try {
      let data = null;
      let width = 0;
      let height = 0;

      if (layer.canvas) {
        width = layer.canvas.width;
        height = layer.canvas.height;
        const ctx = layer.canvas.getContext('2d');
        data = ctx.getImageData(0, 0, width, height).data;
      } else if (layer.imageData) {
        width = layer.imageData.width;
        height = layer.imageData.height;
        data = layer.imageData.data;
      }

      if (!data) return true; // 没有像素数据的图层，直接视为空白

      const len = data.length;
      // 动态步长：小图全量扫描，大图抽样
      // 如果总像素数 < 10000 (例如 100x100)，使用 stride = 4 (全量)
      // 否则使用 stride = 20 (5个像素抽1个)
      const pixelCount = len / 4;
      const stride = pixelCount < 10000 ? 4 : 20;
      
      // 针对特定图层的深度调试
      const nameLower = (layer.name || '').toLowerCase();
      const isSuspect = layer.name && LAYER_FILTER_RULES.BANNED_KEYWORDS.some(k => nameLower.includes(k));
      
      // 尺寸过滤：过滤极细/极小的图层（通常是参考线、杂质或误操作残留）
      // 只有当图层不是"足够大"时才进行此检查
      // 规则：任意一边 < SUSPECT_MIN_WIDTH，或者 面积 < SUSPECT_MIN_AREA 且非文字
      // 注意：这可能会误杀极细的分隔线，但在电商主图场景中，极细线条通常是干扰
      if (width < LAYER_FILTER_RULES.THRESHOLDS.SUSPECT_MIN_WIDTH || 
          height < LAYER_FILTER_RULES.THRESHOLDS.SUSPECT_MIN_HEIGHT || 
          (width * height < LAYER_FILTER_RULES.THRESHOLDS.SUSPECT_MIN_AREA)) {
         if (isSuspect) {
             console.log(`[Ghost Buster] "${layer.name}" (${width}x${height}) dropped due to tiny dimensions.`);
             return true;
         }
         // 对于非嫌疑图层，稍微放宽一点，防止误杀小图标
         if (width < LAYER_FILTER_RULES.THRESHOLDS.NORMAL_MIN_WIDTH || height < LAYER_FILTER_RULES.THRESHOLDS.NORMAL_MIN_HEIGHT) {
             console.log(`[Ghost Buster] "${layer.name}" (${width}x${height}) dropped due to micro dimensions.`);
             return true;
         }
      }

      if (isSuspect) {
          console.log(`[Ghost Buster] Inspecting "${layer.name}" (${width}x${height})`);
      }

      let validPixelCount = 0;
      const minValidPixels = LAYER_FILTER_RULES.THRESHOLDS.MIN_VALID_PIXELS; // 至少需要 N 个有效像素才认为是有效图层，防止噪点/边缘伪影
      
      // [Ghost Buster v3.0] 颜色单一性检查数据收集
      // 用于判断是否为大面积纯色占位符
      let collectedPixels = [];
      const maxSamplePixels = LAYER_FILTER_RULES.THRESHOLDS.SAMPLE_COUNT; // 只需要采样 100 个点就足够判断是否为纯色了

      for (let i = 0; i < len; i += stride) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const a = data[i+3];

        // [Ghost Buster v3.6] 逻辑大幅简化：
        // 只要不是全透明 或 全白，都视为有效内容。
        // 不再通过色差(Diff)或深色(Dark)判断，防止误杀灰色/纯色产品图。

        // 1. 透明度检查
        if (a < LAYER_FILTER_RULES.THRESHOLDS.PIXEL_ALPHA_THRESHOLD) continue;

        // 2. 纯白检查 (White Check)
        // 只有几乎纯白才过滤
        if (r > LAYER_FILTER_RULES.THRESHOLDS.PIXEL_WHITE_THRESHOLD && 
            g > LAYER_FILTER_RULES.THRESHOLDS.PIXEL_WHITE_THRESHOLD && 
            b > LAYER_FILTER_RULES.THRESHOLDS.PIXEL_WHITE_THRESHOLD) continue;

        // 3. 有效像素计数
        validPixelCount++;

        // 收集像素用于日志/调试
        if (collectedPixels.length < maxSamplePixels) {
            collectedPixels.push({r, g, b});
        }
        
        // 4. 判定退出
        // 只要找到足够的有效像素，就可以认为该图层有效
        if (validPixelCount >= minValidPixels) {
             // 如果样本也收集够了（或者不是嫌疑图层不需要看样本），直接返回 false (KEEP)
             if (!isSuspect || collectedPixels.length >= maxSamplePixels) {
                 // 之前这里是 continue 或 break，现在我们可以直接 return false
                 // 但为了让后面的 MAD 计算逻辑还能跑（虽然不删除了，但看日志也好），我们 break 出去
                 break;
             }
        }
      }
      
      // 循环结束
      
      // [Ghost Buster v3.1] 嫌疑图层终极审判：颜色单一性检查 (Log Only Now)
      if (isSuspect && validPixelCount >= minValidPixels) {
          if (collectedPixels.length > 10) {
              // 计算平均值
              let sumR = 0, sumG = 0, sumB = 0;
              for (const p of collectedPixels) { sumR += p.r; sumG += p.g; sumB += p.b; }
              const avgR = sumR / collectedPixels.length;
              const avgG = sumG / collectedPixels.length;
              const avgB = sumB / collectedPixels.length;

              // 计算平均绝对偏差 (MAD)
              let devR = 0, devG = 0, devB = 0;
              for (const p of collectedPixels) {
                  devR += Math.abs(p.r - avgR);
                  devG += Math.abs(p.g - avgG);
                  devB += Math.abs(p.b - avgB);
              }
              const madR = devR / collectedPixels.length;
              const madG = devG / collectedPixels.length;
              const madB = devB / collectedPixels.length;
              
              const totalMAD = madR + madG + madB;
              
              console.log(`[Ghost Buster v3.3] Uniformity Check for "${layer.name}": Samples=${collectedPixels.length}, AvgRGB=(${avgR.toFixed(1)},${avgG.toFixed(1)},${avgB.toFixed(1)}), TotalMAD=${totalMAD.toFixed(2)}`);

              // 阈值判定：
              if (totalMAD < LAYER_FILTER_RULES.THRESHOLDS.MIN_MAD) {
                  // [Ghost Buster v3.6] 紧急回滚逻辑现在由配置控制
                  if (LAYER_FILTER_RULES.FLAGS.ENABLE_MAD_FILTER) {
                      console.log(`[Ghost Buster] "${layer.name}" is SOLID COLOR (MAD=${totalMAD.toFixed(2)}). -> DROPPED`);
                      return true;
                  } else {
                      console.log(`[Ghost Buster v3.6] "${layer.name}" is SOLID COLOR (MAD=${totalMAD.toFixed(2)}). -> KEPT (Rollback/Config Disabled)`);
                      return false; // KEEP layer
                  }
              } else {
                   console.log(`[Ghost Buster v3.6] "${layer.name}" has texture (MAD=${totalMAD.toFixed(2)}). -> KEEP`);
                   return false;
              }
          }
      } else if (validPixelCount >= minValidPixels) {
           // 非嫌疑图层，或者嫌疑图层但没进入单一性检查（不应该发生，除非逻辑漏了）
           // 如果是嫌疑图层但样本不够，说明虽然 validPixelCount 够了但大部分被 isDark 捕获了？
           // 如果 isDark 捕获了，上面已经 return false 了。
           // 所以这里主要是针对非嫌疑图层的 fallback
           return false;
      }
      
      if (isSuspect) {
         console.log(`[Ghost Buster v3.0] "${layer.name}" scanned as EMPTY. Valid pixels found: ${validPixelCount}`);
      }
      return true; // 循环结束仍未达到有效像素数量阈值，视为无效图层
    } catch (e) {
      console.warn('检测图片内容失败:', e);
      return false;
    }
  }

  // [Ghost Buster v3.5] 纯色/一致性检查
  isLayerUniform(layer) {
    // 如果功能未开启，直接返回 false (不视为均匀/不删除)
    if (!LAYER_FILTER_RULES.FLAGS.ENABLE_MAD_FILTER) return false;

    try {
      let data = null;
      let width = 0;
      let height = 0;

      if (layer.canvas) {
        width = layer.canvas.width;
        height = layer.canvas.height;
        const ctx = layer.canvas.getContext('2d');
        data = ctx.getImageData(0, 0, width, height).data;
      } else if (layer.imageData) {
        width = layer.imageData.width;
        height = layer.imageData.height;
        data = layer.imageData.data;
      }

      if (!data) return false; // 无数据，无法判断，默认非 uniform

      const len = data.length;
      // 随机采样 N 个点
      const sampleCount = LAYER_FILTER_RULES.THRESHOLDS.SAMPLE_COUNT;
      // 确保 step 至少为 4
      const step = Math.max(4, Math.floor(len / 4 / sampleCount) * 4);
      
      const samples = [];
      
      for (let i = 0; i < len && samples.length < sampleCount; i += step) {
         const r = data[i];
         const g = data[i+1];
         const b = data[i+2];
         const a = data[i+3];
         
         if (a > 20) {
             samples.push({r, g, b});
         }
      }

      if (samples.length < 10) return false; // 样本太少，无法判断

      let sumR = 0, sumG = 0, sumB = 0;
      for (const p of samples) { sumR += p.r; sumG += p.g; sumB += p.b; }
      const avgR = sumR / samples.length;
      const avgG = sumG / samples.length;
      const avgB = sumB / samples.length;

      let devR = 0, devG = 0, devB = 0;
      for (const p of samples) {
          devR += Math.abs(p.r - avgR);
          devG += Math.abs(p.g - avgG);
          devB += Math.abs(p.b - avgB);
      }
      
      const madR = devR / samples.length;
      const madG = devG / samples.length;
      const madB = devB / samples.length;
      const totalMAD = madR + madG + madB;
      
      // 如果总偏差小于阈值，说明非常均匀（纯色或极微弱渐变）
      return totalMAD < LAYER_FILTER_RULES.THRESHOLDS.MIN_MAD;
      
    } catch (e) {
      console.warn('Uniform check failed:', e);
      return false;
    }
  }

  detectChildrenOrder(children, canvasWidth, canvasHeight) {
    const findFirstLeaf = (arr) => {
      for (const child of arr || []) {
        if (child?.artboard && Array.isArray(child.children)) {
          const nested = findFirstLeaf(child.children);
          if (nested) return nested;
          continue;
        }
        if (Array.isArray(child?.children) && child.children.length > 0) {
          const nested = findFirstLeaf(child.children);
          if (nested) return nested;
          continue;
        }
        return child;
      }
      return null;
    };

    const first = findFirstLeaf(children);
    if (!first) return 'bottom-first';

    const b = this.getBestLayerBounds(first);
    const area = (b.width || 0) * (b.height || 0);
    const full = (canvasWidth || 0) * (canvasHeight || 0);
    if (full > 0 && area / full > 0.5) return 'bottom-first';
    return 'top-first';
  }

  hasShapeProperties(layer) {
    // 检查是否有明确的形状属性
    if (layer.vectorMask || layer.vectorStroke) return true;
    if (layer.adjustments && layer.adjustments.some(a => a.type === 'solidColor')) return true;
    if (layer.effects && layer.effects.solidFill) return true;
    return false;
  }

  createSolidColorDataURL(colorString) {
    if (!colorString || typeof document === 'undefined') return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = colorString;
      ctx.fillRect(0, 0, 1, 1);
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  extractLayerData(layer, depth) {
    const id = `layer_${++this.layerIdCounter}`;

    let opacity = 1;
    if (layer.opacity !== undefined) {
      if (layer.opacity > 1) {
        opacity = layer.opacity / 255;
      } else {
        opacity = layer.opacity;
      }
    }

    const bounds = this.getBestLayerBounds(layer);

    return {
      id: id,
      psId: layer.id,
      name: layer.name || `Layer ${this.layerIdCounter}`,
      visible: layer && (layer.hidden === true || layer.visible === false) ? false : true,
      isGhost: !!layer.isGhost, // 传递 isGhost 属性
      opacity: Number.isFinite(opacity) ? opacity : 1,
      blendMode: this.mapBlendMode(layer.blendMode),
      x: Number.isFinite(bounds.left) ? bounds.left : 0,
      y: Number.isFinite(bounds.top) ? bounds.top : 0,
      width: Number.isFinite(bounds.width) ? bounds.width : 0,
      height: Number.isFinite(bounds.height) ? bounds.height : 0,
      depth: Number.isFinite(depth) ? depth : 0,
      mask: layer.mask ? this.extractMaskData(layer.mask) : null,
      effects: layer.effects ? this.extractEffects(layer.effects) : null,
      originalLayer: layer,
    };
  }

  getBestLayerBounds(layer) {
    const fromLTRB = (left, top, right, bottom) => {
      if (![left, top, right, bottom].every((n) => Number.isFinite(n))) return null;
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      return { left, top, right, bottom, width, height };
    };

    const candidates = [];

    candidates.push(fromLTRB(layer.left, layer.top, layer.right, layer.bottom));
    candidates.push(fromLTRB(layer?.text?.bounds?.left, layer?.text?.bounds?.top, layer?.text?.bounds?.right, layer?.text?.bounds?.bottom));
    candidates.push(fromLTRB(layer?.text?.box?.left, layer?.text?.box?.top, layer?.text?.box?.right, layer?.text?.box?.bottom));
    candidates.push(fromLTRB(layer?.vectorMask?.left, layer?.vectorMask?.top, layer?.vectorMask?.right, layer?.vectorMask?.bottom));

    const valid = candidates.filter(Boolean);
    let best = valid.find((b) => b.width > 0 && b.height > 0) || valid[0] || null;

    let left = best?.left;
    let top = best?.top;
    let width = best?.width;
    let height = best?.height;

    if (!Number.isFinite(left)) left = 0;
    if (!Number.isFinite(top)) top = 0;

    if (!Number.isFinite(width) || width <= 0) {
      if (Number.isFinite(layer?.canvas?.width) && layer.canvas.width > 0) width = layer.canvas.width;
      else if (Number.isFinite(layer?.imageData?.width) && layer.imageData.width > 0) width = layer.imageData.width;
      else if (Number.isFinite(layer?.placedLayer?.width) && layer.placedLayer.width > 0) width = layer.placedLayer.width;
      else if (Number.isFinite(layer?.text?.box?.width) && layer.text.box.width > 0) width = layer.text.box.width;
      else width = 0;
    }

    if (!Number.isFinite(height) || height <= 0) {
      if (Number.isFinite(layer?.canvas?.height) && layer.canvas.height > 0) height = layer.canvas.height;
      else if (Number.isFinite(layer?.imageData?.height) && layer.imageData.height > 0) height = layer.imageData.height;
      else if (Number.isFinite(layer?.placedLayer?.height) && layer.placedLayer.height > 0) height = layer.placedLayer.height;
      else if (Number.isFinite(layer?.text?.box?.height) && layer.text.box.height > 0) height = layer.text.box.height;
      else height = 0;
    }

    return { left, top, width, height };
  }

  extractTextData(layer) {
    if (!layer.text) return null;

    const text = layer.text;
    const style = text.style || {};

    const fontName =
      (text.font && text.font.name) || (style.font && style.font.name) || 'Arial';
    
    let fontSize = 16;
    let scaleX = 1;
    let scaleY = 1;
    
    if (text.transform) {
      // 从变换矩阵中提取缩放比例 [a, b, c, d, tx, ty]
      const a = text.transform[0];
      const b = text.transform[1];
      const c = text.transform[2];
      const d = text.transform[3];
      scaleX = Math.sqrt(a * a + c * c) || 1;
      scaleY = Math.sqrt(b * b + d * d) || 1;
    }

    if (text.font && text.font.sizes && text.font.sizes.length > 0) {
      fontSize = text.font.sizes[0] * scaleY;
    } else if (style.fontSize) {
      fontSize = style.fontSize * scaleY;
    } else if (text.transform) {
      fontSize = scaleY;
    }

    this.checkFontAvailability(fontName);

    // 优先使用 text.text (标准属性)，其次尝试 textKey (特定情况)，最后回退到图层名
    const rawContent = text.text || text.textKey || layer.name || '文本';
    const content = String(rawContent).replace(/\r\n?/g, '\n');

    const fontFamily = this.fontLoader.getFontFamily(fontName);
    const fontWeight = this.fontLoader.getFontWeight(fontName, text.font && text.font.weights);
    
    // 增强颜色提取：尝试从 font.colors 中提取第一个颜色
    let color = this.extractColor(style.fillColor);
    if (!color && text.font && text.font.colors && text.font.colors.length > 0) {
      color = this.extractColor(text.font.colors[0]);
    }
    // 如果还是没颜色，默认为黑色
    if (!color) {
        color = 'rgba(0, 0, 0, 1)';
    }

    const isPointText = text.pointBase === true || !text.box;
    const isParagraph = !isPointText;
    const autoLeading = style.paragraphStyle?.autoLeading;
    const lineHeight =
      style.leading && style.leading > 0
        ? style.leading * scaleY
        : typeof autoLeading === 'number' && autoLeading > 0
          ? fontSize * autoLeading
          : fontSize * 1.2;

    return {
      content: content,
      fontFamily: fontFamily,
      fontSize: fontSize,
      fontWeight: fontWeight,
      fontStyle: text.font && text.font.options && text.font.options.synthetic ? 'italic' : 'normal',
      color: color,
      textAlign: this.mapTextAlign(text.paragraph && text.paragraph.alignment),
      letterSpacing: style.tracking ? style.tracking / 1000 : 0,
      lineHeight,
      textTransform: this.mapTextTransform(text.font && text.font.options),
      baseline: text.baseline,
      engineData: text.engineData || null,
      isPointText,
      isParagraph,
      scaleX,
      scaleY,
    };
  }

  extractMaskData(mask) {
    return {
      enabled: mask.enabled !== false,
      x: mask.left || 0,
      y: mask.top || 0,
      width: (mask.right || 0) - (mask.left || 0),
      height: (mask.bottom || 0) - (mask.top || 0),
    };
  }

  extractEffects(effects) {
    const result = {};

    if (effects.dropShadow) {
      result.dropShadow = {
        color: this.extractColor(effects.dropShadow.color),
        offsetX: effects.dropShadow.offset?.x || 0,
        offsetY: effects.dropShadow.offset?.y || 0,
        blur: effects.dropShadow.blur || 0,
        spread: effects.dropShadow.spread || 0,
      };
    }

    if (effects.innerShadow) {
      result.innerShadow = {
        color: this.extractColor(effects.innerShadow.color),
        offsetX: effects.innerShadow.offset?.x || 0,
        offsetY: effects.innerShadow.offset?.y || 0,
        blur: effects.innerShadow.blur || 0,
      };
    }

    if (effects.outerGlow) {
      result.outerGlow = {
        color: this.extractColor(effects.outerGlow.color),
        size: effects.outerGlow.size || 0,
      };
    }

    if (effects.innerGlow) {
      result.innerGlow = {
        color: this.extractColor(effects.innerGlow.color),
        size: effects.innerGlow.size || 0,
      };
    }

    if (effects.stroke) {
      result.stroke = {
        color: this.extractColor(effects.stroke.color),
        size: effects.stroke.size || 1,
        position: effects.stroke.position || 'outside',
      };
    }

    if (effects.bevelEmboss) {
      result.bevelEmboss = {
        style: effects.bevelEmboss.style || 'outer',
        depth: effects.bevelEmboss.depth || 0,
        size: effects.bevelEmboss.size || 0,
        highlightColor: this.extractColor(effects.bevelEmboss.highlightColor),
        shadowColor: this.extractColor(effects.bevelEmboss.shadowColor),
      };
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  canvasToDataURL(canvas) {
    if (!canvas) return null;

    try {
      if (canvas.data && canvas.width && canvas.height) {
        return this.pixelDataToDataURL(canvas);
      }

      if (typeof canvas.toDataURL === 'function') {
        return canvas.toDataURL('image/png');
      }

      if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        return tempCanvas.toDataURL('image/png');
      }

      return null;
    } catch (error) {
      console.warn('Canvas转DataURL失败:', error.message);
      return null;
    }
  }

  extractRasterToDataURL(layer) {
    if (!layer) return null;

    // 优先使用 ag-psd 生成的 canvas 对象 (需开启 useCanvas: true)
    if (layer.canvas) {
      const url = this.canvasToDataURL(layer.canvas);
      if (url) return url;
    }
    
    // 降级处理：如果有 imageData (像素数组) 但没有 canvas
    if (layer.imageData) {
      return this.pixelDataToDataURL(layer.imageData);
    }

    return null;
  }

  pixelDataToCanvas(pixelData) {
    if (!pixelData || !pixelData.data || !pixelData.width || !pixelData.height) return null;
    if (typeof document === 'undefined') return null;

    const width = pixelData.width;
    const height = pixelData.height;
    const src = pixelData.data;

    let rgba;
    const expectedLength = width * height * 4;

    try {
        if (src instanceof Uint8ClampedArray && src.length === expectedLength) {
          rgba = src;
        } else if (src instanceof Uint8Array && src.length === expectedLength) {
          rgba = new Uint8ClampedArray(src.buffer, src.byteOffset, src.byteLength);
        } else {
          // 数据长度不匹配或类型不符，进行手动转换/填充
          rgba = new Uint8ClampedArray(expectedLength);
          const srcLen = src.length;
          // 简单的复制，防止越界
          for (let i = 0; i < expectedLength; i++) {
             if (i < srcLen) {
                 rgba[i] = src[i];
             } else {
                 // 缺少的像素默认为透明 (0)
                 rgba[i] = 0;
             }
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const imageData = new ImageData(rgba, width, height);
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    } catch (e) {
      console.error('pixelDataToCanvas error:', e);
      return null;
    }
  }

  pixelDataToDataURL(pixelData) {
    const canvas = this.pixelDataToCanvas(pixelData);
    return canvas ? canvas.toDataURL('image/png') : null;
  }

  mapBlendMode(blendMode) {
    const blendModeMap = {
      0: 'normal',
      1: 'multiply',
      2: 'screen',
      3: 'overlay',
      4: 'darken',
      5: 'lighten',
      6: 'color-dodge',
      7: 'color-burn',
      8: 'hard-light',
      9: 'soft-light',
      10: 'difference',
      11: 'exclusion',
      12: 'hue',
      13: 'saturation',
      14: 'color',
      15: 'luminosity',
    };

    return blendModeMap[blendMode] || 'normal';
  }

  mapFontFamily(psdFontName) {
    if (!psdFontName) return 'Arial, sans-serif';

    const normalizedName = psdFontName.toLowerCase().replace(/[\s-]/g, '');

    if (this.fontMapping[psdFontName]) {
      return this.fontMapping[psdFontName];
    }

    const fontMappings = {
      'pingfangsc': '"PingFang SC", "Microsoft YaHei", sans-serif',
      'pingfang': '"PingFang SC", "Microsoft YaHei", sans-serif',
      'microsoftyahei': '"PingFang SC", "Microsoft YaHei", sans-serif',
      'simhei': '"SimHei", "Microsoft YaHei", sans-serif',
      'simsun': '"SimSun", "Microsoft YaHei", serif',
      'sourcehanassn': '"Source Han Sans CN", "Noto Sans SC", sans-serif',
      'notosanssc': '"Noto Sans SC", "Source Han Sans CN", sans-serif',
      'dinpro': '"DIN Pro", "Arial", sans-serif',
      'din': '"DIN Pro", "Arial", sans-serif',
      'helvetica': '"Helvetica Neue", Helvetica, Arial, sans-serif',
      'helveticaneue': '"Helvetica Neue", Helvetica, Arial, sans-serif',
      'arial': 'Arial, Helvetica, sans-serif',
      'timesnewroman': '"Times New Roman", Times, serif',
      'georgia': 'Georgia, "Times New Roman", serif',
      'verdana': 'Verdana, Geneva, sans-serif',
    };

    for (const [key, value] of Object.entries(fontMappings)) {
      if (normalizedName.includes(key) || psdFontName.toLowerCase().includes(key)) {
        return value;
      }
    }

    return `"${psdFontName}", Arial, sans-serif`;
  }

  mapFontWeight(weights) {
    if (!weights) return 'normal';

    const weightValue = weights.value || weights;
    if (typeof weightValue === 'number') {
      if (weightValue >= 700) return 'bold';
      if (weightValue >= 600) return 'semibold';
      return 'normal';
    }

    const weightStr = String(weightValue).toLowerCase();
    if (weightStr.includes('bold') || weightStr.includes('heavy')) return 'bold';
    if (weightStr.includes('medium')) return '500';
    if (weightStr.includes('light')) return '300';

    return 'normal';
  }

  mapTextAlign(alignment) {
    if (!alignment) return 'left';

    const alignmentMap = {
      0: 'left',
      1: 'center',
      2: 'right',
      3: 'justify',
      4: 'justify',
    };

    return alignmentMap[alignment] || 'left';
  }

  mapTextTransform(options) {
    if (!options) return 'none';

    if (options.allCaps) return 'uppercase';
    if (options.smallCaps) return 'capitalize';

    return 'none';
  }

  extractColor(colorObj) {
    if (!colorObj) return 'rgba(0, 0, 0, 1)';

    if (typeof colorObj === 'string') {
      if (colorObj.startsWith('#')) {
        const hex = colorObj.slice(1);
        const r = parseInt(hex.slice(0, 2), 16) || 0;
        const g = parseInt(hex.slice(2, 4), 16) || 0;
        const b = parseInt(hex.slice(4, 6), 16) || 0;
        return `rgba(${r}, ${g}, ${b}, 1)`;
      }
      return colorObj;
    }

    // 确保 r, g, b, a 都是有效数值
    const r = Math.round(colorObj.r !== undefined ? colorObj.r : (colorObj.red !== undefined ? colorObj.red : 0));
    const g = Math.round(colorObj.g !== undefined ? colorObj.g : (colorObj.green !== undefined ? colorObj.green : 0));
    const b = Math.round(colorObj.b !== undefined ? colorObj.b : (colorObj.blue !== undefined ? colorObj.blue : 0));
    let a = colorObj.a !== undefined ? colorObj.a : (colorObj.alpha !== undefined ? colorObj.alpha : 1);
    
    // ag-psd 有时 alpha 是 0-255
    if (a > 1) a = a / 255;
    if (!Number.isFinite(a)) a = 1;

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  checkFontAvailability(fontName) {
    if (!fontName) return;

    const normalizedName = fontName.toLowerCase().replace(/[\s-]/g, '');

    const knownFonts = [
      'pingfangsc', 'pingfang', 'microsoftyahei', 'simhei', 'simsun',
      'sourcehanassn', 'notosanssc', 'dinpro', 'din', 'helvetica',
      'helveticaneue', 'arial', 'timesnewroman', 'georgia', 'verdana',
    ];

    const isKnownFont = knownFonts.some(f => normalizedName.includes(f));

    if (!isKnownFont) {
      this.missingFonts.add(fontName);
    }
  }

  extractUsedFonts(layers) {
    const fonts = new Map();

    for (const layer of layers) {
      if (layer.type === 'text' && layer.textData) {
        const textData = layer.textData;
        const key = `${textData.fontFamily}-${textData.fontWeight}`;

        if (!fonts.has(key)) {
          fonts.set(key, {
            fontFamily: textData.fontFamily,
            fontWeight: textData.fontWeight,
            fontStyle: textData.fontStyle,
            fontSize: textData.fontSize,
            usedInLayers: [],
          });
        }

        fonts.get(key).usedInLayers.push(layer.name);
      }
    }

    return Array.from(fonts.values());
  }
}

export default PSDParser;
