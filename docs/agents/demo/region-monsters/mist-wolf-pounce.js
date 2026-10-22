/* Candidate skill, preview only: four articulated legs drive a low hunting leap.
   Mist is staging, not an invisibility/evasion buff; no catalogue or combat writes. */
(() => {
  const data=window.MeadowSpriteData.mist_wolf;if(!data)return;
  const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
  const masks=[[[20,84],[38,76],[50,82],[43,98],[36,116],[17,116]],[[50,85],[64,84],[68,95],[76,110],[58,112]],[[68,78],[81,79],[85,99],[94,114],[92,120],[70,120]],[[94,77],[109,76],[112,97],[124,108],[125,115],[108,116],[100,101]]];
  const joints=[[37,83],[58,87],[76,82],[102,81]];
  const inside=(x,y,pts)=>{let yes=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [a,b]=pts[i],[u,v]=pts[j];if((b>y)!==(v>y)&&x<(u-a)*(y-b)/(v-b)+a)yes=!yes;}return yes;};
  const palette=[0,...data.palette.map(h=>{const n=parseInt(h.slice(1),16);return (255<<24)|((n&255)<<16)|(n&65280)|(n>>>16);})];
  const raw=Uint8Array.from(atob(data.pixels),c=>c.charCodeAt(0));
  const layers=Array.from({length:5},()=>{const canvas=Object.assign(document.createElement('canvas'),{width:128,height:128}),ctx=canvas.getContext('2d'),im=ctx.createImageData(128,128);return {canvas,ctx,im,pixels:new Uint32Array(im.data.buffer)};});
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const part=masks.findIndex(m=>inside(x,y,m)),i=y*128+x;layers[part+1].pixels[i]=palette[raw[i]];
    // Keep an overlapping strip of original fur at each shoulder/hip seam.
    if(part>=0&&y<joints[part][1]+4)layers[0].pixels[i]=palette[raw[i]];
  }
  for(const l of layers)l.ctx.putImageData(l.im,0,0);
  function sample(p,t){
    const crouch=ease(t/.5)*(1-ease((t-.55)/.22));
    const launch=ease((t-.55)/.43),land=ease((t-1.08)/.32),back=ease((t-1.48)/.7);
    const flight=Math.sin(clamp((t-.55)/.65)*Math.PI),reach=ease((t-.6)/.28)*(1-ease((t-1.08)/.26));
    const recoil=Math.sin(clamp((t-1.4)/.82)*Math.PI);
    Object.assign(p,{wolfPounce:true,x:p.facing*(-7*crouch+48*launch*(1-back)),y:8*crouch-24*flight-7*recoil,
      crouch,reach,land,back,sx:1,sy:1,walk:0,swing:0,charge:0,tilt:0,
      lean:.08*crouch+.13*reach-.06*recoil,legScale:1-.24*crouch,
      frontLeg:.48*crouch-1.08*reach+.16*recoil,rearLeg:-.5*crouch+.5*reach-.45*recoil,
      bite:Math.sin(clamp((t-.86)/.3)*Math.PI),conceal:.2*crouch});
    return p;
  }
  const dot=(c,x,y,color,s=2)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),s,s);};
  function line(c,x,y,u,v,color,s=1){const n=Math.max(1,Math.abs(u-x),Math.abs(v-y));for(let i=0;i<=n;i++)dot(c,x+(u-x)*i/n,y+(v-y)*i/n,color,s);}
  const scaleFor=opts=>(opts.atlas?.4:1)*window.MeadowArt.monsterScale('mist_wolf');
  function actor(c,p,time,opts,alpha=1){
    const scale=scaleFor(opts);c.save();c.imageSmoothingEnabled=false;c.globalAlpha*=alpha*(1-p.conceal);
    c.translate(160+p.x,window.RegionPreview.floor+p.y);c.scale(p.facing*scale,scale);
    c.translate(0,-38);c.rotate(p.lean);c.translate(0,38);
    function leg(i){const [x,y]=joints[i];c.save();c.translate(x-64,y-118);c.rotate(i<2?p.rearLeg+(i===1?.65*p.reach:0):p.frontLeg+(i===3?.13*p.reach:0));c.scale(1,p.legScale);c.drawImage(layers[i+1].canvas,-x,-y);c.restore();}
    leg(1);leg(3);c.drawImage(layers[0].canvas,-64,-118);leg(0);leg(2);
    if(p.bite>.15){
      const opening=2+Math.round(p.bite*3);
      line(c,36,-65,46,-63,'#242639',opening);
      line(c,37,-65,45,-64,'#edf2f2',1);
      dot(c,39,-64,'#faf6e3',2);dot(c,44,-63,'#faf6e3',2);
      line(c,38,-65+opening,46,-64+opening,'#9caabc',1);
    }
    // The forward paw opens into three short claws during the catch, at its actual joint.
    if(p.reach>.4){const [x,y]=joints[2];c.save();c.translate(x-64,y-118);c.rotate(p.frontLeg);for(let i=0;i<3;i++)line(c,2+i*3,32,3+i*3,37,'#e9f7ed',1);c.restore();}
    c.restore();
  }
  function puff(c,x,y,r,color){c.fillStyle=color;for(let row=-r;row<=r;row+=2){const half=Math.round(Math.sqrt(Math.max(0,r*r-row*row)));c.fillRect(Math.round(x-half),Math.round(y+row),half*2,2);}}
  function effects(c,p,time,opts,front){
    const t=p.elapsed,s=scaleFor(opts),floor=window.RegionPreview.floor;
    c.save();
    if(!front){
      const mist=ease(t/.35)*(1-ease((t-.85)/.55));c.globalAlpha*=mist*.26;
      for(let i=0;i<9;i++){const drift=t*(i%2?8:-6);puff(c,160+(i-4)*10*s+drift,floor-7*s-Math.sin(i*2+t*3)*5*s,(8+i%3*3)*s,i%2?'#b3dce0':'#82b3c5');}
      c.globalAlpha=1;
      if(t>.65&&t<1.06){
        for(let i=2;i>0;i--){const prev=sample({...p},Math.max(0,t-i*.055));actor(c,prev,time,opts,.1*(3-i));}
      }
      // Scuffed leaves accompany the rear-foot push-off; no ground shockwave.
      if(t>.55&&t<.92){const u=(t-.55)/.37;c.globalAlpha=(1-u)*.6;for(let i=0;i<6;i++)dot(c,160-p.facing*(18+u*(15+i*4))*s,floor-Math.sin(u*Math.PI)*(4+i%3*3)*s,'#c9d9b1',2);}
    }else{
      const age=t-.98;
      if(age>=0&&age<.36){
        c.globalAlpha*=1-ease(age/.36);const grow=ease(age/.1);
        // Three parallel claw cuts accompany one catch, not a heavy impact or three hits.
        for(let i=0;i<3;i++){
          const x=160+p.facing*(86+i*5)*s,y=floor-(47+i*2)*s;
          line(c,x,y,x-p.facing*10*grow*s,y+27*grow*s,'#83c5d7',3*s);
          line(c,x,y,x-p.facing*10*grow*s,y+27*grow*s,'#e5fbf4',Math.max(1,s));
        }
        for(let i=0;i<6;i++)dot(c,160+p.facing*(85+Math.sin(i*4)*age*50)*s,floor-(26+Math.cos(i*3)*age*44)*s,'#b7e7e1',2);
      }
      if(t>1.2&&t<1.6){c.globalAlpha*=.2*(1-(t-1.2)/.4);for(let i=0;i<4;i++)puff(c,160+p.x+(i-2)*13*s,floor-2*s,6*s,'#b9d4cd');}
    }
    c.restore();
  }
  window.MistWolfPounce={sample,actor,effects};
})();
