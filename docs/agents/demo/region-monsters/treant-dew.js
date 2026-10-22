/* Fruit-led restorative ritual. Violet fruit dew falls inward into the emerald heart.
 * This is a healing candidate, not concealment, and never modifies demo or real HP. */
(() => {
  const {clamp,ease,dot,line,poly,blob}=window.RuinsPixels;
  const fruits=[[46,21],[49,25],[35,29],[26,32],[28,39],[95,26],[94,33],[107,40],[111,36],[100,45]];
  function drop(c,x,y,r){
    poly(c,[[x,y-r*1.8],[x+r*.7,y-r*.2],[x+r*.8,y+r*.5],[x,y+r],[x-r*.7,y+r*.4],[x-r*.6,y-r*.2]],'#488f79');
    poly(c,[[x,y-r*1.45],[x+r*.45,y],[x,y+r*.65],[x-r*.4,y]],'#b6edb1');dot(c,x-.4,y-.4,'#f6ffd7',Math.max(1,r*.35));
  }
  function petal(c,x,y,r,a,color){const u=Math.cos(a)*r,v=Math.sin(a)*r;poly(c,[[x,y],[x+u*.3-v*.45,y+v*.3+u*.45],[x+u,y+v],[x+u*.3+v*.45,y+v*.3-u*.45]],color);}
  function draw(c,p,time,opts,front){
    const t=p.elapsed,s=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('mist_treant');
    const gather=ease(t/.7),fade=1-ease((t-3.05)/.6);
    c.save();c.translate(160,window.RegionPreview.floor);c.scale(p.facing*s,s*p.sy);c.translate(-64,-118);c.globalAlpha*=fade;
    if(!front){
      // Low, soft shafts filter through the canopy; they do not hide the tree's body.
      if(t>.3){c.save();c.globalAlpha*=.09*gather;for(const x of [32,54,91,108])poly(c,[[x-3,25],[x+3,25],[x+9,113],[x-9,113]],'#e7f1c4');c.restore();}
      c.restore();return;
    }
    for(let i=0;i<fruits.length;i++){
      const [x,y]=fruits[i],start=.65+i*.085,age=t-start,pulse=ease((t-i*.04)/.45)*(1-ease((age-.15)/.55));
      if(pulse>0){c.save();c.globalAlpha*=pulse*.6;blob(c,x,y,2,3,'#c09dce');line(c,x-2,y-1,x-1,y-3,'#eedcc4',1);dot(c,x+2,y+1,'#f5eed2',1);c.restore();}
      if(age>=0&&age<1.05){
        const q=clamp(age/1.05),endX=73,endY=65;
        // First the drop hangs below its fruit, then it bends toward the heart.
        const xx=x+(endX-x)*q*q,yy=y+(endY-y)*q;
        for(let j=1;j<=3;j++){const z=Math.max(0,q-j*.045);c.save();c.globalAlpha*=.4-j*.08;dot(c,x+(endX-x)*z*z,y+(endY-y)*z,'#d4f4bb',1);c.restore();}
        drop(c,xx,yy,1.6+Math.sin(q*Math.PI)*.7);
      }
    }
    const bloom=ease((t-1.35)/.55)*(1-ease((t-2.8)/.5));
    if(bloom>0){
      c.save();c.globalAlpha*=bloom;
      // Heart-shaped leaf petals open around the existing rune instead of repainting the trunk.
      for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3;petal(c,73,65,11+Math.sin(t*5)*1.2,a,i%2?'#a9d68799':'#e0f3b099');}
      line(c,73,56,79,64,'#e5ffb9',1);line(c,79,64,73,73,'#c9f49d',1);line(c,73,73,67,64,'#9dce73',1);line(c,67,64,73,56,'#e5ffb9',1);
      // Two brief recovery glints provide an explicit healing cue, without floating numbers.
      for(let i=0;i<2;i++){const q=clamp((t-1.6-i*.38)/.85);if(q>0&&q<1){c.save();c.globalAlpha*=Math.sin(q*Math.PI);const x=73+(i?17:-17),y=75-q*20;line(c,x-2,y,x+2,y,'#dfffbd',1);line(c,x,y-2,x,y+2,'#dfffbd',1);c.restore();}}
      c.restore();
    }
    if(t>.8)for(let i=0;i<12;i++){const q=clamp((t-.8-i*.06)/1.8);if(q<=0||q>=1)continue;c.save();c.globalAlpha*=Math.sin(q*Math.PI)*.6;petal(c,20+i*8+Math.sin(q*5+i)*3,31+q*71,2.2,i+q*4,i%2?'#b6d9a1':'#e4d8bf');c.restore();}
    c.restore();
  }
  window.TreantDew={draw};
})();
