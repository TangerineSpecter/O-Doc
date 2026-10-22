/* Small hard-pixel drawing primitives shared only by the ruins skill effects. */
(() => {
  const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
  const dot=(c,x,y,color,s=2)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),s,s);};
  function line(c,x,y,u,v,color,s=1){const steps=Math.max(1,Math.abs(u-x),Math.abs(v-y));for(let i=0;i<=steps;i++)dot(c,x+(u-x)*i/steps,y+(v-y)*i/steps,color,s);}
  function poly(c,pts,color){c.fillStyle=color;for(let y=Math.floor(Math.min(...pts.map(p=>p[1])));y<=Math.ceil(Math.max(...pts.map(p=>p[1])));y++){const hit=[];for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [x,a]=pts[i],[u,b]=pts[j];if((a>y)!==(b>y))hit.push(x+(u-x)*(y-a)/(b-a));}hit.sort((a,b)=>a-b);for(let i=0;i+1<hit.length;i+=2)c.fillRect(Math.round(hit[i]),y,Math.max(1,Math.round(hit[i+1]-hit[i])),1);}}
  function blob(c,x,y,rx,ry,color){c.fillStyle=color;for(let row=-Math.ceil(ry);row<=ry;row++){const w=Math.round(rx*Math.sqrt(Math.max(0,1-(row/ry)**2)));if(w)c.fillRect(Math.round(x-w),Math.round(y+row),w*2,1);}}
  function ring(c,x,y,rx,ry,color){for(let i=0;i<100;i++){const a=i/100*Math.PI*2;dot(c,x+Math.cos(a)*rx,y+Math.sin(a)*ry,color,1);}}
  function droplet(c,x,y,r){poly(c,[[x,y-r*1.8],[x-r,y],[x-r*.5,y+r],[x+r*.6,y+r],[x+r,y]],'#197da9');poly(c,[[x,y-r*1.4],[x-r*.5,y],[x,y+r*.5],[x+r*.5,y]],'#74deeb');dot(c,x-r*.3,y-r*.2,'#e1ffff',Math.max(1,r*.4));}
  function spray(c,x,y,age,scale,spread=1){if(age<0||age>.8)return;c.save();c.globalAlpha*=1-ease((age-.35)/.45);for(let i=0;i<15;i++){const a=Math.PI+i/14*Math.PI,v=(22+i%4*12)*spread;droplet(c,x+Math.cos(a)*v*age*scale,y+(Math.sin(a)*v*age+40*age*age)*scale,(1.3+i%3*.55)*scale);}ring(c,x,y+2,8+age*48*scale,3+age*12*scale,'#a8f0ed');c.restore();}
  function slash(c,x,y,r,angle,length,color,width=2){for(let i=0;i<60;i++){const q=i/59,a=angle-q*length;dot(c,x+Math.cos(a)*r,y+Math.sin(a)*r,color,Math.max(1,width*q));}}
  window.RuinsPixels={clamp,ease,dot,line,poly,blob,ring,droplet,spray,slash};
})();
