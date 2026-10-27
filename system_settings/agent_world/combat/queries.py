"""Consistent read projections; hot reports remain permanently paginated."""
from datetime import datetime
from .models import CombatProfile, EquipmentInstance, Exploration, CombatFact, CombatEncounter, CombatConfig, CombatRuntime
from .store import current
from .catalog import bundled
from . import attributes, engine, equipment, equipment_effective
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
        'current_action':'等待 Agent 完成转职' if run.status=='paused' and run.phase in ('promotion','promotion_failed') else '等待下一波加入队伍' if run.phase=='waiting_party' else labels[run.status]} for run in runs}


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
    from .equipment_market import equipment_listing_ids
    listed = equipment_listing_ids(owner)
    equipment_rows = EquipmentInstance.objects.filter(actor_id=agent.pk,owner_id=owner,sold=False,
        bound=False,locked=False,retained_for_adventure=False).exclude(pk__in=profile.loadout.values() if profile else [])
    if listed:
        equipment_rows = equipment_rows.exclude(pk__in=listed)
    equipment=list(equipment_rows.order_by('-created_at','pk').values('id','snapshot','value','catalog_id'))
    equipment_effective.annotate_rows(equipment, catalog)
    for row in equipment:
        row.pop('catalog_id', None)
    return {'potions':[row for row in catalog.tables['potions'] if int(row['required_level'])<=level and row['enabled']=='1'],
        'materials':[row for row in catalog.tables['materials'] if stock_quantity(agent.pk,owner,'combat.'+row['id'])],
        'equipment':equipment}


def profile_view(owner,agent):
    profile=CombatProfile.objects.filter(pk=agent.pk,owner_id=owner).first()
    catalog=current(profile.catalog_id) if profile else bundled()[0]
    progression=profile.progression if profile else attributes.initial()
    derived=stats(profile,catalog) if profile else attributes.attributes(catalog,progression,[])
    equipment_items=list(EquipmentInstance.objects.filter(actor_id=agent.pk,owner_id=owner,sold=False).order_by('-created_at').values())
    equipment_effective.annotate_rows(equipment_items, catalog)
    from ..market_models import MarketListing
    active_listings = MarketListing.objects.filter(owner_id=owner, status='active').values('id', 'item')
    listed_ids = {}
    for listing in active_listings:
        source = ((listing.get('item') or {}).get('source') or {})
        if source.get('kind') == 'combat_equipment' and source.get('equipment_id'):
            listed_ids[str(source['equipment_id'])] = listing['id']
    for item in equipment_items:
        item['market_listed'] = item['id'] in listed_ids
        item['market_listing_id'] = listed_ids.get(item['id'])
    discovered_equipment=set(EquipmentInstance.objects.filter(owner_id=owner,actor_id=agent.pk).values_list('template_id',flat=True))
    for item in equipment_items:
        snapshot=item.get('snapshot') or {}
        template=catalog.index['equipment_templates'].get(item['template_id'])
        if (not snapshot.get('equipment_type') and template and not template.get('root_job') and
                not template.get('required_mastery')):
            item['display_type']='generic'
        elif equipment.eligibility_template_id(catalog, item['template_id'], snapshot,
                                               bound=item.get('bound', False)) == 'equip.training_sword':
            # Existing starter snapshots keep their original template ID and catalog version.
            item['display_type']='generic'
            discovered_equipment.add('equip.training_sword')
    skills=[{'id':sid,'rank':rank,**catalog.row('skills',sid),'parameters':{**catalog.skill(sid,rank)[0],'current_cost':str(engine.cost(catalog,{'level':progression['level'],'passives':attributes.passives(catalog,progression['skills'])},sid,rank))},'effects':catalog.skill(sid,rank)[1]} for sid,rank in progression['skills'].items()]
    run=Exploration.objects.filter(actor_id=agent.pk,owner_id=owner,status__in=['preparing','active','paused','settling']).first()
    if run and run.snapshot.get('food'):
        from .food import combat_stats
        derived = combat_stats(profile, catalog, run.snapshot)
    options=attributes.promotion_options(catalog,progression)
    reselect_blocked=attributes.reselect_blocked(catalog,progression) or ('探索进行中，装备和职业已固定' if run else '')
    promotion_run=run or (Exploration.objects.filter(actor_id=agent.pk,owner_id=owner,ended_at__isnull=False).order_by('-ended_at').first() if options else None)
    promotion_runtime=CombatRuntime.objects.filter(pk=promotion_run.pk).first() if promotion_run else None
    promotion_busy=bool(promotion_runtime and (promotion_runtime.promotion_pending or promotion_runtime.requests.get('promotion_allowed')))
    resources = {'hp': profile.hp if profile else derived['hp_max'],
                 'mp': profile.mp if profile else derived['mp_max'], 'recovery': None}
    if profile and not run:
        from .idle_recovery import project
        resources = project(profile.hp, profile.mp, int(derived['hp_max']), int(derived['mp_max']),
                            profile.recovered_at, profile.rest_until)
    encountered,defeated=set(),set()
    for encounter in CombatEncounter.objects.filter(owner_id=owner,actor_id=agent.pk).values('monster','result'):
        monster=encounter['monster']
        ids={u['id'] for u in monster.get('monsters',[]) if u.get('id')} or {monster.get('id')}
        encountered.update(ids-{None})
        if encounter['result'].get('killed'):defeated.update(ids-{None})
    # Shared waves may be left after a partial clear; actual personal kill receipts remain authoritative.
    for payload in CombatFact.objects.filter(owner_id=owner,actor_id=agent.pk,kind='round').values_list('payload',flat=True):
        defeated.update(e['monster']['id'] for e in payload.get('events',[]) if e.get('kind')=='kill' and e.get('monster',{}).get('id'))
    return {'initialized':bool(profile),'actor_id':agent.pk,'progression':progression,'attributes':derived, **resources,
        'loadout':profile.loadout if profile else {},'equipment':equipment_items,'skills':skills,
        'potions':[{**row,'owned':stock_quantity(agent.pk,owner,'combat.'+row['id'])} for row in catalog.tables['potions']],
        'materials':[{**row,'owned':stock_quantity(agent.pk,owner,'combat.'+row['id'])} for row in catalog.tables['materials']],
        'active_exploration_id':run.pk if run else None,'promotion_options':options,'promotion_busy':promotion_busy,
        'reselect_options':attributes.reselect_options(catalog),'reselect_blocked':reselect_blocked,
        'rest_until':local_time(profile.rest_until).isoformat() if profile and profile.rest_until else None,
        'loot_progress':profile.loot_progress if profile else {},'discoveries':{'encountered':sorted(encountered),'defeated':sorted(defeated),'equipment':sorted(discovered_equipment)}}


def snapshot(run,cursor=0,limit=100):
    from .party_queries import snapshot as party_snapshot
    # The shared gate spans the complete read, preventing a round from crossing this snapshot.
    facts=CombatFact.objects.filter(exploration_id=run.pk).order_by('sequence')
    latest=facts.last()
    confirmed=latest.sequence if latest else 0
    events=list(facts.filter(sequence__gt=cursor,sequence__lte=confirmed).values('id','sequence','kind','elapsed_seconds','payload','created_at')[:limit])
    from .recovery import deadline
    end=deadline(run)
    remaining=max(0,int((end-local_time()).total_seconds())) if end and not run.ended_at else 0
    # Read-only artwork IDs come from the frozen departure/encounter state.
    # No visual clock or demo damage enters persisted combat data or WebDAV.
    equipment=run.snapshot.get('equipment',[])
    runtime=CombatRuntime.objects.filter(pk=run.pk).first()
    promotion_busy=bool(runtime and (runtime.promotion_pending or runtime.requests.get('promotion_allowed')))
    visual={'dungeon_id':run.snapshot.get('plan',{}).get('dungeon_id',''),
        'job_id':run.snapshot.get('progression',{}).get('job','job.novice'),
        'weapon_id':next((item.get('template_id','') for item in equipment if item.get('slot')=='weapon'),'none'),
        'monster_id':run.state.get('monster_id','') if run.state.get('enemy') else '',
        'encounter_id':f'{run.pk}:{run.state.get("encounter",0)}'}
    from assets.models import Asset
    from system_settings.models import Agent
    agent = Agent.objects.filter(pk=run.actor_id).only('battle_appearance').first()
    appearance = agent.battle_appearance if agent else None
    character_asset_id = appearance.get('character_asset_id') if isinstance(appearance, dict) and appearance.get('version') == 3 else None
    head_asset_id = appearance.get('head_asset_id') if isinstance(appearance, dict) and not character_asset_id else None
    character_valid = character_asset_id and Asset.objects.filter(pk=character_asset_id, uploader=run.owner_id, is_valid=True, file_type='image').exists()
    if character_valid:
        from utils.resource_assets import get_resource_view_url
        visual['character_image_url'] = get_resource_view_url(character_asset_id)
        visual['appearance_overlays'] = appearance.get('overlays', {})
    elif head_asset_id and Asset.objects.filter(pk=head_asset_id, uploader=run.owner_id, is_valid=True, file_type='image').exists():
        from utils.resource_assets import get_resource_view_url
        visual['head_image_url'] = get_resource_view_url(head_asset_id)
        visual['head_behind_body'] = appearance.get('transform', {}).get('hair_layer') == 'behind'
    return {'id':run.pk,'actor_id':run.actor_id,'version':run.revision,'can_control':bool(local_runtime(run)),'catalog_version':run.catalog_id,'stage':run.phase,'status':run.status,'reason':run.reason,
        'remaining_seconds':remaining if end else None,
        'elapsed_seconds':run.elapsed_seconds,'duration_seconds':run.duration_seconds,'next_tick_at':local_time(run.next_tick_at).isoformat() if run.next_tick_at else None,
        'promotion_busy':promotion_busy,
        'party':party_snapshot(run),
        'player':run.state.get('player'),'enemy':run.state.get('enemy'),'visual':visual,'potions':run.state.get('potions',{}),
        'elixirs':[{key:entry.get(key) for key in ('recipe_id','name','stars','count','remaining','summary','trigger')} for entry in run.state.get('elixirs',[])],'result':run.result,
        'events':events,'latest_cursor':confirmed,'next_cursor':events[-1]['sequence'] if events else min(cursor,confirmed),'has_more':bool(events and events[-1]['sequence']<confirmed)}


def history(owner,actor,page=1):
    rows=Exploration.objects.filter(owner_id=owner,actor_id=actor).order_by('-created_at','-id')
    return {'list':list(rows.values('id','status','phase','elapsed_seconds','duration_seconds','result','created_at','ended_at')[(page-1)*20:page*20]),'total':rows.count(),'page':page}


def config(owner):
    row=CombatConfig.objects.filter(pk=owner).first()
    from .history import summary
    return {'daily_minutes':row.daily_minutes if row else 120, 'history_storage':summary(owner)}
