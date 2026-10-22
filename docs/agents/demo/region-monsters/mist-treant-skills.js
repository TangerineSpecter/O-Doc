/* Tree king review-only poses: root binding and fruit-dew healing.
 * Animation does not change HP, control durations or production skills. */
(() => {
  const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
  function sample(p,t){
    const cage=p.action==='root_prison';
    const prepare=ease(t/.65),release=ease((t-.7)/.26),recover=ease((t-(cage?2.55:3.05))/.65);
    const hold=release*(1-recover),charge=prepare*(1-release);
    Object.assign(p,{treantSkill:true,rootPrison:cage,charge:0,walk:0,swing:0,x:0,y:0,tilt:0,sx:1,sy:1-(cage?.04:-.025)*hold,
      royalCharge:charge,royalHold:hold,royalOpen:cage?.18*charge:.42*hold,royalPress:cage?hold:0});
    p.fade=0;
    return p;
  }
  function deform(x,y,p){
    const side=Math.sign(x-65),arm=clamp((Math.abs(x-65)-21)/21)*Math.exp(-(((y-77)/29)**2));
    const dx=side*arm*(p.royalOpen*10-p.royalPress*3);
    const dy=arm*(-p.royalOpen*12+p.royalPress*9-p.royalCharge*5);
    const canopy=1-ease((y-32)/17);
    return [x-dx-Math.sin(p.elapsed*3+y*.07)*canopy*p.royalHold*1.8,y-dy+canopy*p.royalCharge*2];
  }
  function effects(c,p,time,opts,front){
    if(p.rootPrison)window.TreantRoots.draw(c,p,time,opts,front);
    else window.TreantDew.draw(c,p,time,opts,front);
  }
  function camera(p){const age=p.elapsed-.86;if(!p.rootPrison||age<0||age>.2)return {x:0,y:0};return {x:Math.sin(age*83)*.8*(1-age/.2),y:Math.cos(age*91)*(1-age/.2)};}
  window.MistTreantSkills={sample,deform,effects,camera};
})();
