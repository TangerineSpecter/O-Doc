"""市场会话内修改未播种意图；采购额度和成交事实一起提交。"""
import copy
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from .farm_gate import guarded
from .farm_models import AgentFarm
from .farm_queue_plan import current, entries_for, event, save, snapshot, overview
from .farm_catalog import catalog_for
from .market_models import MarketTransaction


@guarded
@transaction.atomic
def update_queue(owner: str, actor: str, session, key: str, arguments: dict) -> dict:
    if not session or session.owner_id != owner or session.actor_id != actor:
        raise ValueError('修改队列需要当前居民的有效市场会话')
    farm = AgentFarm.objects.select_for_update().get(pk=actor, owner_id=owner)
    plan = current(farm)
    if not plan or plan['id'] != arguments.get('plan_id'):
        raise ValueError('当天种植计划不存在或身份不符')
    old_request = plan['requests'].get(key)
    if old_request:
        if old_request['arguments'] != arguments:
            raise ValueError('队列修改请求键已用于不同参数')
        return old_request['result']
    if timezone.now().timestamp() >= plan['cutoff'] or plan['status'] in ('expired', 'cancelled'):
        raise ValueError('当天种植计划已截止')
    if type(arguments.get('revision')) is not int or plan['revision'] != arguments['revision']:
        raise ValueError('种植计划版本已变化，请重新查看')
    reason = arguments.get('reason')
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 2000:
        raise ValueError('调整未播种队列须说明理由')
    entries = entries_for(arguments.get('entries'), catalog_for(owner).rules, plan['id'])
    originals = {e['id']: e for e in plan['entries']}
    # Entries with planted facts must remain, and retain their original crop/fertilizer policy.
    for eid, count in plan['progress'].items():
        if not count:
            continue
        updated = next((e for e in entries if e['id'] == eid), None)
        if not updated or updated['quantity'] < count or any(updated[k] != originals[eid][k] for k in ('sku', 'fertilizer_mode', 'fertilizer')):
            raise ValueError('不能删除或改写已播种事实；替代作物须使用新的项目ID')
    plan['entries'] = entries
    plan['progress'] = {e['id']: plan['progress'].get(e['id'], 0) for e in entries}
    plan['revision'] += 1
    plan['reason'] = reason
    if plan['activated_at']:
        plan['status'] = 'active'
    from .farm_queue_estimate import estimate
    catalog = catalog_for(owner)
    left = [{**e, 'quantity': e['quantity']-plan['progress'][e['id']]} for e in entries]
    plan['estimate'] = estimate(farm.state, left, catalog.rules, catalog.seed, max(timezone.now().timestamp(), plan['starts_at']), plan['cutoff'])
    version = snapshot(plan)
    version['market_source'] = {'session_id': session.pk, 'request_key': key}
    plan['versions'].append(version)
    event(plan, 'market-adjusted-' + str(plan['revision']), 'AI市场调整：' + reason, timezone.now())
    result = {'plan_id': plan['id'], 'revision': plan['revision'], 'queue_version': copy.deepcopy(version), 'reason': reason}
    plan['requests'][key] = {'arguments': arguments, 'result': result}
    save(farm)
    return result


@guarded
@transaction.atomic
def queue_trade(session, agent, key: str, operation: dict) -> dict:
    from .market_service import trade
    farm = AgentFarm.objects.select_for_update().filter(pk=agent.pk, owner_id=session.owner_id).first()
    plan = current(farm) if farm else None
    sku, cost = '', Decimal(0)
    if operation['kind'] == 'buy_shop':
        from .market_shop import current_batch
        batch = current_batch(session.owner_id)
        item = next((i for i in [*batch.slots, *batch.supplies] if i['id'] == operation.get('slot_id')), None)
        if item:
            sku, cost = item['sku'], Decimal(item['price']) * operation['quantity']
    elif operation['kind'] == 'buy_listing':
        from .market_models import MarketListing
        listing = MarketListing.objects.filter(pk=operation.get('listing_id'), owner_id=session.owner_id).first()
        if listing:
            sku, cost = listing.item.get('source', {}).get('sku', ''), listing.unit_price * operation['quantity']
    needed = set()
    if plan and plan['status'] in ('pending', 'active') and timezone.now().timestamp() < plan['cutoff']:
        for entry in plan['entries']:
            if plan['progress'][entry['id']] < entry['quantity']:
                needed.add(entry['sku'])
                if entry['fertilizer']:
                    needed.add('fertilizer.' + entry['fertilizer'])
    linked = plan and sku in needed and not MarketTransaction.objects.filter(pk=key).exists()
    if linked and sum((Decimal(p['amount']) for p in plan['purchases']), Decimal(0)) + cost > Decimal(plan['procurement_limit']):
        raise ValueError('购买超过当天种植计划采购上限，请减少数量或调整未播种意图')
    result = trade(session, agent, key, operation)
    if linked:
        farm.refresh_from_db(); plan = current(farm)
        plan['purchases'].append({'id': key, 'sku': sku, 'amount': result['total']})
        save(farm)
    return result


def replay_update(owner: str, actor: str, key: str, arguments: dict) -> dict | None:
    farm = AgentFarm.objects.filter(pk=actor, owner_id=owner).first()
    plan = farm.state.get('planting_plans', {}).get(arguments.get('plan_id')) if farm else None
    request = plan.get('requests', {}).get(key) if plan else None
    if request:
        if request['arguments'] != arguments:
            raise ValueError('队列修改请求键已用于不同参数')
        return copy.deepcopy(request['result'])
    return None
