/* Two-bone arms: the wrist owns the original grip and blade; joints share endpoints. */
(() => {
  const {line,poly,blob}=window.RuinsPixels;
  const defs={
    ruin_skeleton:{shoulder:[48,54],grip:[33,81],lengths:[16,19],tip:[55,106],heel:[36,87],
      arm:[[44,51],[53,54],[44,68],[39,80],[28,83],[30,73],[36,60]],
      weapon:[[28,77],[40,77],[43,85],[59,104],[56,110],[49,108],[29,89],[27,83]]},
    ruin_knight:{shoulder:[41,50],grip:[42,77],lengths:[16,19],tip:[76,116],heel:[46,85],
      arm:[[34,46],[44,48],[48,62],[48,75],[39,81],[31,71],[32,57]],
      weapon:[[35,71],[47,72],[49,82],[76,112],[78,118],[68,114],[41,88],[34,81]],
      shield:[[93,48],[110,44],[123,54],[125,80],[113,90],[97,85],[91,72],[90,58]],shieldPivot:[96,57]}
  };
  const cache={};
  function inside(x,y,pts){let hit=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [a,b]=pts[i],[u,v]=pts[j];if((b>y)!==(v>y)&&x<(u-a)*(y-b)/(v-b)+a)hit=!hit;}return hit;}
  function textures(key){
    if(cache[key])return cache[key];const s=window.MeadowSpriteData[key],def=defs[key],n=s.width,r=n/128;
    const pal=[0,...s.palette.map(h=>{const v=parseInt(h.slice(1),16);return (255<<24)|((v&255)<<16)|(v&65280)|(v>>>16);})],raw=atob(s.pixels);
    const layers=Array.from({length:3},()=>{const c=Object.assign(document.createElement('canvas'),{width:n,height:n}),ctx=c.getContext('2d'),im=ctx.createImageData(n,n);return {c,ctx,im,buf:new Uint32Array(im.data.buffer)};});
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=y*n+x,v=pal[raw.charCodeAt(i)];if(!v)continue;
      const a=x/r,b=y/r,index=inside(a,b,def.weapon)?1:def.shield&&inside(a,b,def.shield)?2:inside(a,b,def.arm)?-1:0;
      if(index>=0)layers[index].buf[i]=v;
    }
    // A blade cut may graze an isolated shin pixel; it must not rotate with the hand.
    for(const layer of layers.slice(1)){
      const seen=new Set(),groups=[];
      for(let i=0;i<n*n;i++)if(layer.buf[i]&&!seen.has(i)){
        const group=[i];seen.add(i);
        for(let j=0;j<group.length;j++){const u=group[j],x=u%n,y=Math.floor(u/n);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const a=x+dx,b=y+dy,v=b*n+a;if(a>=0&&a<n&&b>=0&&b<n&&layer.buf[v]&&!seen.has(v)){seen.add(v);group.push(v);}}}
        groups.push(group);
      }
      for(const group of groups)if(group.length<8*r*r)for(const i of group)layer.buf[i]=0;
    }
    for(const l of layers)l.ctx.putImageData(l.im,0,0);return cache[key]=layers.map(l=>l.c);
  }
  function joints(key,p){
    const def=defs[key],s=def.shoulder,w=[p.wristX,p.wristY],dx=w[0]-s[0],dy=w[1]-s[1],dist=Math.hypot(dx,dy),[a,b]=def.lengths;
    const d=Math.max(.01,Math.min(a+b-.01,dist)),along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
    const ux=dx/dist,uy=dy/dist;return {shoulder:s,elbow:[s[0]+ux*along-uy*height,s[1]+uy*along+ux*height],wrist:w};
  }
  function point(key,x,y,p){const d=defs[key],dx=x-d.grip[0],dy=y-d.grip[1],a=p.weapon;return [p.wristX+dx*Math.cos(a)-dy*Math.sin(a),p.wristY+dx*Math.sin(a)+dy*Math.cos(a)];}
  function shieldPoint(x,y,p){const [cx,cy]=defs.ruin_knight.shieldPivot,dx=x-cx,dy=y-cy;return [cx+p.shieldX+dx*Math.cos(p.shield)-dy*Math.sin(p.shield),cy+p.shieldY+dx*Math.sin(p.shield)+dy*Math.cos(p.shield)];}
  function bone(c,a,b){
    line(c,a[0]-2,a[1],b[0]-2,b[1],'#342526',6);line(c,a[0]-1,a[1],b[0]-1,b[1],'#a58c6c',4);line(c,a[0]-1,a[1]-1,b[0]-1,b[1]-1,'#e7d4a9',2);
    for(const q of [a,b]){blob(c,...q,3,2.5,'#4c3530');blob(c,q[0]-.5,q[1]-1,2.3,1.6,'#ead6aa');}
  }
  function armour(c,a,b,width){
    const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),nx=-dy/l,ny=dx/l;
    const pts=(w,offset=0)=>[[a[0]+nx*w,a[1]+ny*w],[b[0]+nx*(w-1),b[1]+ny*(w-1)],[b[0]-nx*(w-1)+offset,b[1]-ny*(w-1)],[a[0]-nx*w+offset,a[1]-ny*w]];
    poly(c,pts(width+1),'#292827');poly(c,pts(width),'#776c5c');poly(c,pts(width*.55,-1),'#b4ac94');line(c,a[0]-1,a[1]-2,b[0]-1,b[1]-2,'#e4d6b5',2);
    for(const q of [.35,.68]){const x=a[0]+dx*q,y=a[1]+dy*q;line(c,x-nx*width,y-ny*width,x+nx*width,y+ny*width,'#4a4138',1);line(c,x-nx*width,y-ny*width-1,x+nx*width,y+ny*width-1,'#ad9d7e',1);}
    blob(c,...b,width,3,'#3f372e');line(c,b[0]-width,b[1]-1,b[0]+width-1,b[1]-1,'#bc9c69',2);
  }
  function hiddenLeg(c,key){
    // Only the occluded shin under the source sword needs an underlay. Body pixels cover it.
    if(key==='ruin_skeleton'){
      bone(c,[54,94],[46,111]);blob(c,53,95,4,3,'#dac69c');
    }else{
      poly(c,[[50,83],[62,85],[66,94],[59,103],[50,113],[39,113],[40,101],[45,91]],'#292929');
      poly(c,[[51,86],[60,88],[62,94],[55,102],[49,109],[42,110],[44,98]],'#776d5d');
      poly(c,[[51,88],[57,90],[57,96],[50,103],[45,108],[43,106],[47,97]],'#c4b89c');
      line(c,42,103,51,102,'#382f29',2);line(c,42,107,49,106,'#d4bd8f',1);
    }
  }
  function actor(c,key,p,time,opts){
    const [body,weapon,shield]=textures(key),d=defs[key],j=joints(key,p),s=window.MeadowArt.monsterScale(key)*(opts.atlas?.4:1);
    c.save();c.imageSmoothingEnabled=false;c.translate(160+p.x,window.RegionPreview.floor+p.y);c.scale(p.facing*s,s);c.transform(1,0,-p.lean,1,-64+118*p.lean,-118);
    hiddenLeg(c,key);c.drawImage(body,0,0,128,128);
    if(key==='ruin_skeleton'){bone(c,j.shoulder,j.elbow);bone(c,j.elbow,j.wrist);}
    else{
      armour(c,j.shoulder,j.elbow,5);armour(c,j.elbow,j.wrist,4.5);
      const joint=shieldPoint(96,57,p);armour(c,[91,43],joint,4);
      c.save();c.translate(...joint);c.rotate(p.shield);c.drawImage(shield,-96,-57,128,128);c.restore();
    }
    c.save();c.translate(...j.wrist);c.rotate(p.weapon);c.drawImage(weapon,-d.grip[0],-d.grip[1],128,128);c.restore();
    c.restore();
  }
  window.RuinsConnected={actor,point,shieldPoint,joints,defs};
})();
