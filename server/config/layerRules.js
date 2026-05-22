export const LAYER_FILTER_RULES = {
  FLAGS: {
    ENABLE_MAD_FILTER: true,
  },
  THRESHOLDS: {
    MIN_MAD: 3.0,
    MAD_MIN_NON_WHITE_SAMPLES: 12,
    MAD_MIN_NON_WHITE_RATIO: 0.08,
    MIN_VALID_PIXELS: 50,
    SAMPLE_COUNT: 100,
    SUSPECT_MIN_WIDTH: 4,
    SUSPECT_MIN_HEIGHT: 4,
    SUSPECT_MIN_AREA: 100,
    NORMAL_MIN_WIDTH: 2,
    NORMAL_MIN_HEIGHT: 2,
    MIN_OPACITY: 0.02,
    PIXEL_ALPHA_THRESHOLD: 10,
    PIXEL_WHITE_THRESHOLD: 250,
  },
  BANNED_KEYWORDS: ['copy', '拷贝', '备份', 'color', '颜色', '副本', '亮度/对比度'],
  WHITELIST_KEYWORDS: ['goods', 'product', 'item', 'sunglass', '产品', '主图', '商品', '文案', 'text', '眼镜', '正', '侧', '45', '45度', 'bl', 'c90', 'c60', 'a60', 'a61', 'a62'],
};
