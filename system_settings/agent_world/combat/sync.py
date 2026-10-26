"""Reject partial/forked combat aggregates instead of manufacturing rewards."""
from copy import deepcopy
from collections import defaultdict, Counter
from .store import digest
from .models import (CombatRuntime, Exploration, CombatProfile, CombatCatalog, CombatFact,
                     MIN_DAILY_EXPLORATION_MINUTES, MAX_DAILY_EXPLORATION_MINUTES)
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


def _validate_source(data,meta=None,*,allow_exploration_review_mismatch=False):
    from utils.sync_manager import SyncError
    if meta and meta.get('combat_schema_version',0)>16:
        raise SyncError('战斗快照版本过新，请升级所有设备')
    if meta is not None and meta.get('combat_schema_version', 0) < 15 and any(row['model'] in (LABEL+'adventureplanningday', LABEL+'adventurereservation') for row in data):
        raise SyncError('组队探索预约需要战斗同步15')
    from .reservation_sync import validate_snapshot as validate_reservations
    validate_reservations(data)
    from .history_snapshot import normalize_source, compact_source, aggregate_frame, verify_chain
    if meta is None or meta.get('combat_schema_version', 0) < 8:
        data = compact_source(normalize_source(data))
    from ..food_sync import validate_source as validate_food
    if meta is not None and meta.get('combat_schema_version', 0) < 7 and any(
            row['model'] == RUN and 'food_version' in row['fields'].get('snapshot', {}) for row in data):
        raise SyncError('美食冒险数据需要新版战斗同步协议')
    validate_food(data, meta, require_manifest=bool(meta and meta.get('combat_schema_version', 0) >= 7))
    from .elixir_sync import validate_source as validate_elixirs
    validate_elixirs(data, meta, require_manifest=bool(meta and meta.get('combat_schema_version', 0) >= 9))
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
            # Imported runtime packs declare their own progression gates. Release-time
            # content counts are checked by bundled(), not a historical version allowlist.
            try:
                gates = {int(job['required_level']) for job in row['tables']['professions'] if int(job['stage']) == 3}
                if len(gates) != 1 or not 30 < next(iter(gates)) <= 99:
                    raise ValueError('转职层级无效')
                validate_tables(row['tables'], expected_promotion_level=next(iter(gates)), catalog_version=row['id'])
            except (ValueError,KeyError,TypeError,IndexError) as exc:raise SyncError('战斗目录业务规则无效') from exc
        if model==RUN:
            from .bard_state import validate_unit
            try:
                for unit in (row['state'].get('player'),row['state'].get('enemy')):
                    if unit is not None:validate_unit(unit)
            except (ValueError,TypeError,KeyError) as exc:
                raise SyncError('个人冒险音律状态无效') from exc
        if model==LABEL+'combatconfig' and (type(row['daily_minutes']) is not int or not MIN_DAILY_EXPLORATION_MINUTES<=row['daily_minutes']<=MAX_DAILY_EXPLORATION_MINUTES):
            raise SyncError('每日探索额度无效')
        if model in (GEAR,RUN,FACT,ENCOUNTER) and row['actor_id'] and row['actor_id'] not in profiles:raise SyncError('战斗事实缺少居民档案')
        if model==ENCOUNTER:
            run=rows.get((RUN,row['exploration_id']))
            if not run or row['actor_id']!=run['actor_id'] or row['owner_id']!=run['owner_id']:raise SyncError('遭遇记录缺少所属探索')
    if set(chains)!=set(profiles) or set(facts)!=set(profiles):raise SyncError('战斗档案缺少完整事实链')
    if meta and meta.get('combat_schema_version', 0) >= 8:
        expected = metadata(data)
        if any(meta.get(key) != expected[key] for key in ('combat_checkpoints', 'combat_catalogs', 'combat_current_catalog')):
            raise SyncError('战斗固化检查点或运行目录清单不一致')
    from .equipment_snapshot import validate as validate_gear, slot_matches, permitted
    from .frozen_validation import validate_progression, validate_consumption
    archived_actors=set()
    for actor,profile in profiles.items():
        chain=chains[actor]
        ordered=sorted(facts[actor],key=lambda r:r['sequence'])
        try:
            verify_chain(ordered, chain, actor, profile['owner_id'])
        except ValueError as exc:
            raise SyncError('战斗事实链缺失或发生分叉') from exc
        try:
            checkpoints = [row for row in ordered if row['kind'] == 'checkpoint']
            checkpoint = checkpoints[-1]
            baseline = checkpoint['payload']
            if (baseline['version'] != 1 or baseline['source_sequence'] != checkpoint['sequence'] - 1 or
                    baseline['source_digest'] != checkpoint['previous_hash']):
                raise ValueError('固化检查点与事实链不一致')
            progression = deepcopy(baseline['progression'])
            validate_progression(progression)
            expected_gear = {identity: deepcopy(value['snapshot']) for identity, value in baseline['equipment'].items()}
            expected_rules = {identity: deepcopy(value['rules']) for identity, value in baseline['equipment'].items()}
            for identity in expected_gear:
                validate_gear(expected_gear[identity], expected_rules[identity])
            if any(not key.startswith('combat.') or type(value) is not int or value < 0 for key, value in baseline['stock'].items()):
                raise ValueError('固化库存无效')
        except (ValueError, KeyError, TypeError, IndexError) as exc:
            raise SyncError('战斗固化检查点缺失或无效') from exc
        if (CATALOG, profile['catalog_id']) not in rows:
            raise SyncError('居民当前运行目录缺失')
        base = int(chain.get('archive_sequence') or 0)
        if base:
            archived_actors.add(actor)
            stock_plan = chain.get('archive_stock') or {}
            if not isinstance(stock_plan, dict) or any(
                    not str(key).startswith('combat.') or type(value) is not int for key, value in stock_plan.items()):
                raise SyncError('战斗归档库存基线无效')
        previous = chain.get('archive_digest') or ''
        for offset,row in enumerate(ordered):
            sequence = base + offset + 1
            content={k:row[k] for k in ('id','actor_id','owner_id','sequence','kind','exploration_id','elapsed_seconds','payload','previous_hash')}
            if row['sequence']!=sequence or row['previous_hash']!=previous or digest(content)!=row['digest'] or row['owner_id']!=profile['owner_id']:raise SyncError('战斗事实链缺失或发生分叉')
            previous=row['digest'];payload=row['payload'];kind=row['kind']
            if row['exploration_id']:
                run=rows.get((RUN,row['exploration_id']))
                if not run or run['actor_id']!=actor or run['owner_id']!=profile['owner_id']:raise SyncError('战斗事实缺少所属探索')
            validate_consumption(rows, row, actor)
            if row['sequence'] <= checkpoint['sequence']:
                continue
            if kind in ('initialize', 'catalog', 'promote', 'reselect'):
                try:
                    if kind == 'reselect' and payload.get('from_job') != progression['job']:
                        raise ValueError('职业重选来源与固化成长不一致')
                    progression = deepcopy(payload['progression_after'])
                    validate_progression(progression)
                    if kind == 'catalog' and progression['skills'] != payload['skills']:
                        raise ValueError('当前技能与固化结果不一致')
                    if kind == 'promote' and (progression != payload['progression'] or progression['job'] != payload['arguments']):
                        raise ValueError('转职结果与固化成长不一致')
                    if kind == 'reselect' and (progression != payload['progression'] or progression['job'] != payload['arguments']):
                        raise ValueError('职业重选结果与固化成长不一致')
                    for identity, value in payload.get('equipment_after', {}).items():
                        validate_gear(value['snapshot'], value['rules'])
                        if identity in expected_gear and (expected_gear[identity] != value['snapshot'] or expected_rules[identity] != value['rules']):
                            raise ValueError('重复装备的固化属性不一致')
                        expected_gear[identity], expected_rules[identity] = value['snapshot'], value['rules']
                except (KeyError, TypeError, ValueError) as exc:
                    raise SyncError('战斗成长或装备固化结果缺失') from exc
            elif kind == 'forge':
                from ..blacksmith_sync import validate_equipment_fact
                validate_equipment_fact(rows, row)
                identity = payload['equipment_id']
                value = payload.get('equipment_after', {}).get(identity)
                if identity in expected_gear or not value:
                    raise SyncError('打造装备缺少唯一固化来源')
                operation = rows[('system_settings.blacksmithoperation', payload['operation_id'])]
                if operation['snapshot']['job'] != progression['job']:
                    raise SyncError('打造职业与当时成长事实不一致')
                validate_gear(value['snapshot'], value['rules'])
                expected_gear[identity], expected_rules[identity] = value['snapshot'], value['rules']
            elif kind == 'tournament_reward':
                from ..tournament_sync import validate_equipment_fact
                validate_equipment_fact(rows, row)
                identity = payload['equipment_id']
                value = payload.get('equipment_after', {}).get(identity)
                if identity in expected_gear or not value:
                    raise SyncError('大会装备奖励缺少唯一固化来源')
                validate_gear(value['snapshot'], value['rules'])
                expected_gear[identity], expected_rules[identity] = value['snapshot'], value['rules']
            elif kind=='round':
                for event in payload['events']:
                    if event['kind']!='kill':continue
                    progression = deepcopy(payload.get('progression_after'))
                    validate_progression(progression)
                    for reward in event['rewards']:
                        if reward['kind']=='equipment':
                            identity = reward['equipment_id']
                            value = payload.get('equipment_after', {}).get(identity)
                            if not value or value['snapshot'] != reward['item'] or identity in expected_gear:
                                raise SyncError('掉落装备缺少唯一固化来源')
                            validate_gear(value['snapshot'], value['rules'])
                            expected_gear[identity], expected_rules[identity] = value['snapshot'], value['rules']
            elif kind=='trade':
                trade=rows.get((MARKET_TRADE,payload['transaction_id']))
                if not trade or trade['actor_id']!=actor or trade['owner_id']!=profile['owner_id'] or trade['operation']!=payload['arguments'] or trade['result']!=payload['result']:raise SyncError('战斗交易缺少真实成交来源')
                op=trade['operation']
                if op['kind']=='list_combat_equipment':
                    listing=rows.get((LISTING,payload['result'].get('listing_id')))
                    equipment_id=op.get('equipment_id')
                    judged=any((fact.get('payload') or {}).get('equipment_id')==equipment_id
                               and (fact.get('payload') or {}).get('action')=='list'
                               and fact['sequence']<row['sequence'] for fact in ordered) or bool(base and equipment_id in expected_gear)
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
                    expected_rules.pop(equipment_id)
                else:
                    if (actor!=trade['actor_id'] or trade['result'].get('seller_id')!=payload.get('seller_id')
                            or listing['seller_id']!=payload.get('seller_id')
                            or equipment_id in expected_gear or not isinstance(payload.get('snapshot'),dict)
                            or payload.get('snapshot')!=(listing.get('item') or {}).get('equipment_snapshot')):
                        raise SyncError('冒险装备买方转移事实无效')
                    expected_gear[equipment_id]=deepcopy(payload['snapshot'])
                    expected_rules[equipment_id]=deepcopy(payload.get('equipment_rules'))
                    validate_gear(expected_gear[equipment_id], expected_rules[equipment_id])
        if chain['head']!=base+len(ordered) or chain['digest']!=previous or progression!=profile['progression']:raise SyncError('战斗成长或事实链终点不一致')
        equipment=[r for (m,_),r in rows.items() if m==GEAR and r['actor_id']==actor]
        if {r['id'] for r in equipment}!=set(expected_gear):raise SyncError('装备缺少掉落或绑定来源')
        for item in equipment:
            if item['owner_id']!=profile['owner_id'] or expected_gear[item['id']]!=item['snapshot'] or expected_rules[item['id']]!=item.get('rules'):raise SyncError('装备来源或属性不一致')
        loadout=profile['loadout']
        valid_slots={'weapon','offhand','head','body','hands','feet','accessory','ring_1','ring_2'}
        if not isinstance(loadout,dict) or any(slot not in valid_slots for slot in loadout):
            raise SyncError('战斗装备部位无效')
        for slot,identity in loadout.items():
            worn_item=rows.get((GEAR,identity))
            if not worn_item or worn_item['sold']:
                raise SyncError('穿戴装备部位或来源无效')
            if not slot_matches(worn_item['snapshot'], worn_item['rules'], slot):
                raise SyncError('穿戴装备部位无效')
            if not permitted(worn_item['snapshot'], worn_item['rules'], profile['progression']['job'], profile['progression']['level']):
                raise SyncError('战斗装备不符合固化穿戴条件')
        weapon_item = rows.get((GEAR, loadout.get('weapon')))
        if weapon_item and weapon_item['rules']['grip'] == 'two_handed' and 'offhand' in loadout:
            raise SyncError('双手武器不能同时装备副手')
        actual=Counter()
        for (m,_),item in rows.items():
            if m==LABEL+'agentinventoryitem' and item['actor_id']==actor and item['source'].get('sku','').startswith('combat.'):
                if item['owner_id']!=profile['owner_id']:raise SyncError('战斗库存归属不一致')
                actual[item['source']['sku']]+=item['quantity']
        from .stock_validation import expected_stock
        stock = expected_stock(rows, actor, profile['owner_id'], ordered, chain.get('archive_stock'))
        if {k:v for k,v in stock.items() if v}!={k:v for k,v in actual.items() if v}:raise SyncError('战斗库存与消费、掉落事实不一致')
        frame = aggregate_frame(rows, actor, frozen=True)
        if digest(frame)!=chain['frame']:raise SyncError('战斗快照包含独立合并的装备、成长或探索状态')
        worn=profile['loadout'].values()
        if len(set(worn))!=len(worn) or any(identity not in expected_gear or rows[(GEAR,identity)]['sold'] for identity in worn):raise SyncError('穿戴装备关联无效')
    for (model,pk),run in rows.items():
        if model!=RUN:continue
        if run['status'] in {'preparing','active','paused','settling'}:
            if (CATALOG,run['catalog_id']) not in rows:raise SyncError('未结束探索的运行目录缺失')
        elif run['snapshot'].get('history_frozen') != 1:
            raise SyncError('历史探索尚未固化')
        encounters=[r for (m,_),r in rows.items() if m==ENCOUNTER and r['exploration_id']==pk]
        if sorted(r['number'] for r in encounters)!=list(range(1,run['state'].get('encounter',0)+1)):raise SyncError('探索遭遇记录缺失或重复')
        if run['record_id'] and (LABEL+'agentrunrecord',run['record_id']) not in rows:raise SyncError('探索回顾记录缺失')
        from .explorations import TERMINAL
        if run['status'] in TERMINAL:
            record=rows.get((LABEL+'agentrunrecord',run['record_id']))
            retained=any(f['exploration_id']==pk for f in facts[run['actor_id']])
            if run['actor_id'] in archived_actors and not retained:
                # 已归档的旧探索只保留结算行与回顾记录，逐回合事实不再参与校验。
                if not record:raise SyncError('已归档探索缺少结算回顾记录')
                continue
            terminal=[r for r in facts[run['actor_id']] if r['kind']=='terminal' and r['exploration_id']==pk]
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
    from .party_sync import validate_source as validate_parties
    validate_parties(data, meta)
    return True


def validate_source(data, meta=None, *, allow_exploration_review_mismatch=False):
    from utils.sync_manager import SyncError
    try:
        return _validate_source(data, meta, allow_exploration_review_mismatch=allow_exploration_review_mismatch)
    except (ValueError, KeyError, TypeError, IndexError, AttributeError) as exc:
        raise SyncError('战斗固化快照字段缺失或无效') from exc


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
    from .party_sync import validate_conflicts
    validate_conflicts(local, remote)
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
    from .party_models import AdventureParty
    from .party_facts import append as shared_fact
    for party in AdventureParty.objects.filter(status='active'):
        party.status, party.next_tick_at = 'paused', None
        shared_fact(party, 'pause', {'reason':'服务停止或数据恢复，执行授权已关闭'})
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
    from ..food_sync import metadata as food_metadata
    if data is None:
        catalogs = list(CombatCatalog.objects.order_by('-created_at', '-pk').values_list('pk', flat=True))
        checkpoints = {row.actor_id: row.pk for row in CombatFact.objects.filter(kind='checkpoint').order_by('sequence')}
        from .history import runtime_catalog_ids
        exported = sorted(runtime_catalog_ids())
        current_catalog = catalogs[0] if catalogs else ''
    else:
        catalogs = sorted((row for row in data if row['model'] == CATALOG),
                          key=lambda row: (str(row['fields'].get('created_at', '')), str(row['pk'])), reverse=True)
        current_catalog = str(catalogs[0]['pk']) if catalogs else ''
        exported = sorted(str(row['pk']) for row in catalogs)
        checkpoints = {row['fields']['actor_id']: str(row['pk']) for row in sorted(data, key=lambda row: row['fields'].get('sequence', 0))
                       if row['model'] == FACT and row['fields']['kind'] == 'checkpoint'}
    from .elixir_sync import metadata as elixir_metadata
    # 12: forge receipts establish equipment provenance and consume maze materials.
    return {'combat_schema_version':16,'combat_actors':actors, **food_metadata(data), **elixir_metadata(data),
            'combat_checkpoints':checkpoints,'combat_catalogs':exported,'combat_current_catalog':current_catalog}
