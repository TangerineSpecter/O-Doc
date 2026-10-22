/* Skills remain presentation-only. Defeat delegates to the shared pixel shatter. */
(() => {
  const Shared = window.MeadowEffects;
  const SharedShatter = window.MeadowPixelShatter;
  window.MeadowPixelShatter = class CaveShatter extends SharedShatter {
    burst(key,pose,time,options) {
      super.burst(key,pose,time,options);
      const size = window.MeadowArt.monsterScale(key);
      if (size === 1) return;
      const x = 160 + pose.x, y = 149 + pose.y;
      this.scale *= size; this.shake *= size;
      for (const shard of this.shards) {
        shard.x = x + (shard.x - x) * size;
        shard.y = y + (shard.y - y) * size;
        shard.floorY = 149 + (shard.floorY - 149) * size;
        shard.vx *= size; shard.vy *= size;
        shard.size = Math.max(1, Math.round(shard.size * size));
      }
    }
  };
  window.MeadowEffects = class CaveEffects extends Shared {
    attack(key,facing) {
      const mon=window.MeadowMonsters[key], x=160+48*facing;
      this.ring(x,148,mon.effect[1]);
      this.burst(x,key==='bat'?107:145,mon.effect,14,.7,95);
    }
  };
})();
