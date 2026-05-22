class StyleMapper {
  constructor() {
    this.unitMap = {
      pixels: 'px',
      points: 'pt',
      percent: '%',
    };

    this.blendModeMap = {
      normal: 'normal',
      multiply: 'multiply',
      screen: 'screen',
      overlay: 'overlay',
      darken: 'darken',
      lighten: 'lighten',
      'color-dodge': 'color-dodge',
      'color-burn': 'color-burn',
      'hard-light': 'hard-light',
      'soft-light': 'soft-light',
      difference: 'difference',
      exclusion: 'exclusion',
      hue: 'hue',
      saturation: 'saturation',
      color: 'color',
      luminosity: 'luminosity',
    };
  }

  mapLayerStyle(layer, options = {}) {
    const style = {
      position: 'absolute',
      left: `${layer.x}px`,
      top: `${layer.y}px`,
      width: `${layer.width}px`,
      height: `${layer.height}px`,
      opacity: layer.opacity,
      mixBlendMode: this.mapBlendMode(layer.blendMode),
      zIndex: options.zIndex || 0,
    };

    if (layer.visible === false) {
      style.display = 'none';
    }

    if (layer.mask) {
      Object.assign(style, this.mapMaskStyle(layer.mask));
    }

    if (layer.effects) {
      Object.assign(style, this.mapEffectsStyle(layer.effects));
    }

    return style;
  }

  mapTextStyle(textData, options = {}) {
    const isPointText = options.isPointText === true;
    const isParagraph = options.isParagraph === true;

    const style = {
      fontFamily: textData.fontFamily,
      fontSize: `${textData.fontSize}px`,
      fontWeight: textData.fontWeight,
      fontStyle: textData.fontStyle,
      color: textData.color,
      textAlign: textData.textAlign,
      letterSpacing: `${textData.letterSpacing}em`,
      lineHeight: textData.lineHeight ? `${textData.lineHeight}px` : 'normal',
      textTransform: textData.textTransform,
      whiteSpace: isParagraph ? 'pre-wrap' : 'pre',
      wordBreak: 'normal',
      overflowWrap: 'normal',
      WebkitFontSmoothing: 'antialiased',
      textRendering: 'geometricPrecision',
    };

    if (typeof options.containerWidth === 'number' && options.containerWidth > 0) {
      style.width = `${options.containerWidth}px`;
    } else if (isPointText) {
      style.width = 'max-content';
    }

    return style;
  }

  mapMaskStyle(mask) {
    if (!mask || !mask.enabled) return {};

    const style = {};

    style.clipPath = `inset(${mask.y}px ${(mask.canvasWidth || 0) - mask.x - mask.width}px ${(mask.canvasHeight || 0) - mask.y - mask.height}px ${mask.x}px)`;

    return style;
  }

  mapEffectsStyle(effects) {
    const style = {};
    const boxShadowParts = [];

    if (effects.dropShadow) {
      const { color, offsetX, offsetY, blur, spread } = effects.dropShadow;
      boxShadowParts.push(`${offsetX}px ${offsetY}px ${blur}px ${spread}px ${color}`);
    }

    if (effects.innerShadow) {
      const { color, offsetX, offsetY, blur } = effects.innerShadow;
      style.boxShadow = `inset ${offsetX}px ${offsetY}px ${blur}px ${color}`;
    }

    if (effects.outerGlow) {
      const { color, size } = effects.outerGlow;
      boxShadowParts.push(`0 0 ${size}px ${color}`);
    }

    if (effects.stroke) {
      const { color, size, position } = effects.stroke;
      if (position === 'outside') {
        boxShadowParts.push(`0 0 0 ${size}px ${color}`);
      } else if (position === 'center') {
        style.textStroke = `${size}px ${color}`;
      }
    }

    if (effects.bevelEmboss) {
      const { style: bevelStyle, depth, size, highlightColor, shadowColor } = effects.bevelEmboss;

      if (bevelStyle === 'outer') {
        boxShadowParts.push(`${depth}px ${depth}px ${size}px ${shadowColor}`);
        style.boxShadow += `, inset -${depth}px -${depth}px ${size}px ${highlightColor}`;
      } else {
        style.boxShadow = `inset ${depth}px ${depth}px ${size}px ${shadowColor}`;
      }
    }

    if (boxShadowParts.length > 0) {
      style.boxShadow = boxShadowParts.join(', ');
    }

    return style;
  }

  mapBlendMode(blendMode) {
    if (!blendMode || blendMode === 'normal') return 'normal';

    return this.blendModeMap[blendMode] || 'normal';
  }

  mapLayerBlendMode(blendMode) {
    return this.mapBlendMode(blendMode);
  }

  mapTransform(transform) {
    if (!transform) return null;

    const { scaleX = 1, scaleY = 1, rotate = 0, translateX = 0, translateY = 0 } = transform;

    if (scaleX === 1 && scaleY === 1 && rotate === 0 && translateX === 0 && translateY === 0) {
      return null;
    }

    return {
      transform: `translate(${translateX}px, ${translateY}px) rotate(${rotate}deg) scale(${scaleX}, ${scaleY})`,
      transformOrigin: 'center center',
    };
  }

  mapGradient(gradient) {
    if (!gradient) return null;

    const { type = 'linear', angle = 90, stops = [] } = gradient;

    if (stops.length < 2) return null;

    const colorStops = stops.map(stop => {
      const position = stop.position || 0;
      const color = stop.color || 'rgba(0,0,0,0)';
      return `${color} ${position}%`;
    }).join(', ');

    if (type === 'linear') {
      return `linear-gradient(${angle}deg, ${colorStops})`;
    } else if (type === 'radial') {
      return `radial-gradient(circle, ${colorStops})`;
    }

    return null;
  }

  mapPattern(pattern) {
    if (!pattern || !pattern.imageData) return null;

    return {
      backgroundImage: `url(${pattern.imageData})`,
      backgroundRepeat: 'repeat',
      backgroundSize: pattern.tileSize ? `${pattern.tileSize.width}px ${pattern.tileSize.height}px` : 'auto',
    };
  }

  mapOpacity(opacity) {
    return Math.max(0, Math.min(1, opacity / 255));
  }

  mapLayerEffectsToCSS(effects) {
    const css = {};

    if (effects.dropShadow) {
      const { color, offsetX, offsetY, blur } = effects.dropShadow;
      css.boxShadow = `${offsetX}px ${offsetY}px ${blur}px ${color}`;
    }

    if (effects.innerShadow) {
      const { color, offsetX, offsetY, blur } = effects.innerShadow;
      css.boxShadow = `inset ${offsetX}px ${offsetY}px ${blur}px ${color}`;
    }

    if (effects.outerGlow) {
      const { color, size } = effects.outerGlow;
      css.boxShadow = `0 0 ${size}px ${color}`;
    }

    if (effects.stroke) {
      const { color, size } = effects.stroke;
      css.WebkitTextStroke = `${size}px ${color}`;
    }

    return css;
  }

  mapParagraphStyle(paragraphData) {
    const style = {};

    if (paragraphData.alignment) {
      style.textAlign = this.mapTextAlign(paragraphData.alignment);
    }

    if (paragraphData.justification) {
      style.textAlignLast = paragraphData.justification;
    }

    if (paragraphData.leftIndent) {
      style.paddingLeft = `${paragraphData.leftIndent}px`;
    }

    if (paragraphData.rightIndent) {
      style.paddingRight = `${paragraphData.rightIndent}px`;
    }

    if (paragraphData.firstLineIndent) {
      style.textIndent = `${paragraphData.firstLineIndent}px`;
    }

    if (paragraphData.spaceBefore) {
      style.marginTop = `${paragraphData.spaceBefore}px`;
    }

    if (paragraphData.spaceAfter) {
      style.marginBottom = `${paragraphData.spaceAfter}px`;
    }

    return style;
  }

  mapTextDecoration(textData) {
    const decorations = [];

    if (textData.strikethrough) {
      decorations.push('line-through');
    }

    if (textData.underline) {
      decorations.push('underline');
    }

    return decorations.length > 0 ? decorations.join(' ') : 'none';
  }
}

export default StyleMapper;
