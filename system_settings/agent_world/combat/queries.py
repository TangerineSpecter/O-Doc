"""Consistent read projections; hot reports remain permanently paginated."""
from datetime import datetime
from .models import CombatProfile, EquipmentInstance, Exploration, CombatFact, CombatEncounter, CombatConfig, CombatRuntime
from .store import current
from .catalog import bundled
from . import attributes, engine
from .profiles import stats
from .permissions import local_runtime
from ..inventory_stock import stock_quantity
from ..life_time import local_time


def resident_presence(owner: str | None = None) -> dict[str, dict]:
    """Read current exploration occupancy without creating duplicate activity facts."""
    labels={'preparing':'准备探索','active':'探索中','paused':'探索暂停，等待自动恢复','settling':'探索结算中'}
    runs=Exploration.objects.filter(status__in=labels)
    if owner is not None:
        runs=runs.filter(owner_id=owner)
    return {run.actor_id:{'status':'idle' if run.status=='paused' else 'running',
        'current_action':labels[run.status]} for run in runs}


def with_timezone(value):
    if isinstance(value,datetime):return local_time(value).isoformat()
    if isinstance(value,dict):return {key:with_timezone(item) for key,item in value.items()}
    if isinstance(value,list):return [with_timezone(item) for item in value]
    return value


def catalog_view():
    from .models import CombatCatalog
    catalog=current() if CombatCatalog.objects.exists() else bundled()[0]
    return {'version':catalog.version,'tables':catalog.tables,'monster_previews':[{'id':row['id'],'level':int(row['level_min']),'attributes':attributes.monster(catalog,row,int(row['level_min']))} for row in catalog.tables['monsters']]}


def market_context(owner,agent):
    profile=CombatProfile.objects.filter(pk=agent.pk,owner_id=owner).first()
    catalog=current(profile.catalog_id) if profile else bundled()[0]
    level=profile.progression['level'] if profile else 1
    return {'potions':[row for row in catalog.tables['potions'] if int(row['required_level'])<=level and row['enabled']=='1'],
        'materials':[row for row in catalog.tables['materials'] if stock_quantity(agent.pk,owner,'combat.'+row['id'])],
        'equipment':list(EquipmentInstance.objects.filter(actor_id=agent.pk,owner_id=owner,sold=False,bound=False,locked=False).exclude(pk__in=profile.loadout.values() if profile else []).values('id','snapshot','value'))}


def profile_view(owner,agent):
    profile=CombatProfile.objects.filter(pk=agent.pk,owner_id=owner).first()
    catalog=current(profile.catalog_id) if profile else bundled()[0]
    progression=profile.progression if profile else attributes.initial()
    derived=stats(profile,catalog) if profile else attributes.attributes(catalog,progression,[])
    equipment=list(EquipmentInstance.objects.filter(actor_id=agent.pk,owner_id=owner,sold=False).order_by('-created_at').values())
    skills=[{'id':sid,'rank':rank,**catalog.row('skills',sid),'parameters':{**catalog.skill(sid,rank)[0],'current_cost':str(engine.cost(catalog,{'level':progression['level'],'passives':attributes.passives(catalog,progression['skills'])},sid,rank))},'effects':catalog.skill(sid,rank)[1]} for sid,rank in progression['skills'].items()]
    run=Exploration.objects.filter(actor_id=agent.pk,owner_id=owner,status__in=['preparing','active','paused','settling']).first()
    return {'initialized':bool(profile),'actor_id':agent.pk,'progression':progression,'attributes':derived,'hp':profile.hp if profile else derived['hp_max'],
        'mp':profile.mp if profile else derived['mp_max'],'loadout':profile.loadout if profile else {},'equipment':equipment,'skills':skills,
        'potions':[{**row,'owned':stock_quantity(agent.pk,owner,'combat.'+row['id'])} for row in catalog.tables['potions']],
        'materials':[{**row,'owned':stock_quantity(agent.pk,owner,'combat.'+row['id'])} for row in catalog.tables['materials']],
        'active_exploration_id':run.pk if run else None,'promotion_options':[row for row in catalog.tables['professions'] if row['parent_id']==progression['job'] and int(row['required_level'])<=progression['level']],
        'rest_until':local_time(profile.rest_until).isoformat() if profile and profile.rest_until else None,
        'loot_progress':profile.loot_progress if profile else {},'discoveries':{'encountered':sorted(set(CombatEncounter.objects.filter(owner_id=owner,actor_id=agent.pk).values_list('monster__id',flat=True))),'defeated':sorted(set(CombatEncounter.objects.filter(owner_id=owner,actor_id=agent.pk,result__killed=True).values_list('monster__id',flat=True))),'equipment':sorted(set(EquipmentInstance.objects.filter(owner_id=owner,actor_id=agent.pk).values_list('template_id',flat=True)))}}


def snapshot(run,cursor=0,limit=100):
    # The shared gate spans the complete read, preventing a round from crossing this snapshot.
    facts=CombatFact.objects.filter(exploration_id=run.pk).order_by('sequence')
    latest=facts.last()
    confirmed=latest.sequence if latest else 0
    events=list(facts.filter(sequence__gt=cursor,sequence__lte=confirmed).values('id','sequence','kind','elapsed_seconds','payload','created_at')[:limit])
    from .recovery import deadline
    end=deadline(run)
    remaining=max(0,int((end-local_time()).total_seconds())) if end and not run.ended_at else 0
    return {'id':run.pk,'actor_id':run.actor_id,'version':run.revision,'can_control':bool(local_runtime(run)),'catalog_version':run.catalog_id,'stage':run.phase,'status':run.status,'reason':run.reason,
        'remaining_seconds':remaining if end else None,
        'elapsed_seconds':run.elapsed_seconds,'duration_seconds':run.duration_seconds,'next_tick_at':local_time(run.next_tick_at).isoformat() if run.next_tick_at else None,
        'player':run.state.get('player'),'enemy':run.state.get('enemy'),'potions':run.state.get('potions',{}),'result':run.result,
        'events':events,'latest_cursor':confirmed,'next_cursor':events[-1]['sequence'] if events else min(cursor,confirmed),'has_more':bool(events and events[-1]['sequence']<confirmed)}


def history(owner,actor,page=1):
    rows=Exploration.objects.filter(owner_id=owner,actor_id=actor).order_by('-created_at','-id')
    return {'list':list(rows.values('id','status','phase','elapsed_seconds','duration_seconds','result','created_at','ended_at')[(page-1)*20:page*20]),'total':rows.count(),'page':page}


def config(owner):
    row=CombatConfig.objects.filter(pk=owner).first()
    local=CombatRuntime.objects.filter(pk='auto:'+owner).first()
    return {'daily_minutes':row.daily_minutes if row else 120,'auto_enabled':bool(local and local.auto_enabled),'auto_scope':'device_local'}
