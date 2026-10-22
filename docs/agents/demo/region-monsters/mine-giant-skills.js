/* Candidate boss poses: crystal resonance and command of the collapsing vault.
 * Original rock arms articulate; shared hit/defeat bypass these poses. */
(() => {
  const data=window.MeadowSpriteData.mine_giant;if(!data)return;
  const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
  const size=data.width,ratio=size/128;
  const colors=[0,...data.palette.map(hex=>{const n=parseInt(hex.slice(1),16);return (255<<24)|((n&255)<<16)|(n&65280)|(n>>>16);})];
  const raw=Uint8Array.from(atob(data.pixels),v=>v.charCodeAt(0));
  const masks=[[[0,48],[25,46],[31,58],[42,64],[48,80],[46,114],[0,114]],[[100,62],[111,63],[123,73],[124,110],[100,110],[98,94],[94,78]]];
  const inside=(x,y,points)=>{let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [a,b]=points[i],[u,v]=points[j];if((b>y)!==(v>y)&&x<(u-a)*(y-b)/(v-b)+a)yes=!yes;}return yes;};
  const layers=[0,1,2].map(()=>{const canvas=Object.assign(document.createElement('canvas'),{width:size,height:size}),ctx=canvas.getContext('2d'),image=ctx.createImageData(size,size);return {canvas,ctx,image,pixels:new Uint32Array(image.data.buffer)};});
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const index=y*size+x;const part=masks.findIndex(mask=>inside(x/ratio,y/ratio,mask));layers[part+1].pixels[index]=colors[raw[index]];}
  for(const l of layers)l.ctx.putImageData(l.image,0,0);
  function sample(p,t){
    const resonance=p.action==='crystal_resonance';
    const gather=ease(t/(resonance?.9:1.05)),release=ease((t-(resonance?1.25:1.15))/.25);
    const recover=ease((t-(resonance?2.3:2.4))/.7),hold=gather*(1-recover);
    Object.assign(p,{giantSkill:true,charge:hold,walk:0,swing:0,tilt:0,sx:1,sy:1+.025*hold,x:0,y:0});
    p.frontArm=(resonance?.92:1.6)*hold-(resonance?.13:1.05)*release*(1-recover);
    p.backArm=-(resonance?.85:1.4)*hold+(resonance?.1:.45)*release*(1-recover);
    p.armStretch=1;p.armLift=3*hold;p.lean=0;
    return p;
  }
  const dot=(c,x,y,color,s=2)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),s,s);};
  function line(c,x,y,u,v,color,width=1){const n=Math.max(1,Math.abs(u-x),Math.abs(v-y));for(let i=0;i<=n;i++)dot(c,x+(u-x)*i/n,y+(v-y)*i/n,color,width);}
  function poly(c,points,color){
    c.fillStyle=color;const lo=Math.floor(Math.min(...points.map(v=>v[1]))),hi=Math.ceil(Math.max(...points.map(v=>v[1])));
    for(let y=lo;y<=hi;y++){const hits=[];for(let i=0,j=points.length-1;i<points.length;j=i++){const [a,b]=points[i],[u,v]=points[j];if((b>y)!==(v>y))hits.push(a+(u-a)*(y-b)/(v-b));}hits.sort((a,b)=>a-b);for(let i=0;i+1<hits.length;i+=2)c.fillRect(Math.round(hits[i]),y,Math.max(1,Math.round(hits[i+1]-hits[i])),1);}
  }
  function rockJoint(c,x,y){poly(c,[[x-7,y-4],[x-2,y-8],[x+6,y-5],[x+8,y+3],[x+2,y+8],[x-6,y+4]],'#423c35');poly(c,[[x-5,y-4],[x,y-6],[x+5,y-2],[x+1,y+4],[x-4,y+2]],'#8c8170');line(c,x-4,y-4,x,y-6,'#c5b89b',1);}
  const scaleFor=opts=>(opts.atlas?.4:1)*window.MeadowArt.monsterScale('mine_giant');
  function actor(c,p,time,opts){
    const scale=scaleFor(opts);c.save();c.imageSmoothingEnabled=false;
    c.translate(160,window.RegionPreview.floor);c.scale(-p.facing*scale,scale*p.sy);c.transform(1,0,-p.lean,1,0,0);
    // Shoulder caps remain intact. Only lower rock chains are articulated.
    c.drawImage(layers[0].canvas,-64,-118,128,128);
    for(const [layer,x,y,angle] of [[2,101,68,p.backArm],[1,35,61,p.frontArm]]){
      const lift=p.armLift;c.save();rockJoint(c,x-64,y-118-lift/2);
      c.translate(x-64,y-118-lift);c.rotate(angle);c.scale(1,p.armStretch);
      c.drawImage(layers[layer].canvas,-x,-y,128,128);c.restore();
    }
    c.restore();
  }
  function effects(c,p,time,opts,front){window.MineGiantBossEffects.draw(c,p,time,opts,front);}
  function camera(p){return window.MineGiantBossEffects.camera(p);}
  window.MineGiantSkills={sample,actor,effects,camera};
})();
