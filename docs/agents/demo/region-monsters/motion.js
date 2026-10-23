/* Local poses only. Shared hit and defeat timings remain unchanged. */
(() => {
  const shared=window.MeadowMotion,clamp=n=>Math.max(0,Math.min(1,n));
  const ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
  function sample(key,action,elapsed,time,facing,poke) {
    const mon=window.MeadowMonsters[key];
    const p=shared.sample(mon.hover?'glowbug':key,action,elapsed,time,facing,poke);
    if(action==='hit'||action==='defeat')return p;
    const t=Math.floor(elapsed*24)/24,heavy=['golem','tree'].includes(mon.family);
    Object.assign(p,{x:0,y:mon.hover?-17+Math.sin(time*3.1)*2:Math.sin(time*2.5)*.5,sx:1,sy:1,tilt:0,walk:0,swing:0,charge:0});
    if(window.RiftMotion.actions[key]?.includes(action))return window.RiftMotion.sample(key,p,elapsed);
    if(window.EmberMotion.actions[key]?.includes(action))return window.EmberMotion.sample(key,p,elapsed);
    if(window.RuinsMotion.actions[key]?.includes(action))return window.RuinsMotion.sample(key,p,elapsed);
    if(key==='mist_treant'&&['root_prison','royal_dew'].includes(action))return window.MistTreantSkills.sample(p,elapsed);
    if(key==='ancient_guard'&&action==='heal')return window.AncientGuardRegen.sample(p,elapsed);
    if(key==='mist_wolf'&&action==='mist_pounce')return window.MistWolfPounce.sample(p,elapsed);
    if(key==='toxic_mushroom'&&action==='poison')return window.ToxicMushroom.sample(p,elapsed);
    if(key==='mine_giant'&&['crystal_resonance','vault_collapse'].includes(action))return window.MineGiantSkills.sample(p,elapsed);
    if(key==='iron_guard'&&action==='armor_break')return window.IronGuardBreak.sample(p,elapsed);
    if(action==='move') {
      p.x=Math.sin(t*1.6)*24*facing;p.walk=1;
      if(!mon.hover)p.y-=Math.abs(Math.sin(t*(heavy?7:10)))*(mon.family==='mushroom'?7:heavy?1:2);
    } else if(action==='attack'||action==='strike'||action==='armor_break') {
      const strong=action!=='attack',windup=strong?.65:.3,release=strong?.26:.3;
      p.charge=ease(t/windup)*(1-ease((t-windup)/release));
      p.swing=Math.sin(clamp((t-windup)/.6)*Math.PI);
      const recover=1-ease((t-windup-release)/.65);
      p.x=(-p.charge*5+(mon.ranged?9:heavy?25:43)*ease((t-windup)/release)*recover)*facing;
      p.tilt=(-p.charge*(strong?6:3)+p.swing*4)*facing;
      p.walk=p.swing*(mon.ranged?.15:1);p.sy=1-p.charge*.025;
      if(mon.family==='quadruped'||mon.family==='demon')p.y-=p.swing*(strong?13:6);
    } else if(action==='evasion') {
      const pulse=Math.sin(clamp(t/1.3)*Math.PI);p.x=-43*pulse*facing;p.y-=pulse*9;p.walk=pulse;p.tilt=-pulse*7*facing;
    } else {
      p.charge=ease(t/.65)*(1-ease((t-1.2)/.8));
      p.swing=Math.sin(clamp((t-.6)/1.4)*Math.PI);
      p.tilt=-2*p.charge*facing;
    }
    return p;
  }
  window.MeadowMotion={sample,shatterAt:shared.shatterAt,durations:{...shared.durations,...window.RiftMotion.durations,crystal_resonance:3.4,vault_collapse:3.5,cinder_breath:2.8,magma_spines:2.9,furnace_ray:3,grave_blade:2.2,whirlpool_bolt:2.6,oath_counter:2.65,rising_tide:3.15,tidal_verdict:2.9,root_prison:3.3,royal_dew:3.8,mist_pounce:2.5,strike:2.2,armor_break:2.25,evasion:1.3,guard:3,shield:3,heal:2.8,poison:2.6,burn:2.6,magic_strike:2.3,curse:2.8}};
})();
