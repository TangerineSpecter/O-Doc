"""恢复时验证种植意图来源、市场修改版本及真实操作计数。"""
from .farm_models import FarmOperation
from .farm_queue_plan import entries_for, identity, original_source
from .farm_catalog import catalog_for
from .life_models import LifeItem
from .market_models import MarketSession, MarketTransaction


def validate_queue(farm, facts: dict | None = None) -> None:
    def get(model, pk, **filters):
        if facts is None:
            return model.objects.get(pk=pk, **filters)
        label = model._meta.label_lower
        value = facts.get(label, {}).get(str(pk))
        if not value or any(getattr(value, key) != expected for key, expected in filters.items()):
            raise ValueError('来源快照缺少计划、会话或成交依据')
        return value

    cached = {}

    def rows(model):
        label = model._meta.label_lower
        if label not in cached:
            if facts is not None:
                cached[label] = list(facts.get(label, {}).values())
            elif model is FarmOperation:
                cached[label] = list(model.objects.filter(farm_id=farm.pk, pk__in=farm.state.get('operation_keys', [])))
            else:
                cached[label] = list(model.objects.filter(actor_id=farm.pk))
        return cached[label]

    from utils.sync_manager import SyncError
    try:
        if not farm.state.get('planting_plans'):
            return
        from .farm_models import FarmCatalog
        rules = catalog_for(farm.owner_id).rules if facts is None else get(FarmCatalog, farm.owner_id).rules
        for pid, plan in farm.state.get('planting_plans', {}).items():
            item = get(LifeItem, plan['item_id'], owner_id=farm.owner_id, actor_id=farm.pk)
            source = original_source(item.context, pid)
            if plan['version'] != 2 or pid != identity('farm-day', farm.owner_id, farm.pk, plan['day']) or plan['id'] != pid:
                raise ValueError('每日计划身份或版本无效')
            if plan['status'] not in ('pending', 'active', 'completed', 'expired', 'cancelled'):
                raise ValueError('队列状态无效')
            if plan['activated_at']:
                from system_settings.models import WorldAction
                if not any(a.actor_id == farm.pk and a.snapshot.get('planting_plan_id') == pid and a.snapshot.get('activated_at') == plan['activated_at'] for a in rows(WorldAction)):
                    raise ValueError('队列缺少真实开工依据')
                if not source['cutoff'] > plan['activated_at']:
                    raise ValueError('队列开工时间已截止')
            versions = plan['versions']
            if not versions or versions[0] != source or plan['revision'] != len(versions):
                raise ValueError('每日计划缺少原始日程依据')
            for revision, version in enumerate(versions, 1):
                if version['revision'] != revision or any(version[k] != source[k] for k in ('id', 'version', 'day', 'item_id', 'task_id', 'cutoff', 'procurement_limit')):
                    raise ValueError('每日计划不可变依据被改写')
                if entries_for(version['entries'], rules, pid) != version['entries']:
                    raise ValueError('种植意图无效')
                if revision > 1:
                    origin = version['market_source']
                    session = get(MarketSession, origin['session_id'], owner_id=farm.owner_id, actor_id=farm.pk)
                    if not any(c['key'] == origin['request_key'] and c['name'] == 'update_farm_queue' and c.get('result', {}).get('queue_version') == version for c in session.calls):
                        raise ValueError('队列修改缺少市场决策依据')
            from .farm_queue_plan import snapshot
            if any(snapshot(plan)[k] != versions[-1][k] for k in snapshot(plan)):
                raise ValueError('队列与最新意图版本不一致')
            if set(plan['progress']) != {e['id'] for e in plan['entries']}:
                raise ValueError('队列进度项目不一致')
            operations = [op for op in rows(FarmOperation) if op.farm_id == farm.pk and op.result.get('planting_plan_id') == pid and op.pk in farm.state.get('operation_keys', [])]
            for entry in plan['entries']:
                count = sum(len(op.operation['targets']) for op in operations if op.operation['kind'] == 'plant' and op.result['planting_entry_id'] == entry['id'])
                if type(plan['progress'][entry['id']]) is not int or plan['progress'][entry['id']] != count or count > entry['quantity']:
                    raise ValueError('已播种进度缺少实际操作依据')
            for op in operations:
                if op.result.get('planting_entry_id') not in plan['progress']:
                    raise ValueError('已播种项目被删除')
                if op.operation['kind'] != 'plant':
                    continue
                from datetime import datetime
                from .life_time import local_time
                occurred = datetime.fromisoformat(op.created_at) if isinstance(op.created_at, str) else op.created_at
                if not plan['activated_at'] or not plan['activated_at'] <= local_time(occurred).timestamp() < plan['cutoff']:
                    raise ValueError('播种不在已激活计划的活动时段内')
                if type(op.result['plan_revision']) is not int or not 1 <= op.result['plan_revision'] <= len(versions):
                    raise ValueError('播种计划版本无效')
                version = versions[op.result['plan_revision']-1]
                entry = next(e for e in version['entries'] if e['id'] == op.result['planting_entry_id'])
                if op.operation['crop'] != entry['sku'][5:]:
                    raise ValueError('实际播种与计划作物不符')
                if entry['fertilizer_mode'] == 'required' and not any(f.operation == {'kind': 'fertilize', 'fertilizer': entry['fertilizer'], 'targets': op.operation['targets']} and f.opportunity_id == op.opportunity_id for f in operations):
                    raise ValueError('指定施肥缺少同批操作依据')
            from decimal import Decimal
            if len({p['id'] for p in plan['purchases']}) != len(plan['purchases']) or sum((Decimal(p['amount']) for p in plan['purchases']), Decimal(0)) > Decimal(plan['procurement_limit']):
                raise ValueError('队列采购重复或超过上限')
            for purchase in plan['purchases']:
                trade = get(MarketTransaction, purchase['id'], actor_id=farm.pk, owner_id=farm.owner_id)
                if trade.result['total'] != purchase['amount']:
                    raise ValueError('采购金额缺少实际成交依据')
        for op in rows(FarmOperation):
            if op.farm_id == farm.pk and op.result.get('execution_mode') == 'queue' and op.operation['kind'] == 'harvest':
                origins = [h['crop']['planting_origin'] for h in op.result.get('harvested', []) if h['crop'].get('planting_origin')]
                if op.result.get('source_plans', []) != origins:
                    raise ValueError('跨日收获来源与实际周期不符')
        for plot in farm.state['plots']:
            origin = (plot.get('crop') or {}).get('planting_origin')
            if origin:
                crop = plot['crop']
                if not any(op.operation['kind'] == 'plant' and op.farm_id == farm.pk and op.result.get('planting_plan_id') == origin['plan_id'] and op.result.get('planting_entry_id') == origin['entry_id'] and op.result.get('plan_revision') == origin['revision'] and any(c['cycle_id'] == crop['cycle_id'] for c in op.result.get('cycles', [])) for op in rows(FarmOperation)):
                    raise ValueError('在田作物来源缺少真实播种事实')
                plan = farm.state['planting_plans'][origin['plan_id']]
                if origin['day'] != plan['day'] or origin['entry_id'] not in plan['progress']:
                    raise ValueError('在田作物来源不完整')
    except (KeyError, TypeError, ValueError, StopIteration, IndexError, LifeItem.DoesNotExist, MarketSession.DoesNotExist, MarketTransaction.DoesNotExist) as exc:
        raise SyncError(f'农场种植队列不完整：{exc}') from exc


def validate_queue_source(data: list) -> None:
    from types import SimpleNamespace
    facts = {}
    fk_names = {'farm': 'farm_id', 'actor': 'actor_id', 'owner': 'owner_id'}
    for row in data:
        fields = {fk_names.get(key, key): value for key, value in row['fields'].items()}
        facts.setdefault(row['model'], {})[str(row['pk'])] = SimpleNamespace(pk=str(row['pk']), **fields)
    for farm in facts.get('system_settings.agentfarm', {}).values():
        validate_queue(farm, facts)
