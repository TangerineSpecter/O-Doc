"""Reject partial/forked combat aggregates instead of manufacturing rewards."""
import json
import random
from copy import deepcopy
from collections import defaultdict, Counter
from django.core import serializers
from .store import digest
from .models import CombatRuntime, Exploration, CombatProfile
from .facts import append
from ..life_time import local_time

LABEL='system_settings.'
PROFILE=LABEL+'combatprofile'
GEAR=LABEL+'equipmentinstance'
RUN=LABEL+'exploration'
FACT=LABEL+'combatfact'
CHAIN=LABEL+'combatintegrity'
CATALOG=LABEL+'combatcatalog'
ENCOUNTER=LABEL+'combatencounter'
LISTING=LABEL+'marketlisting'
MARKET_TRADE=LABEL+'markettransaction'


def validate_source(data,meta=None,*,allow_exploration_review_mismatch=False):
    from utils.sync_manager import SyncError
    if meta and meta.get('combat_schema_version',0)>6:
        raise SyncError('战斗快照版本过新，请升级所有设备')
    rows={(r['model'],str(r['pk'])):{'id':str(r['pk']),**r['fields']} for r in data}
    profiles={pk:r for (model,pk),r in rows.items() if model==PROFILE}
    if meta and meta.get('combat_actors') is not None and set(meta['combat_actors'])!=set(profiles):raise SyncError('战斗快照缺少居民业务数据')
    chains={pk:r for (model,pk),r in rows.items() if model==CHAIN}
    facts=defaultdict(list)
    for (model,pk),r in rows.items():
        if model==FACT and r['actor_id']:facts[r['actor_id']].append(r)
    for (model,pk),row in rows.items():
        if model==CATALOG:
            if digest(row['tables'])!=row['digest']:raise SyncError('战斗目录内容与不可变指纹不一致')
            from .catalog_validation import validate_tables
            # Keep legacy immutable catalogs readable while requiring the expanded
            # player skill set for the newly released equipment/mastery catalog.
            expected_skills = 74 if row['id'] in {'combat-1.0.13','combat-1.0.14','combat-1.0.15','combat-1.0.16','combat-1.0.17','combat-1.0.18'} else 73 if row['id'] in {'combat-1.0.11','combat-1.0.12'} else 71 if row['id'] in {'combat-1.0.4', 'combat-1.0.5', 'combat-1.0.6', 'combat-1.0.7', 'combat-1.0.8', 'combat-1.0.9', 'combat-1.0.10'} else None
            expected_promotion_level = 50 if row['id'] in {'combat-1.0.10','combat-1.0.11','combat-1.0.12','combat-1.0.13','combat-1.0.14','combat-1.0.15','combat-1.0.16','combat-1.0.17','combat-1.0.18'} else 70
            try:validate_tables(row['tables'], expected_player_skills=expected_skills,
                                expected_promotion_level=expected_promotion_level,
                                catalog_version=row['id'])
            except (ValueError,KeyError,TypeError,IndexError) as exc:raise SyncError('战斗目录业务规则无效') from exc
        if model==LABEL+'combatconfig' and (type(row['daily_minutes']) is not int or not 30<=row['daily_minutes']<=120):
            raise SyncError('每日探索额度无效')
        if model in (GEAR,RUN,FACT,ENCOUNTER) and row['actor_id'] and row['actor_id'] not in profiles:raise SyncError('战斗事实缺少居民档案')
        if model==ENCOUNTER:
            run=rows.get((RUN,row['exploration_id']))
            if not run or row['actor_id']!=run['actor_id'] or row['owner_id']!=run['owner_id']:raise SyncError('遭遇记录缺少所属探索')
    if set(chains)!=set(profiles) or set(facts)!=set(profiles):raise SyncError('战斗档案缺少完整事实链')
    for actor,profile in profiles.items():
        chain=chains[actor]
        ordered=sorted(facts[actor],key=lambda r:r['sequence'])
        previous='';stock=Counter();expected_gear={};progression=None
        from .catalog import Catalog
        from . import attributes, equipment as equipment_rules
        catalog_row=rows.get((CATALOG,profile['catalog_id']))
        if not catalog_row:raise SyncError('居民成长缺少战斗目录')
        catalog=Catalog(catalog_row['tables'],catalog_row['id'])
        for sequence,row in enumerate(ordered,1):
            content={k:row[k] for k in ('id','actor_id','owner_id','sequence','kind','exploration_id','elapsed_seconds','payload','previous_hash')}
            if row['sequence']!=sequence or row['previous_hash']!=previous or digest(content)!=row['digest'] or row['owner_id']!=profile['owner_id']:raise SyncError('战斗事实链缺失或发生分叉')
            previous=row['digest'];payload=row['payload'];kind=row['kind']
            if row['exploration_id']:
                run=rows.get((RUN,row['exploration_id']))
                if not run or run['actor_id']!=actor or run['owner_id']!=profile['owner_id']:raise SyncError('战斗事实缺少所属探索')
            version=rows[(RUN,row['exploration_id'])]['catalog_id'] if row['exploration_id'] else payload.get('catalog_id',profile['catalog_id'])
            source=rows.get((CATALOG,version))
            if not source:raise SyncError('战斗成长缺少历史目录版本')
            event_catalog=Catalog(source['tables'],version)
            if kind=='initialize':
                if progression is not None:raise SyncError('居民初始化重复')
                if payload['progression']!=attributes.initial():raise SyncError('居民初始成长无效')
                progression=deepcopy(payload['progression'])
                starter_template='equip.training_sword' if 'equip.training_sword' in event_catalog.index['equipment_templates'] else 'equip.sword'
                expected_gear[payload['equipment_id']]=equipment_rules.generate(event_catalog,starter_template,1,'white',random.Random(actor),starter=True)
            elif kind=='catalog':
                skills=event_catalog.learned(progression['job'],progression['level'],progression.get('skills'))
                if skills!=payload['skills']:raise SyncError('目录更新的自动学习不一致')
                progression={**progression,'skills':skills}
            elif kind=='promote':
                progression=attributes.promote(event_catalog,progression,payload['arguments'])
                if progression!=payload['progression']:raise SyncError('转职成长不一致')
                for identity in payload['loadout'].values():
                    if identity.startswith('promotion:') and identity not in expected_gear:
                        level=int(event_catalog.row('professions',payload['arguments'])['required_level'])
                        template=equipment_rules.promotion_weapon(event_catalog,payload['arguments'],level)
                        expected_gear[identity]=equipment_rules.generate(event_catalog,template,level,'white',random.Random(row['id']),starter=True)
            elif kind=='depart':
                stock.subtract({'combat.'+sid:n for sid,n in payload['plan'].get('potions',{}).items()})
            elif kind=='terminal':stock.update({'combat.'+sid:n for sid,n in payload['returned'].items()})
            elif kind=='round':
                for event in payload['events']:
                    if event['kind']!='kill':continue
                    progression,_=attributes.award(event_catalog,progression,event['experience'],
                        stop_at_promotion=bool(payload.get('promotion_gate',False)))
                    for reward in event['rewards']:
                        if reward['kind']=='equipment':expected_gear[reward['equipment_id']]=reward['item']
                        else:stock['combat.'+reward['item']['id']]+=reward['quantity']
            elif kind=='trade':
                trade=rows.get((MARKET_TRADE,payload['transaction_id']))
                if not trade or trade['actor_id']!=actor or trade['owner_id']!=profile['owner_id'] or trade['operation']!=payload['arguments'] or trade['result']!=payload['result']:raise SyncError('战斗交易缺少真实成交来源')
                op=trade['operation']
                if op['kind']=='buy_potion':stock['combat.'+op['potion_id']]+=op['quantity']
                elif op['kind']=='sell_combat_material':stock['combat.'+op['material_id']]-=op['quantity']
                elif op['kind']=='list_combat_equipment':
                    listing=rows.get((LISTING,payload['result'].get('listing_id')))
                    equipment_id=op.get('equipment_id')
                    judged=any((fact.get('payload') or {}).get('equipment_id')==equipment_id
                               and (fact.get('payload') or {}).get('action')=='list'
                               and fact['sequence']<row['sequence'] for fact in ordered)
                    if (not listing or not judged or equipment_id not in expected_gear
                            or listing['seller_id']!=actor
                            or (listing.get('item') or {}).get('source',{}).get('equipment_id')!=equipment_id):
                        raise SyncError('冒险装备挂牌缺少出发决定或挂牌来源')
            elif kind=='gear_prepare':
                equipment_id=payload.get('equipment_id')
                if (not isinstance(equipment_id,str) or equipment_id not in expected_gear
                        or payload.get('action') not in ('replace','sell','list')
                        or not isinstance(payload.get('decision_source'),str)):
                    raise SyncError('探索装备决定缺少装备来源')
            elif kind in ('gear_trade_out','gear_trade_in'):
                equipment_id=payload.get('equipment_id')
                trade=rows.get((MARKET_TRADE,payload.get('transaction_id')))
                listing=rows.get((LISTING,payload.get('listing_id')))
                if (not trade or trade['owner_id']!=profile['owner_id']
                        or trade['operation'].get('kind')!='buy_listing'
                        or trade['operation'].get('listing_id')!=payload.get('listing_id')
                        or trade['result'].get('equipment_id')!=equipment_id
                        or not listing or listing['owner_id']!=profile['owner_id']
                        or (listing.get('item') or {}).get('source',{}).get('kind')!='combat_equipment'
                        or (listing.get('item') or {}).get('source',{}).get('equipment_id')!=equipment_id):
                    raise SyncError('居民集市装备转移缺少挂牌或成交依据')
                if kind=='gear_trade_out':
                    if (actor!=listing['seller_id'] or trade['result'].get('seller_id')!=actor
                            or trade['actor_id']!=payload.get('buyer_id')
                            or equipment_id not in expected_gear
                            or expected_gear[equipment_id]!=payload.get('snapshot')):
                        raise SyncError('冒险装备卖方转移事实无效')
                    expected_gear.pop(equipment_id)
                else:
                    if (actor!=trade['actor_id'] or trade['result'].get('seller_id')!=payload.get('seller_id')
                            or listing['seller_id']!=payload.get('seller_id')
                            or equipment_id in expected_gear or not isinstance(payload.get('snapshot'),dict)
                            or payload.get('snapshot')!=(listing.get('item') or {}).get('equipment_snapshot')):
                        raise SyncError('冒险装备买方转移事实无效')
                    expected_gear[equipment_id]=deepcopy(payload['snapshot'])
            for consumption in payload.get('consumption',[]):
                action=rows.get((LABEL+'worldaction',consumption['action_id']))
                if not action or action['actor_id']!=actor or action['status']!='success' or float(action['energy_cost'])!=consumption['amount'] or action['result'].get('exploration_id')!=row['exploration_id']:raise SyncError('战斗体力消费来源缺失')
        if chain['head']!=len(ordered) or chain['digest']!=previous or progression!=profile['progression']:raise SyncError('战斗成长或事实链终点不一致')
        equipment=[r for (m,_),r in rows.items() if m==GEAR and r['actor_id']==actor]
        if {r['id'] for r in equipment}!=set(expected_gear):raise SyncError('装备缺少掉落或绑定来源')
        for item in equipment:
            if item['owner_id']!=profile['owner_id'] or (CATALOG,item['catalog_id']) not in rows or (expected_gear[item['id']] is not None and expected_gear[item['id']]!=item['snapshot']):raise SyncError('装备来源或属性不一致')
        loadout=profile['loadout']
        valid_slots={'weapon','offhand','head','body','hands','feet','accessory','ring_1','ring_2'}
        if not isinstance(loadout,dict) or any(slot not in valid_slots for slot in loadout):
            raise SyncError('战斗装备部位无效')
        for slot,identity in loadout.items():
            worn_item=rows.get((GEAR,identity))
            if not worn_item or worn_item['sold']:
                raise SyncError('穿戴装备部位或来源无效')
            try:
                template_id=worn_item['template_id']
                if template_id in catalog.index['equipment_templates']:
                    slot_catalog=catalog
                else:
                    slot_catalog=Catalog(rows[(CATALOG,worn_item['catalog_id'])]['tables'],worn_item['catalog_id'])
                if not equipment_rules.loadout_slot_matches(slot_catalog,template_id,worn_item['snapshot'],slot):
                    raise SyncError('穿戴装备部位或来源无效')
                job,level=profile['progression']['job'],profile['progression']['level']
                item_level=worn_item['snapshot']['level']
                permitted=(template_id in catalog.index['equipment_templates'] and
                           equipment_rules.allowed(catalog,template_id,job,level,item_level))
                # Adopting a catalog retains existing loadouts. Validate their original
                # permissions too; a release must not invalidate its own upgraded snapshots.
                if not permitted and worn_item['catalog_id']!=catalog.version:
                    origin=rows[(CATALOG,worn_item['catalog_id'])]
                    origin_catalog=Catalog(origin['tables'],origin['id'])
                    permitted=equipment_rules.allowed(origin_catalog,template_id,job,level,item_level)
                if not permitted:
                    raise SyncError('战斗装备不符合当前职业或等级限制')
            except (ValueError,KeyError,TypeError) as exc:
                raise SyncError('战斗装备不符合当前目录限制') from exc
        weapon_id=loadout.get('weapon')
        weapon_item=rows.get((GEAR,weapon_id)) if weapon_id else None
        if weapon_item:
            grip=weapon_item['snapshot'].get('grip')
            if not grip:
                gear_catalog_row=rows.get((CATALOG,weapon_item['catalog_id']))
                if gear_catalog_row:
                    gear_catalog=Catalog(gear_catalog_row['tables'],gear_catalog_row['id'])
                    grip=gear_catalog.row('equipment_templates',weapon_item['template_id']).get('grip','')
            if grip=='two_handed' and 'offhand' in loadout:
                raise SyncError('双手武器不能同时装备副手')
        actual=Counter()
        for (m,_),item in rows.items():
            if m==LABEL+'agentinventoryitem' and item['actor_id']==actor and item['source'].get('sku','').startswith('combat.'):
                if item['owner_id']!=profile['owner_id']:raise SyncError('战斗库存归属不一致')
                actual[item['source']['sku']]+=item['quantity']
        if {k:v for k,v in stock.items() if v}!={k:v for k,v in actual.items() if v}:raise SyncError('战斗库存与消费、掉落事实不一致')
        def select(row,keys):return {key:row[key] for key in keys.split()}
        frame={'profile':select(profile,'id owner_id catalog_id progression loadout hp mp loot_progress'),
            'equipment':[select(r,'id catalog_id template_id snapshot value bound locked sold') for r in sorted(equipment,key=lambda r:r['id'])],
            'runs':[select(r,'id catalog_id status phase elapsed_seconds revision snapshot state result') for (m,_),r in sorted(rows.items()) if m==RUN and r['actor_id']==actor],
            'encounters':[select(r,'id exploration_id number monster result') for (m,_),r in sorted(rows.items()) if m==ENCOUNTER and r['actor_id']==actor]}
        if digest(frame)!=chain['frame']:raise SyncError('战斗快照包含独立合并的装备、成长或探索状态')
        worn=profile['loadout'].values()
        if len(set(worn))!=len(worn) or any(identity not in expected_gear or rows[(GEAR,identity)]['sold'] for identity in worn):raise SyncError('穿戴装备关联无效')
    for (model,pk),run in rows.items():
        if model!=RUN:continue
        if (CATALOG,run['catalog_id']) not in rows:raise SyncError('探索目录缺失')
        encounters=[r for (m,_),r in rows.items() if m==ENCOUNTER and r['exploration_id']==pk]
        if sorted(r['number'] for r in encounters)!=list(range(1,run['state'].get('encounter',0)+1)):raise SyncError('探索遭遇记录缺失或重复')
        if run['record_id'] and (LABEL+'agentrunrecord',run['record_id']) not in rows:raise SyncError('探索回顾记录缺失')
        from .explorations import TERMINAL
        if run['status'] in TERMINAL:
            terminal=[r for r in facts[run['actor_id']] if r['kind']=='terminal' and r['exploration_id']==pk]
            record=rows.get((LABEL+'agentrunrecord',run['record_id']))
            if len(terminal)!=1 or not record:raise SyncError('探索终态缺少唯一结算和回顾来源')
            payload=terminal[0]['payload']
            if payload['status']!=run['status'] or payload['record_id']!=run['record_id'] or payload['report']!=run['result'].get('report') or payload['returned']!=run['result'].get('returned_potions'):
                raise SyncError('探索终态与结算事实不一致')
            expected_status='success' if run['status'] in ('completed','recalled','fallen','exhausted') else 'failed'
            recap_mismatch = (
                record.get('agent_id',record.get('agent')) not in (None,run['actor_id'])
                or record['status'] != expected_status
                or record['output'] != payload['report']
                or record['steps'] != [{'kind':'exploration','exploration_id':pk,'result':run['result']}]
            )
            if recap_mismatch and not allow_exploration_review_mismatch:
                raise SyncError('探索回顾记录与固定结算摘要不一致')
    return True


def normalize_exploration_reviews(data: list[dict]) -> list[dict]:
    """Rebuild exported recaps from validated settlement facts, without changing local records."""
    validate_source(data, allow_exploration_review_mismatch=True)
    from .explorations import TERMINAL

    actors = {str(row['pk']) for row in data if row['model'] == LABEL + 'agent'}
    reviews = {}
    for row in data:
        run = row['fields']
        if row['model'] != RUN or run['status'] not in TERMINAL:
            continue
        report = run['result']['report']
        reviews[str(run['record_id'])] = {
            'agent': run['actor_id'] if run['actor_id'] in actors else None,
            'status': 'success' if run['status'] in ('completed', 'recalled', 'fallen', 'exhausted') else 'failed',
            'summary': report[:255],
            'output': report,
            'steps': [{'kind': 'exploration', 'exploration_id': str(row['pk']), 'result': deepcopy(run['result'])}],
        }

    result = []
    for row in data:
        recap = reviews.get(str(row['pk'])) if row['model'] == LABEL + 'agentrunrecord' else None
        if recap is not None:
            fields = {**row['fields'], **recap}
            if 'agent_id' in fields:
                fields['agent_id'] = recap['agent']
            row = {**row, 'fields': fields}
        result.append(row)
    validate_source(result)
    return result


def validate_catalog_conflicts(local,remote):
    from utils.sync_manager import SyncError
    a={str(r['pk']):r['fields'] for r in local if r['model']==CATALOG}
    for r in remote:
        if r['model']==CATALOG and str(r['pk']) in a and any(a[str(r['pk'])][key]!=r['fields'][key] for key in ('digest','tables')):raise SyncError('同一战斗目录版本在设备间发生冲突')


def revoke(*, disable_auto=True):
    """Revoke permits, retaining local origins for recovery; restores also disable opt-in."""
    from system_settings.models import AgentExecutionLease
    AgentExecutionLease.objects.filter(token__startswith='combat:').update(token='',until=None)
    fields={'authorized':False,'promotion_pending':False,'token':'','until':None}
    if disable_auto:fields['auto_enabled']=False
    CombatRuntime.objects.all().update(**fields)
    from django.db.models import Q
    for runtime in CombatRuntime.objects.filter(Q(requests__has_key='promotion_allowed')|Q(pk='combat-worker')|Q(pk__startswith='auto:')):
        runtime.requests={k:v for k,v in runtime.requests.items() if k=='origin'}
        runtime.save(update_fields=['requests'])
    from .permissions import local_runtime
    from . import attributes
    from .store import current
    for run in Exploration.objects.filter(status='paused'):
        if not local_runtime(run):continue
        profile=CombatProfile.objects.filter(pk=run.actor_id).first()
        if run.phase in ('promotion','promotion_failed') or (profile and attributes.promotion_options(current(profile.catalog_id),profile.progression)):
            CombatRuntime.objects.filter(pk=run.pk).update(promotion_pending=True)
    for run in Exploration.objects.filter(status__in=['preparing','active']):
        if run.status=='preparing':
            from .explorations import finish
            finish(run.pk,'interrupted','服务停止或数据恢复，准备已中断；已成交采购保留')
        else:
            run.status,run.phase,run.reason='paused','interrupted','服务停止或数据恢复，执行授权已关闭'
            run.next_tick_at=None;run.revision+=1;run.save()
            append(CombatProfile.objects.get(pk=run.actor_id),f'{run.pk}:pause:{run.revision}','pause',{'reason':run.reason},run)


def metadata(data=None):
    actors=sorted(CombatProfile.objects.values_list('pk',flat=True)) if data is None else sorted(str(r['pk']) for r in data if r['model']==PROFILE)
    return {'combat_schema_version':6,'combat_actors':actors}
