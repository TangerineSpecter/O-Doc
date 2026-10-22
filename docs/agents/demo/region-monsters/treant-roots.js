/* Organic tapered root ribbons, grown along curled paths rather than rigid bars. */
(() => {
  const {clamp,ease,poly,line,dot,blob}=window.RuinsPixels;
  function bezier(a,b,c,d,t){const q=1-t;return [q*q*q*a[0]+3*q*q*t*b[0]+3*q*t*t*c[0]+t*t*t*d[0],q*q*q*a[1]+3*q*q*t*b[1]+3*q*t*t*c[1]+t*t*t*d[1]];}
  function path(segments){const pts=[];for(const s of segments)for(let i=0;i<32;i++)pts.push(bezier(...s,i/31));return pts;}
  const shapes=[
    path([[[-28,3],[-43,-11],[-39,-39],[-15,-49]],[[-15,-49],[12,-62],[29,-33],[8,-25]]]),
    path([[[29,5],[42,-14],[31,-31],[12,-39]],[[12,-39],[-9,-51],[-31,-30],[-12,-16]]]),
    path([[[-9,9],[-30,0],[-17,-24],[7,-23]],[[7,-23],[32,-19],[24,-50],[7,-53]]])
  ];
  function ribbon(c,points,growth,width,time,index){
    const count=Math.floor((points.length-1)*growth);if(count<2)return;
    const pts=points.slice(0,count+1).map(([x,y],i)=>{const q=i/count;return [x+Math.sin(time*3+q*5+index)*q*q*.8,y];});
    const normals=pts.map((v,i)=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(count,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;return [-dy/len,dx/len];});
    const widths=pts.map((_,i)=>width*Math.pow(1-i/count,.65)+.22);
    function strip(mult,offset,color){const left=[],right=[];for(let i=0;i<=count;i++){const [x,y]=pts[i],[nx,ny]=normals[i],w=widths[i];left.push([x+nx*w*(mult+offset),y+ny*w*(mult+offset)]);right.push([x+nx*w*(-mult+offset),y+ny*w*(-mult+offset)]);}poly(c,[...left,...right.reverse()],color);}
    strip(1,0,'#342e25');strip(.78,-.08,'#796041');strip(.27,-.48,'#b29763');strip(.19,.43,'#51452e');
    for(let i=4;i<count-2;i+=5){const [x,y]=pts[i],[nx,ny]=normals[i],w=widths[i];line(c,x-nx*w*.65,y-ny*w*.65,x+nx*w*.35+1,y+ny*w*.35-1,'#53452e',1);
      if(i%2===0){dot(c,x-nx*w*.45,y-ny*w*.45,'#718454',2);}
      // Small growing shoots sit on the curved wood, with no horizontal crossbars.
      if(i%15===4&&w<4){const sx=x+nx*w,sy=y+ny*w;poly(c,[[sx,sy],[sx+nx*5-2,sy+ny*5-3],[sx+nx*8,sy+ny*8],[sx+nx*4+2,sy+ny*4+2]],'#668a4a');line(c,sx,sy,sx+nx*6,sy+ny*6,'#a6bd72',1);}
    }
  }
  function draw(c,p,time,opts,front){
    const t=p.elapsed,scale=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('mist_treant'),fade=1-ease((t-2.55)/.65);
    c.save();c.translate(160+p.facing*91*(opts.atlas?.65:1),window.RegionPreview.floor);c.scale(p.facing*scale,scale);c.globalAlpha*=fade;
    if(!front){
      // A short sinuous root travels just beneath the soil toward the binding point.
      const crawl=ease((t-.36)/.5);if(crawl>0)for(let i=0;i<35*crawl;i++){const q=i/35;dot(c,-67+q*64,Math.sin(q*9)*2,'#5c6040',2);}
      if(t>.65){blob(c,0,3,31,5,'#41503944');ribbon(c,shapes[0],ease((t-.65)/.85),4.7,time,0);}
    }else{
      ribbon(c,shapes[1],ease((t-.82)/.9),6,time,1);
      ribbon(c,shapes[2],ease((t-1.02)/.9),4.6,time,2);
      if(t>.7&&t<1.5){const age=t-.7;for(let i=0;i<12;i++){const x=(i%2?27:-26)+Math.sin(i*2)*age*12,y=-Math.sin(clamp(age/.8)*Math.PI)*(3+i%4*3);poly(c,[[x-2,y],[x,y-3],[x+3,y+1]],i%2?'#7d7552':'#4d5137');}}
      // Roots remain attached to uneven soil ridges, without flat wooden post bottoms.
      if(t>.8)for(const x of [-28,29,-9]){blob(c,x,5,8,2,'#4c4d34');dot(c,x-5,3,'#8e9265',3);}
    }
    c.restore();
  }
  window.TreantRoots={draw};
})();
