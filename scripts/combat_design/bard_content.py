"""Build the approved bard extension into the executable CSV package, offline only."""
import csv
import hashlib
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[2]/'system_settings/agent_world/combat/data'
# IDs are stable identities used by snapshots and artwork, not positional UI indexes.
JOBS = [
 ('bard','吟游诗人','novice',1,10,10,10,(1,3,3,1,3,1)),
 ('musician','乐师','bard',2,30,12,20,(1,4,5,1,4,1)),
 ('cursesinger','咒歌者','bard',2,30,10,22,(1,4,6,1,3,1)),
 ('battleconductor','战歌指挥','musician',3,50,20,28,(1,5,6,2,5,1)),
 ('requiemsinger','镇魂歌者','musician',3,50,18,30,(1,4,6,2,6,1)),
 ('virtuoso','琴圣','cursesinger',3,50,18,28,(1,6,7,1,4,1)),
 ('sonomancer','魔音术士','cursesinger',3,50,14,32,(1,4,9,1,4,1)),
]
# number, name, job, learn level, kind, cooldown, values, effect, element, duration
SKILLS = [
 (76,'音刃','bard',10,'active',2,(1.4,1.6,1.8),'damage','none',0),
 (77,'鼓舞小调','bard',15,'active',4,(.08,.10,.12),'encourage','',2),
 (78,'乐感','bard',20,'passive',0,(.05,.075,.10),'passive_percent','',0),
 (79,'乐器精通','bard',10,'passive',0,(.10,.15,.20),'passive_equipment_percent','',0),
 (80,'皮甲精通','bard',10,'passive',0,(1,2,3),'passive_equipment_duration','',0),
 (81,'奋进乐章','musician',30,'active',5,(.10,.15,.20),'melody_attack','',3),
 (82,'宁静乐章','musician',40,'active',5,(.08,.10,.12),'melody_guard','',3),
 (83,'演奏精通','musician',45,'passive',0,(.10,.15,.20),'passive_music_cost','',0),
 (84,'蚀心音波','cursesinger',30,'active',3,(2.2,2.5,2.8),'damage','dark',0),
 (85,'破音','cursesinger',40,'active',4,(1.2,1.4,1.6),'accuracy_break','wind',2),
 (86,'音律穿透','cursesinger',45,'passive',0,(.10,.15,.20),'passive_magic_penetration','',0),
 (87,'英雄战歌','battleconductor',50,'active',5,(.20,.25,.30),'melody_attack','',3),
 (88,'指挥艺术','battleconductor',60,'passive',0,(.10,.15,.20),'passive_melody_power','',0),
 (89,'凯旋终章','battleconductor',70,'active',5,(2,2.3,2.6),'extend_melody','light',0),
 (90,'镇魂曲','requiemsinger',50,'active',5,(.10,.15,.20),'requiem','',2),
 (91,'安魂庇佑','requiemsinger',60,'passive',0,(.05,.075,.10),'passive_bard_sanctuary','',0),
 (92,'封声乐句','requiemsinger',70,'active',5,(1.2,1.4,1.6),'silence','wind',1),
 (93,'回旋琴音','virtuoso',50,'active',3,(.85,1,1.15),'beats','wind',0),
 (94,'余音馈赠','virtuoso',60,'passive',0,(.30,.40,.50),'passive_bard_echo','',2),
 (95,'华彩乐章','virtuoso',70,'active',5,(3,3.4,3.8),'beat_finisher','light',0),
 (96,'共鸣音爆','sonomancer',50,'active',2,(2.2,2.5,2.8),'resonance','dark',3),
 (97,'不谐余震','sonomancer',60,'passive',0,(.05,.075,.10),'passive_bard_resonance','',0),
 (98,'毁灭终曲','sonomancer',70,'active',5,(3,3.5,4),'resonance_finisher','dark',0),
]
DESCRIPTIONS = {
 'damage':'单体音律攻击，倍率乘魔攻，按招式属性结算',
 'encourage':'鼓舞一名存活友方（可含自己），提高物攻与魔攻，持续2回合；同类增益取最高',
 'passive_percent':'魔攻提高5%／7.5%／10%',
 'passive_equipment_percent':'持乐器时，乐器武器魔攻贡献提高10%／15%／20%',
 'passive_equipment_duration':'头、身体、手、脚四件皮甲齐穿，自己施加的所有音律效果持续时间+1／2／3回合；不增加伤害、冷却或层数',
 'melody_attack':'全体存活友方物攻与魔攻提高，持续3回合；每人只能维持一首主旋律，同类取最高',
 'melody_guard':'全体存活友方减伤，持续3回合；替换自己此前的主旋律，总减伤最多60%',
 'passive_music_cost':'辅助乐曲耗蓝降低10%／15%／20%',
 'accuracy_break':'风属性直接伤害并降低目标命中5／7.5／10个百分点，持续2回合',
 'passive_magic_penetration':'自身直接魔法攻击忽略目标10%／15%／20%魔防',
 'passive_melody_power':'自己主旋律的增益数值额外提高10%／15%／20%（乘算）',
 'extend_melody':'光属性单体伤害，将自己当前主旋律延长1回合；每首旋律最多延长一次',
 'requiem':'全体敌人物攻与魔攻降低10%／15%／20%，持续2回合；Boss减半',
 'passive_bard_sanctuary':'受到自己音律减益的敌人对友方造成伤害额外降低5%／7.5%／10%，计入60%总减伤上限',
 'silence':'风属性单体伤害，命中后封主动技能1回合，可普攻；Boss仅50%成功，封声结束后至少1回合免疫封声',
 'beats':'风属性三段攻击，至少一段命中后获得1层自身节拍，最多3层',
 'passive_bard_echo':'直接攻击命中后30%／40%／50%概率随机给单名队友小增益，持续2回合：攻强8%、命中5个百分点或暴击3个百分点；无其他存活队友则给自己，每次攻击行动最多触发一次',
 'beat_finisher':'光属性单体伤害；3层节拍时消耗全部，倍率变为4／4.5／5',
 'resonance':'暗属性单体伤害，命中给目标叠加1层自己的共振，最多3层，持续3回合并刷新',
 'passive_bard_resonance':'对带有自己共振的敌人，自身直接伤害提高5%／7.5%／10%',
 'resonance_finisher':'暗属性单体伤害，命中时消耗自己的共振，每层追加0.5／0.6／0.7倍魔攻，三层合计4.5／5.3／6.1倍',
}


def build():
    tables={f.stem:list(csv.DictReader(f.open(newline=''))) for f in DATA.glob('*.csv')}
    if any(r['id']=='job.bard' for r in tables['professions']):
        raise ValueError('Bard catalog already installed; do not append duplicate identities')
    for key,name,parent,stage,level,hp,mp,growth in JOBS:
        row=dict(tables['professions'][0]);row.update(id='job.'+key,name=name,parent_id='job.'+parent,stage=str(stage),required_level=str(level),hp_growth=str(hp),mp_growth=str(mp))
        row.update({s+'_growth':str(v) for s,v in zip(('strength','dexterity','intelligence','vitality','spirit','luck'),growth)})
        tables['professions'].append(row)
    for num,name,job,level,kind,cooldown,values,action,element,duration in SKILLS:
        sid=f'skill.player.{num:03}'
        tables['skills'].append(dict(id=sid,name=name,profession_id='job.'+job,learn_level=str(level),kind=kind,enabled='1'))
        for rank,value in enumerate(values,1):
            rid=f'{sid}.r{rank}'
            support=action in ('encourage','melody_attack','melody_guard','requiem')
            tables['skill_levels'].append(dict(id=rid,skill_id=sid,rank=str(rank),required_level=str(level+10*(rank-1)),cost_base='0' if kind=='passive' else '10' if support else '8',cost_per_level='0' if kind=='passive' else '.8',cost_rank_factor=str((1,1.15,1.3)[rank-1]),cooldown_rounds=str(cooldown),description=DESCRIPTIONS[action],enabled='1'))
            fx=dict(id=rid+'.e1',skill_level_id=rid,code=action if kind=='passive' else 'bard_music',stat='magic_attack' if kind=='active' or num==78 else 'weapon_attack' if num==79 else '',value=str(value),duration=str(duration),target='self' if kind=='passive' else 'enemy',damage_type='',group=action,hits='3' if num==93 else '1',chance='1',element='')
            if num==79:fx['group']='instrument'
            if num==80:fx['group']='leather_armor_set'
            # Music is domain-dispatched, carrying normal damage/element parameters in the row.
            if kind=='active':fx.update(damage_type='magic',element=element)
            tables['skill_effects'].append(fx)
    # Bard leather access is through its own four-piece duration mastery.
    for row in tables['equipment_templates']:
        if row.get('equipment_type')=='leather_armor':row['required_mastery']+=';skill.player.080'
    base=next(r for r in tables['equipment_templates'] if r['id']=='equip.mage_staff')
    for level,name in zip((10,30,50,70,90),('旅人竖琴','吟风竖琴','月弦竖琴','星歌竖琴','苍穹竖琴')):
        tid='equip.instrument'+('' if level==10 else f'.{level}')
        row=dict(base,id=tid,name=name,root_job='bard',level_min=str(level),level_max=str(min(99,level+20)),equipment_type='instrument',required_mastery='skill.player.079',grip='two_handed')
        tables['equipment_templates'].append(row)
        for a in [r for r in tables['equipment_affixes'] if r['equipment_id']=='equip.mage_staff']:
            tables['equipment_affixes'].append(dict(a,id=tid+'.'+a['affix_id'],equipment_id=tid))
        for pool in sorted({r['pool_id'] for r in tables['equipment_pools']}):
            tables['equipment_pools'].append(dict(id=pool+'.'+tid,pool_id=pool,equipment_id=tid,weight='1'))
    # Rebuild only typed/mastered permissions, and give universal novice/accessory gear to new jobs.
    jobs={r['id']:r for r in tables['professions']};skills={r['id']:r for r in tables['skills']}
    controlled={r['id'] for r in tables['equipment_templates'] if r.get('required_mastery')}
    tables['equipment_professions']=[r for r in tables['equipment_professions'] if r['equipment_id'] not in controlled]
    for gear in tables['equipment_templates']:
        required=gear.get('required_mastery','')
        owners={skills[s]['profession_id'] for s in required.split(';')} if required else set()
        for jid in jobs:
            path=[];cursor=jid
            while cursor:path.append(cursor);cursor=jobs[cursor]['parent_id']
            universal=not required and jid in {'job.'+j[0] for j in JOBS} and gear['id'] in {'equip.training_sword','equip.body','equip.hands','equip.feet','equip.charm','equip.ring'}
            if owners.intersection(path) or universal:
                tables['equipment_professions'].append(dict(id=gear['id']+'.'+jid,equipment_id=gear['id'],profession_id=jid))
    manifest=json.loads((DATA/'manifest.json').read_text());manifest.update(version='combat-1.0.28',engine_schema=9)
    changed={'professions','skills','skill_levels','skill_effects','equipment_templates','equipment_professions','equipment_affixes','equipment_pools'}
    for name,rows in tables.items():
        if name not in changed:continue
        f=DATA/(name+'.csv')
        with f.open('w',newline='') as stream:
            writer=csv.DictWriter(stream,fieldnames=list(rows[0]),lineterminator='\n');writer.writeheader();writer.writerows(rows)
        manifest['files'][f.name]={'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'rows':len(rows)}
    (DATA/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')


if __name__=='__main__':build()
