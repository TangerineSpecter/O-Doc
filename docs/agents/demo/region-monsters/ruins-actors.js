/* Priest staff layers; skeleton and knight use an intact source mesh. */
(() => {
  const definitions={
    tide_priest:{parts:[{mask:[[20,4],[43,4],[45,32],[36,35],[36,50],[41,52],[42,59],[36,63],[36,99],[30,101],[29,63],[25,61],[25,53],[29,49],[29,35],[19,32]],pivot:[33,56],pose:'weapon'},{mask:[[101,31],[125,31],[127,56],[115,64],[100,63],[97,53]],pivot:[104,57],pose:'hand'}]}
  };
  const inside=(x,y,pts)=>{let yes=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [a,b]=pts[i],[u,v]=pts[j];if((b>y)!==(v>y)&&x<(u-a)*(y-b)/(v-b)+a)yes=!yes;}return yes;};
  const sprites={};
  for(const [key,def] of Object.entries(definitions)){
    const data=window.MeadowSpriteData[key];if(!data)continue;
    const n=data.width,r=n/128,pal=[0,...data.palette.map(h=>{const v=parseInt(h.slice(1),16);return (255<<24)|((v&255)<<16)|(v&65280)|(v>>>16);})],raw=Uint8Array.from(atob(data.pixels),c=>c.charCodeAt(0));
    const layers=Array.from({length:def.parts.length+1},()=>{const canvas=Object.assign(document.createElement('canvas'),{width:n,height:n}),ctx=canvas.getContext('2d'),im=ctx.createImageData(n,n);return {canvas,ctx,im,buf:new Uint32Array(im.data.buffer)};});
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,part=def.parts.findIndex(q=>inside(x/r,y/r,q.mask));layers[part+1].buf[i]=pal[raw[i]];}
    for(const l of layers)l.ctx.putImageData(l.im,0,0);sprites[key]={layers,def};
  }
  function actor(c,key,p,time,opts){
    if(key==='ruin_skeleton'||key==='ruin_knight'){window.RuinsConnected.actor(c,key,p,time,opts);return;}
    const {layers,def}=sprites[key],scale=(opts.atlas?.4:1)*window.MeadowArt.monsterScale(key);
    c.save();c.imageSmoothingEnabled=false;c.translate(160+p.x,window.RegionPreview.floor+p.y);c.scale(p.facing*scale,scale);c.transform(1,0,-p.lean,1,0,0);
    const {line,poly}=window.RuinsPixels;
    c.save();c.translate(-64,-118);
    // Restore the robe hidden by the priest's original staff only.
    poly(c,[[28,60],[36,60],[38,99],[29,101]],'#183b57');line(c,31,66,32,96,'#346580',2);
    c.restore();
    c.drawImage(layers[0].canvas,-64,-118,128,128);
    def.parts.forEach((part,i)=>{
      const [x,y]=part.pivot,lift=part.pose==='weapon'?p.weaponLift:0;
      if(lift){
        line(c,x-64,y-118+2,x-64,y-118-lift,'#153b55',7);
        line(c,x-65,y-118+1,x-65,y-118-lift,'#d8b56f',2);
      }
      c.save();c.translate(x-64,y-118-lift);c.rotate(p[part.pose]);c.drawImage(layers[i+1].canvas,-x,-y,128,128);c.restore();
    });
    c.restore();
  }
  window.RuinsActors={actor};
})();
