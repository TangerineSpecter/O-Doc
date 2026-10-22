import type {MeadowPose, PixelOptions} from './meadowTypes';
interface SlimeSurfacePose {
    cx: number; baseY: number; rx: number; h: number; tipSway: number; bodyTilt: number;
    puddleMelt: number; wobbleAmp: number; wobblePhase: number; glowBoost: number;
    hitWhite: boolean; fractureProgress: number; eyeMode: string; mouthMode: string;
}
/* Water-drop silhouette and motion adapted from MonsterTemplate_v1.html.
   Saturated water-blue clusters, curved reflections and animated gleams give a glossy jelly surface. */
export function createMeadowSlimeRenderer() {
'use strict';
const VW = 128, VH = 128;
const canvas = Object.assign(document.createElement('canvas'), {width: VW, height: VH});
const ctx = canvas.getContext('2d')!;
const imgData = ctx.createImageData(VW, VH);
const buf32 = new Uint32Array(imgData.data.buffer);
const insideMask = new Uint8Array(VW * VH);
const uGrid = new Float32Array(VW * VH), vGrid = new Float32Array(VW * VH), edgeDistGrid = new Float32Array(VW * VH);
let showLayers = false, useDither = true;
function hex32(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >>> 16);
}
function setBufPx(arr: Uint32Array, x: number, y: number, color: number) {
  x = x | 0; y = y | 0;
  if (x >= 0 && y >= 0 && x < VW && y < VH) arr[y * VW + x] = color;
}
const BAYER4 = [
  [ 0/16 - 0.5,  8/16 - 0.5,  2/16 - 0.5, 10/16 - 0.5],
  [12/16 - 0.5,  4/16 - 0.5, 14/16 - 0.5,  6/16 - 0.5],
  [ 3/16 - 0.5, 11/16 - 0.5,  1/16 - 0.5,  9/16 - 0.5],
  [15/16 - 0.5,  7/16 - 0.5, 13/16 - 0.5,  5/16 - 0.5]
];
const PAL = {
  white: hex32('#ffffff'),
  outTop: hex32('#257caa'),
  outMid: hex32('#175c93'),
  outBot: hex32('#154477'),
  rimInner: hex32('#c2fcff'),
  rimInnerBot: hex32('#67dfef'),
  jelly0: hex32('#b8f7ff'),
  jelly1: hex32('#73e5fa'),
  jelly2: hex32('#3bc9ef'),
  jelly3: hex32('#20a4df'),
  jelly4: hex32('#2185c4'),
  jelly5: hex32('#2165aa'),
  charge0: hex32('#ffffff'),
  charge1: hex32('#cdfbff'),
  charge2: hex32('#8cf2ff'),
  charge3: hex32('#4cd8fa'),
  glossCore: hex32('#ffffff'),
  glossSoft: hex32('#dcfdff'),
  bubbleRing: hex32('#aaf5ff'),
  eyeDark: hex32('#24344d'),
  eyeGlow: hex32('#46698d'),
  blush: hex32('#f3adc3'),
  mouthInner: hex32('#d96880'),
  dbgOutline: hex32('#ff4d79'),
  dbgBody: hex32('#4cc9f0'),
  dbgGloss: hex32('#ffbe0b'),
  dbgCaustic: hex32('#8338ec'),
  dbgFluid: hex32('#06d6a0'),
};
const internalBubbles = [
  { u: -0.52, v: 0.28, r: 2.8, speed: 0.08, phase: 0.0 },
  { u:  0.34, v: 0.56, r: 3.4, speed: 0.06, phase: 1.8 },
  { u:  0.58, v: 0.26, r: 2.1, speed: 0.10, phase: 3.6 },
  { u: -0.20, v: 0.60, r: 1.5, speed: 0.07, phase: 2.7 }
];
function renderSlimeToBuf(pose: SlimeSurfacePose, time: number) {

  const { cx, baseY, rx, h, tipSway, bodyTilt, puddleMelt, wobbleAmp, wobblePhase, glowBoost, hitWhite, fractureProgress, eyeMode, mouthMode } = pose;

  insideMask.fill(0);

  const yMin = Math.max(2, Math.floor(baseY - h * 1.12));
  const yMax = Math.min(VH - 3, Math.ceil(baseY + 12));
  const xMin = Math.max(2, Math.floor(cx - rx * 1.42));
  const xMax = Math.min(VW - 3, Math.ceil(cx + rx * 1.42));

  for (let y = yMin; y <= yMax; y++) {
    const rowOff = y * VW;
    for (let x = xMin; x <= xMax; x++) {
      const uApprox = (x - cx) / rx;
      const botCurve = 6.8 * Math.max(0, 1.0 - uApprox * uApprox) * (1.0 - puddleMelt * 0.55);
      const v = (baseY + botCurve - y) / h;
      if (v < 0.0 || v > 1.03) continue;

      let centerShift = tipSway * Math.pow(v, 1.85) + bodyTilt * v * 16.0;
      if (wobbleAmp > 0.01) {
        centerShift += Math.sin(v * 10.5 + wobblePhase) * wobbleAmp * Math.sin(v * Math.PI);
      }

      const u = (x - (cx + centerShift)) / rx;

      let halfW = 0;
      if (v < 0.14) {
        const tb = (0.14 - v) / 0.14;
        halfW = Math.sqrt(Math.max(0, 1.0 - 0.15 * tb * tb));
      } else {
        const tv = (v - 0.14) / 0.86;
        if (tv > 1.0) continue;
        const dome = Math.pow(Math.cos(tv * Math.PI * 0.5), 0.76);
        const pinch = 0.21 * Math.sin(Math.max(0, (tv - 0.50) / 0.50) * Math.PI);
        const dropW = Math.max(0, (dome - pinch) * (1.0 - Math.pow(tv, 4.6)));
        if (puddleMelt > 0.01) {
          const flatDome = Math.sqrt(Math.max(0, 1.0 - tv * tv));
          halfW = flatDome * puddleMelt + dropW * (1.0 - puddleMelt);
        } else {
          halfW = dropW;
        }
      }

      if (wobbleAmp > 0.02) {
        halfW += Math.cos(v * 14.0 - wobblePhase * 1.2) * (wobbleAmp * 0.012);
      }

      if (halfW < 0.015) continue;

      const dist = Math.abs(u) - halfW;
      if (dist <= 0.0) {
        const idx = rowOff + x;
        insideMask[idx] = 1;
        uGrid[idx] = u;
        vGrid[idx] = v;
        edgeDistGrid[idx] = dist / Math.max(0.12, halfW);
      }
    }
  }

  for (let y = yMin; y <= yMax; y++) {
    const rowOff = y * VW;
    const bayerRow = BAYER4[y & 3];
    for (let x = xMin; x <= xMax; x++) {
      const idx = rowOff + x;
      if (!insideMask[idx]) continue;

      if (hitWhite) {
        buf32[idx] = PAL.white;
        continue;
      }

      const u = uGrid[idx];
      const v = vGrid[idx];
      const normDist = edgeDistGrid[idx];

      if (fractureProgress > 0.05) {
        const c1 = Math.abs(u * 40 - (v - 0.45) * 35 + Math.sin(v * 18) * 3);
        const c2 = Math.abs(u * 40 + (v - 0.42) * 35 + Math.cos(u * 18) * 3);
        if (c1 < 1.8 * fractureProgress || c2 < 1.8 * fractureProgress) {
          buf32[idx] = PAL.white;
          continue;
        }
      }

      const isOuter1px = (
        !insideMask[idx - 1] || !insideMask[idx + 1] ||
        !insideMask[idx - VW] || !insideMask[idx + VW]
      );
      const isOuter2px = !isOuter1px && (
        !insideMask[idx - VW - 1] || !insideMask[idx - VW + 1] ||
        !insideMask[idx + VW - 1] || !insideMask[idx + VW + 1]
      );

      if (isOuter1px || (isOuter2px && v < 0.85)) {
        if (showLayers) {
          buf32[idx] = PAL.dbgOutline;
        } else {
          if (v > 0.55 && u < 0.15) buf32[idx] = PAL.outTop;
          else if (v > 0.12) buf32[idx] = PAL.outMid;
          else buf32[idx] = PAL.outBot;
        }
        continue;
      }

      // Luminous center, blue edge and narrow cyan rim describe translucent jelly.
      const dither = useDither ? (bayerRow[x & 3] * 0.035) : 0;
      const shadeVal = Math.hypot((u + .24) * .64, (v - .66) * .85) + dither;

      let col = PAL.jelly3;
      if (glowBoost > 0.35) {
        if (shadeVal < 0.30) col = PAL.charge0;
        else if (shadeVal < 0.55) col = PAL.charge1;
        else if (shadeVal < 0.82) col = PAL.charge2;
        else col = PAL.charge3;
      } else {
        if (shadeVal < .24) col = PAL.jelly0;
        else if (shadeVal < .42) col = PAL.jelly1;
        else if (shadeVal < .60) col = PAL.jelly2;
        else if (shadeVal < .76) col = PAL.jelly3;
        else col = PAL.jelly4;
        if (normDist > -.14 && u > .25 && v < .62) col = PAL.jelly4;
        if (v < .045 + .018 * Math.cos(u * 4)) col = PAL.jelly5;
      }

      if (showLayers) col = PAL.dbgBody;

      if (normDist > -.065 && v > .16 && v < .84) {
        col = showLayers ? PAL.dbgGloss : u < 0 ? PAL.rimInner : PAL.rimInnerBot;
      }
      // Curved upper reflection and a broken lower reflection; no dark oval base lens.
      const shineV = v + Math.sin(time * 2.1) * .008;
      if (u < -.18 && normDist > -.38 && normDist < -.16 && shineV > .45 && shineV < .73) {
        const core = normDist > -.31 && normDist < -.20 && shineV > .49 && shineV < .69;
        col = showLayers ? PAL.dbgGloss : core ? PAL.glossCore : PAL.glossSoft;
      }
      const topGloss = ((u + .19) / .115) ** 2 + ((v - .83) / .055) ** 2;
      if (topGloss < 1) col = showLayers ? PAL.dbgGloss : PAL.glossSoft;
      if (normDist > -.19 && normDist < -.10 && u > .35 && v > .22 && v < .57) {
        col = showLayers ? PAL.dbgGloss : PAL.rimInner;
      }
      const waveV = .11 + .037 * Math.cos(u * 3.7 + time * 1.8);
      if (Math.abs(v - waveV) < .012 && u > -.62 && u < .48) {
        col = showLayers ? PAL.dbgCaustic : PAL.rimInnerBot;
      }
      if (u < -.66 && u > -.78 && v > .22 && v < .27) col = showLayers ? PAL.dbgGloss : PAL.glossCore;

      buf32[idx] = col;
    }
  }

  if (!hitWhite) {
    internalBubbles.forEach(b => {
      const animV = ((b.v + time * b.speed) % 0.64) + 0.14;
      const sloshU = b.u + Math.sin(time * 2.4 + b.phase) * 0.045 + (tipSway / rx) * 0.25;
      const bx = Math.round(cx + sloshU * rx + tipSway * Math.pow(animV, 1.85));
      const by = Math.round(baseY + 3 - animV * h);
      const rInt = Math.ceil(b.r);

      for (let dy = -rInt; dy <= rInt; dy++) {
        const py = by + dy;
        if (py < 0 || py >= VH) continue;
        for (let dx = -rInt; dx <= rInt; dx++) {
          const px = bx + dx;
          if (px < 0 || px >= VW) continue;
          const idx = py * VW + px;
          if (!insideMask[idx]) continue;
          const d = Math.hypot(dx, dy);
          if (d >= b.r - .8 && d <= b.r + 0.25) {
            buf32[idx] = showLayers ? PAL.dbgFluid : dx < 0 && dy < 0 ? PAL.glossCore : PAL.bubbleRing;
          } else if (dx === -Math.round(b.r * 0.35) && dy === -Math.round(b.r * 0.35)) {
            buf32[idx] = PAL.glossCore;
          }
        }
      }
    });

    // Small four-point glints pulse slowly and remain attached to the surface.
    for (const [u, v, phase] of [[.57, .50, .5], [-.69, .31, 2.8], [.13, .80, 4.1]]) {
      const pulse = Math.max(0, Math.sin(time * 2.2 + phase));
      const arm = 1 + Math.round(pulse * 2);
      const gx = Math.round(cx + u * rx + tipSway * Math.pow(v, 1.85));
      const gy = Math.round(baseY + 3 - v * h);
      for (let dy = -arm - 1; dy <= arm + 1; dy++) for (let dx = -arm; dx <= arm; dx++) {
        const x = gx + dx, y = gy + dy, i = y * VW + x;
        if (x < 0 || x >= VW || y < 0 || y >= VH || !insideMask[i]) continue;
        if ((dx === 0 && Math.abs(dy) <= arm + 1) || (dy === 0 && Math.abs(dx) <= arm) || (Math.abs(dx) + Math.abs(dy) === 2 && pulse > .65)) {
          const core = Math.abs(dx) + Math.abs(dy) <= arm;
          buf32[i] = showLayers ? PAL.dbgGloss : core ? PAL.glossCore : PAL.glossSoft;
        }
      }
    }
  }

  if (!hitWhite) {
    const faceShiftX = Math.round(tipSway * 0.22 + bodyTilt * 6);
    const eyeY = Math.round(baseY - 0.34 * h);
    const eyeSpan = Math.round(0.27 * rx);
    const leftEyeX = Math.round(cx - eyeSpan + faceShiftX);
    const rightEyeX = Math.round(cx + eyeSpan + faceShiftX);

    const blushY = eyeY + Math.max(3, Math.round(0.11 * h));
    const blushOffset = Math.round(0.14 * rx);
    [leftEyeX - blushOffset, rightEyeX + blushOffset].forEach(bxCenter => {
      for (let dy = -2; dy <= 2; dy++) {
        const py = blushY + dy;
        if (py < 0 || py >= VH) continue;
        for (let dx = -4; dx <= 4; dx++) {
          const px = bxCenter + dx;
          if (px < 0 || px >= VW) continue;
          const d = (dx / 4.2) ** 2 + (dy / 1.7) ** 2;
          if (d <= 1.0) {
            const idx = py * VW + px;
            if (insideMask[idx]) {
              buf32[idx] = showLayers ? PAL.dbgFluid : PAL.blush;
            }
          }
        }
      }
    });

    const eyeCol = showLayers ? PAL.dbgOutline : PAL.eyeDark;
    [leftEyeX, rightEyeX].forEach((ex, idx) => {
      if (eyeMode === 'blink') {
        for (let dx = -4; dx <= 4; dx++) {
          const arcY = Math.abs(dx) > 2 ? 1 : 0;
          setBufPx(buf32, ex + dx, eyeY + arcY, eyeCol);
          setBufPx(buf32, ex + dx, eyeY + arcY + 1, eyeCol);
        }
      } else if (eyeMode === 'happy') {
        for (let dx = -4; dx <= 4; dx++) {
          const dy = Math.round((dx * dx) / 4.5) - 2;
          setBufPx(buf32, ex + dx, eyeY + dy, eyeCol);
          setBufPx(buf32, ex + dx, eyeY + dy + 1, eyeCol);
        }
      } else if (eyeMode === 'hurt') {
        const dir = idx === 0 ? 1 : -1;
        for (let k = -4; k <= 4; k++) {
          const ox = ex + dir * (3 - Math.abs(k));
          setBufPx(buf32, ox, eyeY + k, eyeCol);
          setBufPx(buf32, ox + 1, eyeY + k, eyeCol);
        }
      } else {
        const eyRad = puddleMelt > 0.4 ? 3.4 : 5.8;
        const exRad = 5.3;
        for (let dy = -6; dy <= 6; dy++) {
          for (let dx = -5; dx <= 5; dx++) {
            if (eyeMode === 'fierce' && dy < -2 + (idx === 0 ? dx : -dx) * 0.55) continue;
            if ((dx / exRad) ** 2 + (dy / eyRad) ** 2 <= 1.0) {
              const isIrisGlow = (dy >= 2 && dy <= 3 && Math.abs(dx) <= 2);
              setBufPx(buf32, ex + dx, eyeY + dy, isIrisGlow ? PAL.eyeGlow : eyeCol);
            }
          }
        }
        const hlY = eyeMode === 'fierce' ? eyeY - 1 : eyeY - 2;
        setBufPx(buf32, ex - 2, hlY,     PAL.glossCore);
        setBufPx(buf32, ex - 1, hlY,     PAL.glossCore);
        setBufPx(buf32, ex - 2, hlY + 1, PAL.glossCore);
      }
    });

    const mouthCx = Math.round(cx + faceShiftX);
    const mouthCy = eyeY + Math.max(3, Math.round(0.11 * h));
    if (mouthMode === 'smile') {
      for (let dx = -3; dx <= 3; dx++) {
        const dy = Math.abs(dx) === 3 ? 0 : Math.abs(dx) === 2 ? 1 : 2;
        setBufPx(buf32, mouthCx + dx, mouthCy + dy, eyeCol);
      }
    } else if (mouthMode === 'cat') {
      for (let dx = -6; dx <= 6; dx++) {
        const lobe = Math.abs(dx) - 3;
        const dy = Math.round(2.2 - (lobe / 2.2) ** 2);
        setBufPx(buf32, mouthCx + dx, mouthCy + dy, eyeCol);
      }
    } else if (mouthMode === 'open') {
      for (let dy = -3; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = (dx / 4.2) ** 2 + (dy / 3.6) ** 2;
          if (d <= 1.0) {
            setBufPx(buf32, mouthCx + dx, mouthCy + dy, (d < 0.65 && dy > -1) ? PAL.mouthInner : eyeCol);
          }
        }
      }
    } else if (mouthMode === 'wavy') {
      for (let dx = -6; dx <= 6; dx++) {
        const dy = Math.round(Math.sin(dx * 1.1 + time * 12) * 1.4);
        setBufPx(buf32, mouthCx + dx, mouthCy + dy, eyeCol);
        setBufPx(buf32, mouthCx + dx, mouthCy + dy + 1, eyeCol);
      }
    }
  }
}

function draw(p: Partial<MeadowPose> = {}, time = 0, options: PixelOptions = {}) {
  showLayers = Boolean(options.layers); useDither = options.dither !== false;
  buf32.fill(0);
  renderSlimeToBuf({cx: 64, baseY: 111, rx: 45 * (p.sx ?? 1), h: 83 * (p.sy ?? 1),
    tipSway: p.sway ?? 0, bodyTilt: (p.tilt ?? 0) / 16, puddleMelt: Math.max(0, 1 - (p.sy ?? 1)),
    wobbleAmp: (p.wobble ?? .15) * 2, wobblePhase: time * 8, glowBoost: 0,
    hitWhite: Boolean(p.flash), fractureProgress: p.fracture ?? 0,
    eyeMode: p.hurt ? 'hurt' : p.blink ? 'blink' : 'normal', mouthMode: p.hurt ? 'wavy' : 'smile'}, time);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
return {draw};
}
