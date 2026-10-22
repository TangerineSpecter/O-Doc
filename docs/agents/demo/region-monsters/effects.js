/* Delegate burst physics to the approved meadow template; adapt only size and floor anchor. */
(() => {
  const Shared=window.MeadowEffects,Shatter=window.MeadowPixelShatter;
  window.MeadowPixelShatter=class extends Shatter {
    burst(key,pose,time,options){
      super.burst(key,pose,time,options);
      const size=window.MeadowArt.monsterScale(key),dy=window.RegionPreview.floor-149;
      const x=160+pose.x,y=149+pose.y;
      this.scale*=size;this.shake*=size;
      for(const shard of this.shards){shard.x=x+(shard.x-x)*size;shard.y=y+(shard.y-y)*size+dy;shard.floorY=149+(shard.floorY-149)*size+dy;shard.vx*=size;shard.vy*=size;shard.size=Math.max(1,Math.round(shard.size*size));}
    }
    draw(ctx,front){
      if(front)return super.draw(ctx,true);
      // The shared shock ring has a fixed floor, so translate only that layer.
      ctx.save();ctx.translate(0,window.RegionPreview.floor-149);super.draw(ctx,false);ctx.restore();
    }
  };
  window.MeadowEffects=class extends Shared {
    attack(key,facing){
      const mon=window.MeadowMonsters[key];if(mon.ranged)return;
      const x=160+48*facing,y=window.RegionPreview.floor;
      this.ring(x,y,mon.effect[1]);this.burst(x,y-15,mon.effect,14,.7,95);
    }
    update(dt){super.update(dt);const floor=window.RegionPreview.floor;for(const p of this.particles)if(p.y>floor&&p.gravity>0){p.y=floor;p.vy*=-.24;}}
  };
})();
