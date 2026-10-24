"""Seeded production-rule simulation, no Django/database/model/provider access."""
import argparse
import json
import random
import statistics
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from system_settings.agent_world.combat import attributes, equipment, engine, rewards
from system_settings.agent_world.combat.catalog import bundled
from system_settings.agent_world.combat.party_engine import step, rescue, alive
from system_settings.agent_world.combat.party_rules import CADENCE, spawn_enemies, experience, roll
from scripts.combat_design.evaluate_engine import progress_at, supplies


def simulate(catalog,jobs,level,seed):
    rng=random.Random(seed)
    players={}
    for index,job in enumerate(jobs):
        p=progress_at(catalog,job,level)
        gear=[]
        for slot in ('weapon','offhand','head','body','hands','feet','accessory'):
            options=[r for r in catalog.tables['equipment_templates'] if r['slot']==slot and r['enabled']=='1' and int(r['level_min'])<=level<=int(r['level_max']) and equipment.allowed(catalog,r['id'],job,level,level)]
            if options:
                template=options[0]
                gear.append(equipment.generate(catalog,template['id'],level,'blue',rng))
        stats=attributes.attributes(catalog,p,gear)
        unit=engine.fighter(stats,f'成员{index}',level,skills=p['skills'],passives=attributes.passives(catalog,p['skills'],gear))
        unit.update(id=str(index),job_id=job,potions=supplies(catalog,level),style_id='style.balanced',elixirs=[])
        players[str(index)]=unit
    dungeon=max((d for d in catalog.tables['dungeons'] if int(d['recommended_level_min'])<=level),key=lambda d:int(d['recommended_level_min']))
    state={'players':players,'enemies':{},'round':0,'nonboss_kills':0,'boss_seen':False}
    seconds=kills=xp=materials=gear_count=fallen=consumed=0
    knocked_down=set()
    allowances={p:{'days':{}} for p in players}
    wave=0
    while seconds<1800 and alive(state['players']):
        wave+=1
        count=len(state['players'])
        for u in state['players'].values():u['revived']=False
        state['enemies']=spawn_enemies(catalog,dungeon,state['players'],state,rng,'simulation',wave)
        while seconds+CADENCE[count]<=1800 and alive(state['players']) and alive(state['enemies']):
            seconds+=CADENCE[count]
            if count==1:
                rewards.accrue(allowances[next(iter(state['players']))],CADENCE[count],'simulation')
            before=sum(sum(u['potions'].values()) for u in state['players'].values())
            state,events=step(catalog,state,rng)
            knocked_down.update(key for key,u in state['players'].items() if u['hp']<=0)
            knocked_down.update(e['target_id'] for e in events if e['kind']=='revive')
            consumed+=before-sum(sum(u['potions'].values()) for u in state['players'].values())
            for enemy in state['enemies'].values():
                if enemy['hp']<=0 and not enemy['settled']:
                    enemy['settled']=True;kills+=1
                    if enemy['rank']!='boss':state['nonboss_kills']+=1
                    xp+=sum(experience(catalog,enemy['level'],u['level'],enemy['rank'],count) for u in state['players'].values())
                    progress=allowances[next(iter(state['players']))] if count==1 else {'gear':1,'loot':2 if enemy['rank']=='boss' else 1}
                    for reward in rewards.drops(catalog,enemy['template_id'],enemy['level'],progress,rng):
                        if count>1:roll(state['players'],rng)
                        if reward['kind']=='equipment':gear_count+=1
                        else:materials+=reward['quantity']
        if alive(state['players']) and not alive(state['enemies']):
            rescue(catalog,state,rng)
        dead=[key for key,u in state['players'].items() if u['hp']<=0]
        fallen+=len(dead)
        for key in dead:state['players'].pop(key)
        if seconds+30>=1800:break
        seconds+=30
        if len(state['players'])==1:rewards.accrue(allowances[next(iter(state['players']))],30,'simulation')
    return {'kills':kills,'experience_per_member':xp/len(jobs),'materials_per_member':materials/len(jobs),
            'equipment_per_member':gear_count/len(jobs),'fallen_fraction':len(knocked_down)/len(jobs),
            'unrescued_fraction':fallen/len(jobs),'potion_consumption_per_member':consumed/len(jobs),'active_seconds':seconds}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--seeds',type=int,default=20);parser.add_argument('--output',required=True);args=parser.parse_args()
    catalog=bundled()[0]
    compositions=[['job.swordmaster'],['job.swordmaster','job.highpriest'],['job.spellblade','job.swordmaster','job.highpriest'],['job.spellblade','job.swordmaster','job.highpriest','job.cryomancer'],['job.swordmaster']*4,['job.swordmaster','job.highpriest','job.cryomancer','job.sharpshooter']]
    report={'catalog':catalog.version,'seeds':args.seeds,'assumptions':'30分钟固定等级蓝装，生产行动/生成/经验/掉落规则，无升级、体力不足或模型决策；未携带美食炼金药。药耗包含倒地者，不含补购和炼金。','samples':[]}
    for level in (55,75,90):
        for jobs in compositions:
            samples=[simulate(catalog,jobs,level,seed) for seed in range(args.seeds)]
            report['samples'].append({'level':level,'jobs':jobs,**{key:round(statistics.mean(s[key] for s in samples),3) for key in samples[0]}})
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()
