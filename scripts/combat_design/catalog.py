"""战斗设计目录生成器；不连接 Django、不导入真实数据库。"""
from __future__ import annotations

import csv
import hashlib
import json
import re
from decimal import Decimal, ROUND_CEILING
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCUMENT = ROOT / 'docs/agents/Agent迷宫探索与战斗系统规划.md'
OUTPUT = ROOT / 'docs/data/combat'
STATS = ('strength', 'dexterity', 'intelligence', 'vitality', 'spirit', 'luck')
JOB_KEYS = dict(zip(
    ('新手 战士 法师 游侠 牧师 剑士 守卫 元素师 秘术师 弓手 刺客 祭司 自然使 '
     '剑圣 魔剑士 圣骑士 狂战士 炎术师 冰术师 咒术师 召唤师 神射手 猎人 '
     '影舞者 诡术师 神官 审判者 德鲁伊 守望者').split(),
    ('novice warrior mage ranger priest swordsman guardian elementalist occultist '
     'archer assassin cleric naturalist swordmaster spellblade paladin berserker '
     'pyromancer cryomancer warlock summoner sharpshooter hunter shadowdancer '
     'trickster highpriest inquisitor druid warden').split(), strict=True))
SKILL_NAMES = ('重斩 护体 健壮 魔力弹 魔法屏障 冥想 精准射击 闪身 灵巧 治愈术 圣光 信念 '
               '连斩 剑术精通 盾击 坚壁 灼烧术 元素专注 虚弱咒 秘术节流 蓄力箭 鹰眼 背刺 致命技巧 '
               '恢复祷言 治疗精通 荆棘术 自然韧性 破甲斩 剑意 魔刃斩 魔刃修习 圣盾 圣铠 狂怒击 不屈 '
               '炎爆 炽热 冰封术 寒霜护体 衰败咒 咒术延展 魔灵契约 契约精通 穿透箭 精准要害 '
               '猎杀标记 狩猎经验 影袭 影步 毒刃 毒术精通 大治愈术 神恩 审判之光 圣光精通 '
               '回春术 自然祝福 森林结界 守望意志').split()
# 编号固定，不能因文档排序改变身份；新增技能在末尾分配新编号，改名保留原编号。
SKILL_IDS = {name:f'skill.player.{index:03d}' for index,name in enumerate(SKILL_NAMES,1)}


def table(section: str) -> list[list[str]]:
    text = DOCUMENT.read_text()
    start = text.index(section)
    body = text[start:].split('\n### ', 1)[0]
    return [[cell.strip() for cell in line.strip('|').split('|')]
            for line in body.splitlines() if line.startswith('| ') and not line.startswith('| ---')][1:]


def effect(code: str, stat: str, value: float, duration: int = 0, target: str = 'enemy',
           damage_type: str = '', group: str = '', hits: int = 1) -> dict:
    return dict(code=code, stat=stat, value=value, duration=duration, target=target,
                damage_type=damage_type, group=group, hits=hits)


def damage(value: float, magic: bool = False, hits: int = 1) -> dict:
    return effect('damage', 'magic_attack' if magic else 'physical_attack', value,
                  damage_type='magic' if magic else 'physical', hits=hits)


def status(stat: str, value: float, duration: int, target: str = 'enemy') -> dict:
    return effect('modifier', stat, value, duration, target, group=stat)


def player_effects() -> dict[str, list[dict]]:
    heal = lambda value: effect('heal', 'healing', value, target='self')
    shield = lambda value, stat='magic_attack', duration=2: effect('shield', stat, value, duration, 'self', group='shield')
    dot = lambda value, kind='burn', magic=True: effect('dot', 'magic_attack' if magic else 'physical_attack', value, 3,
                                                     damage_type='magic' if magic else 'physical', group=kind)
    hot = lambda value: effect('hot', 'healing', value, 3, 'self', group='regeneration')
    return {
        '重斩': [damage(1.35)], '护体': [status('reduction', .20, 2, 'self')],
        '魔力弹': [damage(1.35, True)], '魔法屏障': [shield(1)],
        '精准射击': [damage(1.25), effect('attack_accuracy', '', .08)],
        '闪身': [status('evasion', .10, 2, 'self')], '治愈术': [heal(1.2)], '圣光': [damage(1.25, True)],
        '连斩': [damage(.85, hits=2)], '盾击': [damage(1.1), status('attack', -.15, 1)],
        '灼烧术': [damage(1.1, True), dot(.20)], '虚弱咒': [status('attack', -.20, 3)],
        '蓄力箭': [damage(1.8)], '背刺': [damage(1.5), effect('attack_critical', '', .15)],
        '恢复祷言': [hot(.55)], '荆棘术': [damage(1.1, True), status('accuracy', -.08, 2)],
        '破甲斩': [damage(1.8), status('physical_defense', -.20, 3)],
        '魔刃斩': [damage(.9), damage(.9, True), effect('shared_hit', '', 1)],
        '圣盾': [shield(1.2, 'healing', 3), heal(.5)],
        '狂怒击': [damage(1.6), effect('missing_hp_damage', '', .5)],
        '炎爆': [damage(1.8, True), dot(.25)], '冰封术': [damage(1.5, True), status('attack', -.20, 2)],
        '衰败咒': [dot(.4, 'decay'), status('defense', -.15, 3)],
        '魔灵契约': [dot(.5, 'contract')], '穿透箭': [damage(1.8), effect('attack_penetration', '', .20)],
        '猎杀标记': [status('damage_taken', .20, 3)], '影袭': [damage(.65, hits=3)],
        '毒刃': [damage(1.3), dot(.25, 'poison', False)], '大治愈术': [heal(2.2)],
        '审判之光': [damage(1.3, True), effect('damage', 'spirit', .6, damage_type='magic'), effect('shared_hit', '', 1)],
        '回春术': [hot(.6), status('reduction', .15, 3, 'self')],
        '森林结界': [status('reduction', .20, 3, 'self'), status('accuracy', -.10, 3)],
    }


def passive_effects() -> dict[str, list[tuple[str,str,tuple[float,...]]]]:
    p=(.05,.075,.10); small=(.03,.045,.06); large=(.08,.12,.16)
    return {
        '健壮':[('percent','hp_max',p)],'冥想':[('percent','mp_max',p)],
        '灵巧':[('percent','dexterity',p)],'信念':[('percent','spirit',p)],
        '剑术精通':[('percent','weapon_attack',(.10,.15,.20))],
        '坚壁':[('percent','physical_defense',p)],'元素专注':[('percent','magic_attack',p)],
        '秘术节流':[('cost','mp',p)],'鹰眼':[('flat','accuracy',(.02,.03,.04))],
        '致命技巧':[('flat','critical_damage',p)],'治疗精通':[('percent','healing',p)],
        '自然韧性':[('percent','hp_max',small),('percent','magic_defense',small)],
        '剑意':[('percent','physical_attack',p)],'魔刃修习':[('conversion','strength_to_magic',(.1,.15,.2))],
        '圣铠':[('percent','physical_defense',p),('percent','magic_defense',p)],
        '不屈':[('low_hp','reduction',p)],'炽热':[('damage','burn',(.10,.15,.20))],
        '寒霜护体':[('percent','magic_defense',large)],'咒术延展':[('duration','debuff',(1,1,2))],
        '契约精通':[('damage','contract',(.10,.15,.20))],
        '精准要害':[('flat','critical',(.02,.03,.04))],
        '狩猎经验':[('damage','elite_boss',p)],'影步':[('flat','evasion',(.02,.03,.04))],
        '毒术精通':[('damage','poison',(.10,.15,.20))],'神恩':[('percent','healing',large)],
        '圣光精通':[('conversion','spirit_to_magic',(.10,.15,.20))],
        '自然祝福':[('percent','hp_max',p),('percent','healing',p)],
        '守望意志':[('percent','magic_defense',p),('percent','spirit',p)]}


def build() -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {}
    def put(name: str, row: dict) -> None:
        result.setdefault(name, []).append(row)

    parents = {'战士': '新手', '法师': '新手', '游侠': '新手', '牧师': '新手'}
    for row in table('### 8.3 二转技能候选'):
        parents[row[1]] = row[0]
    for row in table('### 8.4 三转技能候选'):
        parents[row[1]] = row[0]
    growth_section = DOCUMENT.read_text().split('### 9.3 初始属性')[1].split('三转在对应')[0]
    growth: dict[str, list[int]] = {}
    for line in growth_section.splitlines():
        if line.startswith('| ') and line.split('|')[1].strip() in JOB_KEYS:
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            growth[cells[0]] = list(map(int, cells[1:7]))
    fixed = {'新手': (6,3), '战士': (16,2), '法师': (6,14), '游侠': (10,5), '牧师': (8,12),
             '剑士': (22,4), '守卫': (30,4), '元素师': (8,22), '秘术师': (10,20),
             '弓手': (14,8), '刺客': (12,6), '祭司': (12,20), '自然使': (16,16)}
    extras = [('剑圣','力量',3,'敏捷',1,8,3),('魔剑士','智力',3,'力量',1,6,8),
              ('圣骑士','精神',3,'体质',1,10,6),('狂战士','力量',3,'体质',1,12,2),
              ('炎术师','智力',3,'精神',1,4,10),('冰术师','智力',2,'精神',2,6,8),
              ('咒术师','智力',3,'精神',1,4,10),('召唤师','智力',2,'精神',2,6,8),
              ('神射手','敏捷',3,'运气',1,6,4),('猎人','敏捷',2,'力量',2,8,4),
              ('影舞者','敏捷',3,'运气',1,6,3),('诡术师','运气',3,'敏捷',1,6,5),
              ('神官','精神',3,'智力',1,6,10),('审判者','智力',2,'精神',2,8,8),
              ('德鲁伊','体质',2,'精神',2,10,6),('守望者','精神',3,'体质',1,10,6)]
    stat_names = ['力量','敏捷','智力','体质','精神','运气']
    for job, stat1, n1, stat2, n2, hp, mp in extras:
        growth[job] = growth[parents[job]].copy()
        growth[job][stat_names.index(stat1)] += n1
        growth[job][stat_names.index(stat2)] += n2
        fixed[job] = tuple(a+b for a,b in zip(fixed[parents[job]], (hp,mp)))
    for job, key in JOB_KEYS.items():
        stage = 0 if job == '新手' else 1 if parents[job] == '新手' else 2 if parents[job] in ('战士','法师','游侠','牧师') else 3
        row = dict(id='job.'+key, name=job, parent_id='job.'+JOB_KEYS[parents[job]] if stage else '', stage=stage,
                   required_level=(1,10,30,70)[stage], hp_growth=fixed[job][0], mp_growth=fixed[job][1], enabled=1)
        row.update({stat+'_growth': value for stat,value in zip(STATS,growth[job])})
        put('professions',row)

    ownership: dict[str, tuple[str,int,str]] = {}
    for row in table('### 8.2 一转技能候选'):
        for cell,level,kind in zip(row[1:4],(10,15,20),('active','active','passive')):
            ownership[cell.split('：')[0]]=(row[0],level,kind)
    for heading,levels in [('### 8.3 二转技能候选',(30,45)),('### 8.4 三转技能候选',(70,80))]:
        for row in table(heading):
            for cell,level,kind in zip(row[2:4],levels,('active','passive')):
                ownership[cell.split('：')[0]]=(row[1],level,kind)
    active = {row[0]:row for row in table('### 8.6 主动技能数值草案')}
    passive = {row[0]:row[1] for row in table('### 8.7 被动技能数值草案')}
    codes = player_effects()
    passives=passive_effects()
    for name,(job,learn,kind) in ownership.items():
        sid=SKILL_IDS[name]
        put('skills',dict(id=sid,name=name,profession_id='job.'+JOB_KEYS[job],learn_level=learn,kind=kind,enabled=1))
        for rank in (1,2,3):
            rid=f'{sid}.r{rank}'
            cost=(0,0)
            if name in active:
                cost=tuple(map(float,active[name][2].rstrip('L').split('+')))
            put('skill_levels',dict(id=rid,skill_id=sid,rank=rank,required_level=min(99,learn+10*(rank-1)),
                 cost_base=cost[0],cost_per_level=cost[1],cost_rank_factor=1+.15*(rank-1),
                 cooldown_rounds=int(active[name][3]) if kind=='active' else 0,description=active[name][1] if kind=='active' else passive[name],enabled=1))
            if kind=='active':
                for number,fx in enumerate(codes[name],1):
                    value=fx['value'] if fx['code']=='shared_hit' else round(fx['value']*(1+.1*(rank-1)),6)
                    put('skill_effects',dict(id=f'{rid}.e{number}',skill_level_id=rid,**{**fx,'value':value},chance=1))
            else:
                for number,(code,stat,values) in enumerate(passives[name],1):
                    put('skill_effects',dict(id=f'{rid}.e{number}',skill_level_id=rid,
                         **effect('passive_'+code,stat,values[rank-1],target='self'),chance=1))

    regions = [
        ('moss_cave','苔石洞窟',1,12,[('slime','软泥怪',1,5,'plain'),('cave_bat','洞穴蝙蝠',3,8,'agile'),('moss_beast','苔石兽',8,12,'armored')],('moss_king','苔冠巨兽',10,12,'armored'),['黏液','蝠翼','苔石碎片'],'苔冠护符'),
        ('abandoned_mine','废弃矿坑',10,25,[('mine_rat','矿洞鼠',10,16,'agile'),('ore_golem','矿石傀儡',14,22,'armored'),('iron_guard','铁甲矿卫',20,25,'armored')],('mine_giant','深矿巨像',22,25,'armored'),['矿鼠皮','铁矿','傀儡核心'],'深矿护符'),
        ('mist_forest','迷雾林地',20,35,[('toxic_mushroom','毒蘑菇',20,27,'magic'),('mist_wolf','迷雾狼',24,32,'agile'),('ancient_guard','古树守卫',30,35,'armored')],('mist_treant','迷雾树王',32,35,'magic'),['孢子','狼牙','古木树脂'],'迷雾护符'),
        ('sunken_ruins','沉没遗迹',30,50,[('ruin_skeleton','遗迹骷髅',30,40,'plain'),('water_spirit','幽水灵',36,46,'magic'),('ruin_knight','遗迹骑士',45,50,'armored')],('tide_priest','潮汐祭司',47,50,'magic'),['骨片','水灵精华','遗迹碎晶'],'潮汐护符'),
        ('ember_fortress','灰烬堡垒',45,70,[('ash_demon','灰烬魔',45,56,'magic'),('lava_beast','熔岩兽',52,65,'plain'),('furnace_guard','熔炉守卫',63,70,'armored')],('ash_lord','灰烬领主',65,70,'magic'),['灰烬粉','熔岩碎片','火焰核心'],'灰烬护符'),
        ('star_rift','星蚀裂隙',70,99,[('rift_walker','裂隙行者',70,88,'agile'),('star_golem','星蚀魔像',82,99,'armored'),('rift_lord','裂隙领主',90,99,'magic')],('star_overlord','星蚀主宰',95,99,'magic'),['裂隙粉尘','星蚀结晶','领主残核'],'星蚀护符')]
    enemy_fx = {'strike':[damage(1.35)],'magic_strike':[damage(1.35,True)],
                'evasion':[status('evasion',.1,2,'self')], 'guard':[status('reduction',.2,2,'self')],
                'armor_break':[damage(1.2),status('physical_defense',-.2,2)],
                'poison':[damage(1,True),effect('dot','magic_attack',.2,3,damage_type='magic',group='poison')],
                'heal':[effect('heal','hp_max',.15,target='self')],
                'shield':[effect('shield','magic_attack',1.0,2,'self',group='shield')],
                'burn':[damage(1.2,True),effect('dot','magic_attack',.25,3,damage_type='magic',group='burn')],
                'curse':[damage(1.15,True),status('accuracy',-.08,2)]}
    for key,fxs in enemy_fx.items():
        sid='skill.monster.'+key
        put('skills',dict(id=sid,name={'strike':'重击','magic_strike':'灵击','evasion':'闪身','guard':'护体','armor_break':'破甲击','poison':'毒孢','heal':'再生','shield':'灵盾','burn':'炎灼','curse':'星蚀咒'}[key],profession_id='',learn_level=1,kind='monster',enabled=1))
        put('skill_levels',dict(id=sid+'.r1',skill_id=sid,rank=1,required_level=1,cost_base=4,cost_per_level=.5,cost_rank_factor=1,
             cooldown_rounds=4 if key not in ('heal','shield') else 5,description=key,enabled=1))
        for n,fx in enumerate(fxs,1):put('skill_effects',dict(id=f'{sid}.r1.e{n}',skill_level_id=sid+'.r1',**fx,chance=1))
    moves=[['strike','guard'],['armor_break','strike'],['poison','heal'],['shield','strike'],['burn','strike'],['curse','burn']]
    for region_index,(key,name,low,high,mobs,boss,materials,trophy) in enumerate(regions):
        did='dungeon.'+key
        put('dungeons',dict(id=did,name=name,recommended_level_min=low,recommended_level_max=high,boss_id='monster.'+boss[0],
             boss_level_min=boss[2],boss_level_max=boss[3],boss_start_kills=12,boss_probability_step=.01,boss_probability_cap=.25,enabled=1))
        for n,(mk,mn,mlo,mhi,profile) in enumerate([*mobs,boss]):
            mid='monster.'+mk;rank=('normal','normal','elite','boss')[n]
            put('monsters',dict(id=mid,name=mn,rank=rank,profile=profile,level_min=mlo,level_max=mhi,enabled=1))
            if n<3:put('dungeon_monsters',dict(id=did+'.'+mk,dungeon_id=did,monster_id=mid,level_min=mlo,level_max=mhi,encounter_weight=(60,35,5)[n],drop_table_id='drop.'+mk,enabled=1))
            specific={'slime':[], 'cave_bat':['evasion'], 'moss_beast':['guard'], 'mine_rat':['strike'],
                      'ore_golem':['guard'],'iron_guard':['armor_break'], 'toxic_mushroom':['poison'],
                      'mist_wolf':['strike'],'ancient_guard':['heal'],'ruin_skeleton':['strike'],
                      'water_spirit':['magic_strike'],'ruin_knight':['guard'],'ash_demon':['burn'],
                      'lava_beast':['strike'],'furnace_guard':['strike'],'rift_walker':['evasion'],
                      'star_golem':['armor_break'],'rift_lord':['curse']}
            skills=moves[region_index] if n==3 else specific[mk]
            skills=['magic_strike' if move=='strike' and profile=='magic' else move for move in skills]
            put('monster_actions',dict(id=mid+'.attack',monster_id=mid,action_kind='attack',skill_id='',weight=(80,65,50)[('normal','elite','boss').index(rank)] if skills else 100,condition='always'))
            for j,move in enumerate(skills):put('monster_actions',dict(id=mid+'.'+move,monster_id=mid,action_kind='skill',skill_id='skill.monster.'+move,
                 weight=(20,35,50)[('normal','elite','boss').index(rank)]/len(skills),condition='hp_below_50' if move=='heal' else 'not_active' if move in ('guard','shield') else 'always'))
            material_id=f'material.{key}.{n+1}'
            material_name=materials[n] if n<3 else name+'印记'
            material_level=mlo if n<3 else mhi
            put('materials',dict(id=material_id,name=material_name,level=material_level,sale_price=f'{Decimal(1)+Decimal(".04")*material_level:.2f}',enabled=1))
            put('drops',dict(id=mid+'.material',monster_id=mid,item_kind='material',item_id=material_id,weight=1,quantity_min=1,quantity_max=2))
            put('drops',dict(id=mid+'.equipment',monster_id=mid,item_kind='equipment_pool',item_id='pool.'+key,weight=1,quantity_min=1,quantity_max=1))
        put('equipment_templates',dict(id='equip.boss.'+key,name=trophy,slot='accessory',root_job='',level_min=boss[2],level_max=99,
             physical_attack_base=0,physical_attack_growth=0,magic_attack_base=0,magic_attack_growth=0,hp_base=10,hp_growth=1,
             mp_base=5,mp_growth=1,physical_defense_base=0,physical_defense_growth=0,magic_defense_base=0,magic_defense_growth=0,healing_base=0,healing_growth=0,evasion=0,boss_only=1,enabled=1))
        put('boss_drops',dict(id=did+'.trophy',monster_id='monster.'+boss[0],equipment_id='equip.boss.'+key,exclusive_probability=.5))

    gear=[('sword','长剑','weapon','warrior'),('axe','战斧','weapon','warrior'),('bow','长弓','weapon','ranger'),
          ('dagger','匕首','weapon','ranger'),('staff','法杖','weapon','mage'),('holy_staff','圣杖','weapon','priest'),
          ('head','头饰','head',''),('body','护甲','body',''),('hands','手套','hands',''),('feet','靴子','feet',''),('charm','护符','accessory','')]
    for key,name,slot,root_job in gear:
        row=dict(id='equip.'+key,name=name,slot=slot,root_job=root_job,level_min=1,level_max=99,boss_only=0,enabled=1)
        for stat in ['physical_attack','magic_attack','hp','mp','physical_defense','magic_defense','healing']:
            row[stat+'_base']=0;row[stat+'_growth']=0
        row['evasion']=.01 if slot=='feet' else 0
        if slot=='weapon':
            stat='magic_attack' if root_job in ('mage','priest') else 'physical_attack'
            row[stat+'_base']=8;row[stat+'_growth']=2
            if root_job=='priest':row['healing_base']=2;row['healing_growth']=.4
        elif slot=='head':row.update(hp_base=10,hp_growth=2,magic_defense_base=1,magic_defense_growth=.25)
        elif slot=='body':row.update(physical_defense_base=3,physical_defense_growth=.7,magic_defense_base=3,magic_defense_growth=.7)
        elif slot in ('hands','feet'):row.update(physical_defense_base=1,physical_defense_growth=.2)
        else:row.update(hp_base=10,hp_growth=1,mp_base=5,mp_growth=1)
        put('equipment_templates',row)
    affixes=[(stat,1,.04,2,.08,'all') for stat in STATS]+[
        ('physical_attack',2,.12,5,.24,'weapon;hands;accessory'),('magic_attack',2,.12,5,.24,'weapon;hands;accessory'),
        ('hp_max',10,2,20,4,'head;body;accessory'),('mp_max',8,1,16,2,'head;accessory'),
        ('physical_defense',1,.06,2,.12,'head;body;feet;accessory'),('magic_defense',1,.06,2,.12,'head;body;feet;accessory'),
        ('healing',2,.1,4,.2,'weapon;head;accessory'),('critical',.005,0,.02,0,'weapon;hands;accessory'),
        ('critical_damage',.03,0,.08,0,'weapon;hands;accessory'),('accuracy',.01,0,.03,0,'weapon;hands'),('evasion',.01,0,.03,0,'feet;accessory')]
    for stat,lo,lg,hi,hg,slots in affixes:
        put('affixes',dict(id='affix.'+stat,stat=stat,min_base=lo,min_growth=lg,max_base=hi,max_growth=hg,
            unit='ratio' if stat in ('critical','critical_damage','accuracy','evasion') else 'integer',enabled=1))
        for slot in (['weapon','head','body','hands','feet','accessory'] if slots=='all' else slots.split(';')):
            put('affix_slots',dict(id=f'affix.{stat}.{slot}',affix_id='affix.'+stat,slot=slot))
    templates=result['equipment_templates']
    for row in result['professions']:
        job=row['name']; cursor=job
        while cursor in parents and parents[cursor]!='新手':cursor=parents[cursor]
        root=JOB_KEYS[cursor] if cursor!='新手' else 'novice'
        branch=job
        while branch in parents and parents[branch] not in ('新手','战士','法师','游侠','牧师'):branch=parents[branch]
        for equip in templates:
            allowed=not equip['root_job'] or equip['root_job']==root
            if root=='novice':allowed=not equip['root_job'] or equip['root_job'] in ('warrior','ranger')
            if branch=='弓手' and equip['slot']=='weapon':allowed=equip['id']=='equip.bow'
            if branch=='刺客' and equip['slot']=='weapon':allowed=equip['id']=='equip.dagger'
            if allowed:put('equipment_professions',dict(id=equip['id']+'.'+row['id'],equipment_id=equip['id'],profession_id=row['id']))
    for equip in templates:
        for slotrow in result['affix_slots']:
            if slotrow['slot']!=equip['slot']:continue
            stat=slotrow['affix_id'].removeprefix('affix.')
            if equip['slot']=='weapon':
                physical=bool(equip['physical_attack_base'])
                if stat=='healing' and equip['id']!='equip.holy_staff':continue
                if stat=='physical_attack' and not physical:continue
                if stat=='magic_attack' and physical:continue
                if physical and stat in ('intelligence','spirit'):continue
                if not physical and stat=='strength':continue
            put('equipment_affixes',dict(id=equip['id']+'.'+slotrow['affix_id'],equipment_id=equip['id'],affix_id=slotrow['affix_id'],weight=1))
    for key,*_ in regions:
        for eid,_,_,_ in gear:put('equipment_pools',dict(id=f'pool.{key}.{eid}',pool_id='pool.'+key,equipment_id='equip.'+eid,weight=1))
    for kind,values in [('heal',[60,250,1000,2500]),('mana',[40,150,600,1500])]:
        for tier,(value,level,price) in enumerate(zip(values,[1,10,30,70],[6,14,30,60]),1):
            put('potions',dict(id=f'potion.{kind}.{tier}',name=('治疗' if kind=='heal' else '回蓝')+f'药剂{tier}',kind=kind,restore_value=value,
                 required_level=level,purchase_price=f'{price:.2f}',shared_cooldown_rounds=2,enabled=1))
    for row in table('### 3.2 状态输入与参数'):
        put('styles',dict(id='style.'+{'均衡':'balanced','强攻':'assault','谨慎':'cautious','技能偏好':'skill','节约':'economy'}[row[0]],name=row[0],
             attack_weight=row[1],skill_weight=row[2],heal_threshold=float(row[3].strip('%'))/100,mana_threshold=float(row[4].strip('%'))/100,defend_factor=row[5],enabled=1))
    for level in range(1,100):
        value=int((Decimal(200)+20*level*level+Decimal('1.6')*level**3).to_integral_value(rounding=ROUND_CEILING)) if level<99 else 0
        put('level_experience',dict(id=f'level.{level}',level=level,experience_to_next=value))
    for key,hp,attack,pd,md,evasion in [('plain',1,1,1,1,.04),('agile',.8,1.1,1,1,.15),('armored',1.4,1,1.8,1,.04),('magic',1,1,.7,1.3,.04)]:
        put('monster_profiles',dict(id=key,hp_constant=40,hp_linear=18,hp_quadratic=.5,mp_constant=20,mp_linear=8,
             attack_constant=6,attack_linear=4,attack_quadratic=.1,defense_constant=4,defense_linear=1.8,
             hp_multiplier=hp,attack_multiplier=attack,physical_defense_multiplier=pd,magic_defense_multiplier=md,
             accuracy=.95,evasion=evasion,critical=.05,critical_damage=1.5,damage_type='magic' if key=='magic' else 'physical'))
    for kind,hp,attack,defense,exp in [('normal',1,1,1,1),('elite',2,1.15,1.2,2),('boss',6,1.25,1.3,3)]:
        put('monster_ranks',dict(id=kind,hp_multiplier=hp,attack_multiplier=attack,defense_multiplier=defense,experience_multiplier=exp))
    for key,count,sale,normal,elite,boss in [('white',1,1,.80,.60,.30),('blue',2,1.6,.18,.35,.55),('gold',3,2.4,.02,.05,.15)]:
        put('qualities',dict(id=key,affix_count=count,sale_multiplier=sale,normal_weight=normal,elite_weight=elite,boss_weight=boss))
    rules={'round_seconds':15,'encounter_delay_seconds':30,'loot_interval_seconds':300,'equipment_interval_seconds':1800,
           'loot_carry_cap':2,'equipment_carry_cap':1,'entry_energy_cost':10,'energy_per_block':2,'energy_block_seconds':300,
           'daily_minutes':120,'level_cap':99,'normal_equipment_chance':.2,'normal_gold_chance':.02,'elite_gold_chance':.05,
           'boss_gold_chance':.15,'weapon_sale_base':10,'weapon_sale_per_level':.5,'equipment_per_hour_limit':2,
           'potion_carry_cap':20,'defeat_rest_seconds':1800,'outside_recovery_seconds':300,
           'hp_recovery_ratio':.05,'mp_recovery_ratio':.10,'defeat_hp_ratio':.20,
           'hp_base':44,'mp_base':12,'hp_per_vitality':12,'mp_per_intelligence':6,'mp_per_spirit':4,
           'accuracy_base':.95,'dex_accuracy_max':.10,'dex_accuracy_scale':80,'evasion_base':.03,
           'dex_evasion_max':.25,'dex_evasion_scale':120,'hit_min':.20,'hit_max':.98,
           'evasion_cap':.35,'critical_base':.05,'luck_critical_max':.30,'luck_critical_scale':150,
           'critical_cap':.60,'critical_damage_base':1.50,'critical_damage_cap':3,
           'defense_scale_base':60,'defense_scale_per_level':6,'defense_reduction_cap':.75,
           'status_reduction_cap':.60,'defend_reduction':.35,'penetration_cap':.60,
           'xp_constant':10,'xp_linear':3,'xp_quadratic':.3,'xp_overlevel_base_cap':1.25,
           'xp_requirement_constant':200,'xp_requirement_linear_squared':20,'xp_requirement_cubic':1.6,
           'damage_variation_min':.95,'damage_variation_max':1.05,'affix_sale_bonus_cap':.10,
           'attribute_percent_bonus_min':-.90,'attribute_percent_bonus_max':2,'vulnerability_cap':1}
    for key,value in rules.items():put('rules',dict(id=key,value=value))
    return result


def main() -> None:
    OUTPUT.mkdir(parents=True,exist_ok=True)
    rows=build(); files={}
    for name,values in rows.items():
        path=OUTPUT/(name+'.csv')
        with path.open('w',newline='',encoding='utf-8') as stream:
            writer=csv.DictWriter(stream,fieldnames=list(values[0]));writer.writeheader();writer.writerows(values)
        files[path.name]={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'rows':len(values)}
    (OUTPUT/'manifest.json').write_text(json.dumps(dict(version='design-0.1',status='design_only',engine_schema=1,files=files),ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({key:len(value) for key,value in rows.items()},ensure_ascii=False))


if __name__=='__main__':main()
