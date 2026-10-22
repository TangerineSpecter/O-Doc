/* Articulated original weapons, forearms and shield. Never replace the approved sprite. */
(() => {
  const definitions={
    ruin_skeleton:{parts:[{mask:[[25,66],[40,65],[42,77],[59,104],[53,109],[29,84]],pivot:[34,70],pose:'weapon'},{mask:[[82,69],[93,68],[102,89],[95,96],[86,83]],pivot:[87,72],pose:'hand'}]},
    ruin_knight:{parts:[{mask:[[31,63],[44,62],[53,79],[78,116],[66,119],[41,88],[32,79]],pivot:[40,68],pose:'weapon'},{mask:[[89,45],[111,43],[125,58],[125,83],[108,89],[90,81]],pivot:[93,60],pose:'shield'}]},
    tide_priest:{parts:[{mask:[[20,4],[43,4],[45,32],[36,35],[36,50],[41,52],[42,59],[36,63],[36,99],[30,101],[29,63],[25,61],[25,53],[29,49],[29,35],[19,32]],pivot:[33,56],pose:'weapon'},{mask:[[101,31],[125,31],[127,56],[115,64],[100,63],[97,53]],pivot:[104,57],pose:'hand'}]}
  };
  const inside=(x,y,pts)=>{let yes=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [a,b]=pts[i],[u,v]=pts[j];if((b>y)!==(v>y)&&x<(u-a)*(y-b)/(v-b)+a)yes=!yes;}return yes;};
  const sprites={};
  for(const [key,def] of Object.entries(definitions)){
    const data=window.MeadowSpriteData[key];if(!data)continue;
    const n=data.width,r=n/128,pal=[0,...data.palette.map(h=>{const v=parseInt(h.slice(1),16);return (255<<24)|((v&255)<<16)|(v&65280)|(v>>>16);})],raw=Uint8Array.from(atob(data.pixels),c=>c.charCodeAt(0));
    const layers=Array.from({length:def.parts.length+1},()=>{const canvas=Object.assign(document.createElement('canvas'),{width:n,height:n}),ctx=canvas.getContext('2d'),im=ctx.createImageData(n,n);return {canvas,ctx,im,buf:new Uint32Array(im.data.buffer)};});
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,part=def.parts.findIndex(q=>inside(x/r,y/r,q.mask));layers[part+1].buf[i]=pal[raw[i]];}
    if(key==='ruin_skeleton'){
      const buf=layers[1].buf,seen=new Set();
      for(let i=0;i<buf.length;i++){
        if(!buf[i]||seen.has(i))continue;const group=[i];seen.add(i);
        for(let j=0;j<group.length;j++){const v=group[j],x=v%n,y=Math.floor(v/n);
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const u=(y+dy)*n+x+dx;if(x+dx<0||x+dx>=n||y+dy<0||y+dy>=n||!buf[u]||seen.has(u))continue;seen.add(u);group.push(u);}
        }
        if(group.length<10)for(const v of group)buf[v]=0;
      }
    }
    for(const l of layers)l.ctx.putImageData(l.im,0,0);sprites[key]={layers,def};
  }
  function actor(c,key,p,time,opts){
    const {layers,def}=sprites[key],scale=(opts.atlas?.4:1)*window.MeadowArt.monsterScale(key);
    c.save();c.imageSmoothingEnabled=false;c.translate(160+p.x,window.RegionPreview.floor+p.y);c.scale(p.facing*scale,scale);c.transform(1,0,-p.lean,1,0,0);
    const {line,poly,dot}=window.RuinsPixels;
    c.save();c.translate(-64,-118);
    // Reconstruct only the narrow limb area hidden by the weapon in the source PNG.
    // It is behind the original body layer, so visible source pixels always win.
    if(key==='ruin_skeleton'){
      line(c,50,91,47,110,'#3e302b',6);line(c,50,92,47,109,'#c5b58e',4);line(c,49,94,46,108,'#f0dfb3',2);dot(c,46,99,'#8e7a60',3);
    }else if(key==='ruin_knight'){
      poly(c,[[43,77],[61,80],[64,92],[57,102],[52,111],[40,112],[40,98]],'#302b2b');
      poly(c,[[46,80],[58,84],[59,92],[54,98],[48,109],[42,109],[44,94]],'#776c5b');
      poly(c,[[46,82],[53,86],[53,93],[49,101],[44,107],[44,94]],'#b4ac98');
      line(c,43,98,52,99,'#40382f',2);line(c,43,101,51,102,'#c9b896',1);
    }else{
      poly(c,[[28,60],[36,60],[38,99],[29,101]],'#183b57');line(c,31,66,32,96,'#346580',2);
    }
    c.restore();
    c.drawImage(layers[0].canvas,-64,-118,128,128);
    def.parts.forEach((part,i)=>{
      const [x,y]=part.pivot,lift=part.pose==='weapon'?p.weaponLift:0;
      if(lift){
        const wood=key==='tide_priest';
        line(c,x-64,y-118+2,x-64,y-118-lift,wood?'#153b55':key==='ruin_skeleton'?'#554334':'#544737',wood?7:5);
        line(c,x-65,y-118+1,x-65,y-118-lift,wood?'#d8b56f':key==='ruin_skeleton'?'#dfcda5':'#b9a890',2);
      }
      c.save();c.translate(x-64,y-118-lift);c.rotate(p[part.pose]);c.drawImage(layers[i+1].canvas,-x,-y,128,128);c.restore();
    });
    c.restore();
  }
  window.RuinsActors={actor};
})();
