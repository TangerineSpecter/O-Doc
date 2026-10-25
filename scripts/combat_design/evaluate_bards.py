"""Reproducible bard smoke simulation using production growth, loadouts and shared rounds.
No database, network or model calls. Samples are not a balance acceptance threshold.
"""
import argparse
import json
import random
import statistics
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from system_settings.agent_world.combat import attributes,equipment,engine
from system_settings.agent_world.combat.catalog import bundled
from system_settings.agent_world.combat.party_engine import step,alive,rescue
from system_settings.agent_world.combat.party_rules import spawn_enemies,CADENCE
from scripts.combat_design.evaluate_engine import progress_at,supplies


def loadout(catalog,job,level,rng):
    options=[r for r in catalog.tables['equipment_templates'] if r['slot']=='weapon' and
             int(r['level_min'])<=level and equipment.allowed(catalog,r['id'],job,level,min(level,int(r['level_max'])))]
    weapon=max(options,key=lambda r:int(r['level_min']))['id']
    if 'job.bard' in catalog.path(job):weapon=equipment.promotion_weapon(catalog,job,level)
    armor_groups=[fx['group'].removesuffix('_set') for sid,rank in catalog.learned(job,level).items()
                  for fx in catalog.skill(sid,rank)[1] if fx['group'].endswith('_armor_set')]
    family=armor_groups[-1] if armor_groups else None
    gear=[equipment.generate(catalog,weapon,min(level,int(catalog.row('equipment_templates',weapon)['level_max'])),'blue',rng)]
    for slot in ('head','body','hands','feet','offhand','accessory'):
        if slot=='offhand' and gear[0]['grip']=='two_handed':continue
        rows=[r for r in catalog.tables['equipment_templates'] if r['slot']==slot and
              int(r['level_min'])<=level<=int(r['level_max']) and equipment.allowed(catalog,r['id'],job,level,level)]
        if family and slot in ('head','body','hands','feet'):rows=[r for r in rows if r['equipment_type']==family]
        if rows:
            row=max(rows,key=lambda r:int(r['level_min']))
            gear.append(equipment.generate(catalog,row['id'],level,'blue',rng))
    return gear


def simulate(catalog,jobs,level,seed):
    rng=random.Random(seed);players={}
    for index,job in enumerate(jobs):
        progress=progress_at(catalog,job,level);gear=loadout(catalog,job,level,rng)
        stats=attributes.attributes(catalog,progress,gear)
        unit=engine.fighter(stats,job,level,skills=progress['skills'],passives=attributes.passives(catalog,progress['skills'],gear))
        unit.update(id=str(index),job_id=job,potions=supplies(catalog,level),style_id='style.balanced',elixirs=[])
        players[str(index)]=unit
    dungeon=max((d for d in catalog.tables['dungeons'] if int(d['recommended_level_min'])<=level),key=lambda d:int(d['recommended_level_min']))
    state={'players':players,'enemies':{},'round':0,'nonboss_kills':0,'boss_seen':False}
    seconds=kills=casts=wave=0;fallen=set()
    while seconds<1800 and alive(state['players']):
        wave+=1;count=len(state['players'])
        state['enemies']=spawn_enemies(catalog,dungeon,state['players'],state,rng,'bard-sample',wave)
        while seconds+CADENCE[count]<=1800 and alive(state['players']) and alive(state['enemies']):
            seconds+=CADENCE[count];state,events=step(catalog,state,rng)
            casts+=len({(e.get('actor_id'),e['action']) for e in events if e.get('action') in MUSIC_NAMES})
            fallen.update(key for key,u in state['players'].items() if u['hp']<=0)
            fallen.update(e['target_id'] for e in events if e['kind']=='revive')
            for foe in state['enemies'].values():
                if foe['hp']<=0 and not foe['settled']:
                    foe['settled']=True;kills+=1
                    if foe['rank']!='boss':state['nonboss_kills']+=1
        if alive(state['players']) and not alive(state['enemies']):rescue(catalog,state,rng)
        state['players']={k:u for k,u in state['players'].items() if u['hp']>0}
        if seconds+30>=1800:break
        seconds+=30
    return {'kills':kills,'survival':len(state['players'])/len(jobs),'fallen':len(fallen)/len(jobs),'music_actions':casts}


MUSIC_NAMES=set()
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--seeds',type=int,default=10);parser.add_argument('--output',required=True);args=parser.parse_args()
    catalog=bundled()[0]
    MUSIC_NAMES.update(r['name'] for r in catalog.tables['skills'] if r['kind']=='active' and r['profession_id'] and 'job.bard' in catalog.path(r['profession_id']))
    leaves=['battleconductor','requiemsinger','virtuoso','sonomancer']
    cases=[(20,['job.bard']),(40,['job.musician']),(40,['job.cursesinger'])]+[(80,['job.'+job]) for job in leaves]
    base=['job.swordmaster','job.highpriest','job.pyromancer']
    cases += [(80,base+['job.sharpshooter'])]+[(80,base+['job.'+job]) for job in leaves]
    report={'catalog':catalog.version,'seeds':args.seeds,'assumptions':'30分钟固定等级、各自精通四件蓝装、最高可用档武器（旧武器不越过模板等级上限）、真实双手持握、14红6蓝、均衡风格；含寻敌等待与Boss，无升级/美食/炼金/掉落收益/模型。独立固定种子样本，不代表真实玩家分布或平衡验收。','samples':[]}
    for level,jobs in cases:
        samples=[simulate(catalog,jobs,level,20261025+seed) for seed in range(args.seeds)]
        report['samples'].append({'level':level,'jobs':jobs,**{key:round(statistics.mean(s[key] for s in samples),3) for key in samples[0]}})
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()
