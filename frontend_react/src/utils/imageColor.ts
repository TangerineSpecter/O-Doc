export type DominantColorKey =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'brown'
  | 'gray';

export interface DominantColorResult {
  key: DominantColorKey;
  label: string;
  hex: string;
}

export const COLOR_SWATCHES: Array<{
  key: DominantColorKey;
  label: string;
  hex: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}> = [
  { key: 'red', label: '红', hex: '#ef4444', textClass: 'text-red-700', bgClass: 'bg-red-50', borderClass: 'border-red-200' },
  { key: 'orange', label: '橙', hex: '#f97316', textClass: 'text-orange-700', bgClass: 'bg-orange-50', borderClass: 'border-orange-200' },
  { key: 'yellow', label: '黄', hex: '#eab308', textClass: 'text-yellow-700', bgClass: 'bg-yellow-50', borderClass: 'border-yellow-200' },
  { key: 'green', label: '绿', hex: '#22c55e', textClass: 'text-green-700', bgClass: 'bg-green-50', borderClass: 'border-green-200' },
  { key: 'cyan', label: '青', hex: '#06b6d4', textClass: 'text-cyan-700', bgClass: 'bg-cyan-50', borderClass: 'border-cyan-200' },
  { key: 'blue', label: '蓝', hex: '#3b82f6', textClass: 'text-blue-700', bgClass: 'bg-blue-50', borderClass: 'border-blue-200' },
  { key: 'purple', label: '紫', hex: '#8b5cf6', textClass: 'text-purple-700', bgClass: 'bg-purple-50', borderClass: 'border-purple-200' },
  { key: 'pink', label: '粉', hex: '#ec4899', textClass: 'text-pink-700', bgClass: 'bg-pink-50', borderClass: 'border-pink-200' },
  { key: 'brown', label: '棕', hex: '#92400e', textClass: 'text-amber-800', bgClass: 'bg-amber-50', borderClass: 'border-amber-200' },
  { key: 'gray', label: '灰', hex: '#64748b', textClass: 'text-slate-700', bgClass: 'bg-slate-50', borderClass: 'border-slate-200' },
];

const CACHE_PREFIX = 'o-doc:image-dominant-color:v3:';

const rgbToHsv = (r: number, g: number, b: number) => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return {
    h: hue,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
};

const classifyPixel = (r: number, g: number, b: number): DominantColorKey => {
  const { h, s, v } = rgbToHsv(r, g, b);

  if (s < 0.16) return 'gray';
  if (h >= 18 && h < 52 && s > 0.28 && v < 0.66) return 'brown';
  if ((h >= 340 || h < 18) && v > 0.72 && s < 0.48) return 'pink';
  if (h >= 345 || h < 15) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 195) return 'cyan';
  if (h < 235) return 'blue';
  if (h < 305) return 'purple';
  return 'pink';
};

const getSwatchResult = (key: DominantColorKey): DominantColorResult => {
  const swatch = COLOR_SWATCHES.find(color => color.key === key) || COLOR_SWATCHES[COLOR_SWATCHES.length - 1];
  return {
    key: swatch.key,
    label: swatch.label,
    hex: swatch.hex,
  };
};

const getPixelWeight = (r: number, g: number, b: number, x: number, y: number, width: number, height: number) => {
  const { s, v } = rgbToHsv(r, g, b);
  if (v < 0.08 || (v > 0.93 && s < 0.24)) return 0;

  const normalizedX = width <= 1 ? 0.5 : x / (width - 1);
  const normalizedY = height <= 1 ? 0.5 : y / (height - 1);
  const distanceFromCenter = Math.hypot(normalizedX - 0.5, normalizedY - 0.5);
  const centerWeight = 1 + Math.max(0, 1 - distanceFromCenter / 0.62) * 1.15;
  const saturationWeight = s < 0.16 ? 0.2 : 0.8 + s * 2.1;
  const brightnessWeight = v < 0.24 ? 0.24 : v > 0.9 ? 0.64 : 1 + Math.max(0, 0.72 - Math.abs(v - 0.56));

  return saturationWeight * brightnessWeight * centerWeight;
};

const getCachedDominantColor = (cacheKey: string): DominantColorResult | null => {
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${cacheKey}`);
    return raw ? JSON.parse(raw) as DominantColorResult : null;
  } catch {
    return null;
  }
};

const setCachedDominantColor = (cacheKey: string, value: DominantColorResult) => {
  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${cacheKey}`, JSON.stringify(value));
  } catch {
    // localStorage can be unavailable in private contexts; extraction still works.
  }
};

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('图片加载失败'));
  image.src = src;
});

export const extractDominantColor = async (src: string, cacheKey = src): Promise<DominantColorResult | null> => {
  if (!src) return null;

  const cached = getCachedDominantColor(cacheKey);
  if (cached) return cached;

  try {
    const image = await loadImage(src);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    const maxSize = 56;
    const scale = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight, 1);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const { data } = context.getImageData(0, 0, width, height);
    const buckets = new Map<DominantColorKey, { weight: number; r: number; g: number; b: number }>();

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3];
      if (alpha < 80) continue;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const pixelIndex = index / 4;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      const key = classifyPixel(r, g, b);
      const weight = getPixelWeight(r, g, b, x, y, width, height);
      if (weight === 0) continue;
      const current = buckets.get(key) || { weight: 0, r: 0, g: 0, b: 0 };

      current.weight += weight;
      current.r += r * weight;
      current.g += g * weight;
      current.b += b * weight;
      buckets.set(key, current);
    }

    const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => b[1].weight - a[1].weight);
    const dominant = sortedBuckets[0];
    if (!dominant) return getSwatchResult('gray');

    const bucketMap = new Map(sortedBuckets);
    let key = dominant[0];
    const dominantWeight = dominant[1].weight;
    const purpleWeight = bucketMap.get('purple')?.weight || 0;
    const pinkWeight = bucketMap.get('pink')?.weight || 0;
    const redWeight = bucketMap.get('red')?.weight || 0;

    if (key === 'blue' && purpleWeight >= dominantWeight * 0.48) key = 'purple';
    if (key === 'red' && pinkWeight >= redWeight * 0.42) key = 'pink';

    const result = getSwatchResult(key);
    setCachedDominantColor(cacheKey, result);

    return result;
  } catch (error) {
    console.warn('主色调提取失败:', error);
    return getSwatchResult('gray');
  }
};
