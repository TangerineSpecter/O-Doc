/* Review-only poses for the ruins candidates. Shared hit/defeat are handled first. */
(() => {
  const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
  const actions={ruin_skeleton:['grave_blade'],water_spirit:['whirlpool_bolt'],ruin_knight:['oath_counter'],tide_priest:['rising_tide','tidal_verdict']};
  function sample(key,p,t){
    Object.assign(p,{ruinsSkill:true,ruinsMonster:key,charge:0,swing:0,walk:0,x:0,y:0,sx:1,sy:1,tilt:0,weapon:0,weaponLift:0,shield:0,hand:0,lean:0});
    if(key==='ruin_skeleton'){
      const up=ease(t/.62)*(1-ease((t-.7)/.2)),cut=ease((t-.7)/.2)*(1-ease((t-1.2)/.7));
      p.weapon=1.95*up-.82*cut;p.weaponLift=5*up;p.lean=-.08*up+.1*cut;
      p.x=p.facing*(-3*up+9*cut);p.y=2*cut;p.hand=-.12*cut;
    }else if(key==='ruin_knight'){
      const brace=ease(t/.5)*(1-ease((t-1.12)/.5)),cut=ease((t-1.08)/.24)*(1-ease((t-1.68)/.65));
      p.shield=-.25*brace;p.weapon=.25*brace-1.6*cut;p.weaponLift=3*cut;
      p.lean=-.065*brace+.1*cut;p.x=p.facing*(-5*brace+10*cut);p.y=2*brace;
    }else if(key==='water_spirit'){
      const gather=ease(t/.62)*(1-ease((t-.7)/.24)),push=ease((t-.72)/.28)*(1-ease((t-1.2)/.6));
      p.waterGather=gather;p.waterPush=push;p.sy=1-.17*gather+.09*push;p.sx=1+.12*gather-.06*push;
      p.x=p.facing*(-5*gather+9*push);p.y=-17-4*gather;p.tilt=3*p.facing*push;
    }else{
      const barrier=p.action==='rising_tide',raise=ease(t/.72)*(1-ease((t-(barrier?2.35:1.35))/.65));
      const command=barrier?0:ease((t-.88)/.22)*(1-ease((t-1.45)/.7));
      p.weapon=.14*raise-.17*command;p.weaponLift=7*raise-4*command;
      p.hand=-.5*raise+.65*command;p.lean=.035*command;p.y=-14-2*raise;
    }
    return p;
  }
  function deform(x,y,p){
    const cap=Math.exp(-(((y-41)/35)**2)),tail=ease((y-75)/40),arm=Math.exp(-(((y-76)/13)**2))*ease((Math.abs(x-64)-15)/20);
    return [x-Math.sin(y*.13+p.elapsed*9)*tail*(3+5*p.waterGather)-Math.sign(x-64)*arm*(p.waterPush*5-p.waterGather*5),y+cap*p.waterGather*2-arm*p.waterPush*5];
  }
  function camera(p){const hit=p.action==='oath_counter'?1.34:p.action==='tidal_verdict'?1.55:.95,age=p.elapsed-hit;if(age<0||age>.2||!['oath_counter','tidal_verdict','grave_blade'].includes(p.action))return {x:0,y:0};const force=p.action==='tidal_verdict'?2:1;return {x:Math.sin(age*98)*force*(1-age/.2),y:Math.cos(age*80)*.6*force*(1-age/.2)};}
  window.RuinsMotion={actions,sample,deform,camera};
})();
