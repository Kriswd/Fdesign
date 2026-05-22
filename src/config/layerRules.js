/**
 * Fdesign 幽灵图层清洗规则配置 (Ghost Busting)
 * 用于 ag-psd 解析阶段，决定哪些图层应该被忽略
 * 此文件为 Single Source of Truth (SSOT)，所有业务规则均应在此定义
 */
export const LAYER_FILTER_RULES = {
  // 1. 功能开关
  FLAGS: {
    // 是否启用 MAD (Mean Absolute Deviation) 过滤
    // 如果为 false，即使 MAD 值低于阈值，也只打印日志，不实际删除图层 (Rollback 策略)
    ENABLE_MAD_FILTER: true,
  },

  // 2. 阈值设置
  THRESHOLDS: {
    // 均值绝对偏差 (Mean Absolute Deviation) 阈值
    // 如果图层像素变化小于此值，视为"几乎全黑/全白"或"无意义图层"
    MIN_MAD: 3.0,

    // 最小有效像素数
    // 扫描过程中至少需要找到多少个非透明、非纯白像素才认为图层有效
    MIN_VALID_PIXELS: 50,

    // 采样点数量
    // 用于 MAD 计算和纯色检查的随机采样点数
    SAMPLE_COUNT: 100,

    // 尺寸过滤：嫌疑图层 (Suspect Layer)
    // 如果图层被标记为嫌疑图层，且尺寸小于以下值，则直接丢弃
    SUSPECT_MIN_WIDTH: 4,
    SUSPECT_MIN_HEIGHT: 4,
    SUSPECT_MIN_AREA: 100,

    // 尺寸过滤：普通图层
    // 防止误杀小图标，阈值较低
    NORMAL_MIN_WIDTH: 2,
    NORMAL_MIN_HEIGHT: 2,

    // 透明度阈值
    // 如果图层不透明度小于此值，视为不可见
    MIN_OPACITY: 0.02,
    
    // 像素扫描中的 alpha 阈值 (0-255)
    // 小于此值的像素视为透明
    PIXEL_ALPHA_THRESHOLD: 10,

    // 像素扫描中的纯白阈值 (0-255)
    // RGB 均大于此值视为纯白背景
    PIXEL_WHITE_THRESHOLD: 250,
  },

  // 3. 关键词黑名单 (一旦命中且不在白名单内 -> 嫌疑图层)
  // 包含这些词通常意味着是备份、副本或调色层
  // 对应原来的 isSuspect 逻辑
  BANNED_KEYWORDS: [
    'copy',
    '拷贝',
    '备份',
    'color', // 包含 color lookup, solid color 等
    '颜色',
    '副本',
    '亮度/对比度',
  ],

  // 4. 关键词白名单 (豁免权)
  // 即使包含 "copy"，如果同时也包含这些词，则必须保留
  // 对应原来的 isWhitelisted 逻辑
  WHITELIST_KEYWORDS: [
    'goods',
    'product',
    'item',
    'sunglass',
    '产品',
    '主图',
    '商品',
    '文案',
    'text',
    '眼镜',
  ],
};
