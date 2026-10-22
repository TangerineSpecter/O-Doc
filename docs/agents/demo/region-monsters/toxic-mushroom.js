/* Preview-only toxin: source-colour drips and a staged spore cast. No combat state. */
(() => {
  const clamp=n=>Math.max(0,Math.min(1,n));
  const ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
  const drops=[{x:18,y:80,w:14,h:20,cx:26,period:2.1,offset:.12},{x:99,y:72,w:12,h:16,cx:104,period:2.35,offset:1.08}];
  const active=p=>!['hit','defeat'].includes(p.action)&&!p.hidden;
  const sourceDrop=(x,y)=>drops.some(d=>x>=d.x&&x<d.x+d.w&&y>=d.y&&y<d.y+d.h);
  const dot=(c,x,y,color,s=2)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),s,s);};
  function blob(c,x,y,rx,ry,color) {
    c.fillStyle=color;
    for(let row=-Math.ceil(ry);row<=ry;row+=2){
      const half=Math.round(rx*Math.sqrt(Math.max(0,1-(row/ry)**2))/2)*2;
      if(half)c.fillRect(Math.round(x-half),Math.round(y+row),half*2,2);
    }
  }
  function initDrops(s) {
    for(const d of drops){
      const canvas=Object.assign(document.createElement('canvas'),{width:d.w,height:d.h});
      const ctx=canvas.getContext('2d'),im=ctx.createImageData(d.w,d.h),buf=new Uint32Array(im.data.buffer);
      for(let y=0;y<d.h;y++)for(let x=0;x<d.w;x++)buf[y*d.w+x]=s.palette[s.pixels[(d.y+y)*s.width+d.x+x]];
      ctx.putImageData(im,0,0);d.canvas=canvas;
    }
  }
  function drawDrops(s,p,time,flip,options) {
    if(!drops[0].canvas)initDrops(s);
    const c=s.ctx;c.save();c.imageSmoothingEnabled=false;
    if(flip){c.translate(s.width,0);c.scale(-1,1);}
    for(const d of drops){
      const phase=((time+d.offset)%d.period)/d.period;
      const grow=phase<.55?.28+.72*ease(phase/.55):.28;
      const w=Math.round(d.w*(.65+.35*grow)),h=Math.round(d.h*grow);
      c.drawImage(d.canvas,0,0,d.w,d.h,Math.round(d.cx-(d.cx-d.x)*w/d.w),d.y,w,h);
      if(phase>=.55&&phase<.82){
        const fall=(phase-.55)/.27,dy=(118-d.y-d.h)*fall*fall;
        c.drawImage(d.canvas,d.x,Math.round(d.y+dy),d.w,d.h);
        if(fall>.25)dot(c,d.cx,d.y+dy-4,'#b5bc6c',1);
      }
      if(phase>=.82){
        const age=(phase-.82)/.18;c.globalAlpha=1-age;
        blob(c,d.cx,118,3+age*9,1.5,'#828449');
        for(const side of [-1,1]){
          const x=d.cx+side*(2+age*10),y=117-Math.sin(age*Math.PI)*6;
          dot(c,x,y,'#aab567',2);dot(c,x,y-1,'#e1e4a0',1);
        }
        c.globalAlpha=1;
      }
    }
    if(options.layers){c.globalCompositeOperation='source-atop';c.globalAlpha=.25;c.fillStyle='#a4c970';c.fillRect(0,72,128,53);}
    c.restore();
  }
  function sample(p,t) {
    p.mushroomPoison=true;
    p.charge=ease(t/.65)*(1-ease((t-.65)/.22));
    p.swing=Math.sin(clamp((t-.65)/.55)*Math.PI);
    p.sy=1-.055*p.charge+.035*p.swing;p.sx=1+.035*p.charge-.015*p.swing;
    p.tilt=-p.facing*3*p.charge+p.facing*2*p.swing;
    return p;
  }
  function effects(c,p,time,opts,front) {
    const t=p.elapsed,floor=window.RegionPreview.floor;
    const scale=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('toxic_mushroom');
    const origin={x:160+p.x+p.facing*37*scale,y:floor+p.y-49*scale};
    const target={x:160+p.facing*103,y:floor-30};
    // Rim beads gather below the cap, leaving the face open.
    if(!front&&t<.84){
      const charge=ease(t/.65);
      for(let i=0;i<14;i++){
        const a=i/13*Math.PI,xx=160+Math.cos(a)*52*scale,yy=floor-53*scale-Math.sin(a)*7*scale;
        dot(c,xx,yy-Math.sin(t*8+i)*2,'#584064',3*charge);
        dot(c,xx,yy,'#d3e58a',2*charge);
      }
    }
    if(t>=.66&&t<1.38){
      // One cohesive plume; staggered lobes give it a widening tail, not repeated hits.
      for(let i=9;i>=0;i--){
        const age=t-.66-i*.024;if(age<0)continue;
        const travel=clamp(age/.54),fade=1-ease((t-1.15)/.23);
        const x=origin.x+(target.x-origin.x)*travel;
        const y=origin.y+(target.y-origin.y)*travel-Math.sin(travel*Math.PI)*9;
        const r=(6+i*.6)*(.65+.35*scale);
        c.save();c.globalAlpha*=fade*(front?.85:.45);
        if(!front)blob(c,x,y,r+4,r*.8,'#634273');
        else{
          blob(c,x,y,r,r*.7,i%2?'#647743':'#879e4e');
          blob(c,x-p.facing*2,y-2,r*.55,r*.38,'#b7ce68');
          dot(c,x+Math.sin(i*8)*r,y+Math.cos(i*4)*r*.7,'#eff4ab',2);
        }
        c.restore();
      }
    }
    if(t>=1.15){
      const age=t-1.15,burst=ease(age/.23),fade=1-ease((t-2.03)/.5);
      c.save();c.globalAlpha*=fade;
      if(!front){
        // Dark violet underpainting keeps green spores legible on the forest floor.
        c.globalAlpha*=.42;
        for(let i=0;i<8;i++){
          const a=i*2.399,spread=burst*(10+i%3*7)+age*3;
          const xx=target.x+Math.cos(a)*spread,yy=target.y+Math.sin(a)*spread*.65-age*(4+i%3*4);
          const radius=(7+i%3*2)*(1-.2*clamp(age));
          blob(c,xx,yy,radius,radius*.9,i%2?'#725080':'#4f385f');
          blob(c,xx-2,yy-3,radius*.65,radius*.5,'#a583b0');
        }
        c.globalAlpha*=.5;blob(c,target.x,floor-2,19+burst*14,4,'#647c43');
      }else{
        for(let i=0;i<15;i++){
          const a=i*2.399,r=(8+(i%5)*4)*burst;
          const x=target.x+Math.cos(a)*r,y=target.y+Math.sin(a)*r*.8-age*(6+i%4*3);
          blob(c,x,y,3+i%2,3+i%2,'#5b703d');
          blob(c,x-1,y-1,2+i%2,2+i%2,i%3?'#a8bf67':'#c5d97e');
          dot(c,x-2,y-3,'#edf1b3',1+i%2);
        }
        // Drops inside the impact cloud fall to a brief toxic splash.
        for(let i=0;i<5;i++){
          const fall=(age*.9+i*.17)%1;
          dot(c,target.x+(i-2)*9,floor-30+fall*27,'#c4da7b',2);
        }
      }
      c.restore();
    }
  }
  window.ToxicMushroom={active,sourceDrop,drawDrops,sample,effects};
})();
