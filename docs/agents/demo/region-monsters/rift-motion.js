/* Review-only action choreography. No damage, status or settlement writes. */
(() => {
  const {ease}=window.RuinsPixels;
  const actions={rift_walker:['rift_cross'],star_golem:['orbital_collapse'],rift_lord:['void_loom'],star_overlord:['eclipse_breath','astral_wings']};
  const durations={rift_cross:2.65,orbital_collapse:3.4,void_loom:3.5,eclipse_breath:3.7,astral_wings:4.2};
  function sample(key,p,t){
    Object.assign(p,{riftSkill:true,riftMonster:key,x:0,y:0,sx:1,sy:1,tilt:0,walk:0,swing:0,charge:0,fade:0,riftArms:0,riftWings:0,riftCore:0});
    if(key==='rift_walker'){
      const wind=ease(t/.55)*(1-ease((t-.6)/.25)),cut=ease((t-.62)/.18)*(1-ease((t-1.35)/.65)),second=ease((t-.94)/.18)*(1-ease((t-1.35)/.6));
      p.x=p.facing*(-8*wind+43*cut);p.y=3*wind-8*Math.sin(cut*Math.PI);p.sy=1-.035*wind;p.riftArms=-wind+cut-second*1.8;p.fade=.35*Math.sin(cut*Math.PI);p.tilt=p.facing*(-3*wind+5*cut);
    }else if(key==='star_golem'){
      p.riftCore=ease(t/.85)*(1-ease((t-2.1)/.7));p.riftArms=p.riftCore;p.y=-5*p.riftCore;
    }else if(key==='rift_lord'){
      p.riftArms=ease(t/.7)*(1-ease((t-2.55)/.65));p.riftCore=ease((t-.6)/.5)*(1-ease((t-2.5)/.6));p.y=-12-3*p.riftArms;
    }else{
      const breath=p.action==='eclipse_breath';p.riftWings=ease(t/.85)*(1-ease((t-(breath?2.6:3.1))/.65));
      p.riftCore=ease(t/.7)*(1-ease((t-(breath?2.6:3.05))/.6));p.riftArms=breath?ease((t-.8)/.3)*(1-ease((t-2.5)/.6)):0;
      p.y=2;p.tilt=p.facing*(breath?3*p.riftArms:-2*p.riftWings);
    }
    return p;
  }
  const bump=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));
  function deform(x,y,key,p){
    let u=x,v=y;
    if(key==='rift_walker'){
      const l=bump(x,y,34,78,25,19),r=bump(x,y,104,74,20,18);u-=p.riftArms*(l*6-r*6);v+=p.riftArms*(l*7-r*5);
    }else if(key==='star_golem'){
      const side=ease((Math.abs(x-64)-13)/23);u-=Math.sign(x-64)*side*p.riftCore*5;v+=side*p.riftCore*3;
    }else if(key==='rift_lord'){
      const hand=bump(x,y,99,42,17,22);u-=hand*p.riftArms*3;v+=hand*p.riftArms*6;
    }else{
      const wing=ease((Math.abs(x-65)-15)/29)*(1-ease((y-82)/18));u-=Math.sign(x-65)*wing*p.riftWings*2;v+=wing*p.riftWings*4;
      const jaw=bump(x,y,80,39,13,10);v-=jaw*p.riftArms*2;u+=jaw*p.riftArms*2;
    }
    return [u,v];
  }
  const descriptions={rift_walker:{rift_cross:'候选 · 双刃裂步：低伏收刃 → 穿隙前跃 → 双刃先后交剪，掀起两道交错风刃。风属性；伤害与段数待确认。'},star_golem:{orbital_collapse:'候选 · 星环崩解：星核蓄光、岩臂悬开 → 三枚星岩绕核公转 → 向前聚合坍缩。暗属性；正式规则待确认。'},rift_lord:{void_loom:'候选 · 裂界织刃：抬掌牵引三处空间裂口 → 星线相连 → 裂口依次切开并收束。暗属性精英法术；正式规则待确认。'},star_overlord:{eclipse_breath:'候选 · 星蚀龙息：星翼舒展、胸核点亮 → 喉部汇光 → 持续喷出暗紫星焰，余焰化作星尘。暗属性首领技能；正式规则待确认。',astral_wings:'候选 · 星翼裁决：双翼星座逐一点亮 → 五枚星核脱翼升起 → 化为弯曲彗尾错位俯落。暗属性首领技能；段数与范围待确认。'}};
  function camera(p){const at={rift_cross:1.05,orbital_collapse:1.95,void_loom:1.9,eclipse_breath:1.15,astral_wings:2.3}[p.action],t=p.elapsed-at;if(!p.riftSkill||t<0||t>.2)return {x:0,y:0};return {x:Math.sin(t*91)*(1-t/.2)*.8,y:Math.cos(t*73)*(1-t/.2)*.45};}
  window.RiftMotion={actions,durations,sample,deform,descriptions,camera};
})();
