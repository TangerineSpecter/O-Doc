/* Replay of MonsterTemplate's double orb / four fire columns / six soul crystals.
 * Stateful particles are sampled analytically so pause, replay and direction work. */
(() => {
  const {clamp,ease,line,ring}=window.RuinsPixels,kernel=window.AshLordTemplatePixels;
  function lightning(c,x,y,u,v,t){let a=x,b=y;for(let i=1;i<=9;i++){const q=i/9,xx=x+(u-x)*q,yy=y+(v-y)*q+(i===9?0:Math.sin(i*9+Math.floor(t*18))*5);line(c,a,b,xx,yy,'#a542ff',3);line(c,a,b,xx,yy,'#c4faff',1);a=xx;b=yy;}}
  function burst(c,x,y,age,soul=false){if(age<0||age>.45)return;c.save();c.globalAlpha*=1-ease(age/.45);for(let i=0;i<8;i++){const a=i*Math.PI/4,r=(10+age*55)*(i%2?.62:1);line(c,x,y,x+Math.cos(a)*r,y+Math.sin(a)*r,soul?'#6ef2ff':'#ffbd24',2);line(c,x,y,x+Math.cos(a)*r*.75,y+Math.sin(a)*r*.75,'#fff9d2',1);}c.restore();}
  function draw(c,p,time,opts,front){
    const t=p.elapsed,s=opts.atlas?.4:1,floor=window.RegionPreview.floor;
    c.save();c.translate(160,floor);c.scale(p.facing*s,s);c.translate(-160,-floor);
    const staffX=212+p.staff*.16,staffY=floor+p.y-104-p.staff*.65;
    if(front&&t<.6){const r=14*p.heat;ring(c,staffX,staffY,r,r*.75,p.soul?'#6ef2ff':'#ffbd24');for(let i=0;i<4;i++){const a=time*6+i*Math.PI*.5;line(c,staffX+Math.cos(a)*r,staffY+Math.sin(a)*r*.75,staffX-Math.cos(a)*r,staffY-Math.sin(a)*r*.75,p.soul?'#fff':'#fff9d2');}}
    if(p.action==='burn'){
      // The four positions, stagger and turbulence are retained from the original demo.
      if(!front)for(const [x,h,w,delay,seed] of [[54,105,17,0,1.1],[100,92,14,.06,2.7],[220,92,14,.06,4.3],[266,105,17,0,5.9]]){
        const age=t-.44;if(age>=0&&age<1.05)kernel.column(c,{x,baseY:floor+2,maxH:h,w,delay,maxLife:1.05,seed},age,time);
      }
      if(front&&t>.44)for(let i=0;i<4;i++)window.EmberEffects.sparks(c,64+i*64,floor,t-.44,1.6);
    }else if(p.action==='magic_strike'&&front){
      // Same six orbiting crystals, staggered launches and alternating curved paths.
      for(let i=0;i<6;i++){
        const launch=.52+i*.085,age=t-launch,angle=i*Math.PI/3+Math.min(t,launch)*7.2;
        const sx=160+Math.cos(angle)*62,sy=floor+p.y-82+Math.sin(angle)*12;
        const q=clamp(age*3.2),tx=264+i%2*10,ty=floor-47+i%3*10;
        const point=z=>[sx+(tx-sx)*z,sy+(ty-sy)*z+Math.sin(z*Math.PI)*32*(i%2?-1:1)];
        const [x,y]=age<0?[sx,sy]:point(q);
        if(age<0){if(i%2===Math.floor(t*8)%2)lightning(c,staffX,staffY,x,y,t);kernel.crystal(c,{x,y});}
        else if(q<1){for(let j=7;j>0;j--){const a=point(Math.max(0,q-j*.025)),b=point(Math.max(0,q-(j-1)*.025));line(c,...a,...b,j>4?'#a542ff':'#6ef2ff',1);}kernel.crystal(c,{x,y});}
        else{burst(c,tx,ty,age-.3125,true);if(age<.39)lightning(c,staffX,staffY,tx,ty,t);}
      }
    }else if(p.action==='attack'&&front){
      for(const [launch,tx,ty,r] of [[.26,256,floor-41,9],[.46,272,floor-27,11]]){
        const age=t-launch,q=clamp(age/.35),x=210+(tx-210)*q,y=floor-107+(ty-(floor-107))*q;
        if(age>=0&&q<1){window.EmberEffects.sparks(c,x-7,y,.13,.35);kernel.orb(c,{x,y,r},time);}
        else if(q===1)burst(c,tx,ty,age-.35);
      }
    }
    c.restore();
  }
  window.AshLordTemplate={draw};
})();
