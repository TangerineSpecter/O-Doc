/* Three distinct fire silhouettes: mouth jet, dorsal lava volley, open-kiln ray. */
(() => {
  const {ease,dot,line,poly,blob,ring}=window.RuinsPixels;
  const colors=['#541923','#a52b1f','#ec4f18','#ff9d25','#ffe59a'];
  function sparks(c,x,y,t,force=1){if(t<0||t>.65)return;c.save();c.globalAlpha*=1-ease((t-.25)/.4);for(let i=0;i<18;i++){const a=i*2.4,v=18+i%5*12;dot(c,x+Math.cos(a)*v*t*force,y+Math.sin(a)*v*t*force+40*t*t,colors[2+i%3],1+i%2);}c.restore();}
  function flame(c,x,y,h,w,t){
    if(h<1)return;
    for(let row=0;row<h;row++){const u=row/h,sw=Math.sin(row*.28-t*15)*u*4,width=w*(1-u)+Math.sin(row*.8+t*21)*1.3;for(let dx=-width;dx<width;dx++){const heat=1-Math.abs(dx)/Math.max(1,width)-u*.3;if(heat>.1)dot(c,x+dx+sw,y-row,colors[Math.min(4,1+Math.floor(heat*4))],1);}}
  }
  function draw(c,key,p,time,opts,front){
    const t=p.elapsed,s=(opts.atlas?.4:1)*window.MeadowArt.monsterScale(key),floor=window.RegionPreview.floor;
    c.save();c.translate(160+p.x,floor+p.y);c.scale(p.facing*s,s);
    if(key==='ash_demon'){
      const mouthX=19+p.fire*3,mouthY=-47-p.fire*2;
      if(front){
        if(t<.8)flame(c,5,-91,12+15*p.gather,3+p.gather*2,time);
        if(t>.7&&t<2.35){
          const length=87*ease((t-.7)/.28)*(1-ease((t-1.95)/.4));
          // A continuous exhalation, with a narrow mouth and ragged expanding edges.
          for(let x=0;x<length;x++){
            const q=x/87,mid=mouthY+q*13+Math.sin(x*.13-t*19)*q*3;
            const radius=(2+q*15)*p.fire*ease((length-x)/12);
            for(let y=-radius;y<=radius;y++){
              const heat=1-Math.abs(y)/Math.max(1,radius)+Math.sin(x*.3+y*.5-t*26)*.2;
              if(heat>.12)dot(c,mouthX+x,mid+y,colors[Math.min(4,1+Math.floor(heat*3))],1);
            }
          }
          for(let i=0;i<15;i++){const q=(t*1.8+i/15)%1;dot(c,mouthX+q*90,mouthY+q*13+Math.sin(i*2)*q*19,colors[2+i%3],1+i%2);}
        }
      }
    }else if(key==='lava_beast'){
      if(front){
        for(let i=0;i<3;i++){
          const launch=.78+i*.19,age=t-launch,origin=-24+i*17,oy=-83-i%2*11;
          if(t<launch&&t>.25)flame(c,origin,oy,Math.max(0,15*ease((t-.25)/.45)),3,time+i);
          if(age>=0&&age<.68){const q=age/.68,x=origin+(96-origin)*q,y=oy*(1-q)-Math.sin(q*Math.PI)*(45+i*5);
            for(let j=5;j>0;j--){const z=Math.max(0,q-j*.025);flame(c,origin+(96-origin)*z,oy*(1-z)-Math.sin(z*Math.PI)*(45+i*5),8-j,3,time+i);}
            poly(c,[[x-6,y-4],[x+2,y-7],[x+7,y],[x+3,y+6],[x-5,y+4]],'#421c21');line(c,x-3,y-3,x+3,y+3,'#ff891d',3);dot(c,x-1,y-3,'#ffe3a0',3);
          }
        }
      }
      if(front){
        for(let i=0;i<3;i++){
          const age=t-1.46-i*.19;if(age<0)continue;const x=87+i*8,y=2+i%2*3;
          c.save();c.globalAlpha*=1-ease((age-.5)/.6);
          blob(c,x,y,12+ease(age/.2)*11,4,'#692323');blob(c,x,y-1,10+ease(age/.2)*9,2,'#f47b22');
          for(let j=0;j<4;j++)flame(c,x-10+j*7,y,Math.max(0,18*(1-age)+Math.sin(t*13+j)*4),3,time+j);
          sparks(c,x,y,age,1.2);c.restore();
        }
      }
    }else if(key==='furnace_guard'){
      if(!front){
        for(const x of [-1,14]){flame(c,x,-108,10+15*p.open,3,time+x);for(let i=0;i<6;i++){const q=(t*.7+i/6)%1;c.save();c.globalAlpha*=.35*(1-q)*p.open;blob(c,x-q*8,-110-q*23,3+q*5,3+q*4,'#3e3034');c.restore();}}
      }else{
        // Two steel shutters separate to expose the white-hot furnace chamber.
        const open=p.open;if(open>.01){
          poly(c,[[-9,-77],[12,-78],[17,-67],[13,-53],[-9,-54],[-13,-66]],'#271a22');
          blob(c,2,-65,9*open,10,'#e53b13');blob(c,3,-65,5*open,7,'#ffc24b');blob(c,3,-66,3*open,4,'#fff2bb');
          for(const side of [-1,1]){const x=3+side*(3+open*11);poly(c,[[x-3,-79],[x+3,-78],[x+4,-52],[x-3,-53]],'#59433c');line(c,x-side*2,-76,x-side*2,-55,'#c58d58',1);}
        }
        if(t>.78&&t<2.25){
          const len=109*ease((t-.78)/.17),width=(7+Math.sin(t*50))*p.fire;
          // Concentric pressure fronts and a continuous beam, emitted from the chest.
          poly(c,[[3,-65-width],[len,-65-width*.7],[len+7,-65],[len,-65+width*.7],[3,-65+width]],'#a52b1f');
          poly(c,[[3,-65-width*.65],[len,-65-width*.42],[len,-65+width*.42],[3,-65+width*.65]],'#ff8b1d');
          line(c,3,-65,len,-65,'#fff4c4',Math.max(1,width*.55));
          for(let i=0;i<4;i++){const q=(t*2+i/4)%1;ring(c,12+q*90,-65,3,6+q*9,'#ffbd48');}
          sparks(c,105,-65,(t-.9)%.45,1.3);
        }
      }
    }
    c.restore();
  }
  window.EmberEffects={draw,sparks,flame};
})();
