/* Dedicated 256px runtime texture for the slender, detailed boss. Logical body
   coordinates and all motion remain 128px, so size and combat timing are unchanged. */
(() => {
  const data=window.CaveKingData, size=256;
  const pixels=Uint8Array.from(atob(data.pixels),c=>c.charCodeAt(0));
  const pack=hex=>{const n=parseInt(hex.slice(1),16);return (255<<24)|((n&255)<<16)|(n&0xff00)|(n>>>16);};
  const palette=Uint32Array.from([0,...data.palette.map(pack)]);
  const canvas=Object.assign(document.createElement('canvas'),{width:size,height:size});
  const context=canvas.getContext('2d',{willReadFrequently:true});
  const image=context.createImageData(size,size), output=new Uint32Array(image.data.buffer);
  const small=Object.assign(document.createElement('canvas'),{width:128,height:128}), smallCtx=small.getContext('2d');
  const white=pack('#fff9df'), crack=pack('#ffffff');
  const debug=[pack('#f1769d'),pack('#5faebc'),pack('#e7bd65')];
  let lastKey='';
  function sprite(pose={},time=0,options={}) {
    const clock=Math.floor(time*24)/24;
    const samplePose={...pose,elapsed:Math.floor((pose.elapsed||0)*24)/24};
    const stamp=[clock,samplePose.elapsed,pose.walk,pose.foreLift,pose.facing,pose.flash,pose.fracture,options.layers].join('|');
    if(stamp===lastKey)return canvas;lastKey=stamp;output.fill(0);
    const flip=(pose.facing??-1)!==-1;
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
      const [u,v]=window.MeadowCharacters.kingSourcePoint(x/2,y/2,samplePose,clock);
      const sx=Math.round(u*2),sy=Math.round(v*2);
      if(sx<0||sx>=size||sy<0||sy>=size)continue;
      const i=sy*size+sx,index=pixels[i];if(!index)continue;
      let color=palette[index];
      if(pose.flash)color=white;
      else if(pose.fracture>.05) {
        const a=Math.abs((u-66)-(v-58)*.75+Math.sin(v*.4)*3);
        const b=Math.abs((u-66)+(v-52)*.85+Math.cos(u*.4)*3);
        if(a<1.6*pose.fracture||b<1.6*pose.fracture)color=crack;
      } else if(options.layers) {
        const boundary=sx===0||sx===255||sy===0||sy===255||!pixels[i-1]||!pixels[i+1]||!pixels[i-size]||!pixels[i+size];
        color=boundary?debug[0]:((color&255)+((color>>>8)&255)+((color>>>16)&255)>560?debug[2]:debug[1]);
      }
      output[y*size+(flip?size-1-x:x)]=color;
    }
    context.putImageData(image,0,0);return canvas;
  }
  function draw(ctx,pose,time,options) {
    if(pose.hidden)return;
    const scale=options.atlas ? .4 : 1,x=160+pose.x,y=149+pose.y;
    ctx.fillStyle=options.night?'#1e373659':'#6c8d5850';
    for(let dy=-4;dy<=4;dy++){const w=Math.sqrt(Math.max(0,1-(dy/4.5)**2))*(options.atlas?13:34)*Math.max(.55,1+pose.y/120);ctx.fillRect(Math.round(x-w),149+dy,Math.round(w*2),1);}
    const source=sprite(pose,time,options);
    const w=128*scale*pose.sx,h=128*scale*pose.sy;
    const snap=n=>Math.round(n*2)/2;
    ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1-pose.fade;
    for(let row=0;row<256;row++) {
      const top=snap(y-(236-row)*h/256),bottom=snap(y-(235-row)*h/256);
      if(bottom<=top)continue;
      const tilt=snap((236-row)/256*pose.tilt);
      ctx.drawImage(source,0,row,256,1,snap(x-w/2+tilt),top,w,bottom-top);
    }
    ctx.restore();
  }
  // The shared shatter samples two logical pixels. Feed it a current, same-source
  // 128px view so debris retains its established count, size and physics.
  function sample128(pose,time,options) {
    smallCtx.clearRect(0,0,128,128);smallCtx.imageSmoothingEnabled=false;
    smallCtx.drawImage(sprite(pose,time,options),0,0,128,128);return small;
  }
  window.CaveKingDetail={sprite,draw,sample128};
})();
