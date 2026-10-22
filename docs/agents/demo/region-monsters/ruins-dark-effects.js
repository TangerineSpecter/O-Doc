/* Dark bone fire and a shield-led riposte: no generic ground impact. */
(() => {
  const {clamp,ease,dot,line,poly,slash}=window.RuinsPixels;
  function weaponFire(c,p,key,t,scale){
    const active=ease(t/.45)*(1-ease((t-1.2)/.5));if(!active)return;
    c.save();c.globalAlpha*=active;c.translate(160+p.x,window.RegionPreview.floor+p.y);c.scale(p.facing*scale,scale);c.transform(1,0,-p.lean,1,0,0);
    c.translate(34-64,70-118-p.weaponLift);c.rotate(p.weapon);
    for(let i=0;i<8;i++){
      const x=5+i*2.5,y=10+i*3.6,h=5+Math.sin(t*16+i*2)*2;
      poly(c,[[x-3,y+2],[x-5,y-h*.5],[x-2,y-h],[x+1,y-h*.55],[x+3,y+1]],'#65568b');
      poly(c,[[x-2,y],[x-2,y-h*.5],[x,y-h*.85],[x+1,y]],'#9bdde1');dot(c,x-1,y-1,'#e2f7ec',1);
    }
    c.restore();
  }
  function skeleton(c,p,time,opts,front){
    const t=p.elapsed,s=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('ruin_skeleton');
    if(!front)return;weaponFire(c,p,'ruin_skeleton',t,s);
    if(t>.7&&t<1.26){
      const q=ease((t-.7)/.2),fade=1-ease((t-.99)/.27);
      c.save();c.globalAlpha*=fade;c.translate(160+p.x,window.RegionPreview.floor);c.scale(p.facing*s,s);
      slash(c,-7,-49,50,-2+q*2.7,1.05,'#453853',7);slash(c,-7,-49,47,-2+q*2.7,1,'#a693cb',4);slash(c,-7,-49,45,-2+q*2.7,.85,'#d2f5ef',2);
      c.restore();
    }
    const age=t-.93;if(age>=0&&age<.7){
      const x=160+p.facing*68*s,y=window.RegionPreview.floor-36*s;
      c.save();c.globalAlpha*=1-ease(age/.7);
      for(let i=0;i<9;i++){const yy=y+(i-4)*5*s-age*(6+i%3*10)*s,xx=x+p.facing*Math.sin(i*3+age)*age*24*s;
        poly(c,[[xx-2*s,yy+3*s],[xx-3*s,yy-2*s],[xx+s,yy-(6+i%3)*s],[xx+2*s,yy]],i%2?'#8d80b5':'#b7e3e3');}
      c.restore();
    }
  }
  function knight(c,p,time,opts,front){
    const t=p.elapsed,s=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('ruin_knight'),floor=window.RegionPreview.floor;
    if(!front)return;
    c.save();c.translate(160+p.x,floor+p.y);c.scale(p.facing*s,s);c.transform(1,0,-p.lean,1,0,0);
    // Light follows the rim of the ORIGINAL round shield; no summoned replacement shell.
    if(t>.2&&t<1.3){
      const a=ease((t-.2)/.3)*(1-ease((t-.95)/.35));c.save();c.globalAlpha*=a;
      c.translate(93-64,60-118);c.rotate(p.shield);
      for(let i=0;i<65;i++){const q=i/64*Math.PI*2;dot(c,12+Math.cos(q)*17,5+Math.sin(q)*23,'#82779b',1);}
      const flash=1-clamp(Math.abs(t-.72)/.18);c.globalAlpha*=flash;
      for(let i=0;i<7;i++){const q=-1.2+i*.4;line(c,29,3,29+Math.cos(q)*14,3+Math.sin(q)*17,i%2?'#d6e8dc':'#a5a1bd',1);}
      c.restore();
    }
    if(t>1.08&&t<1.75){
      const cut=ease((t-1.08)/.24),fade=1-ease((t-1.4)/.35);c.save();c.globalAlpha*=fade;
      // Upward counter-cut after the shield catches the simulated incoming blow.
      const a=1.2-cut*2.8;slash(c,4,-37,58,a,-1.2,'#332c47',9);slash(c,4,-37,55,a,-1.05,'#76618e',6);slash(c,4,-37,52,a,-.9,'#c7bfda',2);
      c.restore();
    }
    c.restore();
    const age=t-1.34;if(age>=0&&age<.55){c.save();c.globalAlpha*=1-age/.55;for(let i=0;i<10;i++){
      const x=160+p.facing*(64+age*(12+i%3*8))*s,y=floor-(22+i*5+age*16)*s;
      poly(c,[[x,y],[x+p.facing*7*s,y-5*s],[x+p.facing*4*s,y+3*s]],i%2?'#a599bb':'#4c425c');
    }c.restore();}
  }
  window.RuinsDarkEffects={draw(c,key,p,time,opts,front){if(key==='ruin_skeleton')skeleton(c,p,time,opts,front);else knight(c,p,time,opts,front);}};
})();
