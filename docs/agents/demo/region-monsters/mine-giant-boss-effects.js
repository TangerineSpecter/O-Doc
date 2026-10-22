/* Boss environmental attacks. All positions are sampled from elapsed time:
 * interruption, replay and pause cannot leave persistent rocks or emitters behind. */
(() => {
  const {clamp,ease,dot,line,poly}=window.RuinsPixels;
  const gold=['#673720','#b36b25','#eda939','#ffe293','#fff3c0'];
  function rock(c,x,y,r,angle=0,crystal=false){
    c.save();c.translate(Math.round(x),Math.round(y));c.rotate(angle);
    const pts=[[-r*.92,-r*.37],[-r*.43,-r*.94],[r*.36,-r],[r*.94,-r*.3],[r*.74,r*.55],[r*.05,r*.93],[-r*.8,r*.6]];
    poly(c,pts,crystal?'#8a4d25':'#343436');
    poly(c,[[0,-r*.82],[-r*.78,-r*.32],[-r*.67,r*.4],[0,r*.63],[r*.15,-r*.2]],crystal?'#df9f3e':'#72695b');
    poly(c,[[0,-r*.82],[r*.3,-r*.88],[r*.8,-r*.26],[r*.15,-r*.2]],crystal?'#ffe6a3':'#b2a187');
    poly(c,[[r*.15,-r*.2],[r*.8,-r*.26],[r*.62,r*.45],[0,r*.63]],crystal?'#af6427':'#48443f');
    line(c,-r*.67,-r*.25,0,-r*.66,crystal?'#fff3be':'#d1b992',1);
    if(!crystal&&r>8){
      // Interlocking strata, chipped rims and dark joints match the actor's rock armour.
      const plates=[[-.42,-.42,.29],[-.04,-.57,.28],[.36,-.48,.25],[-.52,.02,.3],[-.12,-.06,.36],[.4,-.04,.28],[-.35,.42,.24],[.1,.44,.28],[.5,.3,.19]];
      for(let i=0;i<plates.length;i++){
        const [u,v,z]=plates[i],x=u*r,y=v*r,w=z*r;
        poly(c,[[x-w,y-w*.45],[x-w*.25,y-w],[x+w*.8,y-w*.65],[x+w,y+w*.4],[x-w*.1,y+w*.8],[x-w*.8,y+w*.45]],'#3b3833');
        poly(c,[[x-w*.8,y-w*.35],[x-w*.2,y-w*.8],[x+w*.6,y-w*.5],[x+w*.72,y+w*.2],[x-w*.1,y+w*.58],[x-w*.63,y+w*.3]],['#867b67','#a29377','#6a6256'][i%3]);
        line(c,x-w*.7,y-w*.32,x-w*.15,y-w*.75,'#c7b596',1);
        line(c,x-w*.15,y-w*.75,x+w*.55,y-w*.48,'#ac9c80',1);
        if(i%2===0)line(c,x-w*.45,y,x+w*.22,y-w*.1,'#635b4e',1);
      }
    }
    // An embedded amber seam ties fallen ore to the giant's crystal crown.
    line(c,-r*.15,-r*.6,r*.15,-r*.12,'#c18132',Math.max(1,r*.1));
    line(c,r*.15,-r*.12,-r*.06,r*.4,'#e9b251',Math.max(1,r*.07));
    c.restore();
  }
  function crystal(c,x,y,r){
    poly(c,[[x,y-r*1.5],[x+r*.6,y-r*.4],[x+r*.4,y+r*.8],[x,y+r],[x-r*.55,y+r*.45],[x-r*.65,y-r*.4]],'#7b4a2d');
    poly(c,[[x,y-r*1.4],[x,y+r*.75],[x-r*.46,y+r*.3],[x-r*.5,y-r*.4]],'#f3bd5a');
    poly(c,[[x,y-r*1.4],[x+r*.48,y-r*.35],[x+r*.3,y+r*.6],[x,y+r*.75]],'#bd7a2c');
    line(c,x,y-r*1.4,x,y+r*.65,'#fff0b8',1);
  }
  function dust(c,x,y,age,power=1){
    if(age<0||age>1.2)return;
    c.save();c.globalAlpha*=1-ease((age-.35)/.85);
    for(let i=0;i<10;i++){
      const side=i%2?1:-1,speed=25+i*6,xx=x+side*speed*age*power,yy=y-2-Math.sin(clamp(age/.85)*Math.PI)*(4+i%3*3);
      c.save();c.globalAlpha*=.55;poly(c,[[xx-9,yy+2],[xx-11,yy-4],[xx-4,yy-9],[xx+4,yy-8],[xx+10,yy-2],[xx+8,yy+4]],i%2?'#a79779':'#736858');c.restore();
      const vy=35+i%4*17;rock(c,x+side*(20+i*4)*age,y-vy*age+53*age*age,1.5+i%3,age*3+i);
    }
    c.restore();
  }
  function crown(c,t,energy){
    c.save();c.globalAlpha*=energy;
    // Three short glints sit on the existing crown, not on a floating target marker.
    for(const [x,y,r] of [[-4,-112,7],[-15,-102,4],[9,-100,4]]){line(c,x-r,y,x+r,y,'#ffdc7f',1);line(c,x,y-r,x,y+r,'#fff1bc',1);dot(c,x-1,y-1,'#fff8d7',3);}
    for(let i=0;i<8;i++){const q=(t*.75+i/8)%1;dot(c,-9+Math.sin(i*2.1)*14*(1-q),-65-q*39,gold[2+i%3],1);}
    c.restore();
  }
  function resonance(c,p,t,front){
    const charge=ease(t/.8)*(1-ease((t-1.3)/.3)),field=ease(t/.6)*(1-ease((t-2.25)/.75));
    if(!front){
      // Rotating mineral constellation: a broad broken halo behind the body.
      c.save();c.globalAlpha*=field*.75;
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3+t*.7,rad=48+7*charge,x=-5+Math.cos(a)*rad,y=-59+Math.sin(a)*rad*.85;
        const next=a+Math.PI/3;
        line(c,x,y,-5+Math.cos(next)*rad,-59+Math.sin(next)*rad*.85,'#b98437',1);
        crystal(c,x,y,7+2*charge);
      }
      c.restore();
      for(let i=0;i<7;i++){
        const x=-55+i*17,lift=ease((t-.15-i*.035)/.75)*(1-ease((t-2.1)/.75));
        if(lift>0)rock(c,x,-4-lift*(18+i%3*8),3+i%3,t*.9+i);
      }
      return;
    }
    crown(c,t,field);
    // Chest pulse remains small enough that the face and arm spread stay legible.
    if(charge>0){c.save();c.globalAlpha*=charge;crystal(c,-8,-61,6+4*charge);c.restore();}
    for(let band=0;band<3;band++){
      const age=t-1.22-band*.23;if(age<0||age>.95)continue;
      const q=clamp(age/.95),radius=18+q*112;
      c.save();c.globalAlpha*=(1-ease((q-.56)/.44));
      // Broad faceted shock front with interior ribbons. No orb and no fist strike.
      for(let i=0;i<28;i++){
        const a=-.83+i/27*1.5,b=a+1.5/27;
        const edge=radius+Math.sin(i*1.7+band)*2;
        const point=(angle,r)=>[-7+Math.cos(angle)*r,-61+Math.sin(angle)*r*.69];
        poly(c,[point(a,edge),point(b,edge+1),point(b,edge-7),point(a,edge-7)],gold[1+band%2]);
        line(c,...point(a,edge),...point(b,edge+1),'#ffe39a',2);
        if(i%3!==0)line(c,...point(a,edge-10),...point(b,edge-10),'#d99c40',1);
      }
      for(let i=0;i<5;i++){const a=-.65+i*.27;crystal(c,-7+Math.cos(a)*(radius-7),-61+Math.sin(a)*radius*.69,2.5);}
      c.restore();
    }
    if(t>1.35&&t<2.9)for(let i=0;i<12;i++){const age=t-1.35,q=clamp(age/1.5);c.save();c.globalAlpha*=1-q;dot(c,16+q*(42+i%4*12),-65+Math.sin(i*2)*q*50,gold[i%4],1+i%2);c.restore();}
  }
  function collapse(c,p,t,front){
    const summon=ease(t/.7)*(1-ease((t-1.18)/.3));
    const blocks=[{x:81,r:27,delay:0},{x:111,r:15,delay:.17},{x:50,r:13,delay:.3}];
    if(!front){
      // A fracture in the visible ceiling establishes where the incoming mass originates.
      if(t<1.5){c.save();c.globalAlpha*=ease(t/.3)*(1-ease((t-1.15)/.35));let x=34,y=-118;
        for(let i=0;i<9;i++){const nx=x+11,ny=-118+(i%2?4:-2);line(c,x,y,nx,ny,'#27272c',4);line(c,x,y,nx,ny,'#c69a4a',1);if(i%2)line(c,nx,ny,nx-5,ny+8,'#a17c43',1);x=nx;y=ny;}c.restore();}
      for(let i=0;i<15;i++){
        const start=.35+i*.035,age=t-start;if(age<0||age>1.1)continue;
        c.save();c.globalAlpha*=1-ease((age-.65)/.45);rock(c,40+i*6,-112+95*age*age,1+i%3,i+age*4);c.restore();
      }
      return;
    }
    crown(c,t,summon);
    for(const {x,r,delay} of blocks){
      const start=1.05+delay,hit=start+.49,age=t-hit;
      if(t<start){
        const reveal=ease((t-.48-delay)/.36);if(reveal>0){c.save();c.globalAlpha*=reveal;rock(c,x,-109-r*(1-reveal),r*(.8+.2*reveal),.12*Math.sin(t*13),false);c.restore();}
      }else if(age<0){
        const q=clamp((t-start)/.49),y=-109+(109-r*.8)*q*q;
        c.save();c.globalAlpha*=.25;for(let j=1;j<=3;j++)line(c,x-r*.4+j*7,y-r-7,x-r*.4+j*7,y-r-19,'#dfc994',1);c.restore();
        rock(c,x,y,r,.12+(q*q)*.28);
      }else{
        c.save();c.globalAlpha*=1-ease((age-.52)/.8);
        // The slab fractures into three low chunks; no intact boulder hides the scene.
        for(let i=0;i<3;i++)rock(c,x+(i-1)*(r*.45+age*13),-3-Math.sin(clamp(age/.42)*Math.PI)*r*.4,r*(i===1?.36:.28),i+age*.5);
        if(age<.2)for(let i=0;i<9;i++){const a=Math.PI+i*Math.PI/8,rr=7+age*110;line(c,x,0,x+Math.cos(a)*rr,-Math.abs(Math.sin(a))*rr*.5,i%2?'#d2a65b':'#ffde94',1);}
        if(r>20&&age<.65){
          const spread=ease(age/.3);c.save();c.globalAlpha*=1-ease((age-.25)/.4);
          poly(c,[[x-24*spread,1],[x-9*spread,-5],[x+21*spread,-2],[x+28*spread,4],[x+4*spread,8],[x-19*spread,6]],'#3b342c');
          for(let i=0;i<9;i++){const side=i%2?1:-1,xx=x+side*(12+age*80),yy=4+(i%3-1)*4;line(c,xx,yy,xx+side*9,yy-2,i%2?'#d1b27a':'#807052',2);}
          c.restore();
        }
        dust(c,x,2,age,r/20);
        c.restore();
      }
    }
  }
  function draw(c,p,time,opts,front){
    const t=p.elapsed,scale=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('mine_giant');
    if(!front){c.save();c.fillStyle=p.action==='vault_collapse'?'#18151c':'#211b16';c.globalAlpha=.22*ease(t/.55)*(1-ease((t-2.3)/.65));c.fillRect(0,0,320,180);c.restore();}
    c.save();c.translate(160,window.RegionPreview.floor);c.scale(p.facing*scale,scale);
    if(p.action==='crystal_resonance')resonance(c,p,t,front);else collapse(c,p,t,front);
    c.restore();
  }
  function camera(p){
    let amplitude=0;
    const triggers=p.action==='vault_collapse'?[[1.54,4.2],[1.71,2.2],[1.84,1.6]]:[[1.22,1.7],[1.45,1.3],[1.68,1]];
    for(const [at,power]of triggers){const age=p.elapsed-at;if(age>=0&&age<.24)amplitude+=power*(1-age/.24)**2;}
    return {x:Math.sin(p.elapsed*93)*amplitude*.65,y:Math.cos(p.elapsed*106)*amplitude};
  }
  window.MineGiantBossEffects={draw,camera};
})();
