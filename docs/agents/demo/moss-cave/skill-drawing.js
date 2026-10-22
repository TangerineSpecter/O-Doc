/* Time-sampled cave skills. All geometry is drawn on the shared low-resolution
   stage; no damage, buffs, catalogue writes or persistence live here. */
(() => {
  const clamp = n => Math.max(0,Math.min(1,n));
  const ease = n => {n=clamp(n);return n*n*(3-2*n);};
  const rect = (c,x,y,w,h,color) => {c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
  function poly(c,points,color) {
    c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(Math.round(x),Math.round(y)):c.moveTo(Math.round(x),Math.round(y)));c.closePath();c.fill();
  }
  function line(c,x1,y1,x2,y2,color,size=1) {
    const steps=Math.ceil(Math.max(Math.abs(x2-x1),Math.abs(y2-y1)));
    for(let n=0;n<=steps;n++){const t=steps?n/steps:0;rect(c,x1+(x2-x1)*t,y1+(y2-y1)*t,size,size,color);}
  }
  function ring(c,x,y,rx,ry,color,phase=0,broken=false) {
    for(let n=0;n<160;n++) {if(broken && n%16>10)continue;const a=n/160*Math.PI*2+phase;rect(c,x+Math.cos(a)*rx,y+Math.sin(a)*ry,2,1,color);}
  }
  function star(c,x,y,color,size=3) {rect(c,x-size,y,size*2+1,1,color);rect(c,x,y-size,1,size*2+1,color);rect(c,x-1,y-1,3,3,color);}
  function rune(c,x,y,size,color) {
    line(c,x,y-size,x+size/2,y,color);line(c,x+size/2,y,x,y+size,color);
    line(c,x,y+size,x-size/2,y,color);line(c,x-size/2,y,x,y-size,color);line(c,x,y-size/2,x,y+size/2,color);
  }
  function rock(c,x,y,w,h,jade=false) {
    const dark=jade?'#366d60':'#53594e', mid=jade?'#75b9a0':'#929483', light=jade?'#d3edc7':'#d0ceb4';
    poly(c,[[x-w/2,y],[x-w*.62,y-h*.65],[x-w*.15,y-h],[x+w*.42,y-h*.88],[x+w*.58,y-h*.2],[x+w*.22,y+2]],dark);
    poly(c,[[x-w*.48,y-h*.64],[x-w*.12,y-h+2],[x+w*.3,y-h*.8],[x+w*.24,y-2],[x-w*.3,y-1]],mid);
    poly(c,[[x-w*.48,y-h*.64],[x-w*.12,y-h+2],[x+w*.3,y-h*.8],[x-w*.05,y-h*.6],[x-w*.18,y-4]],light);
    if(jade) rune(c,x+1,y-h*.45,Math.max(3,h*.15),'#f7e3a0');
    else {line(c,x-w*.25,y-h*.45,x+w*.24,y-h*.52,'#637557');rect(c,x-w*.35,y-h*.67,Math.round(w*.3),3,'#8aaa65');}
  }
  function dust(c,x,y,age,power=1) {
    if(age<0 || age>1)return;
    c.save();c.globalAlpha=(1-age)*.62;
    for(let n=0;n<15;n++){const a=n*2.399;const r=(7+age*42)*power;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.15-age*(3+n%4);
      const w=Math.max(2,Math.round((4+n%5)*(1-age*.5)*power));rect(c,px-w/2,py,w,2+n%3,n%2?'#c4c7aa':'#e1dec0');}
    c.restore();
  }
  function beastGuard(c,p,t,front) {
    const enter=ease(t/.55), leave=ease((t-2.35)/.65), strength=enter*(1-leave);
    c.globalAlpha=strength;
    if(!front){ring(c,0,0,64,13,'#92ad73',t*.2,true);ring(c,0,0,57,10,'#d6e6af');}
    for(let n=0;n<7;n++) {
      const a=n/7*Math.PI*2 + .25, z=Math.sin(a);
      if((z>=0)!==front)continue;
      const x=Math.cos(a)*(66-8*enter), y=z*17+4+(1-enter)*26+leave*28;
      // Near-side plates stay below the face; flank plates form a substantial wall.
      const h=front?29+Math.abs(Math.cos(a))*20:50;
      rock(c,x,y,24,h,false);
      rune(c,x+3,y-h*.45,4,'#e7edb4');
      if(t<.7)dust(c,x,9,t/.7,.6);
    }
    if(front){for(let n=0;n<9;n++){const x=-52+n*13,y=-18-(t*17+n*7)%47;rect(c,x,y,1,n%3===0?3:1,'#d8eab0');}}
  }
  function kingGuard(c,p,t,front) {
    const enter=ease(t/.65), leave=ease((t-2.3)/.7), a=enter*(1-leave);
    c.globalAlpha=a;
    if(!front) {
      // A quiet volume behind the deer, built in stepped scan-lines.
      for(let y=-122;y<-8;y+=2){const q=(y+64)/63, w=62*Math.sqrt(Math.max(0,1-q*q));
        c.globalAlpha=a*.10;rect(c,-w,y,Math.round(w*2),2,'#bbebca');
        c.globalAlpha=a*.55;rect(c,-w,y,2,2,'#98ccb0');rect(c,w,y,2,2,'#d3e5ad');}
      c.globalAlpha=a;
      ring(c,0,-105,36,13,'#d8c780',t*.18,true);ring(c,0,0,67,14,'#cfba73',-t*.15,true);
      for(let n=0;n<7;n++){const angle=n*Math.PI*2/7+t*.16;rune(c,Math.cos(angle)*36,-105+Math.sin(angle)*13,3,'#fff0b0');}
      star(c,-14,-107,'#fff4c9',4);
    }
    for(let n=0;n<6;n++) {
      const angle=n*Math.PI/3+t*.22, z=Math.sin(angle);
      if((z>0)!==front)continue;
      const x=Math.cos(angle)*66, y=-25+z*17+Math.sin(t*2+n)*2+(1-enter)*55+leave*40;
      const h=front?31:44;
      rock(c,x,y,12,h,true);
      if(!front)line(c,x,y-h,-14,-106,'#7a9e75');
    }
    if(front){ring(c,0,2,60,12,'#e4d49b',t*.22,true);for(let n=0;n<5;n++){const x=-46+n*24;star(c,x,-28-(t*15+n*11)%65,'#e1f1bd',n%2?1:2);}}
  }
  function strike(c,p,t,front) {
    const impact=.88, age=t-impact, dir=p.facing;
    const hoof=dir*15;
    if(age<0) {
      if(front)return;
      const a=ease(t/.65);c.globalAlpha=a*.8;
      ring(c,hoof,0,20+8*a,5,'#c9d39b',t*2,true);
      for(let n=0;n<8;n++){const an=n*Math.PI/4+t*2;rect(c,hoof+Math.cos(an)*(29-17*a),-4-Math.sin(an)*4-n%3*2,2,2,'#eee5b6');}
      return;
    }
    if(!front) {
      const fade=1-clamp(age/1.15);c.globalAlpha=fade;
      ring(c,hoof,1,10+age*100,3+age*24,'#e5e2b2');
      ring(c,hoof,1,7+age*85,2+age*18,'#92a873');
      // Broad, low dust front: a travelling impact wave rather than a tall spell.
      for(let n=0;n<55;n++) {
        const a=n/54*Math.PI*2, rx=16+age*104, ry=5+age*23;
        const x=hoof+Math.cos(a)*rx, y=1+Math.sin(a)*ry;
        c.globalAlpha=fade*(Math.sin(a)>0?.7:.35);
        rect(c,x,y,4+n%3,2+n%2,n%3?'#d5d3ad':'#f2e9c1');
      }
      c.globalAlpha=fade;
      // Branching ground fractures grow from the planted forehooves toward the target.
      const reach=clamp(age/.35);
      for(let n=0;n<5;n++) {
        let x=hoof,y=2;
        for(let j=1;j<=5;j++){const nx=hoof+dir*j*20*reach,ny=2+(n-2)*j*2.5+Math.sin(j*7+n)*6;
          line(c,x,y,nx,ny,'#58634b',2);line(c,x,y-1,nx,ny-1,'#d6d6a1');x=nx;y=ny;}
      }
      c.globalAlpha=1;dust(c,hoof,2,age/1.05,1.65);
    } else {
      // Chunky debris uses ballistic arcs, unlike the tiny ordinary-attack dust.
      for(let n=0;n<19;n++) {
        const life=.55+n%4*.12;if(age>life)continue;
        const vx=dir*(24+n*7)+(n%3-1)*31, vy=-(36+n%5*18);
        const x=hoof+vx*age,y=vy*age+100*age*age;
        c.globalAlpha=1-clamp((age-life+.2)/.2);rock(c,x,Math.min(5,y),4+n%3,5+n%4,false);
      }
      for(let n=0;n<3;n++) {
        const local=age-n*.09;if(local<0||local>.65)continue;
        const rise=Math.sin(clamp(local/.65)*Math.PI), x=hoof+dir*(40+n*24);
        c.globalAlpha=1-clamp((local-.45)/.2);rock(c,x,3,13,Math.max(2,21*rise),false);
      }
      if(age<.15){c.globalAlpha=(1-age/.15)*.85;star(c,hoof,-3,'#fff6d2',12);}
    }
  }
  function crystal(c,p,t,front) {
    const dir=p.facing, charge=ease(t/.65), fade=1-ease((t-1.85)/.6);
    if(!front) {
      c.globalAlpha=charge*fade*.75;
      ring(c,0,-1,45,9,'#8ce5dc',-t*.8,true);
      if(t>.55)for(let n=0;n<20;n++){const progress=clamp((t-.55)/.45);rect(c,dir*(17+n*5)*progress,2+Math.sin(n*.8)*2,4,1,n%2?'#c3f8ed':'#54babd');}
      return;
    }
    if(t<1.1){c.globalAlpha=charge;for(const [x,y] of [[-28,-70],[-7,-55],[18,-45],[40,-28]])star(c,-dir*x,y,'#e3fffa',2);}
    for(let n=0;n<3;n++) {
      const local=t-(.72+n*.18);if(local<0)continue;
      const grow=ease(local/.16), shrink=1-ease((local-.7)/.45), h=(27+n*9)*grow*shrink;
      const x=dir*(51+n*26), y=2, w=12+n*2;
      if(h<.5)continue;c.globalAlpha=Math.min(1,shrink*2);
      poly(c,[[x-w/2,y],[x-w*.7,y-h*.55],[x+dir*3,y-h],[x+w*.6,y-h*.38],[x+w/2,y]],'#235e6a');
      poly(c,[[x-w/2+2,y-1],[x-w*.45,y-h*.55],[x+dir*3,y-h+2],[x+1,y-1]],'#8fe0dc');
      poly(c,[[x+1,y-1],[x+dir*3,y-h+2],[x+w*.45,y-h*.38],[x+w*.4,y-1]],'#39a4b0');
      line(c,x+dir*3,y-h+3,x-2,y-6,'#e1fff4');
      if(local<.3)star(c,x+dir*3,y-h,'#e5fffa',3);
      dust(c,x,3,local/.6,.6);
      for(let k=0;k<4;k++){rect(c,x+Math.sin(k*3)*local*18,-local*25+local*local*25-k*2,2,2,'#b6f3ec');}
    }
  }
  function draw(c,key,p,time,opts,front) {
    if(!['guard','strike','crystal'].includes(p.action))return;
    c.save();c.translate(160+p.x,149+p.y);const scale=opts.atlas ? .4 : 1;c.scale(scale,scale);
    if(p.action==='guard') (key==='king'?kingGuard:beastGuard)(c,p,p.elapsed,front);
    if(p.action==='strike')strike(c,p,p.elapsed,front);
    if(p.action==='crystal')crystal(c,p,p.elapsed,front);
    c.restore();
  }
  function camera(p) {
    if(p.action!=='strike')return {x:0,y:0};
    const t=p.elapsed-.88, strength=t>=0?Math.max(0,1-t/.30):0;
    return {x:Math.round(Math.sin(t*87)*2*strength),y:Math.round(Math.cos(t*97)*3*strength)};
  }
  window.CaveSkills={draw,camera};
})();
