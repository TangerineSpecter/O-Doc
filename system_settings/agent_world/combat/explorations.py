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
from .profiles import ensure, wearing, recover, adopt_catalog, OPEN
from .facts import append
from . import engine, attributes, rewards, equipment
from ..farm_gate import guarded
from ..life_time import local_time, storage_time
from ..execution import stamina
from ..inventory_stock import take_stock, add_stock

TERMINAL = ('completed','fallen','recalled','exhausted','interrupted','failed')
EXECUTION_COMPLETED = ('completed','recalled','fallen','exhausted')


def execution_completed(status):
    """Expected exploration outcomes are settled tasks; only execution faults fail the task."""
    return status in EXECUTION_COMPLETED


def seeded(run, channel):
    return random.Random(hashlib.sha256(f'{run.pk}:{channel}'.encode()).digest())


def lease_token(identity):
    # This token belongs to AgentExecutionLease (40 chars), not CombatRuntime (64).
    return 'combat:'+hashlib.sha256(identity.encode()).hexdigest()[:33]


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
        # Exploration advances in whole seconds, including intervals crossing midnight.
        count=min(remaining,math.ceil((boundary-point).total_seconds()))
        if count<=0:raise ValueError('探索时间边界无效')
        day=point.date().isoformat();parts[day]=parts.get(day,0)+count
        point+=timedelta(seconds=count);remaining-=count
    return parts


def available_window(owner, actor, duration, life_id='', now=None):
    from ..life_models import LifeConfig
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


@guarded
@transaction.atomic
def request(owner, agent, key, constraints, *, life_item=None, now=None):
    from system_settings.agent_availability import require_active_agent
    agent = require_active_agent(agent)
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
    if attributes.promotion_options(catalog,profile.progression):
        raise ValueError('达到转职等级，等待 Agent 完成转职后才能继续探索')
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
    return actor in travelling_ids() or Exploration.objects.filter(actor_id=actor,status__in=OPEN).exists() or MarketSession.objects.filter(actor_id=actor,status='active',expires_at__gt=storage_time(local_time())).exists() or AgentExecutionLease.objects.filter(agent_id=actor,until__gt=storage_time(local_time())).exists() or LifeItem.objects.filter(actor_id=actor,status='running').exclude(pk=item).exists()


@guarded
@transaction.atomic
def request_promotion_retry(owner, agent, key):
    from system_settings.agent_availability import require_active_agent
    agent=require_active_agent(agent)
    profile=CombatProfile.objects.select_for_update().filter(pk=agent.pk,owner_id=owner).first()
    if not profile:raise ValueError('冒险档案不存在')
    catalog=current(profile.catalog_id)
    if not attributes.promotion_options(catalog,profile.progression):raise ValueError('当前没有待完成的转职')
    run=Exploration.objects.filter(owner_id=owner,actor_id=agent.pk,status='paused').order_by('-created_at').first()
    if not run:
        run=Exploration.objects.filter(owner_id=owner,actor_id=agent.pk,ended_at__isnull=False).order_by('-ended_at').first()
    if not run:raise ValueError('找不到可继续转职的探索记录')
    runtime=CombatRuntime.objects.select_for_update().filter(pk=run.pk).first()
    if run.status=='paused':
        if not runtime or not local_runtime(run):raise ValueError('其他设备只可展示探索历史，不能接续转职')
        if run.phase not in ('promotion','promotion_failed','interrupted'):
            raise ValueError('当前探索尚未到达转职处理点')
    else:
        if runtime and runtime.requests.get('promotion_allowed'):
            raise ValueError('Agent 正在处理转职选择')
        runtime,_=CombatRuntime.objects.get_or_create(pk=run.pk,defaults={'owner_id':owner,'requests':{'origin':run.snapshot.get('origin','')}})
        if not local_runtime(run):
            runtime.authorized=False;runtime.requests={'origin':run.snapshot.get('origin','')};runtime.save(update_fields=['authorized','requests'])
    if runtime.requests.get('promotion_retry_key')==key or runtime.promotion_pending or runtime.requests.get('promotion_allowed'):
        return run
    runtime.requests={**runtime.requests,'promotion_retry_key':key}
    runtime.promotion_pending=True;runtime.save(update_fields=['promotion_pending','requests'])
    return run


def hold_for_promotion(run, profile):
    run.status,run.phase,run.reason='paused','promotion','达到转职等级，等待 Agent 选择职业后继续探索'
    run.next_tick_at=None;run.revision+=1;run.save()
    runtime=CombatRuntime.objects.filter(pk=run.pk).first()
    if runtime:
        runtime.authorized=False;runtime.promotion_pending=True;runtime.token='';runtime.until=None
        runtime.save(update_fields=['authorized','promotion_pending','token','until'])
    AgentExecutionLease.objects.filter(agent_id=run.actor_id,token=lease_token(run.pk)).update(token='',until=None)
    return append(profile,f'{run.pk}:promotion-pause:{run.revision}','promotion_pause',{'reason':run.reason},run)


def consume(run, profile, amount, block, now):
    key = hashlib.sha256(f'combat-energy:{run.pk}:{block}'.encode()).hexdigest()
    agent = Agent.objects.get(pk=run.actor_id)
    from ..life_commitments import require_energy
    require_energy(run.owner_id, agent, amount, item_id=run.life_item_id, manual=not run.life_item_id, now=now)
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
        from ..life_models import LifeItem
        from ..life_scope import check_item_authorization
        item=LifeItem.objects.get(pk=run.life_item_id)
        check_item_authorization(item)
    profile.catalog_id=run.catalog_id
    catalog=current(run.catalog_id)
    if attributes.promotion_options(catalog,profile.progression):raise ValueError('达到转职等级，等待 Agent 完成转职后才能继续探索')
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
        if profile.loot_progress.get('days',{}).get(budget_day,0)+seconds>config.daily_minutes*60:raise ValueError(f'探索时长超出当日时间额度（每日累计探索限额：{config.daily_minutes} 分钟）')
    if run.life_item_id:
        from ..life_interleaving_candidates import legal_durations
        if duration not in legal_durations(item, [duration], seconds=True, now=now):
            raise ValueError('准备后空档或体力不足以执行已选探索时长')
    if stamina(agent,storage_time(now))<energy(duration):raise ValueError('探索全程体力预留不足')
    potions=plan.get('potions',{})
    if not isinstance(potions,dict):raise ValueError('携带药剂格式无效')
    for sid,count in potions.items():
        definition=catalog.row('potions',sid)
        if type(count)is not int or not 0<=count<=99 or int(definition['required_level'])>profile.progression['level'] or definition['enabled']!='1':raise ValueError('携带药剂无效')
        if count:take_stock(profile.pk,profile.owner_id,'combat.'+sid,count)
    if sum(potions.values())>int(catalog.rules['potion_carry_cap']):raise ValueError('每次最多携带 20 瓶药剂')
    from .elixir import auto_plan as plan_elixirs, consume as consume_elixirs, CARRY_CAP
    elixir_entries = plan.get('elixirs')
    if elixir_entries is None:
        elixir_entries = plan_elixirs(profile.pk, profile.owner_id)
    elixirs = consume_elixirs(run, elixir_entries)
    plan = {**plan, 'elixirs': [{key: entry[key] for key in ('recipe_id', 'stars', 'count')} for entry in elixirs]}
    run.snapshot = {**run.snapshot, 'elixir_version': 1, 'elixirs': elixirs}
    from .food import consume as consume_food, combat_stats
    food, food_adjustment = consume_food(run, plan.get('food'), duration)
    plan = {**plan, 'food': ({key: food[key] for key in ('recipe_id', 'stars', 'quantity')} if food else None)}
    run.snapshot = {**run.snapshot, 'food_version': 1, 'food': food, 'food_adjustment': food_adjustment}
    derived=combat_stats(profile,catalog,run.snapshot)
    loadout_ids=set(profile.loadout.values())
    worn_items={item.pk:item for item in EquipmentInstance.objects.filter(
        pk__in=loadout_ids,actor_id=profile.pk,owner_id=run.owner_id,sold=False)}
    if len(profile.loadout)!=len(loadout_ids) or len(worn_items)!=len(loadout_ids):
        raise ValueError('出发装备归属或来源无效')
    from .equipment_snapshot import slot_matches
    for slot,identity in profile.loadout.items():
        item=worn_items[identity]
        if not slot_matches(item.snapshot,item.rules,slot):
            raise ValueError('出发装备槽位记录无效')
    from ..life_schedule import reschedule_after_exploration
    reschedule_after_exploration(run.owner_id,run.actor_id,now,duration,life_item_id=run.life_item_id)
    run.duration_seconds=duration
    profession_bonuses = rewards.profession_bonus_snapshot(agent)
    run.snapshot={**run.snapshot,'plan':plan,'equipment':wearing(profile),'progression':profile.progression,
                  'profession_bonuses':profession_bonuses}
    run.result={'energy':0,'experience':0,'kills':0,'potions_used':{},'elixirs_used':{},'rewards':[],'growth':[]}
    run.result.update(food=food, food_adjustment=food_adjustment,
                      elixirs_carried=[{key: entry[key] for key in ('recipe_id', 'stars', 'count')} for entry in elixirs])
    run.state={'player':engine.fighter(derived,agent.name,profile.progression['level'],hp=profile.hp,mp=profile.mp,
        skills=profile.progression['skills'],passives=attributes.passives(catalog,profile.progression['skills'],wearing(profile))),
        'enemy':None,'potions':potions,'elixirs':elixirs,'elixir_cooldown':0,'elixir_used_encounter':-1,
        'encounter':0,'nonboss_kills':0,'boss_seen':False,'waiting_until':0,'food':food}
    charges=[consume(run,profile,10,'entry',now),consume(run,profile,2,0,now)]
    spawn(run,catalog,now)
    lease,_=AgentExecutionLease.objects.get_or_create(agent=agent)
    lease.token=lease_token(run.pk);lease.until=storage_time(now+timedelta(seconds=duration+60));lease.save()
    run.status,run.phase='active','battle'
    run.next_tick_at=now+timedelta(seconds=15)
    run.revision+=1
    run.save()
    append(profile,run.pk+':depart','depart',{'plan':plan,'profession_bonuses':profession_bonuses,'consumption':charges,
           'food_version':1,'food':food,'food_adjustment':food_adjustment,
           'elixir_version':1,'elixirs':elixirs},run)
    return run


def spawn(run,catalog,now):
    rng=seeded(run,f'encounter:{run.state["encounter"]+1}')
    dungeon=catalog.row('dungeons',run.snapshot['plan']['dungeon_id'])
    count=run.state['nonboss_kills']
    probability=min(float(dungeon['boss_probability_cap']),float(dungeon['boss_probability_step'])*max(0,count-int(dungeon['boss_start_kills'])+1)) if dungeon.get('boss_id') else 0
    boss=bool(dungeon.get('boss_id')) and not run.state['boss_seen'] and rng.random()<probability and catalog.row('monsters',dungeon['boss_id'])['enabled']=='1'
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
    run.state['round_in_encounter']=0
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
    returned_elixirs=[]
    from .elixir import unused_lots
    for entry in run.state.get('elixirs') or []:
        remaining=int(entry.get('remaining') or 0)
        if remaining:
            for lot in unused_lots(entry):
                add_stock(profile.pk,profile.owner_id,profile.actor_name,'elixir.'+entry['recipe_id'],lot['quantity'],
                          entry['name'],'elixir',lot['price'],run.pk+':elixir-return',stars=entry['stars'])
            from ..market_disposition import enqueue
            enqueue(profile.owner_id, profile.pk, 'elixir.'+entry['recipe_id'], remaining,
                    source='exploration', operation=run.pk+':elixir-return')
            returned_elixirs.append({'recipe_id':entry['recipe_id'],'stars':entry['stars'],'count':remaining})
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
    reward_counts = {}
    for reward in run.result.get('rewards', []):
        if isinstance(reward, dict):
            item = reward.get('item') or {}
            name = item.get('name') if isinstance(item, dict) else None
            if name:
                reward_counts[name] = reward_counts.get(name, 0) + reward.get('quantity', 1)
    names=[f'{name}×{count}' for name, count in reward_counts.items()]
    if names:report+=' 收获：'+'、'.join(names)+'。'
    report+=f'消耗药剂 {sum(run.result.get("potions_used",{}).values())} 瓶，返回 Lv.{profile.progression["level"]}。'
    elixir_used=sum(run.result.get('elixirs_used',{}).values())
    if run.result.get('elixirs_carried') or elixir_used:
        report+=f' 炼金药水使用 {elixir_used} 瓶，返还 {sum(row["count"] for row in returned_elixirs)} 瓶。'
    food = run.result.get('food')
    if food:
        report += f" 美食：{food['stars']}星{food['name']}×{food['quantity']}份（{food['summary']}），效果已结束。"
    if run.result.get('food_adjustment'):
        report += ' ' + run.result['food_adjustment']
    run.result={**run.result,'report':report,'returned_potions':returned,'returned_elixirs':returned_elixirs}
    from .history_snapshot import frozen_run
    run.snapshot = frozen_run(run.snapshot, catalog)
    run.save()
    CombatEncounter.objects.filter(exploration_id=run.pk,ended_at__isnull=True).update(ended_at=storage_time(now),result={'status':status,'defeated':False})
    AgentExecutionLease.objects.filter(agent_id=run.actor_id,token=lease_token(run.pk)).update(token='',until=None)
    if local_runtime(run):
        CombatRuntime.objects.filter(pk=run.pk).update(promotion_pending=True)
    CombatRuntime.objects.filter(pk=run.pk).update(authorized=False,token='',until=None)
    record=AgentRunRecord.objects.filter(pk=run.record_id).first()
    if not record:
        record=AgentRunRecord.objects.create(agent_id=run.actor_id if Agent.objects.filter(pk=run.actor_id).exists() else None,agent_name=run.actor_name,task_name='迷宫探索',trigger='生活安排' if run.life_item_id else '手动探索')
        run.record_id=record.pk;run.save(update_fields=['record_id'])
    record.status='success' if execution_completed(status) else 'failed'
    record.summary,record.output,record.duration=report[:255],report,f'{run.elapsed_seconds//60} 分钟'
    record.steps=[{'kind':'exploration','exploration_id':run.pk,'result':run.result}]
    record.save()
    if run.life_item_id:
        from ..life_models import LifeItem
        from ..life_schedule import revise
        item=LifeItem.objects.filter(pk=run.life_item_id).first()
        if item:revise(item,'战斗探索已结算',status='completed' if execution_completed(status) else 'failed',record_id=record.pk,result={'exploration_id':run.pk,'reason':report})
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
    from .recovery import deadline
    end=deadline(run)
    if end and now>=end and (run.elapsed_seconds+15<run.duration_seconds or (now-local_time(run.next_tick_at)).total_seconds()>30):
        return settle(run,profile,'completed','已到预计返回时间；暂停期间不计探索成果',now)
    if not CombatRuntime.objects.filter(pk=run.pk,authorized=True).exists() or (now-local_time(run.next_tick_at)).total_seconds()>30:
        run.status,run.phase,run.reason='paused','interrupted','执行授权失效或推进延迟超过 30 秒，等待自动检查接续'
        run.next_tick_at=None;run.revision+=1;run.save()
        append(profile,f'{run.pk}:pause:{run.revision}','pause',{'reason':run.reason},run)
        return run
    catalog=current(run.catalog_id)
    if attributes.promotion_options(catalog,profile.progression):
        hold_for_promotion(run,profile)
        return run
    day=now.date().isoformat()
    config=CombatConfig.objects.get(pk=run.owner_id)
    credits=day_parts(local_time(run.next_tick_at)-timedelta(seconds=15),15)
    if any(profile.loot_progress.get('days',{}).get(d,0)+seconds>config.daily_minutes*60 for d,seconds in credits.items()):
        return settle(run,profile,'exhausted',f'今日探索时间额度耗尽（每日累计探索限额：{config.daily_minutes} 分钟）',now)
    charges=[]
    # A new block starts only if another action will occur; no charge at the endpoint.
    if run.elapsed_seconds and run.elapsed_seconds%300==0 and run.elapsed_seconds<run.duration_seconds:
        try:charges.append(consume(run,profile,2,run.elapsed_seconds//300,now))
        except ValueError:return settle(run,profile,'exhausted','体力不足，探索结束',now)
    run.elapsed_seconds+=15
    profession_bonuses = run.snapshot.get('profession_bonuses') or {}
    for credited_day,seconds in credits.items():
        rewards.accrue(
            profile.loot_progress,
            seconds,
            credited_day,
            loot_interval_seconds=int(catalog.rules['loot_interval_seconds']),
            equipment_interval_seconds=int(catalog.rules['equipment_interval_seconds']),
            equipment_interval_reduction_percentage=profession_bonuses.get('maze_equipment_interval_reduction_percentage', 0),
        )
    profile.save()
    if run.elapsed_seconds>=run.duration_seconds:
        run.revision+=1;run.save()
        append(profile,f'{run.pk}:round:{run.elapsed_seconds//15}','round',{'events':[],'growth':[],'consumption':charges,'potions':{}},run)
        return settle(run,profile,'completed','按计划完成探索',now)
    before=dict(run.state['potions'])
    elixir_before={(entry['recipe_id'],entry['stars']):entry.get('remaining',0) for entry in run.state.get('elixirs',[])}
    tick_number=run.elapsed_seconds//15
    waiting=run.state['enemy'] is None
    run.state,events=engine.step(catalog,run.state,run.snapshot['plan']['style_id'],tick_number,seeded(run,f'round:{tick_number}'),waiting=waiting)
    for sid,count in before.items():
        used=count-run.state['potions'].get(sid,0)
        if used:run.result['potions_used'][sid]=run.result['potions_used'].get(sid,0)+used
    used_elixirs={}
    for entry in run.state.get('elixirs',[]):
        key=(entry['recipe_id'],entry['stars'])
        used=elixir_before.get(key,0)-entry.get('remaining',0)
        if used:
            label=f'{key[0]}:{key[1]}'
            used_elixirs[label]=used
            run.result['elixirs_used'][label]=run.result['elixirs_used'].get(label,0)+used
    if run.state['player']['hp']<=0:
        profile.hp=0;profile.save()
        run.revision+=1;run.save()
        append(profile,f'{run.pk}:round:{tick_number}','round',{'events':events,'consumption':charges,'potions':{k:before[k]-run.state['potions'].get(k,0) for k in before},'elixirs':used_elixirs},run)
        return settle(run,profile,'fallen','角色倒地，休息 30 分钟',now)
    enemy=run.state.get('enemy')
    earned=[];growth=[]
    if enemy and enemy['hp']<=0:
        base_experience=attributes.kill_experience(catalog,enemy['level'],profile.progression['level'],enemy['rank'])
        experience=attributes.apply_experience_bonus(
            base_experience,
            profession_bonuses.get('maze_experience_bonus_percentage', 0),
        )
        from .food import combat_stats
        old=combat_stats(profile,catalog,run.snapshot)
        profile.progression,growth=attributes.award(catalog,profile.progression,experience,stop_at_promotion=True)
        derived=combat_stats(profile,catalog,run.snapshot)
        player=run.state['player']
        player['hp']=max(1,math.floor(player['hp']/old['hp_max']*derived['hp_max']))
        player['mp']=math.floor(player['mp']/max(1,old['mp_max'])*derived['mp_max'])
        player.update(stats=derived,level=profile.progression['level'],skills=profile.progression['skills'],
                      passives=attributes.passives(catalog,profile.progression['skills'],wearing(profile)))
        run.result['experience']+=experience;run.result['kills']+=1
        run.result['growth']+=growth
        earned=rewards.drops(
            catalog,
            run.state['monster_id'],
            enemy['level'],
            profile.loot_progress,
            seeded(run,f'reward:{run.state["encounter"]}'),
            profession_bonuses,
        )
        for index,reward in enumerate(earned):
            identity=f'{run.pk}:reward:{run.state["encounter"]}:{index}'
            if reward['kind']=='equipment':
                item=reward['item']
                EquipmentInstance.objects.create(pk=hashlib.sha256(identity.encode()).hexdigest(),owner_id=run.owner_id,actor_id=run.actor_id,catalog_id=run.catalog_id,template_id=item['template_id'],snapshot=item,value=item['value'])
                reward['equipment_id']=hashlib.sha256(identity.encode()).hexdigest()
            else:
                item=reward['item']
                add_stock(run.actor_id,run.owner_id,run.actor_name,'combat.'+item['id'],reward['quantity'],item['name'],'combat_material',item['sale_price'],identity)
                from ..market_disposition import enqueue
                enqueue(run.owner_id, run.actor_id, 'combat.'+item['id'], reward['quantity'],
                        source='loot', operation=identity)
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
    promotion_gate=bool(attributes.promotion_options(catalog,profile.progression))
    if promotion_gate:
        run.status,run.phase,run.reason='paused','promotion','达到转职等级，等待 Agent 选择职业后继续探索'
        run.next_tick_at=None;run.revision+=1;run.save()
        runtime=CombatRuntime.objects.filter(pk=run.pk).first()
        if runtime:
            runtime.authorized=False;runtime.promotion_pending=True;runtime.token='';runtime.until=None
            runtime.save(update_fields=['authorized','promotion_pending','token','until'])
        AgentExecutionLease.objects.filter(agent_id=run.actor_id,token=lease_token(run.pk)).update(token='',until=None)
        append(profile,f'{run.pk}:round:{tick_number}','round',{'events':events,'growth':growth,'consumption':charges,'potions':{k:before[k]-run.state['potions'].get(k,0) for k in before},'elixirs':used_elixirs,'promotion_gate':True},run)
        return run
    next_tick=local_time(run.next_tick_at)+timedelta(seconds=15)
    run.next_tick_at=min(next_tick,end) if end else next_tick
    run.revision+=1;run.save()
    append(profile,f'{run.pk}:round:{tick_number}','round',{'events':events,'growth':growth,'consumption':charges,'potions':{k:before[k]-run.state['potions'].get(k,0) for k in before},'elixirs':used_elixirs,'promotion_gate':False},run)
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
    if attributes.promotion_options(current(profile.catalog_id),profile.progression):raise ValueError('转职选择尚未完成，不能继续探索')
    from .recovery import deadline
    end=deadline(run)
    if end and now>=end:
        return settle(run,profile,'completed','已到预计返回时间；暂停期间不计探索成果',now)
    config,_=CombatConfig.objects.get_or_create(pk=run.owner_id)
    remaining=min(run.duration_seconds-run.elapsed_seconds,max(0,int((end-now).total_seconds()))) if end else run.duration_seconds-run.elapsed_seconds
    if any(profile.loot_progress.get('days',{}).get(day,0)+seconds>config.daily_minutes*60 for day,seconds in day_parts(now,remaining).items()):
        raise ValueError(f'剩余探索时长超出当日时间额度（每日累计探索限额：{config.daily_minutes} 分钟）')
    available_window(run.owner_id,run.actor_id,remaining,run.life_item_id,now)
    if busy(run.actor_id,excluding=run.pk):raise ValueError('居民正在执行其他活动')
    if stamina(Agent.objects.get(pk=run.actor_id),storage_time(now))<max(0,energy(run.elapsed_seconds+remaining)-run.result.get('energy',0)):raise ValueError('剩余体力预留不足')
    from ..life_schedule import reschedule_after_exploration
    reschedule_after_exploration(run.owner_id,run.actor_id,now,remaining,life_item_id=run.life_item_id)
    runtime.authorized=True;runtime.save()
    lease,_=AgentExecutionLease.objects.get_or_create(agent_id=run.actor_id)
    lease.token=lease_token(run.pk);lease.until=storage_time((end or now+timedelta(seconds=remaining))+timedelta(seconds=60));lease.save()
    run.status,run.phase,run.reason='active','battle' if run.state.get('enemy') else 'searching',''
    run.next_tick_at=min(now+timedelta(seconds=15),end) if end else now+timedelta(seconds=15)
    run.revision+=1;run.save()
    append(CombatProfile.objects.get(pk=run.actor_id),f'{run.pk}:resume:{run.revision}','resume',{},run)
    return run
