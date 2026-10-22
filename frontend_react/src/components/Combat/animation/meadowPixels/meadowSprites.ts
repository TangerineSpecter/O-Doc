import {meadowSpriteData} from './meadowSpriteData';
import {createMeadowSlimeRenderer} from './meadowSlime';
import {shouldMirrorMeadow} from './meadowTypes';
import type {Facing, MeadowKey, MeadowPose, PixelOptions} from './meadowTypes';
interface BodyPart {pivot: number[]; type: string; side: number; polygon: number[][]; bounds?: number[]}
interface DecodedSprite {palette: Uint32Array; pixels: Uint8Array; masks: Uint8Array; sourceFacing: Facing; parts: (BodyPart & {bounds: number[]})[]}
/* Indexed sprites follow MonsterTemplate_v1's boss pipeline.
   Anatomical masks animate ears, wings and legs while retaining the painted texture. */
export function createMeadowSpriteRenderer() {
  'use strict';
  const size = 128;
  const slime = createMeadowSlimeRenderer();
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const image = ctx.createImageData(size, size), buffer = new Uint32Array(image.data.buffer);
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const pack = (r: number, g: number, b: number) => (255 << 24) | (b << 16) | (g << 8) | r;
  const hex = (value: string) => { const n = parseInt(value.slice(1), 16); return pack(n >>> 16, (n >>> 8) & 255, n & 255); };
  const debug = { outline: hex('#f1769d'), body: hex('#5faebc'), detail: hex('#e7bd65'), limb: hex('#9c84c4') };
  function inPolygon(x: number, y: number, points: number[][]) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [a, b] = points[i], [u, v] = points[j];
      if ((b > y) !== (v > y) && x < (u - a) * (y - b) / (v - b) + a) inside = !inside;
    }
    return inside;
  }
  const parts: Record<Exclude<MeadowKey, "slime">, BodyPart[]> = {
    rabbit: [
      { pivot: [53, 29], type: 'ear', side: -1, polygon: [[8, 78], [7, 61], [24, 34], [43, 20], [55, 24], [48, 47], [32, 68], [20, 80]] },
      { pivot: [85, 39], type: 'ear', side: 1, polygon: [[80, 35], [89, 26], [106, 25], [117, 38], [124, 87], [116, 94], [102, 80], [93, 57], [85, 49]] },
      { pivot: [30, 95], type: 'tail', side: 0, polygon: [[15, 81], [29, 81], [32, 105], [16, 107]] }
    ],
    beetle: [
      { pivot: [25, 68], type: 'antenna', side: -1, polygon: [[0, 37], [20, 36], [29, 66], [22, 70], [6, 58]] },
      { pivot: [44, 67], type: 'antenna', side: 1, polygon: [[25, 36], [40, 36], [49, 66], [41, 69], [33, 51]] },
      ...[0, 1, 2, 3].map(n => ({ pivot: [30 + n * 26, 97], type: 'leg', side: n,
        polygon: [[12 + n * 28, 97], [40 + n * 28, 97], [40 + n * 28, 124], [12 + n * 28, 124]] }))
    ],
    glowbug: [
      { pivot: [78, 64], type: 'wing', side: -1, polygon: [[77, 44], [89, 26], [111, 14], [126, 15], [127, 38], [111, 52], [86, 65], [77, 64]] },
      { pivot: [85, 67], type: 'wing', side: 1, polygon: [[83, 63], [99, 54], [126, 48], [127, 66], [114, 74], [94, 73]] },
      { pivot: [34, 35], type: 'antenna', side: -1, polygon: [[0, 4], [26, 4], [38, 32], [30, 36], [19, 23], [2, 20]] },
      { pivot: [59, 36], type: 'antenna', side: 1, polygon: [[33, 4], [50, 4], [63, 30], [61, 37], [52, 36], [43, 20], [33, 19]] }
    ]
  };
  const sprites = Object.fromEntries(Object.entries(meadowSpriteData).map(([key, data]) => {
    const raw = atob(data.pixels), pixels = Uint8Array.from(raw, c => c.charCodeAt(0));
    const palette = Uint32Array.from([0, ...data.palette.map(hex)]), masks = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!pixels[y * size + x]) continue;
      masks[y * size + x] = parts[key as Exclude<MeadowKey, "slime">].findIndex(p => inPolygon(x, y, p.polygon)) + 1;
    }
    const boundedParts = parts[key as Exclude<MeadowKey, "slime">].map(part => ({ ...part, bounds: [
      Math.max(0, Math.floor(Math.min(...part.polygon.map(p => p[0])) - 5)),
      Math.max(0, Math.floor(Math.min(...part.polygon.map(p => p[1])) - 5)),
      Math.min(127, Math.ceil(Math.max(...part.polygon.map(p => p[0])) + 5)),
      Math.min(127, Math.ceil(Math.max(...part.polygon.map(p => p[1])) + 5))
    ] }));
    return [key, { ...data, pixels, palette, masks, parts: boundedParts }];
  }));
  function inversePart(part: BodyPart, x: number, y: number, p: Partial<MeadowPose>, time: number) {
    const [cx, cy] = part.pivot, dx = x - cx, dy = y - cy;
    if (part.type === 'ear') {
      const weight = clamp(Math.hypot(dx, dy) / 48) ** 1.4;
      const sway = Math.sin(time * 3.1 + part.side * .8) * 1.15 + (p.sway || 0) * .28;
      return [x - sway * weight, y - Math.cos(time * 2.8 + part.side) * .65 * weight];
    }
    if (part.type === 'wing') {
      const flap = Math.sin(time * 25 + part.side * .6), stretch = .86 + flap * .13;
      const angle = flap * .055 * part.side, co = Math.cos(angle), si = Math.sin(angle);
      return [cx + (dx * co + dy * si) / stretch, cy + (-dx * si + dy * co)];
    }
    if (part.type === 'antenna') return [x - Math.sin(time * 3 + part.side) * clamp((cy - y) / 26) * 1.1, y];
    if (part.type === 'leg') {
      const weight = clamp((y - cy) / 13), step = Math.sin(time * 11 + part.side * 1.8) * (p.walk || 0);
      return [x - step * weight * 2, y + Math.max(0, step) * weight * 2];
    }
    return [x, y - Math.sin(time * 4) * clamp(Math.abs(dx) / 15)];
  }
  function shade(sprite: DecodedSprite, index: number, x: number, y: number, part: number, key: MeadowKey, pose: Partial<MeadowPose>, time: number, options: PixelOptions) {
    let color = sprite.palette[index];
    if (pose.flash) return hex('#fff9df');
    if ((pose.fracture ?? 0) > .05) {
      const crack1 = Math.abs((x - 66) - (y - 58) * .75 + Math.sin(y * .4) * 3);
      const crack2 = Math.abs((x - 66) + (y - 52) * .85 + Math.cos(x * .4) * 3);
      if (crack1 < 1.6 * (pose.fracture ?? 0) || crack2 < 1.6 * (pose.fracture ?? 0)) return hex('#ffffff');
    }
    const r = color & 255, g = (color >>> 8) & 255, b = (color >>> 16) & 255;
    if (options.layers) {
      const i = y * size + x;
      const boundary = x === 0 || x === 127 || y === 0 || y === 127 || !sprite.pixels[i - 1] || !sprite.pixels[i + 1] || !sprite.pixels[i - size] || !sprite.pixels[i + size];
      return boundary ? debug.outline : part ? debug.limb : r + g + b > 560 ? debug.detail : debug.body;
    }
    if (key === 'glowbug' && x > 78 && y > 72 && r > 160 && g > 100 && b < 190) {
      const charge = pose.action === 'attack' ? Math.sin(clamp((pose.elapsed ?? 0) / .7) * Math.PI) * .3 : 0;
      const light = .04 + Math.sin(time * 3.4) * .035 + charge;
      color = pack(Math.round(r + (255 - r) * light), Math.round(g + (246 - g) * light), Math.round(b + (162 - b) * light));
    }
    return color;
  }
  function drawSprite(key: MeadowKey, pose: Partial<MeadowPose> = {}, time = 0, options: PixelOptions = {}) {
    if (key === 'slime') return slime.draw(pose, time, options);
    const sprite = sprites[key]; buffer.fill(0);
    const flip = shouldMirrorMeadow(key, pose.facing ?? sprite.sourceFacing);
    for (let layer = 0; layer <= sprite.parts.length; layer++) {
      const [x0, y0, x1, y1] = layer ? sprite.parts[layer - 1].bounds : [0, 0, 127, 127];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        let sx = x, sy = y;
        if (layer) { const uv = inversePart(sprite.parts[layer - 1], x, y, pose, time); sx = Math.round(uv[0]); sy = Math.round(uv[1]); }
        if (sx < 0 || sx >= size || sy < 0 || sy >= size) continue;
        const i = sy * size + sx, paletteIndex = sprite.pixels[i];
        if (!paletteIndex || sprite.masks[i] !== layer) continue;
        buffer[y * size + (flip ? 127 - x : x)] = shade(sprite, paletteIndex, sx, sy, layer, key, pose, time, options);
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }
  return {drawSprite};
}
