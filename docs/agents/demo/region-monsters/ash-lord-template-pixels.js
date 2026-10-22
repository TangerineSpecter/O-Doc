/* Pixel kernels copied from ../MonsterTemplate_v1.html (sections 10A.2–4).
 * Keep the old fire turbulence, orb corona and soul crystal rasterization.
 * Only the deterministic timeline/coordinates are adapted to the regional studio.
 * Shared meadow hit/defeat remain outside this adapter. */
(() => {
const VW=320,VH=180,showLayers=false,useDither=false,dt=0,BAYER4=Array.from({length:4},()=>[0,0,0,0]);
const surface=Object.assign(document.createElement('canvas'),{width:VW,height:VH}),ctx=surface.getContext('2d'),pixels=ctx.createImageData(VW,VH),buf32=new Uint32Array(pixels.data.buffer);
function setBufPx(arr,x,y,color){x=Math.round(x);y=Math.round(y);if(x>=0&&x<VW&&y>=0&&y<VH)arr[y*VW+x]=color;}
function hex32(hex) {
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

const PAL = {
  white:       hex32('#ffffff'),
  outTop:      hex32('#1a6b8a'),
  outMid:      hex32('#124d66'),
  outBot:      hex32('#0b3144'),
  rimInner:    hex32('#b5f7ff'),
  rimInnerBot: hex32('#329bc4'),
  jelly0:      hex32('#e2fdff'),
  jelly1:      hex32('#a8f4ff'),
  jelly2:      hex32('#72e2fa'),
  jelly3:      hex32('#48c5eb'),
  jelly4:      hex32('#2ea3d0'),
  jelly5:      hex32('#1e7ea8'),
  charge0:     hex32('#ffffff'),
  charge1:     hex32('#cdfbff'),
  charge2:     hex32('#8cf2ff'),
  charge3:     hex32('#4cd8fa'),
  baseShadow:  hex32('#2385b0'),
  baseDeep:    hex32('#196b91'),
  caustic:     hex32('#8cf0ff'),
  glossCore:   hex32('#ffffff'),
  glossSoft:   hex32('#cefaff'),
  rimRight:    hex32('#8eeeff'),
  bubbleRing:  hex32('#c4f7ff'),
  eyeDark:     hex32('#103545'),
  eyeGlow:     hex32('#6ee2fc'),
  blush:       hex32('#cf9bb0'),
  mouthInner:  hex32('#d96880'),

  // Boss Fire & Soul Pixel Shader Ramp (Non-fluid, sharp pixel magic & flame)
  fireSmoke:   hex32('#2e1316'),
  fireOut:     hex32('#4a0e12'),
  fireDeep:    hex32('#9e191c'),
  fireMid:     hex32('#eb5615'),
  fireBright:  hex32('#ffbd24'),
  fireCore:    hex32('#fff9d2'),

  soulOut:     hex32('#1c0938'),
  soulDeep:    hex32('#561ca8'),
  soulMid:     hex32('#a542ff'),
  soulBright:  hex32('#6ef2ff'),
  soulCore:    hex32('#ffffff'),

  // 2D Pixel Water Splash Shader Ramp (Flat 2D pixel water, ZERO 3D Metaballs!)
  waterOut:    hex32('#0e3d59'),
  waterDeep:   hex32('#1a6b96'),
  waterMid:    hex32('#32aee0'),
  waterBright: hex32('#82f0ff'),
  waterFoam:   hex32('#ffffff'),

  dbgOutline:  hex32('#ff4d79'),
  dbgBody:     hex32('#4cc9f0'),
  dbgGloss:    hex32('#ffbe0b'),
  dbgCaustic:  hex32('#8338ec'),
  dbgFluid:    hex32('#06d6a0')
};


function column(c,fc,age,time){buf32.fill(0);const fireColumns=[{...fc,life:fc.maxLife-age}];
  // 3. Skill 1 (炎灼): Jagged Turbulent Pixel Fire Tornados
  for (let i = fireColumns.length - 1; i >= 0; i--) {
    const fc = fireColumns[i];
    fc.life -= dt;
    if (fc.life <= 0) {
      fireColumns.splice(i, 1);
      continue;
    }
    const p = 1 - fc.life / fc.maxLife;
    if (p < fc.delay) continue;
    const lp = (p - fc.delay) / (1 - fc.delay);
    const env = lp < 0.22 ? (lp / 0.22) : Math.pow(1 - (lp - 0.22) / 0.78, 0.85);
    const curH = Math.round(fc.maxH * env);
    if (curH < 4) continue;

    const baseRx = Math.round(fc.w * 1.3 * env);
    const baseRy = 4;
    for (let dy = -baseRy; dy <= baseRy; dy++) {
      for (let dx = -baseRx; dx <= baseRx; dx++) {
        const d = (dx / baseRx) ** 2 + (dy / baseRy) ** 2;
        if (d <= 1.0) {
          setBufPx(buf32, fc.x + dx, fc.baseY + dy, d < 0.45 ? PAL.fireCore : (d < 0.8 ? PAL.fireBright : PAL.fireMid));
        }
      }
    }

    for (let dy = 0; dy < curH; dy++) {
      const py = fc.baseY - dy;
      if (py < 2 || py >= VH - 2) continue;
      const bayerRow = BAYER4[py & 3];
      const hRatio = dy / curH;

      const centerSway = Math.sin(dy * 0.11 - time * 16 + fc.seed) * (3.8 * hRatio);
      const halfW = fc.w * (1.0 - hRatio * 0.68) * env;
      const xSpan = Math.ceil(halfW + 5);

      for (let dx = -xSpan; dx <= xSpan; dx++) {
        const px = Math.round(fc.x + centerSway + dx);
        if (px < 2 || px >= VW - 2) continue;

        const u = Math.abs(dx) / Math.max(1.5, halfW);
        const turb1 = Math.sin(dy * 0.28 + time * 24 + fc.seed + dx * 0.35);
        const turb2 = Math.cos(dy * 0.55 - time * 30 - dx * 0.45) * 0.55;
        const dither = useDither ? bayerRow[px & 3] * 0.22 : 0;

        const heat = (1.15 - u) + (turb1 + turb2) * (0.28 + hRatio * 0.35) - hRatio * 0.35 + dither;
        if (heat < 0.18) continue;

        let col = PAL.fireMid;
        if (showLayers) {
          col = PAL.dbgFluid;
        } else if (heat > 0.92 && hRatio < 0.65) {
          col = PAL.fireCore;
        } else if (heat > 0.62) {
          col = PAL.fireBright;
        } else if (heat > 0.38) {
          col = PAL.fireMid;
        } else if (heat > 0.24) {
          col = PAL.fireDeep;
        } else {
          col = hRatio > 0.6 ? PAL.fireSmoke : PAL.fireOut;
        }
        buf32[py * VW + px] = col;
      }
    }
  }


ctx.putImageData(pixels,0,0);c.drawImage(surface,0,0);}
function orb(c,mo,time){buf32.fill(0);
    const rInt = Math.ceil(mo.r);
    for (let dy = -rInt - 2; dy <= rInt + 2; dy++) {
      for (let dx = -rInt - 4; dx <= rInt + 2; dx++) {
        const d = Math.hypot(dx < 0 ? dx * 0.65 : dx, dy);
        const coronaNoise = Math.sin(dx * 0.8 + time * 24) * Math.cos(dy * 0.8 - time * 20) * 1.6;
        const effD = d + coronaNoise;
        if (effD <= mo.r) {
          let col = PAL.fireMid;
          if (effD > mo.r - 1.3) col = PAL.fireOut;
          else if (d < mo.r * 0.42) col = PAL.fireCore;
          else if (d < mo.r * 0.72) col = PAL.fireBright;
          else if (effD > mo.r - 2.4) col = PAL.fireDeep;
          setBufPx(buf32, mo.x + dx, mo.y + dy, showLayers ? PAL.dbgFluid : col);
        }
      }
    }

ctx.putImageData(pixels,0,0);c.drawImage(surface,0,0);}
function crystal(c,sm){buf32.fill(0);
    const ox = Math.round(sm.x), oy = Math.round(sm.y);
    for (let dy = -7; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        const md = Math.abs(dx) + Math.abs(dy < 0 ? dy * 0.75 : dy * 1.1);
        if (md <= 5.2) {
          let col = PAL.soulMid;
          if (md > 4.1) col = PAL.soulOut;
          else if (md < 1.8) col = PAL.soulCore;
          else if (md < 3.1) col = PAL.soulBright;
          setBufPx(buf32, ox + dx, oy + dy, showLayers ? PAL.dbgFluid : col);
        }
      }
    }

ctx.putImageData(pixels,0,0);c.drawImage(surface,0,0);}
window.AshLordTemplatePixels={column,orb,crystal};
})();
