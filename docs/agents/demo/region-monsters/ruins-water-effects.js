/* Water uses shaped volume, curling crests, foam, droplets and surface ripples. */
(() => {
  const {clamp,ease,dot,line,poly,blob,ring,droplet,spray}=window.RuinsPixels;
  function vortex(c,x,y,r,t){
    blob(c,x,y,r,r*.9,'#12648f');blob(c,x-1,y-1,r*.86,r*.8,'#248fb9');blob(c,x-2,y-2,r*.65,r*.63,'#57d6e2');
    for(let i=0;i<100;i++){const q=i/99,a=q*Math.PI*4+t*8,rr=r*q*.85;dot(c,x+Math.cos(a)*rr,y+Math.sin(a)*rr*.85,q>.6?'#c9fbf7':'#167aaf',q>.65?2:1);}
    line(c,x-r*.55,y-r*.45,x-r*.25,y-r*.7,'#effffb',2);dot(c,x+r*.35,y+r*.35,'#b2f4ed',2);
  }
  function spirit(c,p,time,opts,front){
    const t=p.elapsed,s=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('water_spirit'),floor=window.RegionPreview.floor;
    if(!front){
      c.save();c.globalAlpha*=ease(t/.3)*(1-ease((t-1.8)/.5));ring(c,160+p.x,floor,22*s,5*s,'#62c9d5');ring(c,160+p.x,floor,31*s,8*s,'#aeeae2');c.restore();return;
    }
    if(t<.76){
      const gather=ease(t/.6),cx=160+p.facing*26*s,cy=floor-56*s;
      vortex(c,cx,cy,(4+gather*9)*s,t);
      for(let i=0;i<6;i++){const a=i/6*Math.PI*2+t*4,rr=(27-14*gather)*s;droplet(c,cx+Math.cos(a)*rr,cy+Math.sin(a)*rr*.7,(1.5+i%2)*s);}
    }else if(t<1.3){
      const q=ease((t-.76)/.54),x=160+p.facing*(26+72*q)*s,y=floor-(56-24*q+Math.sin(q*Math.PI)*9)*s;
      for(let i=0;i<6;i++){c.save();c.globalAlpha*=(1-i/6)*.65;blob(c,x-p.facing*i*5*s,y+i%2*2*s,(7-i*.7)*s,(5-i*.4)*s,i%2?'#72dce5':'#238db5');c.restore();}
      vortex(c,x,y,13*s,t);droplet(c,x-p.facing*17*s,y-8*s,2*s);
    }else{
      const age=t-1.3,x=160+p.facing*98*s;
      spray(c,x,floor-9*s,age,s,1.6);
      if(age<.33){c.save();c.globalAlpha*=1-age/.33;for(let i=0;i<7;i++){const vx=(i-3)*7;for(let j=0;j<12;j++){const q=j/11;const xx=x+vx*q*s,yy=floor-(10+Math.sin(q*Math.PI*.85)*(10+age*60))*s;dot(c,xx,yy,i%2?'#72dbe8':'#d5fffa',2);}droplet(c,x+vx*s,floor-(15+age*45)*s,2*s);}c.restore();}
      if(age<1){c.save();c.globalAlpha*=1-age;ring(c,x,floor,10+age*35*s,3+age*9*s,'#7adbdc');c.restore();}
    }
  }
  function waterSheet(c,x,floor,width,height,t,side){
    const edge=[];for(let i=0;i<=36;i++){const q=i/36;edge.push([x+side*(Math.sin(q*4+t*2)*4+q*q*8),floor-q*height]);}
    poly(c,[...edge,...edge.slice().reverse().map(([u,v])=>[u-side*width*(.4+.6*(floor-v)/height),v])],'#287ca5');
    for(let i=1;i<edge.length;i++){
      line(c,edge[i-1][0],edge[i-1][1],edge[i][0],edge[i][1],'#9cebea',2);
      if(i%3===0)line(c,edge[i][0]-side*width*.4,edge[i][1],edge[i][0]-side*width*.65,edge[i][1]-5,'#4bc1d4',2);
    }
    const [tipX,tipY]=edge[36];vortex(c,tipX-side*5,tipY+3,7,t);
  }
  function barrier(c,p,time,opts,front){
    const t=p.elapsed,s=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('tide_priest'),floor=window.RegionPreview.floor;
    const grow=ease((t-.55)/.7),fade=1-ease((t-2.35)/.65);if(!grow)return;
    c.save();c.globalAlpha*=fade;
    if(!front){
      c.globalAlpha*=.65;ring(c,160,floor,68*s,12*s,'#5bbfce');ring(c,160,floor,59*s,9*s,'#b5f6ed');
      waterSheet(c,160-51*s,floor,16*s,98*s*grow,t,1);
      waterSheet(c,160+51*s,floor,16*s,98*s*grow,t,-1);
    }else{
      // A waist-high moving water curtain, open above so the priest remains readable.
      for(let i=0;i<100;i++){
        const a=i/99*Math.PI,xx=160+Math.cos(a)*62*s,yy=floor-10*s+Math.sin(a)*10*s;
        const top=yy-(12+Math.sin(a*3+t*4)*4)*s*grow;
        c.globalAlpha=fade*.45;line(c,xx,yy,xx,top,'#2598bc',2);
        c.globalAlpha=fade*.9;dot(c,xx,top,'#d1fbf1',2);
      }
      for(let i=0;i<12;i++){
        const q=(t*.55+i/12)%1,a=i/12*Math.PI*2+t;
        droplet(c,160+Math.cos(a)*57*s,floor-q*74*s,(1.1+i%3*.5)*s);
      }
    }
    c.restore();
  }
  function wave(c,x,floor,h,width,dir,t){
    c.save();c.translate(x,floor);c.scale(dir,1);
    // Curling wave silhouette: the crest rolls forward and folds back into the trough.
    const pts=[[-width,0],[-width*.72,-h*.28],[-width*.55,-h*.74],[-width*.25,-h],[width*.04,-h*.96],[width*.2,-h*.78],[width*.14,-h*.56],[-width*.03,-h*.49],[-width*.16,-h*.61],[-width*.08,-h*.71],[-width*.22,-h*.73],[-width*.29,-h*.52],[-width*.09,-h*.29],[width*.35,-h*.13],[width*.5,0]];
    poly(c,pts,'#165a82');poly(c,pts.map(([u,v])=>[u*.93,v*.92]),'#218fb8');
    poly(c,[[-width*.85,0],[-width*.57,-h*.25],[-width*.45,-h*.56],[-width*.33,-h*.71],[-width*.38,-h*.38],[-width*.14,-h*.12],[width*.35,0]],'#50c9d9');
    for(let i=1;i<11;i++)line(c,...pts[i-1],...pts[i],i<7?'#c4fcf2':'#7de6e6',i<7?3:2);
    // Curved interior sheets and broken foam follow the curl instead of a flat blue fill.
    for(let band=0;band<3;band++)for(let i=0;i<32;i++){
      const q=i/31,xx=-width*(.62-band*.1)+Math.sin(q*2.4)*width*.22,yy=-h*(.17+q*.63);
      dot(c,xx,yy,band===0?'#71e0e5':band===1?'#3bb6d1':'#b9f3ec',band===1?2:1);
    }
    for(let i=0;i<13;i++){const q=i/12,xx=-width*.5+q*width*.65,yy=-h*(.88+Math.sin(q*Math.PI)*.1);
      blob(c,xx,yy,1+i%2,1,'#effff5');
      if(i%3===0)droplet(c,xx-2,yy-4-(i%4),1.5);
    }
    for(let j=0;j<4;j++)for(let i=0;i<22;i++){
      const q=i/21,xx=-width*.73+q*width*.7,yy=-h*(.08+j*.1)-Math.sin(q*2+j+t*3)*3;
      dot(c,xx,yy,j%2?'#a8eeeb':'#36b2ce',1);
    }
    c.restore();
  }
  function verdict(c,p,time,opts,front){
    const t=p.elapsed,s=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('tide_priest'),floor=window.RegionPreview.floor;
    if(!front){
      if(t<1.15){c.save();c.globalAlpha*=ease(t/.65);for(let i=0;i<3;i++)ring(c,160,floor,(20+i*17)*s,4+i*3,'#6dd5df');c.restore();}
      return;
    }
    if(t<.96){
      const gather=ease(t/.7),cx=160-p.facing*31*s,cy=floor-110*s;
      // Water climbs to the trident head, making the staff command visible.
      for(let i=0;i<9;i++){const q=(t*.8+i/9)%1;droplet(c,cx+Math.sin(q*7+i)*5*s,floor-q*105*s,(1.2+i%2)*s);}
      vortex(c,cx,cy,(4+gather*7)*s,t);
    }
    if(t>.94&&t<2.35){
      const q=clamp((t-.94)/1.13),x=160+p.facing*(28+q*76)*s;
      const grow=ease((t-.94)/.3),fall=1-ease((t-1.85)/.5);
      c.save();c.globalAlpha*=1-ease((t-2.12)/.23);
      wave(c,x,floor,72*s*grow*fall,39*s,p.facing,t);
      for(let i=0;i<9;i++){const age=(t-.94+i*.07)% .6;droplet(c,x-p.facing*(4+i*3)*s,floor-72*s*grow*fall-(Math.sin(age/.6*Math.PI)*(5+i%3*4))*s,(1.2+i%3*.4)*s);}
      c.restore();
    }
    if(t>1.75)spray(c,160+p.facing*104*s,floor,t-1.75,s,1.8);
  }
  function basic(c,key,p,time,opts,front){
    if(!front)return;const s=(opts.atlas?.4:1)*window.MeadowArt.monsterScale(key),t=p.elapsed,q=clamp((t-.28)/.4),floor=window.RegionPreview.floor;
    if(t<.68){const x=160+p.facing*(24+70*q)*s,y=floor-(55-23*q)*s;droplet(c,x,y,(3+2*q)*s);for(let i=1;i<4;i++)dot(c,x-p.facing*i*4*s,y,'#8ce3e4',2);}
    else spray(c,160+p.facing*94*s,floor-5*s,t-.68,s,.65);
  }
  window.RuinsWaterEffects={basic,draw(c,key,p,time,opts,front){if(key==='water_spirit')spirit(c,p,time,opts,front);else if(p.action==='rising_tide')barrier(c,p,time,opts,front);else verdict(c,p,time,opts,front);}};
})();
