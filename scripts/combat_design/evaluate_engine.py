"""Production-engine Monte Carlo, stable seeds; no Django, DB, model or network."""
import argparse
import concurrent.futures
import csv
import json
import os
from pathlib import Path
import random
import statistics
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from system_settings.agent_world.combat.catalog import bundled
from system_settings.agent_world.combat import attributes, equipment, engine, rewards


def progress_at(c,job,level):
    p=attributes.initial();path=c.path(job)[1:]
    for target in range(2,level+1):
        p,_=attributes.award(c,p,int(c.row('level_experience',f'level.{p["level"]}')['experience_to_next']))
        if path and int(c.row('professions',path[0])['required_level'])<=p['level']:
            p=attributes.promote(c,p,path.pop(0))
    return p


def supplies(c,level):
    rows=[r for r in c.tables['potions'] if int(r['required_level'])<=level]
    return {max((r for r in rows if r['kind']==kind),key=lambda r:int(r['required_level']))['id']:count for kind,count in (('heal',14),('mana',6))}


def simulate(c,job,level,dungeon,style,seed,boss=False):
    rng=random.Random(seed)
    p=progress_at(c,job,level)
    template=next(r['equipment_id'] for r in c.tables['equipment_professions'] if r['profession_id']==job and c.row('equipment_templates',r['equipment_id'])['slot']=='weapon')
    gear=[equipment.generate(c,tid,level,'blue',rng) for tid in (template,'equip.head','equip.body','equip.hands','equip.feet','equip.charm')]
    stat=attributes.attributes(c,p,gear);pot=supplies(c,level)
    state={'player':engine.fighter(stat,'player',level,skills=p['skills'],passives=attributes.passives(c,p['skills'])),'enemy':None,'potions':dict(pot),'monster_id':''}
    options=[r for r in c.tables['dungeon_monsters'] if r['dungeon_id']==dungeon['id']]
    kill=0;waiting_until=0;xp=0;loot={};gain=0;gears=0;seconds=0
    def spawn():
        if boss:
            sid=dungeon['boss_id'];ml=level
        else:
            row=rng.choices(options,weights=[float(r['encounter_weight']) for r in options])[0]
            sid=row['monster_id'];ml=max(int(row['level_min']),min(int(row['level_max']),state['player']['level']+rng.randint(-2,2)))
        m=c.row('monsters',sid)
        state['enemy']=engine.fighter(attributes.monster(c,m,ml),m['name'],ml,rank=m['rank']);state['monster_id']=sid
    spawn()
    for tick in range(1,121 if not boss else 481):
        seconds=tick*15
        rewards.accrue(loot,15,'day')
        if not boss and seconds>=1800:break
        waiting=state['enemy'] is None
        state,_=engine.step(c,state,style,tick,rng,waiting=waiting)
        if state['player']['hp']<=0:break
        enemy=state['enemy']
        if enemy and enemy['hp']<=0:
            kill+=1
            if boss:break
            experience=attributes.kill_experience(c,enemy['level'],p['level'],enemy['rank']);xp+=experience
            old=attributes.attributes(c,p,gear);p,_=attributes.award(c,p,experience);new=attributes.attributes(c,p,gear)
            player=state['player'];player.update(stats=new,level=p['level'],skills=p['skills'],passives=attributes.passives(c,p['skills']),hp=max(1,int(player['hp']/old['hp_max']*new['hp_max'])),mp=int(player['mp']/old['mp_max']*new['mp_max']))
            for drop in rewards.drops(c,state['monster_id'],enemy['level'],loot,rng):
                gain+=float(drop['item']['value']) if drop['kind']=='equipment' else float(drop['item']['sale_price'])*drop['quantity'];gears+=int(drop['kind']=='equipment')
            state['enemy']=None;waiting_until=seconds+30
        elif waiting and seconds>=waiting_until:spawn()
    used={sid:pot[sid]-state['potions'][sid] for sid in pot}
    cost=sum(float(c.row('potions',sid)['purchase_price'])*n for sid,n in used.items())
    return {'success':int(kill>0 if boss else seconds>=1800 and state['player']['hp']>0),'kills':kill,'potions':sum(used.values()),'xp':xp,'levels':p['level']-level,'revenue':gain,'procurement':cost,'net':gain-cost,'equipment':gears,'seconds':seconds}


def evaluate(spec):
    c=bundled()[0];job,level,did,style,boss,count=spec
    dungeon=c.row('dungeons',did)
    samples=[simulate(c,job,level,dungeon,style,f'{job}:{level}:{did}:{style}:{boss}:{i}',boss) for i in range(count)]
    result={'job':job,'level':level,'dungeon':did,'style':style,'scenario':'boss' if boss else '30min_no_boss','seeds':count}
    for key in samples[0]:result[key]=round(statistics.mean(r[key] for r in samples),4)
    result['equipment_max']=max(r['equipment'] for r in samples)
    return result


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--seeds',type=int,default=1000);parser.add_argument('--workers',type=int,default=6);parser.add_argument('--quick',action='store_true');parser.add_argument('--output',default='docs/agents/Agent战斗引擎平衡评估.json');args=parser.parse_args()
    c=bundled()[0];specs=[]
    for job in c.tables['professions']:
        depth=len(c.path(job['id']))-1
        level=(5,20,50,85)[depth]
        dungeon=max((d for d in c.tables['dungeons'] if int(d['recommended_level_min'])<=level),key=lambda d:int(d['recommended_level_min']))
        styles=c.tables['styles'][:1] if args.quick else c.tables['styles']
        for style in styles:specs.append((job['id'],level,dungeon['id'],style['id'],False,args.seeds))
    for dungeon in c.tables['dungeons']:
        level=(int(dungeon['boss_level_min'])+int(dungeon['boss_level_max']))//2
        job='job.novice' if level<10 else 'job.warrior' if level<30 else 'job.knight' if level<70 else 'job.paladin'
        # Select the actual first descendant IDs from the validated tree.
        roots=[r for r in c.tables['professions'] if r['parent_id']=='job.novice']
        candidate=roots[0]['id']
        while True:
            children=[r for r in c.tables['professions'] if r['parent_id']==candidate and int(r['required_level'])<=level]
            if not children:break
            candidate=children[0]['id']
        job=candidate if level>=10 else 'job.novice'
        specs.append((job,level,dungeon['id'],'style.balanced',True,args.seeds))
    results=[]
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        for row in pool.map(evaluate,specs):
            results.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
    Path(args.output).write_text(json.dumps({'catalog':c.version,'seeds_per_group':args.seeds,'equipment':'six blue pieces at resident level','carried':'14 heal + 6 mana; only consumed cost included','results':results},ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':main()
