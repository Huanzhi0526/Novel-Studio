export const storageKey = 'studio.preferences.v1';

export const themes = [
  ['ink', '墨灰', '#25262b'],
  ['indigo', '青黛', '#37538d'],
  ['jade', '松绿', '#2d6658'],
  ['rose', '烟紫', '#874965'],
  ['amber', '琥珀', '#794d2a']
];

export const papers = [
  ['white', '白纸', '#ffffff'],
  ['warm', '米纸', '#f8f2e5'],
  ['green', '护眼', '#eaf2e7'],
  ['dark', '夜写', '#252933']
];

export const rulings = [
  ['none', '空白'],
  ['lines', '横线'],
  ['grid', '方格']
];

export const fonts = [
  ['system', '系统黑体', '"Segoe UI Variable", "Microsoft YaHei UI", sans-serif'],
  ['serif', '宋体', 'SimSun, "Microsoft YaHei", serif'],
  ['mono', '等宽', 'Consolas, "Microsoft YaHei UI", monospace']
];

export const readerSizes = [16, 18, 20, 22, 24];

export const writingWidths = [
  ['window', '跟随窗口'],
  ['limit', '限制宽度']
];

export const writingDefaults = {
  paper: 'white',
  ruling: 'none',
  font: 'system',
  fontSize: 16,
  lineHeight: 1.95,
  width: 680,
  widthMode: 'limit',
  indent: false
};

export const defaults = { ...writingDefaults, theme: 'ink', readerSize: 18 };

function listed(value, entries, fallback) {
  return entries.some(([id]) => id === value) ? value : fallback;
}

function bounded(value, fallback, min, max) {
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export function normalizePreferences(values = {}) {
  const prefs = values ?? {};
  const width = bounded(prefs.width, defaults.width, 560, 1040);
  // 旧数据缺少 widthMode 时：若 width === 680 回退 'window'，否则（曾自定义过宽度）回退 'limit'
  const fallbackWidthMode = width === defaults.width ? 'window' : 'limit';
  return {
    theme: listed(prefs.theme, themes, defaults.theme),
    paper: listed(prefs.paper, papers, defaults.paper),
    ruling: listed(prefs.ruling, rulings, defaults.ruling),
    font: listed(prefs.font, fonts, defaults.font),
    fontSize: bounded(prefs.fontSize, defaults.fontSize, 14, 28),
    lineHeight: bounded(prefs.lineHeight, defaults.lineHeight, 1.5, 2.3),
    width,
    widthMode: listed(prefs.widthMode, writingWidths, fallbackWidthMode),
    indent: prefs.indent === true,
    readerSize: readerSizes.includes(prefs.readerSize) ? prefs.readerSize : defaults.readerSize
  };
}

export function loadPreferences(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(storageKey);
    const legacyReaderSize = Number(storage?.getItem('reader-size'));
    if (raw == null) {
      return {
        ...defaults,
        readerSize: readerSizes.includes(legacyReaderSize) ? legacyReaderSize : defaults.readerSize
      };
    }
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') {
      return {
        ...defaults,
        readerSize: readerSizes.includes(legacyReaderSize) ? legacyReaderSize : defaults.readerSize
      };
    }
    return normalizePreferences({ readerSize: legacyReaderSize, ...saved });
  } catch {
    return { ...defaults };
  }
}

export function savePreferences(preferences, storage = globalThis.localStorage) {
  try {
    storage?.setItem(storageKey, JSON.stringify(preferences));
  } catch (error) {
    console.warn('保存写作偏好失败', error);
  }
}

export function writingSurface(preferences) {
  const { paper, ruling, font, fontSize, lineHeight, width, widthMode, indent } = preferences;
  const measure = widthMode === 'limit' ? `${width}px` : '100%';
  const focusMeasure = widthMode === 'limit' ? `${width}px` : `${fontSize * 42}px`;
  return {
    'data-writing-paper': paper,
    'data-writing-ruling': ruling,
    'data-writing-indent': String(indent),
    style: {
      '--writing-font-family': fonts.find(([id]) => id === font)?.[2] ?? fonts[0][2],
      '--writing-font-size': `${fontSize}px`,
      '--writing-line-height': lineHeight,
      '--writing-line-step': `${fontSize * lineHeight}px`,
      '--writing-measure': measure,
      '--writing-width': measure,
      '--writing-focus-measure': focusMeasure,
      '--writing-indent': indent ? '2em' : '0em'
    }
  };
}
