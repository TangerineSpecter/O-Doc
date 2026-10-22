/* Visual effects use local preview events only, independent of combat rules. */
(() => {
  class Effects {
    constructor() { this.shatterEffect = new window.MeadowPixelShatter(); this.clear(); }
    clear() { this.particles = []; this.rings = []; this.bolt = null; this.shatterEffect.clear(); }
    burst(x, y, colors, count = 20, power = 1, gravity = 65) {
      for (let k = 0; k < count; k++) {
        const angle = Math.random() * Math.PI * 2, speed = (12 + Math.random() * 45) * power;
        this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 20, gravity, life: .6 + Math.random() * .6, max: 1.2, color: colors[k % colors.length], size: k % 5 === 0 ? 3 : 1 + k % 2 });
      }
    }
    ring(x, y, color, ground = true) { this.rings.push({ x, y, color, age: 0, ground }); }
    attack(key, facing) {
      const mon = window.MeadowMonsters[key], x = 160 + (key === 'rabbit' ? 55 : 43) * facing;
      if (key === 'glowbug') {
        this.bolt = { x: 186, y: 90, facing, age: 0 }; if (facing < 0) this.bolt.x = 134;
        this.burst(this.bolt.x, 90, mon.effect, 14, .5, -7);
      } else {
        this.ring(x, 148, mon.effect[1]);
        this.burst(x, key === 'beetle' ? 135 : 143, mon.effect, key === 'slime' ? 32 : 17, 1.1);
      }
    }
    shatter(key, pose, options, time) { this.shatterEffect.burst(key, pose, time, options); }
    get camera() { return this.shatterEffect.camera; }
    update(dt) {
      this.shatterEffect.update(dt);
      for (const p of this.particles) { p.life -= dt; p.vy += p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > 150 && p.gravity > 0) { p.y = 150; p.vy *= -.24; p.vx *= .8; } }
      this.particles = this.particles.filter(p => p.life > 0);
      for (const r of this.rings) r.age += dt;
      this.rings = this.rings.filter(r => r.age < .55);
      if (this.bolt) {
        this.bolt.age += dt; this.bolt.x += dt * 155 * this.bolt.facing;
        if (this.bolt.age > .48) {
          this.burst(this.bolt.x, this.bolt.y, window.MeadowMonsters.glowbug.effect, 28, .8, -8);
          this.ring(this.bolt.x, this.bolt.y, '#fdf2b1', false); this.bolt = null;
        }
      }
    }
    draw(ctx, front) {
      this.shatterEffect.draw(ctx, front);
      if (!front) {
        for (const r of this.rings) {
          ctx.save(); ctx.globalAlpha = 1 - r.age / .55; ctx.fillStyle = r.color;
          const radius = 6 + r.age * 75;
          for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2; ctx.fillRect(Math.round(r.x + Math.cos(a) * radius), Math.round(r.y + Math.sin(a) * radius * (r.ground ? .2 : 1)), 2, 1); }
          ctx.restore();
        }
        return;
      }
      for (const p of this.particles) {
        ctx.save(); ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.max(1, Math.round(p.size)), Math.max(1, Math.round(p.size))); ctx.restore();
      }
      if (this.bolt) {
        const b = this.bolt;
        ctx.fillStyle = '#e8be4a'; ctx.fillRect(Math.round(b.x) - 5, Math.round(b.y) - 3, 9, 7);
        ctx.fillStyle = '#fff4b2'; ctx.fillRect(Math.round(b.x) - 3, Math.round(b.y) - 2, 6, 5);
        ctx.fillStyle = '#fffde6'; ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 2);
        for (let n = 1; n < 5; n++) { ctx.fillStyle = n % 2 ? '#f6db85' : '#fff0b0'; ctx.fillRect(Math.round(b.x - b.facing * n * 5), Math.round(b.y) - 1, 2, 2); }
      }
    }
  }
  window.MeadowEffects = Effects;
})();
