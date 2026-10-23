/* The dragon casts through its throat and constellation wings, not a melee lunge. */
(() => {
  const {ease,clamp,dot,line,poly}=window.RuinsPixels;
  const nodes=[[-42,-62],[-32,-80],[-25,-49],[35,-77],[45,-53]];
  function stars(c,p,front){
    const t=p.elapsed,a=ease(t/.8)*(1-ease((t-3.2)/.55));
    if(front){c.save();c.globalAlpha*=a;window.RiftEffects.glint(c,11,-55,5,'#fff0c6');c.restore();return;}
    c.save();c.globalAlpha*=a;
    for(const pair of [[0,1],[1,2],[0,2],[3,4]])line(c,...nodes[pair[0]],...nodes[pair[1]],'#a6a5ef',1);
    for(let i=0;i<nodes.length;i++){const [x,y]=nodes[i];window.RiftEffects.glint(c,x,y,3+Math.sin(t*5+i)*1.3,'#e1d9ff');}c.restore();
  }
  function breath(c,p,front){
    stars(c,p,front);if(!front)return;
    const t=p.elapsed,mouth=[23,-78],g=ease(t/.8)*(1-ease((t-.9)/.3));
    if(g>0){c.save();c.globalAlpha*=g;for(let i=0;i<13;i++){const a=i*2.4+t*2,r=(1-g)*25+6;dot(c,mouth[0]+Math.cos(a)*r,mouth[1]+Math.sin(a)*r*.6,i%3?'#9e87df':'#e0d9ff',1);}window.RiftEffects.glint(c,...mouth,4+g*4);c.restore();}
    const strength=ease((t-.85)/.3)*(1-ease((t-2.55)/.6));if(!strength)return;
    c.save();c.globalAlpha*=strength;const length=99*ease((t-.85)/.45);
    // Ragged outer star-flame and a narrow hot core; the mouth remains legible.
    for(let band=0;band<3;band++){
      const upper=[],lower=[],width=[21,12,1.8][band];
      for(let i=0;i<=30;i++){const q=i/30,x=mouth[0]+q*length,y=mouth[1]+q*25,w=(1+q*width)*(1-.25*ease((q-.8)/.2)),noise=Math.sin(i*1.7-t*17)*q*(5-band*1.5);upper.push([x,y-w+noise]);lower.unshift([x,y+w+noise]);}
      poly(c,[...upper,...lower],['#352445','#9470ce','#efe8ff'][band]);
    }
    for(let i=0;i<20;i++){const q=(t*1.3+i/20)%1;dot(c,mouth[0]+q*length,mouth[1]+q*25+Math.sin(i*2.1+t*4)*q*15,i%3?'#ad94e8':'#e6e1ff',i%5?1:2);}
    c.restore();
  }
  function wings(c,p,front){
    stars(c,p,front);const t=p.elapsed;if(!front)return;
    for(let i=0;i<nodes.length;i++){
      const age=t-1.05-i*.22;if(age<0||age>1.9)continue;const [sx,sy]=nodes[i],q=clamp(age/1.1),tx=75+(i%3)*15,ty=-29-(i%2)*14;
      const at=v=>{const u=ease(v);return [sx+(tx-sx)*u,sy+(ty-sy)*u-Math.sin(v*Math.PI)*(35+i%2*9)];};
      if(q<1){for(let j=14;j>=1;j--){const a=at(Math.max(0,q-j*.03)),b=at(Math.max(0,q-(j-1)*.03));c.save();c.globalAlpha*=1-j/16;line(c,...a,...b,j<4?'#d4c8f4':'#7b6aba',j<4?2:1);c.restore();}const [x,y]=at(q);window.RiftEffects.glint(c,x,y,5,'#fff0cf');}
      else{const hit=(age-1.1)/.8;c.save();c.globalAlpha*=1-ease(hit);for(let j=0;j<6;j++){const a=j*Math.PI/3,r=4+hit*22;line(c,tx+Math.cos(a)*r,ty+Math.sin(a)*r,tx+Math.cos(a)*(r+6),ty+Math.sin(a)*(r+6),j%2?'#bc9fe8':'#eee2c1',1);}window.RiftEffects.slit(c,tx,ty,16*(1-hit),3*(1-hit),.4);c.restore();}
    }
  }
  window.RiftBossEffects={draw(c,p,front){if(p.action==='eclipse_breath')breath(c,p,front);else wings(c,p,front);}};
})();
