/* Blade fire and afterimages use the same wrist transform as the visible weapon. */
(() => {
  const {ease,clamp,line,poly,dot}=window.RuinsPixels;
  function world(key,point,p,opts){
    const s=window.MeadowArt.monsterScale(key)*(opts.atlas?.4:1),[x,y]=point;
    return [160+p.x+(x-64-p.lean*(y-118))*p.facing*s,window.RegionPreview.floor+p.y+(y-118)*s];
  }
  function blade(key,p,opts){const d=window.RuinsConnected.defs[key];return [d.heel,d.tip].map(q=>world(key,window.RuinsConnected.point(key,...q,p),p,opts));}
  function trail(c,key,p,opts){
    const start=key==='ruin_skeleton'?.72:1.08,end=key==='ruin_skeleton'?.96:1.38,t=p.elapsed;
    if(t<start||t>end+.16)return;
    const age=Math.min(t,end),fade=1-ease((t-end)/.16);
    c.save();c.globalAlpha*=fade*.65;
    // Sample actual past blade poses; ribbons terminate exactly at the visible cutting edge.
    for(let i=9;i>0;i--){
      const t0=Math.max(start,age-i*.015),t1=Math.max(start,age-(i-1)*.015);
      const a=window.RuinsMotion.sample(key,{facing:p.facing,action:p.action,elapsed:t0},t0),b=window.RuinsMotion.sample(key,{facing:p.facing,action:p.action,elapsed:t1},t1);
      const [ha,ta]=blade(key,a,opts),[hb,tb]=blade(key,b,opts);
      const ia=[ha[0]+(ta[0]-ha[0])*.65,ha[1]+(ta[1]-ha[1])*.65],ib=[hb[0]+(tb[0]-hb[0])*.65,hb[1]+(tb[1]-hb[1])*.65];
      c.save();c.globalAlpha*=(1-i/12);poly(c,[ia,ta,tb,ib],key==='ruin_skeleton'?'#8c79b2':'#76628d');line(c,...ta,...tb,'#dddbef',1);c.restore();
    }
    c.restore();
  }
  function fire(c,key,p,opts){
    if(key!=='ruin_skeleton')return;
    const active=ease(p.elapsed/.4)*(1-ease((p.elapsed-1.25)/.5)),[h,tip]=blade(key,p,opts),s=window.MeadowArt.monsterScale(key)*(opts.atlas?.4:1);
    c.save();c.globalAlpha*=active;
    for(let i=0;i<8;i++){const q=i/8,x=h[0]+(tip[0]-h[0])*q,y=h[1]+(tip[1]-h[1])*q,r=(3+Math.sin(p.elapsed*18+i)*1.5)*s;poly(c,[[x-r,y],[x-r*.7,y-r],[x,y-r*1.8],[x+r*.5,y]],'#8570a4');line(c,x,y,x,y-r,'#b0e3de',Math.max(1,s));}
    c.restore();
  }
  function shield(c,p,opts){
    const t=p.elapsed,active=ease((t-.2)/.3)*(1-ease((t-.95)/.4));if(!active)return;
    c.save();c.globalAlpha*=active;
    for(let i=0;i<80;i++){const a=i/80*Math.PI*2,q=window.RuinsConnected.shieldPoint(106+Math.cos(a)*15,65+Math.sin(a)*21,p),w=world('ruin_knight',q,p,opts);dot(c,...w,'#a199b4',1);}
    const flash=1-clamp(Math.abs(t-.72)/.16),contact=world('ruin_knight',window.RuinsConnected.shieldPoint(120,62,p),p,opts),s=window.MeadowArt.monsterScale('ruin_knight')*(opts.atlas?.4:1);c.globalAlpha*=flash;
    for(let i=0;i<6;i++){const a=-1.4+i*.5;line(c,...contact,contact[0]+p.facing*Math.cos(a)*12*s,contact[1]+Math.sin(a)*13*s,'#e5dfca',1);}
    c.restore();
  }
  window.RuinsDarkEffects={draw(c,key,p,time,opts,front){
    if(!front)return;trail(c,key,p,opts);fire(c,key,p,opts);if(key==='ruin_knight')shield(c,p,opts);
  }};
})();
