/* Candidate fire poses. Effects are visual only; approved hit/defeat bypass this module. */
(() => {
  const {ease,clamp}=window.RuinsPixels;
  const actions={ash_demon:['cinder_breath'],lava_beast:['magma_spines'],furnace_guard:['furnace_ray'],ash_lord:['attack','burn','magic_strike']};
  function sample(key,p,t){
    Object.assign(p,{emberSkill:true,emberMonster:key,charge:0,swing:0,walk:0,x:0,y:0,sx:1,sy:1,tilt:0});
    if(key==='ash_lord'){
      // Original MonsterTemplate cast phases and staff recoil, mapped to the current stage.
      const attack=p.action==='attack',soul=p.action==='magic_strike',wind=attack?.24:soul?.52:.44;
      const q=clamp(t/wind),release=clamp((t-wind)/(attack?.64:1.31)),damp=Math.exp(-release*3.5)*(1-ease((t-1.5)/.5));
      p.heat=t<wind?q:damp;p.staff=t<wind?q*(attack?18:soul?16:24):(attack?18*Math.cos(release*Math.PI*1.8)*Math.exp(-release*2):-12*damp);
      p.cape=p.heat*.85;p.y=-17-(t<wind?Math.sin(q*Math.PI*.5):damp)*(attack?8:soul?20:16)*.28;p.soul=soul;
    }else{
      p.gather=ease(t/.65)*(1-ease((t-.72)/.25));p.fire=ease((t-.72)/.18)*(1-ease((t-1.8)/.55));
      if(key==='ash_demon'){p.x=-p.facing*(3*p.gather+4*p.fire);p.y=2*p.gather;p.tilt=p.facing*(-3*p.gather+6*p.fire);p.sy=1-.04*p.gather;}
      if(key==='lava_beast'){p.y=5*p.gather+2*p.fire;p.sy=1-.06*p.gather;p.sx=1+.025*p.gather;p.vent=p.fire;}
      if(key==='furnace_guard'){p.y=2*p.gather;p.tilt=-p.facing*2*p.fire;p.open=ease(t/.7)*(1-ease((t-2.15)/.5));p.x=-p.facing*3*p.fire;}
    }
    return p;
  }
  function deform(x,y,key,p){
    const bump=(a,b,rx,ry)=>Math.exp(-(((x-a)/rx)**2+((y-b)/ry)**2));
    if(key==='ash_demon'){
      const head=bump(70,51,27,25),arms=bump(37,86,13,16)+bump(92,83,13,16);
      x-=head*p.fire*3;y+=head*(p.gather*3-p.fire*2)-arms*(p.fire*3+p.gather*2);
    }else if(key==='lava_beast'){
      const head=bump(103,72,23,22),back=bump(63,47,31,22);
      y-=head*p.vent*3+back*Math.sin(p.elapsed*26)*p.vent*1.1;
    }else if(key==='furnace_guard'){
      const arm=ease((Math.abs(x-65)-23)/24)*(1-ease((y-92)/17));
      x-=Math.sign(x-65)*arm*p.open*5;y+=arm*p.open*4;
    }else{
      // Template's staff-axis mask and cape flare: no translation of the whole caster.
      const axis=109-(y-25)*.19,staff=(x>90&&x>axis-12)||(y<44&&x>96);
      if(staff){y+=p.staff*.65;x-=p.staff*.16;}
      else if(x<38&&y>=36&&y<=94){const w=((38-x)/38)**1.6;y+=p.cape*3*w;x+=p.cape*3.2*w;}
    }
    return [x,y];
  }
  function camera(p){
    const start=p.action==='furnace_ray'?.9:p.action==='magma_spines'?1.45:p.action==='burn'?.44:.9,age=p.elapsed-start;
    const power=p.action==='furnace_ray'?1.2:p.action==='burn'?2.5:1;
    return age>=0&&age<.24?{x:Math.sin(age*95)*power*(1-age/.24),y:Math.cos(age*80)*power*.45*(1-age/.24)}:{x:0,y:0};
  }
  window.EmberMotion={actions,sample,deform,camera};
})();
