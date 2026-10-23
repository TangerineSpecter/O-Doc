/* Stable skill keys mirror skill.monster.*. These effects do not resolve hits or modify stats. */
(() => {
  const clamp=n=>Math.max(0,Math.min(1,n));
  const descriptions={
    strike:'蓄力 → 重击落点 → 岩屑与冲击环。目录语义：物理攻击；仅演示动作。',
    armor_break:'抬臂蓄力 → 锐角劈击 → 目标护甲标记裂开。目录语义：物理攻击并降低物防。',
    evasion:'收势 → 侧后方闪移 → 残影消散。目录语义：提高自身闪避。',
    guard:'收拢身体 → 岩甲护片升起 → 棱面护罩环护。目录语义：提高自身减伤。',
    shield:'聚拢水光 → 灵力弧面展开 → 护盾亮边回旋。目录语义：为自身添加护盾。',
    heal:'树心亮起 → 叶光沿根系上升 → 生命光点回归。目录语义：恢复自身生命。',
    poison:'菌盖／枝冠蓄势 → 孢子飞向目标 → 目标周围留下毒孢。目录语义：魔法攻击并附加中毒。',
    burn:'额焰／权杖／星翼聚能 → 火团飞出 → 目标持续升焰。目录语义：火属性攻击并附加灼烧。',
    magic_strike:'灵力在手部汇集 → 亮芯弹道 → 星芒扩散。目录语义：魔法攻击。',
    curse:'聚集暗星 → 目标上方星环闭合 → 暗色符纹消散。目录语义：暗属性攻击并降低命中。'
  };
  const dot=(c,x,y,color,size=2)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),size,size);};
  function line(c,x,y,u,v,color,size=2){const steps=Math.max(Math.abs(u-x),Math.abs(v-y));for(let i=0;i<=steps;i+=1.5)dot(c,x+(u-x)*i/steps,y+(v-y)*i/steps,color,size);}
  function ring(c,x,y,rx,ry,color,phase=0){for(let i=0;i<100;i++){const a=i/100*Math.PI*2+phase;dot(c,x+Math.cos(a)*rx,y+Math.sin(a)*ry,color,1);}}
  function star(c,x,y,color,size=8){line(c,x-size,y,x+size,y,color);line(c,x,y-size,x,y+size,color);dot(c,x-1,y-1,'#fff8da',3);}
  function flame(c,x,y,h,time,palette){for(let row=0;row<h;row+=2){const width=Math.max(1,(1-row/h)*7),sway=Math.sin(time*13+row*.3)*row/h*4;line(c,x-width+sway,y-row,x+width+sway,y-row,palette[0]);if(row<h*.65)line(c,x-width*.45+sway,y-row,x+width*.45+sway,y-row,palette[1]);}dot(c,x,y-2,palette[2],3);}
  function target(c,x,y){c.save();c.globalAlpha=.35;ring(c,x,y,13,4,'#e9e4cd');line(c,x,y-32,x,y-8,'#f8f2dc',1);ring(c,x,y-38,5,5,'#f8f2dc');c.restore();}
  // Ore golem: a summoned kite shield, offset toward the attacker so its face stays readable.
  function drawOreShield(c,p,time,opts,front) {
    const grow=clamp(p.elapsed/.55),open=grow*grow*(3-2*grow);
    const scale=(opts.atlas?.4:1)*window.MeadowArt.monsterScale('ore_golem');
    const x=160+p.x+p.facing*40*scale,y=window.RegionPreview.floor+p.y-43*scale+(1-open)*12;
    const shape=[[0,-39],[10,-34],[27,-29],[26,-2],[21,17],[0,39],[-21,17],[-26,-2],[-27,-29],[-10,-34]];
    c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale*(.35+.65*open),scale*(.75+.25*open));
    // Scanline fills keep the silhouette on the same hard pixel grid as the creature.
    const polygon=(points,color,alpha=1)=>{
      c.save();c.globalAlpha*=alpha;c.fillStyle=color;
      const min=Math.floor(Math.min(...points.map(v=>v[1]))),max=Math.ceil(Math.max(...points.map(v=>v[1])));
      for(let row=min;row<=max;row++){
        const intersections=[];
        for(let i=0,j=points.length-1;i<points.length;j=i++){
          const [a,b]=points[i],[u,v]=points[j];
          if((b>row)!==(v>row))intersections.push(a+(u-a)*(row-b)/(v-b));
        }
        intersections.sort((a,b)=>a-b);
        for(let i=0;i+1<intersections.length;i+=2)c.fillRect(Math.round(intersections[i]),row,Math.max(1,Math.round(intersections[i+1]-intersections[i])),1);
      }
      c.restore();
    };
    const inset=(sx,sy,dx=0,dy=0)=>shape.map(([a,b])=>[a*sx+dx,b*sy+dy]);
    if(!front){
      polygon(inset(1.17,1.09),'#e6b65d',.09);
      for(let i=0;i<6;i++){
        const rise=(time*.5+i/6)%1;
        c.save();c.globalAlpha*=Math.sin(rise*Math.PI)*.55;
        dot(c,(i%2?1:-1)*(29+i%3),32-rise*68,'#e9c887',1+i%2);c.restore();
      }
      c.restore();return;
    }
    polygon(inset(1.08,1.04,2,2),'#362c28',.9); // Cast thickness below the metal rim.
    polygon(shape,'#70523c',.94);
    polygon(inset(.94,.96,-1,-1),'#d2aa64',.97);
    polygon(inset(.82,.85),'#514c44',.89);
    polygon([[-21,-25],[0,-30],[0,29],[-15,12],[-20,-3]],'#827864',.63);
    polygon([[0,-30],[21,-25],[20,-3],[15,12],[0,29]],'#343c3a',.66);
    // Raised central spine and chamfered border: light remains in the upper left.
    line(c,-24,-27,-22,-2,'#f2d58f',2);line(c,-22,-2,-17,14,'#d7b66b',2);
    line(c,-17,14,0,33,'#b59255',2);line(c,1,32,19,13,'#8c7046',2);
    line(c,23,-26,22,-3,'#aa824c',2);
    line(c,-20,-27,-8,-31,'#f1d398',1);line(c,8,-31,20,-27,'#c39a57',1);
    line(c,0,-29,0,-18,'#c6a366',2);line(c,0,13,0,29,'#d1ae69',2);
    // Amber ore, with four facets, is the golem's own mineral signature.
    polygon([[0,-21],[13,-6],[0,14],[-13,-6]],'#3e302d');
    polygon([[0,-18],[10,-6],[0,10],[-10,-6]],'#ce802c');
    polygon([[0,-18],[-10,-6],[0,-3]],'#ffdf8c');
    polygon([[0,-18],[10,-6],[0,-3]],'#f6b645');
    polygon([[-10,-6],[0,10],[0,-3]],'#de9637');
    polygon([[10,-6],[0,10],[0,-3]],'#9f5927');
    line(c,0,-15,0,-6,'#fff0b6',2);
    for(const side of [-1,1]){
      for(const yy of [-22,5]){dot(c,side*17-1,yy,'#392f29',4);dot(c,side*17-1,yy,'#dfbf79',2);}
      line(c,side*14,13,side*9,20,'#d6b271',1);
      line(c,side*14,16,side*10,22,'#8d744a',1);
    }
    // A brief edge glint follows formation; no opaque flash across the creature.
    const glint=clamp(1-Math.abs(p.elapsed-.8)/.3);
    if(glint>0){c.save();c.globalAlpha*=glint;star(c,-22,-25,'#fff1c2',4);c.restore();}
    c.restore();
  }
  function draw(c,key,p,time,opts,front){
    const mon=window.MeadowMonsters[key],a=p.action,t=p.elapsed;
    const rangedAttack=a==='attack'&&mon.ranged;
    const ruinsWaterAttack=rangedAttack&&['water_spirit','tide_priest'].includes(key);
    if(!mon.skills.includes(a)&&!rangedAttack)return;
    const floor=window.RegionPreview.floor,x=160+p.x,y=floor+p.y,tx=160+p.facing*103,ty=floor-34;
    const strength=clamp(t/.25)*(1-clamp((t-(window.MeadowMotion.durations[a]-.4))/.4));
    const spell=a==='attack'?'magic_strike':a;
    const color=key.includes('water')||key.includes('tide')?['#247cab','#76dced','#e9ffed']:key.includes('ash')||key.includes('lava')||key.includes('furnace')?['#c74735','#ffad4d','#fff0ab']:key.includes('star')||key.includes('rift')?['#6a4fad','#bd9cec','#f0e6ff']:['#7a8b60','#c4da88','#f4f1c2'];
    c.save();c.globalAlpha=strength;
    if(front&&!p.emberSkill&&!p.ruinsSkill&&!ruinsWaterAttack&&!p.ironBreak&&!p.giantSkill&&!p.mushroomPoison&&['strike','armor_break','poison','burn','magic_strike','curse'].includes(spell))target(c,tx,floor);
    if(p.riftSkill){
      window.RiftEffects.draw(c,key,p,time,opts,front);
    }else if(p.emberSkill){
      if(key==='ash_lord')window.AshLordTemplate.draw(c,p,time,opts,front);
      else window.EmberEffects.draw(c,key,p,time,opts,front);
    }else if(ruinsWaterAttack){
      window.RuinsWaterEffects.basic(c,key,p,time,opts,front);
    }else if(p.ruinsSkill){
      (key==='water_spirit'||key==='tide_priest'?window.RuinsWaterEffects:window.RuinsDarkEffects).draw(c,key,p,time,opts,front);
    }else if(p.treantSkill){
      window.MistTreantSkills.effects(c,p,time,opts,front);
    }else if(p.ancientRegen){
      window.AncientGuardRegen.effects(c,p,time,opts,front);
    }else if(p.wolfPounce){
      window.MistWolfPounce.effects(c,p,time,opts,front);
    }else if(p.mushroomPoison){
      window.ToxicMushroom.effects(c,p,time,opts,front);
    }else if(p.giantSkill){
      window.MineGiantSkills.effects(c,p,time,opts,front);
    }else if(p.ironBreak){
      window.IronGuardBreak.drawEffect(c,p,time,opts,front);
    }else if(spell==='guard'&&key==='ore_golem'){
      drawOreShield(c,p,time,opts,front);
    }else if(spell==='guard'||spell==='shield') {
      const grow=clamp(t/.6),rx=55*grow,ry=54*grow,cy=y-52;
      if(spell==='guard'){
        const points=[[x-rx,cy-ry*.45],[x-rx*.55,cy-ry],[x+rx*.55,cy-ry],[x+rx,cy-ry*.45],[x+rx*.7,cy+ry*.65],[x,cy+ry],[x-rx*.7,cy+ry*.65]];
        if(!front){c.globalAlpha=strength*.15;c.fillStyle=color[1];c.beginPath();points.forEach(([u,v],i)=>i?c.lineTo(u,v):c.moveTo(u,v));c.closePath();c.fill();}
        else for(let i=0;i<points.length;i++)line(c,...points[i],...points[(i+1)%points.length],color[i%3],2);
      }else{
        for(let n=0;n<110;n++){const angle=n/110*Math.PI*2,near=Math.sin(angle)>0;if(near!==front)continue;dot(c,x+Math.cos(angle)*rx,cy+Math.sin(angle)*ry,color[n%4===0?2:1],2);}
        if(front)for(let i=0;i<3;i++){const angle=time*2+i*2.1;star(c,x+Math.cos(angle)*rx,cy+Math.sin(angle)*ry,color[2],3);}
      }
      if(!front)ring(c,x,floor,rx,8,color[1]);
    }else if(spell==='heal'){
      if(!front)ring(c,x,floor,35+Math.sin(t*3)*4,8,'#a9d48b');
      else for(let i=0;i<14;i++){const u=(t*.55+i/14)%1,px=x+Math.sin(i*2.4+u*3)*31,py=floor-u*100;c.globalAlpha=strength*Math.sin(u*Math.PI);dot(c,px,py,'#b9eaa5',3);dot(c,px+2,py-2,'#edf5ca',2);if(i%4===0)star(c,px,py,'#def5b7',3);}
    }else if(spell==='evasion'){
      if(!front)for(let i=0;i<4;i++)line(c,x+p.facing*(25+i*7),y-29-i*13,x+p.facing*(42+i*7),y-29-i*13,color[1],1);
    }else if(spell==='strike'||spell==='armor_break'){
      if(front&&t>.7&&t<1.3){const phase=clamp((t-.7)/.6);for(let i=0;i<24;i++){const angle=-1.9+i*.1;dot(c,tx+Math.cos(angle)*(15+phase*16),ty+Math.sin(angle)*29,color[i%3],3);}}
      if(!front&&t>.85){const phase=clamp((t-.85)/.9);c.globalAlpha=strength*(1-phase);ring(c,tx,floor,8+phase*48,3+phase*9,color[1]);for(let i=0;i<10;i++){const u=(i-5)*7*phase;dot(c,tx+u,floor-Math.sin(phase*Math.PI)*(10+i%4*6),color[i%3],2+i%2);}}
      if(front&&spell==='armor_break'&&t>.9){const spread=clamp((t-.9)/.65)*12;line(c,tx-11-spread,ty-12,tx-9-spread,ty+10,'#cbd1c8');line(c,tx+11+spread,ty-12,tx+9+spread,ty+10,'#cbd1c8');line(c,tx-2,ty-10,tx+3,ty,'#ffd397');line(c,tx+3,ty,tx-3,ty+9,'#ffd397');}
    }else if(spell==='curse'){
      if(!front)ring(c,tx,floor,30,9,'#8f75bd',t);
      if(front&&t>.5){const radius=20*clamp((t-.5)/.35);ring(c,tx,ty-30,radius,radius*.55,'#b297e1',t);for(let i=0;i<5;i++){const angle=i/5*Math.PI*2+t*.8;const next=angle+Math.PI*.8;line(c,tx+Math.cos(angle)*radius,ty-30+Math.sin(angle)*radius*.55,tx+Math.cos(next)*radius,ty-30+Math.sin(next)*radius*.55,'#c7b3ea',1);}for(let i=0;i<7;i++)dot(c,tx+Math.sin(i*2+t)*18,ty-25+(t*21+i*7)%42,'#8c70b4',2);}
    }else if(front){
      const start=a==='attack'?.32:.65,duration=a==='attack'?.42:.55,travel=clamp((t-start)/duration);
      const bx=(160+p.facing*25)*(1-travel)+tx*travel,by=(y-57)*(1-travel)+ty*travel;
      if(t<start)star(c,x+p.facing*25,y-57,color[1],3+clamp(t/start)*7);
      if(t>=start&&travel<1){
        if(spell==='poison')for(let i=0;i<9;i++)dot(c,bx+Math.cos(i*2+t*8)*9,by+Math.sin(i*3+t*5)*7,['#bda1d4','#9cad6e','#e1d5b2'][i%3],2+i%2);
        else{for(let i=5;i>0;i--)dot(c,bx-p.facing*i*4,by+Math.sin(t*14-i)*2,color[0],2);star(c,bx,by,color[1],7);}
      }
      if(travel===1){
        const age=t-start-duration;
        if(spell==='burn')for(let i=-2;i<=2;i++)flame(c,tx+i*7,floor,16+(Math.sin(t*9+i)*.5+.5)*20,t+i,['#c94e47','#f8a24c','#ffe8a0']);
        else if(spell==='poison')for(let i=0;i<17;i++){const u=(age*.5+i/17)%1;c.globalAlpha=strength*(1-u);dot(c,tx+Math.sin(i*5+u)*24,floor-8-u*46,i%2?'#a2ba78':'#b99bc4',2+i%3);}
        else{c.globalAlpha=strength*(1-clamp(age/.6));ring(c,tx,ty,5+age*42,5+age*35,color[1]);star(c,tx,ty,color[2],13+age*12);}
      }
    }
    c.restore();
  }
  window.RegionSkills={draw,descriptions,monsterDescriptions:{...window.RiftMotion.descriptions,ash_demon:{cinder_breath:'候选 · 烬火吐息：收臂吸气、额焰蓄亮 → 前倾持续喷焰 → 余烬散落。火属性攻击，正式伤害与灼烧规则待确认。'},lava_beast:{magma_spines:'候选 · 熔脊喷发：四足压低、背脊升温 → 三股熔岩弧线抛射 → 熔岩落地迸溅。火属性攻击；三股为视觉表现，正式段数与范围待确认。'},furnace_guard:{furnace_ray:'候选 · 炉芯放射：双臂撑开、胸炉开启 → 白热火流贯穿前方 → 关闭炉门、烟囱泄压。火属性精英技能，正式伤害与规则待确认。'},ash_lord:{burn:'复用 MonsterTemplate_v1.html 的炎灼：抬杖聚能 → 四道湍流火柱错位升起 → 火星消散。沿用原演示火焰着色算法。',magic_strike:'复用 MonsterTemplate_v1.html 的灵击：六枚魂晶环绕 → 逐枚弧线飞出 → 冥雷连接、星芒爆裂。保留原魂晶像素与色板。'},ruin_skeleton:{grave_blade:'候选 · 冥火骨刃：屈肘把残刃举到身后 → 肩肘带手腕向前挥刀 → 刀锋幽火随刃收尾。暗属性残刃攻击，伤害及附加规则待确认。'},water_spirit:{whirlpool_bolt:'候选 · 涡流弹：水体收拢、尾流旋卷 → 推出旋转水团 → 水花飞溅、涟漪扩散。水属性攻击，正式数值待确认。'},ruin_knight:{oath_counter:'候选 · 亡誓反斩：抬起贝纹盾迎击 → 剑臂收向身后 → 肩肘带手腕向上挑斩。暗属性格挡反击方向；此处为完整演示，正式触发条件待确认。'},tide_priest:{rising_tide:'候选 · 逆潮结界：权杖引水 → 双侧水幕逆流上涌 → 流动水帘护住身前。水属性防护方向，护盾数值及规则待确认。',tidal_verdict:'候选 · 唤潮裁决：水流汇入三叉杖 → 抬杖下令 → 卷浪推进、浪花回落。水属性首领攻击，一次浪击演示，正式范围和数值待确认。'},mist_treant:{root_prison:'候选 · 盘根囚笼：掌枝下压 → 活根翻土、弯卷生长 → 多根错位缠合。根系束缚与控制方向，伤害、时长待确认。',royal_dew:'候选 · 灵果甘霖：枝冠轻展、灵果凝露 → 甘露落向树心 → 心纹舒展、恢复微光散开。治疗方向，回复量及附加规则待确认；预览不修改生命值。'},ancient_guard:{heal:'扎根吸收生命光 → 绿意沿树干上行 → 树心脉动、枝臂舒展 → 枝头与根端萌发新叶。再生仍为恢复自身生命，演示不改变实际生命值。'},mist_wolf:{mist_pounce:'候选 · 雾隐扑袭：伏身收腿 → 蹬地腾空，前爪伸出扑咬 → 轻落退回。拟替换重击的一次物理扑袭；薄雾为动作表现，尚未配置隐身、闪避或额外伤害。'},toxic_mushroom:{poison:'菌盖收缩、盖缘聚毒 → 喷出浓密毒孢 → 紫雾中毒孢炸开并缓缓飘散。两侧毒液持续凝滴、坠落和溅开；仅演示魔法攻击及中毒效果。'},mine_giant:{crystal_resonance:'候选 · 晶核共振：张臂唤醒矿晶 → 碎矿悬浮、晶冠胸核共鸣 → 扇形晶能波向前扩散。土属性 Boss 技能；波纹为视觉层次，正式伤害、段数与范围待确认。',vault_collapse:'候选 · 穹顶崩塌：抬臂牵动洞顶 → 岩层开裂、巨岩坠落 → 岩块崩碎、尘浪铺开。土属性 Boss 环境攻击，正式范围与附加规则待确认。'},iron_guard:{armor_break:'压低重心、抬镐蓄力 → 重劈后短暂顿住 → 金属甲片炸开、地裂与冲击尘浪。目录语义仍为物理攻击并降低物防。'},ore_golem:{guard:'收拢身体 → 铜金盾缘升起 → 琥珀矿晶点亮，凝成厚岩鸢盾。目录语义仍为提高自身减伤。'}},camera:p=>{if(p.riftSkill)return window.RiftMotion.camera(p);if(p.emberSkill)return window.EmberMotion.camera(p);if(p.ruinsSkill)return window.RuinsMotion.camera(p);if(p.treantSkill)return window.MistTreantSkills.camera(p);if(p.giantSkill)return window.MineGiantSkills.camera(p);if(p.ironBreak)return window.IronGuardBreak.camera(p);const k=p.action==='strike'||p.action==='armor_break';const age=p.elapsed-.9;return k&&age>0&&age<.25?{x:Math.sin(age*95)*2*(1-age/.25),y:Math.cos(age*83)*(1-age/.25)}:{x:0,y:0};}};
})();
