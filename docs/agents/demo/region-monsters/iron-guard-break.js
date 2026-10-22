/* Preview-only elite pickaxe strike: original weapon and forearm pivot at the elbow.
   No combat timings or damage are inferred from this local presentation clock. */
(() => {
  const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
  const impact=.98;
  const make=()=>Object.assign(document.createElement('canvas'),{width:128,height:128});
  const body=make(),arm=make();
  const data=window.MeadowSpriteData.iron_guard;
  if(!data)return; // The shared preview loader also serves the other four regions.
  const palette=[0,...data.palette.map(hex=>{const n=parseInt(hex.slice(1),16);return (255<<24)|((n&255)<<16)|(n&65280)|(n>>>16);})];
  const raw=Uint8Array.from(atob(data.pixels),c=>c.charCodeAt(0));
  const bodyCtx=body.getContext('2d'),armCtx=arm.getContext('2d');
  const bodyImage=bodyCtx.createImageData(128,128),armImage=armCtx.createImageData(128,128);
  const b=new Uint32Array(bodyImage.data.buffer),a=new Uint32Array(armImage.data.buffer);
  // Follow the empty space beside the shoulder, then the forearm seam; never cut the torso.
  const outline=[[80,15],[117,14],[128,30],[128,72],[106,73],[106,86],[95,91],[85,82],[82,68],[86,61],[92,59],[95,48],[97,36],[80,28]];
  function inside(x,y){let yes=false;for(let i=0,j=outline.length-1;i<outline.length;j=i++){const [u,v]=outline[i],[q,r]=outline[j];if((v>y)!==(r>y)&&x<(q-u)*(y-v)/(r-v)+u)yes=!yes;}return yes;}
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=y*128+x;(inside(x,y)?a:b)[i]=palette[raw[i]];}
  bodyCtx.putImageData(bodyImage,0,0);armCtx.putImageData(armImage,0,0);
  function sample(p,t){
    const raise=ease(t/.66),release=ease((t-.81)/.17),recover=ease((t-1.28)/.75);
    p.ironBreak=true;p.charge=raise*(1-release);p.walk=0;p.swing=0;p.sx=p.sy=1;
    p.axeLift=22*raise*(1-release);
    p.axeAngle=(-.72*raise*(1-release)+1.31*release)*(1-recover);
    p.lean=(-.06*raise*(1-release)+.12*release)*(1-recover);
    p.x=(-3*raise*(1-release)+9*release)*(1-recover)*p.facing;
    p.y=(2*raise*(1-release)+3*release)*(1-recover);
    p.tilt=0;return p;
  }
  function drawActor(c,p,time,opts){
    const scale=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('iron_guard');
    c.save();c.imageSmoothingEnabled=false;c.translate(160+p.x,window.RegionPreview.floor+p.y);c.scale(p.facing*scale,scale);
    c.transform(1,0,-p.lean,1,0,0);c.drawImage(body,-64,-118);
    // A small overlapping elbow cap keeps the rotating forearm attached to the upper arm.
    const elbowY=-53-p.axeLift;
    line(c,14,-69,20,elbowY-2,'#39332f',9);
    line(c,15,-68,21,elbowY-1,'#746a5e',6);
    line(c,15,-68,21,elbowY-1,'#ac9b7e',2);
    for(const q of [.3,.64]){
      const xx=16+6*q,yy=-68+(elbowY+68)*q;
      line(c,xx-2,yy,xx+4,yy+1,'#51473c',2);
      dot(c,xx+3,yy-2,'#c6ad79',1);
    }
    c.fillStyle='#51463b';c.fillRect(18,elbowY-4,9,9);
    c.translate(22,-53-p.axeLift);c.rotate(p.axeAngle);c.drawImage(arm,-86,-65);c.restore();
  }
  const dot=(c,x,y,color,size=2)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),size,size);};
  const line=(c,x,y,u,v,color,size=2)=>{const n=Math.max(1,Math.abs(u-x),Math.abs(v-y));for(let i=0;i<=n;i++)dot(c,x+(u-x)*i/n,y+(v-y)*i/n,color,size);};
  function ring(c,x,y,rx,ry,color){for(let i=0;i<110;i++){const a=i/110*Math.PI*2;dot(c,x+Math.cos(a)*rx,y+Math.sin(a)*ry,color,1);}}
  function plate(c,x,y,r,rotation,color){
    const pts=[[-r,-r*.7],[r*.7,-r],[r,r*.4],[-r*.5,r]];
    const points=pts.map(([u,v])=>[x+u*Math.cos(rotation)-v*Math.sin(rotation),y+u*Math.sin(rotation)+v*Math.cos(rotation)]);
    c.fillStyle=color;c.beginPath();points.forEach(([u,v],i)=>i?c.lineTo(Math.round(u),Math.round(v)):c.moveTo(Math.round(u),Math.round(v)));c.closePath();c.fill();
    line(c,...points[0],...points[1],'#f4d595',1);
  }
  function drawEffect(c,p,time,opts,front){
    const t=p.elapsed,age=t-impact,scale=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('iron_guard');
    const floor=window.RegionPreview.floor,tx=160+p.facing*80*scale,ty=floor-31*scale;
    c.save();
    if(!front){
      // Concentrated anticipation dimming, fading immediately after contact.
      const dim=clamp((t-.25)/.4)*(1-clamp(age/.2));
      c.fillStyle='#1d1b21';c.globalAlpha*=.16*dim;c.fillRect(0,0,320,180);c.globalAlpha=1;
      if(age>=0&&age<.8){
        const u=age/.8;c.globalAlpha=1-u;ring(c,tx,floor,(10+u*64)*scale,(3+u*12)*scale,'#e2b76f');
        for(let i=0;i<5;i++){const dir=i/4*Math.PI;let x=tx,y=floor;
          for(let j=0;j<4;j++){const nx=tx+Math.cos(dir)*(j+1)*12*scale*clamp(age*5),ny=floor+Math.sin(dir)*j*2*scale+(j%2?2:-2);line(c,x,y,nx,ny,'#46392e',2);x=nx;y=ny;}
        }
      }
      c.restore();return;
    }
    if(t<.81){
      const charge=clamp(t/.7),x=160+p.facing*14*scale,y=floor-95*scale;
      c.globalAlpha=charge*.8;
      for(let i=0;i<8;i++){const a=i/8*Math.PI*2+t*2,r=(22-14*charge)*scale;dot(c,x+Math.cos(a)*r,y+Math.sin(a)*r,'#e9bd65',2);}
      line(c,160-7*scale,floor-68*scale,160+7*scale,floor-68*scale,'#ffd584',2);
    }
    // A broad tapered overhead crescent follows the weapon, rather than surrounding the body.
    if(t>.81&&t<1.2){
      const phase=clamp((t-.81)/.17),fade=1-clamp((t-1.02)/.18);
      c.save();c.globalAlpha=fade;c.translate(160+p.x, floor+p.y);c.scale(p.facing*scale,scale);
      const end=-1.74+phase*2.04;
      for(let i=0;i<56;i++){
        const q=i/55,angle=end-(1-q)*1.22;
        for(let band=0;band<3;band++){
          const r=50+band*3;c.globalAlpha=fade*q*(band===0?.9:.65);
          dot(c,22+Math.cos(angle)*r,-53-p.axeLift+Math.sin(angle)*r,['#fff0bd','#e5b965','#a46c35'][band],band===0?3:2);
        }
      }
      c.restore();
    }
    if(age>=0&&age<.95){
      const fade=1-clamp((age-.25)/.7);
      // One contact burst and separated armour plates; no repeated damage flashes.
      if(age<.22){
        const spread=clamp(age/.18);c.globalAlpha=1-age/.22;
        for(let i=0;i<10;i++){const a=i/10*Math.PI*2;line(c,tx,ty,tx+Math.cos(a)*(9+spread*27)*scale,ty+Math.sin(a)*(9+spread*23)*scale,i%2?'#f2c36f':'#fff4cd',2);}
        dot(c,tx-3*scale,ty-4*scale,'#fff4d4',Math.max(2,8*scale));
      }
      c.globalAlpha=fade;
      for(let i=0;i<9;i++){
        const angle=-Math.PI+i*.36,flight=age*scale;
        const x=tx+Math.cos(angle)*(28+i%3*18)*flight,y=ty+Math.sin(angle)*(40+i%4*15)*flight+48*age*age*scale;
        plate(c,x,y,(3+i%3)*scale,age*(i%2?4:-5)+i,['#697278','#b6a584','#5b5953'][i%3]);
      }
      for(let i=0;i<16;i++){const vx=Math.sin(i*7)*65,vy=-25-i%5*12;dot(c,tx+vx*age*scale,floor+(vy*age+65*age*age)*scale,i%3?'#c58e51':'#f7ce80',Math.max(1,2*scale));}
    }
    c.restore();
  }
  function camera(p){const age=p.elapsed-impact;if(age<0||age>.32)return {x:0,y:0};const k=(1-age/.32)**2;return {x:Math.sin(age*112)*4*k,y:Math.cos(age*91)*2.6*k};}
  window.IronGuardBreak={sample,drawActor,drawEffect,camera};
})();
