import {caveSpriteData} from './caveSpriteData';
import {kingSourcePoint} from './kingDeformation';
import type {CaveKey,CavePose} from './caveTypes';
import type {PixelOptions,IndexedSprite} from '../meadowPixels/meadowTypes';
interface BodyPart {pivot:number[];type:string;side?:number;polygon:number[][]}
interface DecodedSprite extends Omit<IndexedSprite,'pixels'|'palette'> {pixels:Uint8Array;palette:Uint32Array;masks:Uint8Array}
export function createCaveSpriteRenderer() {
  const size = 128;
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const image = ctx.createImageData(size, size), buffer = new Uint32Array(image.data.buffer);
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const channel = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const pack = (r: number, g: number, b: number) => (255 << 24) | (channel(b) << 16) | (channel(g) << 8) | channel(r);
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
  const parts: Record<CaveKey, BodyPart[]> = {
    bat: [
      { pivot: [45, 96], type: 'batWing', side: -1, polygon: [[0,72],[27,70],[43,86],[46,100],[37,110],[0,108]] },
      { pivot: [75, 95], type: 'batWing', side: 1, polygon: [[76,92],[89,67],[110,75],[128,95],[127,108],[80,109]] },
      { pivot: [53, 85], type: 'ear', side: -1, polygon: [[35,55],[49,57],[54,82],[48,87]] },
      { pivot: [65, 84], type: 'ear', side: 1, polygon: [[58,79],[64,53],[77,55],[74,82],[66,89]] }
    ],
    lizard: [
      { pivot: [91, 94], type: 'tail', side: 1, polygon: [[90,81],[128,78],[128,109],[94,108]] },
      { pivot: [27, 99], type: 'leg', side: 0, polygon: [[16,96],[35,96],[33,119],[9,119]] },
      { pivot: [51, 100], type: 'leg', side: 1, polygon: [[43,98],[65,98],[65,128],[36,128]] },
      { pivot: [92, 101], type: 'leg', side: 2, polygon: [[86,99],[103,99],[111,121],[83,121]] }
    ],
    beast: [
      { pivot: [25, 99], type: 'leg', side: 0, polygon: [[9,98],[36,98],[34,119],[0,119]] },
      { pivot: [82, 100], type: 'leg', side: 1, polygon: [[65,100],[96,100],[97,128],[58,128]] },
      { pivot: [112, 99], type: 'leg', side: 2, polygon: [[102,98],[128,98],[128,116],[100,116]] }
    ],
    king: [
      { pivot: [47, 21], type: 'crown', polygon: [[34,0],[58,0],[60,29],[35,29]] },
      { pivot: [44, 89], type: 'leg', side: 0, polygon: [[37,86],[50,89],[49,128],[31,128]] },
      { pivot: [61, 91], type: 'leg', side: 1, polygon: [[55,86],[68,88],[68,128],[50,128]] },
      { pivot: [92, 91], type: 'leg', side: 2, polygon: [[81,86],[98,88],[98,128],[75,128]] },
      { pivot: [106, 91], type: 'leg', side: 3, polygon: [[99,86],[115,86],[126,128],[105,128]] }
    ]
  };
  const sprites = Object.fromEntries(Object.entries(caveSpriteData).map(([key, data]) => {
    const raw = atob(data.pixels), pixels = Uint8Array.from(raw, c => c.charCodeAt(0));
    const palette = Uint32Array.from([0, ...data.palette.map(hex)]), masks = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!pixels[y * size + x]) continue;
      masks[y * size + x] = parts[key as CaveKey].findIndex(p => inPolygon(x, y, p.polygon)) + 1;
    }
    const boundedParts = parts[key as CaveKey].map(part => ({ ...part, bounds: [
      Math.max(0, Math.floor(Math.min(...part.polygon.map(p => p[0])) - 5)),
      Math.max(0, Math.floor(Math.min(...part.polygon.map(p => p[1])) - 5)),
      Math.min(127, Math.ceil(Math.max(...part.polygon.map(p => p[0])) + 5)),
      Math.min(127, Math.ceil(Math.max(...part.polygon.map(p => p[1])) + 5))
    ] }));
    return [key, { ...data, pixels, palette, masks, parts: boundedParts }];
  }));
  function inversePart(part: BodyPart, x: number, y: number, p: Partial<CavePose>, time: number) {
    const [cx, cy] = part.pivot, dx = x - cx, dy = y - cy;
    if (part.type === 'ear') {
      const weight = clamp(Math.hypot(dx, dy) / 48) ** 1.4;
      const sway = Math.sin(time * 3.1 + (part.side ?? 0) * .8) * 1.15 + (p.sway || 0) * .28;
      return [x - sway * weight, y - Math.cos(time * 2.8 + (part.side ?? 0)) * .65 * weight];
    }
    if (part.type === 'batWing') {
      // The shoulder stays attached: progressively bend the wing toward its tip.
      const weight = clamp(Math.abs(dx) / 43);
      const flap = Math.sin(time * (p.action === 'move' ? 19 : 13));
      return [x, y - flap * 11 * weight];
    }
    if (part.type === 'crown') return [x, y - Math.sin(time * 2.4) * 1.5];
    if (part.type === 'tail') return [x, y - Math.sin(time * 4 + dx * .04) * clamp(dx / 30) * (p.walk ? 3 : 1.4)];
    if (part.type === 'antenna') return [x - Math.sin(time * 3 + (part.side ?? 0)) * clamp((cy - y) / 26) * 1.1, y];
    if (part.type === 'leg') {
      const weight = clamp((y - cy) / 19), step = Math.sin((p.elapsed || 0) * 9 + (part.side ?? 0) * Math.PI) * (p.walk || 0);
      return [x - step * weight * 3, y + Math.max(0, step) * weight * 3];
    }
    return [x, y - Math.sin(time * 4) * clamp(Math.abs(dx) / 15)];
  }
  function shade(sprite: DecodedSprite, index: number, x: number, y: number, part: number, key: CaveKey, pose: Partial<CavePose>, options: PixelOptions) {
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
    if (key === 'lizard' && pose.action === 'crystal' && g > r * 1.15 && b > r * 1.15) {
      const charge = clamp((pose.elapsed ?? 0) / .65), release = clamp(((pose.elapsed ?? 0) - 1.25) / .65);
      const glow = (charge * charge * (3 - 2 * charge)) * (1 - release * release * (3 - 2 * release)) * .55;
      color = pack(Math.round(r + (225-r)*glow), Math.round(g + (255-g)*glow), Math.round(b + (255-b)*glow));
    }
    return color;
  }
  function drawSprite(key: CaveKey, pose: Partial<CavePose> = {}, time = 0, options: PixelOptions = {}) {
    const sprite = sprites[key]; buffer.fill(0);
    const flip = (pose.facing ?? sprite.sourceFacing) !== sprite.sourceFacing;
    if (key === 'king') {
      // One continuous inverse deformation for the entire deer. No cut-out leg
      // masks: hooves and joints cannot leave their old pixels behind.
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        let [sx, sy] = kingSourcePoint(x, y, pose, time);
        sx = Math.round(sx); sy = Math.round(sy);
        if (sx < 0 || sx >= size || sy < 0 || sy >= size) continue;
        const i = sy * size + sx, index = sprite.pixels[i];
        if (index) buffer[y * size + (flip ? 127 - x : x)] = shade(sprite, index, sx, sy, sprite.masks[i], key, pose, options);
      }
      ctx.putImageData(image, 0, 0);
      return canvas;
    }
    for (let layer = 0; layer <= sprite.parts.length; layer++) {
      const [x0, y0, x1, y1] = layer ? sprite.parts[layer - 1].bounds : [0, 0, 127, 127];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        let sx = x, sy = y;
        if (layer) { const uv = inversePart(sprite.parts[layer - 1], x, y, pose, time); sx = Math.round(uv[0]); sy = Math.round(uv[1]); }
        if (sx < 0 || sx >= size || sy < 0 || sy >= size) continue;
        const i = sy * size + sx, paletteIndex = sprite.pixels[i];
        if (!paletteIndex || sprite.masks[i] !== layer) continue;
        buffer[y * size + (flip ? 127 - x : x)] = shade(sprite, paletteIndex, sx, sy, layer, key, pose, options);
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }
return {drawSprite};
}
