"""All round commits and terminal transitions use the shared sync gate and a short transaction."""
import hashlib
import math
import random
import uuid
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from system_settings.models import Agent, AgentExecutionLease, WorldAction, AgentRunRecord
from .models import Exploration, CombatEncounter, CombatRuntime, CombatConfig, CombatProfile, EquipmentInstance
from .store import current
from .permissions import local_runtime
from .profiles import ensure, stats, wearing, recover, adopt_catalog, OPEN
from .facts import append
from . import engine, attributes, rewards
from ..farm_gate import guarded
from ..life_time import local_time, storage_time
from ..execution import stamina
from ..inventory_stock import take_stock, add_stock

TERMINAL = ('completed','fallen','recalled','exhausted','interrupted','failed')


def seeded(run, channel):
    return random.Random(hashlib.sha256(f'{run.pk}:{channel}'.encode()).digest())


def lease_token(identity):
    return 'combat:'+hashlib.sha256(identity.encode()).hexdigest()[:57]


def energy(duration):
    return 10+2*math.ceil(duration/300)


def busy(actor, *, excluding=''):
    from ..travel_candidates import travelling_ids
    from ..market_models import MarketSession
    from ..life_models import LifeItem
    now = storage_time(local_time())
    return (actor in travelling_ids() or MarketSession.objects.filter(actor_id=actor,status='active',expires_at__gt=now).exists()
            or Exploration.objects.filter(actor_id=actor,status__in=OPEN).exclude(pk=excluding).exists()
            or AgentExecutionLease.objects.filter(agent_id=actor,until__gt=now).exclude(token=lease_token(excluding)).exists()
            or LifeItem.objects.filter(actor_id=actor,status='running').exclude(id=Exploration.objects.filter(pk=excluding).values('life_item_id')[:1]).exists())


def day_parts(start,seconds):
    point=local_time(start);remaining=seconds;parts={}
    while remaining:
        boundary=(point+timedelta(days=1)).replace(hour=0,minute=0,second=0,microsecond=0)
        count=min(remaining,(boundary-point).total_seconds())
        if count<=0:raise ValueError('探索时间边界无效')
        day=point.date().isoformat();parts[day]=parts.get(day,0)+count
        point+=timedelta(seconds=count);remaining-=count
    return parts


def available_window(owner, actor, duration, life_id='', now=None):
    from ..life_models import LifeConfig, LifeItem
    from ..life_schedule import window
    now = local_time(now)
    config = LifeConfig.objects.filter(pk=owner).first()
    if config:
        if life_id and actor in config.paused_agents:
            raise ValueError('居民暂停，不能发起新探索')
        left,right = window(config.settings,now.date())
        continuous=config.settings.get('active_start','00:00')=='00:00' and config.settings.get('active_end','24:00')=='24:00'
        if not continuous and (now<left or now+timedelta(seconds=duration)>right):
            raise ValueError('探索超出居民活动时间窗口')
    if LifeItem.objects.filter(actor_id=actor,status__in=['pending','deferred','running'],scheduled_at__lt=storage_time(now+timedelta(seconds=duration)),scheduled_at__gte=storage_time(now)).exclude(pk=life_id).exists():
        raise ValueError('探索时长与已有日程冲突')


@guarded
@transaction.atomic
def request(owner, agent, key, constraints, *, life_item=None, now=None):
    if key=='combat-worker':raise ValueError('请求键为系统保留标识')
    old = Exploration.objects.filter(pk=key).first()
    if old:
        if old.owner_id!=owner or old.actor_id!=agent.pk or old.snapshot.get('constraints')!=constraints or old.life_item_id!=(life_item.pk if life_item else ''):
            raise ValueError('出发请求键已用于不同参数')
        return old
    if not isinstance(constraints,dict) or set(constraints)-{'dungeon_id','duration_seconds','style_id'}:
        raise ValueError('探索约束格式无效')
    duration = constraints.get('duration_seconds',1800)
    if type(duration) is not int or duration not in (1800,3600,7200):
        raise ValueError('探索时长只能为 30、60 或 120 分钟')
    catalog = current()
    for field,table in (('dungeon_id','dungeons'),('style_id','styles')):
        if field in constraints:
            row=catalog.row(table,constraints[field])
            if row.get('enabled','1')!='1':raise ValueError('探索配置已停用')
    if busy(agent.pk):
        # The life item itself may already be marked running.
        from ..life_models import LifeItem
        if not life_item or busy_for_life(agent.pk,life_item.pk):
            raise ValueError('居民正在进行其他活动')
    available_window(owner,agent.pk,duration,life_item.pk if life_item else '',now)
    profile = ensure(owner,agent,now)
    adopt_catalog(profile,catalog)
    recover(profile,now)
    profile.save()
    row = Exploration.objects.create(pk=key,owner_id=owner,actor_id=agent.pk,actor_name=agent.name,catalog_id=catalog.version,
        life_item_id=life_item.pk if life_item else '',duration_seconds=duration,snapshot={'constraints':constraints,'origin':uuid.uuid4().hex})
    CombatRuntime.objects.update_or_create(pk=key,defaults={'owner_id':owner,'authorized':True,'requests':{'origin':row.snapshot['origin']}})
    append(profile,key+':request','request',{'constraints':constraints},row)
    return row


def busy_for_life(actor, item):
    from ..life_models import LifeItem
    from ..travel_candidates import travelling_ids
    from ..market_models import MarketSession
    return actor in travelling_ids() or Exploration.objects.filter(actor_id=actor,status__in=OPEN).exists() or MarketSession.objects.filter(actor_id=actor,status='active').exists() or AgentExecutionLease.objects.filter(agent_id=actor,until__gt=storage_time(local_time())).exists() or LifeItem.objects.filter(actor_id=actor,status='running').exclude(pk=item).exists()


def consume(run, profile, amount, block, now):
    key = hashlib.sha256(f'combat-energy:{run.pk}:{block}'.encode()).hexdigest()
    agent = Agent.objects.get(pk=run.actor_id)
    if stamina(agent,storage_time(now)) < amount:
        raise ValueError('体力不足')
    WorldAction.objects.create(pk=key,actor_id=run.actor_id,status='success',consumed_at=storage_time(now),energy_cost=amount,effects_done=True,
        snapshot={'combat_energy':True},result={'exploration_id':run.pk,'block':block})
    run.result['energy'] = run.result.get('energy',0)+amount
    return {'action_id':key,'amount':amount,'block':block}


@guarded
@transaction.atomic
def depart(run_id, plan, now=None):
    now=local_time(now)
    run=Exploration.objects.select_for_update().get(pk=run_id)
    if run.status!='preparing':return run
    runtime=CombatRuntime.objects.filter(pk=run.pk,authorized=True).first()
    if not runtime:raise ValueError('探索执行授权已撤销')
    agent=Agent.objects.select_for_update().get(pk=run.actor_id)
    profile=CombatProfile.objects.select_for_update().get(pk=run.actor_id)
    if run.life_item_id:
        from .schedule import automatic_enabled
        from ..life_models import LifeItem
        from ..life_scope import check_item_authorization
        item=LifeItem.objects.get(pk=run.life_item_id)
        if not item.context.get('manual') and not automatic_enabled(run.owner_id):raise ValueError('本机自动探索已关闭')
        check_item_authorization(item)
    profile.catalog_id=run.catalog_id
    catalog=current(run.catalog_id)
    dungeon=catalog.row('dungeons',plan['dungeon_id'])
    catalog.row('styles',plan['style_id'])
    duration=plan['duration_seconds']
    if type(duration)is not int or duration not in (1800,3600,7200):raise ValueError('探索时长无效')
    for key,val in run.snapshot['constraints'].items():
        if plan.get(key)!=val:raise ValueError('准备计划未遵守用户约束')
    available_window(run.owner_id,run.actor_id,duration,run.life_item_id,now)
    if busy(run.actor_id,excluding=run.pk):raise ValueError('准备结束时居民已被其他活动占用')
    config,_=CombatConfig.objects.get_or_create(pk=run.owner_id)
    day=now.date().isoformat()
    for budget_day,seconds in day_parts(now,duration).items():
        if profile.loot_progress.get('days',{}).get(budget_day,0)+seconds>config.daily_minutes*60:raise ValueError('探索时长超出当日时间额度')
    if stamina(agent,storage_time(now))<energy(duration):raise ValueError('探索全程体力预留不足')
    potions=plan.get('potions',{})
    if not isinstance(potions,dict):raise ValueError('携带药剂格式无效')
    for sid,count in potions.items():
        definition=catalog.row('potions',sid)
        if type(count)is not int or not 0<=count<=99 or int(definition['required_level'])>profile.progression['level'] or definition['enabled']!='1':raise ValueError('携带药剂无效')
        if count:take_stock(profile.pk,profile.owner_id,'combat.'+sid,count)
    if sum(potions.values())>int(catalog.rules['potion_carry_cap']):raise ValueError('每次最多携带 20 瓶药剂')
    derived=stats(profile,catalog)
    from .equipment import allowed
    for item in EquipmentInstance.objects.filter(pk__in=profile.loadout.values()):
        if not allowed(catalog,item.template_id,profile.progression['job'],profile.progression['level'],item.snapshot['level']):raise ValueError('出发装备已停用或不满足职业/等级条件')
    run.duration_seconds=duration
    run.snapshot={**run.snapshot,'plan':plan,'equipment':wearing(profile),'progression':profile.progression}
    run.result={'energy':0,'experience':0,'kills':0,'potions_used':{},'rewards':[],'growth':[]}
    run.state={'player':engine.fighter(derived,agent.name,profile.progression['level'],hp=profile.hp,mp=profile.mp,skills=profile.progression['skills'],passives=attributes.passives(catalog,profile.progression['skills'])),
        'enemy':None,'potions':potions,'encounter':0,'nonboss_kills':0,'boss_seen':False,'waiting_until':0}
    charges=[consume(run,profile,10,'entry',now),consume(run,profile,2,0,now)]
    spawn(run,catalog,now)
    lease,_=AgentExecutionLease.objects.get_or_create(agent=agent)
    lease.token=lease_token(run.pk);lease.until=storage_time(now+timedelta(seconds=duration+60));lease.save()
    run.status,run.phase='active','battle'
    run.next_tick_at=now+timedelta(seconds=15)
    run.revision+=1
    run.save()
    append(profile,run.pk+':depart','depart',{'plan':plan,'consumption':charges},run)
    return run


def spawn(run,catalog,now):
    rng=seeded(run,f'encounter:{run.state["encounter"]+1}')
    dungeon=catalog.row('dungeons',run.snapshot['plan']['dungeon_id'])
    count=run.state['nonboss_kills']
    probability=min(float(dungeon['boss_probability_cap']),float(dungeon['boss_probability_step'])*max(0,count-int(dungeon['boss_start_kills'])+1))
    boss=not run.state['boss_seen'] and rng.random()<probability and catalog.row('monsters',dungeon['boss_id'])['enabled']=='1'
    if boss:
        sid=dungeon['boss_id'];level=rng.randint(int(dungeon['boss_level_min']),int(dungeon['boss_level_max']))
        run.state['boss_seen']=True
    else:
        options=[r for r in catalog.tables['dungeon_monsters'] if r['dungeon_id']==dungeon['id'] and r['enabled']=='1' and catalog.row('monsters',r['monster_id'])['enabled']=='1']
        row=rng.choices(options,weights=[float(r['encounter_weight']) for r in options])[0]
        sid=row['monster_id'];level=max(int(row['level_min']),min(int(row['level_max']),run.state['player']['level']+rng.randint(-2,2)))
    template=catalog.row('monsters',sid)
    run.state['monster_id']=sid
    run.state['enemy']=engine.fighter(attributes.monster(catalog,template,level),template['name'],level,rank=template['rank'])
    run.state['encounter']+=1
    CombatEncounter.objects.create(pk=f'{run.pk}:{run.state["encounter"]}',exploration_id=run.pk,owner_id=run.owner_id,actor_id=run.actor_id,number=run.state['encounter'],monster={'id':sid,'level':level,'name':template['name'],'rank':template['rank']},started_at=now)
    run.phase='battle'


def settle(run, profile, status, reason, now):
    if run.status in TERMINAL:return run
    catalog=current(run.catalog_id)
    returned={}
    for sid,count in run.state.get('potions',{}).items():
        if count:
            row=catalog.row('potions',sid)
            add_stock(profile.pk,profile.owner_id,profile.actor_name,'combat.'+sid,count,row['name'],'combat_potion',row['purchase_price'],run.pk+':return')
            returned[sid]=count
    player=run.state.get('player')
    if player:
        profile.hp,profile.mp=player['hp'],player['mp']
        player['states']=[];player['cooldowns']={};player['potion_cooldowns']={}
    if status=='fallen':profile.rest_until=now+timedelta(minutes=30)
    profile.recovered_at=now
    profile.save()
    run.status,run.phase,run.reason=status,'done',reason[:500]
    run.ended_at,run.next_tick_at=now,None
    run.revision+=1
    report=f'{run.actor_name}探索{run.elapsed_seconds//60}分钟，击败{run.result.get("kills",0)}只怪物，获得{run.result.get("experience",0)}经验；消耗{run.result.get("energy",0)}体力。{reason}'
    names=[f'{reward["item"]["name"]}×{reward.get("quantity",1)}' for reward in run.result.get('rewards',[])]
    if names:report+=' 收获：'+'、'.join(names)+'。'
    report+=f'消耗药剂 {sum(run.result.get("potions_used",{}).values())} 瓶，返回 Lv.{profile.progression["level"]}。'
    run.result={**run.result,'report':report,'returned_potions':returned}
    run.save()
    CombatEncounter.objects.filter(exploration_id=run.pk,ended_at__isnull=True).update(ended_at=storage_time(now),result={'status':status,'defeated':False})
    AgentExecutionLease.objects.filter(agent_id=run.actor_id,token=lease_token(run.pk)).update(token='',until=None)
    CombatRuntime.objects.filter(pk=run.pk,authorized=True).update(promotion_pending=True)
    CombatRuntime.objects.filter(pk=run.pk).update(authorized=False,token='',until=None)
    record=AgentRunRecord.objects.filter(pk=run.record_id).first()
    if not record:
        record=AgentRunRecord.objects.create(agent_id=run.actor_id if Agent.objects.filter(pk=run.actor_id).exists() else None,agent_name=run.actor_name,task_name='迷宫探索',trigger='生活安排' if run.life_item_id else '手动探索')
        run.record_id=record.pk;run.save(update_fields=['record_id'])
    record.status='success' if status in ('completed','recalled') else 'failed'
    record.summary,record.output,record.duration=report[:255],report,f'{run.elapsed_seconds//60} 分钟'
    record.steps=[{'kind':'exploration','exploration_id':run.pk,'result':run.result}];record.save()
    if run.life_item_id:
        from ..life_models import LifeItem
        from ..life_schedule import revise
        item=LifeItem.objects.filter(pk=run.life_item_id).first()
        if item:revise(item,'战斗探索已结算',status='completed' if record.status=='success' else 'failed',record_id=record.pk,result={'exploration_id':run.pk,'reason':report})
    append(profile,run.pk+':terminal','terminal',{'status':status,'report':report,'returned':returned,'record_id':record.pk},run)
    return run


@guarded
@transaction.atomic
def finish(run_id, status='recalled', reason='提前召回', now=None):
    run=Exploration.objects.select_for_update().get(pk=run_id)
    profile=CombatProfile.objects.select_for_update().get(pk=run.actor_id)
    return settle(run,profile,status,reason,local_time(now))


@guarded
@transaction.atomic
def tick(run_id, expected_revision=None, now=None):
    now=local_time(now)
    run=Exploration.objects.select_for_update().get(pk=run_id)
    if run.status!='active' or (expected_revision is not None and run.revision!=expected_revision):return run
    if now<local_time(run.next_tick_at):return run
    profile=CombatProfile.objects.select_for_update().get(pk=run.actor_id)
    if not CombatRuntime.objects.filter(pk=run.pk,authorized=True).exists() or (now-local_time(run.next_tick_at)).total_seconds()>30:
        run.status,run.phase,run.reason='paused','interrupted','执行授权失效或推进延迟超过 30 秒，需人工接续'
        run.next_tick_at=None;run.revision+=1;run.save()
        append(profile,f'{run.pk}:pause:{run.revision}','pause',{'reason':run.reason},run)
        return run
    catalog=current(run.catalog_id)
    day=now.date().isoformat()
    config=CombatConfig.objects.get(pk=run.owner_id)
    credits=day_parts(local_time(run.next_tick_at)-timedelta(seconds=15),15)
    if any(profile.loot_progress.get('days',{}).get(d,0)+seconds>config.daily_minutes*60 for d,seconds in credits.items()):
        return settle(run,profile,'exhausted','今日探索时间额度耗尽',now)
    charges=[]
    # A new block starts only if another action will occur; no charge at the endpoint.
    if run.elapsed_seconds and run.elapsed_seconds%300==0 and run.elapsed_seconds<run.duration_seconds:
        try:charges.append(consume(run,profile,2,run.elapsed_seconds//300,now))
        except ValueError:return settle(run,profile,'exhausted','体力不足，探索结束',now)
    run.elapsed_seconds+=15
    for credited_day,seconds in credits.items():rewards.accrue(profile.loot_progress,seconds,credited_day)
    profile.save()
    if run.elapsed_seconds>=run.duration_seconds:
        run.revision+=1;run.save()
        append(profile,f'{run.pk}:round:{run.elapsed_seconds//15}','round',{'events':[],'growth':[],'consumption':charges,'potions':{}},run)
        return settle(run,profile,'completed','按计划完成探索',now)
    before=dict(run.state['potions'])
    tick_number=run.elapsed_seconds//15
    waiting=run.state['enemy'] is None
    run.state,events=engine.step(catalog,run.state,run.snapshot['plan']['style_id'],tick_number,seeded(run,f'round:{tick_number}'),waiting=waiting)
    for sid,count in before.items():
        used=count-run.state['potions'].get(sid,0)
        if used:run.result['potions_used'][sid]=run.result['potions_used'].get(sid,0)+used
    if run.state['player']['hp']<=0:
        profile.hp=0;profile.save()
        run.revision+=1;run.save()
        append(profile,f'{run.pk}:round:{tick_number}','round',{'events':events,'consumption':charges,'potions':{k:before[k]-run.state['potions'].get(k,0) for k in before}},run)
        return settle(run,profile,'fallen','角色倒地，休息 30 分钟',now)
    enemy=run.state.get('enemy')
    earned=[];growth=[]
    if enemy and enemy['hp']<=0:
        experience=attributes.kill_experience(catalog,enemy['level'],profile.progression['level'],enemy['rank'])
        old=stats(profile,catalog)
        profile.progression,growth=attributes.award(catalog,profile.progression,experience)
        derived=stats(profile,catalog)
        player=run.state['player']
        player['hp']=max(1,math.floor(player['hp']/old['hp_max']*derived['hp_max']))
        player['mp']=math.floor(player['mp']/max(1,old['mp_max'])*derived['mp_max'])
        player.update(stats=derived,level=profile.progression['level'],skills=profile.progression['skills'],passives=attributes.passives(catalog,profile.progression['skills']))
        run.result['experience']+=experience;run.result['kills']+=1
        run.result['growth']+=growth
        earned=rewards.drops(catalog,run.state['monster_id'],enemy['level'],profile.loot_progress,seeded(run,f'reward:{run.state["encounter"]}'))
        for index,reward in enumerate(earned):
            identity=f'{run.pk}:reward:{run.state["encounter"]}:{index}'
            if reward['kind']=='equipment':
                item=reward['item']
                EquipmentInstance.objects.create(pk=hashlib.sha256(identity.encode()).hexdigest(),owner_id=run.owner_id,actor_id=run.actor_id,catalog_id=run.catalog_id,template_id=item['template_id'],snapshot=item,value=item['value'])
                reward['equipment_id']=hashlib.sha256(identity.encode()).hexdigest()
            else:
                item=reward['item']
                add_stock(run.actor_id,run.owner_id,run.actor_name,'combat.'+item['id'],reward['quantity'],item['name'],'combat_material',item['sale_price'],identity)
            reward['id']=identity;reward['elapsed_seconds']=run.elapsed_seconds
        run.result['rewards']+=earned
        encounter=CombatEncounter.objects.get(pk=f'{run.pk}:{run.state["encounter"]}')
        encounter.result={'killed':True,'experience':experience,'rewards':earned};encounter.ended_at=now;encounter.save()
        if enemy['rank']!='boss':run.state['nonboss_kills']+=1
        events.append({'kind':'kill','monster':encounter.monster,'experience':experience,'rewards':earned})
        run.state['enemy']=None;run.state['waiting_until']=run.elapsed_seconds+30;run.phase='searching'
    elif waiting and run.elapsed_seconds>=run.state['waiting_until']:
        spawn(run,catalog,now)
        events.append({'kind':'encounter','monster_id':run.state['monster_id'],'name':run.state['enemy']['name']})
    profile.hp,profile.mp=run.state['player']['hp'],run.state['player']['mp'];profile.save()
    run.next_tick_at=local_time(run.next_tick_at)+timedelta(seconds=15)
    run.revision+=1;run.save()
    append(profile,f'{run.pk}:round:{tick_number}','round',{'events':events,'growth':growth,'consumption':charges,'potions':{k:before[k]-run.state['potions'].get(k,0) for k in before}},run)
    return run


@guarded
@transaction.atomic
def resume(run_id, now=None):
    now=local_time(now)
    run=Exploration.objects.select_for_update().get(pk=run_id)
    if run.status!='paused':raise ValueError('探索不处于暂停状态')
    # Same backend only; local runtime is deliberately absent after import on another host.
    runtime=local_runtime(run)
    if not runtime:raise ValueError('其他设备只可展示探索历史，不能接续')
    profile=CombatProfile.objects.get(pk=run.actor_id)
    config,_=CombatConfig.objects.get_or_create(pk=run.owner_id)
    remaining=run.duration_seconds-run.elapsed_seconds
    if any(profile.loot_progress.get('days',{}).get(day,0)+seconds>config.daily_minutes*60 for day,seconds in day_parts(now,remaining).items()):
        raise ValueError('剩余探索时长超出当日时间额度')
    available_window(run.owner_id,run.actor_id,run.duration_seconds-run.elapsed_seconds,run.life_item_id,now)
    if busy(run.actor_id,excluding=run.pk):raise ValueError('居民正在执行其他活动')
    if stamina(Agent.objects.get(pk=run.actor_id),storage_time(now))<energy(run.duration_seconds)-run.result.get('energy',0):raise ValueError('剩余体力预留不足')
    runtime.authorized=True;runtime.save()
    lease,_=AgentExecutionLease.objects.get_or_create(agent_id=run.actor_id)
    lease.token=lease_token(run.pk);lease.until=storage_time(now+timedelta(seconds=run.duration_seconds-run.elapsed_seconds+60));lease.save()
    run.status,run.phase,run.reason='active','battle' if run.state.get('enemy') else 'searching',''
    run.next_tick_at=now+timedelta(seconds=15);run.revision+=1;run.save()
    append(CombatProfile.objects.get(pk=run.actor_id),f'{run.pk}:resume:{run.revision}','resume',{},run)
    return run
