/* Continuous inverse deformation preserves connected joints and the approved source silhouette. */
(() => {
  'use strict';
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = n => { const t = clamp(n); return t*t*(3-2*t); };
  const bump = (x, y, cx, cy, rx, ry) => Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));
  const pack = hex => { const n = parseInt(hex.slice(1),16); return (255<<24)|((n&255)<<16)|(n&65280)|(n>>>16); };
  const colors = ['#f1769d','#5faebc','#e7bd65','#9c84c4'].map(pack);
  const sprites = Object.fromEntries(Object.entries(window.MeadowSpriteData).map(([key,data]) => {
    const canvas = Object.assign(document.createElement('canvas'),{width:data.width,height:data.height});
    const ctx = canvas.getContext('2d',{willReadFrequently:true}), image=ctx.createImageData(data.width,data.height);
    return [key,{...data,canvas,ctx,image,buffer:new Uint32Array(image.data.buffer),pixels:Uint8Array.from(atob(data.pixels),c=>c.charCodeAt(0)),palette:Uint32Array.from([0,...data.palette.map(pack)])}];
  }));
  const small = Object.assign(document.createElement('canvas'),{width:128,height:128});
  const smallCtx=small.getContext('2d',{willReadFrequently:true});
  function sourcePoint(x,y,key,p,time) {
    const mon=window.MeadowMonsters[key],f=mon.family,dir=mon.sourceFacing;
    const walk=p.walk||0, swing=p.swing||0, charge=p.charge||0;
    let sx=x,sy=y;
    const breath=Math.sin(time*2.5), leg=smooth((y-86)/31);
    // Foot movement fades toward the hip; the entire silhouette is sampled once.
    if (['fighter','golem','tree','demon','dragon'].includes(f)) {
      const phase=Math.sin((p.elapsed||0)*(f==='golem'?7:10)+(x<64?0:Math.PI))*walk;
      sx-=phase*leg*(f==='tree'?2.3:3);sy+=Math.max(0,phase)*leg*2;
      const arm=bump(x,y,32,78,15,28), other=bump(x,y,98,78,16,27);
      sx-=(arm-other)*(Math.sin(time*2)*.6+walk*Math.sin(p.elapsed*8)*2);
      sy+=arm*swing*8-other*swing*5;
      sx-=dir*(arm+other)*swing*6;
      sy-=breath*bump(x,y,65,53,37,30)*.8;
    }
    if (f==='quadruped') {
      const legWeight=smooth((y-95)/23);
      const stride=Math.sin(p.elapsed*11+x*.13)*walk;
      sx-=stride*legWeight*3.6;sy+=Math.max(0,stride)*legWeight*3;
      const tail=bump(x,y,dir>0?26:103,77,18,27);
      sy-=Math.sin(time*3.5+x*.035)*tail*2.5;
      const head=bump(x,y,dir>0?93:35,77,22,22);
      sy+=head*charge*3;sx-=head*swing*2*dir;
      sx-=Math.sin(time*3)*bump(x,y,dir>0?90:37,55,13,10)*.8;
    }
    if (f==='mushroom') {
      const cap=1-smooth((y-64)/20), stem=smooth((y-88)/28);
      sx-=(Math.sin(time*2.4)*1.4+charge*2)*cap;
      sy-=breath*cap*.8+swing*cap*3;
      sx-=Math.sin(p.elapsed*10+(x<64?0:Math.PI))*walk*stem*2;
    }
    if (['caster','spirit'].includes(f)) {
      const hem=smooth((y-62)/55);
      sx-=Math.sin(time*3.2+y*.075)*hem*(f==='spirit'?3:1.7);
      const hand=bump(x,y,96,53,19,23);
      sy+=hand*(charge*5+swing*7);sx-=dir*hand*swing*3;
      sy-=breath*bump(x,y,65,39,24,24)*1.1;
    }
    if (f==='dragon') {
      // Both wing roots stay fixed; movement increases only toward the membranes.
      const wing=smooth((Math.abs(x-64)-21)/35)*(1-smooth((y-89)/16));
      sy-=Math.sin(time*(walk?7:3.6))*wing*(walk?4:2.2);
      sx-=Math.sin(time*2+y*.06)*smooth((y-99)/19)*1.3;
    }
    if (f==='tree') sx-=Math.sin(time*2.4+y*.05)*smooth((71-y)/57)*1.2;
    if (f==='demon') sx-=Math.sin(time*7+y*.15)*smooth((32-y)/24)*1.2;
    if(key==='star_golem') sy-=Math.sin(time*2.8+x*.09)*smooth((Math.abs(x-64)-18)/30)*1.5;
    if(p.riftSkill)return window.RiftMotion.deform(sx,sy,key,p);
    if(p.emberSkill)return window.EmberMotion.deform(sx,sy,key,p);
    if(p.ruinsMonster==='water_spirit')return window.RuinsMotion.deform(sx,sy,p);
    if(p.treantSkill)return window.MistTreantSkills.deform(sx,sy,p);
    if(p.ancientRegen)return window.AncientGuardRegen.deform(sx,sy,p);
    return [sx,sy];
  }
  function drawDetail(key,p={},time=0,options={}) {
    p={elapsed:0,walk:0,...p};
    const s=sprites[key],n=s.width,r=n/128; s.buffer.fill(0);
    const flip=(p.facing??s.sourceFacing)!==s.sourceFacing;
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
      const [u,v]=sourcePoint(x/r,y/r,key,p,time),sx=Math.round(u*r),sy=Math.round(v*r);
      if(sx<0||sy<0||sx>=n||sy>=n)continue;
      if(key==='toxic_mushroom'&&window.ToxicMushroom.active(p)&&window.ToxicMushroom.sourceDrop(sx/r,sy/r))continue;
      const index=s.pixels[sy*n+sx];if(!index)continue;
      let color=s.palette[index];
      if(p.ancientRegen)color=window.AncientGuardRegen.tint(color,y/r,p);
      if(options.layers){const edge=!s.pixels[sy*n+sx-1]||!s.pixels[sy*n+sx+1]||!s.pixels[(sy-1)*n+sx]||!s.pixels[(sy+1)*n+sx];color=colors[edge?0:y/r>88||Math.abs(x/r-64)>32?3:y/r<40?2:1];}
      if(p.flash)color=0xffdff9ff;
      else if(p.fracture>.05&&(Math.abs((u-66)-(v-58)*.75+Math.sin(v*.4)*3)<1.6*p.fracture||Math.abs((u-66)+(v-52)*.85+Math.cos(u*.4)*3)<1.6*p.fracture))color=0xffffffff;
      s.buffer[y*n+(flip?n-1-x:x)]=color;
    }
    s.ctx.putImageData(s.image,0,0);
    if(key==='toxic_mushroom'&&window.ToxicMushroom.active(p))window.ToxicMushroom.drawDrops(s,p,time,flip,options);
    return s.canvas;
  }
  function drawSprite(key,p,time,options) {
    const image=drawDetail(key,p,time,options);
    if(image.width===128)return image;
    smallCtx.clearRect(0,0,128,128);smallCtx.imageSmoothingEnabled=false;smallCtx.drawImage(image,0,0,128,128);return small;
  }
  window.MeadowCharacters={drawSprite,drawDetail};
})();
