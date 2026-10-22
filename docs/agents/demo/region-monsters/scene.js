/* Approved habitat image, character, and visual effects remain separate layers. */
(() => {
  const art=window.MeadowArt,region=window.RegionPreview;
  art.monsterScale=key=>region.monsters[key].scale*region.spriteScale;
  const background=new Image();background.src=region.background;
  background.onerror=()=>{document.querySelector('.weather').textContent='背景未加载 · 素色预览';};
  art.drawBackground=(ctx,opts)=>{
    ctx.imageSmoothingEnabled=false;ctx.fillStyle=opts.night?'#252d3b':'#dce3df';ctx.fillRect(0,0,320,180);
    if(!opts.plain&&background.complete&&background.naturalWidth)ctx.drawImage(background,0,0,320,180);
    if(opts.night){ctx.fillStyle='#151e3d55';ctx.fillRect(0,0,320,180);}
  };
  function body(ctx,key,p,time,opts,alpha=1){
    if(p.hidden)return;
    if(p.ruinsSkill&&key!=='water_spirit'){window.RuinsActors.actor(ctx,key,p,time,opts);return;}
    if(p.wolfPounce){window.MistWolfPounce.actor(ctx,p,time,opts,alpha);return;}
    if(p.giantSkill){window.MineGiantSkills.actor(ctx,p,time,opts);return;}
    if(p.ironBreak){window.IronGuardBreak.drawActor(ctx,p,time,opts);return;}
    const source=window.MeadowCharacters.drawDetail(key,p,time,opts),n=source.width;
    const scale=(opts.atlas?.4:1)*art.monsterScale(key),x=160+p.x,y=region.floor+p.y;
    const width=128*scale*p.sx,height=128*scale*p.sy;
    ctx.save();ctx.globalAlpha=(1-p.fade)*alpha;ctx.imageSmoothingEnabled=false;
    // Fade the boss once as a whole; overlapping scanlines would stripe translucent mist.
    if(p.treantSkill)ctx.drawImage(source,x-width/2,y-118/128*height,width,height);
    else for(let row=0;row<n;row++)ctx.drawImage(source,0,row,n,1,Math.round(x-width/2+(118-row*128/n)/128*p.tilt),y-(118/128-row/n)*height,width,height/n+.2);
    ctx.restore();
  }
  art.drawCharacter=(ctx,key,p,time,opts)=>{
    const scale=(opts.atlas?.4:1)*art.monsterScale(key);
    if(!p.hidden){ctx.fillStyle='#25323840';for(let y=-3;y<=3;y++){const w=Math.sqrt(1-(y/4)**2)*29*scale;ctx.fillRect(Math.round(160+p.x-w),region.floor+y,Math.round(w*2),1);}}
    if(p.action==='evasion')for(let i=3;i>0;i--)body(ctx,key,{...p,x:p.x+i*9*p.facing},time-i*.05,opts,.08*(4-i));
    // Skill anchors stay in stage coordinates, independent of monster magnification.
    window.RegionSkills.draw(ctx,key,p,time,opts,false);
    body(ctx,key,p,time,opts);
    window.RegionSkills.draw(ctx,key,p,time,opts,true);
  };
})();
