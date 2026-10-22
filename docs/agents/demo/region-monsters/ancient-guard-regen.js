/* Ancient guard's regeneration: rooted intake -> sap ascent -> heart pulse -> new growth.
   Preview clock only. This module never changes health or regeneration rules. */
(() => {
  const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
  function sample(p,t){
    const root=ease(t/.45)*(1-ease((t-.55)/.35));
    const bloom=ease((t-.65)/.7)*(1-ease((t-2.15)/.55));
    Object.assign(p,{ancientRegen:true,root,bloom,charge:0,swing:0,walk:0,x:0,y:0,tilt:0,sx:1+.018*root,sy:1-.035*root+.035*bloom});
    return p;
  }
  // Source-space deformation leaves feet planted and branches connected.
  function deform(x,y,p){
    const arm=Math.exp(-(((y-74)/25)**2)),side=clamp((Math.abs(x-65)-22)/20);
    const dx=Math.sign(x-65)*side*arm*p.bloom*5;
    const dy=-side*arm*p.bloom*6;
    return [x-dx,y-dy];
  }
  function tint(color,y,p){
    const t=p.elapsed,wave=118-108*clamp((t-.4)/1.25);
    const mix=clamp(1-Math.abs(y-wave)/12)*.48*(1-ease((t-1.65)/.3));
    const r=color&255,g=(color>>>8)&255,b=(color>>>16)&255;
    return (255<<24)|(Math.round(b+(147-b)*mix)<<16)|(Math.round(g+(244-g)*mix)<<8)|Math.round(r+(197-r)*mix);
  }
  const dot=(c,x,y,color,s=2)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),s,s);};
  function line(c,x,y,u,v,color,s=1){const n=Math.max(1,Math.abs(u-x),Math.abs(v-y));for(let i=0;i<=n;i++)dot(c,x+(u-x)*i/n,y+(v-y)*i/n,color,s);}
  function blob(c,x,y,rx,ry,color){c.fillStyle=color;for(let y0=-Math.ceil(ry);y0<=ry;y0+=2){const w=Math.round(rx*Math.sqrt(Math.max(0,1-(y0/ry)**2)));if(w)c.fillRect(Math.round(x-w),Math.round(y+y0),2*w,2);}}
  function leaf(c,x,y,size,side=1){
    // Stepped leaf with a dark outline, bright upper face, and a single vein.
    for(let r=0;r<size;r++){
      const w=Math.max(1,Math.round(Math.sin((r+1)/(size+1)*Math.PI)*size*.5));
      const xx=x+side*r*.6,yy=y-r;
      line(c,xx-w,yy,xx+w,yy,'#365a38',2);
      line(c,xx-w+1,yy,xx+w-1,yy,r<size*.55?'#90c964':'#d0ef96',1);
    }
    line(c,x,y,x+side*size*.6,y-size,'#e2f2ae',1);
  }
  function path(c,points,progress,color,width){
    const limit=clamp(progress)*(points.length-1);
    for(let i=0;i<limit;i++){
      const a=points[i],b=points[i+1],f=Math.min(1,limit-i);
      line(c,a[0],a[1],a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,color,width);
    }
  }
  const sap=[[[27,112],[40,105],[48,91],[51,78],[62,69],[76,56]],[[104,112],[91,107],[86,92],[83,77],[79,67],[76,56]]];
  function effects(c,p,time,opts,front){
    const t=p.elapsed,scale=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('ancient_guard');
    const intake=ease(t/.4),ascend=ease((t-.38)/.78),release=1-ease((t-2.15)/.55);
    c.save();c.translate(160,window.RegionPreview.floor);c.scale(p.facing*scale*p.sx,scale*p.sy);c.translate(-64,-118);
    // Leaves spiral upward, crossing behind and in front of the tree separately.
    if(t>.48&&t<2.6){
      for(let i=0;i<14;i++){
        const u=((t-.48)*.64+i/14)%1,a=u*Math.PI*3.5+i*.55;
        if((Math.sin(a)>0)!==front)continue;
        const xx=65+Math.cos(a)*(44+u*10),yy=119-u*104;
        c.save();c.globalAlpha*=Math.sin(u*Math.PI)*release*.85;
        leaf(c,xx,yy,4+i%3,Math.cos(a)>0?1:-1);
        dot(c,xx-2,yy+4,'#dff6b8',1);c.restore();
      }
    }
    if(!front){
      // A quiet canopy halo makes the emerging leaf silhouette legible in the forest.
      c.save();c.globalAlpha*=p.bloom*.12;
      blob(c,68,52,55,48,'#b4e9a0');blob(c,68,52,43,38,'#d5f7ac');c.restore();
      // Branching ground roots draw inward, rather than a generic circular magic seal.
      const roots=[[[3,119],[15,116],[27,112]],[[12,108],[20,110],[27,112]],[[51,123],[39,118],[27,112]],[[127,119],[116,115],[104,112]],[[118,106],[111,110],[104,112]],[[81,123],[92,117],[104,112]]];
      c.save();c.globalAlpha*=intake*(1-ease((t-1.0)/.65))*.65;
      for(const pts of roots){path(c,pts,intake,'#49663d',2);path(c,pts,intake,'#b8df8c',1);}
      c.restore();
    }else{
      // The existing emerald tree-heart is the focus, not a floating heal icon.
      c.save();c.globalAlpha*=release*ascend*(1-ease((t-1.15)/.5));
      for(const pts of sap){c.save();c.globalAlpha*=.45;path(c,pts,ascend,'#a7df87',1);c.restore();}
      if(t>.5&&t<1.45){
        const q=clamp((t-.5)/.78)*(sap[0].length-1),i=Math.min(4,Math.floor(q)),f=q-i;
        for(const pts of sap){const x=pts[i][0]+(pts[i+1][0]-pts[i][0])*f,y=pts[i][1]+(pts[i+1][1]-pts[i][1])*f;blob(c,x,y,4,4,'#a6e879');dot(c,x-1,y-2,'#f0ffcd',2);}
      }
      c.restore();c.save();c.globalAlpha*=release;
      const pulse=Math.sin(clamp((t-1.03)/.8)*Math.PI);
      if(pulse>0){
        c.save();c.globalAlpha*=pulse;
        c.save();c.globalAlpha*=.35;blob(c,76,55,12,15,'#a6e978');c.restore();
        leaf(c,74,61,10,1);
        for(let j=0;j<4;j++){
          const a=j*Math.PI/2+.4,r=16+pulse*7;
          line(c,76+Math.cos(a)*r,55+Math.sin(a)*r,76+Math.cos(a)*(r+4),55+Math.sin(a)*(r+4),'#e4fac1',1);
        }
        c.restore();
      }
      c.restore();
      // New leaves unfurl at actual branch tips, shoulders and root ends.
      const buds=[[43,16,-1],[61,8,-1],[86,18,1],[26,43,-1],[96,42,1],[19,63,-1],[111,72,1],[24,111,-1],[106,111,1]];
      for(let i=0;i<buds.length;i++){
        const [x,y,side]=buds[i],grow=ease((t-1.05-i*.045)/.42);
        if(!grow)continue;c.save();c.globalAlpha*=release;
        const yy=y-(i>2&&i<7?p.bloom*4:0),size=(i<3?7:5)*grow;
        leaf(c,x,yy,size,side);leaf(c,x+side*2,yy+2,size*.7,-side);c.restore();
      }
      // Two readable recovery sparks resolve after the tree-heart pulse.
      for(const side of [-1,1]){
        const age=t-1.28;if(age<0||age>.95)continue;
        const x=64+side*(47+age*4),y=66-age*31;
        c.save();c.globalAlpha*=Math.sin(age/.95*Math.PI)*release;
        line(c,x-4,y,x+4,y,'#427650',4);line(c,x,y-4,x,y+4,'#427650',4);
        line(c,x-4,y,x+4,y,'#def9b7',2);line(c,x,y-4,x,y+4,'#def9b7',2);c.restore();
      }
      // Last motes lift from leaves; sparse and subordinate to the plant growth.
      if(t>1.5)for(let i=0;i<10;i++){
        const age=t-1.5,x=22+i*10+Math.sin(i*2+age*3)*3,y=50+(i%3)*17-age*26;
        c.save();c.globalAlpha*=release*.55;dot(c,x,y,'#e5fac3',1+i%2);c.restore();
      }
    }
    c.restore();
  }
  window.AncientGuardRegen={sample,deform,tint,effects};
})();
