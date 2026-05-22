class FontLoader {
  constructor() {
    this.loadedFonts = new Set();
    this.fontFaceMap = new Map();
    const server =
      typeof import.meta !== 'undefined' && import.meta && import.meta.env
        ? import.meta.env.VITE_RENDER_SERVER
        : undefined;
    const base =
      server
        ? `${String(server).replace(/\/$/, '')}/3-字体/`
        : typeof window !== 'undefined' && window.location
          ? `http://${window.location.hostname}:3001/3-字体/`
          : '/3-字体/';
    this.basePath = base;
  }

  async loadAllFonts() {
    const fontConfigs = [
      {
        name: 'DIN Pro',
        weights: {
          '300': 'DINPro-Light.otf',
          '400': 'DINPro-Regular.otf',
          '500': 'DINPro-Medium.otf',
          '700': 'DINPro-Bold.otf',
          '900': 'DINPro-Black.otf',
        }
      },
      {
        name: 'DIN',
        weights: {
          '300': 'DIN-Light.otf',
          '400': 'DIN-Regular.otf',
          '500': 'DIN-Medium.otf',
          '700': 'DIN-Bold.otf',
          '900': 'DIN-Black.otf',
        }
      },
      {
        name: 'HYQiHei',
        weights: {
          '45': 'HYQiHei_45J.ttf',
          '55': 'HYQiHei_55J.ttf',
          '75': 'HYQiHei_75S.ttf',
        }
      },
      {
        name: 'Trade Gothic LT Std',
        weights: {
          '700': 'TradeGothicLTStd-BoldExt.otf',
          '400': 'TradeGothicLTStd-Extended.otf',
        }
      },
    ];

    const loadPromises = [];

    for (const fontConfig of fontConfigs) {
      for (const [weight, path] of Object.entries(fontConfig.weights)) {
        loadPromises.push(this.loadFont(fontConfig.name, weight, path));
      }
    }

    const results = await Promise.allSettled(loadPromises);
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.filter(r => r.status === 'rejected').length;

    console.log(`字体加载完成: 成功 ${successCount} 个, 失败 ${failCount} 个`);

    return {
      total: loadPromises.length,
      success: successCount,
      failed: failCount,
      loadedFonts: Array.from(this.loadedFonts),
    };
  }

  async loadFont(family, weight, path) {
    const fontKey = `${family}-${weight}`;

    if (this.loadedFonts.has(fontKey)) {
      return true;
    }

    try {
      const fontUrl = `${this.basePath}${encodeURI(path)}`;
      const font = new FontFace(family, `url(${fontUrl})`, { weight });

      await font.load();
      document.fonts.add(font);

      this.loadedFonts.add(fontKey);
      this.fontFaceMap.set(fontKey, font);

      console.log(`字体加载成功: ${family} ${weight}`);
      return true;
    } catch (error) {
      console.warn(`字体加载失败: ${family} ${weight} - ${error.message}`);
      return false;
    }
  }

  async loadFontByPsdName(psdFontName, fontWeight = '400') {
    if (!psdFontName) return false;

    const normalizedName = psdFontName.toLowerCase().replace(/[\s-]/g, '');

    let fontFamily = null;
    let weight = fontWeight;

    if (normalizedName.includes('dinpro') || normalizedName.includes('dinpro')) {
      fontFamily = 'DIN Pro';
    } else if (normalizedName.includes('din')) {
      fontFamily = 'DIN';
    } else if (normalizedName.includes('hyqihei') || normalizedName.includes('汉仪旗黑')) {
      fontFamily = 'HYQiHei';
      if (normalizedName.includes('25')) weight = '25';
      else if (normalizedName.includes('35')) weight = '35';
      else if (normalizedName.includes('40')) weight = '40';
      else if (normalizedName.includes('45')) weight = '45';
      else if (normalizedName.includes('50')) weight = '50';
      else if (normalizedName.includes('55')) weight = '55';
      else if (normalizedName.includes('60')) weight = '60';
      else if (normalizedName.includes('65')) weight = '65';
      else if (normalizedName.includes('70')) weight = '70';
      else if (normalizedName.includes('75')) weight = '75';
      else if (normalizedName.includes('80')) weight = '80';
      else if (normalizedName.includes('85')) weight = '85';
      else if (normalizedName.includes('90')) weight = '90';
      else if (normalizedName.includes('95')) weight = '95';
      else if (normalizedName.includes('105')) weight = '105';
    } else if (normalizedName.includes('tradegothic') || normalizedName.includes('trade gothic')) {
      fontFamily = 'Trade Gothic LT Std';
      weight = '700';
    }

    if (fontFamily) {
      return await this.loadFont(fontFamily, weight, '');
    }

    return false;
  }

  getFontFamily(psdFontName) {
    if (!psdFontName) return 'Arial, sans-serif';

    const normalizedName = psdFontName.toLowerCase().replace(/[\s-]/g, '');

    if (normalizedName.includes('dinpro') || normalizedName.includes('dinpro')) {
      return '"DIN Pro", Arial, sans-serif';
    } else if (normalizedName.includes('din')) {
      return '"DIN", Arial, sans-serif';
    } else if (normalizedName.includes('hyqihei') || normalizedName.includes('汉仪旗黑')) {
      return '"HYQiHei", "PingFang SC", "Microsoft YaHei", sans-serif';
    } else if (normalizedName.includes('tradegothic') || normalizedName.includes('trade gothic')) {
      return '"Trade Gothic LT Std", Arial, sans-serif';
    } else if (normalizedName.includes('pingfangsc') || normalizedName.includes('pingfang')) {
      return '"PingFang SC", "Microsoft YaHei", sans-serif';
    } else if (normalizedName.includes('microsoftyahei')) {
      return '"Microsoft YaHei", "PingFang SC", sans-serif';
    } else if (normalizedName.includes('simhei')) {
      return '"SimHei", "Microsoft YaHei", sans-serif';
    } else if (normalizedName.includes('helvetica') || normalizedName.includes('helveticaneue')) {
      return '"Helvetica Neue", Helvetica, Arial, sans-serif';
    } else if (normalizedName.includes('arial')) {
      return 'Arial, Helvetica, sans-serif';
    }

    return `"${psdFontName}", Arial, sans-serif`;
  }

  getFontWeight(psdFontName, weights = null) {
    if (weights && weights.value) {
      const weightValue = weights.value;
      if (weightValue >= 900) return '900';
      if (weightValue >= 700) return '700';
      if (weightValue >= 600) return '600';
      if (weightValue >= 500) return '500';
      if (weightValue >= 400) return '400';
      if (weightValue >= 300) return '300';
      return '400';
    }

    const normalizedName = psdFontName ? psdFontName.toLowerCase().replace(/[\s-]/g, '') : '';

    if (normalizedName.includes('bold') || normalizedName.includes('heavy') || normalizedName.includes('black')) {
      return '700';
    } else if (normalizedName.includes('medium')) {
      return '500';
    } else if (normalizedName.includes('light')) {
      return '300';
    } else if (normalizedName.includes('25')) {
      return '25';
    } else if (normalizedName.includes('35')) {
      return '35';
    } else if (normalizedName.includes('40')) {
      return '40';
    } else if (normalizedName.includes('45')) {
      return '45';
    } else if (normalizedName.includes('50')) {
      return '50';
    } else if (normalizedName.includes('55')) {
      return '55';
    } else if (normalizedName.includes('60')) {
      return '60';
    } else if (normalizedName.includes('65')) {
      return '65';
    } else if (normalizedName.includes('70')) {
      return '70';
    } else if (normalizedName.includes('75')) {
      return '75';
    } else if (normalizedName.includes('80')) {
      return '80';
    } else if (normalizedName.includes('85')) {
      return '85';
    } else if (normalizedName.includes('90')) {
      return '90';
    } else if (normalizedName.includes('95')) {
      return '95';
    } else if (normalizedName.includes('105')) {
      return '105';
    }

    return '400';
  }

  isFontLoaded(family, weight) {
    const fontKey = `${family}-${weight}`;
    return this.loadedFonts.has(fontKey);
  }

  getLoadedFonts() {
    return Array.from(this.loadedFonts);
  }
}

export default FontLoader;
