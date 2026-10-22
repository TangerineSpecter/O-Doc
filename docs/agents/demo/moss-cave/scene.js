/* Every cave inhabitant shares the existing approved cave background. */
(() => {
  const art = window.MeadowArt;
  art.monsterScale = key => key === 'king' ? 1.2 : 1;
  const background = new Image();
  background.src = '../../../frontend_react/src/assets/combat/battle-moss-cave-pixel-v2.png';
  background.onerror = () => { document.querySelector('.weather').textContent = '背景未加载 · 素色预览'; };
  art.drawBackground = (ctx, opts, time) => {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = opts.night ? '#293d3a' : '#e2e9dd'; ctx.fillRect(0,0,320,180);
    if (opts.plain) return;
    if (background.complete && background.naturalWidth) ctx.drawImage(background,0,0,320,180);
    if (opts.night) { ctx.fillStyle='#12272566'; ctx.fillRect(0,0,320,180); }
    for(let n=0;n<8;n++) {
      ctx.fillStyle=`rgba(215,242,190,${.13 + .13 * Math.sin(time * 1.2 + n)})`;
      ctx.fillRect(Math.round((n*47+time*2)%320), Math.round(40+n*14+Math.sin(time+n)*3),1,1);
    }
  };
  const character = art.drawCharacter;
  const sprite = art.drawSprite;
  art.drawSprite = (key, pose, time, opts) => key === 'king'
    ? window.CaveKingDetail.sample128(pose, time, opts) : sprite(key, pose, time, opts);
  art.drawCharacter = (ctx,key,pose,time,opts) => {
    const scale = art.monsterScale(key), x = 160 + pose.x, y = 149 + pose.y;
    ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale); ctx.translate(-x,-y);
    if (pose.action === 'evasion') {
      for(let n=3;n>0;n--) {
        ctx.save(); ctx.globalAlpha=.08 * (4-n);
        character(ctx,key,{...pose,fade:1-.08*(4-n),x:pose.x+n*9*pose.facing},time-n*.045,opts); ctx.restore();
      }
    }
    window.CaveSkills.draw(ctx,key,pose,time,opts,false);
    if (key === 'king' && !opts.legacyKing) window.CaveKingDetail.draw(ctx,pose,time,opts);
    else character(ctx,key,pose,time,opts);
    window.CaveSkills.draw(ctx,key,pose,time,opts,true);
    ctx.restore();
  };
})();
