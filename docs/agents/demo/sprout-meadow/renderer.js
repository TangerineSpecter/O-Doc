/* Shared 320 × 180 meadow stage and pixel-clean character placement. */
(() => {
  'use strict';
  const width = 320, height = 180;
  const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const drawSprite = (...args) => window.MeadowCharacters.drawSprite(...args);

  function scenery(night, plain) {
    const c = makeCanvas(width, height), ctx = c.getContext('2d');
    ctx.fillStyle = night ? '#263f3c' : '#e8efde'; ctx.fillRect(0, 0, width, height);
    if (plain) return c;
    const sky = ctx.createLinearGradient(0, 0, 0, 150);
    sky.addColorStop(0, night ? '#203b47' : '#e2eddf'); sky.addColorStop(1, night ? '#4e6852' : '#f4f3d9');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, 150);
    ctx.fillStyle = night ? '#c7d8b5' : '#fbf6d6'; ctx.fillRect(246, 24, 13, 13); ctx.fillRect(243, 28, 19, 5);
    if (!night) {
      ctx.fillStyle = '#f5f5e8';
      for (const [x, y] of [[26, 28], [118, 19], [275, 44]]) { ctx.fillRect(x, y, 27, 4); ctx.fillRect(x + 5, y - 3, 15, 4); }
    }
    const hill = (color, offset, amplitude, phase) => {
      ctx.fillStyle = color;
      for (let x = 0; x < width; x += 3) {
        const y = Math.round((offset + Math.sin(x * .019 + phase) * amplitude + Math.cos(x * .009) * amplitude * .6) / 3) * 3;
        ctx.fillRect(x, y, 3, height - y);
      }
    };
    hill(night ? '#415c50' : '#c4d5b5', 81, 11, .6);
    hill(night ? '#3a5945' : '#adc59b', 103, 9, 3.4);
    hill(night ? '#466344' : '#a2bd86', 119, 5, .3);
    ctx.fillStyle = night ? '#58734b' : '#bbcd9f'; ctx.fillRect(0, 141, width, 39);
    // A quiet oval patch follows the template's centered specimen stage.
    for (let y = -12; y <= 12; y++) {
      const rx = Math.sqrt(1 - (y / 13) ** 2) * 90;
      ctx.fillStyle = y > 5 ? (night ? '#5f794c' : '#c3d3a6') : (night ? '#6c8355' : '#d1ddba');
      ctx.fillRect(Math.round(160 - rx), 148 + y, Math.round(rx * 2), 1);
    }
    for (let k = 0; k < 80; k++) {
      const x = (k * 73 + 17) % width, y = 137 + k * 37 % 40;
      if (x > 65 && x < 255 && y < 161) continue;
      ctx.fillStyle = night ? '#496d40' : '#8ba772'; ctx.fillRect(x, y, 1, 3); ctx.fillRect(x - 2, y - 1, 1, 2);
      if (k % 9 === 0) { ctx.fillStyle = night ? '#bab77a' : '#f3e7ad'; ctx.fillRect(x, y - 2, 2, 2); }
    }
    return c;
  }
  const backgrounds = [scenery(false, false), scenery(true, false), scenery(false, true), scenery(true, true)];
  function drawBackground(ctx, opts, time) {
    ctx.drawImage(backgrounds[(opts.night ? 1 : 0) + (opts.plain ? 2 : 0)], 0, 0);
    if (opts.plain) return;
    for (let k = 0; k < 13; k++) {
      const x = (time * 3 + k * 29) % width, y = 70 + Math.sin(time * .6 + k) * 8 + k * 6;
      ctx.fillStyle = opts.night ? '#d9dc9980' : '#f9f9da90'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    ctx.fillStyle = opts.night ? '#3b603f' : '#82a16a';
    for (const x of [5, 12, 22, 35, 285, 295, 306, 315]) {
      const sway = Math.round(Math.sin(time * 2 + x) * 2);
      for (let y = 0; y < 8; y++) ctx.fillRect(x + Math.round(sway * y / 8), 149 - y, 1, 1);
    }
  }
  function drawCharacter(ctx, key, p, time, opts) {
    if (p.hidden) return;
    const scale = opts.atlas ? .40 : 1;
    const x = 160 + p.x, floorY = 149, baseY = floorY + p.y;
    const shadow = opts.atlas ? 13 : (key === 'beetle' ? 43 : 34);
    ctx.fillStyle = opts.night ? '#1e373659' : '#6c8d5850';
    for (let y = -4; y <= 4; y++) { const w = Math.sqrt(Math.max(0, 1 - (y / 4.5) ** 2)) * shadow * Math.max(.55, 1 + p.y / 120); ctx.fillRect(Math.round(x - w), floorY + y, Math.round(w * 2), 1); }
    if (key === 'glowbug' && !opts.layers) {
      const strength = (1 + Math.sin(time * 3) * .15) * (1 - p.fade);
      const glow = ctx.createRadialGradient(x + 12, baseY - 35 * scale, 2, x + 12, baseY - 35 * scale, 44 * scale);
      glow.addColorStop(0, `rgba(255,224,105,${.30 * strength})`); glow.addColorStop(1, 'rgba(255,224,105,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 40, baseY - 95, 100, 95);
    }
    const img = drawSprite(key, p, time, opts);
    ctx.imageSmoothingEnabled = false;
    const sx = key === 'slime' ? 1 : p.sx, sy = key === 'slime' ? 1 : p.sy;
    const w = Math.round(128 * scale * sx), h = Math.round(128 * scale * sy);
    ctx.save(); ctx.globalAlpha = 1 - p.fade;
    // Row offsets give a pixel-clean recoil tilt without rotating the light source.
    for (let row = 0; row < 128; row++) {
      const yy = Math.round(baseY - (118 - row) * h / 128);
      const tilt = Math.round((118 - row) / 128 * p.tilt);
      ctx.drawImage(img, 0, row, 128, 1, Math.round(x - w / 2 + tilt), yy, w, Math.max(1, Math.ceil(h / 128)));
    }
    ctx.restore();
  }
  window.MeadowArt = { width, height, drawSprite, drawBackground, drawCharacter, makeCanvas };
})();
