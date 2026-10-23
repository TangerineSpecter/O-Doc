/* Distinct pixel silhouettes: crossed cuts, orbiting rock and woven void slits. */
(() => {
  const {ease,dot,line,poly,slash}=window.RuinsPixels;
  function glint(c,x,y,r,color='#e4dcff'){poly(c,[[x,y-r],[x+2,y-2],[x+r,y],[x+2,y+2],[x,y+r],[x-2,y+2],[x-r,y],[x-2,y-2]],color);dot(c,x,y,'#ffffff',1);}
  function slit(c,x,y,length,open,angle=0){
    c.save();c.translate(x,y);c.rotate(angle);
    poly(c,[[-1,-length],[open,-length*.35],[open*.6,length*.35],[0,length],[-open,length*.3],[-open*.75,-length*.4]],'#1a152e');
    line(c,-1,-length,-open*.75,-length*.4,'#bc8bf0',1);line(c,-open*.75,-length*.4,-open,length*.3,'#7d58c4',2);line(c,open,-length*.35,0,length,'#d3c3ff',1);c.restore();
  }
  function rock(c,x,y,r,turn){
    const pts=Array.from({length:6},(_,i)=>{const a=i*Math.PI/3+turn;return [x+Math.cos(a)*r,y+Math.sin(a)*r*.85];});
    poly(c,pts,'#302e5c');poly(c,[pts[0],pts[1],[x,y],pts[5]],'#66699e');poly(c,[pts[2],pts[3],pts[4],[x,y]],'#424373');line(c,...pts[3],...pts[2],'#a9b4de',2);glint(c,x,y,r*.55,'#ceb0ff');
  }
  function walker(c,p,front){
    const t=p.elapsed;
    if(!front){const a=ease(t/.35)*(1-ease((t-1.3)/.5));c.globalAlpha*=a;for(let i=0;i<3;i++)slash(c,-15,-40+i*8,30+i*5,2.6+t*.6,1.6,'#7194aa',2);return;}
    for(let j=0;j<2;j++){
      const age=t-(.68+j*.29);if(age<0||age>.68)continue;const q=ease(age/.2),fade=1-ease((age-.25)/.43);c.save();c.globalAlpha*=fade;
      const angle=j?1.1-q*2.2:-1.1+q*2.2;
      slash(c,11,-42,54,angle,j?-1.25:1.25,'#34475b',8);slash(c,11,-42,51,angle,j?-1.2:1.2,'#8ed2dd',4);slash(c,11,-42,49,angle,j?-1.15:1.15,'#e4fcf5',2);
      line(c,32,-61+j*37,63,-24-j*37,'#d5fcf7',2);c.restore();
    }
    const tail=1-ease((t-1.25)/.6);if(t>1&&tail>0){c.globalAlpha*=tail;for(let i=0;i<9;i++)dot(c,51+Math.sin(i*2)*t*8,-42+Math.cos(i*2)*t*12,i%2?'#ae8bdb':'#798cae',1);}
  }
  function golem(c,p,front){
    const t=p.elapsed,g=ease(t/.7),launch=ease((t-1.3)/.65),end=1-ease((t-2.05)/.65);
    if(end<=0)return;c.globalAlpha*=end;
    if(front){glint(c,4,-69,6+g*5,'#c3a3f7');}
    for(let i=0;i<3;i++){
      const a=t*3+i*Math.PI*2/3,z=Math.sin(a);if((z>=0)!==front)continue;
      const x=Math.cos(a)*66*g*(1-launch)+89*launch,y=-65+z*34*g*(1-launch)+20*launch;
      for(let j=1;j<9;j++){const q=a-j*.08;c.save();c.globalAlpha*=1-j/9;dot(c,Math.cos(q)*66*g*(1-launch)+89*launch,-65+Math.sin(q)*34*g*(1-launch)+20*launch,'#8975c2',1);c.restore();}
      rock(c,x,y,(7+g*5)*(1-.45*launch),a*.4);
    }
    if(front&&t>1.88){const a=t-1.88,exp=ease(a/.35);slit(c,89,-45,22*(1-exp),7*(1-exp));
      for(let i=0;i<12;i++){const angle=i*Math.PI/6,r=8+exp*30;line(c,89+Math.cos(angle)*r,-45+Math.sin(angle)*r*.7,89+Math.cos(angle)*(r+4),-45+Math.sin(angle)*(r+4)*.7,i%3?'#9286c5':'#e3d4ff',1);}
    }
  }
  function lord(c,p,front){
    const t=p.elapsed,sites=[[68,-91],[103,-58],[64,-27]],fade=1-ease((t-2.55)/.65);
    if(!front){c.globalAlpha*=fade;for(let i=0;i<3;i++){const q=ease((t-.45-i*.13)/.5),[x,y]=sites[i];if(!q)continue;line(c,37,-82,37+(x-37)*q,-82+(y+82)*q,'#73569d',1);glint(c,x,y,3*q);}
      return;}
    c.globalAlpha*=fade;glint(c,37,-82,4+p.riftCore*4,'#bfa3ed');
    for(let i=0;i<3;i++){
      const age=t-.72-i*.23;if(age<0)continue;const q=ease(age/.5),slice=ease((age-.75)/.23),[x,y]=sites[i];slit(c,x-slice*12,y,24*q,3+slice*5,-.3+i*.3);
      if(slice>0&&age<1.5){c.save();c.globalAlpha*=1-ease((age-1.05)/.45);slash(c,x-26,y,31,-1.6+slice*2.6,1.3,'#9c79d4',4);slash(c,x-26,y,29,-1.6+slice*2.6,1.1,'#eee1ff',1);c.restore();}
    }
  }
  function draw(c,key,p,time,opts,front){
    const s=window.MeadowArt.monsterScale(key)*(opts.atlas?.4:1);c.save();c.translate(160+p.x,window.RegionPreview.floor+p.y);c.scale(p.facing*s,s);
    if(key==='rift_walker')walker(c,p,front);else if(key==='star_golem')golem(c,p,front);else if(key==='rift_lord')lord(c,p,front);else window.RiftBossEffects.draw(c,p,front);
    c.restore();
  }
  window.RiftEffects={draw,glint,slit,rock};
})();
