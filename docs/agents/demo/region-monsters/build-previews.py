"""Build review-only HTML/catalogue snapshots and indexed art; never write application data."""
import base64
import csv
import hashlib
import json
import re
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
ASSETS = ROOT / 'frontend_react/src/assets/combat'
CATALOG = ROOT / 'system_settings/agent_world/combat/data'
# Family, original facing, anatomy / attack direction. Coordinates use the 128px template.
ART = {
 'mine_rat': ('quadruped',1,'灰褐短毛 · 铜金矿屑','耳尖轻摆，长尾蜷动','短足交替，贴地快跑','压低前身，向前啮咬'),
 'ore_golem': ('golem',1,'灰岩块面 · 琥珀矿晶','核心明灭，石肩缓动','沉重踏步，双臂交替','岩拳后收，向前砸击'),
 'iron_guard': ('fighter',1,'铁甲铆钉 · 铜色矿镐','胸炉呼吸，镐柄微动','甲靴迈步，矿镐随行','转肩蓄势，挥镐横劈'),
 'mine_giant': ('golem',-1,'深灰巨岩 · 金色晶冠','晶簇微光，巨臂低垂','重步推进，晶冠起伏','巨臂抬起，砸向前方'),
 'toxic_mushroom': ('mushroom',1,'紫色菌盖 · 奶白菌柄','菌盖轻摇，菌柄呼吸','短腿蹦跳，菌盖回弹','收拢菌盖，弹出孢子'),
 'mist_wolf': ('quadruped',1,'银灰毛簇 · 冰蓝雾尾','耳尖警觉，长尾缓摆','前后足交错，低姿疾行','伏身蓄力，跃起扑咬'),
 'ancient_guard': ('tree',1,'盘根树皮 · 嫩绿叶簇','树冠轻摇，枝指舒展','树根交替，沉稳前行','抬起枝臂，横扫前方'),
 'mist_treant': ('tree',1,'苍翠树冠 · 紫色树果','宽冠摇曳，树心微亮','粗根迈步，枝叶随行','枝冠聚光，发出灵种'),
 'ruin_skeleton': ('fighter',1,'象牙骨架 · 破旧布带','头骨轻转，指骨微动','骨腿交替，短步前行','转肩蓄势，挥动残刃'),
 'water_spirit': ('spirit',1,'透明水滴 · 青蓝流尾','水冠摆动，尾流回旋','悬浮滑行，水尾拖曳','水体聚拢，释放水弹'),
 'ruin_knight': ('fighter',1,'锈蚀板甲 · 贝纹圆盾','重甲呼吸，披风轻摆','稳步前行，盾剑随肩','剑臂后收，挥剑斩落'),
 'tide_priest': ('caster',1,'青金祭袍 · 潮汐权杖','衣摆浮动，水珠环绕','乘潮悬行，袍摆翻动','抬杖聚水，放出潮弹'),
 'ash_demon': ('demon',1,'炭黑皮肤 · 橙红额焰','额焰跳动，尾尖摇晃','短足跳行，尾焰拖动','爪臂前探，喷出火团'),
 'lava_beast': ('quadruped',1,'黑曜岩甲 · 熔红裂隙','背棘起伏，熔纹明灭','四足重踏，岩甲随行','压低头部，熔角冲撞'),
 'furnace_guard': ('fighter',1,'厚铁炉甲 · 炽红炉膛','炉芯明灭，铁拳微动','铁靴重步，炉肩摆动','蓄起重拳，熔锤砸落'),
 'ash_lord': ('caster',1,'赤金冠甲 · 焰流长袍','火冠燃动，残袍飘动','浮焰前行，披摆翻卷','权杖引火，释放焰弹'),
 'rift_walker': ('fighter',1,'暗紫兜帽 · 银色双刃','兜帽轻垂，披带飘动','快速交替，双刃随行','收刃蓄力，交错突刺'),
 'star_golem': ('golem',1,'悬浮星岩 · 紫色晶核','石块悬浮，星核脉动','碎岩移步，双臂摇摆','聚拢岩臂，星拳前击'),
 'rift_lord': ('caster',1,'紫晶尖冠 · 裂隙长袍','冠尖微亮，袍角漂浮','悬浮移行，披带拖曳','抬手聚星，释出暗芒'),
 'star_overlord': ('dragon',1,'金纹龙甲 · 星空双翼','翼膜轻展，星尾摆动','龙爪迈步，双翼低振','昂首蓄势，吐出星焰'),
}
RUINS_SKILLS = {
 'ruin_skeleton': {'grave_blade':'冥火骨刃'},
 'water_spirit': {'whirlpool_bolt':'涡流弹'},
 'ruin_knight': {'oath_counter':'亡誓反斩'},
 'tide_priest': {'rising_tide':'逆潮结界','tidal_verdict':'唤潮裁决'},
}
RIFT_SKILLS = {'rift_walker':{'rift_cross':'双刃裂步'},'star_golem':{'orbital_collapse':'星环崩解'},'rift_lord':{'void_loom':'裂界织刃'},'star_overlord':{'eclipse_breath':'星蚀龙息','astral_wings':'星翼裁决'}}
EMBER_SKILLS = {'ash_demon':{'cinder_breath':'烬火吐息'},'lava_beast':{'magma_spines':'熔脊喷发'},'furnace_guard':{'furnace_ray':'炉芯放射'}}
REGIONS = [
 ('abandoned_mine','AbandonedMine','废弃矿坑','的矿脉守望者','碎石滚过旧轨道，矿晶在黑暗中静静发亮。','尘埃 · 矿晶','#a37842', ['mine_rat','ore_golem','iron_guard','mine_giant']),
 ('mist_forest','MistForest','迷雾林地','的林间秘影','雾气掠过树根，林间的住民正悄悄苏醒。','薄雾 · 叶声','#648665',['toxic_mushroom','mist_wolf','ancient_guard','mist_treant']),
 ('sunken_ruins','SunkenRuins','沉没遗迹','的潮声回响','潮水退去之后，古老的守卫依然留在石阶上。','潮湿 · 水光','#408c9f',['ruin_skeleton','water_spirit','ruin_knight','tide_priest']),
 ('ember_fortress','EmberFortress','灰烬堡垒','的余火守卫','炉火映亮残破城墙，沉重的脚步从灰烬中传来。','余烬 · 热浪','#b46745',['ash_demon','lava_beast','furnace_guard','ash_lord']),
 ('star_rift','StarRift','星蚀裂隙','的星夜来客','星光落在悬浮的岩台上，裂隙另一侧有身影靠近。','星尘 · 静夜','#8074b2',['rift_walker','star_golem','rift_lord','star_overlord']),
]
def rows(name):
 with (CATALOG / (name+'.csv')).open() as f: return list(csv.DictReader(f))
def encode(key, boss):
 n=256 if boss else 128
 source=Image.open(ASSETS / ('monster-'+key.replace('_','-')+'-v1.png')).convert('RGBA')
 source=source.crop(source.getchannel('A').point(lambda v:255 if v>=128 else 0).getbbox())
 scale=min(n*.9375/source.width,n*.89/source.height)
 size=(round(source.width*scale),round(source.height*scale))
 source=source.resize(size,Image.Resampling.NEAREST)
 canvas=Image.new('RGBA',(n,n));canvas.paste(source,((n-size[0])//2,round(n*119/128)-size[1]))
 rgba=list(canvas.get_flattened_data());occupied=[p[:3] for p in rgba if p[3]>=128]
 strip=Image.new('RGB',(len(occupied),1));strip.putdata(occupied)
 quantized=strip.quantize(colors=96 if boss else 64,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
 pal=quantized.getpalette();colors=['#%02x%02x%02x'%tuple(pal[i:i+3]) for i in range(0,(96 if boss else 64)*3,3)]
 indices=iter(quantized.get_flattened_data())
 return dict(width=n,height=n,sourceFacing=ART[key][1],palette=colors,pixels=base64.b64encode(bytes(next(indices)+1 if p[3]>=128 else 0 for p in rgba)).decode())

def build():
 monsters={m['id']:m for m in rows('monsters')}; actions=rows('monster_actions'); labels={s['id'].split('.')[-1]:s['name'] for s in rows('skills') if s['id'].startswith('skill.monster.')}
 template=(HERE.parent/'MossCave_v1.html').read_text()
 for region,file,name,subtitle,intro,weather,color,keys in REGIONS:
  config=dict(id=region,name=name,english=region.replace('_',' ').upper(),weather=weather,color=color,background=f'../../../frontend_react/src/assets/combat/battle-{region.replace("_","-")}-pixel-v2.png',floor=124 if region=='star_rift' else 149,spriteScale=.84 if region=='star_rift' else 1,monsters={},labels=labels.copy())
  sprites={}
  for i,key in enumerate(keys):
   m=monsters['monster.'+key];family,facing,material,idle,move,attack=ART[key];skills=[a['skill_id'].split('.')[-1] for a in actions if a['monster_id']==m['id'] and a['action_kind']=='skill']
   if key=='mine_giant':
    skills=['crystal_resonance','vault_collapse'];config['labels'].update(crystal_resonance='晶核共振',vault_collapse='穹顶崩塌')
   if key=='mist_wolf':
    skills=['mist_pounce'];config['labels']['mist_pounce']='雾隐扑袭'
   if key=='mist_treant':
    skills=['root_prison','royal_dew'];config['labels'].update(root_prison='盘根囚笼',royal_dew='灵果甘霖')
   if key in RUINS_SKILLS:
    skills=list(RUINS_SKILLS[key]);config['labels'].update(RUINS_SKILLS[key])
   if key in RIFT_SKILLS:
    skills=list(RIFT_SKILLS[key]);config['labels'].update(RIFT_SKILLS[key])
   if key in EMBER_SKILLS:
    skills=list(EMBER_SKILLS[key]);config['labels'].update(EMBER_SKILLS[key])
   rank={'normal':'普通魔物','elite':'精英魔物','boss':'区域首领'}[m['rank']]
   element={'':'无属性','earth':'土','wind':'风','dark':'暗','water':'水','fire':'火'}[m['element']]
   ranged=m['profile']=='magic'
   config['monsters'][key]=dict(id=m['id'],name=m['name'],english=key.replace('_',' ').upper(),level=m['level_min']+'–'+m['level_max'],index=f'{i+1:02}',rank=rank,color=color,pale='#f4f4ee',material=material,attack=attack,role=f'{element} · {rank}',description=f'{material}。{idle}；{move}。攻击时{attack}。',hints=[idle,move,attack,'闪白、回震与恢复 · 共用版','原色像素炸开，碎片落地保留'],effect=['#f6eacb',color,'#7d7691'],skills=skills,family=family,ranged=ranged,scale=(1.08 if family=='caster' else 1.2) if m['rank']=='boss' else 1,hover=family in ('spirit','caster'),sourceFacing=facing)
   if key=='mine_giant':
    config['monsters'][key]['skillNote']='候选技能：晶核共振 / 穹顶崩塌。替换旧破甲击与重击；矿晶共鸣与洞顶落岩，正式范围、伤害及规则待确认。'
   if key=='mist_wolf':
    config['monsters'][key]['skillNote']='候选技能：雾隐扑袭，拟替换重击。伏身藏雾、蹬地跃扑、伸爪扑咬；正式配置待确认。'
   if key=='mist_treant':
    config['monsters'][key]['skillNote']='候选技能：盘根囚笼 / 灵果甘霖。活根缠缚与灵果凝露滋养树心；治疗量及控制规则待确认。'
   if key in RUINS_SKILLS:
    config['monsters'][key]['skillNote']='候选技能：'+' / '.join(RUINS_SKILLS[key].values())+'。按形象和属性重做，正式数值及附加规则待确认。'
   if key in EMBER_SKILLS:
    config['monsters'][key]['skillNote']='候选技能：'+' / '.join(EMBER_SKILLS[key].values())+'。按形象及火属性重做，正式数值及规则待确认。'
   if key in RIFT_SKILLS:
    config['monsters'][key]['skillNote']='候选技能：'+' / '.join(RIFT_SKILLS[key].values())+'。按形象与'+('风' if key=='rift_walker' else '暗')+'属性重做，正式伤害、段数及附加规则待确认。'
   if key=='ash_lord':
    config['monsters'][key]['skillNote']='复用 MonsterTemplate_v1.html：双发暗焰法球 / 炎灼火柱 / 六魂晶灵击。仅适配区域舞台与播放控制。'
   sprites[key]=encode(key,m['rank']=='boss')
  (HERE/(region+'.js')).write_text('/* Generated review-only snapshot; no runtime catalogue writes. */\nwindow.RegionPreview = '+json.dumps(config,ensure_ascii=False,separators=(',',':'))+';\nwindow.MeadowMonsters=window.RegionPreview.monsters;\nwindow.MeadowSpriteData='+json.dumps(sprites,separators=(',',':'))+';\n')
  html=re.sub(r'  <script defer.*?</script>\n','',template)
  scripts=[f'region-monsters/{region}.js','region-monsters/toxic-mushroom.js','region-monsters/characters.js','sprout-meadow/renderer.js','region-monsters/iron-guard-break.js','region-monsters/mine-giant-skills.js','region-monsters/mist-wolf-pounce.js','region-monsters/ancient-guard-regen.js','region-monsters/mist-treant-skills.js','region-monsters/ruins-pixels.js','region-monsters/treant-roots.js','region-monsters/treant-dew.js','region-monsters/mine-giant-boss-effects.js','region-monsters/ruins-motion.js','region-monsters/ruins-connected.js','region-monsters/ruins-actors.js','region-monsters/ruins-dark-effects.js','region-monsters/ruins-water-effects.js','region-monsters/ash-lord-template-pixels.js','region-monsters/ember-motion.js','region-monsters/ember-effects.js','region-monsters/ash-lord-template.js','region-monsters/rift-motion.js','region-monsters/rift-effects.js','region-monsters/rift-boss-effects.js','region-monsters/skills.js','region-monsters/scene.js','sprout-meadow/motion.js','region-monsters/motion.js','sprout-meadow/pixel-shatter.js','sprout-meadow/effects.js','region-monsters/effects.js','region-monsters/studio.js']
  html=html.replace('</head>','  <link rel="stylesheet" href="./region-monsters/studio.css">\n'+''.join(f'  <script defer src="./{s}?v={hashlib.sha256((HERE.parent/s).read_bytes()).hexdigest()[:10]}"></script>\n' for s in scripts)+'</head>')
  tabs='\n'.join(f'<button class="monster-tab" data-monster="{key}" aria-pressed="{str(i==0).lower()}"><canvas width="64" height="64" aria-hidden="true"></canvas><span><b>{config["monsters"][key]["name"]}</b><small>{i+1:02} / {key.replace("_"," ").upper()}</small></span><i>{config["monsters"][key]["level"]}</i></button>' for i,key in enumerate(keys))
  html=re.sub(r'(<nav class="monster-tabs"[^>]*>).*?(</nav>)',lambda m:m[1]+tabs+m[2],html,flags=re.S)
  html=html.replace('四只洞窟魔物','四只区域魔物').replace('苔石洞窟',name).replace('的幽光住民',subtitle).replace('石缝透着微光，洞窟深处传来了轻轻的脚步声。',intro).replace('MOSS CAVE',config['english']).replace('微凉 · 滴水',weather).replace('VOL. 04','VOL. 01').replace('02 · MONSTER STUDY',f'{REGIONS.index((region,file,name,subtitle,intro,weather,color,keys))+3:02} · MONSTER STUDY').replace('☾ 洞窟暗光','☾ 环境暗光').replace('已确认技能演示','技能视觉预览（含待确认候选）')
  html=re.sub(r'<p>沿用新芽草甸第六版.*?</p>','<p>形象与动作预览 · 待确认 · 演示不参与战斗结算</p>',html)
  nav='<nav class="region-nav" aria-label="区域预览"><a href="./SproutMeadow_v1.html">新芽草甸</a><a href="./MossCave_v1.html">苔石洞窟</a>'+''.join(f'<a href="./{f}_v1.html"'+(' aria-current="page"' if r==region else '')+f'>{n}</a>' for r,f,n,*_ in REGIONS)+'</nav>'
  html=html.replace('<main class="studio">','<main class="studio">'+nav)
  first=config['monsters'][keys[0]]
  html=html.replace('大耳朵捕捉着洞窟里的回声，双翼从肩部轻轻振动。',first['description']).replace('绒紫身体 · 粉色耳膜',first['material']).replace('物理普攻 · 俯冲扑咬',first['attack']).replace('风 · 普通型',first['role'])
  html=html.replace('当前技能：闪身。技能表现仅作视觉预览。','目录已有技能的视觉预览，选择按钮播放。')
  html=html.replace('洞穴蝙蝠',first['name']).replace('CAVE BAT',first['english']).replace('Lv.10–14','Lv.'+first['level'])
  (HERE.parent/(file+'_v1.html')).write_text(html)
 print('Built five independent preview pages, 20 sprites; application assets untouched.')
if __name__=='__main__': build()
