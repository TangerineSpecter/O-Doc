/* Port of MonsterTemplate_v1.html's triggerPixelShatterExplosion and shard physics.
   Two-pixel sprite sampling, radial burst, gravity 260, drag .6, 2–3 bounces,
   a .5-second ground shock ring and persistent debris match the reference. */
(() => {
  'use strict';
  class PixelShatter {
    constructor() { this.clear(); }
    clear() {
      this.shards = []; this.sparks = []; this.age = 0; this.scale = 1;
      this.camera = { x: 0, y: 0 }; this.shake = 0; this.centerX = 160;
    }
    burst(key, pose, time, options) {
      this.clear();
      const art = window.MeadowArt, scale = options.atlas ? .4 : 1;
      const sprite = art.drawSprite(key, { ...pose, flash: false, fracture: 0, hidden: false }, time, options);
      const pixels = sprite.getContext('2d').getImageData(0, 0, 128, 128).data;
      const cx = 160 + pose.x, baseY = 149 + pose.y;
      this.scale = scale; this.centerX = cx; this.shake = 16 * scale;
      this.colors = window.MeadowMonsters[key].effect;
      for (let sy = 0; sy < 128; sy += 2) for (let sx = 0; sx < 128; sx += 2) {
        const i = (sy * 128 + sx) * 4;
        if (pixels[i + 3] < 128) continue;
        const x = cx + (sx - 64) * scale, y = baseY + (sy - 118) * scale;
        const angle = Math.atan2(y - (baseY - 56 * scale), x - cx) + (Math.random() - .5) * .55;
        const speed = (45 + Math.random() * 135 + (128 - sy) * .45) * scale;
        this.shards.push({ x, y,
          vx: Math.cos(angle) * speed + (Math.random() - .5) * 40 * scale,
          vy: Math.sin(angle) * speed - (35 + Math.random() * 55) * scale,
          floorY: 149 + (-12 + Math.random() * 26) * scale,
          color: `rgb(${pixels[i]} ${pixels[i + 1]} ${pixels[i + 2]})`,
          size: Math.max(1, Math.round((Math.random() < .65 ? 2 : 3) * scale)),
          bounces: 2 + Math.floor(Math.random() * 2), settled: false });
      }
    }
    update(dt) {
      if (!dt || !this.shards.length) return;
      this.age += dt;
      this.shake = Math.max(0, this.shake - 34 * this.scale * dt);
      this.camera.x = Math.round((Math.random() - .5) * this.shake * .45);
      this.camera.y = Math.round((Math.random() - .5) * this.shake * .45);
      for (const sh of this.shards) {
        if (!sh.settled) {
          sh.vy += 260 * this.scale * dt;
          sh.vx *= 1 - .6 * dt;
          sh.x += sh.vx * dt; sh.y += sh.vy * dt;
          if (sh.y >= sh.floorY && sh.vy > 0) {
            sh.y = sh.floorY;
            if (sh.bounces > 0 && Math.abs(sh.vy) > 18 * this.scale) {
              sh.bounces--; sh.vy = -sh.vy * (.36 + Math.random() * .15); sh.vx *= .68;
            } else { sh.settled = true; sh.vx = 0; sh.vy = 0; }
          }
        }
        if (sh.settled && Math.random() < .0015 * dt * 60) {
          this.sparks.push({ x: sh.x, y: sh.y, vy: -(15 + Math.random() * 20) * this.scale,
            life: .3 + Math.random() * .3, color: this.colors[Math.floor(Math.random() * 2)] });
        }
      }
      for (const s of this.sparks) { s.life -= dt; s.vy -= 25 * this.scale * dt; s.y += s.vy * dt; }
      this.sparks = this.sparks.filter(s => s.life > 0);
    }
    draw(ctx, front) {
      if (!this.shards.length) return;
      if (!front) {
        if (this.age >= .5) return;
        const p = this.age / .5, rx = (14 + 98 * p) * this.scale, ry = (3 + 21 * p) * this.scale;
        ctx.save(); ctx.globalAlpha = 1 - p; ctx.fillStyle = this.colors[0];
        for (let n = 0; n < 180; n++) {
          const a = n / 180 * Math.PI * 2;
          ctx.fillRect(Math.round(this.centerX + Math.cos(a) * rx), Math.round(147 + Math.sin(a) * ry), 2, 1);
        }
        ctx.restore(); return;
      }
      for (const sh of this.shards) { ctx.fillStyle = sh.color; ctx.fillRect(Math.round(sh.x), Math.round(sh.y), sh.size, sh.size); }
      for (const s of this.sparks) { ctx.fillStyle = s.color; ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); }
    }
  }
  window.MeadowPixelShatter = PixelShatter;
})();
