/* Review-only poses for the ruins candidates. Shared hit/defeat are handled first. */
(() => {
  const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
  const actions={ruin_skeleton:['grave_blade'],water_spirit:['whirlpool_bolt'],ruin_knight:['oath_counter'],tide_priest:['rising_tide','tidal_verdict']};
  function sample(key,p,t){
    Object.assign(p,{ruinsSkill:true,ruinsMonster:key,charge:0,swing:0,walk:0,x:0,y:0,sx:1,sy:1,tilt:0,weapon:0,weaponLift:0,shield:0,hand:0,lean:0});
    if(key==='ruin_skeleton'){
      const ready=ease(t/.62),swing=ease((t-.72)/.24),recover=ease((t-1.3)/.8);
      const held=1-recover;
      p.wristX=33+((-8*ready)*(1-swing)+39*swing)*held;
      p.wristY=81+((-35*ready)*(1-swing)-17*swing-16*Math.sin(swing*Math.PI))*held;
      p.weapon=(-2.2*ready*(1-swing)-.85*swing)*held;
      p.lean=(-.055*ready*(1-swing)+.07*swing)*held;
      p.x=p.facing*(-3*ready*(1-swing)+10*swing)*held;p.y=2*swing*held;
    }else if(key==='ruin_knight'){
      const brace=ease(t/.5)*(1-ease((t-1.25)/.6)),ready=ease(t/.72),cut=ease((t-1.08)/.3),recover=ease((t-1.7)/.65),held=1-recover;
      p.shield=-.3*brace;p.shieldX=4*brace;p.shieldY=-9*brace;
      p.wristX=42+(-10*ready*(1-cut)+22*cut)*held;
      p.wristY=77+(-7*ready*(1-cut)-22*cut)*held;
      p.weapon=(.3*ready*(1-cut)-1.7*cut)*held;
      p.lean=(-.05*brace+.06*cut)*held;p.x=p.facing*(-4*brace+9*cut)*held;p.y=2*brace;
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
